-- ============================================================
-- MIGRACIÓN 012 — Periodo de renovación de licencias
-- Depende de: 011
-- Agrega renovacion_meses: cada cuánto se renueva la suscripción
-- (1 = mensual, 6 = semestral, 12 = anual, 24 = cada 2 años...).
-- NULL = sin periodo definido. Solo aplica a tipo 'suscripcion'.
-- El botón "Renovar" de la UI avanza fecha_vencimiento este número
-- de meses (repetido hasta quedar en el futuro si estaba vencida).
-- ============================================================

alter table public.licencias
  add column if not exists renovacion_meses int
    check (renovacion_meses is null or renovacion_meses > 0);

comment on column public.licencias.renovacion_meses is
  'Cada cuántos meses se renueva la suscripción (1, 3, 6, 12, 24...). NULL = sin definir.';

-- ============================================================
-- FIN DE MIGRACIÓN 012
-- ============================================================
