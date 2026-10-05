-- ============================================================
-- MIGRACIÓN 102 — Ciclo de vida del empleado: eventos auditables, máquina de
-- estados, contexto de transacción, RPC de suspensión/baja/reingreso y
-- revisiones de acceso
-- Depende de: 002 (empleados, cuentas), 003 (es_staff/es_jefe), 004
--   (asignaciones_cuenta), 009 (marcar_rotacion_pendiente, cuentas.
--   requiere_rotacion), 011 (asignaciones_licencia), 038/086 (dar_baja_empleado
--   vigente), 045/048/054 (notificaciones, crear_notificacion), 058/059
--   (areas_obras, ubicaciones), 099 (exigir_permiso / puede_actual)
-- Convive con: 100 (cuentas_password_cambio: ver "Interacción con 100" abajo)
--
-- ⚠️ NO APLICADA. Escrita y revisada en local (Ciclo 21, plan de mejora §4
-- "102"). Aplicar solo con autorización explícita del dueño, DESPUÉS de la 099
-- (usa exigir_permiso/puede_actual; la sección 0 aborta si falta) y leyendo
-- docs/GOTCHAS-CLI.md. El frontend todavía llama a dar_baja_empleado con un
-- solo argumento nombrado (p_empleado_id): esta migración lo sigue
-- soportando, así que puede aplicarse ANTES de migrar el frontend.
--
-- Cierra el hallazgo EMPLEADOS-SIN-AUDITORIA (Ciclo 21): la ficha del empleado
-- no tenía ninguna hoja de vida (ni quién creó, cambió de área o dio de baja a
-- alguien, ni por qué), la máquina de estados vivía solo en el cliente
-- (cualquier UPDATE directo podía saltar Inactivo → Suspendido o cambiar el
-- estado sin dejar rastro) y "Suspendido" existía en el enum sin ningún flujo.
--
-- Qué crea (una sección por concepto, todas idempotentes):
--   1) empleados_ajustes        interruptor de compatibilidad (ver decisión A)
--   2) contexto_transaccion     "quién y por dónde" de la transacción actual,
--                               por txid_current() (InsForge no admite cambiar la
--                               configuración de sesión) + marcar_contexto/contexto_actual
--   3) empleado_eventos         hoja de vida append-only (RLS + trigger de
--                               inmutabilidad) + trigger evento_empleado_cambios
--   4) transiciones_empleado_permitidas + check_transicion_empleado
--   5) efectos de la suspensión (rotación de cuentas + notificación) y CHECK
--      de notificaciones_tipo_check ampliado con 'empleado_suspendido'
--   6) RPC: suspender_empleado, reactivar_empleado, reingresar_empleado,
--      dar_baja_empleado(uuid, text default null)
--   7) empleado_revisiones_acceso + registrar_revision_accesos + vista
--   8) Backfill idempotente de eventos
--
-- ------------------------------------------------------------
-- TABLA DE FIRMAS (la fuente para escribir el frontend)
-- Todas: SECURITY DEFINER, dueño project_admin, search_path = public,
-- EXECUTE solo `authenticated` (revocado a public/anon). Guard:
-- perform public.exigir_permiso('modulo:empleados') → sin permiso lanza
-- 'No autorizado' con SQLSTATE 42501 (JEFE exento; staff inactivo, no).
-- Llamada PostgREST/SDK: rpc('nombre', { p_... }) con argumentos NOMBRADOS.
--
--  RPC                      argumentos (nombre tipo [default])         retorno
--  suspender_empleado       p_empleado_id uuid, p_motivo text           public.empleados
--  reactivar_empleado       p_empleado_id uuid, p_motivo text = null    public.empleados
--  reingresar_empleado      p_empleado_id uuid, p_datos jsonb = '{}'    public.empleados
--  dar_baja_empleado        p_empleado_id uuid, p_motivo text = null    public.empleados
--  registrar_revision_accesos
--                           p_empleado_id uuid, p_resultado jsonb = '{}',
--                           p_nota text = null                          public.empleado_revisiones_acceso
--
--  Reglas por RPC (errores = excepción P0001 con mensaje en español salvo
--  el guard, que es 42501):
--  - suspender_empleado: motivo OBLIGATORIO (no vacío, ≤ 500). Solo desde
--    Activo. Estado → Suspendido; las cuentas reutilizables/compartidas
--    vivas con asignación activa quedan requiere_rotacion = true SIN cerrar
--    la asignación; notificación 'empleado_suspendido'; evento 'suspendido'.
--  - reactivar_empleado: desde Suspendido o Inactivo (también restaura un
--    empleado con deleted_at, igual que el cliente de hoy). Estado → Activo,
--    deleted_at → null, NO toca fecha_alta (igual que reactivarEmpleado del
--    cliente). Evento 'reactivado'. Rechaza a un Activo no eliminado.
--  - reingresar_empleado: solo desde Inactivo (no eliminado). Estado →
--    Activo, fecha_alta = hoy (Lima). p_datos acepta SOLO las claves
--    area_obra_id, ubicacion_id (uuid o null/'' para limpiar), cargo (texto
--    o null/''), empresa_id (uuid, no puede quedar vacío); las demás claves se
--    ignoran. Un uuid inexistente o eliminado se rechaza. Evento 'reingreso'
--    (+ los eventos de área/ubicación/cargo/empresa que genere el cambio).
--  - dar_baja_empleado: MISMO comportamiento que la 086 (cierre atómico de
--    asignaciones de cuenta y licencia, baja de cuentas personales,
--    Inactivo) + evento 'baja_ejecutada' con el motivo (opcional). Llamarla
--    sobre un empleado ya Inactivo sigue siendo inocua y no repite el evento.
--    La firma (uuid) desaparece y es reemplazada por (uuid, text default
--    null): la llamada de un solo argumento nombrado p_empleado_id sigue
--    resolviendo (hay un solo candidato).
--  - registrar_revision_accesos: inserta una fila en
--    empleado_revisiones_acceso (revisado_por = auth.uid()) y el evento
--    'accesos_revisados'.
--
--  Funciones internas (EXECUTE solo project_admin; las RPC de arriba son su
--  guard + una llamada; existen para poder probar la lógica sin sesión en
--  tests/db/triggers.test.sql, cuya conexión no tiene auth.uid()):
--    empleado_suspender_interno(uuid, text)  empleado_reactivar_interno(uuid, text)
--    empleado_reingresar_interno(uuid, jsonb) empleado_dar_baja_interno(uuid, text)
--    marcar_contexto(text, text)  contexto_actual()  restaurar_contexto(text, text)
--    rol_actor_empleado()  registrar_evento_empleado(uuid, text, text, text, text, text)
--
--  Lectura (SDK directo, RLS):
--    empleado_eventos                      SELECT es_staff()
--    transiciones_empleado_permitidas      SELECT es_staff()
--    empleado_revisiones_acceso            SELECT módulo 'empleados'
--    v_empleado_ultima_revision_acceso     (security_invoker) último control
--
-- ------------------------------------------------------------
-- DECISIONES
--
-- A) Compatibilidad del trigger de transición. Hoy hay DOS escrituras
--    directas de `estado` desde el cliente (empleados.js): updateEmpleado
--    (manda el estado actual sin cambiarlo) y reactivarEmpleado (UPDATE
--    Inactivo → Activo con deleted_at null; flujo VIVO, el botón "Reactivar"
--    de la ficha, sin RPC hasta ahora). Si check_transicion_empleado exigiera
--    el contexto de RPC desde el primer día, "Reactivar" dejaría de
--    funcionar hasta desplegar el frontend nuevo. Por eso:
--      - La whitelist (qué par origen → destino existe) se aplica SIEMPRE.
--        Hoy solo rechaza Inactivo → Suspendido, que ningún flujo vivo hace.
--      - La exigencia de que las transiciones `via_rpc` vengan marcadas
--        (contexto 'rpc_empleado') se controla con empleados_ajustes
--        ('exigir_contexto_rpc'), que NACE en false (compatibilidad). Con
--        false, un UPDATE directo se permite pero queda registrado como
--        'estado_cambiado' con detalle "Cambio directo (sin función de
--        servidor)", o sea sigue auditado. Cuando el frontend use las RPC
--        (y esté desplegado) se activa con un solo UPDATE (ver "Después de
--        aplicar", al final) y desde entonces el estado SOLO cambia por las
--        RPC o por quien llame antes a marcar_contexto(rol, 'rpc_empleado'),
--        incluidos los scripts de mantenimiento del owner (no hay bypass por
--        "sin sesión": el que escribe estado debe declararlo).
--      - Un script que marque ese contexto asume registrar su propio evento:
--        mientras el contexto 'rpc_empleado' está activo, el trigger de
--        eventos NO escribe 'estado_cambiado' (la RPC escribe el evento
--        semántico: suspendido/reactivado/reingreso/baja_ejecutada).
--    Cuando 103 traiga config_parametros, el interruptor puede migrar allá.
--
-- B) Interacción con 100 (cuentas_password_cambio). Esa función revierte
--    requiere_rotacion a su valor anterior en cualquier UPDATE directo
--    (pg_trigger_depth() <= 1) que no cambie la contraseña. Un UPDATE de
--    cuentas escrito en el cuerpo de una RPC correría a profundidad 1 y la
--    marca de rotación de la suspensión se perdería en silencio. Por eso la
--    marca la pone un TRIGGER de empleados (efectos_suspension_empleado,
--    sección 5), igual que la 009 lo hace desde asignaciones_cuenta: el
--    UPDATE de cuentas llega anidado (profundidad ≥ 2) y pasa con o sin la
--    100 aplicada. Efecto colateral deseado: cualquier cambio de estado a
--    Suspendido (también uno directo en modo compatibilidad) marca rotación.
--
-- C) Contexto por txid. Las RPC marcan el contexto al empezar y RESTAURAN el
--    anterior al terminar (restaurar_contexto), así que un contexto previo
--    (p. ej. una RPC de tickets que llame a una de empleados) no se pisa y,
--    sobre todo, una transacción larga (el archivo de tests) no arrastra
--    'rpc_empleado' a las escrituras directas que siguen.
--    contexto_transaccion no tiene CHECK de rol/origen a propósito: es
--    genérica (la 093 de V2 la usará para tickets). La purga de filas
--    huérfanas (txid de transacciones abortadas) corresponde a la 104
--    ("contexto_transaccion 1 d").
--    ► AL INTEGRAR V2 (migraciones 090–095, otro worktree): rol_actor_contexto()
--    de la 093 debe pasar a leer contexto_actual() en lugar de
--    ticket_contexto_actor, y las RPC de tickets deben llamar
--    marcar_contexto(rol, 'rpc_ticket'). No se hizo aquí porque esta rama no
--    contiene la 091/093.
--
-- D) Privacidad. Los eventos nunca guardan el DNI ni los valores de contacto
--    (teléfono, WhatsApp, correo): 'contacto_cambiado' solo dice qué columnas
--    cambiaron y detalle = 'actualizado' (plan §3.10). Área, ubicación y
--    empresa se guardan con su NOMBRE legible, no con el id.
--
-- E) empleado_eventos es legible por cualquier staff activo (es_staff()): es
--    la misma excepción deliberada de `empleados` (cuyo SELECT tampoco lleva
--    gate de módulo). No tiene FK a auth.users (un `on delete set null`
--    chocaría con la inmutabilidad). Sí tiene FK a empleados SIN cascade:
--    un DELETE físico de un empleado con historial (todos, tras el backfill)
--    queda bloqueado a propósito; el borrado de datos personales es la
--    anonimización de la 104, no el DELETE.
--
-- F) No se implementa aquí la "solicitud de alta" que el plan asocia a
--    reingresar_empleado (depende de 108/109, que esta rama no tiene).
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): cuerpos con dollar-quoting →
-- `db import` o scripts/deploy.mjs, NUNCA `db query` a mano. Si `db import`
-- crashea (`Assertion failed ... src\win\async.c`), partir en archivos
-- temporales por sección y aplicarlos uno por uno; este archivo único sigue
-- siendo la fuente de verdad. Correr SIEMPRE el bloque "Verificación" del
-- final: `db import` puede reportar error habiendo ejecutado parte de los
-- statements. Todo es idempotente: reaplicar el archivo completo tras un
-- fallo parcial es seguro (el interruptor de la sección 1 y el backfill de la
-- 8 no se pisan).
--
-- Rollback: migrations/rollback/102_rollback.sql (⚠️ descarta la auditoría
-- de empleados acumulada: leer su cabecera).
-- ============================================================


-- ============================================================
-- 0) Precondición: la 099 debe estar aplicada
-- ============================================================

do $$
begin
  if to_regprocedure('public.exigir_permiso(text)') is null
     or to_regprocedure('public.puede_actual(text)') is null then
    raise exception 'La migración 102 requiere la 099 (exigir_permiso / puede_actual). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) Interruptor de compatibilidad del trigger de transición
-- ============================================================

create table if not exists public.empleados_ajustes (
  clave       text        primary key,
  valor       boolean     not null,
  descripcion text,
  updated_at  timestamptz not null default now()
);

comment on table public.empleados_ajustes is
  'Interruptores del ciclo de vida del empleado (102). Sin policy de escritura: se cambian por SQL/migración con cliente admin. exigir_contexto_rpc = false (compatibilidad) hasta que el frontend use las RPC; luego true.';

-- NO se pisa un valor ya cambiado: reaplicar la migración no desactiva la
-- exigencia una vez activada.
insert into public.empleados_ajustes (clave, valor, descripcion) values
  ('exigir_contexto_rpc', false,
   'true = el estado de un empleado solo cambia por las RPC (o tras marcar_contexto(rol, ''rpc_empleado'')); false = compatibilidad: se permite el UPDATE directo (whitelist siempre aplicada) y se registra como cambio directo.')
on conflict (clave) do nothing;

alter table public.empleados_ajustes enable row level security;

drop policy if exists "staff puede ver ajustes de empleados" on public.empleados_ajustes;
create policy "staff puede ver ajustes de empleados"
  on public.empleados_ajustes for select
  using (public.es_staff());

revoke all on table public.empleados_ajustes from anon, authenticated;
grant select on table public.empleados_ajustes to authenticated;


-- ============================================================
-- 2) contexto_transaccion (+ marcar_contexto / contexto_actual /
--    restaurar_contexto)
-- InsForge no admite cambiar la configuración de sesión, así que el "quién y por dónde" de la
-- transacción vive en una tabla clavada por txid_current(). Solo la tocan
-- funciones SECURITY DEFINER (dueño project_admin): RLS habilitada sin
-- policies y sin privilegios para anon/authenticated.
-- ============================================================

create table if not exists public.contexto_transaccion (
  txid      bigint      primary key,
  rol       text        not null,
  origen    text        not null,
  creado_en timestamptz not null default now()
);

comment on table public.contexto_transaccion is
  'Contexto de la transacción en curso (rol del actor y origen, p. ej. rpc_empleado), clavado por txid_current(). Generaliza ticket_contexto_actor (093 de V2). Sin policies: solo funciones SECURITY DEFINER. Las filas de transacciones abortadas las purga la 104.';

alter table public.contexto_transaccion enable row level security;
revoke all on table public.contexto_transaccion from anon, authenticated;

create or replace function public.marcar_contexto(p_rol text, p_origen text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(p_rol, '')), '') is null or nullif(btrim(coalesce(p_origen, '')), '') is null then
    raise exception 'marcar_contexto: rol y origen son obligatorios';
  end if;

  insert into public.contexto_transaccion (txid, rol, origen)
  values (txid_current(), p_rol, p_origen)
  on conflict (txid) do update
    set rol = excluded.rol, origen = excluded.origen, creado_en = now();
end;
$$;

-- Sin fila para la transacción actual devuelve CERO filas (equivale a null:
-- `select origen into v from public.contexto_actual()` deja v en null).
create or replace function public.contexto_actual()
returns table (rol text, origen text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select c.rol, c.origen
      from public.contexto_transaccion c
     where c.txid = txid_current();
end;
$$;

-- Devuelve el contexto al valor que tenía antes de una RPC: con p_origen null
-- borra la fila (no había contexto), si no la reescribe.
create or replace function public.restaurar_contexto(p_rol text, p_origen text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_origen is null then
    delete from public.contexto_transaccion where txid = txid_current();
  else
    perform public.marcar_contexto(p_rol, p_origen);
  end if;
end;
$$;

alter function public.marcar_contexto(text, text) owner to project_admin;
alter function public.contexto_actual() owner to project_admin;
alter function public.restaurar_contexto(text, text) owner to project_admin;

revoke all on function public.marcar_contexto(text, text) from public, anon, authenticated;
revoke all on function public.contexto_actual() from public, anon, authenticated;
revoke all on function public.restaurar_contexto(text, text) from public, anon, authenticated;
grant execute on function public.marcar_contexto(text, text) to project_admin;
grant execute on function public.contexto_actual() to project_admin;
grant execute on function public.restaurar_contexto(text, text) to project_admin;

comment on function public.marcar_contexto(text, text) is
  'Marca (rol, origen) para la transacción actual (txid_current()). EXECUTE solo project_admin: lo llaman las RPC SECURITY DEFINER. 102.';
comment on function public.contexto_actual() is
  'Contexto de la transacción actual: una fila (rol, origen) o ninguna. EXECUTE solo project_admin. 102.';


-- ============================================================
-- 3) empleado_eventos: hoja de vida append-only
-- ============================================================

create table if not exists public.empleado_eventos (
  id             uuid        primary key default gen_random_uuid(),
  empleado_id    uuid        not null references public.empleados(id),
  evento         text        not null,
  campo          text,
  valor_anterior text,
  valor_nuevo    text,
  user_id        uuid,
  user_email     text,
  rol_actor      text,
  detalle        text,
  created_at     timestamptz not null default now(),
  constraint empleado_eventos_evento_check check (evento in (
    'creado', 'estado_cambiado', 'area_cambiada', 'ubicacion_cambiada',
    'cargo_cambiado', 'empresa_cambiada', 'contacto_cambiado',
    'baja_ejecutada', 'reingreso', 'suspendido', 'reactivado',
    'eliminado', 'restaurado', 'accesos_revisados', 'anonimizado'
  )),
  constraint empleado_eventos_rol_actor_check check (rol_actor in (
    'tecnico', 'jefe', 'usuario', 'sistema', 'legado'
  ))
);

create index if not exists idx_empleado_eventos_empleado
  on public.empleado_eventos (empleado_id, created_at desc);

comment on table public.empleado_eventos is
  'Hoja de vida del empleado (102). Append-only: solo la escriben triggers/RPC SECURITY DEFINER; UPDATE y DELETE los rechaza un trigger. Nunca guarda DNI ni valores de contacto. Legible por cualquier staff (misma excepción deliberada de empleados).';

alter table public.empleado_eventos enable row level security;

drop policy if exists "staff puede ver eventos de empleados" on public.empleado_eventos;
create policy "staff puede ver eventos de empleados"
  on public.empleado_eventos for select
  using (public.es_staff());

-- Sin policies de INSERT/UPDATE/DELETE y, además, sin privilegios de escritura.
revoke all on table public.empleado_eventos from anon, authenticated;
grant select on table public.empleado_eventos to authenticated;

create or replace function public.empleado_eventos_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'empleado_eventos es inmutable: no admite % (migración 102).', tg_op;
end;
$$;

drop trigger if exists trg_empleado_eventos_inmutable on public.empleado_eventos;
create trigger trg_empleado_eventos_inmutable
  before update or delete on public.empleado_eventos
  for each row execute function public.empleado_eventos_inmutable();


-- ------------------------------------------------------------
-- Ayudantes internos (solo project_admin)
-- ------------------------------------------------------------

-- Rol del actor cuando no hay contexto: sin sesión → sistema; JEFE → jefe;
-- staff → tecnico; cualquier otra sesión → usuario.
create or replace function public.rol_actor_empleado()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return 'sistema';
  end if;
  if public.es_jefe() then
    return 'jefe';
  end if;
  if public.es_staff() then
    return 'tecnico';
  end if;
  return 'usuario';
end;
$$;

-- Único punto de escritura de empleado_eventos (triggers y RPC). El rol sale
-- del contexto de la transacción si es válido; si no, de rol_actor_empleado().
create or replace function public.registrar_evento_empleado(
  p_empleado_id uuid,
  p_evento      text,
  p_campo       text default null,
  p_anterior    text default null,
  p_nuevo       text default null,
  p_detalle     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_rol   text;
begin
  if v_uid is not null then
    select email into v_email from auth.users where id = v_uid;
  end if;

  select rol into v_rol from public.contexto_actual();
  if v_rol is null or v_rol not in ('tecnico', 'jefe', 'usuario', 'sistema') then
    v_rol := public.rol_actor_empleado();
  end if;

  insert into public.empleado_eventos
    (empleado_id, evento, campo, valor_anterior, valor_nuevo, user_id, user_email, rol_actor, detalle)
  values
    (p_empleado_id, p_evento, p_campo, p_anterior, p_nuevo, v_uid, v_email, v_rol, p_detalle);
end;
$$;

alter function public.rol_actor_empleado() owner to project_admin;
alter function public.registrar_evento_empleado(uuid, text, text, text, text, text) owner to project_admin;
revoke all on function public.rol_actor_empleado() from public, anon, authenticated;
revoke all on function public.registrar_evento_empleado(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rol_actor_empleado() to project_admin;
grant execute on function public.registrar_evento_empleado(uuid, text, text, text, text, text) to project_admin;


-- ------------------------------------------------------------
-- Trigger evento_empleado_cambios (AFTER INSERT OR UPDATE)
-- Registra: creado, estado (salvo contexto rpc_empleado, ver decisión A),
-- área, ubicación, cargo, empresa, contacto (sin valores), eliminado/
-- restaurado. NO registra updated_at/updated_by ni UPDATEs sin cambio real.
-- ------------------------------------------------------------

create or replace function public.evento_empleado_cambios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen   text;
  v_ant      text;
  v_nue      text;
  v_contacto text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.registrar_evento_empleado(
      new.id, 'creado', 'estado', null, new.estado::text, 'Alta en el sistema');
    return null;
  end if;

  select origen into v_origen from public.contexto_actual();

  if old.estado is distinct from new.estado and v_origen is distinct from 'rpc_empleado' then
    perform public.registrar_evento_empleado(
      new.id, 'estado_cambiado', 'estado', old.estado::text, new.estado::text,
      'Cambio directo (sin función de servidor)');
  end if;

  if old.area_obra_id is distinct from new.area_obra_id then
    select nombre into v_ant from public.areas_obras where id = old.area_obra_id;
    select nombre into v_nue from public.areas_obras where id = new.area_obra_id;
    perform public.registrar_evento_empleado(new.id, 'area_cambiada', 'area_obra', v_ant, v_nue);
  end if;

  if old.ubicacion_id is distinct from new.ubicacion_id then
    select nombre into v_ant from public.ubicaciones where id = old.ubicacion_id;
    select nombre into v_nue from public.ubicaciones where id = new.ubicacion_id;
    perform public.registrar_evento_empleado(new.id, 'ubicacion_cambiada', 'ubicacion', v_ant, v_nue);
  end if;

  if old.cargo is distinct from new.cargo then
    perform public.registrar_evento_empleado(new.id, 'cargo_cambiado', 'cargo', old.cargo, new.cargo);
  end if;

  if old.empresa_id is distinct from new.empresa_id then
    select nombre into v_ant from public.empresas where id = old.empresa_id;
    select nombre into v_nue from public.empresas where id = new.empresa_id;
    perform public.registrar_evento_empleado(new.id, 'empresa_cambiada', 'empresa', v_ant, v_nue);
  end if;

  -- Contacto: un solo evento, sin guardar los valores (privacidad).
  if old.telefono is distinct from new.telefono then
    v_contacto := array_append(v_contacto, 'telefono');
  end if;
  if old.whatsapp is distinct from new.whatsapp then
    v_contacto := array_append(v_contacto, 'whatsapp');
  end if;
  if old.correo_personal is distinct from new.correo_personal then
    v_contacto := array_append(v_contacto, 'correo_personal');
  end if;
  if cardinality(v_contacto) > 0 then
    perform public.registrar_evento_empleado(
      new.id, 'contacto_cambiado', array_to_string(v_contacto, ','), null, null, 'actualizado');
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform public.registrar_evento_empleado(new.id, 'eliminado', 'deleted_at', null, null, 'Eliminado (softdelete)');
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.registrar_evento_empleado(new.id, 'restaurado', 'deleted_at', null, null, 'Restaurado');
  end if;

  return null;
end;
$$;

alter function public.evento_empleado_cambios() owner to project_admin;

drop trigger if exists trg_evento_empleado_cambios on public.empleados;
create trigger trg_evento_empleado_cambios
  after insert or update on public.empleados
  for each row execute function public.evento_empleado_cambios();


-- ============================================================
-- 4) Máquina de estados: transiciones_empleado_permitidas +
--    check_transicion_empleado (patrón de la 050)
-- ============================================================

create table if not exists public.transiciones_empleado_permitidas (
  origen  public.estado_empleado not null,
  destino public.estado_empleado not null,
  via_rpc boolean                not null default true,
  primary key (origen, destino)
);

comment on table public.transiciones_empleado_permitidas is
  'Whitelist de transiciones de estado válidas para empleados (default-deny). via_rpc = solo por las RPC de la 102 (exige contexto rpc_empleado cuando empleados_ajustes.exigir_contexto_rpc = true). Sin policy de escritura: se administra por migración.';

insert into public.transiciones_empleado_permitidas (origen, destino, via_rpc) values
  ('Activo',     'Suspendido', true),
  ('Suspendido', 'Activo',     true),
  ('Activo',     'Inactivo',   true),
  ('Suspendido', 'Inactivo',   true),
  ('Inactivo',   'Activo',     true)
on conflict (origen, destino) do update set via_rpc = excluded.via_rpc;

alter table public.transiciones_empleado_permitidas enable row level security;

drop policy if exists "staff puede ver transiciones de empleado" on public.transiciones_empleado_permitidas;
create policy "staff puede ver transiciones de empleado"
  on public.transiciones_empleado_permitidas for select
  using (public.es_staff());

revoke all on table public.transiciones_empleado_permitidas from anon, authenticated;
grant select on table public.transiciones_empleado_permitidas to authenticated;

create or replace function public.check_transicion_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_via_rpc  boolean;
  v_estricto boolean;
  v_origen   text;
begin
  -- Un UPDATE que manda el mismo estado (updateEmpleado del cliente) no es
  -- una transición.
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  select via_rpc into v_via_rpc
    from public.transiciones_empleado_permitidas
   where origen = old.estado and destino = new.estado;

  if not found then
    raise exception 'Transición de estado de empleado "%" a "%" no permitida.', old.estado, new.estado;
  end if;

  if v_via_rpc then
    select valor into v_estricto
      from public.empleados_ajustes where clave = 'exigir_contexto_rpc';

    if coalesce(v_estricto, false) then
      select origen into v_origen from public.contexto_actual();
      if v_origen is distinct from 'rpc_empleado' then
        raise exception 'El estado del empleado solo se cambia con suspender_empleado, reactivar_empleado, reingresar_empleado o dar_baja_empleado.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

alter function public.check_transicion_empleado() owner to project_admin;

drop trigger if exists trg_check_transicion_empleado on public.empleados;
create trigger trg_check_transicion_empleado
  before update of estado on public.empleados
  for each row execute function public.check_transicion_empleado();


-- ============================================================
-- 5) Efectos de la suspensión + notificación 'empleado_suspendido'
-- ============================================================

-- 5.a) CHECK de notificaciones: los 8 valores vigentes (leídos del catálogo
-- de producción el 2026-10-01: ticket_creado, cuenta_creada, empleado_alta,
-- empleado_baja, ticket_asignado, ticket_estado_cambiado,
-- ticket_comentario_nuevo, ticket_correo_fallido) + empleado_suspendido.
-- Solo se amplía: las filas existentes siempre cumplen.
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja',
    'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo',
    'ticket_correo_fallido',
    'empleado_suspendido'
  ));

-- 5.b) Al pasar a Suspendido (por la vía que sea): rotación pendiente en las
-- cuentas reutilizables/compartidas vivas con asignación activa del empleado
-- (SIN cerrar asignaciones) y aviso al staff. Es un TRIGGER para que el UPDATE
-- de cuentas llegue anidado (ver decisión B). Mismo patrón que 009 y 045.
create or replace function public.efectos_suspension_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cuentas
     set requiere_rotacion = true
   where deleted_at is null
     and requiere_rotacion = false
     and tipo_cuenta in ('reutilizable', 'compartida')
     and id in (
       select a.cuenta_id
         from public.asignaciones_cuenta a
        where a.empleado_id = new.id
          and a.fecha_fin is null
     );

  perform public.crear_notificacion(
    'empleado_suspendido',
    'empleado',
    new.id,
    'Empleado suspendido · ' || new.nombres || ' ' || new.apellidos,
    '/empleados/' || new.id
  );

  return null;
end;
$$;

alter function public.efectos_suspension_empleado() owner to project_admin;

drop trigger if exists trg_empleados_suspension_efectos on public.empleados;
create trigger trg_empleados_suspension_efectos
  after update on public.empleados
  for each row
  when (old.estado is distinct from new.estado and new.estado = 'Suspendido')
  execute function public.efectos_suspension_empleado();


-- ============================================================
-- 6) RPC del ciclo de vida
-- Patrón: función INTERNA (sin guard, EXECUTE solo project_admin) con la
-- lógica, y RPC pública = guard + llamada. Cada interna marca el contexto
-- 'rpc_empleado' al empezar y lo restaura al terminar.
-- ============================================================

-- ------------------------------------------------------------
-- 6.a) suspender_empleado
-- ------------------------------------------------------------
create or replace function public.empleado_suspender_interno(p_empleado_id uuid, p_motivo text)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp         public.empleados;
  v_motivo      text;
  v_prev_rol    text;
  v_prev_origen text;
begin
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'El motivo de la suspensión es obligatorio.';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.';
  end if;

  select * into v_emp from public.empleados
   where id = p_empleado_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Empleado no encontrado';
  end if;
  if v_emp.estado <> 'Activo' then
    raise exception 'Solo se puede suspender a un empleado Activo (estado actual: %).', v_emp.estado;
  end if;

  select rol, origen into v_prev_rol, v_prev_origen from public.contexto_actual();
  perform public.marcar_contexto(public.rol_actor_empleado(), 'rpc_empleado');

  -- La rotación de cuentas y la notificación las pone el trigger
  -- trg_empleados_suspension_efectos (decisión B).
  update public.empleados set estado = 'Suspendido'
   where id = p_empleado_id
   returning * into v_emp;

  perform public.registrar_evento_empleado(
    p_empleado_id, 'suspendido', 'estado', 'Activo', 'Suspendido', v_motivo);

  perform public.restaurar_contexto(v_prev_rol, v_prev_origen);
  return v_emp;
end;
$$;

-- ------------------------------------------------------------
-- 6.b) reactivar_empleado
-- ------------------------------------------------------------
create or replace function public.empleado_reactivar_interno(p_empleado_id uuid, p_motivo text default null)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp         public.empleados;
  v_prev_estado public.estado_empleado;
  v_motivo      text;
  v_prev_rol    text;
  v_prev_origen text;
begin
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is not null and length(v_motivo) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.';
  end if;

  -- Sin filtro de deleted_at a propósito: reactivarEmpleado() del cliente
  -- también limpia deleted_at.
  select * into v_emp from public.empleados
   where id = p_empleado_id
   for update;
  if not found then
    raise exception 'Empleado no encontrado';
  end if;
  if v_emp.estado = 'Activo' and v_emp.deleted_at is null then
    raise exception 'El empleado ya está Activo.';
  end if;

  v_prev_estado := v_emp.estado;

  select rol, origen into v_prev_rol, v_prev_origen from public.contexto_actual();
  perform public.marcar_contexto(public.rol_actor_empleado(), 'rpc_empleado');

  update public.empleados set estado = 'Activo', deleted_at = null
   where id = p_empleado_id
   returning * into v_emp;

  if v_prev_estado <> 'Activo' then
    perform public.registrar_evento_empleado(
      p_empleado_id, 'reactivado', 'estado', v_prev_estado::text, 'Activo', v_motivo);
  end if;

  perform public.restaurar_contexto(v_prev_rol, v_prev_origen);
  return v_emp;
end;
$$;

-- ------------------------------------------------------------
-- 6.c) reingresar_empleado
-- ------------------------------------------------------------
create or replace function public.empleado_reingresar_interno(p_empleado_id uuid, p_datos jsonb default '{}'::jsonb)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp         public.empleados;
  v_datos       jsonb := coalesce(p_datos, '{}'::jsonb);
  v_area        uuid;
  v_ubic        uuid;
  v_empresa     uuid;
  v_cargo       text;
  v_hoy         date;
  v_fecha_ant   date;
  v_uuid_re     constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_prev_rol    text;
  v_prev_origen text;
begin
  if jsonb_typeof(v_datos) <> 'object' then
    raise exception 'p_datos debe ser un objeto JSON.';
  end if;

  select * into v_emp from public.empleados
   where id = p_empleado_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Empleado no encontrado';
  end if;
  if v_emp.estado <> 'Inactivo' then
    raise exception 'Solo se puede reingresar a un empleado Inactivo (estado actual: %).', v_emp.estado;
  end if;

  v_area    := v_emp.area_obra_id;
  v_ubic    := v_emp.ubicacion_id;
  v_empresa := v_emp.empresa_id;
  v_cargo   := v_emp.cargo;

  if v_datos ? 'area_obra_id' then
    if nullif(btrim(coalesce(v_datos->>'area_obra_id', '')), '') is null then
      v_area := null;
    elsif lower(v_datos->>'area_obra_id') !~ v_uuid_re then
      raise exception 'area_obra_id no es un identificador válido.';
    else
      v_area := (v_datos->>'area_obra_id')::uuid;
      if not exists (select 1 from public.areas_obras where id = v_area and deleted_at is null) then
        raise exception 'El área u obra indicada no existe.';
      end if;
    end if;
  end if;

  if v_datos ? 'ubicacion_id' then
    if nullif(btrim(coalesce(v_datos->>'ubicacion_id', '')), '') is null then
      v_ubic := null;
    elsif lower(v_datos->>'ubicacion_id') !~ v_uuid_re then
      raise exception 'ubicacion_id no es un identificador válido.';
    else
      v_ubic := (v_datos->>'ubicacion_id')::uuid;
      if not exists (select 1 from public.ubicaciones where id = v_ubic and deleted_at is null) then
        raise exception 'La ubicación indicada no existe.';
      end if;
    end if;
  end if;

  if v_datos ? 'empresa_id' then
    if nullif(btrim(coalesce(v_datos->>'empresa_id', '')), '') is null then
      raise exception 'La empresa es obligatoria.';
    elsif lower(v_datos->>'empresa_id') !~ v_uuid_re then
      raise exception 'empresa_id no es un identificador válido.';
    else
      v_empresa := (v_datos->>'empresa_id')::uuid;
      if not exists (select 1 from public.empresas where id = v_empresa and deleted_at is null) then
        raise exception 'La empresa indicada no existe.';
      end if;
    end if;
  end if;

  if v_datos ? 'cargo' then
    v_cargo := nullif(btrim(coalesce(v_datos->>'cargo', '')), '');
  end if;

  v_hoy := (now() at time zone 'America/Lima')::date;
  v_fecha_ant := v_emp.fecha_alta;

  select rol, origen into v_prev_rol, v_prev_origen from public.contexto_actual();
  perform public.marcar_contexto(public.rol_actor_empleado(), 'rpc_empleado');

  -- Los cambios de área/ubicación/cargo/empresa los registra el trigger
  -- evento_empleado_cambios con este mismo contexto.
  update public.empleados
     set estado       = 'Activo',
         fecha_alta   = v_hoy,
         area_obra_id = v_area,
         ubicacion_id = v_ubic,
         empresa_id   = v_empresa,
         cargo        = v_cargo
   where id = p_empleado_id
   returning * into v_emp;

  perform public.registrar_evento_empleado(
    p_empleado_id, 'reingreso', 'estado', 'Inactivo', 'Activo',
    'Reingreso; fecha de alta ' || to_char(v_fecha_ant, 'YYYY-MM-DD') || ' → ' || to_char(v_hoy, 'YYYY-MM-DD'));

  perform public.restaurar_contexto(v_prev_rol, v_prev_origen);
  return v_emp;
end;
$$;

-- ------------------------------------------------------------
-- 6.d) dar_baja_empleado(uuid, text default null)
-- Cuerpo = copia de la versión vigente (086), añadiendo contexto, motivo y
-- evento. La firma vieja (uuid) se elimina: con las dos conviviría y la
-- llamada de un solo argumento nombrado sería ambigua.
-- ------------------------------------------------------------
create or replace function public.empleado_dar_baja_interno(p_empleado_id uuid, p_motivo text default null)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy                date;
  v_empleado           public.empleados;
  v_prev_estado        public.estado_empleado;
  v_cuentas_personales uuid[];
  v_motivo             text;
  v_prev_rol           text;
  v_prev_origen        text;
begin
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is not null and length(v_motivo) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.';
  end if;

  select * into v_empleado from public.empleados
   where id = p_empleado_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Empleado no encontrado';
  end if;
  v_prev_estado := v_empleado.estado;

  v_hoy := (now() at time zone 'America/Lima')::date;

  select rol, origen into v_prev_rol, v_prev_origen from public.contexto_actual();
  perform public.marcar_contexto(public.rol_actor_empleado(), 'rpc_empleado');

  -- Cuentas personales activas de este empleado (antes de cerrar la
  -- asignación): son las que se dan de baja junto con él. Reutilizables/
  -- compartidas NO se tocan acá — quedan libres y "por rotar" vía el
  -- trigger marcar_rotacion_pendiente() al cerrarse su asignación.
  select array_agg(c.id) into v_cuentas_personales
    from public.asignaciones_cuenta a
    join public.cuentas c on c.id = a.cuenta_id
   where a.empleado_id = p_empleado_id
     and a.fecha_fin is null
     and c.tipo_cuenta = 'personal';

  update public.asignaciones_cuenta
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;

  update public.asignaciones_licencia
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;

  if v_cuentas_personales is not null then
    update public.cuentas
       set deleted_at = now()
     where id = any(v_cuentas_personales);
  end if;

  update public.empleados
     set estado = 'Inactivo'
   where id = p_empleado_id
   returning * into v_empleado;

  -- Una segunda baja sobre un Inactivo es inocua (como antes) y no repite
  -- el evento.
  if v_prev_estado <> 'Inactivo' then
    perform public.registrar_evento_empleado(
      p_empleado_id, 'baja_ejecutada', 'estado', v_prev_estado::text, 'Inactivo', v_motivo);
  end if;

  perform public.restaurar_contexto(v_prev_rol, v_prev_origen);
  return v_empleado;
end;
$$;

drop function if exists public.dar_baja_empleado(uuid);

-- ------------------------------------------------------------
-- RPC públicas (guard + llamada a la interna)
-- ------------------------------------------------------------
create or replace function public.suspender_empleado(p_empleado_id uuid, p_motivo text)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.empleado_suspender_interno(p_empleado_id, p_motivo);
end;
$$;

create or replace function public.reactivar_empleado(p_empleado_id uuid, p_motivo text default null)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.empleado_reactivar_interno(p_empleado_id, p_motivo);
end;
$$;

create or replace function public.reingresar_empleado(p_empleado_id uuid, p_datos jsonb default '{}'::jsonb)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.empleado_reingresar_interno(p_empleado_id, p_datos);
end;
$$;

create or replace function public.dar_baja_empleado(p_empleado_id uuid, p_motivo text default null)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.empleado_dar_baja_interno(p_empleado_id, p_motivo);
end;
$$;

comment on function public.suspender_empleado(uuid, text) is
  'Suspende a un empleado Activo (motivo obligatorio): estado Suspendido, rotación pendiente en sus cuentas reutilizables/compartidas sin cerrar asignaciones, notificación y evento. Guard modulo:empleados. 102.';
comment on function public.reactivar_empleado(uuid, text) is
  'Suspendido/Inactivo → Activo (restaura también deleted_at). No toca fecha_alta. Guard modulo:empleados. 102.';
comment on function public.reingresar_empleado(uuid, jsonb) is
  'Inactivo → Activo con fecha_alta = hoy (Lima); p_datos solo area_obra_id/ubicacion_id/cargo/empresa_id. Guard modulo:empleados. 102.';
comment on function public.dar_baja_empleado(uuid, text) is
  'Baja atómica de un empleado (038/086) con motivo opcional y evento baja_ejecutada: cierra asignaciones de cuentas y licencias, da de baja cuentas personales y marca Inactivo en una sola transacción. Guard modulo:empleados. 102.';

-- Dueño, REVOKE y GRANT. Las internas, solo project_admin; las públicas,
-- authenticated (el REVOKE a public/anon es el mismo criterio de la 062).
alter function public.empleado_suspender_interno(uuid, text) owner to project_admin;
alter function public.empleado_reactivar_interno(uuid, text) owner to project_admin;
alter function public.empleado_reingresar_interno(uuid, jsonb) owner to project_admin;
alter function public.empleado_dar_baja_interno(uuid, text) owner to project_admin;
alter function public.suspender_empleado(uuid, text) owner to project_admin;
alter function public.reactivar_empleado(uuid, text) owner to project_admin;
alter function public.reingresar_empleado(uuid, jsonb) owner to project_admin;
alter function public.dar_baja_empleado(uuid, text) owner to project_admin;

revoke all on function public.empleado_suspender_interno(uuid, text) from public, anon, authenticated;
revoke all on function public.empleado_reactivar_interno(uuid, text) from public, anon, authenticated;
revoke all on function public.empleado_reingresar_interno(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.empleado_dar_baja_interno(uuid, text) from public, anon, authenticated;
grant execute on function public.empleado_suspender_interno(uuid, text) to project_admin;
grant execute on function public.empleado_reactivar_interno(uuid, text) to project_admin;
grant execute on function public.empleado_reingresar_interno(uuid, jsonb) to project_admin;
grant execute on function public.empleado_dar_baja_interno(uuid, text) to project_admin;

revoke all on function public.suspender_empleado(uuid, text) from public, anon;
revoke all on function public.reactivar_empleado(uuid, text) from public, anon;
revoke all on function public.reingresar_empleado(uuid, jsonb) from public, anon;
revoke all on function public.dar_baja_empleado(uuid, text) from public, anon;
grant execute on function public.suspender_empleado(uuid, text) to authenticated;
grant execute on function public.reactivar_empleado(uuid, text) to authenticated;
grant execute on function public.reingresar_empleado(uuid, jsonb) to authenticated;
grant execute on function public.dar_baja_empleado(uuid, text) to authenticated;


-- ============================================================
-- 7) Revisiones periódicas de acceso
-- ============================================================

create table if not exists public.empleado_revisiones_acceso (
  id           uuid        primary key default gen_random_uuid(),
  empleado_id  uuid        not null references public.empleados(id),
  revisado_por uuid        references auth.users(id) on delete set null,
  revisado_at  timestamptz not null default now(),
  resultado    jsonb       not null default '{}'::jsonb,
  nota         text
);

create index if not exists idx_empleado_revisiones_empleado
  on public.empleado_revisiones_acceso (empleado_id, revisado_at desc);

comment on table public.empleado_revisiones_acceso is
  'Control periódico de los accesos de un empleado (KPI del plan §8). Solo se escribe por registrar_revision_accesos(); SELECT con el módulo empleados. 102.';

alter table public.empleado_revisiones_acceso enable row level security;

drop policy if exists "staff con modulo empleados puede ver revisiones de acceso" on public.empleado_revisiones_acceso;
create policy "staff con modulo empleados puede ver revisiones de acceso"
  on public.empleado_revisiones_acceso for select
  using (public.puede_actual('modulo:empleados'));

revoke all on table public.empleado_revisiones_acceso from anon, authenticated;
grant select on table public.empleado_revisiones_acceso to authenticated;

create or replace function public.registrar_revision_accesos(
  p_empleado_id uuid,
  p_resultado   jsonb default '{}'::jsonb,
  p_nota        text  default null
)
returns public.empleado_revisiones_acceso
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado jsonb := coalesce(p_resultado, '{}'::jsonb);
  v_nota      text  := nullif(btrim(coalesce(p_nota, '')), '');
  v_fila      public.empleado_revisiones_acceso;
begin
  perform public.exigir_permiso('modulo:empleados');

  if jsonb_typeof(v_resultado) <> 'object' then
    raise exception 'p_resultado debe ser un objeto JSON.';
  end if;
  if v_nota is not null and length(v_nota) > 1000 then
    raise exception 'La nota no puede superar los 1000 caracteres.';
  end if;
  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado';
  end if;

  insert into public.empleado_revisiones_acceso (empleado_id, revisado_por, resultado, nota)
  values (p_empleado_id, auth.uid(), v_resultado, v_nota)
  returning * into v_fila;

  perform public.registrar_evento_empleado(
    p_empleado_id, 'accesos_revisados', null, null, null,
    coalesce(v_nota, 'Revisión de accesos registrada'));

  return v_fila;
end;
$$;

alter function public.registrar_revision_accesos(uuid, jsonb, text) owner to project_admin;
revoke all on function public.registrar_revision_accesos(uuid, jsonb, text) from public, anon;
grant execute on function public.registrar_revision_accesos(uuid, jsonb, text) to authenticated;

comment on function public.registrar_revision_accesos(uuid, jsonb, text) is
  'Registra una revisión de accesos del empleado (fila + evento accesos_revisados). Guard modulo:empleados. 102.';

-- "Último control" por empleado. security_invoker: respeta la RLS de la tabla
-- (módulo empleados) en lugar de leer con los privilegios del dueño.
create or replace view public.v_empleado_ultima_revision_acceso
with (security_invoker = true) as
select distinct on (r.empleado_id)
       r.empleado_id,
       r.id           as revision_id,
       r.revisado_por,
       r.revisado_at,
       r.resultado,
       r.nota
  from public.empleado_revisiones_acceso r
 order by r.empleado_id, r.revisado_at desc;

revoke all on table public.v_empleado_ultima_revision_acceso from anon, authenticated;
grant select on table public.v_empleado_ultima_revision_acceso to authenticated;

comment on view public.v_empleado_ultima_revision_acceso is
  'Última revisión de accesos por empleado (security_invoker: hereda la RLS de empleado_revisiones_acceso). 102.';


-- ============================================================
-- 8) Backfill idempotente de eventos
-- Un 'creado' por empleado (también los eliminados) con la fecha real de
-- alta del registro, y para los Inactivos un 'estado_cambiado' con la fecha
-- aproximada de la última actualización. rol_actor = 'legado'. Se insertan
-- directo (el trigger de inmutabilidad solo frena UPDATE/DELETE) y con
-- `where not exists`, así que reaplicar no duplica.
-- ============================================================

insert into public.empleado_eventos
  (empleado_id, evento, campo, valor_anterior, valor_nuevo, user_id, rol_actor, detalle, created_at)
select e.id, 'creado', null, null, null, e.created_by, 'legado',
       'Registro anterior a la auditoría', e.created_at
  from public.empleados e
 where not exists (
   select 1 from public.empleado_eventos x
    where x.empleado_id = e.id and x.evento = 'creado'
 );

insert into public.empleado_eventos
  (empleado_id, evento, campo, valor_anterior, valor_nuevo, user_id, rol_actor, detalle, created_at)
select e.id, 'estado_cambiado', 'estado', null, 'Inactivo', null, 'legado',
       'Fecha aproximada (última actualización)', e.updated_at
  from public.empleados e
 where e.estado = 'Inactivo'
   and not exists (
     select 1 from public.empleado_eventos x
      where x.empleado_id = e.id and x.evento = 'estado_cambiado' and x.rol_actor = 'legado'
   );


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tablas nuevas (esperado: 5 filas, todas con relrowsecurity = true):
--    select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('empleados_ajustes','contexto_transaccion','empleado_eventos','transiciones_empleado_permitidas','empleado_revisiones_acceso') order by relname;
--
-- 2) Funciones y firmas (esperado: 14 filas, dueño project_admin, todas SD):
--    select proname, pg_get_function_identity_arguments(oid) as args, pg_get_userbyid(proowner) as dueno, prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname in ('marcar_contexto','contexto_actual','restaurar_contexto','rol_actor_empleado','registrar_evento_empleado','empleado_suspender_interno','empleado_reactivar_interno','empleado_reingresar_interno','empleado_dar_baja_interno','suspender_empleado','reactivar_empleado','reingresar_empleado','dar_baja_empleado','registrar_revision_accesos') order by proname;
--    (dar_baja_empleado debe aparecer UNA sola vez, con args 'p_empleado_id uuid, p_motivo text DEFAULT NULL::text')
--
-- 3) EXECUTE (esperado: las 5 RPC públicas authenticated=true y anon=false;
--    las internas y las de contexto authenticated=false y project_admin=true):
--    select p, has_function_privilege('anon', p, 'execute') as anon, has_function_privilege('authenticated', p, 'execute') as authenticated, has_function_privilege('project_admin', p, 'execute') as project_admin from unnest(array['public.suspender_empleado(uuid,text)','public.reactivar_empleado(uuid,text)','public.reingresar_empleado(uuid,jsonb)','public.dar_baja_empleado(uuid,text)','public.registrar_revision_accesos(uuid,jsonb,text)','public.marcar_contexto(text,text)','public.contexto_actual()','public.empleado_dar_baja_interno(uuid,text)']) as p;
--
-- 4) Triggers de empleados (esperado: trg_check_transicion_empleado,
--    trg_evento_empleado_cambios, trg_empleados_suspension_efectos, más los
--    previos trg_empleados_*):
--    select tgname, tgenabled from pg_trigger where tgrelid = 'public.empleados'::regclass and not tgisinternal order by tgname;
--
-- 5) Whitelist (esperado: 5 filas, via_rpc = true) e interruptor (esperado:
--    exigir_contexto_rpc = false):
--    select origen, destino, via_rpc from public.transiciones_empleado_permitidas order by 1, 2;
--    select clave, valor from public.empleados_ajustes;
--
-- 6) CHECK de notificaciones (esperado: 9 valores, convalidated = true):
--    select convalidated, pg_get_constraintdef(oid) from pg_constraint where conname = 'notificaciones_tipo_check';
--
-- 7) Backfill (esperado con 100 empleados / 18 Inactivos al 2026-10-01:
--    creado = 100, estado_cambiado legado = 18; nunca duplicados):
--    select evento, rol_actor, count(*) from public.empleado_eventos group by 1, 2 order by 1, 2;
--    select count(*) as empleados_sin_creado from public.empleados e where not exists (select 1 from public.empleado_eventos x where x.empleado_id = e.id and x.evento = 'creado');
--
-- 8) Privilegios de escritura de empleado_eventos (esperado: ambos false):
--    select has_table_privilege('authenticated', 'public.empleado_eventos', 'insert') as ins, has_table_privilege('authenticated', 'public.empleado_eventos', 'update') as upd;
--
-- 9) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '102';
--
-- 10) Autorización end-to-end (cuando existan las cuentas de P0-04): un
--     ASISTENTE activo SIN el módulo 'empleados' que llame
--     .rpc('suspender_empleado', ...) debe recibir 42501.
--
-- ------------------------------------------------------------
-- Después de aplicar (NO forma parte de la migración)
-- ------------------------------------------------------------
-- a) Migrar el frontend a las RPC (bajaEmpleado con motivo, reactivar,
--    suspender, reingresar; la hoja de vida lee empleado_eventos).
-- b) Con el frontend YA desplegado, activar la exigencia del contexto:
--      update public.empleados_ajustes set valor = true, updated_at = now() where clave = 'exigir_contexto_rpc';
--    Verificar con un UPDATE directo de estado de una fila de prueba en un
--    branch: debe fallar con 42501.
-- c) Al integrar V2: ver decisión C (rol_actor_contexto() de la 093).
-- ============================================================
-- FIN DE MIGRACIÓN 102
-- ============================================================
