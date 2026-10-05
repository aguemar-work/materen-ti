-- ============================================================
-- ROLLBACK de la MIGRACIÓN 116 (catálogo de tickets v2)
--
-- ESQUEMA (se revierte entero):
--   · drop de la vista v_tickets_por_reclasificar y de reclasificar_ticket /
--     reclasificar_ticket_nucleo;
--   · crear_ticket_publico vuelve a la versión de la 111 (sin prioridad
--     sugerida: todo ticket nuevo entra con la prioridad por defecto, media),
--     solo si la función existe (si la 111 ya se revirtió, no se recrea);
--   · drop de subcategorias_ticket.prioridad_sugerida (con su CHECK);
--   · ticket_eventos_evento_check vuelve al listado de la 035. Si ya hay
--     eventos `categoria_cambiada` (los deja la 116 y cada reclasificación),
--     se CONSERVAN como historial y el CHECK se recrea NOT VALID (rige para
--     filas nuevas; las existentes no se borran).
--
-- DATOS (lo que se puede deshacer sin perder historial):
--   · Las subcategorías renombradas recuperan su nombre anterior y las movidas
--     vuelven a su categoría anterior (Impresora → Redes, Virus → Otros,
--     Cámaras → Accesos y Cuentas), con sus tickets realineados (sin tocar
--     updated_at). Desbloquear cuenta, Accesorio dañado u Otro recuperan su
--     tipo sugerido anterior (incidente / sin tipo / sin tipo); los avisos no
--     se tocan.
--   · Las subcategorías NUEVAS y las categorías `seguridad` y `cctv` quedan con
--     deleted_at: nunca se borran (pueden tener tickets creados después de la
--     116; esos tickets conservan su categoría y subcategoría, ahora dadas de
--     baja, y siguen visibles en sus listados).
--   · Las categorías renombradas recuperan su nombre (Hardware, Redes,
--     Software, Otros).
--   · Los servicios `seguridad` y `cctv` NO se tocan (el JEFE decide si los da
--     de baja en Configuración › Servicios).
--   · Se borra la marca config_parametros.catalogo_tickets_v2 (si se vuelve a
--     aplicar la 116, la fecha será la de esa nueva aplicación).
--   · Los tickets reclasificados por un JEFE NO vuelven atrás: es una decisión
--     registrada en su hoja de vida, no un efecto de la migración.
--
-- Antes de revertir: redesplegar la versión anterior de la edge function
-- `tickets` y del frontend (piden prioridad_sugerida: 42703 sin la columna).
-- Idempotente (se puede correr dos veces). Sin cambios de configuración de
-- sesión (docs/GOTCHAS-CLI.md).
-- ============================================================

drop view if exists public.v_tickets_por_reclasificar;
drop function if exists public.reclasificar_ticket(uuid, uuid, text);
drop function if exists public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean);


-- ------------------------------------------------------------
-- Datos (antes de quitar la columna de prioridad)
-- ------------------------------------------------------------
do $$
declare
  r      record;
  v_sub  uuid;
  v_trg  boolean := exists (select 1 from pg_trigger
                              where tgrelid = 'public.tickets'::regclass
                                and tgname = 'trg_tickets_updated_at' and not tgisinternal);
begin
  if v_trg then
    alter table public.tickets disable trigger trg_tickets_updated_at;
  end if;

  -- Renombradas y movidas: (categoría de hoy, nombre de hoy) → (categoría y nombre de antes, tipo de antes).
  -- `tipo_antes` = 'igual' deja el tipo como está.
  for r in
    select * from (values
      ('accesos_cuentas', 'Desbloquear cuenta',                                 'accesos_cuentas', 'Desbloquear cuenta',                 'incidente'),
      ('accesos_cuentas', 'Solicitar permisos o accesos (sistemas / carpetas)', 'accesos_cuentas', 'Permisos o accesos',                 'igual'),
      ('accesos_cuentas', 'Crear cuenta de usuario (alta)',                     'accesos_cuentas', 'Crear cuenta',                       'igual'),
      ('equipos',         'Impresora o escáner no funciona',                    'red',             'Impresora no funciona',              'igual'),
      ('equipos',         'Accesorio dañado o faltante',                        'equipos',         'Accesorio dañado o faltante',        'ninguno'),
      ('software',        'Error o falla en aplicación',                        'software',        'Problema con software o licencia',   'igual'),
      ('software',        'Instalar o actualizar software',                     'software',        'Instalar software',                  'igual'),
      ('seguridad',       'Virus o malware sospechoso',                         'otro',            'Seguridad (virus/malware) o backup', 'ninguno'),
      ('cctv',            'Solicitar acceso para visualizar cámaras',           'accesos_cuentas', 'Cámaras',                            'igual'),
      ('otro',            'Consulta o asesoría',                                'otro',            'Capacitación o consulta',            'igual'),
      ('otro',            'Otro (no clasificado)',                              'otro',            'Otro',                               'ninguno')
    ) as m(cat, nombre, cat_antes, nombre_antes, tipo_antes)
  loop
    select s.id into v_sub
      from public.subcategorias_ticket s
     where s.deleted_at is null and s.categoria_id = r.cat
       and lower(btrim(s.nombre)) = lower(r.nombre)
     order by s.created_at
     limit 1;
    if v_sub is null then
      continue;
    end if;
    update public.subcategorias_ticket
       set categoria_id  = r.cat_antes,
           nombre        = r.nombre_antes,
           tipo_sugerido = case r.tipo_antes when 'igual' then tipo_sugerido when 'ninguno' then null else r.tipo_antes end
     where id = v_sub;
    update public.tickets
       set categoria_id = r.cat_antes
     where subcategoria_id = v_sub
       and categoria_id is distinct from r.cat_antes;
    v_sub := null;
  end loop;

  if v_trg then
    alter table public.tickets enable trigger trg_tickets_updated_at;
  end if;

  -- Nuevas: baja lógica (nunca DELETE).
  update public.subcategorias_ticket s
     set deleted_at = now()
    from (values
      ('accesos_cuentas', 'No puedo ingresar al sistema'),
      ('accesos_cuentas', 'Desactivar cuenta de usuario (baja)'),
      ('equipos',         'Solicitar tóner o insumos'),
      ('red',             'Red lenta o intermitente'),
      ('red',             'Solicitar punto de red, WiFi o VPN'),
      ('software',        'Correo electrónico / Office 365'),
      ('software',        'Licencia vencida o no se activa'),
      ('seguridad',       'Correo sospechoso / phishing'),
      ('seguridad',       'Pérdida o robo de equipo'),
      ('seguridad',       'Respaldo o recuperación de archivos'),
      ('cctv',            'Cámara sin imagen o con falla'),
      ('cctv',            'Solicitar revisión o extracción de grabación'),
      ('otro',            'Solicitar capacitación')
    ) as n(cat, nombre)
   where s.deleted_at is null
     and s.categoria_id = n.cat
     and lower(btrim(s.nombre)) = lower(n.nombre);

  -- Categorías: nombres anteriores y baja lógica de las dos nuevas.
  update public.categorias_ticket c
     set nombre = n.nombre
    from (values
      ('equipos',  'Hardware'),
      ('red',      'Redes'),
      ('software', 'Software'),
      ('otro',     'Otros')
    ) as n(id, nombre)
   where c.id = n.id
     and c.nombre is distinct from n.nombre;
  update public.categorias_ticket
     set deleted_at = now()
   where id in ('seguridad', 'cctv') and deleted_at is null;

  if to_regclass('public.config_parametros') is not null then
    delete from public.config_parametros where clave = 'catalogo_tickets_v2';
  end if;
end $$;


-- ------------------------------------------------------------
-- crear_ticket_publico: versión de la 111 (solo si existe)
-- ------------------------------------------------------------
do $do$
begin
  if to_regprocedure('public.crear_ticket_publico(jsonb)') is null then
    return;
  end if;
  execute $sql$
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
$$
$sql$;
  execute 'alter function public.crear_ticket_publico(jsonb) owner to project_admin';
  execute 'revoke all on function public.crear_ticket_publico(jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.crear_ticket_publico(jsonb) to project_admin';
  execute $c$comment on function public.crear_ticket_publico(jsonb) is 'Crea un ticket (público o de staff) con su evento creado y el registro del intento en UNA transacción (111). Sin staff_id se ignoran equipo/cuenta/licencia y se aplica el rate-limit (8 por IP y 5 por DNI cada 10 min, sobre intentos_publicos). EXECUTE solo project_admin (edge function tickets).'$c$;
end $do$;


-- ------------------------------------------------------------
-- Esquema
-- ------------------------------------------------------------
alter table public.subcategorias_ticket drop constraint if exists subcategorias_ticket_prioridad_sugerida_check;
alter table public.subcategorias_ticket drop column if exists prioridad_sugerida;

-- Listado de la 035. Con eventos `categoria_cambiada` ya escritos, NOT VALID
-- (se conservan; el CHECK rige para filas nuevas).
alter table public.ticket_eventos drop constraint if exists ticket_eventos_evento_check;
do $$
begin
  if exists (select 1 from public.ticket_eventos where evento = 'categoria_cambiada') then
    alter table public.ticket_eventos add constraint ticket_eventos_evento_check
      check (evento in (
        'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
        'nivel_atencion_cambiado', 'tipo_cambiado', 'correo_fallido',
        'encuesta_enviada', 'encuesta_respondida'
      )) not valid;
  else
    alter table public.ticket_eventos add constraint ticket_eventos_evento_check
      check (evento in (
        'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
        'nivel_atencion_cambiado', 'tipo_cambiado', 'correo_fallido',
        'encuesta_enviada', 'encuesta_respondida'
      ));
  end if;
end $$;
