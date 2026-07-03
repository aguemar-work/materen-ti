-- ============================================================
-- MIGRACIÓN 014 — Equipos asignables a ubicaciones
-- Depende de: 013
-- 1. Catálogo ubicaciones (genérico: almacenes, áreas, sedes...)
-- 2. asignaciones_equipo acepta empleado O ubicación (exactamente uno)
--
-- Reglas:
--   - Un equipo operativo está con una persona, en una ubicación,
--     o "disponible" (sin asignación).
--   - Mover entre ubicaciones es libre (la app cierra y abre).
--   - Si lo tiene una PERSONA, se exige devolución explícita antes
--     de moverlo o reasignarlo (la responsabilidad no se transfiere sola).
-- ============================================================

create table if not exists public.ubicaciones (
  id           uuid        primary key default gen_random_uuid(),
  nombre       text        not null,
  descripcion  text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.ubicaciones is
  'Lugares genéricos donde puede estar un equipo: almacenes, áreas, sedes, obras...';

create or replace trigger trg_ubicaciones_updated_at
  before update on public.ubicaciones
  for each row execute function set_updated_at();

insert into public.ubicaciones (nombre, descripcion)
select v.nombre, v.descripcion
from (values
  ('Almacén de TI', 'Equipos en custodia del área de TI'),
  ('Almacén general', 'Almacén general de la empresa')
) as v(nombre, descripcion)
where not exists (select 1 from public.ubicaciones u where u.nombre = v.nombre);

-- asignaciones_equipo: destino persona O ubicación
alter table public.asignaciones_equipo
  alter column empleado_id drop not null;

alter table public.asignaciones_equipo
  add column if not exists ubicacion_id uuid references public.ubicaciones(id) on delete restrict;

alter table public.asignaciones_equipo
  drop constraint if exists chk_asig_equipo_destino;

alter table public.asignaciones_equipo
  add constraint chk_asig_equipo_destino check (
    (empleado_id is not null and ubicacion_id is null) or
    (empleado_id is null and ubicacion_id is not null)
  );

create index if not exists idx_asig_equipo_ubicacion
  on public.asignaciones_equipo (ubicacion_id)
  where fecha_fin is null;

-- RLS ubicaciones (staff opera, JEFE elimina)
alter table public.ubicaciones enable row level security;
create policy "staff puede ver ubicaciones"
  on public.ubicaciones for select using (public.es_staff());
create policy "staff puede crear ubicaciones"
  on public.ubicaciones for insert with check (public.es_staff());
create policy "staff puede editar ubicaciones"
  on public.ubicaciones for update using (public.es_staff());
create policy "solo jefe puede eliminar ubicaciones"
  on public.ubicaciones for delete using (public.es_jefe());

-- Actualizar el trigger de eventos: ahora el destino puede ser una ubicación
create or replace function public.evento_asignacion_equipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino text;
begin
  if new.empleado_id is not null then
    select nombres || ' ' || apellidos into v_destino
    from public.empleados where id = new.empleado_id;
  else
    select nombre into v_destino
    from public.ubicaciones where id = new.ubicacion_id;
  end if;

  if tg_op = 'INSERT' then
    if new.empleado_id is not null then
      perform public.log_evento_equipo(new.equipo_id, 'asignado',
        'Entregado a ' || coalesce(v_destino, '?') ||
        coalesce(' — ' || new.condicion_entrega, ''));
    else
      perform public.log_evento_equipo(new.equipo_id, 'asignado',
        'Ubicado en ' || coalesce(v_destino, '?'));
    end if;
  elsif tg_op = 'UPDATE' and old.fecha_fin is null and new.fecha_fin is not null then
    if new.empleado_id is not null then
      perform public.log_evento_equipo(new.equipo_id, 'devuelto',
        'Devuelto por ' || coalesce(v_destino, '?') ||
        coalesce(' — ' || new.condicion_devolucion, '') ||
        coalesce(' (' || new.motivo_cierre || ')', ''));
    else
      perform public.log_evento_equipo(new.equipo_id, 'devuelto',
        'Retirado de ' || coalesce(v_destino, '?') ||
        coalesce(' (' || new.motivo_cierre || ')', ''));
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- FIN DE MIGRACIÓN 014
-- ============================================================
