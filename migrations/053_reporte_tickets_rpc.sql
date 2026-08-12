-- ============================================================
-- MIGRACIÓN 053 — Reporte de tickets: cálculo movido a la base (RPC)
-- Depende de: 016 (tickets, ticket_eventos, ticket_satisfaccion), 017
--             (estado_cambiado con detalle 'De "x" a "y"'), 003 (es_staff())
--
-- Contexto (auditoría 2026-08-11, Punto 1): el reporte de tickets vivía
-- enteramente en el frontend (frontend/src/api/domains/reportesTickets.js),
-- que leía tickets/ticket_eventos/ticket_satisfaccion crudos e
-- "interpretaba" ese historial para calcular todas las métricas. Riesgo
-- real: si el formato del `detalle` de un evento cambia (ej. el texto
-- 'De "x" a "y"' que fija evento_ticket_cambios(), migración 017/035) sin
-- actualizar esa lógica en paralelo, las métricas quedan mal calculadas
-- SIN ningún error visible — nadie nota un reporte silenciosamente
-- incorrecto.
--
-- Estas tres funciones replican EXACTAMENTE la lógica de
-- reportesTickets.js (misma fórmula, mismos criterios, mismo redondeo),
-- verificada por scripts/paridad-reporte-tickets.mjs antes de cambiar el
-- frontend para consumirlas. Dos reglas de negocio que NO cambian:
--   - Tasa de reapertura: denominador = tickets RESUELTOS del periodo
--     (no el total de tickets creados).
--   - Desempeño por técnico: se atribuye a quien marcó el ticket como
--     resuelto en su momento (`ticket_eventos.user_id` del evento
--     'estado_cambiado' hacia "resuelto"), nunca al `asignado_a` actual.
--
-- Decisión explícita nueva (no existía en el frontend, que dependía del
-- reloj/timezone del navegador del staff): "porDia" agrupa por día de
-- calendario en 'America/Lima' (Perú, UTC-5 fijo, sin horario de verano)
-- en vez de la hora del servidor (UTC). Es la misma zona que ya asume
-- Intl.DateTimeFormat('es-PE', ...) en frontend/src/core/formatters.js,
-- solo que ahora explícita porque el servidor no tiene "hora local del
-- navegador".
--
-- El destino de un cambio de estado se extrae con la MISMA expresión que
-- destinoDeCambio() en frontend/src/core/dominio-tickets.js
-- (/a "(\w+)"\s*$/) — si esa función cambia, esta consulta debe cambiar
-- junto con ella.
--
-- Qué NO se migra: listarTicketsDelPeriodo() (proyección directa de
-- columnas de `tickets`, sin interpretar ticket_eventos — no es el
-- cálculo de riesgo que motiva este punto) sigue en el frontend tal cual.
--
-- Nota operativa (mismo gotcha que 032/038/051): aplicar con `db import`,
-- NO con `db query`/`scripts/apply-migration.mjs` (no soportan
-- dollar-quoting). Verificar siempre después con una consulta de lectura.
-- ============================================================


-- ============================================================
-- FUNCIÓN: reporte_tickets(desde, hasta)
-- Reemplaza reportesTicketsApi.obtenerReporteTickets() — reporte completo
-- de un periodo (modal + PDF del módulo de tickets).
-- ============================================================

create or replace function public.reporte_tickets(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  with creados as (
    select
      t.id, t.estado, t.prioridad,
      coalesce(t.tipo, 'sin_clasificar') as tipo,
      t.created_at, t.vinculado, t.contacto_ingresado,
      e.nombres as emp_nombres, e.apellidos as emp_apellidos,
      coalesce(c.nombre, 'Sin categoría') as categoria_nombre
    from public.tickets t
    left join public.empleados e on e.id = t.empleado_id
    left join public.categorias_ticket c on c.id = t.categoria_id
    where t.created_at >= p_desde and t.created_at <= p_hasta
  ),
  solicitante as (
    select
      id, estado,
      case
        when not vinculado then 'Sin vincular'
        when emp_nombres is not null then trim(both from (emp_nombres || ' ' || emp_apellidos))
        else coalesce(nullif(contacto_ingresado, ''), 'Sin vincular')
      end as nombre
    from creados
  ),
  eventos as (
    select
      te.ticket_id, te.user_id, te.created_at,
      substring(te.detalle from 'a "(\w+)"\s*$') as destino
    from public.ticket_eventos te
    where te.evento = 'estado_cambiado'
      and te.created_at >= p_desde and te.created_at <= p_hasta
  ),
  resoluciones as (
    -- Última resolución del periodo por ticket (mismo criterio que
    -- resolucionesPorTicket(): iterar ascendente y quedarse con la
    -- última — acá, ORDER BY created_at DESC + DISTINCT ON).
    select distinct on (ticket_id) ticket_id, user_id, created_at as fecha
    from eventos
    where destino = 'resuelto'
    order by ticket_id, created_at desc
  ),
  reaperturas_cte as (
    select count(*) as n from eventos where destino = 'reabierto'
  ),
  resueltos_tickets as (
    select r.ticket_id, r.user_id, r.fecha, t.created_at as ticket_creado, t.prioridad
    from resoluciones r
    join public.tickets t on t.id = r.ticket_id
  ),
  tiempos as (
    -- Excluye duraciones negativas (reloj/evento inconsistente), igual
    -- que `!Number.isFinite(h) || h < 0` en calcularTiempos().
    select
      coalesce(prioridad, 'sin_definir') as clave_prioridad,
      coalesce(user_id::text, 'sin_asignar') as clave_tecnico,
      extract(epoch from (fecha - ticket_creado)) / 3600.0 as horas
    from resueltos_tickets
    where fecha >= ticket_creado
  ),
  tiempo_global as (
    select
      avg(horas) as promedio,
      percentile_cont(0.5) within group (order by horas) as mediana,
      count(*) as muestra
    from tiempos
  ),
  tiempo_por_prioridad as (
    select
      clave_prioridad as clave,
      avg(horas) as promedio,
      percentile_cont(0.5) within group (order by horas) as mediana,
      count(*) as muestra
    from tiempos
    group by clave_prioridad
  ),
  tiempo_por_tecnico as (
    select
      clave_tecnico as clave,
      avg(horas) as promedio,
      percentile_cont(0.5) within group (order by horas) as mediana,
      count(*) as muestra
    from tiempos
    group by clave_tecnico
  ),
  por_tecnico_cantidad as (
    -- Sobre TODAS las resoluciones del periodo (no solo las de duración
    -- válida): mismo alcance que contarPorTecnico(resoluciones).
    select coalesce(user_id::text, 'sin_asignar') as clave, count(*) as cantidad
    from resoluciones
    group by 1
  ),
  por_categoria as (
    select categoria_nombre as clave, count(*) as cantidad from creados group by 1
  ),
  por_prioridad as (
    select coalesce(prioridad, 'Sin definir') as clave, count(*) as cantidad from creados group by 1
  ),
  por_estado as (
    select coalesce(estado, 'Sin definir') as clave, count(*) as cantidad from creados group by 1
  ),
  por_tipo as (
    select tipo as clave, count(*) as cantidad from creados group by 1
  ),
  por_dia as (
    -- Día de calendario en América/Lima — ver nota de cabecera.
    select to_char(created_at at time zone 'America/Lima', 'YYYY-MM-DD') as fecha, count(*) as cantidad
    from creados
    group by 1
  ),
  encuesta_creados as (
    select ts.ticket_id, (ts.fecha_envio is not null) as respondida
    from public.ticket_satisfaccion ts
    where ts.ticket_id in (select id from creados)
  ),
  por_solicitante as (
    select
      s.nombre as solicitante,
      count(*) as total,
      count(*) filter (where s.estado in ('resuelto', 'cerrado')) as resueltos,
      count(*) filter (where s.estado = 'rechazado') as rechazados,
      count(*) filter (where s.estado not in ('resuelto', 'cerrado', 'rechazado')) as sin_resolver,
      count(*) filter (where ec.respondida is true) as encuestas_contestadas,
      count(*) filter (where ec.respondida is false) as encuestas_pendientes
    from solicitante s
    left join encuesta_creados ec on ec.ticket_id = s.id
    group by s.nombre
  ),
  backlog_dias as (
    select id, floor(extract(epoch from (now() - created_at)) / 86400) as dias
    from public.tickets
    where estado in ('abierto', 'en_progreso', 'reabierto')
  ),
  tramos_fijos(orden, clave, label, maximo) as (
    values
      (1, 'hasta_3', 'Hasta 3 días', 3),
      (2, 'de_4_a_7', '4 a 7 días', 7),
      (3, 'de_8_a_30', '8 a 30 días', 30),
      (4, 'mas_30', 'Más de 30 días', null::int)
  ),
  backlog_por_tramo as (
    select
      case
        when dias <= 3 then 'hasta_3'
        when dias <= 7 then 'de_4_a_7'
        when dias <= 30 then 'de_8_a_30'
        else 'mas_30'
      end as clave,
      count(*) as cantidad
    from backlog_dias
    group by 1
  ),
  backlog_final as (
    select tf.orden, tf.clave, tf.label, coalesce(bt.cantidad, 0) as cantidad
    from tramos_fijos tf
    left join backlog_por_tramo bt on bt.clave = tf.clave
  ),
  backlog_resumen as (
    select count(*) as total, max(dias) as dias_mas_antiguo from backlog_dias
  ),
  satisfaccion_periodo as (
    select nivel, comentario, fecha_envio
    from public.ticket_satisfaccion
    where created_at >= p_desde and created_at <= p_hasta
  ),
  satisfaccion_respondida as (
    select * from satisfaccion_periodo where fecha_envio is not null
  ),
  satisfaccion_resumen as (
    select
      (select count(*) from satisfaccion_periodo) as generadas,
      (select count(*) from satisfaccion_respondida) as respondidas,
      (select avg(nivel) from satisfaccion_respondida where nivel is not null) as promedio
  ),
  comentarios_top as (
    select nivel, comentario, fecha_envio
    from satisfaccion_respondida
    where comentario is not null and nivel is not null
    order by fecha_envio desc
    limit 20
  ),
  comentarios_total as (
    select count(*) as n from satisfaccion_respondida where comentario is not null and nivel is not null
  )
  select jsonb_build_object(
    'totalCreados', (select count(*) from creados),
    'totalResueltos', (select count(*) from resoluciones),
    'porCategoria', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'cantidad', cantidad) order by cantidad desc) from por_categoria), '[]'::jsonb),
    'porPrioridad', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'cantidad', cantidad) order by cantidad desc) from por_prioridad), '[]'::jsonb),
    'porEstado', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'cantidad', cantidad) order by cantidad desc) from por_estado), '[]'::jsonb),
    'porTipo', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'cantidad', cantidad) order by cantidad desc) from por_tipo), '[]'::jsonb),
    'porDia', coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'cantidad', cantidad) order by fecha asc) from por_dia), '[]'::jsonb),
    'porTecnico', coalesce((select jsonb_object_agg(clave, cantidad) from por_tecnico_cantidad), '{}'::jsonb),
    'porSolicitante', coalesce((select jsonb_agg(jsonb_build_object(
        'solicitante', solicitante, 'total', total, 'resueltos', resueltos,
        'rechazados', rechazados, 'sinResolver', sin_resolver,
        'encuestasContestadas', encuestas_contestadas, 'encuestasPendientes', encuestas_pendientes
      ) order by total desc) from por_solicitante), '[]'::jsonb),
    'tiempoResolucion', (select jsonb_build_object('promedio', promedio, 'mediana', mediana, 'muestra', muestra) from tiempo_global),
    'tiempoPorPrioridad', coalesce((select jsonb_object_agg(clave, jsonb_build_object('promedio', promedio, 'mediana', mediana, 'muestra', muestra)) from tiempo_por_prioridad), '{}'::jsonb),
    'tiempoPorTecnico', coalesce((select jsonb_object_agg(clave, jsonb_build_object('promedio', promedio, 'mediana', mediana, 'muestra', muestra)) from tiempo_por_tecnico), '{}'::jsonb),
    'reaperturas', (select n from reaperturas_cte),
    -- Denominador = resueltos del periodo, NUNCA el total de creados.
    'tasaReapertura', case when (select count(*) from resoluciones) > 0
        then round(((select n from reaperturas_cte)::numeric / (select count(*) from resoluciones)) * 100)::int
        else null end,
    'backlog', jsonb_build_object(
        'total', (select total from backlog_resumen),
        'tramos', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'label', label, 'cantidad', cantidad) order by orden) from backlog_final), '[]'::jsonb),
        'diasMasAntiguo', (select dias_mas_antiguo from backlog_resumen)
    ),
    'encuestasGeneradas', (select generadas from satisfaccion_resumen),
    'encuestasRespondidas', (select respondidas from satisfaccion_resumen),
    'promedioSatisfaccion', (select promedio from satisfaccion_resumen),
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object('nivel', nivel, 'comentario', comentario, 'fecha', fecha_envio) order by fecha_envio desc) from comentarios_top), '[]'::jsonb),
    'comentariosTotal', (select n from comentarios_total)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.reporte_tickets(timestamptz, timestamptz) is
  'Reporte completo de tickets de un periodo (volumen, tiempos, backlog, técnico, satisfacción). Reemplaza el cálculo que antes hacía reportesTicketsApi.obtenerReporteTickets() interpretando ticket_eventos en el frontend. Ver migración 053 para las reglas de negocio que preserva.';

alter function public.reporte_tickets(timestamptz, timestamptz) owner to project_admin;


-- ============================================================
-- FUNCIÓN: reporte_tickets_resumen(desde, hasta)
-- Reemplaza reportesTicketsApi.obtenerResumenTickets() — resumen liviano
-- usado solo para la comparativa contra el periodo anterior.
-- ============================================================

create or replace function public.reporte_tickets_resumen(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  with creados as (
    select id from public.tickets
    where created_at >= p_desde and created_at <= p_hasta
  ),
  eventos as (
    select ticket_id, substring(detalle from 'a "(\w+)"\s*$') as destino
    from public.ticket_eventos
    where evento = 'estado_cambiado'
      and created_at >= p_desde and created_at <= p_hasta
  ),
  resueltos as (
    select distinct ticket_id from eventos where destino = 'resuelto'
  ),
  satisfaccion as (
    select nivel, fecha_envio from public.ticket_satisfaccion
    where created_at >= p_desde and created_at <= p_hasta
  ),
  satisfaccion_respondida as (
    select * from satisfaccion where fecha_envio is not null
  )
  select jsonb_build_object(
    'totalCreados', (select count(*) from creados),
    'totalResueltos', (select count(*) from resueltos),
    'promedioSatisfaccion', (select avg(nivel) from satisfaccion_respondida where nivel is not null),
    'tasaRespuesta', case when (select count(*) from satisfaccion) > 0
        then round(((select count(*) from satisfaccion_respondida)::numeric / (select count(*) from satisfaccion)) * 100)::int
        else null end
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.reporte_tickets_resumen(timestamptz, timestamptz) is
  'Resumen liviano de un periodo (4 números), usado solo para la comparativa "vs. periodo anterior" del modal de reporte. Mismos criterios que reporte_tickets(), sin las distribuciones.';

alter function public.reporte_tickets_resumen(timestamptz, timestamptz) owner to project_admin;


-- ============================================================
-- FUNCIÓN: reporte_satisfaccion_consolidado()
-- Reemplaza reportesTicketsApi.obtenerSatisfaccionConsolidado() — TODO
-- el histórico (sin recorte de fecha, a propósito), para
-- ReporteSatisfaccionView.vue.
-- ============================================================

create or replace function public.reporte_satisfaccion_consolidado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  with encuestas as (
    select id, ticket_id, nivel, comentario, fecha_envio, created_at
    from public.ticket_satisfaccion
  ),
  eventos as (
    select ticket_id, user_id, created_at,
      substring(detalle from 'a "(\w+)"\s*$') as destino
    from public.ticket_eventos
    where evento = 'estado_cambiado'
      and ticket_id in (select ticket_id from encuestas)
  ),
  resoluciones as (
    select distinct on (ticket_id) ticket_id, user_id
    from eventos
    where destino = 'resuelto'
    order by ticket_id, created_at desc
  ),
  respuestas as (
    select
      e.id, e.ticket_id,
      t.codigo as ticket_codigo, t.titulo as ticket_titulo,
      t.empleado_id,
      case when emp.id is not null then trim(both from (emp.nombres || ' ' || emp.apellidos)) else 'Sin datos' end as solicitante,
      r.user_id as tecnico_id,
      e.nivel, e.comentario, e.fecha_envio, e.created_at,
      (e.fecha_envio is not null) as respondida
    from encuestas e
    left join public.tickets t on t.id = e.ticket_id
    left join public.empleados emp on emp.id = t.empleado_id
    left join resoluciones r on r.ticket_id = e.ticket_id
  ),
  por_solicitante_agg as (
    select
      empleado_id,
      max(solicitante) as nombre,
      count(*) as generadas,
      count(*) filter (where respondida) as respondidas,
      avg(nivel) filter (where nivel is not null) as promedio,
      count(*) filter (where nivel is not null) as muestra
    from respuestas
    group by empleado_id
  ),
  por_tecnico_agg as (
    select
      tecnico_id,
      count(*) as generadas,
      count(*) filter (where respondida) as respondidas,
      avg(nivel) filter (where nivel is not null) as promedio,
      count(*) filter (where nivel is not null) as muestra
    from respuestas
    group by tecnico_id
  )
  select jsonb_build_object(
    'respuestas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'ticket_id', ticket_id, 'ticket_codigo', ticket_codigo, 'ticket_titulo', ticket_titulo,
        'empleado_id', empleado_id, 'solicitante', solicitante, 'tecnico_id', tecnico_id,
        'nivel', nivel, 'comentario', comentario, 'fecha_envio', fecha_envio, 'created_at', created_at,
        'respondida', respondida
      ) order by created_at desc) from respuestas), '[]'::jsonb),
    -- "Peor primero": promedio ascendente (1 = peor en escala 1-5), los
    -- sin promedio (nadie respondió con nivel) al final, ordenados entre
    -- sí por más encuestas generadas primero — mismo criterio que
    -- ordenarPeorPrimero() en reportesTickets.js.
    'porSolicitante', coalesce((select jsonb_agg(jsonb_build_object(
        'empleado_id', empleado_id, 'nombre', nombre, 'encuestasGeneradas', generadas,
        'encuestasRespondidas', respondidas, 'promedio', promedio, 'muestra', muestra
      ) order by (promedio is null) asc, promedio asc, generadas desc) from por_solicitante_agg), '[]'::jsonb),
    'porTecnico', coalesce((select jsonb_agg(jsonb_build_object(
        'tecnico_id', tecnico_id, 'encuestasGeneradas', generadas,
        'encuestasRespondidas', respondidas, 'promedio', promedio, 'muestra', muestra
      ) order by (promedio is null) asc, promedio asc, generadas desc) from por_tecnico_agg), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.reporte_satisfaccion_consolidado() is
  'Histórico completo de ticket_satisfaccion (sin recorte de fecha), con resumen por solicitante y por técnico. Reemplaza reportesTicketsApi.obtenerSatisfaccionConsolidado(). El técnico es quien marcó el ticket resuelto por última vez en TODA su historia, no el asignado_a actual.';

alter function public.reporte_satisfaccion_consolidado() owner to project_admin;

-- ============================================================
-- FIN DE MIGRACIÓN 053
-- ============================================================
