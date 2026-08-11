-- ============================================================
-- MIGRACIÓN 051 — Cierre de ticket atómico (RPC)
-- Depende de: 016 (tickets, crear_encuesta_al_cerrar), 017
--             (evento_ticket_cambios), 050 (whitelist de transiciones)
--
-- Contexto: TicketDetalleView.vue hacía marcarResuelto() con DOS
-- llamadas HTTP secuenciales (estado='resuelto', luego estado='cerrado').
-- Si la segunda fallaba (red, pestaña cerrada), el ticket quedaba
-- "resuelto" pero el usuario solo veía el error de "cerrado", sin saber
-- en qué estado real quedó. Mismo patrón de riesgo que dar_baja_empleado
-- (migración 038) antes de volverse atómico.
--
-- Esta función hace ambos UPDATE en una sola transacción de servidor.
-- Se conservan los DOS hitos en ticket_eventos (lo exige HITO_LABELS en
-- frontend/src/core/dominio-tickets.js) porque cada UPDATE interno sigue
-- disparando evento_ticket_cambios() con normalidad — la atomicidad
-- viene de que ambos viven en una sola función de servidor, no de
-- colapsar el historial a un solo evento.
--
-- Nota operativa (mismo gotcha que 038/032): aplicar con `db import`,
-- NO con `db query`/`scripts/apply-migration.mjs` (no soportan
-- dollar-quoting). Verificar siempre después con una consulta de lectura.
-- ============================================================

create or replace function public.cerrar_ticket(p_ticket_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_estado_actual text;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  select estado into v_estado_actual from public.tickets where id = p_ticket_id;
  if v_estado_actual is null then
    raise exception 'Ticket no encontrado';
  end if;
  if v_estado_actual not in ('en_progreso', 'reabierto') then
    raise exception 'Solo se puede marcar como resuelto un ticket en progreso o reabierto (estado actual: %).', v_estado_actual;
  end if;

  update public.tickets set estado = 'resuelto' where id = p_ticket_id;
  update public.tickets set estado = 'cerrado' where id = p_ticket_id
    returning * into v_ticket;

  return v_ticket;
end;
$$;

comment on function public.cerrar_ticket(uuid) is
  'Marca un ticket resuelto y cerrado en una sola transacción de servidor (resuelto->cerrado), reemplazando las 2 llamadas HTTP secuenciales de marcarResuelto(). Conserva ambos hitos en ticket_eventos vía evento_ticket_cambios (cada UPDATE sigue disparando su propio evento).';

alter function public.cerrar_ticket(uuid) owner to project_admin;

-- ============================================================
-- FIN DE MIGRACIÓN 051
-- ============================================================
