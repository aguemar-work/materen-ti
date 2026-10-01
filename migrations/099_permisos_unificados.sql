-- ============================================================
-- MIGRACIÓN 099 — Permisos: una sola regla (puede / puede_actual /
-- exigir_permiso) + cierre de huecos de autorización
-- Depende de: 003 (staff, es_jefe/es_staff), 024 (accesos_sensibles y sus
--   permisos), 028 (ticket_token_existe), 032 (kb_registrar_feedback),
--   056 (staff_modulos_permisos), 060 (staff_permisos), 068/072/079-083/087
--   (tiene_permiso_modulo en RLS), 074 (accesos_log_accion_check vigente)
--
-- Plan de mejora Ciclo 21, §4 "099 — Permisos: una sola regla"
-- (docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md) y anexo D §8.
--
-- Hoy la pregunta "¿este usuario puede X?" se responde en TRES sitios que
-- nada sincroniza en runtime: es_staff()/es_jefe()/tiene_permiso_modulo()
-- (SQL, siempre con auth.uid()), tienePermisoModulo()/
-- tienePermisoCredenciales() (functions/credenciales.ts y equipos-fotos.ts,
-- consulta directa porque corren con cliente admin) y el atajo de JEFE
-- (solo en TS). Esta migración crea la regla ÚNICA en el servidor:
--
--   public.puede(p_user uuid, p_permiso text) → boolean
--       Para quien YA conoce el user id (edge functions por RPC con el id
--       del JWT, tests). SECURITY DEFINER, STABLE. EXECUTE solo
--       project_admin (el cliente admin de las functions).
--   public.puede_actual(p_permiso text) → boolean
--       = puede(auth.uid(), p_permiso). Para RLS y RPC. EXECUTE a
--       authenticated (mismo patrón que es_staff()/tiene_permiso_modulo()).
--   public.exigir_permiso(p_permiso text) → void
--       Guard de las RPC: raise exception 'No autorizado' con SQLSTATE
--       42501 si no puede_actual().
--
-- Permisos soportados (cadena `tipo:valor` o nombre simple):
--   'staff:activo'          staff existente y activo
--   'rol:jefe'              staff activo con rol JEFE
--   'modulo:<id>'           módulo de staff_modulos_permisos (JEFE exento)
--   'acceso_sensible:<uuid>' fila en accesos_sensibles_permisos. El JEFE
--                           NO está exento (conserva la semántica de
--                           tiene_permiso_acceso_sensible, 024): hace falta
--                           la fila, y además staff activo.
--   cualquier otro          fila en staff_permisos (hoy solo
--                           'credenciales.ver'; JEFE exento, como en
--                           credenciales.ts)
-- Permiso desconocido, NULL o vacío → false (fail-closed).
--
-- Diferencia deliberada con las funciones antiguas: puede() exige staff
-- ACTIVO también para 'modulo:*' y 'acceso_sensible:*' (tiene_permiso_modulo()
-- y tiene_permiso_acceso_sensible() no miran staff.activo y dependen de que
-- cada policy agregue es_staff()/es_jefe()). Las policies existentes no
-- cambian de comportamiento: es_staff(), es_jefe() y tiene_permiso_modulo()
-- SE CONSERVAN como wrappers (no se reescriben las 126 policies de golpe);
-- las nuevas y las que se tocan usan puede_actual().
--
-- Cierres de huecos (una sección por hallazgo, todas idempotentes):
--   2) empresas INSERT/UPDATE sin gate de módulo (anexo D §1/§8).
--   3) kb_registrar_feedback sin gate de módulo (032 vs 086).
--   4) UPDATE de kb_articulos sin es_staff() (072).
--   5) ticket_token_existe: oráculo de token sin validar forma (028).
--   6) DECISIÓN PENDIENTE DEL DUEÑO — categorias_ticket / ubicaciones
--      (SECCIÓN SEPARABLE; se puede omitir sin afectar el resto).
--   7) Trigger en staff: no dejar huérfano un acceso sensible.
--   8) accesos_log_accion_check: valores nuevos que emitirán las edge
--      functions (conserva TODOS los vigentes: la 064 ya perdió valores una
--      vez, ver 074; el conjunto de partida se leyó del catálogo de
--      producción el 2026-10-01).
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/apply-migration.mjs` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea (`Assertion failed ... src\win\async.c`), partir en
-- archivos temporales por sección y aplicarlos uno por uno; el archivo único
-- en migrations/ sigue siendo la fuente de verdad. Correr SIEMPRE el bloque
-- "Verificación" del final: `db import` puede reportar error habiendo
-- ejecutado parte de los statements. Todo es idempotente: reaplicar el
-- archivo completo tras un fallo parcial es seguro.
--
-- Rollback: migrations/rollback/099_rollback.sql.
-- ============================================================


-- ============================================================
-- 1) La regla única: puede / puede_actual / exigir_permiso
-- ============================================================

create or replace function public.puede(p_user uuid, p_permiso text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol    text;
  v_activo boolean;
begin
  if p_user is null or p_permiso is null or p_permiso = '' then
    return false;
  end if;

  select rol::text, activo into v_rol, v_activo
    from public.staff
   where user_id = p_user;

  -- Sin fila en staff, o staff inactivo: nada.
  if not coalesce(v_activo, false) then
    return false;
  end if;

  if p_permiso = 'staff:activo' then
    return true;
  end if;

  if p_permiso = 'rol:jefe' then
    return v_rol = 'JEFE';
  end if;

  -- Accesos sensibles: el JEFE NO es exento (semántica de
  -- tiene_permiso_acceso_sensible, 024). Un uuid mal formado es false, no
  -- un error de cast.
  if p_permiso like 'acceso_sensible:%' then
    if substr(p_permiso, 17) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    return exists (
      select 1 from public.accesos_sensibles_permisos
       where staff_user_id = p_user
         and acceso_id = substr(p_permiso, 17)::uuid
    );
  end if;

  -- Atajo de JEFE (hasta hoy solo existía en credenciales.ts).
  if v_rol = 'JEFE' then
    return true;
  end if;

  if p_permiso like 'modulo:%' then
    return exists (
      select 1 from public.staff_modulos_permisos
       where staff_user_id = p_user
         and modulo = substr(p_permiso, 8)
    );
  end if;

  -- Resto de permisos nombrados ('credenciales.ver').
  return exists (
    select 1 from public.staff_permisos
     where staff_user_id = p_user
       and permiso = p_permiso
  );
end;
$$;

alter function public.puede(uuid, text) owner to project_admin;
revoke all on function public.puede(uuid, text) from public, anon, authenticated;
grant execute on function public.puede(uuid, text) to project_admin;

comment on function public.puede(uuid, text) is
  'Regla única de permisos (099). Permisos: staff:activo, rol:jefe, modulo:<id>, acceso_sensible:<uuid> (JEFE no exento), o un nombre de staff_permisos (credenciales.ver). Staff inactivo o desconocido: false. EXECUTE solo project_admin.';

create or replace function public.puede_actual(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.puede(auth.uid(), p_permiso);
$$;

alter function public.puede_actual(text) owner to project_admin;
revoke all on function public.puede_actual(text) from public, anon, authenticated;
grant execute on function public.puede_actual(text) to authenticated;

comment on function public.puede_actual(text) is
  'puede(auth.uid(), p_permiso) para RLS y RPC (099). Ya incluye staff activo y el atajo de JEFE.';

create or replace function public.exigir_permiso(p_permiso text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_actual(p_permiso) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

alter function public.exigir_permiso(text) owner to project_admin;
revoke all on function public.exigir_permiso(text) from public, anon, authenticated;
grant execute on function public.exigir_permiso(text) to authenticated;

comment on function public.exigir_permiso(text) is
  'Guard de RPC (099): lanza "No autorizado" con SQLSTATE 42501 si puede_actual(p_permiso) es false.';


-- ============================================================
-- 2) empresas: INSERT/UPDATE con gate del módulo 'empleados'
-- Hallazgo (anexo D §1/§8, 003:182): empresas quedó fuera del patrón
-- 079-087 y cualquier staff activo, sin ningún módulo, podía crear y
-- editar empresas (incluido el soft delete, que es un UPDATE). Las
-- empresas se administran desde Configuración y las usan Empleados y
-- Licencias; el módulo dueño es 'empleados' (igual que areas_obras, 087).
-- SELECT sigue abierto a es_staff() porque Empleados, Licencias, Correos y
-- Equipos embeben el nombre de la empresa; DELETE sigue siendo del JEFE.
-- ============================================================

drop policy if exists "staff puede crear empresas" on public.empresas;
drop policy if exists "staff con modulo empleados puede crear empresas" on public.empresas;
create policy "staff con modulo empleados puede crear empresas"
  on public.empresas for insert
  with check (public.puede_actual('modulo:empleados'));

drop policy if exists "staff puede editar empresas" on public.empresas;
drop policy if exists "staff con modulo empleados puede editar empresas" on public.empresas;
create policy "staff con modulo empleados puede editar empresas"
  on public.empresas for update
  using (public.puede_actual('modulo:empleados'))
  with check (public.puede_actual('modulo:empleados'));


-- ============================================================
-- 3) kb_registrar_feedback: exige el módulo 'base_conocimiento'
-- Hallazgo (anexo D §3/§8, 032 vs 086): la RPC solo exigía es_staff(), pero
-- kb_articulos ya está gateada por módulo en RLS desde 072. Al ser SECURITY
-- DEFINER bypasea esa RLS: un ASISTENTE sin 'base_conocimiento' votaba por
-- RPC lo que no podía ver por SDK.
-- Cuerpo = copia EXACTA de la definición vigente (032; verificado contra
-- pg_get_functiondef en producción el 2026-10-01), cambiando SOLO el guard.
-- El rechazo conserva el mismo `raise exception 'No autorizado'` (P0001):
-- los discriminantes de los tests dependen de ese mensaje. Dueño y GRANT
-- (project_admin / authenticated) se conservan con create or replace.
-- ============================================================

create or replace function public.kb_registrar_feedback(p_articulo_id uuid, p_util boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_actual('modulo:base_conocimiento') then
    raise exception 'No autorizado';
  end if;

  if p_util then
    update public.kb_articulos
      set util_si = util_si + 1
      where id = p_articulo_id
        and estado in ('publicado', 'obsoleto')
        and deleted_at is null;
  else
    update public.kb_articulos
      set util_no = util_no + 1
      where id = p_articulo_id
        and estado in ('publicado', 'obsoleto')
        and deleted_at is null;
  end if;
end;
$$;


-- ============================================================
-- 4) kb_articulos UPDATE: exige staff activo
-- Hallazgo (anexo D §2/§8, 072:88-105): la policy de UPDATE usaba
-- tiene_permiso_modulo('base_conocimiento') sin es_staff(), y esa función no
-- mira staff.activo: un staff DESACTIVADO que conservara su fila en
-- staff_modulos_permisos seguía editando sus borradores. puede_actual()
-- incluye staff activo.
-- Se conserva el resto de la lógica de 072 tal cual (verificada contra
-- pg_policies en producción): el JEFE edita todo; el autor edita su propio
-- artículo solo mientras esté en borrador o en revisión (publicar/obsoletar
-- sigue siendo del JEFE), y el WITH CHECK impide que el autor lo mueva fuera
-- de esos estados.
-- ============================================================

drop policy if exists "autor o jefe edita contenido de articulos kb" on public.kb_articulos;
create policy "autor o jefe edita contenido de articulos kb"
  on public.kb_articulos for update
  using (
    public.puede_actual('rol:jefe')
    or (
      public.puede_actual('modulo:base_conocimiento')
      and created_by = (select auth.uid())
      and estado in ('borrador', 'en_revision')
    )
  )
  with check (
    public.puede_actual('rol:jefe')
    or (
      public.puede_actual('modulo:base_conocimiento')
      and created_by = (select auth.uid())
      and estado in ('borrador', 'en_revision')
    )
  );


-- ============================================================
-- 5) ticket_token_existe: validar la forma del token antes de consultar
-- Hallazgo (anexo D §3/§8, 028): la función es ejecutable por anon (la
-- necesita la policy de realtime `public_subscribe_ticket_channel`, que
-- corre con el rol del socket) y era un oráculo booleano de existencia de
-- token sin sesión ni rate-limit. Los tokens reales son SIEMPRE 24 caracteres
-- base64url (18 bytes aleatorios, functions/tickets.ts randomToken; los 289
-- tokens de producción cumplen el patrón, verificado el 2026-10-01), así que
-- cualquier otra forma se rechaza sin tocar la tabla. Riesgo residual
-- ACEPTADO y documentado: adivinar un token válido son 144 bits.
-- plpgsql (no sql) para garantizar el retorno anticipado. Dueño y EXECUTE
-- actual (PUBLIC) se conservan: create or replace no los toca.
-- ============================================================

create or replace function public.ticket_token_existe(p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_token is null or length(p_token) <> 24 or p_token !~ '^[A-Za-z0-9_-]+$' then
    return false;
  end if;
  return exists (select 1 from public.tickets where token = p_token);
end;
$$;

alter function public.ticket_token_existe(text) owner to project_admin;


-- ============================================================
-- 6) ⚠️ DECISIÓN PENDIENTE DEL DUEÑO — categorias_ticket / ubicaciones
-- ============================================================
-- SECCIÓN SEPARABLE: si el dueño no la aprueba, borrar o no aplicar SOLO
-- este bloque (hasta la marca "FIN DE LA SECCIÓN 6"); el resto de la
-- migración no depende de ella. Cierra la decisión pendiente C13 de
-- AGENTS.md ("categorias_ticket y ubicaciones quedan en es_staff() a
-- propósito, decisión pendiente").
--
-- Propuesta: la LECTURA sigue en es_staff() (son satélites que embeben
-- varios módulos); la ESCRITURA (INSERT/UPDATE, que incluye el soft delete)
-- se gatea por el módulo dueño; DELETE físico sigue siendo del JEFE.
--   categorias_ticket → 'tickets'
--   ubicaciones       → 'equipos'
-- Efecto a validar con el dueño antes de aplicar:
--   - Un ASISTENTE con 'empleados' pero sin 'equipos' dejaría de poder
--     crear/editar ubicaciones, aunque EmpleadoForm.vue las usa para
--     elegir la ubicación del empleado (solo lectura) y la pestaña
--     Configuración > Ubicaciones las administra. Si la ubicación se
--     considera de Empleados, cambiar 'modulo:equipos' por
--     'modulo:empleados' (o permitir ambos) en las dos policies.
--   - La pestaña Configuración > Categorías de tickets exige 'tickets'.
-- Nombres de policies leídos de pg_policies (producción, 2026-10-01).

drop policy if exists "staff puede crear categorias de ticket" on public.categorias_ticket;
drop policy if exists "staff con modulo tickets puede crear categorias de ticket" on public.categorias_ticket;
create policy "staff con modulo tickets puede crear categorias de ticket"
  on public.categorias_ticket for insert
  with check (public.puede_actual('modulo:tickets'));

drop policy if exists "staff puede editar categorias de ticket" on public.categorias_ticket;
drop policy if exists "staff con modulo tickets puede editar categorias de ticket" on public.categorias_ticket;
create policy "staff con modulo tickets puede editar categorias de ticket"
  on public.categorias_ticket for update
  using (public.puede_actual('modulo:tickets'))
  with check (public.puede_actual('modulo:tickets'));

drop policy if exists "staff puede crear ubicaciones" on public.ubicaciones;
drop policy if exists "staff con modulo equipos puede crear ubicaciones" on public.ubicaciones;
create policy "staff con modulo equipos puede crear ubicaciones"
  on public.ubicaciones for insert
  with check (public.puede_actual('modulo:equipos'));

drop policy if exists "staff puede editar ubicaciones" on public.ubicaciones;
drop policy if exists "staff con modulo equipos puede editar ubicaciones" on public.ubicaciones;
create policy "staff con modulo equipos puede editar ubicaciones"
  on public.ubicaciones for update
  using (public.puede_actual('modulo:equipos'))
  with check (public.puede_actual('modulo:equipos'));

-- FIN DE LA SECCIÓN 6 (decisión pendiente del dueño)


-- ============================================================
-- 7) staff: no dejar huérfano un acceso sensible
-- Hallazgo (anexo D §8, 024:86-92 y 024:183-192): las policies de
-- accesos_sensibles y de accesos_sensibles_permisos exigen
-- `es_jefe() and tiene_permiso_acceso_sensible(id)`. Si el ÚNICO JEFE activo
-- con permiso sobre un acceso se desactiva, la fila queda sin nadie que
-- pueda verla, editarla ni reasignarla (solo recuperable con cliente
-- admin). Hoy los 9 accesos sensibles de producción tienen exactamente un
-- JEFE con permiso (el creador), así que el riesgo es real.
--
-- El trigger bloquea, ANTES del UPDATE, que un JEFE activo con permiso sobre
-- algún acceso deje de serlo (activo true→false, o rol JEFE→otro) cuando no
-- exista otro JEFE ACTIVO con permiso sobre ese mismo acceso. Si hay otro,
-- no bloquea. Salida para el usuario: otorgar primero el permiso a otro
-- JEFE (policy "jefe con permiso puede otorgar permisos del acceso") y
-- reintentar. Se incluye también el descenso de rol porque produce el mismo
-- huérfano; no cubre el DELETE de staff (el cascade desde auth.users no debe
-- poder bloquearse) ni el borrado del usuario de auth (C21-DAT-001).
-- El mensaje no incluye nombres de accesos: solo el conteo.
-- ============================================================

create or replace function public.check_staff_ultimo_jefe_acceso_sensible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_huerfanos integer;
begin
  -- Solo importa si hoy es JEFE activo y deja de serlo.
  if not (old.rol::text = 'JEFE' and old.activo) then
    return new;
  end if;
  if new.activo and new.rol::text = 'JEFE' then
    return new;
  end if;

  select count(*) into v_huerfanos
    from public.accesos_sensibles_permisos p
   where p.staff_user_id = old.user_id
     and not exists (
       select 1
         from public.accesos_sensibles_permisos p2
         join public.staff s on s.user_id = p2.staff_user_id
        where p2.acceso_id = p.acceso_id
          and p2.staff_user_id <> old.user_id
          and s.rol::text = 'JEFE'
          and s.activo
     );

  if v_huerfanos > 0 then
    raise exception 'No se puede desactivar ni quitar el rol de jefe a este usuario: es el único jefe activo con permiso sobre % acceso(s) sensible(s) y quedarían sin nadie que pueda administrarlos. Otorgue primero el permiso a otro jefe y reintente.', v_huerfanos;
  end if;

  return new;
end;
$$;

alter function public.check_staff_ultimo_jefe_acceso_sensible() owner to project_admin;

drop trigger if exists trg_staff_ultimo_jefe_acceso_sensible on public.staff;
create trigger trg_staff_ultimo_jefe_acceso_sensible
  before update of activo, rol on public.staff
  for each row execute function public.check_staff_ultimo_jefe_acceso_sensible();


-- ============================================================
-- 8) accesos_log_accion_check: valores nuevos
-- Las edge functions del plan (revelado fallido/denegado, purga de datos
-- temporales, apertura del portal y exportación de CSV con DNI completo,
-- PLAN §3.10) necesitan estas acciones. Se recompone el CHECK desde el
-- catálogo de PRODUCCIÓN (12 valores el 2026-10-01: ver, copiar, enviar,
-- entrega_creada, entrega_abierta, creado, editado, eliminado,
-- acceso_denegado, permiso_otorgado, permiso_revocado, entrega_fallida) y
-- se agregan 5. No se usa la lista de la 064 (perdió permiso_otorgado/
-- permiso_revocado: PERM-060-064, corregido en la 074). Como solo se
-- amplía, las filas existentes siempre cumplen: no hace falta NOT VALID.
-- ============================================================

alter table public.accesos_log drop constraint if exists accesos_log_accion_check;
alter table public.accesos_log add constraint accesos_log_accion_check
  check (accion in (
    'ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta',
    'creado', 'editado', 'eliminado',
    'acceso_denegado',
    'permiso_otorgado', 'permiso_revocado',
    'entrega_fallida',
    'revelado_fallido', 'revelado_denegado', 'purga_ejecutada',
    'portal_abierto', 'exportacion'
  ));

comment on constraint accesos_log_accion_check on public.accesos_log is
  'Acciones auditables. entrega_creada existe pero el código real nunca la emite (entregaCrear registra "enviar"): resto histórico. Los 5 últimos (revelado_fallido, revelado_denegado, purga_ejecutada, portal_abierto, exportacion) se agregaron en la migración 099; no recomponer esta lista desde una copia vieja (ver 074).';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Las 3 funciones nuevas (esperado: 3 filas, dueño project_admin, SD):
--    select proname, pg_get_userbyid(proowner) as dueno, prosecdef, provolatile from pg_proc where pronamespace = 'public'::regnamespace and proname in ('puede','puede_actual','exigir_permiso') order by proname;
--
-- 2) EXECUTE (esperado: puede → solo project_admin; puede_actual y
--    exigir_permiso → authenticated=true, anon=false):
--    select p, has_function_privilege('anon', p, 'execute') as anon, has_function_privilege('authenticated', p, 'execute') as authenticated, has_function_privilege('project_admin', p, 'execute') as project_admin from unnest(array['public.puede(uuid,text)','public.puede_actual(text)','public.exigir_permiso(text)']) as p;
--
-- 3) ticket_token_existe conserva EXECUTE para anon y valida la forma
--    (esperado: anon=true; los dos selects devuelven false):
--    select has_function_privilege('anon', 'public.ticket_token_existe(text)', 'execute') as anon;
--    select public.ticket_token_existe('corto'), public.ticket_token_existe('aaaaaaaaaaaaaaaaaaaaaaa!');
--
-- 4) Policies de las secciones 2, 4 y 6 (esperado: empresas insert/update
--    con puede_actual('modulo:empleados'); kb_articulos update con
--    puede_actual; sección 6, si se aplicó, categorias_ticket → tickets y
--    ubicaciones → equipos; SELECT y DELETE sin cambios):
--    select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename in ('empresas','kb_articulos','categorias_ticket','ubicaciones') order by tablename, cmd;
--
-- 5) kb_registrar_feedback con el guard nuevo (esperado: true):
--    select position('modulo:base_conocimiento' in prosrc) > 0 as con_gate from pg_proc where pronamespace = 'public'::regnamespace and proname = 'kb_registrar_feedback';
--
-- 6) Trigger de la sección 7 (esperado: 1 fila, tgenabled='O'):
--    select tgname, tgenabled from pg_trigger where tgrelid = 'public.staff'::regclass and tgname = 'trg_staff_ultimo_jefe_acceso_sensible';
--
-- 7) CHECK de accesos_log con los 17 valores (esperado: convalidated=true
--    y la definición lista las 12 acciones previas + las 5 nuevas):
--    select conname, convalidated, pg_get_constraintdef(oid) from pg_constraint where conname = 'accesos_log_accion_check';
--
-- 8) Funcional de puede() con un usuario real (esperado: true para un JEFE
--    activo; sustituir el uuid). Solo lectura:
--    select public.puede((select user_id from public.staff where rol = 'JEFE' and activo limit 1), 'credenciales.ver');
--
-- 9) Tracking: scripts/apply-migration.mjs registra la fila solo; si se
--    aplicó a mano con `db import`, registrarla y verificar:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '099';
--
-- 10) Autorización end-to-end (cuando existan las cuentas de P0-04): un
--     ASISTENTE activo SIN el módulo 'empleados' que intente insertar en
--     `empresas`, o SIN 'base_conocimiento' que llame
--     .rpc('kb_registrar_feedback', ...), debe recibir 42501 (RLS) o P0001
--     'No autorizado' (RPC).
-- ============================================================
-- FIN DE MIGRACIÓN 099
-- ============================================================
