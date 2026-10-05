-- ============================================================
-- scripts/anonimizar.sql — anonimiza TODOS los datos personales de una BRANCH
-- de pruebas (copia de producción). NUNCA se ejecuta en producción.
--
-- Plan de mejora Ciclo 21, §7.5 "Entorno de pruebas = branch InsForge
-- anonimizada", y migración 112 (tabla `entorno`, función es_branch()).
--
-- ── GUARD ───────────────────────────────────────────────────────────────────
-- TODO el script es UN SOLO bloque `do $$ ... $$` (atómico): su primera
-- instrucción comprueba public.es_branch() y, si no es true, lanza una
-- excepción y NO se ejecuta nada de lo que sigue (ni siquiera parcialmente).
-- Si algo falla a mitad, toda la anonimización se revierte. Una branch de
-- InsForge es una COPIA de producción y hereda entorno.nombre = 'produccion':
-- hay que marcarla ANTES, y solo después de comprobar con el CLI que el proyecto
-- vinculado es la branch y no producción (el paso lo hará
-- scripts/preparar-branch.mjs, aún sin escribir):
--
--   1) npx @insforge/cli branch create <nombre>        (y vincular el CLI a ella)
--   2) npx @insforge/cli db query "update public.entorno set nombre = 'branch' where id = 1"
--   3) npx @insforge/cli db import scripts/anonimizar.sql
--   4) aplicar las migraciones del PR y correr las pruebas
--   5) npx @insforge/cli branch delete <nombre>
--
-- ⚠️ Límite honesto del guard: protege contra la ejecución ACCIDENTAL. Quien
-- marque 'branch' a mano en producción y corra este script destruiría datos
-- reales: la base no distingue una copia de su original. NUNCA ejecute el paso
-- 2 con el CLI vinculado a producción (confirme con `npx @insforge/cli current`).
--
-- ── QUÉ HACE ────────────────────────────────────────────────────────────────
--   empleados          "Empleado N" / "Prueba", DNI de 8 dígitos 10000001...,
--                      correo, teléfono, WhatsApp y notas en NULL
--   cuentas            usuario -> usuarioN@ejemplo.test; password y notas NULL
--   licencias          clave y notas NULL
--   textos libres      tickets (titulo, descripcion, contacto_ingresado),
--                      ticket_comentarios, ticket_satisfaccion.comentario,
--                      kb_articulos, problemas, acciones_correctivas, notas de
--                      asignaciones y de equipos -> textos fijos o NULL
--   entregas           payload vaciado, nombre fijo
--   notificaciones     título fijo (copian títulos de tickets y nombres)
--   equipos_importacion  raw (texto crudo del Excel, con nombres) y notas
--   solicitudes / solicitud_pasos   notas, datos, motivos y etiquetas de pasos con
--                      cuenta o equipo -> NULL o texto fijo (la estructura se conserva)
--   eventos_equipo / ticket_eventos   detalle y user_email en NULL
--   vaciadas (TRUNCATE) accesos_log, accesos_sensibles (y sus permisos),
--                      empleado_eventos, empleado_revisiones_acceso,
--                      intentos_publicos, ticket_busqueda_intentos,
--                      ticket_creacion_intentos, encuesta_respuesta_intentos,
--                      contexto_transaccion
--   borrada (DELETE) empleado_enlaces (109: hash del token e IP; sin CASCADE)
-- Cada tabla/columna se anonimiza SOLO si existe en la branch: sirve para una
-- branch anterior a las migraciones 099-112 (las del PR se aplican después).
--
-- ── QUÉ NO HACE (pendiente de decisión del dueño) ───────────────────────────
--   * staff.nombre y auth.users.email: son las cuentas con las que se prueba.
--   * encuesta_respuestas.respuestas: las encuestas son anónimas por diseño.
--   * Archivos: buckets de actas firmadas, fotos de equipos y capturas de
--     tickets. SQL no puede tocarlos; la branch no debe montar los buckets de
--     producción.
--
-- Este archivo no contiene instrucciones de cambio de configuración de sesión ni
-- de rol: el servidor rechaza el archivo entero si su texto las trae, comentarios
-- incluidos (docs/GOTCHAS-CLI.md).
-- ============================================================

do $$
declare
  r record;
begin
  -- ── 0) GUARD: nada de lo que sigue corre si no es una branch ────────────
  if to_regprocedure('public.es_branch()') is null then
    raise exception 'anonimizar.sql: falta public.es_branch() (migración 112). Abortado: no se modificó nada.';
  end if;
  if not public.es_branch() then
    raise exception 'anonimizar.sql: este entorno NO está marcado como branch (public.entorno.nombre <> branch). Abortado: no se modificó nada.';
  end if;

  -- ── 1) empleados ────────────────────────────────────────────────────────
  -- Dos fases: primero se libera el espacio de DNI (UNIQUE) con un valor
  -- único por fila y recién después se asignan los definitivos; así un DNI
  -- real nunca choca con uno nuevo a mitad del UPDATE.
  if to_regclass('public.empleados') is not null then
    update public.empleados set dni = 'ANON-' || replace(id::text, '-', '');
    update public.empleados e
       set nombres = 'Empleado ' || x.rn,
           apellidos = 'Prueba',
           dni = lpad((10000000 + x.rn)::text, 8, '0'),
           correo_personal = null,
           telefono = null,
           whatsapp = null,
           notas = null
      from (select id, row_number() over (order by id) as rn from public.empleados) x
     where x.id = e.id;
  end if;

  -- ── 2) cuentas (usuario único por plataforma: se numera en todo el conjunto) ─
  if to_regclass('public.cuentas') is not null then
    update public.cuentas c
       set usuario = 'usuario' || x.rn || '@ejemplo.test',
           password = null
      from (select id, row_number() over (order by id) as rn from public.cuentas) x
     where x.id = c.id;
  end if;

  -- ── 3) entregas: el payload cifrado se vacía y el nombre es fijo ────────
  if to_regclass('public.entregas') is not null then
    update public.entregas set payload = '', empleado_nombre = 'Empleado de prueba';
  end if;

  -- ── 4) columnas de texto libre que pasan a NULL ─────────────────────────
  for r in
    select t.tabla, t.columna
      from (values
        ('cuentas', 'notas'),
        ('licencias', 'clave'),
        ('licencias', 'notas'),
        ('asignaciones_cuenta', 'notas'),
        ('asignaciones_equipo', 'notas'),
        ('asignaciones_licencia', 'notas'),
        ('equipos', 'notas'),
        ('equipos_importacion', 'notas'),
        ('tickets', 'contacto_ingresado'),
        ('ticket_satisfaccion', 'comentario'),
        ('empleado_revisiones_acceso', 'nota'),
        ('kb_articulos', 'sintoma'),
        ('kb_articulos', 'solucion'),
        ('problemas', 'causa_raiz'),
        ('eventos_equipo', 'detalle'),
        ('eventos_equipo', 'user_email'),
        ('ticket_eventos', 'detalle'),
        ('ticket_eventos', 'user_email')
      ) as t(tabla, columna)
     where exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t.tabla and c.column_name = t.columna
     )
  loop
    execute format('update public.%I set %I = null where %I is not null', r.tabla, r.columna, r.columna);
  end loop;

  -- ── 5) columnas NOT NULL de texto libre que pasan a un texto fijo ───────
  for r in
    select t.tabla, t.columna, t.valor
      from (values
        ('tickets', 'titulo', 'Ticket de prueba'),
        ('tickets', 'descripcion', 'Descripción de prueba'),
        ('ticket_comentarios', 'mensaje', 'Comentario de prueba'),
        ('kb_articulos', 'titulo', 'Artículo de prueba'),
        ('problemas', 'titulo', 'Problema de prueba'),
        ('problemas', 'descripcion', 'Descripción de prueba'),
        ('acciones_correctivas', 'descripcion', 'Acción de prueba'),
        ('notificaciones', 'titulo', 'Notificación de prueba')
      ) as t(tabla, columna, valor)
     where exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t.tabla and c.column_name = t.columna
     )
  loop
    execute format('update public.%I set %I = %L', r.tabla, r.columna, r.valor);
  end loop;

  -- ── 6) importación de equipos: el texto crudo del Excel trae nombres ────
  if to_regclass('public.equipos_importacion') is not null then
    update public.equipos_importacion set raw = '{}'::jsonb;
  end if;

  -- ── 6b) solicitudes de servicio (108): notas, parámetros, motivos y las
  --        etiquetas de los pasos que nombran una cuenta o un equipo ──────────
  if to_regclass('public.solicitudes') is not null then
    update public.solicitudes
       set nota = null,
           datos = '{}'::jsonb,
           motivo_cancelacion = case when motivo_cancelacion is null then null else 'Motivo de prueba' end;
    update public.solicitud_pasos
       set nota = null,
           motivo_omision = case when motivo_omision is null then null else 'Motivo de prueba' end,
           label = case when objetivo_id is null then label else 'Paso de prueba (' || clave || ')' end;
  end if;

  -- ── 7a) enlaces del portal del empleado (109): hash del token e IP ──────
  -- DELETE y no TRUNCATE ... CASCADE: asignaciones_equipo referencia esta tabla
  -- (confirmacion_enlace_id) y el CASCADE vaciaría también las asignaciones.
  if to_regclass('public.empleado_enlaces') is not null then
    delete from public.empleado_enlaces;
  end if;

  -- ── 7) tablas que se vacían (TRUNCATE no dispara triggers de fila) ──────
  for r in
    select t.tabla
      from (values
        ('accesos_log'),
        ('accesos_sensibles'),
        ('empleado_eventos'),
        ('empleado_revisiones_acceso'),
        ('intentos_publicos'),
        ('ticket_busqueda_intentos'),
        ('ticket_creacion_intentos'),
        ('encuesta_respuesta_intentos'),
        ('contexto_transaccion')
      ) as t(tabla)
     where to_regclass('public.' || t.tabla) is not null
  loop
    execute format('truncate table public.%I cascade', r.tabla);
  end loop;

  raise notice 'anonimizar.sql: branch anonimizada (empleados: %).',
    (select count(*) from public.empleados);
end $$;
