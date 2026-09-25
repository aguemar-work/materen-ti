-- Fecha de resolución del ticket como columna propia (V2, 2026-09-25).
--
-- Pedido del dueño: la tabla de Tickets deja la columna "Edad" ("hace 3 d")
-- y muestra una FECHA: "Recibido 25/09" mientras el ticket sigue vigente y
-- "Resuelto 20/09" cuando ya se resolvió. Hasta acá el único rastro de
-- cuándo se resolvió un ticket era el historial (`ticket_eventos`, evento
-- 'estado_cambiado' con detalle 'De "x" a "resuelto"'): reconstruirlo por
-- fila en el listado paginado sería un embed filtrado por cada ticket.
--
-- La columna la mantiene SOLO este trigger (nunca el cliente):
--   - pasa a resuelto/cerrado desde otro estado → now()
--   - resuelto → cerrado (cerrar_ticket(), migración 051) → conserva la
--     fecha de resolución, no la del cierre
--   - sale de resuelto/cerrado (reabierto, etc.) → null
--   - un UPDATE que no cambia `estado` no puede tocarla (se repone OLD):
--     el staff tiene UPDATE sobre tickets vía RLS y no debe poder fechar a
--     mano una resolución.
-- Rechazado no es "resuelto": queda null (la tabla muestra "Recibido").

alter table public.tickets add column if not exists resuelto_at timestamptz;

comment on column public.tickets.resuelto_at is
  'Cuándo se resolvió (entró a resuelto/cerrado). Solo lo escribe el trigger tickets_resuelto_at (migración 089).';

create or replace function public.tickets_resuelto_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.resuelto_at := case when new.estado in ('resuelto', 'cerrado') then now() else null end;
    return new;
  end if;

  if new.estado is not distinct from old.estado then
    new.resuelto_at := old.resuelto_at;
  elsif new.estado in ('resuelto', 'cerrado') then
    if old.estado in ('resuelto', 'cerrado') then
      new.resuelto_at := coalesce(old.resuelto_at, now());
    else
      new.resuelto_at := now();
    end if;
  else
    new.resuelto_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_resuelto_at on public.tickets;
create trigger tickets_resuelto_at
  before insert or update on public.tickets
  for each row execute function public.tickets_resuelto_at();

-- Relleno de los tickets ya resueltos/cerrados: la última vez que el
-- historial registra la llegada a "resuelto" (misma lectura del detalle que
-- reporte_tickets(), migración 053); si nunca pasó por "resuelto", la
-- llegada a "cerrado"; si el historial no tiene nada, updated_at.
-- El trigger repone OLD cuando el estado no cambia, así que el relleno se
-- hace con el trigger desactivado solo durante este UPDATE.
alter table public.tickets disable trigger tickets_resuelto_at;

update public.tickets t
set resuelto_at = coalesce(r.fecha, t.updated_at)
from (
  select tk.id, ev.fecha
  from public.tickets tk
  left join lateral (
    select e.created_at as fecha
    from public.ticket_eventos e
    where e.ticket_id = tk.id
      and e.evento = 'estado_cambiado'
      and substring(e.detalle from 'a "(\w+)"\s*$') in ('resuelto', 'cerrado')
    order by (substring(e.detalle from 'a "(\w+)"\s*$') = 'resuelto') desc, e.created_at desc
    limit 1
  ) ev on true
  where tk.estado in ('resuelto', 'cerrado')
) r
where t.id = r.id
  and t.resuelto_at is null;

alter table public.tickets enable trigger tickets_resuelto_at;

create index if not exists tickets_resuelto_at_idx on public.tickets (resuelto_at desc) where resuelto_at is not null;
