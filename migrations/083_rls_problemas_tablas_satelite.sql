-- Cierra el hueco de RLS en las 2 tablas satélite del dominio Problemas
-- que quedaron fuera de la migración 072: acciones_correctivas,
-- problema_tickets. Esa migración instaló `es_jefe() OR (es_staff() AND
-- tiene_permiso_modulo('problemas'))` en `problemas` (SELECT/INSERT/
-- UPDATE) con el objetivo declarado de cerrar el hueco de módulo en el
-- dominio Problemas, pero nunca tocó estas 2 tablas — confirmado por
-- SELECT directo a pg_policies (2026-08-26): las 2 seguían con
-- `es_staff()` plano en los comandos que no eran DELETE jefe-only.
--
-- Cuarto caso del mismo patrón exacto: EQUIPOS-TABLAS-SATELITE-SIN-GATE
-- (migración 079), CUENTAS-TABLAS-SATELITE-SIN-GATE (migración 081) y
-- TICKETS-TABLAS-SATELITE-SIN-GATE (migración 082). Encontrado por el
-- mismo barrido general de todo el esquema que encontró los otros 3.
-- Documentado como PROBLEMAS-TABLAS-SATELITE-SIN-GATE en
-- docs/HISTORIAL-AUDITORIAS.md, Ciclo 13.
--
-- Alcance del cambio, según el estado real de cada tabla (confirmado por
-- pg_policies, no asumido):
--   - acciones_correctivas: SELECT/INSERT/UPDATE eran `es_staff()` →
--     pasan al patrón con gate de módulo. DELETE ya era `es_jefe()` —
--     sin cambios, ya es más restrictivo que el gate de módulo.
--   - problema_tickets: SELECT/INSERT/DELETE eran `es_staff()` → pasan
--     al patrón con gate de módulo. Sin policy de UPDATE para el cliente
--     (tabla de vínculo N a N: se crea o se borra la fila, no se edita)
--     — nada que tocar ahí. A diferencia de las 2 satélites anteriores
--     (equipos/cuentas), acá el DELETE también pasa al gate de módulo,
--     no queda jefe-only — nunca lo estuvo, y desvincular un ticket de
--     un problema es una operación normal del módulo, no un borrado
--     sensible (mismo criterio que `equipo_accesorios`/
--     `equipos_importacion` en la migración 079).
--
-- Ningún cambio de código de aplicación: la vista de detalle de Problema
-- (acciones correctivas listadas/creadas/editadas) y el vínculo/
-- desvínculo de tickets a un problema ya asumen que quien opera
-- Problemas tiene el módulo 'problemas' otorgado (igual que para
-- `problemas` desde la 072) — un staff con el módulo sigue operando
-- exactamente igual.

-- ── acciones_correctivas ────────────────────────────────────────────────
drop policy if exists "staff puede ver acciones_correctivas" on public.acciones_correctivas;
create policy "staff puede ver acciones_correctivas"
  on public.acciones_correctivas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));

drop policy if exists "staff puede crear acciones_correctivas" on public.acciones_correctivas;
create policy "staff puede crear acciones_correctivas"
  on public.acciones_correctivas for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));

drop policy if exists "staff puede editar acciones_correctivas" on public.acciones_correctivas;
create policy "staff puede editar acciones_correctivas"
  on public.acciones_correctivas for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));

-- delete sin cambios: "solo jefe elimina acciones_correctivas" ya es
-- es_jefe() puro, más restrictivo que el gate de módulo.

-- ── problema_tickets ────────────────────────────────────────────────────
drop policy if exists "staff puede ver problema_tickets" on public.problema_tickets;
create policy "staff puede ver problema_tickets"
  on public.problema_tickets for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));

drop policy if exists "staff puede vincular problema_tickets" on public.problema_tickets;
create policy "staff puede vincular problema_tickets"
  on public.problema_tickets for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));

drop policy if exists "staff puede desvincular problema_tickets" on public.problema_tickets;
create policy "staff puede desvincular problema_tickets"
  on public.problema_tickets for delete
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('problemas')));
