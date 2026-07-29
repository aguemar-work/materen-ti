-- ============================================================
-- MIGRACIÓN 033 — Gestión de Problemas (unifica "Lecciones Aprendidas")
-- Depende de: 003 (es_jefe()/es_staff()), 005 (set_created_updated_by()),
--             007 (set_created_by_only()), 016 (tickets, categorias_ticket)
-- Tablas: problemas, problema_tickets, acciones_correctivas
--
-- Fase 2 acordada: "Lecciones Aprendidas" no es una entidad aparte — se
-- unifica en "problemas" (un problema ya diagnosticado, con causa raíz y
-- acciones correctivas, ES la lección aprendida). Mismas convenciones que
-- kb_articulos (031/032): text + check constraint en vez de enum nativo,
-- softdelete con deleted_at, created_at/updated_at, created_by/updated_by
-- por trigger (nunca por el cliente).
--
-- VERIFICACIÓN PREVIA (2026-07-29): se consultó tickets.es_leccion_aprendida
-- en la BD real antes de tocar nada — 0 filas en true. A diferencia del
-- backfill de kb_articulos (031, que sí se perdió sin certeza), acá se
-- confirmó limpio con dos queries: no hay nada que migrar. La columna se
-- retira sin backfill al final de esta migración. El reemplazo funcional
-- es "Marcar como problema" desde el ticket (igual que el checkbox de KB),
-- que crea una fila en `problemas` con ticket_disparador_id = ese ticket.
-- ============================================================


-- ============================================================
-- TABLA: problemas
-- ============================================================

create table if not exists public.problemas (
  id                    uuid        primary key default gen_random_uuid(),

  titulo                text        not null,

  -- Ticket que originó el problema. Nullable: un problema también puede
  -- detectarse directo (ej. auditoría, patrón notado sin un ticket puntual
  -- de por medio) — mismo criterio que kb_articulos.ticket_origen_id.
  ticket_disparador_id  uuid        references public.tickets(id) on delete set null,

  -- Mismo patrón de check-constraint que tickets.prioridad/equipos.estado.
  severidad             text        not null default 'media'
    check (severidad in ('baja', 'media', 'alta', 'critica')),

  -- Se completa durante el diagnóstico; vacío al abrir el problema.
  causa_raiz            text,

  -- Qué pasó, cronología. Texto plano, mismo criterio que solucion de KB.
  descripcion           text        not null,

  estado                text        not null default 'abierto'
    check (estado in ('abierto', 'diagnostico', 'acciones', 'cerrado')),

  responsable_id        uuid        references auth.users(id) on delete set null,

  created_by            uuid        references auth.users(id) on delete set null,
  updated_by            uuid        references auth.users(id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Softdelete (regla del proyecto): DELETE físico solo JEFE, ver RLS abajo.
  deleted_at            timestamptz
);

create index if not exists idx_problemas_estado
  on public.problemas (estado);

create index if not exists idx_problemas_severidad
  on public.problemas (severidad);

create index if not exists idx_problemas_responsable
  on public.problemas (responsable_id)
  where responsable_id is not null;

create index if not exists idx_problemas_ticket_disparador
  on public.problemas (ticket_disparador_id)
  where ticket_disparador_id is not null;

comment on table public.problemas is
  'Gestión de Problemas: causa raíz y acciones correctivas de incidentes recurrentes o significativos. Incluye lo que iba a ser "Lecciones Aprendidas" — un problema ya diagnosticado y cerrado ES la lección aprendida, no hay entidad separada.';

comment on column public.problemas.estado is
  'abierto -> diagnostico -> acciones -> cerrado. No puede pasar a cerrado con acciones_correctivas pendientes/en_progreso (trigger check_problema_cierre).';

comment on column public.problemas.ticket_disparador_id is
  'Ticket que originó el problema, si aplica. Se vincula automáticamente en problema_tickets al crear (trigger vincular_ticket_disparador).';

create or replace trigger trg_problemas_updated_at
  before update on public.problemas
  for each row execute function set_updated_at();

create or replace trigger trg_problemas_by
  before insert or update on public.problemas
  for each row execute function public.set_created_updated_by();

-- Que un problema quede con responsable requiere que exista y esté activo
-- (mismo patrón que check_asignado_staff_activo de tickets, migración 016).
create or replace function public.check_responsable_problema_activo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsable_id is not null then
    if not exists (
      select 1 from public.staff
      where user_id = new.responsable_id and activo = true
    ) then
      raise exception 'Solo se puede asignar un problema a un miembro de staff activo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_responsable_problema on public.problemas;
create trigger trg_check_responsable_problema
  before insert or update of responsable_id on public.problemas
  for each row execute function public.check_responsable_problema_activo();


-- ============================================================
-- TABLA: problema_tickets (vínculo N:N con tickets recurrentes)
-- ============================================================
-- Junction simple, sin softdelete — desvincular es un DELETE normal,
-- mismo criterio que equipo_accesorios (migración 022): no hay pérdida de
-- dato real, es una edición de relación reversible con volver a vincular.

create table if not exists public.problema_tickets (
  id            uuid        primary key default gen_random_uuid(),
  problema_id   uuid        not null references public.problemas(id) on delete cascade,
  ticket_id     uuid        not null references public.tickets(id) on delete cascade,
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users(id) on delete set null,

  unique (problema_id, ticket_id)
);

create index if not exists idx_problema_tickets_problema
  on public.problema_tickets (problema_id);

create index if not exists idx_problema_tickets_ticket
  on public.problema_tickets (ticket_id);

comment on table public.problema_tickets is
  'Vincula tickets recurrentes a un mismo problema. Se llena solo (trigger vincular_ticket_disparador) para el ticket_disparador_id; los demás tickets recurrentes se agregan a mano desde la vista de detalle.';

create or replace trigger trg_problema_tickets_by
  before insert on public.problema_tickets
  for each row execute function public.set_created_by_only();

-- Autovincula ticket_disparador_id como primera fila de problema_tickets al
-- crear el problema — evita que el cliente tenga que recordar dos inserts
-- (mismo espíritu que created_by/updated_by por trigger, nunca por el
-- cliente). Si el problema se crea sin ticket_disparador_id (detectado
-- directo), no inserta nada.
create or replace function public.vincular_ticket_disparador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ticket_disparador_id is not null then
    insert into public.problema_tickets (problema_id, ticket_id, created_by)
    values (new.id, new.ticket_disparador_id, new.created_by)
    on conflict (problema_id, ticket_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vincular_ticket_disparador on public.problemas;
create trigger trg_vincular_ticket_disparador
  after insert on public.problemas
  for each row execute function public.vincular_ticket_disparador();


-- ============================================================
-- TABLA: acciones_correctivas
-- ============================================================

create table if not exists public.acciones_correctivas (
  id                uuid        primary key default gen_random_uuid(),
  problema_id       uuid        not null references public.problemas(id) on delete cascade,

  descripcion       text        not null,
  responsable_id    uuid        references auth.users(id) on delete set null,
  fecha_limite      date        not null,

  estado            text        not null default 'pendiente'
    check (estado in ('pendiente', 'en_progreso', 'completada')),

  -- La llena el trigger al pasar a 'completada' (mismo criterio que
  -- ticket_satisfaccion.fecha_envio); se limpia si se reabre.
  fecha_completada  timestamptz,

  created_by        uuid        references auth.users(id) on delete set null,
  updated_by        uuid        references auth.users(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  deleted_at        timestamptz
);

create index if not exists idx_acciones_correctivas_problema
  on public.acciones_correctivas (problema_id);

-- Índice que alimenta el aviso de vencidas (feed de Pendientes del
-- Dashboard, mismo patrón que licenciasPorVencer/garantiasPorVencer): solo
-- las acciones abiertas importan para ese cálculo.
create index if not exists idx_acciones_correctivas_vencidas
  on public.acciones_correctivas (fecha_limite)
  where estado in ('pendiente', 'en_progreso') and deleted_at is null;

comment on table public.acciones_correctivas is
  'Acciones correctivas de un problema. Un problema no puede cerrarse con acciones en pendiente/en_progreso (trigger check_problema_cierre).';

comment on column public.acciones_correctivas.fecha_completada is
  'NULL mientras no esté completada. La llena/limpia el trigger set_fecha_completada según el cambio de estado.';

create or replace trigger trg_acciones_correctivas_updated_at
  before update on public.acciones_correctivas
  for each row execute function set_updated_at();

create or replace trigger trg_acciones_correctivas_by
  before insert or update on public.acciones_correctivas
  for each row execute function public.set_created_updated_by();

create or replace function public.set_fecha_completada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'completada' and old.estado is distinct from 'completada' then
    new.fecha_completada := now();
  elsif new.estado is distinct from 'completada' and old.estado = 'completada' then
    new.fecha_completada := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_fecha_completada on public.acciones_correctivas;
create trigger trg_set_fecha_completada
  before update of estado on public.acciones_correctivas
  for each row execute function public.set_fecha_completada();

-- Que una acción correctiva quede con responsable requiere staff activo
-- (mismo patrón que problemas.responsable_id/tickets.asignado_a).
create or replace function public.check_responsable_accion_activo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsable_id is not null then
    if not exists (
      select 1 from public.staff
      where user_id = new.responsable_id and activo = true
    ) then
      raise exception 'Solo se puede asignar una acción correctiva a un miembro de staff activo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_responsable_accion on public.acciones_correctivas;
create trigger trg_check_responsable_accion
  before insert or update of responsable_id on public.acciones_correctivas
  for each row execute function public.check_responsable_accion_activo();

-- Un problema cerrado no acepta acciones correctivas nuevas ni reabiertas
-- salvo que se reabra el problema primero — mismo criterio que
-- check_ticket_no_cerrado (migración 016) sobre ticket_comentarios.
create or replace function public.check_problema_no_cerrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado into v_estado from public.problemas where id = new.problema_id;
  if v_estado = 'cerrado' then
    raise exception 'El problema está cerrado. Reábrelo antes de agregar o reactivar acciones correctivas.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_problema_no_cerrado_insert on public.acciones_correctivas;
create trigger trg_check_problema_no_cerrado_insert
  before insert on public.acciones_correctivas
  for each row execute function public.check_problema_no_cerrado();

drop trigger if exists trg_check_problema_no_cerrado_update on public.acciones_correctivas;
create trigger trg_check_problema_no_cerrado_update
  before update of estado on public.acciones_correctivas
  for each row
  when (old.estado = 'completada' and new.estado <> 'completada')
  execute function public.check_problema_no_cerrado();

-- Regla de negocio: un problema no puede pasar a cerrado si tiene acciones
-- correctivas en pendiente o en_progreso. Cruza tablas, por eso es trigger
-- y no un check constraint plano (igual que check_ticket_no_cerrado).
create or replace function public.check_problema_cierre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cerrado' and old.estado is distinct from 'cerrado' then
    if exists (
      select 1 from public.acciones_correctivas
      where problema_id = new.id
        and estado in ('pendiente', 'en_progreso')
        and deleted_at is null
    ) then
      raise exception 'No se puede cerrar el problema: tiene acciones correctivas en pendiente o en_progreso.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_problema_cierre on public.problemas;
create trigger trg_check_problema_cierre
  before update of estado on public.problemas
  for each row execute function public.check_problema_cierre();


-- ============================================================
-- RLS
-- ============================================================
-- Mismo criterio que tickets (trabajo operativo compartido, no borrador
-- personal como KB): cualquier staff activo ve/crea/edita; el DELETE físico
-- (solo en las tablas con deleted_at) es exclusivo de JEFE. problema_tickets
-- no tiene deleted_at, así que su DELETE lo puede hacer cualquier staff,
-- mismo criterio que equipo_accesorios.

alter table public.problemas enable row level security;

drop policy if exists "staff puede ver problemas" on public.problemas;
create policy "staff puede ver problemas"
  on public.problemas for select
  using (es_staff());

drop policy if exists "staff puede crear problemas" on public.problemas;
create policy "staff puede crear problemas"
  on public.problemas for insert
  with check (es_staff());

drop policy if exists "staff puede editar problemas" on public.problemas;
create policy "staff puede editar problemas"
  on public.problemas for update
  using (es_staff());

drop policy if exists "solo jefe elimina problemas" on public.problemas;
create policy "solo jefe elimina problemas"
  on public.problemas for delete
  using (es_jefe());

alter table public.problema_tickets enable row level security;

drop policy if exists "staff puede ver problema_tickets" on public.problema_tickets;
create policy "staff puede ver problema_tickets"
  on public.problema_tickets for select
  using (es_staff());

drop policy if exists "staff puede vincular problema_tickets" on public.problema_tickets;
create policy "staff puede vincular problema_tickets"
  on public.problema_tickets for insert
  with check (es_staff());

drop policy if exists "staff puede desvincular problema_tickets" on public.problema_tickets;
create policy "staff puede desvincular problema_tickets"
  on public.problema_tickets for delete
  using (es_staff());

alter table public.acciones_correctivas enable row level security;

drop policy if exists "staff puede ver acciones_correctivas" on public.acciones_correctivas;
create policy "staff puede ver acciones_correctivas"
  on public.acciones_correctivas for select
  using (es_staff());

drop policy if exists "staff puede crear acciones_correctivas" on public.acciones_correctivas;
create policy "staff puede crear acciones_correctivas"
  on public.acciones_correctivas for insert
  with check (es_staff());

drop policy if exists "staff puede editar acciones_correctivas" on public.acciones_correctivas;
create policy "staff puede editar acciones_correctivas"
  on public.acciones_correctivas for update
  using (es_staff());

drop policy if exists "solo jefe elimina acciones_correctivas" on public.acciones_correctivas;
create policy "solo jefe elimina acciones_correctivas"
  on public.acciones_correctivas for delete
  using (es_jefe());


-- ============================================================
-- Retirar el flag reemplazado
-- ============================================================
-- Verificado (2026-07-29, ver contexto arriba): 0 tickets con
-- es_leccion_aprendida = true en la BD real. Sin backfill.

alter table public.tickets drop column if exists es_leccion_aprendida;

-- ============================================================
-- FIN DE MIGRACIÓN 033
-- ============================================================
