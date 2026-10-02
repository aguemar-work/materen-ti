-- ============================================================
-- ROLLBACK de la MIGRACIÓN 101 (RPC transaccionales de cuentas, equipos y
-- licencias; trigger de auditoría de cuentas; CHECK de eventos_equipo).
-- Usar solo si la 101 causa un problema nuevo e inesperado; NO es parte del
-- flujo normal. Idempotente.
--
-- Qué NO se puede revertir (o no conviene):
--   * Las filas que cuentas_log_evento ya escribió en accesos_log
--     (creado / editado / eliminado de cuentas): accesos_log es auditoría
--     inmutable y no se toca. Se distinguen por cuenta_id no nulo y detalle
--     "Cuenta ..." / "Cambios: ...".
--   * Los eventos 'verificado' (y 'acta_adjuntada' / 'recepcion_confirmada'
--     si 102/103/110 ya se aplicaron) ya registrados en eventos_equipo: si
--     existen, el CHECK anterior NO se restaura como válido (nacería con
--     filas que lo violan): se recrea NOT VALID con un aviso, y las filas
--     nuevas siguen sujetas a los 4 valores originales.
--   * Lo que las RPC ya escribieron (cuentas, asignaciones, equipos, eventos
--     'asignado'/'devuelto'/'estado_cambiado', filas borradas de
--     equipos_importacion, licencias) son datos de negocio normales.
-- Antes de correr este rollback, desplegar el frontend que ya NO llama a
-- estas RPC (el frontend de la 101 las usa); si no, las pantallas de
-- Correos, Equipos, Importación y Licencias fallarán.
-- Orden con otras migraciones: este rollback va ANTES que los de 102, 103 y
-- 110 solo si esas ya usan los valores nuevos de eventos_equipo; si 102/103/
-- 110 siguen aplicadas, revertir primero esas.
-- Las funciones se restauran a las definiciones de producción verificadas el
-- 2026-10-01 (revocar_cuenta_personal = la de la 086, sección 4).
-- ============================================================

-- 8) revocar_cuenta_personal: cuerpo anterior (086), sin delegar. Misma firma,
--    dueño y GRANT (create or replace los conserva).
create or replace function public.revocar_cuenta_personal(p_asignacion_id uuid)
returns void
language plpgsql
as $$
declare
  v_cuenta_id uuid;
  v_tipo_cuenta text;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  select cuenta_id into v_cuenta_id
  from public.asignaciones_cuenta
  where id = p_asignacion_id;

  if v_cuenta_id is null then
    raise exception 'Asignación no encontrada';
  end if;

  select tipo_cuenta into v_tipo_cuenta
  from public.cuentas
  where id = v_cuenta_id;

  if v_tipo_cuenta is distinct from 'personal' then
    raise exception 'revocar_cuenta_personal solo aplica a cuentas tipo "personal" (usar cerrarAsignacion para compartida/reutilizable)';
  end if;

  update public.asignaciones_cuenta
  set fecha_fin = (now() at time zone 'America/Lima')::date
  where id = p_asignacion_id;

  update public.cuentas
  set deleted_at = now()
  where id = v_cuenta_id;
end;
$$;

-- 7) RPC públicas
drop function if exists public.verificar_equipo(uuid, uuid, text);
drop function if exists public.crear_licencia_con_cuenta(jsonb, jsonb);
drop function if exists public.migrar_importacion_equipos(uuid[]);
drop function if exists public.migrar_importacion_equipo(uuid, jsonb);
drop function if exists public.mover_equipo(uuid, uuid);
drop function if exists public.devolver_equipo(uuid, text, text, boolean);
drop function if exists public.asignar_equipo(uuid, uuid, text);
drop function if exists public.cerrar_asignacion_cuenta(uuid, text);
drop function if exists public.traspasar_cuenta(uuid, uuid, text, text);
drop function if exists public.crear_cuenta_asignada(text, text, uuid, text, text, text, text);

-- 6) Auditoría CRUD de cuentas
drop trigger if exists trg_cuentas_log_evento on public.cuentas;
drop function if exists public.cuentas_log_evento();

-- 5) CHECK de eventos_equipo: solo los 4 valores originales (si ya hay filas
--    con valores nuevos, NOT VALID y aviso)
alter table public.eventos_equipo drop constraint if exists eventos_equipo_evento_check;
do $$
begin
  if exists (
    select 1 from public.eventos_equipo
     where evento not in ('registrado', 'asignado', 'devuelto', 'estado_cambiado')
  ) then
    alter table public.eventos_equipo add constraint eventos_equipo_evento_check
      check (evento in ('registrado', 'asignado', 'devuelto', 'estado_cambiado')) not valid;
    raise warning 'eventos_equipo_evento_check restaurado NOT VALID: ya hay eventos verificado/acta_adjuntada/recepcion_confirmada. No se pierden; las filas nuevas solo admiten los 4 valores originales.';
  else
    alter table public.eventos_equipo add constraint eventos_equipo_evento_check
      check (evento in ('registrado', 'asignado', 'devuelto', 'estado_cambiado'));
  end if;
end $$;

-- 4..1) Núcleos y funciones de apoyo
drop function if exists public.verificar_equipo_nucleo(uuid, uuid, text);
drop function if exists public.crear_licencia_con_cuenta_nucleo(jsonb, jsonb);
drop function if exists public.migrar_importacion_equipos_nucleo(uuid[]);
drop function if exists public.migrar_importacion_equipo_nucleo(uuid, jsonb);
drop function if exists public.importacion_motivo_bloqueo(public.equipos_importacion, uuid[]);
drop function if exists public.mover_equipo_nucleo(uuid, uuid);
drop function if exists public.devolver_equipo_nucleo(uuid, text, text, boolean);
drop function if exists public.asignar_equipo_nucleo(uuid, uuid, text);
drop function if exists public.cerrar_asignacion_cuenta_nucleo(uuid, text);
drop function if exists public.traspasar_cuenta_nucleo(uuid, uuid, text, text);
drop function if exists public.crear_cuenta_asignada_nucleo(text, text, uuid, text, text, text, text);
drop function if exists public.cuenta_insertar_validada(text, text, text, text, text, text, text[]);
drop function if exists public.texto_limpio(text);

-- Verificación (esperado: 0 filas en ambas):
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('texto_limpio','cuenta_insertar_validada','crear_cuenta_asignada','crear_cuenta_asignada_nucleo','traspasar_cuenta','traspasar_cuenta_nucleo','cerrar_asignacion_cuenta','cerrar_asignacion_cuenta_nucleo','asignar_equipo','asignar_equipo_nucleo','devolver_equipo','devolver_equipo_nucleo','mover_equipo','mover_equipo_nucleo','importacion_motivo_bloqueo','migrar_importacion_equipo','migrar_importacion_equipo_nucleo','migrar_importacion_equipos','migrar_importacion_equipos_nucleo','crear_licencia_con_cuenta','crear_licencia_con_cuenta_nucleo','verificar_equipo','verificar_equipo_nucleo','cuentas_log_evento');
--   select tgname from pg_trigger where tgrelid = 'public.cuentas'::regclass and tgname = 'trg_cuentas_log_evento';
-- y, si no se aplicaron 102/103/110, que el CHECK vuelva a tener 4 valores:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'eventos_equipo_evento_check';
-- Y el registro de la migración (si se aplicó con scripts/deploy.mjs):
--   delete from public.schema_migrations where version = '101';   -- solo con autorización
