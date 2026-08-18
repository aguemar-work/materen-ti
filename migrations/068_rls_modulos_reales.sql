-- ============================================================
-- MIGRACIÓN 068 — RLS real por módulo (licencias, equipos, correos)
-- Depende de: 003 (empleados/cuentas), 004 (asignaciones_cuenta),
--   011 (licencias), 013 (equipos), 024 (patrón tiene_permiso_*),
--   056 (staff_modulos_permisos), 063 (patrón de performance de RLS)
--
-- Verificación de auditoría externa (2026-08-17): staff_modulos_permisos
-- (migración 056) y staff_permisos (migración 060) solo controlaban
-- sidebar/router en el frontend — documentado a propósito en AGENTS.md
-- como "control de UI, no de RLS". Un ASISTENTE sin el módulo "Licencias"
-- habilitado podía seguir leyendo/escribiendo `licencias` completo vía SDK
-- directo, porque las políticas de esas tablas solo exigían es_staff().
-- Decisión del equipo (2026-08-17): convertir el permiso de módulo en una
-- restricción real de RLS para licencias/equipos/correos, siguiendo el
-- mismo patrón ya usado para accesos_sensibles (tiene_permiso_acceso_
-- sensible, migración 024) y credenciales.ver (tiene_permiso_credenciales_
-- ver, migración 060).
--
-- ⚠️ Aplicar con `db import`, NUNCA con `db query` ni con
-- scripts/apply-migration.mjs: este archivo tiene un `create or replace
-- function ... as $$ ... $$` (dollar-quoting), y `db query` no lo soporta
-- (gotcha verificado en la migración 038, ver AGENTS.md — falla con
-- {"error":"no language specified"} incluso en una función de una sola
-- línea). Verificar después con `db query "select * from pg_policies
-- where tablename = '...'"` sobre cada tabla tocada.
--
-- Caso especial `empleados` (decisión explícita, no un olvido): el SELECT
-- de empleados NO se gatea por módulo. Equipos/Licencias/Correos embeben
-- empleados(nombres, apellidos) para mostrar "asignado a: <nombre>" — si
-- se gateara también la lectura, un ASISTENTE sin el módulo "Empleados"
-- vería esos nombres en blanco en las otras 3 pantallas, degradando su
-- utilidad sin cerrar ningún hallazgo real (el nombre del empleado ya es
-- visible a cualquier staff activo hoy). Solo se gatea alta/edición de
-- empleados: el módulo "Empleados" del sidebar es sobre todo la pantalla
-- de crear/editar/dar de baja, no una fuga de datos nueva.
-- ============================================================


-- ------------------------------------------------------------
-- Función helper (mismo patrón que tiene_permiso_acceso_sensible/024,
-- auth.uid() dentro del cuerpo de la función, no en la cláusula de la
-- policy — el fix de performance de la 063 es sobre auth.uid() llamado
-- DIRECTO en una policy, no sobre su uso dentro de una función STABLE
-- SECURITY DEFINER como esta).
-- ------------------------------------------------------------

create or replace function public.tiene_permiso_modulo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_modulos_permisos
    where staff_user_id = auth.uid()
      and modulo = p_modulo
  );
$$;

comment on function public.tiene_permiso_modulo(text) is
  'True si el usuario logueado tiene el módulo p_modulo habilitado en staff_modulos_permisos. JEFE no la necesita (bypass explícito con "es_jefe() or ..." en cada policy que la usa, JEFE siempre ve todo). Usada en RLS de licencias/equipos/cuentas y en alta/edición de empleados (migración 068) — NO en el SELECT de empleados, ver comentario de cabecera.';


-- ------------------------------------------------------------
-- licencias / asignaciones_licencia → módulo 'licencias'
-- ------------------------------------------------------------

drop policy if exists "staff puede ver licencias" on public.licencias;
create policy "staff puede ver licencias"
  on public.licencias for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('licencias')));

drop policy if exists "staff puede crear licencias" on public.licencias;
create policy "staff puede crear licencias"
  on public.licencias for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('licencias')));

drop policy if exists "staff puede editar licencias" on public.licencias;
create policy "staff puede editar licencias"
  on public.licencias for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('licencias')));

-- delete sin cambios: "solo jefe puede eliminar licencias" (JEFE siempre puede)

drop policy if exists "staff puede ver asignaciones de licencia" on public.asignaciones_licencia;
create policy "staff puede ver asignaciones de licencia"
  on public.asignaciones_licencia for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('licencias')));

drop policy if exists "staff puede crear asignaciones de licencia" on public.asignaciones_licencia;
create policy "staff puede crear asignaciones de licencia"
  on public.asignaciones_licencia for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('licencias')));

drop policy if exists "staff puede cerrar asignaciones de licencia" on public.asignaciones_licencia;
create policy "staff puede cerrar asignaciones de licencia"
  on public.asignaciones_licencia for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('licencias')));

-- delete sin cambios: "solo jefe puede eliminar asignaciones de licencia"


-- ------------------------------------------------------------
-- equipos / tipos_equipo / asignaciones_equipo / eventos_equipo
-- → módulo 'equipos'
-- ------------------------------------------------------------

drop policy if exists "staff puede ver equipos" on public.equipos;
create policy "staff puede ver equipos"
  on public.equipos for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede crear equipos" on public.equipos;
create policy "staff puede crear equipos"
  on public.equipos for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede editar equipos" on public.equipos;
create policy "staff puede editar equipos"
  on public.equipos for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

-- delete sin cambios: "solo jefe puede eliminar equipos"

drop policy if exists "staff puede ver tipos de equipo" on public.tipos_equipo;
create policy "staff puede ver tipos de equipo"
  on public.tipos_equipo for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede crear tipos de equipo" on public.tipos_equipo;
create policy "staff puede crear tipos de equipo"
  on public.tipos_equipo for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede editar tipos de equipo" on public.tipos_equipo;
create policy "staff puede editar tipos de equipo"
  on public.tipos_equipo for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

-- delete sin cambios: "solo jefe puede eliminar tipos de equipo"

drop policy if exists "staff puede ver asignaciones de equipo" on public.asignaciones_equipo;
create policy "staff puede ver asignaciones de equipo"
  on public.asignaciones_equipo for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede crear asignaciones de equipo" on public.asignaciones_equipo;
create policy "staff puede crear asignaciones de equipo"
  on public.asignaciones_equipo for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

drop policy if exists "staff puede cerrar asignaciones de equipo" on public.asignaciones_equipo;
create policy "staff puede cerrar asignaciones de equipo"
  on public.asignaciones_equipo for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

-- delete sin cambios: "solo jefe puede eliminar asignaciones de equipo"

drop policy if exists "staff puede ver eventos de equipo" on public.eventos_equipo;
create policy "staff puede ver eventos de equipo"
  on public.eventos_equipo for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('equipos')));

-- eventos_equipo no tiene policy de insert/update/delete para el cliente
-- (append-only, solo lo escribe un trigger con permisos de tabla, no RLS
-- de cliente) — sin cambios.


-- ------------------------------------------------------------
-- cuentas / asignaciones_cuenta → módulo 'correos'
-- ------------------------------------------------------------

drop policy if exists "staff puede ver cuentas" on public.cuentas;
create policy "staff puede ver cuentas"
  on public.cuentas for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

drop policy if exists "staff puede crear cuentas" on public.cuentas;
create policy "staff puede crear cuentas"
  on public.cuentas for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

drop policy if exists "staff puede editar cuentas" on public.cuentas;
create policy "staff puede editar cuentas"
  on public.cuentas for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

-- delete sin cambios: "solo jefe puede eliminar cuentas"

drop policy if exists "staff puede ver asignaciones" on public.asignaciones_cuenta;
create policy "staff puede ver asignaciones"
  on public.asignaciones_cuenta for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

drop policy if exists "staff puede crear asignaciones" on public.asignaciones_cuenta;
create policy "staff puede crear asignaciones"
  on public.asignaciones_cuenta for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

drop policy if exists "staff puede cerrar asignaciones" on public.asignaciones_cuenta;
create policy "staff puede cerrar asignaciones"
  on public.asignaciones_cuenta for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('correos')));

-- delete sin cambios: "solo jefe puede eliminar asignaciones"


-- ------------------------------------------------------------
-- empleados → SOLO alta/edición gateadas por módulo 'empleados'.
-- SELECT sin cambios (sigue es_staff()) — ver comentario de cabecera.
-- ------------------------------------------------------------

drop policy if exists "staff puede crear empleados" on public.empleados;
create policy "staff puede crear empleados"
  on public.empleados for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('empleados')));

drop policy if exists "staff puede editar empleados" on public.empleados;
create policy "staff puede editar empleados"
  on public.empleados for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('empleados')));

-- select y delete sin cambios: "staff puede ver empleados" (es_staff()),
-- "solo jefe puede eliminar empleados" (es_jefe())

-- ============================================================
-- FIN DE MIGRACIÓN 068
-- ============================================================

-- Al aplicarse con `db import` (obligatorio, ver advertencia de cabecera),
-- scripts/apply-migration.mjs NO corre y por lo tanto no registra esta
-- versión en schema_migrations (migración 069) automáticamente. Registrar
-- a mano con `db query` después de verificar las políticas:
--   insert into public.schema_migrations (version, nombre_archivo, checksum, aplicada_por)
--     values ('068', '068_rls_modulos_reales.sql', 'aplicado-via-db-import', '<tu usuario>')
--     on conflict (version) do update set aplicada_en = now(), aplicada_por = excluded.aplicada_por;
