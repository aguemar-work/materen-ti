-- ============================================================
-- MIGRACIÓN 113 — Borrar de auth.users a quien registró o aprobó un cambio
--
-- Hallazgo (verificado en PGlite al cerrar la 107): las claves foráneas
-- cambios.solicitado_por y cambios.aprobado_por son `on delete set null`, pero
-- borrar a ese usuario fallaba:
--   · el UPDATE implícito sobre `cambios` lo rechazaba check_transicion_cambio
--     ("Un cambio no cambia de código ni de solicitante");
--   · con un aprobador, además, el CHECK cambios_aprobacion_coherente exigía
--     que aprobado_por y aprobado_at fueran nulos a la vez, y aprobado_at se
--     conserva a propósito (la fecha de aprobación es un hecho del expediente).
-- Baja urgencia: el staff se desactiva, no se borra. Pero un DELETE legítimo
-- (cuenta de prueba, depuración de datos) no debe quedar bloqueado.
--
-- Qué hace:
--   1) check_transicion_cambio(): `solicitado_por` puede pasar a NULL (nunca a
--      otro usuario); el resto de la función es idéntico a la 107.
--   2) cambios_aprobacion_coherente: aprobado_por is null OR aprobado_at is not
--      null (una aprobación siempre tiene fecha; la fecha puede sobrevivir al
--      aprobador borrado).
--
-- Requiere la 107. Idempotente. Rollback: migrations/rollback/113_rollback.sql
-- ============================================================

do $$
begin
  if to_regclass('public.cambios') is null
     or to_regprocedure('public.check_transicion_cambio()') is null then
    raise exception 'La migración 113 requiere la 107 (cambios, check_transicion_cambio). Aplíquela primero.';
  end if;
end $$;

create or replace function public.check_transicion_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.transiciones_cambio_permitidas;
begin
  -- El código no cambia nunca; el solicitante no cambia de persona (solo puede
  -- quedar en NULL cuando se borra su usuario: on delete set null).
  if new.codigo is distinct from old.codigo
     or (new.solicitado_por is distinct from old.solicitado_por and new.solicitado_por is not null) then
    raise exception 'Un cambio no cambia de código ni de solicitante.';
  end if;

  -- Lo aprobado es lo que se ejecuta: fuera de borrador el contenido se congela.
  if old.estado <> 'borrador' and (
       new.titulo is distinct from old.titulo
    or new.tipo is distinct from old.tipo
    or new.riesgo is distinct from old.riesgo
    or new.servicio_id is distinct from old.servicio_id
    or new.descripcion is distinct from old.descripcion
    or new.plan_retroceso is distinct from old.plan_retroceso
    or new.ventana_inicio is distinct from old.ventana_inicio
    or new.ventana_fin is distinct from old.ventana_fin) then
    raise exception 'El cambio % ya salió de borrador: no se edita. Cancélelo y registre uno nuevo.', old.codigo;
  end if;

  -- Quien aprueba es un jefe activo.
  if new.aprobado_por is not null and new.aprobado_por is distinct from old.aprobado_por then
    if not exists (select 1 from public.staff s where s.user_id = new.aprobado_por and s.rol = 'JEFE' and s.activo) then
      raise exception 'Solo un jefe activo puede aprobar un cambio.';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    select * into v_t from public.transiciones_cambio_permitidas
     where origen = old.estado and destino = new.estado;
    if not found or not (new.tipo = any (v_t.tipos)) then
      raise exception 'Transición de estado de cambio "%" a "%" no permitida para un cambio %.', old.estado, new.estado, new.tipo;
    end if;

    if new.estado = 'aprobado' and new.tipo <> 'estandar' and new.aprobado_por is null then
      raise exception 'Un cambio % solo pasa a aprobado con la aprobación de un jefe.', new.tipo;
    end if;
    if new.estado = 'cerrado' and new.tipo = 'emergencia' and new.aprobado_por is null then
      raise exception 'Un cambio de emergencia no se cierra sin la aprobación a posteriori de un jefe (plazo de 48 horas).';
    end if;
  end if;

  return new;
end;
$$;

alter table public.cambios drop constraint if exists cambios_aprobacion_coherente;
alter table public.cambios add constraint cambios_aprobacion_coherente
  check (aprobado_por is null or aprobado_at is not null);

-- ============================================================
-- Verificación — correr DESPUÉS de aplicar
-- ============================================================
-- 1) El CHECK nuevo (esperado: 1 fila con "aprobado_por IS NULL OR aprobado_at IS NOT NULL"):
--    select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.cambios'::regclass and conname = 'cambios_aprobacion_coherente';
-- 2) El trigger sigue activo (esperado: tgenabled = 'O'):
--    select tgname, tgenabled from pg_trigger where tgrelid = 'public.cambios'::regclass and tgname = 'trg_check_transicion_cambio';
