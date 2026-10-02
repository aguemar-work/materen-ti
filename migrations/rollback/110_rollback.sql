-- ============================================================
-- ROLLBACK de la MIGRACIÓN 110 (tabla actas, registrar_acta, vista
-- v_actas_pendientes, triggers y parámetro actas_pendientes_desde). Usar solo
-- si la 110 causa un problema nuevo e inesperado; NO es parte del flujo
-- normal.
--
-- ⚠️ Orden: ANTES de aplicar este archivo hay que redesplegar la versión
-- anterior de la edge function `equipos-fotos` (sin subirActa/urlActa) y el
-- frontend que no los llame: sin la tabla, esas acciones fallan con
-- error_subiendo / error_interno. dashboard_resumen() (103) NO necesita
-- cambios: su sección actas_pendientes pasa a null sola (undefined_table).
--
-- ⚠️ SE PIERDEN LAS FILAS DE `actas`: son el índice de documentos legales
-- firmados. Los PDF del bucket `actas-firmadas` NO se tocan (se borran a mano,
-- y solo si de verdad se descarta la función: son evidencia). Antes de aplicar
-- este rollback en un entorno con actas reales, exportar la tabla:
--   select * from public.actas;
-- Los eventos 'acta_adjuntada' de eventos_equipo permanecen (son historial;
-- el CHECK que los admite lo mantiene la 101). Idempotente.
-- ============================================================

drop view if exists public.v_actas_pendientes;
drop function if exists public.registrar_acta(uuid, text, text, integer, text, date, uuid);

drop trigger if exists trg_evento_acta_adjuntada on public.actas;
drop trigger if exists trg_actas_inmutables on public.actas;
drop table if exists public.actas;
drop function if exists public.evento_acta_adjuntada();
drop function if exists public.actas_inmutables();

-- Guarda: si la 103 ya se revirtió (config_parametros no existe), re-ejecutar este archivo no debe fallar.
do $$
begin
  if to_regclass('public.config_parametros') is not null then
    delete from public.config_parametros where clave = 'actas_pendientes_desde';
  end if;
end
$$;

-- ============================================================
-- FIN DEL ROLLBACK DE LA MIGRACIÓN 110
-- Después: borrar la fila '110' de public.schema_migrations si se registró.
-- Paso manual opcional: npx @insforge/cli storage delete-bucket actas-firmadas
-- (borra TODOS los PDF firmados: no lo haga sin respaldo).
-- ============================================================
