-- ============================================================
-- MIGRACIÓN 075 — ROLLBACK de contingencia de la 074 (usar solo si la 074
-- causa un problema nuevo e inesperado — no como parte del flujo normal)
--
-- ⚠️ Aplicar esta migración REINTRODUCE el hallazgo PERM-060-064: el
-- otorgamiento/revocación de "credenciales.ver" (staff_permisos) vuelve a
-- fallar, porque trg_staff_permisos_log_evento (migración 060) sigue
-- intentando insertar 'permiso_otorgado'/'permiso_revocado' en
-- accesos_log y este archivo los vuelve a excluir del CHECK. No aplicar
-- salvo que la migración 074 en sí misma haya causado una regresión
-- distinta y no haya otra forma de revertirla rápido.
--
-- Deja el CHECK exactamente como quedó tras la migración 064 (la lista
-- rota que originó el hallazgo), para volver al estado inmediatamente
-- anterior a la 074 sin adivinar.
-- ============================================================

alter table public.accesos_log drop constraint if exists accesos_log_accion_check;
alter table public.accesos_log add constraint accesos_log_accion_check
  check (accion in (
    'ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta',
    'creado', 'editado', 'eliminado',
    'acceso_denegado',
    'entrega_fallida'
  ));

comment on constraint accesos_log_accion_check on public.accesos_log is
  'entrega_creada existe en esta lista pero el código real nunca la usa
   (entregaCrear registra "enviar" en su lugar, una fila por cada cuenta
   incluida) — resto histórico de una convención anterior.';

-- ============================================================
-- FIN DE MIGRACIÓN 075 (rollback de contingencia de la 074)
-- ============================================================
