-- ============================================================
-- MIGRACIÓN 085 — Disponibilidad de equipos derivada en servidor
-- Depende de: 013 (equipos, asignaciones_equipo)
--
-- Problema real: equiposApi.queryEquipos() resolvía el filtro
-- "disponible" trayendo a JS TODOS los equipo_id con asignación activa
-- (idsEquiposConAsignacionActiva()) y armando un filtro
-- `not.in.(uuid,uuid,...)` — con inventario suficiente, la URL supera el
-- límite de PostgREST y responde 414 URI Too Long.
--
-- Este archivo NO reintroduce lo que 013 prohibió ("Disponible/Asignado
-- NO se guarda: se deriva de la asignación activa"): esa regla existe
-- para que el cliente nunca escriba el valor a mano y quede desincronizado.
-- La columna que se agrega acá sigue siendo derivada — la escribe SOLO
-- un trigger, nunca el cliente — igual que updated_by/created_by
-- (set_created_updated_by, 013) o la hoja de vida de eventos_equipo. La
-- diferencia con "no se guarda" es que antes NADA se guardaba y se volvía
-- a calcular en cada consulta (bien, salvo por el límite de URL); ahora se
-- guarda el resultado de esa misma derivación, mantenido en cada escritura
-- relevante, para que PostgREST pueda filtrar por una columna real en vez
-- de una lista de IDs armada en el cliente.
-- ============================================================

alter table public.equipos
  add column if not exists tiene_asignacion_activa boolean not null default false;

comment on column public.equipos.tiene_asignacion_activa is
  'Derivado, mantenido solo por trigger (nunca por el cliente): existe una fila en asignaciones_equipo con equipo_id = este equipo y fecha_fin is null. Reemplaza el filtro not.in.(...) que causaba HTTP 414 en el listado de "disponible".';

create index if not exists idx_equipos_tiene_asignacion_activa
  on public.equipos (tiene_asignacion_activa)
  where deleted_at is null;

-- Backfill: recalcula sobre el estado real de asignaciones_equipo.
update public.equipos e
   set tiene_asignacion_activa = exists (
     select 1 from public.asignaciones_equipo a
     where a.equipo_id = e.id and a.fecha_fin is null
   );

-- ------------------------------------------------------------
-- Mantenimiento 1: cualquier escritura sobre equipos recalcula la
-- columna en vez de aceptar lo que mande el cliente — mismo patrón que
-- set_created_updated_by (013): un BEFORE trigger que sobreescribe,
-- no un permiso que bloquea.
-- ------------------------------------------------------------

create or replace function public.set_equipo_tiene_asignacion_activa()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.tiene_asignacion_activa := exists (
    select 1 from public.asignaciones_equipo
    where equipo_id = new.id and fecha_fin is null
  );
  return new;
end;
$$;

drop trigger if exists trg_equipos_tiene_asignacion_activa on public.equipos;
create trigger trg_equipos_tiene_asignacion_activa
  before insert or update on public.equipos
  for each row execute function public.set_equipo_tiene_asignacion_activa();

-- ------------------------------------------------------------
-- Mantenimiento 2: cualquier alta/cierre/edición de asignación empuja el
-- recálculo al equipo afectado (y al equipo anterior, en el caso raro de
-- que una fila de asignaciones_equipo cambie de equipo_id).
-- ------------------------------------------------------------

create or replace function public.sync_equipo_tiene_asignacion_activa()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_equipo_id uuid;
begin
  v_equipo_id := coalesce(new.equipo_id, old.equipo_id);

  update public.equipos
     set tiene_asignacion_activa = exists (
           select 1 from public.asignaciones_equipo
           where equipo_id = v_equipo_id and fecha_fin is null
         )
   where id = v_equipo_id;

  if tg_op = 'UPDATE' and old.equipo_id is distinct from new.equipo_id then
    update public.equipos
       set tiene_asignacion_activa = exists (
             select 1 from public.asignaciones_equipo
             where equipo_id = old.equipo_id and fecha_fin is null
           )
     where id = old.equipo_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_asig_equipo_sync_disponibilidad on public.asignaciones_equipo;
create trigger trg_asig_equipo_sync_disponibilidad
  after insert or update or delete on public.asignaciones_equipo
  for each row execute function public.sync_equipo_tiene_asignacion_activa();

-- ============================================================
-- FIN DE MIGRACIÓN 085
-- ============================================================
