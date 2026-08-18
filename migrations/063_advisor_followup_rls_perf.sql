-- ============================================================
-- MIGRACIÓN 063 — Backend Advisor (segunda pasada, 2026-08-17): RLS perf +
--                  grant faltante de staff_nombres()
-- Depende de: 003 (es_jefe/es_staff, staff), 032 (kb_articulos), 045/048
--             (notificaciones/notificaciones_lecturas), 056
--             (staff_modulos_permisos), 060 (staff_permisos), 061
--             (staff_nombres, policy de staff), 062 (hardening anterior)
--
-- CONTEXTO: segunda corrida del InsForge Backend Advisor tras la migración
-- 062, 31 hallazgos. Tres grupos, tratados distinto a propósito:
--
-- 1) [warning performance] 9 políticas RLS en 5 tablas llaman auth.uid()
--    sin envolver en subquery — Postgres la reevalúa por fila en vez de una
--    sola vez por consulta. Fix mecánico, sin cambiar semántica: envolver
--    cada auth.uid() en (select auth.uid()) vía ALTER POLICY (mismo qual/
--    with_check, solo el wrapper). Aplicado en las 9: staff_permisos (1),
--    kb_articulos (2), notificaciones (1), notificaciones_lecturas (2),
--    staff (2), staff_modulos_permisos (1).
--
-- 2) [critical security] 10 de las 16 funciones SECURITY DEFINER que la
--    migración 062 dejó con EXECUTE a `authenticated` (es_jefe, es_staff,
--    tiene_permiso_acceso_sensible, tiene_permiso_credenciales_ver,
--    kb_registrar_feedback, dar_baja_empleado, cerrar_ticket,
--    reporte_tickets, reporte_tickets_resumen,
--    reporte_satisfaccion_consolidado) vuelven a aparecer como "dangerous"
--    — la regla del advisor marca CUALQUIER grant a un rol no-admin sobre
--    una función SECURITY DEFINER, sin distinguir el patrón de RLS-helper/
--    RPC-gateada ya documentado (§3 de docs/PANORAMA_SISTEMA.md). Aplicar
--    la sugerencia (revocar de `authenticated` y/o pasar a SECURITY
--    INVOKER) ROMPERÍA la app: es_jefe()/es_staff() dejarían de poder
--    evaluarse dentro de las políticas RLS que las llaman (el rol que
--    ejecuta la consulta necesita EXECUTE sobre la función, sin importar
--    que el cuerpo corra como el dueño), y como INVOKER reintroducirían la
--    recursión de RLS que el patrón evita a propósito (política de `staff`
--    llama a es_jefe(), que si corriera como el invocador volvería a
--    consultar `staff` bajo su propia RLS). **No se aplica ningún cambio
--    para este grupo** — queda como riesgo aceptado, documentado en
--    `docs/HISTORIAL-AUDITORIAS.md` (Ciclo 7) para no re-investigarlo cada
--    vez que el advisor vuelva a correr.
--
-- 3) [info security] 11 tablas con RLS de solo SELECT (notificaciones,
--    transiciones_ticket_permitidas, accesos_log, eventos_equipo,
--    ticket_busqueda_intentos, ticket_eventos, ticket_satisfaccion,
--    ticket_creacion_intentos, personal_registro_intentos,
--    encuesta_respuesta_intentos, encuesta_respuestas). Verificado una por
--    una: todas escriben SOLO vía trigger SECURITY DEFINER (auditoría:
--    accesos_log, eventos_equipo, ticket_eventos — abrir INSERT a
--    `authenticated` permitiría forjar el historial de auditoría) o vía
--    edge function con cliente admin que bypasea RLS (rate-limit:
--    ticket_busqueda_intentos, ticket_creacion_intentos,
--    personal_registro_intentos, encuesta_respuesta_intentos; respuestas
--    anónimas: encuesta_respuestas; encuesta: ticket_satisfaccion;
--    catálogo de config: transiciones_ticket_permitidas; notificaciones:
--    crear_notificacion()). Agregar la policy de INSERT que sugiere el
--    advisor (`WITH CHECK (auth.uid() = user_id)`, una plantilla genérica
--    que ni siquiera tiene sentido para la mayoría de estas tablas — varias
--    no tienen columna `user_id`) sería una REGRESIÓN de seguridad real,
--    no una mejora. **No se aplica ningún cambio para este grupo** — mismo
--    criterio que el grupo 2, documentado en el mismo Ciclo 7.
--
-- Único cambio de seguridad real de esta migración: `staff_nombres()`
-- (migración 061) quedó fuera del hardening de la 062 porque no estaba en
-- el reporte original de 80 hallazgos — el advisor la marca ahora como
-- "callable by: public" (no se le aplicó nunca un REVOKE). Mismo fix que
-- el resto de RPCs angostas de la 062: REVOKE de PUBLIC, GRANT a
-- `authenticated` (tiene guard interno es_staff(), y el frontend la llama
-- por RPC — ver `frontend/src/api/domains/staff.js`).
-- ============================================================


-- ============================================================
-- 1) Grant faltante: staff_nombres() (migración 061, sin REVOKE hasta hoy)
-- ============================================================

revoke execute on function public.staff_nombres() from public;
grant execute on function public.staff_nombres() to authenticated;


-- ============================================================
-- 2) RLS: envolver auth.uid() en subquery (performance/rls-policy-perf)
-- ============================================================

alter policy "staff ve sus propios permisos, jefe ve todos" on public.staff_permisos
  using ((staff_user_id = (select auth.uid())) or es_jefe());

alter policy "autor o jefe edita contenido de articulos kb" on public.kb_articulos
  using (es_jefe() or ((created_by = (select auth.uid())) and (estado = any (array['borrador'::text, 'en_revision'::text]))))
  with check (es_jefe() or ((created_by = (select auth.uid())) and (estado = any (array['borrador'::text, 'en_revision'::text]))));

alter policy "staff ve articulos kb segun estado y autoria" on public.kb_articulos
  using (es_staff() and ((estado = any (array['publicado'::text, 'obsoleto'::text])) or (created_by = (select auth.uid())) or es_jefe()));

alter policy "staff puede ver notificaciones" on public.notificaciones
  using (es_staff() and ((destinatario_id is null) or (destinatario_id = (select auth.uid()))));

alter policy "staff puede marcar sus propias notificaciones como leidas" on public.notificaciones_lecturas
  with check ((usuario_id = (select auth.uid())) and es_staff());

alter policy "staff puede ver sus propias lecturas" on public.notificaciones_lecturas
  using (usuario_id = (select auth.uid()));

alter policy "jefe edita cualquiera, staff edita su propio registro" on public.staff
  using ((user_id = (select auth.uid())) or es_jefe())
  with check ((user_id = (select auth.uid())) or es_jefe());

alter policy "staff puede ver su propio registro" on public.staff
  using ((user_id = (select auth.uid())) or es_jefe());

alter policy "staff ve sus propios modulos, jefe ve todos" on public.staff_modulos_permisos
  using ((staff_user_id = (select auth.uid())) or es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 063
-- Grupos 2 y 3 del contexto de arriba: sin cambios a propósito (riesgo
-- aceptado, documentado en docs/HISTORIAL-AUDITORIAS.md, Ciclo 7).
-- ============================================================
