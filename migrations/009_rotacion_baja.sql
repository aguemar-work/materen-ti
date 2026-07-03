-- ============================================================
-- MIGRACIÓN 009 — Rotación de contraseñas y baja de empleado
-- Depende de: 001..008
-- 1. Columna requiere_rotacion en cuentas
-- 2. Trigger: al cerrar una asignación de cuenta reutilizable o
--    compartida, la cuenta queda marcada "requiere rotación"
--    hasta que alguien cambie la contraseña.
--
-- Regla de negocio (definida con el JEFE):
--   - Cuenta personal      → al dar de baja al empleado, se da de
--                            baja la cuenta (softdelete desde la app)
--   - Cuenta reutilizable  → queda disponible para el siguiente,
--                            con aviso de rotar contraseña
--   - Cuenta compartida    → pierde a ese usuario, con aviso de
--                            rotar contraseña (los demás siguen)
-- El aviso NO bloquea la reasignación: solo indica.
-- ============================================================

alter table public.cuentas
  add column if not exists requiere_rotacion boolean not null default false;

comment on column public.cuentas.requiere_rotacion is
  'true = un titular dejó la cuenta y la contraseña aún no se rota. Se limpia al cambiar la contraseña.';

-- ------------------------------------------------------------
-- Trigger: marcar rotación pendiente al cerrar una asignación
-- ------------------------------------------------------------
-- Se dispara cuando fecha_fin pasa de NULL a una fecha (cierre).
-- Solo aplica a cuentas reutilizables/compartidas vivas: las
-- personales se dan de baja junto con el empleado, no se heredan.
-- SECURITY DEFINER: el update sobre cuentas no depende del RLS
-- del usuario que cierra la asignación.
-- ------------------------------------------------------------

create or replace function public.marcar_rotacion_pendiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.fecha_fin is null and new.fecha_fin is not null then
    update public.cuentas
      set requiere_rotacion = true
      where id = new.cuenta_id
        and tipo_cuenta in ('reutilizable', 'compartida')
        and deleted_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marcar_rotacion on public.asignaciones_cuenta;

create trigger trg_marcar_rotacion
  after update on public.asignaciones_cuenta
  for each row execute function public.marcar_rotacion_pendiente();

-- ============================================================
-- FIN DE MIGRACIÓN 009
-- La limpieza del flag (requiere_rotacion = false) la hace la app
-- cuando el staff cambia efectivamente la contraseña, junto con
-- last_password_change.
-- ============================================================
