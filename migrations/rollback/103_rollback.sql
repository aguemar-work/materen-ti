-- ============================================================
-- ROLLBACK de la MIGRACIÓN 103 (config_parametros, v_licencias_cupo,
-- v_categorias_recurrentes, dashboard_resumen). Usar solo si la 103 causa un
-- problema nuevo e inesperado; NO es parte del flujo normal.
--
-- ⚠️ Orden:
--   1. Revertir ANTES la 110 (rollback/110_rollback.sql): su vista
--      v_actas_pendientes usa parametro_entero() y config_parametros, y este
--      archivo (sin CASCADE a propósito) fallaría con "depends on".
--   2. Con el frontend que llama dashboard_resumen() ya publicado, volver a la
--      versión anterior del Inicio ANTES de revertir (la llamada fallaría con
--      "function does not exist"). Si el frontend aún usa los métodos de
--      dashboard.js, no hay nada que coordinar.
--
-- Se pierden los valores de config_parametros (incluido el contacto de TI que
-- el dueño haya completado): anotarlos antes si hacen falta. Los umbrales
-- vuelven a ser los literales del cliente. Idempotente.
-- ============================================================

drop function if exists public.dashboard_resumen();
drop function if exists public.dashboard_resumen_de(uuid);

drop view if exists public.v_categorias_recurrentes;
drop view if exists public.v_licencias_cupo;

drop function if exists public.contacto_ti_publico();
drop function if exists public.parametro_entero(text, integer, text);

drop trigger if exists trg_config_parametros_validar on public.config_parametros;
drop trigger if exists trg_config_parametros_updated_at on public.config_parametros;
drop table if exists public.config_parametros;
drop function if exists public.config_parametros_validar();

-- ============================================================
-- FIN DEL ROLLBACK DE LA MIGRACIÓN 103
-- Después: borrar la fila '103' de public.schema_migrations si se registró.
-- ============================================================
