-- ============================================================
-- MIGRACIÓN 086 — Revisión integral v2: endurecimiento de RPC, realtime y
-- formato de secretos
-- Depende de: 003 (es_jefe/es_staff), 016 (siguiente_codigo_ticket),
--   024 (accesos_sensibles), 038 (dar_baja_empleado), 045/048/052 (canales
--   realtime de notificaciones), 051 (cerrar_ticket), 053 (reporte_tickets,
--   reporte_tickets_resumen, reporte_satisfaccion_consolidado), 062
--   (REVOKE/GRANT de las RPC), 068/072 (tiene_permiso_modulo en RLS),
--   077 (revocar_cuenta_personal)
--
-- Ciclo 20 de docs/HISTORIAL-AUDITORIAS.md ("Revisión integral v2",
-- 2026-09-24). Cinco cambios independientes entre sí, uno por sección:
--
--   1. Gate de módulo en RPC SECURITY DEFINER que solo exigían es_staff()
--      pero leen/escriben tablas que la RLS ya restringe por módulo desde
--      068/072/081-083. Una función SECURITY DEFINER corre como su dueño y
--      bypasea esa RLS: sin repetir el chequeo acá, un ASISTENTE sin el
--      módulo seguía pudiendo hacer por RPC lo que la RLS ya le negaba por
--      SDK directo (mismo patrón que tienePermisoModulo() en las edge
--      functions, ver invariante 5 de AGENTS.md):
--        - dar_baja_empleado  → 'empleados'
--        - cerrar_ticket      → 'tickets'
--        - reporte_tickets, reporte_tickets_resumen,
--          reporte_satisfaccion_consolidado → 'tickets'
--   2. Canales realtime de staff (incluido notificaciones:nuevas) abiertos a
--      cualquier `authenticated`: ahora exigen staff ACTIVO.
--   3. siguiente_codigo_ticket() conservaba EXECUTE para PUBLIC (016; la 062
--      no la incluyó porque no es SECURITY DEFINER).
--   4. revocar_cuenta_personal() cerraba la asignación con current_date
--      (UTC del servidor): después de las 19:00 hora Perú quedaba con fecha
--      de MAÑANA. Pasa a (now() at time zone 'America/Lima')::date, mismo
--      criterio que dar_baja_empleado (038).
--   5. CHECK de formato cifrado en cuentas.password, licencias.clave y
--      accesos_sensibles.password, como NOT VALID (ver advertencia en la
--      sección 5 ANTES de aplicar).
--
-- Criterio de las secciones 1 y 4: el cuerpo de cada función es copia
-- EXACTA de su definición más reciente (038, 051, 053 y 077 — verificado
-- que ninguna migración posterior las redefine), cambiando SOLO la línea del
-- guard o de la fecha. El rechazo conserva el mismo `raise exception 'No
-- autorizado'` (SQLSTATE P0001 sin ERRCODE explícito) que ya tenían: los
-- discriminantes de frontend/tests/integration/_autorizacion-helpers.js
-- dependen de ese mensaje exacto. `create or replace function` conserva el
-- dueño y los GRANT/REVOKE de la 062/077, así que no se tocan.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): este archivo tiene cuerpos con
-- dollar-quoting ($$ ... $$) → `db import`, NUNCA `db query` a mano. Es
-- largo y mezcla funciones + policies + constraints: si `db import` crashea
-- (`Assertion failed ... src\win\async.c`), partirlo en archivos temporales
-- por sección (1, 2, 3, 4, 5) y aplicarlos uno por uno — el archivo único en
-- migrations/ sigue siendo la fuente de verdad. Correr SIEMPRE el bloque de
-- "Verificación" del final después de aplicar: `db import` puede reportar
-- error habiendo ejecutado parte de los statements.
-- Todo es idempotente (create or replace / drop ... if exists / revoke-
-- grant): reaplicar el archivo completo tras un fallo parcial es seguro.
-- ============================================================


-- ============================================================
-- 1) Gate de módulo en RPC SECURITY DEFINER
-- ============================================================

-- ------------------------------------------------------------
-- 1.a) dar_baja_empleado → módulo 'empleados'
-- Tablas que toca (leído del cuerpo, no supuesto): empleados (UPDATE
-- estado), asignaciones_cuenta y cuentas (módulo 'correos' en RLS, 068),
-- asignaciones_licencia (módulo 'licencias' en RLS, 068). Se exige SOLO
-- 'empleados' a propósito: la baja es una operación del módulo Empleados
-- (la llama empleados.js desde /empleados, ruta con meta.modulo
-- 'empleados'), y su razón de ser (A-01) es que sea atómica — exigir además
-- 'correos' y 'licencias' dejaría a un ASISTENTE de Empleados sin poder dar
-- de baja a nadie, o partiría la baja en pedazos otra vez. Cerrar los
-- accesos de quien se va es parte de darlo de baja, no una operación de
-- Correos/Licencias. es_staff() se mantiene dentro del OR: tiene_permiso_
-- modulo() no mira staff.activo, así que sin él un staff desactivado que
-- conserve filas en staff_modulos_permisos pasaría.
-- ------------------------------------------------------------

create or replace function public.dar_baja_empleado(p_empleado_id uuid)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date;
  v_empleado public.empleados;
  v_cuentas_personales uuid[];
begin
  if not (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('empleados'))) then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado';
  end if;

  v_hoy := (now() at time zone 'America/Lima')::date;

  -- Cuentas personales activas de este empleado (antes de cerrar la
  -- asignación): son las que se dan de baja junto con él. Reutilizables/
  -- compartidas NO se tocan acá — quedan libres y "por rotar" vía el
  -- trigger marcar_rotacion_pendiente() al cerrarse su asignación.
  select array_agg(c.id) into v_cuentas_personales
    from public.asignaciones_cuenta a
    join public.cuentas c on c.id = a.cuenta_id
   where a.empleado_id = p_empleado_id
     and a.fecha_fin is null
     and c.tipo_cuenta = 'personal';

  update public.asignaciones_cuenta
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;

  update public.asignaciones_licencia
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;

  if v_cuentas_personales is not null then
    update public.cuentas
       set deleted_at = now()
     where id = any(v_cuentas_personales);
  end if;

  update public.empleados
     set estado = 'Inactivo'
   where id = p_empleado_id
   returning * into v_empleado;

  return v_empleado;
end;
$$;


-- ------------------------------------------------------------
-- 1.b) cerrar_ticket → módulo 'tickets'
-- Hace dos UPDATE sobre `tickets`, cuya policy de UPDATE ya exige
-- es_jefe() or (es_staff() and tiene_permiso_modulo('tickets')) desde la
-- 072. La llama tickets.js desde rutas con meta.modulo 'tickets'.
-- ------------------------------------------------------------

create or replace function public.cerrar_ticket(p_ticket_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_estado_actual text;
begin
  if not (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets'))) then
    raise exception 'No autorizado';
  end if;

  select estado into v_estado_actual from public.tickets where id = p_ticket_id;
  if v_estado_actual is null then
    raise exception 'Ticket no encontrado';
  end if;
  if v_estado_actual not in ('en_progreso', 'reabierto') then
    raise exception 'Solo se puede marcar como resuelto un ticket en progreso o reabierto (estado actual: %).', v_estado_actual;
  end if;

  update public.tickets set estado = 'resuelto' where id = p_ticket_id;
  update public.tickets set estado = 'cerrado' where id = p_ticket_id
    returning * into v_ticket;

  return v_ticket;
end;
$$;


-- ------------------------------------------------------------
-- 1.c) reporte_tickets / reporte_tickets_resumen /
--      reporte_satisfaccion_consolidado → módulo 'tickets'
-- Leen tickets, ticket_eventos, ticket_satisfaccion (072/082: SELECT
-- gateado por 'tickets') y empleados/categorias_ticket. Hoy el frontend
-- consume reporte_satisfaccion_consolidado desde /tickets/satisfaccion
-- (meta.modulo 'tickets'); las otras dos siguen sin consumidor
-- (REPORTE-TICKETS-RPC-MUERTOS, Ciclo 13) pero quedan con el mismo gate
-- para que adoptarlas no reabra el hueco.
-- ------------------------------------------------------------

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
  if not (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets'))) then
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
  if not (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets'))) then
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
  if not (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets'))) then
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


-- ============================================================
-- 2) Canales realtime de staff → solo staff ACTIVO
-- ============================================================
-- staff_subscribe_list_channels (última versión: 052) dejaba suscribirse a
-- cualquier rol `authenticated`, sin mirar staff.activo. Con
-- disable_signup=true todo `authenticated` es una cuenta de staff, pero no
-- necesariamente ACTIVA: un staff desactivado por el JEFE (o una alta nueva,
-- que nace activo=false desde la 076) con su JWT todavía vigente seguía
-- recibiendo en vivo `notificaciones:nuevas` — que publica título, código y
-- datos del ticket/cuenta/empleado (crear_notificacion, 045/048/054) — y los
-- avisos de cambio de las listas. Misma lista de patrones que la 052, solo
-- se agrega public.es_staff() (ya tiene GRANT a authenticated, 062).
--
-- staff_subscribe_personal_channel (048) tiene el mismo hueco para los
-- avisos personales (`notificaciones:usuario:<uid>`): un staff desactivado
-- seguía recibiendo los suyos. Mismo arreglo, misma condición de uid.
--
-- public_subscribe_ticket_channel (028) NO se toca: es el seguimiento
-- público de un ticket por token, abierto a anon a propósito.

drop policy if exists staff_subscribe_list_channels on realtime.channels;
create policy staff_subscribe_list_channels
on realtime.channels for select
to authenticated
using (
  public.es_staff()
  and pattern in ('tickets:list', 'empleados:list', 'cuentas:list', 'licencias:list', 'equipos:list', 'notificaciones:nuevas')
);

drop policy if exists staff_subscribe_personal_channel on realtime.channels;
create policy staff_subscribe_personal_channel
on realtime.channels for select
to authenticated
using (
  public.es_staff()
  and pattern = 'notificaciones:usuario:%'
  and split_part(realtime.channel_name(), ':', 3) = auth.uid()::text
);


-- ============================================================
-- 3) siguiente_codigo_ticket(): sin EXECUTE para PUBLIC
-- ============================================================
-- Creada en la 016 sin REVOKE: conserva el EXECUTE default de Postgres para
-- PUBLIC (incluye anon). La 062 revocó PUBLIC solo en las funciones
-- SECURITY DEFINER y esta no lo es, así que quedó afuera. Efecto real: un
-- anónimo con la anon key podía llamar /rpc/siguiente_codigo_ticket y
-- quemar números de la secuencia a voluntad (huecos en TCK-XXXX, que por
-- diseño nunca se revierten — ver AGENTS.md), y no hay ningún rate-limit
-- porque no pasa por la edge function.
--
-- Quién la usa de verdad (verificado con grep en todo el repo, 2026-09-24):
-- ÚNICAMENTE functions/tickets.ts (acción `crear`), con el cliente ADMIN
-- (createAdminClient + API_KEY). Ningún código del frontend ni ninguna otra
-- función SQL la invoca. El cliente admin conecta con el rol del proyecto
-- (project_admin, el mismo que lee schema_migrations/function_deploys pese
-- a su `revoke all ... from public, anon, authenticated` de la 069/070), que
-- es además el dueño de la función y de ticket_codigo_seq. El GRANT explícito
-- a project_admin es redundante si es el dueño, y es la red de seguridad si
-- no lo es: sin él, crear un ticket fallaría con error_codigo.
-- ⚠️ Verificar después de aplicar creando un ticket de prueba EN UN BRANCH
-- (ver Verificación, punto 3), no en producción.

revoke execute on function public.siguiente_codigo_ticket() from public, anon, authenticated;
grant execute on function public.siguiente_codigo_ticket() to project_admin;


-- ============================================================
-- 4) revocar_cuenta_personal(): fecha de cierre en hora de Lima
-- ============================================================
-- Copia exacta de la 077 salvo `set fecha_fin = ...`. No es SECURITY
-- DEFINER (corre con la RLS del que llama: módulo 'correos' en
-- asignaciones_cuenta/cuentas desde la 068), así que no necesita gate de
-- módulo propio — la RLS ya lo es. Los GRANT de la 077 se conservan.

create or replace function public.revocar_cuenta_personal(p_asignacion_id uuid)
returns void
language plpgsql
as $$
declare
  v_cuenta_id uuid;
  v_tipo_cuenta text;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  select cuenta_id into v_cuenta_id
  from public.asignaciones_cuenta
  where id = p_asignacion_id;

  if v_cuenta_id is null then
    raise exception 'Asignación no encontrada';
  end if;

  select tipo_cuenta into v_tipo_cuenta
  from public.cuentas
  where id = v_cuenta_id;

  if v_tipo_cuenta is distinct from 'personal' then
    raise exception 'revocar_cuenta_personal solo aplica a cuentas tipo "personal" (usar cerrarAsignacion para compartida/reutilizable)';
  end if;

  update public.asignaciones_cuenta
  set fecha_fin = (now() at time zone 'America/Lima')::date
  where id = p_asignacion_id;

  update public.cuentas
  set deleted_at = now()
  where id = v_cuenta_id;
end;
$$;


-- ============================================================
-- 5) CHECK de formato cifrado en las columnas de secretos (NOT VALID)
-- ============================================================
-- Hoy nada impide, a nivel de BD, que un secreto quede guardado en texto
-- plano: la RLS deja a staff con el módulo escribir `cuentas.password` /
-- `licencias.clave` directo por SDK, y el único camino "correcto" (cifrar
-- con la edge function credenciales antes de guardar) es una convención del
-- frontend (api/passwords.js). Un cliente que se lo salte — DevTools, un bug
-- de un formulario nuevo, un script de importación — deja la contraseña en
-- claro, visible para cualquiera que lea la fila, y credenciales.ts la
-- devolvería "tal cual" (decryptAny trata lo que no tiene prefijo como texto
-- plano histórico). Invariante 2 de AGENTS.md: nunca cifrado en el cliente,
-- y — con esto — nunca un secreto sin cifrar en la tabla.
--
-- Formatos reales, verificados en functions/credenciales.ts (no supuestos):
--   cuentas.password, licencias.clave:
--     enc2:<iv b64>:<ct b64>  → encryptV2(), CRED_KEY_V2 (único que se escribe hoy)
--     enc:<iv b64>:<ct b64>   → formato legacy (CRED_KEY_LEGACY) que
--                               decryptAny() todavía LEE; se admite para no
--                               bloquear filas históricas (ver abajo)
--   accesos_sensibles.password:
--     sens1:<iv b64>:<ct b64> → encryptSensible(), CRED_KEY_SENSIBLE. Es el
--                               ÚNICO que decryptSensible() acepta (otro
--                               prefijo devuelve "(formato desconocido)").
--                               El comentario de columna de la 024 decía
--                               "enc2:" — estaba mal, se corrige abajo.
--   NULL = sin secreto (el frontend manda null, nunca '', cuando no hay).
--
-- ¿Por qué NOT VALID? Para que agregar el constraint no falle si hay filas
-- históricas que no cumplen. PERO ⚠️ un NOT VALID no es inocuo: Postgres
-- evalúa el CHECK en CADA UPDATE de una fila, toque o no la columna — una
-- fila existente con texto plano quedaría imposible de editar (ni siquiera
-- sus `notas`) hasta que se le cargue una contraseña nueva. Por eso, ANTES
-- de aplicar, correr este conteo (solo cuenta, nunca selecciona el valor):
--
--   select 'cuentas' as tabla, count(*) from public.cuentas
--     where password is not null and password !~ '^enc2?:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'
--   union all
--   select 'licencias', count(*) from public.licencias
--     where clave is not null and clave !~ '^enc2?:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'
--   union all
--   select 'accesos_sensibles', count(*) from public.accesos_sensibles
--     where password is not null and password !~ '^sens1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$';
--
-- Si los tres dan 0: aplicar y, en el mismo paso, correr los VALIDATE
-- CONSTRAINT de la Verificación (punto 5). Si alguno da > 0: esas filas son
-- texto plano histórico — re-cifrarlas primero (cargar la contraseña de
-- nuevo desde la UI, que pasa por la edge function) o aceptar a conciencia
-- que quedan bloqueadas para edición hasta entonces. Recién con 0 filas
-- fuera de formato se corre VALIDATE CONSTRAINT.
--
-- Siguiente paso posible, no hecho acá: cuando no quede ninguna fila
-- 'enc:', angostar el CHECK de cuentas/licencias a solo 'enc2:'.

alter table public.cuentas drop constraint if exists cuentas_password_formato_cifrado;
alter table public.cuentas add constraint cuentas_password_formato_cifrado
  check (password is null or password ~ '^enc2?:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$') not valid;

alter table public.licencias drop constraint if exists licencias_clave_formato_cifrado;
alter table public.licencias add constraint licencias_clave_formato_cifrado
  check (clave is null or clave ~ '^enc2?:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$') not valid;

alter table public.accesos_sensibles drop constraint if exists accesos_sensibles_password_formato_cifrado;
alter table public.accesos_sensibles add constraint accesos_sensibles_password_formato_cifrado
  check (password is null or password ~ '^sens1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$') not valid;

comment on constraint cuentas_password_formato_cifrado on public.cuentas is
  'Solo NULL o el formato cifrado de functions/credenciales.ts (enc2:, o enc: legacy). NOT VALID al crearse (migración 086): correr VALIDATE CONSTRAINT cuando no queden filas en texto plano.';
comment on constraint licencias_clave_formato_cifrado on public.licencias is
  'Solo NULL o el formato cifrado de functions/credenciales.ts (enc2:, o enc: legacy). NOT VALID al crearse (migración 086): correr VALIDATE CONSTRAINT cuando no queden filas en texto plano.';
comment on constraint accesos_sensibles_password_formato_cifrado on public.accesos_sensibles is
  'Solo NULL o sens1: (encryptSensible, CRED_KEY_SENSIBLE). NOT VALID al crearse (migración 086): correr VALIDATE CONSTRAINT cuando no queden filas fuera de formato.';

comment on column public.accesos_sensibles.password is
  'Cifrada por la edge function credenciales (encryptSensible), formato sens1:<iv>:<ct> con CRED_KEY_SENSIBLE, aislada de la de Cuentas/Licencias. (La 024 decía enc2: por error; corregido en la 086.)';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Gate de módulo y fecha de Lima en las 6 funciones (esperado: las 5
--    primeras con con_gate=true; revocar_cuenta_personal con lima=true):
--    select proname, position('tiene_permiso_modulo' in prosrc) > 0 as con_gate, position('America/Lima' in prosrc) > 0 as lima from pg_proc where pronamespace = 'public'::regnamespace and proname in ('dar_baja_empleado','cerrar_ticket','reporte_tickets','reporte_tickets_resumen','reporte_satisfaccion_consolidado','revocar_cuenta_personal') order by proname;
--
-- 2) GRANT/REVOKE intactos en las RPC reescritas (esperado: authenticated=true, anon=false en las 6):
--    select p, has_function_privilege('authenticated', p, 'execute') as authenticated, has_function_privilege('anon', p, 'execute') as anon from unnest(array['public.dar_baja_empleado(uuid)','public.cerrar_ticket(uuid)','public.reporte_tickets(timestamptz,timestamptz)','public.reporte_tickets_resumen(timestamptz,timestamptz)','public.reporte_satisfaccion_consolidado()','public.revocar_cuenta_personal(uuid)']) as p;
--
-- 3) siguiente_codigo_ticket (esperado: anon=false, authenticated=false, project_admin=true):
--    select has_function_privilege('anon', 'public.siguiente_codigo_ticket()', 'execute') as anon, has_function_privilege('authenticated', 'public.siguiente_codigo_ticket()', 'execute') as authenticated, has_function_privilege('project_admin', 'public.siguiente_codigo_ticket()', 'execute') as project_admin, (select proowner::regrole from pg_proc where oid = 'public.siguiente_codigo_ticket()'::regprocedure) as dueno;
--    Y funcional, EN UN BRANCH (npx @insforge/cli branch create), nunca en
--    producción: crear un ticket público por la edge function `tickets`
--    (acción crear) y confirmar que devuelve `codigo` y no `error_codigo`.
--
-- 4) Policies realtime (esperado: las dos con es_staff() en qual):
--    select policyname, roles, qual from pg_policies where schemaname = 'realtime' and tablename = 'channels' order by policyname;
--
-- 5) Constraints (esperado: 3 filas, convalidated=false):
--    select conrelid::regclass as tabla, conname, convalidated from pg_constraint where conname in ('cuentas_password_formato_cifrado','licencias_clave_formato_cifrado','accesos_sensibles_password_formato_cifrado');
--    Con el conteo previo de la sección 5 en 0, validar (una por línea):
--    alter table public.cuentas validate constraint cuentas_password_formato_cifrado;
--    alter table public.licencias validate constraint licencias_clave_formato_cifrado;
--    alter table public.accesos_sensibles validate constraint accesos_sensibles_password_formato_cifrado;
--    y repetir la consulta de arriba: convalidated=true en las 3.
--
-- 6) Tracking: scripts/apply-migration.mjs registra la fila solo; si se
--    aplicó a mano con `db import`, registrarla y verificar:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '086';
--
-- 7) Autorización end-to-end (cuando existan las cuentas de P0-04): un
--    ASISTENTE activo SIN el módulo 'tickets' llamando
--    .rpc('cerrar_ticket', ...) debe recibir P0001 'No autorizado'
--    (mismo discriminante que esRechazoDeAutorizacionSql()).
-- ============================================================
-- FIN DE MIGRACIÓN 086
-- ============================================================
