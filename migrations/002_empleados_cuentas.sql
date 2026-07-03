-- ============================================================
-- MIGRACIÓN 002 — Empleados y Cuentas
-- Depende de: 001_empresas_plataformas.sql
-- Tablas: empleados, cuentas
-- ============================================================


-- ============================================================
-- TIPO ENUM: estado_empleado
-- ============================================================
-- Por qué enum y no texto libre:
--   - Solo existen 3 estados posibles y están bien definidos
--   - La BD rechaza cualquier valor inválido automáticamente
--   - Evita errores de tipeo ("activo" vs "Activo" vs "ACTIVO")
--
-- Activo     → trabaja actualmente
-- Inactivo   → se fue de la empresa (softdelete lógico del estado)
-- Suspendido → accesos pausados por orden de gerencia, puede volver
-- ============================================================

create type estado_empleado as enum ('Activo', 'Inactivo', 'Suspendido');


-- ============================================================
-- TABLA: empleados
-- ============================================================

create table if not exists empleados (
  id                uuid            primary key default gen_random_uuid(),

  -- Identidad — obligatorios
  nombres           text            not null,
  apellidos         text            not null,

  -- DNI único: evita duplicar al mismo empleado
  -- Si la misma persona trabaja dos veces, se reactiva el registro
  dni               text            not null unique,

  -- Contacto — opcionales al registrar, whatsapp necesario para enviar accesos
  telefono          text,
  whatsapp          text,
  correo_personal   text,

  -- Datos laborales
  cargo             text,

  -- Relación con empresas: dropdown en el formulario
  -- on delete restrict: no se puede eliminar una empresa que tenga empleados
  empresa_id        uuid            not null references empresas(id) on delete restrict,

  -- Estado operativo con enum validado en BD
  estado            estado_empleado not null default 'Activo',

  -- Fecha de ingreso — default hoy si no se especifica
  fecha_alta        date            not null default current_date,

  -- Campo libre para observaciones (útil para casos especiales)
  notas             text,

  -- Softdelete: NULL = existe, fecha = eliminado lógicamente
  -- Al reactivar un empleado: deleted_at = NULL, estado = Activo
  deleted_at        timestamptz,

  created_at        timestamptz     not null default now(),
  updated_at        timestamptz     not null default now()
);

-- Índices para las búsquedas más frecuentes
create index if not exists idx_empleados_dni
  on empleados (dni)
  where deleted_at is null;

create index if not exists idx_empleados_empresa
  on empleados (empresa_id)
  where deleted_at is null;

create index if not exists idx_empleados_estado
  on empleados (estado)
  where deleted_at is null;

-- Búsqueda por nombre completo (nombres + apellidos juntos)
create index if not exists idx_empleados_nombre_busqueda
  on empleados (lower(nombres || ' ' || apellidos))
  where deleted_at is null;

comment on table empleados is
  'Personas de la empresa que se inventarían. No inician sesión en el sistema.';

comment on column empleados.dni is
  'Identificador único del empleado. Evita duplicados si la persona reingresa.';

comment on column empleados.estado is
  'Activo: trabaja. Inactivo: se fue. Suspendido: accesos pausados por gerencia.';

comment on column empleados.deleted_at is
  'Softdelete. NULL = existe. Con fecha = eliminado lógico. Para borrado físico esperar 6 meses.';

comment on column empleados.notas is
  'Observaciones internas del staff TI. No se muestra al empleado.';


-- Trigger updated_at (reutiliza la función creada en migración 001)
create or replace trigger trg_empleados_updated_at
  before update on empleados
  for each row execute function set_updated_at();


-- ============================================================
-- TABLA: cuentas
-- ============================================================
-- Cada fila = un acceso de un empleado a una plataforma
-- Un empleado puede tener N cuentas (una por plataforma)
-- ============================================================

create table if not exists cuentas (
  id              uuid        primary key default gen_random_uuid(),

  -- Relación con empleado
  -- on delete cascade: si se elimina físicamente un empleado, sus cuentas también
  -- (el softdelete de empleados no activa esto, solo el borrado físico real)
  empleado_id     uuid        not null references empleados(id) on delete cascade,

  -- Relación con catálogo de plataformas
  -- on delete restrict: no se puede eliminar una plataforma que tenga cuentas activas
  plataforma_id   text        not null references plataformas(id) on delete restrict,

  -- Credenciales
  usuario         text        not null,
  password        text,
  -- password puede quedar vacío al crear la cuenta;
  -- el cifrado se implementa en la fase de seguridad (migración futura)

  -- Campos extra útiles que Cursor había propuesto y tienen sentido
  url             text,
  -- URL de acceso a la plataforma (ej: https://miempresa.bitrix24.com)

  notas           text,
  -- Observaciones específicas de esta cuenta

  -- Softdelete de cuenta: se puede desactivar sin borrar
  -- Útil cuando el empleado está Suspendido (sus cuentas se desactivan)
  deleted_at      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índice principal: todas las cuentas de un empleado
create index if not exists idx_cuentas_empleado
  on cuentas (empleado_id)
  where deleted_at is null;

-- Índice para buscar qué empleados tienen cuenta en una plataforma
create index if not exists idx_cuentas_plataforma
  on cuentas (plataforma_id)
  where deleted_at is null;

-- Restricción: un empleado no puede tener dos cuentas en la misma plataforma
-- Si en el futuro se necesita (ej: dos cuentas de Gmail), se elimina esta restricción
create unique index if not exists uq_cuentas_empleado_plataforma
  on cuentas (empleado_id, plataforma_id)
  where deleted_at is null;

comment on table cuentas is
  'Credenciales de acceso de cada empleado a cada plataforma.';

comment on column cuentas.password is
  'Contraseña en texto por ahora. Cifrado se implementa en fase de seguridad.';

comment on column cuentas.deleted_at is
  'Softdelete de cuenta. Se activa cuando el empleado es Suspendido o la cuenta se revoca.';

comment on column cuentas.url is
  'URL de acceso a la plataforma. Útil para el mensaje de WhatsApp y el resumen.';

-- Trigger updated_at
create or replace trigger trg_cuentas_updated_at
  before update on cuentas
  for each row execute function set_updated_at();


-- ============================================================
-- FIN DE MIGRACIÓN 002
-- Siguiente: 003_staff_rls.sql
--   → tabla staff (quien inicia sesión)
--   → políticas RLS por rol (JEFE / ASISTENTE)
-- ============================================================