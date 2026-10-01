-- ============================================================
-- ROLLBACK de la MIGRACIÓN 099 (permisos unificados + cierre de huecos)
-- Usar solo si la 099 causa un problema nuevo e inesperado; NO es parte del
-- flujo normal. Restaura el estado verificado en producción el 2026-10-01
-- (antes de aplicar la 099).
--
-- ⚠️ Reintroduce los huecos que la 099 cerró: empresas editable por cualquier
-- staff activo, kb_registrar_feedback sin gate de módulo, UPDATE de
-- kb_articulos sin staff activo, ticket_token_existe sin validar la forma,
-- categorías/ubicaciones escribibles por cualquier staff, y sin protección
-- del último JEFE con permiso sobre un acceso sensible.
-- ⚠️ Si ya se desplegaron edge functions o migraciones posteriores que llaman
-- a puede()/puede_actual()/exigir_permiso() (p.ej. la 100 usa puede_actual en
-- una policy), revertirlas primero: el DROP FUNCTION de abajo fallaría (o
-- dejaría rotas esas llamadas).
-- ⚠️ CHECK de accesos_log: se vuelve a los 12 valores previos pero como NOT
-- VALID, porque pueden existir filas ya escritas con revelado_fallido,
-- revelado_denegado, purga_ejecutada, portal_abierto o exportacion; esas
-- filas se conservan (no se borra auditoría). Si no existen, se puede
-- validar después con: alter table public.accesos_log validate constraint
-- accesos_log_accion_check;
-- Idempotente.
-- ============================================================

-- 8) accesos_log_accion_check → los 12 valores previos
alter table public.accesos_log drop constraint if exists accesos_log_accion_check;
alter table public.accesos_log add constraint accesos_log_accion_check
  check (accion in (
    'ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta',
    'creado', 'editado', 'eliminado',
    'acceso_denegado',
    'permiso_otorgado', 'permiso_revocado',
    'entrega_fallida'
  )) not valid;

-- 7) trigger del último JEFE con permiso sobre un acceso sensible
drop trigger if exists trg_staff_ultimo_jefe_acceso_sensible on public.staff;
drop function if exists public.check_staff_ultimo_jefe_acceso_sensible();

-- 6) categorias_ticket / ubicaciones → es_staff() en INSERT/UPDATE
drop policy if exists "staff con modulo tickets puede crear categorias de ticket" on public.categorias_ticket;
drop policy if exists "staff puede crear categorias de ticket" on public.categorias_ticket;
create policy "staff puede crear categorias de ticket"
  on public.categorias_ticket for insert
  with check (public.es_staff());

drop policy if exists "staff con modulo tickets puede editar categorias de ticket" on public.categorias_ticket;
drop policy if exists "staff puede editar categorias de ticket" on public.categorias_ticket;
create policy "staff puede editar categorias de ticket"
  on public.categorias_ticket for update
  using (public.es_staff());

drop policy if exists "staff con modulo equipos puede crear ubicaciones" on public.ubicaciones;
drop policy if exists "staff puede crear ubicaciones" on public.ubicaciones;
create policy "staff puede crear ubicaciones"
  on public.ubicaciones for insert
  with check (public.es_staff());

drop policy if exists "staff con modulo equipos puede editar ubicaciones" on public.ubicaciones;
drop policy if exists "staff puede editar ubicaciones" on public.ubicaciones;
create policy "staff puede editar ubicaciones"
  on public.ubicaciones for update
  using (public.es_staff());

-- 5) ticket_token_existe → versión SQL de la 028 (EXECUTE a PUBLIC se conserva)
create or replace function public.ticket_token_existe(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.tickets where token = p_token);
$$;

alter function public.ticket_token_existe(text) owner to project_admin;

-- 4) kb_articulos UPDATE → versión de la 072 (sin es_staff())
drop policy if exists "autor o jefe edita contenido de articulos kb" on public.kb_articulos;
create policy "autor o jefe edita contenido de articulos kb"
  on public.kb_articulos for update
  using (
    public.es_jefe()
    or (
      public.tiene_permiso_modulo('base_conocimiento')
      and created_by = (select auth.uid())
      and estado in ('borrador', 'en_revision')
    )
  )
  with check (
    public.es_jefe()
    or (
      public.tiene_permiso_modulo('base_conocimiento')
      and created_by = (select auth.uid())
      and estado in ('borrador', 'en_revision')
    )
  );

-- 3) kb_registrar_feedback → guard es_staff() de la 032
create or replace function public.kb_registrar_feedback(p_articulo_id uuid, p_util boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_staff() then
    raise exception 'No autorizado';
  end if;

  if p_util then
    update public.kb_articulos
      set util_si = util_si + 1
      where id = p_articulo_id
        and estado in ('publicado', 'obsoleto')
        and deleted_at is null;
  else
    update public.kb_articulos
      set util_no = util_no + 1
      where id = p_articulo_id
        and estado in ('publicado', 'obsoleto')
        and deleted_at is null;
  end if;
end;
$$;

-- 2) empresas INSERT/UPDATE → es_staff()
drop policy if exists "staff con modulo empleados puede crear empresas" on public.empresas;
drop policy if exists "staff puede crear empresas" on public.empresas;
create policy "staff puede crear empresas"
  on public.empresas for insert
  with check (public.es_staff());

drop policy if exists "staff con modulo empleados puede editar empresas" on public.empresas;
drop policy if exists "staff puede editar empresas" on public.empresas;
create policy "staff puede editar empresas"
  on public.empresas for update
  using (public.es_staff());

-- 1) la regla única (al final: las policies que la usaban ya se restauraron)
drop function if exists public.exigir_permiso(text);
drop function if exists public.puede_actual(text);
drop function if exists public.puede(uuid, text);

-- ============================================================
-- FIN DEL ROLLBACK DE LA MIGRACIÓN 099
-- Después: borrar la fila '099' de public.schema_migrations si se registró.
-- ============================================================
