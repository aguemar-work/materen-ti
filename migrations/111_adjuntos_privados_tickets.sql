-- ============================================================
-- MIGRACIÓN 111 — Tickets públicos: creación atómica (crear_ticket_publico),
-- vínculo de la captura adjunta y preparación del bucket PRIVADO
-- `tickets-adjuntos`
-- Depende de: 016 (tickets, ticket_eventos, siguiente_codigo_ticket),
--   035 (tickets.tipo, subcategorias_ticket.tipo_sugerido), 099 (puede),
--   104 (intentos_publicos)
--
-- Plan de mejora Ciclo 21, §4 "110 — Adjuntos privados" (el plan numeraba
-- 110 pero esa cifra ya es la de las actas firmadas; esta es la 111) y §5
-- "`crear` público" (docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md, H2-7).
--
-- ⚠️ NO APLICADA. Escrita y probada solo en local (npm run test:sql-local).
--
-- ── HALLAZGOS QUE CIERRA (anexo A, §1.2, §5, §7 y §8) ──────────────────────
--   1. FAIL-OPEN de `ticket_eventos`: la edge function `tickets` creaba el
--      ticket y DESPUÉS escribía el evento `creado` con un insert cuyo error
--      se ignoraba (functions/tickets.ts, helper `log`). Un ticket sin hoja de
--      vida es un hueco de auditoría que nadie nota. Además el rate-limit de
--      creación (contar + registrar el intento) y la reserva del código
--      TCK-XXXX eran cuatro llamadas sueltas. Ahora todo ocurre en UNA
--      transacción dentro de `crear_ticket_publico`: o quedan el ticket, su
--      evento y el intento registrado, o no queda nada (el código de la
--      secuencia sí se consume: nunca se revierte, ver AGENTS.md).
--   2. `equipoId` / `cuentaId` / `licenciaId` del formulario público eran ids
--      sin validar que la function filtraba con un `staff ? … : null`. La
--      regla vive ahora TAMBIÉN en la base: sin staff activo se ignoran, con
--      independencia de lo que mande quien llame.
--   3. El `contacto` no tenía tope de largo (anexo A §5): ahora 100 caracteres.
--   4. `crear` público se limita también por DNI (5 cada 10 min, ámbito
--      `tickets.crear.dni`) además de por IP (8 cada 10 min, ámbito
--      `tickets.crear`): frena el sondeo de DNIs por el campo `vinculado`.
--      Los dos contadores usan `intentos_publicos` (104); `ticket_creacion_intentos`
--      (037) deja de escribirse (su retiro es una migración posterior, cuando
--      la function nueva esté en producción: ver nota de la 104).
--   5. La captura adjunta vivía en una key `<token>/captura.<ext>` de un bucket
--      PÚBLICO: el token de seguimiento (que da acceso al ticket) quedaba en la
--      URL del objeto, y cualquiera con la URL veía una captura con datos
--      personales. La key nueva es `tickets/<ticket.id>/captura.<ext>` y el
--      acceso es solo con URL firmada de corta vida (functions/tickets.ts:
--      `seguimiento` para el dueño del enlace, `adjuntoStaff` para el staff).
--
-- ── QUÉ HACE ESTA MIGRACIÓN ────────────────────────────────────────────────
--   FUNCIÓN public.crear_ticket_publico(p_datos jsonb) returns jsonb
--     SECURITY DEFINER. EXECUTE SOLO project_admin: la invoca la edge function
--     `tickets` con el cliente admin, después de verificar la sesión (opcional)
--     y de decodificar el adjunto. Nada llega aquí desde un navegador.
--     p_datos (todas las claves son texto; los uuid se validan por forma):
--       titulo, descripcion, categoria_id, subcategoria_id?, contacto?,
--       token (24 caracteres base64url, lo genera la function),
--       ip (clave del rate-limit público),
--       origen? ('staff_interno' solo vale con staff), tipo? ('incidente' |
--       'solicitud', solo staff),
--       staff_id? (uuid del staff autenticado; se vuelve a verificar con
--       puede(staff_id, 'staff:activo') y, si no es staff activo, se rechaza con
--       42501 'No autorizado'), empleado_id_manual?, equipo_id?, cuenta_id?,
--       licencia_id? (estos cuatro, SOLO con staff_id).
--     Devuelve jsonb:
--       {"ok": true, "id", "codigo", "token", "vinculado"}                en éxito
--       {"ok": false, "code": "datos_requeridos" | "texto_muy_largo" |
--        "categoria_invalida" | "empleado_invalido" | "vinculo_invalido" |
--        "demasiados_intentos"}                                           si no procede
--     Un rechazo de negocio NO es una excepción: no revierte nada y NO registra
--     el intento (un intento bloqueado no suma al contador, igual que
--     excedeLimite en las edge functions). Una entrada imposible (p_datos que
--     no es un objeto, token con forma inválida, staff_id mal formado) sí
--     lanza 22023: es un bug del llamador.
--     La vinculación con el empleado (coincidencia EXACTA por DNI, una sola
--     fila, no borrada) y la clasificación incidente/solicitud (heredada del
--     tipo_sugerido de la subcategoría) salen de la base, no del cliente.
--
--   FUNCIÓN public.adjuntar_captura_ticket(p_ticket_id uuid, p_key text)
--     returns boolean. SECURITY DEFINER, EXECUTE SOLO project_admin. La llama
--     la function DESPUÉS de subir el objeto (el id del ticket tiene que
--     existir antes para formar la key). Solo acepta
--     `tickets/<p_ticket_id>/captura.(jpg|png|webp|gif)`, solo en un ticket sin
--     adjunto todavía y deja adjunto_url en NULL (la URL pública de un bucket
--     privado no sirve; el acceso es siempre por URL firmada). Devuelve false
--     si no aplicó (key inválida, ticket inexistente o ya con adjunto).
--
-- ── ⚠️ PASO MANUAL QUE EL SQL NO PUEDE HACER: volver PRIVADO el bucket ─────
--   `storage.buckets` pertenece a `postgres` y `project_admin` NO tiene UPDATE
--   sobre ella (verificado en producción, 2026-10-02: has_table_privilege =
--   false), y el CLI no tiene un comando para cambiar la visibilidad de un
--   bucket existente (solo `create-bucket --private`). Por eso esta migración
--   NO lo intenta, y NO falla. Es un paso manual, igual que el bucket
--   `actas-firmadas` de la 110:
--     Panel de InsForge → Storage → `tickets-adjuntos` → apagar "Public".
--   Verificar:  npx @insforge/cli storage buckets   (o el select de la sección
--   de Verificación) → tickets-adjuntos con public = false.
--
--   ORDEN DE SALIDA (cada paso deja el sistema funcionando):
--     1. Aplicar esta migración (solo crea funciones; no toca datos ni el
--        bucket). Verificar.
--     2. Desplegar la edge function `tickets` (usa las dos RPC; antes del paso
--        1 fallaría con error_creando) y `equipos-fotos` (limpieza EXIF).
--     3. Desplegar el frontend (abre la captura por URL firmada).
--     4. node scripts/migrar-adjuntos.mjs            (dry-run, no cambia nada)
--        node scripts/migrar-adjuntos.mjs --ejecutar (mueve <token>/… a
--        tickets/<id>/…, actualiza tickets.adjunto_key y borra el objeto viejo)
--     5. Recién entonces volver PRIVADO el bucket (paso manual de arriba).
--        Hacerlo antes del paso 3 deja sin captura a las pantallas viejas;
--        hacerlo antes del paso 4 deja el enlace público de los objetos aún
--        sin mover ya muerto (la nueva pantalla igual los abre firmados).
--   Mientras el bucket siga público, createSignedUrl devuelve la URL pública:
--   todo funciona igual, solo que sin la protección.
--
--   `equipos-fotos` sigue PÚBLICO a propósito (fotos de hardware, key uuid):
--   no contiene datos personales (decisión del plan, §4 y tabla de decisiones).
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano; si
-- `db import` crashea, verificar con el bloque de abajo antes de reintentar.
-- Todo es idempotente (create or replace + revoke/grant explícitos).
-- Rollback: migrations/rollback/111_rollback.sql (no toca el bucket ni los
-- objetos). Antes de revertir, redesplegar la versión anterior de `tickets`.
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 016/035, 099 y 104 aplicadas
-- ============================================================

do $$
begin
  if to_regprocedure('public.puede(uuid,text)') is null then
    raise exception 'La migración 111 requiere la 099 (puede). Aplíquela primero.';
  end if;
  if to_regclass('public.intentos_publicos') is null then
    raise exception 'La migración 111 requiere la 104 (intentos_publicos). Aplíquela primero.';
  end if;
  if to_regprocedure('public.siguiente_codigo_ticket()') is null then
    raise exception 'La migración 111 requiere la 016 (siguiente_codigo_ticket).';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tickets' and column_name = 'tipo'
  ) then
    raise exception 'La migración 111 requiere la 035 (tickets.tipo).';
  end if;
end $$;


-- ============================================================
-- 1) crear_ticket_publico: ticket + evento + intento en una transacción
-- ============================================================

create or replace function public.crear_ticket_publico(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_titulo_max     constant integer := 200;
  c_desc_max       constant integer := 5000;
  c_contacto_max   constant integer := 100;
  c_max_ip         constant integer := 8;   -- creaciones públicas por IP
  c_max_dni        constant integer := 5;   -- creaciones públicas por DNI
  c_ventana        constant interval := interval '10 minutes';
  c_uuid           constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  v_titulo         text;
  v_descripcion    text;
  v_categoria      text;
  v_sub_txt        text;
  v_sub            uuid;
  v_contacto       text;
  v_token          text;
  v_ip             text;
  v_staff_txt      text;
  v_staff          uuid;
  v_staff_email    text;
  v_origen         text := 'empleado';
  v_empleado       uuid;
  v_empleado_txt   text;
  v_vinculado      boolean := true;
  v_dni            text;
  v_tipo           text;
  v_equipo         uuid;
  v_cuenta         uuid;
  v_licencia       uuid;
  v_n              integer;
  v_codigo         text;
  v_id             uuid;
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'p_datos debe ser un objeto jsonb.' using errcode = '22023';
  end if;

  v_titulo      := btrim(coalesce(p_datos ->> 'titulo', ''));
  v_descripcion := btrim(coalesce(p_datos ->> 'descripcion', ''));
  v_categoria   := btrim(coalesce(p_datos ->> 'categoria_id', ''));
  v_sub_txt     := nullif(btrim(coalesce(p_datos ->> 'subcategoria_id', '')), '');
  v_contacto    := nullif(btrim(coalesce(p_datos ->> 'contacto', '')), '');
  v_token       := coalesce(p_datos ->> 'token', '');
  v_ip          := coalesce(nullif(btrim(coalesce(p_datos ->> 'ip', '')), ''), 'desconocida');
  v_staff_txt   := nullif(btrim(coalesce(p_datos ->> 'staff_id', '')), '');

  -- Entradas imposibles: son un bug del llamador, no un rechazo de negocio.
  if v_token !~ '^[A-Za-z0-9_-]{24}$' then
    raise exception 'El token del ticket debe tener 24 caracteres base64url.' using errcode = '22023';
  end if;
  if v_staff_txt is not null and lower(v_staff_txt) !~ c_uuid then
    raise exception 'staff_id no es un uuid.' using errcode = '22023';
  end if;

  -- Staff: se vuelve a verificar aquí con la regla única (099), sin confiar en
  -- que quien llama ya lo hizo. Un staff_id que no sea staff ACTIVO es un
  -- error de autorización, no un ticket público disfrazado.
  if v_staff_txt is not null then
    v_staff := v_staff_txt::uuid;
    if not public.puede(v_staff, 'staff:activo') then
      raise exception 'No autorizado' using errcode = '42501';
    end if;
    select u.email into v_staff_email from auth.users u where u.id = v_staff;
    if p_datos ->> 'origen' = 'staff_interno' then
      v_origen := 'staff_interno';
    end if;
  end if;

  -- Rechazos de negocio (no revierten nada ni cuentan como intento).
  if v_titulo = '' or v_descripcion = '' or v_categoria = '' then
    return jsonb_build_object('ok', false, 'code', 'datos_requeridos');
  end if;
  if length(v_titulo) > c_titulo_max or length(v_descripcion) > c_desc_max
     or length(coalesce(v_contacto, '')) > c_contacto_max then
    return jsonb_build_object('ok', false, 'code', 'texto_muy_largo');
  end if;

  -- Categoría (y subcategoría, que debe pertenecer a ella) vigentes. El tipo
  -- incidente/solicitud sale del tipo_sugerido de la subcategoría, nunca del
  -- cliente; NULL si la subcategoría es ambigua a propósito (035).
  if not exists (select 1 from public.categorias_ticket c where c.id = v_categoria and c.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'categoria_invalida');
  end if;
  if v_sub_txt is not null then
    if lower(v_sub_txt) !~ c_uuid then
      return jsonb_build_object('ok', false, 'code', 'categoria_invalida');
    end if;
    v_sub := v_sub_txt::uuid;
    select s.tipo_sugerido into v_tipo
      from public.subcategorias_ticket s
     where s.id = v_sub and s.categoria_id = v_categoria and s.deleted_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'categoria_invalida');
    end if;
  end if;

  if v_staff is not null then
    -- El staff puede corregir la clasificación sugerida.
    if p_datos ->> 'tipo' in ('incidente', 'solicitud') then
      v_tipo := p_datos ->> 'tipo';
    end if;

    -- Vínculos a activos: SOLO con staff. Sin staff_id se ignoran, aunque
    -- vengan en p_datos.
    begin
      v_equipo   := nullif(btrim(coalesce(p_datos ->> 'equipo_id', '')), '')::uuid;
      v_cuenta   := nullif(btrim(coalesce(p_datos ->> 'cuenta_id', '')), '')::uuid;
      v_licencia := nullif(btrim(coalesce(p_datos ->> 'licencia_id', '')), '')::uuid;
    exception when invalid_text_representation then
      return jsonb_build_object('ok', false, 'code', 'vinculo_invalido');
    end;
    if (v_equipo is not null and not exists (select 1 from public.equipos x where x.id = v_equipo and x.deleted_at is null))
       or (v_cuenta is not null and not exists (select 1 from public.cuentas x where x.id = v_cuenta and x.deleted_at is null))
       or (v_licencia is not null and not exists (select 1 from public.licencias x where x.id = v_licencia and x.deleted_at is null)) then
      return jsonb_build_object('ok', false, 'code', 'vinculo_invalido');
    end if;

    -- Empleado elegido a mano por el staff (llamada o visita en persona).
    v_empleado_txt := nullif(btrim(coalesce(p_datos ->> 'empleado_id_manual', '')), '');
    if v_empleado_txt is not null then
      if lower(v_empleado_txt) !~ c_uuid then
        return jsonb_build_object('ok', false, 'code', 'empleado_invalido');
      end if;
      v_empleado := v_empleado_txt::uuid;
      if not exists (select 1 from public.empleados e where e.id = v_empleado and e.deleted_at is null) then
        return jsonb_build_object('ok', false, 'code', 'empleado_invalido');
      end if;
    end if;
  end if;

  -- Identificación SOLO por DNI (un correo puede repetirse; el DNI no). Sin
  -- coincidencia única el ticket entra sin vincular, para revisión manual.
  if v_empleado is null and v_origen = 'empleado' then
    if v_contacto is not null then
      v_dni := regexp_replace(v_contacto, '\D', '', 'g');
      if v_dni <> '' then
        select count(*) into v_n from public.empleados e where e.dni = v_dni and e.deleted_at is null;
        if v_n = 1 then
          select e.id into v_empleado from public.empleados e where e.dni = v_dni and e.deleted_at is null;
        else
          v_vinculado := false;
        end if;
      else
        v_vinculado := false;
      end if;
    else
      v_vinculado := false;
    end if;
  end if;

  -- Rate-limit de la creación PÚBLICA (el staff ya pasó por su login). Los
  -- candados de asesoría serializan a quienes comparten IP o DNI: sin ellos,
  -- dos peticiones simultáneas contarían ambas "7" y las dos pasarían. Primero
  -- la IP y luego el DNI, siempre en ese orden (evita interbloqueos).
  if v_staff is null then
    perform pg_advisory_xact_lock(hashtextextended('tickets.crear:' || v_ip, 0));
    select count(*) into v_n from public.intentos_publicos
     where ambito = 'tickets.crear' and clave = v_ip and created_at >= now() - c_ventana;
    if v_n >= c_max_ip then
      return jsonb_build_object('ok', false, 'code', 'demasiados_intentos');
    end if;

    if v_dni is not null and v_dni <> '' then
      perform pg_advisory_xact_lock(hashtextextended('tickets.crear.dni:' || v_dni, 0));
      select count(*) into v_n from public.intentos_publicos
       where ambito = 'tickets.crear.dni' and clave = v_dni and created_at >= now() - c_ventana;
      if v_n >= c_max_dni then
        return jsonb_build_object('ok', false, 'code', 'demasiados_intentos');
      end if;
      insert into public.intentos_publicos (ambito, clave) values ('tickets.crear.dni', v_dni);
    end if;

    insert into public.intentos_publicos (ambito, clave) values ('tickets.crear', v_ip);
  end if;

  v_codigo := public.siguiente_codigo_ticket();

  insert into public.tickets (
    codigo, token, titulo, descripcion, origen, empleado_id, vinculado,
    contacto_ingresado, creado_por, categoria_id, subcategoria_id, tipo,
    equipo_id, cuenta_id, licencia_id
  ) values (
    v_codigo, v_token, v_titulo, v_descripcion, v_origen, v_empleado, v_vinculado,
    v_contacto, v_staff, v_categoria, v_sub, v_tipo,
    v_equipo, v_cuenta, v_licencia
  )
  returning id into v_id;

  -- La hoja de vida nace con el ticket; si este insert falla, todo se revierte.
  insert into public.ticket_eventos (ticket_id, evento, detalle, user_id, user_email)
  values (
    v_id, 'creado',
    'Origen: ' || v_origen || case when v_vinculado then '' else ' (sin vincular)' end,
    v_staff, v_staff_email
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo, 'token', v_token, 'vinculado', v_vinculado);
end;
$$;

alter function public.crear_ticket_publico(jsonb) owner to project_admin;
revoke all on function public.crear_ticket_publico(jsonb) from public, anon, authenticated;
grant execute on function public.crear_ticket_publico(jsonb) to project_admin;

comment on function public.crear_ticket_publico(jsonb) is
  'Crea un ticket (público o de staff) con su evento creado y el registro del intento en UNA transacción (111). Sin staff_id se ignoran equipo/cuenta/licencia y se aplica el rate-limit (8 por IP y 5 por DNI cada 10 min, sobre intentos_publicos). EXECUTE solo project_admin (edge function tickets).';


-- ============================================================
-- 2) adjuntar_captura_ticket: enlaza el objeto subido con su ticket
-- ============================================================

create or replace function public.adjuntar_captura_ticket(p_ticket_id uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if p_ticket_id is null or p_key is null
     or p_key !~ ('^tickets/' || p_ticket_id::text || '/captura\.(jpg|png|webp|gif)$') then
    return false;
  end if;

  -- Solo el primer adjunto: no se pisa uno existente (ni se reapunta a un
  -- objeto de otro ticket). adjunto_url queda NULL: el bucket es privado y la
  -- única forma de abrir la captura es una URL firmada.
  update public.tickets
     set adjunto_key = p_key,
         adjunto_url = null
   where id = p_ticket_id
     and adjunto_key is null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

alter function public.adjuntar_captura_ticket(uuid, text) owner to project_admin;
revoke all on function public.adjuntar_captura_ticket(uuid, text) from public, anon, authenticated;
grant execute on function public.adjuntar_captura_ticket(uuid, text) to project_admin;

comment on function public.adjuntar_captura_ticket(uuid, text) is
  'Enlaza la captura ya subida (key tickets/<id>/captura.<ext>) con un ticket sin adjunto (111). adjunto_url queda NULL: el acceso es por URL firmada. EXECUTE solo project_admin (edge function tickets).';


-- ============================================================
-- 3) Aviso (no falla): el bucket sigue público hasta el paso manual
-- ============================================================

do $$
declare
  v_publico boolean;
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  select b.public into v_publico from storage.buckets b where b.name = 'tickets-adjuntos';
  if v_publico is true then
    raise notice 'El bucket tickets-adjuntos sigue PUBLICO: volverlo privado es un paso manual (panel de InsForge, Storage), ver la cabecera de la migracion 111.';
  end if;
exception when others then
  raise notice 'No se pudo leer storage.buckets (%): verifique a mano la visibilidad de tickets-adjuntos.', sqlerrm;
end $$;


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Las dos funciones, SECURITY DEFINER, dueño project_admin
--    (esperado: 2 filas, secdef=true):
--    select p.oid::regprocedure::text as funcion, p.prosecdef as secdef, pg_get_userbyid(p.proowner) as dueno from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('crear_ticket_publico', 'adjuntar_captura_ticket') order by 1;
--
-- 2) EXECUTE solo para project_admin (esperado: authenticated=false, anon=false, project_admin=true, en ambas):
--    select has_function_privilege('authenticated', 'public.crear_ticket_publico(jsonb)', 'execute') as auth_crear, has_function_privilege('anon', 'public.crear_ticket_publico(jsonb)', 'execute') as anon_crear, has_function_privilege('project_admin', 'public.crear_ticket_publico(jsonb)', 'execute') as admin_crear, has_function_privilege('authenticated', 'public.adjuntar_captura_ticket(uuid,text)', 'execute') as auth_adj, has_function_privilege('anon', 'public.adjuntar_captura_ticket(uuid,text)', 'execute') as anon_adj, has_function_privilege('project_admin', 'public.adjuntar_captura_ticket(uuid,text)', 'execute') as admin_adj;
--
-- 3) Una captura de ejemplo: la key mal formada se rechaza sin tocar nada
--    (esperado: false; es de solo lectura sobre datos, no modifica ninguna fila):
--    select public.adjuntar_captura_ticket('00000000-0000-0000-0000-000000000000'::uuid, 'otro/captura.jpg') as rechazada;
--
-- 4) NO crear un ticket de prueba en producción: los códigos TCK-XXXX nunca se
--    revierten. La creación se prueba con tests/db/triggers.test.sql (bloques
--    111a/111b, con rollback) y en un branch de InsForge.
--
-- 5) Bucket (PASO MANUAL, ver la cabecera): public debe quedar en false.
--    select name, public from storage.buckets where name = 'tickets-adjuntos';
--
-- 6) Tracking: scripts/deploy.mjs registra la fila solo; si se aplicó a mano
--    con `db import`, registrarla y verificar:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '111';
-- ============================================================
-- FIN DE MIGRACIÓN 111
-- ============================================================
