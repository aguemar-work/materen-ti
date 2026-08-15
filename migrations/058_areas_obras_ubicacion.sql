-- ============================================================
-- MIGRACIÓN 058 — areas_obras se relaciona con ubicaciones
-- Depende de: 014 (ubicaciones), 020 (areas_obras)
-- 1. areas_obras.ubicacion_id (opcional): a qué ubicación física
--    pertenece el área/obra, para derivar la ubicación del
--    empleado automáticamente a partir de su área.
--
-- Nota: reutiliza el catálogo `ubicaciones` que ya usan los
-- equipos (no se crea un catálogo aparte para empleados).
-- Sin seed: no se puede inferir la ubicación de las áreas ya
-- existentes (áreas hoy genéricas, ej. "Almacén", pueden cubrir
-- más de una sede) — se completa a mano desde Configuración.
-- ============================================================

alter table public.areas_obras
  add column if not exists ubicacion_id uuid references public.ubicaciones(id) on delete restrict;

create index if not exists idx_areas_obras_ubicacion
  on public.areas_obras (ubicacion_id);

-- ============================================================
-- FIN DE MIGRACIÓN 058
-- ============================================================
