-- ============================================================
-- ROLLBACK de la MIGRACIÓN 104 (tabla intentos_publicos)
-- Usar solo si la 104 causa un problema nuevo e inesperado; NO es parte del
-- flujo normal.
--
-- ⚠️ Orden: ANTES de aplicar este archivo hay que REDESPLEGAR las versiones
-- anteriores de las edge functions que escriben en intentos_publicos
-- (credenciales, tickets, equipos-fotos): una function que siga apuntando a la
-- tabla borrada falla cerrada (error_interno 500) en cada endpoint público con
-- rate-limit. Se pierde el contenido de la tabla (solo contadores de ventana
-- de unos minutos: sin valor histórico; los límites arrancan de cero).
-- Las tablas viejas (ticket_busqueda_intentos, ticket_creacion_intentos,
-- encuesta_respuesta_intentos) nunca se tocaron, así que no hay nada que
-- restaurar en ellas. Idempotente.
-- ============================================================

drop table if exists public.intentos_publicos;

-- ============================================================
-- FIN DEL ROLLBACK DE LA MIGRACIÓN 104
-- Después: borrar la fila '104' de public.schema_migrations si se registró.
-- ============================================================
