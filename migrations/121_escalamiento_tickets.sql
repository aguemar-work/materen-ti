-- ============================================================
-- MIGRACIÓN 121 — Escalamiento de tickets por niveles (N1 → N2 → N3)
-- Depende de: 120 (cierre de tickets: CHECK de ticket_eventos y de
--   notificaciones, dashboard_resumen_de), 017 (tickets.nivel_atencion), 035
--   (evento_ticket_cambios),
--   099 (puede / exigir_permiso), 100 (crear_notificacion, realtime),
--   107 (texto_multilinea), 116 (catálogo v2).
--
-- ⚠️ NO APLICADA. Escrita y probada solo en local (npm run test:sql-local).
--
-- ── HALLAZGO (encargo del dueño, 2026-10-21) ───────────────────────────────
--   La política de la mesa de ayuda tiene tres niveles: N1 Soporte básico
--   (Asistente de Soporte), N2 Especializado (Asistente de Redes) y N3
--   Especialista (experto interno, desarrollo, proveedor, garantía…). El
--   sistema solo tenía la columna tickets.nivel_atencion (017), editable con
--   un UPDATE directo y sin registro de quién tiene el ticket en cada nivel,
--   qué pasó ni cuándo se espera la solución. El empleado no veía el nivel y
--   el evento `reasignado` no guardaba de quién a quién pasó (detalle NULL).
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────────
--   Escalamiento funcional (ITIL): el ticket pasa a quien sabe resolverlo.
--   tickets.nivel_atencion sigue siendo el nivel ACTUAL (filtros y reportes no
--   cambian); la historia vive en dos tablas que solo escriben las RPC.
--   1) ticket_escalamientos: un tramo por nivel (quién lo tiene, qué pasó,
--      especialista y referencia en N3, fecha estimada de solución). Un solo
--      tramo abierto por ticket.
--   2) ticket_escalamiento_avances: el avance del especialista o proveedor
--      (solo se agregan filas).
--   3) RPC (núcleo solo project_admin + envoltura con modulo:tickets):
--      escalar_ticket, devolver_nivel_ticket, registrar_avance_escalamiento.
--      N2 reasigna al responsable; N3 lo conserva salvo que se indique otro.
--      Cada paso deja su evento y un comentario PÚBLICO (lo que ve el
--      empleado: el nivel, la fecha estimada y los avances marcados como
--      visibles; nunca el motivo interno ni el especialista).
--   4) Pasar a N3 avisa en la campana a cada JEFE activo (ticket_escalado).
--   5) Con el ticket en atención, el nivel ya no cambia por UPDATE directo:
--      solo escalando o devolviendo (P0001). Iniciar (abierto → en_progreso)
--      sigue fijando el nivel inicial: es el triage.
--   6) evento_ticket_cambios: `reasignado` guarda De "A" a "B" (nombres del
--      staff) y el cambio de nivel de un tramo no duplica el evento.
--   7) Al cerrar o rechazar el ticket se cierra el tramo abierto; al reabrirlo
--      en N2/N3 se abre un tramo nuevo en el mismo nivel.
--   8) Realtime del seguimiento también ante un cambio de nivel.
--   9) subcategorias_ticket.nivel_sugerido (Iniciar lo precarga) con siembra
--      N2 para Redes, Seguridad y Videovigilancia.
--  10) dashboard_resumen_de: tickets.escalados y tickets.escalados_vencidos.
--
--   Sin programador de tareas (pg_cron no es usable por el rol del CLI) no hay
--   aviso automático cuando VENCE la fecha estimada: se muestra al leer
--   (Inicio, tarjeta y ficha). Queda pendiente junto con la purga diaria.
--
--   ⚠️ V2: las migraciones 091/092 de v2/tickets-f1 redefinen
--   evento_ticket_cambios y la 093 trae reasignar_ticket. Al integrar V2 hay
--   que partir de la versión de esta migración.
--
--   Se apoya en la 120 (cierre de tickets): sus CHECK de ticket_eventos y de
--   notificaciones se recomponen con sus valores más los del escalamiento, y
--   dashboard_resumen_de parte del cuerpo de la 120. El tramo abierto sigue
--   al ticket mientras está «resuelto» esperando la calificación (24 h) y se
--   cierra con el cierre (del usuario, automático o sin solicitante).
--
-- ── CÓMO APLICAR ───────────────────────────────────────────────────────────
--   Hay cuerpos con dollar-quoting (docs/GOTCHAS-CLI.md): `node
--   scripts/deploy.mjs migracion migrations/121_escalamiento_tickets.sql`
--   (--dry-run primero); nunca `db query` a mano. Correr SIEMPRE el bloque
--   «Verificación». Idempotente. Orden de salida: 0) la 120 (cierre de
--   tickets) ya aplicada; 1) esta migración;
--   2) `node scripts/deploy.mjs function tickets` (el seguimiento muestra el
--   nivel); 3) el frontend. Un frontend nuevo sin la migración deja el nivel
--   en solo lectura y las acciones de escalamiento fallan.
--
-- Rollback: migrations/rollback/121_rollback.sql (vuelve a la 120).
-- ============================================================


-- ============================================================
-- 0) Precondiciones
-- ============================================================

do $$
begin
  if to_regprocedure('public.resolver_ticket(uuid, text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'tickets' and column_name = 'cerrado_por') then
    raise exception 'La migración 121 requiere la 120 (cierre de tickets: resolver_ticket, cerrado_por). Aplíquela primero.';
  end if;
  if to_regprocedure('public.puede(uuid, text)') is null then
    raise exception 'La migración 121 requiere la 099 (puede / exigir_permiso). Aplíquela primero.';
  end if;
  if to_regprocedure('public.crear_notificacion(text, text, uuid, text, text, uuid)') is null then
    raise exception 'La migración 121 requiere la 100 (crear_notificacion). Aplíquela primero.';
  end if;
  if to_regprocedure('public.texto_multilinea(text)') is null then
    raise exception 'La migración 121 requiere la 107 (texto_multilinea). Aplíquela primero.';
  end if;
  if to_regprocedure('public.dashboard_resumen_de(uuid)') is null
     or to_regclass('public.solicitudes') is null then
    raise exception 'La migración 121 requiere la 108 (dashboard_resumen_de con solicitudes). Aplíquela primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'subcategorias_ticket' and column_name = 'prioridad_sugerida') then
    raise exception 'La migración 121 requiere la 116 (catálogo de tickets v2). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) Esquema: tramos, avances, nivel sugerido y CHECK ampliados
-- ============================================================

create table if not exists public.ticket_escalamientos (
  id                  uuid        primary key default gen_random_uuid(),
  ticket_id           uuid        not null references public.tickets(id) on delete cascade,
  nivel_desde         text        check (nivel_desde in ('N1', 'N2', 'N3')),
  nivel_hacia         text        not null check (nivel_hacia in ('N1', 'N2', 'N3')),
  direccion           text        not null check (direccion in ('escalado', 'devuelto', 'reabierto')),
  motivo              text        not null check (char_length(motivo) between 1 and 1000),
  responsable_id      uuid        references auth.users(id) on delete set null,
  especialista_tipo   text        check (especialista_tipo in ('experto_interno', 'desarrollo', 'proveedor', 'garantia', 'otro')),
  especialista_nombre text        check (char_length(especialista_nombre) between 1 and 120),
  referencia_externa  text        check (char_length(referencia_externa) between 1 and 80),
  fecha_estimada      date,
  inicio_at           timestamptz not null default now(),
  fin_at              timestamptz,
  fin_motivo          text        check (fin_motivo in ('escalado', 'devuelto', 'cerrado', 'rechazado')),
  created_by          uuid        references auth.users(id) on delete set null,
  -- El especialista es del N3: en N1/N2 no se guarda.
  constraint ticket_escalamientos_especialista_n3
    check (nivel_hacia = 'N3' or (especialista_tipo is null and especialista_nombre is null)),
  constraint ticket_escalamientos_fin_coherente
    check ((fin_at is null) = (fin_motivo is null))
);

create unique index if not exists ticket_escalamientos_un_abierto
  on public.ticket_escalamientos (ticket_id) where fin_at is null;
create index if not exists idx_ticket_escalamientos_ticket
  on public.ticket_escalamientos (ticket_id, inicio_at);

comment on table public.ticket_escalamientos is
  'Tramos de nivel de un ticket (121): quién lo tiene, qué pasó, especialista (N3) y fecha estimada. Un solo tramo abierto por ticket. Solo lo escriben escalar_ticket, devolver_nivel_ticket, registrar_avance_escalamiento y los triggers de estado; tickets.nivel_atencion es el nivel actual.';
comment on column public.ticket_escalamientos.motivo is
  'Qué pasó y qué se intentó antes de escalar o devolver. Interno: nunca lo ve el empleado.';
comment on column public.ticket_escalamientos.responsable_id is
  'Staff que tiene el ticket en este tramo (= tickets.asignado_a al abrirlo). En N3 es quien da seguimiento al especialista.';
comment on column public.ticket_escalamientos.fecha_estimada is
  'Fecha estimada de solución. La ve el empleado en su seguimiento.';

create table if not exists public.ticket_escalamiento_avances (
  id                   uuid        primary key default gen_random_uuid(),
  escalamiento_id      uuid        not null references public.ticket_escalamientos(id) on delete cascade,
  ticket_id            uuid        not null references public.tickets(id) on delete cascade,
  nota                 text        not null check (char_length(nota) between 1 and 1000),
  fecha_estimada_nueva date,
  visible_usuario      boolean     not null default false,
  autor_id             uuid        references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists idx_ticket_escalamiento_avances_tramo
  on public.ticket_escalamiento_avances (escalamiento_id, created_at);

comment on table public.ticket_escalamiento_avances is
  'Avance de un tramo de escalamiento (121), p. ej. lo que informa el proveedor. Solo se agregan filas, por registrar_avance_escalamiento. Si visible_usuario, la nota también se publica como comentario público.';

alter table public.ticket_escalamientos enable row level security;
alter table public.ticket_escalamiento_avances enable row level security;

drop policy if exists "staff con modulo tickets puede ver escalamientos" on public.ticket_escalamientos;
create policy "staff con modulo tickets puede ver escalamientos"
  on public.ticket_escalamientos for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

drop policy if exists "staff con modulo tickets puede ver avances de escalamiento" on public.ticket_escalamiento_avances;
create policy "staff con modulo tickets puede ver avances de escalamiento"
  on public.ticket_escalamiento_avances for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('tickets')));

revoke all on table public.ticket_escalamientos from anon, authenticated;
revoke all on table public.ticket_escalamiento_avances from anon, authenticated;
grant select on table public.ticket_escalamientos to authenticated;
grant select on table public.ticket_escalamiento_avances to authenticated;

-- Nivel sugerido por subcategoría: Iniciar lo precarga (el técnico puede elegir otro).
alter table public.subcategorias_ticket add column if not exists nivel_sugerido text;
alter table public.subcategorias_ticket drop constraint if exists subcategorias_ticket_nivel_sugerido_check;
alter table public.subcategorias_ticket add constraint subcategorias_ticket_nivel_sugerido_check
  check (nivel_sugerido is null or nivel_sugerido in ('N1', 'N2', 'N3'));

comment on column public.subcategorias_ticket.nivel_sugerido is
  'Nivel de atención con el que Iniciar precarga los tickets de esta subcategoría (121). NULL = N1. No toca tickets ya creados.';

-- Política de la mesa de ayuda: red, internet, WiFi, VPN, servidores y
-- respaldos, seguridad y cámaras son N2. Solo la primera vez (NULL): lo que
-- el JEFE cambie después se conserva al reaplicar.
update public.subcategorias_ticket
   set nivel_sugerido = 'N2'
 where nivel_sugerido is null
   and deleted_at is null
   and categoria_id in ('red', 'seguridad', 'cctv');

-- Mismo listado que la 120 (cierre de tickets) más los eventos del escalamiento.
alter table public.ticket_eventos drop constraint if exists ticket_eventos_evento_check;
alter table public.ticket_eventos add constraint ticket_eventos_evento_check
  check (evento in (
    'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
    'nivel_atencion_cambiado', 'tipo_cambiado', 'correo_fallido',
    'encuesta_enviada', 'encuesta_respondida', 'categoria_cambiada',
    'cerrado_automatico', 'calificacion_revisada',
    'escalado', 'nivel_devuelto', 'escalamiento_actualizado'
  ));

-- Mismo listado que la 120 (cierre de tickets) más el aviso al JEFE.
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja',
    'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo',
    'ticket_correo_fallido', 'empleado_suspendido', 'ticket_calificacion_baja',
    'ticket_escalado'
  ));


-- ============================================================
-- 2) Apoyo: etiqueta pública del nivel y lectura de p_datos
-- ============================================================

-- Duplica NIVEL_PUBLICO de frontend/src/core/dominio-tickets.js: si cambia en
-- un lado, replicar en el otro (mismo criterio que 078 con HITO_LABELS).
create or replace function public.nivel_atencion_publico(p_nivel text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case p_nivel
    when 'N1' then 'Nivel 1 – Soporte'
    when 'N2' then 'Nivel 2 – Especializado'
    when 'N3' then 'Nivel 3 – Especialista'
  end;
$$;

comment on function public.nivel_atencion_publico(text) is
  'Etiqueta del nivel que ve el empleado (121). Duplica NIVEL_PUBLICO de core/dominio-tickets.js.';

-- Fecha opcional de p_datos: NULL si falta; mensaje legible si no es válida o
-- es anterior a hoy (hora de Lima, como el Inicio).
create or replace function public.escalamiento_fecha(p_datos jsonb, p_clave text)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_txt   text := public.texto_multilinea(p_datos ->> p_clave);
  v_fecha date;
begin
  if v_txt is null then
    return null;
  end if;
  begin
    v_fecha := v_txt::date;
  exception when others then
    raise exception 'La fecha estimada no es válida.';
  end;
  if v_fecha < (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha estimada no puede ser anterior a hoy.';
  end if;
  return v_fecha;
end;
$$;

comment on function public.escalamiento_fecha(jsonb, text) is
  'Lee una fecha estimada opcional de p_datos para las RPC de escalamiento (121): NULL si falta, P0001 si no es válida o es anterior a hoy.';

-- Responsable opcional de p_datos: debe ser staff activo con el módulo tickets.
create or replace function public.escalamiento_responsable(p_datos jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_txt  text := public.texto_multilinea(p_datos ->> 'responsable_id');
  v_resp uuid;
begin
  if v_txt is null then
    return null;
  end if;
  begin
    v_resp := v_txt::uuid;
  exception when others then
    raise exception 'El responsable indicado no existe.';
  end;
  if not public.puede(v_resp, 'modulo:tickets') then
    raise exception 'El responsable debe ser un integrante activo del staff con el módulo Tickets.';
  end if;
  return v_resp;
end;
$$;

comment on function public.escalamiento_responsable(jsonb) is
  'Lee responsable_id de p_datos para las RPC de escalamiento (121): NULL si falta; P0001 si no es staff activo con modulo:tickets.';

-- Rango numérico del nivel (NULL cuenta como N1).
create or replace function public.nivel_atencion_rango(p_nivel text)
returns integer
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case coalesce(p_nivel, 'N1') when 'N1' then 1 when 'N2' then 2 when 'N3' then 3 end;
$$;


-- ============================================================
-- 3) escalar_ticket
-- ============================================================

create or replace function public.escalar_ticket_nucleo(
  p_ticket_id uuid,
  p_datos     jsonb,
  p_actor     uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_motivo_max constant integer := 1000;
  v_datos      jsonb := coalesce(p_datos, '{}'::jsonb);
  v_nivel      text  := upper(public.texto_multilinea(v_datos ->> 'nivel'));
  v_motivo     text  := public.texto_multilinea(v_datos ->> 'motivo');
  v_esp_tipo   text  := public.texto_multilinea(v_datos ->> 'especialista_tipo');
  v_esp_nombre text  := public.texto_limpio(v_datos ->> 'especialista_nombre');
  v_referencia text  := public.texto_limpio(v_datos ->> 'referencia');
  v_fecha      date;
  v_resp       uuid;
  v_t          public.tickets;
  v_desde      text;
  v_tramo      uuid;
  v_email      text;
  v_detalle    text;
  v_mensaje    text;
  j            record;
begin
  if p_actor is null or not public.puede(p_actor, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'El ticket no existe.' using errcode = 'P0002';
  end if;
  if v_t.estado not in ('en_progreso', 'reabierto') then
    raise exception 'Solo se escala un ticket en atención (en progreso o reabierto).';
  end if;

  v_desde := coalesce(v_t.nivel_atencion, 'N1');
  if v_nivel is null or v_nivel not in ('N2', 'N3') then
    raise exception 'Indique el nivel al que escala: Nivel 2 o Nivel 3.';
  end if;
  if public.nivel_atencion_rango(v_nivel) <= public.nivel_atencion_rango(v_desde) then
    raise exception 'El ticket ya está en % o en un nivel superior: para bajarlo, use «Devolver nivel».', v_desde;
  end if;
  if v_motivo is null then
    raise exception 'Indique qué pasó y qué se intentó antes de escalar.';
  end if;
  if char_length(v_motivo) > c_motivo_max then
    raise exception 'El motivo no puede superar los % caracteres.', c_motivo_max;
  end if;

  v_resp  := public.escalamiento_responsable(v_datos);
  v_fecha := public.escalamiento_fecha(v_datos, 'fecha_estimada');

  if v_nivel = 'N2' then
    -- N2: el ticket pasa a quien lo resuelve (la política exige reasignar).
    if v_resp is null then
      raise exception 'Indique quién atiende el ticket en el Nivel 2.';
    end if;
    v_esp_tipo := null;
    v_esp_nombre := null;
  else
    -- N3: quien escala conserva el ticket salvo que se indique otro responsable.
    if v_esp_tipo is null or v_esp_tipo not in ('experto_interno', 'desarrollo', 'proveedor', 'garantia', 'otro') then
      raise exception 'Indique el tipo de especialista del Nivel 3.';
    end if;
    if v_esp_nombre is null then
      raise exception 'Indique el especialista o proveedor del Nivel 3.';
    end if;
    if char_length(v_esp_nombre) > 120 then
      raise exception 'El nombre del especialista no puede superar los 120 caracteres.';
    end if;
    v_resp := coalesce(v_resp, v_t.asignado_a);
  end if;
  if char_length(v_referencia) > 80 then
    raise exception 'La referencia no puede superar los 80 caracteres.';
  end if;

  -- Tramo primero: check_nivel_por_escalamiento y evento_ticket_cambios lo
  -- reconocen (mismo now() de la transacción) al actualizar el nivel.
  update public.ticket_escalamientos
     set fin_at = now(), fin_motivo = 'escalado'
   where ticket_id = v_t.id and fin_at is null;
  insert into public.ticket_escalamientos
    (ticket_id, nivel_desde, nivel_hacia, direccion, motivo, responsable_id,
     especialista_tipo, especialista_nombre, referencia_externa, fecha_estimada, created_by)
  values
    (v_t.id, v_desde, v_nivel, 'escalado', v_motivo, v_resp,
     v_esp_tipo, v_esp_nombre, v_referencia, v_fecha, p_actor)
  returning id into v_tramo;

  -- Comentario público ANTES de reasignar: así el aviso de comentario nuevo
  -- (049) no se suma al de asignación (078) del nuevo responsable.
  v_mensaje := format('Su ticket fue derivado al %s.', public.nivel_atencion_publico(v_nivel));
  if v_fecha is not null then
    v_mensaje := v_mensaje || format(' Fecha estimada de solución: %s.', to_char(v_fecha, 'DD/MM/YYYY'));
  end if;
  insert into public.ticket_comentarios (ticket_id, interno, mensaje) values (v_t.id, false, v_mensaje);

  update public.tickets
     set nivel_atencion = v_nivel,
         asignado_a = coalesce(v_resp, asignado_a)
   where id = v_t.id;

  v_detalle := format('De "%s" a "%s". Motivo: %s', v_desde, v_nivel, v_motivo);
  if v_nivel = 'N3' then
    v_detalle := v_detalle || format(' Especialista: %s.', v_esp_nombre);
  end if;
  select u.email into v_email from auth.users u where u.id = p_actor;
  insert into public.ticket_eventos (ticket_id, evento, detalle, user_id, user_email)
  values (v_t.id, 'escalado', v_detalle, p_actor, v_email);

  -- N3: aviso a cada JEFE activo (menos a quien escala).
  if v_nivel = 'N3' then
    for j in
      select s.user_id from public.staff s
       where s.rol = 'JEFE' and s.activo and s.user_id <> p_actor
    loop
      perform public.crear_notificacion(
        'ticket_escalado', 'ticket', v_t.id,
        'Ticket ' || v_t.codigo || ' escalado a Nivel 3 — ' || left(v_t.titulo, 120),
        '/tickets/' || v_t.id, j.user_id);
    end loop;
  end if;

  return jsonb_build_object(
    'ticket_id', v_t.id,
    'codigo', v_t.codigo,
    'nivel', v_nivel,
    'asignado_a', coalesce(v_resp, v_t.asignado_a),
    'escalamiento_id', v_tramo);
end;
$$;

create or replace function public.escalar_ticket(p_ticket_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.escalar_ticket_nucleo(p_ticket_id, p_datos, auth.uid());
end;
$$;

comment on function public.escalar_ticket_nucleo(uuid, jsonb, uuid) is
  'Núcleo de escalar_ticket (121) con actor explícito. EXECUTE solo project_admin.';
comment on function public.escalar_ticket(uuid, jsonb) is
  'Escala un ticket en atención a N2 (reasigna: responsable_id obligatorio) o N3 (especialista_tipo y especialista_nombre obligatorios; conserva al responsable salvo otro). p_datos: nivel, motivo, responsable_id, especialista_tipo, especialista_nombre, referencia, fecha_estimada. Deja tramo, evento escalado y comentario público; N3 avisa al JEFE. Guard modulo:tickets (42501).';


-- ============================================================
-- 4) devolver_nivel_ticket
-- ============================================================

create or replace function public.devolver_nivel_ticket_nucleo(
  p_ticket_id uuid,
  p_datos     jsonb,
  p_actor     uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_motivo_max constant integer := 1000;
  v_datos      jsonb := coalesce(p_datos, '{}'::jsonb);
  v_nivel      text  := upper(public.texto_multilinea(v_datos ->> 'nivel'));
  v_motivo     text  := public.texto_multilinea(v_datos ->> 'motivo');
  v_resp       uuid;
  v_t          public.tickets;
  v_desde      text;
  v_tramo      uuid;
  v_email      text;
begin
  if p_actor is null or not public.puede(p_actor, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'El ticket no existe.' using errcode = 'P0002';
  end if;
  if v_t.estado not in ('en_progreso', 'reabierto') then
    raise exception 'Solo se devuelve de nivel un ticket en atención (en progreso o reabierto).';
  end if;

  v_desde := coalesce(v_t.nivel_atencion, 'N1');
  if v_nivel is null or v_nivel not in ('N1', 'N2', 'N3') then
    raise exception 'Indique el nivel al que devuelve el ticket.';
  end if;
  if public.nivel_atencion_rango(v_nivel) >= public.nivel_atencion_rango(v_desde) then
    raise exception 'Solo se devuelve a un nivel inferior al actual (%).', v_desde;
  end if;
  if v_motivo is null then
    raise exception 'Indique por qué devuelve el ticket de nivel.';
  end if;
  if char_length(v_motivo) > c_motivo_max then
    raise exception 'El motivo no puede superar los % caracteres.', c_motivo_max;
  end if;
  v_resp := coalesce(public.escalamiento_responsable(v_datos), v_t.asignado_a);

  update public.ticket_escalamientos
     set fin_at = now(), fin_motivo = 'devuelto'
   where ticket_id = v_t.id and fin_at is null;
  insert into public.ticket_escalamientos
    (ticket_id, nivel_desde, nivel_hacia, direccion, motivo, responsable_id, created_by)
  values
    (v_t.id, v_desde, v_nivel, 'devuelto', v_motivo, v_resp, p_actor)
  returning id into v_tramo;

  insert into public.ticket_comentarios (ticket_id, interno, mensaje)
  values (v_t.id, false, format('Su ticket continúa en atención en el %s.', public.nivel_atencion_publico(v_nivel)));

  update public.tickets
     set nivel_atencion = v_nivel,
         asignado_a = coalesce(v_resp, asignado_a)
   where id = v_t.id;

  select u.email into v_email from auth.users u where u.id = p_actor;
  insert into public.ticket_eventos (ticket_id, evento, detalle, user_id, user_email)
  values (v_t.id, 'nivel_devuelto', format('De "%s" a "%s". Motivo: %s', v_desde, v_nivel, v_motivo), p_actor, v_email);

  return jsonb_build_object(
    'ticket_id', v_t.id,
    'codigo', v_t.codigo,
    'nivel', v_nivel,
    'asignado_a', coalesce(v_resp, v_t.asignado_a),
    'escalamiento_id', v_tramo);
end;
$$;

create or replace function public.devolver_nivel_ticket(p_ticket_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.devolver_nivel_ticket_nucleo(p_ticket_id, p_datos, auth.uid());
end;
$$;

comment on function public.devolver_nivel_ticket_nucleo(uuid, jsonb, uuid) is
  'Núcleo de devolver_nivel_ticket (121) con actor explícito. EXECUTE solo project_admin.';
comment on function public.devolver_nivel_ticket(uuid, jsonb) is
  'Baja un ticket en atención a un nivel inferior, con motivo (p_datos: nivel, motivo, responsable_id opcional que reasigna). Deja tramo devuelto, evento nivel_devuelto y comentario público. Guard modulo:tickets (42501).';


-- ============================================================
-- 5) registrar_avance_escalamiento
-- ============================================================

create or replace function public.registrar_avance_escalamiento_nucleo(
  p_ticket_id uuid,
  p_datos     jsonb,
  p_actor     uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_nota_max   constant integer := 1000;
  v_datos      jsonb   := coalesce(p_datos, '{}'::jsonb);
  v_nota       text    := public.texto_multilinea(v_datos ->> 'nota');
  v_referencia text    := public.texto_limpio(v_datos ->> 'referencia');
  v_visible    boolean := coalesce((v_datos ->> 'visible_usuario')::boolean, false);
  v_fecha      date;
  v_t          public.tickets;
  v_tramo      public.ticket_escalamientos;
  v_avance     uuid;
  v_email      text;
  v_detalle    text;
  v_mensaje    text;
begin
  if p_actor is null or not public.puede(p_actor, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'El ticket no existe.' using errcode = 'P0002';
  end if;
  if v_t.estado in ('cerrado', 'rechazado') then
    raise exception 'El ticket está terminado: no admite avances.';
  end if;
  select * into v_tramo from public.ticket_escalamientos where ticket_id = v_t.id and fin_at is null;
  if not found then
    raise exception 'El ticket no tiene un escalamiento abierto.';
  end if;
  if v_nota is null then
    raise exception 'Indique el avance.';
  end if;
  if char_length(v_nota) > c_nota_max then
    raise exception 'El avance no puede superar los % caracteres.', c_nota_max;
  end if;
  if char_length(v_referencia) > 80 then
    raise exception 'La referencia no puede superar los 80 caracteres.';
  end if;
  v_fecha := public.escalamiento_fecha(v_datos, 'fecha_estimada');

  insert into public.ticket_escalamiento_avances
    (escalamiento_id, ticket_id, nota, fecha_estimada_nueva, visible_usuario, autor_id)
  values (v_tramo.id, v_t.id, v_nota, v_fecha, v_visible, p_actor)
  returning id into v_avance;

  update public.ticket_escalamientos
     set fecha_estimada = coalesce(v_fecha, fecha_estimada),
         referencia_externa = coalesce(v_referencia, referencia_externa)
   where id = v_tramo.id
     and (v_fecha is not null or v_referencia is not null);

  if v_visible then
    v_mensaje := v_nota;
    if v_fecha is not null then
      v_mensaje := v_mensaje || format(E'\nNueva fecha estimada de solución: %s.', to_char(v_fecha, 'DD/MM/YYYY'));
    end if;
    insert into public.ticket_comentarios (ticket_id, interno, mensaje) values (v_t.id, false, v_mensaje);
  end if;

  v_detalle := v_nota;
  if v_fecha is not null and v_fecha is distinct from v_tramo.fecha_estimada then
    v_detalle := v_detalle || format(' Fecha estimada: %s.', to_char(v_fecha, 'DD/MM/YYYY'));
  end if;
  select u.email into v_email from auth.users u where u.id = p_actor;
  insert into public.ticket_eventos (ticket_id, evento, detalle, user_id, user_email)
  values (v_t.id, 'escalamiento_actualizado', v_detalle, p_actor, v_email);

  return jsonb_build_object(
    'ticket_id', v_t.id,
    'escalamiento_id', v_tramo.id,
    'avance_id', v_avance,
    'fecha_estimada', coalesce(v_fecha, v_tramo.fecha_estimada),
    'visible_usuario', v_visible);
end;
$$;

create or replace function public.registrar_avance_escalamiento(p_ticket_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.registrar_avance_escalamiento_nucleo(p_ticket_id, p_datos, auth.uid());
end;
$$;

comment on function public.registrar_avance_escalamiento_nucleo(uuid, jsonb, uuid) is
  'Núcleo de registrar_avance_escalamiento (121) con actor explícito. EXECUTE solo project_admin.';
comment on function public.registrar_avance_escalamiento(uuid, jsonb) is
  'Registra el avance del tramo abierto (p_datos: nota, fecha_estimada, referencia, visible_usuario). Puede mover la fecha estimada; si visible_usuario, publica la nota como comentario público. Evento escalamiento_actualizado. Guard modulo:tickets (42501).';


-- ============================================================
-- 6) Triggers de tickets
-- ============================================================

-- 6.a) En atención, el nivel solo cambia por un tramo de esta transacción.
create or replace function public.check_nivel_por_escalamiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado <> 'abierto'
     and new.nivel_atencion is distinct from old.nivel_atencion
     and not exists (select 1 from public.ticket_escalamientos e
                      where e.ticket_id = new.id
                        and e.inicio_at = now()
                        and e.nivel_hacia is not distinct from new.nivel_atencion) then
    raise exception 'El nivel de un ticket en atención se cambia con «Escalar» o «Devolver nivel».';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_nivel_por_escalamiento on public.tickets;
create trigger trg_check_nivel_por_escalamiento
  before update of nivel_atencion on public.tickets
  for each row
  execute function public.check_nivel_por_escalamiento();

-- 6.b) Hoja de vida: cuerpo de la 035 con dos cambios marcados "121".
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
  -- 121: un cambio de nivel que viene de un tramo ya queda como `escalado` o
  -- `nivel_devuelto` (con motivo): no se duplica.
  if old.nivel_atencion is distinct from new.nivel_atencion
     and not exists (select 1 from public.ticket_escalamientos e
                      where e.ticket_id = new.id
                        and e.inicio_at = now()
                        and e.nivel_hacia is not distinct from new.nivel_atencion) then
    perform public.log_evento_ticket(new.id, 'nivel_atencion_cambiado',
      'De "' || coalesce(old.nivel_atencion, 'sin definir') || '" a "' || coalesce(new.nivel_atencion, 'sin definir') || '"');
  end if;
  if old.tipo is distinct from new.tipo then
    perform public.log_evento_ticket(new.id, 'tipo_cambiado',
      'De "' || coalesce(old.tipo, 'sin definir') || '" a "' || coalesce(new.tipo, 'sin definir') || '"');
  end if;
  -- 121: la reasignación guarda de quién a quién (antes, detalle NULL).
  if old.asignado_a is distinct from new.asignado_a then
    perform public.log_evento_ticket(new.id, 'reasignado',
      'De "' || coalesce((select s.nombre from public.staff s where s.user_id = old.asignado_a), 'Sin asignar')
        || '" a "' || coalesce((select s.nombre from public.staff s where s.user_id = new.asignado_a), 'Sin asignar') || '"');
  end if;
  return new;
end;
$$;

-- 6.c) El tramo sigue al ciclo de vida del ticket: se cierra al cerrar o
-- rechazar; al reabrir en N2/N3 se abre uno nuevo en el mismo nivel (con el
-- especialista del último tramo, sin fecha estimada: la anterior ya pasó).
create or replace function public.escalamiento_sigue_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ultimo public.ticket_escalamientos;
begin
  if new.estado in ('cerrado', 'rechazado') then
    update public.ticket_escalamientos
       set fin_at = now(), fin_motivo = new.estado
     where ticket_id = new.id and fin_at is null;
  elsif new.estado = 'reabierto'
        and coalesce(new.nivel_atencion, 'N1') <> 'N1'
        and not exists (select 1 from public.ticket_escalamientos where ticket_id = new.id and fin_at is null) then
    -- El último tramo en el nivel actual (de él salen especialista y referencia).
    select * into v_ultimo from public.ticket_escalamientos
     where ticket_id = new.id and nivel_hacia = new.nivel_atencion
     order by inicio_at desc, fin_at desc nulls first
     limit 1;
    insert into public.ticket_escalamientos
      (ticket_id, nivel_desde, nivel_hacia, direccion, motivo, responsable_id,
       especialista_tipo, especialista_nombre, referencia_externa, created_by)
    values
      (new.id, new.nivel_atencion, new.nivel_atencion, 'reabierto', 'El ticket se reabrió.', new.asignado_a,
       v_ultimo.especialista_tipo, v_ultimo.especialista_nombre, v_ultimo.referencia_externa,
       auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists trg_escalamiento_sigue_estado on public.tickets;
create trigger trg_escalamiento_sigue_estado
  after update of estado on public.tickets
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.escalamiento_sigue_estado();

-- 6.d) Realtime del seguimiento: también ante un cambio de nivel (la vista
-- pública recarga todo en cada mensaje; el contenido no cambia).
drop trigger if exists trg_ticket_estado_notify on public.tickets;
create trigger trg_ticket_estado_notify
  after update on public.tickets
  for each row
  when (old.estado is distinct from new.estado or old.nivel_atencion is distinct from new.nivel_atencion)
  execute function public.notify_ticket_estado();


-- ============================================================
-- 7) dashboard_resumen_de: escalados y escalados vencidos
-- Cuerpo = copia EXACTA de la 120 (cierre de tickets, que parte de la 108) con
-- dos cambios marcados "121": (1) `vig`
-- trae nivel_atencion y (2) tickets suma `escalados` (vigentes en N2/N3) y
-- `escalados_vencidos` (tramo abierto con fecha estimada anterior a hoy). La
-- forma del resultado no cambia para los lectores actuales.
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
        -- 121: nivel_atencion para escalados / escalados_vencidos.
        select id, codigo, titulo, created_at, asignado_a, vinculado, prioridad, estado, nivel_atencion,
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
        -- 121: escalamiento. Vigentes en N2/N3 y los de fecha estimada vencida.
        'escalados',  (select count(*) from vig where nivel_atencion in ('N2', 'N3')),
        'escalados_vencidos', coalesce((
          select jsonb_agg(jsonb_build_object('ticket_id', v.id, 'codigo', v.codigo,
                                              'titulo', v.titulo, 'nivel', v.nivel_atencion,
                                              'fecha_estimada', e.fecha_estimada)
                           order by e.fecha_estimada, v.created_at, v.id)
            from vig v
            join public.ticket_escalamientos e on e.ticket_id = v.id and e.fin_at is null
           where e.fecha_estimada < v_hoy), '[]'::jsonb),
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


-- ============================================================
-- 8) Dueño y permisos
-- ============================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.nivel_atencion_publico(text)',
    'public.nivel_atencion_rango(text)',
    'public.escalamiento_fecha(jsonb, text)',
    'public.escalamiento_responsable(jsonb)',
    'public.escalar_ticket_nucleo(uuid, jsonb, uuid)',
    'public.devolver_nivel_ticket_nucleo(uuid, jsonb, uuid)',
    'public.registrar_avance_escalamiento_nucleo(uuid, jsonb, uuid)',
    'public.escalar_ticket(uuid, jsonb)',
    'public.devolver_nivel_ticket(uuid, jsonb)',
    'public.registrar_avance_escalamiento(uuid, jsonb)',
    'public.check_nivel_por_escalamiento()',
    'public.escalamiento_sigue_estado()'
  ] loop
    execute format('alter function %s owner to project_admin', f);
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to project_admin', f);
  end loop;

  foreach f in array array[
    'public.escalar_ticket(uuid, jsonb)',
    'public.devolver_nivel_ticket(uuid, jsonb)',
    'public.registrar_avance_escalamiento(uuid, jsonb)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

alter table public.ticket_escalamientos owner to project_admin;
alter table public.ticket_escalamiento_avances owner to project_admin;


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tablas con RLS y solo SELECT para authenticated (esperado: 2 filas, rls=true, sel=true, ins=false, upd=false):
--    select c.relname, c.relrowsecurity as rls, has_table_privilege('authenticated', c.oid, 'select') as sel, has_table_privilege('authenticated', c.oid, 'insert') as ins, has_table_privilege('authenticated', c.oid, 'update') as upd from pg_class c where c.oid in ('public.ticket_escalamientos'::regclass, 'public.ticket_escalamiento_avances'::regclass) order by 1;
--
-- 2) RPC (esperado: 3 públicas con authenticated=true y anon=false; 3 núcleos con authenticated=false; todas secdef y de project_admin):
--    select p.oid::regprocedure::text as funcion, p.prosecdef, pg_get_userbyid(p.proowner) as dueno, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('escalar_ticket', 'escalar_ticket_nucleo', 'devolver_nivel_ticket', 'devolver_nivel_ticket_nucleo', 'registrar_avance_escalamiento', 'registrar_avance_escalamiento_nucleo') order by 1;
--
-- 3) Triggers en tickets (esperado: trg_check_nivel_por_escalamiento, trg_escalamiento_sigue_estado y trg_ticket_estado_notify con nivel_atencion en su condición):
--    select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.tickets'::regclass and tgname in ('trg_check_nivel_por_escalamiento', 'trg_escalamiento_sigue_estado', 'trg_ticket_estado_notify') order by 1;
--
-- 4) CHECK ampliados (esperado: true, true):
--    select position('escalamiento_actualizado' in pg_get_constraintdef(oid)) > 0 from pg_constraint where conname = 'ticket_eventos_evento_check';
--    select position('ticket_escalado' in pg_get_constraintdef(oid)) > 0 from pg_constraint where conname = 'notificaciones_tipo_check';
--
-- 5) Nivel sugerido sembrado (esperado: Redes, Seguridad y Videovigilancia en N2):
--    select c.nombre as categoria, s.nombre, s.nivel_sugerido from public.subcategorias_ticket s join public.categorias_ticket c on c.id = s.categoria_id where s.deleted_at is null order by c.nombre, s.nombre;
--
-- 6) NO escalar tickets reales para probar (deja eventos y comentarios
--    públicos en su hoja de vida): se prueba con tests/db/triggers.test.sql
--    (bloques 121a y 121b, con rollback) y con npm run test:sql-local (escenario S21).
--
-- 7) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '121';
-- ============================================================
-- FIN DE MIGRACIÓN 121
-- ============================================================
