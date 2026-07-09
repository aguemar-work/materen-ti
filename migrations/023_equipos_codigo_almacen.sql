-- ============================================================
-- MIGRACIÓN 023 — Código de almacén en equipos (activos grandes)
-- Depende de: 013 (equipos), 022 (equipo_accesorios / catálogo)
--
-- Cada equipo (laptop, monitor, etc.) puede llevar el código que
-- usa el sistema de almacén. Es editable y opcional; no reemplaza
-- el código de inventario interno (equipos.codigo / EQ-####).
-- ============================================================

alter table public.equipos
  add column if not exists codigo_almacen text;

comment on column public.equipos.codigo_almacen is
  'Código del sistema de almacén (editable). Distinto del código de inventario interno.';

-- Único entre equipos vivos cuando está informado (permite varios NULL)
create unique index if not exists uq_equipos_codigo_almacen
  on public.equipos (upper(codigo_almacen))
  where codigo_almacen is not null and deleted_at is null;

create index if not exists idx_equipos_codigo_almacen
  on public.equipos (codigo_almacen)
  where deleted_at is null and codigo_almacen is not null;

-- ============================================================
-- FIN DE MIGRACIÓN 023
-- ============================================================
