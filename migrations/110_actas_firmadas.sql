-- ============================================================
-- MIGRACIÓN 110 — Actas firmadas en físico: tabla `actas`, función de
-- registro atómico, evento en la hoja de vida y vista de pendientes
-- Depende de: 013 (equipos, asignaciones_equipo, eventos_equipo), 099
--   (puede_actual), 101 (AMPLÍA el CHECK de eventos_equipo.evento con
--   `acta_adjuntada`; sin ella el trigger de esta migración fallaría: la
--   sección 0 lo comprueba y se detiene), 103 (config_parametros,
--   parametro_entero, dashboard_resumen — que ya consulta v_actas_pendientes)
--
-- Plan de mejora Ciclo 21, §3.7 "Actas firmadas en físico" y §4 "110 —
-- Adjuntos privados" (docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md). Las actas
-- de entrega y devolución se firman en papel: se imprime, se firma, se
-- escanea (o se fotografía y el navegador lo convierte a PDF) y el PDF firmado
-- se sube al expediente, enlazado a la asignación que lo originó. Es un
-- documento legal: contiene nombre, DNI y firma → bucket PRIVADO.
--
-- ⚠️ NO APLICADA. Escrita y revisada solo en local (parseada con libpg-query).
--
-- ⚠️ PASOS MANUALES QUE EL SQL NO PUEDE HACER (el dueño o el orquestador,
-- ANTES de desplegar la edge function `equipos-fotos` con subirActa/urlActa):
--   1. Crear el bucket PRIVADO `actas-firmadas`:
--        npx @insforge/cli storage create-bucket actas-firmadas --private
--      (o desde el panel de InsForge → Storage, con "Public" apagado).
--      Verificar:  npx @insforge/cli storage buckets   → actas-firmadas con
--      public=false. NUNCA público.
--   2. Desplegar la function:
--        npx @insforge/cli functions deploy equipos-fotos --file functions/equipos-fotos.ts
--      y registrar el despliegue (scripts/deploy.mjs).
--   Orden: 099 → 101 → 103 → 110 → bucket → deploy de la function → frontend.
--   Una function desplegada ANTES del bucket o de la tabla responde
--   error_subiendo / error_interno, sin dejar nada a medias.
--
-- ── TABLA DE FIRMAS ────────────────────────────────────────────────────────
--
--   TABLA  public.actas
--     (id uuid pk default gen_random_uuid(),
--      asignacion_equipo_id uuid not null → asignaciones_equipo(id),
--      tipo text not null check in ('entrega','devolucion'),
--      empleado_id uuid → empleados(id),
--      equipo_id uuid not null → equipos(id),
--      pdf_key text not null,            -- key en el bucket privado; NUNCA al cliente
--      tamano_bytes integer not null,    -- 1 .. 10 485 760
--      sha256 text not null,             -- hex minúsculas de 64 caracteres
--      firmado_at date,                  -- fecha escrita en el acta (opcional)
--      subido_por uuid → auth.users(id) on delete set null,
--      created_at timestamptz not null default now(),
--      deleted_at timestamptz)           -- softdelete: reemplazo lógico
--     Índice ÚNICO PARCIAL (asignacion_equipo_id, tipo) where deleted_at is null:
--     una sola acta vigente por asignación y tipo. Índices de las FK.
--     RLS: SELECT y UPDATE con puede_actual('modulo:equipos'); DELETE es_jefe();
--     SIN policy de INSERT (solo registrar_acta, vía la edge function). Del
--     UPDATE de cliente solo queda la columna `deleted_at` (privilegio de
--     columna) y un trigger rechaza cambiar cualquier otra, también para
--     project_admin: un acta firmada no se edita, se reemplaza.
--     Las FK son NO ACTION a propósito: no se puede borrar físicamente una
--     asignación, un equipo ni un empleado que tenga acta (documento legal).
--
--   TRIGGER actas_inmutables (BEFORE UPDATE) → rechaza cambiar columnas distintas
--     de deleted_at.
--   TRIGGER evento_acta_adjuntada (AFTER INSERT, SECURITY DEFINER) → escribe
--     en eventos_equipo el evento 'acta_adjuntada' con user_id = subido_por
--     (no usa log_evento_equipo: ahí auth.uid() es NULL, la function sube con
--     el cliente admin). No usa set_created_by_only: esa función asume la
--     columna created_by; acá la edge function escribe `subido_por`.
--
--   FUNCIÓN public.registrar_acta(p_asignacion_id uuid, p_tipo text,
--       p_pdf_key text, p_tamano_bytes integer, p_sha256 text,
--       p_firmado_at date default null, p_subido_por uuid default null)
--       returns public.actas
--     SECURITY DEFINER. EXECUTE SOLO project_admin (la llama la edge function
--     con el cliente admin, después de validar sesión, módulo y PDF). En UNA
--     transacción: bloquea la asignación (FOR UPDATE), valida el tipo
--     (entrega: asignación a una persona; devolucion: a una persona y con
--     fecha_fin), marca deleted_at de la acta vigente (si hay) y inserta la
--     nueva, derivando empleado_id y equipo_id de la asignación (nunca del
--     cliente). Errores: P0002 asignación inexistente; 22023 tipo/asignación
--     no válidos o fecha futura.
--
--   VISTA public.v_actas_pendientes  (security_invoker = true)
--     (asignacion_id, equipo_id, equipo_codigo, equipo_descripcion,
--      empleado_id, empleado, fecha_inicio, dias, activa)
--     Asignaciones de equipo A PERSONAS sin acta de ENTREGA vigente, con
--     fecha_inicio <= hoy - dias_acta_sin_adjuntar (días CORRIDOS: no existe
--     minutos_laborables_entre hasta la 105) y fecha_inicio >=
--     actas_pendientes_desde. `activa` = el equipo sigue en manos de la
--     persona (dashboard_resumen solo lista las activas).
--
--   PARÁMETRO config_parametros.actas_pendientes_desde (string AAAA-MM-DD,
--     sembrado con la fecha de aplicación en hora de Lima): sin él, las ~139
--     asignaciones activas a personas que hoy no tienen acta inundarían el
--     Inicio. Para auditar entregas anteriores, el JEFE lo retrocede.
--
--   dashboard_resumen() NO se redefine acá: la 103 ya trae la sección
--   `actas_pendientes` consultando v_actas_pendientes de forma tolerante
--   (undefined_table → null). Reaplicar la 103 después de la 110 no la quita.
--
--   Fuera de esta migración (otras entregas): edge function equipos-fotos
--   (subirActa, urlActa) y el evento `acta_adjuntada` en empleado_eventos
--   (102: su CHECK de eventos no lo lista todavía).
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/apply-migration.mjs` o `db import`, NUNCA `db query` a mano; si
-- `db import` crashea, partir en archivos temporales por sección. Correr
-- SIEMPRE el bloque de "Verificación" del final. Todo es idempotente.
-- Rollback: migrations/rollback/110_rollback.sql (el bucket y sus objetos NO
-- se tocan: se borran a mano).
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 099, 101 y 103 aplicadas
-- ============================================================

do $$
begin
  if to_regprocedure('public.puede_actual(text)') is null then
    raise exception 'La migración 110 requiere la 099 (puede_actual). Aplíquela primero.';
  end if;
  if to_regclass('public.config_parametros') is null
     or to_regprocedure('public.parametro_entero(text,integer,text)') is null then
    raise exception 'La migración 110 requiere la 103 (config_parametros, parametro_entero). Aplíquela primero.';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.eventos_equipo'::regclass
       and conname = 'eventos_equipo_evento_check'
       and pg_get_constraintdef(oid) like '%acta_adjuntada%'
  ) then
    raise exception 'La migración 110 requiere que la 101 haya ampliado eventos_equipo_evento_check con acta_adjuntada. Aplique la 101 primero.';
  end if;
end $$;


-- ============================================================
-- 1) Tabla actas
-- ============================================================

create table if not exists public.actas (
  id                   uuid        primary key default gen_random_uuid(),
  asignacion_equipo_id uuid        not null references public.asignaciones_equipo(id),
  tipo                 text        not null check (tipo in ('entrega', 'devolucion')),
  empleado_id          uuid        references public.empleados(id),
  equipo_id            uuid        not null references public.equipos(id),
  pdf_key              text        not null,
  tamano_bytes         integer     not null,
  sha256               text        not null,
  firmado_at           date,
  subido_por           uuid        references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint actas_tamano_check check (tamano_bytes between 1 and 10485760),
  constraint actas_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint actas_pdf_key_check check (pdf_key like 'actas/%.pdf')
);

alter table public.actas owner to project_admin;

comment on table public.actas is
  'Actas de entrega/devolución de equipos firmadas en físico, escaneadas a PDF. El PDF vive en el bucket PRIVADO actas-firmadas (pdf_key); solo se accede con URL firmada de corta duración. Una vigente por (asignación, tipo); reemplazo lógico por deleted_at. Solo registrar_acta inserta. Migración 110.';
comment on column public.actas.pdf_key is
  'Key en el bucket privado actas-firmadas: actas/<empleado_id>/<asignacion_id>-<tipo>.pdf (reemplazos: sufijo -2, -3...). Nunca se envía al cliente.';
comment on column public.actas.sha256 is
  'SHA-256 (hex) del PDF subido: permite demostrar que el archivo no cambió.';
comment on column public.actas.firmado_at is
  'Fecha escrita en el acta (opcional); la fecha de subida es created_at.';

-- Una sola acta vigente por asignación y tipo
create unique index if not exists uq_actas_vigente_por_asignacion_tipo
  on public.actas (asignacion_equipo_id, tipo)
  where deleted_at is null;

-- Índices de las FK (el parcial de arriba no cubre las filas eliminadas)
create index if not exists idx_actas_asignacion on public.actas (asignacion_equipo_id);
create index if not exists idx_actas_empleado   on public.actas (empleado_id);
create index if not exists idx_actas_equipo     on public.actas (equipo_id);
create index if not exists idx_actas_subido_por on public.actas (subido_por);

alter table public.actas enable row level security;

drop policy if exists "staff con modulo equipos puede ver actas" on public.actas;
create policy "staff con modulo equipos puede ver actas"
  on public.actas for select
  using (public.puede_actual('modulo:equipos'));

-- UPDATE = softdelete (deleted_at). El resto de columnas queda bloqueado por
-- el privilegio de columna y por el trigger actas_inmutables.
drop policy if exists "staff con modulo equipos puede reemplazar actas" on public.actas;
create policy "staff con modulo equipos puede reemplazar actas"
  on public.actas for update
  using (public.puede_actual('modulo:equipos'))
  with check (public.puede_actual('modulo:equipos'));

drop policy if exists "solo jefe puede eliminar actas" on public.actas;
create policy "solo jefe puede eliminar actas"
  on public.actas for delete
  using (public.es_jefe());

-- Sin policy de INSERT: solo registrar_acta (project_admin, bypassa RLS).
revoke all on table public.actas from public, anon, authenticated;
grant select, delete on table public.actas to authenticated;
grant update (deleted_at) on table public.actas to authenticated;


-- ============================================================
-- 2) Inmutabilidad: de un acta solo cambia deleted_at
-- ============================================================

create or replace function public.actas_inmutables()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.asignacion_equipo_id is distinct from old.asignacion_equipo_id
     or new.tipo is distinct from old.tipo
     or new.empleado_id is distinct from old.empleado_id
     or new.equipo_id is distinct from old.equipo_id
     or new.pdf_key is distinct from old.pdf_key
     or new.tamano_bytes is distinct from old.tamano_bytes
     or new.sha256 is distinct from old.sha256
     or new.firmado_at is distinct from old.firmado_at
     or new.subido_por is distinct from old.subido_por
     or new.created_at is distinct from old.created_at then
    raise exception 'Un acta firmada no se puede modificar: solo se puede reemplazar por una nueva.';
  end if;
  return new;
end;
$$;

alter function public.actas_inmutables() owner to project_admin;
revoke all on function public.actas_inmutables() from public, anon, authenticated;

drop trigger if exists trg_actas_inmutables on public.actas;
create trigger trg_actas_inmutables
  before update on public.actas
  for each row execute function public.actas_inmutables();


-- ============================================================
-- 3) Evento acta_adjuntada en la hoja de vida del equipo
-- ============================================================

create or replace function public.evento_acta_adjuntada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = new.subido_por;

  insert into public.eventos_equipo (equipo_id, evento, detalle, user_id, user_email)
  values (
    new.equipo_id,
    'acta_adjuntada',
    'Acta de ' || case new.tipo when 'entrega' then 'entrega' else 'devolución' end
      || ' firmada adjuntada'
      || coalesce(' (firmada el ' || to_char(new.firmado_at, 'DD/MM/YYYY') || ')', ''),
    new.subido_por,
    v_email
  );
  return new;
end;
$$;

alter function public.evento_acta_adjuntada() owner to project_admin;
revoke all on function public.evento_acta_adjuntada() from public, anon, authenticated;

drop trigger if exists trg_evento_acta_adjuntada on public.actas;
create trigger trg_evento_acta_adjuntada
  after insert on public.actas
  for each row execute function public.evento_acta_adjuntada();


-- ============================================================
-- 4) registrar_acta: reemplazo lógico + alta en una transacción
-- ============================================================

create or replace function public.registrar_acta(
  p_asignacion_id uuid,
  p_tipo          text,
  p_pdf_key       text,
  p_tamano_bytes  integer,
  p_sha256        text,
  p_firmado_at    date default null,
  p_subido_por    uuid default null
)
returns public.actas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asig public.asignaciones_equipo;
  v_acta public.actas;
begin
  if p_tipo is null or p_tipo not in ('entrega', 'devolucion') then
    raise exception 'El tipo de acta debe ser entrega o devolucion.' using errcode = '22023';
  end if;

  if p_firmado_at is not null and p_firmado_at > (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha de firma no puede ser futura.' using errcode = '22023';
  end if;

  -- Bloquea la asignación: dos subidas simultáneas del mismo acta se serializan
  select * into v_asig
    from public.asignaciones_equipo
   where id = p_asignacion_id
     for update;

  if not found then
    raise exception 'La asignación no existe.' using errcode = 'P0002';
  end if;

  if v_asig.empleado_id is null then
    raise exception 'La asignación no es a una persona: no lleva acta firmada.' using errcode = '22023';
  end if;

  if p_tipo = 'devolucion' and v_asig.fecha_fin is null then
    raise exception 'La asignación sigue vigente: todavía no hay acta de devolución.' using errcode = '22023';
  end if;

  -- 1.º se retira la vigente (reemplazo lógico), 2.º se crea la nueva: el
  -- índice único parcial no admite dos vigentes a la vez.
  update public.actas
     set deleted_at = now()
   where asignacion_equipo_id = p_asignacion_id
     and tipo = p_tipo
     and deleted_at is null;

  insert into public.actas (
    asignacion_equipo_id, tipo, empleado_id, equipo_id,
    pdf_key, tamano_bytes, sha256, firmado_at, subido_por
  ) values (
    p_asignacion_id, p_tipo, v_asig.empleado_id, v_asig.equipo_id,
    p_pdf_key, p_tamano_bytes, p_sha256, p_firmado_at, p_subido_por
  )
  returning * into v_acta;

  return v_acta;
end;
$$;

alter function public.registrar_acta(uuid, text, text, integer, text, date, uuid) owner to project_admin;
revoke all on function public.registrar_acta(uuid, text, text, integer, text, date, uuid) from public, anon, authenticated;
grant execute on function public.registrar_acta(uuid, text, text, integer, text, date, uuid) to project_admin;

comment on function public.registrar_acta(uuid, text, text, integer, text, date, uuid) is
  'Registra el acta firmada de una asignación (110): retira la vigente y crea la nueva en una transacción. EXECUTE solo project_admin (edge function equipos-fotos).';


-- ============================================================
-- 5) Parámetro de corte y vista v_actas_pendientes
-- ============================================================

-- Fecha de corte: solo cuentan las entregas desde ese día (hora de Lima de la
-- aplicación). Retrocederla permite auditar entregas anteriores. Es una clave
-- "*_desde": la 103 valida que sea una fecha AAAA-MM-DD.
insert into public.config_parametros (clave, valor, descripcion) values
  ('actas_pendientes_desde',
   to_jsonb(((now() at time zone 'America/Lima')::date)::text),
   'Fecha AAAA-MM-DD desde la que el Inicio avisa de entregas de equipos sin acta firmada. Retroceda la fecha para auditar entregas anteriores.')
on conflict (clave) do nothing;

create or replace view public.v_actas_pendientes
with (security_invoker = true) as
select
  a.id                                                   as asignacion_id,
  a.equipo_id,
  q.codigo                                               as equipo_codigo,
  btrim(coalesce(t.nombre, '') || ' ' || coalesce(q.marca, '') || ' ' || coalesce(q.modelo, '')) as equipo_descripcion,
  a.empleado_id,
  btrim(e.nombres || ' ' || e.apellidos)                 as empleado,
  a.fecha_inicio,
  ((now() at time zone 'America/Lima')::date - a.fecha_inicio)::integer as dias,
  (a.fecha_fin is null)                                  as activa
from public.asignaciones_equipo a
join public.equipos q on q.id = a.equipo_id and q.deleted_at is null
join public.empleados e on e.id = a.empleado_id
left join public.tipos_equipo t on t.id = q.tipo_id
where a.empleado_id is not null
  and a.fecha_inicio <= (now() at time zone 'America/Lima')::date
        - public.parametro_entero('dias_acta_sin_adjuntar', 3)
  and a.fecha_inicio >= coalesce((
        select case when c.valor #>> '{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    then (c.valor #>> '{}')::date end
          from public.config_parametros c
         where c.clave = 'actas_pendientes_desde'
      ), date '1900-01-01')
  and not exists (
        select 1 from public.actas ac
         where ac.asignacion_equipo_id = a.id
           and ac.tipo = 'entrega'
           and ac.deleted_at is null
      );

alter view public.v_actas_pendientes owner to project_admin;
revoke all on public.v_actas_pendientes from public, anon;
grant select on public.v_actas_pendientes to authenticated;

comment on view public.v_actas_pendientes is
  'Entregas de equipos a personas sin acta de entrega firmada adjunta, con más de dias_acta_sin_adjuntar días (corridos) y desde actas_pendientes_desde. security_invoker. Migración 110.';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tabla, RLS y policies (esperado: relrowsecurity=true; policies de
--    select, update y delete, ninguna de insert):
--    select relrowsecurity from pg_class where oid = 'public.actas'::regclass;
--    select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'actas' order by cmd;
--
-- 2) Privilegios (esperado: select=true, insert=false, update de deleted_at=true, de pdf_key=false):
--    select has_table_privilege('authenticated', 'public.actas', 'select') as sel, has_table_privilege('authenticated', 'public.actas', 'insert') as ins, has_column_privilege('authenticated', 'public.actas', 'deleted_at', 'update') as upd_deleted, has_column_privilege('authenticated', 'public.actas', 'pdf_key', 'update') as upd_key;
--
-- 3) Índice único parcial y triggers:
--    select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'actas' order by 1;
--    select tgname from pg_trigger where tgrelid = 'public.actas'::regclass and not tgisinternal order by 1;
--
-- 4) registrar_acta solo para project_admin (esperado: authenticated=false, anon=false, project_admin=true):
--    select has_function_privilege('authenticated', 'public.registrar_acta(uuid,text,text,integer,text,date,uuid)', 'execute') as authenticated, has_function_privilege('anon', 'public.registrar_acta(uuid,text,text,integer,text,date,uuid)', 'execute') as anon, has_function_privilege('project_admin', 'public.registrar_acta(uuid,text,text,integer,text,date,uuid)', 'execute') as project_admin;
--
-- 5) Vista y parámetro de corte (la vista debe responder; 0 filas al principio):
--    select count(*) from public.v_actas_pendientes;
--    select clave, valor from public.config_parametros where clave = 'actas_pendientes_desde';
--
-- 6) Bucket PRIVADO (paso manual): npx @insforge/cli storage buckets
--    → actas-firmadas con public=false.
--
-- 7) Tracking: scripts/apply-migration.mjs registra la fila solo; si se aplicó
--    a mano con `db import`, registrarla y verificar:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '110';
-- ============================================================
-- FIN DE MIGRACIÓN 110
-- ============================================================
