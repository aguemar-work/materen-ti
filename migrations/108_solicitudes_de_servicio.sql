-- ============================================================
-- MIGRACIÓN 108 — Solicitudes de servicio: trámites con pasos (alta, baja,
-- cambio de puesto, acceso nuevo, entrega y devolución de equipo, licencia)
-- Depende de: 002 (empleados), 004 (asignaciones_cuenta), 009 (marcar_rotacion_
--   pendiente: requiere_rotacion), 010 (entregas), 011 (asignaciones_licencia),
--   013 (asignaciones_equipo), 016 (tickets), 035 (tickets.tipo), 099
--   (exigir_permiso / puede_actual), 100 (cuentas_password_cambio: la rotación
--   se limpia al cambiar la contraseña), 101 (texto_limpio, asignar_equipo_
--   nucleo), 102 (empleado_eventos, empleado_dar_baja_interno), 103
--   (dashboard_resumen_de, parametro_entero)
--
-- Plan de mejora Ciclo 21, §4 "108 — Solicitudes de servicio" y pantalla 2
-- (expediente del empleado) — docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md.
-- Reemplaza la heurística de cliente `altasIncompletas()` / `DIAS_VENTANA_ALTA`
-- (core/dominio-empleados.js) y el checklist cosmético de BajaEmpleadoModal
-- por un trámite REAL en la base: cada alta, baja o pedido tiene un código
-- (SOL-0001), una lista de pasos con su estado y quién y cuándo los cumplió.
--
-- ⚠️ NO APLICADA. Escrita y revisada solo en local (npm run test:sql-local).
-- Aplicar es decisión del dueño, DESPUÉS de la 099, 101, 102 y 103 (la
-- sección 0 se detiene si falta alguna) y leyendo docs/GOTCHAS-CLI.md.
-- Hallazgo que cierra: ALTA-SIN-TRAZA (PANORAMA §7: el alta vive repartida en
-- 4 módulos y nada garantiza completarla; la baja es atómica pero no deja
-- constancia de lo que sigue pendiente —rotar contraseñas, recuperar equipos—).
--
-- ── Decisiones del dueño que fija esta migración ───────────────────────────
-- · Las altas las genera RRHH por correo y el personal de TI las REGISTRA A
--   MANO desde el panel. No hay formulario ni API para RRHH (mejora futura,
--   plan §14): `origen` y `nota` dejan escrito de dónde vino el pedido.
-- · Mismo módulo de permisos: todo es 'empleados'. El CHECK de
--   staff_modulos_permisos admite 8 módulos y ninguno es 'solicitudes'; no se
--   inventa uno. Los pasos que se hacen en otro módulo (cuentas, equipos,
--   licencias) se cumplen allí y se marcan SOLOS (triggers de la sección 5).
--
-- ── Qué crea (una sección por concepto, todas idempotentes) ────────────────
--   1) solicitud_tipos            catálogo cerrado de 7 tipos
--      solicitud_plantilla_pasos  24 pasos sembrados (qué se hace en cada tipo)
--   2) solicitudes                el trámite (código SOL-####, estado, origen,
--                                 nota, ticket vinculado, datos jsonb)
--      solicitud_pasos            los pasos del trámite (pendiente/hecho/omitido)
--      transiciones_solicitud_permitidas  whitelist abierta→completada|cancelada
--   3) Triggers de integridad     transición válida, identidad inmutable, sin
--                                 completar con pasos pendientes, paso resuelto
--                                 no se reabre, completada sola al cerrar el último
--   4) Funciones internas         solicitud_marcar_paso, solicitud_revertir_paso,
--                                 solicitud_evaluar_cierre, solicitud_baja_crear
--   5) AUTOCOMPLETADO             triggers sobre asignaciones_cuenta, entregas
--                                 (viewed_at), asignaciones_equipo,
--                                 asignaciones_licencia y cuentas (rotación):
--                                 el staff sigue usando los módulos de siempre
--                                 y el paso de la solicitud abierta se marca solo
--   6) RPC y núcleos              crear_solicitud, completar_paso_solicitud,
--                                 omitir_paso_solicitud, cancelar_solicitud,
--                                 convertir_ticket_en_solicitud
--   7) dar_baja_empleado          (empleado_dar_baja_interno, 102) crea la
--                                 solicitud de baja con sus pasos reales
--   8) reingreso                  trigger: reingresar_empleado abre un alta
--   9) dashboard_resumen_de       (103) llena `solicitudes_abiertas` y deriva de
--                                 ellas `altas_incompletas`
--  10) Dueño y permisos
--
-- ------------------------------------------------------------
-- TABLA DE FIRMAS (la fuente para escribir el frontend)
-- Todas las RPC: SECURITY DEFINER, dueño project_admin, search_path = public,
-- EXECUTE solo `authenticated`. Se llaman con argumentos NOMBRADOS
-- (SDK: rpc('nombre', { p_x: ... })). Sin permiso: 42501 'No autorizado'.
-- Rechazos de negocio: P0001 con mensaje en español; "no existe": P0002.
--
--  RPC                         argumentos (tipo, default)                         retorna                guard
--  crear_solicitud             p_tipo text,                                       public.solicitudes     modulo:empleados
--                              p_empleado_id uuid default null,
--                              p_empleado jsonb default null,   -- persona nueva (solo alta)
--                              p_datos jsonb default '{}',
--                              p_nota text default null,
--                              p_origen text default 'otro',
--                              p_ticket_id uuid default null
--  completar_paso_solicitud    p_paso_id uuid, p_referencia_id uuid default null, public.solicitud_pasos modulo:empleados
--                              p_nota text default null
--  omitir_paso_solicitud       p_paso_id uuid, p_motivo text                      public.solicitud_pasos modulo:empleados
--  cancelar_solicitud          p_solicitud_id uuid, p_motivo text                 public.solicitudes     modulo:empleados
--  convertir_ticket_en_solicitud p_ticket_id uuid, p_tipo text,                   public.solicitudes     modulo:empleados
--                              p_nota text default null                                                  y modulo:tickets
--
--  Reglas por RPC:
--  - crear_solicitud: el tipo debe existir y estar activo. `baja_empleado` NO
--    se crea a mano: la crea dar_baja_empleado (con los pasos reales). Alta:
--    sin p_empleado_id exige p_empleado (nombres, apellidos, dni de 8 dígitos,
--    empresa_id; opcionales area_obra_id, ubicacion_id, cargo, fecha_alta,
--    telefono, whatsapp, correo_personal, notas) y crea a la persona en la
--    MISMA transacción; con p_empleado_id (persona ya registrada, p. ej. tras
--    un reingreso) basta el id. Todos los tipos menos devolucion_equipo exigen
--    un empleado Activo. Alta, baja y cambio de puesto: una sola abierta por
--    persona (P0001 con el código de la existente; índice como respaldo).
--    `datos` es un objeto jsonb de hasta 4 000 caracteres para parámetros del
--    pedido (p. ej. {"software":"AutoCAD"}); NUNCA datos personales: DNI y
--    contacto van a empleados, no aquí. `nota` ≤ 1 000 (p. ej. «pedido de RRHH
--    por correo del 30/09»). `origen`: rrhh_correo | jefe_directo | ticket |
--    sistema | otro.
--  - completar_paso_solicitud: solo pasos pendientes de solicitudes abiertas.
--    Si llega p_referencia_id se valida que pertenezca al empleado según el
--    `referencia_tipo` del paso (cuenta → asignaciones_cuenta, equipo →
--    asignaciones_equipo, licencia → asignaciones_licencia, entrega →
--    entregas, empleado → él mismo).
--  - omitir_paso_solicitud: motivo OBLIGATORIO (≤ 500). Un paso obligatorio
--    solo lo omite un jefe (rol:jefe); los opcionales, cualquiera con el módulo.
--  - cancelar_solicitud: motivo obligatorio (≤ 500), solo desde 'abierta'.
--    Es la baja lógica de una solicitud (no existe deleted_at: el DELETE físico
--    es solo del JEFE por RLS).
--  - convertir_ticket_en_solicitud: el ticket debe tener empleado vinculado y
--    no tener ya una solicitud; crea la solicitud (origen 'ticket'), enlaza
--    solicitudes.ticket_id y deja tickets.tipo = 'solicitud'. NO cambia el
--    estado del ticket (eso lo sigue haciendo el staff en Tickets).
--
--  Una solicitud pasa SOLA a 'completada' cuando todos sus pasos están hechos
--  u omitidos. Un ticket NO se resuelve solo: la doble conformidad del plan V2
--  vive en otra rama y esta migración no toca el estado de tickets.
--
--  Lectura (SDK directo, RLS): solicitudes, solicitud_pasos, solicitud_tipos y
--  solicitud_plantilla_pasos → SELECT con el módulo 'empleados'. Escritura de
--  cliente: ninguna (sin privilegios de INSERT/UPDATE); DELETE físico solo JEFE.
--
--  Funciones internas (EXECUTE solo project_admin; existen para poder probar
--  la lógica sin sesión en tests/db/triggers.test.sql): crear_solicitud_nucleo,
--  completar_paso_solicitud_nucleo, omitir_paso_solicitud_nucleo,
--  cancelar_solicitud_nucleo, convertir_ticket_en_solicitud_nucleo,
--  solicitud_baja_crear, solicitud_marcar_paso, solicitud_revertir_paso,
--  solicitud_evaluar_cierre, siguiente_codigo_solicitud.
--
-- ------------------------------------------------------------
-- PASOS SEMBRADOS (solicitud_plantilla_pasos) — el porqué de cada uno
--  alta_empleado
--    registrar_empleado     (hecho al crear) la persona ya existe en el sistema
--    crear_cuenta           obligatorio · se marca solo al asignarle una cuenta
--    entregar_credenciales  obligatorio · se marca solo cuando la persona ABRE
--                           el enlace de entrega (entregas.viewed_at): recibir
--                           el enlace no basta, hace falta que lo abra
--    dar_accesos_area       opcional · manual (accesos propios del área u obra)
--    asignar_equipo         opcional · se marca solo (depende del cargo)
--    asignar_licencia       opcional · se marca solo (depende del cargo)
--    confirmar_recepcion    obligatorio · manual (la persona confirma que recibió)
--  baja_empleado (los pasos nacen del estado REAL del empleado; ver sección 7)
--    cerrar_accesos         hecho en la misma transacción (cuentas y licencias)
--    rotar_contrasenas      UNO por cuenta reutilizable/compartida: el empleado
--                           conoce la contraseña · se marca solo al rotarla
--    devolver_equipo        UNO por equipo en su poder (la baja no los cierra,
--                           102) · se marca solo al registrar la devolución
--    cerrar_cuentas_plataforma  solo si tenía cuentas personales: en el sistema
--                           ya están dadas de baja, pero la cuenta real en la
--                           plataforma (correo, ERP) se suspende a mano
--  cambio_puesto: actualizar_datos, revisar_accesos, reasignar_equipo (opcional)
--  acceso_nuevo: crear_cuenta, entregar_credenciales, confirmar_recepcion
--  entrega_equipo: asignar_equipo, adjuntar_acta (opcional), confirmar_recepcion
--  devolucion_equipo: devolver_equipo, revisar_estado (opcional)
--  licencia: asignar_licencia, activar_licencia
--
-- ------------------------------------------------------------
-- DECISIONES DE DISEÑO
-- A) `objetivo_id` vs `referencia_id` en solicitud_pasos. El objetivo es
--    SOBRE QUÉ hay que actuar y se conoce al crear el paso (la cuenta que hay
--    que rotar, la asignación de equipo que hay que recuperar); la referencia
--    es el RESULTADO (la asignación creada, la entrega abierta) y se escribe al
--    cumplirlo. Sin esa distinción no se podrían tener varios pasos
--    `rotar_contrasenas` en la misma solicitud. Son uuid sin FK (polimórficos);
--    `referencia_tipo` dice a qué tabla apuntan.
-- B) Autocompletado: cada evento del módulo marca UN paso, el más antiguo que
--    corresponda entre las solicitudes abiertas de esa persona (nunca varios).
--    Lo marca con automatico = true y hecho_por = auth.uid() (NULL cuando el
--    evento viene de una edge function con cliente admin, como la apertura de
--    una entrega). Si una edge function deshace viewed_at (revierte la
--    apertura tras un fallo), el paso vuelve a pendiente.
-- C) dar_baja_empleado conserva firma, retorno y comportamiento (102). Solo
--    agrega: crea la solicitud de baja y cancela las otras solicitudes abiertas
--    del empleado. Una segunda baja sobre un Inactivo sigue siendo inocua.
-- D) `altas_incompletas` del Inicio se conserva (forma y claves de la 103) pero
--    ahora se DERIVA de las solicitudes de alta abiertas; el cliente lee
--    `solicitudes_abiertas`. El parámetro `dias_ventana_alta` (103) queda sin
--    uso: no se borra aquí.
-- E) Sin backfill: las altas anteriores a esta migración no tienen solicitud;
--    el Inicio deja de listarlas. No hay forma fiable de reconstruir un trámite
--    pasado, y la heurística vieja (30 días sin cuenta) mezclaba a quien nunca
--    necesitó cuenta.
-- F) Sin notificación 'solicitud_creada': ampliar notificaciones_tipo_check
--    exige recomponer el CHECK desde producción (ver 074 y 102). Queda como
--    mejora si el dueño la quiere.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea (`Assertion failed ... src\win\async.c`), partir en
-- archivos temporales por sección y aplicarlos uno por uno; el archivo único
-- en migrations/ sigue siendo la fuente de verdad. Correr SIEMPRE el bloque
-- "Verificación" del final: `db import` puede reportar error habiendo
-- ejecutado parte de los statements. Todo es idempotente: reaplicar el
-- archivo completo tras un fallo parcial es seguro.
--
-- Rollback: migrations/rollback/108_rollback.sql (⚠️ descarta las solicitudes
-- acumuladas y devuelve dar_baja_empleado y dashboard_resumen a su versión
-- anterior: leer su cabecera).
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 099, 101, 102 y 103 deben estar aplicadas
-- ============================================================

do $$
begin
  if to_regprocedure('public.exigir_permiso(text)') is null
     or to_regprocedure('public.puede_actual(text)') is null then
    raise exception 'La migración 108 requiere la 099 (exigir_permiso / puede_actual). Aplíquela primero.';
  end if;
  if to_regprocedure('public.texto_limpio(text)') is null
     or to_regprocedure('public.asignar_equipo_nucleo(uuid, uuid, text)') is null then
    raise exception 'La migración 108 requiere la 101 (texto_limpio / asignar_equipo_nucleo). Aplíquela primero.';
  end if;
  if to_regprocedure('public.empleado_dar_baja_interno(uuid, text)') is null
     or to_regclass('public.empleado_eventos') is null then
    raise exception 'La migración 108 requiere la 102 (empleado_dar_baja_interno / empleado_eventos). Aplíquela primero.';
  end if;
  if to_regprocedure('public.dashboard_resumen_de(uuid)') is null
     or to_regprocedure('public.parametro_entero(text, integer, text)') is null then
    raise exception 'La migración 108 requiere la 103 (dashboard_resumen_de / parametro_entero). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) Catálogo: solicitud_tipos y solicitud_plantilla_pasos
-- Catálogo cerrado: lo administra una migración, no el cliente.
-- ============================================================

create table if not exists public.solicitud_tipos (
  id                 text    primary key,
  nombre             text    not null,
  descripcion        text,
  -- Módulo donde se hace el trabajo (informativo para la UI). El permiso para
  -- crear y cerrar solicitudes es siempre 'empleados'.
  modulo_responsable text    not null check (modulo_responsable in ('empleados', 'correos', 'equipos', 'licencias')),
  activo             boolean not null default true,
  orden              integer not null default 0
);

comment on table public.solicitud_tipos is
  'Tipos de solicitud de servicio (108): catálogo cerrado, sin escritura de cliente. Lo agrega una migración.';

create table if not exists public.solicitud_plantilla_pasos (
  tipo_id         text    not null references public.solicitud_tipos(id),
  orden           integer not null,
  clave           text    not null,
  label           text    not null,
  obligatorio     boolean not null default true,
  -- Módulo donde se cumple el paso (para el enlace de la UI); null = no hay.
  modulo          text    check (modulo in ('empleados', 'correos', 'equipos', 'licencias')),
  -- A qué tabla apunta la referencia del paso cumplido.
  referencia_tipo text    check (referencia_tipo in ('empleado', 'cuenta', 'equipo', 'licencia', 'entrega')),
  -- true = el sistema lo marca solo (sección 5); false = se marca con un clic.
  autocompleta    boolean not null default false,
  -- true = no se copia al crear: se instancia según el estado real (baja).
  dinamico        boolean not null default false,
  primary key (tipo_id, clave),
  unique (tipo_id, orden)
);

comment on table public.solicitud_plantilla_pasos is
  'Pasos de cada tipo de solicitud (108). `dinamico` = se crea uno por objetivo según el estado real (rotar contraseña por cuenta, recuperar cada equipo). `autocompleta` = lo marca un trigger al usar el módulo de siempre.';

insert into public.solicitud_tipos (id, nombre, descripcion, modulo_responsable, orden) values
  ('alta_empleado',     'Alta de empleado',     'Ingreso de una persona: registro, cuenta, credenciales, equipo y licencias.', 'empleados', 1),
  ('baja_empleado',     'Baja de empleado',     'Cierre de accesos, rotación de contraseñas compartidas y recuperación de equipos.', 'empleados', 2),
  ('cambio_puesto',     'Cambio de puesto',     'Nuevo cargo o área: ficha, accesos y equipos del puesto anterior.', 'empleados', 3),
  ('acceso_nuevo',      'Acceso nuevo',         'Una cuenta o plataforma adicional para una persona.', 'correos', 4),
  ('entrega_equipo',    'Entrega de equipo',    'Equipo nuevo o de reemplazo para una persona.', 'equipos', 5),
  ('devolucion_equipo', 'Devolución de equipo', 'Recuperar un equipo que la persona ya no usará.', 'equipos', 6),
  ('licencia',          'Licencia',             'Asignar una licencia de software a una persona.', 'licencias', 7)
on conflict (id) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      modulo_responsable = excluded.modulo_responsable,
      orden = excluded.orden;

insert into public.solicitud_plantilla_pasos
  (tipo_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta, dinamico) values
  -- alta_empleado
  ('alta_empleado', 1, 'registrar_empleado',    'Registrar a la persona',                              true,  'empleados', 'empleado', true,  false),
  ('alta_empleado', 2, 'crear_cuenta',          'Crear la cuenta de correo',                           true,  'correos',   'cuenta',   true,  false),
  ('alta_empleado', 3, 'entregar_credenciales', 'Entregar las credenciales por enlace',                true,  'correos',   'entrega',  true,  false),
  ('alta_empleado', 4, 'dar_accesos_area',      'Dar los accesos propios del área u obra',             false, 'correos',   'cuenta',   false, false),
  ('alta_empleado', 5, 'asignar_equipo',        'Asignar el equipo',                                   false, 'equipos',   'equipo',   true,  false),
  ('alta_empleado', 6, 'asignar_licencia',      'Asignar las licencias',                               false, 'licencias', 'licencia', true,  false),
  ('alta_empleado', 7, 'confirmar_recepcion',   'Confirmar la recepción con la persona',               true,  'empleados', null,       false, false),
  -- baja_empleado
  ('baja_empleado', 1, 'cerrar_accesos',        'Cerrar los accesos y los asientos de licencia',       true,  'empleados', null,       true,  false),
  ('baja_empleado', 2, 'rotar_contrasenas',     'Rotar la contraseña de la cuenta',                    true,  'correos',   'cuenta',   true,  true),
  ('baja_empleado', 3, 'devolver_equipo',       'Recuperar el equipo',                                 true,  'equipos',   'equipo',   true,  true),
  ('baja_empleado', 4, 'cerrar_cuentas_plataforma', 'Suspender o cerrar las cuentas personales en sus plataformas', true, 'correos', null, false, true),
  -- cambio_puesto
  ('cambio_puesto', 1, 'actualizar_datos',      'Actualizar el cargo y el área en la ficha',           true,  'empleados', null,       false, false),
  ('cambio_puesto', 2, 'revisar_accesos',       'Revisar y ajustar los accesos al nuevo puesto',       true,  'correos',   null,       false, false),
  ('cambio_puesto', 3, 'reasignar_equipo',      'Devolver o reasignar los equipos del puesto anterior', false, 'equipos',  null,       false, false),
  -- acceso_nuevo
  ('acceso_nuevo', 1, 'crear_cuenta',           'Crear o asignar la cuenta pedida',                    true,  'correos',   'cuenta',   true,  false),
  ('acceso_nuevo', 2, 'entregar_credenciales',  'Entregar las credenciales por enlace',                true,  'correos',   'entrega',  true,  false),
  ('acceso_nuevo', 3, 'confirmar_recepcion',    'Confirmar con la persona que el acceso funciona',     true,  'empleados', null,       false, false),
  -- entrega_equipo
  ('entrega_equipo', 1, 'asignar_equipo',       'Entregar el equipo',                                  true,  'equipos',   'equipo',   true,  false),
  ('entrega_equipo', 2, 'adjuntar_acta',        'Adjuntar el acta de entrega firmada',                 false, 'equipos',   null,       false, false),
  ('entrega_equipo', 3, 'confirmar_recepcion',  'Confirmar la recepción con la persona',               true,  'empleados', null,       false, false),
  -- devolucion_equipo
  ('devolucion_equipo', 1, 'devolver_equipo',   'Registrar la devolución del equipo',                  true,  'equipos',   'equipo',   true,  false),
  ('devolucion_equipo', 2, 'revisar_estado',    'Revisar el estado del equipo y anotar daños',         false, 'equipos',   null,       false, false),
  -- licencia
  ('licencia', 1, 'asignar_licencia',           'Asignar la licencia',                                 true,  'licencias', 'licencia', true,  false),
  ('licencia', 2, 'activar_licencia',           'Activar la licencia en la plataforma del proveedor',  true,  'licencias', null,       false, false)
on conflict (tipo_id, clave) do update
  set orden = excluded.orden,
      label = excluded.label,
      obligatorio = excluded.obligatorio,
      modulo = excluded.modulo,
      referencia_tipo = excluded.referencia_tipo,
      autocompleta = excluded.autocompleta,
      dinamico = excluded.dinamico;

alter table public.solicitud_tipos enable row level security;
alter table public.solicitud_plantilla_pasos enable row level security;

drop policy if exists "staff con modulo empleados puede ver tipos de solicitud" on public.solicitud_tipos;
create policy "staff con modulo empleados puede ver tipos de solicitud"
  on public.solicitud_tipos for select
  using (public.puede_actual('modulo:empleados'));

drop policy if exists "staff con modulo empleados puede ver la plantilla de pasos" on public.solicitud_plantilla_pasos;
create policy "staff con modulo empleados puede ver la plantilla de pasos"
  on public.solicitud_plantilla_pasos for select
  using (public.puede_actual('modulo:empleados'));

revoke all on table public.solicitud_tipos from anon, authenticated;
revoke all on table public.solicitud_plantilla_pasos from anon, authenticated;
grant select on table public.solicitud_tipos to authenticated;
grant select on table public.solicitud_plantilla_pasos to authenticated;


-- ============================================================
-- 2) solicitudes, solicitud_pasos y la whitelist de transiciones
-- ============================================================

create sequence if not exists public.solicitud_codigo_seq start 1;

-- Código correlativo SOL-0001 (mismo patrón que TCK-0001, migración 016).
create or replace function public.siguiente_codigo_solicitud()
returns text
language sql
as $$
  select 'SOL-' || lpad(nextval('public.solicitud_codigo_seq')::text, 4, '0');
$$;

create table if not exists public.solicitudes (
  id                 uuid        primary key default gen_random_uuid(),
  codigo             text        not null unique default public.siguiente_codigo_solicitud(),
  tipo_id            text        not null references public.solicitud_tipos(id),
  -- Sin on delete cascade a propósito (como empleado_eventos, 102): el
  -- trámite es parte del historial de la persona.
  empleado_id        uuid        not null references public.empleados(id),
  estado             text        not null default 'abierta'
                     check (estado in ('abierta', 'completada', 'cancelada')),
  -- De dónde vino el pedido: texto cerrado + nota libre («pedido de RRHH por
  -- correo del 30/09»).
  origen             text        not null default 'otro'
                     check (origen in ('rrhh_correo', 'jefe_directo', 'ticket', 'sistema', 'otro')),
  nota               text        check (nota is null or char_length(nota) <= 1000),
  -- Parámetros del pedido (p. ej. {"software":"AutoCAD"}). Nunca datos
  -- personales: el DNI y el contacto viven en empleados.
  datos              jsonb       not null default '{}'::jsonb
                     check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 4000),
  ticket_id          uuid        references public.tickets(id) on delete set null,
  creada_por         uuid        references auth.users(id) on delete set null,
  completada_at      timestamptz,
  cancelada_at       timestamptz,
  cancelada_por      uuid        references auth.users(id) on delete set null,
  motivo_cancelacion text        check (motivo_cancelacion is null or char_length(motivo_cancelacion) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint solicitudes_cierre_coherente check (
    (estado = 'abierta'    and completada_at is null     and cancelada_at is null)
    or (estado = 'completada' and completada_at is not null and cancelada_at is null)
    or (estado = 'cancelada'  and cancelada_at is not null  and completada_at is null and motivo_cancelacion is not null)
  )
);

comment on table public.solicitudes is
  'Trámite de servicio con pasos (108): alta, baja, cambio de puesto, acceso, equipo, licencia. Solo se escribe por RPC/triggers; lectura con el módulo empleados; DELETE físico solo JEFE. cancelada = baja lógica (sin deleted_at).';
comment on column public.solicitudes.datos is
  'Parámetros del pedido en jsonb. Nunca DNI ni contacto de la persona.';

create index if not exists idx_solicitudes_empleado on public.solicitudes (empleado_id, created_at desc);
create index if not exists idx_solicitudes_abiertas on public.solicitudes (created_at) where estado = 'abierta';
create index if not exists idx_solicitudes_creada_por on public.solicitudes (creada_por);
create index if not exists idx_solicitudes_cancelada_por on public.solicitudes (cancelada_por);
-- Un ticket enlaza a lo sumo UNA solicitud viva.
create unique index if not exists solicitudes_ticket_unico
  on public.solicitudes (ticket_id) where ticket_id is not null and estado <> 'cancelada';
-- Alta, baja y cambio de puesto: una sola abierta por persona. La RPC avisa
-- con el código de la existente; este índice es el respaldo ante una carrera.
-- La lista de tipos vive también en crear_solicitud_nucleo (c_unicas).
create unique index if not exists solicitudes_una_abierta_por_tipo
  on public.solicitudes (empleado_id, tipo_id)
  where estado = 'abierta' and tipo_id in ('alta_empleado', 'baja_empleado', 'cambio_puesto');

create table if not exists public.solicitud_pasos (
  id              uuid        primary key default gen_random_uuid(),
  solicitud_id    uuid        not null references public.solicitudes(id) on delete cascade,
  orden           integer     not null,
  clave           text        not null,
  label           text        not null,
  obligatorio     boolean     not null default true,
  modulo          text        check (modulo in ('empleados', 'correos', 'equipos', 'licencias')),
  referencia_tipo text        check (referencia_tipo in ('empleado', 'cuenta', 'equipo', 'licencia', 'entrega')),
  -- Sobre qué hay que actuar (la cuenta a rotar, la asignación de equipo a
  -- recuperar); null en los pasos genéricos. Ver decisión A.
  objetivo_id     uuid,
  estado          text        not null default 'pendiente'
                  check (estado in ('pendiente', 'hecho', 'omitido')),
  -- El resultado al cumplirlo (la asignación creada, la entrega abierta).
  referencia_id   uuid,
  -- Copia de la plantilla: este paso se marca solo al usar el módulo (la UI lo avisa).
  autocompleta    boolean     not null default false,
  -- true = lo marcó el sistema al usarse el módulo; false = un clic de quien lo hizo.
  automatico      boolean     not null default false,
  -- Quién y cuándo lo cumplió u omitió (NULL en hecho_por si lo hizo una edge function).
  hecho_por       uuid        references auth.users(id) on delete set null,
  hecho_at        timestamptz,
  nota            text        check (nota is null or char_length(nota) <= 500),
  motivo_omision  text        check (motivo_omision is null or char_length(motivo_omision) <= 500),
  created_at      timestamptz not null default now(),
  constraint solicitud_pasos_resolucion_coherente check (
    (estado = 'pendiente') = (hecho_at is null)
  ),
  constraint solicitud_pasos_omision_con_motivo check (
    estado <> 'omitido' or motivo_omision is not null
  )
);

comment on table public.solicitud_pasos is
  'Pasos de una solicitud (108). Solo se escribe por RPC/triggers. pendiente → hecho | omitido (hecho → pendiente solo si una edge function deshace viewed_at).';

create index if not exists idx_solicitud_pasos_solicitud on public.solicitud_pasos (solicitud_id, orden);
create index if not exists idx_solicitud_pasos_objetivo
  on public.solicitud_pasos (objetivo_id) where estado = 'pendiente' and objetivo_id is not null;
create index if not exists idx_solicitud_pasos_hecho_por on public.solicitud_pasos (hecho_por);
-- Un paso por (solicitud, clave, objetivo): varios `rotar_contrasenas` solo si
-- apuntan a cuentas distintas.
create unique index if not exists solicitud_pasos_unico
  on public.solicitud_pasos (solicitud_id, clave, coalesce(objetivo_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.transiciones_solicitud_permitidas (
  origen  text not null,
  destino text not null,
  primary key (origen, destino)
);

comment on table public.transiciones_solicitud_permitidas is
  'Whitelist de transiciones de estado de solicitudes (108, default-deny, patrón de la 050). completada y cancelada son terminales. Sin policy de escritura: se administra por migración.';

insert into public.transiciones_solicitud_permitidas (origen, destino) values
  ('abierta', 'completada'),
  ('abierta', 'cancelada')
on conflict (origen, destino) do nothing;

alter table public.solicitudes enable row level security;
alter table public.solicitud_pasos enable row level security;
alter table public.transiciones_solicitud_permitidas enable row level security;

drop policy if exists "staff con modulo empleados puede ver solicitudes" on public.solicitudes;
create policy "staff con modulo empleados puede ver solicitudes"
  on public.solicitudes for select
  using (public.puede_actual('modulo:empleados'));

drop policy if exists "solo jefe puede eliminar solicitudes" on public.solicitudes;
create policy "solo jefe puede eliminar solicitudes"
  on public.solicitudes for delete
  using (public.es_jefe());

drop policy if exists "staff con modulo empleados puede ver pasos de solicitud" on public.solicitud_pasos;
create policy "staff con modulo empleados puede ver pasos de solicitud"
  on public.solicitud_pasos for select
  using (public.puede_actual('modulo:empleados'));

drop policy if exists "solo jefe puede eliminar pasos de solicitud" on public.solicitud_pasos;
create policy "solo jefe puede eliminar pasos de solicitud"
  on public.solicitud_pasos for delete
  using (public.es_jefe());

drop policy if exists "staff puede ver transiciones de solicitud" on public.transiciones_solicitud_permitidas;
create policy "staff puede ver transiciones de solicitud"
  on public.transiciones_solicitud_permitidas for select
  using (public.es_staff());

-- Defensa en profundidad: además de no tener policies de INSERT/UPDATE, los
-- clientes no tienen el privilegio (los de tabla por defecto se revocan).
revoke all on table public.solicitudes from anon, authenticated;
revoke all on table public.solicitud_pasos from anon, authenticated;
revoke all on table public.transiciones_solicitud_permitidas from anon, authenticated;
grant select, delete on table public.solicitudes to authenticated;
grant select, delete on table public.solicitud_pasos to authenticated;
grant select on table public.transiciones_solicitud_permitidas to authenticated;
revoke all on sequence public.solicitud_codigo_seq from anon, authenticated;

drop trigger if exists trg_solicitudes_updated_at on public.solicitudes;
create trigger trg_solicitudes_updated_at
  before update on public.solicitudes
  for each row execute function public.set_updated_at();


-- ============================================================
-- 3) Triggers de integridad
-- ============================================================

-- Una solicitud no cambia de identidad; el estado sigue la whitelist; no se
-- completa con pasos pendientes.
create or replace function public.check_transicion_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.codigo is distinct from old.codigo
     or new.tipo_id is distinct from old.tipo_id
     or new.empleado_id is distinct from old.empleado_id then
    raise exception 'Una solicitud no cambia de código, de tipo ni de empleado.';
  end if;

  if new.estado is distinct from old.estado then
    if not exists (
      select 1 from public.transiciones_solicitud_permitidas
       where origen = old.estado and destino = new.estado
    ) then
      raise exception 'Transición de estado de solicitud "%" a "%" no permitida.', old.estado, new.estado;
    end if;

    if new.estado = 'completada' and exists (
      select 1 from public.solicitud_pasos where solicitud_id = new.id and estado = 'pendiente'
    ) then
      raise exception 'No se puede completar la solicitud %: quedan pasos pendientes.', new.codigo;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_transicion_solicitud on public.solicitudes;
create trigger trg_check_transicion_solicitud
  before update on public.solicitudes
  for each row execute function public.check_transicion_solicitud();

-- Un paso no cambia de identidad; solo pendiente → hecho | omitido (y hecho →
-- pendiente cuando se deshace una apertura de entrega); y solo mientras la
-- solicitud siga abierta.
create or replace function public.check_transicion_solicitud_paso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if new.solicitud_id is distinct from old.solicitud_id
     or new.clave is distinct from old.clave
     or new.orden is distinct from old.orden
     or new.obligatorio is distinct from old.obligatorio
     or new.objetivo_id is distinct from old.objetivo_id then
    raise exception 'Un paso de solicitud no cambia de solicitud, clave, orden ni objetivo.';
  end if;

  if new.estado is distinct from old.estado then
    if not ((old.estado = 'pendiente' and new.estado in ('hecho', 'omitido'))
            or (old.estado = 'hecho' and new.estado = 'pendiente')) then
      raise exception 'Transición de estado de paso "%" a "%" no permitida.', old.estado, new.estado;
    end if;

    select estado into v_estado from public.solicitudes where id = new.solicitud_id;
    if v_estado is distinct from 'abierta' then
      raise exception 'La solicitud ya no está abierta: no se pueden cambiar sus pasos.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_transicion_solicitud_paso on public.solicitud_pasos;
create trigger trg_check_transicion_solicitud_paso
  before update on public.solicitud_pasos
  for each row execute function public.check_transicion_solicitud_paso();

-- Completa la solicitud cuando no queda ningún paso pendiente (y tiene pasos).
-- La llama el trigger de abajo y las funciones que crean pasos ya resueltos.
create or replace function public.solicitud_evaluar_cierre(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.solicitudes s
     set estado = 'completada', completada_at = now()
   where s.id = p_solicitud_id
     and s.estado = 'abierta'
     and exists (select 1 from public.solicitud_pasos p where p.solicitud_id = s.id)
     and not exists (select 1 from public.solicitud_pasos p where p.solicitud_id = s.id and p.estado = 'pendiente');
end;
$$;

create or replace function public.solicitud_paso_cierra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.solicitud_evaluar_cierre(new.solicitud_id);
  return null;
end;
$$;

drop trigger if exists trg_solicitud_paso_cierra on public.solicitud_pasos;
create trigger trg_solicitud_paso_cierra
  after update of estado on public.solicitud_pasos
  for each row
  when (new.estado <> 'pendiente' and old.estado is distinct from new.estado)
  execute function public.solicitud_paso_cierra();


-- ============================================================
-- 4) Funciones internas del autocompletado y de la baja
-- ============================================================

-- Marca UN paso pendiente como hecho por el sistema: el más antiguo que
-- corresponda entre las solicitudes ABIERTAS. `p_objetivo_id` filtra los pasos
-- que apuntan a un objetivo concreto (rotar esa cuenta, recuperar esa
-- asignación); un paso sin objetivo sirve para cualquiera. Sin empleado y sin
-- objetivo no hace nada (evitaría marcar a ciegas).
create or replace function public.solicitud_marcar_paso(
  p_empleado_id   uuid,
  p_clave         text,
  p_objetivo_id   uuid,
  p_referencia_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paso uuid;
begin
  if p_empleado_id is null and p_objetivo_id is null then
    return;
  end if;

  select p.id into v_paso
    from public.solicitud_pasos p
    join public.solicitudes s on s.id = p.solicitud_id
   where s.estado = 'abierta'
     and p.estado = 'pendiente'
     and p.clave = p_clave
     and (p_empleado_id is null or s.empleado_id = p_empleado_id)
     and (p.objetivo_id is null or p.objetivo_id = p_objetivo_id)
   -- La más antigua; a igual instante (varias solicitudes en una transacción),
   -- la de código menor.
   order by s.created_at, length(s.codigo), s.codigo, p.orden, p.id
   limit 1
   for update of p skip locked;

  if v_paso is null then
    return;
  end if;

  update public.solicitud_pasos
     set estado = 'hecho',
         referencia_id = p_referencia_id,
         automatico = true,
         hecho_por = auth.uid(),
         hecho_at = now()
   where id = v_paso;
end;
$$;

-- Deshace el paso que una entrega había marcado cuando su apertura se revierte
-- (la edge function `credenciales` devuelve viewed_at a NULL si falla después).
create or replace function public.solicitud_revertir_paso(p_clave text, p_referencia_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.solicitud_pasos p
     set estado = 'pendiente', referencia_id = null, automatico = false,
         hecho_por = null, hecho_at = null
    from public.solicitudes s
   where s.id = p.solicitud_id
     and s.estado = 'abierta'
     and p.clave = p_clave
     and p.estado = 'hecho'
     and p.automatico
     and p.referencia_id = p_referencia_id;
end;
$$;

-- Crea la solicitud de baja de un empleado con los pasos REALES de su estado
-- (los que dar_baja_empleado reúne antes de cerrar nada) y cancela las demás
-- solicitudes abiertas de la persona: ya no tienen sentido.
--   p_cuentas_rotar  cuentas reutilizables/compartidas vivas que tenía
--   p_asignaciones   asignaciones de equipo activas (la baja no las cierra)
--   p_n_cuentas / p_n_licencias  asignaciones cerradas (para la nota del paso)
--   p_personales     cuentas personales dadas de baja en el sistema
create or replace function public.solicitud_baja_crear(
  p_empleado_id    uuid,
  p_motivo         text,
  p_cuentas_rotar  uuid[],
  p_asignaciones   uuid[],
  p_n_cuentas      integer,
  p_n_licencias    integer,
  p_personales     integer
)
returns public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sol public.solicitudes;
  v_pl  public.solicitud_plantilla_pasos;
begin
  update public.solicitudes
     set estado = 'cancelada', cancelada_at = now(), cancelada_por = v_uid,
         motivo_cancelacion = 'Cancelada por la baja del empleado.'
   where empleado_id = p_empleado_id and estado = 'abierta';

  insert into public.solicitudes (tipo_id, empleado_id, origen, nota, creada_por)
  values ('baja_empleado', p_empleado_id, 'sistema', public.texto_limpio(p_motivo), v_uid)
  returning * into v_sol;

  -- Cierre de accesos: ya ocurrió en la misma transacción.
  select * into v_pl from public.solicitud_plantilla_pasos where tipo_id = 'baja_empleado' and clave = 'cerrar_accesos';
  insert into public.solicitud_pasos
    (solicitud_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta, estado, automatico, hecho_por, hecho_at, nota)
  values
    (v_sol.id, v_pl.orden, v_pl.clave, v_pl.label, v_pl.obligatorio, v_pl.modulo, v_pl.referencia_tipo, v_pl.autocompleta,
     'hecho', true, v_uid, now(),
     coalesce(p_n_cuentas, 0) || ' asignaciones de cuenta y ' || coalesce(p_n_licencias, 0) || ' de licencia cerradas.');

  -- Una rotación por cuenta.
  select * into v_pl from public.solicitud_plantilla_pasos where tipo_id = 'baja_empleado' and clave = 'rotar_contrasenas';
  insert into public.solicitud_pasos
    (solicitud_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta, objetivo_id)
  select v_sol.id, v_pl.orden, v_pl.clave,
         'Rotar la contraseña de ' || c.usuario || coalesce(' · ' || pl.nombre, ''),
         v_pl.obligatorio, v_pl.modulo, v_pl.referencia_tipo, v_pl.autocompleta, c.id
    from public.cuentas c
    left join public.plataformas pl on pl.id = c.plataforma_id
   where c.id = any (coalesce(p_cuentas_rotar, '{}'::uuid[]))
   order by c.usuario, c.id;

  -- Una recuperación por equipo en su poder.
  select * into v_pl from public.solicitud_plantilla_pasos where tipo_id = 'baja_empleado' and clave = 'devolver_equipo';
  insert into public.solicitud_pasos
    (solicitud_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta, objetivo_id)
  select v_sol.id, v_pl.orden, v_pl.clave,
         'Recuperar el equipo ' || q.codigo
           || coalesce(' · ' || nullif(btrim(coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')), ''), ''),
         v_pl.obligatorio, v_pl.modulo, v_pl.referencia_tipo, v_pl.autocompleta, a.id
    from public.asignaciones_equipo a
    join public.equipos q on q.id = a.equipo_id
   where a.id = any (coalesce(p_asignaciones, '{}'::uuid[]))
   order by q.codigo, a.id;

  -- Las cuentas personales ya están dadas de baja en el sistema; falta la
  -- cuenta real en la plataforma.
  if coalesce(p_personales, 0) > 0 then
    select * into v_pl from public.solicitud_plantilla_pasos where tipo_id = 'baja_empleado' and clave = 'cerrar_cuentas_plataforma';
    insert into public.solicitud_pasos
      (solicitud_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta, nota)
    values
      (v_sol.id, v_pl.orden, v_pl.clave, v_pl.label, v_pl.obligatorio, v_pl.modulo, v_pl.referencia_tipo, v_pl.autocompleta,
       p_personales || case when p_personales = 1 then ' cuenta personal dada de baja en el sistema.' else ' cuentas personales dadas de baja en el sistema.' end);
  end if;

  perform public.solicitud_evaluar_cierre(v_sol.id);

  select * into v_sol from public.solicitudes where id = v_sol.id;
  return v_sol;
end;
$$;


-- ============================================================
-- 5) AUTOCOMPLETADO: el staff usa los módulos de siempre y el paso se marca solo
-- Cada trigger llama a solicitud_marcar_paso (decisión B). Son AFTER y no
-- tocan la fila original.
-- ============================================================

-- Cuenta asignada a una persona → crear_cuenta.
create or replace function public.solicitud_auto_asignacion_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.solicitud_marcar_paso(new.empleado_id, 'crear_cuenta', null, new.id);
  return null;
end;
$$;

drop trigger if exists trg_solicitud_auto_asignacion_cuenta on public.asignaciones_cuenta;
create trigger trg_solicitud_auto_asignacion_cuenta
  after insert on public.asignaciones_cuenta
  for each row execute function public.solicitud_auto_asignacion_cuenta();

-- Enlace de entrega ABIERTO por la persona (viewed_at) → entregar_credenciales.
-- Si la apertura se revierte (viewed_at vuelve a NULL) el paso se reabre.
create or replace function public.solicitud_auto_entrega()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empleado_id is null then
    return null;
  end if;
  if old.viewed_at is null and new.viewed_at is not null then
    perform public.solicitud_marcar_paso(new.empleado_id, 'entregar_credenciales', null, new.id);
  elsif old.viewed_at is not null and new.viewed_at is null then
    perform public.solicitud_revertir_paso('entregar_credenciales', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_solicitud_auto_entrega on public.entregas;
create trigger trg_solicitud_auto_entrega
  after update of viewed_at on public.entregas
  for each row
  when (old.viewed_at is distinct from new.viewed_at)
  execute function public.solicitud_auto_entrega();

-- Equipo: entregado a una persona → asignar_equipo; devuelto (se cierra la
-- asignación) → devolver_equipo de ESA asignación. Las asignaciones a una
-- ubicación (sin empleado) no cuentan.
create or replace function public.solicitud_auto_asignacion_equipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empleado_id is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.solicitud_marcar_paso(new.empleado_id, 'asignar_equipo', null, new.id);
  elsif old.fecha_fin is null and new.fecha_fin is not null then
    perform public.solicitud_marcar_paso(new.empleado_id, 'devolver_equipo', new.id, new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_solicitud_auto_asignacion_equipo on public.asignaciones_equipo;
create trigger trg_solicitud_auto_asignacion_equipo
  after insert or update of fecha_fin on public.asignaciones_equipo
  for each row execute function public.solicitud_auto_asignacion_equipo();

-- Licencia asignada → asignar_licencia.
create or replace function public.solicitud_auto_asignacion_licencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.solicitud_marcar_paso(new.empleado_id, 'asignar_licencia', null, new.id);
  return null;
end;
$$;

drop trigger if exists trg_solicitud_auto_asignacion_licencia on public.asignaciones_licencia;
create trigger trg_solicitud_auto_asignacion_licencia
  after insert on public.asignaciones_licencia
  for each row execute function public.solicitud_auto_asignacion_licencia();

-- Contraseña rotada (requiere_rotacion pasa de true a false; la 100 lo limpia
-- solo al cambiar la contraseña) → rotar_contrasenas de ESA cuenta. Sin
-- `of requiere_rotacion` a propósito: el cambio lo hace un trigger BEFORE de la
-- 100, no el SET del UPDATE, y un trigger por columna no siempre lo ve.
create or replace function public.solicitud_auto_rotacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.solicitud_marcar_paso(null, 'rotar_contrasenas', new.id, new.id);
  return null;
end;
$$;

drop trigger if exists trg_solicitud_auto_rotacion on public.cuentas;
create trigger trg_solicitud_auto_rotacion
  after update on public.cuentas
  for each row
  when (old.requiere_rotacion is true and new.requiere_rotacion is false)
  execute function public.solicitud_auto_rotacion();


-- ============================================================
-- 6) RPC y núcleos
-- Patrón de la 101: cada RPC pública es UN guard (exigir_permiso) + una
-- llamada a su núcleo, que contiene TODA la lógica. Los núcleos tienen
-- EXECUTE solo para project_admin, así el cliente no puede saltarse el guard
-- y tests/db/triggers.test.sql los ejerce sin simular una sesión.
-- ============================================================

-- ------------------------------------------------------------
-- 6.a) crear_solicitud
-- ------------------------------------------------------------
create or replace function public.crear_solicitud_nucleo(
  p_tipo        text,
  p_empleado_id uuid  default null,
  p_empleado    jsonb default null,
  p_datos       jsonb default '{}'::jsonb,
  p_nota        text  default null,
  p_origen      text  default 'otro',
  p_ticket_id   uuid  default null
)
returns public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  c_uuid_re constant text   := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  -- Mismos tipos que el índice solicitudes_una_abierta_por_tipo.
  c_unicas  constant text[] := array['alta_empleado', 'baja_empleado', 'cambio_puesto'];
  v_uid      uuid  := auth.uid();
  v_tipo     public.solicitud_tipos;
  v_emp      public.empleados;
  v_emp_id   uuid  := p_empleado_id;
  v_nota     text  := public.texto_limpio(p_nota);
  v_datos    jsonb := coalesce(p_datos, '{}'::jsonb);
  v_origen   text  := coalesce(nullif(btrim(p_origen), ''), 'otro');
  v_existente text;
  v_ticket   public.tickets;
  v_otra     text;
  v_nombres  text;
  v_apellidos text;
  v_dni      text;
  v_empresa  uuid;
  v_area     uuid;
  v_ubic     uuid;
  v_fecha    date;
  v_sol      public.solicitudes;
begin
  select * into v_tipo from public.solicitud_tipos where id = p_tipo and activo;
  if not found then
    raise exception 'El tipo de solicitud no existe o no está disponible.';
  end if;
  if v_tipo.id = 'baja_empleado' then
    raise exception 'La baja se registra con «Dar de baja» en el expediente del empleado: ella crea la solicitud con sus pasos.';
  end if;

  if v_origen not in ('rrhh_correo', 'jefe_directo', 'ticket', 'sistema', 'otro') then
    raise exception 'El origen del pedido no es válido.';
  end if;
  if v_nota is not null and length(v_nota) > 1000 then
    raise exception 'La nota no puede superar los 1000 caracteres.';
  end if;
  if jsonb_typeof(v_datos) <> 'object' then
    raise exception 'p_datos debe ser un objeto JSON.';
  end if;
  if octet_length(v_datos::text) > 4000 then
    raise exception 'Los datos del pedido son demasiado extensos (máximo 4000 caracteres).';
  end if;

  -- ── La persona: existente o, solo en el alta, nueva en esta transacción ──
  if v_emp_id is not null and p_empleado is not null then
    raise exception 'Indique a la persona existente o los datos de la persona nueva, no ambos.';
  end if;

  if v_emp_id is null then
    if v_tipo.id <> 'alta_empleado' then
      raise exception 'Elija al empleado de la solicitud.';
    end if;
    if p_empleado is null or jsonb_typeof(p_empleado) <> 'object' then
      raise exception 'Indique los datos de la persona que ingresa.';
    end if;

    v_nombres   := public.texto_limpio(p_empleado ->> 'nombres');
    v_apellidos := public.texto_limpio(p_empleado ->> 'apellidos');
    v_dni       := regexp_replace(coalesce(p_empleado ->> 'dni', ''), '\D', '', 'g');
    if v_nombres is null or v_apellidos is null then
      raise exception 'Los nombres y los apellidos son obligatorios.';
    end if;
    if v_dni !~ '^[0-9]{8}$' then
      raise exception 'El DNI debe tener 8 dígitos.';
    end if;

    select * into v_emp from public.empleados where dni = v_dni;
    if found then
      raise exception 'Ya existe un empleado con ese DNI%.',
        case when v_emp.estado = 'Inactivo' then ' (Inactivo): use «Reingresar» en su expediente' else '' end;
    end if;

    if nullif(btrim(coalesce(p_empleado ->> 'empresa_id', '')), '') is null then
      raise exception 'La empresa es obligatoria.';
    elsif lower(p_empleado ->> 'empresa_id') !~ c_uuid_re then
      raise exception 'empresa_id no es un identificador válido.';
    end if;
    v_empresa := (p_empleado ->> 'empresa_id')::uuid;
    if not exists (select 1 from public.empresas where id = v_empresa and deleted_at is null) then
      raise exception 'La empresa indicada no existe.';
    end if;

    if nullif(btrim(coalesce(p_empleado ->> 'area_obra_id', '')), '') is not null then
      if lower(p_empleado ->> 'area_obra_id') !~ c_uuid_re then
        raise exception 'area_obra_id no es un identificador válido.';
      end if;
      v_area := (p_empleado ->> 'area_obra_id')::uuid;
      if not exists (select 1 from public.areas_obras where id = v_area and deleted_at is null) then
        raise exception 'El área u obra indicada no existe.';
      end if;
    end if;

    if nullif(btrim(coalesce(p_empleado ->> 'ubicacion_id', '')), '') is not null then
      if lower(p_empleado ->> 'ubicacion_id') !~ c_uuid_re then
        raise exception 'ubicacion_id no es un identificador válido.';
      end if;
      v_ubic := (p_empleado ->> 'ubicacion_id')::uuid;
      if not exists (select 1 from public.ubicaciones where id = v_ubic and deleted_at is null) then
        raise exception 'La ubicación indicada no existe.';
      end if;
    end if;

    v_fecha := (now() at time zone 'America/Lima')::date;
    if nullif(btrim(coalesce(p_empleado ->> 'fecha_alta', '')), '') is not null then
      begin
        v_fecha := (p_empleado ->> 'fecha_alta')::date;
      exception when others then
        raise exception 'La fecha de ingreso no es válida.';
      end;
    end if;

    insert into public.empleados
      (nombres, apellidos, dni, empresa_id, area_obra_id, ubicacion_id, cargo, fecha_alta,
       telefono, whatsapp, correo_personal, notas)
    values
      (v_nombres, v_apellidos, v_dni, v_empresa, v_area, v_ubic,
       public.texto_limpio(p_empleado ->> 'cargo'), v_fecha,
       public.texto_limpio(p_empleado ->> 'telefono'), public.texto_limpio(p_empleado ->> 'whatsapp'),
       lower(public.texto_limpio(p_empleado ->> 'correo_personal')),
       public.texto_limpio(p_empleado ->> 'notas'))
    returning * into v_emp;
    v_emp_id := v_emp.id;
  else
    select * into v_emp from public.empleados where id = v_emp_id and deleted_at is null for update;
    if not found then
      raise exception 'El empleado no existe.' using errcode = 'P0002';
    end if;
    if v_tipo.id <> 'devolucion_equipo' and v_emp.estado <> 'Activo' then
      raise exception 'El empleado no está activo (estado: %). No se le puede abrir una solicitud de este tipo.', v_emp.estado;
    end if;
  end if;

  -- ── Una sola abierta por persona en alta, baja y cambio de puesto ──
  if v_tipo.id = any (c_unicas) then
    select codigo into v_existente from public.solicitudes
     where empleado_id = v_emp_id and tipo_id = v_tipo.id and estado = 'abierta';
    if found then
      raise exception 'Ya hay una solicitud de % abierta para esta persona (%).', lower(v_tipo.nombre), v_existente;
    end if;
  end if;

  -- ── Ticket de origen ──
  if p_ticket_id is not null then
    select * into v_ticket from public.tickets where id = p_ticket_id;
    if not found then
      raise exception 'El ticket no existe.' using errcode = 'P0002';
    end if;
    select codigo into v_otra from public.solicitudes
     where ticket_id = p_ticket_id and estado <> 'cancelada';
    if found then
      raise exception 'El ticket ya tiene una solicitud vinculada (%).', v_otra;
    end if;
  end if;

  insert into public.solicitudes (tipo_id, empleado_id, origen, nota, datos, ticket_id, creada_por)
  values (v_tipo.id, v_emp_id, v_origen, v_nota, v_datos, p_ticket_id, v_uid)
  returning * into v_sol;

  insert into public.solicitud_pasos
    (solicitud_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta)
  select v_sol.id, p.orden, p.clave, p.label, p.obligatorio, p.modulo, p.referencia_tipo, p.autocompleta
    from public.solicitud_plantilla_pasos p
   where p.tipo_id = v_tipo.id and not p.dinamico
   order by p.orden;

  -- El alta nace con la persona ya registrada.
  if v_tipo.id = 'alta_empleado' then
    update public.solicitud_pasos
       set estado = 'hecho', referencia_id = v_emp_id, automatico = true, hecho_por = v_uid, hecho_at = now()
     where solicitud_id = v_sol.id and clave = 'registrar_empleado';
  end if;

  perform public.solicitud_evaluar_cierre(v_sol.id);

  select * into v_sol from public.solicitudes where id = v_sol.id;
  return v_sol;
end;
$$;

-- ------------------------------------------------------------
-- 6.b) completar_paso_solicitud
-- ------------------------------------------------------------
create or replace function public.completar_paso_solicitud_nucleo(
  p_paso_id       uuid,
  p_referencia_id uuid default null,
  p_nota          text default null
)
returns public.solicitud_pasos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nota  text := public.texto_limpio(p_nota);
  v_paso  public.solicitud_pasos;
  v_sol   public.solicitudes;
  v_valida boolean := true;
begin
  select * into v_paso from public.solicitud_pasos where id = p_paso_id for update;
  if not found then
    raise exception 'El paso no existe.' using errcode = 'P0002';
  end if;
  select * into v_sol from public.solicitudes where id = v_paso.solicitud_id for update;
  if v_sol.estado <> 'abierta' then
    raise exception 'La solicitud % ya no está abierta.', v_sol.codigo;
  end if;
  if v_paso.estado <> 'pendiente' then
    raise exception 'El paso ya fue resuelto.';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota no puede superar los 500 caracteres.';
  end if;

  -- La referencia, si llega, debe ser algo de ESTA persona.
  if p_referencia_id is not null then
    case v_paso.referencia_tipo
      when 'empleado' then
        v_valida := p_referencia_id = v_sol.empleado_id;
      when 'cuenta' then
        v_valida := exists (select 1 from public.asignaciones_cuenta where id = p_referencia_id and empleado_id = v_sol.empleado_id);
      when 'equipo' then
        v_valida := exists (select 1 from public.asignaciones_equipo where id = p_referencia_id and empleado_id = v_sol.empleado_id);
      when 'licencia' then
        v_valida := exists (select 1 from public.asignaciones_licencia where id = p_referencia_id and empleado_id = v_sol.empleado_id);
      when 'entrega' then
        v_valida := exists (select 1 from public.entregas where id = p_referencia_id and empleado_id = v_sol.empleado_id);
      else
        raise exception 'Este paso no admite una referencia.';
    end case;
    if not v_valida then
      raise exception 'La referencia indicada no pertenece al empleado de la solicitud.';
    end if;
  end if;

  update public.solicitud_pasos
     set estado = 'hecho', referencia_id = p_referencia_id, nota = v_nota,
         automatico = false, hecho_por = auth.uid(), hecho_at = now()
   where id = p_paso_id
   returning * into v_paso;

  return v_paso;
end;
$$;

-- ------------------------------------------------------------
-- 6.c) omitir_paso_solicitud
-- ------------------------------------------------------------
create or replace function public.omitir_paso_solicitud_nucleo(
  p_paso_id uuid,
  p_motivo  text
)
returns public.solicitud_pasos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := public.texto_limpio(p_motivo);
  v_paso   public.solicitud_pasos;
  v_sol    public.solicitudes;
begin
  if v_motivo is null then
    raise exception 'El motivo para omitir el paso es obligatorio.';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.';
  end if;

  select * into v_paso from public.solicitud_pasos where id = p_paso_id for update;
  if not found then
    raise exception 'El paso no existe.' using errcode = 'P0002';
  end if;
  select * into v_sol from public.solicitudes where id = v_paso.solicitud_id for update;
  if v_sol.estado <> 'abierta' then
    raise exception 'La solicitud % ya no está abierta.', v_sol.codigo;
  end if;
  if v_paso.estado <> 'pendiente' then
    raise exception 'El paso ya fue resuelto.';
  end if;
  if v_paso.obligatorio and not public.puede_actual('rol:jefe') then
    raise exception 'El paso es obligatorio: solo un jefe puede omitirlo.';
  end if;

  update public.solicitud_pasos
     set estado = 'omitido', motivo_omision = v_motivo,
         automatico = false, hecho_por = auth.uid(), hecho_at = now()
   where id = p_paso_id
   returning * into v_paso;

  return v_paso;
end;
$$;

-- ------------------------------------------------------------
-- 6.d) cancelar_solicitud
-- ------------------------------------------------------------
create or replace function public.cancelar_solicitud_nucleo(
  p_solicitud_id uuid,
  p_motivo       text
)
returns public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := public.texto_limpio(p_motivo);
  v_sol    public.solicitudes;
begin
  if v_motivo is null then
    raise exception 'El motivo de la cancelación es obligatorio.';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.';
  end if;

  select * into v_sol from public.solicitudes where id = p_solicitud_id for update;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;
  if v_sol.estado <> 'abierta' then
    raise exception 'La solicitud % ya está %.', v_sol.codigo, v_sol.estado;
  end if;

  update public.solicitudes
     set estado = 'cancelada', cancelada_at = now(), cancelada_por = auth.uid(), motivo_cancelacion = v_motivo
   where id = p_solicitud_id
   returning * into v_sol;

  return v_sol;
end;
$$;

-- ------------------------------------------------------------
-- 6.e) convertir_ticket_en_solicitud
-- ------------------------------------------------------------
create or replace function public.convertir_ticket_en_solicitud_nucleo(
  p_ticket_id uuid,
  p_tipo      text,
  p_nota      text default null
)
returns public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_sol    public.solicitudes;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'El ticket no existe.' using errcode = 'P0002';
  end if;
  if v_ticket.empleado_id is null then
    raise exception 'El ticket no tiene un empleado vinculado. Vincúlelo antes de convertirlo en solicitud.';
  end if;

  v_sol := public.crear_solicitud_nucleo(
    p_tipo, v_ticket.empleado_id, null,
    jsonb_build_object('ticket_codigo', v_ticket.codigo),
    p_nota, 'ticket', p_ticket_id);

  if v_ticket.tipo is distinct from 'solicitud' then
    update public.tickets set tipo = 'solicitud' where id = p_ticket_id;
  end if;

  return v_sol;
end;
$$;

-- ------------------------------------------------------------
-- RPC públicas (guard + llamada al núcleo)
-- ------------------------------------------------------------
create or replace function public.crear_solicitud(
  p_tipo        text,
  p_empleado_id uuid  default null,
  p_empleado    jsonb default null,
  p_datos       jsonb default '{}'::jsonb,
  p_nota        text  default null,
  p_origen      text  default 'otro',
  p_ticket_id   uuid  default null
)
returns public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.crear_solicitud_nucleo(p_tipo, p_empleado_id, p_empleado, p_datos, p_nota, p_origen, p_ticket_id);
end;
$$;

create or replace function public.completar_paso_solicitud(
  p_paso_id       uuid,
  p_referencia_id uuid default null,
  p_nota          text default null
)
returns public.solicitud_pasos
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.completar_paso_solicitud_nucleo(p_paso_id, p_referencia_id, p_nota);
end;
$$;

create or replace function public.omitir_paso_solicitud(
  p_paso_id uuid,
  p_motivo  text
)
returns public.solicitud_pasos
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.omitir_paso_solicitud_nucleo(p_paso_id, p_motivo);
end;
$$;

create or replace function public.cancelar_solicitud(
  p_solicitud_id uuid,
  p_motivo       text
)
returns public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.cancelar_solicitud_nucleo(p_solicitud_id, p_motivo);
end;
$$;

create or replace function public.convertir_ticket_en_solicitud(
  p_ticket_id uuid,
  p_tipo      text,
  p_nota      text default null
)
returns public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  perform public.exigir_permiso('modulo:tickets');
  return public.convertir_ticket_en_solicitud_nucleo(p_ticket_id, p_tipo, p_nota);
end;
$$;

comment on function public.crear_solicitud(text, uuid, jsonb, jsonb, text, text, uuid) is
  'Abre una solicitud de servicio con los pasos de su plantilla. Alta sin p_empleado_id crea a la persona en la misma transacción. baja_empleado no se crea a mano (la crea dar_baja_empleado). Guard modulo:empleados. 108.';
comment on function public.completar_paso_solicitud(uuid, uuid, text) is
  'Marca un paso pendiente como hecho (referencia opcional validada contra el empleado). La solicitud se completa sola con el último paso. Guard modulo:empleados. 108.';
comment on function public.omitir_paso_solicitud(uuid, text) is
  'Omite un paso pendiente con motivo obligatorio; un paso obligatorio solo lo omite un jefe. Guard modulo:empleados. 108.';
comment on function public.cancelar_solicitud(uuid, text) is
  'Cancela una solicitud abierta con motivo obligatorio. Guard modulo:empleados. 108.';
comment on function public.convertir_ticket_en_solicitud(uuid, text, text) is
  'Crea una solicitud a partir de un ticket con empleado vinculado y deja tickets.tipo = solicitud. No cambia el estado del ticket. Guard modulo:empleados y modulo:tickets. 108.';



-- ============================================================
-- 7) dar_baja_empleado → solicitud de baja
-- Cuerpo = copia EXACTA de empleado_dar_baja_interno de la 102 (que a su vez
-- copia la 086) más cuatro agregados marcados "108": reúne las cuentas por
-- rotar y los equipos en poder del empleado ANTES de cerrar nada, cuenta las
-- asignaciones cerradas y, si el empleado NO estaba ya Inactivo, crea la
-- solicitud de baja (solicitud_baja_crear). Firma, retorno, dueño y EXECUTE no
-- cambian (create or replace los conserva); dar_baja_empleado(uuid, text) y su
-- guard siguen siendo los de la 102. El interruptor exigir_contexto_rpc queda
-- como está.
-- ============================================================

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
  v_cuentas_rotar      uuid[];
  v_asignaciones_equipo uuid[];
  v_n_cuentas          integer;
  v_n_licencias        integer;
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

  -- 108: lo que la solicitud de baja deja pendiente se reúne ANTES de cerrar
  -- nada. Las cuentas que el empleado conocía y quedan por rotar (las
  -- reutilizables/compartidas vivas) y los equipos que sigue teniendo (la baja
  -- no cierra sus asignaciones).
  select array_agg(distinct c.id) into v_cuentas_rotar
    from public.asignaciones_cuenta a
    join public.cuentas c on c.id = a.cuenta_id
   where a.empleado_id = p_empleado_id
     and a.fecha_fin is null
     and c.deleted_at is null
     and c.tipo_cuenta in ('reutilizable', 'compartida');

  select array_agg(a.id) into v_asignaciones_equipo
    from public.asignaciones_equipo a
    join public.equipos q on q.id = a.equipo_id and q.deleted_at is null
   where a.empleado_id = p_empleado_id
     and a.fecha_fin is null;

  update public.asignaciones_cuenta
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;
  get diagnostics v_n_cuentas = row_count;

  update public.asignaciones_licencia
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;
  get diagnostics v_n_licencias = row_count;

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

    -- 108: la baja deja un trámite con sus pasos reales (rotar contraseñas,
    -- recuperar equipos) y cancela las demás solicitudes abiertas de la persona.
    perform public.solicitud_baja_crear(
      p_empleado_id, v_motivo, v_cuentas_rotar, v_asignaciones_equipo,
      v_n_cuentas, v_n_licencias, coalesce(cardinality(v_cuentas_personales), 0));
  end if;

  perform public.restaurar_contexto(v_prev_rol, v_prev_origen);
  return v_empleado;
end;
$$;



-- ============================================================
-- 8) Reingreso → alta
-- reingresar_empleado (102) deja el evento 'reingreso' tras reactivar a la
-- persona; este trigger abre su solicitud de alta (origen 'sistema'). Si ya
-- hay una abierta no hace nada. No tocamos reingresar_empleado: el trigger
-- sobre el evento evita copiar una función de 100 líneas.
-- ============================================================

create or replace function public.solicitud_alta_por_reingreso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.solicitudes
     where empleado_id = new.empleado_id and tipo_id = 'alta_empleado' and estado = 'abierta'
  ) then
    return null;
  end if;

  perform public.crear_solicitud_nucleo(
    'alta_empleado', new.empleado_id, null, '{}'::jsonb, 'Reingreso del empleado.', 'sistema', null);
  return null;
end;
$$;

drop trigger if exists trg_solicitud_alta_por_reingreso on public.empleado_eventos;
create trigger trg_solicitud_alta_por_reingreso
  after insert on public.empleado_eventos
  for each row
  when (new.evento = 'reingreso')
  execute function public.solicitud_alta_por_reingreso();



-- ============================================================
-- 9) dashboard_resumen_de: llena solicitudes_abiertas y deriva altas_incompletas
-- Cuerpo = copia EXACTA de la 103 con tres cambios marcados "108": (1) el
-- bloque altas_incompletas deja de calcularse con asignaciones_cuenta y sale de
-- las solicitudes de alta abiertas, (2) solicitudes_abiertas (que la 103
-- dejaba en [] reservado) trae las solicitudes abiertas con su avance, ambas
-- bajo el módulo empleados y cada una en su bloque begin ... exception, y
-- (3) se deja de leer el parámetro dias_ventana_alta. La forma del resultado y
-- las demás secciones no cambian: los tests de la 103 siguen valiendo.
-- ============================================================

create or replace function public.dashboard_resumen_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy      date  := (now() at time zone 'America/Lima')::date;
  v_uid      uuid  := p_user;
  v_errores  jsonb := '[]'::jsonb;

  v_p_tickets    boolean;
  v_p_empleados  boolean;
  v_p_correos    boolean;
  v_p_licencias  boolean;
  v_p_equipos    boolean;
  v_p_problemas  boolean;

  v_dias_lic     integer;
  v_dias_gar     integer;
  v_dias_viejo   integer;
  v_dias_acta    integer;

  v_kpis         jsonb;
  v_tickets      jsonb;
  v_rotaciones   jsonb;
  v_sin_pw       jsonb;
  v_sin_devolver jsonb;
  v_licencias    jsonb;
  v_garantias    jsonb;
  v_altas        jsonb;
  v_solicitudes  jsonb;
  v_problemas    jsonb;
  v_acciones     jsonb;
  v_recurrentes  jsonb;
  v_encuestas    integer;
  v_custodia     jsonb;
  v_actas        jsonb;
begin
  -- Guard único (099): staff activo, 42501 si no (también con p_user NULL, es
  -- decir, sin sesión). Se evalúa con puede() (estable) y no con exigir_permiso
  -- (volátil) porque esta función es STABLE.
  if not public.puede(p_user, 'staff:activo') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_p_tickets   := public.puede(p_user, 'modulo:tickets');
  v_p_empleados := public.puede(p_user, 'modulo:empleados');
  v_p_correos   := public.puede(p_user, 'modulo:correos');
  v_p_licencias := public.puede(p_user, 'modulo:licencias');
  v_p_equipos   := public.puede(p_user, 'modulo:equipos');
  v_p_problemas := public.puede(p_user, 'modulo:problemas');

  v_dias_lic   := public.parametro_entero('dias_por_vencer_licencia', 30);
  v_dias_gar   := public.parametro_entero('dias_por_vencer_garantia', 30);
  v_dias_viejo := public.parametro_entero('dias_ticket_viejo', 3);
  v_dias_acta  := public.parametro_entero('dias_acta_sin_adjuntar', 3);

  -- ── kpis (getEstadisticas): cada cifra exige el módulo de su tabla ──
  begin
    v_kpis := jsonb_build_object(
      'empleados_activos', case when v_p_empleados then
        (select count(*) from public.empleados where deleted_at is null and estado = 'Activo') end,
      'empleados_total', case when v_p_empleados then
        (select count(*) from public.empleados where deleted_at is null) end,
      'cuentas_asignadas', case when v_p_correos then
        (select count(*) from public.asignaciones_cuenta where fecha_fin is null) end,
      'correos_compartidos', case when v_p_correos then
        (select count(*) from public.cuentas where tipo_cuenta = 'compartida' and deleted_at is null) end,
      'cuentas_por_rotar', case when v_p_correos then
        (select count(*) from public.cuentas where requiere_rotacion = true and deleted_at is null) end,
      'licencias_por_vencer', case when v_p_licencias then
        (select count(*) from public.licencias
          where deleted_at is null and fecha_vencimiento <= v_hoy + v_dias_lic) end,
      'equipos_total', case when v_p_equipos then
        (select count(*) from public.equipos where deleted_at is null) end,
      'tickets_abiertos', case when v_p_tickets then
        (select count(*) from public.tickets where estado not in ('resuelto', 'cerrado', 'rechazado')) end
    );
  exception when others then
    v_errores := v_errores || jsonb_build_array('kpis');
    v_kpis := null;
    raise warning 'dashboard_resumen: la sección kpis falló (%): %', sqlstate, sqlerrm;
  end;

  -- ── tickets (pendientesTickets + misTickets) ──
  if v_p_tickets then
    begin
      with vig as (
        select id, codigo, titulo, created_at, asignado_a, vinculado, prioridad, estado,
               case prioridad
                 when 'baja' then 0 when 'media' then 1 when 'alta' then 2 when 'urgente' then 3
                 else -1
               end as rango
          from public.tickets
         where estado not in ('resuelto', 'cerrado', 'rechazado')
      )
      select jsonb_build_object(
        'sin_asignar', coalesce((
          select jsonb_agg(jsonb_build_object('ticket_id', v.id, 'codigo', v.codigo,
                                              'titulo', v.titulo, 'desde', v.created_at)
                           order by v.created_at, v.id)
            from vig v where v.asignado_a is null), '[]'::jsonb),
        -- vinculado is false explícito (un null no cuenta como "sin vincular")
        'sin_vincular', coalesce((
          select jsonb_agg(jsonb_build_object('ticket_id', v.id, 'codigo', v.codigo,
                                              'titulo', v.titulo, 'desde', v.created_at)
                           order by v.created_at, v.id)
            from vig v where v.vinculado is false), '[]'::jsonb),
        'viejos', coalesce((
          select jsonb_agg(jsonb_build_object('ticket_id', v.id, 'codigo', v.codigo,
                                              'titulo', v.titulo, 'desde', v.created_at)
                           order by v.created_at, v.id)
            from vig v
           where (v.created_at at time zone 'America/Lima')::date < v_hoy - v_dias_viejo), '[]'::jsonb),
        -- misTickets: prioridad más alta primero y, a igual prioridad, el más antiguo
        'mios', coalesce((
          select jsonb_agg(jsonb_build_object('id', m.id, 'codigo', m.codigo, 'titulo', m.titulo,
                                              'prioridad', m.prioridad, 'estado', m.estado,
                                              'created_at', m.created_at)
                           order by m.rango desc, m.created_at, m.id)
            from (select * from vig where asignado_a = v_uid
                   order by rango desc, created_at, id limit 5) m), '[]'::jsonb),
        'mios_total', (select count(*) from vig where asignado_a = v_uid),
        'vigentes',   (select count(*) from vig),
        -- Reservados: reloj de tickets (estado_tiempo_ticket, plan V2 / 105)
        'vencidos',   null,
        'por_vencer', null
      ) into v_tickets;
    exception when others then
      v_errores := v_errores || jsonb_build_array('tickets');
      v_tickets := null;
      raise warning 'dashboard_resumen: la sección tickets falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── rotaciones_pendientes (listPendientes.porRotar) ──
  if v_p_correos then
    begin
      select coalesce(jsonb_agg(x.item order by x.plataforma, x.usuario, x.id), '[]'::jsonb)
        into v_rotaciones
        from (
          select c.id, c.usuario, coalesce(p.nombre, '') as plataforma,
                 jsonb_build_object(
                   'cuenta_id', c.id, 'usuario', c.usuario,
                   'tipo_cuenta', coalesce(c.tipo_cuenta, 'personal'),
                   'plataforma', coalesce(p.nombre, ''),
                   'titulares', coalesce((
                     select jsonb_agg(jsonb_build_object('id', a.empleado_id,
                                                         'nombre', btrim(e.nombres || ' ' || e.apellidos))
                                      order by a.fecha_inicio, a.id)
                       from public.asignaciones_cuenta a
                       join public.empleados e on e.id = a.empleado_id
                      where a.cuenta_id = c.id and a.fecha_fin is null), '[]'::jsonb)
                 ) as item
            from public.cuentas c
            left join public.plataformas p on p.id = c.plataforma_id
           where c.requiere_rotacion = true and c.deleted_at is null
        ) x;
    exception when others then
      v_errores := v_errores || jsonb_build_array('rotaciones_pendientes');
      v_rotaciones := null;
      raise warning 'dashboard_resumen: la sección rotaciones_pendientes falló (%): %', sqlstate, sqlerrm;
    end;

    -- ── cuentas_sin_password (listPendientes.sinPassword) ──
    begin
      select coalesce(jsonb_agg(x.item order by x.plataforma, x.usuario, x.id), '[]'::jsonb)
        into v_sin_pw
        from (
          select c.id, c.usuario, coalesce(p.nombre, '') as plataforma,
                 jsonb_build_object(
                   'cuenta_id', c.id, 'usuario', c.usuario,
                   'tipo_cuenta', coalesce(c.tipo_cuenta, 'personal'),
                   'plataforma', coalesce(p.nombre, ''),
                   'titulares', coalesce((
                     select jsonb_agg(jsonb_build_object('id', a.empleado_id,
                                                         'nombre', btrim(e.nombres || ' ' || e.apellidos))
                                      order by a.fecha_inicio, a.id)
                       from public.asignaciones_cuenta a
                       join public.empleados e on e.id = a.empleado_id
                      where a.cuenta_id = c.id and a.fecha_fin is null), '[]'::jsonb)
                 ) as item
            from public.cuentas c
            left join public.plataformas p on p.id = c.plataforma_id
           where c.password is null and c.deleted_at is null
        ) x;
    exception when others then
      v_errores := v_errores || jsonb_build_array('cuentas_sin_password');
      v_sin_pw := null;
      raise warning 'dashboard_resumen: la sección cuentas_sin_password falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── solicitudes_abiertas (108) y altas_incompletas derivadas ──
  -- Solicitudes de servicio ABIERTAS con su avance: pasos_hechos cuenta los
  -- pasos resueltos (hechos u omitidos) sobre pasos_total; `siguiente` es el
  -- primer paso pendiente. Reemplaza la heurística de cliente
  -- (altasIncompletas / DIAS_VENTANA_ALTA). `altas_incompletas` conserva la
  -- forma de la 103 pero sale de las solicitudes de ALTA abiertas de personas
  -- Activas; `faltan` son las claves de los pasos OBLIGATORIOS pendientes.
  -- Solo con el módulo empleados (la RLS de solicitudes lo exige).
  if v_p_empleados then
    begin
      select coalesce(jsonb_agg(x.item order by x.created_at, x.id), '[]'::jsonb)
        into v_solicitudes
        from (
          select s.id, s.created_at,
                 jsonb_build_object(
                   'solicitud_id', s.id, 'codigo', s.codigo,
                   'tipo_id', s.tipo_id, 'tipo', t.nombre,
                   'empleado_id', e.id,
                   'empleado', btrim(e.nombres || ' ' || e.apellidos),
                   'cargo', coalesce(e.cargo, ''),
                   'creada_at', s.created_at,
                   'dias', v_hoy - (s.created_at at time zone 'America/Lima')::date,
                   'pasos_total', (select count(*) from public.solicitud_pasos p where p.solicitud_id = s.id),
                   'pasos_hechos', (select count(*) from public.solicitud_pasos p where p.solicitud_id = s.id and p.estado <> 'pendiente'),
                   'siguiente', (select p.label from public.solicitud_pasos p
                                  where p.solicitud_id = s.id and p.estado = 'pendiente'
                                  order by p.orden, p.label, p.id limit 1),
                   'siguiente_modulo', (select p.modulo from public.solicitud_pasos p
                                         where p.solicitud_id = s.id and p.estado = 'pendiente'
                                         order by p.orden, p.label, p.id limit 1)
                 ) as item
            from public.solicitudes s
            join public.solicitud_tipos t on t.id = s.tipo_id
            join public.empleados e on e.id = s.empleado_id
           where s.estado = 'abierta'
        ) x;
    exception when others then
      v_errores := v_errores || jsonb_build_array('solicitudes_abiertas');
      v_solicitudes := null;
      raise warning 'dashboard_resumen: la sección solicitudes_abiertas falló (%): %', sqlstate, sqlerrm;
    end;

    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'empleado_id', e.id,
               'nombre', btrim(e.nombres || ' ' || e.apellidos),
               'cargo', coalesce(e.cargo, ''),
               'fecha_alta', e.fecha_alta,
               'dias', v_hoy - e.fecha_alta,
               'faltan', coalesce((select jsonb_agg(p.clave order by p.orden)
                                     from public.solicitud_pasos p
                                    where p.solicitud_id = s.id and p.estado = 'pendiente' and p.obligatorio),
                                  '[]'::jsonb))
             order by e.fecha_alta, e.id), '[]'::jsonb)
        into v_altas
        from public.solicitudes s
        join public.empleados e on e.id = s.empleado_id
       where s.estado = 'abierta'
         and s.tipo_id = 'alta_empleado'
         and e.estado = 'Activo'
         and e.deleted_at is null;
    exception when others then
      v_errores := v_errores || jsonb_build_array('altas_incompletas');
      v_altas := null;
      raise warning 'dashboard_resumen: la sección altas_incompletas falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── licencias_por_vencer (listPendientes.licenciasPorVencer) ──
  -- Incluye las YA vencidas (fecha <= hoy + N); las perpetuas (sin fecha) no.
  if v_p_licencias then
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'licencia_id', l.id, 'software', l.software, 'cantidad', l.cantidad,
               'fecha_vencimiento', l.fecha_vencimiento,
               'empresa', coalesce(emp.nombre, ''),
               'vencida', l.fecha_vencimiento < v_hoy)
             order by l.fecha_vencimiento, l.id), '[]'::jsonb)
        into v_licencias
        from public.licencias l
        left join public.empresas emp on emp.id = l.empresa_id
       where l.deleted_at is null
         and l.fecha_vencimiento <= v_hoy + v_dias_lic;
    exception when others then
      v_errores := v_errores || jsonb_build_array('licencias_por_vencer');
      v_licencias := null;
      raise warning 'dashboard_resumen: la sección licencias_por_vencer falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── equipos: sin devolver, garantías, custodia de hoy y actas pendientes ──
  if v_p_equipos then
    -- equiposSinDevolver: asignación activa a un empleado dado de baja.
    -- empleado_baja_at = empleados.updated_at del empleado Inactivo: es una
    -- APROXIMACIÓN de la fecha de baja (cualquier edición posterior de la ficha
    -- la mueve) porque en esta migración no está garantizado que exista el
    -- evento 'baja_ejecutada' de empleado_eventos (102). Con la 102 aplicada
    -- conviene reemplazarla por el max(created_at) de ese evento.
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'asignacion_id', a.id, 'codigo', q.codigo,
               'equipo', btrim(coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')),
               'empleado', btrim(e.nombres || ' ' || e.apellidos),
               'empleado_id', e.id,
               'desde', a.fecha_inicio,
               'empleado_baja_at', e.updated_at)
             order by a.fecha_inicio, a.id), '[]'::jsonb)
        into v_sin_devolver
        from public.asignaciones_equipo a
        join public.equipos q on q.id = a.equipo_id and q.deleted_at is null
        join public.empleados e on e.id = a.empleado_id and e.estado = 'Inactivo'
       where a.fecha_fin is null;
    exception when others then
      v_errores := v_errores || jsonb_build_array('equipos_sin_devolver');
      v_sin_devolver := null;
      raise warning 'dashboard_resumen: la sección equipos_sin_devolver falló (%): %', sqlstate, sqlerrm;
    end;

    -- garantiasPorVencer: solo equipos operativos o en reparación
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'equipo_id', q.id, 'codigo', q.codigo,
               'equipo', btrim(coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')),
               'garantia_hasta', q.garantia_hasta,
               'vencida', q.garantia_hasta < v_hoy)
             order by q.garantia_hasta, q.id), '[]'::jsonb)
        into v_garantias
        from public.equipos q
       where q.deleted_at is null
         and q.estado in ('operativo', 'en_reparacion')
         and q.garantia_hasta <= v_hoy + v_dias_gar;
    exception when others then
      v_errores := v_errores || jsonb_build_array('garantias_por_vencer');
      v_garantias := null;
      raise warning 'dashboard_resumen: la sección garantias_por_vencer falló (%): %', sqlstate, sqlerrm;
    end;

    -- custodia_hoy: entregas y devoluciones de equipos A PERSONAS hechas hoy
    -- (hora de Lima). Se arma desde asignaciones_equipo (no desde
    -- eventos_equipo) porque los eventos 'asignado'/'devuelto' también se
    -- emiten al mover a una ubicación y no dicen a quién. La hora de una
    -- devolución sale del evento 'devuelto' de hoy (puede faltar: hora null).
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'hora', to_char(u.ts at time zone 'America/Lima', 'HH24:MI'),
               'ocurrido_at', u.ts,
               'evento', u.evento,
               'equipo_id', u.equipo_id,
               'equipo_codigo', u.codigo,
               'equipo_descripcion', u.descr,
               'persona', u.persona)
             order by u.ts desc nulls last), '[]'::jsonb)
        into v_custodia
        from (
          select x.* from (
            select a.created_at as ts, 'entregado'::text as evento, q.id as equipo_id, q.codigo,
                   btrim(coalesce(t.nombre, '') || ' ' || coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')) as descr,
                   btrim(e.nombres || ' ' || e.apellidos) as persona
              from public.asignaciones_equipo a
              join public.equipos q on q.id = a.equipo_id
              join public.empleados e on e.id = a.empleado_id
              left join public.tipos_equipo t on t.id = q.tipo_id
             where (a.created_at at time zone 'America/Lima')::date = v_hoy
            union all
            select (select max(ev.created_at) from public.eventos_equipo ev
                     where ev.equipo_id = a.equipo_id and ev.evento = 'devuelto'
                       and (ev.created_at at time zone 'America/Lima')::date = v_hoy) as ts,
                   'devuelto'::text, q.id, q.codigo,
                   btrim(coalesce(t.nombre, '') || ' ' || coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')),
                   btrim(e.nombres || ' ' || e.apellidos)
              from public.asignaciones_equipo a
              join public.equipos q on q.id = a.equipo_id
              join public.empleados e on e.id = a.empleado_id
              left join public.tipos_equipo t on t.id = q.tipo_id
             where a.fecha_fin = v_hoy
          ) x
          order by x.ts desc nulls last
          limit 10
        ) u;
    exception when others then
      v_errores := v_errores || jsonb_build_array('custodia_hoy');
      v_custodia := null;
      raise warning 'dashboard_resumen: la sección custodia_hoy falló (%): %', sqlstate, sqlerrm;
    end;

    -- actas_pendientes: vista de la migración 110. Si todavía no existe
    -- (undefined_table) la sección queda en null SIN registrar error.
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'asignacion_id', ap.asignacion_id, 'equipo_id', ap.equipo_id,
               'equipo_codigo', ap.equipo_codigo, 'equipo_descripcion', ap.equipo_descripcion,
               'empleado_id', ap.empleado_id, 'empleado', ap.empleado,
               'fecha_inicio', ap.fecha_inicio, 'dias', ap.dias)
             order by ap.fecha_inicio, ap.asignacion_id), '[]'::jsonb)
        into v_actas
        from public.v_actas_pendientes ap
       where ap.activa;
    exception
      when undefined_table then
        v_actas := null;
      when others then
        v_errores := v_errores || jsonb_build_array('actas_pendientes');
        v_actas := null;
        raise warning 'dashboard_resumen: la sección actas_pendientes falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── problemas (pendientesProblemas) ──
  -- recurrentes mira tickets: exige además el módulo tickets (como la RLS
  -- de tickets lo exigiría al cliente); sin él queda en null.
  if v_p_problemas then
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'accion_id', ac.id, 'descripcion', ac.descripcion,
               'fecha_limite', ac.fecha_limite, 'problema_id', ac.problema_id,
               'problema_titulo', coalesce(pr.titulo, ''))
             order by ac.fecha_limite, ac.id), '[]'::jsonb)
        into v_acciones
        from public.acciones_correctivas ac
        left join public.problemas pr on pr.id = ac.problema_id
       where ac.estado in ('pendiente', 'en_progreso')
         and ac.deleted_at is null
         and ac.fecha_limite < v_hoy;

      v_recurrentes := null;
      if v_p_tickets then
        select coalesce(jsonb_agg(jsonb_build_object(
                 'categoria_id', r.categoria_id, 'categoria_nombre', r.categoria_nombre,
                 'total', r.total, 'tickets', r.tickets)
               order by r.total desc, r.categoria_id), '[]'::jsonb)
          into v_recurrentes
          from public.v_categorias_recurrentes r;
      end if;

      v_problemas := jsonb_build_object('acciones_vencidas', v_acciones, 'recurrentes', v_recurrentes);
    exception when others then
      v_errores := v_errores || jsonb_build_array('problemas');
      v_problemas := null;
      raise warning 'dashboard_resumen: la sección problemas falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  -- ── encuestas_sin_responder: ticket_satisfaccion sin fecha_envio ──
  -- (fecha_envio NULL = la encuesta salió y el empleado no respondió; 016)
  if v_p_tickets then
    begin
      select count(*) into v_encuestas
        from public.ticket_satisfaccion
       where fecha_envio is null;
    exception when others then
      v_errores := v_errores || jsonb_build_array('encuestas_sin_responder');
      v_encuestas := null;
      raise warning 'dashboard_resumen: la sección encuestas_sin_responder falló (%): %', sqlstate, sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'generado_en',              now(),
    'kpis',                     v_kpis,
    'tickets',                  v_tickets,
    'rotaciones_pendientes',    v_rotaciones,
    'cuentas_sin_password',     v_sin_pw,
    'equipos_sin_devolver',     v_sin_devolver,
    'licencias_por_vencer',     v_licencias,
    'garantias_por_vencer',     v_garantias,
    'altas_incompletas',        v_altas,
    'problemas',                v_problemas,
    'encuestas_sin_responder',  v_encuestas,
    'custodia_hoy',             v_custodia,
    'actas_pendientes',         v_actas,
    'solicitudes_abiertas',     v_solicitudes,
    'errores',                  v_errores
  );
end;
$$;


-- ============================================================
-- 10) Dueño y permisos
-- Todo project_admin; EXECUTE a `authenticated` SOLO en las 5 RPC públicas
-- (nunca en núcleos, funciones internas ni triggers, nunca a public/anon).
-- empleado_dar_baja_interno y dashboard_resumen_de conservan su dueño y su
-- ACL de la 102 y la 103 (create or replace no los toca).
-- ============================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.siguiente_codigo_solicitud()',
    'public.check_transicion_solicitud()',
    'public.check_transicion_solicitud_paso()',
    'public.solicitud_evaluar_cierre(uuid)',
    'public.solicitud_paso_cierra()',
    'public.solicitud_marcar_paso(uuid, text, uuid, uuid)',
    'public.solicitud_revertir_paso(text, uuid)',
    'public.solicitud_baja_crear(uuid, text, uuid[], uuid[], integer, integer, integer)',
    'public.solicitud_auto_asignacion_cuenta()',
    'public.solicitud_auto_entrega()',
    'public.solicitud_auto_asignacion_equipo()',
    'public.solicitud_auto_asignacion_licencia()',
    'public.solicitud_auto_rotacion()',
    'public.solicitud_alta_por_reingreso()',
    'public.crear_solicitud_nucleo(text, uuid, jsonb, jsonb, text, text, uuid)',
    'public.completar_paso_solicitud_nucleo(uuid, uuid, text)',
    'public.omitir_paso_solicitud_nucleo(uuid, text)',
    'public.cancelar_solicitud_nucleo(uuid, text)',
    'public.convertir_ticket_en_solicitud_nucleo(uuid, text, text)',
    'public.crear_solicitud(text, uuid, jsonb, jsonb, text, text, uuid)',
    'public.completar_paso_solicitud(uuid, uuid, text)',
    'public.omitir_paso_solicitud(uuid, text)',
    'public.cancelar_solicitud(uuid, text)',
    'public.convertir_ticket_en_solicitud(uuid, text, text)'
  ] loop
    execute format('alter function %s owner to project_admin', f);
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to project_admin', f);
  end loop;

  foreach f in array array[
    'public.crear_solicitud(text, uuid, jsonb, jsonb, text, text, uuid)',
    'public.completar_paso_solicitud(uuid, uuid, text)',
    'public.omitir_paso_solicitud(uuid, text)',
    'public.cancelar_solicitud(uuid, text)',
    'public.convertir_ticket_en_solicitud(uuid, text, text)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tablas nuevas (esperado: 5 filas, todas con relrowsecurity = true):
--    select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('solicitud_tipos','solicitud_plantilla_pasos','solicitudes','solicitud_pasos','transiciones_solicitud_permitidas') order by relname;
--
-- 2) Catálogo sembrado (esperado: 7 tipos, 24 pasos de plantilla, 2 transiciones):
--    select (select count(*) from public.solicitud_tipos) as tipos, (select count(*) from public.solicitud_plantilla_pasos) as pasos, (select count(*) from public.transiciones_solicitud_permitidas) as transiciones;
--
-- 3) Funciones (esperado: las 5 RPC authenticated=true y anon=false; núcleos y
--    triggers authenticated=false y project_admin=true):
--    select p.proname, pg_get_userbyid(p.proowner) as dueno, p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('project_admin', p.oid, 'execute') as project_admin from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'solicitud\_%' or p.proname like '%\_solicitud%' or p.proname = 'siguiente_codigo_solicitud') order by p.proname;
--
-- 4) Triggers nuevos (esperado: 10 filas, todos tgenabled = 'O'):
--    select tgrelid::regclass as tabla, tgname, tgenabled from pg_trigger where not tgisinternal and tgname in ('trg_check_transicion_solicitud','trg_check_transicion_solicitud_paso','trg_solicitud_paso_cierra','trg_solicitud_auto_asignacion_cuenta','trg_solicitud_auto_entrega','trg_solicitud_auto_asignacion_equipo','trg_solicitud_auto_asignacion_licencia','trg_solicitud_auto_rotacion','trg_solicitud_alta_por_reingreso','trg_solicitudes_updated_at') order by tgname;
--
-- 5) Los clientes no escriben (esperado: ins=false, upd=false, del=true; anon sin select):
--    select has_table_privilege('authenticated', 'public.solicitudes', 'insert') as ins, has_table_privilege('authenticated', 'public.solicitudes', 'update') as upd, has_table_privilege('authenticated', 'public.solicitudes', 'delete') as del, has_table_privilege('anon', 'public.solicitudes', 'select') as anon_sel;
--
-- 6) Policies (esperado: SELECT con puede_actual('modulo:empleados') en las 4
--    tablas de solicitudes y DELETE es_jefe() en solicitudes y solicitud_pasos):
--    select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename in ('solicitud_tipos','solicitud_plantilla_pasos','solicitudes','solicitud_pasos','transiciones_solicitud_permitidas') order by tablename, cmd;
--
-- 7) dar_baja y dashboard con el cambio (esperado: true / true / true):
--    select position('solicitud_baja_crear' in prosrc) > 0 as baja_crea_solicitud from pg_proc where pronamespace = 'public'::regnamespace and proname = 'empleado_dar_baja_interno';
--    select position('solicitudes_abiertas' in prosrc) > 0 and position('dias_ventana_alta' in prosrc) = 0 as dashboard_con_solicitudes from pg_proc where pronamespace = 'public'::regnamespace and proname = 'dashboard_resumen_de';
--    select has_function_privilege('authenticated', 'public.empleado_dar_baja_interno(uuid, text)', 'execute') = false as interno_sigue_cerrado;
--
-- 8) El Inicio sigue respondiendo (solo lectura; dashboard_resumen() no se
--    puede llamar sin sesión, el cuerpo sí con un usuario explícito). Esperado:
--    errores = [] y solicitudes_abiertas = [] hasta que haya solicitudes:
--    select public.dashboard_resumen_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1)) -> 'errores';
--    select jsonb_typeof(public.dashboard_resumen_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1)) -> 'solicitudes_abiertas');
--
-- 9) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '108';
--
-- 10) Autorización end-to-end (cuando existan las cuentas de P0-04): un
--     ASISTENTE activo SIN el módulo 'empleados' que llame
--     .rpc('crear_solicitud', ...) debe recibir 42501; con el módulo puede
--     crear y completar pasos, pero omitir un paso obligatorio da P0001
--     'El paso es obligatorio: solo un jefe puede omitirlo.'
--
-- ------------------------------------------------------------
-- Después de aplicar (NO forma parte de la migración)
-- ------------------------------------------------------------
-- a) Desplegar el frontend de Solicitudes (listado, expediente, formulario,
--    guía de alta leída de la solicitud, baja con el resultado de la RPC).
-- b) Las altas anteriores a esta migración no tienen solicitud (decisión E).
-- c) Sin cambios en edge functions: la apertura de una entrega marca sola el
--    paso `entregar_credenciales` porque el trigger escucha entregas.viewed_at.
-- ============================================================
-- FIN DE MIGRACIÓN 108
-- ============================================================
