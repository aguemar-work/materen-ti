-- ============================================================
-- MIGRACIÓN 004 — Refactor Cuentas: modelo de asignaciones
-- Depende de: 001, 002, 003
-- Cambios:
--   - cuentas: elimina empleado_id, agrega es_compartida
--   - asignaciones_cuenta: nueva tabla de relación temporal
--   - Migra datos existentes sin pérdida
-- ============================================================


-- ============================================================
-- TABLA: asignaciones_cuenta
-- ============================================================
-- Se crea ANTES de quitar empleado_id para poder migrar datos.
--
-- Modela quién tiene asignada cada cuenta y en qué período:
--   fecha_fin NULL  → asignación activa hoy
--   fecha_fin fecha → asignación cerrada (revocada o traspasada)
--
-- es_compartida = false → máximo 1 asignación activa (personal o reutilizable)
-- es_compartida = true  → N asignaciones activas simultáneas (funcional compartida)
-- ============================================================

create table if not exists public.asignaciones_cuenta (
  id            uuid        primary key default gen_random_uuid(),

  -- on delete cascade: si se elimina físicamente la cuenta, se borra el historial
  cuenta_id     uuid        not null references public.cuentas(id) on delete cascade,

  -- on delete cascade: si se elimina físicamente el empleado, se borra su historial
  empleado_id   uuid        not null references public.empleados(id) on delete cascade,

  fecha_inicio  date        not null default current_date,
  fecha_fin     date,

  -- Observaciones del traspaso o revocación:
  -- ej: "baja de Alejandro Guevara", "contraseña rotada antes de reasignar"
  notas         text,

  created_at    timestamptz not null default now()
);

-- Índice principal: asignaciones activas de un empleado (consulta más frecuente)
create index if not exists idx_asignaciones_empleado_activas
  on public.asignaciones_cuenta (empleado_id)
  where fecha_fin is null;

-- Índice: historial completo de una cuenta (quién la tuvo)
create index if not exists idx_asignaciones_por_cuenta
  on public.asignaciones_cuenta (cuenta_id);

comment on table public.asignaciones_cuenta is
  'Historial de quién tiene o tuvo cada cuenta. fecha_fin NULL = asignación activa.';

comment on column public.asignaciones_cuenta.fecha_fin is
  'NULL = activa hoy. Con fecha = cerrada (revocada o traspasada a otro empleado).';

comment on column public.asignaciones_cuenta.notas is
  'Contexto del traspaso o revocación. Ej: "baja de Juan", "contraseña rotada".';


-- ============================================================
-- MIGRACIÓN DE DATOS
-- ============================================================
-- Cada cuenta existente tiene un empleado_id.
-- Se convierte en una asignación:
--   - activa si la cuenta no tiene deleted_at
--   - cerrada si la cuenta tiene deleted_at (fecha_fin = deleted_at)
-- ============================================================

insert into public.asignaciones_cuenta (
  cuenta_id,
  empleado_id,
  fecha_inicio,
  fecha_fin,
  created_at
)
select
  id                    as cuenta_id,
  empleado_id,
  created_at::date      as fecha_inicio,
  case
    when deleted_at is not null then deleted_at::date
    else null
  end                   as fecha_fin,
  created_at
from public.cuentas
where empleado_id is not null;


-- ============================================================
-- MODIFICAR TABLA cuentas
-- ============================================================

-- Agregar es_compartida
alter table public.cuentas
  add column if not exists es_compartida boolean not null default false;

comment on column public.cuentas.es_compartida is
  'false = una persona a la vez (personal o reutilizable). true = varios simultáneos.';

-- Eliminar índices que dependen de empleado_id
drop index if exists public.uq_cuentas_empleado_plataforma;
drop index if exists public.idx_cuentas_empleado;

-- Eliminar columna empleado_id (ya migrada a asignaciones_cuenta)
alter table public.cuentas drop column if exists empleado_id;


-- ============================================================
-- RLS: asignaciones_cuenta
-- ============================================================

alter table public.asignaciones_cuenta enable row level security;

create policy "staff puede ver asignaciones"
  on public.asignaciones_cuenta for select
  using (public.es_staff());

create policy "staff puede crear asignaciones"
  on public.asignaciones_cuenta for insert
  with check (public.es_staff());

-- UPDATE se usa para cerrar asignaciones (fecha_fin = hoy)
create policy "staff puede cerrar asignaciones"
  on public.asignaciones_cuenta for update
  using (public.es_staff());

-- DELETE físico solo para JEFE (limpieza de historial)
create policy "solo jefe puede eliminar asignaciones"
  on public.asignaciones_cuenta for delete
  using (public.es_jefe());


-- ============================================================
-- FIN DE MIGRACIÓN 004
-- Estado final:
--   cuentas              → sin empleado_id, con es_compartida
--   asignaciones_cuenta  → quién tuvo qué cuenta y cuándo
--
-- Flujos habilitados:
--   Cuenta personal      → 1 asignación activa a la vez
--   Cuenta compartida    → N asignaciones activas simultáneas
--   Traspaso             → cerrar asignación actual + abrir nueva
-- ============================================================
