-- ============================================================
-- MIGRACIÓN 117 — Reportes centralizados: una RPC por reporte (inventario de
-- equipos, licencias, correos y cuentas, personal, solicitudes, cambios,
-- problemas y conocimiento, encuestas y auditoría), todas con la misma forma
-- de hoja y de CSV, para que el módulo Reportes sea el ÚNICO lugar donde se
-- reporta o se exporta.
-- Depende de: 099 (puede / exigir_permiso), 102 (empleado_eventos,
--   empleado_revisiones_acceso), 103 (config_parametros, parametro_entero,
--   v_licencias_cupo, v_categorias_recurrentes), 106 (problemas.error_conocido,
--   kb_articulos.tipo, ticket_kb_usos, v_kpi_kb), 107 (cambios, servicios,
--   v_cambios_aprobacion_vencida), 108 (solicitudes, solicitud_pasos), 110
--   (v_actas_pendientes) y 115 (v_ticket_hechos, mismo patrón de RPC).
--
-- Hallazgo (encargo aprobado por el dueño, 2026-10-05: «todos los reportes en
-- el módulo Reportes; ningún módulo con su propio botón de exportar o de
-- reporte»): ocho salidas vivían repartidas en los módulos y cada una
-- calculaba en el navegador con sus propios criterios. Exportar de Tickets,
-- Equipos (CSV y PDF de inventario con jsPDF), Licencias, Correos, Empleados
-- (el CSV llevaba DNI, WhatsApp y correo personal), Registro de actividad (con
-- lo que hubiera en las últimas 200 filas) y Encuestas, más el PDF de
-- Satisfacción. Las listas «para exportar» no tenían tope documentado y el
-- PDF de inventario leía la ventana de garantías aparte del Inicio. Esta
-- migración deja una capa de datos por reporte; el frontend solo da formato.
--
-- Distinción acordada con el dueño:
--   · REPORTE (agrega muchos registros) y EXPORTACIÓN (lista cruda) viven en
--     Reportes: cada RPC devuelve la hoja Y el CSV del mismo cálculo.
--   · DOCUMENTO de UN registro (acta, etiquetas QR, expediente del empleado,
--     hoja de vida del equipo, impresión de una solicitud o de un cambio) se
--     queda en su ficha: esta migración no los toca.
--
-- ── FORMA COMÚN DEL RESULTADO (contrato con el frontend) ───────────────────
--   {
--     reporte, generado_en, generado_por: {user_id, nombre},
--     definiciones_version: 'reportes-2026-10-05',
--     periodo: null | {desde, hasta, dias, completo, en_curso, zona},
--     periodo_completo: null (foto al corte) | boolean,
--     corte_at,            -- foto: now(); período: fin del período o now()
--     parametros: {...},   -- los umbrales usados (config_parametros)
--     avisos: [texto],     -- secciones omitidas por permiso, en claro
--     secciones: [{id, titulo, nota, tablas: [{id, titulo, nota,
--                  columnas: [{clave, titulo, tipo}], filas: [{clave: valor}]}]}],
--     filas_csv: {columnas: [{clave, titulo, tipo}], filas: [[valor, ...]]}
--   }
--   tipo de columna: texto | codigo | numero | decimal | pct | fecha | fecha_hora.
--   Las tablas y el CSV salen del MISMO cálculo y no tienen tope de filas (el
--   CSV trae todo lo del período o del alcance): ningún cliente vuelve a
--   paginar ni a sumar. Ninguna salida lleva DNI, teléfono, WhatsApp, correo
--   personal, contacto_ingresado, IP ni user_agent (el bloque 117 de
--   tests/db lo comprueba). Los nombres de personas que aparecen son los que
--   el módulo ya muestra; la auditoría (con nombres del staff) es solo JEFE.
--
-- Decisiones (fijadas acá como definiciones; el glosario del frontend las
-- repite en una línea cada una):
--   · Fotos al corte (inventario, licencias, correos): sin período, `corte_at`
--     = ahora, sin comparación. Reportes por período (personal, solicitudes,
--     cambios, problemas, auditoría): fechas de calendario de Lima
--     [p_desde 00:00, p_hasta 24:00), como mucho 366 días, P0001 si no; no se
--     comparan con el período anterior (solo Tickets compara, 115).
--   · Encuestas: por RONDA, no por período (p_ronda NULL = la más reciente con
--     respuestas). Respuestas anónimas: ni fecha ni identificador por fila.
--   · Situación de un equipo: la misma derivación que la lista de Equipos
--     (estado físico si no es operativo; si no, asignado / en ubicación /
--     disponible según su asignación activa). Garantías: la regla del Inicio
--     (operativos o en reparación con garantía <= hoy + dias_por_vencer_garantia,
--     vencidas incluidas). Sin devolver: asignación activa a una persona
--     Inactiva; la fecha de baja sale de empleado_eventos (baja_ejecutada o
--     estado_cambiado a Inactivo), ya no de empleados.updated_at.
--     Actas pendientes: v_actas_pendientes (110) tal cual.
--   · Licencias: cupo de v_licencias_cupo (103); vencida = fecha < hoy; por
--     vencer = fecha <= hoy + dias_por_vencer_licencia; perpetua sin fecha.
--   · Correos: todas las cuentas vivas por plataforma y tipo; rotación
--     pendiente = requiere_rotacion; su antigüedad son los días corridos desde
--     el último cambio de contraseña (no existe la fecha en que se marcó). El
--     CSV, como la lista del módulo, son las compartidas y reutilizables.
--   · Personal: foto de hoy (activos y suspendidos por empresa, área y cargo)
--     + movimientos del período desde empleado_eventos: alta = creado,
--     reingreso, baja = baja_ejecutada o estado_cambiado a Inactivo,
--     suspensión, reactivación. Empresa, área y cargo son los de HOY.
--     Revisión de accesos pendiente: persona activa o suspendida cuya última
--     revisión (o, si nunca se revisó, su alta) tiene más de
--     dias_revision_accesos días corridos (parámetro NUEVO, 180).
--   · Solicitudes: creadas, completadas y canceladas por la fecha de cada
--     hecho; tiempo = días corridos de creada a completada (mediana primero,
--     siempre con n); abiertas por tramo de antigüedad (0-3 / 4-7 / 8-30 /
--     >30 días, los mismos tramos del backlog de tickets).
--   · Cambios: misma definición que v_kpi_cambios (107) pero sobre el período
--     (creados en él, sin borradores ni cancelados); las emergencias sin
--     aprobar son las de v_cambios_aprobacion_vencida, hoy.
--   · Problemas y conocimiento: guard módulo problemas; la sección de
--     conocimiento exige además base_conocimiento y las recurrencias y el
--     «% de resoluciones con artículo» exigen tickets (sin ese módulo la
--     sección no viaja y se avisa en `avisos`). Recurrencias:
--     v_categorias_recurrentes (103) tal cual. Un problema no guarda su fecha
--     de cierre: el reporte no inventa «cerrados en el período».
--   · Auditoría: accesos_log del período, solo rol:jefe; nunca IP ni
--     user_agent. «Quién» = nombre del staff, si no su correo; sin sesión,
--     «Empleado, vía enlace» (entregas y portal) o «Sistema».
--
-- ── TABLA DE FIRMAS ─────────────────────────────────────────────────────────
--   PARÁMETRO NUEVO (config_parametros, on conflict do nothing):
--     dias_revision_accesos   180   días sin revisión de accesos para avisarla
--
--   AUXILIARES (EXECUTE solo project_admin; los usan los núcleos):
--     reporte_validar_periodo(date, date) → void        P0001 si no es válido
--     reporte_cabecera(uuid, text, date, date) → jsonb  generado_*, período/corte
--     reporte_col(text, text, text) → jsonb             {clave, titulo, tipo}
--     reporte_tabla(text, text, jsonb, jsonb, text) → jsonb
--     reporte_seccion(text, text, jsonb, text) → jsonb
--     reporte_etiqueta(text, text) → text               rótulo de un valor de dominio
--
--   RPC PÚBLICAS (SECURITY DEFINER, EXECUTE a authenticated) → núcleo
--   `<nombre>_de(p_user, ...)` (EXECUTE solo project_admin, como en la 115):
--     reporte_inventario_equipos()             exigir_permiso('modulo:equipos')
--     reporte_licencias()                      exigir_permiso('modulo:licencias')
--     reporte_correos()                        exigir_permiso('modulo:correos')
--     reporte_personal(date, date)             exigir_permiso('modulo:empleados')
--     reporte_solicitudes(date, date)          exigir_permiso('modulo:empleados')
--     reporte_cambios(date, date)              exigir_permiso('modulo:tickets')
--     reporte_problemas(date, date)            exigir_permiso('modulo:problemas')
--     reporte_encuestas(uuid default null)     exigir_permiso('modulo:encuestas')
--     reporte_auditoria(date, date)            exigir_permiso('rol:jefe')
--   Tickets y Satisfacción siguen siendo reporte_tickets y
--   reporte_satisfaccion_consolidado (115), sin cambios de firma.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano.
-- Aplicar DESPUÉS de la 115 (la 116 es independiente). Correr SIEMPRE el
-- bloque "Verificación" del final. Idempotente (create or replace; el
-- parámetro con on conflict do nothing).
-- Rollback: migrations/rollback/117_rollback.sql.
-- ============================================================


-- ============================================================
-- 0) Precondiciones
-- ============================================================

do $$
begin
  if to_regprocedure('public.puede(uuid, text)') is null
     or to_regprocedure('public.exigir_permiso(text)') is null then
    raise exception 'La migración 117 requiere la 099 (puede / exigir_permiso). Aplíquela primero.';
  end if;
  if to_regclass('public.empleado_eventos') is null or to_regclass('public.empleado_revisiones_acceso') is null then
    raise exception 'La migración 117 requiere la 102 (empleado_eventos / empleado_revisiones_acceso). Aplíquela primero.';
  end if;
  if to_regclass('public.v_licencias_cupo') is null or to_regclass('public.v_categorias_recurrentes') is null
     or to_regprocedure('public.parametro_entero(text, integer, text)') is null then
    raise exception 'La migración 117 requiere la 103 (parámetros, v_licencias_cupo, v_categorias_recurrentes). Aplíquela primero.';
  end if;
  if to_regclass('public.v_kpi_kb') is null or to_regclass('public.ticket_kb_usos') is null then
    raise exception 'La migración 117 requiere la 106 (ticket_kb_usos / v_kpi_kb). Aplíquela primero.';
  end if;
  if to_regclass('public.cambios') is null or to_regclass('public.v_cambios_aprobacion_vencida') is null then
    raise exception 'La migración 117 requiere la 107 (cambios / v_cambios_aprobacion_vencida). Aplíquela primero.';
  end if;
  if to_regclass('public.solicitudes') is null or to_regclass('public.solicitud_pasos') is null then
    raise exception 'La migración 117 requiere la 108 (solicitudes). Aplíquela primero.';
  end if;
  if to_regclass('public.v_actas_pendientes') is null then
    raise exception 'La migración 117 requiere la 110 (v_actas_pendientes). Aplíquela primero.';
  end if;
  if to_regclass('public.v_ticket_hechos') is null then
    raise exception 'La migración 117 requiere la 115 (v_ticket_hechos). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) Parámetro nuevo (la clave la crea la migración, el valor lo edita el JEFE)
-- ============================================================

insert into public.config_parametros (clave, valor, descripcion) values
  ('dias_revision_accesos', '180'::jsonb,
   'Días corridos sin revisión de accesos (o desde el alta, si nunca se revisó) a partir de los que el reporte de Personal marca la revisión como pendiente.')
on conflict (clave) do nothing;


-- ============================================================
-- 2) Auxiliares: período, cabecera, forma de las tablas y rótulos
-- ============================================================

create or replace function public.reporte_validar_periodo(p_desde date, p_hasta date)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no es válido: la fecha inicial debe ser anterior o igual a la final.';
  end if;
  if p_hasta - p_desde >= 366 then
    raise exception 'El período no puede superar los 366 días.';
  end if;
end;
$$;

-- Sin p_desde: foto al corte (periodo y periodo_completo en null, corte_at =
-- ahora). Con período: el corte es el fin del período (24:00 de Lima de
-- p_hasta) o ahora si todavía no terminó.
create or replace function public.reporte_cabecera(
  p_user    uuid,
  p_reporte text,
  p_desde   date default null,
  p_hasta   date default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'reporte',              p_reporte,
    'generado_en',          now(),
    'generado_por',         jsonb_build_object('user_id', p_user,
                              'nombre', (select s.nombre from public.staff s where s.user_id = p_user)),
    'definiciones_version', 'reportes-2026-10-05',
    'periodo', case when p_desde is null then null else jsonb_build_object(
                 'desde', p_desde, 'hasta', p_hasta, 'dias', p_hasta - p_desde + 1,
                 'completo', p_hasta < x.hoy, 'en_curso', p_desde <= x.hoy and p_hasta >= x.hoy,
                 'zona', 'America/Lima') end,
    'periodo_completo',     case when p_desde is null then null else p_hasta < x.hoy end,
    'corte_at',             case when p_desde is null then now()
                                 else least(((p_hasta + 1)::timestamp at time zone 'America/Lima'), now()) end
  )
  from (select (now() at time zone 'America/Lima')::date as hoy) x;
$$;

create or replace function public.reporte_col(p_clave text, p_titulo text, p_tipo text default 'texto')
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('clave', p_clave, 'titulo', p_titulo, 'tipo', p_tipo);
$$;

create or replace function public.reporte_tabla(
  p_id       text,
  p_titulo   text,
  p_columnas jsonb,
  p_filas    jsonb,
  p_nota     text default null
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('id', p_id, 'titulo', p_titulo, 'nota', p_nota,
                            'columnas', p_columnas, 'filas', coalesce(p_filas, '[]'::jsonb));
$$;

create or replace function public.reporte_seccion(p_id text, p_titulo text, p_tablas jsonb, p_nota text default null)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('id', p_id, 'titulo', p_titulo, 'nota', p_nota, 'tablas', coalesce(p_tablas, '[]'::jsonb));
$$;

-- Rótulos de los valores de dominio, los mismos que muestra la interfaz
-- (core/dominio-*.js). Un valor desconocido se devuelve tal cual.
create or replace function public.reporte_etiqueta(p_dominio text, p_valor text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(case p_dominio
    when 'situacion_equipo' then case p_valor
      when 'asignado' then 'Asignado' when 'en_ubicacion' then 'En ubicación' when 'disponible' then 'Disponible'
      when 'en_reparacion' then 'En reparación' when 'de_baja' then 'De baja' when 'perdido' then 'Robado/Perdido' end
    when 'tipo_licencia' then case p_valor when 'suscripcion' then 'Suscripción' when 'perpetua' then 'Perpetua' end
    when 'situacion_licencia' then case p_valor
      when 'vencida' then 'Vencida' when 'por_vencer' then 'Por vencer' when 'vigente' then 'Vigente'
      when 'perpetua' then 'Perpetua' when 'sin_fecha' then 'Sin vencimiento registrado' end
    when 'tipo_cuenta' then case p_valor
      when 'personal' then 'Personal' when 'reutilizable' then 'Reutilizable' when 'compartida' then 'Compartida' end
    when 'movimiento_empleado' then case p_valor
      when 'creado' then 'Alta' when 'reingreso' then 'Reingreso' when 'baja_ejecutada' then 'Baja'
      when 'baja_registro' then 'Baja' when 'suspendido' then 'Suspensión' when 'reactivado' then 'Reactivación' end
    when 'estado_solicitud' then case p_valor
      when 'abierta' then 'Abierta' when 'completada' then 'Completada' when 'cancelada' then 'Cancelada' end
    when 'origen_solicitud' then case p_valor
      when 'rrhh_correo' then 'Pedido de RRHH por correo' when 'jefe_directo' then 'Pedido del jefe directo'
      when 'ticket' then 'Ticket' when 'sistema' then 'Sistema' when 'otro' then 'Otro' end
    when 'tipo_cambio' then case p_valor when 'estandar' then 'Estándar' when 'normal' then 'Normal' when 'emergencia' then 'Emergencia' end
    when 'estado_cambio' then case p_valor
      when 'borrador' then 'Borrador' when 'solicitado' then 'Por aprobar' when 'aprobado' then 'Aprobado'
      when 'en_ejecucion' then 'En ejecución' when 'implementado' then 'Implementado' when 'cerrado' then 'Cerrado'
      when 'rechazado' then 'Rechazado' when 'cancelado' then 'Cancelado' when 'revertido' then 'Revertido' end
    when 'riesgo_cambio' then case p_valor when 'bajo' then 'Bajo' when 'medio' then 'Medio' when 'alto' then 'Alto' end
    when 'estado_problema' then case p_valor
      when 'abierto' then 'Abierto' when 'diagnostico' then 'Diagnóstico' when 'acciones' then 'Acciones' when 'cerrado' then 'Cerrado' end
    when 'severidad' then case p_valor when 'baja' then 'Baja' when 'media' then 'Media' when 'alta' then 'Alta' when 'critica' then 'Crítica' end
    when 'estado_kb' then case p_valor
      when 'borrador' then 'Borrador' when 'en_revision' then 'En revisión' when 'publicado' then 'Publicado' when 'obsoleto' then 'Obsoleto' end
    when 'tipo_kb' then case p_valor when 'solucion' then 'Solución' when 'workaround' then 'Workaround' when 'procedimiento' then 'Procedimiento' end
    when 'accion_log' then case p_valor
      when 'ver' then 'Contraseña vista' when 'copiar' then 'Contraseña copiada'
      when 'enviar' then 'Entrega creada' when 'entrega_creada' then 'Entrega creada'
      when 'entrega_abierta' then 'Entrega abierta' when 'entrega_fallida' then 'Entrega fallida'
      when 'creado' then 'Cuenta creada' when 'editado' then 'Cuenta editada' when 'eliminado' then 'Cuenta eliminada'
      when 'acceso_denegado' then 'Acceso denegado'
      when 'permiso_otorgado' then 'Permiso otorgado' when 'permiso_revocado' then 'Permiso revocado'
      when 'revelado_fallido' then 'Revelado fallido' when 'revelado_denegado' then 'Revelado denegado'
      when 'purga_ejecutada' then 'Purga ejecutada' when 'portal_abierto' then 'Portal abierto'
      when 'exportacion' then 'Exportación' end
  end, p_valor);
$$;

alter function public.reporte_validar_periodo(date, date) owner to project_admin;
alter function public.reporte_cabecera(uuid, text, date, date) owner to project_admin;
alter function public.reporte_col(text, text, text) owner to project_admin;
alter function public.reporte_tabla(text, text, jsonb, jsonb, text) owner to project_admin;
alter function public.reporte_seccion(text, text, jsonb, text) owner to project_admin;
alter function public.reporte_etiqueta(text, text) owner to project_admin;
revoke all on function public.reporte_validar_periodo(date, date) from public, anon, authenticated;
revoke all on function public.reporte_cabecera(uuid, text, date, date) from public, anon, authenticated;
revoke all on function public.reporte_col(text, text, text) from public, anon, authenticated;
revoke all on function public.reporte_tabla(text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.reporte_seccion(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.reporte_etiqueta(text, text) from public, anon, authenticated;
grant execute on function public.reporte_validar_periodo(date, date) to project_admin;
grant execute on function public.reporte_cabecera(uuid, text, date, date) to project_admin;
grant execute on function public.reporte_col(text, text, text) to project_admin;
grant execute on function public.reporte_tabla(text, text, jsonb, jsonb, text) to project_admin;
grant execute on function public.reporte_seccion(text, text, jsonb, text) to project_admin;
grant execute on function public.reporte_etiqueta(text, text) to project_admin;
comment on function public.reporte_validar_periodo(date, date) is
  'Período de un reporte (117): desde <= hasta y como mucho 366 días; P0001 si no. EXECUTE solo project_admin.';
comment on function public.reporte_cabecera(uuid, text, date, date) is
  'Cabecera común de los reportes (117): generado_en, generado_por, definiciones_version, período o foto al corte. EXECUTE solo project_admin.';
comment on function public.reporte_col(text, text, text) is
  'Columna de una tabla de reporte (117): {clave, titulo, tipo}. EXECUTE solo project_admin.';
comment on function public.reporte_tabla(text, text, jsonb, jsonb, text) is
  'Tabla de reporte lista para la hoja (117): {id, titulo, nota, columnas, filas}. EXECUTE solo project_admin.';
comment on function public.reporte_seccion(text, text, jsonb, text) is
  'Sección de reporte (117): {id, titulo, nota, tablas}. EXECUTE solo project_admin.';
comment on function public.reporte_etiqueta(text, text) is
  'Rótulo en español de un valor de dominio para los reportes (117), el mismo de core/dominio-*.js. EXECUTE solo project_admin.';


-- ============================================================
-- 3) Inventario de equipos (foto al corte) — módulo equipos
-- ============================================================

create or replace function public.reporte_inventario_equipos_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy       date    := (now() at time zone 'America/Lima')::date;
  v_dias_gar  integer := public.parametro_entero('dias_por_vencer_garantia', 30);
  v_dias_acta integer := public.parametro_entero('dias_acta_sin_adjuntar', 3);
  v_result    jsonb;
begin
  if not public.puede(p_user, 'modulo:equipos') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with eq as (
    select q.id, q.codigo, q.codigo_almacen, q.marca, q.modelo, q.serie, q.estado, q.fecha_compra, q.garantia_hasta,
           coalesce(t.nombre, q.tipo_id)                                    as tipo,
           btrim(coalesce(t.nombre, q.tipo_id) || ' ' || coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')) as descripcion,
           emp.nombre                                                       as empresa,
           a.empleado_id, a.ubicacion_id, a.fecha_inicio,
           case when e.id is not null then btrim(e.nombres || ' ' || e.apellidos) end as portador,
           e.estado::text                                                   as portador_estado,
           ao.nombre                                                        as portador_area,
           u.nombre                                                         as ubicacion,
           case when q.estado <> 'operativo' then q.estado
                when a.empleado_id is not null then 'asignado'
                when a.ubicacion_id is not null then 'en_ubicacion'
                else 'disponible' end                                       as situacion
      from public.equipos q
      left join public.tipos_equipo t         on t.id = q.tipo_id
      left join public.empresas emp           on emp.id = q.empresa_id
      left join public.asignaciones_equipo a  on a.equipo_id = q.id and a.fecha_fin is null
      left join public.empleados e            on e.id = a.empleado_id
      left join public.areas_obras ao         on ao.id = e.area_obra_id
      left join public.ubicaciones u          on u.id = a.ubicacion_id
     where q.deleted_at is null
  ),
  situaciones(orden, clave) as (
    values (1, 'asignado'), (2, 'en_ubicacion'), (3, 'disponible'), (4, 'en_reparacion'), (5, 'de_baja'), (6, 'perdido')
  ),
  sin_devolver as (
    select eq.*,
           ((select max(ev.created_at) from public.empleado_eventos ev
              where ev.empleado_id = eq.empleado_id
                and (ev.evento = 'baja_ejecutada' or (ev.evento = 'estado_cambiado' and ev.valor_nuevo = 'Inactivo')))
             at time zone 'America/Lima')::date as baja
      from eq
     where eq.empleado_id is not null and eq.portador_estado = 'Inactivo'
  )
  select public.reporte_cabecera(p_user, 'inventario') || jsonb_build_object(
    'parametros', jsonb_build_object('dias_por_vencer_garantia', v_dias_gar, 'dias_acta_sin_adjuntar', v_dias_acta),
    'avisos', '[]'::jsonb,
    'secciones', jsonb_build_array(
      public.reporte_seccion('situacion', '1. Situación del parque', jsonb_build_array(
        public.reporte_tabla('por_situacion', null,
          jsonb_build_array(public.reporte_col('situacion', 'Situación'), public.reporte_col('equipos', 'Equipos', 'numero')),
          (select jsonb_agg(f.fila order by f.orden) from (
             select s.orden, jsonb_build_object('situacion', public.reporte_etiqueta('situacion_equipo', s.clave),
                                                'equipos', (select count(*) from eq where eq.situacion = s.clave)) as fila
               from situaciones s
             union all
             select 99, jsonb_build_object('situacion', 'Total', 'equipos', (select count(*) from eq))
           ) f)),
        public.reporte_tabla('por_tipo', 'Por tipo',
          jsonb_build_array(public.reporte_col('tipo', 'Tipo'), public.reporte_col('total', 'Total', 'numero'),
            public.reporte_col('en_uso', 'En uso', 'numero'), public.reporte_col('disponibles', 'Disponibles', 'numero'),
            public.reporte_col('en_reparacion', 'En reparación', 'numero'), public.reporte_col('fuera', 'De baja o perdidos', 'numero')),
          (select jsonb_agg(jsonb_build_object('tipo', g.tipo, 'total', g.total, 'en_uso', g.en_uso, 'disponibles', g.disponibles,
                                               'en_reparacion', g.en_reparacion, 'fuera', g.fuera) order by g.total desc, g.tipo)
             from (select eq.tipo, count(*) as total,
                          count(*) filter (where eq.situacion in ('asignado', 'en_ubicacion')) as en_uso,
                          count(*) filter (where eq.situacion = 'disponible')                  as disponibles,
                          count(*) filter (where eq.situacion = 'en_reparacion')               as en_reparacion,
                          count(*) filter (where eq.situacion in ('de_baja', 'perdido'))       as fuera
                     from eq group by eq.tipo) g))
      ), 'Foto al momento de generar el reporte. «Asignado» lo tiene una persona; «En ubicación» está en una sede, obra o almacén; «En uso» suma los dos.'),
      public.reporte_seccion('ubicacion', '2. Por ubicación y en custodia', jsonb_build_array(
        public.reporte_tabla('por_ubicacion', 'En ubicaciones',
          jsonb_build_array(public.reporte_col('ubicacion', 'Ubicación'), public.reporte_col('operativos', 'Operativos', 'numero'),
            public.reporte_col('otros', 'En reparación, de baja o perdidos', 'numero'), public.reporte_col('total', 'Total', 'numero')),
          (select jsonb_agg(jsonb_build_object('ubicacion', g.ubicacion, 'operativos', g.operativos, 'otros', g.total - g.operativos,
                                               'total', g.total) order by g.total desc, g.ubicacion)
             from (select eq.ubicacion, count(*) as total, count(*) filter (where eq.estado = 'operativo') as operativos
                     from eq where eq.ubicacion_id is not null group by eq.ubicacion) g)),
        public.reporte_tabla('custodia_por_area', 'En custodia de personas, por área u obra',
          jsonb_build_array(public.reporte_col('area', 'Área u obra'), public.reporte_col('personas', 'Personas', 'numero'),
            public.reporte_col('equipos', 'Equipos', 'numero')),
          (select jsonb_agg(jsonb_build_object('area', g.area, 'personas', g.personas, 'equipos', g.equipos)
                            order by g.equipos desc, g.area nulls last)
             from (select eq.portador_area as area, count(distinct eq.empleado_id) as personas, count(*) as equipos
                     from eq where eq.empleado_id is not null group by eq.portador_area) g),
          'El área u obra es la de la persona hoy.')
      )),
      public.reporte_seccion('alertas', '3. Garantías, devoluciones y actas', jsonb_build_array(
        public.reporte_tabla('garantias', 'Garantías vencidas o por vencer en ' || v_dias_gar || ' días',
          jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('equipo', 'Equipo'),
            public.reporte_col('garantia_hasta', 'Garantía hasta', 'fecha'), public.reporte_col('dias', 'Días', 'numero'),
            public.reporte_col('situacion', 'Situación')),
          (select jsonb_agg(jsonb_build_object('codigo', eq.codigo, 'equipo', eq.descripcion, 'garantia_hasta', eq.garantia_hasta,
                                               'dias', eq.garantia_hasta - v_hoy,
                                               'situacion', case when eq.garantia_hasta < v_hoy then 'Vencida' else 'Por vencer' end)
                            order by eq.garantia_hasta, eq.codigo)
             from eq where eq.estado in ('operativo', 'en_reparacion') and eq.garantia_hasta <= v_hoy + v_dias_gar),
          'Equipos operativos o en reparación (la misma regla del Inicio). Días negativos: la garantía ya venció.'),
        public.reporte_tabla('sin_devolver', 'Sin devolver de personas dadas de baja',
          jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('equipo', 'Equipo'),
            public.reporte_col('persona', 'Persona'), public.reporte_col('entregado', 'Entregado', 'fecha'),
            public.reporte_col('baja', 'Baja', 'fecha'), public.reporte_col('dias_baja', 'Días desde la baja', 'numero')),
          (select jsonb_agg(jsonb_build_object('codigo', s.codigo, 'equipo', s.descripcion, 'persona', s.portador,
                                               'entregado', s.fecha_inicio, 'baja', s.baja, 'dias_baja', v_hoy - s.baja)
                            order by s.baja nulls first, s.codigo)
             from sin_devolver s),
          'La fecha de baja sale de la hoja de vida de la persona.'),
        public.reporte_tabla('actas_pendientes', 'Entregas sin acta firmada (más de ' || v_dias_acta || ' días)',
          jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('equipo', 'Equipo'),
            public.reporte_col('persona', 'Persona'), public.reporte_col('entregado', 'Entregado', 'fecha'),
            public.reporte_col('dias', 'Días', 'numero')),
          (select jsonb_agg(jsonb_build_object('codigo', ap.equipo_codigo, 'equipo', ap.equipo_descripcion, 'persona', ap.empleado,
                                               'entregado', ap.fecha_inicio, 'dias', ap.dias)
                            order by ap.fecha_inicio, ap.equipo_codigo)
             from public.v_actas_pendientes ap where ap.activa))
      ))
    ),
    'filas_csv', jsonb_build_object(
      'columnas', jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('codigo_almacen', 'Código de almacén', 'codigo'),
        public.reporte_col('tipo', 'Tipo'), public.reporte_col('marca', 'Marca'), public.reporte_col('modelo', 'Modelo'),
        public.reporte_col('serie', 'Serie', 'codigo'), public.reporte_col('empresa', 'Empresa'), public.reporte_col('situacion', 'Situación'),
        public.reporte_col('portador', 'Asignado a'), public.reporte_col('ubicacion', 'Ubicación'),
        public.reporte_col('fecha_compra', 'Fecha de compra', 'fecha'), public.reporte_col('garantia_hasta', 'Garantía hasta', 'fecha')),
      'filas', coalesce((select jsonb_agg(jsonb_build_array(eq.codigo, eq.codigo_almacen, eq.tipo, eq.marca, eq.modelo, eq.serie, eq.empresa,
                                                            public.reporte_etiqueta('situacion_equipo', eq.situacion), eq.portador, eq.ubicacion,
                                                            eq.fecha_compra, eq.garantia_hasta) order by eq.codigo)
                           from eq), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;


-- ============================================================
-- 4) Licencias (foto al corte) — módulo licencias
-- ============================================================

create or replace function public.reporte_licencias_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy    date    := (now() at time zone 'America/Lima')::date;
  v_dias   integer := public.parametro_entero('dias_por_vencer_licencia', 30);
  v_result jsonb;
begin
  if not public.puede(p_user, 'modulo:licencias') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with li as (
    select v.licencia_id, v.software, v.tipo, v.cantidad, v.usados, v.libres, v.fecha_vencimiento,
           l.proveedor, l.renovacion_meses, l.cuenta_id, emp.nombre as empresa, cu.usuario as acceso,
           case when l.tipo = 'perpetua' then 'perpetua'
                when v.fecha_vencimiento is null then 'sin_fecha'
                when v.fecha_vencimiento < v_hoy then 'vencida'
                when v.fecha_vencimiento <= v_hoy + v_dias then 'por_vencer'
                else 'vigente' end as situacion,
           case when l.cuenta_id is not null then
                  (select string_agg(btrim(e.nombres || ' ' || e.apellidos), ', ' order by btrim(e.nombres || ' ' || e.apellidos))
                     from public.asignaciones_cuenta a join public.empleados e on e.id = a.empleado_id
                    where a.cuenta_id = l.cuenta_id and a.fecha_fin is null)
                else
                  (select string_agg(btrim(e.nombres || ' ' || e.apellidos), ', ' order by btrim(e.nombres || ' ' || e.apellidos))
                     from public.asignaciones_licencia a join public.empleados e on e.id = a.empleado_id
                    where a.licencia_id = l.id and a.fecha_fin is null) end as usuarios
      from public.v_licencias_cupo v
      join public.licencias l       on l.id = v.licencia_id
      left join public.empresas emp on emp.id = l.empresa_id
      left join public.cuentas cu   on cu.id = l.cuenta_id
  )
  select public.reporte_cabecera(p_user, 'licencias') || jsonb_build_object(
    'parametros', jsonb_build_object('dias_por_vencer_licencia', v_dias),
    'avisos', '[]'::jsonb,
    'secciones', jsonb_build_array(
      public.reporte_seccion('resumen', '1. Resumen', jsonb_build_array(
        public.reporte_tabla('indicadores', null,
          jsonb_build_array(public.reporte_col('indicador', 'Indicador'), public.reporte_col('valor', 'Cantidad', 'numero')),
          jsonb_build_array(
            jsonb_build_object('indicador', 'Licencias registradas', 'valor', (select count(*) from li)),
            jsonb_build_object('indicador', 'Asientos comprados', 'valor', (select coalesce(sum(cantidad), 0) from li)),
            jsonb_build_object('indicador', 'Asientos usados', 'valor', (select coalesce(sum(usados), 0) from li)),
            jsonb_build_object('indicador', 'Asientos libres', 'valor', (select coalesce(sum(libres), 0) from li)),
            jsonb_build_object('indicador', 'Licencias sin asientos libres', 'valor', (select count(*) from li where libres = 0)),
            jsonb_build_object('indicador', 'Vencidas', 'valor', (select count(*) from li where situacion = 'vencida')),
            jsonb_build_object('indicador', 'Por vencer en ' || v_dias || ' días', 'valor', (select count(*) from li where situacion = 'por_vencer'))))
      ), 'Foto al momento de generar el reporte. Una licencia ligada a un correo cuenta como usados a los titulares de ese correo.'),
      public.reporte_seccion('cupo', '2. Cupo por licencia', jsonb_build_array(
        public.reporte_tabla('por_licencia', null,
          jsonb_build_array(public.reporte_col('software', 'Software'), public.reporte_col('empresa', 'Empresa'),
            public.reporte_col('tipo', 'Tipo'), public.reporte_col('cantidad', 'Asientos', 'numero'),
            public.reporte_col('usados', 'Usados', 'numero'), public.reporte_col('libres', 'Libres', 'numero'),
            public.reporte_col('vencimiento', 'Vencimiento', 'fecha'), public.reporte_col('situacion', 'Situación')),
          (select jsonb_agg(jsonb_build_object('software', li.software, 'empresa', li.empresa,
                                               'tipo', public.reporte_etiqueta('tipo_licencia', li.tipo), 'cantidad', li.cantidad,
                                               'usados', li.usados, 'libres', li.libres, 'vencimiento', li.fecha_vencimiento,
                                               'situacion', public.reporte_etiqueta('situacion_licencia', li.situacion))
                            order by li.software, li.licencia_id)
             from li))
      )),
      public.reporte_seccion('vencimientos', '3. Vencimientos', jsonb_build_array(
        public.reporte_tabla('vencidas_y_por_vencer', 'Vencidas o por vencer en ' || v_dias || ' días',
          jsonb_build_array(public.reporte_col('software', 'Software'), public.reporte_col('empresa', 'Empresa'),
            public.reporte_col('vencimiento', 'Vencimiento', 'fecha'), public.reporte_col('dias', 'Días', 'numero'),
            public.reporte_col('cantidad', 'Asientos', 'numero'), public.reporte_col('renovacion_meses', 'Renovación (meses)', 'numero'),
            public.reporte_col('situacion', 'Situación')),
          (select jsonb_agg(jsonb_build_object('software', li.software, 'empresa', li.empresa, 'vencimiento', li.fecha_vencimiento,
                                               'dias', li.fecha_vencimiento - v_hoy, 'cantidad', li.cantidad,
                                               'renovacion_meses', li.renovacion_meses,
                                               'situacion', public.reporte_etiqueta('situacion_licencia', li.situacion))
                            order by li.fecha_vencimiento, li.software)
             from li where li.situacion in ('vencida', 'por_vencer')),
          'Días negativos: la licencia ya venció. Las perpetuas no vencen.')
      ))
    ),
    'filas_csv', jsonb_build_object(
      'columnas', jsonb_build_array(public.reporte_col('software', 'Software'), public.reporte_col('proveedor', 'Proveedor'),
        public.reporte_col('empresa', 'Empresa'), public.reporte_col('tipo', 'Tipo'), public.reporte_col('acceso', 'Correo de acceso'),
        public.reporte_col('cantidad', 'Asientos', 'numero'), public.reporte_col('usados', 'Usados', 'numero'),
        public.reporte_col('libres', 'Libres', 'numero'), public.reporte_col('vencimiento', 'Vencimiento', 'fecha'),
        public.reporte_col('situacion', 'Situación'), public.reporte_col('usuarios', 'Usuarios')),
      'filas', coalesce((select jsonb_agg(jsonb_build_array(li.software, li.proveedor, li.empresa, public.reporte_etiqueta('tipo_licencia', li.tipo),
                                                            li.acceso, li.cantidad, li.usados, li.libres, li.fecha_vencimiento,
                                                            public.reporte_etiqueta('situacion_licencia', li.situacion), li.usuarios)
                                          order by li.software, li.licencia_id)
                           from li), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;


-- ============================================================
-- 5) Correos y cuentas compartidas (foto al corte) — módulo correos
-- ============================================================

create or replace function public.reporte_correos_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy    date := (now() at time zone 'America/Lima')::date;
  v_result jsonb;
begin
  if not public.puede(p_user, 'modulo:correos') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with cu as (
    select c.id, c.usuario, coalesce(c.tipo_cuenta, 'personal') as tipo_cuenta, c.requiere_rotacion, (c.password is null) as sin_password,
           (c.last_password_change at time zone 'America/Lima')::date as ultimo_cambio, c.url,
           coalesce(p.nombre, c.plataforma_id) as plataforma,
           (select string_agg(btrim(e.nombres || ' ' || e.apellidos), ', ' order by btrim(e.nombres || ' ' || e.apellidos))
              from public.asignaciones_cuenta a join public.empleados e on e.id = a.empleado_id
             where a.cuenta_id = c.id and a.fecha_fin is null) as titulares
      from public.cuentas c
      left join public.plataformas p on p.id = c.plataforma_id
     where c.deleted_at is null
  ),
  por_plataforma as (
    select cu.plataforma,
           count(*) filter (where cu.tipo_cuenta = 'personal')     as personales,
           count(*) filter (where cu.tipo_cuenta = 'reutilizable') as reutilizables,
           count(*) filter (where cu.tipo_cuenta = 'compartida')   as compartidas,
           count(*)                                               as total,
           count(*) filter (where cu.requiere_rotacion)           as por_rotar,
           count(*) filter (where cu.sin_password)                as sin_password
      from cu group by cu.plataforma
  )
  select public.reporte_cabecera(p_user, 'correos') || jsonb_build_object(
    'parametros', '{}'::jsonb,
    'avisos', '[]'::jsonb,
    'secciones', jsonb_build_array(
      public.reporte_seccion('plataformas', '1. Cuentas por plataforma', jsonb_build_array(
        public.reporte_tabla('por_plataforma', null,
          jsonb_build_array(public.reporte_col('plataforma', 'Plataforma'), public.reporte_col('personales', 'Personales', 'numero'),
            public.reporte_col('reutilizables', 'Reutilizables', 'numero'), public.reporte_col('compartidas', 'Compartidas', 'numero'),
            public.reporte_col('total', 'Total', 'numero'), public.reporte_col('por_rotar', 'Por rotar', 'numero'),
            public.reporte_col('sin_password', 'Sin contraseña', 'numero')),
          (select jsonb_agg(f.fila order by f.orden, f.total desc, f.plataforma) from (
             select 1 as orden, g.total, g.plataforma,
                    jsonb_build_object('plataforma', g.plataforma, 'personales', g.personales, 'reutilizables', g.reutilizables,
                                       'compartidas', g.compartidas, 'total', g.total, 'por_rotar', g.por_rotar,
                                       'sin_password', g.sin_password) as fila
               from por_plataforma g
             union all
             select 2, 0, null, jsonb_build_object('plataforma', 'Total',
                    'personales', (select count(*) from cu where tipo_cuenta = 'personal'),
                    'reutilizables', (select count(*) from cu where tipo_cuenta = 'reutilizable'),
                    'compartidas', (select count(*) from cu where tipo_cuenta = 'compartida'),
                    'total', (select count(*) from cu), 'por_rotar', (select count(*) from cu where requiere_rotacion),
                    'sin_password', (select count(*) from cu where sin_password))
           ) f))
      ), 'Foto al momento de generar el reporte: todas las cuentas vivas, también las personales.'),
      public.reporte_seccion('rotaciones', '2. Rotaciones de contraseña pendientes', jsonb_build_array(
        public.reporte_tabla('pendientes', null,
          jsonb_build_array(public.reporte_col('plataforma', 'Plataforma'), public.reporte_col('cuenta', 'Cuenta', 'codigo'),
            public.reporte_col('tipo', 'Tipo'), public.reporte_col('titulares', 'Titulares'),
            public.reporte_col('ultimo_cambio', 'Último cambio', 'fecha'), public.reporte_col('dias', 'Días sin cambiar', 'numero')),
          (select jsonb_agg(jsonb_build_object('plataforma', cu.plataforma, 'cuenta', cu.usuario,
                                               'tipo', public.reporte_etiqueta('tipo_cuenta', cu.tipo_cuenta), 'titulares', cu.titulares,
                                               'ultimo_cambio', cu.ultimo_cambio, 'dias', v_hoy - cu.ultimo_cambio)
                            order by cu.ultimo_cambio nulls first, cu.plataforma, cu.usuario)
             from cu where cu.requiere_rotacion))
      ), 'Antigüedad: días corridos desde el último cambio de contraseña registrado (no se guarda cuándo se marcó la rotación).'),
      public.reporte_seccion('libres', '3. Cuentas reutilizables sin titular', jsonb_build_array(
        public.reporte_tabla('reutilizables_libres', null,
          jsonb_build_array(public.reporte_col('plataforma', 'Plataforma'), public.reporte_col('cuenta', 'Cuenta', 'codigo'),
            public.reporte_col('por_rotar', 'Requiere rotación'), public.reporte_col('ultimo_cambio', 'Último cambio', 'fecha')),
          (select jsonb_agg(jsonb_build_object('plataforma', cu.plataforma, 'cuenta', cu.usuario,
                                               'por_rotar', case when cu.requiere_rotacion then 'Sí' else 'No' end,
                                               'ultimo_cambio', cu.ultimo_cambio)
                            order by cu.plataforma, cu.usuario)
             from cu where cu.tipo_cuenta = 'reutilizable' and cu.titulares is null))
      ))
    ),
    'filas_csv', jsonb_build_object(
      'columnas', jsonb_build_array(public.reporte_col('plataforma', 'Plataforma'), public.reporte_col('tipo', 'Tipo'),
        public.reporte_col('cuenta', 'Correo o usuario', 'codigo'), public.reporte_col('titulares', 'Titulares'),
        public.reporte_col('por_rotar', 'Requiere rotación'), public.reporte_col('ultimo_cambio', 'Último cambio de contraseña', 'fecha'),
        public.reporte_col('url', 'URL')),
      'filas', coalesce((select jsonb_agg(jsonb_build_array(cu.plataforma, public.reporte_etiqueta('tipo_cuenta', cu.tipo_cuenta), cu.usuario,
                                                            cu.titulares, case when cu.requiere_rotacion then 'Sí' else 'No' end,
                                                            cu.ultimo_cambio, cu.url)
                                          order by cu.plataforma, cu.usuario)
                           from cu where cu.tipo_cuenta in ('compartida', 'reutilizable')), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;


-- ============================================================
-- 6) Personal (foto de hoy + movimientos del período) — módulo empleados
-- ============================================================

create or replace function public.reporte_personal_de(p_user uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy      date    := (now() at time zone 'America/Lima')::date;
  v_dias_rev integer := public.parametro_entero('dias_revision_accesos', 180);
  v_result   jsonb;
begin
  if not public.puede(p_user, 'modulo:empleados') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public.reporte_validar_periodo(p_desde, p_hasta);

  with emp as (
    select e.id, e.nombres, e.apellidos, btrim(e.nombres || ' ' || e.apellidos) as nombre, e.estado::text as estado,
           e.cargo, e.fecha_alta, em.nombre as empresa, ao.nombre as area, u.nombre as ubicacion,
           ((select max(r.revisado_at) from public.empleado_revisiones_acceso r where r.empleado_id = e.id)
             at time zone 'America/Lima')::date as ultima_revision
      from public.empleados e
      left join public.empresas em    on em.id = e.empresa_id
      left join public.areas_obras ao on ao.id = e.area_obra_id
      left join public.ubicaciones u  on u.id = e.ubicacion_id
     where e.deleted_at is null
  ),
  mov as (
    select ev.id, case when ev.evento = 'estado_cambiado' then 'baja_registro' else ev.evento end as tipo,
           ev.detalle, (ev.created_at at time zone 'America/Lima')::date as dia,
           emp.nombre, emp.empresa, emp.area, emp.cargo
      from public.empleado_eventos ev
      join emp on emp.id = ev.empleado_id
     where (ev.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
       and (ev.evento in ('creado', 'reingreso', 'baja_ejecutada', 'suspendido', 'reactivado')
            or (ev.evento = 'estado_cambiado' and ev.valor_nuevo = 'Inactivo'))
  ),
  pendientes as (
    select emp.*, v_hoy - coalesce(emp.ultima_revision, emp.fecha_alta) as dias
      from emp
     where emp.estado in ('Activo', 'Suspendido')
       and v_hoy - coalesce(emp.ultima_revision, emp.fecha_alta) > v_dias_rev
  )
  select public.reporte_cabecera(p_user, 'personal', p_desde, p_hasta) || jsonb_build_object(
    'parametros', jsonb_build_object('dias_revision_accesos', v_dias_rev),
    'avisos', '[]'::jsonb,
    'secciones', jsonb_build_array(
      public.reporte_seccion('hoy', '1. Personal hoy', jsonb_build_array(
        public.reporte_tabla('resumen', null,
          jsonb_build_array(public.reporte_col('indicador', 'Indicador'), public.reporte_col('cantidad', 'Cantidad', 'numero')),
          jsonb_build_array(
            jsonb_build_object('indicador', 'Activos', 'cantidad', (select count(*) from emp where estado = 'Activo')),
            jsonb_build_object('indicador', 'Suspendidos', 'cantidad', (select count(*) from emp where estado = 'Suspendido')),
            jsonb_build_object('indicador', 'Dados de baja', 'cantidad', (select count(*) from emp where estado = 'Inactivo')),
            jsonb_build_object('indicador', 'Revisiones de acceso pendientes', 'cantidad', (select count(*) from pendientes)))),
        public.reporte_tabla('por_empresa', 'Por empresa',
          jsonb_build_array(public.reporte_col('empresa', 'Empresa'), public.reporte_col('activos', 'Activos', 'numero'),
            public.reporte_col('suspendidos', 'Suspendidos', 'numero')),
          (select jsonb_agg(jsonb_build_object('empresa', g.empresa, 'activos', g.activos, 'suspendidos', g.suspendidos)
                            order by g.activos desc, g.empresa nulls last)
             from (select emp.empresa, count(*) filter (where emp.estado = 'Activo') as activos,
                          count(*) filter (where emp.estado = 'Suspendido') as suspendidos
                     from emp where emp.estado in ('Activo', 'Suspendido') group by emp.empresa) g)),
        public.reporte_tabla('por_area', 'Activos por área u obra',
          jsonb_build_array(public.reporte_col('area', 'Área u obra'), public.reporte_col('activos', 'Activos', 'numero')),
          (select jsonb_agg(jsonb_build_object('area', g.area, 'activos', g.activos) order by g.activos desc, g.area nulls last)
             from (select emp.area, count(*) as activos from emp where emp.estado = 'Activo' group by emp.area) g)),
        public.reporte_tabla('por_cargo', 'Activos por cargo',
          jsonb_build_array(public.reporte_col('cargo', 'Cargo'), public.reporte_col('activos', 'Activos', 'numero')),
          (select jsonb_agg(jsonb_build_object('cargo', g.cargo, 'activos', g.activos) order by g.activos desc, g.cargo nulls last)
             from (select emp.cargo, count(*) as activos from emp where emp.estado = 'Activo' group by emp.cargo) g))
      ), 'Foto al momento de generar el reporte: empresa, área y cargo son los de hoy.'),
      public.reporte_seccion('movimientos', '2. Altas y bajas del período', jsonb_build_array(
        public.reporte_tabla('resumen_movimientos', null,
          jsonb_build_array(public.reporte_col('movimiento', 'Movimiento'), public.reporte_col('cantidad', 'Cantidad', 'numero')),
          jsonb_build_array(
            jsonb_build_object('movimiento', 'Altas', 'cantidad', (select count(*) from mov where tipo = 'creado')),
            jsonb_build_object('movimiento', 'Reingresos', 'cantidad', (select count(*) from mov where tipo = 'reingreso')),
            jsonb_build_object('movimiento', 'Bajas', 'cantidad', (select count(*) from mov where tipo in ('baja_ejecutada', 'baja_registro'))),
            jsonb_build_object('movimiento', 'Suspensiones', 'cantidad', (select count(*) from mov where tipo = 'suspendido')),
            jsonb_build_object('movimiento', 'Reactivaciones', 'cantidad', (select count(*) from mov where tipo = 'reactivado')))),
        public.reporte_tabla('altas', 'Altas y reingresos',
          jsonb_build_array(public.reporte_col('fecha', 'Fecha', 'fecha'), public.reporte_col('persona', 'Persona'),
            public.reporte_col('empresa', 'Empresa'), public.reporte_col('area', 'Área u obra'), public.reporte_col('cargo', 'Cargo'),
            public.reporte_col('movimiento', 'Movimiento')),
          (select jsonb_agg(jsonb_build_object('fecha', mov.dia, 'persona', mov.nombre, 'empresa', mov.empresa, 'area', mov.area,
                                               'cargo', mov.cargo, 'movimiento', public.reporte_etiqueta('movimiento_empleado', mov.tipo))
                            order by mov.dia, mov.nombre, mov.id)
             from mov where mov.tipo in ('creado', 'reingreso'))),
        public.reporte_tabla('bajas', 'Bajas',
          jsonb_build_array(public.reporte_col('fecha', 'Fecha', 'fecha'), public.reporte_col('persona', 'Persona'),
            public.reporte_col('empresa', 'Empresa'), public.reporte_col('area', 'Área u obra'), public.reporte_col('cargo', 'Cargo'),
            public.reporte_col('detalle', 'Detalle')),
          (select jsonb_agg(jsonb_build_object('fecha', mov.dia, 'persona', mov.nombre, 'empresa', mov.empresa, 'area', mov.area,
                                               'cargo', mov.cargo, 'detalle', mov.detalle)
                            order by mov.dia, mov.nombre, mov.id)
             from mov where mov.tipo in ('baja_ejecutada', 'baja_registro')))
      ), 'Según la hoja de vida de cada persona, en días de Lima. Una baja anterior a la auditoría lleva su fecha aproximada.'),
      public.reporte_seccion('revisiones', '3. Revisiones de acceso pendientes', jsonb_build_array(
        public.reporte_tabla('pendientes', null,
          jsonb_build_array(public.reporte_col('persona', 'Persona'), public.reporte_col('empresa', 'Empresa'),
            public.reporte_col('area', 'Área u obra'), public.reporte_col('fecha_alta', 'Alta', 'fecha'),
            public.reporte_col('ultima_revision', 'Última revisión', 'fecha'), public.reporte_col('dias', 'Días', 'numero')),
          (select jsonb_agg(jsonb_build_object('persona', p.nombre, 'empresa', p.empresa, 'area', p.area, 'fecha_alta', p.fecha_alta,
                                               'ultima_revision', p.ultima_revision, 'dias', p.dias)
                            order by p.dias desc, p.nombre, p.id)
             from pendientes p))
      ), 'Personas activas o suspendidas sin revisión de accesos en los últimos ' || v_dias_rev
         || ' días corridos; si nunca se revisaron, se cuenta desde el alta.')
    ),
    'filas_csv', jsonb_build_object(
      'columnas', jsonb_build_array(public.reporte_col('nombres', 'Nombres'), public.reporte_col('apellidos', 'Apellidos'),
        public.reporte_col('empresa', 'Empresa'), public.reporte_col('area', 'Área u obra'), public.reporte_col('ubicacion', 'Ubicación'),
        public.reporte_col('cargo', 'Cargo'), public.reporte_col('estado', 'Estado'), public.reporte_col('fecha_alta', 'Fecha de alta', 'fecha'),
        public.reporte_col('ultima_revision', 'Última revisión de accesos', 'fecha')),
      'filas', coalesce((select jsonb_agg(jsonb_build_array(emp.nombres, emp.apellidos, emp.empresa, emp.area, emp.ubicacion, emp.cargo,
                                                            emp.estado, emp.fecha_alta, emp.ultima_revision)
                                          order by emp.apellidos, emp.nombres, emp.id)
                           from emp), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;


-- ============================================================
-- 7) Solicitudes de servicio (período) — módulo empleados (108)
-- ============================================================

create or replace function public.reporte_solicitudes_de(p_user uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy    date := (now() at time zone 'America/Lima')::date;
  v_result jsonb;
begin
  if not public.puede(p_user, 'modulo:empleados') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public.reporte_validar_periodo(p_desde, p_hasta);

  with s as (
    select s.id, s.codigo, s.tipo_id, t.nombre as tipo, t.orden as tipo_orden, s.estado, s.origen,
           btrim(e.nombres || ' ' || e.apellidos) as persona,
           (s.created_at at time zone 'America/Lima')::date    as dia_creada,
           (s.completada_at at time zone 'America/Lima')::date as dia_completada,
           (s.cancelada_at at time zone 'America/Lima')::date  as dia_cancelada,
           case when s.completada_at is not null then extract(epoch from (s.completada_at - s.created_at)) / 86400.0 end as dias_tramite,
           (select count(*) from public.solicitud_pasos p where p.solicitud_id = s.id) as pasos_total,
           (select count(*) from public.solicitud_pasos p where p.solicitud_id = s.id and p.estado <> 'pendiente') as pasos_hechos,
           (select p.label from public.solicitud_pasos p where p.solicitud_id = s.id and p.estado = 'pendiente'
             order by p.orden, p.label, p.id limit 1) as siguiente
      from public.solicitudes s
      join public.solicitud_tipos t on t.id = s.tipo_id
      join public.empleados e       on e.id = s.empleado_id
  ),
  m as (
    select s.*,
           (s.dia_creada between p_desde and p_hasta)                                        as creada_en,
           (s.estado = 'completada' and s.dia_completada between p_desde and p_hasta)          as completada_en,
           (s.estado = 'cancelada' and s.dia_cancelada between p_desde and p_hasta)            as cancelada_en,
           (s.estado = 'abierta')                                                            as abierta,
           v_hoy - s.dia_creada                                                              as dias_abierta
      from s
  ),
  por_tipo as (
    select m.tipo, min(m.tipo_orden) as orden,
           count(*) filter (where m.creada_en)      as creadas,
           count(*) filter (where m.completada_en)  as completadas,
           count(*) filter (where m.cancelada_en)   as canceladas,
           count(*) filter (where m.abierta)        as abiertas,
           count(m.dias_tramite) filter (where m.completada_en) as n,
           round((percentile_cont(0.5) within group (order by m.dias_tramite) filter (where m.completada_en))::numeric, 1) as mediana,
           round((avg(m.dias_tramite) filter (where m.completada_en))::numeric, 1) as promedio
      from m group by m.tipo
  ),
  tramos(orden, clave, desde, hasta) as (
    values (1, 'hasta_3', 0, 3), (2, 'de_4_a_7', 4, 7), (3, 'de_8_a_30', 8, 30), (4, 'mas_30', 31, null::integer)
  )
  select public.reporte_cabecera(p_user, 'solicitudes', p_desde, p_hasta) || jsonb_build_object(
    'parametros', '{}'::jsonb,
    'avisos', '[]'::jsonb,
    'secciones', jsonb_build_array(
      public.reporte_seccion('resumen', '1. Resumen', jsonb_build_array(
        public.reporte_tabla('indicadores', null,
          jsonb_build_array(public.reporte_col('indicador', 'Indicador'), public.reporte_col('cantidad', 'Cantidad', 'numero')),
          jsonb_build_array(
            jsonb_build_object('indicador', 'Creadas en el período', 'cantidad', (select count(*) from m where creada_en)),
            jsonb_build_object('indicador', 'Completadas en el período', 'cantidad', (select count(*) from m where completada_en)),
            jsonb_build_object('indicador', 'Canceladas en el período', 'cantidad', (select count(*) from m where cancelada_en)),
            jsonb_build_object('indicador', 'Abiertas hoy', 'cantidad', (select count(*) from m where abierta)))),
        public.reporte_tabla('por_tipo', 'Por tipo',
          jsonb_build_array(public.reporte_col('tipo', 'Tipo'), public.reporte_col('creadas', 'Creadas', 'numero'),
            public.reporte_col('completadas', 'Completadas', 'numero'), public.reporte_col('canceladas', 'Canceladas', 'numero'),
            public.reporte_col('abiertas', 'Abiertas hoy', 'numero'), public.reporte_col('mediana', 'Mediana (días)', 'decimal'),
            public.reporte_col('promedio', 'Promedio (días)', 'decimal'), public.reporte_col('n', 'n', 'numero')),
          (select jsonb_agg(jsonb_build_object('tipo', g.tipo, 'creadas', g.creadas, 'completadas', g.completadas, 'canceladas', g.canceladas,
                                               'abiertas', g.abiertas, 'mediana', g.mediana, 'promedio', g.promedio, 'n', g.n)
                            order by g.orden, g.tipo)
             from por_tipo g where g.creadas + g.completadas + g.canceladas + g.abiertas > 0),
          'Tiempo de trámite: días corridos de creada a completada, de las completadas en el período. La mediana va primero; siempre con n.')
      )),
      public.reporte_seccion('abiertas', '2. Abiertas hoy', jsonb_build_array(
        public.reporte_tabla('antiguedad', 'Por antigüedad (días corridos)',
          jsonb_build_array(public.reporte_col('tipo', 'Tipo'), public.reporte_col('hasta_3', '0 a 3 días', 'numero'),
            public.reporte_col('de_4_a_7', '4 a 7 días', 'numero'), public.reporte_col('de_8_a_30', '8 a 30 días', 'numero'),
            public.reporte_col('mas_30', 'Más de 30 días', 'numero'), public.reporte_col('total', 'Total', 'numero')),
          (select jsonb_agg(jsonb_build_object('tipo', g.tipo,
                                               'hasta_3', g.t1, 'de_4_a_7', g.t2, 'de_8_a_30', g.t3, 'mas_30', g.t4, 'total', g.total)
                            order by g.orden, g.tipo)
             from (select m.tipo, min(m.tipo_orden) as orden,
                          count(*) filter (where m.dias_abierta <= 3)                       as t1,
                          count(*) filter (where m.dias_abierta between 4 and 7)            as t2,
                          count(*) filter (where m.dias_abierta between 8 and 30)           as t3,
                          count(*) filter (where m.dias_abierta > 30)                       as t4,
                          count(*)                                                         as total
                     from m where m.abierta group by m.tipo) g)),
        public.reporte_tabla('detalle', 'Detalle',
          jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('tipo', 'Tipo'),
            public.reporte_col('persona', 'Persona'), public.reporte_col('creada', 'Creada', 'fecha'),
            public.reporte_col('dias', 'Días', 'numero'), public.reporte_col('avance', 'Avance'),
            public.reporte_col('siguiente', 'Siguiente paso')),
          (select jsonb_agg(jsonb_build_object('codigo', m.codigo, 'tipo', m.tipo, 'persona', m.persona, 'creada', m.dia_creada,
                                               'dias', m.dias_abierta, 'avance', m.pasos_hechos || ' de ' || m.pasos_total,
                                               'siguiente', m.siguiente)
                            order by m.dias_abierta desc, m.codigo)
             from m where m.abierta))
      ), 'Foto al momento de generar el reporte, sin importar el período elegido.')
    ),
    'filas_csv', jsonb_build_object(
      'columnas', jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('tipo', 'Tipo'),
        public.reporte_col('persona', 'Persona'), public.reporte_col('estado', 'Estado'), public.reporte_col('origen', 'Origen'),
        public.reporte_col('creada', 'Creada', 'fecha'), public.reporte_col('completada', 'Completada', 'fecha'),
        public.reporte_col('cancelada', 'Cancelada', 'fecha'), public.reporte_col('dias', 'Días', 'numero'),
        public.reporte_col('pasos_hechos', 'Pasos resueltos', 'numero'), public.reporte_col('pasos_total', 'Pasos', 'numero')),
      'filas', coalesce((select jsonb_agg(jsonb_build_array(m.codigo, m.tipo, m.persona, public.reporte_etiqueta('estado_solicitud', m.estado),
                                                            public.reporte_etiqueta('origen_solicitud', m.origen), m.dia_creada,
                                                            m.dia_completada, m.dia_cancelada,
                                                            coalesce(m.dia_completada, m.dia_cancelada, v_hoy) - m.dia_creada,
                                                            m.pasos_hechos, m.pasos_total)
                                          order by m.dia_creada, m.codigo)
                           from m where m.creada_en or m.completada_en or m.cancelada_en or m.abierta), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;


-- ============================================================
-- 8) Cambios (período) — módulo tickets (107)
-- ============================================================

create or replace function public.reporte_cambios_de(p_user uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.puede(p_user, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public.reporte_validar_periodo(p_desde, p_hasta);

  with c as (
    select c.id, c.codigo, c.titulo, c.tipo, c.riesgo, c.estado, c.resultado, coalesce(s.nombre, c.servicio_id) as servicio,
           (c.created_at at time zone 'America/Lima')::date     as dia,
           (c.aprobado_at at time zone 'America/Lima')::date    as dia_aprobado,
           (c.inicio_real_at at time zone 'America/Lima')::date as dia_inicio,
           (c.fin_real_at at time zone 'America/Lima')::date    as dia_fin
      from public.cambios c
      left join public.servicios s on s.id = c.servicio_id
     where (c.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  -- Mismo universo que v_kpi_cambios: los que llegaron a pedirse.
  u as (select * from c where c.estado not in ('borrador', 'cancelado')),
  tipos(orden, tipo) as (values (1, 'estandar'), (2, 'normal'), (3, 'emergencia'))
  select public.reporte_cabecera(p_user, 'cambios', p_desde, p_hasta) || jsonb_build_object(
    'parametros', '{}'::jsonb,
    'avisos', '[]'::jsonb,
    'secciones', jsonb_build_array(
      public.reporte_seccion('tipos', '1. Por tipo', jsonb_build_array(
        public.reporte_tabla('por_tipo', null,
          jsonb_build_array(public.reporte_col('tipo', 'Tipo'), public.reporte_col('pedidos', 'Pedidos', 'numero'),
            public.reporte_col('ejecutados', 'Ejecutados', 'numero'), public.reporte_col('implementados', 'Implementados', 'numero'),
            public.reporte_col('revertidos', 'Revertidos', 'numero'), public.reporte_col('pct_revertidos', 'Revertidos de los ejecutados', 'pct')),
          (select jsonb_agg(jsonb_build_object('tipo', public.reporte_etiqueta('tipo_cambio', g.tipo), 'pedidos', g.pedidos,
                                               'ejecutados', g.ejecutados, 'implementados', g.implementados, 'revertidos', g.revertidos,
                                               'pct_revertidos', case when g.ejecutados > 0 then round(100.0 * g.revertidos / g.ejecutados) end)
                            order by g.orden)
             from (select t.orden, t.tipo,
                          count(u.id)                                                                             as pedidos,
                          count(u.id) filter (where u.estado in ('en_ejecucion', 'implementado', 'cerrado', 'revertido')) as ejecutados,
                          count(u.id) filter (where u.estado in ('implementado', 'cerrado'))                    as implementados,
                          count(u.id) filter (where u.estado = 'revertido')                                     as revertidos
                     from tipos t left join u on u.tipo = t.tipo
                    group by t.orden, t.tipo) g)),
        public.reporte_tabla('por_servicio', 'Por servicio',
          jsonb_build_array(public.reporte_col('servicio', 'Servicio'), public.reporte_col('pedidos', 'Pedidos', 'numero'),
            public.reporte_col('revertidos', 'Revertidos', 'numero')),
          (select jsonb_agg(jsonb_build_object('servicio', g.servicio, 'pedidos', g.pedidos, 'revertidos', g.revertidos)
                            order by g.pedidos desc, g.servicio)
             from (select u.servicio, count(*) as pedidos, count(*) filter (where u.estado = 'revertido') as revertidos
                     from u group by u.servicio) g))
      ), 'Cambios creados en el período que llegaron a pedirse (sin borradores ni cancelados), la misma definición del resumen de Cambios.'),
      public.reporte_seccion('emergencias', '2. Emergencias sin aprobar con el plazo vencido', jsonb_build_array(
        public.reporte_tabla('sin_aprobar', null,
          jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('titulo', 'Título'),
            public.reporte_col('servicio', 'Servicio'), public.reporte_col('estado', 'Estado'),
            public.reporte_col('vencio', 'Plazo vencido el', 'fecha'), public.reporte_col('dias', 'Días de atraso', 'numero')),
          (select jsonb_agg(jsonb_build_object('codigo', v.codigo, 'titulo', v.titulo, 'servicio', coalesce(v.servicio, v.servicio_id),
                                               'estado', public.reporte_etiqueta('estado_cambio', v.estado),
                                               'vencio', (v.aprobacion_pendiente_hasta at time zone 'America/Lima')::date,
                                               'dias', floor(extract(epoch from v.vencida_hace) / 86400)::integer)
                            order by v.aprobacion_pendiente_hasta, v.codigo)
             from public.v_cambios_aprobacion_vencida v))
      ), 'Hoy, sin importar el período: un jefe debía aprobarlas dentro de las 48 horas.'),
      public.reporte_seccion('revertidos', '3. Revertidos del período', jsonb_build_array(
        public.reporte_tabla('detalle', null,
          jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('titulo', 'Título'),
            public.reporte_col('tipo', 'Tipo'), public.reporte_col('servicio', 'Servicio'),
            public.reporte_col('fin', 'Fin', 'fecha'), public.reporte_col('motivo', 'Motivo')),
          (select jsonb_agg(jsonb_build_object('codigo', u.codigo, 'titulo', u.titulo, 'tipo', public.reporte_etiqueta('tipo_cambio', u.tipo),
                                               'servicio', u.servicio, 'fin', u.dia_fin, 'motivo', u.resultado)
                            order by u.dia, u.codigo)
             from u where u.estado = 'revertido'))
      ))
    ),
    'filas_csv', jsonb_build_object(
      'columnas', jsonb_build_array(public.reporte_col('codigo', 'Código', 'codigo'), public.reporte_col('titulo', 'Título'),
        public.reporte_col('tipo', 'Tipo'), public.reporte_col('riesgo', 'Riesgo'), public.reporte_col('servicio', 'Servicio'),
        public.reporte_col('estado', 'Estado'), public.reporte_col('creado', 'Creado', 'fecha'),
        public.reporte_col('aprobado', 'Aprobado', 'fecha'), public.reporte_col('inicio', 'Inicio real', 'fecha'),
        public.reporte_col('fin', 'Fin real', 'fecha')),
      'filas', coalesce((select jsonb_agg(jsonb_build_array(c.codigo, c.titulo, public.reporte_etiqueta('tipo_cambio', c.tipo),
                                                            public.reporte_etiqueta('riesgo_cambio', c.riesgo), c.servicio,
                                                            public.reporte_etiqueta('estado_cambio', c.estado), c.dia, c.dia_aprobado,
                                                            c.dia_inicio, c.dia_fin)
                                          order by c.dia, c.codigo)
                           from c where c.estado <> 'borrador'), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;


-- ============================================================
-- 9) Problemas y conocimiento (período) — módulo problemas (+ base de
--    conocimiento y tickets para sus secciones)
-- ============================================================

create or replace function public.reporte_problemas_de(p_user uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy        date    := (now() at time zone 'America/Lima')::date;
  v_kb         boolean;
  v_tickets    boolean;
  v_umbral_n   integer := public.parametro_entero('umbral_recurrencia_tickets', 3, 'n');
  v_umbral_d   integer := public.parametro_entero('umbral_recurrencia_tickets', 30, 'dias');
  v_avisos     jsonb   := '[]'::jsonb;
  v_secciones  jsonb;
  v_csv        jsonb;
  v_kb_sec     jsonb;
  v_rec_sec    jsonb;
begin
  if not public.puede(p_user, 'modulo:problemas') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public.reporte_validar_periodo(p_desde, p_hasta);
  v_kb := public.puede(p_user, 'modulo:base_conocimiento');
  v_tickets := public.puede(p_user, 'modulo:tickets');

  with p as (
    select pr.id, pr.titulo, pr.estado, pr.severidad, pr.error_conocido, (pr.kb_articulo_id is not null) as workaround_publicado,
           (pr.created_at at time zone 'America/Lima')::date as dia,
           (select count(*) from public.problema_tickets pt where pt.problema_id = pr.id) as tickets,
           (select count(*) from public.acciones_correctivas ac
             where ac.problema_id = pr.id and ac.deleted_at is null and ac.estado in ('pendiente', 'en_progreso')) as acciones_pendientes,
           (select count(*) from public.acciones_correctivas ac
             where ac.problema_id = pr.id and ac.deleted_at is null and ac.estado in ('pendiente', 'en_progreso')
               and ac.fecha_limite < v_hoy) as acciones_vencidas
      from public.problemas pr
     where pr.deleted_at is null
  ),
  sev(orden, clave) as (values (1, 'critica'), (2, 'alta'), (3, 'media'), (4, 'baja')),
  est(orden, clave) as (values (1, 'abierto'), (2, 'diagnostico'), (3, 'acciones'), (4, 'cerrado'))
  select jsonb_build_array(
      public.reporte_seccion('problemas', '1. Problemas', jsonb_build_array(
        public.reporte_tabla('resumen', null,
          jsonb_build_array(public.reporte_col('indicador', 'Indicador'), public.reporte_col('cantidad', 'Cantidad', 'numero')),
          jsonb_build_array(
            jsonb_build_object('indicador', 'Abiertos hoy', 'cantidad', (select count(*) from p where estado <> 'cerrado')),
            jsonb_build_object('indicador', 'Creados en el período', 'cantidad', (select count(*) from p where dia between p_desde and p_hasta)),
            jsonb_build_object('indicador', 'Errores conocidos vigentes', 'cantidad', (select count(*) from p where error_conocido and estado <> 'cerrado')),
            jsonb_build_object('indicador', 'Acciones correctivas vencidas', 'cantidad', (select coalesce(sum(acciones_vencidas), 0) from p)))),
        public.reporte_tabla('por_estado', 'Por estado (hoy)',
          jsonb_build_array(public.reporte_col('estado', 'Estado'), public.reporte_col('problemas', 'Problemas', 'numero')),
          (select jsonb_agg(jsonb_build_object('estado', public.reporte_etiqueta('estado_problema', e.clave),
                                               'problemas', (select count(*) from p where p.estado = e.clave)) order by e.orden)
             from est e)),
        public.reporte_tabla('por_severidad', 'Abiertos por severidad',
          jsonb_build_array(public.reporte_col('severidad', 'Severidad'), public.reporte_col('abiertos', 'Abiertos', 'numero')),
          (select jsonb_agg(jsonb_build_object('severidad', public.reporte_etiqueta('severidad', s.clave),
                                               'abiertos', (select count(*) from p where p.severidad = s.clave and p.estado <> 'cerrado'))
                            order by s.orden)
             from sev s))
      ), 'Un problema no guarda su fecha de cierre: el reporte no cuenta «cerrados en el período».'),
      public.reporte_seccion('kedb', '2. Errores conocidos y acciones vencidas', jsonb_build_array(
        public.reporte_tabla('errores_conocidos', 'Errores conocidos vigentes',
          jsonb_build_array(public.reporte_col('problema', 'Problema'), public.reporte_col('severidad', 'Severidad'),
            public.reporte_col('estado', 'Estado'), public.reporte_col('workaround', 'Workaround publicado'),
            public.reporte_col('desde', 'Registrado', 'fecha'), public.reporte_col('tickets', 'Tickets', 'numero')),
          (select jsonb_agg(jsonb_build_object('problema', p.titulo, 'severidad', public.reporte_etiqueta('severidad', p.severidad),
                                               'estado', public.reporte_etiqueta('estado_problema', p.estado),
                                               'workaround', case when p.workaround_publicado then 'Sí' else 'No' end,
                                               'desde', p.dia, 'tickets', p.tickets)
                            order by p.dia, p.titulo, p.id)
             from p where p.error_conocido and p.estado <> 'cerrado')),
        public.reporte_tabla('acciones_vencidas', 'Acciones correctivas vencidas',
          jsonb_build_array(public.reporte_col('problema', 'Problema'), public.reporte_col('accion', 'Acción'),
            public.reporte_col('fecha_limite', 'Fecha límite', 'fecha'), public.reporte_col('dias', 'Días de atraso', 'numero')),
          (select jsonb_agg(jsonb_build_object('problema', pr.titulo, 'accion', ac.descripcion, 'fecha_limite', ac.fecha_limite,
                                               'dias', v_hoy - ac.fecha_limite)
                            order by ac.fecha_limite, pr.titulo, ac.id)
             from public.acciones_correctivas ac
             join public.problemas pr on pr.id = ac.problema_id and pr.deleted_at is null
            where ac.deleted_at is null and ac.estado in ('pendiente', 'en_progreso') and ac.fecha_limite < v_hoy))
      ), 'Hoy, sin importar el período.')
    ),
    jsonb_build_object(
      'columnas', jsonb_build_array(public.reporte_col('problema', 'Problema'), public.reporte_col('severidad', 'Severidad'),
        public.reporte_col('estado', 'Estado'), public.reporte_col('error_conocido', 'Error conocido'),
        public.reporte_col('workaround', 'Workaround publicado'), public.reporte_col('creado', 'Registrado', 'fecha'),
        public.reporte_col('tickets', 'Tickets vinculados', 'numero'), public.reporte_col('acciones_pendientes', 'Acciones pendientes', 'numero'),
        public.reporte_col('acciones_vencidas', 'Acciones vencidas', 'numero')),
      'filas', coalesce((select jsonb_agg(jsonb_build_array(p.titulo, public.reporte_etiqueta('severidad', p.severidad),
                                                            public.reporte_etiqueta('estado_problema', p.estado),
                                                            case when p.error_conocido then 'Sí' else 'No' end,
                                                            case when p.workaround_publicado then 'Sí' else 'No' end,
                                                            p.dia, p.tickets, p.acciones_pendientes, p.acciones_vencidas)
                                          order by p.dia, p.titulo, p.id)
                           from p where p.dia between p_desde and p_hasta or p.estado <> 'cerrado'), '[]'::jsonb))
    into v_secciones, v_csv;

  -- Conocimiento: exige además el módulo base_conocimiento.
  if v_kb then
    with usos as (
      select u.kb_articulo_id, count(*) as usos_periodo
        from public.ticket_kb_usos u
       where (u.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
       group by u.kb_articulo_id
    ),
    resueltos as (
      select h.ticket_id,
             exists (select 1 from public.ticket_kb_usos u where u.ticket_id = h.ticket_id) as con_articulo
        from public.v_ticket_hechos h
       where h.resuelto_vigente and h.dia_resuelto between p_desde and p_hasta
    )
    select public.reporte_seccion('conocimiento', '3. Base de conocimiento', jsonb_build_array(
        public.reporte_tabla('por_estado', 'Artículos por estado (hoy)',
          jsonb_build_array(public.reporte_col('estado', 'Estado'), public.reporte_col('articulos', 'Artículos', 'numero')),
          (select jsonb_agg(jsonb_build_object('estado', public.reporte_etiqueta('estado_kb', e.clave),
                                               'articulos', (select count(*) from public.kb_articulos a where a.deleted_at is null and a.estado = e.clave))
                            order by e.orden)
             from (values (1, 'publicado'), (2, 'en_revision'), (3, 'borrador'), (4, 'obsoleto')) as e(orden, clave))),
        public.reporte_tabla('mas_usados', 'Artículos usados para resolver tickets',
          jsonb_build_array(public.reporte_col('articulo', 'Artículo'), public.reporte_col('tipo', 'Tipo'),
            public.reporte_col('estado', 'Estado'), public.reporte_col('usos_periodo', 'Usos en el período', 'numero'),
            public.reporte_col('usos_90d', 'Usos (90 días)', 'numero'), public.reporte_col('usos_total', 'Usos (total)', 'numero'),
            public.reporte_col('util_si', 'Útil: sí', 'numero'), public.reporte_col('util_no', 'Útil: no', 'numero')),
          (select jsonb_agg(jsonb_build_object('articulo', k.titulo, 'tipo', public.reporte_etiqueta('tipo_kb', k.tipo),
                                               'estado', public.reporte_etiqueta('estado_kb', k.estado),
                                               'usos_periodo', coalesce(us.usos_periodo, 0), 'usos_90d', k.usos_90d,
                                               'usos_total', k.usos_total, 'util_si', k.util_si, 'util_no', k.util_no)
                            order by coalesce(us.usos_periodo, 0) desc, k.usos_total desc, k.titulo, k.kb_articulo_id)
             from public.v_kpi_kb k left join usos us on us.kb_articulo_id = k.kb_articulo_id
            where k.usos_total > 0))
      ) || case when v_tickets then jsonb_build_array(public.reporte_tabla('resoluciones_con_articulo', 'Resoluciones con artículo',
          jsonb_build_array(public.reporte_col('indicador', 'Indicador'), public.reporte_col('valor', 'Valor', 'numero')),
          jsonb_build_array(
            jsonb_build_object('indicador', 'Tickets resueltos en el período', 'valor', (select count(*) from resueltos)),
            jsonb_build_object('indicador', 'Con un artículo usado', 'valor', (select count(*) from resueltos where con_articulo)),
            jsonb_build_object('indicador', 'Porcentaje con artículo (%)', 'valor',
              (select case when count(*) > 0 then round(100.0 * count(*) filter (where con_articulo) / count(*)) end from resueltos))),
          'Resuelto = resolución vigente dentro del período (la definición del reporte de Tickets).'))
        else '[]'::jsonb end,
      'Los artículos con al menos un uso registrado; el más usado del período primero.')
      into v_kb_sec;
    v_secciones := v_secciones || jsonb_build_array(v_kb_sec);
  else
    v_avisos := v_avisos || jsonb_build_array('La sección de base de conocimiento requiere el módulo Conocimiento.');
  end if;

  -- Recurrencias: leen tickets, exigen el módulo tickets (como el Inicio).
  if v_tickets then
    select public.reporte_seccion('recurrencias', (case when v_kb then '4' else '3' end) || '. Categorías recurrentes sin problema', jsonb_build_array(
        public.reporte_tabla('recurrentes', null,
          jsonb_build_array(public.reporte_col('categoria', 'Categoría'), public.reporte_col('tickets', 'Tickets', 'numero'),
            public.reporte_col('primero', 'Primero', 'fecha'), public.reporte_col('ultimo', 'Último', 'fecha')),
          (select jsonb_agg(jsonb_build_object('categoria', r.categoria_nombre, 'tickets', r.total,
                                               'primero', (r.primer_ticket_at at time zone 'America/Lima')::date,
                                               'ultimo', (r.ultimo_ticket_at at time zone 'America/Lima')::date)
                            order by r.total desc, r.categoria_nombre)
             from public.v_categorias_recurrentes r))
      ), 'Hoy: categorías con ' || v_umbral_n || ' o más tickets en los últimos ' || v_umbral_d
         || ' días sin un problema vinculado (umbral de Configuración).')
      into v_rec_sec;
    v_secciones := v_secciones || jsonb_build_array(v_rec_sec);
  else
    v_avisos := v_avisos || jsonb_build_array('Las recurrencias y las resoluciones con artículo requieren el módulo Tickets.');
  end if;

  return public.reporte_cabecera(p_user, 'problemas', p_desde, p_hasta) || jsonb_build_object(
    'parametros', jsonb_build_object('umbral_recurrencia_n', v_umbral_n, 'umbral_recurrencia_dias', v_umbral_d),
    'avisos', v_avisos,
    'secciones', v_secciones,
    'filas_csv', v_csv
  );
end;
$$;


-- ============================================================
-- 10) Encuestas (por ronda, anónimas) — módulo encuestas
-- ============================================================

create or replace function public.reporte_encuestas_de(p_user uuid, p_ronda uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rondas    jsonb;
  v_ronda     uuid;
  v_info      record;
  v_n         integer;
  v_preg      record;
  v_id        text;
  v_total     integer;
  v_tablas    jsonb := '[]'::jsonb;
  v_filas     jsonb;
  v_nota      text;
  v_promedio  numeric;
  v_csv_cols  jsonb;
  v_csv_filas jsonb;
begin
  if not public.puede(p_user, 'modulo:encuestas') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ronda_id', r.id, 'encuesta', en.titulo, 'abierta_el', (r.abierta_en at time zone 'America/Lima')::date,
           'cerrada', r.cerrada,
           'respuestas', (select count(*) from public.encuesta_respuestas x where x.ronda_id = r.id))
           order by r.abierta_en desc, r.id), '[]'::jsonb)
    into v_rondas
    from public.encuesta_rondas r
    join public.encuestas en on en.id = r.encuesta_id and en.deleted_at is null;

  if p_ronda is not null then
    if not exists (select 1 from jsonb_array_elements(v_rondas) x where (x ->> 'ronda_id')::uuid = p_ronda) then
      raise exception 'La ronda de encuesta no existe.';
    end if;
    v_ronda := p_ronda;
  else
    -- La más reciente con respuestas; si ninguna tiene, la más reciente.
    select (x.r ->> 'ronda_id')::uuid into v_ronda
      from jsonb_array_elements(v_rondas) with ordinality as x(r, ord)
     order by ((x.r ->> 'respuestas')::integer > 0) desc, x.ord
     limit 1;
  end if;

  if v_ronda is null then
    return public.reporte_cabecera(p_user, 'encuestas') || jsonb_build_object(
      'parametros', '{}'::jsonb, 'avisos', '[]'::jsonb, 'rondas', v_rondas, 'ronda', null,
      'secciones', '[]'::jsonb, 'filas_csv', jsonb_build_object('columnas', '[]'::jsonb, 'filas', '[]'::jsonb));
  end if;

  select r.id, r.cerrada, (r.abierta_en at time zone 'America/Lima')::date as abierta_el, en.titulo, en.preguntas
    into v_info
    from public.encuesta_rondas r join public.encuestas en on en.id = r.encuesta_id
   where r.id = v_ronda;
  select count(*) into v_n from public.encuesta_respuestas x where x.ronda_id = v_ronda;

  for v_preg in
    select p.q, p.ord from jsonb_array_elements(coalesce(v_info.preguntas, '[]'::jsonb)) with ordinality as p(q, ord) order by p.ord
  loop
    v_id := v_preg.q ->> 'id';
    -- Respondida: la clave existe y no es null ni texto vacío.
    select count(*) into v_total
      from public.encuesta_respuestas x
     where x.ronda_id = v_ronda and (x.respuestas -> v_id) is not null
       and (x.respuestas -> v_id) not in ('null'::jsonb, '""'::jsonb);
    v_nota := v_total || ' de ' || v_n || ' respondieron';

    if v_preg.q ->> 'tipo' = 'escala_1_5' then
      select round(avg((x.respuestas ->> v_id)::numeric), 2) into v_promedio
        from public.encuesta_respuestas x
       where x.ronda_id = v_ronda and jsonb_typeof(x.respuestas -> v_id) = 'number';
      if v_promedio is not null then
        v_nota := v_nota || '; promedio ' || replace(v_promedio::text, '.', ',') || ' sobre 5';
      end if;
      select jsonb_agg(jsonb_build_object('opcion', g.n::text, 'respuestas', g.c,
                                          'pct', case when v_total > 0 then round(100.0 * g.c / v_total) end) order by g.n desc)
        into v_filas
        from (select n, (select count(*) from public.encuesta_respuestas x
                          where x.ronda_id = v_ronda and (x.respuestas -> v_id) = to_jsonb(n)) as c
                from generate_series(1, 5) as n) g;
      v_tablas := v_tablas || jsonb_build_array(public.reporte_tabla('p' || v_preg.ord, v_preg.ord || '. ' || (v_preg.q ->> 'etiqueta'),
        jsonb_build_array(public.reporte_col('opcion', 'Nivel'), public.reporte_col('respuestas', 'Respuestas', 'numero'),
          public.reporte_col('pct', 'Porcentaje', 'pct')), v_filas, v_nota));
    elsif v_preg.q ->> 'tipo' = 'opcion_unica' then
      select jsonb_agg(jsonb_build_object('opcion', o.opcion, 'respuestas', o.c,
                                          'pct', case when v_total > 0 then round(100.0 * o.c / v_total) end) order by o.ord)
        into v_filas
        from (select op.opcion, op.ord,
                     (select count(*) from public.encuesta_respuestas x
                       where x.ronda_id = v_ronda and (x.respuestas ->> v_id) = op.opcion) as c
                from jsonb_array_elements_text(coalesce(v_preg.q -> 'opciones', '[]'::jsonb)) with ordinality as op(opcion, ord)) o;
      v_tablas := v_tablas || jsonb_build_array(public.reporte_tabla('p' || v_preg.ord, v_preg.ord || '. ' || (v_preg.q ->> 'etiqueta'),
        jsonb_build_array(public.reporte_col('opcion', 'Opción'), public.reporte_col('respuestas', 'Respuestas', 'numero'),
          public.reporte_col('pct', 'Porcentaje', 'pct')), v_filas, v_nota));
    elsif v_preg.q ->> 'tipo' = 'si_no' then
      select jsonb_agg(jsonb_build_object('opcion', o.etiqueta, 'respuestas', o.c,
                                          'pct', case when v_total > 0 then round(100.0 * o.c / v_total) end) order by o.ord)
        into v_filas
        from (select 1 as ord, 'Sí' as etiqueta, (select count(*) from public.encuesta_respuestas x
                                                    where x.ronda_id = v_ronda and (x.respuestas -> v_id) = 'true'::jsonb) as c
              union all
              select 2, 'No', (select count(*) from public.encuesta_respuestas x
                                where x.ronda_id = v_ronda and (x.respuestas -> v_id) = 'false'::jsonb)) o;
      v_tablas := v_tablas || jsonb_build_array(public.reporte_tabla('p' || v_preg.ord, v_preg.ord || '. ' || (v_preg.q ->> 'etiqueta'),
        jsonb_build_array(public.reporte_col('opcion', 'Respuesta'), public.reporte_col('respuestas', 'Respuestas', 'numero'),
          public.reporte_col('pct', 'Porcentaje', 'pct')), v_filas, v_nota));
    else
      -- Texto corto o largo: las respuestas tal cual, sin fecha (anónimas).
      select jsonb_agg(jsonb_build_object('respuesta', x.respuestas ->> v_id) order by x.created_at, x.id)
        into v_filas
        from public.encuesta_respuestas x
       where x.ronda_id = v_ronda and (x.respuestas -> v_id) is not null
         and (x.respuestas -> v_id) not in ('null'::jsonb, '""'::jsonb);
      v_tablas := v_tablas || jsonb_build_array(public.reporte_tabla('p' || v_preg.ord, v_preg.ord || '. ' || (v_preg.q ->> 'etiqueta'),
        jsonb_build_array(public.reporte_col('respuesta', 'Respuesta')), v_filas, v_nota));
    end if;
  end loop;

  select coalesce(jsonb_agg(public.reporte_col(p.q ->> 'id', p.q ->> 'etiqueta') order by p.ord), '[]'::jsonb)
    into v_csv_cols
    from jsonb_array_elements(coalesce(v_info.preguntas, '[]'::jsonb)) with ordinality as p(q, ord);
  select coalesce(jsonb_agg((
           select coalesce(jsonb_agg(
                    case jsonb_typeof(x.respuestas -> (p.q ->> 'id'))
                      when 'boolean' then to_jsonb(case when (x.respuestas -> (p.q ->> 'id')) = 'true'::jsonb then 'Sí' else 'No' end)
                      when 'string'  then to_jsonb(x.respuestas ->> (p.q ->> 'id'))
                      when 'number'  then to_jsonb(x.respuestas ->> (p.q ->> 'id'))
                      else to_jsonb(''::text) end
                    order by p.ord), '[]'::jsonb)
             from jsonb_array_elements(coalesce(v_info.preguntas, '[]'::jsonb)) with ordinality as p(q, ord))
           order by x.created_at, x.id), '[]'::jsonb)
    into v_csv_filas
    from public.encuesta_respuestas x
   where x.ronda_id = v_ronda;

  return public.reporte_cabecera(p_user, 'encuestas') || jsonb_build_object(
    'parametros', '{}'::jsonb,
    'avisos', '[]'::jsonb,
    'rondas', v_rondas,
    'ronda', jsonb_build_object('ronda_id', v_ronda, 'encuesta', v_info.titulo, 'abierta_el', v_info.abierta_el,
                                'cerrada', v_info.cerrada, 'respuestas', v_n),
    'secciones', jsonb_build_array(public.reporte_seccion('resultados', 'Resultados por pregunta', v_tablas,
      'Respuestas anónimas: no se guarda quién respondió ni se muestra cuándo. Los porcentajes son sobre quienes respondieron esa pregunta.')),
    'filas_csv', jsonb_build_object('columnas', v_csv_cols, 'filas', v_csv_filas)
  );
end;
$$;


-- ============================================================
-- 11) Auditoría (período) — solo JEFE
-- ============================================================

create or replace function public.reporte_auditoria_de(p_user uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.puede(p_user, 'rol:jefe') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public.reporte_validar_periodo(p_desde, p_hasta);

  -- Nunca ip ni user_agent: no se seleccionan.
  with l as (
    select l.id, l.created_at, l.accion, l.cuenta_usuario, l.plataforma, l.detalle,
           public.reporte_etiqueta('accion_log', l.accion) as accion_etq,
           coalesce(s.nombre, l.user_email,
                    case when l.accion in ('entrega_abierta', 'entrega_fallida', 'portal_abierto') then 'Empleado, vía enlace'
                         else 'Sistema' end) as quien
      from public.accesos_log l
      left join public.staff s on s.user_id = l.user_id
     where (l.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
  )
  select public.reporte_cabecera(p_user, 'auditoria', p_desde, p_hasta) || jsonb_build_object(
    'parametros', '{}'::jsonb,
    'avisos', '[]'::jsonb,
    'secciones', jsonb_build_array(
      public.reporte_seccion('resumen', '1. Resumen por acción', jsonb_build_array(
        public.reporte_tabla('por_accion', null,
          jsonb_build_array(public.reporte_col('accion', 'Acción'), public.reporte_col('registros', 'Registros', 'numero')),
          (select jsonb_agg(jsonb_build_object('accion', g.accion_etq, 'registros', g.n) order by g.n desc, g.accion_etq)
             from (select accion_etq, count(*) as n from l group by accion_etq) g))
      )),
      public.reporte_seccion('personas', '2. Por persona', jsonb_build_array(
        public.reporte_tabla('por_persona', null,
          jsonb_build_array(public.reporte_col('quien', 'Quién'), public.reporte_col('vistas', 'Contraseñas vistas', 'numero'),
            public.reporte_col('copias', 'Copiadas', 'numero'), public.reporte_col('entregas', 'Entregas creadas', 'numero'),
            public.reporte_col('denegados', 'Accesos denegados', 'numero'), public.reporte_col('total', 'Total', 'numero')),
          (select jsonb_agg(jsonb_build_object('quien', g.quien, 'vistas', g.vistas, 'copias', g.copias, 'entregas', g.entregas,
                                               'denegados', g.denegados, 'total', g.total) order by g.total desc, g.quien)
             from (select quien,
                          count(*) filter (where accion = 'ver')                                         as vistas,
                          count(*) filter (where accion = 'copiar')                                      as copias,
                          count(*) filter (where accion in ('enviar', 'entrega_creada'))                 as entregas,
                          count(*) filter (where accion in ('acceso_denegado', 'revelado_denegado'))     as denegados,
                          count(*)                                                                       as total
                     from l group by quien) g))
      )),
      public.reporte_seccion('contrasenas', '3. Contraseñas por plataforma', jsonb_build_array(
        public.reporte_tabla('por_plataforma', null,
          jsonb_build_array(public.reporte_col('plataforma', 'Plataforma'), public.reporte_col('vistas', 'Vistas', 'numero'),
            public.reporte_col('copias', 'Copiadas', 'numero'), public.reporte_col('fallidos', 'Revelados fallidos o denegados', 'numero')),
          (select jsonb_agg(jsonb_build_object('plataforma', g.plataforma, 'vistas', g.vistas, 'copias', g.copias, 'fallidos', g.fallidos)
                            order by g.vistas + g.copias desc, g.plataforma nulls last)
             from (select plataforma,
                          count(*) filter (where accion = 'ver')                                         as vistas,
                          count(*) filter (where accion = 'copiar')                                      as copias,
                          count(*) filter (where accion in ('revelado_fallido', 'revelado_denegado'))    as fallidos
                     from l where accion in ('ver', 'copiar', 'revelado_fallido', 'revelado_denegado')
                    group by plataforma) g))
      )),
      public.reporte_seccion('denegados', '4. Accesos denegados', jsonb_build_array(
        public.reporte_tabla('detalle', null,
          jsonb_build_array(public.reporte_col('fecha', 'Fecha y hora', 'fecha_hora'), public.reporte_col('quien', 'Quién'),
            public.reporte_col('accion', 'Acción'), public.reporte_col('detalle', 'Detalle')),
          (select jsonb_agg(jsonb_build_object('fecha', l.created_at, 'quien', l.quien, 'accion', l.accion_etq, 'detalle', l.detalle)
                            order by l.created_at desc, l.id)
             from l where l.accion in ('acceso_denegado', 'revelado_denegado')))
      )),
      public.reporte_seccion('permisos', '5. Cambios de permisos', jsonb_build_array(
        public.reporte_tabla('detalle', null,
          jsonb_build_array(public.reporte_col('fecha', 'Fecha y hora', 'fecha_hora'), public.reporte_col('quien', 'Quién'),
            public.reporte_col('accion', 'Acción'), public.reporte_col('sobre', 'Sobre'), public.reporte_col('detalle', 'Detalle')),
          (select jsonb_agg(jsonb_build_object('fecha', l.created_at, 'quien', l.quien, 'accion', l.accion_etq,
                                               'sobre', l.cuenta_usuario, 'detalle', l.detalle)
                            order by l.created_at desc, l.id)
             from l where l.accion in ('permiso_otorgado', 'permiso_revocado')))
      )),
      public.reporte_seccion('purgas', '6. Purgas de datos', jsonb_build_array(
        public.reporte_tabla('detalle', null,
          jsonb_build_array(public.reporte_col('fecha', 'Fecha y hora', 'fecha_hora'), public.reporte_col('quien', 'Quién'),
            public.reporte_col('detalle', 'Detalle')),
          (select jsonb_agg(jsonb_build_object('fecha', l.created_at, 'quien', l.quien, 'detalle', l.detalle)
                            order by l.created_at desc, l.id)
             from l where l.accion = 'purga_ejecutada'))
      ))
    ),
    'filas_csv', jsonb_build_object(
      'columnas', jsonb_build_array(public.reporte_col('fecha', 'Fecha y hora', 'fecha_hora'), public.reporte_col('quien', 'Quién'),
        public.reporte_col('accion', 'Acción'), public.reporte_col('cuenta', 'Cuenta'), public.reporte_col('plataforma', 'Plataforma'),
        public.reporte_col('detalle', 'Detalle')),
      'filas', coalesce((select jsonb_agg(jsonb_build_array(l.created_at, l.quien, l.accion_etq, l.cuenta_usuario, l.plataforma, l.detalle)
                                          order by l.created_at desc, l.id)
                           from l), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;


-- ============================================================
-- 12) Privilegios de los núcleos y RPC públicas (guard + delegación)
-- ============================================================

alter function public.reporte_inventario_equipos_de(uuid) owner to project_admin;
alter function public.reporte_licencias_de(uuid) owner to project_admin;
alter function public.reporte_correos_de(uuid) owner to project_admin;
alter function public.reporte_personal_de(uuid, date, date) owner to project_admin;
alter function public.reporte_solicitudes_de(uuid, date, date) owner to project_admin;
alter function public.reporte_cambios_de(uuid, date, date) owner to project_admin;
alter function public.reporte_problemas_de(uuid, date, date) owner to project_admin;
alter function public.reporte_encuestas_de(uuid, uuid) owner to project_admin;
alter function public.reporte_auditoria_de(uuid, date, date) owner to project_admin;
revoke all on function public.reporte_inventario_equipos_de(uuid) from public, anon, authenticated;
revoke all on function public.reporte_licencias_de(uuid) from public, anon, authenticated;
revoke all on function public.reporte_correos_de(uuid) from public, anon, authenticated;
revoke all on function public.reporte_personal_de(uuid, date, date) from public, anon, authenticated;
revoke all on function public.reporte_solicitudes_de(uuid, date, date) from public, anon, authenticated;
revoke all on function public.reporte_cambios_de(uuid, date, date) from public, anon, authenticated;
revoke all on function public.reporte_problemas_de(uuid, date, date) from public, anon, authenticated;
revoke all on function public.reporte_encuestas_de(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reporte_auditoria_de(uuid, date, date) from public, anon, authenticated;
grant execute on function public.reporte_inventario_equipos_de(uuid) to project_admin;
grant execute on function public.reporte_licencias_de(uuid) to project_admin;
grant execute on function public.reporte_correos_de(uuid) to project_admin;
grant execute on function public.reporte_personal_de(uuid, date, date) to project_admin;
grant execute on function public.reporte_solicitudes_de(uuid, date, date) to project_admin;
grant execute on function public.reporte_cambios_de(uuid, date, date) to project_admin;
grant execute on function public.reporte_problemas_de(uuid, date, date) to project_admin;
grant execute on function public.reporte_encuestas_de(uuid, uuid) to project_admin;
grant execute on function public.reporte_auditoria_de(uuid, date, date) to project_admin;
comment on function public.reporte_inventario_equipos_de(uuid) is
  'Cuerpo de reporte_inventario_equipos() para un usuario explícito (117). EXECUTE solo project_admin (pruebas sin sesión). Guard: módulo equipos (42501).';
comment on function public.reporte_licencias_de(uuid) is
  'Cuerpo de reporte_licencias() para un usuario explícito (117). EXECUTE solo project_admin. Guard: módulo licencias (42501).';
comment on function public.reporte_correos_de(uuid) is
  'Cuerpo de reporte_correos() para un usuario explícito (117). EXECUTE solo project_admin. Guard: módulo correos (42501).';
comment on function public.reporte_personal_de(uuid, date, date) is
  'Cuerpo de reporte_personal() para un usuario explícito (117). EXECUTE solo project_admin. Guard: módulo empleados (42501). Nunca DNI ni contacto.';
comment on function public.reporte_solicitudes_de(uuid, date, date) is
  'Cuerpo de reporte_solicitudes() para un usuario explícito (117). EXECUTE solo project_admin. Guard: módulo empleados (42501).';
comment on function public.reporte_cambios_de(uuid, date, date) is
  'Cuerpo de reporte_cambios() para un usuario explícito (117). EXECUTE solo project_admin. Guard: módulo tickets (42501).';
comment on function public.reporte_problemas_de(uuid, date, date) is
  'Cuerpo de reporte_problemas() para un usuario explícito (117). EXECUTE solo project_admin. Guard: módulo problemas (42501); conocimiento exige base_conocimiento y recurrencias tickets.';
comment on function public.reporte_encuestas_de(uuid, uuid) is
  'Cuerpo de reporte_encuestas() para un usuario explícito (117). EXECUTE solo project_admin. Guard: módulo encuestas (42501). Anónimo.';
comment on function public.reporte_auditoria_de(uuid, date, date) is
  'Cuerpo de reporte_auditoria() para un usuario explícito (117). EXECUTE solo project_admin. Guard: rol:jefe (42501). Nunca IP ni user_agent.';

create or replace function public.reporte_inventario_equipos()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('modulo:equipos');
  return public.reporte_inventario_equipos_de(auth.uid());
end;
$$;

create or replace function public.reporte_licencias()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('modulo:licencias');
  return public.reporte_licencias_de(auth.uid());
end;
$$;

create or replace function public.reporte_correos()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('modulo:correos');
  return public.reporte_correos_de(auth.uid());
end;
$$;

create or replace function public.reporte_personal(p_desde date, p_hasta date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.reporte_personal_de(auth.uid(), p_desde, p_hasta);
end;
$$;

create or replace function public.reporte_solicitudes(p_desde date, p_hasta date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('modulo:empleados');
  return public.reporte_solicitudes_de(auth.uid(), p_desde, p_hasta);
end;
$$;

create or replace function public.reporte_cambios(p_desde date, p_hasta date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.reporte_cambios_de(auth.uid(), p_desde, p_hasta);
end;
$$;

create or replace function public.reporte_problemas(p_desde date, p_hasta date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('modulo:problemas');
  return public.reporte_problemas_de(auth.uid(), p_desde, p_hasta);
end;
$$;

create or replace function public.reporte_encuestas(p_ronda uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('modulo:encuestas');
  return public.reporte_encuestas_de(auth.uid(), p_ronda);
end;
$$;

create or replace function public.reporte_auditoria(p_desde date, p_hasta date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_permiso('rol:jefe');
  return public.reporte_auditoria_de(auth.uid(), p_desde, p_hasta);
end;
$$;

alter function public.reporte_inventario_equipos() owner to project_admin;
alter function public.reporte_licencias() owner to project_admin;
alter function public.reporte_correos() owner to project_admin;
alter function public.reporte_personal(date, date) owner to project_admin;
alter function public.reporte_solicitudes(date, date) owner to project_admin;
alter function public.reporte_cambios(date, date) owner to project_admin;
alter function public.reporte_problemas(date, date) owner to project_admin;
alter function public.reporte_encuestas(uuid) owner to project_admin;
alter function public.reporte_auditoria(date, date) owner to project_admin;
revoke all on function public.reporte_inventario_equipos() from public, anon, authenticated;
revoke all on function public.reporte_licencias() from public, anon, authenticated;
revoke all on function public.reporte_correos() from public, anon, authenticated;
revoke all on function public.reporte_personal(date, date) from public, anon, authenticated;
revoke all on function public.reporte_solicitudes(date, date) from public, anon, authenticated;
revoke all on function public.reporte_cambios(date, date) from public, anon, authenticated;
revoke all on function public.reporte_problemas(date, date) from public, anon, authenticated;
revoke all on function public.reporte_encuestas(uuid) from public, anon, authenticated;
revoke all on function public.reporte_auditoria(date, date) from public, anon, authenticated;
grant execute on function public.reporte_inventario_equipos() to authenticated;
grant execute on function public.reporte_licencias() to authenticated;
grant execute on function public.reporte_correos() to authenticated;
grant execute on function public.reporte_personal(date, date) to authenticated;
grant execute on function public.reporte_solicitudes(date, date) to authenticated;
grant execute on function public.reporte_cambios(date, date) to authenticated;
grant execute on function public.reporte_problemas(date, date) to authenticated;
grant execute on function public.reporte_encuestas(uuid) to authenticated;
grant execute on function public.reporte_auditoria(date, date) to authenticated;
comment on function public.reporte_inventario_equipos() is
  'Inventario de equipos al corte (117): situación, tipo, ubicación, custodia, garantías, sin devolver y actas pendientes, más el CSV del parque. Guard: módulo equipos (42501).';
comment on function public.reporte_licencias() is
  'Licencias al corte (117): cupo (v_licencias_cupo) y vencimientos, más el CSV. Guard: módulo licencias (42501).';
comment on function public.reporte_correos() is
  'Correos y cuentas al corte (117): por plataforma, rotaciones pendientes y su antigüedad, reutilizables sin titular, más el CSV. Guard: módulo correos (42501).';
comment on function public.reporte_personal(date, date) is
  'Personal (117): foto de hoy, altas y bajas del período (empleado_eventos) y revisiones de acceso pendientes; CSV sin DNI ni contacto. Guard: módulo empleados (42501).';
comment on function public.reporte_solicitudes(date, date) is
  'Solicitudes de servicio del período (117): por tipo, tiempo de trámite y abiertas por antigüedad, más el CSV. Guard: módulo empleados (42501).';
comment on function public.reporte_cambios(date, date) is
  'Cambios del período (117): por tipo y servicio, emergencias sin aprobar y revertidos, más el CSV. Guard: módulo tickets (42501).';
comment on function public.reporte_problemas(date, date) is
  'Problemas y conocimiento del período (117): problemas, errores conocidos, acciones vencidas, uso de la KB y recurrencias, más el CSV. Guard: módulo problemas (42501).';
comment on function public.reporte_encuestas(uuid) is
  'Resultados anónimos de una ronda de encuesta (117), por pregunta, más el CSV de respuestas. Guard: módulo encuestas (42501).';
comment on function public.reporte_auditoria(date, date) is
  'Auditoría del período (117) sobre accesos_log: por acción, por persona, contraseñas, denegados, permisos y purgas; nunca IP ni user_agent. Guard: rol:jefe (42501).';


-- ============================================================
-- reporte_tickets_de: suma `asignado_a` a las filas de `tickets` del jsonb
-- La 115 ya está aplicada en producción y no se edita. El CSV de Tickets
-- absorbe el «Asignado hoy» que antes daba la exportación de la bandeja, así
-- que la 117 reemplaza la función con el MISMO cuerpo de la 115 más ese campo.
-- Misma firma, mismo dueño y mismos permisos. El rollback de la 117 restaura
-- el cuerpo de la 115.
-- ============================================================
create or replace function public.reporte_tickets_de(
  p_user     uuid,
  p_desde    date,
  p_hasta    date,
  p_tecnico  uuid    default null,
  p_comparar boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_version   constant text := 'reportes-2026-10-03';
  v_hoy       date := (now() at time zone 'America/Lima')::date;
  v_minimo    integer := public.parametro_entero('csat_muestra_minima', 5);
  v_corte     integer := public.parametro_entero('dias_corte_reapertura', 30);
  v_jefe      boolean;
  v_nombre    text;
  v_tecnico_nombre text;
  v_completo  boolean;
  v_en_curso  boolean;
  v_cierre    timestamptz;
  v_result    jsonb;
  v_anterior  jsonb;
  v_ant_desde date;
  v_ant_hasta date;
  v_primer_dia date;
begin
  -- Guard único (099): módulo tickets, 42501 si no (también sin sesión).
  if not public.puede(p_user, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_jefe := public.puede(p_user, 'rol:jefe');
  if p_tecnico is not null and p_tecnico <> p_user and not v_jefe then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no es válido: la fecha inicial debe ser anterior o igual a la final.';
  end if;
  if p_hasta - p_desde >= 366 then
    raise exception 'El período no puede superar los 366 días.';
  end if;

  select s.nombre into v_nombre from public.staff s where s.user_id = p_user;
  if p_tecnico is not null then
    select s.nombre into v_tecnico_nombre from public.staff s where s.user_id = p_tecnico;
  end if;

  v_completo := p_hasta < v_hoy;
  v_en_curso := p_desde <= v_hoy and p_hasta >= v_hoy;
  -- Instante de cierre del período (00:00 de Lima del día siguiente a
  -- p_hasta); si el período no terminó, "ahora".
  v_cierre := least(((p_hasta + 1)::timestamp at time zone 'America/Lima'), now());

  with h as (
    select x.*,
           (p_tecnico is null and x.dia_creado between p_desde and p_hasta)               as creado_en,
           (x.resuelto_vigente and x.dia_resuelto between p_desde and p_hasta
              and (p_tecnico is null or x.tecnico_resolvio_id = p_tecnico))               as resuelto_en,
           (x.primera_resolucion_at is not null
              and x.dia_primera_resolucion between p_desde and p_hasta
              and (p_tecnico is null or x.tecnico_resolvio_id = p_tecnico))               as primera_resolucion_en
      from public.v_ticket_hechos x
  ),
  u as (
    -- Universo del período: creados o resueltos en él (con alcance técnico,
    -- solo lo que ese técnico resolvió).
    select * from h where creado_en or resuelto_en or primera_resolucion_en
  ),
  eventos_reapertura as (
    select count(*)::integer as n
      from h cross join unnest(h.reaperturas_at) as r
     where (r at time zone 'America/Lima')::date between p_desde and p_hasta
       and (p_tecnico is null or h.tecnico_resolvio_id = p_tecnico)
  ),
  backlog as (
    select * from public.backlog_tramos_en(v_cierre)
  ),
  dimension as (
    select d.dimension, d.clave, d.nombre,
           count(*) filter (where u.creado_en)::integer   as creados,
           count(*) filter (where u.resuelto_en)::integer as resueltos
      from u
      cross join lateral (values
        ('categoria',    coalesce(u.categoria_id, ''),                                   coalesce(u.categoria_nombre, 'Sin categoría')),
        ('subcategoria', coalesce(u.subcategoria_id::text, ''),                          coalesce(u.categoria_nombre, 'Sin categoría') || ' › ' || coalesce(u.subcategoria_nombre, 'Sin subcategoría')),
        ('prioridad',    coalesce(u.prioridad, ''),                                      coalesce(u.prioridad, 'Sin definir')),
        ('tipo',         coalesce(u.tipo, ''),                                           coalesce(u.tipo, 'sin_clasificar')),
        ('nivel',        coalesce(u.nivel_atencion, ''),                                 coalesce(u.nivel_atencion, 'Sin nivel')),
        ('area',         coalesce(u.area_obra_id::text, ''),                             coalesce(u.area_obra_nombre, 'Sin registrar'))
      ) as d(dimension, clave, nombre)
     where u.creado_en or u.resuelto_en
     group by d.dimension, d.clave, d.nombre
  ),
  tiempos as (
    select count(horas_resolucion)::integer as n,
           round(percentile_cont(0.5) within group (order by horas_resolucion)::numeric, 2) as mediana,
           round(avg(horas_resolucion)::numeric, 2) as promedio,
           count(horas_primera_respuesta)::integer as n_pr,
           round(percentile_cont(0.5) within group (order by horas_primera_respuesta)::numeric, 2) as mediana_pr,
           round(avg(horas_primera_respuesta)::numeric, 2) as promedio_pr
      from u where resuelto_en
  ),
  tiempos_prioridad as (
    select coalesce(prioridad, 'sin_definir') as prioridad,
           count(horas_resolucion)::integer as n,
           round(percentile_cont(0.5) within group (order by horas_resolucion)::numeric, 2) as mediana,
           round(avg(horas_resolucion)::numeric, 2) as promedio
      from u where resuelto_en
     group by coalesce(prioridad, 'sin_definir')
  ),
  reaperturas as (
    select count(*) filter (where primera_resolucion_en)::integer                          as base,
           count(*) filter (where primera_resolucion_en and reabierto_en_corte)::integer   as reabiertos
      from u
  ),
  csat as (
    select count(*) filter (where encuesta_generada)::integer    as generadas,
           count(*) filter (where encuesta_respondida)::integer  as respondidas,
           count(encuesta_nivel)::integer                        as n,
           round(avg(encuesta_nivel)::numeric, 2)                as promedio_crudo,
           count(*) filter (where encuesta_nivel = 1)::integer   as n1,
           count(*) filter (where encuesta_nivel = 2)::integer   as n2,
           count(*) filter (where encuesta_nivel = 3)::integer   as n3,
           count(*) filter (where encuesta_nivel = 4)::integer   as n4,
           count(*) filter (where encuesta_nivel = 5)::integer   as n5,
           count(*) filter (where encuesta_nivel <= 2)::integer  as insatisfechos
      from u where resuelto_en
  ),
  comentarios_bajos as (
    select codigo, encuesta_nivel as nivel, encuesta_comentario as comentario, encuesta_respondida_at as fecha
      from u
     where resuelto_en and encuesta_nivel <= 2 and encuesta_comentario is not null
  ),
  por_tecnico as (
    select u.tecnico_resolvio_id as tecnico_id,
           s.nombre,
           count(*) filter (where u.resuelto_en)::integer                                  as resueltos,
           count(*) filter (where u.resuelto_en and u.creado_en)::integer                   as mismo_periodo,
           count(*) filter (where u.resuelto_en and not u.creado_en)::integer               as arrastrados,
           count(u.horas_resolucion) filter (where u.resuelto_en)::integer                  as t_n,
           round(percentile_cont(0.5) within group (order by u.horas_resolucion) filter (where u.resuelto_en)::numeric, 2) as t_mediana,
           round(avg(u.horas_resolucion) filter (where u.resuelto_en)::numeric, 2)         as t_promedio,
           count(u.encuesta_nivel) filter (where u.resuelto_en)::integer                    as c_n,
           round(avg(u.encuesta_nivel) filter (where u.resuelto_en)::numeric, 2)           as c_promedio,
           count(*) filter (where u.primera_resolucion_en)::integer                         as r_base,
           count(*) filter (where u.primera_resolucion_en and u.reabierto_en_corte)::integer as r_reabiertos,
           (select count(*) from public.v_ticket_hechos a
             where a.asignado_a = u.tecnico_resolvio_id
               and a.estado not in ('resuelto', 'cerrado', 'rechazado'))::integer           as asignados_hoy
      from u
      left join public.staff s on s.user_id = u.tecnico_resolvio_id
     where u.resuelto_en or u.primera_resolucion_en
     group by u.tecnico_resolvio_id, s.nombre
  ),
  anexo_arrastrados as (
    select codigo, titulo, created_at, resuelto_at,
           floor(extract(epoch from (resuelto_at - created_at)) / 86400)::integer as dias_abierto,
           tecnico_resolvio_id as tecnico_id
      from u
     where resuelto_en and dia_creado < p_desde
  ),
  anexo_sin_encuesta as (
    select codigo, titulo, resuelto_at,
           case when empleado_id is null then 'sin_solicitante' else 'sin_encuesta' end as motivo
      from u
     where resuelto_en and cerrado and not encuesta_generada
  )
  select jsonb_build_object(
    'generado_en',          now(),
    'generado_por',         jsonb_build_object('user_id', p_user, 'nombre', v_nombre),
    'definiciones_version', c_version,
    'periodo', jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta, 'dias', (p_hasta - p_desde + 1),
      'completo', v_completo, 'en_curso', v_en_curso, 'cierre_at', v_cierre, 'zona', 'America/Lima'),
    'periodo_completo',     v_completo,
    'alcance', jsonb_build_object(
      'tipo', case when p_tecnico is null then 'equipo' else 'tecnico' end,
      'tecnico_id', p_tecnico, 'tecnico_nombre', v_tecnico_nombre),
    'parametros', jsonb_build_object('csat_muestra_minima', v_minimo, 'dias_corte_reapertura', v_corte),
    'primer_ticket_at',     (select min(created_at) from public.v_ticket_hechos),
    'volumen', jsonb_build_object(
      'creados',                  case when p_tecnico is null then (select count(*) from u where creado_en) end,
      'rechazados',               case when p_tecnico is null then (select count(*) from u where creado_en and rechazado) end,
      'resueltos',                (select count(*) from u where resuelto_en),
      'resueltos_mismo_periodo',  (select count(*) from u where resuelto_en and dia_creado between p_desde and p_hasta),
      'resueltos_arrastrados',    (select count(*) from u where resuelto_en and dia_creado < p_desde),
      'cerrados_sin_encuesta',    (select count(*) from anexo_sin_encuesta),
      'backlog', case when p_tecnico is null then jsonb_build_object(
        'referencia',       case when v_completo then 'cierre' else 'ahora' end,
        'total',            (select coalesce(sum(cantidad), 0) from backlog),
        'dias_mas_antiguo', (select max(dias_mas_antiguo) from backlog),
        'tramos',           (select jsonb_agg(jsonb_build_object('clave', clave, 'etiqueta', etiqueta, 'cantidad', cantidad) order by orden) from backlog)
      ) end
    ),
    'por', jsonb_build_object(
      'categoria',    coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by creados desc, resueltos desc, nombre) from dimension where dimension = 'categoria'), '[]'::jsonb),
      'subcategoria', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by creados desc, resueltos desc, nombre) from dimension where dimension = 'subcategoria'), '[]'::jsonb),
      'prioridad',    coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by array_position(array['urgente', 'alta', 'media', 'baja'], clave) nulls last) from dimension where dimension = 'prioridad'), '[]'::jsonb),
      'tipo',         coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by creados desc, resueltos desc, nombre) from dimension where dimension = 'tipo'), '[]'::jsonb),
      'nivel',        coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by nombre) from dimension where dimension = 'nivel'), '[]'::jsonb),
      'area',         coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'creados', creados, 'resueltos', resueltos) order by creados desc, resueltos desc, nombre) from dimension where dimension = 'area'), '[]'::jsonb)
    ),
    'atencion', jsonb_build_object(
      'unidad', 'horas corridas',
      'resolucion',        (select jsonb_build_object('n', n, 'mediana_horas', mediana, 'promedio_horas', promedio) from tiempos),
      'primera_respuesta', (select jsonb_build_object('n', n_pr, 'mediana_horas', mediana_pr, 'promedio_horas', promedio_pr) from tiempos),
      'por_prioridad', coalesce((select jsonb_agg(jsonb_build_object('prioridad', prioridad, 'n', n, 'mediana_horas', mediana, 'promedio_horas', promedio)
                                                  order by array_position(array['urgente', 'alta', 'media', 'baja'], prioridad) nulls last) from tiempos_prioridad), '[]'::jsonb)
    ),
    'calidad', jsonb_build_object(
      'reaperturas', (select jsonb_build_object(
          'base', base, 'reabiertos', reabiertos,
          'tasa_pct', case when base > 0 then round(100.0 * reabiertos / base)::integer end,
          'eventos', (select n from eventos_reapertura),
          'corte_dias', v_corte,
          'ventana_completa', (p_hasta + v_corte) < v_hoy) from reaperturas),
      'csat', (select jsonb_build_object(
          'generadas', generadas, 'respondidas', respondidas,
          'tasa_respuesta_pct', case when generadas > 0 then round(100.0 * respondidas / generadas)::integer end,
          'n', n,
          'promedio', case when n >= v_minimo then promedio_crudo end,
          'insuficiente', n < v_minimo,
          'minimo', v_minimo,
          'niveles', jsonb_build_object('1', n1, '2', n2, '3', n3, '4', n4, '5', n5),
          'insatisfechos', insatisfechos) from csat),
      'comentarios_bajos', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nivel', nivel, 'comentario', comentario, 'fecha', fecha) order by fecha desc)
                                       from (select * from comentarios_bajos order by fecha desc limit 20) cb), '[]'::jsonb),
      'comentarios_bajos_total', (select count(*) from comentarios_bajos)
    ),
    'por_tecnico', case when v_jefe then coalesce((select jsonb_agg(jsonb_build_object(
        'tecnico_id', tecnico_id, 'nombre', nombre,
        'resueltos', resueltos, 'mismo_periodo', mismo_periodo, 'arrastrados', arrastrados,
        'tiempos', jsonb_build_object('n', t_n, 'mediana_horas', t_mediana, 'promedio_horas', t_promedio),
        'csat', jsonb_build_object('n', c_n, 'promedio', case when c_n >= v_minimo then c_promedio end, 'insuficiente', c_n < v_minimo),
        'reaperturas', jsonb_build_object('base', r_base, 'reabiertos', r_reabiertos),
        'asignados_hoy', asignados_hoy
      ) order by resueltos desc, nombre nulls last) from por_tecnico), '[]'::jsonb) end,
    'anexos', jsonb_build_object(
      'arrastrados', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'titulo', titulo, 'created_at', created_at, 'resuelto_at', resuelto_at,
                                                               'dias_abierto', dias_abierto, 'tecnico_id', tecnico_id) order by dias_abierto desc, codigo) from anexo_arrastrados), '[]'::jsonb),
      'cerrados_sin_encuesta', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'titulo', titulo, 'resuelto_at', resuelto_at, 'motivo', motivo) order by resuelto_at desc) from anexo_sin_encuesta), '[]'::jsonb)
    ),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', codigo, 'titulo', titulo, 'estado', estado, 'prioridad', prioridad, 'tipo', tipo, 'nivel_atencion', nivel_atencion,
        'categoria', categoria_nombre, 'subcategoria', subcategoria_nombre, 'area', area_obra_nombre, 'solicitante', solicitante,
        'created_at', created_at, 'resuelto_at', resuelto_at,
        'horas_resolucion', case when resuelto_en then round(horas_resolucion::numeric, 2) end,
        'tecnico_id', tecnico_resolvio_id, 'asignado_a', asignado_a, 'encuesta_nivel', encuesta_nivel,
        'en_periodo', case when creado_en and resuelto_en then 'ambos' when creado_en then 'creado' else 'resuelto' end
      ) order by created_at desc) from u where creado_en or resuelto_en), '[]'::jsonb),
    'comparacion', null
  ) into v_result;

  -- Comparación: solo períodos completos, alcance equipo, y nunca dentro de
  -- la propia comparación. Un mes de calendario se compara con el mes de
  -- calendario anterior; cualquier otro rango, con el rango inmediatamente
  -- anterior de la misma cantidad de días. `parcial` avisa que el período
  -- anterior empieza antes del primer ticket registrado.
  if p_comparar and v_completo and p_tecnico is null then
    if p_desde = date_trunc('month', p_desde)::date
       and p_hasta = (date_trunc('month', p_desde) + interval '1 month - 1 day')::date then
      v_ant_desde := (date_trunc('month', p_desde) - interval '1 month')::date;
      v_ant_hasta := p_desde - 1;
    else
      v_ant_hasta := p_desde - 1;
      v_ant_desde := p_desde - (p_hasta - p_desde + 1);
    end if;
    v_anterior := public.reporte_tickets_de(p_user, v_ant_desde, v_ant_hasta, null, false);
    v_primer_dia := ((v_result ->> 'primer_ticket_at')::timestamptz at time zone 'America/Lima')::date;
    v_result := v_result || jsonb_build_object('comparacion', jsonb_build_object(
      'periodo',     jsonb_build_object('desde', v_ant_desde, 'hasta', v_ant_hasta),
      'parcial',     (v_primer_dia is null or v_ant_desde < v_primer_dia),
      'volumen',     (v_anterior -> 'volumen') - 'backlog',
      'atencion',    v_anterior -> 'atencion' -> 'resolucion',
      'csat',        v_anterior -> 'calidad' -> 'csat',
      'reaperturas', v_anterior -> 'calidad' -> 'reaperturas'
    ));
  end if;

  return v_result;
end;
$$;

alter function public.reporte_tickets_de(uuid, date, date, uuid, boolean) owner to project_admin;
revoke all on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) to project_admin;

-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Parámetro nuevo (esperado: 1 fila, 180):
--    select clave, valor from public.config_parametros where clave = 'dias_revision_accesos';
--
-- 2) Funciones (esperado: 24 filas, todas con dueño project_admin; las *_de y las 9 públicas con prosecdef = true):
--    select p.oid::regprocedure, pg_get_userbyid(p.proowner) as dueno, p.prosecdef from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'reporte\_%' and p.proname not in ('reporte_tickets','reporte_tickets_de','reporte_satisfaccion_consolidado','reporte_satisfaccion_consolidado_de') order by 1;
--
-- 3) EXECUTE (esperado: las 9 públicas authenticated=true y anon=false; las *_de y los auxiliares authenticated=false, project_admin=true):
--    select p.oid::regprocedure, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('project_admin', p.oid, 'execute') as project_admin from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'reporte\_%' order by 1;
--
-- 4) Sin sesión, las públicas responden 42501 (resultado esperado):
--    select public.reporte_inventario_equipos();
--
-- 5) Un reporte con un usuario explícito, solo cifras (sin filas con nombres):
--    select jsonb_array_length(r -> 'secciones') as secciones, jsonb_array_length(r -> 'filas_csv' -> 'filas') as filas_csv, r ->> 'definiciones_version' from public.reporte_inventario_equipos_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1)) r;
--    (esperado: 3 secciones; filas_csv = select count(*) from public.equipos where deleted_at is null)
--
-- 6) Ninguna salida con DNI (esperado: false):
--    select public.reporte_personal_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1), current_date - 30, current_date)::text ~ (select string_agg(dni, '|') from public.empleados where dni ~ '^[0-9]{8}$');
--
-- 7) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '117';
-- Después de aplicar: publicar el frontend (Reportes). El frontend nuevo sin
-- la migración fallaría con PGRST202 en los reportes nuevos (Tickets y
-- Satisfacción siguen funcionando con la 115): aplicar ANTES la migración.
-- ============================================================
-- FIN DE MIGRACIÓN 117
-- ============================================================
