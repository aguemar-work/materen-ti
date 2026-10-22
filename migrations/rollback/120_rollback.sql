-- ============================================================
-- ROLLBACK de la MIGRACIÓN 120: vuelve el cierre en un clic (cerrar_ticket de
-- la 086), una encuesta por ticket creada al cerrar (016), la whitelist de la
-- 050, v_ticket_hechos de la 115, reporte_satisfaccion_de de la 118 y
-- dashboard_resumen_de de la 108. Los cuerpos restaurados son copia literal de
-- esas migraciones (generados desde los archivos).
--
-- Datos (no hay vuelta atrás exacta, se informa con WARNING):
--   · Un ticket `resuelto` que esperaba la calificación queda `cerrado` (el
--     modelo anterior no tiene un resuelto estable).
--   · Vuelve UNA encuesta por ticket: se conserva la respondida más reciente
--     o, si ninguna se respondió, la de la última resolución; las demás se
--     borran (la respuesta anterior a una reapertura se pierde).
--   · Las columnas nuevas se borran con su contenido (solución, motivo de
--     reapertura, quién cerró, revisión de las calificaciones bajas), y
--     también los eventos cerrado_automatico / calificacion_revisada y las
--     notificaciones ticket_calificacion_baja (sus CHECK vuelven a los de la
--     116 y la 102, validados).
-- Revertir ANTES el frontend y las edge functions `tickets` y `credenciales`
-- (y borrar el schedule de mantenimiento), o aceptar que llamen a funciones
-- que ya no existen. Idempotente; cada restauración solo actúa si su
-- migración de origen sigue aplicada.
-- ============================================================


-- ============================================================
-- 1) Datos al modelo anterior (solo con la 120 aplicada)
-- ============================================================

do $rb$
declare
  v_n integer;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tickets' and column_name = 'cerrado_por') then
    return;
  end if;

  update public.tickets set estado = 'cerrado' where estado = 'resuelto';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise warning 'rollback 120: % ticket(s) resuelto(s) sin calificar quedaron cerrados.', v_n;
  end if;

  delete from public.ticket_satisfaccion s
   using (select id, row_number() over (partition by ticket_id
                                        order by (fecha_envio is not null) desc, resolucion_numero desc) as rn
            from public.ticket_satisfaccion) x
   where x.id = s.id and x.rn > 1;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise warning 'rollback 120: se borraron % encuesta(s) de resoluciones anteriores (vuelve una por ticket).', v_n;
  end if;
end $rb$;


-- ============================================================
-- 2) v_ticket_hechos y sus vistas KPI: las de la 115 (sin las columnas de
-- cierre). Se recrean ANTES de borrar las columnas de las que dependen.
-- ============================================================

do $rb$
begin
  if to_regclass('public.v_ticket_hechos') is null or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_ticket_hechos' and column_name = 'cerrado_por') then
    return;
  end if;
  execute $vistas$
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

create view public.v_backlog_tramos
with (security_invoker = true) as
select * from public.backlog_tramos_en(now());

alter view public.v_backlog_tramos owner to project_admin;
revoke all on public.v_backlog_tramos from public, anon;
grant select on public.v_backlog_tramos to authenticated;
comment on view public.v_backlog_tramos is
  'Backlog actual por tramos de antigüedad (0-3 / 4-7 / 8-30 / >30 días corridos). Migración 115.';
$vistas$;
end $rb$;


-- ============================================================
-- 3) Triggers y funciones de la 120
-- ============================================================

drop trigger if exists trg_tickets_datos_transicion on public.tickets;
drop trigger if exists trg_tickets_efectos_transicion on public.tickets;
drop trigger if exists trg_ticket_satisfaccion_respuesta on public.ticket_satisfaccion;
drop trigger if exists trg_notify_calificacion_baja on public.ticket_satisfaccion;

drop function if exists public.resolver_ticket(uuid, text);
drop function if exists public.resolver_ticket_de(uuid, uuid, text);
drop function if exists public.reabrir_ticket(uuid, text);
drop function if exists public.revisar_calificacion_baja(uuid, text, text);
drop function if exists public.revisar_calificacion_baja_de(uuid, uuid, text, text);
drop function if exists public.responder_encuesta_ticket(text, integer, text);
drop function if exists public.cerrar_resueltos_vencidos();
drop function if exists public.notify_calificacion_baja();
drop function if exists public.dia_habil_siguiente(date);
drop function if exists public.tickets_efectos_transicion();
drop function if exists public.tickets_datos_transicion();
drop function if exists public.ticket_satisfaccion_respuesta();

do $rb$
begin
  if to_regclass('public.config_parametros') is not null then
    delete from public.config_parametros where clave = 'horas_autocierre_resuelto';
  end if;
end $rb$;


-- ============================================================
-- 4) ticket_satisfaccion: una por ticket
-- ============================================================

drop index if exists public.ticket_satisfaccion_baja_pendiente_idx;
alter table public.ticket_satisfaccion drop constraint if exists ticket_satisfaccion_ticket_resolucion_key;
alter table public.ticket_satisfaccion drop constraint if exists ticket_satisfaccion_revision_desenlace_check;
alter table public.ticket_satisfaccion drop constraint if exists ticket_satisfaccion_revision_completa_check;
alter table public.ticket_satisfaccion drop column if exists resolucion_numero;
alter table public.ticket_satisfaccion drop column if exists resuelto_at;
alter table public.ticket_satisfaccion drop column if exists anulada_at;
alter table public.ticket_satisfaccion drop column if exists revision_desenlace;
alter table public.ticket_satisfaccion drop column if exists revision_nota;
alter table public.ticket_satisfaccion drop column if exists revisado_por;
alter table public.ticket_satisfaccion drop column if exists revisado_at;

do $rb$
begin
  if not exists (select 1 from pg_constraint where conname = 'ticket_satisfaccion_ticket_id_key') then
    alter table public.ticket_satisfaccion add constraint ticket_satisfaccion_ticket_id_key unique (ticket_id);
  end if;
end $rb$;

comment on table public.ticket_satisfaccion is
  'Encuesta de satisfacción. Se crea vacía (nivel/comentario/fecha_envio NULL) al cerrar el ticket; el empleado la completa vía /ticket/:token/satisfaccion.';


-- ============================================================
-- 5) tickets: columnas del ciclo de cierre
-- ============================================================

drop index if exists public.tickets_resuelto_pendiente_idx;
alter table public.tickets drop constraint if exists tickets_cerrado_por_check;
alter table public.tickets drop column if exists nota_resolucion;
alter table public.tickets drop column if exists motivo_reapertura;
alter table public.tickets drop column if exists cerrado_at;
alter table public.tickets drop column if exists cerrado_por;


-- ============================================================
-- 6) Whitelist de la 050
-- ============================================================

alter table public.transiciones_ticket_permitidas drop constraint if exists transiciones_ticket_quien_check;
alter table public.transiciones_ticket_permitidas drop column if exists quien;
delete from public.transiciones_ticket_permitidas;
insert into public.transiciones_ticket_permitidas (origen, destino, requiere_jefe) values
  ('abierto', 'en_progreso', false),
  ('abierto', 'rechazado', false),
  ('en_progreso', 'resuelto', false),
  ('reabierto', 'resuelto', false),
  ('resuelto', 'cerrado', false),
  ('cerrado', 'reabierto', true),
  ('rechazado', 'reabierto', true)
on conflict (origen, destino) do update set requiere_jefe = excluded.requiere_jefe;

create or replace function public.check_transicion_ticket_permitida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regla record;
begin
  if old.estado is distinct from new.estado then
    select * into v_regla from public.transiciones_ticket_permitidas
      where origen = old.estado and destino = new.estado;

    if v_regla is null then
      raise exception 'Transición de "%" a "%" no permitida.', old.estado, new.estado;
    end if;

    if v_regla.requiere_jefe and not public.es_jefe() then
      raise exception 'Solo el jefe puede hacer esta transición ("%" a "%").', old.estado, new.estado;
    end if;
  end if;
  return new;
end;
$$;

alter function public.check_transicion_ticket_permitida() owner to project_admin;


-- ============================================================
-- 7) Encuesta al cerrar (016) y cerrar_ticket (086, ACL de la 062)
-- ============================================================

create or replace function public.crear_encuesta_al_cerrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cerrado' and old.estado is distinct from 'cerrado' and new.empleado_id is not null then
    insert into public.ticket_satisfaccion (ticket_id)
    values (new.id)
    on conflict (ticket_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crear_encuesta_al_cerrar on public.tickets;
create trigger trg_crear_encuesta_al_cerrar
  after update on public.tickets
  for each row execute function public.crear_encuesta_al_cerrar();

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

comment on function public.cerrar_ticket(uuid) is
  'Marca un ticket resuelto y cerrado en una sola transacción de servidor (resuelto->cerrado), reemplazando las 2 llamadas HTTP secuenciales de marcarResuelto(). Conserva ambos hitos en ticket_eventos vía evento_ticket_cambios (cada UPDATE sigue disparando su propio evento).';
alter function public.cerrar_ticket(uuid) owner to project_admin;
revoke execute on function public.cerrar_ticket(uuid) from public;
grant execute on function public.cerrar_ticket(uuid) to authenticated;


-- ============================================================
-- 8) CHECK de eventos (116) y de notificaciones (102). Las filas con los
-- valores de la 120 se borran: con un CHECK NOT VALID, volver a aplicar la 102
-- o la 116 fallaría al validar el suyo.
-- ============================================================

do $rb$
declare
  v_n integer;
begin
  if exists (select 1 from pg_constraint where conname = 'ticket_eventos_evento_check'
              and pg_get_constraintdef(oid) like '%cerrado_automatico%') then
    delete from public.ticket_eventos where evento in ('cerrado_automatico', 'calificacion_revisada');
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise warning 'rollback 120: se borraron % evento(s) cerrado_automatico / calificacion_revisada del historial.', v_n;
    end if;
    alter table public.ticket_eventos drop constraint ticket_eventos_evento_check;
    alter table public.ticket_eventos add constraint ticket_eventos_evento_check
      check (evento in (
        'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
        'nivel_atencion_cambiado', 'tipo_cambiado', 'correo_fallido',
        'encuesta_enviada', 'encuesta_respondida', 'categoria_cambiada'
      ));
  end if;

  if exists (select 1 from pg_constraint where conname = 'notificaciones_tipo_check'
              and pg_get_constraintdef(oid) like '%ticket_calificacion_baja%') then
    delete from public.notificaciones where tipo = 'ticket_calificacion_baja';
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise warning 'rollback 120: se borraron % notificación(es) ticket_calificacion_baja.', v_n;
    end if;
    alter table public.notificaciones drop constraint notificaciones_tipo_check;
    alter table public.notificaciones add constraint notificaciones_tipo_check
      check (tipo in (
        'ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja',
        'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo',
        'ticket_correo_fallido',
        'empleado_suspendido'
      ));
  end if;
end $rb$;


-- ============================================================
-- 9) reporte_satisfaccion_de (118) y dashboard_resumen_de (108)
-- ============================================================

do $rb$
begin
  if to_regprocedure('public.reporte_satisfaccion_de(uuid, date, date)') is not null then
    execute $fn$
create or replace function public.reporte_satisfaccion_de(p_user uuid, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_version  constant text := 'reportes-2026-10-06';
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_minimo   integer := public.parametro_entero('csat_muestra_minima', 5);
  v_umbrales integer[];
  v_jefe     boolean;
  v_nombre   text;
  v_result   jsonb;
begin
  if not public.puede(p_user, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if (p_desde is null) <> (p_hasta is null) then
    raise exception 'Indique las dos fechas del período o ninguna (todo el historial).';
  end if;
  if p_desde is not null then
    perform public.reporte_validar_periodo(p_desde, p_hasta);
  end if;
  v_jefe := public.puede(p_user, 'rol:jefe');
  select s.nombre into v_nombre from public.staff s where s.user_id = p_user;
  v_umbrales := array[
    public.parametro_entero('satisfaccion_conforme_pct', 80),
    public.parametro_entero('satisfaccion_regular_pct', 60),
    public.parametro_entero('satisfaccion_minimo_persona', 3)];

  with b as (
    -- Tickets con resolución vigente en el período (o todos): la misma regla
    -- que «Resuelto en el período» del reporte de Tickets.
    select h.*,
           case when coalesce(s.tecnico_mesa, false) then h.tecnico_resolvio_id end as grupo_id,
           case when coalesce(h.vinculado, false) then h.empleado_id end            as solicitante_id
      from public.v_ticket_hechos h
      left join public.staff s on s.user_id = h.tecnico_resolvio_id
     where h.resuelto_vigente
       and (p_desde is null or h.dia_resuelto between p_desde and p_hasta)
  ),
  resumen as (
    select count(*)::integer as tickets,
           count(*) filter (where encuesta_generada)::integer   as generadas,
           count(*) filter (where encuesta_respondida)::integer as respondidas,
           round(avg(encuesta_nivel)::numeric, 2)               as promedio,
           count(*) filter (where encuesta_nivel = 1)::integer as n1, count(*) filter (where encuesta_nivel = 2)::integer as n2,
           count(*) filter (where encuesta_nivel = 3)::integer as n3, count(*) filter (where encuesta_nivel = 4)::integer as n4,
           count(*) filter (where encuesta_nivel = 5)::integer as n5
      from b
  ),
  por_mes as (
    select date_trunc('month', dia_resuelto)::date as mes,
           count(*)::integer as tickets,
           count(*) filter (where encuesta_generada)::integer   as generadas,
           count(*) filter (where encuesta_respondida)::integer as respondidas,
           round(avg(encuesta_nivel)::numeric, 2)               as promedio,
           count(*) filter (where encuesta_nivel = 1)::integer as n1, count(*) filter (where encuesta_nivel = 2)::integer as n2,
           count(*) filter (where encuesta_nivel = 3)::integer as n3, count(*) filter (where encuesta_nivel = 4)::integer as n4,
           count(*) filter (where encuesta_nivel = 5)::integer as n5
      from b group by 1
  ),
  por_solicitante as (
    select solicitante_id,
           max(solicitante)        as nombre,
           case when solicitante_id is not null then max(area_obra_nombre) end as area,
           count(*)::integer as tickets,
           count(*) filter (where encuesta_generada)::integer   as generadas,
           count(*) filter (where encuesta_respondida)::integer as respondidas,
           round(avg(encuesta_nivel)::numeric, 2)               as promedio,
           count(*) filter (where encuesta_nivel = 1)::integer as n1, count(*) filter (where encuesta_nivel = 2)::integer as n2,
           count(*) filter (where encuesta_nivel = 3)::integer as n3, count(*) filter (where encuesta_nivel = 4)::integer as n4,
           count(*) filter (where encuesta_nivel = 5)::integer as n5
      from b group by solicitante_id
  ),
  por_grupo as (
    select grupo_id,
           count(*)::integer as tickets,
           count(*) filter (where encuesta_generada)::integer   as generadas,
           count(*) filter (where encuesta_respondida)::integer as respondidas,
           round(avg(encuesta_nivel)::numeric, 2)               as promedio,
           count(*) filter (where encuesta_nivel = 1)::integer as n1, count(*) filter (where encuesta_nivel = 2)::integer as n2,
           count(*) filter (where encuesta_nivel = 3)::integer as n3, count(*) filter (where encuesta_nivel = 4)::integer as n4,
           count(*) filter (where encuesta_nivel = 5)::integer as n5
      from b group by grupo_id
  ),
  -- Cada técnico de mesa activo (aunque no tenga tickets) y un marcado ya
  -- inactivo con tickets; el resto, «Jefatura y otros» si tiene algo.
  por_tecnico as (
    select 1 as orden, 'tecnico' as grupo,
           coalesce(m.user_id, g.grupo_id) as tecnico_id, coalesce(m.nombre, sx.nombre) as nombre,
           coalesce(g.tickets, 0) as tickets, coalesce(g.generadas, 0) as generadas, coalesce(g.respondidas, 0) as respondidas,
           g.promedio, coalesce(g.n1, 0) as n1, coalesce(g.n2, 0) as n2, coalesce(g.n3, 0) as n3,
           coalesce(g.n4, 0) as n4, coalesce(g.n5, 0) as n5
      from (select s.user_id, s.nombre from public.staff s where s.tecnico_mesa and s.activo) m
      full join (select * from por_grupo where grupo_id is not null) g on g.grupo_id = m.user_id
      left join public.staff sx on sx.user_id = g.grupo_id
    union all
    select 2, 'otros', null::uuid, null::text, g.tickets, g.generadas, g.respondidas, g.promedio, g.n1, g.n2, g.n3, g.n4, g.n5
      from por_grupo g where g.grupo_id is null
  )
  select jsonb_build_object(
    'generado_en',          now(),
    'generado_por',         jsonb_build_object('user_id', p_user, 'nombre', v_nombre),
    'definiciones_version', c_version,
    'periodo', case when p_desde is null then null else jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta, 'dias', (p_hasta - p_desde + 1),
      'completo', p_hasta < v_hoy, 'en_curso', p_desde <= v_hoy and p_hasta >= v_hoy) end,
    'muestraMinima', v_minimo,
    'umbrales', jsonb_build_object('conformePct', v_umbrales[1], 'regularPct', v_umbrales[2], 'minimoPersona', v_umbrales[3]),
    'resumen', (select public.satisfaccion_fila(tickets, generadas, respondidas, promedio, n1, n2, n3, n4, n5, v_minimo) from resumen),
    'porMes', coalesce((select jsonb_agg(jsonb_build_object('mes', mes)
                         || public.satisfaccion_fila(tickets, generadas, respondidas, promedio, n1, n2, n3, n4, n5, v_minimo)
                         order by mes desc) from por_mes), '[]'::jsonb),
    'porTecnico', case when v_jefe then coalesce((select jsonb_agg(
                         jsonb_build_object('grupo', grupo, 'tecnico_id', tecnico_id, 'nombre', nombre)
                         || public.satisfaccion_fila(tickets, generadas, respondidas, promedio, n1, n2, n3, n4, n5, v_minimo)
                         order by orden, tickets desc, nombre nulls last) from por_tecnico), '[]'::jsonb) end,
    'porSolicitante', coalesce((select jsonb_agg(
                         jsonb_build_object('empleado_id', solicitante_id, 'nombre', nombre, 'area', area)
                         || public.satisfaccion_fila(tickets, generadas, respondidas, promedio, n1, n2, n3, n4, n5, v_minimo, v_umbrales)
                         order by tickets desc, (solicitante_id is null), nombre) from por_solicitante), '[]'::jsonb),
    'respuestas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', encuesta_id, 'ticket_id', ticket_id, 'ticket_codigo', codigo, 'ticket_titulo', titulo,
        'empleado_id', empleado_id, 'solicitante', solicitante,
        'tecnico_id', case when v_jefe then tecnico_resolvio_id end,
        'nivel', encuesta_nivel, 'comentario', encuesta_comentario, 'fecha_envio', encuesta_respondida_at,
        'created_at', encuesta_generada_at, 'respondida', encuesta_respondida
      ) order by encuesta_generada_at desc) from b where encuesta_generada), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
$fn$;
    comment on function public.reporte_satisfaccion_de(uuid, date, date) is
      'Cuerpo de reporte_satisfaccion() para un usuario explícito (118). EXECUTE solo project_admin (pruebas sin sesión). Guard: módulo tickets (42501); por técnico y el técnico de cada respuesta, solo rol:jefe.';
  end if;
  -- Dos if: el and no corta, y el cast a regprocedure falla si la 108 ya no está.
  if to_regprocedure('public.dashboard_resumen_de(uuid)') is null then
    return;
  end if;
  if position('anulada_at' in pg_get_functiondef(to_regprocedure('public.dashboard_resumen_de(uuid)'))) > 0 then
    execute $fn$
create or replace function public.dashboard_resumen_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy      date  := (now() at time zone 'America/Lima')::date;
  v_uid      uuid  := p_user;
  v_errores  jsonb := '[]'::jsonb;

  v_p_tickets    boolean;
  v_p_empleados  boolean;
  v_p_correos    boolean;
  v_p_licencias  boolean;
  v_p_equipos    boolean;
  v_p_problemas  boolean;

  v_dias_lic     integer;
  v_dias_gar     integer;
  v_dias_viejo   integer;
  v_dias_acta    integer;

  v_kpis         jsonb;
  v_tickets      jsonb;
  v_rotaciones   jsonb;
  v_sin_pw       jsonb;
  v_sin_devolver jsonb;
  v_licencias    jsonb;
  v_garantias    jsonb;
  v_altas        jsonb;
  v_solicitudes  jsonb;
  v_problemas    jsonb;
  v_acciones     jsonb;
  v_recurrentes  jsonb;
  v_encuestas    integer;
  v_custodia     jsonb;
  v_actas        jsonb;
begin
  -- Guard único (099): staff activo, 42501 si no (también con p_user NULL, es
  -- decir, sin sesión). Se evalúa con puede() (estable) y no con exigir_permiso
  -- (volátil) porque esta función es STABLE.
  if not public.puede(p_user, 'staff:activo') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_p_tickets   := public.puede(p_user, 'modulo:tickets');
  v_p_empleados := public.puede(p_user, 'modulo:empleados');
  v_p_correos   := public.puede(p_user, 'modulo:correos');
  v_p_licencias := public.puede(p_user, 'modulo:licencias');
  v_p_equipos   := public.puede(p_user, 'modulo:equipos');
  v_p_problemas := public.puede(p_user, 'modulo:problemas');

  v_dias_lic   := public.parametro_entero('dias_por_vencer_licencia', 30);
  v_dias_gar   := public.parametro_entero('dias_por_vencer_garantia', 30);
  v_dias_viejo := public.parametro_entero('dias_ticket_viejo', 3);
  v_dias_acta  := public.parametro_entero('dias_acta_sin_adjuntar', 3);

  -- ── kpis (getEstadisticas): cada cifra exige el módulo de su tabla ──
  begin
    v_kpis := jsonb_build_object(
      'empleados_activos', case when v_p_empleados then
        (select count(*) from public.empleados where deleted_at is null and estado = 'Activo') end,
      'empleados_total', case when v_p_empleados then
        (select count(*) from public.empleados where deleted_at is null) end,
      'cuentas_asignadas', case when v_p_correos then
        (select count(*) from public.asignaciones_cuenta where fecha_fin is null) end,
      'correos_compartidos', case when v_p_correos then
        (select count(*) from public.cuentas where tipo_cuenta = 'compartida' and deleted_at is null) end,
      'cuentas_por_rotar', case when v_p_correos then
        (select count(*) from public.cuentas where requiere_rotacion = true and deleted_at is null) end,
      'licencias_por_vencer', case when v_p_licencias then
        (select count(*) from public.licencias
          where deleted_at is null and fecha_vencimiento <= v_hoy + v_dias_lic) end,
      'equipos_total', case when v_p_equipos then
        (select count(*) from public.equipos where deleted_at is null) end,
      'tickets_abiertos', case when v_p_tickets then
        (select count(*) from public.tickets where estado not in ('resuelto', 'cerrado', 'rechazado')) end
    );
  exception when others then
    v_errores := v_errores || jsonb_build_array('kpis');
    v_kpis := null;
    raise warning 'dashboard_resumen: la sección kpis falló (%): %', sqlstate, sqlerrm;
  end;

  -- ── tickets (pendientesTickets + misTickets) ──
  if v_p_tickets then
    begin
      with vig as (
        select id, codigo, titulo, created_at, asignado_a, vinculado, prioridad, estado,
               case prioridad
                 when 'baja' then 0 when 'media' then 1 when 'alta' then 2 when 'urgente' then 3
                 else -1
               end as rango
          from public.tickets
         where estado not in ('resuelto', 'cerrado', 'rechazado')
      )
      select jsonb_build_object(
        'sin_asignar', coalesce((
          select jsonb_agg(jsonb_build_object('ticket_id', v.id, 'codigo', v.codigo,
                                              'titulo', v.titulo, 'desde', v.created_at)
                           order by v.created_at, v.id)
            from vig v where v.asignado_a is null), '[]'::jsonb),
        -- vinculado is false explícito (un null no cuenta como "sin vincular")
        'sin_vincular', coalesce((
          select jsonb_agg(jsonb_build_object('ticket_id', v.id, 'codigo', v.codigo,
                                              'titulo', v.titulo, 'desde', v.created_at)
                           order by v.created_at, v.id)
            from vig v where v.vinculado is false), '[]'::jsonb),
        'viejos', coalesce((
          select jsonb_agg(jsonb_build_object('ticket_id', v.id, 'codigo', v.codigo,
                                              'titulo', v.titulo, 'desde', v.created_at)
                           order by v.created_at, v.id)
            from vig v
           where (v.created_at at time zone 'America/Lima')::date < v_hoy - v_dias_viejo), '[]'::jsonb),
        -- misTickets: prioridad más alta primero y, a igual prioridad, el más antiguo
        'mios', coalesce((
          select jsonb_agg(jsonb_build_object('id', m.id, 'codigo', m.codigo, 'titulo', m.titulo,
                                              'prioridad', m.prioridad, 'estado', m.estado,
                                              'created_at', m.created_at)
                           order by m.rango desc, m.created_at, m.id)
            from (select * from vig where asignado_a = v_uid
                   order by rango desc, created_at, id limit 5) m), '[]'::jsonb),
        'mios_total', (select count(*) from vig where asignado_a = v_uid),
        'vigentes',   (select count(*) from vig),
        -- Reservados: reloj de tickets (estado_tiempo_ticket, plan V2 / 105)
        'vencidos',   null,
        'por_vencer', null
      ) into v_tickets;
    exception when others then
      v_errores := v_errores || jsonb_build_array('tickets');
      v_tickets := null;
      raise warning 'dashboard_resumen: la sección tickets falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── rotaciones_pendientes (listPendientes.porRotar) ──
  if v_p_correos then
    begin
      select coalesce(jsonb_agg(x.item order by x.plataforma, x.usuario, x.id), '[]'::jsonb)
        into v_rotaciones
        from (
          select c.id, c.usuario, coalesce(p.nombre, '') as plataforma,
                 jsonb_build_object(
                   'cuenta_id', c.id, 'usuario', c.usuario,
                   'tipo_cuenta', coalesce(c.tipo_cuenta, 'personal'),
                   'plataforma', coalesce(p.nombre, ''),
                   'titulares', coalesce((
                     select jsonb_agg(jsonb_build_object('id', a.empleado_id,
                                                         'nombre', btrim(e.nombres || ' ' || e.apellidos))
                                      order by a.fecha_inicio, a.id)
                       from public.asignaciones_cuenta a
                       join public.empleados e on e.id = a.empleado_id
                      where a.cuenta_id = c.id and a.fecha_fin is null), '[]'::jsonb)
                 ) as item
            from public.cuentas c
            left join public.plataformas p on p.id = c.plataforma_id
           where c.requiere_rotacion = true and c.deleted_at is null
        ) x;
    exception when others then
      v_errores := v_errores || jsonb_build_array('rotaciones_pendientes');
      v_rotaciones := null;
      raise warning 'dashboard_resumen: la sección rotaciones_pendientes falló (%): %', sqlstate, sqlerrm;
    end;

    -- ── cuentas_sin_password (listPendientes.sinPassword) ──
    begin
      select coalesce(jsonb_agg(x.item order by x.plataforma, x.usuario, x.id), '[]'::jsonb)
        into v_sin_pw
        from (
          select c.id, c.usuario, coalesce(p.nombre, '') as plataforma,
                 jsonb_build_object(
                   'cuenta_id', c.id, 'usuario', c.usuario,
                   'tipo_cuenta', coalesce(c.tipo_cuenta, 'personal'),
                   'plataforma', coalesce(p.nombre, ''),
                   'titulares', coalesce((
                     select jsonb_agg(jsonb_build_object('id', a.empleado_id,
                                                         'nombre', btrim(e.nombres || ' ' || e.apellidos))
                                      order by a.fecha_inicio, a.id)
                       from public.asignaciones_cuenta a
                       join public.empleados e on e.id = a.empleado_id
                      where a.cuenta_id = c.id and a.fecha_fin is null), '[]'::jsonb)
                 ) as item
            from public.cuentas c
            left join public.plataformas p on p.id = c.plataforma_id
           where c.password is null and c.deleted_at is null
        ) x;
    exception when others then
      v_errores := v_errores || jsonb_build_array('cuentas_sin_password');
      v_sin_pw := null;
      raise warning 'dashboard_resumen: la sección cuentas_sin_password falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── solicitudes_abiertas (108) y altas_incompletas derivadas ──
  -- Solicitudes de servicio ABIERTAS con su avance: pasos_hechos cuenta los
  -- pasos resueltos (hechos u omitidos) sobre pasos_total; `siguiente` es el
  -- primer paso pendiente. Reemplaza la heurística de cliente
  -- (altasIncompletas / DIAS_VENTANA_ALTA). `altas_incompletas` conserva la
  -- forma de la 103 pero sale de las solicitudes de ALTA abiertas de personas
  -- Activas; `faltan` son las claves de los pasos OBLIGATORIOS pendientes.
  -- Solo con el módulo empleados (la RLS de solicitudes lo exige).
  if v_p_empleados then
    begin
      select coalesce(jsonb_agg(x.item order by x.created_at, x.id), '[]'::jsonb)
        into v_solicitudes
        from (
          select s.id, s.created_at,
                 jsonb_build_object(
                   'solicitud_id', s.id, 'codigo', s.codigo,
                   'tipo_id', s.tipo_id, 'tipo', t.nombre,
                   'empleado_id', e.id,
                   'empleado', btrim(e.nombres || ' ' || e.apellidos),
                   'cargo', coalesce(e.cargo, ''),
                   'creada_at', s.created_at,
                   'dias', v_hoy - (s.created_at at time zone 'America/Lima')::date,
                   'pasos_total', (select count(*) from public.solicitud_pasos p where p.solicitud_id = s.id),
                   'pasos_hechos', (select count(*) from public.solicitud_pasos p where p.solicitud_id = s.id and p.estado <> 'pendiente'),
                   'siguiente', (select p.label from public.solicitud_pasos p
                                  where p.solicitud_id = s.id and p.estado = 'pendiente'
                                  order by p.orden, p.label, p.id limit 1),
                   'siguiente_modulo', (select p.modulo from public.solicitud_pasos p
                                         where p.solicitud_id = s.id and p.estado = 'pendiente'
                                         order by p.orden, p.label, p.id limit 1)
                 ) as item
            from public.solicitudes s
            join public.solicitud_tipos t on t.id = s.tipo_id
            join public.empleados e on e.id = s.empleado_id
           where s.estado = 'abierta'
        ) x;
    exception when others then
      v_errores := v_errores || jsonb_build_array('solicitudes_abiertas');
      v_solicitudes := null;
      raise warning 'dashboard_resumen: la sección solicitudes_abiertas falló (%): %', sqlstate, sqlerrm;
    end;

    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'empleado_id', e.id,
               'nombre', btrim(e.nombres || ' ' || e.apellidos),
               'cargo', coalesce(e.cargo, ''),
               'fecha_alta', e.fecha_alta,
               'dias', v_hoy - e.fecha_alta,
               'faltan', coalesce((select jsonb_agg(p.clave order by p.orden)
                                     from public.solicitud_pasos p
                                    where p.solicitud_id = s.id and p.estado = 'pendiente' and p.obligatorio),
                                  '[]'::jsonb))
             order by e.fecha_alta, e.id), '[]'::jsonb)
        into v_altas
        from public.solicitudes s
        join public.empleados e on e.id = s.empleado_id
       where s.estado = 'abierta'
         and s.tipo_id = 'alta_empleado'
         and e.estado = 'Activo'
         and e.deleted_at is null;
    exception when others then
      v_errores := v_errores || jsonb_build_array('altas_incompletas');
      v_altas := null;
      raise warning 'dashboard_resumen: la sección altas_incompletas falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── licencias_por_vencer (listPendientes.licenciasPorVencer) ──
  -- Incluye las YA vencidas (fecha <= hoy + N); las perpetuas (sin fecha) no.
  if v_p_licencias then
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'licencia_id', l.id, 'software', l.software, 'cantidad', l.cantidad,
               'fecha_vencimiento', l.fecha_vencimiento,
               'empresa', coalesce(emp.nombre, ''),
               'vencida', l.fecha_vencimiento < v_hoy)
             order by l.fecha_vencimiento, l.id), '[]'::jsonb)
        into v_licencias
        from public.licencias l
        left join public.empresas emp on emp.id = l.empresa_id
       where l.deleted_at is null
         and l.fecha_vencimiento <= v_hoy + v_dias_lic;
    exception when others then
      v_errores := v_errores || jsonb_build_array('licencias_por_vencer');
      v_licencias := null;
      raise warning 'dashboard_resumen: la sección licencias_por_vencer falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── equipos: sin devolver, garantías, custodia de hoy y actas pendientes ──
  if v_p_equipos then
    -- equiposSinDevolver: asignación activa a un empleado dado de baja.
    -- empleado_baja_at = empleados.updated_at del empleado Inactivo: es una
    -- APROXIMACIÓN de la fecha de baja (cualquier edición posterior de la ficha
    -- la mueve) porque en esta migración no está garantizado que exista el
    -- evento 'baja_ejecutada' de empleado_eventos (102). Con la 102 aplicada
    -- conviene reemplazarla por el max(created_at) de ese evento.
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'asignacion_id', a.id, 'codigo', q.codigo,
               'equipo', btrim(coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')),
               'empleado', btrim(e.nombres || ' ' || e.apellidos),
               'empleado_id', e.id,
               'desde', a.fecha_inicio,
               'empleado_baja_at', e.updated_at)
             order by a.fecha_inicio, a.id), '[]'::jsonb)
        into v_sin_devolver
        from public.asignaciones_equipo a
        join public.equipos q on q.id = a.equipo_id and q.deleted_at is null
        join public.empleados e on e.id = a.empleado_id and e.estado = 'Inactivo'
       where a.fecha_fin is null;
    exception when others then
      v_errores := v_errores || jsonb_build_array('equipos_sin_devolver');
      v_sin_devolver := null;
      raise warning 'dashboard_resumen: la sección equipos_sin_devolver falló (%): %', sqlstate, sqlerrm;
    end;

    -- garantiasPorVencer: solo equipos operativos o en reparación
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'equipo_id', q.id, 'codigo', q.codigo,
               'equipo', btrim(coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')),
               'garantia_hasta', q.garantia_hasta,
               'vencida', q.garantia_hasta < v_hoy)
             order by q.garantia_hasta, q.id), '[]'::jsonb)
        into v_garantias
        from public.equipos q
       where q.deleted_at is null
         and q.estado in ('operativo', 'en_reparacion')
         and q.garantia_hasta <= v_hoy + v_dias_gar;
    exception when others then
      v_errores := v_errores || jsonb_build_array('garantias_por_vencer');
      v_garantias := null;
      raise warning 'dashboard_resumen: la sección garantias_por_vencer falló (%): %', sqlstate, sqlerrm;
    end;

    -- custodia_hoy: entregas y devoluciones de equipos A PERSONAS hechas hoy
    -- (hora de Lima). Se arma desde asignaciones_equipo (no desde
    -- eventos_equipo) porque los eventos 'asignado'/'devuelto' también se
    -- emiten al mover a una ubicación y no dicen a quién. La hora de una
    -- devolución sale del evento 'devuelto' de hoy (puede faltar: hora null).
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'hora', to_char(u.ts at time zone 'America/Lima', 'HH24:MI'),
               'ocurrido_at', u.ts,
               'evento', u.evento,
               'equipo_id', u.equipo_id,
               'equipo_codigo', u.codigo,
               'equipo_descripcion', u.descr,
               'persona', u.persona)
             order by u.ts desc nulls last), '[]'::jsonb)
        into v_custodia
        from (
          select x.* from (
            select a.created_at as ts, 'entregado'::text as evento, q.id as equipo_id, q.codigo,
                   btrim(coalesce(t.nombre, '') || ' ' || coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')) as descr,
                   btrim(e.nombres || ' ' || e.apellidos) as persona
              from public.asignaciones_equipo a
              join public.equipos q on q.id = a.equipo_id
              join public.empleados e on e.id = a.empleado_id
              left join public.tipos_equipo t on t.id = q.tipo_id
             where (a.created_at at time zone 'America/Lima')::date = v_hoy
            union all
            select (select max(ev.created_at) from public.eventos_equipo ev
                     where ev.equipo_id = a.equipo_id and ev.evento = 'devuelto'
                       and (ev.created_at at time zone 'America/Lima')::date = v_hoy) as ts,
                   'devuelto'::text, q.id, q.codigo,
                   btrim(coalesce(t.nombre, '') || ' ' || coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')),
                   btrim(e.nombres || ' ' || e.apellidos)
              from public.asignaciones_equipo a
              join public.equipos q on q.id = a.equipo_id
              join public.empleados e on e.id = a.empleado_id
              left join public.tipos_equipo t on t.id = q.tipo_id
             where a.fecha_fin = v_hoy
          ) x
          order by x.ts desc nulls last
          limit 10
        ) u;
    exception when others then
      v_errores := v_errores || jsonb_build_array('custodia_hoy');
      v_custodia := null;
      raise warning 'dashboard_resumen: la sección custodia_hoy falló (%): %', sqlstate, sqlerrm;
    end;

    -- actas_pendientes: vista de la migración 110. Si todavía no existe
    -- (undefined_table) la sección queda en null SIN registrar error.
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'asignacion_id', ap.asignacion_id, 'equipo_id', ap.equipo_id,
               'equipo_codigo', ap.equipo_codigo, 'equipo_descripcion', ap.equipo_descripcion,
               'empleado_id', ap.empleado_id, 'empleado', ap.empleado,
               'fecha_inicio', ap.fecha_inicio, 'dias', ap.dias)
             order by ap.fecha_inicio, ap.asignacion_id), '[]'::jsonb)
        into v_actas
        from public.v_actas_pendientes ap
       where ap.activa;
    exception
      when undefined_table then
        v_actas := null;
      when others then
        v_errores := v_errores || jsonb_build_array('actas_pendientes');
        v_actas := null;
        raise warning 'dashboard_resumen: la sección actas_pendientes falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── problemas (pendientesProblemas) ──
  -- recurrentes mira tickets: exige además el módulo tickets (como la RLS
  -- de tickets lo exigiría al cliente); sin él queda en null.
  if v_p_problemas then
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'accion_id', ac.id, 'descripcion', ac.descripcion,
               'fecha_limite', ac.fecha_limite, 'problema_id', ac.problema_id,
               'problema_titulo', coalesce(pr.titulo, ''))
             order by ac.fecha_limite, ac.id), '[]'::jsonb)
        into v_acciones
        from public.acciones_correctivas ac
        left join public.problemas pr on pr.id = ac.problema_id
       where ac.estado in ('pendiente', 'en_progreso')
         and ac.deleted_at is null
         and ac.fecha_limite < v_hoy;

      v_recurrentes := null;
      if v_p_tickets then
        select coalesce(jsonb_agg(jsonb_build_object(
                 'categoria_id', r.categoria_id, 'categoria_nombre', r.categoria_nombre,
                 'total', r.total, 'tickets', r.tickets)
               order by r.total desc, r.categoria_id), '[]'::jsonb)
          into v_recurrentes
          from public.v_categorias_recurrentes r;
      end if;

      v_problemas := jsonb_build_object('acciones_vencidas', v_acciones, 'recurrentes', v_recurrentes);
    exception when others then
      v_errores := v_errores || jsonb_build_array('problemas');
      v_problemas := null;
      raise warning 'dashboard_resumen: la sección problemas falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── encuestas_sin_responder: ticket_satisfaccion sin fecha_envio ──
  -- (fecha_envio NULL = la encuesta salió y el empleado no respondió; 016)
  if v_p_tickets then
    begin
      select count(*) into v_encuestas
        from public.ticket_satisfaccion
       where fecha_envio is null;
    exception when others then
      v_errores := v_errores || jsonb_build_array('encuestas_sin_responder');
      v_encuestas := null;
      raise warning 'dashboard_resumen: la sección encuestas_sin_responder falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'generado_en',              now(),
    'kpis',                     v_kpis,
    'tickets',                  v_tickets,
    'rotaciones_pendientes',    v_rotaciones,
    'cuentas_sin_password',     v_sin_pw,
    'equipos_sin_devolver',     v_sin_devolver,
    'licencias_por_vencer',     v_licencias,
    'garantias_por_vencer',     v_garantias,
    'altas_incompletas',        v_altas,
    'problemas',                v_problemas,
    'encuestas_sin_responder',  v_encuestas,
    'custodia_hoy',             v_custodia,
    'actas_pendientes',         v_actas,
    'solicitudes_abiertas',     v_solicitudes,
    'errores',                  v_errores
  );
end;
$$;
$fn$;
  end if;
end $rb$;

-- ============================================================
-- FIN DEL ROLLBACK 120
-- ============================================================
