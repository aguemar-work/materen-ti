-- ============================================================
-- MIGRACIÓN 076 — handle_new_staff_user(): restaurar activo=false explícito
-- Depende de: 003 (crea la función y el trigger, sin activo explícito —
--             la vulnerabilidad de origen), 018 (agrega activo=false
--             explícito, hallazgo H-CRIT 2026-07-07), 056 (reescribe la
--             función para sembrar staff_modulos_permisos y, al hacerlo,
--             vuelve al patrón de 003 sin darse cuenta — pierde el
--             activo=false de 018), 060 (reescribe otra vez para sembrar
--             staff_permisos y conserva la regresión de 056 sin tocarla)
--
-- HALLAZGO H-CRIT-056-060 (auditoría de reconciliación, 2026-08-18):
--
-- Causa raíz: handle_new_staff_user() —el trigger que corre en cada
-- INSERT de auth.users— inserta la fila de staff sin fijar la columna
-- activo desde la migración 056. staff.activo tiene default `true`
-- (migración 003), así que toda alta queda ACTIVA de inmediato. La
-- migración 018 había cerrado exactamente este hueco (hallazgo H-CRIT
-- original: signup abierto + staff activo por default = cualquiera se
-- autorregistra como ASISTENTE activo) agregando activo=false explícito
-- en el INSERT — defensa en profundidad independiente de disable_signup,
-- pensada a propósito para el caso "alta desde el dashboard" (ver el
-- comentario de cabecera de la propia 018). La 056, al reescribir la
-- misma función para sembrar staff_modulos_permisos, copió el patrón de
-- INSERT de la 003 (anterior a 018) en vez del de 018 — perdiendo el
-- activo=false sin que nadie lo notara. La 060 reescribió la función una
-- vez más (para sembrar staff_permisos) y conservó tal cual el INSERT ya
-- roto de la 056.
--
-- Evidencia (2026-08-18, SELECT en branch y producción, ambos
-- coinciden): pg_get_functiondef(handle_new_staff_user) no incluye
-- activo en ningún entorno; information_schema.columns confirma
-- column_default='true' para staff.activo en ambos. Reproducido en el
-- branch de pruebas: una cuenta nueva nació con activo=true sin pedirlo.
--
-- Impacto: toda cuenta de staff creada desde el dashboard de InsForge
-- (el único canal de alta legítimo mientras disable_signup=true) queda
-- activa y operativa de inmediato — con los 8 módulos y
-- credenciales.ver ya otorgados por el propio seeding de 056/060— sin el
-- paso de revisión/activación manual que la 018 diseñó como red de
-- seguridad. es_staff()/es_jefe() sí exigen activo=true, pero ese gate
-- nunca llega a filtrar nada porque toda fila nace ya activa.
--
-- Corrección: ÚNICAMENTE aditiva. Se reescribe la función una vez más
-- (mismo idiom ya usado 3 veces: 018/056/060), agregando de vuelta la
-- columna activo con el valor literal false en el primer INSERT. El
-- seeding de staff_modulos_permisos y staff_permisos, el resto de la
-- lógica, la firma, SECURITY DEFINER, search_path y el trigger
-- on_auth_user_created_staff quedan exactamente iguales — no se toca
-- RLS, no se modifica ninguna fila existente.
--
-- ⚠️ Aplicar con `db import` (nunca `db query` ni un script que no
-- soporte dollar-quoting): el cuerpo es `plpgsql` con $$...$$, mismo
-- gotcha ya documentado en 038/068.
-- ============================================================

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
    false   -- nace inactivo: un JEFE debe activarlo a mano (H-CRIT, 018)
  )
  on conflict (user_id) do nothing;

  insert into public.staff_modulos_permisos (staff_user_id, modulo)
  select new.id, m.modulo
  from (values
    ('tickets'), ('empleados'), ('correos'), ('licencias'),
    ('equipos'), ('base_conocimiento'), ('problemas'), ('encuestas')
  ) as m(modulo)
  on conflict (staff_user_id, modulo) do nothing;

  insert into public.staff_permisos (staff_user_id, permiso)
  values (new.id, 'credenciales.ver')
  on conflict (staff_user_id, permiso) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_staff_user() is
  'Auto-crea staff ASISTENTE INACTIVO (H-CRIT, migración 018) + seeding de
   staff_modulos_permisos (056) y staff_permisos/credenciales.ver (060). El
   JEFE lo activa desde el panel. Restaurado 2026-08-18 (hallazgo
   H-CRIT-056-060): las migraciones 056 y 060 habían perdido, sin querer,
   el activo=false explícito de la 018 al reescribir esta misma función —
   toda alta quedaba activa de inmediato por el default de columna
   (staff.activo default true, migración 003). Ver
   docs/HISTORIAL-AUDITORIAS.md.';

-- ============================================================
-- FIN DE MIGRACIÓN 076
-- ============================================================
