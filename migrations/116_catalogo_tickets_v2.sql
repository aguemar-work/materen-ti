-- ============================================================
-- MIGRACIÓN 116 — Catálogo de tickets v2: 7 categorías y 31 subcategorías,
-- prioridad sugerida por subcategoría y reclasificación de tickets por el JEFE
-- Depende de: 016 (tickets, catálogo, ticket_eventos), 035 (tipo_sugerido),
--   089 (tickets_resuelto_at), 099 (exigir_permiso / puede / puede_actual),
--   103 (config_parametros), 107 (servicios, categorias_ticket.servicio_id,
--   texto_multilinea), 111 (crear_ticket_publico), 114 (aviso de categoría y
--   subcategoría).
--
-- ⚠️ NO APLICADA. Escrita y probada solo en local (npm run test:sql-local).
--
-- ── HALLAZGO (encargo aprobado por el dueño, 2026-10-05) ───────────────────
--   El catálogo vigente (5 categorías, 18 subcategorías) mezcla cosas que no
--   van juntas y deja sin lugar otras frecuentes:
--     · «Impresora no funciona» vive en Redes (7 tickets) aunque es hardware.
--     · «Seguridad (virus/malware) o backup» vive en Otros (3 tickets): un virus
--       y un respaldo no son lo mismo ni tienen la misma urgencia.
--     · «Cámaras» vive en Accesos y Cuentas (1 ticket) y no hay dónde reportar
--       una cámara sin imagen ni pedir una grabación.
--     · «Otro» concentra 54 tickets y hay 24 (hoy 25) sin subcategoría: el
--       catálogo no permite medir nada de ellos.
--     · La prioridad inicial de TODO ticket es «media» (default de la columna):
--       un virus y una consulta entran con la misma prioridad.
--   Medido en producción el 2026-10-05 (solo SELECT de catálogo y conteos):
--   305 tickets, 0 subcategorías borradas, 0 tickets con una categoría distinta
--   de la de su subcategoría, 10 servicios vivos.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────────
--   1) subcategorias_ticket.prioridad_sugerida text NULL (NULL = «media») con
--      CHECK baja/media/alta/urgente. En la interfaz `urgente` se lee «Crítica»;
--      el valor guardado sigue siendo `urgente` (mismo CHECK que tickets).
--   2) ticket_eventos: nuevo evento `categoria_cambiada` (CHECK ampliado), para
--      dejar constancia de cada ticket movido o reclasificado.
--   3) Servicios `seguridad` («Seguridad de la información») y `cctv`
--      («Videovigilancia») si no existen y caben en el tope de 15 (hoy 10);
--      se enlazan con las categorías nuevas solo si estas no tienen servicio.
--   4) Datos del catálogo (tabla de correspondencias abajo). Idempotente: cada
--      subcategoría se busca por su nombre ACTUAL o por el NUEVO (sin importar
--      mayúsculas ni espacios), así que si el dueño ya la renombró desde
--      Configuración no falla. Si una subcategoría esperada no aparece, NOTICE
--      y se sigue (no aborta, no la inventa). Las nuevas que falten se crean
--      (o se recuperan si un rollback anterior las dejó con deleted_at).
--      Tipo y prioridad sugeridos se fijan según el catálogo aprobado; el aviso
--      solo se escribe donde está vacío (se respeta el que el dueño haya puesto).
--   5) Mover una subcategoría = UPDATE de su categoria_id Y de
--      tickets.categoria_id de sus tickets, con un evento `categoria_cambiada`
--      por ticket (autor NULL: lo hizo la migración). Los tickets históricos NO
--      cambian de tipo, prioridad ni estado.
--   6) crear_ticket_publico (111): misma firma y mismo comportamiento; la
--      prioridad inicial sale ahora de la prioridad_sugerida de la subcategoría
--      (NULL o sin subcategoría: media). Solo con staff_id (flujo interno) se
--      respeta una prioridad explícita válida; el portal público no la manda y,
--      si la mandara, se ignora.
--   7) RPC reclasificar_ticket(p_ticket_id, p_subcategoria_id, p_motivo): solo
--      `rol:jefe` (exigir_permiso → 42501). Cambia categoría y subcategoría de
--      cualquier ticket, incluso cerrado o rechazado, y deja el evento
--      `categoria_cambiada` con autor y motivo. NO cambia tipo ni prioridad.
--      Reclasificar a la misma subcategoría no actualiza el ticket pero deja el
--      evento («Clasificación confirmada»): así un ticket que de verdad es
--      «Otro» sale de la lista de pendientes. Núcleo reclasificar_ticket_nucleo
--      solo project_admin (patrón 107/108: se prueba sin sesión).
--   8) Vista v_tickets_por_reclasificar (security_invoker, solo JEFE): tickets
--      creados ANTES de aplicar esta migración que están en «Otro (no
--      clasificado)», sin subcategoría, o en «Virus o malware sospechoso» (la
--      antigua «Seguridad (virus/malware) o backup», que mezclaba respaldos),
--      y que ningún JEFE reclasificó o confirmó después. La marca vive en
--      config_parametros, clave `catalogo_tickets_v2` (objeto: aplicada_at y
--      los uuid de esas dos subcategorías, para que renombrarlas no vacíe la
--      vista). Reaplicar la migración conserva la fecha original.
--
-- ── TABLA DE CORRESPONDENCIAS ──────────────────────────────────────────────
--   (INC = incidente, REQ = solicitud; «crítica» = valor `urgente`;
--    tickets en producción al 2026-10-05 entre corchetes)
--   Categoría id      Nombre nuevo                    Antes
--   accesos_cuentas   Accesos y Cuentas               (igual)
--   equipos           Hardware y Periféricos          Hardware
--   red               Redes y Conectividad            Redes
--   software          Software y Aplicaciones         Software
--   seguridad         Seguridad de la Información     (NUEVA)
--   cctv              Videovigilancia (CCTV)          (NUEVA)
--   otro              Consultas y Capacitación        Otros
--
--   Subcategoría nueva                                    Tipo Prior.   Antes
--   Accesos y Cuentas
--     Restablecer contraseña                              REQ media   (igual) [6]
--     Desbloquear cuenta                                  REQ alta    era INC [6]
--     No puedo ingresar al sistema                        INC alta    NUEVA, con aviso
--     Solicitar permisos o accesos (sistemas / carpetas)  REQ media   Permisos o accesos [67]
--     Crear cuenta de usuario (alta)                      REQ media   Crear cuenta [19]
--     Desactivar cuenta de usuario (baja)                 REQ alta    NUEVA
--   Hardware y Periféricos
--     Equipo no enciende                                  INC alta    (igual) [4]
--     Equipo lento o con fallas                           INC media   (igual) [9]
--     Impresora o escáner no funciona                     INC media   Redes › Impresora no funciona [7] MUEVE
--     Accesorio dañado o faltante                         INC baja    sin tipo [8]
--     Solicitar tóner o insumos                           REQ baja    NUEVA
--     Solicitar equipo o accesorio nuevo                  REQ baja    (igual) [18]
--   Redes y Conectividad
--     Sin internet o WiFi                                 INC alta    (igual) [9]
--     VPN no conecta                                      INC alta    (igual) [2]
--     Red lenta o intermitente                            INC media   NUEVA
--     Solicitar punto de red, WiFi o VPN                  REQ baja    NUEVA
--   Software y Aplicaciones
--     Error o falla en aplicación                         INC media   Problema con software o licencia [38]
--     Correo electrónico / Office 365                     INC alta    NUEVA
--     Licencia vencida o no se activa                     INC media   NUEVA
--     Instalar o actualizar software                      REQ baja    Instalar software [22]
--     Solicitar licencia nueva                            REQ baja    (igual) [5]
--   Seguridad de la Información
--     Virus o malware sospechoso                          INC crítica Otros › Seguridad (virus/malware) o backup [3] MUEVE
--     Correo sospechoso / phishing                        INC alta    NUEVA
--     Pérdida o robo de equipo                            INC crítica NUEVA
--     Respaldo o recuperación de archivos                 REQ media   NUEVA
--   Videovigilancia (CCTV)
--     Cámara sin imagen o con falla                       INC alta    NUEVA, sin aviso
--     Solicitar acceso para visualizar cámaras            REQ media   Accesos › Cámaras [1] MUEVE, conserva su aviso
--     Solicitar revisión o extracción de grabación        REQ media   NUEVA, con aviso
--   Consultas y Capacitación
--     Consulta o asesoría                                 REQ baja    Capacitación o consulta [2]
--     Solicitar capacitación                              REQ baja    NUEVA
--     Otro (no clasificado)                               REQ baja    Otro, sin tipo [54]
--   Total: 7 categorías y 31 subcategorías vivas.
--
-- ── QUÉ HACEN LOS TRIGGERS DE `tickets` AL MOVER UN TICKET ─────────────────
--   (UPDATE que solo cambia categoria_id / subcategoria_id; revisado sobre las
--    definiciones vigentes de 016, 019, 035, 045, 049/078, 050, 089 y 100)
--   · trg_check_transicion_ticket_permitida, trg_check_iniciar_completo,
--     trg_crear_encuesta_al_cerrar: solo actúan si cambia `estado` → no hacen
--     nada. Por eso un ticket cerrado o rechazado se puede mover.
--   · trg_ticket_identidad_inmutable: token/codigo/origen/creado_por no
--     cambian → pasa.
--   · trg_check_asignado_staff: es `UPDATE OF asignado_a` → no se dispara.
--   · tickets_resuelto_at (089): con el mismo estado repone el resuelto_at
--     anterior → las métricas de resolución no cambian.
--   · trg_evento_ticket_cambios: registra estado/prioridad/nivel/tipo/asignado,
--     NO la categoría → no deja nada; por eso esta migración y la RPC escriben
--     su propio evento `categoria_cambiada`.
--   · trg_ticket_estado_notify (WHEN cambia estado), trg_ticket_notificacion_personal
--     (asignado o estado) y trg_tickets_notificacion (AFTER INSERT): no se
--     disparan o no hacen nada → ninguna notificación a empleados ni a staff.
--   · trg_tickets_notify: aviso de realtime POR SENTENCIA al canal tickets:list
--     (las listas abiertas se refrescan); envuelto en exception (100).
--   · trg_tickets_updated_at: pondría updated_at = now(). En el paso de datos
--     de ESTA migración se desactiva solo durante el UPDATE, dentro del mismo
--     bloque `do` (atómico: si algo falla, el trigger vuelve a quedar como
--     estaba): reordenar el catálogo no es actividad del ticket. En
--     reclasificar_ticket sí corre (es una acción real del JEFE).
--
-- ── CÓMO APLICAR ───────────────────────────────────────────────────────────
--   Hay cuerpos con dollar-quoting y ningún cambio de configuración de sesión
--   (docs/GOTCHAS-CLI.md): `node scripts/deploy.mjs migracion
--   migrations/116_catalogo_tickets_v2.sql` (--dry-run primero) o `db import`;
--   nunca `db query` a mano. Correr SIEMPRE el bloque «Verificación» y leer los
--   NOTICE (dicen qué subcategoría no apareció o se creó). Todo es idempotente:
--   reaplicar el archivo tras un fallo parcial es seguro.
--   Orden de salida: 1) esta migración; 2) desplegar la edge function `tickets`
--   (dist regenerado: `catalogo` devuelve prioridad_sugerida y `crear` manda la
--   prioridad del staff); 3) publicar el frontend. Una function vieja sigue
--   funcionando (la RPC aplica la prioridad sugerida igual); un frontend nuevo
--   sin la migración fallaría al pedir prioridad_sugerida (42703).
--
-- Rollback: migrations/rollback/116_rollback.sql (revierte esquema y RPC;
-- restaura nombres y categorías de lo renombrado o movido y deja las
-- subcategorías y categorías nuevas con deleted_at; leer su cabecera).
-- ============================================================


-- ============================================================
-- 0) Precondiciones
-- ============================================================

do $$
begin
  if to_regprocedure('public.exigir_permiso(text)') is null
     or to_regprocedure('public.puede_actual(text)') is null
     or to_regprocedure('public.puede(uuid,text)') is null then
    raise exception 'La migración 116 requiere la 099 (exigir_permiso / puede). Aplíquela primero.';
  end if;
  if to_regclass('public.config_parametros') is null then
    raise exception 'La migración 116 requiere la 103 (config_parametros). Aplíquela primero.';
  end if;
  if to_regclass('public.servicios') is null
     or to_regprocedure('public.texto_multilinea(text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'categorias_ticket' and column_name = 'servicio_id') then
    raise exception 'La migración 116 requiere la 107 (servicios y categorias_ticket.servicio_id). Aplíquela primero.';
  end if;
  if to_regprocedure('public.crear_ticket_publico(jsonb)') is null then
    raise exception 'La migración 116 requiere la 111 (crear_ticket_publico). Aplíquela primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'subcategorias_ticket' and column_name = 'aviso') then
    raise exception 'La migración 116 requiere la 114 (aviso de categorías y subcategorías). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) Esquema: prioridad sugerida y evento categoria_cambiada
-- ============================================================

alter table public.subcategorias_ticket add column if not exists prioridad_sugerida text;

alter table public.subcategorias_ticket drop constraint if exists subcategorias_ticket_prioridad_sugerida_check;
alter table public.subcategorias_ticket add constraint subcategorias_ticket_prioridad_sugerida_check
  check (prioridad_sugerida is null or prioridad_sugerida in ('baja', 'media', 'alta', 'urgente'));

comment on column public.subcategorias_ticket.prioridad_sugerida is
  'Prioridad inicial de los tickets nuevos de esta subcategoría (116): baja, media, alta o urgente (en pantalla, «Crítica»). NULL = media. La aplica crear_ticket_publico; el staff puede elegir otra al crear y cambiarla después. No toca tickets ya creados.';

-- Mismo listado que la 035 (leído de producción el 2026-10-05) más el evento nuevo.
alter table public.ticket_eventos drop constraint if exists ticket_eventos_evento_check;
alter table public.ticket_eventos add constraint ticket_eventos_evento_check
  check (evento in (
    'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
    'nivel_atencion_cambiado', 'tipo_cambiado', 'correo_fallido',
    'encuesta_enviada', 'encuesta_respondida', 'categoria_cambiada'
  ));


-- ============================================================
-- 2) Datos: categorías, servicios, subcategorías y tickets
-- Un solo bloque `do` = una sola transacción: o queda todo el catálogo nuevo,
-- o no queda nada (incluido el trigger de updated_at, que vuelve a su estado).
-- ============================================================

do $$
declare
  r             record;
  v_sub         public.subcategorias_ticket;
  v_n           integer;
  v_tomadas     uuid[] := '{}';
  v_sub_otro    uuid;
  v_sub_virus   uuid;
  v_sid         text;
  v_borrado     timestamptz;
  v_movidos     integer := 0;
  v_creadas     integer := 0;
  v_faltan      text := '';
  v_trg         boolean := exists (select 1 from pg_trigger
                                     where tgrelid = 'public.tickets'::regclass
                                       and tgname = 'trg_tickets_updated_at' and not tgisinternal);
begin
  -- 2.a) Categorías nuevas (o recuperadas si un rollback las dejó borradas).
  insert into public.categorias_ticket (id, nombre) values
    ('seguridad', 'Seguridad de la Información'),
    ('cctv',      'Videovigilancia (CCTV)')
  on conflict (id) do update
    set deleted_at = null
  where public.categorias_ticket.deleted_at is not null;

  -- 2.b) Servicios de las categorías nuevas: se crean solo si no existen y caben
  -- en el tope; si ya hay uno vivo con ese nombre (otro id), se usa ese. Uno que
  -- el JEFE borró no se resucita. Solo se enlaza una categoría SIN servicio.
  for r in
    select * from (values
      ('seguridad', 'seguridad', 'Seguridad de la información',
       'Antivirus, correos sospechosos, pérdida o robo de equipos y respaldos.', 'alta'),
      ('cctv',      'cctv',      'Videovigilancia',
       'Cámaras de seguridad de sedes y obras: visualización y grabaciones.',     'media')
    ) as s(categoria, id, nombre, descripcion, criticidad)
  loop
    v_sid := null;
    select x.id, x.deleted_at into v_sid, v_borrado from public.servicios x where x.id = r.id;
    if v_sid is null then
      select x.id into v_sid from public.servicios x
       where x.deleted_at is null and lower(btrim(x.nombre)) = lower(r.nombre) limit 1;
      if v_sid is null then
        select count(*) into v_n from public.servicios where deleted_at is null;
        if v_n >= 15 then
          raise notice '116: el catálogo de servicios ya tiene % vivos (tope 15): no se crea «%» y la categoría % queda sin servicio.', v_n, r.nombre, r.categoria;
        else
          insert into public.servicios (id, nombre, descripcion, criticidad, horario)
          values (r.id, r.nombre, r.descripcion, r.criticidad, 'Horario laboral')
          returning id into v_sid;
        end if;
      end if;
    elsif v_borrado is not null then
      raise notice '116: el servicio «%» está dado de baja: no se resucita y la categoría % queda sin servicio.', r.id, r.categoria;
      v_sid := null;
    end if;
    if v_sid is not null then
      update public.categorias_ticket set servicio_id = v_sid
       where id = r.categoria and servicio_id is null;
    end if;
  end loop;

  -- 2.c) Subcategorías. `previos`: nombres con los que puede estar hoy (vacío =
  -- nueva). `origen`: categoría donde vive hoy (= destino si no se mueve).
  if v_trg then
    alter table public.tickets disable trigger trg_tickets_updated_at;
  end if;

  for r in
    select * from (values
      ( 1, 'accesos_cuentas', 'Accesos y Cuentas',            'accesos_cuentas', 'Restablecer contraseña',                             array['Restablecer contraseña'],                               'solicitud', 'media',   null::text),
      ( 2, 'accesos_cuentas', 'Accesos y Cuentas',            'accesos_cuentas', 'Desbloquear cuenta',                                 array['Desbloquear cuenta', 'Cuenta bloqueada'],               'solicitud', 'alta',    null),
      ( 3, 'accesos_cuentas', 'Accesos y Cuentas',            'accesos_cuentas', 'No puedo ingresar al sistema',                       array[]::text[],                                               'incidente', 'alta',    'Si su cuenta quedó bloqueada por intentos fallidos, elija «Desbloquear cuenta».'),
      ( 4, 'accesos_cuentas', 'Accesos y Cuentas',            'accesos_cuentas', 'Solicitar permisos o accesos (sistemas / carpetas)', array['Permisos o accesos'],                                   'solicitud', 'media',   null),
      ( 5, 'accesos_cuentas', 'Accesos y Cuentas',            'accesos_cuentas', 'Crear cuenta de usuario (alta)',                     array['Crear cuenta'],                                         'solicitud', 'media',   null),
      ( 6, 'accesos_cuentas', 'Accesos y Cuentas',            'accesos_cuentas', 'Desactivar cuenta de usuario (baja)',                array[]::text[],                                               'solicitud', 'alta',    null),
      ( 7, 'equipos',         'Hardware y Periféricos',       'equipos',         'Equipo no enciende',                                 array['Equipo no enciende'],                                   'incidente', 'alta',    null),
      ( 8, 'equipos',         'Hardware y Periféricos',       'equipos',         'Equipo lento o con fallas',                          array['Equipo lento o con fallas'],                            'incidente', 'media',   null),
      ( 9, 'equipos',         'Hardware y Periféricos',       'red',             'Impresora o escáner no funciona',                    array['Impresora no funciona'],                                'incidente', 'media',   null),
      (10, 'equipos',         'Hardware y Periféricos',       'equipos',         'Accesorio dañado o faltante',                        array['Accesorio dañado o faltante', 'Accesorio faltante o dañado'], 'incidente', 'baja', null),
      (11, 'equipos',         'Hardware y Periféricos',       'equipos',         'Solicitar tóner o insumos',                          array[]::text[],                                               'solicitud', 'baja',    null),
      (12, 'equipos',         'Hardware y Periféricos',       'equipos',         'Solicitar equipo o accesorio nuevo',                 array['Solicitar equipo o accesorio nuevo', 'Solicitar equipo nuevo'], 'solicitud', 'baja', null),
      (13, 'red',             'Redes y Conectividad',         'red',             'Sin internet o WiFi',                                array['Sin internet o WiFi'],                                  'incidente', 'alta',    null),
      (14, 'red',             'Redes y Conectividad',         'red',             'VPN no conecta',                                     array['VPN no conecta'],                                       'incidente', 'alta',    null),
      (15, 'red',             'Redes y Conectividad',         'red',             'Red lenta o intermitente',                           array[]::text[],                                               'incidente', 'media',   null),
      (16, 'red',             'Redes y Conectividad',         'red',             'Solicitar punto de red, WiFi o VPN',                 array[]::text[],                                               'solicitud', 'baja',    null),
      (17, 'software',        'Software y Aplicaciones',      'software',        'Error o falla en aplicación',                        array['Problema con software o licencia', 'Problema con una licencia'], 'incidente', 'media', null),
      (18, 'software',        'Software y Aplicaciones',      'software',        'Correo electrónico / Office 365',                    array[]::text[],                                               'incidente', 'alta',    null),
      (19, 'software',        'Software y Aplicaciones',      'software',        'Licencia vencida o no se activa',                    array[]::text[],                                               'incidente', 'media',   null),
      (20, 'software',        'Software y Aplicaciones',      'software',        'Instalar o actualizar software',                     array['Instalar software'],                                    'solicitud', 'baja',    null),
      (21, 'software',        'Software y Aplicaciones',      'software',        'Solicitar licencia nueva',                           array['Solicitar licencia nueva'],                             'solicitud', 'baja',    null),
      (22, 'seguridad',       'Seguridad de la Información',  'otro',            'Virus o malware sospechoso',                         array['Seguridad (virus/malware) o backup'],                   'incidente', 'urgente', null),
      (23, 'seguridad',       'Seguridad de la Información',  'seguridad',       'Correo sospechoso / phishing',                       array[]::text[],                                               'incidente', 'alta',    null),
      (24, 'seguridad',       'Seguridad de la Información',  'seguridad',       'Pérdida o robo de equipo',                           array[]::text[],                                               'incidente', 'urgente', null),
      (25, 'seguridad',       'Seguridad de la Información',  'seguridad',       'Respaldo o recuperación de archivos',                array[]::text[],                                               'solicitud', 'media',   null),
      (26, 'cctv',            'Videovigilancia (CCTV)',       'cctv',            'Cámara sin imagen o con falla',                      array[]::text[],                                               'incidente', 'alta',    null),
      (27, 'cctv',            'Videovigilancia (CCTV)',       'accesos_cuentas', 'Solicitar acceso para visualizar cámaras',           array['Cámaras'],                                              'solicitud', 'media',   null),
      (28, 'cctv',            'Videovigilancia (CCTV)',       'cctv',            'Solicitar revisión o extracción de grabación',       array[]::text[],                                               'solicitud', 'media',   'Adjunte la autorización de Gerencia. TI administra el sistema de cámaras, pero no es responsable del contenido de las grabaciones.'),
      (29, 'otro',            'Consultas y Capacitación',     'otro',            'Consulta o asesoría',                                array['Capacitación o consulta'],                              'solicitud', 'baja',    null),
      (30, 'otro',            'Consultas y Capacitación',     'otro',            'Solicitar capacitación',                             array[]::text[],                                               'solicitud', 'baja',    null),
      (31, 'otro',            'Consultas y Capacitación',     'otro',            'Otro (no clasificado)',                              array['Otro'],                                                 'solicitud', 'baja',    null)
    ) as m(orden, cat, cat_nombre, origen, nombre, previos, tipo, prioridad, aviso)
    order by orden
  loop
    -- Candidatas vivas: por el nombre nuevo o por uno anterior, en la categoría
    -- de origen o en la de destino, sin repetir una ya tomada por otra fila.
    select count(*) into v_n
      from public.subcategorias_ticket s
     where s.deleted_at is null
       and s.categoria_id in (r.cat, r.origen)
       and not (s.id = any (v_tomadas))
       and lower(btrim(s.nombre)) in (select lower(btrim(x)) from unnest(r.previos || r.nombre) x);
    if v_n > 1 then
      raise notice '116: hay % subcategorías vivas que coinciden con «%» (se usa la de nombre nuevo o la más antigua; revise las demás en Configuración).', v_n, r.nombre;
    end if;

    select s.* into v_sub
      from public.subcategorias_ticket s
     where s.deleted_at is null
       and s.categoria_id in (r.cat, r.origen)
       and not (s.id = any (v_tomadas))
       and lower(btrim(s.nombre)) in (select lower(btrim(x)) from unnest(r.previos || r.nombre) x)
     order by (lower(btrim(s.nombre)) = lower(r.nombre)) desc, (s.categoria_id = r.cat) desc, s.created_at, s.id
     limit 1;

    if not found then
      if cardinality(r.previos) > 0 then
        -- Esperada y ausente: no se inventa (podría duplicar una que el dueño
        -- renombró a otra cosa). La Verificación mostrará menos de 31.
        raise notice '116: no se encontró la subcategoría «%» (antes: %) en % ni en %: se omite.', r.nombre, array_to_string(r.previos, ' / '), r.origen, r.cat;
        v_faltan := v_faltan || r.nombre || '; ';
        continue;
      end if;
      -- Nueva: se recupera si un rollback la dejó borrada; si no, se crea.
      select s.* into v_sub
        from public.subcategorias_ticket s
       where s.deleted_at is not null and s.categoria_id = r.cat
         and lower(btrim(s.nombre)) = lower(r.nombre)
         and not (s.id = any (v_tomadas))
       order by s.created_at desc
       limit 1;
      if found then
        update public.subcategorias_ticket set deleted_at = null where id = v_sub.id returning * into v_sub;
      else
        insert into public.subcategorias_ticket (categoria_id, nombre, tipo_sugerido, prioridad_sugerida, aviso)
        values (r.cat, r.nombre, r.tipo, r.prioridad, r.aviso)
        returning * into v_sub;
        v_creadas := v_creadas + 1;
      end if;
    end if;

    v_tomadas := v_tomadas || v_sub.id;

    -- Mover la subcategoría (si hace falta) y alinear sus tickets. Primero el
    -- evento (lee la categoría anterior del ticket), después el UPDATE.
    if v_sub.categoria_id is distinct from r.cat then
      update public.subcategorias_ticket set categoria_id = r.cat where id = v_sub.id;
    end if;
    insert into public.ticket_eventos (ticket_id, evento, detalle, user_id, user_email)
    select t.id, 'categoria_cambiada',
           format('De "%s" a "%s" (catálogo de tickets v2, migración 116).', coalesce(c.nombre, t.categoria_id, 'sin categoría'), r.cat_nombre),
           null, null
      from public.tickets t
      left join public.categorias_ticket c on c.id = t.categoria_id
     where t.subcategoria_id = v_sub.id
       and t.categoria_id is distinct from r.cat;
    update public.tickets
       set categoria_id = r.cat
     where subcategoria_id = v_sub.id
       and categoria_id is distinct from r.cat;
    get diagnostics v_n = row_count;
    v_movidos := v_movidos + v_n;

    -- Nombre, tipo y prioridad del catálogo aprobado; aviso solo si está vacío.
    -- Solo se escribe si algo cambia (reaplicar no toca updated_at).
    update public.subcategorias_ticket
       set nombre             = r.nombre,
           tipo_sugerido      = r.tipo,
           prioridad_sugerida = r.prioridad,
           aviso              = coalesce(aviso, r.aviso)
     where id = v_sub.id
       and (nombre is distinct from r.nombre
            or tipo_sugerido is distinct from r.tipo
            or prioridad_sugerida is distinct from r.prioridad
            or (aviso is null and r.aviso is not null));

    if r.orden = 22 then v_sub_virus := v_sub.id; end if;
    if r.orden = 31 then v_sub_otro  := v_sub.id; end if;
  end loop;

  if v_trg then
    alter table public.tickets enable trigger trg_tickets_updated_at;
  end if;

  -- 2.d) Nombres de las categorías (por id; solo si cambian).
  update public.categorias_ticket c
     set nombre = n.nombre
    from (values
      ('accesos_cuentas', 'Accesos y Cuentas'),
      ('equipos',         'Hardware y Periféricos'),
      ('red',             'Redes y Conectividad'),
      ('software',        'Software y Aplicaciones'),
      ('seguridad',       'Seguridad de la Información'),
      ('cctv',            'Videovigilancia (CCTV)'),
      ('otro',            'Consultas y Capacitación')
    ) as n(id, nombre)
   where c.id = n.id
     and c.nombre is distinct from n.nombre;

  -- 2.e) Marca para v_tickets_por_reclasificar. La fecha se fija la PRIMERA vez
  -- y se conserva al reaplicar; los uuid se refrescan (por si faltaban).
  insert into public.config_parametros (clave, valor, descripcion)
  values (
    'catalogo_tickets_v2',
    jsonb_build_object(
      'aplicada_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'subcategoria_no_clasificado', v_sub_otro,
      'subcategoria_seguridad_legado', v_sub_virus),
    'Catálogo de tickets v2 (116): fecha en que se aplicó y subcategorías cuyos tickets anteriores se revisan en «Tickets por reclasificar». La escribe la migración; no se edita.'
  )
  on conflict (clave) do update
    set valor = jsonb_build_object(
          'aplicada_at', coalesce(public.config_parametros.valor ->> 'aplicada_at', excluded.valor ->> 'aplicada_at'),
          'subcategoria_no_clasificado', coalesce(excluded.valor -> 'subcategoria_no_clasificado', public.config_parametros.valor -> 'subcategoria_no_clasificado'),
          'subcategoria_seguridad_legado', coalesce(excluded.valor -> 'subcategoria_seguridad_legado', public.config_parametros.valor -> 'subcategoria_seguridad_legado'))
  where public.config_parametros.valor is distinct from jsonb_build_object(
          'aplicada_at', coalesce(public.config_parametros.valor ->> 'aplicada_at', excluded.valor ->> 'aplicada_at'),
          'subcategoria_no_clasificado', coalesce(excluded.valor -> 'subcategoria_no_clasificado', public.config_parametros.valor -> 'subcategoria_no_clasificado'),
          'subcategoria_seguridad_legado', coalesce(excluded.valor -> 'subcategoria_seguridad_legado', public.config_parametros.valor -> 'subcategoria_seguridad_legado'));

  -- 2.f) Resumen.
  select count(*) into v_n from public.subcategorias_ticket s
    join public.categorias_ticket c on c.id = s.categoria_id and c.deleted_at is null
   where s.deleted_at is null;
  raise notice '116: catálogo aplicado: % subcategorías vivas (esperado 31), % creadas ahora, % tickets movidos de categoría.', v_n, v_creadas, v_movidos;
  if v_faltan <> '' then
    raise notice '116: subcategorías esperadas que no aparecieron: %', v_faltan;
  end if;
  for r in
    select c.nombre as categoria, s.nombre
      from public.subcategorias_ticket s
      join public.categorias_ticket c on c.id = s.categoria_id and c.deleted_at is null
     where s.deleted_at is null and not (s.id = any (v_tomadas))
     order by 1, 2
  loop
    raise notice '116: subcategoría fuera del catálogo aprobado (se deja como está): % › %', r.categoria, r.nombre;
  end loop;
end $$;


-- ============================================================
-- 3) crear_ticket_publico (111) con la prioridad inicial de la subcategoría
-- Misma firma, mismos códigos de respuesta y mismo orden de validaciones que
-- la 111. Lo nuevo está marcado con «116».
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
  v_prioridad      text := 'media';  -- 116: sin subcategoría (o sin sugerencia), media
  v_prio_sugerida  text;             -- 116
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
  -- cliente; NULL si la subcategoría es ambigua a propósito (035). 116: la
  -- prioridad inicial sale de su prioridad_sugerida (NULL = media).
  if not exists (select 1 from public.categorias_ticket c where c.id = v_categoria and c.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'categoria_invalida');
  end if;
  if v_sub_txt is not null then
    if lower(v_sub_txt) !~ c_uuid then
      return jsonb_build_object('ok', false, 'code', 'categoria_invalida');
    end if;
    v_sub := v_sub_txt::uuid;
    select s.tipo_sugerido, s.prioridad_sugerida into v_tipo, v_prio_sugerida
      from public.subcategorias_ticket s
     where s.id = v_sub and s.categoria_id = v_categoria and s.deleted_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'categoria_invalida');
    end if;
    v_prioridad := coalesce(v_prio_sugerida, 'media');
  end if;

  if v_staff is not null then
    -- El staff puede corregir la clasificación sugerida.
    if p_datos ->> 'tipo' in ('incidente', 'solicitud') then
      v_tipo := p_datos ->> 'tipo';
    end if;
    -- 116: y la prioridad (el portal público no la manda; si la mandara, se
    -- ignora porque este bloque es solo de staff). Un valor fuera del CHECK
    -- deja la sugerida.
    if p_datos ->> 'prioridad' in ('baja', 'media', 'alta', 'urgente') then
      v_prioridad := p_datos ->> 'prioridad';
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
    contacto_ingresado, creado_por, categoria_id, subcategoria_id, tipo, prioridad,
    equipo_id, cuenta_id, licencia_id
  ) values (
    v_codigo, v_token, v_titulo, v_descripcion, v_origen, v_empleado, v_vinculado,
    v_contacto, v_staff, v_categoria, v_sub, v_tipo, v_prioridad,
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
  'Crea un ticket (público o de staff) con su evento creado y el registro del intento en UNA transacción (111). Prioridad inicial = prioridad_sugerida de la subcategoría, o media (116); solo el staff puede mandar otra. Sin staff_id se ignoran prioridad, equipo/cuenta/licencia y se aplica el rate-limit (8 por IP y 5 por DNI cada 10 min, sobre intentos_publicos). EXECUTE solo project_admin (edge function tickets).';


-- ============================================================
-- 4) reclasificar_ticket (solo JEFE)
-- ============================================================

-- Núcleo: recibe el actor y si es jefe ya resueltos (patrón 107/108), para
-- poder probarlo sin sesión. EXECUTE solo project_admin.
create or replace function public.reclasificar_ticket_nucleo(
  p_ticket_id       uuid,
  p_subcategoria_id uuid,
  p_motivo          text,
  p_actor           uuid,
  p_es_jefe         boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_motivo_max constant integer := 500;
  v_motivo     text := public.texto_multilinea(p_motivo);
  v_t          public.tickets;
  v_sub        public.subcategorias_ticket;
  v_cat_nueva  text;
  v_cat_ant    text;
  v_sub_ant    text;
  v_email      text;
  v_cambio     boolean;
  v_detalle    text;
begin
  if not coalesce(p_es_jefe, false) or p_actor is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Indique el motivo de la reclasificación.';
  end if;
  if char_length(v_motivo) > c_motivo_max then
    raise exception 'El motivo no puede superar los % caracteres.', c_motivo_max;
  end if;

  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'El ticket no existe.' using errcode = 'P0002';
  end if;

  select s.* into v_sub
    from public.subcategorias_ticket s
    join public.categorias_ticket c on c.id = s.categoria_id and c.deleted_at is null
   where s.id = p_subcategoria_id and s.deleted_at is null;
  if not found then
    raise exception 'La subcategoría no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  select c.nombre into v_cat_ant   from public.categorias_ticket c where c.id = v_t.categoria_id;
  select s.nombre into v_sub_ant   from public.subcategorias_ticket s where s.id = v_t.subcategoria_id;
  select c.nombre into v_cat_nueva from public.categorias_ticket c where c.id = v_sub.categoria_id;

  v_cambio := v_t.categoria_id is distinct from v_sub.categoria_id
           or v_t.subcategoria_id is distinct from v_sub.id;

  if v_cambio then
    -- Solo categoría y subcategoría: tipo, prioridad y estado del ticket no se
    -- tocan (un ticket cerrado se puede reclasificar: ver la cabecera).
    update public.tickets
       set categoria_id = v_sub.categoria_id,
           subcategoria_id = v_sub.id
     where id = v_t.id;
    v_detalle := format('De "%s" a "%s › %s". Motivo: %s',
      coalesce(v_cat_ant, 'Sin categoría') || coalesce(' › ' || v_sub_ant, ' › sin subcategoría'),
      v_cat_nueva, v_sub.nombre, v_motivo);
  else
    v_detalle := format('Clasificación confirmada: "%s › %s". Motivo: %s', v_cat_nueva, v_sub.nombre, v_motivo);
  end if;

  select u.email into v_email from auth.users u where u.id = p_actor;
  insert into public.ticket_eventos (ticket_id, evento, detalle, user_id, user_email)
  values (v_t.id, 'categoria_cambiada', v_detalle, p_actor, v_email);

  return jsonb_build_object(
    'ticket_id', v_t.id,
    'codigo', v_t.codigo,
    'categoria_id', v_sub.categoria_id,
    'subcategoria_id', v_sub.id,
    'cambio', v_cambio);
end;
$$;

-- RPC pública: guard + núcleo.
create or replace function public.reclasificar_ticket(
  p_ticket_id       uuid,
  p_subcategoria_id uuid,
  p_motivo          text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('rol:jefe');
  return public.reclasificar_ticket_nucleo(p_ticket_id, p_subcategoria_id, p_motivo, auth.uid(), true);
end;
$$;

alter function public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean) owner to project_admin;
alter function public.reclasificar_ticket(uuid, uuid, text) owner to project_admin;
revoke all on function public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.reclasificar_ticket(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean) to project_admin;
grant execute on function public.reclasificar_ticket(uuid, uuid, text) to project_admin, authenticated;

comment on function public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean) is
  'Núcleo de reclasificar_ticket (116): cambia categoría y subcategoría de un ticket (cualquier estado) y deja el evento categoria_cambiada con actor y motivo. No toca tipo ni prioridad. EXECUTE solo project_admin.';
comment on function public.reclasificar_ticket(uuid, uuid, text) is
  'Reclasifica un ticket a otra subcategoría (y su categoría), con motivo obligatorio; misma subcategoría = clasificación confirmada. Guard rol:jefe (42501). 116.';


-- ============================================================
-- 5) Vista v_tickets_por_reclasificar (solo JEFE)
-- ============================================================

create or replace view public.v_tickets_por_reclasificar
with (security_invoker = true) as
with marca as (
  select (c.valor ->> 'aplicada_at')::timestamptz                     as desde,
         nullif(c.valor ->> 'subcategoria_no_clasificado', '')::uuid   as sub_otro,
         nullif(c.valor ->> 'subcategoria_seguridad_legado', '')::uuid as sub_virus
    from public.config_parametros c
   where c.clave = 'catalogo_tickets_v2'
)
select t.id                 as ticket_id,
       t.codigo,
       t.titulo,
       left(t.descripcion, 300) as descripcion,
       t.estado,
       t.prioridad,
       t.tipo,
       t.created_at,
       t.categoria_id,
       c.nombre             as categoria,
       t.subcategoria_id,
       s.nombre             as subcategoria,
       case when t.subcategoria_id is null then 'sin_subcategoria'
            when t.subcategoria_id = m.sub_otro then 'no_clasificado'
            else 'seguridad_legado' end as motivo
  from marca m
  join public.tickets t on t.created_at < m.desde
  left join public.categorias_ticket c on c.id = t.categoria_id
  left join public.subcategorias_ticket s on s.id = t.subcategoria_id
 where public.puede_actual('rol:jefe')
   and (t.subcategoria_id is null
        or t.subcategoria_id = m.sub_otro
        or t.subcategoria_id = m.sub_virus)
   and not exists (
     select 1 from public.ticket_eventos e
      where e.ticket_id = t.id
        and e.evento = 'categoria_cambiada'
        and e.user_id is not null
        and e.created_at >= m.desde);

alter view public.v_tickets_por_reclasificar owner to project_admin;
revoke all on table public.v_tickets_por_reclasificar from public, anon, authenticated;
grant select on table public.v_tickets_por_reclasificar to authenticated;

comment on view public.v_tickets_por_reclasificar is
  'Tickets creados antes del catálogo v2 (config_parametros.catalogo_tickets_v2) en «Otro (no clasificado)», sin subcategoría o en «Virus o malware sospechoso», que ningún JEFE reclasificó o confirmó después. security_invoker; solo JEFE. 116.';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Catálogo (esperado: categorias = 7, subcategorias = 31, sin_prioridad = 0):
--    select (select count(*) from public.categorias_ticket where deleted_at is null) as categorias, (select count(*) from public.subcategorias_ticket s join public.categorias_ticket c on c.id = s.categoria_id and c.deleted_at is null where s.deleted_at is null) as subcategorias, (select count(*) from public.subcategorias_ticket where deleted_at is null and prioridad_sugerida is null) as sin_prioridad;
--
-- 2) Detalle por categoría (esperado: accesos_cuentas 6, cctv 3, equipos 6, otro 3, red 4, seguridad 4, software 5):
--    select c.id, c.nombre, c.servicio_id, count(s.id) as subcategorias from public.categorias_ticket c left join public.subcategorias_ticket s on s.categoria_id = c.id and s.deleted_at is null where c.deleted_at is null group by 1, 2, 3 order by 1;
--
-- 3) Tickets movidos (esperado: equipos 7, seguridad 3, cctv 1 con los números del 2026-10-05; desalineados = 0):
--    select s.nombre, t.categoria_id, count(*) from public.tickets t join public.subcategorias_ticket s on s.id = t.subcategoria_id where s.nombre in ('Impresora o escáner no funciona', 'Virus o malware sospechoso', 'Solicitar acceso para visualizar cámaras') group by 1, 2 order by 1;
--    select count(*) as desalineados from public.tickets t join public.subcategorias_ticket s on s.id = t.subcategoria_id where s.categoria_id <> t.categoria_id;
--
-- 4) Eventos de la migración (esperado: 11 = 7 + 3 + 1, sin autor):
--    select count(*) from public.ticket_eventos where evento = 'categoria_cambiada' and user_id is null;
--
-- 5) Avisos (esperado: 3 filas: «No puedo ingresar al sistema», «Solicitar acceso para visualizar cámaras» con el aviso que ya tenía «Cámaras», «Solicitar revisión o extracción de grabación»):
--    select c.nombre, s.nombre, left(s.aviso, 60) from public.subcategorias_ticket s join public.categorias_ticket c on c.id = s.categoria_id where s.deleted_at is null and s.aviso is not null order by 1, 2;
--
-- 6) Servicios (esperado: 12 vivos; seguridad y cctv enlazadas):
--    select (select count(*) from public.servicios where deleted_at is null) as servicios, (select string_agg(id || '=' || coalesce(servicio_id, '-'), ', ' order by id) from public.categorias_ticket where id in ('seguridad', 'cctv')) as enlaces;
--
-- 7) Marca (esperado: aplicada_at de hoy y dos uuid no nulos):
--    select valor from public.config_parametros where clave = 'catalogo_tickets_v2';
--
-- 8) Funciones (esperado: reclasificar_ticket authenticated=true, anon=false; núcleo authenticated=false; crear_ticket_publico authenticated=false; las tres secdef y de project_admin):
--    select p.oid::regprocedure::text as funcion, p.prosecdef, pg_get_userbyid(p.proowner) as dueno, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('reclasificar_ticket', 'reclasificar_ticket_nucleo', 'crear_ticket_publico') order by 1;
--
-- 9) Vista (esperado: security_invoker=true; como project_admin devuelve 0 filas porque exige JEFE):
--    select relname, reloptions from pg_class where relnamespace = 'public'::regnamespace and relname = 'v_tickets_por_reclasificar';
--    Candidatos (informativo, misma regla sin el filtro de JEFE; con los datos del 2026-10-05, alrededor de 54 + 25 + 3):
--    select count(*) from public.tickets t, public.config_parametros c where c.clave = 'catalogo_tickets_v2' and t.created_at < (c.valor ->> 'aplicada_at')::timestamptz and (t.subcategoria_id is null or t.subcategoria_id::text in (c.valor ->> 'subcategoria_no_clasificado', c.valor ->> 'subcategoria_seguridad_legado'));
--
-- 10) CHECK (esperado: 2 filas, la de eventos con 'categoria_cambiada'):
--    select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('subcategorias_ticket_prioridad_sugerida_check', 'ticket_eventos_evento_check') order by 1;
--
-- 11) El trigger de updated_at quedó activo (esperado: tgenabled = 'O'):
--    select tgname, tgenabled from pg_trigger where tgrelid = 'public.tickets'::regclass and tgname = 'trg_tickets_updated_at';
--
-- 12) NO crear tickets de prueba en producción (los TCK-XXXX no se revierten):
--    la creación y la reclasificación se prueban con tests/db/triggers.test.sql
--    (bloques 116a a 116c, con rollback) y con npm run test:sql-local.
--
-- 13) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '116';
-- ============================================================
-- FIN DE MIGRACIÓN 116
-- ============================================================
