-- ============================================================
-- MIGRACIÓN 006 — tipo_cuenta: personal | reutilizable | compartida
-- Depende de: 001, 002, 003, 004
-- Reemplaza el boolean es_compartida con un enum de 3 valores:
--   personal     → cuenta creada para una persona específica
--   reutilizable → se hereda de usuario en usuario (uno a la vez)
--   compartida   → varios usuarios activos simultáneamente
-- ============================================================

alter table public.cuentas
  add column if not exists tipo_cuenta varchar(20)
    not null default 'personal'
    check (tipo_cuenta in ('personal', 'reutilizable', 'compartida'));

-- Migrar datos existentes
update public.cuentas
  set tipo_cuenta = 'compartida'
  where es_compartida = true;

-- Eliminar columna antigua (puede comentarse si se quiere mantener transicionalmente)
alter table public.cuentas
  drop column if exists es_compartida;

-- ============================================================
-- FIN DE MIGRACIÓN 006
-- ============================================================
