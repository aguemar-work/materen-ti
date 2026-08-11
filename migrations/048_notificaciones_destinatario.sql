-- ============================================================
-- MIGRACIÓN 048 — Notificaciones personales (destinatario_id)
-- Depende de: 003 (staff/es_staff), 045 (notificaciones)
--
-- Contexto: la migración 045 dejó "notificaciones" como un feed de
-- BROADCAST para todo el staff (ticket_creado, cuenta_creada,
-- empleado_alta/baja) — correcto para esos 4 eventos, que le interesan
-- a cualquier miembro del equipo. Pero para avisos que le importan a
-- UNA persona en particular (le asignaron un ticket, su ticket cambió
-- de estado, le comentaron, falló un correo de un ticket suyo) un
-- broadcast sería ruido para el resto del staff.
--
-- Se agrega destinatario_id NULLABLE en la misma tabla en vez de crear
-- una tabla paralela: NULL = broadcast (comportamiento actual, sin
-- tocar los 4 triggers de 045), no nulo = solo ese usuario. La tabla
-- notificaciones_lecturas no cambia — su PK compuesta (notificacion_id,
-- usuario_id) ya sirve igual para ambos casos.
--
-- El transporte realtime de lo personal usa un canal WILDCARD, mismo
-- mecanismo que "ticket:%" (migraciones 027/028): cada notificación
-- personal se publica solo en "notificaciones:usuario:<destinatario_id>",
-- nunca en el canal broadcast "notificaciones:nuevas". Así ningún
-- cliente recibe por WebSocket una notificación ajena — no se depende
-- de filtrar del lado del cliente después de recibirla.
-- ============================================================

alter table public.notificaciones
  add column if not exists destinatario_id uuid references public.staff(user_id) on delete cascade;

create index if not exists idx_notificaciones_destinatario
  on public.notificaciones (destinatario_id)
  where destinatario_id is not null;

comment on column public.notificaciones.destinatario_id is
  'NULL = broadcast a todo el staff (comportamiento original de la migración 045). No nulo = solo visible/entregado a ese usuario.';

-- ------------------------------------------------------------
-- CHECK de tipo ampliado: 4 tipos nuevos, personales por definición
-- (siempre llevan destinatario_id, salvo el fallback a broadcast de
-- ticket_correo_fallido cuando no hay ni actor ni asignado).
-- ------------------------------------------------------------
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja',
    'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo', 'ticket_correo_fallido'
  ));

-- ------------------------------------------------------------
-- RLS: cada staff ve los broadcasts + solo las suyas (sin excepción
-- para JEFE — ve lo mismo que cualquier ASISTENTE respecto a lo personal).
-- ------------------------------------------------------------
drop policy if exists "staff puede ver notificaciones" on public.notificaciones;
create policy "staff puede ver notificaciones"
  on public.notificaciones for select
  using (public.es_staff() and (destinatario_id is null or destinatario_id = auth.uid()));

-- ------------------------------------------------------------
-- crear_notificacion(): 6º parámetro opcional (compatible con las 4
-- llamadas existentes de 045, que no lo pasan y siguen siendo broadcast).
-- ------------------------------------------------------------
create or replace function public.crear_notificacion(
  p_tipo text,
  p_entidad_tipo text,
  p_entidad_id uuid,
  p_titulo text,
  p_url text,
  p_destinatario_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino, destinatario_id)
  values (p_tipo, p_entidad_tipo, p_entidad_id, p_titulo, p_url, p_destinatario_id)
  returning id into v_id;

  if p_destinatario_id is null then
    perform realtime.publish(
      'notificaciones:nuevas',
      'changed',
      jsonb_build_object('id', v_id, 'tipo', p_tipo, 'titulo', p_titulo, 'url_destino', p_url)
    );
  else
    perform realtime.publish(
      'notificaciones:usuario:' || p_destinatario_id,
      'changed',
      jsonb_build_object('id', v_id, 'tipo', p_tipo, 'titulo', p_titulo, 'url_destino', p_url)
    );
  end if;
end;
$$;

alter function public.crear_notificacion(text, text, uuid, text, text, uuid) owner to project_admin;

-- ------------------------------------------------------------
-- Canal realtime wildcard para avisos personales.
-- ------------------------------------------------------------
insert into realtime.channels (pattern, description, enabled) values
  ('notificaciones:usuario:%', 'Notificaciones dirigidas a un usuario de staff específico (asignación, cambio de estado, comentario, correo fallido)', true)
on conflict (pattern) do update set
  description = excluded.description,
  enabled = excluded.enabled;

drop policy if exists staff_subscribe_personal_channel on realtime.channels;
create policy staff_subscribe_personal_channel
on realtime.channels for select
to authenticated
using (
  pattern = 'notificaciones:usuario:%'
  and split_part(realtime.channel_name(), ':', 3) = auth.uid()::text
);

-- ============================================================
-- FIN DE MIGRACIÓN 048
-- ============================================================
