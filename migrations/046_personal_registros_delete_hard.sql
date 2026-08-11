-- ============================================================
-- MIGRACIÓN 046 — Hard delete de pre-registros de personal
-- Depende de: 042 (personal_registros), 003 (es_jefe)
--
-- Contexto (decisión de negocio, 2026-08-11): personal_registros fue el
-- primer ensayo del patrón "formulario público + edge function + rate
-- limit" (luego maduró en 043_encuestas.sql). No tiene historial de
-- negocio ni FKs entrantes, así que al migrar su información a
-- `empleados` (alta o actualización según coincida el DNI) el registro
-- se elimina físicamente. Es la ÚNICA tabla del sistema con hard delete
-- real desde el cliente — el resto usa softdelete vía `deleted_at`
-- (empleados, cuentas, licencias, equipos) o ni siquiera expone DELETE
-- (encuestas, que sí mantiene softdelete y no se toca acá). No copiar
-- este patrón en otra tabla sin la misma justificación explícita.
--
-- Antes de esta migración, personal_registros solo tenía policies de
-- SELECT y UPDATE para staff (042) — nadie podía borrar filas desde el
-- cliente. Restringido a JEFE, mismo criterio que el DELETE de
-- empleados (003_staff_rls.sql) y de encuestas (043_encuestas.sql).
-- ============================================================

create policy "solo jefe puede eliminar pre-registros de personal"
  on public.personal_registros for delete
  using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 046
-- ============================================================
