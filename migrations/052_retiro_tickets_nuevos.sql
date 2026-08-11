-- ============================================================
-- MIGRACIÓN 052 — Retiro del canal realtime muerto "tickets:nuevos"
-- Depende de: 026 (staff_subscribe_list_channels original), 044
--             (tickets:nuevos), 045 (notificaciones:nuevas)
--
-- El canal "tickets:nuevos" (044) fue reemplazado por "notificaciones:nuevas"
-- (045): el aviso emergente + campana de AppLayout.vue solo escuchan este
-- último desde entonces. Confirmado por grep en todo frontend/src: no queda
-- ningún useRealtimeRefresco('tickets:nuevos', ...), solo un comentario
-- que lo menciona como legado (AppLayout.vue). Es código muerto: el
-- trigger sigue publicando en cada INSERT de ticket sin que nadie escuche.
--
-- La fila de realtime.channels se deshabilita (enabled=false) en vez de
-- borrarse: reversible, y deja registro auditable de qué canales existieron.
-- La policy de suscripción se reescribe completa (es acumulativa desde
-- 026→044→045, no admite un DROP parcial de un patrón).
-- ============================================================

drop trigger if exists trg_ticket_creado_notify on public.tickets;
drop function if exists public.notify_ticket_creado();

update realtime.channels set enabled = false where pattern = 'tickets:nuevos';

drop policy if exists staff_subscribe_list_channels on realtime.channels;
create policy staff_subscribe_list_channels
on realtime.channels for select
to authenticated
using (
  pattern in ('tickets:list', 'empleados:list', 'cuentas:list', 'licencias:list', 'equipos:list', 'notificaciones:nuevas')
);

-- ============================================================
-- FIN DE MIGRACIÓN 052
-- ============================================================
