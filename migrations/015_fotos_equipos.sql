-- ============================================================
-- MIGRACIÓN 015 — Fotos de equipos
-- Depende de: 013
-- Columna fotos en equipos: array de {url, key} apuntando al
-- bucket público "equipos-fotos". Las imágenes se comprimen en
-- el navegador (max 1280px, JPEG) antes de subir: ~200KB c/u.
-- ============================================================

alter table public.equipos
  add column if not exists fotos jsonb not null default '[]';

comment on column public.equipos.fotos is
  'Fotos del equipo: array de {url, key} en el bucket equipos-fotos. Comprimidas en cliente (~200KB c/u).';

-- ============================================================
-- FIN DE MIGRACIÓN 015
-- ============================================================
