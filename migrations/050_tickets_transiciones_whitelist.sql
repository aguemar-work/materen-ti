-- ============================================================
-- MIGRACIÓN 050 — Máquina de estados formal para Tickets
-- Depende de: 016 (tickets), 017 (check_reabrir_solo_jefe), 019 (check_transicion_ticket)
--
-- Contexto: las reglas de transición se fueron agregando reactivamente,
-- una por hallazgo de auditoría: check_reabrir_solo_jefe (017) solo mira
-- si el DESTINO es 'reabierto'; check_transicion_ticket (019) solo mira
-- si el ORIGEN es 'cerrado'/'rechazado'. Ninguna de las dos es una
-- whitelist — un ASISTENTE con UPDATE (RLS es_staff()) puede hacer
-- transiciones no contempladas por ningún candado puntual, ej.
-- 'abierto' -> 'cerrado' directo, o 'resuelto' -> 'abierto'.
--
-- Esta migración reemplaza ambos triggers por una única tabla de
-- transiciones permitidas (whitelist, default-deny): cualquier cambio
-- de estado que no esté en la tabla se rechaza, sin excepción.
-- check_iniciar_completo (017/035) NO se toca: valida integridad de
-- columnas (nivel_atencion/asignado_a/tipo) al iniciar, no la legalidad
-- de la transición en sí — son preocupaciones distintas y pueden
-- convivir (ambos triggers BEFORE UPDATE se disparan igual).
-- ============================================================

create table if not exists public.transiciones_ticket_permitidas (
  origen        text    not null,
  destino       text    not null,
  requiere_jefe boolean not null default false,
  primary key (origen, destino)
);

comment on table public.transiciones_ticket_permitidas is
  'Whitelist de transiciones de estado válidas para tickets. Sin policy de escritura para el cliente: se administra solo por migración, igual que categorias_ticket.';

insert into public.transiciones_ticket_permitidas (origen, destino, requiere_jefe) values
  ('abierto', 'en_progreso', false),
  ('abierto', 'rechazado', false),
  ('en_progreso', 'resuelto', false),
  ('reabierto', 'resuelto', false),
  ('resuelto', 'cerrado', false),
  ('cerrado', 'reabierto', true),
  ('rechazado', 'reabierto', true)
on conflict (origen, destino) do update set requiere_jefe = excluded.requiere_jefe;

alter table public.transiciones_ticket_permitidas enable row level security;

create policy "staff puede ver transiciones permitidas"
  on public.transiciones_ticket_permitidas for select
  using (public.es_staff());

-- ------------------------------------------------------------
-- Trigger único: reemplaza check_reabrir_solo_jefe (017) y
-- check_transicion_ticket (019).
-- ------------------------------------------------------------

create or replace function public.check_transicion_ticket_permitida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regla record;
begin
  if old.estado is distinct from new.estado then
    select * into v_regla from public.transiciones_ticket_permitidas
      where origen = old.estado and destino = new.estado;

    if v_regla is null then
      raise exception 'Transición de "%" a "%" no permitida.', old.estado, new.estado;
    end if;

    if v_regla.requiere_jefe and not public.es_jefe() then
      raise exception 'Solo el jefe puede hacer esta transición ("%" a "%").', old.estado, new.estado;
    end if;
  end if;
  return new;
end;
$$;

alter function public.check_transicion_ticket_permitida() owner to project_admin;

drop trigger if exists trg_check_reabrir_solo_jefe on public.tickets;
drop trigger if exists trg_check_transicion_ticket on public.tickets;
drop function if exists public.check_reabrir_solo_jefe();
drop function if exists public.check_transicion_ticket();

drop trigger if exists trg_check_transicion_ticket_permitida on public.tickets;
create trigger trg_check_transicion_ticket_permitida
  before update on public.tickets
  for each row execute function public.check_transicion_ticket_permitida();

-- ============================================================
-- FIN DE MIGRACIÓN 050
-- ============================================================
