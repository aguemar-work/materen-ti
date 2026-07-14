-- ============================================================
-- MIGRACIÓN 024 — Accesos sensibles (credenciales de alta sensibilidad)
-- Depende de: 001..010 (staff, es_jefe()/es_staff(), accesos_log)
-- Tablas: accesos_sensibles, accesos_sensibles_permisos
-- Aditivo: no toca Cuentas ni Licencias.
--
-- Por qué un módulo aparte y no una fila más de "Cuentas":
--   Cuentas/Licencias ya resuelven "cualquier staff activo puede revelar
--   cualquier contraseña" (auditado, pero sin restricción de a quién se le
--   muestra). Este módulo es para credenciales que ni siquiera todo el
--   staff, ni siquiera todo JEFE, debería poder revelar — solo el
--   subconjunto de JEFEs explícitamente autorizados por credencial.
--
-- Modelo de visibilidad (dos niveles, no confundir):
--   1. Metadata (nombre/categoría/usuario/notas): cualquier JEFE la ve en
--      la lista — sabe que la credencial existe.
--   2. Revelar la contraseña: solo los JEFE que están en
--      accesos_sensibles_permisos para esa fila. Editar/eliminar la fila
--      exige lo mismo (no solo ver la lista).
--   ASISTENTE: cero acceso a estas dos tablas, ni por RLS ni por UI.
--
-- Sin softdelete (a diferencia del resto del dominio): como ni siquiera
-- todo el staff puede tocar esta tabla (ver arriba), no hace falta la
-- distinción "cualquier staff puede softdelete / solo JEFE hace DELETE
-- físico" que sí protege a las demás tablas de un ASISTENTE malintencionado.
-- Acá el DELETE real ya está limitado a JEFEs con permiso concedido.
-- ============================================================


-- ============================================================
-- TABLA: accesos_sensibles
-- ============================================================

create table if not exists public.accesos_sensibles (
  id          uuid        primary key default gen_random_uuid(),

  nombre      text        not null,

  -- Mismo patrón de check que equipos.estado (no un enum nuevo, para que
  -- agregar una categoría futura sea un ALTER simple, no una migración de tipo).
  categoria   text        not null
    check (categoria in ('equipos', 'correos', 'otro')),

  -- Login/usuario de la credencial. Sin cifrar: no es secreto en sí mismo.
  usuario     text        not null,

  -- Cifrada por la edge function "credenciales" antes de llegar acá.
  -- Mismo formato enc2:<iv>:<ct> que ya usa cuentas.password.
  password    text,

  notas       text,

  -- FK a auth.users (no a staff.user_id): mismo criterio que el resto del
  -- dominio (migración 005) — sobrevive si el staff se desactiva o se borra.
  created_by  uuid        references auth.users(id) on delete set null,
  updated_by  uuid        references auth.users(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.accesos_sensibles is
  'Credenciales de alta sensibilidad (ej. accesos de equipos, correos de gerencia/TI). Visibilidad de metadata: todo JEFE. Revelar/editar/eliminar: solo JEFE con permiso explícito (ver accesos_sensibles_permisos).';

comment on column public.accesos_sensibles.categoria is
  'equipos | correos | otro — mismo patrón de check que equipos.estado.';

comment on column public.accesos_sensibles.password is
  'Cifrada por la edge function credenciales, formato enc2:<iv>:<ct> (clave CRED_KEY_SENSIBLE, aislada de la de Cuentas/Licencias).';

create or replace trigger trg_accesos_sensibles_updated_at
  before update on public.accesos_sensibles
  for each row execute function set_updated_at();

create or replace trigger trg_accesos_sensibles_by
  before insert or update on public.accesos_sensibles
  for each row execute function public.set_created_updated_by();


-- ============================================================
-- TABLA: accesos_sensibles_permisos (puente)
-- ============================================================
-- Quién (qué JEFE) puede revelar/editar/eliminar cada acceso_sensible.
-- ============================================================

create table if not exists public.accesos_sensibles_permisos (
  acceso_id      uuid        not null references public.accesos_sensibles(id) on delete cascade,
  staff_user_id  uuid        not null references public.staff(user_id) on delete cascade,
  created_at     timestamptz not null default now(),

  primary key (acceso_id, staff_user_id)
);

create index if not exists idx_accesos_sensibles_permisos_staff
  on public.accesos_sensibles_permisos (staff_user_id);

comment on table public.accesos_sensibles_permisos is
  'Lista blanca por credencial: qué JEFE puede revelar/editar/eliminar cada fila de accesos_sensibles. Sin fila acá = sin acceso, aunque sea JEFE.';


-- ============================================================
-- FUNCIÓN HELPER: ¿el usuario logueado tiene permiso sobre este acceso?
-- ============================================================
-- SECURITY DEFINER: puede consultarse desde políticas RLS de la propia
-- accesos_sensibles_permisos sin recursión (mismo patrón que es_jefe()/
-- es_staff() consultando la propia tabla staff desde sus políticas).
-- ============================================================

create or replace function public.tiene_permiso_acceso_sensible(p_acceso_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.accesos_sensibles_permisos
    where acceso_id = p_acceso_id
      and staff_user_id = auth.uid()
  );
$$;

comment on function public.tiene_permiso_acceso_sensible(uuid) is
  'True si el usuario logueado tiene permiso explícito sobre ese acceso_sensible. Usado en políticas RLS de accesos_sensibles y accesos_sensibles_permisos.';


-- ============================================================
-- TRIGGER: el creador de un acceso_sensible se agrega solo a permisos
-- ============================================================
-- SECURITY DEFINER a propósito: es el ÚNICO camino para que la PRIMERA
-- fila de permisos de un acceso_id se cree. Bypasea la RLS de
-- accesos_sensibles_permisos (que exige ya tener permiso — chicken-and-egg
-- para el creador) sin abrir una ventana de "acabo de crearlo" en la
-- política misma. Nadie puede forzar auth.uid() a otro valor.
-- ============================================================

create or replace function public.acceso_sensible_permiso_creador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accesos_sensibles_permisos (acceso_id, staff_user_id)
  values (new.id, auth.uid())
  on conflict (acceso_id, staff_user_id) do nothing;
  return new;
end;
$$;

create or replace trigger trg_acceso_sensible_permiso_creador
  after insert on public.accesos_sensibles
  for each row execute function public.acceso_sensible_permiso_creador();


-- ============================================================
-- RLS: accesos_sensibles
-- ============================================================

alter table public.accesos_sensibles enable row level security;

-- create policy no admite IF NOT EXISTS/OR REPLACE en Postgres — a
-- diferencia de las tablas/funciones/triggers de arriba, re-correr esta
-- migración sin el drop previo falla con "already exists". drop ... if
-- exists + create es el idiom estándar para dejar esto re-ejecutable.

-- Metadata: cualquier JEFE ve todas las filas (sabe que existen).
-- ASISTENTE: es_jefe() da false → cero filas, sin excepción.
drop policy if exists "jefe puede ver accesos sensibles" on public.accesos_sensibles;
create policy "jefe puede ver accesos sensibles"
  on public.accesos_sensibles for select
  using (public.es_jefe());

-- Crear: cualquier JEFE. El propio creador queda con permiso automático
-- vía el trigger de arriba (bypassea RLS, no depende de esta política).
drop policy if exists "jefe puede crear accesos sensibles" on public.accesos_sensibles;
create policy "jefe puede crear accesos sensibles"
  on public.accesos_sensibles for insert
  with check (public.es_jefe());

-- Editar: JEFE + permiso explícito sobre ESA fila (no cualquier JEFE).
drop policy if exists "jefe con permiso puede editar accesos sensibles" on public.accesos_sensibles;
create policy "jefe con permiso puede editar accesos sensibles"
  on public.accesos_sensibles for update
  using (public.es_jefe() and public.tiene_permiso_acceso_sensible(id))
  with check (public.es_jefe() and public.tiene_permiso_acceso_sensible(id));

-- Eliminar (DELETE físico — no hay softdelete en esta tabla, ver nota arriba).
drop policy if exists "jefe con permiso puede eliminar accesos sensibles" on public.accesos_sensibles;
create policy "jefe con permiso puede eliminar accesos sensibles"
  on public.accesos_sensibles for delete
  using (public.es_jefe() and public.tiene_permiso_acceso_sensible(id));


-- ============================================================
-- RLS: accesos_sensibles_permisos — la parte delicada
-- ============================================================
-- Regla única para SELECT/INSERT/DELETE: un JEFE solo puede ver o
-- modificar la lista de permisos de un acceso_id si él mismo YA tiene
-- permiso sobre ese acceso_id. Así, un JEFE sin acceso a una credencial
-- no puede auto-otorgarse permiso ni ver quién más lo tiene.
--
-- La única forma de obtener la PRIMERA fila de permisos de un acceso_id
-- nuevo es el trigger SECURITY DEFINER de arriba — nunca esta política.
-- No hay ninguna cláusula "o si lo acabo de crear" acá: sería una
-- ventana explotable (¿cuánto dura "acabo de crear"? ¿cómo se prueba
-- sin fecha/timestamp frágil?). El trigger ya resuelve el bootstrap sin
-- necesidad de esa cláusula.
-- ============================================================

alter table public.accesos_sensibles_permisos enable row level security;

drop policy if exists "jefe con permiso puede ver permisos del acceso" on public.accesos_sensibles_permisos;
create policy "jefe con permiso puede ver permisos del acceso"
  on public.accesos_sensibles_permisos for select
  using (public.es_jefe() and public.tiene_permiso_acceso_sensible(acceso_id));

drop policy if exists "jefe con permiso puede otorgar permisos del acceso" on public.accesos_sensibles_permisos;
create policy "jefe con permiso puede otorgar permisos del acceso"
  on public.accesos_sensibles_permisos for insert
  with check (public.es_jefe() and public.tiene_permiso_acceso_sensible(acceso_id));

drop policy if exists "jefe con permiso puede revocar permisos del acceso" on public.accesos_sensibles_permisos;
create policy "jefe con permiso puede revocar permisos del acceso"
  on public.accesos_sensibles_permisos for delete
  using (public.es_jefe() and public.tiene_permiso_acceso_sensible(acceso_id));


-- ============================================================
-- accesos_log: agregar acciones de auditoría de ciclo de vida
-- ============================================================
-- Dado el nivel de sensibilidad de este módulo, además de auditar cada
-- "revelar" (ver/copiar, ya cubierto por el check existente), se audita
-- también creación/edición/eliminación de la credencial misma — no solo
-- quién la vio, sino quién la creó/cambió/borró. No se toca ninguna fila
-- existente, solo se amplía el check de valores permitidos.
-- ============================================================

alter table public.accesos_log drop constraint if exists accesos_log_accion_check;
alter table public.accesos_log add constraint accesos_log_accion_check
  check (accion in (
    'ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta',
    'creado', 'editado', 'eliminado'
  ));


-- ============================================================
-- TRIGGER: auditar creación/edición/eliminación (no solo revelado)
-- ============================================================
-- A diferencia de Cuentas/Licencias (donde el INSERT/UPDATE/DELETE de la
-- fila va directo por el cliente normal, sin pasar por la edge function),
-- acá el ciclo de vida completo queda en accesos_log — no solo el
-- revelado. Se hace con un trigger SECURITY DEFINER (mismo patrón que
-- log_evento_equipo) en vez de rutear el CRUD por la edge function:
--   - El INSERT/UPDATE/DELETE de la fila lo sigue haciendo el cliente
--     normal (misma convención que el resto del dominio, gated por las
--     políticas RLS de arriba) — no hay que tocar insforgeApi para esto.
--   - El trigger no se puede "olvidar de llamar" desde un path nuevo del
--     frontend: corre siempre que la fila cambia, sin depender de que el
--     código cliente recuerde auditar.
-- ============================================================

create or replace function public.accesos_sensibles_log_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_accion text;
  v_nombre text;
  v_categoria text;
  v_acceso_id uuid;
begin
  select email into v_email from auth.users where id = auth.uid();
  if tg_op = 'INSERT' then
    v_accion := 'creado'; v_nombre := new.nombre; v_categoria := new.categoria; v_acceso_id := new.id;
  elsif tg_op = 'UPDATE' then
    v_accion := 'editado'; v_nombre := new.nombre; v_categoria := new.categoria; v_acceso_id := new.id;
  else
    v_accion := 'eliminado'; v_nombre := old.nombre; v_categoria := old.categoria; v_acceso_id := old.id;
  end if;

  insert into public.accesos_log (user_id, user_email, cuenta_id, cuenta_usuario, plataforma, accion, detalle)
  values (auth.uid(), v_email, null, v_nombre, v_categoria, v_accion, 'Acceso sensible id=' || v_acceso_id);

  return coalesce(new, old);
end;
$$;

create or replace trigger trg_accesos_sensibles_log_evento
  after insert or update or delete on public.accesos_sensibles
  for each row execute function public.accesos_sensibles_log_evento();

-- ============================================================
-- FIN DE MIGRACIÓN 024
-- ============================================================
