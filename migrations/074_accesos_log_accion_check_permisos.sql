-- ============================================================
-- MIGRACIÓN 074 — accesos_log: restaurar permiso_otorgado/permiso_revocado
-- Depende de: 010 (accesos_log), 024 (creado/editado/eliminado), 030
--             (acceso_denegado), 060 (staff_permisos,
--             trg_staff_permisos_log_evento, permiso_otorgado/revocado),
--             064 (ip/user_agent, entrega_fallida)
--
-- HALLAZGO PERM-060-064 (auditoría de reconciliación, 2026-08-18):
--
-- Causa raíz: la migración 060 amplió accesos_log_accion_check para
-- incluir 'permiso_otorgado'/'permiso_revocado' (los usa el trigger
-- trg_staff_permisos_log_evento, creado en la misma migración, al
-- auditar cada INSERT/DELETE en staff_permisos). La migración 064,
-- escrita después, reconstruyó el mismo constraint (DROP + ADD, el
-- idiom estándar del proyecto para ampliar un check) tomando como base
-- la lista de 030 en vez de la de 060 — es decir, partió de una
-- versión anterior a la que ya estaba vigente en producción y le
-- agregó solo 'entrega_fallida'. El resultado (confirmado en vivo por
-- SELECT, sin escribir nada): el CHECK vigente hoy NO contiene
-- 'permiso_otorgado' ni 'permiso_revocado', aunque el trigger de 060
-- sigue intentando insertarlos.
--
-- Impacto: cualquier INSERT o DELETE en staff_permisos (un JEFE
-- otorgando o revocando el permiso individual "credenciales.ver" desde
-- Configuración → Staff) dispara trg_staff_permisos_log_evento, que
-- intenta registrar la fila en accesos_log con accion =
-- 'permiso_otorgado' o 'permiso_revocado' — el CHECK la rechaza, y como
-- el trigger corre AFTER en la misma transacción que el INSERT/DELETE
-- original, la operación completa se revierte. El otorgamiento/
-- revocación de "credenciales.ver" está roto en producción desde que se
-- aplicó la migración 064 (2026-08-17). Cero filas con esos dos valores
-- en accesos_log a la fecha de esta migración, consistente con el
-- fallo (no con un uso exitoso previo al bug).
--
-- Corrección: ÚNICAMENTE aditiva sobre el conjunto de valores válidos.
-- No se toca el trigger (060), no se toca ninguna política, no se
-- modifica ni borra ninguna fila existente — el mismo idiom DROP+ADD ya
-- usado en 024/030/060/064, con la lista completa reconstruida desde
-- evidencia real de código (functions/credenciales.ts, los 3 triggers
-- que escriben en accesos_log) para no repetir el mismo error de partir
-- de una versión vieja:
--   'ver', 'copiar', 'enviar'                    → credenciales.ts (revelar/entregaCrear)
--   'entrega_creada'                              → 010, en la lista desde el origen;
--                                                    el código real nunca la emite
--                                                    (entregaCrear registra 'enviar' por
--                                                    cuenta incluida en vez de esto — ver
--                                                    el comment on constraint de la 064,
--                                                    que se conserva abajo). Se mantiene:
--                                                    no hay evidencia de que haya dejado
--                                                    de ser válida, solo de que no se usa.
--   'entrega_abierta', 'entrega_fallida'          → credenciales.ts (entregaAbrir)
--   'acceso_denegado'                             → credenciales.ts (accesoDenegado)
--   'creado', 'editado', 'eliminado'               → accesos_sensibles_log_evento (024)
--   'permiso_otorgado', 'permiso_revocado'        → staff_permisos_log_evento (060) — los
--                                                    dos valores que 064 omitió; el motivo
--                                                    de esta migración
-- ============================================================

alter table public.accesos_log drop constraint if exists accesos_log_accion_check;
alter table public.accesos_log add constraint accesos_log_accion_check
  check (accion in (
    'ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta',
    'creado', 'editado', 'eliminado',
    'acceso_denegado',
    'permiso_otorgado', 'permiso_revocado',
    'entrega_fallida'
  ));

comment on constraint accesos_log_accion_check on public.accesos_log is
  'entrega_creada existe en esta lista pero el código real nunca la usa
   (entregaCrear registra "enviar" en su lugar, una fila por cada cuenta
   incluida) — resto histórico de una convención anterior, conservado desde
   la migración 064. permiso_otorgado/permiso_revocado (migración 060, los
   usa trg_staff_permisos_log_evento) se restauran en esta migración: la
   064 reconstruyó este mismo CHECK a partir de una lista anterior a la de
   la 060 y los omitió por descuido (hallazgo PERM-060-064, 2026-08-18).';

-- ============================================================
-- FIN DE MIGRACIÓN 074
-- ============================================================
