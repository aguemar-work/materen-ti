-- ============================================================
-- MIGRACIÓN 040 — licencias.tiene_clave (columna generada)
-- Depende de: 011 (licencias)
--
-- Contexto: el listado de licencias necesita saber si hay clave propia
-- por fila (LicenciasView.vue la usa para decidir el botón de revelado y
-- la etiqueta "propia"/"del correo"), pero el SELECT del listado traía la
-- columna `clave` completa (el ciphertext enc2:...) a cada carga de la
-- vista — rompiendo el patrón "nunca se trae password en el listado, se
-- revela bajo demanda" que sí respetan cuentas/correos/accesos_sensibles.
-- Columna generada: nunca hay que mantenerla a mano, se recalcula sola.
-- ============================================================

alter table public.licencias
  add column if not exists tiene_clave boolean generated always as (clave is not null) stored;

comment on column public.licencias.tiene_clave is
  'true si la licencia tiene clave propia cifrada. Generada, para no tener que traer la columna clave (ciphertext) en el listado.';

-- ============================================================
-- FIN DE MIGRACIÓN 040
-- ============================================================
