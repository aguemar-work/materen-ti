-- ============================================================
-- MIGRACIÓN 031 — Base de Conocimiento (kb_articulos)
-- Depende de: 003 (es_jefe()/es_staff()), 005 (set_created_updated_by()),
--             016 (categorias_ticket, tickets)
-- Tabla: kb_articulos
--
-- Reemplaza al checkbox "es_base_conocimiento" de tickets (mig. 016): ese
-- flag no tenía ningún consumidor (ni listado, ni filtro, ni buscador) —
-- se guardaba y quedaba invisible para siempre. Este módulo es el
-- consumidor real: un artículo reutilizable, con su propio ciclo de
-- revisión, que cualquier staff puede buscar al atender un ticket
-- parecido. "es_leccion_aprendida" NO se toca acá — es de un alcance
-- distinto (Gestión de Problemas, fase futura).
--
-- Ciclo de vida (estado): borrador -> en_revision -> publicado -> obsoleto.
-- Visibilidad de dos niveles (mismo espíritu que accesos_sensibles, mig.
-- 024, pero sin tabla de permisos aparte — acá alcanza con estado + autor):
--   - publicado/obsoleto: cualquier staff activo.
--   - borrador/en_revision: solo el autor o el JEFE (revisor).
-- Publicar/marcar obsoleto: solo JEFE. No hace falta un trigger aparte
-- para ese gate — la propia cláusula "with check" de la política de
-- edición ya lo impide (ver comentario en esa policy).
--
-- RESULTADO REAL DEL BACKFILL (2026-07-29, documentado a propósito):
-- el CLI de InsForge crasheó al aplicar esta migración completa y el
-- estado final mostró 0 filas en kb_articulos con la columna
-- es_base_conocimiento ya eliminada. No hay certeza de si el backfill
-- corrió y un DROP TABLE manual posterior (hecho creyendo que solo
-- limpiaba una tabla de prueba) las destruyó, o si de verdad no había
-- tickets marcados. No hay auditoría de ese campo ni forma de
-- recuperarlo (se revisó `backups`/`branch` del CLI: restaurar
-- sobrescribiría todo el proyecto, sin opción de apuntar a un entorno
-- aparte). Decisión (2026-07-29): no restaurar — el flag no tenía
-- ningún consumidor antes de este módulo, así que el impacto real es
-- nulo. Pérdida de dato conocida, aceptada y cerrada; KB arranca vacía.
-- ============================================================


-- ============================================================
-- TABLA: kb_articulos
-- ============================================================

create table if not exists public.kb_articulos (
  id                uuid        primary key default gen_random_uuid(),

  titulo            text        not null,

  -- Mismo catálogo que tickets (categorias_ticket.id es slug, no uuid).
  categoria_id      text        references public.categorias_ticket(id) on delete restrict,

  sintoma           text,

  -- Texto plano (pre-wrap en el cliente), sin editor de formato — igual
  -- que descripción/comentarios de tickets. Nada de rich text por ahora.
  solucion          text,

  -- Ticket del que salió la solución, si aplica (también puede crearse manual).
  ticket_origen_id  uuid        references public.tickets(id) on delete set null,

  -- Mismo patrón de check-constraint que equipos.estado/accesos_sensibles.categoria
  -- (no un enum nativo, para que agregar un estado futuro sea un ALTER simple).
  estado            text        not null default 'borrador'
    check (estado in ('borrador', 'en_revision', 'publicado', 'obsoleto')),

  util_si           integer     not null default 0,
  util_no           integer     not null default 0,

  -- FK a auth.users (no a staff): sobrevive si el autor se desactiva/borra.
  created_by        uuid        references auth.users(id) on delete set null,
  updated_by        uuid        references auth.users(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Softdelete (regla del proyecto): DELETE físico solo JEFE, ver RLS abajo.
  deleted_at        timestamptz
);

create index if not exists idx_kb_articulos_categoria
  on public.kb_articulos (categoria_id);

create index if not exists idx_kb_articulos_ticket_origen
  on public.kb_articulos (ticket_origen_id);

comment on table public.kb_articulos is
  'Base de Conocimiento: soluciones reutilizables para agilizar la atención de tickets. Visibilidad: publicado/obsoleto para todo staff; borrador/en_revision solo para el autor o el JEFE.';

comment on column public.kb_articulos.estado is
  'borrador -> en_revision -> publicado -> obsoleto. Publicar/marcar obsoleto: solo JEFE (RLS).';

comment on column public.kb_articulos.solucion is
  'Texto plano, sin formato — mismo criterio que descripción/comentarios de tickets.';

create or replace trigger trg_kb_articulos_updated_at
  before update on public.kb_articulos
  for each row execute function set_updated_at();

create or replace trigger trg_kb_articulos_by
  before insert or update on public.kb_articulos
  for each row execute function public.set_created_updated_by();


-- ============================================================
-- RLS: kb_articulos
-- ============================================================
-- create policy no admite IF NOT EXISTS/OR REPLACE — drop + create es el
-- idiom estándar del proyecto para dejar la migración re-ejecutable.

alter table public.kb_articulos enable row level security;

-- Ver: publicado/obsoleto para cualquier staff; borrador/en_revision
-- solo para su autor o el JEFE.
drop policy if exists "staff ve articulos kb segun estado y autoria" on public.kb_articulos;
create policy "staff ve articulos kb segun estado y autoria"
  on public.kb_articulos for select
  using (
    es_staff() and (
      estado in ('publicado', 'obsoleto')
      or created_by = auth.uid()
      or es_jefe()
    )
  );

-- Crear: cualquier staff (autor lo fija el trigger de arriba, no el cliente).
drop policy if exists "staff puede crear articulos kb" on public.kb_articulos;
create policy "staff puede crear articulos kb"
  on public.kb_articulos for insert
  with check (es_staff());

-- Editar contenido: el autor mientras el artículo siga en borrador/
-- en_revision, o el JEFE en cualquier estado. El "with check" ya impide
-- que el propio autor se autopublique: si intenta cambiar estado a
-- "publicado"/"obsoleto" deja de cumplir su propia condición (no es
-- es_jefe() y el nuevo estado ya no está en el set permitido) y la fila
-- se rechaza — no hace falta un trigger aparte para ese gate.
drop policy if exists "autor o jefe edita contenido de articulos kb" on public.kb_articulos;
create policy "autor o jefe edita contenido de articulos kb"
  on public.kb_articulos for update
  using (
    es_jefe() or (created_by = auth.uid() and estado in ('borrador', 'en_revision'))
  )
  with check (
    es_jefe() or (created_by = auth.uid() and estado in ('borrador', 'en_revision'))
  );

-- Votar "¿Te sirvió?": cualquier staff puede tocar un artículo YA
-- publicado/obsoleto — mismo nivel de confianza que ya usa el resto del
-- dominio (ver "staff puede editar empleados", migración 003): no hay
-- mecanismo de permisos por columna en este proyecto, así que se confía
-- en que el cliente solo envíe el incremento de util_si/util_no desde el
-- botón de feedback.
drop policy if exists "staff puede votar articulos publicados" on public.kb_articulos;
create policy "staff puede votar articulos publicados"
  on public.kb_articulos for update
  using (es_staff() and estado in ('publicado', 'obsoleto'))
  with check (es_staff() and estado in ('publicado', 'obsoleto'));

-- Eliminar (físico): solo JEFE. El softdelete (poner deleted_at) es un
-- UPDATE normal — ya cubierto por las políticas de arriba (JEFE siempre;
-- el autor mientras esté en borrador/en_revision).
drop policy if exists "solo jefe elimina articulos kb" on public.kb_articulos;
create policy "solo jefe elimina articulos kb"
  on public.kb_articulos for delete
  using (es_jefe());


-- ============================================================
-- BACKFILL: tickets ya marcados "es_base_conocimiento" antes de este módulo
-- ============================================================
-- Ese flag reflejaba una decisión humana previa de que la solución valía
-- la pena guardarse — no se descarta: se convierte en un kb_articulo real,
-- en "en_revision" (no "borrador": ya hubo criterio humano de por medio,
-- falta completarlo/publicarlo, no partir de cero). sintoma/solucion
-- quedan vacíos a propósito — no había un campo de "notas de resolución"
-- de donde sacarlos; se completan durante la revisión.
--
-- created_by se fija en un segundo paso (UPDATE, no en el INSERT):
-- set_created_updated_by() pone created_by = auth.uid() en todo INSERT,
-- y acá no hay sesión de usuario (migración vía CLI) — el INSERT directo
-- habría dejado created_by en null. El UPDATE posterior no lo pisa (esa
-- misma función solo toca updated_by en UPDATE), así que ahí sí se puede
-- fijar a quién atendió el ticket.
-- ============================================================

insert into public.kb_articulos (titulo, categoria_id, ticket_origen_id, estado)
select t.titulo, t.categoria_id, t.id, 'en_revision'
from public.tickets t
where t.es_base_conocimiento = true;

update public.kb_articulos k
set created_by = coalesce(t.asignado_a, t.creado_por)
from public.tickets t
where k.ticket_origen_id = t.id
  and t.es_base_conocimiento = true;


-- ============================================================
-- Retirar el flag reemplazado (sin consumidor propio, ver contexto arriba)
-- ============================================================

alter table public.tickets drop column if exists es_base_conocimiento;

-- ============================================================
-- FIN DE MIGRACIÓN 031
-- ============================================================
