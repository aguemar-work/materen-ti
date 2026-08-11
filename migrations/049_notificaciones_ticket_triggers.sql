-- ============================================================
-- MIGRACIÓN 049 — Notificaciones personales de tickets
-- Depende de: 016 (tickets, ticket_comentarios, ticket_eventos),
--             017/035 (nivel_atencion/tipo, no tocados aquí),
--             048 (destinatario_id + crear_notificacion con 6º parámetro)
--
-- Cubre los 4 huecos identificados: hoy solo "ticket creado" notifica al
-- staff (migración 045). El técnico no se enteraba cuando le asignaban
-- un ticket, cuando cambiaba de estado, cuando le comentaban, o cuando
-- fallaba un correo relacionado — tenía que entrar manualmente a revisar
-- el historial de cada ticket.
--
-- Autoexclusión: a diferencia de los 4 triggers broadcast de 045 (donde
-- no aplica: son un feed de actividad general, no alertas personales),
-- estos SÍ comparan el destinatario calculado contra auth.uid() y omiten
-- el insert si coinciden — nadie se autonotifica de su propia acción.
-- ============================================================

-- ------------------------------------------------------------
-- TRIGGER: asignación y cambio de estado (mismo trigger, un solo pase
-- por UPDATE, mismo criterio que evento_ticket_cambios() en 016).
-- ------------------------------------------------------------

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
  -- las etiquetas en un lado, replicar en el otro.
  if new.estado is distinct from old.estado
     and new.asignado_a is not null
     and new.asignado_a <> auth.uid() then
    perform public.crear_notificacion(
      'ticket_estado_cambiado',
      'ticket',
      new.id,
      'Tu ticket ' || new.codigo || ' cambió a "' ||
        case new.estado
          when 'en_progreso' then 'En progreso'
          when 'resuelto' then 'Resuelto'
          when 'cerrado' then 'Cerrado'
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

drop trigger if exists trg_ticket_notificacion_personal on public.tickets;
create trigger trg_ticket_notificacion_personal
  after update on public.tickets
  for each row execute function public.notify_ticket_personal();

-- ------------------------------------------------------------
-- TRIGGER: comentario nuevo. ticket_comentarios solo admite INSERT de
-- staff (policy "staff puede comentar tickets", 016) — nunca hay un
-- comentario "del empleado", así que el caso a cubrir es siempre
-- "otro miembro del staff comentó". Notifica al asignado_a del ticket.
-- ------------------------------------------------------------

create or replace function public.notify_ticket_comentario_personal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
begin
  select * into v_ticket from public.tickets where id = new.ticket_id;

  if v_ticket.asignado_a is not null and v_ticket.asignado_a <> auth.uid() then
    perform public.crear_notificacion(
      'ticket_comentario_nuevo',
      'ticket',
      v_ticket.id,
      (case when new.interno then 'Nota interna nueva en tu ticket ' else 'Respuesta enviada al empleado en tu ticket ' end)
        || v_ticket.codigo,
      '/tickets/' || v_ticket.id,
      v_ticket.asignado_a
    );
  end if;

  return null;
end;
$$;

alter function public.notify_ticket_comentario_personal() owner to project_admin;

drop trigger if exists trg_ticket_comentario_notificacion on public.ticket_comentarios;
create trigger trg_ticket_comentario_notificacion
  after insert on public.ticket_comentarios
  for each row execute function public.notify_ticket_comentario_personal();

-- ------------------------------------------------------------
-- TRIGGER: correo fallido. functions/tickets.ts ya registra el evento
-- 'correo_fallido' en ticket_eventos (confirmación al crear, con
-- user_id=null porque no hay sesión de staff en ese flujo público; y
-- encuesta al cerrar, con user_id=staff.id de quien disparó el cierre).
-- Se ata a esa fila en vez de tocar la edge function: cubre cualquier
-- punto de fallo de correo futuro sin volver a este archivo.
-- ------------------------------------------------------------

create or replace function public.notify_correo_fallido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_destinatario uuid;
begin
  select * into v_ticket from public.tickets where id = new.ticket_id;
  v_destinatario := coalesce(new.user_id, v_ticket.asignado_a); -- null -> broadcast

  perform public.crear_notificacion(
    'ticket_correo_fallido',
    'ticket',
    v_ticket.id,
    'No se pudo enviar un correo del ticket ' || v_ticket.codigo,
    '/tickets/' || v_ticket.id,
    v_destinatario
  );

  return null;
end;
$$;

alter function public.notify_correo_fallido() owner to project_admin;

drop trigger if exists trg_correo_fallido_notificacion on public.ticket_eventos;
create trigger trg_correo_fallido_notificacion
  after insert on public.ticket_eventos
  for each row
  when (new.evento = 'correo_fallido')
  execute function public.notify_correo_fallido();

-- ============================================================
-- FIN DE MIGRACIÓN 049
-- ============================================================
