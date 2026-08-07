-- ============================================================
-- MIGRACIÓN 039 — Índice único: no duplicar cuentas/correos
-- Depende de: 002 (cuentas), 004 (quitó empleado_id y el único
-- índice único que existía, sin reemplazarlo)
--
-- Contexto: sin restricción alguna, el mismo usuario/correo se podía
-- registrar más de una vez en "cuentas" (personal, compartida o
-- reutilizable son filas independientes, cada una con su propia
-- contraseña y sus propias asignaciones). Se detectaron y limpiaron
-- 5 duplicados reales en producción (2026-08-07) antes de aplicar
-- esta migración. plataforma_id + lower(usuario) debe ser único
-- entre las cuentas activas (deleted_at IS NULL); una cuenta borrada
-- lógicamente no bloquea volver a registrar el mismo usuario.
-- ============================================================

create unique index if not exists uq_cuentas_usuario_plataforma
  on public.cuentas (plataforma_id, lower(usuario))
  where deleted_at is null;

comment on index public.uq_cuentas_usuario_plataforma is
  'Evita registrar el mismo usuario/correo dos veces en la misma plataforma mientras esté activo (deleted_at IS NULL).';

-- ============================================================
-- FIN DE MIGRACIÓN 039
-- ============================================================
