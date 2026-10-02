-- ============================================================
-- MIGRACIÓN 109 — Portal del empleado SIN cuentas: identidad ligera por enlace
-- firmado (/mi/<token>), confirmación de recepción de equipos
-- Depende de: 013 (asignaciones_equipo, eventos_equipo), 016 (tickets), 099
--   (exigir_permiso / puede_actual; accesos_log_accion_check con
--   'portal_abierto'), 101 (eventos_equipo admite 'recepcion_confirmada'),
--   103 (config_parametros, parametro_entero), 104 (intentos_publicos),
--   112 (config_retencion y purgar_datos_temporales: se EXTIENDEN aquí)
--
-- Plan de mejora Ciclo 21, §4 "109 — Identidad ligera del empleado en el
-- portal (sin login)" y H3-5 (docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md).
--
-- ⚠️ NO APLICADA. Escrita y probada solo en local (npm run test:sql-local).
-- Aplicar únicamente con autorización explícita del dueño y leyendo antes
-- docs/GOTCHAS-CLI.md. El número 109 estaba reservado desde el plan; esta
-- migración se aplica DESPUÉS de la 112 (la 112 ya está en producción y la 109
-- la extiende): la sección 0 se detiene si la 112 no está. El arnés local
-- (scripts/sql-local/verificar-migraciones.mjs) la ordena al final por eso.
--
-- ── EL PROBLEMA ─────────────────────────────────────────────────────────────
-- Los equipos se entregan en obra y hoy la única constancia es un acta
-- impresa; el empleado no puede ver qué tiene a su cargo ni confirmar que lo
-- recibió, y TI no tiene cómo cerrar el hueco «equipo asignado que el
-- empleado dice que nunca recibió». Crear una cuenta por empleado (decenas, sin
-- correo corporativo, con contraseñas que olvidan) es desproporcionado. La
-- salida del plan es una IDENTIDAD LIGERA: TI genera un enlace personal, lo
-- envía por el canal que ya usa (WhatsApp, a mano) y quien lo abre es
-- «ese empleado», con un alcance mínimo y de vida corta.
--
-- ── QUÉ CREA (una sección por concepto, todas idempotentes) ─────────────────
--   1) empleado_enlaces            el enlace: hash del token, alcance, vigencia,
--                                  revocación, usos, último uso e IP
--   2) asignaciones_equipo         + confirmado_por_empleado_at y
--                                  confirmacion_enlace_id (con un guard: solo el
--                                  portal las escribe, ni el JEFE por SDK)
--   3) config_parametros           'portal_vigencia_dias' = 7 (rango 1..30)
--   4) RPC de staff                portal_emitir_enlace, portal_revocar_enlace
--   5) RPC del portal              portal_abrir, portal_confirmar_equipo
--                                  (EXECUTE solo project_admin: la edge function
--                                  `portal` es la única que las invoca) y el
--                                  auxiliar portal_resolver_enlace
--   6) trigger de empleados        pasar a no-Activo revoca sus enlaces
--   7) retención (112)             config_retencion + purgar_datos_temporales
--                                  incluyen los enlaces ya muertos
--
-- ── MODELO DE AMENAZAS (el enlace es un bearer token) ───────────────────────
--   * Quien tenga el enlace ES el empleado: si lo reenvía o lo pierde, otra
--     persona verá lo que el alcance permite. Por eso el alcance NUNCA incluye
--     contraseñas, URL ni notas de una cuenta (las contraseñas siguen
--     entregándose aparte, por el enlace de entrega de un solo uso de
--     `credenciales`), y la vigencia es corta (7 días, máximo 30).
--   * El token son 144 bits (18 bytes aleatorios del servidor, 24 caracteres
--     base64url, el mismo formato que el token de un ticket). NUNCA se guarda:
--     solo sha256(token) en hexadecimal. Se muestra UNA vez, a quien lo emite.
--   * Sin oráculo: un token inexistente, mal formado, vencido, revocado o de un
--     empleado que ya no está Activo devuelven EXACTAMENTE lo mismo
--     ({"ok": false, "code": "no_existe"}). No se distingue el motivo.
--   * Un solo enlace activo por empleado (índice único parcial): emitir uno
--     nuevo revoca el anterior. Se revoca solo al pasar el empleado a
--     Suspendido o Inactivo (trigger), para que reactivarlo no reviva un enlace
--     viejo.
--   * Confirmar recepción: queda la fecha, el enlace usado y un evento
--     `recepcion_confirmada` en la hoja de vida del equipo. NO es una firma:
--     suplantar la confirmación exige tener el enlace, y el acta impresa sigue
--     siendo el documento para equipos de alto valor (riesgo aceptado del plan).
--   * Rate-limit: lo aplica la edge function (20 por IP y 20 por token cada
--     10 min, sobre intentos_publicos). Estas RPC no son accesibles desde un
--     navegador.
--
-- ── DECISIONES DE DISEÑO ────────────────────────────────────────────────────
--   A) Alcance = text[] con CHECK, no jsonb: {ver_accesos, ver_equipos,
--      ver_tickets, confirmar_equipo}. DESVÍO DEL PLAN: el plan listaba
--      `confirmar_ticket` como cuarto valor; depende de `confirmar_cierre_usuario`
--      (093 de la rama V2), que NO existe en producción, así que ni ese alcance ni
--      `portal_confirmar_cierre` se crean (PENDIENTE de V2: cuando se aplique la 093,
--      una migración posterior amplía el CHECK y agrega la RPC). En su lugar entra
--      `ver_tickets` para que la lista «Mis tickets» tenga un alcance propio y el
--      JEFE/TI pueda omitirla. `confirmar_equipo` implica `ver_equipos`.
--   B) El token se compara por hash, no por id: portal_abrir(p_token text) recibe
--      el token en claro (viaja por HTTPS de la edge function a la RPC) y calcula
--      el hash aquí. La edge function nunca lo registra ni lo devuelve.
--   C) El token se genera con gen_random_uuid() (CSPRNG del servidor, sin depender
--      de pgcrypto): se toman 36 caracteres hexadecimales SIN los 6 bits fijos de
--      cada uuid v4 (versión y variante) = 144 bits reales.
--   D) La IP del último uso (ultimo_ip) es un dato personal: se guarda solo para
--      que TI vea desde dónde se abrió, se limita a 64 caracteres y se purga con
--      la fila (30 días después de que el enlace murió, regla de config_retencion).
--      accesos_log guarda además la IP de cada apertura registrada (se anula a los
--      365 días por la regla de la 112).
--   E) Auditoría en accesos_log SIN contraseñas ni token: emitir = 'enviar',
--      revocar = 'permiso_revocado', abrir = 'portal_abierto' (como mucho una fila
--      por hora y enlace, para no inundar la bitácora si el empleado recarga).
--   F) NO se cambia el paso `confirmar_recepcion` de las solicitudes (108): sigue
--      siendo manual. Una confirmación por equipo no equivale a «recibió todo lo
--      del alta»; hacerlo automático es una mejora posterior si el dueño lo pide.
--   G) La lectura del enlace por el staff (RLS): solo las columnas que no son
--      secretas. token_hash y ultimo_ip no se conceden al rol authenticated.
--
-- ── TABLA DE FIRMAS (la fuente para escribir el frontend y la edge function) ──
--  RPC                      argumentos (tipo, default)                  retorna  EXECUTE / guard
--  portal_emitir_enlace     p_empleado_id uuid,                         jsonb    authenticated / modulo:empleados
--                           p_alcance text[] default null (= todo),
--                           p_dias integer default null (= parámetro)
--      → {"ok": true, "id", "token", "expires_at", "alcance", "dias"}  (el token, UNA vez)
--        Solo a un empleado Activo; revoca el enlace anterior; P0001 si el alcance
--        o la vigencia no son válidos o el empleado no está Activo; P0002 si no existe.
--  portal_revocar_enlace    p_empleado_id uuid                          boolean  authenticated / modulo:empleados
--      → true si había un enlace sin revocar y lo revocó; false si no había.
--  portal_abrir             p_token text, p_ip text default null        jsonb    project_admin
--      → {"ok": true, "nombre", "vence", "alcance", "equipos"?, "accesos"?, "tickets"?}
--      → {"ok": false, "code": "no_existe"}
--  portal_confirmar_equipo  p_token text, p_asignacion_id uuid,         jsonb    project_admin
--                           p_ip text default null
--      → {"ok": true, "ya_confirmada": bool, "confirmado_at"}
--      → {"ok": false, "code": "no_existe" | "sin_alcance" | "no_encontrada"}
--  portal_resolver_enlace   p_token text                                empleado_enlaces  project_admin
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea (`Assertion failed ... src\win\async.c`), partir en
-- archivos temporales por sección y aplicarlos uno por uno; este archivo único
-- sigue siendo la fuente de verdad. Correr SIEMPRE el bloque «Verificación» del
-- final. Todo es idempotente: reaplicar tras un fallo parcial es seguro.
--
-- ⚠️ ORDEN DE SALIDA: (1) aplicar esta migración y verificar; (2) desplegar la
-- edge function `portal` (functions/dist/portal.ts); (3) desplegar el frontend. La
-- function antes que la migración falla cerrada (error_interno) en cada acción.
--
-- Rollback: migrations/rollback/109_rollback.sql (⚠️ descarta los enlaces y las
-- confirmaciones de recepción; leer su cabecera).
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 099, 101, 103, 104 y 112 aplicadas
-- ============================================================

do $$
begin
  if to_regprocedure('public.exigir_permiso(text)') is null
     or to_regprocedure('public.puede_actual(text)') is null then
    raise exception 'La migración 109 requiere la 099 (exigir_permiso / puede_actual). Aplíquela primero.';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'eventos_equipo_evento_check'
       and pg_get_constraintdef(oid) like '%recepcion_confirmada%'
  ) then
    raise exception 'La migración 109 requiere la 101 (eventos_equipo admite recepcion_confirmada). Aplíquela primero.';
  end if;
  if to_regclass('public.config_parametros') is null
     or to_regprocedure('public.parametro_entero(text,integer,text)') is null then
    raise exception 'La migración 109 requiere la 103 (config_parametros / parametro_entero). Aplíquela primero.';
  end if;
  if to_regclass('public.intentos_publicos') is null then
    raise exception 'La migración 109 requiere la 104 (intentos_publicos). Aplíquela primero.';
  end if;
  if to_regclass('public.config_retencion') is null
     or to_regprocedure('public.purgar_datos_temporales()') is null then
    raise exception 'La migración 109 requiere la 112 (config_retencion / purgar_datos_temporales). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) empleado_enlaces: el enlace personal del portal
-- Solo escribe project_admin (las RPC SECURITY DEFINER): ningún cliente inserta,
-- actualiza ni borra. El staff con el módulo `empleados` lee las columnas NO
-- secretas (para saber si hay un enlace vigente y poder revocarlo).
-- ============================================================

create table if not exists public.empleado_enlaces (
  id            uuid        primary key default gen_random_uuid(),
  empleado_id   uuid        not null references public.empleados(id) on delete cascade,
  -- sha256(token) en hexadecimal. El token en claro NUNCA se guarda.
  token_hash    text        not null,
  alcance       text[]      not null,
  expires_at    timestamptz not null,
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  revocado_at   timestamptz,
  revocado_por  uuid        references auth.users(id) on delete set null,
  usos          integer     not null default 0,
  ultimo_uso_at timestamptz,
  ultimo_ip     text,
  constraint empleado_enlaces_token_hash_formato check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint empleado_enlaces_token_hash_unico unique (token_hash),
  constraint empleado_enlaces_alcance_check check (
    cardinality(alcance) > 0
    and alcance <@ array['ver_accesos', 'ver_equipos', 'ver_tickets', 'confirmar_equipo']::text[]
  ),
  -- El rango 1..30 días lo impone portal_emitir_enlace (un CHECK con
  -- created_at + interval depende de la zona horaria de la sesión).
  constraint empleado_enlaces_vigencia_check check (expires_at > created_at),
  constraint empleado_enlaces_usos_check check (usos >= 0)
);

alter table public.empleado_enlaces owner to project_admin;

comment on table public.empleado_enlaces is
  'Enlaces del portal del empleado (/mi/<token>, 109). Guarda solo sha256(token); el token se muestra una vez a quien lo emite. Un enlace sin revocar por empleado (índice parcial). Sin escritura de cliente: la hacen las RPC SECURITY DEFINER. El staff con el módulo empleados lee las columnas no secretas.';
comment on column public.empleado_enlaces.token_hash is
  'sha256 del token en hexadecimal. Nunca se concede al rol authenticated.';
comment on column public.empleado_enlaces.alcance is
  'Qué puede ver o hacer quien abre el enlace: ver_accesos, ver_equipos, ver_tickets, confirmar_equipo. Nunca contraseñas.';
comment on column public.empleado_enlaces.ultimo_ip is
  'IP de la última apertura (dato personal, máx. 64 caracteres). Nunca se concede al rol authenticated; se purga con la fila (regla de config_retencion).';

-- Un solo enlace SIN REVOCAR por empleado. «Activo» no puede incluir la
-- vigencia en el índice (now() no es inmutable): emitir uno nuevo revoca el
-- anterior aunque haya vencido, y quien lee compara expires_at.
create unique index if not exists uq_empleado_enlaces_uno_activo
  on public.empleado_enlaces (empleado_id)
  where revocado_at is null;

create index if not exists idx_empleado_enlaces_empleado
  on public.empleado_enlaces (empleado_id, created_at desc);
create index if not exists idx_empleado_enlaces_created_by
  on public.empleado_enlaces (created_by);
create index if not exists idx_empleado_enlaces_revocado_por
  on public.empleado_enlaces (revocado_por);

alter table public.empleado_enlaces enable row level security;

drop policy if exists "staff con modulo empleados ve enlaces del portal" on public.empleado_enlaces;
create policy "staff con modulo empleados ve enlaces del portal"
  on public.empleado_enlaces for select
  using (public.puede_actual('modulo:empleados'));

-- Sin policies de INSERT/UPDATE/DELETE y sin privilegios de tabla (defensa en
-- profundidad). El SELECT es por COLUMNA: sin token_hash ni ultimo_ip.
revoke all on table public.empleado_enlaces from public, anon, authenticated;
grant select (id, empleado_id, alcance, expires_at, created_by, created_at,
              revocado_at, revocado_por, usos, ultimo_uso_at)
  on table public.empleado_enlaces to authenticated;


-- ============================================================
-- 2) asignaciones_equipo: confirmación de recepción por el empleado
-- ============================================================

alter table public.asignaciones_equipo
  add column if not exists confirmado_por_empleado_at timestamptz;
alter table public.asignaciones_equipo
  add column if not exists confirmacion_enlace_id uuid
    references public.empleado_enlaces(id) on delete set null;

comment on column public.asignaciones_equipo.confirmado_por_empleado_at is
  'Cuándo el empleado confirmó, desde su enlace del portal, que recibió el equipo (109). No es una firma: el acta firmada (110) sigue siendo el documento. Solo la escribe portal_confirmar_equipo.';
comment on column public.asignaciones_equipo.confirmacion_enlace_id is
  'Enlace del portal con el que se confirmó la recepción (109). Pasa a NULL cuando la purga de retención borra el enlace; la fecha de confirmación se conserva.';

create index if not exists idx_asig_equipo_confirmacion_enlace
  on public.asignaciones_equipo (confirmacion_enlace_id)
  where confirmacion_enlace_id is not null;

-- Guard: la confirmación solo la registra el portal (portal_confirmar_equipo,
-- que corre como project_admin). Un cliente con sesión —ni siquiera el JEFE—
-- puede fabricarla ni borrarla con un INSERT o UPDATE directo: se rechaza con
-- 42501. Nota: el UPDATE de las RPC existentes (devolver, traspasar) no toca
-- estas columnas y no dispara el trigger.
create or replace function public.asignacion_equipo_confirmacion_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.confirmado_por_empleado_at is not null or new.confirmacion_enlace_id is not null then
        raise exception 'La confirmación de recepción solo la registra el empleado desde su enlace del portal.'
          using errcode = '42501';
      end if;
    elsif new.confirmado_por_empleado_at is distinct from old.confirmado_por_empleado_at
       or new.confirmacion_enlace_id is distinct from old.confirmacion_enlace_id then
      raise exception 'La confirmación de recepción solo la registra el empleado desde su enlace del portal.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

alter function public.asignacion_equipo_confirmacion_guard() owner to project_admin;
revoke all on function public.asignacion_equipo_confirmacion_guard() from public, anon, authenticated;

drop trigger if exists trg_asig_equipo_confirmacion_guard on public.asignaciones_equipo;
create trigger trg_asig_equipo_confirmacion_guard
  before insert or update of confirmado_por_empleado_at, confirmacion_enlace_id
  on public.asignaciones_equipo
  for each row execute function public.asignacion_equipo_confirmacion_guard();


-- ============================================================
-- 3) Parámetro: vigencia por defecto de un enlace (días)
-- ============================================================

-- El JEFE lo edita desde config_parametros (entero ≥ 0 lo valida el trigger de la
-- 103); el rango efectivo 1..30 lo impone portal_emitir_enlace.
insert into public.config_parametros (clave, valor, descripcion) values
  ('portal_vigencia_dias', '7'::jsonb,
   'Días de vigencia por defecto del enlace del portal del empleado (109). Rango efectivo: 1 a 30.')
on conflict (clave) do nothing;


-- ============================================================
-- 4) RPC de staff: emitir y revocar el enlace
-- ============================================================

create or replace function public.portal_emitir_enlace(
  p_empleado_id uuid,
  p_alcance text[] default null,
  p_dias integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_validos constant text[] := array['ver_accesos', 'ver_equipos', 'ver_tickets', 'confirmar_equipo'];
  v_emp     public.empleados;
  v_alcance text[];
  v_dias    integer;
  v_u1      text := replace(gen_random_uuid()::text, '-', '');
  v_u2      text := replace(gen_random_uuid()::text, '-', '');
  v_hex     text;
  v_token   text;
  v_id      uuid;
  v_vence   timestamptz;
  v_email   text;
begin
  perform public.exigir_permiso('modulo:empleados');

  select * into v_emp from public.empleados where id = p_empleado_id and deleted_at is null for update;
  if not found then
    raise exception 'El empleado no existe.' using errcode = 'P0002';
  end if;
  if v_emp.estado <> 'Activo' then
    raise exception 'Solo se emite el enlace del portal a un empleado Activo (estado actual: %).', v_emp.estado;
  end if;

  -- Alcance: sin valores desconocidos; confirmar implica ver los equipos.
  if p_alcance is null or cardinality(p_alcance) = 0 then
    v_alcance := c_validos;
  else
    if exists (select 1 from unnest(p_alcance) a where a is null or a <> all (c_validos)) then
      raise exception 'El alcance del enlace solo admite: ver_accesos, ver_equipos, ver_tickets y confirmar_equipo.';
    end if;
    v_alcance := array(select distinct a from unnest(p_alcance) a order by a);
  end if;
  if 'confirmar_equipo' = any (v_alcance) and not ('ver_equipos' = any (v_alcance)) then
    v_alcance := array(select distinct a from unnest(v_alcance || 'ver_equipos'::text) a order by a);
  end if;

  v_dias := coalesce(p_dias, least(greatest(public.parametro_entero('portal_vigencia_dias', 7), 1), 30));
  if v_dias < 1 or v_dias > 30 then
    raise exception 'La vigencia del enlace debe estar entre 1 y 30 días.';
  end if;

  -- 144 bits: 36 caracteres hexadecimales sin los 6 bits fijos de cada uuid v4
  -- (versión y variante) → 18 bytes → 24 caracteres base64url.
  v_hex := substr(v_u1, 1, 12) || substr(v_u1, 14, 3) || substr(v_u1, 18, 15) || substr(v_u2, 1, 6);
  v_token := translate(encode(decode(v_hex, 'hex'), 'base64'), '+/=', '-_');

  -- Un solo enlace sin revocar por empleado: se revoca el anterior (vigente o no).
  perform pg_advisory_xact_lock(hashtextextended('portal.enlace:' || p_empleado_id::text, 0));
  update public.empleado_enlaces
     set revocado_at = now(), revocado_por = auth.uid()
   where empleado_id = p_empleado_id and revocado_at is null;

  v_vence := now() + make_interval(days => v_dias);
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at, created_by)
  values (
    p_empleado_id,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    v_alcance, v_vence, auth.uid()
  )
  returning id into v_id;

  -- Auditoría: ni el token ni su hash.
  select email into v_email from auth.users where id = auth.uid();
  insert into public.accesos_log (user_id, user_email, cuenta_usuario, accion, detalle)
  values (
    auth.uid(), v_email, '(portal)', 'enviar',
    'Enlace del portal emitido a ' || btrim(v_emp.nombres || ' ' || v_emp.apellidos)
      || ' (' || v_dias || ' d; alcance: ' || array_to_string(v_alcance, ', ') || ')'
  );

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'token', v_token,
    'expires_at', v_vence, 'alcance', to_jsonb(v_alcance), 'dias', v_dias
  );
end;
$$;

alter function public.portal_emitir_enlace(uuid, text[], integer) owner to project_admin;
revoke all on function public.portal_emitir_enlace(uuid, text[], integer) from public, anon;
grant execute on function public.portal_emitir_enlace(uuid, text[], integer) to authenticated;

comment on function public.portal_emitir_enlace(uuid, text[], integer) is
  'Emite el enlace del portal de un empleado Activo y devuelve el token UNA sola vez (solo se guarda su hash). Revoca el enlace anterior. Guard modulo:empleados (42501). Audita en accesos_log (enviar) sin el token. 109.';


create or replace function public.portal_revocar_enlace(p_empleado_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n      integer;
  v_nombre text;
  v_email  text;
begin
  perform public.exigir_permiso('modulo:empleados');

  update public.empleado_enlaces
     set revocado_at = now(), revocado_por = auth.uid()
   where empleado_id = p_empleado_id and revocado_at is null;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    select btrim(e.nombres || ' ' || e.apellidos) into v_nombre from public.empleados e where e.id = p_empleado_id;
    select email into v_email from auth.users where id = auth.uid();
    insert into public.accesos_log (user_id, user_email, cuenta_usuario, accion, detalle)
    values (auth.uid(), v_email, '(portal)', 'permiso_revocado',
            'Enlace del portal revocado de ' || coalesce(v_nombre, '(empleado)'));
  end if;
  return v_n > 0;
end;
$$;

alter function public.portal_revocar_enlace(uuid) owner to project_admin;
revoke all on function public.portal_revocar_enlace(uuid) from public, anon;
grant execute on function public.portal_revocar_enlace(uuid) to authenticated;

comment on function public.portal_revocar_enlace(uuid) is
  'Revoca el enlace del portal sin revocar de un empleado. true si había uno. Guard modulo:empleados (42501). Audita en accesos_log (permiso_revocado). 109.';


-- ============================================================
-- 5) RPC del portal (EXECUTE solo project_admin: las llama la edge function)
-- ============================================================

-- Resuelve el token a su enlace VIGENTE. Devuelve una fila con todo NULL
-- (id is null) cuando el token no existe, está mal formado, venció, se revocó
-- o el empleado ya no está Activo: el llamador no puede distinguir el motivo.
create or replace function public.portal_resolver_enlace(p_token text)
returns public.empleado_enlaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enl public.empleado_enlaces;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24}$' then
    return v_enl;
  end if;

  select l.* into v_enl
    from public.empleado_enlaces l
    join public.empleados e on e.id = l.empleado_id
   where l.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and l.revocado_at is null
     and l.expires_at > now()
     and e.deleted_at is null
     and e.estado = 'Activo'
     and e.anonimizado_at is null;
  return v_enl;
end;
$$;

alter function public.portal_resolver_enlace(text) owner to project_admin;
revoke all on function public.portal_resolver_enlace(text) from public, anon, authenticated;
grant execute on function public.portal_resolver_enlace(text) to project_admin;

comment on function public.portal_resolver_enlace(text) is
  'Enlace vigente de un token (hash, no revocado, no vencido, empleado Activo) o una fila vacía: nunca dice por qué falló. Auxiliar de portal_abrir y portal_confirmar_equipo. EXECUTE solo project_admin. 109.';


create or replace function public.portal_abrir(p_token text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enl     public.empleado_enlaces;
  v_emp     public.empleados;
  v_ip      text := nullif(left(btrim(coalesce(p_ip, '')), 64), '');
  v_previo  timestamptz;
  v_res     jsonb;
begin
  v_enl := public.portal_resolver_enlace(p_token);
  if v_enl.id is null then
    return jsonb_build_object('ok', false, 'code', 'no_existe');
  end if;

  select * into v_emp from public.empleados where id = v_enl.empleado_id;

  v_previo := v_enl.ultimo_uso_at;
  update public.empleado_enlaces
     set usos = usos + 1, ultimo_uso_at = now(), ultimo_ip = coalesce(v_ip, ultimo_ip)
   where id = v_enl.id;

  -- Auditoría de la apertura: como mucho una fila por hora y enlace.
  if v_previo is null or v_previo < now() - interval '1 hour' then
    insert into public.accesos_log (cuenta_usuario, accion, detalle, ip)
    values ('(portal)', 'portal_abierto',
            'Portal abierto por ' || btrim(v_emp.nombres || ' ' || v_emp.apellidos), v_ip);
  end if;

  v_res := jsonb_build_object(
    'ok', true,
    'nombre', btrim(v_emp.nombres || ' ' || v_emp.apellidos),
    'vence', v_enl.expires_at,
    'alcance', to_jsonb(v_enl.alcance)
  );

  -- Equipos a su cargo: código, tipo, fecha de entrega, condición y si ya confirmó.
  if 'ver_equipos' = any (v_enl.alcance) then
    v_res := v_res || jsonb_build_object('equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'asignacion_id', a.id,
               'codigo', q.codigo,
               'tipo', t.nombre,
               'entregado', a.fecha_inicio,
               'condicion', a.condicion_entrega,
               'confirmado_at', a.confirmado_por_empleado_at
             ) order by a.fecha_inicio desc, q.codigo)
        from public.asignaciones_equipo a
        join public.equipos q on q.id = a.equipo_id and q.deleted_at is null
        join public.tipos_equipo t on t.id = q.tipo_id
       where a.empleado_id = v_enl.empleado_id and a.fecha_fin is null
    ), '[]'::jsonb));
  end if;

  -- Accesos: SOLO plataforma y usuario. Nunca contraseña, URL ni notas.
  if 'ver_accesos' = any (v_enl.alcance) then
    v_res := v_res || jsonb_build_object('accesos', coalesce((
      select jsonb_agg(jsonb_build_object('plataforma', p.nombre, 'usuario', c.usuario)
                       order by p.nombre, c.usuario)
        from public.asignaciones_cuenta ac
        join public.cuentas c on c.id = ac.cuenta_id and c.deleted_at is null
        join public.plataformas p on p.id = c.plataforma_id
       where ac.empleado_id = v_enl.empleado_id and ac.fecha_fin is null
    ), '[]'::jsonb));
  end if;

  -- Tickets activos del empleado (hasta 20): código, asunto, estado y fecha. Sin el
  -- token de seguimiento del ticket (es otro bearer token).
  if 'ver_tickets' = any (v_enl.alcance) then
    v_res := v_res || jsonb_build_object('tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', x.codigo, 'titulo', x.titulo, 'estado', x.estado, 'creado', x.created_at
             ) order by x.created_at desc)
        from (
          select tk.codigo, tk.titulo, tk.estado, tk.created_at
            from public.tickets tk
           where tk.empleado_id = v_enl.empleado_id
             and tk.estado not in ('resuelto', 'cerrado')
           order by tk.created_at desc
           limit 20
        ) x
    ), '[]'::jsonb));
  end if;

  return v_res;
end;
$$;

alter function public.portal_abrir(text, text) owner to project_admin;
revoke all on function public.portal_abrir(text, text) from public, anon, authenticated;
grant execute on function public.portal_abrir(text, text) to project_admin;

comment on function public.portal_abrir(text, text) is
  'Datos del portal de un empleado a partir de su token: nombre, equipos (código, tipo, fecha, condición), accesos (plataforma y usuario; NUNCA contraseña, URL ni notas) y tickets activos, según el alcance. Cuenta el uso y audita (portal_abierto, 1 por hora). Token inválido, vencido o revocado: {ok:false, code:no_existe}. EXECUTE solo project_admin (edge function portal). 109.';


create or replace function public.portal_confirmar_equipo(
  p_token text,
  p_asignacion_id uuid,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enl public.empleado_enlaces;
  v_asig public.asignaciones_equipo;
  v_ahora timestamptz := now();
begin
  v_enl := public.portal_resolver_enlace(p_token);
  if v_enl.id is null then
    return jsonb_build_object('ok', false, 'code', 'no_existe');
  end if;
  if not ('confirmar_equipo' = any (v_enl.alcance)) then
    return jsonb_build_object('ok', false, 'code', 'sin_alcance');
  end if;

  -- Solo una asignación VIGENTE de ESTE empleado. Una ajena, una cerrada o una
  -- inexistente dan lo mismo: no_encontrada.
  if p_asignacion_id is null then
    return jsonb_build_object('ok', false, 'code', 'no_encontrada');
  end if;
  select * into v_asig
    from public.asignaciones_equipo
   where id = p_asignacion_id and empleado_id = v_enl.empleado_id and fecha_fin is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_encontrada');
  end if;

  -- Idempotente: confirmar dos veces no cambia la fecha ni repite el evento.
  if v_asig.confirmado_por_empleado_at is not null then
    return jsonb_build_object('ok', true, 'ya_confirmada', true, 'confirmado_at', v_asig.confirmado_por_empleado_at);
  end if;

  update public.asignaciones_equipo
     set confirmado_por_empleado_at = v_ahora, confirmacion_enlace_id = v_enl.id
   where id = v_asig.id;

  update public.empleado_enlaces
     set ultimo_uso_at = v_ahora, ultimo_ip = coalesce(nullif(left(btrim(coalesce(p_ip, '')), 64), ''), ultimo_ip)
   where id = v_enl.id;

  -- Hoja de vida del equipo (sin el nombre de la persona: la anonimización no
  -- tendría que reescribirlo). Actor NULL: lo hizo el empleado, sin sesión.
  insert into public.eventos_equipo (equipo_id, evento, detalle)
  values (v_asig.equipo_id, 'recepcion_confirmada', 'El empleado confirmó la recepción desde su enlace del portal');

  return jsonb_build_object('ok', true, 'ya_confirmada', false, 'confirmado_at', v_ahora);
end;
$$;

alter function public.portal_confirmar_equipo(text, uuid, text) owner to project_admin;
revoke all on function public.portal_confirmar_equipo(text, uuid, text) from public, anon, authenticated;
grant execute on function public.portal_confirmar_equipo(text, uuid, text) to project_admin;

comment on function public.portal_confirmar_equipo(text, uuid, text) is
  'Confirma, desde el enlace del portal, la recepción de un equipo vigente de ESE empleado (idempotente). Escribe confirmado_por_empleado_at, el enlace usado y el evento recepcion_confirmada. Alcance confirmar_equipo. EXECUTE solo project_admin (edge function portal). 109.';

-- PENDIENTE de V2: portal_confirmar_cierre y el alcance confirmar_ticket delegan en
-- confirmar_cierre_usuario (093 de la rama V2), que aún no existe en producción.


-- ============================================================
-- 6) Pasar a no-Activo revoca los enlaces del empleado
-- Reactivarlo NO revive un enlace viejo: hay que emitir uno nuevo.
-- ============================================================

create or replace function public.empleado_revoca_enlaces_portal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado and new.estado <> 'Activo' then
    update public.empleado_enlaces
       set revocado_at = now(), revocado_por = auth.uid()
     where empleado_id = new.id and revocado_at is null;
  end if;
  return new;
end;
$$;

alter function public.empleado_revoca_enlaces_portal() owner to project_admin;
revoke all on function public.empleado_revoca_enlaces_portal() from public, anon, authenticated;

drop trigger if exists trg_empleado_revoca_enlaces_portal on public.empleados;
create trigger trg_empleado_revoca_enlaces_portal
  after update of estado on public.empleados
  for each row execute function public.empleado_revoca_enlaces_portal();


-- ============================================================
-- 7) Retención (112): los enlaces muertos se purgan
-- Se amplía el CHECK de config_retencion, se siembra la regla y se reemplaza
-- purgar_datos_temporales() con la versión de la 112 MÁS la rama nueva. ⚠️ El
-- cuerpo es una copia de la 112: cualquier cambio posterior de la purga debe
-- partir de ESTA versión (y no de la de la 112).
-- ============================================================

alter table public.config_retencion drop constraint if exists config_retencion_tabla_check;
alter table public.config_retencion add constraint config_retencion_tabla_check check (tabla in (
  'intentos_publicos', 'ticket_busqueda_intentos', 'ticket_creacion_intentos',
  'encuesta_respuesta_intentos', 'contexto_transaccion', 'entregas',
  'notificaciones', 'accesos_log', 'empleado_enlaces'
));

-- NO se pisan los valores ya editados por el JEFE al reaplicar.
insert into public.config_retencion (tabla, dias, accion, columna, descripcion) values
  ('empleado_enlaces', 30, 'borrar', null,
   'Enlaces del portal del empleado vencidos o revocados hace más de N días (guardan hash, alcance y la IP del último uso). La confirmación de recepción de los equipos se conserva.')
on conflict (tabla) do nothing;

create or replace function public.purgar_datos_temporales()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  v_n       bigint;
  v_total   bigint := 0;
  v_errores integer := 0;
  v_res     jsonb := '{}'::jsonb;
  v_corte   timestamptz;
  v_uid     uuid := auth.uid();
  v_email   text;
  v_salida  jsonb;
begin
  -- Dos purgas simultáneas (cron + manual) no se pisan.
  if not pg_try_advisory_xact_lock(hashtextextended('purgar_datos_temporales', 0)) then
    return jsonb_build_object('omitida', true, 'motivo', 'otra purga está en curso');
  end if;

  for r in
    select c.tabla, c.dias, c.accion
      from public.config_retencion c
     where c.activo
     order by c.tabla
  loop
    v_corte := now() - make_interval(days => r.dias);
    v_n := 0;

    begin
      if to_regclass('public.' || r.tabla) is null then
        v_res := v_res || jsonb_build_object(r.tabla, 'tabla_inexistente');
        continue;
      end if;

      if r.tabla = 'intentos_publicos' then
        delete from public.intentos_publicos where created_at < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'ticket_busqueda_intentos' then
        delete from public.ticket_busqueda_intentos where created_at < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'ticket_creacion_intentos' then
        delete from public.ticket_creacion_intentos where created_at < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'encuesta_respuesta_intentos' then
        delete from public.encuesta_respuesta_intentos where created_at < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'contexto_transaccion' then
        delete from public.contexto_transaccion where creado_en < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'entregas' then
        -- 30 días después de abierta (viewed_at) o, si nunca se abrió, de vencida.
        update public.entregas
           set payload = ''
         where payload <> ''
           and coalesce(viewed_at, expires_at) < v_corte;
        get diagnostics v_n = row_count;

      elsif r.tabla = 'notificaciones' then
        -- Solo leídas. Personal: la leyó su destinatario. General (destinatario
        -- null): la leyó todo el staff activo que ya existía al crearse.
        delete from public.notificaciones n
         where n.creado_en < v_corte
           and (
             case
               when n.destinatario_id is not null then
                 exists (
                   select 1 from public.notificaciones_lecturas l
                    where l.notificacion_id = n.id and l.usuario_id = n.destinatario_id
                 )
               else
                 not exists (
                   select 1 from public.staff s
                    where s.activo
                      and s.created_at <= n.creado_en
                      and not exists (
                        select 1 from public.notificaciones_lecturas l
                         where l.notificacion_id = n.id and l.usuario_id = s.user_id
                      )
                 )
             end
           );
        get diagnostics v_n = row_count;

      elsif r.tabla = 'accesos_log' then
        -- UPDATE acotado a ip y user_agent; las filas no se borran.
        update public.accesos_log
           set ip = null, user_agent = null
         where created_at < v_corte
           and (ip is not null or user_agent is not null);
        get diagnostics v_n = row_count;

      elsif r.tabla = 'empleado_enlaces' then
        -- 109: enlaces del portal que ya no sirven (vencidos o revocados) hace más
        -- de N días. asignaciones_equipo.confirmacion_enlace_id pasa a NULL (ON
        -- DELETE SET NULL); la fecha de confirmación se conserva.
        delete from public.empleado_enlaces
         where least(expires_at, coalesce(revocado_at, expires_at)) < v_corte;
        get diagnostics v_n = row_count;

      else
        v_res := v_res || jsonb_build_object(r.tabla, 'regla_sin_implementacion');
        continue;
      end if;

      v_res := v_res || jsonb_build_object(r.tabla, v_n);
      v_total := v_total + v_n;
    exception when others then
      v_errores := v_errores + 1;
      v_res := v_res || jsonb_build_object(r.tabla, 'error ' || sqlstate);
      raise warning 'purgar_datos_temporales: la regla % falló (SQLSTATE %).', r.tabla, sqlstate;
    end;
  end loop;

  v_salida := jsonb_build_object(
    'ejecutada_en', now(), 'total', v_total, 'errores', v_errores, 'tablas', v_res);

  if v_uid is not null then
    select email into v_email from auth.users where id = v_uid;
  end if;

  -- Auditoría sin datos personales: solo los conteos. Fail-closed.
  insert into public.accesos_log (user_id, user_email, cuenta_usuario, accion, detalle)
  values (v_uid, v_email, '(sistema)', 'purga_ejecutada', v_salida::text);

  return v_salida;
end;
$$;

alter function public.purgar_datos_temporales() owner to project_admin;
revoke all on function public.purgar_datos_temporales() from public, anon, authenticated;
grant execute on function public.purgar_datos_temporales() to project_admin;

comment on function public.purgar_datos_temporales() is
  'Aplica las reglas activas de config_retencion y registra purga_ejecutada en accesos_log (solo conteos). EXECUTE solo project_admin: lo invocan el cron/schedule y purgar_datos_temporales_manual(). 112; la 109 agrega empleado_enlaces.';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tabla nueva, RLS activa y una policy (esperado: relrowsecurity = true, policies = 1):
--    select c.relname, c.relrowsecurity, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'empleado_enlaces') as policies from pg_class c where c.oid = 'public.empleado_enlaces'::regclass;
--
-- 2) Columnas nuevas de asignaciones_equipo (esperado: 2 filas):
--    select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'asignaciones_equipo' and column_name in ('confirmado_por_empleado_at', 'confirmacion_enlace_id') order by 1;
--
-- 3) Funciones, dueño project_admin, SECURITY DEFINER (esperado: 6 filas; el guard y el trigger de empleados son los otros dos del paso 4):
--    select proname, pg_get_userbyid(proowner) as dueno, prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname in ('portal_emitir_enlace','portal_revocar_enlace','portal_resolver_enlace','portal_abrir','portal_confirmar_equipo','purgar_datos_temporales') order by 1;
--
-- 4) Trigger y guard (esperado: 2 filas):
--    select tgname, tgrelid::regclass::text from pg_trigger where tgname in ('trg_asig_equipo_confirmacion_guard', 'trg_empleado_revoca_enlaces_portal') order by 1;
--
-- 5) EXECUTE (esperado: portal_abrir, portal_confirmar_equipo y portal_resolver_enlace solo project_admin; las dos de staff, authenticated=true y anon=false):
--    select p, has_function_privilege('anon', p, 'execute') as anon, has_function_privilege('authenticated', p, 'execute') as authenticated, has_function_privilege('project_admin', p, 'execute') as project_admin from unnest(array['public.portal_emitir_enlace(uuid,text[],integer)','public.portal_revocar_enlace(uuid)','public.portal_resolver_enlace(text)','public.portal_abrir(text,text)','public.portal_confirmar_equipo(text,uuid,text)']) as p;
--
-- 6) El rol authenticated NO lee el hash ni la IP (esperado: tok = false, ip = false, id = true):
--    select has_column_privilege('authenticated', 'public.empleado_enlaces', 'token_hash', 'select') as tok, has_column_privilege('authenticated', 'public.empleado_enlaces', 'ultimo_ip', 'select') as ip, has_column_privilege('authenticated', 'public.empleado_enlaces', 'expires_at', 'select') as id;
--    select has_table_privilege('authenticated', 'public.empleado_enlaces', 'insert') as ins, has_table_privilege('authenticated', 'public.empleado_enlaces', 'update') as upd, has_table_privilege('authenticated', 'public.empleado_enlaces', 'delete') as del;   -- las 3 en false
--
-- 7) Parámetro y regla de retención (esperado: 1 fila cada una; 9 reglas en total):
--    select clave, valor from public.config_parametros where clave = 'portal_vigencia_dias';
--    select tabla, dias, accion, activo from public.config_retencion order by tabla;
--
-- 8) Un token inexistente da la respuesta única, SIN crear nada (solo lectura sobre datos; esperado: {"ok": false, "code": "no_existe"}):
--    select public.portal_abrir('AAAAAAAAAAAAAAAAAAAAAAAA', null);
--
-- 9) NO emitir un enlace de prueba en producción: dejaría un enlace y una fila de
--    accesos_log reales. La emisión, la apertura y la confirmación se prueban con
--    tests/db/triggers.test.sql (bloques 109a a 109c, con rollback) y en una branch.
--
-- 10) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--     select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '109';
-- ============================================================
-- FIN DE MIGRACIÓN 109
-- ============================================================
