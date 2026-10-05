-- ============================================================
-- MIGRACIÓN 106 — KEDB: base de errores conocidos (KB ↔ Problemas ↔ Tickets)
-- Depende de: 031 (kb_articulos), 033 (problemas, check_problema_cierre),
--   016 (tickets), 099 (exigir_permiso / puede_actual), 101 (texto_limpio)
-- (la 100 —transiciones de problemas— convive: este archivo no la toca)
--
-- Plan de mejora Ciclo 21, §4 "106 — KEDB: KB ↔ Problemas ↔ Tickets" —
-- docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md. Hoja H3-2.
--
-- ⚠️ NO APLICADA. Escrita y revisada solo en local (npm run test:sql-local).
-- Aplicar es decisión del dueño, DESPUÉS de la 099 y la 101 (la sección 0 se
-- detiene si falta alguna) y leyendo docs/GOTCHAS-CLI.md.
--
-- Hallazgos que cierra:
--   · U-05: el artículo que se crea desde un ticket nacía vacío (solo título y
--     categoría; la solución ni siquiera se copiaba): `guardarComoBorradorKb`
--     (stores/ticketDetalle.js) insertaba desde el cliente un borrador sin
--     síntoma ni solución.
--   · KB-PROBLEMAS: un problema diagnosticado con un workaround conocido no
--     tenía dónde dejarlo para que el resto de TI lo encontrara al atender el
--     siguiente ticket parecido; y nada medía si la KB sirve (cuántas veces un
--     artículo ayudó a resolver un ticket).
--
-- ── Qué crea (una sección por concepto, todas idempotentes) ────────────────
--   1) problemas       workaround (texto, ≤ 5000), error_conocido (bool),
--                      kb_articulo_id (FK al artículo de workaround)
--   2) kb_articulos    tipo (solucion | workaround | procedimiento; los
--                      artículos existentes quedan 'solucion'), problema_id
--                      (FK) y un índice único: UN artículo de workaround vivo
--                      por problema
--   3) ticket_kb_usos  «este artículo se usó para resolver este ticket»;
--                      único por (ticket, artículo); solo se escribe por RPC
--   4) check_problema_cierre (033) ampliado: un problema marcado
--      error_conocido no se cierra (ni queda cerrado) sin workaround o causa
--      raíz
--   5) RPC y núcleos   publicar_workaround_problema, crear_kb_desde_ticket,
--                      registrar_uso_kb_ticket
--   6) v_kpi_kb        usos por artículo (últimos 90 días y total)
--   7) Dueño y permisos
--
-- ------------------------------------------------------------
-- TABLA DE FIRMAS (la fuente para escribir el frontend)
-- Todas las RPC: SECURITY DEFINER, dueño project_admin, search_path = public,
-- EXECUTE solo `authenticated`. Se llaman con argumentos NOMBRADOS
-- (SDK: rpc('nombre', { p_x: ... })). Sin permiso: 42501 'No autorizado'.
-- Rechazos de negocio: P0001 con mensaje en español; «no existe»: P0002.
--
--  RPC                          argumentos (tipo, default)                  retorna              guard
--  publicar_workaround_problema p_problema_id uuid,                         public.kb_articulos  modulo:problemas
--                               p_workaround text default null,                                  y modulo:base_conocimiento
--                               p_titulo text default null,
--                               p_sintoma text default null
--  crear_kb_desde_ticket        p_ticket_id uuid,                           public.kb_articulos  modulo:tickets
--                               p_solucion text default null,                                    y modulo:base_conocimiento
--                               p_titulo text default null,
--                               p_sintoma text default null
--  registrar_uso_kb_ticket      p_ticket_id uuid, p_kb_articulo_id uuid     public.ticket_kb_usos modulo:tickets
--                                                                                                y modulo:base_conocimiento
--
--  Reglas por RPC:
--  - publicar_workaround_problema: crea o actualiza EL artículo de tipo
--    'workaround' vinculado al problema (problema_id) y deja el problema como
--    error conocido (error_conocido = true, workaround = el texto,
--    kb_articulo_id = el artículo). El texto sale de p_workaround o, si no
--    llega, del workaround ya guardado en el problema; si no hay ninguno,
--    P0001. Título y síntoma por defecto: «Workaround: <título del problema>»
--    y la descripción del problema; la categoría, la más frecuente entre los
--    tickets vinculados; ticket_origen_id, el ticket disparador.
--    ESTADO DEL ARTÍCULO (regla de la 031: publicar es del JEFE): lo publica
--    un jefe → 'publicado'; cualquier otro → 'en_revision' (queda pendiente de
--    que un jefe lo publique desde la Base de conocimiento). Un no-jefe que
--    reenvía el MISMO texto sobre un artículo ya publicado no lo despublica;
--    si lo cambia, vuelve a 'en_revision'.
--  - crear_kb_desde_ticket: el ticket debe estar 'resuelto' o 'cerrado' y
--    traer una solución: p_solucion o, si no llega, tickets.nota_resolucion
--    (columna de la 092 de V2: mientras no exista se ignora, sin error) no
--    vacía; si no hay ninguna, P0001. Copia síntoma = descripción del ticket
--    (o p_sintoma), título = título del ticket (o p_titulo), categoría y
--    ticket_origen_id. Nace 'borrador' y tipo 'solucion'. Un ticket tiene a lo
--    sumo un artículo de solución vivo: el segundo intento es P0001.
--  - registrar_uso_kb_ticket: solo artículos 'publicado'. Idempotente: marcar
--    dos veces el mismo par devuelve la fila existente.
--
--  Lectura (SDK directo, RLS): ticket_kb_usos → SELECT con el módulo 'tickets'
--  o 'base_conocimiento'. Escritura de cliente: ninguna (sin INSERT/UPDATE);
--  DELETE físico solo JEFE. v_kpi_kb hereda la RLS de quien consulta.
--
--  Funciones internas (EXECUTE solo project_admin; existen para poder probar la
--  lógica sin sesión en tests/db/triggers.test.sql):
--  publicar_workaround_problema_nucleo (recibe `p_es_jefe` ya resuelto por la
--  RPC pública), crear_kb_desde_ticket_nucleo, registrar_uso_kb_ticket_nucleo.
--
-- ------------------------------------------------------------
-- DECISIONES DE DISEÑO
-- A) `tipo` por defecto 'solucion': conserva el significado de todos los
--    artículos existentes. Un 'workaround' sin problema vinculado es válido a
--    mano (workaround general); lo que NO se permite es más de uno vivo por
--    problema (índice único parcial).
-- B) Dos FK en círculo (problemas.kb_articulo_id ↔ kb_articulos.problema_id),
--    ambas anulables y `on delete set null`: el artículo se crea primero con su
--    problema_id y después el problema apunta a él. Borrar uno no borra el otro.
-- C) El plan escribe `user_id, created_at` en ticket_kb_usos; aquí es
--    `usado_por, created_at` (nombre explícito del actor, consistente con
--    ticket_kb_usos.usado_por en la tabla de firmas del frontend).
-- D) «Error conocido» exige documentación solo al CERRAR (regla del plan):
--    marcarlo en un problema abierto es libre, porque el diagnóstico aún está
--    en curso. El trigger también vigila las columnas que importan para que no
--    se pueda vaciar el workaround de un problema ya cerrado.
-- E) v_kpi_kb es una vista `security_invoker` (PostgreSQL 15, verificado en
--    producción el 2026-10-02: 15.18): quien consulta ve solo los artículos y
--    los usos que su RLS le deja ver.
-- F) crear_kb_desde_ticket NO depende de la 092 de V2: lee nota_resolucion con
--    to_jsonb(ticket), que da NULL si la columna no existe. Hoy la solución
--    llega por p_solucion; cuando V2 aplique la 092, la nota de resolución
--    basta sin cambiar esta función.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea (`Assertion failed ... src\win\async.c`), partir en
-- archivos temporales por sección y aplicarlos uno por uno; el archivo único
-- en migrations/ sigue siendo la fuente de verdad. Correr SIEMPRE el bloque
-- de verificación del final: `db import` puede reportar error habiendo
-- ejecutado parte de los statements. Todo es idempotente: reaplicar el
-- archivo completo tras un fallo parcial es seguro.
--
-- Rollback: migrations/rollback/106_rollback.sql (⚠️ descarta workaround,
-- error_conocido, los vínculos y los registros de uso: leer su cabecera).
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 099 y 101 deben estar aplicadas
-- ============================================================

do $$
begin
  if to_regprocedure('public.exigir_permiso(text)') is null
     or to_regprocedure('public.puede_actual(text)') is null then
    raise exception 'La migración 106 requiere la 099 (exigir_permiso / puede_actual). Aplíquela primero.';
  end if;
  if to_regprocedure('public.texto_limpio(text)') is null then
    raise exception 'La migración 106 requiere la 101 (texto_limpio). Aplíquela primero.';
  end if;
  if to_regclass('public.problemas') is null
     or to_regclass('public.kb_articulos') is null
     or to_regprocedure('public.check_problema_cierre()') is null then
    raise exception 'La migración 106 requiere la 031 (kb_articulos) y la 033 (problemas). Aplíquelas primero.';
  end if;
end $$;


-- ============================================================
-- 1) problemas: workaround, error_conocido y el artículo vinculado
-- ============================================================

alter table public.problemas add column if not exists workaround text;
alter table public.problemas add column if not exists error_conocido boolean not null default false;
alter table public.problemas add column if not exists kb_articulo_id uuid
  references public.kb_articulos(id) on delete set null;

alter table public.problemas drop constraint if exists problemas_workaround_largo;
alter table public.problemas add constraint problemas_workaround_largo
  check (workaround is null or char_length(workaround) <= 5000);

create index if not exists idx_problemas_kb_articulo
  on public.problemas (kb_articulo_id) where kb_articulo_id is not null;

comment on column public.problemas.workaround is
  'Solución provisional documentada mientras se corrige la causa raíz (≤ 5000). Texto plano. Migración 106.';
comment on column public.problemas.error_conocido is
  'true = error conocido (KEDB): hay causa raíz o workaround. Un problema marcado así no se cierra sin workaround o causa raíz (check_problema_cierre). Migración 106.';
comment on column public.problemas.kb_articulo_id is
  'Artículo de la Base de conocimiento (tipo workaround) con el workaround publicado; lo fija publicar_workaround_problema. Migración 106.';


-- ============================================================
-- 2) kb_articulos: tipo y problema de origen
-- ============================================================

alter table public.kb_articulos add column if not exists tipo text not null default 'solucion'
  check (tipo in ('solucion', 'workaround', 'procedimiento'));
alter table public.kb_articulos add column if not exists problema_id uuid
  references public.problemas(id) on delete set null;

create index if not exists idx_kb_articulos_problema
  on public.kb_articulos (problema_id) where problema_id is not null;

-- Un artículo de workaround vivo por problema: publicar_workaround_problema lo
-- actualiza en vez de duplicarlo, y este índice lo garantiza ante una carrera.
create unique index if not exists kb_articulos_workaround_por_problema
  on public.kb_articulos (problema_id)
  where tipo = 'workaround' and problema_id is not null and deleted_at is null;

comment on column public.kb_articulos.tipo is
  'solucion (arreglo definitivo) | workaround (solución provisional de un problema) | procedimiento (paso a paso recurrente). Los artículos anteriores a la 106 quedan en solucion.';
comment on column public.kb_articulos.problema_id is
  'Problema del que sale el artículo (tipo workaround). Lo fija publicar_workaround_problema. Migración 106.';


-- ============================================================
-- 3) ticket_kb_usos: «este artículo se usó para resolver este ticket»
-- Mide el valor de la KB: v_kpi_kb cuenta estos registros. Sin policies de
-- escritura: solo registrar_uso_kb_ticket escribe.
-- ============================================================

create table if not exists public.ticket_kb_usos (
  ticket_id      uuid        not null references public.tickets(id) on delete cascade,
  kb_articulo_id uuid        not null references public.kb_articulos(id) on delete cascade,
  usado_por      uuid        references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (ticket_id, kb_articulo_id)
);

create index if not exists idx_ticket_kb_usos_articulo on public.ticket_kb_usos (kb_articulo_id, created_at desc);
create index if not exists idx_ticket_kb_usos_usado_por on public.ticket_kb_usos (usado_por);

comment on table public.ticket_kb_usos is
  'Un artículo de la KB que se usó para atender un ticket (único por par). Solo se escribe por registrar_uso_kb_ticket; lectura con el módulo tickets o base_conocimiento; DELETE físico solo JEFE. Migración 106.';

alter table public.ticket_kb_usos enable row level security;

drop policy if exists "staff con tickets o conocimiento ve usos de kb" on public.ticket_kb_usos;
create policy "staff con tickets o conocimiento ve usos de kb"
  on public.ticket_kb_usos for select
  using (public.puede_actual('modulo:tickets') or public.puede_actual('modulo:base_conocimiento'));

drop policy if exists "solo jefe elimina usos de kb" on public.ticket_kb_usos;
create policy "solo jefe elimina usos de kb"
  on public.ticket_kb_usos for delete
  using (public.es_jefe());

-- Defensa en profundidad: además de no tener policies de INSERT/UPDATE, los
-- clientes no tienen el privilegio (los de tabla por defecto se revocan).
revoke all on table public.ticket_kb_usos from anon, authenticated;
grant select, delete on table public.ticket_kb_usos to authenticated;


-- ============================================================
-- 4) check_problema_cierre: un error conocido no se cierra sin documentación
-- La regla de la 033 (acciones pendientes) se conserva tal cual; se suma la
-- nueva y el trigger vigila también las columnas que la afectan, para que un
-- problema ya cerrado no pueda quedar «error conocido» con el workaround y la
-- causa raíz vacíos (el texto en blanco, saltos de línea incluidos, cuenta como
-- vacío: usa texto_limpio de la 101).
-- ============================================================

create or replace function public.check_problema_cierre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cerrado' and old.estado is distinct from 'cerrado' then
    if exists (
      select 1 from public.acciones_correctivas
      where problema_id = new.id
        and estado in ('pendiente', 'en_progreso')
        and deleted_at is null
    ) then
      raise exception 'No se puede cerrar el problema: tiene acciones correctivas en pendiente o en_progreso.';
    end if;
  end if;

  -- 106: error conocido ⇒ workaround o causa raíz para poder estar cerrado.
  if new.estado = 'cerrado' and new.error_conocido
     and public.texto_limpio(new.workaround) is null
     and public.texto_limpio(new.causa_raiz) is null then
    raise exception 'No se puede cerrar el problema: es un error conocido y necesita un workaround o una causa raíz documentada.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_problema_cierre on public.problemas;
create trigger trg_check_problema_cierre
  before update of estado, error_conocido, workaround, causa_raiz on public.problemas
  for each row execute function public.check_problema_cierre();


-- ============================================================
-- 5) RPC y núcleos
-- Patrón de la 101/108: cada RPC pública es UN guard (exigir_permiso) + una
-- llamada a su núcleo, que contiene TODA la lógica. Los núcleos tienen
-- EXECUTE solo para project_admin, así el cliente no puede saltarse el guard
-- y tests/db/triggers.test.sql los ejerce sin simular una sesión.
-- ============================================================

-- ------------------------------------------------------------
-- 5.a) publicar_workaround_problema
-- ------------------------------------------------------------
create or replace function public.publicar_workaround_problema_nucleo(
  p_problema_id uuid,
  p_workaround  text    default null,
  p_titulo      text    default null,
  p_sintoma     text    default null,
  p_es_jefe     boolean default false
)
returns public.kb_articulos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prob       public.problemas;
  v_art        public.kb_articulos;
  v_workaround text;
  v_titulo     text := public.texto_limpio(p_titulo);
  v_sintoma    text := public.texto_limpio(p_sintoma);
  v_categoria  text;
  v_estado     text;
begin
  select * into v_prob from public.problemas
   where id = p_problema_id and deleted_at is null
   for update;
  if not found then
    raise exception 'El problema no existe.' using errcode = 'P0002';
  end if;

  -- El workaround conserva sus saltos de línea (son pasos): se recortan los
  -- extremos, no se colapsan los espacios. texto_limpio solo decide si hay texto.
  v_workaround := case
    when public.texto_limpio(p_workaround) is not null then btrim(p_workaround, E' \t\r\n')
    when public.texto_limpio(v_prob.workaround) is not null then btrim(v_prob.workaround, E' \t\r\n')
  end;
  if v_workaround is null then
    raise exception 'Escriba el workaround antes de publicarlo en la base de conocimiento.';
  end if;
  if char_length(v_workaround) > 5000 then
    raise exception 'El workaround no puede superar los 5000 caracteres.';
  end if;
  if v_titulo is not null and char_length(v_titulo) > 200 then
    raise exception 'El título no puede superar los 200 caracteres.';
  end if;
  if v_sintoma is not null and char_length(v_sintoma) > 1000 then
    raise exception 'El síntoma no puede superar los 1000 caracteres.';
  end if;

  -- Categoría: la más frecuente entre los tickets vinculados (el disparador
  -- está entre ellos), para que el artículo salga como sugerencia en tickets
  -- parecidos.
  select t.categoria_id into v_categoria
    from public.problema_tickets pt
    join public.tickets t on t.id = pt.ticket_id
   where pt.problema_id = v_prob.id and t.categoria_id is not null
   group by t.categoria_id
   order by count(*) desc, t.categoria_id
   limit 1;

  select * into v_art from public.kb_articulos
   where problema_id = v_prob.id and tipo = 'workaround' and deleted_at is null
   for update;

  if found then
    -- Actualiza el artículo vigente. Publicar es del jefe (regla de la 031):
    -- un no-jefe que no cambia nada deja el estado como está; si cambia el
    -- contenido, vuelve a revisión.
    if p_es_jefe then
      v_estado := 'publicado';
    elsif v_art.solucion is not distinct from v_workaround and v_titulo is null and v_sintoma is null then
      v_estado := v_art.estado;
    else
      v_estado := 'en_revision';
    end if;

    update public.kb_articulos
       set solucion = v_workaround,
           titulo = coalesce(v_titulo, titulo),
           sintoma = coalesce(v_sintoma, sintoma),
           categoria_id = coalesce(categoria_id, v_categoria),
           estado = v_estado
     where id = v_art.id
     returning * into v_art;
  else
    insert into public.kb_articulos
      (titulo, categoria_id, sintoma, solucion, ticket_origen_id, estado, tipo, problema_id)
    values
      (coalesce(v_titulo, left('Workaround: ' || v_prob.titulo, 200)),
       v_categoria,
       coalesce(v_sintoma, left(btrim(v_prob.descripcion), 1000)),
       v_workaround,
       v_prob.ticket_disparador_id,
       case when p_es_jefe then 'publicado' else 'en_revision' end,
       'workaround',
       v_prob.id)
    returning * into v_art;
  end if;

  update public.problemas
     set workaround = v_workaround, error_conocido = true, kb_articulo_id = v_art.id
   where id = v_prob.id;

  return v_art;
end;
$$;

-- ------------------------------------------------------------
-- 5.b) crear_kb_desde_ticket
-- ------------------------------------------------------------
create or replace function public.crear_kb_desde_ticket_nucleo(
  p_ticket_id uuid,
  p_solucion  text default null,
  p_titulo    text default null,
  p_sintoma   text default null
)
returns public.kb_articulos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket   public.tickets;
  v_solucion text;
  v_titulo   text := public.texto_limpio(p_titulo);
  v_sintoma  text := public.texto_limpio(p_sintoma);
  v_existe   uuid;
  v_art      public.kb_articulos;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found then
    raise exception 'El ticket no existe.' using errcode = 'P0002';
  end if;
  if v_ticket.estado not in ('resuelto', 'cerrado') then
    raise exception 'Solo se puede crear un artículo desde un ticket resuelto o cerrado.';
  end if;

  -- La solución: la que se escribe ahora o la nota de resolución del ticket
  -- (to_jsonb da NULL si la columna aún no existe: decisión F).
  v_solucion := case
    when public.texto_limpio(p_solucion) is not null then btrim(p_solucion, E' \t\r\n')
    when public.texto_limpio(to_jsonb(v_ticket) ->> 'nota_resolucion') is not null
      then btrim(to_jsonb(v_ticket) ->> 'nota_resolucion', E' \t\r\n')
  end;
  if v_solucion is null then
    raise exception 'El ticket no tiene nota de resolución. Escriba la solución para crear el artículo.';
  end if;
  if v_titulo is not null and char_length(v_titulo) > 200 then
    raise exception 'El título no puede superar los 200 caracteres.';
  end if;
  if v_sintoma is not null and char_length(v_sintoma) > 1000 then
    raise exception 'El síntoma no puede superar los 1000 caracteres.';
  end if;

  select id into v_existe from public.kb_articulos
   where ticket_origen_id = p_ticket_id and tipo = 'solucion' and deleted_at is null
   limit 1;
  if found then
    raise exception 'Este ticket ya tiene un artículo en la base de conocimiento. Complételo desde allí.';
  end if;

  insert into public.kb_articulos
    (titulo, categoria_id, sintoma, solucion, ticket_origen_id, estado, tipo)
  values
    (coalesce(v_titulo, v_ticket.titulo),
     v_ticket.categoria_id,
     coalesce(v_sintoma, left(btrim(v_ticket.descripcion), 1000)),
     v_solucion,
     v_ticket.id,
     'borrador',
     'solucion')
  returning * into v_art;

  return v_art;
end;
$$;

-- ------------------------------------------------------------
-- 5.c) registrar_uso_kb_ticket
-- ------------------------------------------------------------
create or replace function public.registrar_uso_kb_ticket_nucleo(
  p_ticket_id      uuid,
  p_kb_articulo_id uuid
)
returns public.ticket_kb_usos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_art public.kb_articulos;
  v_uso public.ticket_kb_usos;
begin
  if not exists (select 1 from public.tickets where id = p_ticket_id) then
    raise exception 'El ticket no existe.' using errcode = 'P0002';
  end if;
  select * into v_art from public.kb_articulos where id = p_kb_articulo_id and deleted_at is null;
  if not found then
    raise exception 'El artículo no existe.' using errcode = 'P0002';
  end if;
  if v_art.estado <> 'publicado' then
    raise exception 'Solo se registra el uso de artículos publicados.';
  end if;

  insert into public.ticket_kb_usos (ticket_id, kb_articulo_id, usado_por)
  values (p_ticket_id, p_kb_articulo_id, auth.uid())
  on conflict (ticket_id, kb_articulo_id) do nothing;

  select * into v_uso from public.ticket_kb_usos
   where ticket_id = p_ticket_id and kb_articulo_id = p_kb_articulo_id;
  return v_uso;
end;
$$;

-- ------------------------------------------------------------
-- RPC públicas (guard + llamada al núcleo)
-- ------------------------------------------------------------
create or replace function public.publicar_workaround_problema(
  p_problema_id uuid,
  p_workaround  text default null,
  p_titulo      text default null,
  p_sintoma     text default null
)
returns public.kb_articulos
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:problemas');
  perform public.exigir_permiso('modulo:base_conocimiento');
  return public.publicar_workaround_problema_nucleo(
    p_problema_id, p_workaround, p_titulo, p_sintoma, public.puede_actual('rol:jefe'));
end;
$$;

create or replace function public.crear_kb_desde_ticket(
  p_ticket_id uuid,
  p_solucion  text default null,
  p_titulo    text default null,
  p_sintoma   text default null
)
returns public.kb_articulos
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  perform public.exigir_permiso('modulo:base_conocimiento');
  return public.crear_kb_desde_ticket_nucleo(p_ticket_id, p_solucion, p_titulo, p_sintoma);
end;
$$;

create or replace function public.registrar_uso_kb_ticket(
  p_ticket_id      uuid,
  p_kb_articulo_id uuid
)
returns public.ticket_kb_usos
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  perform public.exigir_permiso('modulo:base_conocimiento');
  return public.registrar_uso_kb_ticket_nucleo(p_ticket_id, p_kb_articulo_id);
end;
$$;

comment on function public.publicar_workaround_problema(uuid, text, text, text) is
  'Crea o actualiza el artículo de KB tipo workaround del problema y lo deja como error conocido. Lo publica un jefe; otro rol lo deja en revisión. Guard modulo:problemas y modulo:base_conocimiento. 106.';
comment on function public.crear_kb_desde_ticket(uuid, text, text, text) is
  'Crea un borrador de KB desde un ticket resuelto/cerrado con solución (p_solucion o nota_resolucion). Reemplaza el insert de cliente de guardarComoBorradorKb. Guard modulo:tickets y modulo:base_conocimiento. 106.';
comment on function public.registrar_uso_kb_ticket(uuid, uuid) is
  'Registra que un artículo publicado se usó para atender un ticket (idempotente). Alimenta v_kpi_kb. Guard modulo:tickets y modulo:base_conocimiento. 106.';


-- ============================================================
-- 6) v_kpi_kb: cuánto sirve la base de conocimiento
-- Una fila por artículo vivo con sus usos en los últimos 90 días y en total.
-- security_invoker: la RLS de kb_articulos y de ticket_kb_usos aplica a quien
-- consulta (decisión E).
-- ============================================================

create or replace view public.v_kpi_kb
with (security_invoker = true) as
select a.id                                                                  as kb_articulo_id,
       a.titulo,
       a.tipo,
       a.estado,
       a.categoria_id,
       a.util_si,
       a.util_no,
       (count(u.ticket_id) filter (where u.created_at >= now() - interval '90 days'))::integer as usos_90d,
       count(u.ticket_id)::integer                                           as usos_total,
       max(u.created_at)                                                     as ultimo_uso_at
  from public.kb_articulos a
  left join public.ticket_kb_usos u on u.kb_articulo_id = a.id
 where a.deleted_at is null
 group by a.id;

alter view public.v_kpi_kb owner to project_admin;
revoke all on public.v_kpi_kb from public, anon;
grant select on public.v_kpi_kb to authenticated;

comment on view public.v_kpi_kb is
  'Usos de cada artículo de la KB en los últimos 90 días y en total (ticket_kb_usos). security_invoker. Migración 106.';


-- ============================================================
-- 7) Dueño y permisos
-- Todo project_admin; EXECUTE a `authenticated` SOLO en las 3 RPC públicas
-- (nunca en núcleos, nunca a public/anon). check_problema_cierre conserva su
-- dueño y su ACL (create or replace no los toca).
-- ============================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.publicar_workaround_problema_nucleo(uuid, text, text, text, boolean)',
    'public.crear_kb_desde_ticket_nucleo(uuid, text, text, text)',
    'public.registrar_uso_kb_ticket_nucleo(uuid, uuid)',
    'public.publicar_workaround_problema(uuid, text, text, text)',
    'public.crear_kb_desde_ticket(uuid, text, text, text)',
    'public.registrar_uso_kb_ticket(uuid, uuid)'
  ] loop
    execute format('alter function %s owner to project_admin', f);
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to project_admin', f);
  end loop;

  foreach f in array array[
    'public.publicar_workaround_problema(uuid, text, text, text)',
    'public.crear_kb_desde_ticket(uuid, text, text, text)',
    'public.registrar_uso_kb_ticket(uuid, uuid)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Columnas nuevas (esperado: 5 filas; error_conocido y tipo NOT NULL):
--    select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and ((table_name = 'problemas' and column_name in ('workaround','error_conocido','kb_articulo_id')) or (table_name = 'kb_articulos' and column_name in ('tipo','problema_id'))) order by table_name, column_name;
--
-- 2) Los artículos existentes quedaron como solucion (esperado: 0 fuera de solucion):
--    select count(*) as fuera_de_solucion from public.kb_articulos where tipo <> 'solucion';
--
-- 3) Tabla de usos con RLS, los clientes no escriben (esperado: rls=true, ins=false, upd=false, del=true, anon_sel=false):
--    select (select relrowsecurity from pg_class where oid = 'public.ticket_kb_usos'::regclass) as rls, has_table_privilege('authenticated', 'public.ticket_kb_usos', 'insert') as ins, has_table_privilege('authenticated', 'public.ticket_kb_usos', 'update') as upd, has_table_privilege('authenticated', 'public.ticket_kb_usos', 'delete') as del, has_table_privilege('anon', 'public.ticket_kb_usos', 'select') as anon_sel;
--
-- 4) Funciones (esperado: las 3 RPC authenticated=true y anon=false; núcleos authenticated=false y project_admin=true):
--    select p.proname, pg_get_userbyid(p.proowner) as dueno, p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('project_admin', p.oid, 'execute') as project_admin from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('publicar_workaround_problema','publicar_workaround_problema_nucleo','crear_kb_desde_ticket','crear_kb_desde_ticket_nucleo','registrar_uso_kb_ticket','registrar_uso_kb_ticket_nucleo') order by p.proname;
--
-- 5) El trigger de cierre vigila las 4 columnas y la función trae la regla nueva (esperado: true / true):
--    select position('error_conocido' in pg_get_triggerdef(t.oid)) > 0 as vigila_error_conocido from pg_trigger t where t.tgname = 'trg_check_problema_cierre' and not t.tgisinternal;
--    select position('error conocido' in prosrc) > 0 as regla_nueva from pg_proc where pronamespace = 'public'::regnamespace and proname = 'check_problema_cierre';
--
-- 6) La vista es security_invoker y se puede consultar (esperado: reloptions con security_invoker=true; el conteo no falla):
--    select relname, reloptions from pg_class where relname = 'v_kpi_kb' and relnamespace = 'public'::regnamespace;
--    select count(*) as articulos_en_kpi from public.v_kpi_kb;
--
-- 7) Índice único del workaround por problema (esperado: 1 fila):
--    select indexname from pg_indexes where schemaname = 'public' and indexname = 'kb_articulos_workaround_por_problema';
--
-- 8) Tracking: scripts/deploy.mjs registra la fila; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '106';
--
-- 9) Autorización end-to-end (cuando existan las cuentas de P0-04): un
--    ASISTENTE activo SIN el módulo 'problemas' que llame
--    .rpc('publicar_workaround_problema', ...) debe recibir 42501; con
--    'problemas' pero sin 'base_conocimiento', también 42501. Un asistente con
--    ambos crea el artículo en 'en_revision'; un jefe, en 'publicado'.
--
-- ------------------------------------------------------------
-- Después de aplicar (NO forma parte de la migración)
-- ------------------------------------------------------------
-- a) Desplegar el frontend: Problemas (workaround, error conocido y botón de
--    publicar), Base de conocimiento (tipo y enlace al problema) y el store de
--    ticketDetalle (guardarComoBorradorKb ahora llama crear_kb_desde_ticket).
-- b) Regenerar docs/esquema/snapshot.json (npm run snapshot) en el mismo PR.
-- c) Montar TicketKbSugeridos / TicketKbCrear (modules/tickets) en el detalle
--    de ticket de V2 cuando se integre esa rama.
-- d) Sin cambios en edge functions.
-- ============================================================
-- FIN DE MIGRACIÓN 106
-- ============================================================
