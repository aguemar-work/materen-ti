-- ============================================================
-- MIGRACIÓN 112 — Retención y purga de datos temporales, anonimización de
-- empleados y marca de entorno (producción / branch)
-- Depende de: 099 (exigir_permiso / puede_actual; accesos_log_accion_check con
--   'purga_ejecutada'), 100 (empleados_dni_formato admite 'ANON-%'), 102
--   (empleado_eventos, registrar_evento_empleado, rol_actor_empleado,
--   contexto_transaccion), 103 (config_parametros, parametro_entero), 104
--   (intentos_publicos)
--
-- Plan de mejora Ciclo 21, §4 "104 — Retención, purga y entorno (Ley 29733)"
-- (docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md), H2-11 y parte de H3-8. La 104
-- aplicada en producción solo trajo `intentos_publicos`; TODO lo demás de esa
-- fila del plan (retención, purga, anonimización, `entorno`) va aquí, con el
-- número 112 porque 105-109 están reservadas por el plan y 110/111 ya existen.
--
-- ⚠️ NO APLICADA. Escrita y probada solo en local (npm run test:sql-local).
-- Aplicar únicamente con autorización explícita del dueño y leyendo antes
-- docs/GOTCHAS-CLI.md. Inventario de datos personales y procedimiento ARCO:
-- docs/PROTECCION-DATOS.md.
--
-- ── HALLAZGOS QUE CIERRA ────────────────────────────────────────────────────
--   R1. Datos personales sin plazo de conservación: DNI y direcciones IP en
--       los intentos de rate-limit (ticket_busqueda_intentos guarda el DNI;
--       intentos_publicos.clave puede ser DNI o IP), IP y user-agent de
--       accesos_log desde siempre, nombres en notificaciones y entregas.
--       Nada se purgaba (tampoco `contexto_transaccion`, que la 102 anunció
--       como "purga en la 104").
--   R2. Un empleado dado de baja conservaba para siempre nombre, DNI,
--       teléfono, WhatsApp y correo personal. La 102 (decisión E) bloquea el
--       DELETE físico de un empleado con historial y remite a esta migración:
--       el borrado de datos personales es la ANONIMIZACIÓN, no el DELETE.
--   R3. No había forma de saber en qué entorno corre un script. Un script de
--       anonimización (scripts/anonimizar.sql) que se ejecutara por error en
--       producción destruiría datos reales.
--
-- ── QUÉ CREA (una sección por concepto, todas idempotentes) ─────────────────
--   1) config_retencion        reglas editables por el JEFE (días y activo)
--   2) purgar_datos_temporales()  la purga (project_admin) y
--      purgar_datos_temporales_manual() (JEFE)
--   3) empleados.anonimizado_at, empleado_fecha_baja(), anonimizar_empleado()
--      (JEFE) y la vista v_empleados_anonimizables
--   4) entorno + es_branch()
--
-- ── DECISIÓN DE DISEÑO: config_retencion, no config_parametros ──────────────
-- Las reglas de retención no son un número suelto: cada una dice QUÉ tabla,
-- CUÁNTOS días, QUÉ hacer (borrar la fila o nulificar columnas) y si está
-- activa. config_parametros (103) guarda enteros/objetos por clave y su
-- trigger de validación solo sabe de números y de claves conocidas; meter
-- ocho reglas con cuatro atributos ahí obligaba a reescribir esa función.
-- Por eso la tabla propia `config_retencion` (la que ya nombraba el plan), con
-- el mismo patrón de permisos que config_parametros: SELECT para el staff,
-- UPDATE solo del JEFE y solo de `dias` y `activo`; sin INSERT ni DELETE para
-- ningún cliente. La única cifra que SÍ es un parámetro de negocio suelto, los
-- años de inactividad para anonimizar, vive en config_parametros
-- ('anios_anonimizacion_empleado' = 5, decisión 12 del plan §11).
-- La purga NO ejecuta SQL dinámico sobre un nombre de tabla leído de la fila:
-- cada tabla permitida tiene su sentencia fija en la función y la columna
-- `tabla` está limitada por un CHECK a esa lista. Agregar una regla para una
-- tabla nueva exige una migración (ampliar el CHECK y la función): es
-- deliberado, una purga automática no debe apuntar a donde no se revisó.
--
-- ── REGLAS DE RETENCIÓN SEMBRADAS ───────────────────────────────────────────
--   tabla                        días  acción              qué
--   intentos_publicos              7   borrar              filas viejas (la ventana de rate-limit es de minutos)
--   ticket_busqueda_intentos       7   borrar              tabla legada (017): guarda DNI e IP; la 104 no la retiró
--   ticket_creacion_intentos       7   borrar              tabla legada (037): guarda IP
--   encuesta_respuesta_intentos    7   borrar              tabla legada (043): guarda IP; la function `encuestas` aún la usa
--   contexto_transaccion           1   borrar              txid de transacciones ya terminadas (la 102 lo deja pendiente)
--   entregas                      30   nulificar payload   30 d después de abierta (viewed_at) o vencida (expires_at);
--                                                          la fila queda: es auditoría. payload es NOT NULL, así que
--                                                          "nulificar" = cadena vacía (''), sin tocar el esquema; una
--                                                          entrega abierta o vencida nunca se descifra (credenciales.ts
--                                                          responde ya_abierta / expirada ANTES de leer payload)
--   notificaciones               180   borrar              solo las LEÍDAS: las personales por su destinatario; las
--                                                          generales (destinatario null) por todo el staff activo que ya
--                                                          existía cuando se creó. Las no leídas no se purgan
--   accesos_log                  365   nulificar ip,       nunca se borran filas de la auditoría
--                                      user_agent
-- Se OMITEN a propósito `empleado_enlaces` y `fotos_subidas_pendientes` del
-- plan: esas tablas no existen en este esquema y no se crean "por si acaso".
-- Si una tabla de la lista desapareciera (la 104 anuncia el retiro de las tres
-- legadas), la purga la salta y lo informa ('tabla_inexistente'), no falla.
--
-- ── accesos_log: ¿SE PUEDE NULIFICAR ip / user_agent? SÍ — y por qué ────────
-- Investigado en las migraciones 010, 024, 030, 060, 064, 074, 099 y 101 y en
-- el catálogo de producción (docs/esquema/snapshot.json):
--   * accesos_log NO tiene ningún trigger de inmutabilidad (sí lo tienen
--     empleado_eventos —102—, actas —110— y otras tablas de historial). Su
--     "inmutabilidad" es solo de PERMISOS: RLS activa con una única policy de
--     SELECT (es_jefe()) y sin policy de INSERT/UPDATE/DELETE, así que ningún
--     cliente (ni el JEFE) puede alterarla; la escriben las edge functions con
--     el cliente admin (que bypasea RLS) y los triggers SECURITY DEFINER de
--     024/101.
--   * Por lo tanto la función de purga —SECURITY DEFINER, dueña project_admin—
--     puede hacer el UPDATE de ip y user_agent sin tocar nada más, y ese es
--     el UNICO permiso nuevo que se ejerce sobre la tabla: el UPDATE acotado a
--     esas dos columnas, con filtro de antigüedad, ejecutado solo desde
--     purgar_datos_temporales() (EXECUTE solo project_admin).
--   * NO se agrega un trigger de inmutabilidad a accesos_log en esta
--     migración: tendría que dejar pasar el `on delete set null` de las FK
--     user_id (auth.users) y cuenta_id (cuentas) y el reemplazo de nombres que
--     hace anonimizar_empleado() sobre `detalle`; sería un cambio de
--     comportamiento de una tabla de seguridad que esta tarea no pidió. Queda
--     anotado como endurecimiento opcional en docs/PROTECCION-DATOS.md.
--   * Lo que se conserva para siempre: quién, qué, cuándo y sobre qué cuenta.
--     Lo que se pierde a los 365 días: de dónde (IP y navegador).
--
-- ── ANONIMIZACIÓN DE EMPLEADOS ──────────────────────────────────────────────
-- anonimizar_empleado(p_id, p_motivo) — solo JEFE. Solo a un empleado Inactivo
-- cuya baja cumpla al menos N años (N = config_parametros
-- 'anios_anonimizacion_empleado', 5 por defecto, piso duro de 1: aunque el JEFE
-- escriba 0, nunca se anonimiza a quien se fue hace menos de un año). La
-- fecha de baja es la del último evento 'baja_ejecutada' (o 'estado_cambiado'
-- hacia Inactivo) de empleado_eventos; si no hay ninguno, empleados.updated_at.
-- Es IRREVERSIBLE y el historial queda íntegro.
--
--  COLUMNAS QUE SE ANONIMIZAN (y por qué)
--   empleados.nombres, apellidos   → 'Empleado' / 'anonimizado'. Identifican a la persona.
--   empleados.dni                  → 'ANON-' + 16 hex. El DNI es el identificador único
--                                    (UNIQUE): se reemplaza por un seudónimo que mantiene la
--                                    unicidad y respeta empleados_dni_formato (100).
--                                    ⚠️ DESVÍO DEL PLAN: el plan proponía
--                                    left(encode(sha256(dni),'hex'),12). Un DNI son 8 dígitos
--                                    (10^8 posibilidades): ese hash sin sal se revierte por
--                                    fuerza bruta en segundos, o sea que NO anonimiza, solo
--                                    seudonimiza. Aquí el hash lleva un uuid aleatorio que se
--                                    descarta: es irreversible. Se pierde, a propósito, la
--                                    "detección de reingreso por el mismo DNI"; un reingreso
--                                    posterior es una persona dada de alta de nuevo, con sus
--                                    propios datos y consentimiento. CONFIRMAR con el dueño.
--   empleados.correo_personal, telefono, whatsapp, notas → NULL. Contacto directo y texto libre.
--   tickets.contacto_ingresado     → NULL en los tickets vinculados al empleado y en los que
--                                    repiten su DNI/teléfono/WhatsApp/correo. Es lo que escribió
--                                    el solicitante (suele ser el DNI, un teléfono o un correo).
--   entregas.empleado_nombre       → 'Empleado anonimizado' (entregas del empleado).
--   notificaciones.titulo          → "Empleado registrado · Nombre Apellido" pasa a
--                                    "... · Empleado anonimizado" (entidad empleado).
--   eventos_equipo.detalle         → "Entregado a Nombre Apellido" / "Devuelto por Nombre Apellido"
--                                    (los escribe el trigger de asignaciones): el nombre se
--                                    sustituye por 'Empleado anonimizado' en los equipos que el
--                                    empleado tuvo; el evento y su fecha quedan.
--   accesos_log.detalle            → el nombre completo (y los que figuran en sus entregas)
--                                    se sustituye por 'Empleado anonimizado' en el texto
--                                    ("Entrega abierta — Nombre"). Es lo único de la
--                                    auditoría de accesos que se reescribe, y solo esa subcadena.
--   empleados.anonimizado_at       → columna nueva: cuándo; marca de que ya está hecho.
--   empleado_eventos               → +1 evento 'anonimizado' (quién, cuándo, motivo). Sin valores personales.
--
--  LO QUE SE CONSERVA (y por qué)
--   Historial íntegro: empleado_eventos, asignaciones_equipo/cuenta/licencia, eventos_equipo,
--   tickets (código, estado, fechas, título y descripción), actas (el PDF firmado es un documento
--   legal: se conserva y deja de ser accesible desde la UI; ver PROTECCION-DATOS.md), cargo, área,
--   ubicación, empresa y fecha de alta (datos del puesto, no identifican por sí solos).
--   NO se tocan, por no poder hacerlo de forma fiable: el texto libre de tickets
--   (titulo/descripcion), ticket_comentarios, ticket_satisfaccion.comentario, las notas de las
--   asignaciones y los motivos tecleados en empleado_eventos.detalle; si una solicitud ARCO lo
--   exige, se revisan a mano (docs/PROTECCION-DATOS.md §6). Tampoco cuentas.usuario de las
--   cuentas personales dadas de baja (suele ser el correo corporativo): es el identificador del
--   recurso que sigue en la auditoría; DECISIÓN PENDIENTE del dueño / asesoría legal.
--   Los archivos en buckets (actas firmadas, fotos de equipos, capturas de tickets) no se tocan
--   desde SQL.
--
--  Efectos colaterales conocidos: el UPDATE de empleados dispara
--  trg_evento_empleado_cambios, que deja un evento 'contacto_cambiado' (sin
--  valores) justo antes del 'anonimizado'; y el de tickets actualiza
--  tickets.updated_at de los tickets afectados.
--
-- vista v_empleados_anonimizables (security_invoker, solo JEFE): los Inactivos
-- sin anonimizar que ya cumplen el plazo. Sin DNI ni contacto.
--
-- ── ENTORNO ─────────────────────────────────────────────────────────────────
-- entorno (una sola fila, id = 1): 'produccion' (sembrado aquí) o 'branch'.
-- es_branch() es true solo si la fila dice 'branch'; sin fila → false.
-- scripts/anonimizar.sql aborta salvo que es_branch() sea true. Una branch
-- de InsForge nace como COPIA de producción, así que hereda 'produccion': el
-- paso que prepara la branch (scripts/preparar-branch.mjs, aún sin escribir)
-- debe verificar con el CLI que está conectado a la branch y recién entonces
-- hacer `update public.entorno set nombre = 'branch'`. La fila no se puede
-- borrar ni vaciar con TRUNCATE (trigger) y ningún cliente puede escribirla.
-- ⚠️ Límite honesto: el guard protege contra la ejecución ACCIDENTAL. No
-- protege contra alguien con acceso de administrador que marque 'branch' en
-- producción a mano y corra el script: la base no puede distinguir una copia
-- de su original. Esa fila solo se cambia en una branch y nunca a mano en
-- producción.
--
-- ── PROGRAMACIÓN DIARIA DE LA PURGA (NO SE EJECUTA AQUÍ) ────────────────────
-- Lo verificado (2026-10-02; 00-reconocimiento §0.5 y PLAN-V2-TICKETS-CHECKPOINTS
-- §0.3): pg_cron está instalada, PERO el rol del CLI no puede usar el esquema
-- cron ("permission denied for schema cron"), así que `cron.schedule(...)`
-- desde una migración o `db query` no es viable; `schedules.jobs` está vacío.
-- El CLI sí trae `insforge schedules create --name --cron --url
-- [--method --headers --body]`, que invoca una URL por HTTP. Pasos, DESPUÉS de
-- aplicar y verificar esta migración y con autorización del dueño:
--   Opción A (recomendada): acción `mantenimiento` en una edge function
--     (p. ej. `credenciales`, que ya tiene el cliente admin) protegida por un
--     secret propio (MANTENIMIENTO_SECRET) en un encabezado, que llame
--     rpc('purgar_datos_temporales') y devuelva los conteos. Requiere código
--     nuevo en functions/ (fuera del alcance de esta migración). Luego:
--       npx @insforge/cli secrets add MANTENIMIENTO_SECRET <valor>
--       npx @insforge/cli schedules create --name purga-datos-temporales --cron "30 8 * * *" --method POST --url "<INSFORGE_PROJECT_URL>/functions/credenciales" --headers "{\"x-mantenimiento\":\"<valor>\",\"Content-Type\":\"application/json\"}" --body "{\"action\":\"mantenimiento\"}"
--   Opción B (sin código nuevo): que el schedule llame directo al RPC de la base,
--     con la clave de administrador (rol project_admin, el único con EXECUTE):
--       npx @insforge/cli schedules create --name purga-datos-temporales --cron "30 8 * * *" --method POST --url "<INSFORGE_PROJECT_URL>/api/database/rpc/purgar_datos_temporales" --headers "{\"Authorization\":\"Bearer <API_KEY>\",\"Content-Type\":\"application/json\"}" --body "{}"
--     Compromiso: la clave de administrador queda guardada en la definición del
--     schedule (visible para quien liste los schedules); por eso es la
--     segunda opción. La ruta /api/database/rpc/<función> es la que usa el
--     SDK (api/database/rpc); que acepte esa clave para este RPC no se
--     verificó: probarlo primero en una branch.
--   Horario: "30 8 * * *" es 03:30 en Lima si el cron corre en UTC (valor por
--   defecto de pg_cron; confirmarlo al crear el schedule). Cada corrida deja
--   una fila 'purga_ejecutada' en accesos_log (visible al JEFE), que sirve
--   también de alarma: si pasan más de 2 días sin una, la programación falló.
--   Verificación: `npx @insforge/cli schedules logs <id>` y
--     select created_at, detalle from public.accesos_log where accion = 'purga_ejecutada' order by created_at desc limit 3;
--   Mientras no exista el schedule, el JEFE puede correrla a mano:
--     select public.purgar_datos_temporales_manual();   (con su sesión)
--     npx @insforge/cli db query "select public.purgar_datos_temporales()"   (como administrador)
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea (`Assertion failed ... src\win\async.c`), partir en
-- archivos temporales por sección y aplicarlos uno por uno; este archivo único
-- sigue siendo la fuente de verdad. Correr SIEMPRE el bloque "Verificación"
-- del final. Todo es idempotente: reaplicar tras un fallo parcial es seguro (no
-- pisa valores de config_retencion ni de config_parametros ya editados, ni la
-- fila de entorno).
--
-- Rollback: migrations/rollback/112_rollback.sql (la anonimización ya hecha NO
-- se revierte: es irreversible por diseño).
-- ============================================================


-- ============================================================
-- 0) Precondiciones
-- ============================================================

do $$
begin
  if to_regprocedure('public.exigir_permiso(text)') is null
     or to_regprocedure('public.puede_actual(text)') is null then
    raise exception 'La migración 112 requiere la 099 (exigir_permiso / puede_actual). Aplíquela primero.';
  end if;
  if to_regclass('public.empleado_eventos') is null
     or to_regprocedure('public.registrar_evento_empleado(uuid,text,text,text,text,text)') is null
     or to_regclass('public.contexto_transaccion') is null then
    raise exception 'La migración 112 requiere la 102 (empleado_eventos, contexto_transaccion). Aplíquela primero.';
  end if;
  if to_regclass('public.config_parametros') is null
     or to_regprocedure('public.parametro_entero(text,integer,text)') is null then
    raise exception 'La migración 112 requiere la 103 (config_parametros / parametro_entero). Aplíquela primero.';
  end if;
  if to_regclass('public.intentos_publicos') is null then
    raise exception 'La migración 112 requiere la 104 (intentos_publicos). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) config_retencion: reglas de retención (editables por el JEFE)
-- ============================================================

create table if not exists public.config_retencion (
  tabla       text        primary key,
  dias        integer     not null,
  accion      text        not null,
  columna     text,
  activo      boolean     not null default true,
  descripcion text,
  updated_by  uuid        references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint config_retencion_tabla_check check (tabla in (
    'intentos_publicos', 'ticket_busqueda_intentos', 'ticket_creacion_intentos',
    'encuesta_respuesta_intentos', 'contexto_transaccion', 'entregas',
    'notificaciones', 'accesos_log'
  )),
  constraint config_retencion_dias_check check (dias between 1 and 3650),
  constraint config_retencion_accion_check check (accion in ('borrar', 'nulificar_columna')),
  constraint config_retencion_columna_check check (
    (accion = 'borrar' and columna is null)
    or (accion = 'nulificar_columna' and columna is not null)
  )
);

alter table public.config_retencion owner to project_admin;

comment on table public.config_retencion is
  'Reglas de retención de datos personales y temporales (112). Una fila por tabla; la lista de tablas es cerrada (CHECK) porque purgar_datos_temporales() tiene una sentencia fija por tabla. El JEFE solo cambia dias y activo. Sin INSERT/DELETE desde el cliente.';
comment on column public.config_retencion.dias is
  'Antigüedad (días) a partir de la cual se aplica la acción. Entre 1 y 3650.';
comment on column public.config_retencion.accion is
  'borrar = elimina la fila; nulificar_columna = deja la fila y vacía las columnas de "columna".';
comment on column public.config_retencion.columna is
  'Columnas afectadas por nulificar_columna (informativo; la sentencia es fija en la función).';

create index if not exists idx_config_retencion_updated_by
  on public.config_retencion (updated_by);

alter table public.config_retencion enable row level security;

drop policy if exists "staff puede ver config retencion" on public.config_retencion;
create policy "staff puede ver config retencion"
  on public.config_retencion for select
  using (public.es_staff());

drop policy if exists "solo jefe puede editar config retencion" on public.config_retencion;
create policy "solo jefe puede editar config retencion"
  on public.config_retencion for update
  using (public.es_jefe())
  with check (public.es_jefe());

-- Sin policy de INSERT/DELETE y sin privilegio de tabla (defensa en
-- profundidad, igual que config_parametros): del UPDATE solo quedan dias y activo.
revoke all on table public.config_retencion from public, anon, authenticated;
grant select on table public.config_retencion to authenticated;
grant update (dias, activo) on table public.config_retencion to authenticated;

create or replace function public.config_retencion_validar()
returns trigger
language plpgsql
as $$
begin
  if new.tabla is distinct from old.tabla
     or new.accion is distinct from old.accion
     or new.columna is distinct from old.columna then
    raise exception 'Solo se pueden cambiar los días y el estado activo de una regla de retención.';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

alter function public.config_retencion_validar() owner to project_admin;
revoke all on function public.config_retencion_validar() from public, anon, authenticated;

drop trigger if exists trg_config_retencion_validar on public.config_retencion;
create trigger trg_config_retencion_validar
  before update on public.config_retencion
  for each row execute function public.config_retencion_validar();

-- NO se pisan los valores ya editados por el JEFE al reaplicar.
insert into public.config_retencion (tabla, dias, accion, columna, descripcion) values
  ('intentos_publicos', 7, 'borrar', null,
   'Intentos de endpoints públicos (rate-limit): ámbito + IP/DNI/usuario. La ventana útil es de minutos.'),
  ('ticket_busqueda_intentos', 7, 'borrar', null,
   'Tabla legada (017) de intentos de búsqueda pública por DNI: guarda DNI e IP.'),
  ('ticket_creacion_intentos', 7, 'borrar', null,
   'Tabla legada (037) de intentos de creación pública de tickets: guarda IP.'),
  ('encuesta_respuesta_intentos', 7, 'borrar', null,
   'Tabla legada (043) de intentos de respuesta a encuestas: guarda IP.'),
  ('contexto_transaccion', 1, 'borrar', null,
   'Contexto (rol, origen) de transacciones ya terminadas (102). Sin valor tras el día.'),
  ('entregas', 30, 'nulificar_columna', 'payload',
   'Credenciales cifradas de una entrega: se vacían 30 días después de abierta o vencida. La fila queda como auditoría.'),
  ('notificaciones', 180, 'borrar', null,
   'Solo notificaciones leídas (las personales por su destinatario; las generales por todo el staff activo).'),
  ('accesos_log', 365, 'nulificar_columna', 'ip, user_agent',
   'IP y navegador de cada registro de la auditoría. Las filas nunca se borran.')
on conflict (tabla) do nothing;

-- Parámetro de negocio de la anonimización (decisión 12 del plan: 5 años).
-- El JEFE lo edita desde config_parametros; el piso duro de 1 año está en la función.
insert into public.config_parametros (clave, valor, descripcion) values
  ('anios_anonimizacion_empleado', '5'::jsonb,
   'Años desde la baja tras los cuales un empleado Inactivo puede anonimizarse (anonimizar_empleado, 112). Mínimo efectivo: 1.')
on conflict (clave) do nothing;


-- ============================================================
-- 2) purgar_datos_temporales(): la purga
-- Una sentencia fija por tabla (ver la nota de diseño de la cabecera). Cada
-- regla corre en su propio subbloque: si una falla se informa y las demás
-- siguen. La auditoría es FAIL-CLOSED: si no se puede escribir la fila
-- 'purga_ejecutada' en accesos_log, toda la purga se revierte.
-- Devuelve: { ejecutada_en, total, errores, tablas: { <tabla>: <conteo> |
-- 'tabla_inexistente' | 'regla_sin_implementacion' | 'error <SQLSTATE>' } }
-- o { omitida: true } si otra purga está corriendo.
-- ============================================================

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
  'Aplica las reglas activas de config_retencion y registra purga_ejecutada en accesos_log (solo conteos). EXECUTE solo project_admin: lo invocan el cron/schedule y purgar_datos_temporales_manual(). 112.';

-- Envoltorio para el JEFE (botón de Configuración o consola): mismo resultado.
create or replace function public.purgar_datos_temporales_manual()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('rol:jefe');
  return public.purgar_datos_temporales();
end;
$$;

alter function public.purgar_datos_temporales_manual() owner to project_admin;
revoke all on function public.purgar_datos_temporales_manual() from public, anon;
grant execute on function public.purgar_datos_temporales_manual() to authenticated;

comment on function public.purgar_datos_temporales_manual() is
  'Ejecuta la purga desde una sesión de JEFE (guard rol:jefe, 42501 si no). 112.';


-- ============================================================
-- 3) Anonimización de empleados
-- ============================================================

alter table public.empleados add column if not exists anonimizado_at timestamptz;

comment on column public.empleados.anonimizado_at is
  'Cuándo se anonimizaron los datos personales del empleado (anonimizar_empleado, 112). NULL = no anonimizado. Irreversible.';

-- Fecha de la baja: último 'baja_ejecutada' o cambio de estado hacia Inactivo
-- de la hoja de vida; si no hay ninguno (empleado creado ya Inactivo), la
-- última actualización de la fila. SECURITY INVOKER: respeta la RLS de quien
-- pregunta (empleado_eventos es legible por el staff).
create or replace function public.empleado_fecha_baja(p_empleado_id uuid)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select max(x.created_at)
       from public.empleado_eventos x
      where x.empleado_id = p_empleado_id
        and (x.evento = 'baja_ejecutada'
             or (x.evento = 'estado_cambiado' and x.valor_nuevo = 'Inactivo'))),
    (select e.updated_at from public.empleados e where e.id = p_empleado_id)
  );
$$;

alter function public.empleado_fecha_baja(uuid) owner to project_admin;
revoke all on function public.empleado_fecha_baja(uuid) from public, anon;
grant execute on function public.empleado_fecha_baja(uuid) to authenticated;

comment on function public.empleado_fecha_baja(uuid) is
  'Fecha de baja de un empleado: último baja_ejecutada / estado_cambiado a Inactivo, o updated_at si no hay evento. 112.';

-- Implementación (solo project_admin, probable sin sesión en tests/cron).
create or replace function public.anonimizar_empleado_interno(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp      public.empleados;
  v_motivo   text;
  v_anios    integer;
  v_baja     timestamptz;
  v_nombres  text[];
  v_nom      text;
  v_dni_anon text;
  v_n        integer;
  v_tickets  integer := 0;
  v_entregas integer := 0;
  v_notifs   integer := 0;
  v_logs     integer := 0;
  v_eventos  integer := 0;
  v_abiertas integer := 0;
begin
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'El motivo de la anonimización es obligatorio.';
  end if;
  if length(v_motivo) > 200 then
    raise exception 'El motivo no puede superar los 200 caracteres.';
  end if;

  select * into v_emp from public.empleados where id = p_id for update;
  if not found then
    raise exception 'Empleado no encontrado';
  end if;
  if v_emp.anonimizado_at is not null then
    raise exception 'El empleado ya fue anonimizado.';
  end if;
  if v_emp.estado <> 'Inactivo' then
    raise exception 'Solo se anonimiza a un empleado Inactivo (estado actual: %).', v_emp.estado;
  end if;

  v_anios := greatest(public.parametro_entero('anios_anonimizacion_empleado', 5), 1);
  v_baja := public.empleado_fecha_baja(p_id);
  if v_baja > now() - make_interval(years => v_anios) then
    raise exception 'El empleado aún no cumple % año(s) desde su baja (registrada el %).',
      v_anios, to_char(v_baja at time zone 'America/Lima', 'YYYY-MM-DD');
  end if;

  -- Nombres con los que pudo quedar escrito en textos libres: el actual y los
  -- que figuran en sus entregas (el nombre pudo editarse después).
  select coalesce(array_agg(distinct n), '{}'::text[]) into v_nombres
    from (
      select btrim(v_emp.nombres || ' ' || v_emp.apellidos) as n
      union
      select btrim(en.empleado_nombre) from public.entregas en where en.empleado_id = p_id
    ) x
   where n is not null and length(n) >= 5 and n <> 'Empleado anonimizado';

  -- Tickets: lo que escribió el solicitante (DNI, teléfono, correo). El resto
  -- del ticket (código, estado, fechas, título, descripción) queda.
  update public.tickets t
     set contacto_ingresado = null
   where t.contacto_ingresado is not null
     and (
       t.empleado_id = p_id
       or lower(btrim(t.contacto_ingresado)) in (
         select lower(btrim(v))
           from unnest(array[v_emp.dni, v_emp.telefono, v_emp.whatsapp, v_emp.correo_personal]) as v
          where v is not null and btrim(v) <> ''
       )
     );
  get diagnostics v_tickets = row_count;

  -- Entregas del empleado: el nombre. (payload lo vacía la purga a los 30 días.)
  update public.entregas
     set empleado_nombre = 'Empleado anonimizado'
   where empleado_id = p_id
     and empleado_nombre <> 'Empleado anonimizado';
  get diagnostics v_entregas = row_count;

  -- Notificaciones del empleado ("Empleado registrado · Nombre Apellido").
  update public.notificaciones
     set titulo = regexp_replace(titulo, ' · .*$', ' · Empleado anonimizado')
   where entidad_tipo = 'empleado'
     and entidad_id = p_id
     and titulo ~ ' · '
     and titulo !~ ' · Empleado anonimizado$';
  get diagnostics v_notifs = row_count;

  -- Auditoría: solo la subcadena del nombre dentro de `detalle`.
  foreach v_nom in array v_nombres loop
    update public.accesos_log
       set detalle = replace(detalle, v_nom, 'Empleado anonimizado')
     where detalle is not null
       and strpos(detalle, v_nom) > 0;
    get diagnostics v_n = row_count;
    v_logs := v_logs + v_n;
  end loop;

  -- Historial de equipos: el trigger de asignaciones escribió el nombre en
  -- eventos_equipo.detalle ("Entregado a ...", "Devuelto por ..."). Solo en los
  -- equipos que el empleado tuvo; el evento y su fecha se conservan.
  foreach v_nom in array v_nombres loop
    update public.eventos_equipo
       set detalle = replace(detalle, v_nom, 'Empleado anonimizado')
     where detalle is not null
       and strpos(detalle, v_nom) > 0
       and equipo_id in (select a.equipo_id from public.asignaciones_equipo a where a.empleado_id = p_id);
    get diagnostics v_n = row_count;
    v_eventos := v_eventos + v_n;
  end loop;

  -- Asignaciones abiertas (informativo: no bloquea; el historial se conserva).
  select (select count(*) from public.asignaciones_equipo where empleado_id = p_id and fecha_fin is null)
       + (select count(*) from public.asignaciones_cuenta where empleado_id = p_id and fecha_fin is null)
       + (select count(*) from public.asignaciones_licencia where empleado_id = p_id and fecha_fin is null)
    into v_abiertas;

  -- El empleado. DNI: seudónimo irreversible (hash con un uuid aleatorio que se descarta).
  v_dni_anon := 'ANON-' || left(encode(sha256(convert_to(v_emp.dni || ':' || gen_random_uuid()::text, 'UTF8')), 'hex'), 16);

  update public.empleados
     set nombres = 'Empleado',
         apellidos = 'anonimizado',
         dni = v_dni_anon,
         correo_personal = null,
         telefono = null,
         whatsapp = null,
         notas = null,
         anonimizado_at = now()
   where id = p_id;

  perform public.registrar_evento_empleado(
    p_id, 'anonimizado', 'datos_personales', null, null,
    'Datos personales anonimizados. Motivo: ' || v_motivo);

  return jsonb_build_object(
    'empleado_id', p_id,
    'tickets_contacto', v_tickets,
    'entregas', v_entregas,
    'notificaciones', v_notifs,
    'accesos_log_detalle', v_logs,
    'eventos_equipo_detalle', v_eventos,
    'asignaciones_abiertas', v_abiertas
  );
end;
$$;

alter function public.anonimizar_empleado_interno(uuid, text) owner to project_admin;
revoke all on function public.anonimizar_empleado_interno(uuid, text) from public, anon, authenticated;
grant execute on function public.anonimizar_empleado_interno(uuid, text) to project_admin;

comment on function public.anonimizar_empleado_interno(uuid, text) is
  'Anonimiza a un empleado Inactivo con baja de N años o más (irreversible). Sin guard de sesión: EXECUTE solo project_admin; la RPC pública es anonimizar_empleado(). 112.';

-- RPC pública: solo JEFE.
create or replace function public.anonimizar_empleado(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('rol:jefe');
  return public.anonimizar_empleado_interno(p_id, p_motivo);
end;
$$;

alter function public.anonimizar_empleado(uuid, text) owner to project_admin;
revoke all on function public.anonimizar_empleado(uuid, text) from public, anon;
grant execute on function public.anonimizar_empleado(uuid, text) to authenticated;

comment on function public.anonimizar_empleado(uuid, text) is
  'Anonimiza los datos personales de un empleado Inactivo con baja de 5 años o más (parámetro anios_anonimizacion_empleado). Solo JEFE (42501 si no). Motivo obligatorio (máx. 200, sin datos personales). Conserva el historial. Irreversible. 112.';

-- Candidatos: Inactivos sin anonimizar que ya cumplen el plazo. Solo el JEFE
-- ve filas (la condición puede_actual('rol:jefe') va dentro de la vista);
-- security_invoker: respeta además la RLS de empleados.
create or replace view public.v_empleados_anonimizables
with (security_invoker = true) as
select e.id               as empleado_id,
       e.nombres,
       e.apellidos,
       b.fecha_baja,
       (extract(year from age(now(), b.fecha_baja)))::integer as anios_desde_baja,
       greatest(public.parametro_entero('anios_anonimizacion_empleado', 5), 1) as anios_requeridos
  from public.empleados e
 cross join lateral (select public.empleado_fecha_baja(e.id) as fecha_baja) b
 where public.puede_actual('rol:jefe')
   and e.estado = 'Inactivo'
   and e.anonimizado_at is null
   and b.fecha_baja <= now() - make_interval(years => greatest(public.parametro_entero('anios_anonimizacion_empleado', 5), 1));

revoke all on table public.v_empleados_anonimizables from public, anon, authenticated;
grant select on table public.v_empleados_anonimizables to authenticated;

comment on view public.v_empleados_anonimizables is
  'Empleados Inactivos sin anonimizar cuya baja ya cumple el plazo (anios_anonimizacion_empleado). Solo devuelve filas al JEFE. Sin DNI ni contacto. 112.';


-- ============================================================
-- 4) entorno: producción o branch
-- ============================================================

create table if not exists public.entorno (
  id         smallint    primary key default 1,
  nombre     text        not null default 'produccion',
  marcado_at timestamptz not null default now(),
  constraint entorno_una_fila check (id = 1),
  constraint entorno_nombre_check check (nombre in ('produccion', 'branch'))
);

alter table public.entorno owner to project_admin;

comment on table public.entorno is
  'Una sola fila (id = 1): produccion o branch. scripts/anonimizar.sql solo corre si es_branch(). Una branch hereda la fila de producción; solo el paso que prepara la branch la cambia, nunca a mano en producción. 112.';

-- Producción nace marcada como tal; reaplicar no la pisa.
insert into public.entorno (id, nombre) values (1, 'produccion')
on conflict (id) do nothing;

create or replace function public.entorno_proteger()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.marcado_at := now();
    return new;
  end if;
  raise exception 'La fila de entorno no se puede borrar ni vaciar.';
end;
$$;

alter function public.entorno_proteger() owner to project_admin;
revoke all on function public.entorno_proteger() from public, anon, authenticated;

drop trigger if exists trg_entorno_no_borrar on public.entorno;
create trigger trg_entorno_no_borrar
  before delete on public.entorno
  for each row execute function public.entorno_proteger();

drop trigger if exists trg_entorno_no_vaciar on public.entorno;
create trigger trg_entorno_no_vaciar
  before truncate on public.entorno
  for each statement execute function public.entorno_proteger();

drop trigger if exists trg_entorno_actualizar on public.entorno;
create trigger trg_entorno_actualizar
  before update on public.entorno
  for each row execute function public.entorno_proteger();

alter table public.entorno enable row level security;

drop policy if exists "staff puede ver entorno" on public.entorno;
create policy "staff puede ver entorno"
  on public.entorno for select
  using (public.es_staff());

-- Ningún cliente escribe (solo administrador por SQL).
revoke all on table public.entorno from public, anon, authenticated;
grant select on table public.entorno to authenticated;

-- true solo si la fila dice 'branch'. Sin fila: false (falla cerrado).
create or replace function public.es_branch()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select nombre = 'branch' from public.entorno where id = 1), false);
$$;

alter function public.es_branch() owner to project_admin;
revoke all on function public.es_branch() from public, anon;
grant execute on function public.es_branch() to authenticated;

comment on function public.es_branch() is
  'true si este entorno es una branch de pruebas (entorno.nombre = branch). false en producción o sin fila. 112.';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tablas nuevas, RLS activa (esperado: 2 filas, relrowsecurity = true):
--    select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('config_retencion','entorno') order by relname;
--
-- 2) Reglas sembradas (esperado: 8 filas; accesos_log 365 y entregas 30):
--    select tabla, dias, accion, columna, activo from public.config_retencion order by tabla;
--
-- 3) Parámetro de anonimización (esperado: 5):
--    select clave, valor from public.config_parametros where clave = 'anios_anonimizacion_empleado';
--
-- 4) Funciones (esperado: 8 filas, dueño project_admin, SD salvo empleado_fecha_baja):
--    select proname, pg_get_userbyid(proowner) as dueno, prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname in ('purgar_datos_temporales','purgar_datos_temporales_manual','anonimizar_empleado','anonimizar_empleado_interno','empleado_fecha_baja','es_branch','config_retencion_validar','entorno_proteger') order by proname;
--
-- 5) EXECUTE (esperado: purgar_datos_temporales y anonimizar_empleado_interno
--    solo project_admin; las demás RPC authenticated=true, anon=false):
--    select p, has_function_privilege('anon', p, 'execute') as anon, has_function_privilege('authenticated', p, 'execute') as authenticated, has_function_privilege('project_admin', p, 'execute') as project_admin from unnest(array['public.purgar_datos_temporales()','public.purgar_datos_temporales_manual()','public.anonimizar_empleado(uuid,text)','public.anonimizar_empleado_interno(uuid,text)','public.empleado_fecha_baja(uuid)','public.es_branch()']) as p;
--
-- 6) Privilegios de config_retencion (esperado: sel=true; ins=false; upd_dias=true; upd_tabla=false):
--    select has_table_privilege('authenticated', 'public.config_retencion', 'select') as sel, has_table_privilege('authenticated', 'public.config_retencion', 'insert') as ins, has_column_privilege('authenticated', 'public.config_retencion', 'dias', 'update') as upd_dias, has_column_privilege('authenticated', 'public.config_retencion', 'tabla', 'update') as upd_tabla;
--
-- 7) Entorno (esperado: 1 fila 'produccion'; es_branch() = false):
--    select id, nombre from public.entorno;
--    select public.es_branch();
--
-- 8) Columna y vista de anonimización (esperado: 1 fila cada una; en la vista,
--    sin sesión de JEFE, 0 filas):
--    select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'empleados' and column_name = 'anonimizado_at';
--    select count(*) from public.v_empleados_anonimizables;
--
-- 9) Qué haría la purga hoy, SIN ejecutarla (solo lectura, por tabla):
--    select (select count(*) from public.intentos_publicos where created_at < now() - interval '7 days') as intentos_publicos, (select count(*) from public.ticket_busqueda_intentos where created_at < now() - interval '7 days') as busqueda, (select count(*) from public.accesos_log where created_at < now() - interval '365 days' and (ip is not null or user_agent is not null)) as accesos_log_ip;
--
-- 10) Primera purga real (solo con autorización; deja una fila purga_ejecutada):
--     npx @insforge/cli db query "select public.purgar_datos_temporales()"
--     select created_at, detalle from public.accesos_log where accion = 'purga_ejecutada' order by created_at desc limit 1;
--
-- 11) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--     select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '112';
--
-- 12) Autorización end-to-end (cuando existan las cuentas de P0-04): un
--     ASISTENTE que llame .rpc('anonimizar_empleado', ...) o
--     .rpc('purgar_datos_temporales_manual') debe recibir 42501.
-- ============================================================
-- FIN DE MIGRACIÓN 112
-- ============================================================
