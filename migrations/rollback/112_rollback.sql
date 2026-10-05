-- ============================================================
-- ROLLBACK de la MIGRACIÓN 112 (retención, purga, anonimización y entorno).
-- Usar solo si la 112 causa un problema nuevo e inesperado; NO es parte del
-- flujo normal.
--
-- ⚠️ Antes de ejecutar:
--   1. Si ya se creó el schedule de la purga diaria (ver la cabecera de la
--      112), eliminarlo primero: `npx @insforge/cli schedules delete <id>`.
--      Una purga que apunte a una función borrada fallaría cada día.
--   2. Revertir cualquier código (edge function o pantalla) que llame a
--      purgar_datos_temporales / anonimizar_empleado / es_branch.
--
-- ⚠️ Lo que NO se revierte (los datos no vuelven):
--   * Las anonimizaciones ya hechas: nombres, DNI, contacto y notas de esos
--     empleados siguen anonimizados. Al borrarse la columna
--     empleados.anonimizado_at se pierde la marca de cuáles eran; el evento
--     'anonimizado' de empleado_eventos (102) sí los sigue identificando.
--   * Lo ya purgado (intentos viejos, payload de entregas vencidas, ip y
--     user_agent de accesos_log antiguos, notificaciones leídas).
--   * Las filas 'purga_ejecutada' de accesos_log (la auditoría no se borra).
-- Se pierden los ajustes del JEFE en config_retencion y el valor de
-- 'anios_anonimizacion_empleado'. Idempotente.
-- ============================================================

-- 4) Entorno
drop function if exists public.es_branch();
drop trigger if exists trg_entorno_actualizar on public.entorno;
drop trigger if exists trg_entorno_no_vaciar on public.entorno;
drop trigger if exists trg_entorno_no_borrar on public.entorno;
drop table if exists public.entorno;
drop function if exists public.entorno_proteger();

-- 3) Anonimización (la vista antes que la columna y las funciones)
drop view if exists public.v_empleados_anonimizables;
drop function if exists public.anonimizar_empleado(uuid, text);
drop function if exists public.anonimizar_empleado_interno(uuid, text);
drop function if exists public.empleado_fecha_baja(uuid);
alter table public.empleados drop column if exists anonimizado_at;

-- 2) Purga
drop function if exists public.purgar_datos_temporales_manual();
drop function if exists public.purgar_datos_temporales();

-- 1) Reglas de retención y parámetro
drop trigger if exists trg_config_retencion_validar on public.config_retencion;
drop table if exists public.config_retencion;
drop function if exists public.config_retencion_validar();

do $$
begin
  if to_regclass('public.config_parametros') is not null then
    delete from public.config_parametros where clave = 'anios_anonimizacion_empleado';
  end if;
end $$;

-- ============================================================
-- Verificación
-- ============================================================
-- select count(*) as sobran from pg_class where relnamespace = 'public'::regnamespace and relname in ('config_retencion','entorno','v_empleados_anonimizables');   -- esperado 0
-- select count(*) as sobran from pg_proc where pronamespace = 'public'::regnamespace and proname in ('purgar_datos_temporales','purgar_datos_temporales_manual','anonimizar_empleado','anonimizar_empleado_interno','empleado_fecha_baja','es_branch','config_retencion_validar','entorno_proteger');   -- esperado 0
-- select count(*) as sobra from information_schema.columns where table_schema = 'public' and table_name = 'empleados' and column_name = 'anonimizado_at';   -- esperado 0
-- ============================================================
-- FIN DEL ROLLBACK DE LA MIGRACIÓN 112
-- Después: borrar la fila '112' de public.schema_migrations si se registró.
-- ============================================================
