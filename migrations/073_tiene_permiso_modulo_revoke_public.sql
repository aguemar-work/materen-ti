-- ============================================================
-- MIGRACIÓN 073 — Hardening de tiene_permiso_modulo() (hallazgo P0-05)
-- Depende de: 068 (crea tiene_permiso_modulo), 062/063 (mismo patrón de
--             hardening ya aplicado a las otras 17 funciones SECURITY
--             DEFINER del sistema)
--
-- tiene_permiso_modulo(text) (migración 068) quedó fuera de las dos
-- pasadas de hardening del advisor (062, 063) porque se creó DESPUÉS de
-- ambas — nunca se le aplicó el REVOKE/GRANT que sí tienen las otras 17
-- funciones SECURITY DEFINER. Confirmado en vivo (auditoría 2026-08-18,
-- ver docs/HISTORIAL-AUDITORIAS.md Ciclo 10/11): su `proacl` es `null`
-- (nunca tocado), así que conserva el default de Postgres — EXECUTE
-- abierto a PUBLIC, incluido `anon`. Mismo patrón exacto que 062/063, sin
-- lógica nueva: revoca de PUBLIC, otorga a `authenticated` (la propia RLS
-- de licencias/equipos/correos/tickets/problemas/kb_articulos/encuestas
-- la llama desde una sesión authenticated real — el GRANT no es
-- opcional: sin él, esos módulos quedarían sin acceso para todo
-- ASISTENTE).
--
-- No cambia la definición de la función, ninguna policy RLS, ni
-- functions/credenciales.ts (que duplica esta misma regla por su cuenta,
-- ver AGENTS.md). Cierra el hallazgo P0-05.
-- ============================================================

revoke execute on function public.tiene_permiso_modulo(text) from public;
grant execute on function public.tiene_permiso_modulo(text) to authenticated;

-- ============================================================
-- FIN DE MIGRACIÓN 073
-- ============================================================
