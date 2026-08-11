-- ============================================================
-- MIGRACIÓN 045 — Notificaciones
-- Depende de: 002 (empleados/cuentas), 003 (staff/es_staff), 016
--             (tickets), 026 (realtime de listas), 044 (aviso de
--             ticket nuevo)
--
-- Alcance mínimo acordado (no hay tabla de notificaciones genérica
-- con motor de reglas, ver docs/PANORAMA_SISTEMA.md §6/§7): solo 4
-- eventos concretos, cada uno con su propio trigger explícito.
--   - ticket_creado    (tickets, insert)
--   - cuenta_creada    (cuentas, insert)
--   - empleado_alta    (empleados, insert)
--   - empleado_baja    (empleados, update → estado pasa a 'Inactivo')
--
-- Persistencia real (a diferencia de pendientesFeed.js, que se
-- recalcula en vivo sin guardar nada): cada evento queda como fila
-- en notificaciones, y notificaciones_lecturas guarda el estado
-- leído/no-leído POR usuario de staff (varios JEFE/ASISTENTE pueden
-- tener cada uno su propio estado sobre la misma notificación).
--
-- Solo lectura desde el cliente: nadie inserta en notificaciones
-- directo (mismo criterio que tickets/realtime.messages), solo la
-- función crear_notificacion() vía los 4 triggers de este archivo.
-- ============================================================


-- ============================================================
-- TABLA: notificaciones
-- ============================================================

create table if not exists public.notificaciones (
  id            uuid        primary key default gen_random_uuid(),

  tipo          text        not null
    check (tipo in ('ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja')),

  entidad_tipo  text        not null,
  entidad_id    uuid        not null,

  -- Texto ya armado en el trigger (evita joins en el cliente solo para
  -- mostrar la campana/el aviso emergente).
  titulo        text        not null,
  url_destino   text        not null,

  creado_en     timestamptz not null default now()
);

create index if not exists idx_notificaciones_creado_en
  on public.notificaciones (creado_en desc);

comment on table public.notificaciones is
  'Eventos notificables para todo el staff (ticket creado, cuenta creada, alta/baja de empleado). Solo se insertan desde crear_notificacion(), nunca directo desde el cliente.';


-- ============================================================
-- TABLA: notificaciones_lecturas
-- ============================================================

create table if not exists public.notificaciones_lecturas (
  notificacion_id uuid        not null references public.notificaciones(id) on delete cascade,
  usuario_id      uuid        not null references public.staff(user_id) on delete cascade,
  leido_en        timestamptz not null default now(),

  primary key (notificacion_id, usuario_id)
);

create index if not exists idx_notificaciones_lecturas_usuario
  on public.notificaciones_lecturas (usuario_id);

comment on table public.notificaciones_lecturas is
  'Estado de lectura por usuario de staff. Una fila = ese usuario ya vio esa notificación.';


-- ============================================================
-- RLS
-- ============================================================

alter table public.notificaciones enable row level security;

create policy "staff puede ver notificaciones"
  on public.notificaciones for select
  using (public.es_staff());

alter table public.notificaciones_lecturas enable row level security;

create policy "staff puede ver sus propias lecturas"
  on public.notificaciones_lecturas for select
  using (usuario_id = auth.uid());

create policy "staff puede marcar sus propias notificaciones como leidas"
  on public.notificaciones_lecturas for insert
  with check (usuario_id = auth.uid() and public.es_staff());


-- ============================================================
-- FUNCIÓN COMPARTIDA: crear_notificacion()
-- Inserta la fila y publica el detalle mínimo por realtime, en un
-- solo lugar (igual que notify_list_changed en la migración 026),
-- para que los 4 triggers de abajo no dupliquen el insert+publish.
-- ============================================================

create or replace function public.crear_notificacion(
  p_tipo text,
  p_entidad_tipo text,
  p_entidad_id uuid,
  p_titulo text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino)
  values (p_tipo, p_entidad_tipo, p_entidad_id, p_titulo, p_url)
  returning id into v_id;

  perform realtime.publish(
    'notificaciones:nuevas',
    'changed',
    jsonb_build_object('id', v_id, 'tipo', p_tipo, 'titulo', p_titulo, 'url_destino', p_url)
  );
end;
$$;


-- ============================================================
-- TRIGGER 1: ticket creado
-- ============================================================

create or replace function public.notify_ticket_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crear_notificacion(
    'ticket_creado',
    'ticket',
    new.id,
    'Ticket nuevo · ' || new.codigo || ' — ' || new.titulo,
    '/tickets/' || new.id
  );
  return null;
end;
$$;

drop trigger if exists trg_tickets_notificacion on public.tickets;
create trigger trg_tickets_notificacion
  after insert on public.tickets
  for each row
  execute function public.notify_ticket_notificacion();


-- ============================================================
-- TRIGGER 2: cuenta creada
-- ============================================================

create or replace function public.notify_cuenta_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plataforma text;
begin
  select nombre into v_plataforma from public.plataformas where id = new.plataforma_id;
  perform public.crear_notificacion(
    'cuenta_creada',
    'cuenta',
    new.id,
    'Cuenta creada · ' || new.usuario || coalesce(' en ' || v_plataforma, ''),
    '/correos'
  );
  return null;
end;
$$;

drop trigger if exists trg_cuentas_notificacion on public.cuentas;
create trigger trg_cuentas_notificacion
  after insert on public.cuentas
  for each row
  execute function public.notify_cuenta_notificacion();


-- ============================================================
-- TRIGGER 3: empleado dado de alta
-- ============================================================

create or replace function public.notify_empleado_alta_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crear_notificacion(
    'empleado_alta',
    'empleado',
    new.id,
    'Empleado registrado · ' || new.nombres || ' ' || new.apellidos,
    '/empleados/' || new.id
  );
  return null;
end;
$$;

drop trigger if exists trg_empleados_alta_notificacion on public.empleados;
create trigger trg_empleados_alta_notificacion
  after insert on public.empleados
  for each row
  execute function public.notify_empleado_alta_notificacion();


-- ============================================================
-- TRIGGER 4: empleado dado de baja
-- Solo cuando el estado REALMENTE cambia a 'Inactivo' (dar_baja_empleado,
-- migración 038). No dispara en cualquier UPDATE del empleado.
-- ============================================================

create or replace function public.notify_empleado_baja_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crear_notificacion(
    'empleado_baja',
    'empleado',
    new.id,
    'Empleado dado de baja · ' || new.nombres || ' ' || new.apellidos,
    '/empleados/' || new.id
  );
  return null;
end;
$$;

drop trigger if exists trg_empleados_baja_notificacion on public.empleados;
create trigger trg_empleados_baja_notificacion
  after update on public.empleados
  for each row
  when (old.estado is distinct from new.estado and new.estado = 'Inactivo')
  execute function public.notify_empleado_baja_notificacion();


-- ============================================================
-- Canal realtime: notificaciones:nuevas
-- Mismo criterio que tickets:nuevos (migración 044): trigger de FILA
-- para tener el detalle listo (título/url) sin round-trip adicional.
-- ============================================================

insert into realtime.channels (pattern, description, enabled) values
  ('notificaciones:nuevas', 'Detalle de notificación nueva (ticket, cuenta, alta/baja de empleado)', true)
on conflict (pattern) do update set
  description = excluded.description,
  enabled = excluded.enabled;

drop policy if exists staff_subscribe_list_channels on realtime.channels;
create policy staff_subscribe_list_channels
on realtime.channels for select
to authenticated
using (
  pattern in ('tickets:list', 'empleados:list', 'cuentas:list', 'licencias:list', 'equipos:list', 'tickets:nuevos', 'notificaciones:nuevas')
);

-- ============================================================
-- FIN DE MIGRACIÓN 045
-- ============================================================
