-- ============================================================
-- MIGRACIÓN 103 — Parámetros configurables, vistas de cupo/recurrencia y
-- dashboard_resumen(): una sola llamada para el Inicio
-- Depende de: 001 (set_updated_at), 003 (es_staff/es_jefe), 011 (licencias,
--   asignaciones_licencia), 013 (equipos, asignaciones_equipo, eventos_equipo),
--   016 (tickets, categorias_ticket, ticket_satisfaccion), 033 (problemas,
--   acciones_correctivas, problema_tickets), 056 (staff_modulos_permisos),
--   099 (puede_actual / exigir_permiso)
-- Una migración POSTERIOR (110, actas firmadas) crea v_actas_pendientes, que
-- dashboard_resumen() ya consulta de forma tolerante (ver sección 5).
--
-- Plan de mejora Ciclo 21, §4 "103 — Parámetros y dashboard"
-- (docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md) y §3.3 pantalla 1 (Inicio).
--
-- ⚠️ NO APLICADA. Escrita y revisada solo en local (parseada con libpg-query;
-- los SELECT de cada sección se contrastaron contra producción en modo
-- lectura). Aplicarla es una decisión del dueño, después de la 099 y de la 101
-- (esta migración no depende de la 101, pero la 110 sí).
--
-- ── Qué hay hoy y qué reemplaza esto ───────────────────────────────────────
-- El Inicio dispara ≈25 requests (anexo E §7): getEstadisticas (7),
-- listPendientes (5), pendientesTickets (1), misTickets (1),
-- pendientesProblemas (4), altasIncompletas (1) y, aparte,
-- AppLayout.pendientesTickets() repetido. Los umbrales de 30 días y de 3 días
-- están como literales en dominio-empleados.js:44 (DIAS_VENTANA_ALTA),
-- dominio-licencias.js:12-19 (DIAS_POR_VENCER_LICENCIA), dashboard.js
-- (garantías, ticket viejo) y problemas.js:247-271 (3 tickets / 30 días).
--
-- ── TABLA DE FIRMAS (contrato con el frontend) ─────────────────────────────
--
--   TABLA  public.config_parametros
--     (clave text PK, valor jsonb not null, descripcion text,
--      updated_by uuid, updated_at timestamptz default now())
--     RLS: SELECT es_staff(); UPDATE es_jefe(); sin INSERT ni DELETE para
--     ningún cliente (privilegios revocados además de la RLS). Solo la
--     columna `valor` es actualizable desde el cliente.
--     Trigger BEFORE UPDATE validar (no cambia la clave ni el tipo del valor;
--     enteros >= 0; umbral_recurrencia_tickets con n y dias >= 1) y
--     set_updated_at; `updated_by` lo fija auth.uid().
--     Filas sembradas (on conflict do nothing):
--       dias_ventana_alta            30
--       dias_por_vencer_licencia     30
--       dias_por_vencer_garantia     30
--       umbral_recurrencia_tickets   {"n":3,"dias":30}
--       dias_ticket_viejo            3
--       dias_autocierre_resuelto     5     (lo usará el plan V2, 098)
--       max_reavisos                 3     (lo usará el plan V2, 098)
--       dias_acta_sin_adjuntar       3     (lo usa la 110)
--       dias_verificacion_equipo     180   (lo usará verificar_equipo, 101)
--       contacto_ti                  {"texto":"","correo":"","telefono":""}
--                                    VACÍO: lo completa el dueño; la página
--                                    pública del QR (/e/:codigo) lo mostrará.
--
--   FUNCIÓN public.parametro_entero(p_clave text, p_defecto integer,
--                                   p_campo text default null) → integer
--     STABLE, SECURITY INVOKER. Lee un parámetro numérico (o un campo
--     numérico de un valor objeto: p_campo). Si falta o no es un entero, devuelve
--     p_defecto. EXECUTE a authenticated (la usan las vistas security_invoker).
--
--   FUNCIÓN public.contacto_ti_publico() → jsonb {texto, correo, telefono}
--     STABLE, SECURITY DEFINER. EXECUTE a anon y authenticated: es el ÚNICO
--     dato de config_parametros que se publica sin sesión, y solo los tres
--     campos de contacto (nunca otra clave). Para la página del QR.
--
--   VISTA public.v_licencias_cupo  (security_invoker = true, PG 15)
--     (licencia_id, software, tipo, cantidad, origen, usados_directos,
--      usados_cuenta, usados, libres, fecha_vencimiento)
--     Replica frontend/src/api/domains/licencias.js (mapLicencia): si la
--     licencia tiene cuenta_id, `usados` = asignaciones ACTIVAS de esa cuenta
--     (origen = 'cuenta'); si no, las asignaciones_licencia activas
--     (origen = 'licencia'). `libres` = max(cantidad - usados, 0).
--     usados_directos/usados_cuenta se exponen para auditar el caso (hoy 0)
--     de una licencia con cuenta Y asignaciones directas. Excluye eliminadas.
--
--   VISTA public.v_categorias_recurrentes  (security_invoker = true)
--     (categoria_id, categoria_nombre, total, primer_ticket_at,
--      ultimo_ticket_at, tickets jsonb[{ticket_id, codigo, titulo, desde}])
--     Categorías con >= n tickets (cualquier estado) en los últimos `dias`
--     días (hora de Lima) que no están vinculados a ningún problema;
--     n y dias vienen de umbral_recurrencia_tickets. Replica
--     problemas.js:listCategoriasRecurrentes.
--
--   FUNCIÓN public.dashboard_resumen() → jsonb
--     SECURITY DEFINER, STABLE, search_path = public. Es un envoltorio de una
--     línea sobre public.dashboard_resumen_de(auth.uid()): EXECUTE solo a
--     authenticated. Guard: staff activo ('No autorizado', SQLSTATE 42501).
--   FUNCIÓN public.dashboard_resumen_de(p_user uuid) → jsonb
--     El cuerpo, para un usuario explícito (permisos con puede(p_user, ...)).
--     EXECUTE solo project_admin: así un cliente no puede pedir el resumen de
--     otro usuario y las pruebas de tests/db pueden ejercerla sin simular una
--     sesión (el servidor bloquea la configuración de sesión; mismo patrón que puede/puede_actual
--     de la 099). Forma EXACTA del resultado (cada sección es null si el
--     usuario no tiene el módulo —eso NO es un error— o si su bloque falló,
--     en cuyo caso su nombre queda en `errores`):
--
--     {
--       generado_en: timestamptz,
--       kpis: {                              -- null por campo sin módulo
--         empleados_activos, empleados_total,        -- empleados
--         cuentas_asignadas, correos_compartidos,
--         cuentas_por_rotar,                         -- correos
--         licencias_por_vencer,                      -- licencias
--         equipos_total,                             -- equipos
--         tickets_abiertos                           -- tickets
--       },
--       tickets: {                           -- módulo tickets
--         sin_asignar: [{ticket_id, codigo, titulo, desde}],
--         sin_vincular: [{ticket_id, codigo, titulo, desde}],
--         viejos:       [{ticket_id, codigo, titulo, desde}],
--         mios:         [{id, codigo, titulo, prioridad, estado, created_at}],  -- 5
--         mios_total: int,                   -- todos los vigentes asignados al usuario
--         vigentes: int,
--         vencidos: null, por_vencer: null   -- RESERVADOS: reloj de tickets (094/105)
--       },
--       rotaciones_pendientes: [{cuenta_id, usuario, tipo_cuenta, plataforma,
--                                titulares: [{id, nombre}]}],          -- correos
--       cuentas_sin_password:  [{...misma forma...}],                  -- correos
--       equipos_sin_devolver: [{asignacion_id, codigo, equipo, empleado,
--                               empleado_id, desde,
--                               empleado_baja_at}],                    -- equipos
--                               -- empleado_baja_at: APROXIMACIÓN (ver la sección 5)
--       licencias_por_vencer: [{licencia_id, software, cantidad,
--                               fecha_vencimiento, empresa, vencida}], -- licencias
--       garantias_por_vencer: [{equipo_id, codigo, equipo, garantia_hasta,
--                               vencida}],                             -- equipos
--       altas_incompletas: [{empleado_id, nombre, cargo, fecha_alta, dias,
--                            faltan: ['cuenta']}],                     -- correos
--       problemas: {                         -- módulo problemas
--         acciones_vencidas: [{accion_id, descripcion, fecha_limite,
--                              problema_id, problema_titulo}],
--         recurrentes: [{categoria_id, categoria_nombre, total,
--                        tickets: [{ticket_id, codigo, titulo, desde}]}]
--                      -- null si además falta el módulo tickets
--       },
--       encuestas_sin_responder: int,        -- módulo tickets
--       custodia_hoy: [{hora 'HH24:MI' (Lima), ocurrido_at, evento
--                       'entregado'|'devuelto', equipo_id, equipo_codigo,
--                       equipo_descripcion, persona}],                 -- equipos
--       actas_pendientes: [{asignacion_id, equipo_id, equipo_codigo,
--                           equipo_descripcion, empleado_id, empleado,
--                           fecha_inicio, dias}],  -- equipos; solo equipos que
--                           -- la persona AÚN tiene (activa); null mientras la 110 no exista
--       solicitudes_abiertas: [],            -- RESERVADO: solicitudes de servicio (108)
--       errores: ['<seccion>', ...]
--     }
--
--     Los nombres de campo de cada fila son los mismos que consumen hoy
--     pendientesFeed.js y DashboardView.vue (cuenta_id, licencia_id,
--     asignacion_id, ticket_id, desde, accion_id, empleado_id, dias, ...). Las
--     listas conservan los mismos filtros, umbrales y orden que los métodos del
--     cliente a los que reemplazan; ninguna se recorta salvo `mios` (5) y
--     `custodia_hoy` (10). Datos personales: solo nombre y apellido; jamás
--     DNI, teléfono, correo ni contraseñas.
--
-- ── Equivalencias con el código actual ─────────────────────────────────────
--   kpis                 ← dashboardApi.getEstadisticas (snake_case)
--   rotaciones_pendientes, cuentas_sin_password, equipos_sin_devolver,
--   licencias_por_vencer, garantias_por_vencer
--                        ← dashboardApi.listPendientes (porRotar, sinPassword,
--                          equiposSinDevolver, licenciasPorVencer,
--                          garantiasPorVencer)
--   tickets.sin_asignar/sin_vincular/viejos
--                        ← dashboardApi.pendientesTickets
--   tickets.mios         ← dashboardApi.misTickets (ordenarPorUrgencia)
--   altas_incompletas    ← empleadosApi.altasIncompletas
--   problemas            ← problemasApi.pendientesProblemas
--   Diferencia deliberada: las fechas de corte se calculan con la hora de
--   Lima (America/Lima) y no con la del navegador. "Ticket viejo" reproduce el
--   criterio del cliente: fecha de creación (Lima) ANTERIOR a hoy - N días.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/apply-migration.mjs` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea (`Assertion failed ... src\win\async.c`), partir en
-- archivos temporales por sección y aplicarlos uno por uno; el archivo único
-- en migrations/ sigue siendo la fuente de verdad. Correr SIEMPRE el bloque de
-- "Verificación" del final. Todo es idempotente (reaplicar es seguro).
-- Rollback: migrations/rollback/103_rollback.sql (revertir ANTES la 110).
-- ============================================================


-- ============================================================
-- 0) Precondición: la 099 debe estar aplicada
-- ============================================================

do $$
begin
  if to_regprocedure('public.puede_actual(text)') is null
     or to_regprocedure('public.exigir_permiso(text)') is null then
    raise exception 'La migración 103 requiere la 099 (puede_actual / exigir_permiso). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) config_parametros: umbrales que hoy son literales en el cliente
-- ============================================================

create table if not exists public.config_parametros (
  clave       text        primary key,
  valor       jsonb       not null,
  descripcion text,
  updated_by  uuid        references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.config_parametros owner to project_admin;

comment on table public.config_parametros is
  'Parámetros de negocio editables por el JEFE (umbrales de días, contacto de TI). Sin INSERT/DELETE desde el cliente: las claves las crean las migraciones. Migración 103.';
comment on column public.config_parametros.valor is
  'jsonb: número entero (días, cantidades) u objeto. El tipo de cada clave no cambia (lo valida config_parametros_validar).';

create index if not exists idx_config_parametros_updated_by
  on public.config_parametros (updated_by);

alter table public.config_parametros enable row level security;

drop policy if exists "staff puede ver parametros" on public.config_parametros;
create policy "staff puede ver parametros"
  on public.config_parametros for select
  using (public.es_staff());

drop policy if exists "solo jefe puede editar parametros" on public.config_parametros;
create policy "solo jefe puede editar parametros"
  on public.config_parametros for update
  using (public.es_jefe())
  with check (public.es_jefe());

-- Sin policy de INSERT/DELETE (RLS las niega) Y sin privilegio de tabla:
-- defensa en profundidad, igual que intentos_publicos (104). Del UPDATE solo
-- queda la columna `valor`: la descripción y la clave son de la migración.
revoke all on table public.config_parametros from public, anon, authenticated;
grant select on table public.config_parametros to authenticated;
grant update (valor) on table public.config_parametros to authenticated;

-- Validación del valor: el cliente solo puede cambiar el valor dentro del
-- mismo tipo y con un rango sensato. (Corre también para project_admin: es
-- una regla de integridad, no de permisos.)
create or replace function public.config_parametros_validar()
returns trigger
language plpgsql
as $$
declare
  v_n    numeric;
  v_dias numeric;
begin
  if new.clave is distinct from old.clave then
    raise exception 'La clave de un parámetro no se puede cambiar.';
  end if;

  new.updated_by := auth.uid();

  if jsonb_typeof(new.valor) is distinct from jsonb_typeof(old.valor) then
    raise exception 'El valor de "%" debe ser de tipo %.', old.clave, jsonb_typeof(old.valor);
  end if;

  if jsonb_typeof(new.valor) = 'number' then
    if (new.valor #>> '{}')::numeric < 0 or (new.valor #>> '{}')::numeric <> trunc((new.valor #>> '{}')::numeric) then
      raise exception 'El valor de "%" debe ser un entero mayor o igual a 0.', old.clave;
    end if;
  end if;

  if old.clave = 'umbral_recurrencia_tickets' then
    if coalesce(new.valor ->> 'n', '') !~ '^[1-9][0-9]{0,3}$' or coalesce(new.valor ->> 'dias', '') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'El umbral de recurrencia necesita "n" y "dias" enteros mayores o iguales a 1.';
    end if;
  end if;

  if old.clave = 'contacto_ti' then
    if exists (
      select 1 from jsonb_each(new.valor) e
       where e.key not in ('texto', 'correo', 'telefono') or jsonb_typeof(e.value) <> 'string'
    ) then
      raise exception 'El contacto de TI solo admite los textos "texto", "correo" y "telefono".';
    end if;
  end if;

  -- Claves "*_desde" (p. ej. actas_pendientes_desde de la 110): fecha ISO válida.
  if old.clave like '%\_desde' then
    begin
      perform (new.valor #>> '{}')::date;
    exception when others then
      raise exception 'El valor de "%" debe ser una fecha AAAA-MM-DD válida.', old.clave;
    end;
  end if;

  return new;
end;
$$;

alter function public.config_parametros_validar() owner to project_admin;
revoke all on function public.config_parametros_validar() from public, anon, authenticated;

drop trigger if exists trg_config_parametros_validar on public.config_parametros;
create trigger trg_config_parametros_validar
  before update on public.config_parametros
  for each row execute function public.config_parametros_validar();

drop trigger if exists trg_config_parametros_updated_at on public.config_parametros;
create trigger trg_config_parametros_updated_at
  before update on public.config_parametros
  for each row execute function public.set_updated_at();

insert into public.config_parametros (clave, valor, descripcion) values
  ('dias_ventana_alta',          '30'::jsonb,
   'Días desde la fecha de alta durante los que un empleado Activo sin cuenta cuenta como "alta incompleta" en el Inicio.'),
  ('dias_por_vencer_licencia',   '30'::jsonb,
   'Días de anticipación con que una licencia pasa a "por vencer".'),
  ('dias_por_vencer_garantia',   '30'::jsonb,
   'Días de anticipación con que la garantía de un equipo pasa a "por vencer".'),
  ('umbral_recurrencia_tickets', '{"n": 3, "dias": 30}'::jsonb,
   'Una categoría con n o más tickets en los últimos "dias" días, sin problema vinculado, se sugiere como problema recurrente.'),
  ('dias_ticket_viejo',          '3'::jsonb,
   'Un ticket vigente creado antes de hoy menos estos días aparece como "abierto hace tiempo" en el Inicio.'),
  ('dias_autocierre_resuelto',   '5'::jsonb,
   'Días que un ticket resuelto espera la conformidad del solicitante antes de cerrarse solo (plan V2, 098).'),
  ('max_reavisos',               '3'::jsonb,
   'Máximo de recordatorios al solicitante de un ticket resuelto antes del autocierre (plan V2, 098).'),
  ('dias_acta_sin_adjuntar',     '3'::jsonb,
   'Días corridos desde la entrega de un equipo a una persona tras los cuales el acta firmada sin adjuntar aparece en el Inicio (110).'),
  ('dias_verificacion_equipo',   '180'::jsonb,
   'Días sin verificación física tras los cuales un equipo se considera "sin verificar" (101, verificar_equipo).'),
  ('contacto_ti',                '{"texto": "", "correo": "", "telefono": ""}'::jsonb,
   'Contacto de TI que muestra la página pública del QR de un equipo (/e/:codigo). Vacío hasta que el dueño lo complete.')
on conflict (clave) do nothing;


-- ============================================================
-- 2) Lectura de parámetros
-- ============================================================

create or replace function public.parametro_entero(
  p_clave text,
  p_defecto integer,
  p_campo text default null
)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((
    select case when v.txt ~ '^[0-9]{1,9}$' then v.txt::integer end
      from (
        select case when p_campo is null then c.valor #>> '{}' else c.valor ->> p_campo end as txt
          from public.config_parametros c
         where c.clave = p_clave
      ) v
  ), p_defecto);
$$;

alter function public.parametro_entero(text, integer, text) owner to project_admin;
revoke all on function public.parametro_entero(text, integer, text) from public, anon;
grant execute on function public.parametro_entero(text, integer, text) to authenticated;

comment on function public.parametro_entero(text, integer, text) is
  'Lee un parámetro entero de config_parametros (o un campo de un objeto: p_campo); p_defecto si falta o no es un entero. Migración 103.';

create or replace function public.contacto_ti_publico()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
              'texto',    coalesce(c.valor ->> 'texto', ''),
              'correo',   coalesce(c.valor ->> 'correo', ''),
              'telefono', coalesce(c.valor ->> 'telefono', ''))
       from public.config_parametros c
      where c.clave = 'contacto_ti'),
    jsonb_build_object('texto', '', 'correo', '', 'telefono', '')
  );
$$;

alter function public.contacto_ti_publico() owner to project_admin;
revoke all on function public.contacto_ti_publico() from public;
grant execute on function public.contacto_ti_publico() to anon, authenticated;

comment on function public.contacto_ti_publico() is
  'Contacto de TI para la página pública del QR (sin sesión). Devuelve SOLO texto/correo/telefono de la clave contacto_ti. Migración 103.';


-- ============================================================
-- 3) v_licencias_cupo: asientos usados y libres por licencia
-- Mismo cálculo que mapLicencia() (frontend/src/api/domains/licencias.js):
-- con cuenta_id (correo de acceso) cuentan las asignaciones activas de la
-- CUENTA; sin ella, las asignaciones_licencia activas. security_invoker:
-- el que consulta ve lo que su RLS le deja ver (módulo licencias).
-- ============================================================

create or replace view public.v_licencias_cupo
with (security_invoker = true) as
select
  l.id                                           as licencia_id,
  l.software,
  l.tipo,
  l.cantidad,
  case when l.cuenta_id is not null then 'cuenta' else 'licencia' end as origen,
  coalesce(d.usados, 0)::integer                 as usados_directos,
  coalesce(c.usados, 0)::integer                 as usados_cuenta,
  (case when l.cuenta_id is not null
        then coalesce(c.usados, 0)
        else coalesce(d.usados, 0) end)::integer as usados,
  greatest(
    l.cantidad - (case when l.cuenta_id is not null
                       then coalesce(c.usados, 0)
                       else coalesce(d.usados, 0) end),
    0
  )::integer                                     as libres,
  l.fecha_vencimiento
from public.licencias l
left join lateral (
  select count(*) as usados
    from public.asignaciones_licencia a
    join public.empleados e on e.id = a.empleado_id
   where a.licencia_id = l.id
     and a.fecha_fin is null
) d on true
left join lateral (
  select count(*) as usados
    from public.asignaciones_cuenta a
    join public.empleados e on e.id = a.empleado_id
   where a.cuenta_id = l.cuenta_id
     and a.fecha_fin is null
) c on l.cuenta_id is not null
where l.deleted_at is null;

alter view public.v_licencias_cupo owner to project_admin;
revoke all on public.v_licencias_cupo from public, anon;
grant select on public.v_licencias_cupo to authenticated;

comment on view public.v_licencias_cupo is
  'Asientos usados/libres por licencia (replica mapLicencia de licencias.js). security_invoker. Migración 103.';


-- ============================================================
-- 4) v_categorias_recurrentes: posibles problemas por repetición
-- Mismo criterio que problemasApi.listCategoriasRecurrentes: tickets de
-- CUALQUIER estado con categoría, creados en los últimos `dias` días, que no
-- están vinculados a ningún problema; n y dias de umbral_recurrencia_tickets.
-- security_invoker: RLS de tickets (módulo tickets), categorias_ticket y
-- problema_tickets (módulo problemas) aplica a quien consulta la vista
-- directamente; dashboard_resumen() la lee como dueño (y exige tickets).
-- ============================================================

create or replace view public.v_categorias_recurrentes
with (security_invoker = true) as
with umbral as (
  select public.parametro_entero('umbral_recurrencia_tickets', 3,  'n')    as n,
         public.parametro_entero('umbral_recurrencia_tickets', 30, 'dias') as dias
),
base as (
  select t.categoria_id,
         coalesce(cat.nombre, '') as categoria_nombre,
         t.id as ticket_id,
         t.codigo,
         t.titulo,
         t.created_at
    from public.tickets t
    cross join umbral u
    left join public.categorias_ticket cat on cat.id = t.categoria_id
   where t.categoria_id is not null
     and (t.created_at at time zone 'America/Lima')::date
           >= (now() at time zone 'America/Lima')::date - u.dias
     and not exists (select 1 from public.problema_tickets pt where pt.ticket_id = t.id)
)
select b.categoria_id,
       max(b.categoria_nombre)                      as categoria_nombre,
       count(*)::integer                            as total,
       min(b.created_at)                            as primer_ticket_at,
       max(b.created_at)                            as ultimo_ticket_at,
       jsonb_agg(
         jsonb_build_object('ticket_id', b.ticket_id, 'codigo', b.codigo,
                            'titulo', b.titulo, 'desde', b.created_at)
         order by b.created_at, b.ticket_id
       )                                            as tickets
  from base b
 group by b.categoria_id
having count(*) >= (select n from umbral);

alter view public.v_categorias_recurrentes owner to project_admin;
revoke all on public.v_categorias_recurrentes from public, anon;
grant select on public.v_categorias_recurrentes to authenticated;

comment on view public.v_categorias_recurrentes is
  'Categorías con n+ tickets recientes sin problema vinculado (umbral en config_parametros). security_invoker. Migración 103.';


-- ============================================================
-- 5) dashboard_resumen(): todo el Inicio en una llamada
-- Cada sección vive en su propio bloque BEGIN ... EXCEPTION: si falla, su
-- nombre se agrega a `errores`, la sección queda en null y las demás siguen
-- (el Inicio solo dice "Todo al día" cuando errores = []). Una sección solo
-- se calcula si puede(p_user, 'modulo:<x>'); sin permiso queda en null y NO
-- cuenta como error. SECURITY DEFINER bypasea la RLS de las tablas, por eso
-- el gate de módulo se repite acá, igual que en las RPC de la 086.
--
-- Secciones del plan que todavía NO existen en esta rama:
--   - solicitudes_abiertas (tabla `solicitudes`, migración 108): arreglo vacío.
--   - reloj de tickets (estado_tiempo_ticket, 094/105; viven en la rama del
--     plan V2): tickets.vencidos y tickets.por_vencer en null.
--   - actas_pendientes depende de la vista v_actas_pendientes de la 110. Como
--     la 103 se aplica ANTES, esa sección se consulta con
--     EXCEPTION WHEN undefined_table → null SIN error (no hace falta
--     redefinir esta función en la 110; reaplicar la 103 después de la 110
--     tampoco quita nada).
-- Sin límite de filas salvo mios (5) y custodia_hoy (10): son los mismos que
-- los métodos del cliente a los que reemplaza.
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

  v_dias_alta    integer;
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

  v_dias_alta  := public.parametro_entero('dias_ventana_alta', 30);
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

    -- ── altas_incompletas (empleadosApi.altasIncompletas) ──
    -- Activo, con alta dentro de la ventana (no futura) y sin ninguna cuenta
    -- viva asignada (asignación sin fecha_fin y cuenta sin deleted_at).
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'empleado_id', e.id,
               'nombre', btrim(e.nombres || ' ' || e.apellidos),
               'cargo', coalesce(e.cargo, ''),
               'fecha_alta', e.fecha_alta,
               'dias', v_hoy - e.fecha_alta,
               'faltan', jsonb_build_array('cuenta'))
             order by e.fecha_alta, e.id), '[]'::jsonb)
        into v_altas
        from public.empleados e
       where e.estado = 'Activo'
         and e.deleted_at is null
         and e.fecha_alta is not null
         and e.fecha_alta <= v_hoy
         and e.fecha_alta >= v_hoy - v_dias_alta
         and not exists (
           select 1
             from public.asignaciones_cuenta a
             join public.cuentas c on c.id = a.cuenta_id and c.deleted_at is null
            where a.empleado_id = e.id and a.fecha_fin is null
         );
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
    -- Reservado: solicitudes de servicio (tabla `solicitudes`, migración 108)
    'solicitudes_abiertas',     '[]'::jsonb,
    'errores',                  v_errores
  );
end;
$$;

alter function public.dashboard_resumen_de(uuid) owner to project_admin;
revoke all on function public.dashboard_resumen_de(uuid) from public, anon, authenticated;
grant execute on function public.dashboard_resumen_de(uuid) to project_admin;

comment on function public.dashboard_resumen_de(uuid) is
  'Cuerpo de dashboard_resumen() para un usuario explícito (103). EXECUTE solo project_admin: un cliente no puede pedir el resumen de otro; existe para poder probar la función sin simular una sesión (el servidor bloquea la configuración de sesión).';

-- La RPC que llama el frontend: el usuario es siempre el de la sesión.
create or replace function public.dashboard_resumen()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.dashboard_resumen_de(auth.uid());
$$;

alter function public.dashboard_resumen() owner to project_admin;
revoke all on function public.dashboard_resumen() from public, anon, authenticated;
grant execute on function public.dashboard_resumen() to authenticated;

comment on function public.dashboard_resumen() is
  'Resumen del Inicio en una sola llamada (103). Secciones por módulo (null si no hay permiso), cada una aislada: si falla, su nombre va a errores. Guard: staff activo (42501).';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tabla, RLS y policies (esperado: relrowsecurity=true; dos policies):
--    select relrowsecurity from pg_class where oid = 'public.config_parametros'::regclass;
--    select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'config_parametros' order by cmd;
--
-- 2) Privilegios (esperado: select=true; insert=false; delete=false; update de valor=true, de clave=false):
--    select has_table_privilege('authenticated', 'public.config_parametros', 'select') as sel, has_table_privilege('authenticated', 'public.config_parametros', 'insert') as ins, has_table_privilege('authenticated', 'public.config_parametros', 'delete') as del, has_column_privilege('authenticated', 'public.config_parametros', 'valor', 'update') as upd_valor, has_column_privilege('authenticated', 'public.config_parametros', 'clave', 'update') as upd_clave;
--
-- 3) Parámetros sembrados (esperado: 10 filas):
--    select clave, valor from public.config_parametros order by clave;
--
-- 4) Funciones y EXECUTE (esperado: dashboard_resumen authenticated=true anon=false;
--    contacto_ti_publico anon=true):
--    y dashboard_resumen_de(uuid) authenticated=false anon=false project_admin=true:
--    select p, has_function_privilege('authenticated', p, 'execute') as authenticated, has_function_privilege('anon', p, 'execute') as anon, has_function_privilege('project_admin', p, 'execute') as project_admin from unnest(array['public.dashboard_resumen()','public.dashboard_resumen_de(uuid)','public.parametro_entero(text,integer,text)','public.contacto_ti_publico()']) as p;
--
-- 5) Vistas security_invoker (esperado: reloptions con security_invoker=true en las dos):
--    select relname, reloptions from pg_class where relname in ('v_licencias_cupo','v_categorias_recurrentes') and relnamespace = 'public'::regnamespace;
--
-- 6) Las vistas funcionan (esperado: 9 filas de cupo; recurrentes puede ser 0):
--    select count(*) from public.v_licencias_cupo;
--    select count(*) from public.v_categorias_recurrentes;
--
-- 7) dashboard_resumen() NO se puede llamar desde `db query` (sin sesión,
--    auth.uid() es NULL y el guard lanza 42501: ese rechazo ES el resultado
--    esperado). El cuerpo sí, con un usuario explícito (solo lectura):
--    select jsonb_object_keys(public.dashboard_resumen_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1)));
--    (esperado: las 15 claves del resumen) y, para ver las secciones fallidas:
--    select public.dashboard_resumen_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1)) -> 'errores';
--    (esperado: []). Las pruebas con permisos y fixtures están en
--    tests/db/triggers.test.sql (bloques 103-b, 103-c, 103-d, 110-c).
--
-- 8) Tracking: scripts/apply-migration.mjs registra la fila solo; si se aplicó
--    a mano con `db import`, registrarla y verificar:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '103';
-- ============================================================
-- FIN DE MIGRACIÓN 103
-- ============================================================
