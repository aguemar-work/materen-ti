-- ============================================================
-- MIGRACIÓN 044 — Realtime: aviso de ticket nuevo
-- El canal "tickets:list" (026) es un trigger de SENTENCIA: solo
-- publica {op}, sin datos de la fila, así que no basta para mostrar
-- un popup con el código/título del ticket que acaba de entrar.
-- Se agrega un trigger de FILA dedicado en INSERT que publica el
-- detalle mínimo al canal "tickets:nuevos", sin tocar el trigger de
-- sentencia existente (ambos conviven y disparan por separado).
-- ============================================================

create or replace function public.notify_ticket_creado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.publish('tickets:nuevos', 'changed', jsonb_build_object('id', NEW.id, 'codigo', NEW.codigo, 'titulo', NEW.titulo));
  return null;
end;
$$;

drop trigger if exists trg_ticket_creado_notify on public.tickets;
create trigger trg_ticket_creado_notify
  after insert on public.tickets
  for each row
  execute function public.notify_ticket_creado();

-- Registro de canal (fijo, no wildcard: mismo estilo que las listas de 026).
insert into realtime.channels (pattern, description, enabled) values
  ('tickets:nuevos', 'Detalle de ticket nuevo, para el aviso emergente del sidebar', true)
on conflict (pattern) do update set
  description = excluded.description,
  enabled = excluded.enabled;

-- RLS: mismo criterio que 026 (staff_subscribe_list_channels), se amplía
-- la lista de patrones permitidos en vez de crear una policy paralela.
drop policy if exists staff_subscribe_list_channels on realtime.channels;
create policy staff_subscribe_list_channels
on realtime.channels for select
to authenticated
using (
  pattern in ('tickets:list', 'empleados:list', 'cuentas:list', 'licencias:list', 'equipos:list', 'tickets:nuevos')
);

-- ============================================================
-- FIN DE MIGRACIÓN 044
-- ============================================================
