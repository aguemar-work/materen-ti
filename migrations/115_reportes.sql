-- ============================================================
-- MIGRACIÓN 115 — Reportes de tickets: una métrica = una definición = una
-- consulta en Postgres (vista base por ticket, vistas KPI y RPC por período)
-- Depende de: 016/017/035 (tickets, ticket_eventos con detalle 'De "x" a "y"',
--   ticket_comentarios, ticket_satisfaccion, categorias/subcategorias),
--   020/014 (empleados.area_obra_id / ubicacion_id), 053+086 (RPC de reportes
--   que esta migración reemplaza), 089 (tickets.resuelto_at con backfill),
--   099 (puede / puede_actual / exigir_permiso), 103 (config_parametros,
--   parametro_entero).
--
-- Hallazgo (docs/auditorias/ciclo-21/analisis-reportes.md, 2026-10-03):
-- el sistema tenía cuatro "reportes" sin definiciones comunes. El modal de
-- Tickets calculaba todo en el navegador (4 consultas sin límite, período en
-- hora del navegador), contaba un mismo ticket como "resuelto" en dos períodos
-- (por eventos), mezclaba tres definiciones de "resuelto", publicaba una tasa
-- de reapertura que podía superar el 100 % (y contaba reaperturas de
-- rechazados), promedios de satisfacción sobre n = 1 y una comparativa contra
-- períodos en curso; las RPC de la 053 (reporte_tickets,
-- reporte_tickets_resumen) no tenían consumidor. Esta migración deja UNA capa
-- de datos para todo eso; el frontend (módulo Reportes) solo da formato.
--
-- Decisiones del dueño (2026-10-03), fijadas acá como definiciones:
--   · "Resuelto en el período": `resuelto_at` (089) cae en el período y el
--     estado ACTUAL es resuelto/cerrado. Un ticket cuenta en UN solo período,
--     el de su resolución vigente (se acabó la doble cuenta por eventos).
--   · Rechazado: aparte; nunca entra en tiempos ni en resueltos. "Duplicado" no
--     existe hasta V2 (se trata como rechazado con motivo).
--   · Tiempos en HORAS CORRIDAS (no hay horario laboral hasta la 105), rotulados
--     así; mediana primero, promedio después, siempre con n. "A tiempo" no se
--     calcula.
--   · CSAT: avg(nivel) de encuestas respondidas de tickets resueltos en el
--     período; se publica solo con n >= csat_muestra_minima (parámetro, 5);
--     con menos, el promedio viaja NULL y `insuficiente` = true. "Insatisfecho"
--     = nivel <= 2 (deja de incluir el 3, decisión 2026-10-03).
--   · Técnico = quien marcó resuelto (último evento → "resuelto"); la carga se
--     informa como "asignados hoy" (asignado_a actual), rotulada: el evento
--     `reasignado` no guarda a quién, así que "asignado al cierre" de un
--     período pasado no es reconstruible.
--   · Reaperturas: evento `reabierto` cuyo origen NO era `rechazado`
--     (050 permite rechazado → reabierto y eso no es una resolución fallida).
--     Tasa = de los tickets cuya PRIMERA resolución cae en el período, cuántos
--     se reabrieron dentro de `dias_corte_reapertura` (parámetro, 30) días de
--     una resolución. Numerador y denominador son el mismo conjunto: no puede
--     superar el 100 %.
--   · Área/obra y ubicación se leen del empleado ACTUAL (no se congelan en el
--     ticket): si la persona cambia de obra, su historial se mueve con ella.
--   · Backlog "al cierre del período": reconstruido por eventos (estado de cada
--     ticket al instante de cierre); para el período en curso es el de ahora.
--   · Período comparable: solo períodos completos; el período en curso nunca
--     lleva comparación. El reporte por técnico solo lo recibe `rol:jefe`.
--   · Un asistente puede pedir el reporte con alcance = él mismo; pedir el de
--     otro técnico exige `rol:jefe` (42501).
--
-- ── TABLA DE FIRMAS (contrato con el frontend) ─────────────────────────────
--
--   PARÁMETROS (config_parametros, on conflict do nothing):
--     csat_muestra_minima      5    respuestas con nivel para publicar un promedio
--     dias_corte_reapertura    30   días tras una resolución en que una reapertura
--                                   cuenta contra esa resolución
--
--   VISTA public.v_ticket_hechos  (security_invoker = true): UNA fila por ticket
--     y la ÚNICA lectura de ticket_eventos con la expresión regular del detalle
--     ('De "x" a "y"', misma que destinoDeCambio() del frontend).
--     ticket_id, codigo, titulo, estado, prioridad, tipo, nivel_atencion,
--     categoria_id, categoria_nombre, subcategoria_id, subcategoria_nombre,
--     empleado_id, vinculado, solicitante (nombre del empleado o 'Sin vincular';
--     nunca contacto_ingresado), area_obra_id, area_obra_nombre, ubicacion_id,
--     ubicacion_nombre (del empleado HOY), asignado_a,
--     created_at, dia_creado (date, Lima), resuelto_at, dia_resuelto,
--     resuelto_vigente (estado resuelto/cerrado y resuelto_at no nulo),
--     rechazado, cerrado, tecnico_resolvio_id (user_id del último evento →
--     resuelto), horas_resolucion (resuelto_at − created_at en horas corridas;
--     NULL si no hay resolución vigente o la diferencia es negativa),
--     primera_respuesta_at (primer ticket_comentarios no interno de un staff),
--     horas_primera_respuesta, n_reasignaciones, n_resoluciones,
--     primera_resolucion_at, dia_primera_resolucion, ultima_resolucion_at,
--     n_reaperturas (origen ≠ rechazado), reaperturas_at timestamptz[],
--     reabierto_en_corte (alguna reapertura dentro del corte tras una
--     resolución), transiciones jsonb [{t, a}] (para reconstruir el estado a un
--     instante), encuesta_id, encuesta_generada, encuesta_generada_at,
--     encuesta_respondida, encuesta_nivel, encuesta_comentario,
--     encuesta_respondida_at.
--     Hereda la RLS de tickets (SELECT con módulo tickets, 072/082).
--
--   VISTAS KPI (security_invoker; corte MENSUAL en hora de Lima, `mes` = día 1).
--   La fórmula de cada medida vive en v_ticket_hechos; estas vistas son el
--   corte canónico por mes y la RPC agrega las MISMAS columnas para el rango
--   pedido (el bloque 115f de tests/db comprueba que coinciden mes a mes).
--     v_kpi_volumen     (mes, creados, rechazados, resueltos,
--                        resueltos_mismo_periodo, resueltos_arrastrados,
--                        cerrados_sin_encuesta)
--     v_kpi_tiempos     (mes, prioridad [NULL = todas], n_resolucion,
--                        mediana_horas_resolucion, promedio_horas_resolucion,
--                        n_primera_respuesta, mediana_horas_primera_respuesta,
--                        promedio_horas_primera_respuesta)  — horas corridas
--     v_kpi_reaperturas (mes [de la primera resolución], base, reabiertos,
--                        tasa_pct, eventos [reaperturas ocurridas en el mes],
--                        corte_dias)
--     v_kpi_csat        (mes, tecnico_resolvio_id, generadas, respondidas, n,
--                        suma_nivel, promedio [NULL si n < mínimo],
--                        insuficiente, n1..n5, insatisfechos, muestra_minima)
--     v_backlog_tramos  = backlog_tramos_en(now()): (orden, clave, etiqueta,
--                        cantidad, dias_mas_antiguo)
--
--   FUNCIÓN public.backlog_tramos_en(p_instante timestamptz) → tabla de tramos
--     (0-3 / 4-7 / 8-30 / >30 días corridos) con los tickets VIGENTES a ese
--     instante según sus transiciones. STABLE, SECURITY INVOKER, EXECUTE a
--     authenticated (la usa la vista; con RLS del que consulta).
--
--   FUNCIÓN public.reporte_tickets(p_desde date, p_hasta date,
--                                  p_tecnico uuid default null) → jsonb
--     SECURITY DEFINER. Guard exigir_permiso('modulo:tickets') (42501) y
--     delega en reporte_tickets_de(auth.uid(), ...). EXECUTE a authenticated.
--     Rango en fechas de calendario de LIMA construido en el servidor:
--     [p_desde 00:00, p_hasta 24:00). p_desde <= p_hasta y como máximo 366 días
--     (P0001 si no).
--   FUNCIÓN public.reporte_tickets_de(p_user uuid, p_desde date, p_hasta date,
--                                     p_tecnico uuid, p_comparar boolean)
--     El cuerpo para un usuario explícito (EXECUTE solo project_admin: las
--     pruebas de tests/db la ejercen sin simular una sesión, mismo patrón que
--     dashboard_resumen_de de la 103). Guard puede(p_user,'modulo:tickets')
--     (42501); p_tecnico distinto del propio usuario exige rol:jefe (42501).
--     Forma del resultado (claves en snake_case):
--     {
--       generado_en, generado_por: {user_id, nombre}, definiciones_version,
--       periodo: {desde, hasta, dias, completo, en_curso, cierre_at, zona},
--       periodo_completo,
--       alcance: {tipo: 'equipo'|'tecnico', tecnico_id, tecnico_nombre},
--       parametros: {csat_muestra_minima, dias_corte_reapertura},
--       primer_ticket_at,
--       volumen: {creados (null con alcance técnico), rechazados, resueltos,
--                 resueltos_mismo_periodo, resueltos_arrastrados,
--                 cerrados_sin_encuesta,
--                 backlog: {referencia: 'cierre'|'ahora', total,
--                           dias_mas_antiguo, tramos: [{clave, etiqueta, cantidad}]}},
--       por: {categoria, subcategoria, prioridad, tipo, nivel, area:
--             [{clave, nombre, creados, resueltos}]},
--       atencion: {unidad: 'horas corridas',
--                  resolucion: {n, mediana_horas, promedio_horas},
--                  primera_respuesta: {n, mediana_horas, promedio_horas},
--                  por_prioridad: [{prioridad, n, mediana_horas, promedio_horas}]},
--       calidad: {reaperturas: {base, reabiertos, tasa_pct, eventos, corte_dias,
--                               ventana_completa},
--                 csat: {generadas, respondidas, tasa_respuesta_pct, n, promedio,
--                        insuficiente, minimo, niveles: {1..5}, insatisfechos},
--                 comentarios_bajos: [{codigo, nivel, comentario, fecha}],
--                 comentarios_bajos_total},
--       por_tecnico: null (si no es jefe) | [{tecnico_id, nombre, resueltos,
--                    mismo_periodo, arrastrados, tiempos: {n, mediana_horas,
--                    promedio_horas}, csat: {n, promedio, insuficiente},
--                    reaperturas: {base, reabiertos}, asignados_hoy}],
--       anexos: {arrastrados: [{codigo, titulo, created_at, resuelto_at,
--                               dias_abierto, tecnico_id}],
--                cerrados_sin_encuesta: [{codigo, titulo, resuelto_at, motivo}]},
--       tickets: [{codigo, titulo, estado, prioridad, tipo, nivel_atencion,
--                  categoria, subcategoria, area, solicitante, created_at,
--                  resuelto_at, horas_resolucion, tecnico_id, encuesta_nivel,
--                  en_periodo: 'creado'|'resuelto'|'ambos'}]  -- sin DNI ni contacto
--       comparacion: null | {periodo: {desde, hasta}, parcial, volumen,
--                            atencion, csat, reaperturas}
--     }
--   FUNCIÓN public.reporte_satisfaccion_consolidado() → jsonb
--     CONSERVA la firma de la 053 (create or replace). Guard
--     exigir_permiso('modulo:tickets'); delega en
--     reporte_satisfaccion_consolidado_de(auth.uid()) (EXECUTE project_admin).
--     Devuelve {respuestas, porSolicitante, porTecnico} como antes (mismos
--     nombres de campo) y suma, con la MISMA muestra mínima que la RPC por
--     período: `promedio` NULL e `insuficiente` true cuando muestra < mínimo,
--     `niveles` {1..5} e `insatisfechos` (<= 2) por fila, `porMes` (de
--     v_kpi_csat), `resumen` y `muestraMinima`.
--   SE ELIMINAN (documentado): reporte_tickets(timestamptz, timestamptz) y
--     reporte_tickets_resumen(timestamptz, timestamptz) (053/086). La primera
--     cambia de firma (fechas de calendario + técnico): dos sobrecargas con el
--     mismo nombre serían ambiguas para PostgREST. La segunda desaparece: la
--     comparación es la misma RPC sobre el período anterior (clave
--     `comparacion`). Ninguna tenía consumidor (REPORTE-TICKETS-RPC-MUERTOS).
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano.
-- Correr SIEMPRE el bloque "Verificación" del final. Todo es idempotente
-- (las vistas se recrean; reaplicar es seguro).
-- Rollback: migrations/rollback/115_rollback.sql (restaura las tres RPC de la
-- 086 y quita vistas, funciones y parámetros nuevos).
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 089 (resuelto_at), 099 (puede/exigir_permiso) y 103
--    (config_parametros / parametro_entero)
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tickets' and column_name = 'resuelto_at'
  ) then
    raise exception 'La migración 115 requiere la 089 (tickets.resuelto_at). Aplíquela primero.';
  end if;
  if to_regprocedure('public.puede(uuid, text)') is null
     or to_regprocedure('public.exigir_permiso(text)') is null then
    raise exception 'La migración 115 requiere la 099 (puede / exigir_permiso). Aplíquela primero.';
  end if;
  if to_regclass('public.config_parametros') is null
     or to_regprocedure('public.parametro_entero(text, integer, text)') is null then
    raise exception 'La migración 115 requiere la 103 (config_parametros / parametro_entero). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) Parámetros (mismo patrón que la 103: la clave la crea la migración, el
--    valor lo edita el JEFE)
-- ============================================================

insert into public.config_parametros (clave, valor, descripcion) values
  ('csat_muestra_minima', '5'::jsonb,
   'Respuestas con nivel necesarias para publicar un promedio de satisfacción (CSAT). Con menos, el reporte muestra "n insuficiente".'),
  ('dias_corte_reapertura', '30'::jsonb,
   'Días después de una resolución durante los que una reapertura cuenta contra esa resolución (tasa de reapertura).')
on conflict (clave) do nothing;


-- ============================================================
-- 2) v_ticket_hechos: una fila por ticket, la única lectura de ticket_eventos
--    con regex. Las vistas KPI y la RPC solo agregan estas columnas.
-- ============================================================

-- Las vistas KPI dependen de esta: se recrean en orden (dependientes primero)
-- para que reaplicar deje exactamente la misma definición aunque cambie una
-- columna. v_backlog_tramos depende de la función, no de la vista.
drop view if exists public.v_backlog_tramos;
drop view if exists public.v_kpi_csat;
drop view if exists public.v_kpi_reaperturas;
drop view if exists public.v_kpi_tiempos;
drop view if exists public.v_kpi_volumen;
drop view if exists public.v_ticket_hechos;

create view public.v_ticket_hechos
with (security_invoker = true) as
with parametros as (
  select public.parametro_entero('dias_corte_reapertura', 30) as corte_dias
),
-- Cambios de estado: origen y destino salen del detalle 'De "x" a "y"' que
-- escribe evento_ticket_cambios() (017/035). Misma expresión que
-- destinoDeCambio() en frontend/src/core/dominio-tickets.js.
ev as (
  select e.ticket_id, e.user_id, e.created_at,
         substring(e.detalle from '^De "(\w+)"')   as origen,
         substring(e.detalle from 'a "(\w+)"\s*$') as destino
    from public.ticket_eventos e
   where e.evento = 'estado_cambiado'
),
resoluciones as (
  select ticket_id,
         count(*)::integer                                   as n_resoluciones,
         min(created_at)                                     as primera_resolucion_at,
         max(created_at)                                     as ultima_resolucion_at,
         (array_agg(user_id order by created_at desc))[1]    as tecnico_resolvio_id
    from ev
   where destino = 'resuelto'
   group by ticket_id
),
-- Reaperturas: desde resuelto/cerrado, nunca desde rechazado. Una reapertura
-- "en corte" ocurrió dentro de `corte_dias` tras la resolución anterior.
reaperturas as (
  select r.ticket_id,
         count(*)::integer                                   as n_reaperturas,
         array_agg(r.created_at order by r.created_at)       as reaperturas_at,
         bool_or(r.resolucion_previa is not null
                 and r.created_at <= r.resolucion_previa + make_interval(days => p.corte_dias)) as reabierto_en_corte
    from (
      select e.ticket_id, e.created_at,
             (select max(x.created_at) from ev x
               where x.ticket_id = e.ticket_id and x.destino = 'resuelto' and x.created_at <= e.created_at) as resolucion_previa
        from ev e
       where e.destino = 'reabierto' and coalesce(e.origen, '') <> 'rechazado'
    ) r
    cross join parametros p
   group by r.ticket_id
),
transiciones as (
  select ticket_id,
         jsonb_agg(jsonb_build_object('t', created_at, 'a', destino) order by created_at) as transiciones
    from ev
   group by ticket_id
),
reasignaciones as (
  select ticket_id, count(*)::integer as n_reasignaciones
    from public.ticket_eventos
   where evento = 'reasignado'
   group by ticket_id
),
-- Primera respuesta: primer comentario visible para el solicitante escrito
-- por alguien del staff.
primera_respuesta as (
  select c.ticket_id, min(c.created_at) as primera_respuesta_at
    from public.ticket_comentarios c
    join public.staff s on s.user_id = c.autor_id
   where c.interno = false
   group by c.ticket_id
)
select
  t.id                                                        as ticket_id,
  t.codigo,
  t.titulo,
  t.estado,
  t.prioridad,
  t.tipo,
  t.nivel_atencion,
  t.categoria_id,
  cat.nombre                                                  as categoria_nombre,
  t.subcategoria_id,
  sub.nombre                                                  as subcategoria_nombre,
  t.empleado_id,
  t.vinculado,
  case when coalesce(t.vinculado, false) and e.id is not null
       then btrim(e.nombres || ' ' || e.apellidos)
       else 'Sin vincular' end                                as solicitante,
  e.area_obra_id,
  ao.nombre                                                   as area_obra_nombre,
  e.ubicacion_id,
  ub.nombre                                                   as ubicacion_nombre,
  t.asignado_a,
  t.created_at,
  (t.created_at at time zone 'America/Lima')::date            as dia_creado,
  t.resuelto_at,
  (t.resuelto_at at time zone 'America/Lima')::date           as dia_resuelto,
  (t.estado in ('resuelto', 'cerrado') and t.resuelto_at is not null) as resuelto_vigente,
  (t.estado = 'rechazado')                                    as rechazado,
  (t.estado = 'cerrado')                                      as cerrado,
  r.tecnico_resolvio_id,
  case when t.estado in ('resuelto', 'cerrado') and t.resuelto_at >= t.created_at
       then extract(epoch from (t.resuelto_at - t.created_at)) / 3600.0 end as horas_resolucion,
  pr.primera_respuesta_at,
  case when pr.primera_respuesta_at >= t.created_at
       then extract(epoch from (pr.primera_respuesta_at - t.created_at)) / 3600.0 end as horas_primera_respuesta,
  coalesce(ra.n_reasignaciones, 0)                            as n_reasignaciones,
  coalesce(r.n_resoluciones, 0)                               as n_resoluciones,
  r.primera_resolucion_at,
  (r.primera_resolucion_at at time zone 'America/Lima')::date as dia_primera_resolucion,
  r.ultima_resolucion_at,
  coalesce(rp.n_reaperturas, 0)                               as n_reaperturas,
  coalesce(rp.reaperturas_at, '{}'::timestamptz[])            as reaperturas_at,
  coalesce(rp.reabierto_en_corte, false)                      as reabierto_en_corte,
  coalesce(tr.transiciones, '[]'::jsonb)                      as transiciones,
  s.id                                                        as encuesta_id,
  (s.id is not null)                                          as encuesta_generada,
  s.created_at                                                as encuesta_generada_at,
  (s.fecha_envio is not null)                                 as encuesta_respondida,
  case when s.fecha_envio is not null then s.nivel end        as encuesta_nivel,
  case when s.fecha_envio is not null then s.comentario end   as encuesta_comentario,
  s.fecha_envio                                               as encuesta_respondida_at
from public.tickets t
left join public.categorias_ticket    cat on cat.id = t.categoria_id
left join public.subcategorias_ticket sub on sub.id = t.subcategoria_id
left join public.empleados            e   on e.id = t.empleado_id
left join public.areas_obras          ao  on ao.id = e.area_obra_id
left join public.ubicaciones          ub  on ub.id = e.ubicacion_id
left join resoluciones                r   on r.ticket_id = t.id
left join reaperturas                 rp  on rp.ticket_id = t.id
left join transiciones                tr  on tr.ticket_id = t.id
left join reasignaciones              ra  on ra.ticket_id = t.id
left join primera_respuesta           pr  on pr.ticket_id = t.id
left join public.ticket_satisfaccion  s   on s.ticket_id = t.id;

alter view public.v_ticket_hechos owner to project_admin;
revoke all on public.v_ticket_hechos from public, anon;
grant select on public.v_ticket_hechos to authenticated;

comment on view public.v_ticket_hechos is
  'Una fila por ticket con todos los hechos que miden los reportes (resolución vigente, técnico que resolvió, horas corridas, reaperturas, encuesta). Única lectura de ticket_eventos con regex. security_invoker. Migración 115.';


-- ============================================================
-- 3) Vistas KPI: corte mensual (Lima) de las mismas columnas
-- ============================================================

create view public.v_kpi_volumen
with (security_invoker = true) as
with por_mes as (
  select date_trunc('month', h.dia_creado)::date as mes,
         1 as creados, h.rechazado::int as rechazados,
         0 as resueltos, 0 as resueltos_mismo_periodo, 0 as cerrados_sin_encuesta
    from public.v_ticket_hechos h
  union all
  select date_trunc('month', h.dia_resuelto)::date,
         0, 0,
         1,
         (date_trunc('month', h.dia_creado) = date_trunc('month', h.dia_resuelto))::int,
         (h.cerrado and not h.encuesta_generada)::int
    from public.v_ticket_hechos h
   where h.resuelto_vigente
)
select mes,
       sum(creados)::integer                                    as creados,
       sum(rechazados)::integer                                 as rechazados,
       sum(resueltos)::integer                                  as resueltos,
       sum(resueltos_mismo_periodo)::integer                    as resueltos_mismo_periodo,
       (sum(resueltos) - sum(resueltos_mismo_periodo))::integer as resueltos_arrastrados,
       sum(cerrados_sin_encuesta)::integer                      as cerrados_sin_encuesta
  from por_mes
 group by mes;

alter view public.v_kpi_volumen owner to project_admin;
revoke all on public.v_kpi_volumen from public, anon;
grant select on public.v_kpi_volumen to authenticated;
comment on view public.v_kpi_volumen is
  'Volumen mensual (Lima): creados y rechazados por mes de creación; resueltos (resolución vigente) por mes de resolución. Migración 115.';

create view public.v_kpi_tiempos
with (security_invoker = true) as
select date_trunc('month', h.dia_resuelto)::date                              as mes,
       h.prioridad,
       count(h.horas_resolucion)::integer                                      as n_resolucion,
       round(percentile_cont(0.5) within group (order by h.horas_resolucion)::numeric, 2) as mediana_horas_resolucion,
       round(avg(h.horas_resolucion)::numeric, 2)                              as promedio_horas_resolucion,
       count(h.horas_primera_respuesta)::integer                               as n_primera_respuesta,
       round(percentile_cont(0.5) within group (order by h.horas_primera_respuesta)::numeric, 2) as mediana_horas_primera_respuesta,
       round(avg(h.horas_primera_respuesta)::numeric, 2)                       as promedio_horas_primera_respuesta
  from public.v_ticket_hechos h
 where h.resuelto_vigente
 group by grouping sets ((date_trunc('month', h.dia_resuelto)::date, h.prioridad), (date_trunc('month', h.dia_resuelto)::date));

alter view public.v_kpi_tiempos owner to project_admin;
revoke all on public.v_kpi_tiempos from public, anon;
grant select on public.v_kpi_tiempos to authenticated;
comment on view public.v_kpi_tiempos is
  'Tiempos de resolución y de primera respuesta en HORAS CORRIDAS por mes de resolución (Lima) y prioridad (NULL = todas); mediana y promedio siempre con n. Migración 115.';

create view public.v_kpi_reaperturas
with (security_invoker = true) as
with parametros as (
  select public.parametro_entero('dias_corte_reapertura', 30) as corte_dias
),
base as (
  select date_trunc('month', h.dia_primera_resolucion)::date as mes,
         count(*)::integer                                    as base,
         count(*) filter (where h.reabierto_en_corte)::integer as reabiertos
    from public.v_ticket_hechos h
   where h.primera_resolucion_at is not null
   group by 1
),
eventos as (
  select date_trunc('month', (r at time zone 'America/Lima')::date)::date as mes,
         count(*)::integer as eventos
    from public.v_ticket_hechos h
    cross join unnest(h.reaperturas_at) as r
   group by 1
)
select coalesce(b.mes, e.mes)        as mes,
       coalesce(b.base, 0)           as base,
       coalesce(b.reabiertos, 0)     as reabiertos,
       case when coalesce(b.base, 0) > 0 then round(100.0 * b.reabiertos / b.base)::integer end as tasa_pct,
       coalesce(e.eventos, 0)        as eventos,
       (select corte_dias from parametros) as corte_dias
  from base b
  full join eventos e on e.mes = b.mes;

alter view public.v_kpi_reaperturas owner to project_admin;
revoke all on public.v_kpi_reaperturas from public, anon;
grant select on public.v_kpi_reaperturas to authenticated;
comment on view public.v_kpi_reaperturas is
  'Reaperturas por mes (Lima): base = tickets con primera resolución en el mes; reabiertos = los que se reabrieron (origen ≠ rechazado) dentro del corte; eventos = reaperturas ocurridas en el mes. Migración 115.';

create view public.v_kpi_csat
with (security_invoker = true) as
with parametros as (
  select public.parametro_entero('csat_muestra_minima', 5) as minimo
)
select date_trunc('month', h.dia_resuelto)::date                      as mes,
       h.tecnico_resolvio_id,
       count(*) filter (where h.encuesta_generada)::integer            as generadas,
       count(*) filter (where h.encuesta_respondida)::integer          as respondidas,
       count(h.encuesta_nivel)::integer                                as n,
       coalesce(sum(h.encuesta_nivel), 0)::integer                     as suma_nivel,
       case when count(h.encuesta_nivel) >= p.minimo
            then round(avg(h.encuesta_nivel)::numeric, 2) end          as promedio,
       (count(h.encuesta_nivel) < p.minimo)                            as insuficiente,
       count(*) filter (where h.encuesta_nivel = 1)::integer           as n1,
       count(*) filter (where h.encuesta_nivel = 2)::integer           as n2,
       count(*) filter (where h.encuesta_nivel = 3)::integer           as n3,
       count(*) filter (where h.encuesta_nivel = 4)::integer           as n4,
       count(*) filter (where h.encuesta_nivel = 5)::integer           as n5,
       count(*) filter (where h.encuesta_nivel <= 2)::integer          as insatisfechos,
       p.minimo                                                        as muestra_minima
  from public.v_ticket_hechos h
  cross join parametros p
 where h.resuelto_vigente
 group by 1, 2, p.minimo;

alter view public.v_kpi_csat owner to project_admin;
revoke all on public.v_kpi_csat from public, anon;
grant select on public.v_kpi_csat to authenticated;
comment on view public.v_kpi_csat is
  'Satisfacción por mes de resolución (Lima) y técnico que resolvió: generadas, respondidas, n con nivel, promedio (NULL si n < csat_muestra_minima), desglose 1-5 e insatisfechos (<= 2). Migración 115.';


-- ============================================================
-- 4) Backlog a un instante (reconstruido por transiciones) y su vista "ahora"
-- ============================================================

create or replace function public.backlog_tramos_en(p_instante timestamptz)
returns table (orden integer, clave text, etiqueta text, cantidad integer, dias_mas_antiguo integer)
language sql
stable
set search_path = public
as $$
  with vigentes as (
    select h.ticket_id,
           floor(extract(epoch from (p_instante - h.created_at)) / 86400)::integer as dias
      from public.v_ticket_hechos h
     where h.created_at <= p_instante
       and coalesce(
             (select x ->> 'a'
                from jsonb_array_elements(h.transiciones) x
               where (x ->> 't')::timestamptz <= p_instante
               order by (x ->> 't')::timestamptz desc
               limit 1),
             -- sin transiciones registradas: el estado actual (un ticket legado
             -- creado ya cerrado) o 'abierto' (estado inicial de todo ticket)
             case when h.transiciones = '[]'::jsonb then h.estado else 'abierto' end
           ) not in ('resuelto', 'cerrado', 'rechazado')
  ),
  tramos(orden, clave, etiqueta, desde, hasta) as (
    values (1, 'hasta_3',   '0 a 3 días',     0,  3),
           (2, 'de_4_a_7',  '4 a 7 días',     4,  7),
           (3, 'de_8_a_30', '8 a 30 días',    8,  30),
           (4, 'mas_30',    'Más de 30 días', 31, null::integer)
  )
  select t.orden, t.clave, t.etiqueta,
         count(v.ticket_id)::integer as cantidad,
         max(v.dias)::integer        as dias_mas_antiguo
    from tramos t
    left join vigentes v on v.dias >= t.desde and (t.hasta is null or v.dias <= t.hasta)
   group by t.orden, t.clave, t.etiqueta
   order by t.orden;
$$;

alter function public.backlog_tramos_en(timestamptz) owner to project_admin;
revoke all on function public.backlog_tramos_en(timestamptz) from public, anon;
grant execute on function public.backlog_tramos_en(timestamptz) to authenticated;
comment on function public.backlog_tramos_en(timestamptz) is
  'Tickets vigentes a un instante (estado reconstruido por sus transiciones) por tramo de días corridos. SECURITY INVOKER. Migración 115.';

create view public.v_backlog_tramos
with (security_invoker = true) as
select * from public.backlog_tramos_en(now());

alter view public.v_backlog_tramos owner to project_admin;
revoke all on public.v_backlog_tramos from public, anon;
grant select on public.v_backlog_tramos to authenticated;
comment on view public.v_backlog_tramos is
  'Backlog actual por tramos de antigüedad (0-3 / 4-7 / 8-30 / >30 días corridos). Migración 115.';


-- ============================================================
-- 5) RPC reporte_tickets: compone los hechos para un período de Lima
-- ============================================================

-- Las sobrecargas de la 053/086 se retiran (ver cabecera).
drop function if exists public.reporte_tickets(timestamptz, timestamptz);
drop function if exists public.reporte_tickets_resumen(timestamptz, timestamptz);

create or replace function public.reporte_tickets_de(
  p_user     uuid,
  p_desde    date,
  p_hasta    date,
  p_tecnico  uuid    default null,
  p_comparar boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_version   constant text := 'reportes-2026-10-03';
  v_hoy       date := (now() at time zone 'America/Lima')::date;
  v_minimo    integer := public.parametro_entero('csat_muestra_minima', 5);
  v_corte     integer := public.parametro_entero('dias_corte_reapertura', 30);
  v_jefe      boolean;
  v_nombre    text;
  v_tecnico_nombre text;
  v_completo  boolean;
  v_en_curso  boolean;
  v_cierre    timestamptz;
  v_result    jsonb;
  v_anterior  jsonb;
  v_ant_desde date;
  v_ant_hasta date;
  v_primer_dia date;
begin
  -- Guard único (099): módulo tickets, 42501 si no (también sin sesión).
  if not public.puede(p_user, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_jefe := public.puede(p_user, 'rol:jefe');
  if p_tecnico is not null and p_tecnico <> p_user and not v_jefe then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no es válido: la fecha inicial debe ser anterior o igual a la final.';
  end if;
  if p_hasta - p_desde >= 366 then
    raise exception 'El período no puede superar los 366 días.';
  end if;

  select s.nombre into v_nombre from public.staff s where s.user_id = p_user;
  if p_tecnico is not null then
    select s.nombre into v_tecnico_nombre from public.staff s where s.user_id = p_tecnico;
  end if;

  v_completo := p_hasta < v_hoy;
  v_en_curso := p_desde <= v_hoy and p_hasta >= v_hoy;
  -- Instante de cierre del período (00:00 de Lima del día siguiente a
  -- p_hasta); si el período no terminó, "ahora".
  v_cierre := least(((p_hasta + 1)::timestamp at time zone 'America/Lima'), now());

  with h as (
    select x.*,
           (p_tecnico is null and x.dia_creado between p_desde and p_hasta)               as creado_en,
           (x.resuelto_vigente and x.dia_resuelto between p_desde and p_hasta
              and (p_tecnico is null or x.tecnico_resolvio_id = p_tecnico))               as resuelto_en,
           (x.primera_resolucion_at is not null
              and x.dia_primera_resolucion between p_desde and p_hasta
              and (p_tecnico is null or x.tecnico_resolvio_id = p_tecnico))               as primera_resolucion_en
      from public.v_ticket_hechos x
  ),
  u as (
    -- Universo del período: creados o resueltos en él (con alcance técnico,
    -- solo lo que ese técnico resolvió).
    select * from h where creado_en or resuelto_en or primera_resolucion_en
  ),
  eventos_reapertura as (
    select count(*)::integer as n
      from h cross join unnest(h.reaperturas_at) as r
     where (r at time zone 'America/Lima')::date between p_desde and p_hasta
       and (p_tecnico is null or h.tecnico_resolvio_id = p_tecnico)
  ),
  backlog as (
    select * from public.backlog_tramos_en(v_cierre)
  ),
  dimension as (
    select d.dimension, d.clave, d.nombre,
           count(*) filter (where u.creado_en)::integer   as creados,
           count(*) filter (where u.resuelto_en)::integer as resueltos
      from u
      cross join lateral (values
        ('categoria',    coalesce(u.categoria_id, ''),                                   coalesce(u.categoria_nombre, 'Sin categoría')),
        ('subcategoria', coalesce(u.subcategoria_id::text, ''),                          coalesce(u.categoria_nombre, 'Sin categoría') || ' › ' || coalesce(u.subcategoria_nombre, 'Sin subcategoría')),
        ('prioridad',    coalesce(u.prioridad, ''),                                      coalesce(u.prioridad, 'Sin definir')),
        ('tipo',         coalesce(u.tipo, ''),                                           coalesce(u.tipo, 'sin_clasificar')),
        ('nivel',        coalesce(u.nivel_atencion, ''),                                 coalesce(u.nivel_atencion, 'Sin nivel')),
        ('area',         coalesce(u.area_obra_id::text, ''),                             coalesce(u.area_obra_nombre, 'Sin registrar'))
      ) as d(dimension, clave, nombre)
     where u.creado_en or u.resuelto_en
     group by d.dimension, d.clave, d.nombre
  ),
  tiempos as (
    select count(horas_resolucion)::integer as n,
           round(percentile_cont(0.5) within group (order by horas_resolucion)::numeric, 2) as mediana,
           round(avg(horas_resolucion)::numeric, 2) as promedio,
           count(horas_primera_respuesta)::integer as n_pr,
           round(percentile_cont(0.5) within group (order by horas_primera_respuesta)::numeric, 2) as mediana_pr,
           round(avg(horas_primera_respuesta)::numeric, 2) as promedio_pr
      from u where resuelto_en
  ),
  tiempos_prioridad as (
    select coalesce(prioridad, 'sin_definir') as prioridad,
           count(horas_resolucion)::integer as n,
           round(percentile_cont(0.5) within group (order by horas_resolucion)::numeric, 2) as mediana,
           round(avg(horas_resolucion)::numeric, 2) as promedio
      from u where resuelto_en
     group by coalesce(prioridad, 'sin_definir')
  ),
  reaperturas as (
    select count(*) filter (where primera_resolucion_en)::integer                          as base,
           count(*) filter (where primera_resolucion_en and reabierto_en_corte)::integer   as reabiertos
      from u
  ),
  csat as (
    select count(*) filter (where encuesta_generada)::integer    as generadas,
           count(*) filter (where encuesta_respondida)::integer  as respondidas,
           count(encuesta_nivel)::integer                        as n,
           round(avg(encuesta_nivel)::numeric, 2)                as promedio_crudo,
           count(*) filter (where encuesta_nivel = 1)::integer   as n1,
           count(*) filter (where encuesta_nivel = 2)::integer   as n2,
           count(*) filter (where encuesta_nivel = 3)::integer   as n3,
           count(*) filter (where encuesta_nivel = 4)::integer   as n4,
           count(*) filter (where encuesta_nivel = 5)::integer   as n5,
           count(*) filter (where encuesta_nivel <= 2)::integer  as insatisfechos
      from u where resuelto_en
  ),
  comentarios_bajos as (
    select codigo, encuesta_nivel as nivel, encuesta_comentario as comentario, encuesta_respondida_at as fecha
      from u
     where resuelto_en and encuesta_nivel <= 2 and encuesta_comentario is not null
  ),
  por_tecnico as (
    select u.tecnico_resolvio_id as tecnico_id,
           s.nombre,
           count(*) filter (where u.resuelto_en)::integer                                  as resueltos,
           count(*) filter (where u.resuelto_en and u.creado_en)::integer                   as mismo_periodo,
           count(*) filter (where u.resuelto_en and not u.creado_en)::integer               as arrastrados,
           count(u.horas_resolucion) filter (where u.resuelto_en)::integer                  as t_n,
           round(percentile_cont(0.5) within group (order by u.horas_resolucion) filter (where u.resuelto_en)::numeric, 2) as t_mediana,
           round(avg(u.horas_resolucion) filter (where u.resuelto_en)::numeric, 2)         as t_promedio,
           count(u.encuesta_nivel) filter (where u.resuelto_en)::integer                    as c_n,
           round(avg(u.encuesta_nivel) filter (where u.resuelto_en)::numeric, 2)           as c_promedio,
           count(*) filter (where u.primera_resolucion_en)::integer                         as r_base,
           count(*) filter (where u.primera_resolucion_en and u.reabierto_en_corte)::integer as r_reabiertos,
           (select count(*) from public.v_ticket_hechos a
             where a.asignado_a = u.tecnico_resolvio_id
               and a.estado not in ('resuelto', 'cerrado', 'rechazado'))::integer           as asignados_hoy
      from u
      left join public.staff s on s.user_id = u.tecnico_resolvio_id
     where u.resuelto_en or u.primera_resolucion_en
     group by u.tecnico_resolvio_id, s.nombre
  ),
  anexo_arrastrados as (
    select codigo, titulo, created_at, resuelto_at,
           floor(extract(epoch from (resuelto_at - created_at)) / 86400)::integer as dias_abierto,
           tecnico_resolvio_id as tecnico_id
      from u
     where resuelto_en and dia_creado < p_desde
  ),
  anexo_sin_encuesta as (
    select codigo, titulo, resuelto_at,
           case when empleado_id is null then 'sin_solicitante' else 'sin_encuesta' end as motivo
      from u
     where resuelto_en and cerrado and not encuesta_generada
  )
  select jsonb_build_object(
    'generado_en',          now(),
    'generado_por',         jsonb_build_object('user_id', p_user, 'nombre', v_nombre),
    'definiciones_version', c_version,
    'periodo', jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta, 'dias', (p_hasta - p_desde + 1),
      'completo', v_completo, 'en_curso', v_en_curso, 'cierre_at', v_cierre, 'zona', 'America/Lima'),
    'periodo_completo',     v_completo,
    'alcance', jsonb_build_object(
      'tipo', case when p_tecnico is null then 'equipo' else 'tecnico' end,
      'tecnico_id', p_tecnico, 'tecnico_nombre', v_tecnico_nombre),
    'parametros', jsonb_build_object('csat_muestra_minima', v_minimo, 'dias_corte_reapertura', v_corte),
    'primer_ticket_at',     (select min(created_at) from public.v_ticket_hechos),
    'volumen', jsonb_build_object(
      'creados',                  case when p_tecnico is null then (select count(*) from u where creado_en) end,
      'rechazados',               case when p_tecnico is null then (select count(*) from u where creado_en and rechazado) end,
      'resueltos',                (select count(*) from u where resuelto_en),
      'resueltos_mismo_periodo',  (select count(*) from u where resuelto_en and dia_creado between p_desde and p_hasta),
      'resueltos_arrastrados',    (select count(*) from u where resuelto_en and dia_creado < p_desde),
      'cerrados_sin_encuesta',    (select count(*) from anexo_sin_encuesta),
      'backlog', case when p_tecnico is null then jsonb_build_object(
        'referencia',       case when v_completo then 'cierre' else 'ahora' end,
        'total',            (select coalesce(sum(cantidad), 0) from backlog),
        'dias_mas_antiguo', (select max(dias_mas_antiguo) from backlog),
        'tramos',           (select jsonb_agg(jsonb_build_object('clave', clave, 'etiqueta', etiqueta, 'cantidad', cantidad) order by orden) from backlog)
      ) end
    ),
    'por', jsonb_build_object(
      'categoria',    coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by creados desc, resueltos desc, nombre) from dimension where dimension = 'categoria'), '[]'::jsonb),
      'subcategoria', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by creados desc, resueltos desc, nombre) from dimension where dimension = 'subcategoria'), '[]'::jsonb),
      'prioridad',    coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by array_position(array['urgente', 'alta', 'media', 'baja'], clave) nulls last) from dimension where dimension = 'prioridad'), '[]'::jsonb),
      'tipo',         coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by creados desc, resueltos desc, nombre) from dimension where dimension = 'tipo'), '[]'::jsonb),
      'nivel',        coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by nombre) from dimension where dimension = 'nivel'), '[]'::jsonb),
      'area',         coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by creados desc, resueltos desc, nombre) from dimension where dimension = 'area'), '[]'::jsonb)
    ),
    'atencion', jsonb_build_object(
      'unidad', 'horas corridas',
      'resolucion',        (select jsonb_build_object('n', n, 'mediana_horas', mediana, 'promedio_horas', promedio) from tiempos),
      'primera_respuesta', (select jsonb_build_object('n', n_pr, 'mediana_horas', mediana_pr, 'promedio_horas', promedio_pr) from tiempos),
      'por_prioridad', coalesce((select jsonb_agg(jsonb_build_object('prioridad', prioridad, 'n', n, 'mediana_horas', mediana, 'promedio_horas', promedio)
                                                  order by array_position(array['urgente', 'alta', 'media', 'baja'], prioridad) nulls last) from tiempos_prioridad), '[]'::jsonb)
    ),
    'calidad', jsonb_build_object(
      'reaperturas', (select jsonb_build_object(
          'base', base, 'reabiertos', reabiertos,
          'tasa_pct', case when base > 0 then round(100.0 * reabiertos / base)::integer end,
          'eventos', (select n from eventos_reapertura),
          'corte_dias', v_corte,
          'ventana_completa', (p_hasta + v_corte) < v_hoy) from reaperturas),
      'csat', (select jsonb_build_object(
          'generadas', generadas, 'respondidas', respondidas,
          'tasa_respuesta_pct', case when generadas > 0 then round(100.0 * respondidas / generadas)::integer end,
          'n', n,
          'promedio', case when n >= v_minimo then promedio_crudo end,
          'insuficiente', n < v_minimo,
          'minimo', v_minimo,
          'niveles', jsonb_build_object('1', n1, '2', n2, '3', n3, '4', n4, '5', n5),
          'insatisfechos', insatisfechos) from csat),
      'comentarios_bajos', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nivel', nivel, 'comentario', comentario, 'fecha', fecha) order by fecha desc)
                                       from (select * from comentarios_bajos order by fecha desc limit 20) cb), '[]'::jsonb),
      'comentarios_bajos_total', (select count(*) from comentarios_bajos)
    ),
    'por_tecnico', case when v_jefe then coalesce((select jsonb_agg(jsonb_build_object(
        'tecnico_id', tecnico_id, 'nombre', nombre,
        'resueltos', resueltos, 'mismo_periodo', mismo_periodo, 'arrastrados', arrastrados,
        'tiempos', jsonb_build_object('n', t_n, 'mediana_horas', t_mediana, 'promedio_horas', t_promedio),
        'csat', jsonb_build_object('n', c_n, 'promedio', case when c_n >= v_minimo then c_promedio end, 'insuficiente', c_n < v_minimo),
        'reaperturas', jsonb_build_object('base', r_base, 'reabiertos', r_reabiertos),
        'asignados_hoy', asignados_hoy
      ) order by resueltos desc, nombre nulls last) from por_tecnico), '[]'::jsonb) end,
    'anexos', jsonb_build_object(
      'arrastrados', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'titulo', titulo, 'created_at', created_at, 'resuelto_at', resuelto_at,
                                                               'dias_abierto', dias_abierto, 'tecnico_id', tecnico_id) order by dias_abierto desc, codigo) from anexo_arrastrados), '[]'::jsonb),
      'cerrados_sin_encuesta', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'titulo', titulo, 'resuelto_at', resuelto_at, 'motivo', motivo) order by resuelto_at desc) from anexo_sin_encuesta), '[]'::jsonb)
    ),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', codigo, 'titulo', titulo, 'estado', estado, 'prioridad', prioridad, 'tipo', tipo, 'nivel_atencion', nivel_atencion,
        'categoria', categoria_nombre, 'subcategoria', subcategoria_nombre, 'area', area_obra_nombre, 'solicitante', solicitante,
        'created_at', created_at, 'resuelto_at', resuelto_at,
        'horas_resolucion', case when resuelto_en then round(horas_resolucion::numeric, 2) end,
        'tecnico_id', tecnico_resolvio_id, 'encuesta_nivel', encuesta_nivel,
        'en_periodo', case when creado_en and resuelto_en then 'ambos' when creado_en then 'creado' else 'resuelto' end
      ) order by created_at desc) from u where creado_en or resuelto_en), '[]'::jsonb),
    'comparacion', null
  ) into v_result;

  -- Comparación: solo períodos completos, alcance equipo, y nunca dentro de
  -- la propia comparación. Un mes de calendario se compara con el mes de
  -- calendario anterior; cualquier otro rango, con el rango inmediatamente
  -- anterior de la misma cantidad de días. `parcial` avisa que el período
  -- anterior empieza antes del primer ticket registrado.
  if p_comparar and v_completo and p_tecnico is null then
    if p_desde = date_trunc('month', p_desde)::date
       and p_hasta = (date_trunc('month', p_desde) + interval '1 month - 1 day')::date then
      v_ant_desde := (date_trunc('month', p_desde) - interval '1 month')::date;
      v_ant_hasta := p_desde - 1;
    else
      v_ant_hasta := p_desde - 1;
      v_ant_desde := p_desde - (p_hasta - p_desde + 1);
    end if;
    v_anterior := public.reporte_tickets_de(p_user, v_ant_desde, v_ant_hasta, null, false);
    v_primer_dia := ((v_result ->> 'primer_ticket_at')::timestamptz at time zone 'America/Lima')::date;
    v_result := v_result || jsonb_build_object('comparacion', jsonb_build_object(
      'periodo',     jsonb_build_object('desde', v_ant_desde, 'hasta', v_ant_hasta),
      'parcial',     (v_primer_dia is null or v_ant_desde < v_primer_dia),
      'volumen',     (v_anterior -> 'volumen') - 'backlog',
      'atencion',    v_anterior -> 'atencion' -> 'resolucion',
      'csat',        v_anterior -> 'calidad' -> 'csat',
      'reaperturas', v_anterior -> 'calidad' -> 'reaperturas'
    ));
  end if;

  return v_result;
end;
$$;

alter function public.reporte_tickets_de(uuid, date, date, uuid, boolean) owner to project_admin;
revoke all on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) to project_admin;
comment on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) is
  'Cuerpo de reporte_tickets() para un usuario explícito (115). EXECUTE solo project_admin: existe para probar el reporte sin simular una sesión. Guard: módulo tickets (42501); otro técnico exige rol:jefe.';

create or replace function public.reporte_tickets(
  p_desde   date,
  p_hasta   date,
  p_tecnico uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.reporte_tickets_de(auth.uid(), p_desde, p_hasta, p_tecnico, true);
end;
$$;

alter function public.reporte_tickets(date, date, uuid) owner to project_admin;
revoke all on function public.reporte_tickets(date, date, uuid) from public, anon, authenticated;
grant execute on function public.reporte_tickets(date, date, uuid) to authenticated;
comment on function public.reporte_tickets(date, date, uuid) is
  'Reporte de tickets de un período de calendario (Lima) compuesto desde v_ticket_hechos (115): volumen, atención en horas corridas, calidad, por técnico (solo JEFE), anexos, detalle y comparación con el período anterior completo. Guard: módulo tickets (42501).';


-- ============================================================
-- 6) reporte_satisfaccion_consolidado: misma firma, misma muestra mínima
-- ============================================================

create or replace function public.reporte_satisfaccion_consolidado_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_minimo integer := public.parametro_entero('csat_muestra_minima', 5);
  v_result jsonb;
begin
  if not public.puede(p_user, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with r as (
    select h.encuesta_id as id, h.ticket_id, h.codigo as ticket_codigo, h.titulo as ticket_titulo,
           h.empleado_id, h.solicitante, h.tecnico_resolvio_id as tecnico_id,
           h.encuesta_nivel as nivel, h.encuesta_comentario as comentario,
           h.encuesta_respondida_at as fecha_envio, h.encuesta_generada_at as created_at,
           h.encuesta_respondida as respondida
      from public.v_ticket_hechos h
     where h.encuesta_generada
  ),
  por_solicitante as (
    select empleado_id, max(solicitante) as nombre,
           count(*)::integer as generadas, count(*) filter (where respondida)::integer as respondidas,
           count(nivel)::integer as muestra, round(avg(nivel)::numeric, 2) as promedio_crudo,
           count(*) filter (where nivel = 1)::integer as n1, count(*) filter (where nivel = 2)::integer as n2,
           count(*) filter (where nivel = 3)::integer as n3, count(*) filter (where nivel = 4)::integer as n4,
           count(*) filter (where nivel = 5)::integer as n5, count(*) filter (where nivel <= 2)::integer as insatisfechos
      from r group by empleado_id
  ),
  por_tecnico as (
    select r.tecnico_id, s.nombre,
           count(*)::integer as generadas, count(*) filter (where respondida)::integer as respondidas,
           count(nivel)::integer as muestra, round(avg(nivel)::numeric, 2) as promedio_crudo,
           count(*) filter (where nivel = 1)::integer as n1, count(*) filter (where nivel = 2)::integer as n2,
           count(*) filter (where nivel = 3)::integer as n3, count(*) filter (where nivel = 4)::integer as n4,
           count(*) filter (where nivel = 5)::integer as n5, count(*) filter (where nivel <= 2)::integer as insatisfechos
      from r left join public.staff s on s.user_id = r.tecnico_id
     group by r.tecnico_id, s.nombre
  ),
  por_mes as (
    select mes, sum(generadas)::integer as generadas, sum(respondidas)::integer as respondidas,
           sum(n)::integer as muestra, sum(suma_nivel)::integer as suma_nivel,
           sum(n1)::integer as n1, sum(n2)::integer as n2, sum(n3)::integer as n3, sum(n4)::integer as n4, sum(n5)::integer as n5,
           sum(insatisfechos)::integer as insatisfechos
      from public.v_kpi_csat
     group by mes
  ),
  resumen as (
    select count(*)::integer as generadas, count(*) filter (where respondida)::integer as respondidas,
           count(nivel)::integer as muestra, round(avg(nivel)::numeric, 2) as promedio_crudo,
           count(*) filter (where nivel <= 2)::integer as insatisfechos
      from r
  )
  select jsonb_build_object(
    'muestraMinima', v_minimo,
    'resumen', (select jsonb_build_object(
        'encuestasGeneradas', generadas, 'encuestasRespondidas', respondidas,
        'tasaRespuestaPct', case when generadas > 0 then round(100.0 * respondidas / generadas)::integer end,
        'muestra', muestra, 'promedio', case when muestra >= v_minimo then promedio_crudo end,
        'insuficiente', muestra < v_minimo, 'insatisfechos', insatisfechos) from resumen),
    'respuestas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'ticket_id', ticket_id, 'ticket_codigo', ticket_codigo, 'ticket_titulo', ticket_titulo,
        'empleado_id', empleado_id, 'solicitante', solicitante, 'tecnico_id', tecnico_id,
        'nivel', nivel, 'comentario', comentario, 'fecha_envio', fecha_envio, 'created_at', created_at,
        'respondida', respondida
      ) order by created_at desc) from r), '[]'::jsonb),
    -- "Peor primero": promedio ascendente; sin promedio publicable al final,
    -- entre sí por más encuestas generadas.
    'porSolicitante', coalesce((select jsonb_agg(jsonb_build_object(
        'empleado_id', empleado_id, 'nombre', nombre, 'encuestasGeneradas', generadas,
        'encuestasRespondidas', respondidas, 'muestra', muestra,
        'promedio', case when muestra >= v_minimo then promedio_crudo end, 'insuficiente', muestra < v_minimo,
        'niveles', jsonb_build_object('1', n1, '2', n2, '3', n3, '4', n4, '5', n5), 'insatisfechos', insatisfechos
      ) order by (muestra < v_minimo) asc, promedio_crudo asc nulls last, generadas desc) from por_solicitante), '[]'::jsonb),
    'porTecnico', coalesce((select jsonb_agg(jsonb_build_object(
        'tecnico_id', tecnico_id, 'nombre', nombre, 'encuestasGeneradas', generadas,
        'encuestasRespondidas', respondidas, 'muestra', muestra,
        'promedio', case when muestra >= v_minimo then promedio_crudo end, 'insuficiente', muestra < v_minimo,
        'niveles', jsonb_build_object('1', n1, '2', n2, '3', n3, '4', n4, '5', n5), 'insatisfechos', insatisfechos
      ) order by (muestra < v_minimo) asc, promedio_crudo asc nulls last, generadas desc) from por_tecnico), '[]'::jsonb),
    'porMes', coalesce((select jsonb_agg(jsonb_build_object(
        'mes', mes, 'encuestasGeneradas', generadas, 'encuestasRespondidas', respondidas, 'muestra', muestra,
        'promedio', case when muestra >= v_minimo then round(suma_nivel::numeric / muestra, 2) end, 'insuficiente', muestra < v_minimo,
        'niveles', jsonb_build_object('1', n1, '2', n2, '3', n3, '4', n4, '5', n5), 'insatisfechos', insatisfechos
      ) order by mes desc) from por_mes), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

alter function public.reporte_satisfaccion_consolidado_de(uuid) owner to project_admin;
revoke all on function public.reporte_satisfaccion_consolidado_de(uuid) from public, anon, authenticated;
grant execute on function public.reporte_satisfaccion_consolidado_de(uuid) to project_admin;
comment on function public.reporte_satisfaccion_consolidado_de(uuid) is
  'Cuerpo de reporte_satisfaccion_consolidado() para un usuario explícito (115). EXECUTE solo project_admin (pruebas sin sesión). Guard: módulo tickets (42501).';

create or replace function public.reporte_satisfaccion_consolidado()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.reporte_satisfaccion_consolidado_de(auth.uid());
end;
$$;

alter function public.reporte_satisfaccion_consolidado() owner to project_admin;
revoke all on function public.reporte_satisfaccion_consolidado() from public, anon, authenticated;
grant execute on function public.reporte_satisfaccion_consolidado() to authenticated;
comment on function public.reporte_satisfaccion_consolidado() is
  'Histórico completo de satisfacción desde v_ticket_hechos / v_kpi_csat (115): respuestas, por solicitante, por técnico (quien marcó resuelto) y por mes, con la misma muestra mínima que reporte_tickets(). Guard: módulo tickets (42501).';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Parámetros nuevos (esperado: 2 filas, 5 y 30):
--    select clave, valor from public.config_parametros where clave in ('csat_muestra_minima', 'dias_corte_reapertura') order by clave;
--
-- 2) Vistas security_invoker (esperado: 6 filas, todas con security_invoker=true):
--    select relname, reloptions from pg_class where relnamespace = 'public'::regnamespace and relname in ('v_ticket_hechos','v_kpi_volumen','v_kpi_tiempos','v_kpi_reaperturas','v_kpi_csat','v_backlog_tramos') order by relname;
--
-- 3) Las RPC viejas ya no existen y las nuevas sí (esperado: solo las de abajo):
--    select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('reporte_tickets','reporte_tickets_resumen','reporte_tickets_de','reporte_satisfaccion_consolidado','reporte_satisfaccion_consolidado_de','backlog_tramos_en') order by 1;
--
-- 4) EXECUTE (esperado: reporte_tickets y reporte_satisfaccion_consolidado authenticated=true, anon=false; las *_de solo project_admin):
--    select p, has_function_privilege('authenticated', p, 'execute') as authenticated, has_function_privilege('anon', p, 'execute') as anon, has_function_privilege('project_admin', p, 'execute') as project_admin from unnest(array['public.reporte_tickets(date,date,uuid)','public.reporte_tickets_de(uuid,date,date,uuid,boolean)','public.reporte_satisfaccion_consolidado()','public.reporte_satisfaccion_consolidado_de(uuid)','public.backlog_tramos_en(timestamptz)']) as p;
--
-- 5) La vista base cuadra con la tabla (esperado: mismos conteos) y los resueltos
--    vigentes tienen resuelto_at (esperado: 0 en la segunda):
--    select (select count(*) from public.tickets) as tickets, (select count(*) from public.v_ticket_hechos) as hechos;
--    select count(*) from public.v_ticket_hechos where estado in ('resuelto','cerrado') and resuelto_at is null;
--
-- 6) Un mes completo, solo con conteos (reporte_tickets() sin sesión da 42501,
--    que ES el resultado esperado; el cuerpo se prueba con un usuario explícito):
--    select r -> 'volumen', r -> 'atencion' -> 'resolucion', r -> 'calidad' -> 'csat' from public.reporte_tickets_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1), date_trunc('month', current_date - 31)::date, (date_trunc('month', current_date) - interval '1 day')::date) r;
--    (esperado: la suma de v_kpi_volumen.resueltos de todos los meses = tickets con estado resuelto/cerrado)
--    select (select sum(resueltos) from public.v_kpi_volumen) as por_mes, (select count(*) from public.tickets where estado in ('resuelto','cerrado')) as tabla;
--
-- 7) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '115';
-- Después de aplicar: publicar el frontend (módulo Reportes). El frontend
-- nuevo sin la migración fallaría con PGRST202 al llamar reporte_tickets(date,
-- date, uuid): aplicar ANTES la migración.
-- ============================================================
-- FIN DE MIGRACIÓN 115
-- ============================================================
