-- ============================================================
-- MIGRACIÓN 118 — Tablero de mesa de ayuda: reporte diario y semanal,
-- satisfacción por período, por solicitante y por técnico de mesa
-- Depende de: 115 (v_ticket_hechos, backlog_tramos_en, reporte_tickets_de,
--   reporte_satisfaccion_consolidado_de), 117 (reporte_validar_periodo y la
--   versión de reporte_tickets_de con `asignado_a`), 103 (config_parametros,
--   parametro_entero), 099 (puede / exigir_permiso), 061 (es_jefe y el trigger
--   de autoedición del staff).
--
-- Encargo del dueño (2026-10-06, propuesta «Tablero de mesa de ayuda»): el
-- reporte de Tickets debe leerse como un tablero para gerencia (cuánto
-- ingresó, cuánto se resolvió, qué % de lo que ingresó ya está resuelto, qué
-- queda pendiente, quiénes generan más tickets y cuánto tardó cada uno), por
-- DÍA y por SEMANA además del mes; mostrar solo a los técnicos de mesa de
-- ayuda (hoy José Soller y Martín Calderón) y lo demás en una fila «Jefatura y
-- otros» para que los totales cuadren; y Satisfacción debe decir, persona por
-- persona, cuántos tickets se le atendieron, cuántas encuestas respondió,
-- cuántas le faltan, su % de satisfacción y si está conforme, más el % de cada
-- técnico.
--
-- Decisiones del dueño (2026-10-06), fijadas acá como definiciones:
--   · «% resuelto» = de los tickets que INGRESARON en el período y no fueron
--     rechazados, cuántos ya están resueltos al cierre del período (resolución
--     vigente dentro del período). Nunca pasa de 100 %. Los resueltos que
--     ingresaron antes se informan aparte («de días anteriores»).
--   · Técnico de mesa de ayuda: marca `staff.tecnico_mesa` (la edita solo un
--     JEFE). Cada técnico marcado y activo tiene su fila (aunque no haya
--     resuelto nada); lo que resolvió cualquier otra persona va en UNA fila
--     «Jefatura y otros» (grupo 'otros'). El desglose por técnico sigue siendo
--     solo para el JEFE (decisión de la 115); esta migración además lo cierra
--     en Satisfacción, que lo entregaba a todo el módulo (hallazgo 2026-10-06).
--   · % de satisfacción = respuestas con nivel 4 o 5 entre todas las
--     respondidas. 3 = regular; 1 y 2 = insatisfecho (como en la 115). Para el
--     total, cada mes y cada técnico se publica con la MISMA muestra mínima que
--     el promedio (csat_muestra_minima).
--   · Situación de un solicitante: conforme (>= 80 %), regular (60 a 79 %),
--     inconforme (< 60 %), con el % redondeado; «pocas_respuestas» con menos de
--     3 respondidas y «sin_respuestas» con ninguna. Los tres umbrales son
--     parámetros (config_parametros) que el JEFE puede editar.
--   · Semana de lunes a domingo y día de calendario completo (00:00 a 24:00 de
--     Lima); los arma el frontend como un rango y el servidor corta en Lima.
--   · Satisfacción por período: tickets con resolución VIGENTE dentro del
--     período (la misma regla que «Resuelto en el período» del reporte de
--     Tickets). Sin período, todo el historial. Hoy ninguna encuesta pertenece
--     a un ticket sin resolución vigente (0 en producción, 2026-10-06), así que
--     el histórico no cambia de cifras.
--
-- ── TABLA DE FIRMAS (contrato con el frontend) ─────────────────────────────
--
--   PARÁMETROS (config_parametros, on conflict do nothing):
--     satisfaccion_conforme_pct     80  % desde el que un solicitante está conforme
--     satisfaccion_regular_pct      60  % desde el que está regular (debajo: inconforme)
--     satisfaccion_minimo_persona    3  respuestas para calificar a un solicitante
--
--   COLUMNA public.staff.tecnico_mesa boolean not null default false.
--     Al crearla se marca a los ASISTENTE activos que ya resolvieron al menos un
--     ticket (en producción, 2026-10-06: José Soller y Martín Calderón). La
--     cambia solo un JEFE: trigger trg_staff_tecnico_mesa (42501); sin sesión
--     (migraciones, scripts) no se bloquea.
--
--   FUNCIÓN public.backlog_tickets_en(p_instante timestamptz)
--     → table (ticket_id uuid, dias integer): los tickets VIGENTES a un instante
--     (la definición que antes vivía dentro de backlog_tramos_en). STABLE,
--     SECURITY INVOKER, EXECUTE a authenticated. backlog_tramos_en se reescribe
--     sobre ella (mismo resultado): la lista de pendientes y los tramos salen
--     de UNA definición.
--
--   FUNCIÓN public.reporte_tickets_de(...) — misma firma, mismo dueño y
--     permisos. Suma al jsonb (las claves de la 115/117 no cambian salvo
--     `por_tecnico`):
--       tablero: null (alcance técnico) | {ingresaron, rechazados, validos,
--                resueltos, resueltos_de_ingresados, pct_resuelto,
--                pendientes_inicio, pendientes_cierre}
--       por_dia: null (alcance técnico o período de más de 31 días) |
--                [{dia, ingresaron, rechazados, resueltos}] (todos los días,
--                también los que tienen cero)
--       pendientes: null (alcance técnico) | {referencia: 'cierre'|'ahora',
--                total, sin_asignar_hoy, lista: [{codigo, titulo, prioridad,
--                estado_hoy, created_at, dias, asignado_a, solicitante}]
--                (los 100 más antiguos)}
--       solicitantes: null (alcance técnico) | {total, top: [{solicitante,
--                area, tickets, sin_resolver}] (los 10 que más tickets
--                ingresaron)}
--       calidad.csat suma: satisfechos, regulares, pct_satisfaccion
--       por_tecnico (solo JEFE): [{grupo: 'tecnico'|'otros', tecnico_id
--                (null en 'otros'), nombre (null en 'otros'), resueltos,
--                mismo_periodo, arrastrados, tiempos: {n, mediana_horas,
--                promedio_horas}, csat: {n, promedio, insuficiente,
--                satisfechos, pct_satisfaccion}, reaperturas: {base,
--                reabiertos}, asignados_hoy}] — técnicos primero
--       comparacion suma: tablero
--     definiciones_version = 'reportes-2026-10-06'.
--
--   FUNCIÓN public.satisfaccion_fila(...) → jsonb: la fila común de
--     satisfacción (conteos, promedio con muestra mínima, % y situación).
--     IMMUTABLE, EXECUTE solo project_admin.
--
--   FUNCIÓN public.reporte_satisfaccion(p_desde date default null,
--                                       p_hasta date default null) → jsonb
--     SECURITY DEFINER. Guard exigir_permiso('modulo:tickets') (42501) y delega
--     en reporte_satisfaccion_de(auth.uid(), p_desde, p_hasta) (EXECUTE solo
--     project_admin). Las dos fechas o ninguna (todo el historial); período
--     válido de como mucho 366 días (P0001). Forma:
--     {
--       generado_en, generado_por: {user_id, nombre}, definiciones_version,
--       periodo: null | {desde, hasta, dias, completo, en_curso},
--       muestraMinima, umbrales: {conformePct, regularPct, minimoPersona},
--       resumen, porMes: [{mes, ...fila}],
--       porTecnico: null (si no es JEFE) | [{grupo, tecnico_id, nombre, ...fila}],
--       porSolicitante: [{empleado_id, nombre, area, ...fila, situacion}],
--       respuestas: [{id, ticket_id, ticket_codigo, ticket_titulo, empleado_id,
--                     solicitante, tecnico_id (null si no es JEFE), nivel,
--                     comentario, fecha_envio, created_at, respondida}]
--     }
--     fila = {tickets, encuestasGeneradas, encuestasRespondidas, faltan,
--             tasaRespuestaPct, muestra, promedio, insuficiente, niveles {1..5},
--             satisfechos, regulares, insatisfechos, pctSatisfaccion, situacion}
--   FUNCIÓN public.reporte_satisfaccion_consolidado_de(p_user uuid) — misma
--     firma: ahora es reporte_satisfaccion_de(p_user, null, null) con
--     `porTecnico` como lista vacía para quien no es JEFE (el frontend anterior
--     la recorre). reporte_satisfaccion_consolidado() no cambia; queda por
--     compatibilidad con el frontend desplegado hasta que se publique el nuevo.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `node scripts/deploy.mjs migracion migrations/118_tablero_mesa_de_ayuda.sql`,
-- NUNCA `db query` a mano. Correr SIEMPRE el bloque "Verificación" del final.
-- Todo es idempotente (reaplicar es seguro; la marca inicial de técnicos solo
-- se siembra al crear la columna).
-- Rollback: migrations/rollback/118_rollback.sql (restaura los cuerpos de la
-- 117/115 y quita la columna, las funciones y los parámetros nuevos).
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 115 y 117
-- ============================================================

do $$
begin
  if to_regclass('public.v_ticket_hechos') is null
     or to_regprocedure('public.backlog_tramos_en(timestamptz)') is null
     or to_regprocedure('public.reporte_satisfaccion_consolidado_de(uuid)') is null then
    raise exception 'La migración 118 requiere la 115 (v_ticket_hechos y reportes de tickets). Aplíquela primero.';
  end if;
  if to_regprocedure('public.reporte_validar_periodo(date, date)') is null then
    raise exception 'La migración 118 requiere la 117 (reporte_validar_periodo). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) Parámetros de la situación de un solicitante
-- ============================================================

insert into public.config_parametros (clave, valor, descripcion) values
  ('satisfaccion_conforme_pct', '80'::jsonb,
   'Porcentaje de respuestas satisfechas (4 o 5) desde el que un solicitante figura como conforme en el reporte de Satisfacción.'),
  ('satisfaccion_regular_pct', '60'::jsonb,
   'Porcentaje desde el que un solicitante figura como regular; por debajo, inconforme.'),
  ('satisfaccion_minimo_persona', '3'::jsonb,
   'Respuestas necesarias para calificar a un solicitante; con menos figura «pocas respuestas».')
on conflict (clave) do nothing;


-- ============================================================
-- 2) Técnico de mesa de ayuda (staff.tecnico_mesa)
-- ============================================================

-- La marca inicial se siembra SOLO al crear la columna: reaplicar no pisa lo
-- que el JEFE haya cambiado después.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'staff' and column_name = 'tecnico_mesa'
  ) then
    alter table public.staff add column tecnico_mesa boolean not null default false;
    update public.staff s
       set tecnico_mesa = true
     where s.rol = 'ASISTENTE' and s.activo
       and exists (select 1 from public.ticket_eventos e
                    where e.user_id = s.user_id and e.evento = 'estado_cambiado'
                      and e.detalle ~ 'a "resuelto"\s*$');
  end if;
end $$;

comment on column public.staff.tecnico_mesa is
  'Técnico de mesa de ayuda: los reportes de Tickets y Satisfacción lo muestran en su propia fila; lo resuelto por cualquier otra persona va en «Jefatura y otros». Solo un JEFE lo cambia. Migración 118.';

create or replace function public.check_staff_tecnico_mesa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin sesión (migraciones, scripts con cliente admin) no se bloquea.
  if new.tecnico_mesa is distinct from old.tecnico_mesa
     and auth.uid() is not null and not public.es_jefe() then
    raise exception 'Solo un JEFE puede marcar a un técnico de mesa de ayuda.' using errcode = '42501';
  end if;
  return new;
end;
$$;

alter function public.check_staff_tecnico_mesa() owner to project_admin;
revoke all on function public.check_staff_tecnico_mesa() from public, anon, authenticated;
comment on function public.check_staff_tecnico_mesa() is
  'Trigger: solo un JEFE cambia staff.tecnico_mesa (42501). Migración 118.';

drop trigger if exists trg_staff_tecnico_mesa on public.staff;
create trigger trg_staff_tecnico_mesa
  before update of tecnico_mesa on public.staff
  for each row execute function public.check_staff_tecnico_mesa();


-- ============================================================
-- 3) Tickets vigentes a un instante: UNA definición para tramos y lista
-- ============================================================

create or replace function public.backlog_tickets_en(p_instante timestamptz)
returns table (ticket_id uuid, dias integer)
language sql
stable
set search_path = public
as $$
  select h.ticket_id,
         floor(extract(epoch from (p_instante - h.created_at)) / 86400)::integer as dias
    from public.v_ticket_hechos h
   where h.created_at <= p_instante
     and coalesce(
           (select x ->> 'a'
              from jsonb_array_elements(h.transiciones) x
             where (x ->> 't')::timestamptz <= p_instante
             order by (x ->> 't')::timestamptz desc
             limit 1),
           -- sin transiciones registradas: el estado actual (un ticket legado
           -- creado ya cerrado) o 'abierto' (estado inicial de todo ticket)
           case when h.transiciones = '[]'::jsonb then h.estado else 'abierto' end
         ) not in ('resuelto', 'cerrado', 'rechazado');
$$;

alter function public.backlog_tickets_en(timestamptz) owner to project_admin;
revoke all on function public.backlog_tickets_en(timestamptz) from public, anon;
grant execute on function public.backlog_tickets_en(timestamptz) to authenticated;
comment on function public.backlog_tickets_en(timestamptz) is
  'Tickets vigentes a un instante (estado reconstruido por sus transiciones) con sus días corridos desde la creación. SECURITY INVOKER. Migración 118 (antes dentro de backlog_tramos_en, 115).';

create or replace function public.backlog_tramos_en(p_instante timestamptz)
returns table (orden integer, clave text, etiqueta text, cantidad integer, dias_mas_antiguo integer)
language sql
stable
set search_path = public
as $$
  with tramos(orden, clave, etiqueta, desde, hasta) as (
    values (1, 'hasta_3',   '0 a 3 días',     0,  3),
           (2, 'de_4_a_7',  '4 a 7 días',     4,  7),
           (3, 'de_8_a_30', '8 a 30 días',    8,  30),
           (4, 'mas_30',    'Más de 30 días', 31, null::integer)
  )
  select t.orden, t.clave, t.etiqueta,
         count(v.ticket_id)::integer as cantidad,
         max(v.dias)::integer        as dias_mas_antiguo
    from tramos t
    left join public.backlog_tickets_en(p_instante) v
      on v.dias >= t.desde and (t.hasta is null or v.dias <= t.hasta)
   group by t.orden, t.clave, t.etiqueta
   order by t.orden;
$$;

alter function public.backlog_tramos_en(timestamptz) owner to project_admin;
revoke all on function public.backlog_tramos_en(timestamptz) from public, anon;
grant execute on function public.backlog_tramos_en(timestamptz) to authenticated;
comment on function public.backlog_tramos_en(timestamptz) is
  'Tickets vigentes a un instante por tramo de días corridos, sobre backlog_tickets_en. SECURITY INVOKER. Migraciones 115 y 118.';


-- ============================================================
-- 4) reporte_tickets_de: tablero, por día, pendientes, solicitantes y
--    técnicos de mesa (misma firma, dueño y permisos)
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
  c_version   constant text := 'reportes-2026-10-06';
  v_hoy       date := (now() at time zone 'America/Lima')::date;
  v_minimo    integer := public.parametro_entero('csat_muestra_minima', 5);
  v_corte     integer := public.parametro_entero('dias_corte_reapertura', 30);
  v_jefe      boolean;
  v_nombre    text;
  v_tecnico_nombre text;
  v_completo  boolean;
  v_en_curso  boolean;
  v_inicio    timestamptz;
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
  -- Inicio (00:00 de Lima de p_desde) y cierre (00:00 de Lima del día
  -- siguiente a p_hasta) del período; lo que todavía no llegó, "ahora".
  v_inicio := least((p_desde::timestamp at time zone 'America/Lima'), now());
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
  -- Pendientes al cierre: la MISMA definición que los tramos (backlog_tickets_en).
  pend as (
    select x.codigo, x.titulo, x.prioridad, x.estado, x.created_at, x.asignado_a, x.solicitante, b.dias
      from public.backlog_tickets_en(v_cierre) b
      join h x on x.ticket_id = b.ticket_id
  ),
  -- Carga de hoy: tickets vigentes por persona asignada.
  carga as (
    select t.asignado_a, count(*)::integer as n
      from public.tickets t
     where t.asignado_a is not null and t.estado not in ('resuelto', 'cerrado', 'rechazado')
     group by t.asignado_a
  ),
  -- Solicitantes de lo que ingresó en el período (un ticket sin vincular va
  -- al grupo «Sin vincular»).
  sol as (
    select s.empleado_id,
           max(s.solicitante)                                                 as solicitante,
           case when s.empleado_id is not null then max(s.area_obra_nombre) end as area,
           count(*)::integer                                                  as tickets,
           count(*) filter (where not s.resuelto_en and not s.rechazado)::integer as sin_resolver
      from (select case when coalesce(u.vinculado, false) then u.empleado_id end as empleado_id,
                   u.solicitante, u.area_obra_nombre, u.resuelto_en, u.rechazado
              from u where u.creado_en) s
     group by s.empleado_id
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
  -- Por técnico: el técnico de mesa marcado es su propio grupo; cualquier
  -- otra persona que resolvió cae en el grupo NULL («Jefatura y otros»).
  ug as (
    select u.*, case when coalesce(s.tecnico_mesa, false) then u.tecnico_resolvio_id end as grupo_id
      from u
      left join public.staff s on s.user_id = u.tecnico_resolvio_id
     where u.resuelto_en or u.primera_resolucion_en
  ),
  por_grupo as (
    select ug.grupo_id,
           count(*) filter (where ug.resuelto_en)::integer                                  as resueltos,
           count(*) filter (where ug.resuelto_en and ug.creado_en)::integer                 as mismo_periodo,
           count(*) filter (where ug.resuelto_en and not ug.creado_en)::integer             as arrastrados,
           count(ug.horas_resolucion) filter (where ug.resuelto_en)::integer                as t_n,
           round(percentile_cont(0.5) within group (order by ug.horas_resolucion) filter (where ug.resuelto_en)::numeric, 2) as t_mediana,
           round(avg(ug.horas_resolucion) filter (where ug.resuelto_en)::numeric, 2)       as t_promedio,
           count(ug.encuesta_nivel) filter (where ug.resuelto_en)::integer                  as c_n,
           round(avg(ug.encuesta_nivel) filter (where ug.resuelto_en)::numeric, 2)         as c_promedio,
           count(*) filter (where ug.resuelto_en and ug.encuesta_nivel >= 4)::integer       as c_satisfechos,
           count(*) filter (where ug.primera_resolucion_en)::integer                        as r_base,
           count(*) filter (where ug.primera_resolucion_en and ug.reabierto_en_corte)::integer as r_reabiertos
      from ug
     group by ug.grupo_id
  ),
  filas_tecnico as (
    -- Cada técnico de mesa activo (con alcance técnico, solo ese) aunque no
    -- haya resuelto nada, más un técnico marcado ya inactivo que resolvió algo.
    select 1 as orden, 'tecnico' as grupo,
           coalesce(m.user_id, g.grupo_id) as tecnico_id,
           coalesce(m.nombre, sx.nombre)   as nombre,
           coalesce(g.resueltos, 0) as resueltos, coalesce(g.mismo_periodo, 0) as mismo_periodo,
           coalesce(g.arrastrados, 0) as arrastrados, coalesce(g.t_n, 0) as t_n, g.t_mediana, g.t_promedio,
           coalesce(g.c_n, 0) as c_n, g.c_promedio, coalesce(g.c_satisfechos, 0) as c_satisfechos,
           coalesce(g.r_base, 0) as r_base, coalesce(g.r_reabiertos, 0) as r_reabiertos,
           coalesce((select c.n from carga c where c.asignado_a = coalesce(m.user_id, g.grupo_id)), 0) as asignados_hoy
      from (select s.user_id, s.nombre from public.staff s
             where s.tecnico_mesa and s.activo and (p_tecnico is null or s.user_id = p_tecnico)) m
      full join (select * from por_grupo where grupo_id is not null) g on g.grupo_id = m.user_id
      left join public.staff sx on sx.user_id = g.grupo_id
    union all
    select 2, 'otros', null::uuid, null::text,
           coalesce(g.resueltos, 0), coalesce(g.mismo_periodo, 0), coalesce(g.arrastrados, 0), coalesce(g.t_n, 0),
           g.t_mediana, g.t_promedio, coalesce(g.c_n, 0), g.c_promedio, coalesce(g.c_satisfechos, 0),
           coalesce(g.r_base, 0), coalesce(g.r_reabiertos, 0),
           case when p_tecnico is null then
             (select coalesce(sum(c.n), 0) from carga c
               where not exists (select 1 from public.staff s where s.user_id = c.asignado_a and s.tecnico_mesa))
           else 0 end::integer
      from (select 1) uno
      left join (select * from por_grupo where grupo_id is null) g on true
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
  ),
  tablero as (
    select count(*) filter (where creado_en)::integer                    as ingresaron,
           count(*) filter (where creado_en and rechazado)::integer      as rechazados,
           count(*) filter (where resuelto_en)::integer                  as resueltos,
           count(*) filter (where resuelto_en and creado_en)::integer    as resueltos_de_ingresados
      from u
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
    'tablero', case when p_tecnico is null then (select jsonb_build_object(
        'ingresaron', t.ingresaron, 'rechazados', t.rechazados, 'validos', t.ingresaron - t.rechazados,
        'resueltos', t.resueltos, 'resueltos_de_ingresados', t.resueltos_de_ingresados,
        'pct_resuelto', case when t.ingresaron - t.rechazados > 0
                             then round(100.0 * t.resueltos_de_ingresados / (t.ingresaron - t.rechazados))::integer end,
        'pendientes_inicio', (select count(*) from public.backlog_tickets_en(v_inicio))::integer,
        'pendientes_cierre', (select count(*) from pend)::integer
      ) from tablero t) end,
    'por_dia', case when p_tecnico is null and p_hasta - p_desde < 31 then (select jsonb_agg(jsonb_build_object(
        'dia',        g.dia,
        'ingresaron', (select count(*) from u where u.creado_en and u.dia_creado = g.dia),
        'rechazados', (select count(*) from u where u.creado_en and u.rechazado and u.dia_creado = g.dia),
        'resueltos',  (select count(*) from u where u.resuelto_en and u.dia_resuelto = g.dia)
      ) order by g.dia) from (select generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day')::date as dia) g) end,
    'pendientes', case when p_tecnico is null then jsonb_build_object(
      'referencia',      case when v_completo then 'cierre' else 'ahora' end,
      'total',           (select count(*) from pend),
      'sin_asignar_hoy', (select count(*) from public.tickets t
                           where t.asignado_a is null and t.estado not in ('resuelto', 'cerrado', 'rechazado')),
      'lista', coalesce((select jsonb_agg(jsonb_build_object(
          'codigo', p.codigo, 'titulo', p.titulo, 'prioridad', p.prioridad, 'estado_hoy', p.estado,
          'created_at', p.created_at, 'dias', p.dias, 'asignado_a', p.asignado_a, 'solicitante', p.solicitante
        ) order by p.dias desc, p.codigo) from (select * from pend order by dias desc, codigo limit 100) p), '[]'::jsonb)
    ) end,
    'solicitantes', case when p_tecnico is null then jsonb_build_object(
      'total', (select count(*) from sol),
      'top', coalesce((select jsonb_agg(jsonb_build_object(
          'solicitante', s.solicitante, 'area', s.area, 'tickets', s.tickets, 'sin_resolver', s.sin_resolver
        ) order by s.tickets desc, (s.empleado_id is null), s.solicitante)
        from (select * from sol order by tickets desc, (empleado_id is null), solicitante limit 10) s), '[]'::jsonb)
    ) end,
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
          'insatisfechos', insatisfechos,
          'satisfechos', n4 + n5,
          'regulares', n3,
          'pct_satisfaccion', case when n > 0 and n >= v_minimo then round(100.0 * (n4 + n5) / n)::integer end) from csat),
      'comentarios_bajos', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nivel', nivel, 'comentario', comentario, 'fecha', fecha) order by fecha desc)
                                       from (select * from comentarios_bajos order by fecha desc limit 20) cb), '[]'::jsonb),
      'comentarios_bajos_total', (select count(*) from comentarios_bajos)
    ),
    'por_tecnico', case when v_jefe then coalesce((select jsonb_agg(jsonb_build_object(
        'grupo', f.grupo, 'tecnico_id', f.tecnico_id, 'nombre', f.nombre,
        'resueltos', f.resueltos, 'mismo_periodo', f.mismo_periodo, 'arrastrados', f.arrastrados,
        'tiempos', jsonb_build_object('n', f.t_n, 'mediana_horas', f.t_mediana, 'promedio_horas', f.t_promedio),
        'csat', jsonb_build_object('n', f.c_n, 'promedio', case when f.c_n >= v_minimo then f.c_promedio end, 'insuficiente', f.c_n < v_minimo,
                                   'satisfechos', f.c_satisfechos,
                                   'pct_satisfaccion', case when f.c_n > 0 and f.c_n >= v_minimo then round(100.0 * f.c_satisfechos / f.c_n)::integer end),
        'reaperturas', jsonb_build_object('base', f.r_base, 'reabiertos', f.r_reabiertos),
        'asignados_hoy', f.asignados_hoy
      ) order by f.orden, f.resueltos desc, f.nombre nulls last)
      from filas_tecnico f
      where f.grupo = 'tecnico' or f.resueltos > 0 or f.r_base > 0 or f.asignados_hoy > 0), '[]'::jsonb) end,
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
  -- calendario anterior; cualquier otro rango (un día, una semana), con el
  -- rango inmediatamente anterior de la misma cantidad de días. `parcial`
  -- avisa que el período anterior empieza antes del primer ticket registrado.
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
      'tablero',     v_anterior -> 'tablero',
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
comment on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) is
  'Cuerpo de reporte_tickets() para un usuario explícito (115, 117, 118: tablero, por día, pendientes, solicitantes y técnicos de mesa). EXECUTE solo project_admin: existe para probar el reporte sin simular una sesión. Guard: módulo tickets (42501); otro técnico exige rol:jefe.';


-- ============================================================
-- 5) Satisfacción por período, por solicitante y por técnico de mesa
-- ============================================================

-- La fila común: conteos, promedio con la muestra mínima, % de satisfacción y,
-- con umbrales (solicitantes), la situación. Una sola fórmula para el total,
-- cada mes, cada técnico y cada solicitante.
create or replace function public.satisfaccion_fila(
  p_tickets     integer,
  p_generadas   integer,
  p_respondidas integer,
  p_promedio    numeric,
  p_n1 integer, p_n2 integer, p_n3 integer, p_n4 integer, p_n5 integer,
  p_minimo      integer,
  p_umbrales    integer[] default null  -- {conforme_pct, regular_pct, minimo_persona}
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'tickets',              p_tickets,
    'encuestasGeneradas',   p_generadas,
    'encuestasRespondidas', p_respondidas,
    'faltan',               p_generadas - p_respondidas,
    'tasaRespuestaPct',     case when p_generadas > 0 then round(100.0 * p_respondidas / p_generadas)::integer end,
    'muestra',              x.muestra,
    'promedio',             case when x.muestra >= p_minimo then p_promedio end,
    'insuficiente',         x.muestra < p_minimo,
    'niveles',              jsonb_build_object('1', p_n1, '2', p_n2, '3', p_n3, '4', p_n4, '5', p_n5),
    'satisfechos',          p_n4 + p_n5,
    'regulares',            p_n3,
    'insatisfechos',        p_n1 + p_n2,
    -- Sin umbrales (total, mes, técnico): el % se publica con la muestra
    -- mínima, como el promedio. Con umbrales (solicitante): siempre que haya
    -- respuestas, y la situación dice si alcanza para calificar.
    'pctSatisfaccion',      case when x.muestra > 0 and (p_umbrales is not null or x.muestra >= p_minimo) then x.pct end,
    'situacion',            case when p_umbrales is null then null
                                 when x.muestra = 0 then 'sin_respuestas'
                                 when x.muestra < p_umbrales[3] then 'pocas_respuestas'
                                 when x.pct >= p_umbrales[1] then 'conforme'
                                 when x.pct >= p_umbrales[2] then 'regular'
                                 else 'inconforme' end
  )
  from (select p_n1 + p_n2 + p_n3 + p_n4 + p_n5 as muestra,
               case when p_n1 + p_n2 + p_n3 + p_n4 + p_n5 > 0
                    then round(100.0 * (p_n4 + p_n5) / (p_n1 + p_n2 + p_n3 + p_n4 + p_n5))::integer end as pct) x;
$$;

alter function public.satisfaccion_fila(integer, integer, integer, numeric, integer, integer, integer, integer, integer, integer, integer[]) owner to project_admin;
revoke all on function public.satisfaccion_fila(integer, integer, integer, numeric, integer, integer, integer, integer, integer, integer, integer[]) from public, anon, authenticated;
grant execute on function public.satisfaccion_fila(integer, integer, integer, numeric, integer, integer, integer, integer, integer, integer, integer[]) to project_admin;
comment on function public.satisfaccion_fila(integer, integer, integer, numeric, integer, integer, integer, integer, integer, integer, integer[]) is
  'Fila de satisfacción (118): conteos, promedio con muestra mínima, % de satisfechos (4 o 5) y, con umbrales, la situación del solicitante. EXECUTE solo project_admin.';

create or replace function public.reporte_satisfaccion_de(p_user uuid, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_version  constant text := 'reportes-2026-10-06';
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_minimo   integer := public.parametro_entero('csat_muestra_minima', 5);
  v_umbrales integer[];
  v_jefe     boolean;
  v_nombre   text;
  v_result   jsonb;
begin
  if not public.puede(p_user, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if (p_desde is null) <> (p_hasta is null) then
    raise exception 'Indique las dos fechas del período o ninguna (todo el historial).';
  end if;
  if p_desde is not null then
    perform public.reporte_validar_periodo(p_desde, p_hasta);
  end if;
  v_jefe := public.puede(p_user, 'rol:jefe');
  select s.nombre into v_nombre from public.staff s where s.user_id = p_user;
  v_umbrales := array[
    public.parametro_entero('satisfaccion_conforme_pct', 80),
    public.parametro_entero('satisfaccion_regular_pct', 60),
    public.parametro_entero('satisfaccion_minimo_persona', 3)];

  with b as (
    -- Tickets con resolución vigente en el período (o todos): la misma regla
    -- que «Resuelto en el período» del reporte de Tickets.
    select h.*,
           case when coalesce(s.tecnico_mesa, false) then h.tecnico_resolvio_id end as grupo_id,
           case when coalesce(h.vinculado, false) then h.empleado_id end            as solicitante_id
      from public.v_ticket_hechos h
      left join public.staff s on s.user_id = h.tecnico_resolvio_id
     where h.resuelto_vigente
       and (p_desde is null or h.dia_resuelto between p_desde and p_hasta)
  ),
  resumen as (
    select count(*)::integer as tickets,
           count(*) filter (where encuesta_generada)::integer   as generadas,
           count(*) filter (where encuesta_respondida)::integer as respondidas,
           round(avg(encuesta_nivel)::numeric, 2)               as promedio,
           count(*) filter (where encuesta_nivel = 1)::integer as n1, count(*) filter (where encuesta_nivel = 2)::integer as n2,
           count(*) filter (where encuesta_nivel = 3)::integer as n3, count(*) filter (where encuesta_nivel = 4)::integer as n4,
           count(*) filter (where encuesta_nivel = 5)::integer as n5
      from b
  ),
  por_mes as (
    select date_trunc('month', dia_resuelto)::date as mes,
           count(*)::integer as tickets,
           count(*) filter (where encuesta_generada)::integer   as generadas,
           count(*) filter (where encuesta_respondida)::integer as respondidas,
           round(avg(encuesta_nivel)::numeric, 2)               as promedio,
           count(*) filter (where encuesta_nivel = 1)::integer as n1, count(*) filter (where encuesta_nivel = 2)::integer as n2,
           count(*) filter (where encuesta_nivel = 3)::integer as n3, count(*) filter (where encuesta_nivel = 4)::integer as n4,
           count(*) filter (where encuesta_nivel = 5)::integer as n5
      from b group by 1
  ),
  por_solicitante as (
    select solicitante_id,
           max(solicitante)        as nombre,
           case when solicitante_id is not null then max(area_obra_nombre) end as area,
           count(*)::integer as tickets,
           count(*) filter (where encuesta_generada)::integer   as generadas,
           count(*) filter (where encuesta_respondida)::integer as respondidas,
           round(avg(encuesta_nivel)::numeric, 2)               as promedio,
           count(*) filter (where encuesta_nivel = 1)::integer as n1, count(*) filter (where encuesta_nivel = 2)::integer as n2,
           count(*) filter (where encuesta_nivel = 3)::integer as n3, count(*) filter (where encuesta_nivel = 4)::integer as n4,
           count(*) filter (where encuesta_nivel = 5)::integer as n5
      from b group by solicitante_id
  ),
  por_grupo as (
    select grupo_id,
           count(*)::integer as tickets,
           count(*) filter (where encuesta_generada)::integer   as generadas,
           count(*) filter (where encuesta_respondida)::integer as respondidas,
           round(avg(encuesta_nivel)::numeric, 2)               as promedio,
           count(*) filter (where encuesta_nivel = 1)::integer as n1, count(*) filter (where encuesta_nivel = 2)::integer as n2,
           count(*) filter (where encuesta_nivel = 3)::integer as n3, count(*) filter (where encuesta_nivel = 4)::integer as n4,
           count(*) filter (where encuesta_nivel = 5)::integer as n5
      from b group by grupo_id
  ),
  -- Cada técnico de mesa activo (aunque no tenga tickets) y un marcado ya
  -- inactivo con tickets; el resto, «Jefatura y otros» si tiene algo.
  por_tecnico as (
    select 1 as orden, 'tecnico' as grupo,
           coalesce(m.user_id, g.grupo_id) as tecnico_id, coalesce(m.nombre, sx.nombre) as nombre,
           coalesce(g.tickets, 0) as tickets, coalesce(g.generadas, 0) as generadas, coalesce(g.respondidas, 0) as respondidas,
           g.promedio, coalesce(g.n1, 0) as n1, coalesce(g.n2, 0) as n2, coalesce(g.n3, 0) as n3,
           coalesce(g.n4, 0) as n4, coalesce(g.n5, 0) as n5
      from (select s.user_id, s.nombre from public.staff s where s.tecnico_mesa and s.activo) m
      full join (select * from por_grupo where grupo_id is not null) g on g.grupo_id = m.user_id
      left join public.staff sx on sx.user_id = g.grupo_id
    union all
    select 2, 'otros', null::uuid, null::text, g.tickets, g.generadas, g.respondidas, g.promedio, g.n1, g.n2, g.n3, g.n4, g.n5
      from por_grupo g where g.grupo_id is null
  )
  select jsonb_build_object(
    'generado_en',          now(),
    'generado_por',         jsonb_build_object('user_id', p_user, 'nombre', v_nombre),
    'definiciones_version', c_version,
    'periodo', case when p_desde is null then null else jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta, 'dias', (p_hasta - p_desde + 1),
      'completo', p_hasta < v_hoy, 'en_curso', p_desde <= v_hoy and p_hasta >= v_hoy) end,
    'muestraMinima', v_minimo,
    'umbrales', jsonb_build_object('conformePct', v_umbrales[1], 'regularPct', v_umbrales[2], 'minimoPersona', v_umbrales[3]),
    'resumen', (select public.satisfaccion_fila(tickets, generadas, respondidas, promedio, n1, n2, n3, n4, n5, v_minimo) from resumen),
    'porMes', coalesce((select jsonb_agg(jsonb_build_object('mes', mes)
                         || public.satisfaccion_fila(tickets, generadas, respondidas, promedio, n1, n2, n3, n4, n5, v_minimo)
                         order by mes desc) from por_mes), '[]'::jsonb),
    'porTecnico', case when v_jefe then coalesce((select jsonb_agg(
                         jsonb_build_object('grupo', grupo, 'tecnico_id', tecnico_id, 'nombre', nombre)
                         || public.satisfaccion_fila(tickets, generadas, respondidas, promedio, n1, n2, n3, n4, n5, v_minimo)
                         order by orden, tickets desc, nombre nulls last) from por_tecnico), '[]'::jsonb) end,
    'porSolicitante', coalesce((select jsonb_agg(
                         jsonb_build_object('empleado_id', solicitante_id, 'nombre', nombre, 'area', area)
                         || public.satisfaccion_fila(tickets, generadas, respondidas, promedio, n1, n2, n3, n4, n5, v_minimo, v_umbrales)
                         order by tickets desc, (solicitante_id is null), nombre) from por_solicitante), '[]'::jsonb),
    'respuestas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', encuesta_id, 'ticket_id', ticket_id, 'ticket_codigo', codigo, 'ticket_titulo', titulo,
        'empleado_id', empleado_id, 'solicitante', solicitante,
        'tecnico_id', case when v_jefe then tecnico_resolvio_id end,
        'nivel', encuesta_nivel, 'comentario', encuesta_comentario, 'fecha_envio', encuesta_respondida_at,
        'created_at', encuesta_generada_at, 'respondida', encuesta_respondida
      ) order by encuesta_generada_at desc) from b where encuesta_generada), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

alter function public.reporte_satisfaccion_de(uuid, date, date) owner to project_admin;
revoke all on function public.reporte_satisfaccion_de(uuid, date, date) from public, anon, authenticated;
grant execute on function public.reporte_satisfaccion_de(uuid, date, date) to project_admin;
comment on function public.reporte_satisfaccion_de(uuid, date, date) is
  'Cuerpo de reporte_satisfaccion() para un usuario explícito (118). EXECUTE solo project_admin (pruebas sin sesión). Guard: módulo tickets (42501); por técnico y el técnico de cada respuesta, solo rol:jefe.';

create or replace function public.reporte_satisfaccion(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.reporte_satisfaccion_de(auth.uid(), p_desde, p_hasta);
end;
$$;

alter function public.reporte_satisfaccion(date, date) owner to project_admin;
revoke all on function public.reporte_satisfaccion(date, date) from public, anon, authenticated;
grant execute on function public.reporte_satisfaccion(date, date) to authenticated;
comment on function public.reporte_satisfaccion(date, date) is
  'Satisfacción de la mesa de ayuda (118) para un período de Lima o todo el historial: resumen, por mes, por técnico de mesa (solo JEFE), por solicitante con su situación, y las respuestas. Guard: módulo tickets (42501).';

-- El consolidado de la 115 delega en la nueva (misma firma): el frontend
-- desplegado antes de la 118 lo sigue llamando y recorre `porTecnico`.
create or replace function public.reporte_satisfaccion_consolidado_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  v := public.reporte_satisfaccion_de(p_user, null, null);
  if jsonb_typeof(v -> 'porTecnico') is distinct from 'array' then
    v := v || jsonb_build_object('porTecnico', '[]'::jsonb);
  end if;
  return v;
end;
$$;

alter function public.reporte_satisfaccion_consolidado_de(uuid) owner to project_admin;
revoke all on function public.reporte_satisfaccion_consolidado_de(uuid) from public, anon, authenticated;
grant execute on function public.reporte_satisfaccion_consolidado_de(uuid) to project_admin;
comment on function public.reporte_satisfaccion_consolidado_de(uuid) is
  'Histórico de satisfacción (115) sobre reporte_satisfaccion_de sin período (118); porTecnico vacío para quien no es JEFE. EXECUTE solo project_admin.';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Parámetros nuevos (esperado: 3 filas: 80, 60 y 3):
--    select clave, valor from public.config_parametros where clave in ('satisfaccion_conforme_pct', 'satisfaccion_regular_pct', 'satisfaccion_minimo_persona') order by clave;
--
-- 2) Técnicos de mesa marcados (esperado en producción: José Soller y Martín Calderón):
--    select nombre, rol, activo from public.staff where tecnico_mesa order by nombre;
--
-- 3) EXECUTE (esperado: reporte_satisfaccion authenticated=true y anon=false; reporte_satisfaccion_de y satisfaccion_fila authenticated=false):
--    select p.oid::regprocedure, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, has_function_privilege('anon', p.oid, 'execute') as anon from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('reporte_satisfaccion', 'reporte_satisfaccion_de', 'satisfaccion_fila', 'backlog_tickets_en', 'backlog_tramos_en') order by 1;
--
-- 4) Los tramos y la lista de pendientes cuentan lo mismo (esperado: true):
--    select (select sum(cantidad) from public.backlog_tramos_en(now())) = (select count(*) from public.backlog_tickets_en(now())) as coinciden;
--
-- 5) Una semana con el JEFE, solo cifras (sin nombres):
--    select r -> 'tablero' as tablero, jsonb_array_length(r -> 'por_dia') as dias, jsonb_array_length(r -> 'por_tecnico') as filas_tecnico, r ->> 'definiciones_version' from public.reporte_tickets_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1), current_date - 6, current_date) r;
--    (esperado: dias = 7; filas_tecnico = técnicos marcados + 1 si resolvió otra persona)
--
-- 6) Satisfacción del mes pasado, solo cifras:
--    select r -> 'resumen' ->> 'pctSatisfaccion' as pct, jsonb_array_length(r -> 'porSolicitante') as solicitantes, jsonb_array_length(r -> 'porTecnico') as tecnicos from public.reporte_satisfaccion_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1), (date_trunc('month', current_date) - interval '1 month')::date, (date_trunc('month', current_date) - interval '1 day')::date) r;
--
-- 7) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '118';
