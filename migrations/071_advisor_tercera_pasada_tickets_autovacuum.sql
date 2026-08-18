-- ============================================================
-- Migración 071 — InsForge Backend Advisor, tercera pasada (2026-08-17)
-- ============================================================
-- Alcance: de los 23 hallazgos de la tercera corrida, 22 son repetición
-- exacta de BA-05/BA-06 (Ciclo 7, migración 063) — riesgo aceptado a
-- propósito, sin cambios (ver docs/HISTORIAL-AUDITORIAS.md, Ciclo 9).
--
-- Solo 1 es nuevo: la tabla `tickets` cruzó el umbral de 20% de tuplas
-- muertas (24%, 36 de 151) que no tenía en el Ciclo 6 (migración 062 solo
-- ajustó `entregas`/`eventos_equipo`/`asignaciones_cuenta`, que eran las 3
-- que superaban el umbral en esa corrida). Mismos valores que 062 usó ahí,
-- para no reinventar criterio de tuning.
-- ============================================================

alter table public.tickets set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- ============================================================
-- FIN DE MIGRACIÓN 071
-- Pendiente fuera de este archivo (no puede correr en una transacción):
--   VACUUM ANALYZE public.tickets;
-- ============================================================
