-- ============================================================
-- ROLLBACK de la MIGRACIÓN 109 (portal del empleado por enlace firmado). Usar
-- solo si la 109 causa un problema nuevo e inesperado; NO es parte del flujo
-- normal.
--
-- ⚠️ Antes de ejecutar: retirar el frontend que usa /mi/<token> y el diálogo
-- «Enviar enlace del portal», y la edge function `portal` (no se borra sola:
-- `npx @insforge/cli functions delete portal`). Un enlace ya enviado deja de
-- funcionar en cuanto se borra la tabla.
--
-- ⚠️ Efectos:
--   * SE PIERDEN todos los enlaces (empleado_enlaces) y la fecha de confirmación
--     de recepción de los equipos (asignaciones_equipo.confirmado_por_empleado_at
--     y confirmacion_enlace_id). Si hace falta conservarlas, exportarlas antes:
--       select id, equipo_id, empleado_id, confirmado_por_empleado_at from public.asignaciones_equipo where confirmado_por_empleado_at is not null;
--   * Los eventos 'recepcion_confirmada' de eventos_equipo (hoja de vida) NO se
--     borran: es un historial append-only y el valor sigue admitido por el CHECK
--     de la 101.
--   * Las filas de accesos_log (enviar, permiso_revocado, portal_abierto) se
--     conservan: la auditoría no se borra.
--   * purgar_datos_temporales() vuelve a su versión de la 112 (sin la regla de
--     empleado_enlaces) y config_retencion a sus 8 reglas.
-- Revertir esta migración ANTES que la 112. Idempotente.
-- ============================================================

-- 6) Trigger de empleados
drop trigger if exists trg_empleado_revoca_enlaces_portal on public.empleados;
drop function if exists public.empleado_revoca_enlaces_portal();

-- 4 y 5) RPC
drop function if exists public.portal_confirmar_equipo(text, uuid, text);
drop function if exists public.portal_abrir(text, text);
drop function if exists public.portal_resolver_enlace(text);
drop function if exists public.portal_revocar_enlace(uuid);
drop function if exists public.portal_emitir_enlace(uuid, text[], integer);

-- 7) Retención: la purga vuelve a la versión de la 112 (copia exacta) y la regla sale.
do $do$
begin
  -- Solo si la 112 sigue aplicada (con un rollback ya hecho de la 112 esto no resucita nada).
  if to_regclass('public.config_retencion') is not null
     and to_regprocedure('public.purgar_datos_temporales()') is not null then
    execute $fn$
create or replace function public.purgar_datos_temporales()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  v_n       bigint;
  v_total   bigint := 0;
  v_errores integer := 0;
  v_res     jsonb := '{}'::jsonb;
  v_corte   timestamptz;
  v_uid     uuid := auth.uid();
  v_email   text;
  v_salida  jsonb;
begin
  -- Dos purgas simultáneas (cron + manual) no se pisan.
  if not pg_try_advisory_xact_lock(hashtextextended('purgar_datos_temporales', 0)) then
    return jsonb_build_object('omitida', true, 'motivo', 'otra purga está en curso');
  end if;

  for r in
    select c.tabla, c.dias, c.accion
      from public.config_retencion c
     where c.activo
     order by c.tabla
  loop
    v_corte := now() - make_interval(days => r.dias);
    v_n := 0;

    begin
      if to_regclass('public.' || r.tabla) is null then
        v_res := v_res || jsonb_build_object(r.tabla, 'tabla_inexistente');
        continue;
      end if;

      if r.tabla = 'intentos_publicos' then
        delete from public.intentos_publicos where created_at < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'ticket_busqueda_intentos' then
        delete from public.ticket_busqueda_intentos where created_at < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'ticket_creacion_intentos' then
        delete from public.ticket_creacion_intentos where created_at < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'encuesta_respuesta_intentos' then
        delete from public.encuesta_respuesta_intentos where created_at < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'contexto_transaccion' then
        delete from public.contexto_transaccion where creado_en < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'entregas' then
        -- 30 días después de abierta (viewed_at) o, si nunca se abrió, de vencida.
        update public.entregas
           set payload = ''
         where payload <> ''
           and coalesce(viewed_at, expires_at) < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'notificaciones' then
        -- Solo leídas. Personal: la leyó su destinatario. General (destinatario
        -- null): la leyó todo el staff activo que ya existía al crearse.
        delete from public.notificaciones n
         where n.creado_en < v_corte
           and (
             case
               when n.destinatario_id is not null then
                 exists (
                   select 1 from public.notificaciones_lecturas l
                    where l.notificacion_id = n.id and l.usuario_id = n.destinatario_id
                 )
               else
                 not exists (
                   select 1 from public.staff s
                    where s.activo
                      and s.created_at <= n.creado_en
                      and not exists (
                        select 1 from public.notificaciones_lecturas l
                         where l.notificacion_id = n.id and l.usuario_id = s.user_id
                      )
                 )
             end
           );
        get diagnostics v_n = row_count;

      elsif r.tabla = 'accesos_log' then
        -- UPDATE acotado a ip y user_agent; las filas no se borran.
        update public.accesos_log
           set ip = null, user_agent = null
         where created_at < v_corte
           and (ip is not null or user_agent is not null);
        get diagnostics v_n = row_count;

      else
        v_res := v_res || jsonb_build_object(r.tabla, 'regla_sin_implementacion');
        continue;
      end if;

      v_res := v_res || jsonb_build_object(r.tabla, v_n);
      v_total := v_total + v_n;
    exception when others then
      v_errores := v_errores + 1;
      v_res := v_res || jsonb_build_object(r.tabla, 'error ' || sqlstate);
      raise warning 'purgar_datos_temporales: la regla % falló (SQLSTATE %).', r.tabla, sqlstate;
    end;
  end loop;

  v_salida := jsonb_build_object(
    'ejecutada_en', now(), 'total', v_total, 'errores', v_errores, 'tablas', v_res);

  if v_uid is not null then
    select email into v_email from auth.users where id = v_uid;
  end if;

  -- Auditoría sin datos personales: solo los conteos. Fail-closed.
  insert into public.accesos_log (user_id, user_email, cuenta_usuario, accion, detalle)
  values (v_uid, v_email, '(sistema)', 'purga_ejecutada', v_salida::text);

  return v_salida;
end;
$$;
    $fn$;
    alter function public.purgar_datos_temporales() owner to project_admin;
    revoke all on function public.purgar_datos_temporales() from public, anon, authenticated;
    grant execute on function public.purgar_datos_temporales() to project_admin;
    comment on function public.purgar_datos_temporales() is
      'Aplica las reglas activas de config_retencion y registra purga_ejecutada en accesos_log (solo conteos). EXECUTE solo project_admin: lo invocan el cron/schedule y purgar_datos_temporales_manual(). 112.';

    delete from public.config_retencion where tabla = 'empleado_enlaces';
    alter table public.config_retencion drop constraint if exists config_retencion_tabla_check;
    alter table public.config_retencion add constraint config_retencion_tabla_check check (tabla in (
      'intentos_publicos', 'ticket_busqueda_intentos', 'ticket_creacion_intentos',
      'encuesta_respuesta_intentos', 'contexto_transaccion', 'entregas',
      'notificaciones', 'accesos_log'
    ));
  end if;
end $do$;

-- 3) Parámetro
do $do$
begin
  if to_regclass('public.config_parametros') is not null then
    delete from public.config_parametros where clave = 'portal_vigencia_dias';
  end if;
end $do$;

-- 2) asignaciones_equipo: guard y columnas (la FK a empleado_enlaces cae con la columna)
drop trigger if exists trg_asig_equipo_confirmacion_guard on public.asignaciones_equipo;
drop function if exists public.asignacion_equipo_confirmacion_guard();
drop index if exists public.idx_asig_equipo_confirmacion_enlace;
alter table public.asignaciones_equipo drop column if exists confirmacion_enlace_id;
alter table public.asignaciones_equipo drop column if exists confirmado_por_empleado_at;

-- 1) Tabla (sin CASCADE a propósito)
drop table if exists public.empleado_enlaces;

-- ============================================================
-- Verificación
-- ============================================================
-- select count(*) as sobran from pg_class where relnamespace = 'public'::regnamespace and relname = 'empleado_enlaces';   -- esperado 0
-- select count(*) as sobran from pg_proc where pronamespace = 'public'::regnamespace and proname in ('portal_emitir_enlace','portal_revocar_enlace','portal_resolver_enlace','portal_abrir','portal_confirmar_equipo','asignacion_equipo_confirmacion_guard','empleado_revoca_enlaces_portal');   -- esperado 0
-- select count(*) as sobran from information_schema.columns where table_schema = 'public' and table_name = 'asignaciones_equipo' and column_name in ('confirmado_por_empleado_at','confirmacion_enlace_id');   -- esperado 0
-- select count(*) as reglas from public.config_retencion;   -- esperado 8
-- ============================================================
-- FIN DEL ROLLBACK DE LA MIGRACIÓN 109
-- Después: borrar la fila '109' de public.schema_migrations si se registró.
-- ============================================================
