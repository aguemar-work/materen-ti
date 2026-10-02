-- ============================================================
-- ROLLBACK de la MIGRACIÓN 113: vuelve a la regla de la 107 (el solicitante no
-- puede quedar en NULL y aprobado_por y aprobado_at son nulos a la vez).
-- ⚠️ Si ya se borró de auth.users a alguien que registró o aprobó un cambio, hay
-- filas con aprobado_por NULL y aprobado_at no nulo: el CHECK viejo no se puede
-- crear. Este script las normaliza (aprobado_at pasa a NULL: se pierde la fecha
-- de aprobación de esas filas). Idempotente.
-- ============================================================

do $$
begin
  if to_regclass('public.cambios') is null then
    return; -- la 107 ya se revirtió: nada que restaurar
  end if;
  execute $sql$
create or replace function public.check_transicion_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_t public.transiciones_cambio_permitidas;
begin
  if new.codigo is distinct from old.codigo
     or new.solicitado_por is distinct from old.solicitado_por then
    raise exception 'Un cambio no cambia de código ni de solicitante.';
  end if;

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
$f$;
  $sql$;
end $$;

do $$
begin
  if to_regclass('public.cambios') is not null then
    -- El trigger de la 107 sigue instalado y la normalización pasaría por él:
    -- se desactiva solo dentro de esta transacción y se vuelve a activar.
    alter table public.cambios disable trigger trg_check_transicion_cambio;
    update public.cambios set aprobado_at = null where aprobado_por is null and aprobado_at is not null;
    alter table public.cambios enable trigger trg_check_transicion_cambio;
    alter table public.cambios drop constraint if exists cambios_aprobacion_coherente;
    alter table public.cambios add constraint cambios_aprobacion_coherente
      check ((aprobado_por is null) = (aprobado_at is null));
  end if;
end $$;
