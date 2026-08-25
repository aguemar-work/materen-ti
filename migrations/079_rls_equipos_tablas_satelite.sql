-- Cierra el hueco de RLS en las 3 tablas satélite del módulo Equipos que
-- quedaron fuera de las migraciones 068/072: equipo_accesorios,
-- catalogo_almacen, equipos_importacion. Esas dos migraciones instalaron
-- `es_jefe() OR (es_staff() AND tiene_permiso_modulo('equipos'))` en
-- equipos/tipos_equipo/asignaciones_equipo/eventos_equipo con el objetivo
-- declarado de cerrar ese hueco en todo el módulo, pero nunca tocaron
-- estas 3 — confirmado por SELECT directo a pg_policies (2026-08-25):
-- las 3 seguían con `es_staff()` plano en los comandos que no eran DELETE
-- jefe-only.
--
-- Alcance del cambio, según el estado real de cada tabla (no se asume
-- que las 3 usan la misma combinación de comandos que equipos/tipos_equipo/
-- asignaciones_equipo):
--   - catalogo_almacen: SELECT/INSERT/UPDATE eran `es_staff()` → pasan al
--     patrón con gate de módulo. DELETE ya era `es_jefe()` (igual que
--     equipos/tipos_equipo/asignaciones_equipo) — sin cambios, ya es más
--     restrictivo que el gate de módulo, no había hueco ahí.
--   - equipo_accesorios: los 4 comandos (SELECT/INSERT/UPDATE/DELETE)
--     eran `es_staff()` plano — los 4 pasan al patrón con gate de módulo.
--     No se restringe DELETE a solo JEFE: nunca lo estuvo, y no es parte
--     de este hallazgo (que es sobre el módulo, no sobre quién puede
--     borrar).
--   - equipos_importacion: mismo caso que equipo_accesorios, los 4
--     comandos pasan al patrón con gate de módulo.
--
-- Ningún cambio de código de aplicación: EquiposView.vue/EquipoForm.vue/
-- ImportarEquiposView.vue ya asumen que quien opera equipos tiene el
-- módulo otorgado (igual que para equipos/asignaciones_equipo) — un
-- staff con el módulo sigue operando exactamente igual.

-- ── catalogo_almacen ────────────────────────────────────────────────────
drop policy if exists "staff puede ver catalogo_almacen" on public.catalogo_almacen;
create policy "staff puede ver catalogo_almacen"
  on public.catalogo_almacen for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede crear catalogo_almacen" on public.catalogo_almacen;
create policy "staff puede crear catalogo_almacen"
  on public.catalogo_almacen for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede editar catalogo_almacen" on public.catalogo_almacen;
create policy "staff puede editar catalogo_almacen"
  on public.catalogo_almacen for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

-- delete sin cambios: "solo jefe puede eliminar catalogo_almacen" ya es
-- es_jefe() puro, más restrictivo que el gate de módulo.

-- ── equipo_accesorios ───────────────────────────────────────────────────
drop policy if exists "staff puede ver equipo_accesorios" on public.equipo_accesorios;
create policy "staff puede ver equipo_accesorios"
  on public.equipo_accesorios for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede crear equipo_accesorios" on public.equipo_accesorios;
create policy "staff puede crear equipo_accesorios"
  on public.equipo_accesorios for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede editar equipo_accesorios" on public.equipo_accesorios;
create policy "staff puede editar equipo_accesorios"
  on public.equipo_accesorios for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede borrar equipo_accesorios" on public.equipo_accesorios;
create policy "staff puede borrar equipo_accesorios"
  on public.equipo_accesorios for delete
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

-- ── equipos_importacion ─────────────────────────────────────────────────
drop policy if exists "staff puede ver equipos_importacion" on public.equipos_importacion;
create policy "staff puede ver equipos_importacion"
  on public.equipos_importacion for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede crear equipos_importacion" on public.equipos_importacion;
create policy "staff puede crear equipos_importacion"
  on public.equipos_importacion for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede editar equipos_importacion" on public.equipos_importacion;
create policy "staff puede editar equipos_importacion"
  on public.equipos_importacion for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede eliminar equipos_importacion" on public.equipos_importacion;
create policy "staff puede eliminar equipos_importacion"
  on public.equipos_importacion for delete
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));
