-- Cierra el hueco de RLS en las 2 tablas satélite del dominio Cuentas que
-- quedaron fuera de la migración 068: plataformas y entregas. Esa
-- migración instaló `es_jefe() OR (es_staff() AND tiene_permiso_modulo
-- ('correos'))` en cuentas/asignaciones_cuenta con el objetivo declarado
-- de cerrar ese hueco en todo el dominio, pero nunca tocó estas 2 —
-- confirmado por SELECT directo a pg_policies (2026-08-26): las 2 seguían
-- con `es_staff()` plano en los comandos que no eran DELETE jefe-only.
--
-- Mismo patrón exacto que EQUIPOS-TABLAS-SATELITE-SIN-GATE, cerrado por
-- la migración 079 para catalogo_almacen/equipo_accesorios/
-- equipos_importacion. Documentado como hallazgo gemelo en
-- docs/HISTORIAL-AUDITORIAS.md (CUENTAS-TABLAS-SATELITE-SIN-GATE, Ciclo 13).
--
-- Alcance del cambio, según el estado real de cada tabla (confirmado por
-- pg_policies, no asumido):
--   - plataformas: SELECT/INSERT/UPDATE eran `es_staff()` → pasan al
--     patrón con gate de módulo. DELETE ya era `es_jefe()` — sin cambios,
--     ya es más restrictivo que el gate de módulo, no había hueco ahí.
--   - entregas: SELECT era `es_staff()` → pasa al patrón con gate de
--     módulo. No tiene policy de INSERT/UPDATE para el cliente (solo la
--     edge function credenciales.ts, con cliente admin, crea/actualiza
--     filas) — nada que tocar ahí. DELETE ya era `es_jefe()` — sin
--     cambios.
--
-- Ningún cambio de código de aplicación: CuentaForm.vue (selector de
-- plataforma) y el módulo de Correos ya asumen que quien opera cuentas
-- tiene el módulo 'correos' otorgado (igual que para cuentas/
-- asignaciones_cuenta desde la 068) — un staff con el módulo sigue
-- operando exactamente igual. No hay ningún listado de "historial de
-- entregas" en la UI actual que lea `entregas` desde el cliente (único
-- lector es la propia edge function con cliente admin), así que el
-- cambio de SELECT no tiene ningún consumidor visible que romper.

-- ── plataformas ─────────────────────────────────────────────────────────
drop policy if exists "staff puede ver plataformas" on public.plataformas;
create policy "staff puede ver plataformas"
  on public.plataformas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

drop policy if exists "staff puede crear plataformas" on public.plataformas;
create policy "staff puede crear plataformas"
  on public.plataformas for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

drop policy if exists "staff puede editar plataformas" on public.plataformas;
create policy "staff puede editar plataformas"
  on public.plataformas for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

-- delete sin cambios: "solo jefe puede eliminar plataformas" ya es
-- es_jefe() puro, más restrictivo que el gate de módulo.

-- ── entregas ────────────────────────────────────────────────────────────
drop policy if exists "staff puede ver entregas" on public.entregas;
create policy "staff puede ver entregas"
  on public.entregas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

-- entregas no tiene policy de insert/update para el cliente (solo la
-- edge function credenciales.ts, con cliente admin, crea entregas y marca
-- viewed_at) — sin cambios.
-- delete sin cambios: "solo jefe puede eliminar entregas" ya es
-- es_jefe() puro, más restrictivo que el gate de módulo.
