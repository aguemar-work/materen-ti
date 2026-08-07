-- ============================================================
-- MIGRACIÓN 042 — Pre-registro público de personal
-- Depende de: 003 (es_staff), patrón de 016/037 (tabla pública sin
-- policy de INSERT + tabla de rate-limit por IP)
--
-- Contexto: formulario público (sin sesión) donde un candidato/nuevo
-- ingreso llena DNI/nombres/apellidos/celular/correo personal ANTES de
-- existir como empleado. No crea nada en `empleados` — solo queda acá
-- para que TI lo revise y exporte. Mismo patrón que `tickets`: el
-- navegador nunca escribe directo (sin policy de INSERT), todo pasa por
-- la edge function "personal-registro" con el cliente admin.
-- ============================================================

create table if not exists public.personal_registros (
  id              uuid        primary key default gen_random_uuid(),
  dni             text        not null,
  nombres         text        not null,
  apellidos       text        not null,
  celular         text,
  correo_personal text,
  -- TI marca esto cuando ya usó el registro (ej. dio de alta al empleado).
  -- No hay vínculo automático a `empleados`: es solo una bandera manual.
  usado           boolean     not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_personal_registros_dni
  on public.personal_registros (dni);

create index if not exists idx_personal_registros_pendientes
  on public.personal_registros (created_at)
  where usado = false;

comment on table public.personal_registros is
  'Pre-registro público de personal (DNI/nombres/apellidos/celular/correo). No está vinculado a empleados; TI lo revisa y exporta a CSV.';

comment on column public.personal_registros.usado is
  'Bandera manual: TI la marca cuando ya usó este registro (ej. alta del empleado). Sin vínculo automático.';

alter table public.personal_registros enable row level security;

create policy "staff puede ver pre-registros de personal"
  on public.personal_registros for select
  using (public.es_staff());

-- Solo para marcar "usado" — sin policy de INSERT (ver contexto arriba).
create policy "staff puede marcar pre-registros como usados"
  on public.personal_registros for update
  using (public.es_staff());

-- ── Rate-limit por IP (mismo patrón que ticket_creacion_intentos, 037) ──
-- Cuenta tanto "buscarDni" como "crear": alternar entre acciones no debe
-- evadir el límite.
create table if not exists public.personal_registro_intentos (
  id          uuid        primary key default gen_random_uuid(),
  ip          text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_personal_registro_intentos_ip_fecha
  on public.personal_registro_intentos (ip, created_at);

comment on table public.personal_registro_intentos is
  'Registro de intentos (buscarDni + crear) por IP, para frenar el abuso del formulario público de pre-registro de personal. Solo la escribe/lee la edge function (cliente admin); RLS de solo lectura para JEFE.';

alter table public.personal_registro_intentos enable row level security;

create policy "jefe puede ver intentos de pre-registro de personal"
  on public.personal_registro_intentos for select
  using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 042
-- ============================================================
