-- ============================================================
-- ROLLBACK de la MIGRACIÓN 102 (ciclo de vida del empleado)
-- Usar solo si la 102 causa un problema nuevo e inesperado; NO es parte del
-- flujo normal. Restaura el estado previo a la 102: dar_baja_empleado(uuid)
-- con el cuerpo de la 086, sin triggers de eventos/transición/suspensión,
-- sin las tablas nuevas y con notificaciones_tipo_check de 8 valores.
--
-- ⚠️ DESCARTA LA AUDITORÍA DE EMPLEADOS: DROP TABLE de empleado_eventos y
-- empleado_revisiones_acceso borra todo lo registrado desde la 102 (y el
-- backfill, que se puede regenerar reaplicando la 102, pero no lo posterior).
-- Si hace falta conservarla, exportar antes:
--   select * from public.empleado_eventos order by created_at;
--   select * from public.empleado_revisiones_acceso order by revisado_at;
-- ⚠️ Antes de ejecutar, revertir el frontend que llame a suspender_empleado /
-- reactivar_empleado / reingresar_empleado / registrar_revision_accesos o lea
-- empleado_eventos: dejarían de existir. dar_baja_empleado con un solo
-- argumento nombrado (p_empleado_id) sigue funcionando con la firma restaurada;
-- uno con p_motivo fallaría.
-- ⚠️ Si la 093 de V2 ya lee contexto_actual() en rol_actor_contexto(), revertir
-- primero ese cambio (el DROP de contexto_transaccion lo dejaría roto).
-- ⚠️ Las cuentas que la suspensión marcó con requiere_rotacion = true
-- conservan la marca (es un dato, no se revierte), y las notificaciones
-- 'empleado_suspendido' ya escritas se conservan: por eso el CHECK vuelve a
-- 8 valores como NOT VALID si existe alguna (no se borran notificaciones).
-- Los empleados que hayan quedado en estado Suspendido siguen así (el enum no
-- cambia).
-- Idempotente.
-- ============================================================

-- 8/7/5) Triggers de empleados
drop trigger if exists trg_empleados_suspension_efectos on public.empleados;
drop trigger if exists trg_check_transicion_empleado on public.empleados;
drop trigger if exists trg_evento_empleado_cambios on public.empleados;

drop function if exists public.efectos_suspension_empleado();
drop function if exists public.check_transicion_empleado();
drop function if exists public.evento_empleado_cambios();

-- 7) Revisiones de acceso
drop function if exists public.registrar_revision_accesos(uuid, jsonb, text);
drop view if exists public.v_empleado_ultima_revision_acceso;
drop table if exists public.empleado_revisiones_acceso;

-- 6) RPC del ciclo de vida
drop function if exists public.suspender_empleado(uuid, text);
drop function if exists public.reactivar_empleado(uuid, text);
drop function if exists public.reingresar_empleado(uuid, jsonb);
drop function if exists public.dar_baja_empleado(uuid, text);
drop function if exists public.empleado_suspender_interno(uuid, text);
drop function if exists public.empleado_reactivar_interno(uuid, text);
drop function if exists public.empleado_reingresar_interno(uuid, jsonb);
drop function if exists public.empleado_dar_baja_interno(uuid, text);

-- dar_baja_empleado(uuid): cuerpo de la 086 (que reemplazó a la 038: guard
-- de módulo 'empleados' y fecha de Lima). Dueño y GRANT como en la 038/062.
create or replace function public.dar_baja_empleado(p_empleado_id uuid)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date;
  v_empleado public.empleados;
  v_cuentas_personales uuid[];
begin
  if not (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('empleados'))) then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado';
  end if;

  v_hoy := (now() at time zone 'America/Lima')::date;

  -- Cuentas personales activas de este empleado (antes de cerrar la
  -- asignación): son las que se dan de baja junto con él. Reutilizables/
  -- compartidas NO se tocan acá — quedan libres y "por rotar" vía el
  -- trigger marcar_rotacion_pendiente() al cerrarse su asignación.
  select array_agg(c.id) into v_cuentas_personales
    from public.asignaciones_cuenta a
    join public.cuentas c on c.id = a.cuenta_id
   where a.empleado_id = p_empleado_id
     and a.fecha_fin is null
     and c.tipo_cuenta = 'personal';

  update public.asignaciones_cuenta
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;

  update public.asignaciones_licencia
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;

  if v_cuentas_personales is not null then
    update public.cuentas
       set deleted_at = now()
     where id = any(v_cuentas_personales);
  end if;

  update public.empleados
     set estado = 'Inactivo'
   where id = p_empleado_id
   returning * into v_empleado;

  return v_empleado;
end;
$$;

comment on function public.dar_baja_empleado(uuid) is
  'Baja atómica de un empleado: cierra asignaciones de cuentas y licencias, da de baja sus cuentas personales y marca estado=Inactivo, todo en una sola transacción de servidor. Reemplaza las 4 escrituras secuenciales que hacía el cliente (auditoría integral 2026-08-05, hallazgo A-01).';

alter function public.dar_baja_empleado(uuid) owner to project_admin;
revoke all on function public.dar_baja_empleado(uuid) from public, anon;
grant execute on function public.dar_baja_empleado(uuid) to authenticated;

-- 5.a) notificaciones_tipo_check → los 8 valores previos a la 102
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;

do $$
begin
  if exists (select 1 from public.notificaciones where tipo = 'empleado_suspendido') then
    alter table public.notificaciones add constraint notificaciones_tipo_check
      check (tipo in (
        'ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja',
        'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo',
        'ticket_correo_fallido'
      )) not valid;
    raise warning 'notificaciones_tipo_check creado NOT VALID: existen notificaciones empleado_suspendido (se conservan).';
  else
    alter table public.notificaciones add constraint notificaciones_tipo_check
      check (tipo in (
        'ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja',
        'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo',
        'ticket_correo_fallido'
      ));
  end if;
end $$;

-- 4) Whitelist de transiciones
drop table if exists public.transiciones_empleado_permitidas;

-- 3) Hoja de vida del empleado (el trigger de inmutabilidad cae con la tabla;
-- DROP TABLE no dispara triggers de fila)
drop table if exists public.empleado_eventos;
drop function if exists public.empleado_eventos_inmutable();
drop function if exists public.registrar_evento_empleado(uuid, text, text, text, text, text);
drop function if exists public.rol_actor_empleado();

-- 2) Contexto de transacción
drop function if exists public.restaurar_contexto(text, text);
drop function if exists public.contexto_actual();
drop function if exists public.marcar_contexto(text, text);
drop table if exists public.contexto_transaccion;

-- 1) Interruptor de compatibilidad
drop table if exists public.empleados_ajustes;

-- ============================================================
-- Verificación
-- ============================================================
-- select count(*) as sobran from pg_class where relnamespace = 'public'::regnamespace and relname in ('empleados_ajustes','contexto_transaccion','empleado_eventos','transiciones_empleado_permitidas','empleado_revisiones_acceso','v_empleado_ultima_revision_acceso');   -- esperado 0
-- select proname, pg_get_function_identity_arguments(oid) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('dar_baja_empleado','suspender_empleado','marcar_contexto');   -- esperado: solo dar_baja_empleado(p_empleado_id uuid)
-- select tgname from pg_trigger where tgrelid = 'public.empleados'::regclass and tgname in ('trg_check_transicion_empleado','trg_evento_empleado_cambios','trg_empleados_suspension_efectos');   -- esperado 0 filas
-- ============================================================
-- FIN DEL ROLLBACK 102
-- ============================================================
