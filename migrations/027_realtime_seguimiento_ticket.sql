-- ============================================================
-- MIGRACIÓN 027 — Realtime para /ticket/:token (seguimiento público)
-- Publica cambios de estado y respuestas públicas nuevas al canal
-- ticket:<token>, para que la página de seguimiento (empleado, sin
-- sesión) se actualice sola sin recargar. El token es la credencial
-- de acceso (columna "no adivinable", ver migración 016); el canal
-- se identifica por token, nunca por id, para no cambiar ese modelo.
-- ============================================================

-- Cambio de estado del ticket.
create or replace function public.notify_ticket_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.publish('ticket:' || NEW.token, 'estado_changed', jsonb_build_object('estado', NEW.estado));
  return null;
end;
$$;

drop trigger if exists trg_ticket_estado_notify on public.tickets;
create trigger trg_ticket_estado_notify
  after update on public.tickets
  for each row
  when (OLD.estado is distinct from NEW.estado)
  execute function public.notify_ticket_estado();

-- Respuesta pública nueva (interno = false) en un ticket.
create or replace function public.notify_ticket_comentario_publico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if NEW.interno = false then
    select token into v_token from public.tickets where id = NEW.ticket_id;
    if v_token is not null then
      perform realtime.publish('ticket:' || v_token, 'comentario_nuevo', jsonb_build_object('mensaje', NEW.mensaje));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ticket_comentario_notify on public.ticket_comentarios;
create trigger trg_ticket_comentario_notify
  after insert on public.ticket_comentarios
  for each row
  execute function public.notify_ticket_comentario_publico();

-- Patrón de canal (wildcard: un canal por ticket, identificado por token).
insert into realtime.channels (pattern, description, enabled) values
  ('ticket:%', 'Seguimiento público de un ticket por token', true)
on conflict (pattern) do update set
  description = excluded.description,
  enabled = excluded.enabled;

-- RLS: primera policy de 'anon' del proyecto. Acotada a nivel de fila:
-- solo permite suscribirse a ticket:<token> si ese token existe en
-- tickets — exactamente el mismo modelo de acceso que ya usa la edge
-- function "tickets" (posesión del token = autorización), no expone
-- nada que no se pueda obtener ya sabiendo el token.
alter table realtime.channels enable row level security;

drop policy if exists public_subscribe_ticket_channel on realtime.channels;
create policy public_subscribe_ticket_channel
on realtime.channels for select
to anon
using (
  pattern = 'ticket:%'
  and exists (
    select 1 from public.tickets
    where token = split_part(realtime.channel_name(), ':', 2)
  )
);

-- Nadie publica directo desde el cliente (anon incluido); solo los
-- triggers SECURITY DEFINER de arriba.
alter table realtime.messages enable row level security;

-- ============================================================
-- FIN DE MIGRACIÓN 027
-- ============================================================
