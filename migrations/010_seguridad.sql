-- ============================================================
-- MIGRACIÓN 010 — Bloque de seguridad
-- Depende de: 001..009
-- 1. accesos_log — auditoría: quién vio/copió/envió cada contraseña
-- 2. entregas    — enlaces de un solo uso para entregar accesos
--
-- Ambas tablas las escribe SOLO la edge function "credenciales"
-- (con el cliente admin). El staff no tiene política de INSERT:
-- así un ASISTENTE no puede fabricar ni borrar registros de auditoría.
-- ============================================================


-- ------------------------------------------------------------
-- TABLA: accesos_log
-- ------------------------------------------------------------
-- Se guardan snapshots de texto (email, usuario de la cuenta,
-- plataforma) para que el registro sobreviva aunque se elimine
-- el usuario, la cuenta o la plataforma. Una auditoría no debe
-- perder información por un DELETE posterior.
-- ------------------------------------------------------------

create table if not exists public.accesos_log (
  id              uuid        primary key default gen_random_uuid(),

  -- Quién (NULL cuando la acción es anónima, ej: apertura de entrega)
  user_id         uuid        references auth.users(id) on delete set null,
  user_email      text,

  -- Sobre qué cuenta
  cuenta_id       uuid        references public.cuentas(id) on delete set null,
  cuenta_usuario  text        not null,
  plataforma      text,

  -- Qué hizo
  accion          text        not null
    check (accion in ('ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta')),

  -- Contexto libre (ej: nombre del empleado receptor de una entrega)
  detalle         text,

  created_at      timestamptz not null default now()
);

create index if not exists idx_accesos_log_fecha
  on public.accesos_log (created_at desc);

create index if not exists idx_accesos_log_cuenta
  on public.accesos_log (cuenta_id);

comment on table public.accesos_log is
  'Auditoría de accesos a contraseñas. Solo escribe la edge function credenciales.';

alter table public.accesos_log enable row level security;

-- Solo el JEFE puede consultar la auditoría. Nadie (ni el JEFE) puede
-- insertarla/editarla/borrarla desde el cliente: no hay políticas para eso.
create policy "solo jefe puede ver auditoria"
  on public.accesos_log for select
  using (public.es_jefe());


-- ------------------------------------------------------------
-- TABLA: entregas
-- ------------------------------------------------------------
-- Un registro = un enlace de un solo uso con las credenciales
-- de un empleado. El contenido (payload) va cifrado con la clave
-- del servidor; ni siquiera leyendo la tabla se ven contraseñas.
--   viewed_at NULL y expires_at futuro → enlace vigente
--   viewed_at con fecha                → ya se abrió (autodestruido)
-- ------------------------------------------------------------

create table if not exists public.entregas (
  id               uuid        primary key default gen_random_uuid(),

  -- Token aleatorio que va en la URL (/entrega/<token>)
  token            text        not null unique,

  empleado_id      uuid        references public.empleados(id) on delete cascade,
  empleado_nombre  text        not null,

  -- JSON de credenciales cifrado con CRED_KEY_V2 (formato enc2:)
  payload          text        not null,

  expires_at       timestamptz not null,
  viewed_at        timestamptz,

  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_entregas_token
  on public.entregas (token)
  where viewed_at is null;

comment on table public.entregas is
  'Enlaces de un solo uso para entregar credenciales. Payload cifrado en servidor.';

alter table public.entregas enable row level security;

-- El staff puede ver el estado de las entregas (pendiente/abierta/expirada).
-- Crear, marcar como vista y demás lo hace solo la edge function (admin).
create policy "staff puede ver entregas"
  on public.entregas for select
  using (public.es_staff());

create policy "solo jefe puede eliminar entregas"
  on public.entregas for delete
  using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 010
-- ============================================================
