-- ============================================================
-- MIGRACIÓN 007 — Fix trigger asignaciones_cuenta
-- La función set_created_updated_by() intenta asignar updated_by
-- pero asignaciones_cuenta solo tiene created_by.
-- Se reemplaza el trigger con una función específica.
-- ============================================================

create or replace function public.set_created_by_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

-- Reemplaza el trigger existente por uno que usa la función correcta
drop trigger if exists trg_asignaciones_by on public.asignaciones_cuenta;

create trigger trg_asignaciones_by
  before insert on public.asignaciones_cuenta
  for each row execute function public.set_created_by_only();

-- ============================================================
-- FIN DE MIGRACIÓN 007
-- ============================================================
