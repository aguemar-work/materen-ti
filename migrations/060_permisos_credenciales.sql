-- ============================================================
-- MIGRACIÓN 060 — Permiso "credenciales.ver" por integrante
-- Depende de: 003 (staff, es_jefe()), 010 (accesos_log), 056 (staff_modulos_permisos)
-- Tablas: staff_permisos
--
-- Hasta ahora "revelar"/"copiar"/"enviar" una contraseña de Cuentas o
-- Licencias (no accesos_sensibles, que ya tiene su propio candado más
-- estricto desde la 024) estaba abierto a cualquier staff activo, sin
-- distinción — el único filtro por rol era tipo_cuenta='personal' (solo
-- JEFE). Esta migración agrega un segundo nivel, por usuario individual:
-- quién puede ver contraseñas en absoluto. Mismo patrón que
-- staff_modulos_permisos (056): tabla puente staff_user_id ↔ recurso,
-- texto con check en vez de enum (agregar un permiso futuro es un ALTER
-- del check, no una migración de tipo), JEFE exento siempre.
--
-- Default "opt-out", no "opt-in": backfill de los 3 staff activos y el
-- trigger de alta lo siembra para staff nuevo — mismo criterio que 056
-- (nadie pierde acceso el día del deploy; el JEFE revoca lo que no quiere,
-- no habilita desde cero). El staff nuevo de todas formas nace `activo =
-- false` (H-CRIT, migración 018) hasta que el JEFE lo active, así que el
-- seed no es una puerta abierta real: el JEFE ya revisa la cuenta antes de
-- que pueda hacer nada.
--
-- GOTCHA DE ARQUITECTURA (documentado también en AGENTS.md, es importante
-- no perderlo ahí): la regla "quién puede ver contraseñas" queda escrita
-- DOS VECES.
--   1. tiene_permiso_credenciales_ver(uuid) — función SQL, para RLS futuro
--      si algún día se necesita (hoy nada la consume desde una policy,
--      existe por paralelismo con tiene_permiso_acceso_sensible).
--   2. functions/credenciales.ts — consulta DIRECTA a staff_permisos (NO
--      RPC a la función de arriba). No puede ir por RPC: credenciales.ts
--      corre con createAdminClient (cliente admin, sin sesión de usuario),
--      así que auth.uid() dentro de la función SQL sería NULL — el patrón
--      ya establecido para este mismo problema es revelarAccesoSensible
--      (024), que también consulta accesos_sensibles_permisos directo en
--      vez de llamar a tiene_permiso_acceso_sensible() por RPC.
-- Evaluado tener una sola fuente de verdad (RPC vía el userClient de sesión
-- que ya existe en credenciales.ts, en vez de admin): en teoría
-- funcionaría (el JWT viaja con esa conexión), pero sería el primer uso de
-- userClient.database en todo el repo para una query de negocio — hoy
-- userClient SOLO resuelve identidad (auth.getCurrentUser()), nunca datos,
-- en las 4 edge functions por igual. Se decidió no introducir ese patrón
-- sin probarlo aparte; queda la duplicación, con esta advertencia.
-- ============================================================


-- ============================================================
-- TABLA: staff_permisos
-- ============================================================

create table if not exists public.staff_permisos (
  staff_user_id uuid        not null references public.staff(user_id) on delete cascade,
  permiso       text        not null check (permiso in (
    'credenciales.ver'
  )),
  created_at    timestamptz not null default now(),

  primary key (staff_user_id, permiso)
);

comment on table public.staff_permisos is
  'Permisos individuales por integrante, fuera del rol JEFE/ASISTENTE fijo. Sin fila acá = sin ese permiso. JEFE lo tiene siempre, sin consultar esta tabla (resuelto en el frontend y en credenciales.ts). Mismo patrón que staff_modulos_permisos (056), pero para capacidades en vez de módulos de UI.';

comment on column public.staff_permisos.permiso is
  'credenciales.ver — puede revelar/copiar/enviar contraseñas de Cuentas y Licencias (no accesos_sensibles, que tiene su propio candado en 024). Único valor hoy; agregar uno nuevo es un ALTER de este check.';


-- ============================================================
-- BACKFILL: los 3 staff activos quedan con "credenciales.ver"
-- ============================================================

insert into public.staff_permisos (staff_user_id, permiso)
select s.user_id, 'credenciales.ver'
from public.staff s
where s.activo = true
on conflict (staff_user_id, permiso) do nothing;


-- ============================================================
-- TRIGGER: extender el alta de staff para sembrar "credenciales.ver"
-- ============================================================
-- Se reemplaza la función de las migraciones 003/056 (mismo trigger
-- on_auth_user_created_staff, no se crea uno nuevo): se conservan los
-- inserts existentes de staff y staff_modulos_permisos, se agrega el de
-- staff_permisos.
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

  insert into public.staff_permisos (staff_user_id, permiso)
  values (new.id, 'credenciales.ver')
  on conflict (staff_user_id, permiso) do nothing;

  return new;
end;
$$;


-- ============================================================
-- FUNCIÓN HELPER: ¿el usuario logueado tiene este permiso?
-- ============================================================
-- SECURITY DEFINER, mismo patrón que tiene_permiso_acceso_sensible (024).
-- No la consume ninguna policy hoy (staff_permisos no gatea ninguna RLS de
-- datos todavía — el gate real vive en credenciales.ts, consulta directa,
-- ver advertencia arriba); existe por paralelismo y para uso futuro si
-- algún día una policy de RLS necesita este mismo chequeo.
-- ============================================================

create or replace function public.tiene_permiso_credenciales_ver(p_staff_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_permisos
    where staff_user_id = p_staff_user_id
      and permiso = 'credenciales.ver'
  );
$$;

comment on function public.tiene_permiso_credenciales_ver(uuid) is
  'True si el staff_user_id dado tiene el permiso credenciales.ver. No la usa ninguna policy de RLS hoy — el gate real está en functions/credenciales.ts (consulta directa a staff_permisos, no RPC: el cliente admin no tiene sesión, auth.uid() sería NULL). Ver advertencia en AGENTS.md antes de tocar cualquiera de las dos.';


-- ============================================================
-- RLS: staff_permisos (mismo criterio que staff_modulos_permisos, 056)
-- ============================================================

alter table public.staff_permisos enable row level security;

drop policy if exists "staff ve sus propios permisos, jefe ve todos" on public.staff_permisos;
create policy "staff ve sus propios permisos, jefe ve todos"
  on public.staff_permisos for select
  using (staff_user_id = auth.uid() or public.es_jefe());

drop policy if exists "solo jefe otorga permisos" on public.staff_permisos;
create policy "solo jefe otorga permisos"
  on public.staff_permisos for insert
  with check (public.es_jefe());

drop policy if exists "solo jefe revoca permisos" on public.staff_permisos;
create policy "solo jefe revoca permisos"
  on public.staff_permisos for delete
  using (public.es_jefe());


-- ============================================================
-- accesos_log: nuevas acciones para auditar otorgar/revocar
-- ============================================================

alter table public.accesos_log drop constraint if exists accesos_log_accion_check;
alter table public.accesos_log add constraint accesos_log_accion_check
  check (accion in (
    'ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta',
    'creado', 'editado', 'eliminado',
    'permiso_otorgado', 'permiso_revocado'
  ));


-- ============================================================
-- TRIGGER: auditar otorgamiento/revocación de staff_permisos
-- ============================================================
-- Mismo patrón que accesos_sensibles_log_evento (024): el otorgamiento es
-- el evento más importante a auditar acá, no solo el rechazo — conceder a
-- alguien la capacidad de ver todas las contraseñas del sistema merece
-- rastro igual que crear/editar/eliminar un acceso sensible.
-- ============================================================

create or replace function public.staff_permisos_log_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_accion text;
  v_permiso text;
  v_staff_id uuid;
  v_staff_nombre text;
begin
  select email into v_email from auth.users where id = auth.uid();

  if tg_op = 'INSERT' then
    v_accion := 'permiso_otorgado';
    v_permiso := new.permiso;
    v_staff_id := new.staff_user_id;
  else
    v_accion := 'permiso_revocado';
    v_permiso := old.permiso;
    v_staff_id := old.staff_user_id;
  end if;

  select nombre into v_staff_nombre from public.staff where user_id = v_staff_id;

  insert into public.accesos_log (user_id, user_email, cuenta_id, cuenta_usuario, plataforma, accion, detalle)
  values (
    auth.uid(), v_email, null,
    coalesce(v_staff_nombre, v_staff_id::text),
    v_permiso,
    v_accion,
    format('Permiso %s %s a %s', v_permiso,
      case when tg_op = 'INSERT' then 'otorgado' else 'revocado' end,
      coalesce(v_staff_nombre, v_staff_id::text))
  );

  return coalesce(new, old);
end;
$$;

create or replace trigger trg_staff_permisos_log_evento
  after insert or delete on public.staff_permisos
  for each row execute function public.staff_permisos_log_evento();

-- ============================================================
-- FIN DE MIGRACIÓN 060
-- ============================================================
