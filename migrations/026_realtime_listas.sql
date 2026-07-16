-- ============================================================
-- MIGRACIÓN 026 — Realtime para listas (auto-refresco sin F5)
-- Publica un evento 'changed' cuando cambian tickets, empleados,
-- cuentas, licencias o equipos, para que el frontend recargue la
-- lista automáticamente en todas las sesiones abiertas.
-- ============================================================

-- Función de trigger genérica: TG_ARGV[0] trae el nombre del canal.
create or replace function public.notify_list_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.publish(TG_ARGV[0], 'changed', jsonb_build_object('op', TG_OP));
  return null;
end;
$$;

-- Triggers por sentencia (no por fila) para no saturar en cargas masivas.
drop trigger if exists trg_tickets_notify on public.tickets;
create trigger trg_tickets_notify
  after insert or update or delete on public.tickets
  for each statement execute function public.notify_list_changed('tickets:list');

drop trigger if exists trg_empleados_notify on public.empleados;
create trigger trg_empleados_notify
  after insert or update or delete on public.empleados
  for each statement execute function public.notify_list_changed('empleados:list');

drop trigger if exists trg_cuentas_notify on public.cuentas;
create trigger trg_cuentas_notify
  after insert or update or delete on public.cuentas
  for each statement execute function public.notify_list_changed('cuentas:list');

drop trigger if exists trg_licencias_notify on public.licencias;
create trigger trg_licencias_notify
  after insert or update or delete on public.licencias
  for each statement execute function public.notify_list_changed('licencias:list');

drop trigger if exists trg_equipos_notify on public.equipos;
create trigger trg_equipos_notify
  after insert or update or delete on public.equipos
  for each statement execute function public.notify_list_changed('equipos:list');

-- Registro de patrones de canal.
insert into realtime.channels (pattern, description, enabled) values
  ('tickets:list', 'Cambios en tickets', true),
  ('empleados:list', 'Cambios en empleados', true),
  ('cuentas:list', 'Cambios en cuentas/correos', true),
  ('licencias:list', 'Cambios en licencias', true),
  ('equipos:list', 'Cambios en equipos', true)
on conflict (pattern) do update set
  description = excluded.description,
  enabled = excluded.enabled;

-- RLS: solo el staff autenticado puede suscribirse a estos canales.
alter table realtime.channels enable row level security;

drop policy if exists staff_subscribe_list_channels on realtime.channels;
create policy staff_subscribe_list_channels
on realtime.channels for select
to authenticated
using (
  pattern in ('tickets:list', 'empleados:list', 'cuentas:list', 'licencias:list', 'equipos:list')
);

-- RLS: nadie publica directo desde el cliente, solo el trigger
-- SECURITY DEFINER (que corre como owner y no pasa por RLS).
alter table realtime.messages enable row level security;

-- ============================================================
-- FIN DE MIGRACIÓN 026
-- ============================================================
