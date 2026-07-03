-- ============================================================
-- MIGRACIÓN 001 — Catálogos base
-- Tablas: empresas, plataformas
-- Estas dos tablas no dependen de nadie.
-- Todo lo demás (empleados, cuentas) depende de ellas.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensión UUID
-- Necesaria para generar IDs automáticos con gen_random_uuid()
-- InsForge la activa por defecto, pero la dejamos explícita
-- para que no falle si se aplica en otro entorno.
-- ------------------------------------------------------------
create extension if not exists "pgcrypto";


-- ============================================================
-- TABLA: empresas
-- ============================================================
-- Por qué tabla propia y no texto libre en empleados:
--   - El formulario de empleado mostrará un dropdown de empresas
--   - Evita errores de tipeo ("Acme S.A." vs "acme sa")
--   - Permite agregar más datos a la empresa en el futuro
--     (RUC, dirección, logo, etc.) sin tocar empleados
--   - Base para el futuro módulo multitenancy
-- ============================================================

create table if not exists empresas (
  id          uuid        primary key default gen_random_uuid(),

  -- Nombre visible en el dropdown y en el mensaje de WhatsApp
  nombre      text        not null,

  -- RUC opcional por ahora; útil para reportes y futura facturación
  ruc         text,

  -- Softdelete: si deleted_at tiene fecha, la empresa está desactivada
  -- y no aparece en los dropdowns (pero sus empleados siguen en la BD)
  deleted_at  timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Índice para búsqueda rápida por nombre
create index if not exists idx_empresas_nombre
  on empresas (nombre)
  where deleted_at is null;

-- Comentario en la tabla (visible en el panel de InsForge)
comment on table empresas is
  'Catálogo de empresas. Las activas (deleted_at IS NULL) aparecen en los formularios.';

comment on column empresas.deleted_at is
  'Softdelete: fecha de desactivación. NULL = activa.';


-- ============================================================
-- TABLA: plataformas
-- ============================================================
-- Catálogo de sistemas a los que se les asigna acceso.
-- Ejemplo: Bitrix24, Gmail, ERP, VPN, Active Directory...
--
-- Por qué tabla propia y no enum:
--   - El JEFE puede agregar nuevas plataformas desde el panel
--     sin necesidad de tocar código o BD manualmente
--   - Un enum requeriría una migración cada vez que se agrega
--     una plataforma nueva
-- ============================================================

create table if not exists plataformas (
  id          text        primary key,
  -- El id es texto legible (ej: 'bitrix24', 'gmail', 'erp')
  -- para que las queries sean autodescriptivas.
  -- Ej: WHERE plataforma_id = 'gmail' es más claro que = 3

  nombre      text        not null,
  -- Nombre visible en el formulario: "Bitrix24", "Gmail", "ERP"

  -- Ícono o categoría opcional para el futuro (no bloquea nada ahora)
  icono       text,
  -- Ejemplo: 'mail', 'vpn', 'erp' — para mostrar íconos en la UI

  deleted_at  timestamptz,
  -- Softdelete igual que empresas: desactivar sin borrar historial

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table plataformas is
  'Catálogo de plataformas/sistemas. Editable desde el panel por el JEFE.';

comment on column plataformas.id is
  'Slug legible: bitrix24, gmail, active_directory, erp, vpn, otro...';

comment on column plataformas.deleted_at is
  'Softdelete: fecha de desactivación. NULL = activa y visible en formularios.';


-- ============================================================
-- DATOS INICIALES — plataformas
-- ============================================================
-- Se insertan las plataformas más comunes para no arrancar vacío.
-- El JEFE puede agregar más desde el panel en cualquier momento.
-- ON CONFLICT DO NOTHING: si ya existen, no falla la migración.
-- ============================================================

insert into plataformas (id, nombre) values
  ('bitrix24',         'Bitrix24'),
  ('active_directory', 'Active Directory'),
  ('gmail',            'Gmail'),
  ('correo_corp',      'Correo corporativo'),
  ('microsoft_365',    'Microsoft 365'),
  ('vpn',              'VPN'),
  ('erp',              'ERP'),
  ('otro',             'Otro')
on conflict (id) do nothing;


-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- ============================================================
-- Cada vez que se edita una fila, updated_at se actualiza solo.
-- Se reutilizará en las próximas migraciones (empleados, cuentas).
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger para empresas
create or replace trigger trg_empresas_updated_at
  before update on empresas
  for each row execute function set_updated_at();

-- Trigger para plataformas
create or replace trigger trg_plataformas_updated_at
  before update on plataformas
  for each row execute function set_updated_at();


-- ============================================================
-- FIN DE MIGRACIÓN 001
-- Siguiente: 002_empleados_cuentas.sql
--   → empleados (depende de empresas)
--   → cuentas   (depende de empleados y plataformas)
-- ============================================================