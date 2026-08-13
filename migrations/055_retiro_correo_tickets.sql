-- ============================================================
-- MIGRACIÓN 055 — Retiro de la funcionalidad de correo en tickets
-- Depende de: 016 (ticket_eventos), 049 (notify_correo_fallido)
--
-- Decisión de producto: por el momento el sistema no debe enviar avisos
-- ni notificaciones por correo. Se retiró en functions/tickets.ts (1) el
-- correo de confirmación al crear un ticket y (2) la acción enviarEncuesta
-- (envío por correo del enlace de la encuesta de satisfacción, disparado
-- automático al cerrar). Ninguna de las dos rutas de código va a volver a
-- insertar el evento 'correo_fallido' en ticket_eventos, así que el
-- trigger que lo escuchaba para avisarle al staff queda huérfano.
--
-- Se elimina el trigger y su función (comportamiento muerto), NO el valor
-- 'correo_fallido' del check de ticket_eventos_evento_check ni
-- 'ticket_correo_fallido' del check de notificaciones_tipo_check: filas
-- históricas ya pudieron quedar grabadas con esos valores (el envío de
-- correo era best-effort y fallaba en el plan actual de InsForge, según
-- README.md) y un ALTER TABLE ... ADD CONSTRAINT que los excluya
-- revalida TODAS las filas existentes — se rompería la migración si
-- quedó una sola fila con ese valor. Los checks se dejan como están: solo
-- dejan de recibir inserts nuevos porque el código que los generaba ya
-- no existe.
-- ============================================================

drop trigger if exists trg_correo_fallido_notificacion on public.ticket_eventos;
drop function if exists public.notify_correo_fallido();

-- ============================================================
-- FIN DE MIGRACIÓN 055
-- ============================================================
