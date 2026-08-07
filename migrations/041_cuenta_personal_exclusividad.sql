-- ============================================================
-- MIGRACIÓN 041 — Exclusividad también para cuentas "personal"
-- Depende de: 004 (cuentas_asignaciones), 008 (check_reutilizable_exclusividad)
--
-- Contexto: el diseño de 004 dice explícitamente "es_compartida = false →
-- máximo 1 asignación activa (personal o reutilizable)", pero el trigger
-- de 008 solo implementó el chequeo para 'reutilizable'. Una cuenta
-- 'personal' nunca tuvo el candado en BD, solo la disciplina del código
-- de la app — mismo patrón de fondo que el bug de `cuentas` duplicadas
-- (candado de negocio que vivía únicamente en la aplicación, no en el
-- esquema). No había ninguna cuenta personal con 2 titulares simultáneos
-- al momento de este fix (verificado), pero nada lo impedía.
-- ============================================================

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

-- ============================================================
-- FIN DE MIGRACIÓN 041
-- ============================================================
