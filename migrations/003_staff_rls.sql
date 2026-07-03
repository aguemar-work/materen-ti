-- ============================================================
-- MIGRACIÓN 003 — Staff y RLS
-- Depende de: 001, 002
-- Tablas: staff
-- Funciones: es_jefe(), es_staff()
-- Políticas RLS en: empresas, plataformas, empleados, cuentas
-- ============================================================


-- ============================================================
-- TIPO ENUM: staff_rol
-- ============================================================
-- Solo dos roles posibles en el sistema:
--   JEFE      → acceso total (eliminar, exportar, gestionar staff)
--   ASISTENTE → acceso operativo (crear, editar, ver, WhatsApp)
-- ============================================================

create type staff_rol as enum ('JEFE', 'ASISTENTE');


-- ============================================================
-- TABLA: staff
-- ============================================================
-- Relación 1:1 con auth.users de InsForge.
-- Un usuario de auth puede o no tener fila en staff.
-- Si no tiene fila → no puede usar el sistema.
-- ============================================================

create table if not exists public.staff (

  -- Misma PK que auth.users (relación 1:1)
  -- on delete cascade: si se elimina el usuario del auth, se elimina del staff
  user_id     uuid        primary key references auth.users(id) on delete cascade,

  -- Nombre visible en el panel (puede ser distinto al email)
  nombre      text        not null,

  -- Rol de la aplicación — independiente de is_project_admin de InsForge
  rol         staff_rol   not null default 'ASISTENTE',

  -- Desactivar sin borrar: activo = false bloquea el acceso sin perder historial
  activo      boolean     not null default true,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Solo staff activo por rol (usado frecuentemente en RLS)
create index if not exists idx_staff_rol
  on public.staff (rol)
  where activo = true;

comment on table public.staff is
  'Personas que inician sesión en el panel TI. Vinculada 1:1 con auth.users.';

comment on column public.staff.user_id is
  'FK a auth.users(id). Es también la PK de esta tabla.';

comment on column public.staff.activo is
  'false = acceso bloqueado sin borrar el registro. El JEFE reactiva cuando quiera.';

comment on column public.staff.rol is
  'JEFE: acceso total. ASISTENTE: acceso operativo. Independiente de is_project_admin.';

-- Trigger updated_at
create or replace trigger trg_staff_updated_at
  before update on public.staff
  for each row execute function set_updated_at();


-- ============================================================
-- TRIGGER: auto-crear fila en staff al registrar usuario en auth
-- ============================================================
-- Cuando el JEFE crea un usuario en InsForge Auth,
-- se crea automáticamente su fila en staff como ASISTENTE.
-- El JEFE puede promoverlo a JEFE desde el panel después.
--
-- Nota: el sistema no tiene registro público.
-- Solo el JEFE crea usuarios desde el panel de InsForge.
-- ============================================================

create or replace function public.handle_new_staff_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (user_id, nombre, rol)
  values (
    new.id,
    -- Usa el nombre del profile si existe, sino el prefijo del email
    coalesce(new.profile->>'name', split_part(new.email, '@', 1)),
    'ASISTENTE'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created_staff
  after insert on auth.users
  for each row execute function public.handle_new_staff_user();


-- ============================================================
-- FUNCIONES HELPER PARA RLS
-- ============================================================
-- Se usan dentro de las políticas para no repetir lógica.
-- SECURITY DEFINER: corren con permisos del dueño, no del usuario.
-- STABLE: el resultado no cambia dentro de la misma transacción.
-- ============================================================

-- ¿El usuario logueado es JEFE activo?
create or replace function public.es_jefe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid()
      and rol = 'JEFE'
      and activo = true
  );
$$;

-- ¿El usuario logueado es staff activo (JEFE o ASISTENTE)?
create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid()
      and activo = true
  );
$$;

comment on function public.es_jefe() is
  'True si el usuario logueado es JEFE activo. Usado en políticas RLS.';

comment on function public.es_staff() is
  'True si el usuario logueado es staff activo (cualquier rol). Usado en políticas RLS.';


-- ============================================================
-- RLS — Row Level Security
-- ============================================================
-- Regla general:
--   SELECT / INSERT / UPDATE → cualquier staff activo
--   DELETE                   → solo JEFE
--
-- El softdelete (deleted_at) no es un DELETE real en SQL,
-- es un UPDATE, por eso lo puede hacer cualquier staff.
-- El DELETE físico (después de 6 meses) solo lo hace el JEFE.
-- ============================================================


-- ------------------------------------------------------------
-- RLS: empresas
-- ------------------------------------------------------------
alter table public.empresas enable row level security;

create policy "staff puede ver empresas"
  on public.empresas for select
  using (es_staff());

create policy "staff puede crear empresas"
  on public.empresas for insert
  with check (es_staff());

create policy "staff puede editar empresas"
  on public.empresas for update
  using (es_staff());

create policy "solo jefe puede eliminar empresas"
  on public.empresas for delete
  using (es_jefe());


-- ------------------------------------------------------------
-- RLS: plataformas
-- ------------------------------------------------------------
alter table public.plataformas enable row level security;

create policy "staff puede ver plataformas"
  on public.plataformas for select
  using (es_staff());

create policy "staff puede crear plataformas"
  on public.plataformas for insert
  with check (es_staff());

create policy "staff puede editar plataformas"
  on public.plataformas for update
  using (es_staff());

create policy "solo jefe puede eliminar plataformas"
  on public.plataformas for delete
  using (es_jefe());


-- ------------------------------------------------------------
-- RLS: empleados
-- ------------------------------------------------------------
alter table public.empleados enable row level security;

create policy "staff puede ver empleados"
  on public.empleados for select
  using (es_staff());

create policy "staff puede crear empleados"
  on public.empleados for insert
  with check (es_staff());

create policy "staff puede editar empleados"
  on public.empleados for update
  using (es_staff());

create policy "solo jefe puede eliminar empleados"
  on public.empleados for delete
  using (es_jefe());


-- ------------------------------------------------------------
-- RLS: cuentas
-- ------------------------------------------------------------
alter table public.cuentas enable row level security;

create policy "staff puede ver cuentas"
  on public.cuentas for select
  using (es_staff());

create policy "staff puede crear cuentas"
  on public.cuentas for insert
  with check (es_staff());

create policy "staff puede editar cuentas"
  on public.cuentas for update
  using (es_staff());

create policy "solo jefe puede eliminar cuentas"
  on public.cuentas for delete
  using (es_jefe());


-- ------------------------------------------------------------
-- RLS: staff (tabla especial — se gestiona a sí misma)
-- ------------------------------------------------------------
alter table public.staff enable row level security;

-- Cualquier staff puede verse a sí mismo
create policy "staff puede ver su propio registro"
  on public.staff for select
  using (user_id = auth.uid() or es_jefe());

-- Solo el JEFE puede crear, editar o eliminar staff
create policy "solo jefe puede crear staff"
  on public.staff for insert
  with check (es_jefe());

create policy "solo jefe puede editar staff"
  on public.staff for update
  using (es_jefe());

create policy "solo jefe puede eliminar staff"
  on public.staff for delete
  using (es_jefe());


-- ============================================================
-- FIN DE MIGRACIÓN 003
-- ============================================================
-- Estado final de la BD:
--   ✅ empresas       — catálogo de empresas
--   ✅ plataformas    — catálogo de sistemas
--   ✅ empleados      — personas inventariadas
--   ✅ cuentas        — credenciales por empleado
--   ✅ staff          — quién inicia sesión y con qué rol
--   ✅ RLS            — permisos JEFE / ASISTENTE en todas las tablas
--
-- Siguiente fase: frontend
--   → Login + detección de rol
--   → CRUD empleados + cuentas
-- ============================================================