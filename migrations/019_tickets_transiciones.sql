-- ============================================================
-- MIGRACIÓN 019 — Integridad de transiciones de ticket
-- Depende de: 016, 017
-- Auditoría de seguridad (2026-07-07), hallazgos H-01/H-12 y H-06 (parcial).
--
-- Contexto:
--   El invariante "solo el JEFE reabre" (check_reabrir_solo_jefe, mig. 017)
--   solo vigila la transición al estado literal 'reabierto'. Un ASISTENTE
--   podía resucitar un ticket terminal moviéndolo de 'cerrado'/'rechazado'
--   directamente a 'abierto'/'en_progreso' (UPDATE = es_staff, sin máquina
--   de estados) y, ya no cerrado, agregarle comentarios.
--
--   Fix quirúrgico: prohibir SALIR de un estado terminal salvo hacia
--   'reabierto'. Como 'reabierto' ya exige es_jefe(), la única forma de
--   sacar un ticket de 'cerrado'/'rechazado' es que un JEFE lo reabra.
--   No se restringen las transiciones no terminales que usa la UI
--   (abierto->en_progreso, ->rechazado, ->resuelto, resuelto->cerrado),
--   así que ningún flujo legítimo se rompe.
-- ============================================================

-- ------------------------------------------------------------
-- Salida de estados terminales solo vía 'reabierto' (H-01/H-12)
-- ------------------------------------------------------------
create or replace function public.check_transicion_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado is distinct from new.estado
     and old.estado in ('cerrado', 'rechazado')
     and new.estado <> 'reabierto' then
    raise exception
      'Un ticket % solo puede salir de ese estado si el jefe lo reabre.', old.estado;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_transicion_ticket on public.tickets;
create trigger trg_check_transicion_ticket
  before update on public.tickets
  for each row execute function public.check_transicion_ticket();

-- ------------------------------------------------------------
-- Columnas de identidad/procedencia inmutables tras crear (H-06)
-- ------------------------------------------------------------
-- La creación es exclusiva de la edge function (tickets no tiene INSERT de
-- cliente). Ningún flujo de la UI edita estas columnas; congelarlas evita
-- que un UPDATE de staff (RLS es_staff, sin control por columna) manipule la
-- identidad del ticket (token/codigo) o falsee su procedencia (origen,
-- creado_por). Lo que la UI sí edita (estado, prioridad, nivel_atencion,
-- asignado_a, flags de conocimiento) queda libre.
create or replace function public.check_ticket_identidad_inmutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.token is distinct from old.token then
    raise exception 'El token del ticket es inmutable.';
  end if;
  if new.codigo is distinct from old.codigo then
    raise exception 'El código del ticket es inmutable.';
  end if;
  if new.origen is distinct from old.origen then
    raise exception 'El origen del ticket es inmutable.';
  end if;
  if new.creado_por is distinct from old.creado_por then
    raise exception 'El autor de creación del ticket es inmutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ticket_identidad_inmutable on public.tickets;
create trigger trg_ticket_identidad_inmutable
  before update on public.tickets
  for each row execute function public.check_ticket_identidad_inmutable();

-- ============================================================
-- FIN DE MIGRACIÓN 019
-- ============================================================
