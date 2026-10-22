-- ============================================================
-- ROLLBACK de la MIGRACIÓN 119: reclasificar_ticket y su núcleo vuelven a
-- los cuerpos de la 116 (otra vez solo el JEFE, en cualquier estado) y el
-- comentario de v_tickets_por_reclasificar vuelve al de la 116. Los cuerpos
-- restaurados son copia literal de la 116 (generados desde ese archivo).
-- Revertir ANTES el frontend o aceptar que el botón «Reclasificar» de la
-- ficha del ticket le responda «No autorizado» al técnico (no rompe nada).
-- Los tickets que un técnico ya reclasificó NO vuelven atrás: es una decisión
-- registrada en su hoja de vida. Solo actúa si la 116 sigue aplicada (tras
-- revertir la 116 no hay nada que restaurar). Idempotente.
-- ============================================================

do $rb$
begin
  if to_regprocedure('public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean)') is null then
    return;
  end if;
  execute $fn$
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
$fn$;
  execute $fn$
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
$fn$;

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

  if to_regclass('public.v_tickets_por_reclasificar') is not null then
    comment on view public.v_tickets_por_reclasificar is
      'Tickets creados antes del catálogo v2 (config_parametros.catalogo_tickets_v2) en «Otro (no clasificado)», sin subcategoría o en «Virus o malware sospechoso», que ningún JEFE reclasificó o confirmó después. security_invoker; solo JEFE. 116.';
  end if;
end $rb$;
