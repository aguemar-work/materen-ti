-- ============================================================
-- MIGRACIÓN 022 — Accesorios de equipo con código de almacén
-- Depende de: 013 (equipos, tipos_equipo)
-- Nota: renumerada desde 021 por conflicto con 021_areas_obras_trazabilidad.
--
-- Los periféricos del kit (mouse, teclado, audífonos…) dejan de ser
-- solo strings en equipos.accesorios y pasan a líneas editables con
-- código/descripción del almacén. Los activos grandes (laptop,
-- monitor…) siguen en equipos.
--
-- equipos.accesorios (jsonb) se conserva sincronizado como etiquetas
-- de texto para no romper lecturas antiguas; la fuente de verdad es
-- equipo_accesorios.
-- ============================================================

-- ------------------------------------------------------------
-- TABLA: catalogo_almacen (código + descripción del almacén)
-- ------------------------------------------------------------

create table if not exists public.catalogo_almacen (
  id           uuid        primary key default gen_random_uuid(),
  codigo       text,       -- código del sistema de almacén (opcional al migrar)
  descripcion  text        not null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.catalogo_almacen is
  'Ítems del almacén (código + descripción) reutilizables en kits de equipos.';

create unique index if not exists uq_catalogo_almacen_codigo
  on public.catalogo_almacen (upper(codigo))
  where codigo is not null and deleted_at is null;

create index if not exists idx_catalogo_almacen_descripcion
  on public.catalogo_almacen (descripcion)
  where deleted_at is null;

create or replace trigger trg_catalogo_almacen_updated_at
  before update on public.catalogo_almacen
  for each row execute function set_updated_at();


-- ------------------------------------------------------------
-- TABLA: equipo_accesorios (líneas del kit por equipo)
-- ------------------------------------------------------------

create table if not exists public.equipo_accesorios (
  id            uuid        primary key default gen_random_uuid(),
  equipo_id     uuid        not null references public.equipos(id) on delete cascade,
  catalogo_id   uuid        references public.catalogo_almacen(id) on delete set null,
  -- Snapshot: si el catálogo cambia después, el kit del equipo no se altera
  codigo        text,
  descripcion   text        not null,
  cantidad      integer     not null default 1
    check (cantidad > 0 and cantidad <= 999),
  orden         integer     not null default 0,
  created_at    timestamptz not null default now()
);

comment on table public.equipo_accesorios is
  'Accesorios incluidos con un equipo (kit). codigo/descripcion son snapshot del almacén.';

create index if not exists idx_equipo_accesorios_equipo
  on public.equipo_accesorios (equipo_id, orden);


-- ------------------------------------------------------------
-- Seed catálogo desde sugeridos de tipos + strings ya guardados
-- ------------------------------------------------------------

insert into public.catalogo_almacen (descripcion)
select distinct trim(s.descripcion) as descripcion
from public.tipos_equipo t
cross join lateral jsonb_array_elements_text(coalesce(t.accesorios_sugeridos, '[]'::jsonb)) as s(descripcion)
where t.deleted_at is null
  and length(trim(s.descripcion)) > 0
  and not exists (
    select 1 from public.catalogo_almacen c
    where c.deleted_at is null
      and lower(c.descripcion) = lower(trim(s.descripcion))
  );

insert into public.catalogo_almacen (descripcion)
select distinct trim(s.descripcion) as descripcion
from public.equipos e
cross join lateral jsonb_array_elements_text(coalesce(e.accesorios, '[]'::jsonb)) as s(descripcion)
where e.deleted_at is null
  and length(trim(s.descripcion)) > 0
  and not exists (
    select 1 from public.catalogo_almacen c
    where c.deleted_at is null
      and lower(c.descripcion) = lower(trim(s.descripcion))
  );


-- ------------------------------------------------------------
-- Migrar equipos.accesorios[] → equipo_accesorios
-- ------------------------------------------------------------

insert into public.equipo_accesorios (equipo_id, catalogo_id, codigo, descripcion, cantidad, orden)
select
  e.id,
  c.id,
  c.codigo,
  trim(s.descripcion),
  1,
  (s.ordinality - 1)::integer
from public.equipos e
cross join lateral jsonb_array_elements_text(coalesce(e.accesorios, '[]'::jsonb))
  with ordinality as s(descripcion, ordinality)
left join public.catalogo_almacen c
  on c.deleted_at is null
 and lower(c.descripcion) = lower(trim(s.descripcion))
where e.deleted_at is null
  and length(trim(s.descripcion)) > 0
  and not exists (
    select 1 from public.equipo_accesorios ea
    where ea.equipo_id = e.id
      and lower(ea.descripcion) = lower(trim(s.descripcion))
  );


-- ------------------------------------------------------------
-- RLS — staff opera, JEFE elimina (mismo esquema)
-- ------------------------------------------------------------

alter table public.catalogo_almacen enable row level security;
create policy "staff puede ver catalogo_almacen"
  on public.catalogo_almacen for select using (public.es_staff());
create policy "staff puede crear catalogo_almacen"
  on public.catalogo_almacen for insert with check (public.es_staff());
create policy "staff puede editar catalogo_almacen"
  on public.catalogo_almacen for update using (public.es_staff());
create policy "solo jefe puede eliminar catalogo_almacen"
  on public.catalogo_almacen for delete using (public.es_jefe());

alter table public.equipo_accesorios enable row level security;
create policy "staff puede ver equipo_accesorios"
  on public.equipo_accesorios for select using (public.es_staff());
create policy "staff puede crear equipo_accesorios"
  on public.equipo_accesorios for insert with check (public.es_staff());
create policy "staff puede editar equipo_accesorios"
  on public.equipo_accesorios for update using (public.es_staff());
create policy "staff puede borrar equipo_accesorios"
  on public.equipo_accesorios for delete using (public.es_staff());

-- ============================================================
-- FIN DE MIGRACIÓN 021
-- ============================================================
