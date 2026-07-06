-- ============================================================
-- MIGRACIÓN 016 — Módulo de Tickets (reemplaza Helpdesk Bitrix24)
-- Depende de: 001..015
--
-- Regla de dominio fija: los empleados NUNCA tienen acceso al
-- sistema (sin login). Solo ven páginas públicas puntuales por
-- token — igual que /entrega/:token, pero un token de ticket es
-- un recurso DISTINTO del token de entrega (no deben confundirse).
--
-- Arquitectura de escritura (mismo patrón que "entregas"):
--   - tickets NO tiene política de INSERT para el cliente (ni
--     anon ni staff). Toda creación pasa por la edge function
--     "tickets" (cliente admin), que centraliza: match de
--     empleado, generación de código/token, envío de correo y
--     — si hay adjunto — su subida a storage.
--   - Los eventos y la encuesta de satisfacción los escriben
--     triggers (hoja de vida) o la misma edge function.
-- ============================================================


-- ------------------------------------------------------------
-- Función de código correlativo (TCK-0001, TCK-0002...)
-- Vía secuencia: no depende de escanear la tabla (la public
-- formulario no tiene permiso de lectura sobre tickets).
-- ------------------------------------------------------------

create sequence if not exists public.ticket_codigo_seq start 1;

create or replace function public.siguiente_codigo_ticket()
returns text
language sql
as $$
  select 'TCK-' || lpad(nextval('public.ticket_codigo_seq')::text, 4, '0');
$$;


-- ------------------------------------------------------------
-- TABLA: categorias_ticket (catálogo, editable por staff)
-- ------------------------------------------------------------

create table if not exists public.categorias_ticket (
  id          text        primary key,   -- slug: accesos_cuentas, equipos...
  nombre      text        not null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.categorias_ticket is
  'Tipo de solicitud (nivel 1). Editable por staff, igual que tipos_equipo.';

create or replace trigger trg_categorias_ticket_updated_at
  before update on public.categorias_ticket
  for each row execute function set_updated_at();


-- ------------------------------------------------------------
-- TABLA: subcategorias_ticket (nivel 2, depende de categoría)
-- ------------------------------------------------------------

create table if not exists public.subcategorias_ticket (
  id            uuid        primary key default gen_random_uuid(),
  categoria_id  text        not null references public.categorias_ticket(id) on delete restrict,
  nombre        text        not null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_subcategorias_categoria
  on public.subcategorias_ticket (categoria_id)
  where deleted_at is null;

comment on table public.subcategorias_ticket is
  'Subcategoría de ticket (nivel 2). El formulario público la muestra tras elegir la categoría.';

create or replace trigger trg_subcategorias_ticket_updated_at
  before update on public.subcategorias_ticket
  for each row execute function set_updated_at();


-- ------------------------------------------------------------
-- Datos iniciales — categorías comunes de un helpdesk de TI
-- ------------------------------------------------------------

insert into public.categorias_ticket (id, nombre) values
  ('accesos_cuentas', 'Accesos y Cuentas'),
  ('equipos',         'Equipos'),
  ('software',        'Software y Licencias'),
  ('red',             'Red y Conectividad'),
  ('otro',            'Otro')
on conflict (id) do nothing;

insert into public.subcategorias_ticket (categoria_id, nombre) values
  ('accesos_cuentas', 'Restablecer contraseña'),
  ('accesos_cuentas', 'Crear cuenta'),
  ('accesos_cuentas', 'Cuenta bloqueada'),
  ('accesos_cuentas', 'Permisos o accesos'),
  ('equipos',         'Equipo no enciende'),
  ('equipos',         'Equipo lento o con fallas'),
  ('equipos',         'Solicitar equipo nuevo'),
  ('equipos',         'Accesorio faltante o dañado'),
  ('software',        'Instalar software'),
  ('software',        'Problema con una licencia'),
  ('software',        'Solicitar licencia nueva'),
  ('red',             'Sin internet o wifi'),
  ('red',             'VPN no conecta'),
  ('red',             'Impresora no funciona'),
  ('otro',            'Otro')
on conflict do nothing;


-- ------------------------------------------------------------
-- TABLA: tickets
-- ------------------------------------------------------------

create table if not exists public.tickets (
  id                  uuid        primary key default gen_random_uuid(),

  codigo              text        not null unique,  -- TCK-0001
  token               text        not null unique,  -- seguimiento + encuesta, no adivinable

  titulo              text        not null,
  descripcion         text        not null,

  origen              text        not null default 'empleado'
    check (origen in ('empleado', 'staff_interno')),

  -- Quién reporta. NULL si es interno o si no hubo match (vinculado=false).
  empleado_id         uuid        references public.empleados(id) on delete set null,
  -- false = no hubo match automático por correo/DNI; queda para revisión manual.
  -- Con token de entrega o cuando el staff elige al empleado, vinculado=true.
  vinculado           boolean     not null default true,
  -- Snapshot del dato de contacto ingresado en el formulario público, aunque
  -- haya o no match — para que el staff pueda ubicar a la persona a mano.
  contacto_ingresado  text,

  -- Quién lo creó, si es un ticket interno de staff (o un staff que lo
  -- registró en nombre de un empleado que llamó/pasó en persona).
  creado_por          uuid        references auth.users(id) on delete set null,

  categoria_id        text        references public.categorias_ticket(id) on delete restrict,
  subcategoria_id     uuid        references public.subcategorias_ticket(id) on delete restrict,

  -- Enlace opcional a un activo concreto del empleado
  equipo_id           uuid        references public.equipos(id) on delete set null,
  cuenta_id           uuid        references public.cuentas(id) on delete set null,
  licencia_id         uuid        references public.licencias(id) on delete set null,

  estado              text        not null default 'abierto'
    check (estado in ('abierto', 'en_progreso', 'resuelto', 'cerrado', 'reabierto')),
  prioridad           text        not null default 'media'
    check (prioridad in ('baja', 'media', 'alta', 'urgente')),

  asignado_a          uuid        references auth.users(id) on delete set null,

  es_base_conocimiento  boolean   not null default false,
  es_leccion_aprendida  boolean   not null default false,

  -- Adjunto opcional (captura de pantalla), subido por la edge function
  adjunto_url         text,
  adjunto_key         text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_tickets_estado on public.tickets (estado);
create index if not exists idx_tickets_asignado on public.tickets (asignado_a) where asignado_a is not null;
create index if not exists idx_tickets_sin_asignar on public.tickets (created_at) where asignado_a is null and estado not in ('resuelto', 'cerrado');
create index if not exists idx_tickets_sin_vincular on public.tickets (created_at) where vinculado = false;
create index if not exists idx_tickets_empleado on public.tickets (empleado_id) where empleado_id is not null;

comment on table public.tickets is
  'Solicitudes de soporte. Creación exclusiva vía edge function "tickets" (sin política de INSERT para el cliente).';

comment on column public.tickets.token is
  'Token de TICKET — distinto del token de entrega. Da acceso público de solo ese ticket (seguimiento + encuesta).';

comment on column public.tickets.vinculado is
  'false = no hubo match automático por correo/DNI al crear. Aparece en revisión manual del staff.';

create or replace trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function set_updated_at();

-- Que un staff pueda quedar asignado requiere que exista y esté activo
create or replace function public.check_asignado_staff_activo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.asignado_a is not null then
    if not exists (
      select 1 from public.staff
      where user_id = new.asignado_a and activo = true
    ) then
      raise exception 'Solo se puede asignar un ticket a un miembro de staff activo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_asignado_staff on public.tickets;
create trigger trg_check_asignado_staff
  before insert or update of asignado_a on public.tickets
  for each row execute function public.check_asignado_staff_activo();


-- ------------------------------------------------------------
-- TABLA: ticket_comentarios (timeline de conversación)
-- ------------------------------------------------------------

create table if not exists public.ticket_comentarios (
  id          uuid        primary key default gen_random_uuid(),
  ticket_id   uuid        not null references public.tickets(id) on delete cascade,
  autor_id    uuid        references auth.users(id) on delete set null,
  -- true = nota solo para staff. false = respuesta visible para el empleado
  -- (se muestra en /ticket/:token).
  interno     boolean     not null default true,
  mensaje     text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ticket_comentarios_ticket
  on public.ticket_comentarios (ticket_id, created_at);

comment on table public.ticket_comentarios is
  'Conversación del ticket. interno=true → solo staff; interno=false → visible en el seguimiento público.';

-- Un ticket cerrado no acepta comentarios nuevos salvo que se reabra primero
create or replace function public.check_ticket_no_cerrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado into v_estado from public.tickets where id = new.ticket_id;
  if v_estado = 'cerrado' then
    raise exception 'El ticket está cerrado. Reábrelo antes de agregar comentarios.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_ticket_no_cerrado on public.ticket_comentarios;
create trigger trg_check_ticket_no_cerrado
  before insert on public.ticket_comentarios
  for each row execute function public.check_ticket_no_cerrado();

-- NOTA: no reutiliza set_created_by_only() (esa función asume una columna
-- "created_by"; aquí la columna se llama autor_id, más clara para este
-- contexto de conversación).
create or replace function public.set_autor_id_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.autor_id := auth.uid();
  return new;
end;
$$;

create or replace trigger trg_ticket_comentarios_by
  before insert on public.ticket_comentarios
  for each row execute function public.set_autor_id_only();


-- ------------------------------------------------------------
-- TABLA: ticket_eventos (hoja de vida, append-only vía triggers)
-- ------------------------------------------------------------

create table if not exists public.ticket_eventos (
  id          uuid        primary key default gen_random_uuid(),
  ticket_id   uuid        not null references public.tickets(id) on delete cascade,
  evento      text        not null
    check (evento in (
      'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
      'correo_fallido', 'encuesta_enviada', 'encuesta_respondida'
    )),
  detalle     text,
  user_id     uuid        references auth.users(id) on delete set null,
  user_email  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ticket_eventos_ticket
  on public.ticket_eventos (ticket_id, created_at);

comment on table public.ticket_eventos is
  'Hoja de vida del ticket. Solo la escriben triggers/edge function; nadie la edita desde el cliente.';

create or replace function public.log_evento_ticket(p_ticket uuid, p_evento text, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  insert into public.ticket_eventos (ticket_id, evento, detalle, user_id, user_email)
  values (p_ticket, p_evento, p_detalle, auth.uid(), v_email);
end;
$$;

create or replace function public.evento_ticket_cambios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado is distinct from new.estado then
    perform public.log_evento_ticket(new.id, 'estado_cambiado',
      'De "' || old.estado || '" a "' || new.estado || '"');
  end if;
  if old.prioridad is distinct from new.prioridad then
    perform public.log_evento_ticket(new.id, 'prioridad_cambiada',
      'De "' || old.prioridad || '" a "' || new.prioridad || '"');
  end if;
  if old.asignado_a is distinct from new.asignado_a then
    perform public.log_evento_ticket(new.id, 'reasignado', null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_ticket_cambios on public.tickets;
create trigger trg_evento_ticket_cambios
  after update on public.tickets
  for each row execute function public.evento_ticket_cambios();


-- ------------------------------------------------------------
-- TABLA: ticket_satisfaccion
-- ------------------------------------------------------------

create table if not exists public.ticket_satisfaccion (
  id            uuid        primary key default gen_random_uuid(),
  ticket_id     uuid        not null unique references public.tickets(id) on delete cascade,
  nivel         int         check (nivel between 1 and 5),
  comentario    text,
  fecha_envio   timestamptz,  -- NULL = encuesta pendiente de respuesta
  created_at    timestamptz not null default now()
);

comment on table public.ticket_satisfaccion is
  'Encuesta de satisfacción. Se crea vacía (nivel/comentario/fecha_envio NULL) al cerrar el ticket; el empleado la completa vía /ticket/:token/satisfaccion.';

-- Al cerrar un ticket CON empleado identificado, crear el registro de
-- encuesta vacío (si no existe ya) y su evento — el envío del correo lo
-- hace la edge function, no este trigger (no se puede mandar correo desde SQL).
create or replace function public.crear_encuesta_al_cerrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cerrado' and old.estado is distinct from 'cerrado' and new.empleado_id is not null then
    insert into public.ticket_satisfaccion (ticket_id)
    values (new.id)
    on conflict (ticket_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crear_encuesta_al_cerrar on public.tickets;
create trigger trg_crear_encuesta_al_cerrar
  after update on public.tickets
  for each row execute function public.crear_encuesta_al_cerrar();


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.categorias_ticket enable row level security;
create policy "staff puede ver categorias de ticket"
  on public.categorias_ticket for select using (public.es_staff());
create policy "staff puede crear categorias de ticket"
  on public.categorias_ticket for insert with check (public.es_staff());
create policy "staff puede editar categorias de ticket"
  on public.categorias_ticket for update using (public.es_staff());
create policy "solo jefe puede eliminar categorias de ticket"
  on public.categorias_ticket for delete using (public.es_jefe());

alter table public.subcategorias_ticket enable row level security;
create policy "staff puede ver subcategorias de ticket"
  on public.subcategorias_ticket for select using (public.es_staff());
create policy "staff puede crear subcategorias de ticket"
  on public.subcategorias_ticket for insert with check (public.es_staff());
create policy "staff puede editar subcategorias de ticket"
  on public.subcategorias_ticket for update using (public.es_staff());
create policy "solo jefe puede eliminar subcategorias de ticket"
  on public.subcategorias_ticket for delete using (public.es_jefe());

-- tickets: SIN política de INSERT (ni staff ni anon) — la creación es
-- exclusiva de la edge function "tickets" con cliente admin. Mismo
-- patrón ya usado en "entregas".
alter table public.tickets enable row level security;
create policy "staff puede ver tickets"
  on public.tickets for select using (public.es_staff());
create policy "staff puede editar tickets"
  on public.tickets for update using (public.es_staff());

alter table public.ticket_comentarios enable row level security;
create policy "staff puede ver comentarios de ticket"
  on public.ticket_comentarios for select using (public.es_staff());
create policy "staff puede comentar tickets"
  on public.ticket_comentarios for insert with check (public.es_staff());

-- ticket_eventos: solo lectura para staff, sin políticas de escritura
-- (solo triggers, security definer, insertan).
alter table public.ticket_eventos enable row level security;
create policy "staff puede ver eventos de ticket"
  on public.ticket_eventos for select using (public.es_staff());

-- ticket_satisfaccion: solo lectura para staff. La respuesta del empleado
-- la escribe la edge function (admin), nunca el cliente directamente.
alter table public.ticket_satisfaccion enable row level security;
create policy "staff puede ver satisfaccion de ticket"
  on public.ticket_satisfaccion for select using (public.es_staff());

-- ============================================================
-- FIN DE MIGRACIÓN 016
-- ============================================================
