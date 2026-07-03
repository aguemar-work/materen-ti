-- ============================================================
-- MIGRACIÓN 005 — Trazabilidad: created_by / updated_by
-- Depende de: 001, 002, 003, 004
-- Agrega quién creó y quién actualizó cada registro.
-- FK a auth.users (no a staff) para sobrevivir bajas de staff.
-- ============================================================

-- empleados
alter table public.empleados
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- cuentas
alter table public.cuentas
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- empresas
alter table public.empresas
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- plataformas
alter table public.plataformas
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- asignaciones_cuenta (solo created_by — el cierre lo hace quien actualiza)
alter table public.asignaciones_cuenta
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- ============================================================
-- Función trigger: auto-poblar created_by / updated_by
-- ============================================================

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

-- Triggers por tabla
create or replace trigger trg_empleados_by
  before insert or update on public.empleados
  for each row execute function public.set_created_updated_by();

create or replace trigger trg_cuentas_by
  before insert or update on public.cuentas
  for each row execute function public.set_created_updated_by();

create or replace trigger trg_empresas_by
  before insert or update on public.empresas
  for each row execute function public.set_created_updated_by();

create or replace trigger trg_plataformas_by
  before insert or update on public.plataformas
  for each row execute function public.set_created_updated_by();

create or replace trigger trg_asignaciones_by
  before insert on public.asignaciones_cuenta
  for each row execute function public.set_created_updated_by();

-- ============================================================
-- FIN DE MIGRACIÓN 005
-- ============================================================
