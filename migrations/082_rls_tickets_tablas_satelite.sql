-- Cierra el hueco de RLS en las 5 tablas satélite del dominio Tickets que
-- quedaron fuera de la migración 072: ticket_comentarios, ticket_eventos,
-- ticket_satisfaccion, subcategorias_ticket, transiciones_ticket_
-- permitidas. Esa migración instaló `es_jefe() OR (es_staff() AND
-- tiene_permiso_modulo('tickets'))` en `tickets` (SELECT/UPDATE) con el
-- objetivo declarado de cerrar el hueco de módulo en el dominio Tickets,
-- pero nunca tocó estas 5 tablas — confirmado por SELECT directo a
-- pg_policies (2026-08-26): las 5 seguían con `es_staff()` plano en los
-- comandos que no eran DELETE jefe-only.
--
-- Tercer caso del mismo patrón exacto: EQUIPOS-TABLAS-SATELITE-SIN-GATE
-- (migración 079) y CUENTAS-TABLAS-SATELITE-SIN-GATE (migración 081).
-- Encontrado esta vez por un barrido general de todo el esquema (no
-- dominio por dominio) buscando cualquier tabla con `es_staff()` plano
-- cuya tabla principal ya esté gateada por módulo. Documentado como
-- TICKETS-TABLAS-SATELITE-SIN-GATE en docs/HISTORIAL-AUDITORIAS.md,
-- Ciclo 13.
--
-- Alcance del cambio, según el estado real de cada tabla (confirmado por
-- pg_policies, no asumido):
--   - ticket_comentarios: INSERT/SELECT eran `es_staff()` → pasan al
--     patrón con gate de módulo. Sin policy de UPDATE/DELETE para el
--     cliente (comentarios inmutables una vez creados) — nada que tocar
--     ahí.
--   - ticket_eventos: SELECT era `es_staff()` → pasa al patrón con gate
--     de módulo. Sin policy de INSERT/UPDATE/DELETE para el cliente
--     (append-only, solo lo escribe el trigger `evento_ticket_cambios()`
--     con permisos de tabla, no RLS de cliente — mismo patrón que
--     `eventos_equipo`) — nada que tocar ahí.
--   - ticket_satisfaccion: SELECT era `es_staff()` → pasa al patrón con
--     gate de módulo. Sin policy de INSERT/UPDATE/DELETE para el cliente
--     (la encuesta la genera un trigger al cerrar el ticket, y la
--     responde el propio ticket público sin sesión vía edge function
--     admin) — nada que tocar ahí.
--   - subcategorias_ticket: SELECT/INSERT/UPDATE eran `es_staff()` →
--     pasan al patrón con gate de módulo. DELETE ya era `es_jefe()` —
--     sin cambios, ya es más restrictivo que el gate de módulo.
--   - transiciones_ticket_permitidas: SELECT era `es_staff()` → pasa al
--     patrón con gate de módulo. Sin policy de INSERT/UPDATE/DELETE para
--     el cliente (whitelist de solo lectura, mantenida a mano en el
--     código de la migración 050, no editable desde la UI) — nada que
--     tocar ahí.
--
-- Ningún cambio de código de aplicación: `TicketDetalleView.vue` (o el
-- panel equivalente que muestra comentarios/timeline/satisfacción/
-- subcategoría) y el módulo de Tickets ya asumen que quien opera tickets
-- tiene el módulo 'tickets' otorgado (igual que para `tickets`/
-- `problemas` desde la 072) — un staff con el módulo sigue operando
-- exactamente igual.

-- ── ticket_comentarios ──────────────────────────────────────────────────
drop policy if exists "staff puede comentar tickets" on public.ticket_comentarios;
create policy "staff puede comentar tickets"
  on public.ticket_comentarios for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

drop policy if exists "staff puede ver comentarios de ticket" on public.ticket_comentarios;
create policy "staff puede ver comentarios de ticket"
  on public.ticket_comentarios for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

-- ── ticket_eventos ──────────────────────────────────────────────────────
drop policy if exists "staff puede ver eventos de ticket" on public.ticket_eventos;
create policy "staff puede ver eventos de ticket"
  on public.ticket_eventos for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

-- ── ticket_satisfaccion ─────────────────────────────────────────────────
drop policy if exists "staff puede ver satisfaccion de ticket" on public.ticket_satisfaccion;
create policy "staff puede ver satisfaccion de ticket"
  on public.ticket_satisfaccion for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

-- ── subcategorias_ticket ────────────────────────────────────────────────
drop policy if exists "staff puede ver subcategorias de ticket" on public.subcategorias_ticket;
create policy "staff puede ver subcategorias de ticket"
  on public.subcategorias_ticket for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

drop policy if exists "staff puede crear subcategorias de ticket" on public.subcategorias_ticket;
create policy "staff puede crear subcategorias de ticket"
  on public.subcategorias_ticket for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

drop policy if exists "staff puede editar subcategorias de ticket" on public.subcategorias_ticket;
create policy "staff puede editar subcategorias de ticket"
  on public.subcategorias_ticket for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

-- delete sin cambios: "solo jefe puede eliminar subcategorias de ticket"
-- ya es es_jefe() puro, más restrictivo que el gate de módulo.

-- ── transiciones_ticket_permitidas ─────────────────────────────────────
drop policy if exists "staff puede ver transiciones permitidas" on public.transiciones_ticket_permitidas;
create policy "staff puede ver transiciones permitidas"
  on public.transiciones_ticket_permitidas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));
