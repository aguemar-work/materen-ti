-- ============================================================
-- MIGRACIÓN 018 — Endurecimiento de aprovisionamiento de staff
-- Depende de: 003
-- Auditoría de seguridad (2026-07-07), hallazgo H-CRIT.
--
-- Contexto:
--   El trigger on_auth_user_created_staff (migración 003) creaba una
--   fila `staff` ACTIVA (activo=true por default) para CADA usuario
--   nuevo de auth.users. Combinado con disable_signup=false en
--   insforge.toml, cualquiera que completara el alta quedaba como
--   ASISTENTE activo con acceso a revelar todas las contraseñas.
--
--   El cierre principal es disable_signup=true (insforge.toml). Esta
--   migración agrega DEFENSA EN PROFUNDIDAD: aunque un alta llegue a
--   ocurrir (signup reabierto por error, creación desde el dashboard),
--   el staff nace INACTIVO y no tiene ningún acceso hasta que un JEFE
--   lo active explícitamente (staff.activo = true) desde el panel.
--
--   es_staff()/es_jefe() ya exigen activo=true, así que un staff
--   inactivo no pasa RLS ni las validaciones de las edge functions.
-- ============================================================

-- ------------------------------------------------------------
-- Recrear el trigger de auto-alta: ahora crea el staff INACTIVO
-- ------------------------------------------------------------
create or replace function public.handle_new_staff_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (user_id, nombre, rol, activo)
  values (
    new.id,
    coalesce(new.profile->>'name', split_part(new.email, '@', 1)),
    'ASISTENTE',
    false   -- nace inactivo: un JEFE debe activarlo a mano
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_staff_user() is
  'Auto-crea staff ASISTENTE INACTIVO al registrar un usuario. El JEFE lo activa desde el panel (defensa en profundidad, auditoría H-CRIT 2026-07-07).';

-- El trigger on_auth_user_created_staff (migración 003) sigue vigente;
-- solo cambió el cuerpo de la función que invoca. No se recrea el trigger.

-- ============================================================
-- ACCIÓN MANUAL POST-MIGRACIÓN (no se automatiza: requiere criterio)
-- ------------------------------------------------------------
-- Revisar altas de staff no reconocidas y desactivar las que no
-- correspondan a personal aprovisionado por el JEFE:
--
--   select user_id, nombre, rol, activo, created_at
--   from public.staff
--   order by created_at desc;
--
--   -- desactivar una fila sospechosa:
--   -- update public.staff set activo = false where user_id = '<uuid>';
-- ============================================================

-- ============================================================
-- FIN DE MIGRACIÓN 018
-- ============================================================
