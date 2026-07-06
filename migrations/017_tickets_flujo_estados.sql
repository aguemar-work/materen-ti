-- ============================================================
-- MIGRACIÓN 017 — Flujo de estados guiado para Tickets
-- Depende de: 016
--
-- Cambios de negocio (decisión del usuario, jul 2026):
--   - Nuevo estado terminal 'rechazado', distinto de 'cerrado':
--     no dispara la encuesta de satisfacción ni se mezcla con
--     tickets resueltos en reportes.
--   - Nuevo campo nivel_atencion (N1/N2/N3), clasificación interna
--     de triage — igual que prioridad, nunca visible al empleado.
--   - Al pasar a "en_progreso" (botón Iniciar) se exige tener
--     nivel_atencion y asignado_a ya cargados (prioridad siempre
--     tiene default, no necesita el mismo candado).
--   - Solo el JEFE puede reabrir un ticket cerrado/rechazado.
--   - Búsqueda pública por DNI (solo tickets activos, con límite
--     de intentos por IP para frenar enumeración básica).
-- ============================================================


-- ------------------------------------------------------------
-- estado: agregar 'rechazado'
-- ------------------------------------------------------------

alter table public.tickets drop constraint if exists tickets_estado_check;
alter table public.tickets add constraint tickets_estado_check
  check (estado in ('abierto', 'en_progreso', 'resuelto', 'cerrado', 'reabierto', 'rechazado'));

comment on column public.tickets.estado is
  'abierto -> en_progreso -> resuelto -> cerrado (+reabierto). "rechazado" es terminal alterno desde abierto, sin encuesta.';


-- ------------------------------------------------------------
-- nivel_atencion: clasificación interna de triage
-- ------------------------------------------------------------

alter table public.tickets add column if not exists nivel_atencion text
  check (nivel_atencion in ('N1', 'N2', 'N3'));

comment on column public.tickets.nivel_atencion is
  'Nivel de atención interno (N1/N2/N3), como prioridad: nunca visible en el seguimiento público del empleado.';


-- ------------------------------------------------------------
-- ticket_comentarios: bloquear también en 'rechazado'
-- ------------------------------------------------------------

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
  if v_estado in ('cerrado', 'rechazado') then
    raise exception 'El ticket está % . Reábrelo antes de agregar comentarios.', v_estado;
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- Iniciar (abierto -> en_progreso) exige nivel_atencion + asignado_a
-- ------------------------------------------------------------

create or replace function public.check_iniciar_completo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'en_progreso' and old.estado is distinct from 'en_progreso' then
    if new.nivel_atencion is null then
      raise exception 'Para iniciar un ticket hay que asignar un nivel de atención (N1/N2/N3).';
    end if;
    if new.asignado_a is null then
      raise exception 'Para iniciar un ticket hay que asignarlo a un miembro del staff.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_iniciar_completo on public.tickets;
create trigger trg_check_iniciar_completo
  before update on public.tickets
  for each row execute function public.check_iniciar_completo();


-- ------------------------------------------------------------
-- Reabrir: solo JEFE
-- ------------------------------------------------------------

create or replace function public.check_reabrir_solo_jefe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'reabierto' and old.estado is distinct from 'reabierto' and not public.es_jefe() then
    raise exception 'Solo el jefe puede reabrir un ticket.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_reabrir_solo_jefe on public.tickets;
create trigger trg_check_reabrir_solo_jefe
  before update on public.tickets
  for each row execute function public.check_reabrir_solo_jefe();


-- ------------------------------------------------------------
-- Hoja de vida: loguear también cambios de nivel_atencion
-- ------------------------------------------------------------

alter table public.ticket_eventos drop constraint if exists ticket_eventos_evento_check;
alter table public.ticket_eventos add constraint ticket_eventos_evento_check
  check (evento in (
    'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
    'nivel_atencion_cambiado', 'correo_fallido', 'encuesta_enviada', 'encuesta_respondida'
  ));

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
  if old.nivel_atencion is distinct from new.nivel_atencion then
    perform public.log_evento_ticket(new.id, 'nivel_atencion_cambiado',
      'De "' || coalesce(old.nivel_atencion, 'sin definir') || '" a "' || coalesce(new.nivel_atencion, 'sin definir') || '"');
  end if;
  if old.asignado_a is distinct from new.asignado_a then
    perform public.log_evento_ticket(new.id, 'reasignado', null);
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- TABLA: ticket_busqueda_intentos (rate-limit de la búsqueda por DNI)
-- ------------------------------------------------------------

create table if not exists public.ticket_busqueda_intentos (
  id          uuid        primary key default gen_random_uuid(),
  ip          text        not null,
  dni         text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ticket_busqueda_ip_fecha
  on public.ticket_busqueda_intentos (ip, created_at);

comment on table public.ticket_busqueda_intentos is
  'Registro de intentos de búsqueda pública de tickets por DNI, para frenar enumeración. Solo la escribe/lee la edge function (admin).';

alter table public.ticket_busqueda_intentos enable row level security;
create policy "jefe puede ver intentos de busqueda de ticket"
  on public.ticket_busqueda_intentos for select using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 017
-- ============================================================
