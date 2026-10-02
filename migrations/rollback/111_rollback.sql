-- ============================================================
-- ROLLBACK de la MIGRACIÓN 111 (crear_ticket_publico y
-- adjuntar_captura_ticket). Usar solo si la 111 causa un problema nuevo e
-- inesperado; NO es parte del flujo normal.
--
-- ⚠️ Orden: ANTES de aplicar este archivo hay que redesplegar la versión
-- anterior de la edge function `tickets` (la que inserta en `tickets` y en
-- `ticket_eventos` directamente): con la function nueva y sin estas RPC, crear
-- un ticket falla con error_creando.
--
-- Lo que este rollback NO toca (a propósito):
--   - el bucket `tickets-adjuntos` ni sus objetos: si ya se volvió PRIVADO, la
--     versión anterior de la function guardaba la URL pública en
--     tickets.adjunto_url y esas capturas dejarían de abrirse; devolver el
--     bucket a público es un paso manual (panel de InsForge, Storage).
--   - los objetos ya movidos por scripts/migrar-adjuntos.mjs (siguen en
--     `tickets/<id>/…` y tickets.adjunto_key apunta a ellos; la function
--     anterior no los lee: con `adjunto_url` en NULL, el frontend anterior
--     simplemente no muestra la captura de esos tickets).
--   - las filas de `intentos_publicos` de los ámbitos tickets.crear y
--     tickets.crear.dni (contadores de ventana de 10 minutos: inocuos una vez
--     pasada la ventana; los purgará la retención de intentos_publicos).
-- Idempotente.
-- ============================================================

drop function if exists public.adjuntar_captura_ticket(uuid, text);
drop function if exists public.crear_ticket_publico(jsonb);

-- ============================================================
-- FIN DEL ROLLBACK DE LA MIGRACIÓN 111
-- Después: borrar la fila '111' de public.schema_migrations si se registró.
-- ============================================================
