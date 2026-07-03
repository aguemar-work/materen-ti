-- ============================================================
-- MIGRACIÓN 008 — Mejoras de integridad y trazabilidad
-- 1. Trigger que impide asignar una cuenta reutilizable
--    si ya tiene una asignación activa (constraint de negocio)
-- 2. Columna last_password_change en cuentas
-- ============================================================

-- ── 1. last_password_change ──────────────────────────────────
alter table public.cuentas
  add column if not exists last_password_change timestamptz;

-- ── 2. Constraint reutilizable: solo una asignación activa ───
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

  if v_tipo = 'reutilizable' then
    select count(*) into v_activas
    from public.asignaciones_cuenta
    where cuenta_id = new.cuenta_id
      and fecha_fin is null;

    if v_activas > 0 then
      raise exception
        'La cuenta reutilizable ya tiene una asignación activa. Cierra la asignación actual antes de crear una nueva.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_reutilizable on public.asignaciones_cuenta;

create trigger trg_check_reutilizable
  before insert on public.asignaciones_cuenta
  for each row execute function public.check_reutilizable_exclusividad();

-- ============================================================
-- FIN DE MIGRACIÓN 008
-- ============================================================
