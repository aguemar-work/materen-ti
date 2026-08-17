-- ============================================================
-- MIGRACIÓN 061 — Nombres de staff visibles para cualquier staff activo
--                  + edición del propio nombre para mostrar
-- Depende de: 003 (staff, es_jefe(), es_staff())
--
-- CONTEXTO (bug, confirmado en producción): la policy de SELECT de staff
-- (migración 003) es "propio registro o jefe". Un ASISTENTE no puede leer
-- las filas de sus compañeros, así que cualquier UI que arma un mapa
-- user_id -> nombre a partir de listStaff() (reporte de tickets, bandeja
-- de tickets, "Asignado a", Problemas/responsable, acciones correctivas,
-- reporte de satisfacción, autor de artículo de KB) cae al fallback
-- "Staff" para todo el que no sea el usuario logueado ni JEFE. El reporte
-- de tickets se envía a gerencia: hoy un ASISTENTE lo genera y manda
-- incompleto sin ninguna señal de que falta algo.
--
-- FIX: función SECURITY DEFINER angosta en vez de ampliar la policy de
-- SELECT (mismo patrón/justificación que kb_registrar_feedback, migración
-- 032) — el resto de la fila (rol, activo, trazabilidad) no tiene por qué
-- ser legible para todo el staff, solo id+nombre de quien sigue activo.
--
-- FEATURE (edición mínima de nombre): hoy solo JEFE puede hacer UPDATE de
-- staff. Se extiende para que cualquier staff edite su PROPIO nombre —
-- nada más (sin foto, sin campos nuevos). La policy por sí sola no puede
-- impedir que ese mismo UPDATE incluya rol/activo (RLS no compara contra
-- el valor anterior de otras columnas) — es exactamente el hueco que
-- H-06 dejó documentado como pendiente fuera de tickets (ver
-- docs/HISTORIAL-AUDITORIAS.md). Se blinda con el mismo patrón ya
-- auditado que usa la migración 019 para H-06 en tickets: un trigger
-- BEFORE UPDATE que congela rol/activo cuando quien edita no es JEFE.
-- ============================================================


-- ============================================================
-- FUNCIÓN: id + nombre de staff activo (angosta, ver kb_registrar_feedback)
-- ============================================================

create or replace function public.staff_nombres()
returns table (user_id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_staff() then
    raise exception 'No autorizado';
  end if;

  return query
    select s.user_id, s.nombre
    from public.staff s
    where s.activo = true;
end;
$$;

comment on function public.staff_nombres() is
  'Devuelve (user_id, nombre) de todo el staff activo, para resolver nombres a mostrar (reporte de tickets, "Asignado a", Responsable, autor de KB, etc.) sin exponer rol/activo/trazabilidad de compañeros. SECURITY DEFINER angosto, mismo patrón que kb_registrar_feedback (migración 032) — evita ampliar la policy de SELECT de staff.';

-- Dueño explícito (mismo motivo que kb_registrar_feedback/ticket_token_existe,
-- migraciones 032/028): un CREATE OR REPLACE posterior con el rol normal del
-- proyecto fallaría si esta función se llegó a crear con otro rol.
alter function public.staff_nombres() owner to project_admin;


-- ============================================================
-- RLS: staff puede editar su propio nombre (columna nombre, nada más)
-- ============================================================

drop policy if exists "solo jefe puede editar staff" on public.staff;
create policy "jefe edita cualquiera, staff edita su propio registro"
  on public.staff for update
  using (user_id = auth.uid() or es_jefe())
  with check (user_id = auth.uid() or es_jefe());

-- El WITH CHECK de arriba solo controla QUÉ FILA puede tocarse (la propia o,
-- si es jefe, cualquiera) — no qué columnas: RLS no compara contra el valor
-- anterior de otras columnas dentro de with_check. Se congelan rol/activo
-- con un trigger cuando quien edita NO es jefe, mismo patrón que
-- check_ticket_identidad_inmutable (migración 019, fix de H-06 en tickets).
create or replace function public.check_staff_autoedicion_solo_nombre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_jefe() then
    if new.rol is distinct from old.rol then
      raise exception 'Solo el jefe puede cambiar el rol.';
    end if;
    if new.activo is distinct from old.activo then
      raise exception 'Solo el jefe puede activar/desactivar staff.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_staff_autoedicion_solo_nombre on public.staff;
create trigger trg_staff_autoedicion_solo_nombre
  before update on public.staff
  for each row execute function public.check_staff_autoedicion_solo_nombre();

-- ============================================================
-- FIN DE MIGRACIÓN 061
-- ============================================================
