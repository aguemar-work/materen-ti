-- ============================================================
-- MIGRACIÓN 011 — Módulo de licencias de software
-- Depende de: 001..010
-- Tablas: licencias, asignaciones_licencia
--
-- Dos variantes de licencia (definidas con el JEFE):
--   Con login   → cuenta_id apunta al correo compartido que es el usuario
--                 de acceso. Si el software tiene contraseña propia
--                 (ej: AutoCAD usa el correo como usuario pero con su
--                 propia clave), va cifrada en `clave`; si clave es NULL,
--                 se entra con la contraseña del correo. Los usuarios son
--                 las asignaciones de esa cuenta y un trigger impide
--                 superar los asientos comprados (cantidad).
--   Sin login   → clave/serial cifrada en la propia licencia (enc2:, la
--                 revela la edge function con auditoría). Los usuarios van
--                 en asignaciones_licencia, con el mismo tope.
-- ============================================================


-- ------------------------------------------------------------
-- TABLA: licencias
-- ------------------------------------------------------------

create table if not exists public.licencias (
  id                 uuid        primary key default gen_random_uuid(),

  software           text        not null,
  -- 'suscripcion' vence y se renueva; 'perpetua' no vence
  tipo               text        not null default 'suscripcion'
    check (tipo in ('suscripcion', 'perpetua')),

  -- Asientos comprados (tope de usuarios simultáneos)
  cantidad           int         not null default 1 check (cantidad >= 1),

  -- Qué empresa del grupo la compró. NULL = licencia del grupo/corporativa
  empresa_id         uuid        references public.empresas(id) on delete restrict,

  proveedor          text,
  fecha_vencimiento  date,       -- NULL si es perpetua
  costo              numeric(12,2),
  moneda             varchar(3), -- 'PEN' | 'USD' ...

  -- Variante con login: el correo compartido que da acceso al software.
  -- on delete set null: si se elimina la cuenta, la licencia queda sin login.
  cuenta_id          uuid        references public.cuentas(id) on delete set null,

  -- Variante sin login: clave/serial de activación, cifrada con enc2:
  clave              text,

  notas              text,
  deleted_at         timestamptz,
  created_by         uuid        references auth.users(id) on delete set null,
  updated_by         uuid        references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_licencias_vencimiento
  on public.licencias (fecha_vencimiento)
  where deleted_at is null and fecha_vencimiento is not null;

create index if not exists idx_licencias_cuenta
  on public.licencias (cuenta_id)
  where deleted_at is null;

comment on table public.licencias is
  'Licencias de software compradas. Con login (cuenta_id) o con clave/serial (clave).';

comment on column public.licencias.cantidad is
  'Asientos comprados. Tope de asignaciones activas (de la cuenta vinculada o directas).';

comment on column public.licencias.clave is
  'Contraseña propia del software o clave/serial, cifrada con enc2:. En licencias con login, NULL = se entra con la contraseña del correo vinculado.';

create or replace trigger trg_licencias_updated_at
  before update on public.licencias
  for each row execute function set_updated_at();

create or replace trigger trg_licencias_by
  before insert or update on public.licencias
  for each row execute function public.set_created_updated_by();


-- ------------------------------------------------------------
-- TABLA: asignaciones_licencia (variante sin login)
-- ------------------------------------------------------------
-- Mismo patrón que asignaciones_cuenta: fecha_fin NULL = activa.
-- Historial: nunca se borra, se cierra.
-- ------------------------------------------------------------

create table if not exists public.asignaciones_licencia (
  id            uuid        primary key default gen_random_uuid(),
  licencia_id   uuid        not null references public.licencias(id) on delete cascade,
  empleado_id   uuid        not null references public.empleados(id) on delete cascade,
  fecha_inicio  date        not null default current_date,
  fecha_fin     date,
  notas         text,
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_asig_licencia_empleado
  on public.asignaciones_licencia (empleado_id)
  where fecha_fin is null;

create index if not exists idx_asig_licencia_licencia
  on public.asignaciones_licencia (licencia_id);

comment on table public.asignaciones_licencia is
  'Quién usa cada asiento de una licencia sin login. fecha_fin NULL = activa.';

create or replace trigger trg_asig_licencia_by
  before insert on public.asignaciones_licencia
  for each row execute function public.set_created_by_only();


-- ------------------------------------------------------------
-- TRIGGER: tope de asientos en asignaciones directas
-- ------------------------------------------------------------

create or replace function public.check_tope_licencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cantidad int;
  v_activas  int;
begin
  select cantidad into v_cantidad
  from public.licencias
  where id = new.licencia_id and deleted_at is null;

  if v_cantidad is null then
    raise exception 'La licencia no existe o está eliminada.';
  end if;

  select count(*) into v_activas
  from public.asignaciones_licencia
  where licencia_id = new.licencia_id and fecha_fin is null;

  if v_activas >= v_cantidad then
    raise exception
      'La licencia ya usa todos sus asientos (%). Libera uno antes de asignar.', v_cantidad;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_tope_licencia on public.asignaciones_licencia;

create trigger trg_check_tope_licencia
  before insert on public.asignaciones_licencia
  for each row execute function public.check_tope_licencia();


-- ------------------------------------------------------------
-- TRIGGER: tope de asientos en cuentas vinculadas a una licencia
-- ------------------------------------------------------------
-- Si un correo compartido es el login de una licencia, no se le pueden
-- asignar más personas que asientos comprados. Corre junto con el trigger
-- de exclusividad de reutilizables (008) sin conflicto.
-- ------------------------------------------------------------

create or replace function public.check_tope_licencia_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cantidad int;
  v_software text;
  v_activas  int;
begin
  select cantidad, software into v_cantidad, v_software
  from public.licencias
  where cuenta_id = new.cuenta_id and deleted_at is null
  limit 1;

  if v_cantidad is null then
    return new; -- la cuenta no es el login de ninguna licencia
  end if;

  select count(*) into v_activas
  from public.asignaciones_cuenta
  where cuenta_id = new.cuenta_id and fecha_fin is null;

  if v_activas >= v_cantidad then
    raise exception
      'La licencia "%" solo tiene % asiento(s). Libera uno antes de asignar a otra persona.',
      v_software, v_cantidad;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_tope_licencia_cuenta on public.asignaciones_cuenta;

create trigger trg_check_tope_licencia_cuenta
  before insert on public.asignaciones_cuenta
  for each row execute function public.check_tope_licencia_cuenta();


-- ------------------------------------------------------------
-- RLS — mismo esquema que el resto: staff opera, JEFE elimina
-- ------------------------------------------------------------

alter table public.licencias enable row level security;

create policy "staff puede ver licencias"
  on public.licencias for select using (public.es_staff());

create policy "staff puede crear licencias"
  on public.licencias for insert with check (public.es_staff());

create policy "staff puede editar licencias"
  on public.licencias for update using (public.es_staff());

create policy "solo jefe puede eliminar licencias"
  on public.licencias for delete using (public.es_jefe());

alter table public.asignaciones_licencia enable row level security;

create policy "staff puede ver asignaciones de licencia"
  on public.asignaciones_licencia for select using (public.es_staff());

create policy "staff puede crear asignaciones de licencia"
  on public.asignaciones_licencia for insert with check (public.es_staff());

create policy "staff puede cerrar asignaciones de licencia"
  on public.asignaciones_licencia for update using (public.es_staff());

create policy "solo jefe puede eliminar asignaciones de licencia"
  on public.asignaciones_licencia for delete using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 011
-- ============================================================
