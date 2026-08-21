-- ============================================================
-- MIGRACIÓN 078 — notify_ticket_personal(): una sola notificación en el
-- cierre atómico (resuelto + cerrado), no dos
-- Depende de: 049 (notify_ticket_personal, notificaciones personales),
--             051 (cerrar_ticket, el RPC que hace los 2 UPDATE)
--
-- Contexto: decisión de producto (2026-08-21) de fusionar "Resuelto" y
-- "Cerrado" en una sola cosa que ve el staff — badges, filtro y textos
-- (ver docs/HISTORIAL-AUDITORIAS.md y frontend/src/core/dominio-tickets.js).
-- cerrar_ticket() (051) sigue haciendo 2 UPDATE reales (resuelto -> cerrado)
-- en una sola transacción de servidor, y cada UPDATE dispara
-- notify_ticket_personal() por separado (AFTER UPDATE, por fila) — el
-- técnico asignado recibía DOS notificaciones consecutivas por un solo
-- clic ("Tu ticket X cambió a Resuelto" y, un instante después, "... a
-- Cerrado"), exactamente la misma redundancia que ya se corrigió en la UI.
--
-- Fix: la notificación de cambio de estado ya no se dispara cuando el
-- destino es 'resuelto' — solo en el destino final real. El texto para
-- 'cerrado' pasa de "Cerrado" a "Resuelto", para no contradecir el badge
-- fusionado que el mismo técnico ve en la lista/detalle del ticket.
--
-- Asunción explícita (documentada, no forzada por constraint): hoy SOLO
-- cerrar_ticket() lleva un ticket a 'resuelto', siempre en la misma
-- transacción que el UPDATE a 'cerrado' (no hay ningún botón/RPC en el
-- frontend que deje un ticket parado en 'resuelto' — ver
-- ESTADOS_EN_CURSO en dominio-tickets.js y el comentario de la migración
-- 051). Si en el futuro se agrega un camino que sí lo deje ahí sin
-- cerrar, esa transición dejaría de notificar a nadie con este cambio —
-- revisar este trigger si eso llega a pasar.
--
-- Nota operativa (mismo gotcha que 049/051): aplicar con `db import`, NO
-- con `db query`/`scripts/apply-migration.mjs` (no soportan
-- dollar-quoting). Probado antes en un branch de InsForge (ver
-- CHANGELOG/HISTORIAL-AUDITORIAS): 1 sola notificación en el cierre
-- atómico, la de asignación sin cambios.
-- ============================================================

create or replace function public.notify_ticket_personal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.asignado_a is distinct from old.asignado_a
     and new.asignado_a is not null
     and new.asignado_a <> auth.uid() then
    perform public.crear_notificacion(
      'ticket_asignado',
      'ticket',
      new.id,
      'Te asignaron el ticket · ' || new.codigo || ' — ' || new.titulo,
      '/tickets/' || new.id,
      new.asignado_a
    );
  end if;

  -- El texto del estado abajo duplica intencionalmente HITO_LABELS de
  -- frontend/src/core/dominio-tickets.js (mismo criterio que 045: texto
  -- ya armado en el trigger, sin joins del lado del cliente). Si cambian
  -- las etiquetas en un lado, replicar en el otro. 'resuelto' se excluye
  -- a propósito (ver comentario de esta migración, 078): es el paso
  -- intermedio de cerrar_ticket(), nunca un destino final visible para
  -- el staff — la notificación real llega con el UPDATE a 'cerrado'.
  if new.estado is distinct from old.estado
     and new.estado <> 'resuelto'
     and new.asignado_a is not null
     and new.asignado_a <> auth.uid() then
    perform public.crear_notificacion(
      'ticket_estado_cambiado',
      'ticket',
      new.id,
      'Tu ticket ' || new.codigo || ' cambió a "' ||
        case new.estado
          when 'en_progreso' then 'En progreso'
          when 'cerrado' then 'Resuelto'
          when 'reabierto' then 'Reabierto'
          when 'rechazado' then 'Rechazado'
          else new.estado
        end || '"',
      '/tickets/' || new.id,
      new.asignado_a
    );
  end if;

  return null;
end;
$$;

alter function public.notify_ticket_personal() owner to project_admin;

-- ============================================================
-- FIN DE MIGRACIÓN 078
-- ============================================================
