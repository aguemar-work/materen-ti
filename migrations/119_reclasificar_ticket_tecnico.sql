-- ============================================================
-- MIGRACIÓN 119 — El técnico reclasifica la categoría de un ticket
-- Depende de: 116 (reclasificar_ticket, reclasificar_ticket_nucleo,
--   v_tickets_por_reclasificar), 099 (puede / puede_actual / exigir_permiso).
--
-- ⚠️ NO APLICADA. Escrita y probada solo en local (npm run test:sql-local).
--
-- ── HALLAZGO (encargo del dueño, 2026-10-21) ───────────────────────────────
--   La 116 dejó la reclasificación solo para el JEFE y solo desde
--   Configuración › Categorías («Tickets por reclasificar», los tickets
--   anteriores al catálogo v2). Quien atiende el ticket es quien primero ve
--   que el solicitante eligió mal la categoría (p. ej. una falta de permisos
--   registrada como «Error o falla en aplicación» que corresponde a «Accesos y
--   Cuentas › Solicitar permisos o accesos»), y no podía corregirla: el
--   ticket quedaba mal clasificado en los reportes (117/118) o esperaba al JEFE.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────────
--   1) reclasificar_ticket(p_ticket_id, p_subcategoria_id, p_motivo): misma
--      firma. El guard pasa de `rol:jefe` a `modulo:tickets` (el JEFE sigue
--      exento por puede()); sin el módulo, 42501 «No autorizado» como antes.
--   2) reclasificar_ticket_nucleo: misma firma (p_es_jefe se conserva). Ahora
--      autoriza si p_es_jefe o si puede(p_actor, 'modulo:tickets'). Quien no
--      es JEFE NO reclasifica un ticket `cerrado` ni `rechazado` (P0001 «Solo
--      un JEFE puede reclasificar un ticket cerrado o rechazado.»): cambiar la
--      categoría de un ticket terminado mueve cifras de reportes ya
--      entregados. Todo lo demás no cambia: motivo obligatorio (máx. 500),
--      nunca toca tipo, prioridad ni estado, evento `categoria_cambiada` con
--      autor y motivo, misma subcategoría = «Clasificación confirmada».
--   3) v_tickets_por_reclasificar: misma definición (sigue siendo solo del
--      JEFE). Ya sacaba de la lista un ticket con cualquier evento
--      `categoria_cambiada` con autor posterior a la marca, así que lo que
--      reclasifique o confirme un técnico también lo saca. Solo se corrige el
--      comentario, que decía «ningún JEFE».
--
-- ── CÓMO APLICAR ───────────────────────────────────────────────────────────
--   Hay cuerpos con dollar-quoting (docs/GOTCHAS-CLI.md): `node
--   scripts/deploy.mjs migracion migrations/119_reclasificar_ticket_tecnico.sql`
--   (--dry-run primero); nunca `db query` a mano. Correr SIEMPRE el bloque
--   «Verificación». Idempotente. Orden de salida: 1) esta migración; 2)
--   publicar el frontend (el botón «Reclasificar» de la ficha del ticket). Un
--   frontend nuevo sin la migración muestra el botón al técnico, pero la RPC
--   lo rechaza con 42501 (no rompe nada).
--
-- Rollback: migrations/rollback/119_rollback.sql (devuelve los cuerpos de la
-- 116: otra vez solo el JEFE).
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 116 y 099
-- ============================================================

do $$
begin
  if to_regprocedure('public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean)') is null
     or to_regclass('public.v_tickets_por_reclasificar') is null then
    raise exception 'La migración 119 requiere la 116 (reclasificar_ticket). Aplíquela primero.';
  end if;
  if to_regprocedure('public.puede(uuid, text)') is null then
    raise exception 'La migración 119 requiere la 099 (puede / exigir_permiso). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) reclasificar_ticket_nucleo: JEFE o módulo tickets
-- ============================================================

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
  v_es_jefe    boolean := coalesce(p_es_jefe, false);
  v_t          public.tickets;
  v_sub        public.subcategorias_ticket;
  v_cat_nueva  text;
  v_cat_ant    text;
  v_sub_ant    text;
  v_email      text;
  v_cambio     boolean;
  v_detalle    text;
begin
  -- 119: además del JEFE, cualquier staff activo con el módulo tickets.
  if p_actor is null or not (v_es_jefe or public.puede(p_actor, 'modulo:tickets')) then
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

  -- Un ticket terminado ya está en reportes entregados: solo el JEFE lo mueve.
  if not v_es_jefe and v_t.estado in ('cerrado', 'rechazado') then
    raise exception 'Solo un JEFE puede reclasificar un ticket cerrado o rechazado.';
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
    -- tocan (el JEFE puede reclasificar un ticket cerrado: ver la cabecera).
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

-- RPC pública: guard del módulo + núcleo (que distingue al JEFE).
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
  perform public.exigir_permiso('modulo:tickets');
  return public.reclasificar_ticket_nucleo(p_ticket_id, p_subcategoria_id, p_motivo, auth.uid(), public.puede_actual('rol:jefe'));
end;
$$;

alter function public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean) owner to project_admin;
alter function public.reclasificar_ticket(uuid, uuid, text) owner to project_admin;
revoke all on function public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.reclasificar_ticket(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean) to project_admin;
grant execute on function public.reclasificar_ticket(uuid, uuid, text) to project_admin, authenticated;

comment on function public.reclasificar_ticket_nucleo(uuid, uuid, text, uuid, boolean) is
  'Núcleo de reclasificar_ticket (116, 119): cambia categoría y subcategoría de un ticket y deja el evento categoria_cambiada con actor y motivo. Autoriza al JEFE (p_es_jefe) o a quien tenga modulo:tickets; solo el JEFE reclasifica un ticket cerrado o rechazado (P0001). No toca tipo ni prioridad. EXECUTE solo project_admin.';
comment on function public.reclasificar_ticket(uuid, uuid, text) is
  'Reclasifica un ticket a otra subcategoría (y su categoría), con motivo obligatorio; misma subcategoría = clasificación confirmada. Guard modulo:tickets (42501, 119); un ticket cerrado o rechazado solo lo reclasifica el JEFE (P0001).';


-- ============================================================
-- 2) v_tickets_por_reclasificar: solo el comentario
-- ============================================================

comment on view public.v_tickets_por_reclasificar is
  'Tickets creados antes del catálogo v2 (config_parametros.catalogo_tickets_v2) en «Otro (no clasificado)», sin subcategoría o en «Virus o malware sospechoso», que nadie del staff reclasificó o confirmó después (JEFE o técnico, 119). security_invoker; solo JEFE. 116.';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Guard nuevo (esperado: 1 fila con guard_modulo = true y guard_jefe = false):
--    select position('exigir_permiso(''modulo:tickets'')' in pg_get_functiondef(p.oid)) > 0 as guard_modulo, position('exigir_permiso(''rol:jefe'')' in pg_get_functiondef(p.oid)) > 0 as guard_jefe from pg_proc p where p.oid = 'public.reclasificar_ticket(uuid,uuid,text)'::regprocedure;
--
-- 2) Funciones (esperado: reclasificar_ticket authenticated=true, anon=false; núcleo authenticated=false; las dos secdef y de project_admin):
--    select p.oid::regprocedure::text as funcion, p.prosecdef, pg_get_userbyid(p.proowner) as dueno, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('reclasificar_ticket', 'reclasificar_ticket_nucleo') order by 1;
--
-- 3) La regla del ticket terminado está en el núcleo (esperado: true):
--    select position('Solo un JEFE puede reclasificar un ticket cerrado o rechazado' in pg_get_functiondef('public.reclasificar_ticket_nucleo(uuid,uuid,text,uuid,boolean)'::regprocedure)) > 0 as regla_terminado;
--
-- 4) NO reclasificar tickets reales para probar (deja eventos en su hoja de vida):
--    la autorización y los rechazos se prueban con tests/db/triggers.test.sql
--    (bloque 119a, con rollback) y con npm run test:sql-local (escenario S18).
--
-- 5) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '119';
-- ============================================================
-- FIN DE MIGRACIÓN 119
-- ============================================================
