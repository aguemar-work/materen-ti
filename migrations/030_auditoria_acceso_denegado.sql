-- ============================================================
-- MIGRACIÓN 030 — Auditoría de accesos denegados por rol
-- Depende de: 010 (accesos_log), 024 (check de accion ya ampliado)
--
-- El guard del router (frontend/src/router/guards.js) bloquea las rutas
-- restringidas por rol (/actividad, /accesos-sensibles y la pestaña Staff
-- de Configuración para quien no es JEFE), pero ese bloqueo no dejaba
-- ningún rastro. Se reusa accesos_log — misma decisión que la migración
-- 024: ampliar el check de valores permitidos antes que duplicar la
-- infraestructura de auditoría — con la acción nueva 'acceso_denegado':
--   cuenta_usuario → ruta que se intentó abrir (snapshot de texto)
--   plataforma     → null
--   detalle        → rol con el que se intentó
-- La escribe SOLO la edge function credenciales (acción accesoDenegado,
-- que toma usuario y rol del token, no del body); el cliente sigue sin
-- política de INSERT. No se toca ninguna fila existente.
-- ============================================================

alter table public.accesos_log drop constraint if exists accesos_log_accion_check;
alter table public.accesos_log add constraint accesos_log_accion_check
  check (accion in (
    'ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta',
    'creado', 'editado', 'eliminado',
    'acceso_denegado'
  ));

-- ============================================================
-- FIN DE MIGRACIÓN 030
-- ============================================================
