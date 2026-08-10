-- ============================================================
-- MIGRACIÓN 043 — Módulo de Encuestas (plantillas + rondas)
-- Depende de: 003 (es_staff/es_jefe), patrón de 010 (entregas: token +
-- índice parcial + mutación pública solo vía edge function)
--
-- Contexto: encuesta anónima reutilizable — se define una plantilla una
-- vez (preguntas de 5 tipos fijos) y se relanza como "ronda" cada vez que
-- TI quiere recolectar feedback, sin mezclar respuestas entre rondas.
-- Solo JEFE crea/edita plantillas y abre/cierra rondas (mismo criterio
-- que la tabla `staff`); cualquier staff ve resultados y exporta.
-- ============================================================

-- ============================================================
-- TABLA: encuestas (la plantilla)
-- ============================================================

create table if not exists public.encuestas (
  id          uuid        primary key default gen_random_uuid(),
  titulo      text        not null,
  descripcion text,
  -- Array ordenado de { id, tipo, etiqueta, requerido, opciones? }.
  -- tipo ∈ texto_corto | texto_largo | opcion_unica | escala_1_5 | si_no
  -- (catálogo fijo en frontend/core/dominio-encuestas.js, no en BD).
  preguntas   jsonb       not null default '[]'::jsonb,
  created_by  uuid        references auth.users(id) on delete set null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.encuestas is
  'Plantillas de encuesta anónima (preguntas reutilizables). Cada envío real es una fila en encuesta_rondas.';

comment on column public.encuestas.preguntas is
  'Array ordenado de preguntas: [{id, tipo, etiqueta, requerido, opciones?}]. No editable si la encuesta ya tiene rondas (ver trigger).';

create trigger trg_encuestas_updated_at
  before update on public.encuestas
  for each row execute function set_updated_at();

-- Guarda de integridad: si ya existe al menos una ronda, "preguntas" no
-- se puede tocar (invalidaría respuestas ya guardadas contra ese set de
-- preguntas). El resto de columnas (titulo, descripcion, deleted_at) sí.
create or replace function public.check_encuesta_preguntas_inmutables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tiene_rondas boolean;
begin
  if new.preguntas is distinct from old.preguntas then
    select exists(select 1 from public.encuesta_rondas where encuesta_id = old.id)
      into v_tiene_rondas;
    if v_tiene_rondas then
      raise exception
        'Esta encuesta ya tiene rondas creadas: no se pueden editar sus preguntas. Duplica la plantilla si necesitas preguntas distintas.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_encuesta_preguntas on public.encuestas;

create trigger trg_check_encuesta_preguntas
  before update on public.encuestas
  for each row execute function public.check_encuesta_preguntas_inmutables();

alter table public.encuestas enable row level security;

create policy "staff puede ver encuestas"
  on public.encuestas for select using (public.es_staff());

create policy "solo jefe puede crear encuestas"
  on public.encuestas for insert with check (public.es_jefe());

create policy "solo jefe puede editar encuestas"
  on public.encuestas for update using (public.es_jefe());

create policy "solo jefe puede eliminar encuestas"
  on public.encuestas for delete using (public.es_jefe());

-- ============================================================
-- TABLA: encuesta_rondas (cada activación/envío de una plantilla)
-- ============================================================

create table if not exists public.encuesta_rondas (
  id          uuid        primary key default gen_random_uuid(),
  encuesta_id uuid        not null references public.encuestas(id) on delete cascade,
  -- Link público /encuesta/:slug — generado random en el cliente (JEFE
  -- tiene sesión, no hace falta que lo genere el servidor).
  slug        text        not null unique,
  abierta_en  timestamptz not null default now(),
  -- Cierre manual (no hay fecha de expiración automática: no se pidió).
  cerrada     boolean     not null default false,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_encuesta_rondas_slug_abiertas
  on public.encuesta_rondas (slug)
  where cerrada = false;

create index if not exists idx_encuesta_rondas_encuesta
  on public.encuesta_rondas (encuesta_id);

comment on table public.encuesta_rondas is
  'Cada lanzamiento real de una plantilla de encuesta: su propio link (slug) y sus propias respuestas.';

alter table public.encuesta_rondas enable row level security;

create policy "staff puede ver rondas de encuesta"
  on public.encuesta_rondas for select using (public.es_staff());

create policy "solo jefe puede crear rondas de encuesta"
  on public.encuesta_rondas for insert with check (public.es_jefe());

-- UPDATE se usa para cerrar la ronda (cerrada = true)
create policy "solo jefe puede cerrar rondas de encuesta"
  on public.encuesta_rondas for update using (public.es_jefe());

create policy "solo jefe puede eliminar rondas de encuesta"
  on public.encuesta_rondas for delete using (public.es_jefe());

-- ============================================================
-- TABLA: encuesta_respuestas (anónimas, una fila por envío público)
-- ============================================================

create table if not exists public.encuesta_respuestas (
  id          uuid        primary key default gen_random_uuid(),
  ronda_id    uuid        not null references public.encuesta_rondas(id) on delete cascade,
  -- { pregunta_id: valor } — mismo shape que "preguntas" de la plantilla.
  respuestas  jsonb       not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_encuesta_respuestas_ronda
  on public.encuesta_respuestas (ronda_id);

comment on table public.encuesta_respuestas is
  'Respuestas anónimas a una ronda de encuesta. Sin policy de INSERT: solo la edge function (cliente admin) escribe.';

alter table public.encuesta_respuestas enable row level security;

create policy "staff puede ver respuestas de encuesta"
  on public.encuesta_respuestas for select using (public.es_staff());

-- ============================================================
-- Rate-limit por IP (mismo patrón que personal_registro_intentos, 042)
-- ============================================================

create table if not exists public.encuesta_respuesta_intentos (
  id          uuid        primary key default gen_random_uuid(),
  ip          text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_encuesta_respuesta_intentos_ip_fecha
  on public.encuesta_respuesta_intentos (ip, created_at);

comment on table public.encuesta_respuesta_intentos is
  'Registro de intentos (abrir + responder) por IP, para frenar el abuso del formulario público de encuestas. Solo la escribe/lee la edge function; RLS de solo lectura para JEFE.';

alter table public.encuesta_respuesta_intentos enable row level security;

create policy "jefe puede ver intentos de encuesta"
  on public.encuesta_respuesta_intentos for select using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 043
-- ============================================================
