-- EQUIPOS-BAJA-SIN-WHITELIST-DB: `equipos.estado` no tiene ninguna
-- protección a nivel de base de datos (a diferencia de `tickets`, que
-- desde la migración 050 tiene una whitelist explícita de transiciones).
-- El único freno contra "dar de baja/perder un equipo con una asignación
-- abierta" vivía duplicado en 2 componentes de UI
-- (EquiposView.vue:298-302, ImportarEquiposView.vue:300-312, este último
-- en realidad un caso distinto ya cubierto por check_asignacion_equipo())
-- sin respaldo de trigger — cualquier UPDATE directo por SDK podía
-- saltarse la regla.
--
-- Versión mínima a propósito, NO una whitelist completa tipo tickets:
-- este trigger replica EXACTAMENTE la regla real de
-- EquiposView.vue:298-302 (`pedirCambiarEstado`), ni más ni menos
-- estricta — confirmado leyendo el condicional real antes de escribir
-- esto, no asumido:
--
--   if (equipo.situacion === 'asignado' && (estado === 'de_baja' || estado === 'perdido'))
--
-- Dos matices de esa regla, ambos replicados tal cual (decisión
-- explícita 2026-08-25, no ampliar el alcance en este cambio):
--   1. `situacion === 'asignado'` solo es posible cuando el `estado`
--      ACTUAL es `'operativo'` (la derivación de `situacion` en
--      `mapEquipo()` cae directo al `estado` físico en cuanto este deja
--      de ser `operativo`) — por eso el trigger solo mira la transición
--      `operativo → de_baja/perdido`, no `en_reparacion → de_baja/perdido`
--      ni ningún salto entre `de_baja`/`perdido`. El caso "asignado a un
--      empleado mientras está en reparación" queda tal como está — es un
--      hallazgo aparte, ya documentado, no parte de este cambio.
--   2. `situacion === 'asignado'` solo cubre asignación a EMPLEADO, no a
--      UBICACIÓN (`situacion` sería `'en_ubicacion'` en ese caso) — el
--      trigger solo mira `asignaciones_equipo.empleado_id`, no
--      `ubicacion_id`.
--
-- Mismo criterio de "asignación abierta" que ya usa
-- check_asignacion_equipo() (fecha_fin is null), mismo estilo de
-- RAISE EXCEPTION que los triggers existentes de equipos.

create or replace function public.check_baja_equipo_con_portador()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.estado = 'operativo' and new.estado in ('de_baja', 'perdido') then
    if exists (
      select 1 from public.asignaciones_equipo
      where equipo_id = new.id
        and empleado_id is not null
        and fecha_fin is null
    ) then
      raise exception 'El equipo % tiene un portador activo. Registra la devolución antes de marcarlo "%".', new.codigo, new.estado;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_baja_equipo_con_portador on public.equipos;
create trigger trg_check_baja_equipo_con_portador
  before update of estado on public.equipos
  for each row
  execute function public.check_baja_equipo_con_portador();
