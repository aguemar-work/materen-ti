-- ============================================================
-- MIGRACIÓN 072 — RLS real por módulo: los 4 módulos restantes
-- Depende de: 056 (staff_modulos_permisos), 068 (tiene_permiso_modulo())
--
-- Verificación de checklist P0 externa (2026-08-17): la migración 068 solo
-- convirtió a RLS real 3 de los 8 módulos posibles de
-- staff_modulos_permisos (licencias/equipos/correos). Los otros 4 —
-- tickets, problemas, base_conocimiento (tabla kb_articulos) y encuestas —
-- seguían gateados solo por es_staff(), mismo hueco que 068 dijo cerrar:
-- un ASISTENTE sin el módulo asignado podía seguir leyendo/escribiendo esas
-- tablas completas vía SDK directo. Mismo patrón exacto que 068
-- (es_jefe() OR (es_staff() AND tiene_permiso_modulo('...'))), sin tocar
-- ninguna policy jefe-only (DELETE en todas, INSERT/UPDATE de
-- encuestas/encuesta_rondas ya eran jefe-only y están bien así).
-- ============================================================


-- ------------------------------------------------------------
-- tickets → módulo 'tickets'
-- ------------------------------------------------------------

drop policy if exists "staff puede ver tickets" on public.tickets;
create policy "staff puede ver tickets"
  on public.tickets for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

drop policy if exists "staff puede editar tickets" on public.tickets;
create policy "staff puede editar tickets"
  on public.tickets for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

-- sin policy de insert para staff (los tickets se crean vía edge function
-- pública con cliente admin) — sin cambios.


-- ------------------------------------------------------------
-- problemas → módulo 'problemas'
-- ------------------------------------------------------------

drop policy if exists "staff puede ver problemas" on public.problemas;
create policy "staff puede ver problemas"
  on public.problemas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));

drop policy if exists "staff puede crear problemas" on public.problemas;
create policy "staff puede crear problemas"
  on public.problemas for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));

drop policy if exists "staff puede editar problemas" on public.problemas;
create policy "staff puede editar problemas"
  on public.problemas for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));

-- delete sin cambios: "solo jefe elimina problemas"


-- ------------------------------------------------------------
-- kb_articulos → módulo 'base_conocimiento'
--
-- El select y el update existentes tienen condiciones propias de
-- estado/autoría (no son un simple es_staff()) — se preserva esa lógica
-- tal cual, agregando el gate de módulo solo al brazo de staff/autor. El
-- brazo de jefe queda igual de exento que antes (jefe ve/edita todo).
-- ------------------------------------------------------------

drop policy if exists "staff puede crear articulos kb" on public.kb_articulos;
create policy "staff puede crear articulos kb"
  on public.kb_articulos for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('base_conocimiento')));

drop policy if exists "staff ve articulos kb segun estado y autoria" on public.kb_articulos;
create policy "staff ve articulos kb segun estado y autoria"
  on public.kb_articulos for select
  using (
    public.es_jefe()
    or (
      public.es_staff()
      and public.tiene_permiso_modulo('base_conocimiento')
      and (
        estado in ('publicado', 'obsoleto')
        or created_by = (select auth.uid())
      )
    )
  );

drop policy if exists "autor o jefe edita contenido de articulos kb" on public.kb_articulos;
create policy "autor o jefe edita contenido de articulos kb"
  on public.kb_articulos for update
  using (
    public.es_jefe()
    or (
      public.tiene_permiso_modulo('base_conocimiento')
      and created_by = (select auth.uid())
      and estado in ('borrador', 'en_revision')
    )
  )
  with check (
    public.es_jefe()
    or (
      public.tiene_permiso_modulo('base_conocimiento')
      and created_by = (select auth.uid())
      and estado in ('borrador', 'en_revision')
    )
  );

-- delete sin cambios: "solo jefe elimina articulos kb"


-- ------------------------------------------------------------
-- encuestas / encuesta_rondas / encuesta_respuestas → módulo 'encuestas'
--
-- Solo se toca el SELECT de staff en las 3 — insert/update/delete de
-- encuestas y encuesta_rondas ya eran jefe-only (sin cambios), y
-- encuesta_respuestas no tiene policy de insert/update/delete para el
-- cliente (se escribe vía edge function con cliente admin).
-- ------------------------------------------------------------

drop policy if exists "staff puede ver encuestas" on public.encuestas;
create policy "staff puede ver encuestas"
  on public.encuestas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('encuestas')));

drop policy if exists "staff puede ver rondas de encuesta" on public.encuesta_rondas;
create policy "staff puede ver rondas de encuesta"
  on public.encuesta_rondas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('encuestas')));

drop policy if exists "staff puede ver respuestas de encuesta" on public.encuesta_respuestas;
create policy "staff puede ver respuestas de encuesta"
  on public.encuesta_respuestas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('encuestas')));

-- ============================================================
-- FIN DE MIGRACIÓN 072
-- ============================================================
