-- ============================================================
-- ROLLBACK de la MIGRACIÓN 122: portal_abrir vuelve al cuerpo de la 109 (los
-- tickets rechazados vuelven a listarse como activos en el portal). Cuerpo =
-- copia literal de la 109 (generado desde ese archivo). Solo actúa si la 109
-- sigue aplicada. Idempotente.
-- ============================================================

do $rb$
begin
  if to_regprocedure('public.portal_abrir(text, text)') is null then
    return;
  end if;
  execute $fn$
create or replace function public.portal_abrir(p_token text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enl     public.empleado_enlaces;
  v_emp     public.empleados;
  v_ip      text := nullif(left(btrim(coalesce(p_ip, '')), 64), '');
  v_previo  timestamptz;
  v_res     jsonb;
begin
  v_enl := public.portal_resolver_enlace(p_token);
  if v_enl.id is null then
    return jsonb_build_object('ok', false, 'code', 'no_existe');
  end if;

  select * into v_emp from public.empleados where id = v_enl.empleado_id;

  v_previo := v_enl.ultimo_uso_at;
  update public.empleado_enlaces
     set usos = usos + 1, ultimo_uso_at = now(), ultimo_ip = coalesce(v_ip, ultimo_ip)
   where id = v_enl.id;

  -- Auditoría de la apertura: como mucho una fila por hora y enlace.
  if v_previo is null or v_previo < now() - interval '1 hour' then
    insert into public.accesos_log (cuenta_usuario, accion, detalle, ip)
    values ('(portal)', 'portal_abierto',
            'Portal abierto por ' || btrim(v_emp.nombres || ' ' || v_emp.apellidos), v_ip);
  end if;

  v_res := jsonb_build_object(
    'ok', true,
    'nombre', btrim(v_emp.nombres || ' ' || v_emp.apellidos),
    'vence', v_enl.expires_at,
    'alcance', to_jsonb(v_enl.alcance)
  );

  -- Equipos a su cargo: código, tipo, fecha de entrega, condición y si ya confirmó.
  if 'ver_equipos' = any (v_enl.alcance) then
    v_res := v_res || jsonb_build_object('equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'asignacion_id', a.id,
               'codigo', q.codigo,
               'tipo', t.nombre,
               'entregado', a.fecha_inicio,
               'condicion', a.condicion_entrega,
               'confirmado_at', a.confirmado_por_empleado_at
             ) order by a.fecha_inicio desc, q.codigo)
        from public.asignaciones_equipo a
        join public.equipos q on q.id = a.equipo_id and q.deleted_at is null
        join public.tipos_equipo t on t.id = q.tipo_id
       where a.empleado_id = v_enl.empleado_id and a.fecha_fin is null
    ), '[]'::jsonb));
  end if;

  -- Accesos: SOLO plataforma y usuario. Nunca contraseña, URL ni notas.
  if 'ver_accesos' = any (v_enl.alcance) then
    v_res := v_res || jsonb_build_object('accesos', coalesce((
      select jsonb_agg(jsonb_build_object('plataforma', p.nombre, 'usuario', c.usuario)
                       order by p.nombre, c.usuario)
        from public.asignaciones_cuenta ac
        join public.cuentas c on c.id = ac.cuenta_id and c.deleted_at is null
        join public.plataformas p on p.id = c.plataforma_id
       where ac.empleado_id = v_enl.empleado_id and ac.fecha_fin is null
    ), '[]'::jsonb));
  end if;

  -- Tickets activos del empleado (hasta 20): código, asunto, estado y fecha. Sin el
  -- token de seguimiento del ticket (es otro bearer token).
  if 'ver_tickets' = any (v_enl.alcance) then
    v_res := v_res || jsonb_build_object('tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', x.codigo, 'titulo', x.titulo, 'estado', x.estado, 'creado', x.created_at
             ) order by x.created_at desc)
        from (
          select tk.codigo, tk.titulo, tk.estado, tk.created_at
            from public.tickets tk
           where tk.empleado_id = v_enl.empleado_id
             and tk.estado not in ('resuelto', 'cerrado')
           order by tk.created_at desc
           limit 20
        ) x
    ), '[]'::jsonb));
  end if;

  return v_res;
end;
$$;
$fn$;
  comment on function public.portal_abrir(text, text) is
    'Datos del portal de un empleado a partir de su token: nombre, equipos (código, tipo, fecha, condición), accesos (plataforma y usuario; NUNCA contraseña, URL ni notas) y tickets activos, según el alcance. Cuenta el uso y audita (portal_abierto, 1 por hora). Token inválido, vencido o revocado: {ok:false, code:no_existe}. EXECUTE solo project_admin (edge function portal). 109.';
end $rb$;

-- ============================================================
-- FIN DEL ROLLBACK 122
-- ============================================================
