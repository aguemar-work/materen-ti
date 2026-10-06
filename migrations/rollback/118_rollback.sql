-- ============================================================
-- ROLLBACK de la MIGRACIÓN 118: devuelve reporte_tickets_de al cuerpo de la
-- 117, backlog_tramos_en y reporte_satisfaccion_consolidado_de al de la 115,
-- y quita reporte_satisfaccion(_de), satisfaccion_fila, backlog_tickets_en, la
-- columna staff.tecnico_mesa (con su trigger) y los tres parámetros de
-- satisfacción. Revertir ANTES el frontend: Reportes › Satisfacción llama a
-- reporte_satisfaccion (sin ella responde PGRST202) y Configuración › Staff lee
-- tecnico_mesa. Los cuerpos restaurados son copia literal de la 117 y la 115
-- (generados desde esos archivos). Idempotente.
-- ============================================================

drop function if exists public.reporte_satisfaccion(date, date);
drop function if exists public.reporte_satisfaccion_de(uuid, date, date);
drop function if exists public.satisfaccion_fila(integer, integer, integer, numeric, integer, integer, integer, integer, integer, integer, integer[]);

-- reporte_tickets_de vuelve al cuerpo de la 117 (sin tablero, por día, pendientes, solicitantes ni técnicos de mesa).
-- Solo si la función existe: en una segunda pasada, tras revertir la 115, no hay nada que restaurar.
do $rb$
begin
  if to_regprocedure('public.reporte_tickets_de(uuid, date, date, uuid, boolean)') is null then
    return;
  end if;
  execute $fn$
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
  $fn$;
  execute 'alter function public.reporte_tickets_de(uuid, date, date, uuid, boolean) owner to project_admin';
  execute 'revoke all on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) from public, anon, authenticated';
  execute 'grant execute on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) to project_admin';
  execute 'comment on function public.reporte_tickets_de(uuid, date, date, uuid, boolean) is ''Cuerpo de reporte_tickets() para un usuario explícito (115). EXECUTE solo project_admin: existe para probar el reporte sin simular una sesión. Guard: módulo tickets (42501); otro técnico exige rol:jefe.''';
end $rb$;

-- backlog_tramos_en vuelve a la 115 (con su propia lista de vigentes) antes de quitar backlog_tickets_en.
-- Solo si la función existe: en una segunda pasada, tras revertir la 115, no hay nada que restaurar.
do $rb$
begin
  if to_regprocedure('public.backlog_tramos_en(timestamptz)') is null then
    return;
  end if;
  execute $fn$
create or replace function public.backlog_tramos_en(p_instante timestamptz)
returns table (orden integer, clave text, etiqueta text, cantidad integer, dias_mas_antiguo integer)
language sql
stable
set search_path = public
as $$
  with vigentes as (
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
           ) not in ('resuelto', 'cerrado', 'rechazado')
  ),
  tramos(orden, clave, etiqueta, desde, hasta) as (
    values (1, 'hasta_3',   '0 a 3 días',     0,  3),
           (2, 'de_4_a_7',  '4 a 7 días',     4,  7),
           (3, 'de_8_a_30', '8 a 30 días',    8,  30),
           (4, 'mas_30',    'Más de 30 días', 31, null::integer)
  )
  select t.orden, t.clave, t.etiqueta,
         count(v.ticket_id)::integer as cantidad,
         max(v.dias)::integer        as dias_mas_antiguo
    from tramos t
    left join vigentes v on v.dias >= t.desde and (t.hasta is null or v.dias <= t.hasta)
   group by t.orden, t.clave, t.etiqueta
   order by t.orden;
$$;
  $fn$;
  execute 'alter function public.backlog_tramos_en(timestamptz) owner to project_admin';
  execute 'revoke all on function public.backlog_tramos_en(timestamptz) from public, anon';
  execute 'grant execute on function public.backlog_tramos_en(timestamptz) to authenticated';
  execute 'comment on function public.backlog_tramos_en(timestamptz) is ''Tickets vigentes a un instante (estado reconstruido por sus transiciones) por tramo de días corridos. SECURITY INVOKER. Migración 115.''';
end $rb$;

drop function if exists public.backlog_tickets_en(timestamptz);

-- reporte_satisfaccion_consolidado_de vuelve al cuerpo de la 115.
-- Solo si la función existe: en una segunda pasada, tras revertir la 115, no hay nada que restaurar.
do $rb$
begin
  if to_regprocedure('public.reporte_satisfaccion_consolidado_de(uuid)') is null then
    return;
  end if;
  execute $fn$
create or replace function public.reporte_satisfaccion_consolidado_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_minimo integer := public.parametro_entero('csat_muestra_minima', 5);
  v_result jsonb;
begin
  if not public.puede(p_user, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with r as (
    select h.encuesta_id as id, h.ticket_id, h.codigo as ticket_codigo, h.titulo as ticket_titulo,
           h.empleado_id, h.solicitante, h.tecnico_resolvio_id as tecnico_id,
           h.encuesta_nivel as nivel, h.encuesta_comentario as comentario,
           h.encuesta_respondida_at as fecha_envio, h.encuesta_generada_at as created_at,
           h.encuesta_respondida as respondida
      from public.v_ticket_hechos h
     where h.encuesta_generada
  ),
  por_solicitante as (
    select empleado_id, max(solicitante) as nombre,
           count(*)::integer as generadas, count(*) filter (where respondida)::integer as respondidas,
           count(nivel)::integer as muestra, round(avg(nivel)::numeric, 2) as promedio_crudo,
           count(*) filter (where nivel = 1)::integer as n1, count(*) filter (where nivel = 2)::integer as n2,
           count(*) filter (where nivel = 3)::integer as n3, count(*) filter (where nivel = 4)::integer as n4,
           count(*) filter (where nivel = 5)::integer as n5, count(*) filter (where nivel <= 2)::integer as insatisfechos
      from r group by empleado_id
  ),
  por_tecnico as (
    select r.tecnico_id, s.nombre,
           count(*)::integer as generadas, count(*) filter (where respondida)::integer as respondidas,
           count(nivel)::integer as muestra, round(avg(nivel)::numeric, 2) as promedio_crudo,
           count(*) filter (where nivel = 1)::integer as n1, count(*) filter (where nivel = 2)::integer as n2,
           count(*) filter (where nivel = 3)::integer as n3, count(*) filter (where nivel = 4)::integer as n4,
           count(*) filter (where nivel = 5)::integer as n5, count(*) filter (where nivel <= 2)::integer as insatisfechos
      from r left join public.staff s on s.user_id = r.tecnico_id
     group by r.tecnico_id, s.nombre
  ),
  por_mes as (
    select mes, sum(generadas)::integer as generadas, sum(respondidas)::integer as respondidas,
           sum(n)::integer as muestra, sum(suma_nivel)::integer as suma_nivel,
           sum(n1)::integer as n1, sum(n2)::integer as n2, sum(n3)::integer as n3, sum(n4)::integer as n4, sum(n5)::integer as n5,
           sum(insatisfechos)::integer as insatisfechos
      from public.v_kpi_csat
     group by mes
  ),
  resumen as (
    select count(*)::integer as generadas, count(*) filter (where respondida)::integer as respondidas,
           count(nivel)::integer as muestra, round(avg(nivel)::numeric, 2) as promedio_crudo,
           count(*) filter (where nivel <= 2)::integer as insatisfechos
      from r
  )
  select jsonb_build_object(
    'muestraMinima', v_minimo,
    'resumen', (select jsonb_build_object(
        'encuestasGeneradas', generadas, 'encuestasRespondidas', respondidas,
        'tasaRespuestaPct', case when generadas > 0 then round(100.0 * respondidas / generadas)::integer end,
        'muestra', muestra, 'promedio', case when muestra >= v_minimo then promedio_crudo end,
        'insuficiente', muestra < v_minimo, 'insatisfechos', insatisfechos) from resumen),
    'respuestas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'ticket_id', ticket_id, 'ticket_codigo', ticket_codigo, 'ticket_titulo', ticket_titulo,
        'empleado_id', empleado_id, 'solicitante', solicitante, 'tecnico_id', tecnico_id,
        'nivel', nivel, 'comentario', comentario, 'fecha_envio', fecha_envio, 'created_at', created_at,
        'respondida', respondida
      ) order by created_at desc) from r), '[]'::jsonb),
    -- "Peor primero": promedio ascendente; sin promedio publicable al final,
    -- entre sí por más encuestas generadas.
    'porSolicitante', coalesce((select jsonb_agg(jsonb_build_object(
        'empleado_id', empleado_id, 'nombre', nombre, 'encuestasGeneradas', generadas,
        'encuestasRespondidas', respondidas, 'muestra', muestra,
        'promedio', case when muestra >= v_minimo then promedio_crudo end, 'insuficiente', muestra < v_minimo,
        'niveles', jsonb_build_object('1', n1, '2', n2, '3', n3, '4', n4, '5', n5), 'insatisfechos', insatisfechos
      ) order by (muestra < v_minimo) asc, promedio_crudo asc nulls last, generadas desc) from por_solicitante), '[]'::jsonb),
    'porTecnico', coalesce((select jsonb_agg(jsonb_build_object(
        'tecnico_id', tecnico_id, 'nombre', nombre, 'encuestasGeneradas', generadas,
        'encuestasRespondidas', respondidas, 'muestra', muestra,
        'promedio', case when muestra >= v_minimo then promedio_crudo end, 'insuficiente', muestra < v_minimo,
        'niveles', jsonb_build_object('1', n1, '2', n2, '3', n3, '4', n4, '5', n5), 'insatisfechos', insatisfechos
      ) order by (muestra < v_minimo) asc, promedio_crudo asc nulls last, generadas desc) from por_tecnico), '[]'::jsonb),
    'porMes', coalesce((select jsonb_agg(jsonb_build_object(
        'mes', mes, 'encuestasGeneradas', generadas, 'encuestasRespondidas', respondidas, 'muestra', muestra,
        'promedio', case when muestra >= v_minimo then round(suma_nivel::numeric / muestra, 2) end, 'insuficiente', muestra < v_minimo,
        'niveles', jsonb_build_object('1', n1, '2', n2, '3', n3, '4', n4, '5', n5), 'insatisfechos', insatisfechos
      ) order by mes desc) from por_mes), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
  $fn$;
  execute 'alter function public.reporte_satisfaccion_consolidado_de(uuid) owner to project_admin';
  execute 'revoke all on function public.reporte_satisfaccion_consolidado_de(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.reporte_satisfaccion_consolidado_de(uuid) to project_admin';
  execute 'comment on function public.reporte_satisfaccion_consolidado_de(uuid) is ''Cuerpo de reporte_satisfaccion_consolidado() para un usuario explícito (115). EXECUTE solo project_admin (pruebas sin sesión). Guard: módulo tickets (42501).''';
end $rb$;

drop trigger if exists trg_staff_tecnico_mesa on public.staff;
drop function if exists public.check_staff_tecnico_mesa();
alter table public.staff drop column if exists tecnico_mesa;

-- Si la 103 ya se revirtió (config_parametros no existe), no hay nada que borrar.
do $$
begin
  if to_regclass('public.config_parametros') is not null then
    delete from public.config_parametros
     where clave in ('satisfaccion_conforme_pct', 'satisfaccion_regular_pct', 'satisfaccion_minimo_persona');
  end if;
end $$;
