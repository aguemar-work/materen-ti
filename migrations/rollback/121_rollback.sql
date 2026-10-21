-- ============================================================
-- ROLLBACK de la MIGRACIÓN 121: escalamiento de tickets por niveles.
-- Restaura el estado previo a la 121 (es decir, el de la 120 de cierre de tickets): sin tablas de tramos ni avances, sin las
-- RPC de escalamiento ni sus triggers, sin subcategorias_ticket.nivel_sugerido,
-- evento_ticket_cambios con el cuerpo de la 035 (reasignado sin detalle),
-- trg_ticket_estado_notify solo por estado, los CHECK y dashboard_resumen_de
-- de la 120 (copia literal, generada desde ese archivo).
--
-- ⚠️ DESCARTA LA HISTORIA DEL ESCALAMIENTO: DROP TABLE de ticket_escalamientos
-- y ticket_escalamiento_avances borra quién tuvo cada ticket en cada nivel,
-- los especialistas y los avances, y con ellos los eventos `escalado`,
-- `nivel_devuelto` y `escalamiento_actualizado` y las notificaciones
-- `ticket_escalado`. Los comentarios públicos ya escritos (lo que vio el
-- solicitante) y el detalle de los `reasignado` SE CONSERVAN.
-- tickets.nivel_atencion conserva el nivel actual. Si hace falta conservar la
-- historia, exportar antes:
--   select * from public.ticket_escalamientos order by ticket_id, inicio_at;
--   select * from public.ticket_escalamiento_avances order by escalamiento_id, created_at;
--   select * from public.ticket_eventos where evento in ('escalado', 'nivel_devuelto', 'escalamiento_actualizado') order by created_at;
-- ⚠️ Revertir ANTES el frontend y la function `tickets` que leen las tablas
-- nuevas. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Triggers y funciones
-- ------------------------------------------------------------
drop trigger if exists trg_check_nivel_por_escalamiento on public.tickets;
drop trigger if exists trg_escalamiento_sigue_estado on public.tickets;

drop trigger if exists trg_ticket_estado_notify on public.tickets;
create trigger trg_ticket_estado_notify
  after update on public.tickets
  for each row
  when (OLD.estado is distinct from NEW.estado)
  execute function public.notify_ticket_estado();

-- Cuerpo de la 035.
create or replace function public.evento_ticket_cambios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado is distinct from new.estado then
    perform public.log_evento_ticket(new.id, 'estado_cambiado',
      'De "' || old.estado || '" a "' || new.estado || '"');
  end if;
  if old.prioridad is distinct from new.prioridad then
    perform public.log_evento_ticket(new.id, 'prioridad_cambiada',
      'De "' || old.prioridad || '" a "' || new.prioridad || '"');
  end if;
  if old.nivel_atencion is distinct from new.nivel_atencion then
    perform public.log_evento_ticket(new.id, 'nivel_atencion_cambiado',
      'De "' || coalesce(old.nivel_atencion, 'sin definir') || '" a "' || coalesce(new.nivel_atencion, 'sin definir') || '"');
  end if;
  if old.tipo is distinct from new.tipo then
    perform public.log_evento_ticket(new.id, 'tipo_cambiado',
      'De "' || coalesce(old.tipo, 'sin definir') || '" a "' || coalesce(new.tipo, 'sin definir') || '"');
  end if;
  if old.asignado_a is distinct from new.asignado_a then
    perform public.log_evento_ticket(new.id, 'reasignado', null);
  end if;
  return new;
end;
$$;

drop function if exists public.escalar_ticket(uuid, jsonb);
drop function if exists public.devolver_nivel_ticket(uuid, jsonb);
drop function if exists public.registrar_avance_escalamiento(uuid, jsonb);
drop function if exists public.escalar_ticket_nucleo(uuid, jsonb, uuid);
drop function if exists public.devolver_nivel_ticket_nucleo(uuid, jsonb, uuid);
drop function if exists public.registrar_avance_escalamiento_nucleo(uuid, jsonb, uuid);
drop function if exists public.check_nivel_por_escalamiento();
drop function if exists public.escalamiento_sigue_estado();
drop function if exists public.escalamiento_fecha(jsonb, text);
drop function if exists public.escalamiento_responsable(jsonb);
drop function if exists public.nivel_atencion_rango(text);
drop function if exists public.nivel_atencion_publico(text);


-- ------------------------------------------------------------
-- dashboard_resumen_de: cuerpo de la 120 (antes de borrar las tablas, que la
-- versión de la 121 lee). Dueño y ACL no cambian con create or replace.
-- ------------------------------------------------------------
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
  -- 120: sin las anuladas (reabierto o cierre automático).
  if v_p_tickets then
    begin
      select count(*) into v_encuestas
        from public.ticket_satisfaccion
       where fecha_envio is null
         and anulada_at is null;  -- 120: una encuesta anulada ya no se puede responder
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


-- ------------------------------------------------------------
-- Tablas y esquema
-- ------------------------------------------------------------
drop table if exists public.ticket_escalamiento_avances;
drop table if exists public.ticket_escalamientos;

alter table public.subcategorias_ticket drop constraint if exists subcategorias_ticket_nivel_sugerido_check;
alter table public.subcategorias_ticket drop column if exists nivel_sugerido;

-- Los eventos y avisos del escalamiento se borran con su historia: dejarlos
-- obligaría a un CHECK NOT VALID que haría fallar reaplicar la 120 (su CHECK
-- se valida contra las filas existentes).
delete from public.ticket_eventos where evento in ('escalado', 'nivel_devuelto', 'escalamiento_actualizado');
delete from public.notificaciones where tipo = 'ticket_escalado';

-- Listado de la 120.
alter table public.ticket_eventos drop constraint if exists ticket_eventos_evento_check;
alter table public.ticket_eventos add constraint ticket_eventos_evento_check
  check (evento in (
    'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
    'nivel_atencion_cambiado', 'tipo_cambiado', 'correo_fallido',
    'encuesta_enviada', 'encuesta_respondida', 'categoria_cambiada',
    'cerrado_automatico', 'calificacion_revisada'
  ));

-- Listado de la 120.
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja',
    'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo',
    'ticket_correo_fallido', 'empleado_suspendido', 'ticket_calificacion_baja'
  ));

-- ============================================================
-- FIN DEL ROLLBACK 121
-- ============================================================
