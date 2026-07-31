-- ============================================================
-- MIGRACIÓN 034 — Limpieza de tablas de prueba huérfanas
-- Depende de: ninguna (limpieza, no toca el modelo real)
-- test_probe, test_probe2 y test_probe3 quedaron en el esquema
-- de producción de alguna sesión de exploración manual: no
-- aparecen en ninguna migración versionada, no tienen referencia
-- en frontend/ ni functions/, y verificado (2026-07-31) que están
-- vacías (0 filas). Ver docs/PANORAMA_SISTEMA.md §7.
-- ============================================================

drop table if exists public.test_probe;
drop table if exists public.test_probe2;
drop table if exists public.test_probe3;

-- ============================================================
-- FIN DE MIGRACIÓN 034
-- ============================================================
