-- ============================================================
-- MIGRACIÓN 020 — Áreas/Obras asignables a empleados
-- Depende de: 002 (empleados), 003 (es_staff/es_jefe)
-- 1. Catálogo areas_obras (áreas administrativas y obras)
-- 2. empleados.area_obra_id (opcional)
--
-- Nota: la columna empleados.notas deja de usarse en la app
-- (decisión jul 2026) pero NO se elimina — conserva los datos
-- históricos ya escritos.
-- ============================================================

create table if not exists public.areas_obras (
  id           uuid        primary key default gen_random_uuid(),
  nombre       text        not null,
  descripcion  text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.areas_obras is
  'Áreas administrativas u obras a las que se asigna un empleado.';

create or replace trigger trg_areas_obras_updated_at
  before update on public.areas_obras
  for each row execute function set_updated_at();

alter table public.empleados
  add column if not exists area_obra_id uuid references public.areas_obras(id) on delete restrict;

create index if not exists idx_empleados_area_obra
  on public.empleados (area_obra_id);

-- RLS (staff opera, JEFE elimina) — mismo esquema que ubicaciones
alter table public.areas_obras enable row level security;
create policy "staff puede ver areas_obras"
  on public.areas_obras for select using (public.es_staff());
create policy "staff puede crear areas_obras"
  on public.areas_obras for insert with check (public.es_staff());
create policy "staff puede editar areas_obras"
  on public.areas_obras for update using (public.es_staff());
create policy "solo jefe puede eliminar areas_obras"
  on public.areas_obras for delete using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 020
-- ============================================================
