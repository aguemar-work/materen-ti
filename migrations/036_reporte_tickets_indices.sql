-- ============================================================
-- MIGRACIÓN 036 — Índices para el reporte de tickets
-- Depende de: 016 (tickets, ticket_eventos, ticket_satisfaccion)
--
-- Contexto (auditoría del reporte, ago 2026): el modal "Reporte" recorta por
-- periodo de calendario (día / semana / mes) y arma sus agregaciones con tres
-- consultas por rango de `created_at`. Ninguna estaba servida por un índice:
--
--   1. tickets por rango de created_at (volumen del periodo y backlog). Los
--      índices que 016 dejó sobre created_at son PARCIALES
--      (idx_tickets_sin_asignar, idx_tickets_sin_vincular) y sus predicados no
--      aplican a esta consulta, así que quedaba seq scan.
--   2. ticket_eventos por evento + rango de created_at (resoluciones y
--      reaperturas del periodo). El único índice era (ticket_id, created_at),
--      que no sirve cuando no se filtra por ticket: ticket_eventos es la tabla
--      que más rápido crece del módulo.
--   3. ticket_satisfaccion por rango de created_at (cohorte de encuestas).
--
-- Solo índices: no cambia ninguna tabla, columna, política ni trigger, y es
-- reversible con un DROP INDEX. Nada del reporte depende de esta migración para
-- dar resultados correctos — sin ella los da igual, solo más lento.
-- ============================================================

-- 1. Volumen del periodo y backlog. DESC porque la lista se ordena por
--    created_at descendente (el índice se recorre igual en ambos sentidos, pero
--    así coincide con el orden pedido y evita el paso de sort).
create index if not exists idx_tickets_created_at
  on public.tickets (created_at desc);

-- 2. Resoluciones y reaperturas del periodo: el reporte lee TODOS los
--    'estado_cambiado' del rango y deriva el estado destino en el cliente, así
--    que el filtro real es (evento, created_at) en ese orden.
create index if not exists idx_ticket_eventos_evento_fecha
  on public.ticket_eventos (evento, created_at);

-- 3. Cohorte de encuestas del periodo (created_at = cuándo se generó al cerrar
--    el ticket, no cuándo la respondió el empleado).
create index if not exists idx_ticket_satisfaccion_created_at
  on public.ticket_satisfaccion (created_at);
