-- ============================================================
-- MIGRACIÓN 021 — Trazabilidad en areas_obras
-- Depende de: 005 (set_created_updated_by), 020
-- Alinea el catálogo areas_obras con el patrón created_by/updated_by
-- del resto de catálogos operativos.
-- ============================================================

alter table public.areas_obras
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

drop trigger if exists trg_areas_obras_by on public.areas_obras;
create trigger trg_areas_obras_by
  before insert or update on public.areas_obras
  for each row execute function public.set_created_updated_by();

-- ============================================================
-- FIN DE MIGRACIÓN 021
-- ============================================================
