-- ============================================================
-- MIGRACIÓN 062 — Backend Advisor: privilegios EXECUTE, índices FK y autovacuum
-- Depende de: 003 (es_jefe/es_staff), 013 (log_evento_equipo), 016
--             (log_evento_ticket), 024 (tiene_permiso_acceso_sensible), 032
--             (kb_registrar_feedback), 038 (dar_baja_empleado), 045/048/054
--             (crear_notificacion), 051 (cerrar_ticket), 053
--             (reporte_tickets/reporte_tickets_resumen/
--             reporte_satisfaccion_consolidado), 060
--             (tiene_permiso_credenciales_ver)
--
-- CONTEXTO (InsForge Backend Advisor, 2026-08-17, 80 hallazgos):
--
-- 1) [critical security] 16 funciones SECURITY DEFINER marcadas "callable
--    by: public". Se crearon sin REVOKE explícito, así que Postgres las
--    deja con el EXECUTE default a PUBLIC (incluye anon). Ninguna de las
--    16 se convierte a SECURITY INVOKER (la sugerencia genérica del
--    advisor): todas son el patrón ya documentado del proyecto para evitar
--    recursión de RLS — es_jefe()/es_staff() se llaman DESDE políticas RLS
--    de decenas de tablas, y el resto hace guard interno
--    "if not es_staff() then raise exception" antes de tocar filas que la
--    RLS del rol autenticado no dejaría ver directo. Convertirlas a
--    INVOKER rompería esas políticas o el guard. Lo que sí corresponde es
--    acotar el EXECUTE: REVOKE de PUBLIC en las 16, y GRANT a
--    `authenticated` solo donde un rol autenticado necesita invocarla
--    directo (RLS o RPC del cliente) — ver detalle en cada sección abajo.
--
-- 2) Al inspeccionar las 16 aparecieron 3 funciones _test_reporte_* no
--    reportadas individualmente por el advisor bajo ese nombre pero
--    presentes en el esquema de producción: _test_reporte_tickets,
--    _test_reporte_tickets_resumen, _test_reporte_satisfaccion_consolidado.
--    Son gemelas de reporte_tickets/reporte_tickets_resumen/
--    reporte_satisfaccion_consolidado creadas por
--    scripts/paridad-reporte-tickets.mjs para validar la migración 053 con
--    la conexión admin del CLI (sin sesión real). El propio comentario del
--    script dice que "se crean y se destruyen en esta misma corrida, nunca
--    quedan en el esquema versionado" — quedaron por un descuido. A
--    diferencia de las reales, NO tienen el guard es_staff() (a propósito,
--    para poder probarlas sin sesión), así que con EXECUTE abierto a
--    PUBLIC eran una fuga real de datos de tickets/satisfacción sin
--    autenticar — más grave que cualquier hallazgo del advisor. Se
--    eliminan en vez de acotarles el grant.
--
-- 3) [warning performance] 61 columnas FK sin índice — CREATE INDEX simple
--    (no CONCURRENTLY) en todas: este archivo se aplica con
--    scripts/apply-migration.mjs -> `db query`, que manda todo el
--    contenido como un solo mensaje (protocolo simple de Postgres), y
--    Postgres envuelve varias sentencias de un mismo mensaje en una
--    transacción implícita — CONCURRENTLY no puede correr ahí dentro.
--    Tablas de decenas/cientos de filas (ver dead-tuples abajo): el lock
--    de un CREATE INDEX normal es despreciable.
--
-- 4) [info health] 3 tablas con >20% de tuplas muertas (entregas,
--    eventos_equipo, asignaciones_cuenta): se ajusta el autovacuum acá
--    (DDL, transaccional). El VACUUM ANALYZE inmediato NO va en este
--    archivo (tampoco puede correr dentro de una transacción) — se corre
--    aparte con `db query` una vez aplicada esta migración.
-- ============================================================


-- ============================================================
-- 1) Revocar EXECUTE de PUBLIC en las 16 funciones SECURITY DEFINER marcadas
-- ============================================================

revoke execute on function public.es_jefe() from public;
revoke execute on function public.es_staff() from public;
revoke execute on function public.log_evento_equipo(uuid, text, text) from public;
revoke execute on function public.log_evento_ticket(uuid, text, text) from public;
revoke execute on function public.tiene_permiso_acceso_sensible(uuid) from public;
revoke execute on function public.kb_registrar_feedback(uuid, boolean) from public;
revoke execute on function public.dar_baja_empleado(uuid) from public;
revoke execute on function public.crear_notificacion(text, text, uuid, text, text, uuid) from public;
revoke execute on function public.cerrar_ticket(uuid) from public;
revoke execute on function public.reporte_tickets(timestamptz, timestamptz) from public;
revoke execute on function public.reporte_tickets_resumen(timestamptz, timestamptz) from public;
revoke execute on function public.reporte_satisfaccion_consolidado() from public;
revoke execute on function public.tiene_permiso_credenciales_ver(uuid) from public;

-- ============================================================
-- 2) Restaurar EXECUTE solo a `authenticated` donde un rol autenticado
--    realmente necesita invocar la función (RLS o RPC del cliente).
--    log_evento_equipo, log_evento_ticket y crear_notificacion NO
--    aparecen acá a propósito: solo los llaman triggers SECURITY DEFINER
--    (dueño project_admin, que tiene EXECUTE implícito sobre lo suyo),
--    nunca PostgREST/RPC del cliente — quedan sin EXECUTE para ningún rol
--    de runtime, más cerradas que antes del advisor.
-- ============================================================

-- Usadas DESDE políticas RLS de decenas de tablas (auth.uid()-based)
grant execute on function public.es_jefe() to authenticated;
grant execute on function public.es_staff() to authenticated;
grant execute on function public.tiene_permiso_acceso_sensible(uuid) to authenticated;

-- Preparada para RLS futura por paralelismo con la anterior (migración 060)
grant execute on function public.tiene_permiso_credenciales_ver(uuid) to authenticated;

-- Invocadas por RPC desde el frontend (todas con guard interno es_staff())
grant execute on function public.cerrar_ticket(uuid) to authenticated;
grant execute on function public.dar_baja_empleado(uuid) to authenticated;
grant execute on function public.kb_registrar_feedback(uuid, boolean) to authenticated;

-- Preparadas para RPC futura (migración 053, paridad ya validada por
-- scripts/paridad-reporte-tickets.mjs), mismo guard es_staff() interno
grant execute on function public.reporte_tickets(timestamptz, timestamptz) to authenticated;
grant execute on function public.reporte_tickets_resumen(timestamptz, timestamptz) to authenticated;
grant execute on function public.reporte_satisfaccion_consolidado() to authenticated;

-- ============================================================
-- 3) Eliminar las gemelas de prueba que quedaron en producción por
--    descuido (ver contexto punto 2 arriba)
-- ============================================================

drop function if exists public._test_reporte_tickets(timestamptz, timestamptz);
drop function if exists public._test_reporte_tickets_resumen(timestamptz, timestamptz);
drop function if exists public._test_reporte_satisfaccion_consolidado();


-- ============================================================
-- 4) Índices faltantes en columnas FK (advisor: performance/missing-fk-index)
-- ============================================================

create index if not exists idx_asignaciones_cuenta_created_by on public.asignaciones_cuenta(created_by);
create index if not exists idx_asignaciones_cuenta_empleado_id on public.asignaciones_cuenta(empleado_id);
create index if not exists idx_cuentas_created_by on public.cuentas(created_by);
create index if not exists idx_cuentas_plataforma_id on public.cuentas(plataforma_id);
create index if not exists idx_cuentas_updated_by on public.cuentas(updated_by);
create index if not exists idx_empleados_created_by on public.empleados(created_by);
create index if not exists idx_empleados_empresa_id on public.empleados(empresa_id);
create index if not exists idx_empleados_updated_by on public.empleados(updated_by);
create index if not exists idx_empresas_created_by on public.empresas(created_by);
create index if not exists idx_empresas_updated_by on public.empresas(updated_by);
create index if not exists idx_plataformas_created_by on public.plataformas(created_by);
create index if not exists idx_plataformas_updated_by on public.plataformas(updated_by);
create index if not exists idx_accesos_log_user_id on public.accesos_log(user_id);
create index if not exists idx_entregas_created_by on public.entregas(created_by);
create index if not exists idx_entregas_empleado_id on public.entregas(empleado_id);
create index if not exists idx_licencias_created_by on public.licencias(created_by);
create index if not exists idx_licencias_cuenta_id on public.licencias(cuenta_id);
create index if not exists idx_licencias_empresa_id on public.licencias(empresa_id);
create index if not exists idx_licencias_updated_by on public.licencias(updated_by);
create index if not exists idx_asignaciones_licencia_created_by on public.asignaciones_licencia(created_by);
create index if not exists idx_asignaciones_licencia_empleado_id on public.asignaciones_licencia(empleado_id);
create index if not exists idx_equipos_created_by on public.equipos(created_by);
create index if not exists idx_equipos_empresa_id on public.equipos(empresa_id);
create index if not exists idx_equipos_tipo_id on public.equipos(tipo_id);
create index if not exists idx_equipos_updated_by on public.equipos(updated_by);
create index if not exists idx_asignaciones_equipo_created_by on public.asignaciones_equipo(created_by);
create index if not exists idx_asignaciones_equipo_empleado_id on public.asignaciones_equipo(empleado_id);
create index if not exists idx_asignaciones_equipo_ubicacion_id on public.asignaciones_equipo(ubicacion_id);
create index if not exists idx_eventos_equipo_user_id on public.eventos_equipo(user_id);
create index if not exists idx_subcategorias_ticket_categoria_id on public.subcategorias_ticket(categoria_id);
create index if not exists idx_tickets_asignado_a on public.tickets(asignado_a);
create index if not exists idx_tickets_categoria_id on public.tickets(categoria_id);
create index if not exists idx_tickets_creado_por on public.tickets(creado_por);
create index if not exists idx_tickets_cuenta_id on public.tickets(cuenta_id);
create index if not exists idx_tickets_empleado_id on public.tickets(empleado_id);
create index if not exists idx_tickets_equipo_id on public.tickets(equipo_id);
create index if not exists idx_tickets_licencia_id on public.tickets(licencia_id);
create index if not exists idx_tickets_subcategoria_id on public.tickets(subcategoria_id);
create index if not exists idx_ticket_comentarios_autor_id on public.ticket_comentarios(autor_id);
create index if not exists idx_ticket_eventos_user_id on public.ticket_eventos(user_id);
create index if not exists idx_equipo_accesorios_catalogo_id on public.equipo_accesorios(catalogo_id);
create index if not exists idx_accesos_sensibles_created_by on public.accesos_sensibles(created_by);
create index if not exists idx_accesos_sensibles_updated_by on public.accesos_sensibles(updated_by);
create index if not exists idx_kb_articulos_created_by on public.kb_articulos(created_by);
create index if not exists idx_kb_articulos_updated_by on public.kb_articulos(updated_by);
create index if not exists idx_problemas_created_by on public.problemas(created_by);
create index if not exists idx_problemas_responsable_id on public.problemas(responsable_id);
create index if not exists idx_problemas_ticket_disparador_id on public.problemas(ticket_disparador_id);
create index if not exists idx_problemas_updated_by on public.problemas(updated_by);
create index if not exists idx_problema_tickets_created_by on public.problema_tickets(created_by);
create index if not exists idx_acciones_correctivas_created_by on public.acciones_correctivas(created_by);
create index if not exists idx_acciones_correctivas_responsable_id on public.acciones_correctivas(responsable_id);
create index if not exists idx_acciones_correctivas_updated_by on public.acciones_correctivas(updated_by);
create index if not exists idx_encuestas_created_by on public.encuestas(created_by);
create index if not exists idx_encuesta_rondas_created_by on public.encuesta_rondas(created_by);
create index if not exists idx_notificaciones_destinatario_id on public.notificaciones(destinatario_id);
create index if not exists idx_equipos_importacion_created_by on public.equipos_importacion(created_by);
create index if not exists idx_equipos_importacion_empleado_id on public.equipos_importacion(empleado_id);
create index if not exists idx_equipos_importacion_tipo_id on public.equipos_importacion(tipo_id);
create index if not exists idx_equipos_importacion_ubicacion_id on public.equipos_importacion(ubicacion_id);
create index if not exists idx_equipos_importacion_updated_by on public.equipos_importacion(updated_by);


-- ============================================================
-- 5) Autovacuum más agresivo en las 3 tablas de alta rotación marcadas por
--    el advisor con >20% de tuplas muertas (health/dead-tuples)
-- ============================================================

alter table public.entregas set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
alter table public.eventos_equipo set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
alter table public.asignaciones_cuenta set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- ============================================================
-- FIN DE MIGRACIÓN 062
-- Pendiente fuera de este archivo (no puede correr en una transacción):
--   VACUUM ANALYZE public.entregas;
--   VACUUM ANALYZE public.eventos_equipo;
--   VACUUM ANALYZE public.asignaciones_cuenta;
-- ============================================================
