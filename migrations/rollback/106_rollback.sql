-- ============================================================
-- ROLLBACK de la MIGRACIÓN 106 (KEDB: workaround, error conocido y usos de KB).
-- Usar solo si la 106 causa un problema nuevo e inesperado; NO es parte del
-- flujo normal.
--
-- ⚠️ Orden: revertir ANTES las migraciones posteriores que dependan de esta
-- (hoy ninguna) y revertir este archivo ANTES que la 101 y la 099 (sin CASCADE
-- a propósito: una dependencia olvidada falla con "depends on" en vez de
-- borrar de más).
--
-- ⚠️ Efectos:
--   · SE PIERDEN problemas.workaround, problemas.error_conocido y
--     problemas.kb_articulo_id; kb_articulos.tipo y kb_articulos.problema_id;
--     todos los registros de uso (ticket_kb_usos). Los artículos de tipo
--     workaround NO se borran: quedan como artículos de KB comunes (sin su
--     tipo ni su problema). Si hace falta conservar los datos, exportarlos
--     antes:
--       select id, titulo, workaround, error_conocido, kb_articulo_id from public.problemas where error_conocido or workaround is not null;
--       select id, titulo, tipo, problema_id from public.kb_articulos where tipo <> 'solucion';
--       select * from public.ticket_kb_usos;
--   · check_problema_cierre vuelve a su versión de la 033 (solo bloquea el
--     cierre con acciones correctivas pendientes) y su trigger a
--     «before update of estado».
--   · Con el frontend de Problemas/KB que lee estas columnas ya publicado,
--     volver ANTES a la versión anterior del frontend.
-- Idempotente.
-- ============================================================

-- Vista y funciones primero (la vista depende de kb_articulos.tipo y las
-- funciones devuelven el tipo de fila de ticket_kb_usos).
drop view if exists public.v_kpi_kb;

drop function if exists public.publicar_workaround_problema(uuid, text, text, text);
drop function if exists public.crear_kb_desde_ticket(uuid, text, text, text);
drop function if exists public.registrar_uso_kb_ticket(uuid, uuid);
drop function if exists public.publicar_workaround_problema_nucleo(uuid, text, text, text, boolean);
drop function if exists public.crear_kb_desde_ticket_nucleo(uuid, text, text, text);
drop function if exists public.registrar_uso_kb_ticket_nucleo(uuid, uuid);

drop table if exists public.ticket_kb_usos;

-- check_problema_cierre: copia EXACTA de la 033 y su trigger original.
-- create or replace conserva dueño y ACL.
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
  return new;
end;
$$;

drop trigger if exists trg_check_problema_cierre on public.problemas;
create trigger trg_check_problema_cierre
  before update of estado on public.problemas
  for each row execute function public.check_problema_cierre();

-- Columnas (sus índices, FK y CHECK caen con ellas).
drop index if exists public.kb_articulos_workaround_por_problema;
drop index if exists public.idx_kb_articulos_problema;
drop index if exists public.idx_problemas_kb_articulo;

alter table public.problemas drop constraint if exists problemas_workaround_largo;
alter table public.problemas drop column if exists kb_articulo_id;
alter table public.problemas drop column if exists error_conocido;
alter table public.problemas drop column if exists workaround;

alter table public.kb_articulos drop column if exists problema_id;
alter table public.kb_articulos drop column if exists tipo;
