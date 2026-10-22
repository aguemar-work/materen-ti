-- ============================================================
-- MIGRACIÓN 120 — Cierre de tickets según el procedimiento de TI: el técnico
-- resuelve con la solución visible, el usuario valida calificando, cierre
-- automático a las 24 h y revisión de las calificaciones bajas
-- Depende de: 016/017/050/089 (tickets, ticket_comentarios, ticket_satisfaccion,
--   whitelist de transiciones, resuelto_at), 102 (marcar_contexto /
--   contexto_actual / restaurar_contexto, notificaciones_tipo_check de 9
--   valores), 103 (config_parametros, parametro_entero), 108
--   (dashboard_resumen_de), 115 (v_ticket_hechos), 116 (ticket_eventos con
--   categoria_cambiada), 118 (reporte_satisfaccion_de), 099 (puede /
--   exigir_permiso).
--
-- ⚠️ NO APLICADA. Escrita y probada solo en local (npm run test:sql-local).
--
-- ── HALLAZGO (análisis del procedimiento de cierre, 2026-10-21) ────────────
--   El procedimiento de cierre de tickets dice: el asistente resuelve con un
--   comentario VISIBLE que explica la solución; el usuario consulta con su DNI
--   y califica de 1 a 5; si no califica en 24 h el ticket se cierra solo como
--   «Cerrado automático – Sin validación» (contado aparte, nunca satisfecho);
--   una calificación de 1 o 2 la revisa el asistente al día hábil siguiente y
--   reabre o deja una nota, y todo va al informe mensual. Hasta acá
--   cerrar_ticket() (051/086) encadenaba resuelto → cerrado en un clic: no
--   existía el momento «resuelto, esperando al usuario», la solución no era
--   obligatoria (el composer viene como nota interna), no había cierre
--   automático ni quién cerró, y solo el JEFE reabría.
--
-- ── DECISIONES (dueño, 2026-10-21) ─────────────────────────────────────────
--   · Se rescata el diseño de la rama v2/tickets-f1 (092/093/095: doble cierre,
--     nota de resolución, cerrado_por, una encuesta por resolución), conciliado
--     con 099-119 y reducido a lo que pide el procedimiento: sin
--     en_espera_usuario, sin rechazo con duplicado, sin reloj de atención (094)
--     ni prioridad_rango (090). El rol del actor sale de contexto_transaccion
--     (102, decisión C), no de una tabla propia.
--   · Calificar ES validar: la encuesta se abre al RESOLVER y responderla
--     cierra el ticket (cerrado_por = 'usuario'). El usuario no tiene un botón
--     aparte para rechazar el cierre: su desacuerdo es una calificación de 1 o 2.
--   · Cierre automático a las 24 h CORRIDAS desde resuelto_at (parámetro
--     horas_autocierre_resuelto). Lo hace cerrar_resueltos_vencidos()
--     (cerrado_por = 'sistema') y la encuesta pendiente queda anulada: un cierre
--     sin validación no se califica después. dias_autocierre_resuelto (103, 5
--     días del plan V2) queda sin uso: no se borra (los tests de la 103 y la
--     pantalla de parámetros lo listan).
--   · Un ticket SIN solicitante (sin empleado_id) no tiene quién valide: al
--     resolverse se cierra en la misma transacción (cerrado_por =
--     'sin_solicitante'), como hacía cerrar_ticket(). No se cuenta como cierre
--     sin validación.
--   · Calificación de 1 o 2: aviso al técnico asignado (o a todo el staff si
--     no hay); revisar_calificacion_baja() la revisa una sola vez con desenlace
--     'reabierto' (el técnico con módulo tickets reabre SIN ser JEFE, solo por
--     esta vía) o 'nota'. El plazo («día hábil siguiente», lunes a viernes, sin
--     feriados: no hay calendario laboral) se MIDE en el reporte, no bloquea.
--   · La condición de cierre del Anexo 1 (p. ej. el registro en KAPO Almacén)
--     vive fuera del sistema: la solución obligatoria debe citarla. La espera
--     a Almacén o a un proveedor sigue siendo el ticket en curso con una nota.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────────
--   1) tickets: nota_resolucion (obligatoria al pasar a resuelto),
--      motivo_reapertura (obligatorio al pasar a reabierto), cerrado_at y
--      cerrado_por ('usuario' | 'sistema' | 'sin_solicitante' | 'legado'), que
--      solo escribe el trigger tickets_datos_transicion. Los cerrados
--      existentes quedan 'legado' con cerrado_at = resuelto_at.
--   2) Whitelist con `quien`: resuelto → cerrado es del USUARIO (una sesión de
--      staff no cierra; el servidor sin sesión sí: la encuesta y el cierre
--      automático); resuelto → reabierto (nueva, JEFE) corrige una resolución
--      equivocada antes de que el usuario califique; cerrado → reabierto sigue
--      siendo del JEFE salvo por revisar_calificacion_baja().
--   3) Al resolver (trigger tickets_efectos_transicion): la nota se publica como
--      comentario VISIBLE («Solución aplicada: …») y se abre la encuesta de esa
--      resolución (si hay solicitante). Al reabrir, una encuesta pendiente
--      queda anulada.
--   4) ticket_satisfaccion: una encuesta por resolución (resolucion_numero),
--      resuelto_at, anulada_at y la revisión (revision_desenlace,
--      revision_nota, revisado_por, revisado_at). El guard
--      ticket_satisfaccion_respuesta solo acepta la respuesta de la encuesta
--      vigente de un ticket resuelto o cerrado, una vez; la revisión, una vez y
--      solo con nivel <= 2.
--   5) RPC (guard modulo:tickets, 42501; su núcleo *_de solo project_admin):
--        resolver_ticket(ticket, nota)                 en curso → resuelto
--        reabrir_ticket(ticket, motivo)                JEFE: resuelto/cerrado/rechazado → reabierto
--        revisar_calificacion_baja(encuesta, desenlace, nota)
--      Solo project_admin (las llama una edge function con cliente admin):
--        responder_encuesta_ticket(token, nivel, comentario)  califica y cierra
--        cerrar_resueltos_vencidos()                          cierre automático
--      cerrar_ticket() se elimina.
--   6) Eventos nuevos: cerrado_automatico, calificacion_revisada. Notificación
--      nueva: ticket_calificacion_baja.
--   7) v_ticket_hechos (115): la encuesta es la de la ÚLTIMA resolución (antes
--      había una sola por ticket) y suma cerrado_por, cerrado_at,
--      cerrado_sin_validacion y encuesta_anulada al final (create or replace).
--   8) reporte_satisfaccion_de (118): suma `cierresSinValidacion` y
--      `calificacionesBajas` (cada respuesta de 1 o 2 del período con su
--      desenlace y si se revisó a tiempo). definiciones_version sube.
--   9) dashboard_resumen_de (108): «encuestas sin responder» ya no cuenta las
--      anuladas. Mismo cuerpo de la 108; solo cambia ese filtro.
--
-- ── CÓMO APLICAR ───────────────────────────────────────────────────────────
--   Cuerpos con dollar-quoting (docs/GOTCHAS-CLI.md): `node scripts/deploy.mjs
--   migracion migrations/120_cierre_tickets_procedimiento.sql` (--dry-run
--   primero); nunca `db query` a mano. Correr SIEMPRE el bloque
--   «Verificación». Idempotente. Orden de salida (commit antes que producción):
--     1) esta migración;
--     2) edge function `tickets` (la encuesta pasa por responder_encuesta_ticket
--        y la búsqueda por DNI lista los resueltos por calificar);
--     3) edge function `credenciales` (acción `mantenimiento`) y el secret
--        MANTENIMIENTO_SECRET;
--     4) publicar el frontend («Resolver» con la solución, revisión de
--        calificaciones bajas);
--     5) con autorización del dueño, `insforge schedules create` cada hora
--        contra la acción `mantenimiento` (docs/CONTINUIDAD.md).
--   Entre 1) y 4), el frontend publicado llama a cerrar_ticket(), que ya no
--   existe: «Marcar como resuelto» falla con un error (no cierra nada a
--   medias). Entre 1) y 2), la encuesta del portal antiguo responde pero no
--   cierra el ticket (lo cierra el cierre automático).
--
-- Rollback: migrations/rollback/120_rollback.sql
-- ============================================================


-- ============================================================
-- 0) Precondiciones
-- ============================================================

do $$
begin
  if to_regprocedure('public.marcar_contexto(text, text)') is null
     or to_regprocedure('public.contexto_actual()') is null then
    raise exception 'La migración 120 requiere la 102 (contexto_transaccion). Aplíquela primero.';
  end if;
  if to_regclass('public.v_ticket_hechos') is null
     or to_regprocedure('public.reporte_satisfaccion_de(uuid, date, date)') is null then
    raise exception 'La migración 120 requiere la 115 y la 118 (v_ticket_hechos, reporte_satisfaccion_de). Aplíquelas primero.';
  end if;
  if to_regprocedure('public.dashboard_resumen_de(uuid)') is null then
    raise exception 'La migración 120 requiere la 108 (dashboard_resumen_de). Aplíquela primero.';
  end if;
end $$;


-- ============================================================
-- 1) tickets: datos del ciclo de cierre
-- ============================================================

alter table public.tickets add column if not exists nota_resolucion text;
alter table public.tickets add column if not exists motivo_reapertura text;
alter table public.tickets add column if not exists cerrado_at timestamptz;
alter table public.tickets add column if not exists cerrado_por text;

alter table public.tickets drop constraint if exists tickets_cerrado_por_check;
alter table public.tickets add constraint tickets_cerrado_por_check
  check (cerrado_por in ('usuario', 'sistema', 'sin_solicitante', 'legado'));

comment on column public.tickets.nota_resolucion is
  'Solución aplicada. Obligatoria al pasar a resuelto; se publica como comentario visible para el solicitante (120).';
comment on column public.tickets.motivo_reapertura is
  'Por qué se reabrió (JEFE o revisión de una calificación baja). Obligatorio al pasar a reabierto (120).';
comment on column public.tickets.cerrado_at is
  'Cuándo se cerró. Solo lo escribe el trigger tickets_datos_transicion (120).';
comment on column public.tickets.cerrado_por is
  'usuario (calificó) | sistema (cierre automático, sin validación) | sin_solicitante (nadie podía validar) | legado (antes de la 120). Solo lo escribe tickets_datos_transicion (120).';

-- Backfill de los cerrados: cerrar_ticket() cerraba en la misma transacción en
-- que resolvía, así que el cierre es la resolución. Sin los triggers que
-- repondrían los valores (datos_transicion), tocarían updated_at o publicarían
-- un aviso de realtime por fila.
drop trigger if exists trg_tickets_datos_transicion on public.tickets;
alter table public.tickets disable trigger trg_tickets_updated_at;
alter table public.tickets disable trigger trg_tickets_notify;
update public.tickets
   set cerrado_at = coalesce(resuelto_at, updated_at), cerrado_por = 'legado'
 where estado = 'cerrado' and cerrado_at is null;
alter table public.tickets enable trigger trg_tickets_updated_at;
alter table public.tickets enable trigger trg_tickets_notify;

create index if not exists tickets_resuelto_pendiente_idx
  on public.tickets (resuelto_at) where estado = 'resuelto';


-- ============================================================
-- 2) Parámetro del cierre automático
-- ============================================================

insert into public.config_parametros (clave, valor, descripcion) values
  ('horas_autocierre_resuelto', '24'::jsonb,
   'Horas corridas que un ticket resuelto espera la calificación del solicitante antes de cerrarse solo como «Cerrado automático – Sin validación» (120).')
on conflict (clave) do nothing;


-- ============================================================
-- 3) Whitelist de transiciones con «quién»
-- ============================================================

alter table public.transiciones_ticket_permitidas add column if not exists quien text;

delete from public.transiciones_ticket_permitidas;
insert into public.transiciones_ticket_permitidas (origen, destino, requiere_jefe, quien) values
  ('abierto',     'en_progreso', false, 'tecnico'),
  ('abierto',     'rechazado',   false, 'tecnico'),
  ('en_progreso', 'resuelto',    false, 'tecnico'),
  ('reabierto',   'resuelto',    false, 'tecnico'),
  ('resuelto',    'cerrado',     false, 'usuario'),
  ('resuelto',    'reabierto',   true,  'jefe'),
  ('cerrado',     'reabierto',   true,  'jefe'),
  ('rechazado',   'reabierto',   true,  'jefe');

alter table public.transiciones_ticket_permitidas alter column quien set not null;
alter table public.transiciones_ticket_permitidas drop constraint if exists transiciones_ticket_quien_check;
alter table public.transiciones_ticket_permitidas add constraint transiciones_ticket_quien_check
  check (quien in ('tecnico', 'usuario', 'jefe') and requiere_jefe = (quien = 'jefe'));

comment on column public.transiciones_ticket_permitidas.quien is
  'tecnico (staff) | usuario (nunca una sesión de staff: la encuesta o el cierre automático) | jefe. requiere_jefe = (quien = jefe). 120.';

-- Las dos excepciones salen del contexto de la transacción (102), que solo
-- marcan funciones SECURITY DEFINER: un UPDATE directo del cliente nunca lo trae.
--   · cierre_sin_solicitante: resolver_ticket() cierra en el acto un ticket sin empleado.
--   · revision_calificacion: revisar_calificacion_baja() reabre un cerrado sin JEFE.
create or replace function public.check_transicion_ticket_permitida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regla record;
  v_origen text;
begin
  if old.estado is distinct from new.estado then
    select * into v_regla from public.transiciones_ticket_permitidas
      where origen = old.estado and destino = new.estado;

    if v_regla is null then
      raise exception 'Transición de "%" a "%" no permitida.', old.estado, new.estado;
    end if;

    -- coalesce: sin contexto, `v_origen = '…'` sería NULL y `not NULL` no
    -- dispararía el raise (dejaría pasar la transición).
    select coalesce(c.origen, '') into v_origen from public.contexto_actual() c;
    v_origen := coalesce(v_origen, '');

    if v_regla.quien = 'jefe' and not public.es_jefe()
       and not (v_origen = 'revision_calificacion' and old.estado = 'cerrado' and new.estado = 'reabierto') then
      raise exception 'Solo el jefe puede hacer esta transición ("%" a "%").', old.estado, new.estado;
    end if;

    if v_regla.quien = 'usuario' and public.es_staff()
       and not (v_origen = 'cierre_sin_solicitante' and new.empleado_id is null) then
      raise exception 'El ticket resuelto lo cierra el solicitante al calificar la atención, o el cierre automático a las 24 horas.';
    end if;
  end if;
  return new;
end;
$$;

alter function public.check_transicion_ticket_permitida() owner to project_admin;


-- ============================================================
-- 4) Datos obligatorios y campos de cierre (BEFORE UPDATE)
-- ============================================================

create or replace function public.tickets_datos_transicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen text;
begin
  if new.estado is not distinct from old.estado then
    new.cerrado_at := old.cerrado_at;
    new.cerrado_por := old.cerrado_por;
    return new;
  end if;

  if new.estado = 'resuelto' then
    if btrim(coalesce(new.nota_resolucion, '')) = '' then
      raise exception 'Para resolver el ticket escriba la solución aplicada: el solicitante la verá en su seguimiento.';
    end if;
    new.nota_resolucion := btrim(new.nota_resolucion);
  end if;

  if new.estado = 'reabierto' then
    if btrim(coalesce(new.motivo_reapertura, '')) = '' then
      raise exception 'Para reabrir el ticket escriba el motivo.';
    end if;
    -- La próxima resolución exige una solución nueva (la anterior queda en
    -- su comentario visible y en la encuesta de esa resolución).
    new.nota_resolucion := null;
  end if;

  if new.estado = 'cerrado' then
    select c.origen into v_origen from public.contexto_actual() c;
    new.cerrado_at := now();
    new.cerrado_por := case v_origen
      when 'encuesta_ticket' then 'usuario'
      when 'cierre_sin_solicitante' then 'sin_solicitante'
      else 'sistema' end;
  else
    new.cerrado_at := null;
    new.cerrado_por := null;
  end if;

  return new;
end;
$$;

alter function public.tickets_datos_transicion() owner to project_admin;
revoke all on function public.tickets_datos_transicion() from public, anon, authenticated;

create trigger trg_tickets_datos_transicion
  before update on public.tickets
  for each row execute function public.tickets_datos_transicion();


-- ============================================================
-- 5) ticket_satisfaccion: una encuesta por resolución y su revisión
-- ============================================================

alter table public.ticket_satisfaccion add column if not exists resolucion_numero integer not null default 1;
alter table public.ticket_satisfaccion add column if not exists resuelto_at timestamptz;
alter table public.ticket_satisfaccion add column if not exists anulada_at timestamptz;
alter table public.ticket_satisfaccion add column if not exists revision_desenlace text;
alter table public.ticket_satisfaccion add column if not exists revision_nota text;
alter table public.ticket_satisfaccion add column if not exists revisado_por uuid;
alter table public.ticket_satisfaccion add column if not exists revisado_at timestamptz;

comment on column public.ticket_satisfaccion.resolucion_numero is 'Resolución del ticket a la que pertenece: 1, 2, … (120).';
comment on column public.ticket_satisfaccion.resuelto_at is 'Cuándo se resolvió esa vez (= tickets.resuelto_at de esa resolución) (120).';
comment on column public.ticket_satisfaccion.anulada_at is 'Encuesta sin responder que ya no se puede responder: el ticket se reabrió o se cerró solo (120).';
comment on column public.ticket_satisfaccion.revision_desenlace is 'Revisión de una calificación de 1 o 2: reabierto | nota. Una sola vez (120).';
comment on column public.ticket_satisfaccion.revision_nota is 'Explicación de la revisión (nota interna, no la ve el solicitante) (120).';
comment on column public.ticket_satisfaccion.revisado_por is 'Quién revisó la calificación baja (auth.users.id; sin FK, como los historiales) (120).';
comment on column public.ticket_satisfaccion.revisado_at is 'Cuándo se revisó la calificación baja (120).';

alter table public.ticket_satisfaccion drop constraint if exists ticket_satisfaccion_revision_desenlace_check;
alter table public.ticket_satisfaccion add constraint ticket_satisfaccion_revision_desenlace_check
  check (revision_desenlace is null or revision_desenlace in ('reabierto', 'nota'));
alter table public.ticket_satisfaccion drop constraint if exists ticket_satisfaccion_revision_completa_check;
alter table public.ticket_satisfaccion add constraint ticket_satisfaccion_revision_completa_check
  check ((revision_desenlace is null) = (revisado_at is null));

update public.ticket_satisfaccion s
   set resuelto_at = t.resuelto_at
  from public.tickets t
 where t.id = s.ticket_id and s.resuelto_at is null;

alter table public.ticket_satisfaccion drop constraint if exists ticket_satisfaccion_ticket_id_key;
alter table public.ticket_satisfaccion drop constraint if exists ticket_satisfaccion_ticket_resolucion_key;
alter table public.ticket_satisfaccion add constraint ticket_satisfaccion_ticket_resolucion_key
  unique (ticket_id, resolucion_numero);

create index if not exists ticket_satisfaccion_baja_pendiente_idx
  on public.ticket_satisfaccion (fecha_envio)
  where nivel <= 2 and fecha_envio is not null and revision_desenlace is null;

comment on table public.ticket_satisfaccion is
  'Encuesta de satisfacción: una por resolución del ticket (120). Se abre vacía al resolver; responderla cierra el ticket (responder_encuesta_ticket). Sin INSERT ni UPDATE de cliente.';

-- Guard de la respuesta y de la revisión.
--   · Responder = pasar fecha_envio de null a un valor: solo la encuesta
--     vigente (última, no anulada) de un ticket resuelto o cerrado, con nivel.
--   · Respondida, nivel/fecha_envio no cambian y el comentario solo puede
--     vaciarse (anonimización, scripts/anonimizar.sql).
--   · La revisión: una vez, solo con nivel <= 2; después solo puede vaciarse
--     la nota (anonimización).
create or replace function public.ticket_satisfaccion_respuesta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_vigente uuid;
begin
  if old.fecha_envio is not null then
    if new.nivel is distinct from old.nivel or new.fecha_envio is distinct from old.fecha_envio
       or (new.comentario is distinct from old.comentario and new.comentario is not null) then
      raise exception 'La encuesta ya fue respondida.';
    end if;
    if old.revision_desenlace is not null then
      if new.revision_desenlace is distinct from old.revision_desenlace
         or new.revisado_por is distinct from old.revisado_por
         or new.revisado_at is distinct from old.revisado_at
         or (new.revision_nota is distinct from old.revision_nota and new.revision_nota is not null) then
        raise exception 'Esta calificación ya fue revisada.';
      end if;
    elsif new.revision_desenlace is not null and coalesce(new.nivel, 5) > 2 then
      raise exception 'Solo se revisa una calificación de 1 o 2.';
    end if;
    return new;
  end if;

  if new.revision_desenlace is not null then
    raise exception 'Solo se revisa una encuesta respondida.';
  end if;

  if new.fecha_envio is not null then
    if new.nivel is null then
      raise exception 'La respuesta de la encuesta necesita un nivel de 1 a 5.';
    end if;
    if old.anulada_at is not null or new.anulada_at is not null then
      raise exception 'Esta encuesta ya no se puede responder.';
    end if;
    select estado into v_estado from public.tickets where id = new.ticket_id;
    if v_estado not in ('resuelto', 'cerrado') then
      raise exception 'Solo se califica un ticket resuelto.';
    end if;
    select id into v_vigente from public.ticket_satisfaccion
     where ticket_id = new.ticket_id
     order by resolucion_numero desc limit 1;
    if v_vigente is distinct from new.id then
      raise exception 'Esta encuesta corresponde a una resolución anterior.';
    end if;
  end if;
  return new;
end;
$$;

alter function public.ticket_satisfaccion_respuesta() owner to project_admin;
revoke all on function public.ticket_satisfaccion_respuesta() from public, anon, authenticated;

drop trigger if exists trg_ticket_satisfaccion_respuesta on public.ticket_satisfaccion;
create trigger trg_ticket_satisfaccion_respuesta
  before update on public.ticket_satisfaccion
  for each row execute function public.ticket_satisfaccion_respuesta();


-- ============================================================
-- 6) Efectos de cada transición (AFTER UPDATE): solución visible, encuesta
--    de la resolución, encuesta anulada al reabrir. Reemplaza
--    crear_encuesta_al_cerrar (016).
-- ============================================================

drop trigger if exists trg_crear_encuesta_al_cerrar on public.tickets;
drop function if exists public.crear_encuesta_al_cerrar();

create or replace function public.tickets_efectos_transicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if new.estado is not distinct from old.estado then
    return null;
  end if;

  if new.estado = 'resuelto' then
    -- autor_id lo fija trg_ticket_comentarios_by (auth.uid(): quien resolvió).
    insert into public.ticket_comentarios (ticket_id, interno, mensaje)
      values (new.id, false, 'Solución aplicada: ' || new.nota_resolucion);
    if new.empleado_id is not null then
      update public.ticket_satisfaccion set anulada_at = now()
       where ticket_id = new.id and fecha_envio is null and anulada_at is null;
      select coalesce(max(resolucion_numero), 0) + 1 into v_numero
        from public.ticket_satisfaccion where ticket_id = new.id;
      insert into public.ticket_satisfaccion (ticket_id, resolucion_numero, resuelto_at)
        values (new.id, v_numero, new.resuelto_at);
    end if;
  elsif new.estado = 'reabierto' then
    update public.ticket_satisfaccion set anulada_at = now()
     where ticket_id = new.id and fecha_envio is null and anulada_at is null;
  end if;

  return null;
end;
$$;

alter function public.tickets_efectos_transicion() owner to project_admin;
revoke all on function public.tickets_efectos_transicion() from public, anon, authenticated;

drop trigger if exists trg_tickets_efectos_transicion on public.tickets;
create trigger trg_tickets_efectos_transicion
  after update on public.tickets
  for each row execute function public.tickets_efectos_transicion();


-- ============================================================
-- 7) Eventos y notificaciones nuevos
-- ============================================================

-- Mismo listado que la 116 más los dos eventos nuevos.
alter table public.ticket_eventos drop constraint if exists ticket_eventos_evento_check;
alter table public.ticket_eventos add constraint ticket_eventos_evento_check
  check (evento in (
    'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
    'nivel_atencion_cambiado', 'tipo_cambiado', 'correo_fallido',
    'encuesta_enviada', 'encuesta_respondida', 'categoria_cambiada',
    'cerrado_automatico', 'calificacion_revisada'
  ));

-- Los 9 valores de la 102 más el aviso de calificación baja.
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja',
    'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo',
    'ticket_correo_fallido',
    'empleado_suspendido',
    'ticket_calificacion_baja'
  ));

-- Día hábil siguiente (lunes a viernes; sin feriados: no hay calendario laboral).
create or replace function public.dia_habil_siguiente(p_dia date)
returns date
language sql
immutable
set search_path = public
as $$
  select case extract(isodow from p_dia)::int
           when 5 then p_dia + 3
           when 6 then p_dia + 2
           else p_dia + 1 end;
$$;

alter function public.dia_habil_siguiente(date) owner to project_admin;
revoke all on function public.dia_habil_siguiente(date) from public, anon, authenticated;
grant execute on function public.dia_habil_siguiente(date) to project_admin, authenticated;
comment on function public.dia_habil_siguiente(date) is
  'Día hábil siguiente a p_dia (lunes a viernes, sin feriados). Plazo de revisión de una calificación baja (120).';

-- Una respuesta de 1 o 2 avisa al técnico asignado; sin asignado, a todo el staff.
create or replace function public.notify_calificacion_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_plazo date;
begin
  if old.fecha_envio is null and new.fecha_envio is not null and new.nivel <= 2 then
    select * into v_ticket from public.tickets where id = new.ticket_id;
    v_plazo := public.dia_habil_siguiente((new.fecha_envio at time zone 'America/Lima')::date);
    perform public.crear_notificacion(
      'ticket_calificacion_baja',
      'ticket',
      v_ticket.id,
      'Calificación ' || new.nivel || '/5 · ' || v_ticket.codigo || ' — revisar a más tardar el ' || to_char(v_plazo, 'DD/MM'),
      '/tickets/' || v_ticket.id,
      v_ticket.asignado_a
    );
  end if;
  return null;
end;
$$;

alter function public.notify_calificacion_baja() owner to project_admin;
revoke all on function public.notify_calificacion_baja() from public, anon, authenticated;

drop trigger if exists trg_notify_calificacion_baja on public.ticket_satisfaccion;
create trigger trg_notify_calificacion_baja
  after update on public.ticket_satisfaccion
  for each row execute function public.notify_calificacion_baja();


-- ============================================================
-- 8) RPC del staff: resolver, reabrir, revisar una calificación baja
-- ============================================================

drop function if exists public.cerrar_ticket(uuid);

-- Núcleo: el actor llega explícito (pruebas sin sesión). La regla de qué
-- transición es de quién la aplica la whitelist con auth.uid() de la sesión.
create or replace function public.resolver_ticket_de(p_actor uuid, p_ticket_id uuid, p_nota text)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_rol_prev text;
  v_origen_prev text;
begin
  if not public.puede(p_actor, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;
  if v_ticket.estado not in ('en_progreso', 'reabierto') then
    raise exception 'Solo se resuelve un ticket en progreso o reabierto (estado actual: %).', v_ticket.estado;
  end if;
  if btrim(coalesce(p_nota, '')) = '' then
    raise exception 'Escriba la solución aplicada: el solicitante la verá en su seguimiento.';
  end if;
  if length(btrim(p_nota)) > 4000 then
    raise exception 'La solución no puede superar los 4000 caracteres.';
  end if;

  update public.tickets set nota_resolucion = btrim(p_nota), estado = 'resuelto'
   where id = p_ticket_id returning * into v_ticket;

  -- Sin solicitante nadie puede calificar: se cierra en la misma transacción.
  if v_ticket.empleado_id is null then
    select c.rol, c.origen into v_rol_prev, v_origen_prev from public.contexto_actual() c;
    perform public.marcar_contexto('tecnico', 'cierre_sin_solicitante');
    update public.tickets set estado = 'cerrado' where id = p_ticket_id returning * into v_ticket;
    perform public.restaurar_contexto(v_rol_prev, v_origen_prev);
  end if;

  return v_ticket;
end;
$$;

create or replace function public.resolver_ticket(p_ticket_id uuid, p_nota text)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.resolver_ticket_de(auth.uid(), p_ticket_id, p_nota);
end;
$$;

-- Reabrir sigue siendo del JEFE (la whitelist lo exige con su sesión); el
-- motivo queda en motivo_reapertura (historial) y como nota interna.
create or replace function public.reabrir_ticket(p_ticket_id uuid, p_motivo text)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
begin
  perform public.exigir_permiso('rol:jefe');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Para reabrir el ticket escriba el motivo.';
  end if;
  update public.tickets set motivo_reapertura = btrim(p_motivo), estado = 'reabierto'
   where id = p_ticket_id returning * into v_ticket;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;
  insert into public.ticket_comentarios (ticket_id, interno, mensaje)
    values (p_ticket_id, true, 'Reabierto: ' || btrim(p_motivo));
  return v_ticket;
end;
$$;

-- Revisión de una calificación de 1 o 2 (una sola vez). 'reabierto' reabre el
-- ticket cerrado sin ser JEFE (contexto revision_calificacion); 'nota' deja la
-- explicación. Las dos quedan en la encuesta y en el historial del ticket
-- (evento calificacion_revisada): un ticket cerrado no admite comentarios.
create or replace function public.revisar_calificacion_baja_de(
  p_actor uuid, p_encuesta_id uuid, p_desenlace text, p_nota text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.ticket_satisfaccion;
  v_ticket public.tickets;
  v_vigente uuid;
  v_rol_prev text;
  v_origen_prev text;
  v_email text;
begin
  if not public.puede(p_actor, 'modulo:tickets') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_desenlace is null or p_desenlace not in ('reabierto', 'nota') then
    raise exception 'Elija si se reabre el ticket o se deja una nota.';
  end if;
  if btrim(coalesce(p_nota, '')) = '' then
    raise exception 'Escriba qué se revisó con el solicitante.';
  end if;
  if length(btrim(p_nota)) > 2000 then
    raise exception 'La nota no puede superar los 2000 caracteres.';
  end if;

  select * into v_enc from public.ticket_satisfaccion where id = p_encuesta_id for update;
  if not found then
    raise exception 'Encuesta no encontrada.';
  end if;
  if v_enc.fecha_envio is null or v_enc.nivel > 2 then
    raise exception 'Solo se revisa una calificación de 1 o 2.';
  end if;
  if v_enc.revision_desenlace is not null then
    raise exception 'Esta calificación ya fue revisada.';
  end if;
  select * into v_ticket from public.tickets where id = v_enc.ticket_id for update;

  if p_desenlace = 'reabierto' then
    select id into v_vigente from public.ticket_satisfaccion
     where ticket_id = v_enc.ticket_id order by resolucion_numero desc limit 1;
    if v_ticket.estado <> 'cerrado' or v_vigente is distinct from v_enc.id then
      raise exception 'El ticket ya no está cerrado con esta calificación: revísela con una nota.';
    end if;
    select c.rol, c.origen into v_rol_prev, v_origen_prev from public.contexto_actual() c;
    perform public.marcar_contexto('tecnico', 'revision_calificacion');
    update public.tickets
       set motivo_reapertura = 'Calificación ' || v_enc.nivel || '/5: ' || btrim(p_nota), estado = 'reabierto'
     where id = v_ticket.id returning * into v_ticket;
    perform public.restaurar_contexto(v_rol_prev, v_origen_prev);
  end if;

  update public.ticket_satisfaccion
     set revision_desenlace = p_desenlace, revision_nota = btrim(p_nota),
         revisado_por = p_actor, revisado_at = now()
   where id = v_enc.id;

  select email into v_email from auth.users where id = p_actor;
  insert into public.ticket_eventos (ticket_id, evento, detalle, user_id, user_email)
  values (v_ticket.id, 'calificacion_revisada',
          'Calificación ' || v_enc.nivel || '/5 · ' ||
            case p_desenlace when 'reabierto' then 'Reabierto' else 'Nota' end || ': ' || btrim(p_nota),
          p_actor, v_email);

  return jsonb_build_object('ok', true, 'desenlace', p_desenlace, 'estado', v_ticket.estado);
end;
$$;

create or replace function public.revisar_calificacion_baja(p_encuesta_id uuid, p_desenlace text, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.revisar_calificacion_baja_de(auth.uid(), p_encuesta_id, p_desenlace, p_nota);
end;
$$;


-- ============================================================
-- 9) Servidor sin sesión: la calificación del usuario y el cierre automático
-- ============================================================

-- La llama la edge function `tickets` (cliente admin) con el token del
-- ticket. Devuelve códigos de negocio que la function traduce.
create or replace function public.responder_encuesta_ticket(p_token text, p_nivel integer, p_comentario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_enc public.ticket_satisfaccion;
  v_rol_prev text;
  v_origen_prev text;
  v_cerro boolean := false;
begin
  if p_nivel is null or p_nivel < 1 or p_nivel > 5 then
    return jsonb_build_object('ok', false, 'code', 'datos_invalidos');
  end if;
  select * into v_ticket from public.tickets where token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_existe');
  end if;
  select * into v_enc from public.ticket_satisfaccion
   where ticket_id = v_ticket.id order by resolucion_numero desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_disponible');
  end if;
  if v_enc.fecha_envio is not null then
    return jsonb_build_object('ok', false, 'code', 'ya_respondida');
  end if;
  if v_enc.anulada_at is not null or v_ticket.estado not in ('resuelto', 'cerrado') then
    return jsonb_build_object('ok', false, 'code', 'no_vigente', 'estado', v_ticket.estado);
  end if;

  update public.ticket_satisfaccion
     set nivel = p_nivel, comentario = nullif(btrim(coalesce(p_comentario, '')), ''), fecha_envio = now()
   where id = v_enc.id;
  insert into public.ticket_eventos (ticket_id, evento, detalle) values (v_ticket.id, 'encuesta_respondida', 'Nivel ' || p_nivel);

  -- Calificar ES validar la solución: el ticket resuelto se cierra. Uno ya
  -- cerrado (encuesta pendiente de antes de la 120) solo guarda la respuesta.
  if v_ticket.estado = 'resuelto' then
    select c.rol, c.origen into v_rol_prev, v_origen_prev from public.contexto_actual() c;
    perform public.marcar_contexto('usuario', 'encuesta_ticket');
    update public.tickets set estado = 'cerrado' where id = v_ticket.id;
    perform public.restaurar_contexto(v_rol_prev, v_origen_prev);
    v_cerro := true;
  end if;

  return jsonb_build_object('ok', true, 'codigo', v_ticket.codigo, 'cerrado', v_cerro);
end;
$$;

-- Cierre automático: cada ticket resuelto hace más de horas_autocierre_resuelto
-- horas se cierra como «Cerrado automático – Sin validación»; su encuesta
-- pendiente queda anulada. La programa la acción `mantenimiento` de la edge
-- function `credenciales` (insforge schedules).
create or replace function public.cerrar_resueltos_vencidos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horas integer := greatest(public.parametro_entero('horas_autocierre_resuelto', 24), 1);
  v_ids uuid[];
  v_rol_prev text;
  v_origen_prev text;
begin
  select coalesce(array_agg(id order by resuelto_at), '{}') into v_ids
    from (select id, resuelto_at from public.tickets
           where estado = 'resuelto' and resuelto_at <= now() - make_interval(hours => v_horas)
           for update skip locked) x;
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', true, 'cerrados', 0, 'horas', v_horas);
  end if;

  update public.ticket_satisfaccion set anulada_at = now()
   where ticket_id = any(v_ids) and fecha_envio is null and anulada_at is null;

  select c.rol, c.origen into v_rol_prev, v_origen_prev from public.contexto_actual() c;
  perform public.marcar_contexto('sistema', 'autocierre_ticket');
  update public.tickets set estado = 'cerrado' where id = any(v_ids);
  perform public.restaurar_contexto(v_rol_prev, v_origen_prev);

  insert into public.ticket_eventos (ticket_id, evento, detalle)
  select id, 'cerrado_automatico', 'Cerrado automático – Sin validación (' || v_horas || ' h sin calificación)'
    from unnest(v_ids) as id;

  return jsonb_build_object('ok', true, 'cerrados', cardinality(v_ids), 'horas', v_horas);
end;
$$;


-- ============================================================
-- 10) Permisos de las funciones nuevas
-- ============================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.resolver_ticket_de(uuid, uuid, text)',
    'public.resolver_ticket(uuid, text)',
    'public.reabrir_ticket(uuid, text)',
    'public.revisar_calificacion_baja_de(uuid, uuid, text, text)',
    'public.revisar_calificacion_baja(uuid, text, text)',
    'public.responder_encuesta_ticket(text, integer, text)',
    'public.cerrar_resueltos_vencidos()'
  ] loop
    execute format('alter function %s owner to project_admin', f);
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to project_admin', f);
  end loop;
  foreach f in array array[
    'public.resolver_ticket(uuid, text)',
    'public.reabrir_ticket(uuid, text)',
    'public.revisar_calificacion_baja(uuid, text, text)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

comment on function public.resolver_ticket_de(uuid, uuid, text) is
  'Núcleo de resolver_ticket (120): en curso → resuelto con la solución (comentario visible y encuesta los dejan los triggers); sin solicitante, además → cerrado (sin_solicitante). EXECUTE solo project_admin.';
comment on function public.resolver_ticket(uuid, text) is
  'Resuelve un ticket en progreso o reabierto con la solución aplicada, que ve el solicitante; el ticket espera su calificación (o el cierre automático). Guard modulo:tickets (42501). Reemplaza cerrar_ticket (120).';
comment on function public.reabrir_ticket(uuid, text) is
  'JEFE: reabre un ticket resuelto, cerrado o rechazado con motivo (nota interna). Guard rol:jefe (42501). 120.';
comment on function public.revisar_calificacion_baja_de(uuid, uuid, text, text) is
  'Núcleo de revisar_calificacion_baja (120). EXECUTE solo project_admin.';
comment on function public.revisar_calificacion_baja(uuid, text, text) is
  'Revisa una calificación de 1 o 2 una sola vez: reabierto (reabre el ticket cerrado, sin ser JEFE) o nota. Guard modulo:tickets (42501). 120.';
comment on function public.responder_encuesta_ticket(text, integer, text) is
  'Respuesta del solicitante por el token del ticket (edge function tickets): guarda la calificación y cierra el ticket resuelto (cerrado_por usuario). Códigos: no_existe, no_disponible, ya_respondida, no_vigente, datos_invalidos. EXECUTE solo project_admin. 120.';
comment on function public.cerrar_resueltos_vencidos() is
  'Cierre automático (120): cierra como sistema los tickets resueltos hace más de horas_autocierre_resuelto horas y anula su encuesta pendiente. EXECUTE solo project_admin (acción mantenimiento de credenciales).';


-- ============================================================
-- 11) v_ticket_hechos (115): encuesta de la última resolución y cierre
-- Mismas columnas y en el mismo orden que la 115 (create or replace no admite
-- otra cosa) más cuatro al final. Las vistas KPI que dependen de ella no cambian.
-- ============================================================

create or replace view public.v_ticket_hechos
with (security_invoker = true) as
with parametros as (
  select public.parametro_entero('dias_corte_reapertura', 30) as corte_dias
),
ev as (
  select e.ticket_id, e.user_id, e.created_at,
         substring(e.detalle from '^De "(\w+)"')   as origen,
         substring(e.detalle from 'a "(\w+)"\s*$') as destino
    from public.ticket_eventos e
   where e.evento = 'estado_cambiado'
),
resoluciones as (
  select ticket_id,
         count(*)::integer                                   as n_resoluciones,
         min(created_at)                                     as primera_resolucion_at,
         max(created_at)                                     as ultima_resolucion_at,
         (array_agg(user_id order by created_at desc))[1]    as tecnico_resolvio_id
    from ev
   where destino = 'resuelto'
   group by ticket_id
),
reaperturas as (
  select r.ticket_id,
         count(*)::integer                                   as n_reaperturas,
         array_agg(r.created_at order by r.created_at)       as reaperturas_at,
         bool_or(r.resolucion_previa is not null
                 and r.created_at <= r.resolucion_previa + make_interval(days => p.corte_dias)) as reabierto_en_corte
    from (
      select e.ticket_id, e.created_at,
             (select max(x.created_at) from ev x
               where x.ticket_id = e.ticket_id and x.destino = 'resuelto' and x.created_at <= e.created_at) as resolucion_previa
        from ev e
       where e.destino = 'reabierto' and coalesce(e.origen, '') <> 'rechazado'
    ) r
    cross join parametros p
   group by r.ticket_id
),
transiciones as (
  select ticket_id,
         jsonb_agg(jsonb_build_object('t', created_at, 'a', destino) order by created_at) as transiciones
    from ev
   group by ticket_id
),
reasignaciones as (
  select ticket_id, count(*)::integer as n_reasignaciones
    from public.ticket_eventos
   where evento = 'reasignado'
   group by ticket_id
),
primera_respuesta as (
  select c.ticket_id, min(c.created_at) as primera_respuesta_at
    from public.ticket_comentarios c
    join public.staff s on s.user_id = c.autor_id
   where c.interno = false
   group by c.ticket_id
)
select
  t.id                                                        as ticket_id,
  t.codigo,
  t.titulo,
  t.estado,
  t.prioridad,
  t.tipo,
  t.nivel_atencion,
  t.categoria_id,
  cat.nombre                                                  as categoria_nombre,
  t.subcategoria_id,
  sub.nombre                                                  as subcategoria_nombre,
  t.empleado_id,
  t.vinculado,
  case when coalesce(t.vinculado, false) and e.id is not null
       then btrim(e.nombres || ' ' || e.apellidos)
       else 'Sin vincular' end                                as solicitante,
  e.area_obra_id,
  ao.nombre                                                   as area_obra_nombre,
  e.ubicacion_id,
  ub.nombre                                                   as ubicacion_nombre,
  t.asignado_a,
  t.created_at,
  (t.created_at at time zone 'America/Lima')::date            as dia_creado,
  t.resuelto_at,
  (t.resuelto_at at time zone 'America/Lima')::date           as dia_resuelto,
  (t.estado in ('resuelto', 'cerrado') and t.resuelto_at is not null) as resuelto_vigente,
  (t.estado = 'rechazado')                                    as rechazado,
  (t.estado = 'cerrado')                                      as cerrado,
  r.tecnico_resolvio_id,
  case when t.estado in ('resuelto', 'cerrado') and t.resuelto_at >= t.created_at
       then extract(epoch from (t.resuelto_at - t.created_at)) / 3600.0 end as horas_resolucion,
  pr.primera_respuesta_at,
  case when pr.primera_respuesta_at >= t.created_at
       then extract(epoch from (pr.primera_respuesta_at - t.created_at)) / 3600.0 end as horas_primera_respuesta,
  coalesce(ra.n_reasignaciones, 0)                            as n_reasignaciones,
  coalesce(r.n_resoluciones, 0)                               as n_resoluciones,
  r.primera_resolucion_at,
  (r.primera_resolucion_at at time zone 'America/Lima')::date as dia_primera_resolucion,
  r.ultima_resolucion_at,
  coalesce(rp.n_reaperturas, 0)                               as n_reaperturas,
  coalesce(rp.reaperturas_at, '{}'::timestamptz[])            as reaperturas_at,
  coalesce(rp.reabierto_en_corte, false)                      as reabierto_en_corte,
  coalesce(tr.transiciones, '[]'::jsonb)                      as transiciones,
  s.id                                                        as encuesta_id,
  (s.id is not null)                                          as encuesta_generada,
  s.created_at                                                as encuesta_generada_at,
  (s.fecha_envio is not null)                                 as encuesta_respondida,
  case when s.fecha_envio is not null then s.nivel end        as encuesta_nivel,
  case when s.fecha_envio is not null then s.comentario end   as encuesta_comentario,
  s.fecha_envio                                               as encuesta_respondida_at,
  -- 120
  t.cerrado_por,
  t.cerrado_at,
  (t.estado = 'cerrado' and t.cerrado_por = 'sistema')        as cerrado_sin_validacion,
  (s.anulada_at is not null)                                  as encuesta_anulada
from public.tickets t
left join public.categorias_ticket    cat on cat.id = t.categoria_id
left join public.subcategorias_ticket sub on sub.id = t.subcategoria_id
left join public.empleados            e   on e.id = t.empleado_id
left join public.areas_obras          ao  on ao.id = e.area_obra_id
left join public.ubicaciones          ub  on ub.id = e.ubicacion_id
left join resoluciones                r   on r.ticket_id = t.id
left join reaperturas                 rp  on rp.ticket_id = t.id
left join transiciones                tr  on tr.ticket_id = t.id
left join reasignaciones              ra  on ra.ticket_id = t.id
left join primera_respuesta           pr  on pr.ticket_id = t.id
-- Una encuesta por resolución (120): la de la última. Una respuesta anterior
-- (la que llevó a reabrir) se lee en ticket_satisfaccion.
left join lateral (
  select x.id, x.created_at, x.fecha_envio, x.nivel, x.comentario, x.anulada_at
    from public.ticket_satisfaccion x
   where x.ticket_id = t.id
   order by x.resolucion_numero desc
   limit 1
) s on true;

comment on view public.v_ticket_hechos is
  'Una fila por ticket con todos los hechos que miden los reportes (resolución vigente, técnico que resolvió, horas corridas, reaperturas, encuesta de la última resolución, quién cerró). Única lectura de ticket_eventos con regex. security_invoker. Migraciones 115 y 120.';


-- ============================================================
-- 12) reporte_satisfaccion_de (118) + cierres sin validación y calificaciones bajas
-- Mismo cuerpo de la 118; lo nuevo va marcado «120».
-- ============================================================

create or replace function public.reporte_satisfaccion_de(p_user uuid, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_version  constant text := 'reportes-2026-10-21';
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
  ),
  -- 120: cierres sin validación del período (resueltos en el período y
  -- cerrados por el sistema). No entran en ninguna muestra: no tienen nivel.
  sin_validacion as (
    select count(*)::integer as total,
           count(*) filter (where encuesta_generada)::integer as con_encuesta
      from b where cerrado_sin_validacion
  ),
  -- 120: cada respuesta de 1 o 2 DEL PERÍODO (por fecha de respuesta, en
  -- hora de Lima), también las de una resolución anterior a la vigente, con
  -- su revisión y el plazo del día hábil siguiente.
  bajas as (
    select x.id, x.ticket_id, t.codigo, t.titulo, x.nivel, x.comentario, x.fecha_envio,
           x.revision_desenlace, x.revision_nota, x.revisado_por, x.revisado_at, sr.nombre as revisado_por_nombre,
           public.dia_habil_siguiente((x.fecha_envio at time zone 'America/Lima')::date) as plazo,
           (x.revisado_at at time zone 'America/Lima')::date as dia_revisado
      from public.ticket_satisfaccion x
      join public.tickets t on t.id = x.ticket_id
      left join public.staff sr on sr.user_id = x.revisado_por
     where x.fecha_envio is not null and x.nivel <= 2
       and (p_desde is null or (x.fecha_envio at time zone 'America/Lima')::date between p_desde and p_hasta)
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
      ) order by encuesta_generada_at desc) from b where encuesta_generada), '[]'::jsonb),
    -- 120
    'cierresSinValidacion', (select jsonb_build_object('total', total, 'conEncuesta', con_encuesta) from sin_validacion),
    'calificacionesBajas', jsonb_build_object(
      'total',        (select count(*) from bajas)::integer,
      'reabiertos',   (select count(*) from bajas where revision_desenlace = 'reabierto')::integer,
      'conNota',      (select count(*) from bajas where revision_desenlace = 'nota')::integer,
      'pendientes',   (select count(*) from bajas where revision_desenlace is null)::integer,
      'fueraDePlazo', (select count(*) from bajas where (revision_desenlace is not null and dia_revisado > plazo)
                                                     or (revision_desenlace is null and v_hoy > plazo))::integer,
      'lista', coalesce((select jsonb_agg(jsonb_build_object(
          'id', id, 'ticket_id', ticket_id, 'ticket_codigo', codigo, 'ticket_titulo', titulo,
          'nivel', nivel, 'comentario', comentario, 'fecha_envio', fecha_envio, 'plazo', plazo,
          'desenlace', revision_desenlace, 'nota', revision_nota, 'revisado_at', revisado_at,
          'revisado_por', case when v_jefe then revisado_por_nombre end,
          'a_tiempo', case when revision_desenlace is not null then dia_revisado <= plazo
                           when v_hoy > plazo then false end
        ) order by fecha_envio desc) from bajas), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.reporte_satisfaccion_de(uuid, date, date) is
  'Cuerpo de reporte_satisfaccion() para un usuario explícito (118, 120: cierres sin validación y calificaciones bajas con su revisión). EXECUTE solo project_admin (pruebas sin sesión). Guard: módulo tickets (42501); por técnico, el técnico de cada respuesta y quién revisó, solo rol:jefe.';


-- ============================================================
-- 13) dashboard_resumen_de (108): las encuestas anuladas no están «sin responder»
-- ============================================================
-- Cuerpo = copia EXACTA de la 108 (que es la 103 con sus tres cambios) con un
-- solo cambio marcado «120»: el conteo de encuestas_sin_responder excluye las
-- anuladas. Conserva dueño y ACL (create or replace).

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


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Columnas y CHECK (esperado: 4 filas en tickets y 7 en ticket_satisfaccion):
--    select table_name, column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'tickets' and column_name in ('nota_resolucion', 'motivo_reapertura', 'cerrado_at', 'cerrado_por')) or (table_name = 'ticket_satisfaccion' and column_name in ('resolucion_numero', 'resuelto_at', 'anulada_at', 'revision_desenlace', 'revision_nota', 'revisado_por', 'revisado_at'))) order by 1, 2;
--
-- 2) Los cerrados quedaron como legado (esperado: sin_cierre = 0):
--    select count(*) filter (where cerrado_at is null) as sin_cierre, count(*) filter (where cerrado_por = 'legado') as legado from public.tickets where estado = 'cerrado';
--
-- 3) Whitelist (esperado: 8 filas; resuelto→cerrado 'usuario'; resuelto/cerrado/rechazado→reabierto 'jefe'):
--    select origen, destino, quien from public.transiciones_ticket_permitidas order by 1, 2;
--
-- 4) Funciones (esperado: resolver_ticket, reabrir_ticket, revisar_calificacion_baja authenticated=true; los núcleos, responder_encuesta_ticket y cerrar_resueltos_vencidos authenticated=false; anon=false en todas; cerrar_ticket no existe):
--    select p.oid::regprocedure::text as funcion, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('resolver_ticket', 'resolver_ticket_de', 'reabrir_ticket', 'revisar_calificacion_baja', 'revisar_calificacion_baja_de', 'responder_encuesta_ticket', 'cerrar_resueltos_vencidos', 'cerrar_ticket') order by 1;
--
-- 5) Parámetro (esperado: 24):
--    select valor from public.config_parametros where clave = 'horas_autocierre_resuelto';
--
-- 6) El cierre automático sin nada vencido (esperado: cerrados = 0 justo después de aplicar):
--    select public.cerrar_resueltos_vencidos();
--
-- 7) La vista y el reporte responden (solo cifras, sin nombres):
--    select count(*) as tickets, count(*) filter (where cerrado_sin_validacion) as sin_validacion from public.v_ticket_hechos;
--    select r -> 'cierresSinValidacion' as sin_validacion, r -> 'calificacionesBajas' -> 'total' as bajas, r ->> 'definiciones_version' from public.reporte_satisfaccion_de((select user_id from public.staff where rol = 'JEFE' and activo limit 1), null, null) r;
--
-- 8) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '120';
-- ============================================================
-- FIN DE MIGRACIÓN 120
-- ============================================================
