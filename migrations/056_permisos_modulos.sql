-- ============================================================
-- MIGRACIÓN 056 — Permisos de visibilidad de módulos por usuario
-- Depende de: 003 (staff, es_jefe())
-- Tablas: staff_modulos_permisos
--
-- Hasta ahora la única segmentación de acceso era el rol fijo
-- (JEFE/ASISTENTE). Esta migración agrega un segundo nivel, por usuario
-- individual: qué módulos operativos ve cada integrante en el sidebar.
-- Mismo patrón que accesos_sensibles_permisos (migración 024): tabla
-- puente staff_user_id ↔ recurso, texto con check en vez de enum (agregar
-- un módulo futuro es un ALTER del check, no una migración de tipo).
--
-- Alcance explícito: esto es control de UI/navegación (sidebar + guard de
-- rutas en el frontend), NO un cambio de modelo de seguridad de datos. Las
-- políticas RLS de correos/licencias/equipos/etc. siguen dando acceso a
-- "cualquier staff activo" exactamente como hoy — no se tocan acá.
--
-- JEFE queda siempre exento (ve todos los módulos sin consultar esta
-- tabla) — se resuelve en el frontend (auth.puedeVerModulo), no acá.
--
-- Default "opt-out", no "opt-in": se hace backfill de las 8 filas para
-- todo staff existente y el trigger de alta las crea automáticamente para
-- staff nuevo. Así ningún ASISTENTE pierde acceso el día del deploy, y
-- nadie queda "ciego" hasta que el JEFE lo configure a mano; el JEFE
-- desmarca lo que sobra, no habilita desde cero.
-- ============================================================


-- ============================================================
-- TABLA: staff_modulos_permisos
-- ============================================================

create table if not exists public.staff_modulos_permisos (
  staff_user_id uuid        not null references public.staff(user_id) on delete cascade,
  modulo        text        not null check (modulo in (
    'tickets', 'empleados', 'correos', 'licencias', 'equipos',
    'base_conocimiento', 'problemas', 'encuestas'
  )),
  created_at    timestamptz not null default now(),

  primary key (staff_user_id, modulo)
);

comment on table public.staff_modulos_permisos is
  'Qué módulos operativos ve cada integrante en el sidebar. Sin fila acá = módulo oculto para ese usuario. JEFE ve todos los módulos siempre, sin consultar esta tabla (resuelto en el frontend). Control de UI/navegación, no de RLS.';

comment on column public.staff_modulos_permisos.modulo is
  'tickets | empleados | correos | licencias | equipos | base_conocimiento | problemas | encuestas.';


-- ============================================================
-- BACKFILL: todo staff existente queda con los 8 módulos habilitados
-- ============================================================

insert into public.staff_modulos_permisos (staff_user_id, modulo)
select s.user_id, m.modulo
from public.staff s
cross join (values
  ('tickets'), ('empleados'), ('correos'), ('licencias'),
  ('equipos'), ('base_conocimiento'), ('problemas'), ('encuestas')
) as m(modulo)
on conflict (staff_user_id, modulo) do nothing;


-- ============================================================
-- TRIGGER: extender el alta de staff para sembrar sus 8 módulos
-- ============================================================
-- Se reemplaza la función de la migración 003 (mismo trigger
-- on_auth_user_created_staff, no se crea uno nuevo): además del insert en
-- staff, siembra staff_modulos_permisos con los 8 módulos habilitados.
-- ============================================================

create or replace function public.handle_new_staff_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (user_id, nombre, rol)
  values (
    new.id,
    coalesce(new.profile->>'name', split_part(new.email, '@', 1)),
    'ASISTENTE'
  )
  on conflict (user_id) do nothing;

  insert into public.staff_modulos_permisos (staff_user_id, modulo)
  select new.id, m.modulo
  from (values
    ('tickets'), ('empleados'), ('correos'), ('licencias'),
    ('equipos'), ('base_conocimiento'), ('problemas'), ('encuestas')
  ) as m(modulo)
  on conflict (staff_user_id, modulo) do nothing;

  return new;
end;
$$;


-- ============================================================
-- RLS: staff_modulos_permisos
-- ============================================================
-- Ver: cada quien lee su propia lista (la necesita para armar su sidebar);
-- JEFE lee la de cualquiera (para la UI de gestión en Configuración·Staff).
-- Otorgar/revocar: solo JEFE, igual que en staff (migración 003).
-- Sin policy de update: se reconcilia con insert + delete.
-- ============================================================

alter table public.staff_modulos_permisos enable row level security;

drop policy if exists "staff ve sus propios modulos, jefe ve todos" on public.staff_modulos_permisos;
create policy "staff ve sus propios modulos, jefe ve todos"
  on public.staff_modulos_permisos for select
  using (staff_user_id = auth.uid() or public.es_jefe());

drop policy if exists "solo jefe otorga modulos" on public.staff_modulos_permisos;
create policy "solo jefe otorga modulos"
  on public.staff_modulos_permisos for insert
  with check (public.es_jefe());

drop policy if exists "solo jefe revoca modulos" on public.staff_modulos_permisos;
create policy "solo jefe revoca modulos"
  on public.staff_modulos_permisos for delete
  using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 056
-- ============================================================
