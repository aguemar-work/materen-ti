-- ============================================================
-- MIGRACIÓN 047 — personal_registros: RLS restringido a JEFE
-- Depende de: 042 (personal_registros), 046 (DELETE ya jefe-only), 003 (es_jefe)
--
-- Contexto (decisión de negocio, 2026-08-11): con la migración a
-- `empleados` ya automatizada (ver PersonalRegistrosView.vue), el acceso
-- a este módulo queda reservado a JEFE — se oculta también del sidebar
-- para ASISTENTE (frontend/src/components/shared/AppLayout.vue) y de la
-- navegación (router/guards.js). Antes solo el DELETE (046) era
-- jefe-only; SELECT/UPDATE seguían abiertos a cualquier staff (042), lo
-- que dejaba el ocultamiento del menú como algo puramente cosmético: un
-- ASISTENTE podía seguir leyendo o marcando "usado" pre-registros vía
-- API directa. Mismo criterio que accesos_sensibles (024): si algo es
-- "solo JEFE", el RLS lo cierra, no solo la UI.
-- ============================================================

drop policy if exists "staff puede ver pre-registros de personal" on public.personal_registros;
create policy "jefe puede ver pre-registros de personal"
  on public.personal_registros for select
  using (public.es_jefe());

drop policy if exists "staff puede marcar pre-registros como usados" on public.personal_registros;
create policy "jefe puede marcar pre-registros como usados"
  on public.personal_registros for update
  using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 047
-- ============================================================
