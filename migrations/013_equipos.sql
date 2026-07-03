-- ============================================================
-- MIGRACIÓN 013 — Módulo de inventario de equipos (Fase 1)
-- Depende de: 001..012
-- Tablas: tipos_equipo, equipos, asignaciones_equipo, eventos_equipo
--
-- Principios (definidos con el JEFE):
--   - "Asignado/Disponible" NO se guarda: se deriva de la asignación
--     activa. El estado guardado es solo el físico:
--     operativo / en_reparacion / de_baja / perdido
--   - La baja de empleado NO cierra asignaciones de equipos: quedan
--     "pendientes de devolución" hasta registrar la devolución física.
--   - eventos_equipo es la hoja de vida del activo: append-only,
--     escrita por triggers. Nadie la edita ni borra desde el cliente.
--   - specs y accesorios se definen por plantilla en tipos_equipo.
-- ============================================================


-- ------------------------------------------------------------
-- TABLA: tipos_equipo (catálogo con plantillas)
-- ------------------------------------------------------------

create table if not exists public.tipos_equipo (
  id                    text        primary key,   -- slug: laptop, celular...
  nombre                text        not null,
  -- Campos de especificaciones que pide este tipo: ["RAM","Procesador"...]
  campos_spec           jsonb       not null default '[]',
  -- Accesorios sugeridos al entregar: ["Cargador","Mochila"...]
  accesorios_sugeridos  jsonb       not null default '[]',
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.tipos_equipo is
  'Catálogo de tipos de equipo con su plantilla de specs y accesorios sugeridos.';

create or replace trigger trg_tipos_equipo_updated_at
  before update on public.tipos_equipo
  for each row execute function set_updated_at();

insert into public.tipos_equipo (id, nombre, campos_spec, accesorios_sugeridos) values
  ('laptop',    'Laptop',    '["Procesador","RAM","Disco","Sistema operativo"]', '["Cargador","Mochila","Mouse"]'),
  ('desktop',   'Desktop',   '["Procesador","RAM","Disco","Sistema operativo"]', '["Teclado","Mouse","Estabilizador"]'),
  ('monitor',   'Monitor',   '["Tamaño","Resolución"]',                          '["Cable HDMI","Cable de poder"]'),
  ('impresora', 'Impresora', '["Tecnología","Conectividad"]',                    '["Cable USB","Cable de poder"]'),
  ('celular',   'Celular',   '["Almacenamiento","RAM","IMEI"]',                  '["Cargador","Funda","Chip"]'),
  ('tablet',    'Tablet',    '["Almacenamiento","RAM"]',                         '["Cargador","Funda"]'),
  ('otro',      'Otro',      '[]',                                               '[]')
on conflict (id) do nothing;


-- ------------------------------------------------------------
-- TABLA: equipos
-- ------------------------------------------------------------

create table if not exists public.equipos (
  id              uuid        primary key default gen_random_uuid(),

  -- Código de inventario interno (etiqueta física). Único.
  codigo          text        not null unique,

  tipo_id         text        not null references public.tipos_equipo(id) on delete restrict,
  marca           text,
  modelo          text,
  serie           text,       -- nro de serie del fabricante (a veces ilegible)

  empresa_id      uuid        references public.empresas(id) on delete restrict,

  -- SOLO estado físico. Disponible/Asignado se deriva de la asignación activa.
  estado          text        not null default 'operativo'
    check (estado in ('operativo', 'en_reparacion', 'de_baja', 'perdido')),

  fecha_compra    date,
  costo           numeric(12,2),
  moneda          varchar(3),
  garantia_hasta  date,

  -- Valores de la plantilla del tipo: {"RAM":"16GB","Procesador":"i7"...}
  specs           jsonb       not null default '{}',
  -- Accesorios que acompañan al equipo: ["Cargador","Mochila"]
  accesorios      jsonb       not null default '[]',

  notas           text,
  deleted_at      timestamptz,
  created_by      uuid        references auth.users(id) on delete set null,
  updated_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Serie única cuando existe (dos equipos vivos no pueden compartir serie)
create unique index if not exists uq_equipos_serie
  on public.equipos (serie)
  where serie is not null and deleted_at is null;

create index if not exists idx_equipos_estado
  on public.equipos (estado)
  where deleted_at is null;

create index if not exists idx_equipos_garantia
  on public.equipos (garantia_hasta)
  where deleted_at is null and garantia_hasta is not null;

comment on table public.equipos is
  'Activos físicos de TI. estado = físico; Disponible/Asignado se deriva de asignaciones_equipo.';

create or replace trigger trg_equipos_updated_at
  before update on public.equipos
  for each row execute function set_updated_at();

create or replace trigger trg_equipos_by
  before insert or update on public.equipos
  for each row execute function public.set_created_updated_by();


-- ------------------------------------------------------------
-- TABLA: asignaciones_equipo
-- ------------------------------------------------------------

create table if not exists public.asignaciones_equipo (
  id                    uuid        primary key default gen_random_uuid(),
  equipo_id             uuid        not null references public.equipos(id) on delete cascade,
  empleado_id           uuid        not null references public.empleados(id) on delete cascade,
  fecha_inicio          date        not null default current_date,
  fecha_fin             date,
  -- El mundo físico: en qué condición se entregó y en cuál volvió
  condicion_entrega     text,
  condicion_devolucion  text,
  -- devolucion | cambio_equipo | baja_empleado | perdida
  motivo_cierre         text,
  notas                 text,
  created_by            uuid        references auth.users(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists idx_asig_equipo_empleado
  on public.asignaciones_equipo (empleado_id)
  where fecha_fin is null;

create index if not exists idx_asig_equipo_equipo
  on public.asignaciones_equipo (equipo_id);

comment on table public.asignaciones_equipo is
  'Quién porta cada equipo. fecha_fin NULL = lo tiene ahora. La baja de empleado NO la cierra: se cierra al registrar la devolución física.';


-- ------------------------------------------------------------
-- TABLA: eventos_equipo (hoja de vida, append-only)
-- ------------------------------------------------------------

create table if not exists public.eventos_equipo (
  id          uuid        primary key default gen_random_uuid(),
  equipo_id   uuid        not null references public.equipos(id) on delete cascade,
  evento      text        not null
    check (evento in ('registrado', 'asignado', 'devuelto', 'estado_cambiado')),
  detalle     text,
  user_id     uuid        references auth.users(id) on delete set null,
  user_email  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_eventos_equipo
  on public.eventos_equipo (equipo_id, created_at desc);

comment on table public.eventos_equipo is
  'Hoja de vida del equipo. Solo la escriben triggers; nadie la edita desde el cliente.';


-- ------------------------------------------------------------
-- TRIGGERS: hoja de vida + reglas de asignación
-- ------------------------------------------------------------

-- Helper: escribir un evento con el usuario actual (security definer
-- para poder leer auth.users e insertar saltando RLS)
create or replace function public.log_evento_equipo(p_equipo uuid, p_evento text, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  insert into public.eventos_equipo (equipo_id, evento, detalle, user_id, user_email)
  values (p_equipo, p_evento, p_detalle, auth.uid(), v_email);
end;
$$;

-- Al registrar un equipo
create or replace function public.evento_equipo_registrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_evento_equipo(new.id, 'registrado', 'Código ' || new.codigo);
  return new;
end;
$$;

drop trigger if exists trg_evento_equipo_registrado on public.equipos;
create trigger trg_evento_equipo_registrado
  after insert on public.equipos
  for each row execute function public.evento_equipo_registrado();

-- Al cambiar el estado físico
create or replace function public.evento_equipo_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado is distinct from new.estado then
    perform public.log_evento_equipo(new.id, 'estado_cambiado',
      'De "' || old.estado || '" a "' || new.estado || '"');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_equipo_estado on public.equipos;
create trigger trg_evento_equipo_estado
  after update on public.equipos
  for each row execute function public.evento_equipo_estado();

-- Regla + evento al asignar: solo equipos operativos y sin portador
create or replace function public.check_asignacion_equipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_codigo text;
  v_activas int;
  v_nombre text;
begin
  select estado, codigo into v_estado, v_codigo
  from public.equipos where id = new.equipo_id and deleted_at is null;

  if v_estado is null then
    raise exception 'El equipo no existe o está eliminado.';
  end if;

  if v_estado <> 'operativo' then
    raise exception 'El equipo % no está operativo (estado: %). No se puede asignar.', v_codigo, v_estado;
  end if;

  select count(*) into v_activas
  from public.asignaciones_equipo
  where equipo_id = new.equipo_id and fecha_fin is null;

  if v_activas > 0 then
    raise exception 'El equipo % ya tiene un portador activo. Registra la devolución antes de reasignar.', v_codigo;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_asignacion_equipo on public.asignaciones_equipo;
create trigger trg_check_asignacion_equipo
  before insert on public.asignaciones_equipo
  for each row execute function public.check_asignacion_equipo();

-- Eventos de asignación y devolución
create or replace function public.evento_asignacion_equipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  select nombres || ' ' || apellidos into v_nombre
  from public.empleados where id = new.empleado_id;

  if tg_op = 'INSERT' then
    perform public.log_evento_equipo(new.equipo_id, 'asignado',
      'Entregado a ' || coalesce(v_nombre, '?') ||
      coalesce(' — ' || new.condicion_entrega, ''));
  elsif tg_op = 'UPDATE' and old.fecha_fin is null and new.fecha_fin is not null then
    perform public.log_evento_equipo(new.equipo_id, 'devuelto',
      'Devuelto por ' || coalesce(v_nombre, '?') ||
      coalesce(' — ' || new.condicion_devolucion, '') ||
      coalesce(' (' || new.motivo_cierre || ')', ''));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_asignacion_equipo on public.asignaciones_equipo;
create trigger trg_evento_asignacion_equipo
  after insert or update on public.asignaciones_equipo
  for each row execute function public.evento_asignacion_equipo();

create or replace trigger trg_asig_equipo_by
  before insert on public.asignaciones_equipo
  for each row execute function public.set_created_by_only();


-- ------------------------------------------------------------
-- RLS — mismo esquema: staff opera, JEFE elimina
-- ------------------------------------------------------------

alter table public.tipos_equipo enable row level security;
create policy "staff puede ver tipos de equipo"
  on public.tipos_equipo for select using (public.es_staff());
create policy "staff puede crear tipos de equipo"
  on public.tipos_equipo for insert with check (public.es_staff());
create policy "staff puede editar tipos de equipo"
  on public.tipos_equipo for update using (public.es_staff());
create policy "solo jefe puede eliminar tipos de equipo"
  on public.tipos_equipo for delete using (public.es_jefe());

alter table public.equipos enable row level security;
create policy "staff puede ver equipos"
  on public.equipos for select using (public.es_staff());
create policy "staff puede crear equipos"
  on public.equipos for insert with check (public.es_staff());
create policy "staff puede editar equipos"
  on public.equipos for update using (public.es_staff());
create policy "solo jefe puede eliminar equipos"
  on public.equipos for delete using (public.es_jefe());

alter table public.asignaciones_equipo enable row level security;
create policy "staff puede ver asignaciones de equipo"
  on public.asignaciones_equipo for select using (public.es_staff());
create policy "staff puede crear asignaciones de equipo"
  on public.asignaciones_equipo for insert with check (public.es_staff());
create policy "staff puede cerrar asignaciones de equipo"
  on public.asignaciones_equipo for update using (public.es_staff());
create policy "solo jefe puede eliminar asignaciones de equipo"
  on public.asignaciones_equipo for delete using (public.es_jefe());

-- Hoja de vida: solo lectura para staff. Sin políticas de escritura:
-- únicamente los triggers (security definer) insertan.
alter table public.eventos_equipo enable row level security;
create policy "staff puede ver eventos de equipo"
  on public.eventos_equipo for select using (public.es_staff());

-- ============================================================
-- FIN DE MIGRACIÓN 013
-- ============================================================
