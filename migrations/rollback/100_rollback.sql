-- ============================================================
-- ROLLBACK de la MIGRACIÓN 100 (integridad concurrente, CHECKs y
-- trazabilidad). Usar solo si la 100 causa un problema nuevo e inesperado;
-- NO es parte del flujo normal.
--
-- Qué NO se puede revertir sin pérdida:
--   * Normalización de motivo_cierre (sección 4 de la 100): 'entrega a empleado'
--     pasó a 'entrega_a_empleado' en 11 filas de asignaciones_equipo. No se
--     deshace: tras la 100 el frontend nuevo escribe snake_case y no hay forma
--     de distinguir qué filas eran originalmente con espacios. Si el frontend
--     VIEJO volviera a producción, seguirá escribiendo 'entrega a empleado'
--     (sin el CHECK, que este rollback elimina, es válido). Es solo texto
--     descriptivo; no afecta la lógica.
--   * Las columnas de trazabilidad (commit_sha, entorno) se borran CON sus
--     datos: lo registrado desde la 100 se pierde.
--   * Los warnings/NOT VALID no dejan rastro que revertir.
-- Las funciones se restauran a las definiciones de producción verificadas el
-- 2026-10-01 (antes de la 100). Idempotente.
-- Orden con la 099: correr ESTE rollback ANTES que el de la 099 (la policy de
-- transiciones_problema_permitidas usa puede_actual() y bloquearía su DROP;
-- este archivo la elimina junto con la tabla).
-- ============================================================

-- 11) Trazabilidad de despliegue
alter table public.schema_migrations drop column if exists commit_sha;
alter table public.schema_migrations drop column if exists entorno;
alter table public.function_deploys  drop column if exists entorno;

-- 10) Transiciones de problemas
drop trigger if exists trg_check_transicion_problema_permitida on public.problemas;
drop function if exists public.check_transicion_problema_permitida();
drop table if exists public.transiciones_problema_permitidas;

-- 9) realtime.publish() sin tolerancia (definiciones previas)
create or replace function public.notify_list_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.publish(TG_ARGV[0], 'changed', jsonb_build_object('op', TG_OP));
  return null;
end;
$$;

create or replace function public.notify_ticket_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.publish('ticket:' || NEW.token, 'changed', jsonb_build_object('evento', 'estado_changed', 'estado', NEW.estado));
  return null;
end;
$$;

create or replace function public.notify_ticket_comentario_publico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if NEW.interno = false then
    select token into v_token from public.tickets where id = NEW.ticket_id;
    if v_token is not null then
      perform realtime.publish('ticket:' || v_token, 'changed', jsonb_build_object('evento', 'comentario_nuevo', 'mensaje', NEW.mensaje));
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.crear_notificacion(
  p_tipo text,
  p_entidad_tipo text,
  p_entidad_id uuid,
  p_titulo text,
  p_url text,
  p_destinatario_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino, destinatario_id)
  values (p_tipo, p_entidad_tipo, p_entidad_id, p_titulo, p_url, p_destinatario_id)
  returning id into v_id;

  if p_destinatario_id is null then
    perform realtime.publish(
      'notificaciones:nuevas',
      'changed',
      jsonb_build_object('id', v_id, 'tipo', p_tipo, 'titulo', p_titulo, 'url_destino', p_url)
    );
  else
    perform realtime.publish(
      'notificaciones:usuario:' || p_destinatario_id,
      'changed',
      jsonb_build_object('id', v_id, 'tipo', p_tipo, 'titulo', p_titulo, 'url_destino', p_url)
    );
  end if;
end;
$$;

-- 8) encuestas / encuesta_rondas sin trigger de created_by
drop trigger if exists trg_encuestas_by on public.encuestas;
drop trigger if exists trg_encuesta_rondas_by on public.encuesta_rondas;

-- 7) cuentas: vuelve a decidir el cliente
drop trigger if exists trg_cuentas_password_cambio on public.cuentas;
drop function if exists public.cuentas_password_cambio();

-- 6) CHECK de DNI
alter table public.empleados drop constraint if exists empleados_dni_formato;

-- 5) CHECK de fotos
alter table public.equipos drop constraint if exists equipos_fotos_max;

-- 4) CHECK de motivo_cierre (los datos normalizados se conservan, ver cabecera)
alter table public.asignaciones_equipo drop constraint if exists asignaciones_equipo_motivo_cierre_check;

-- 3) updated_by/updated_at: vuelven a pisarse en cascadas
drop trigger if exists trg_equipos_updated_at on public.equipos;
create trigger trg_equipos_updated_at
  before update on public.equipos
  for each row execute function public.set_updated_at();
drop function if exists public.set_updated_at_salvo_anidado();

create or replace function public.set_created_updated_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- 2) Topes y exclusividad sin bloqueo (definiciones previas)
create or replace function public.check_reutilizable_exclusividad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo varchar;
  v_activas int;
begin
  select tipo_cuenta into v_tipo from public.cuentas where id = new.cuenta_id;

  if v_tipo in ('reutilizable', 'personal') then
    select count(*) into v_activas
    from public.asignaciones_cuenta
    where cuenta_id = new.cuenta_id
      and fecha_fin is null;

    if v_activas > 0 then
      raise exception
        'Esta cuenta ya tiene una asignación activa. Cierra la asignación actual antes de crear una nueva.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.check_tope_licencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cantidad int;
  v_activas  int;
begin
  select cantidad into v_cantidad
  from public.licencias
  where id = new.licencia_id and deleted_at is null;

  if v_cantidad is null then
    raise exception 'La licencia no existe o está eliminada.';
  end if;

  select count(*) into v_activas
  from public.asignaciones_licencia
  where licencia_id = new.licencia_id and fecha_fin is null;

  if v_activas >= v_cantidad then
    raise exception
      'La licencia ya usa todos sus asientos (%). Libera uno antes de asignar.', v_cantidad;
  end if;

  return new;
end;
$$;

create or replace function public.check_tope_licencia_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cantidad int;
  v_software text;
  v_activas  int;
begin
  select cantidad, software into v_cantidad, v_software
  from public.licencias
  where cuenta_id = new.cuenta_id and deleted_at is null
  limit 1;

  if v_cantidad is null then
    return new; -- la cuenta no es el login de ninguna licencia
  end if;

  select count(*) into v_activas
  from public.asignaciones_cuenta
  where cuenta_id = new.cuenta_id and fecha_fin is null;

  if v_activas >= v_cantidad then
    raise exception
      'La licencia "%" solo tiene % asiento(s). Libera uno antes de asignar a otra persona.',
      v_software, v_cantidad;
  end if;

  return new;
end;
$$;

-- 1) Índice único parcial
drop index if exists public.asignaciones_equipo_una_activa;

-- ============================================================
-- FIN DEL ROLLBACK DE LA MIGRACIÓN 100
-- Después: borrar la fila '100' de public.schema_migrations si se registró.
-- ============================================================
