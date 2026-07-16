-- ============================================================
-- MIGRACIÓN 029 — FIX: seguimiento público de ticket sin auto-refresco
-- La suscripción a "ticket:<token>" ya quedaba autorizada (028), pero
-- nunca disparaba el refresco: los triggers de 027 publicaban con
-- evento 'estado_changed' / 'comentario_nuevo', mientras que el cliente
-- (useRealtimeRefresco.js) solo escucha el evento de socket 'changed'
-- (mismo patrón que tickets:list/empleados:list/etc. en 026). El SDK
-- reenvía cada evento por su nombre exacto, así que esos mensajes se
-- publicaban pero nunca llegaban a ningún listener registrado.
-- Fix: publicar como 'changed', conservando el detalle en el payload.
-- ============================================================

create or replace function public.notify_ticket_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.publish('ticket:' || NEW.token, 'changed', jsonb_build_object('evento', 'estado_changed', 'estado', NEW.estado));
  return null;
end;
$$;

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
      perform realtime.publish('ticket:' || v_token, 'changed', jsonb_build_object('evento', 'comentario_nuevo', 'mensaje', NEW.mensaje));
    end if;
  end if;
  return null;
end;
$$;

-- ============================================================
-- FIN DE MIGRACIÓN 029
-- ============================================================
