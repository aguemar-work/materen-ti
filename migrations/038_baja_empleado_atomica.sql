-- ============================================================
-- MIGRACIÓN 038 — Baja de empleado atómica (RPC)
-- Depende de: 002 (empleados/cuentas), 004 (asignaciones_cuenta),
--             011 (asignaciones_licencia), 003 (es_staff())
--
-- Contexto (auditoría integral, 2026-08-05, hallazgo A-01): la baja de un
-- empleado (empleadosApi.bajaEmpleado(), frontend/src/api/domains/empleados.js)
-- hacía 4 escrituras SECUENCIALES desde el navegador sin transacción: cerrar
-- asignaciones_cuenta → cerrar asignaciones_licencia → soft-delete de cuentas
-- personales → estado='Inactivo'. Si la 3ª fallaba (red, RLS, pestaña
-- cerrada), el empleado quedaba con asignaciones cerradas pero ACTIVO y con
-- cuentas personales vivas — un estado inconsistente sin ningún registro de
-- que la operación quedó a medias. Esta función hace las 4 escrituras en una
-- sola transacción de servidor: o se aplican todas, o ninguna.
--
-- Mismo patrón que kb_registrar_feedback (migración 032): SECURITY DEFINER
-- angosta, exige es_staff(), invocada por RPC (.rpc('dar_baja_empleado', ...))
-- en vez de UPDATE/DELETE directos desde el cliente para esta operación.
--
-- Fecha de cierre: NUNCA current_date/now()::date del servidor — el servidor
-- corre en GMT y sufriría el mismo corte que T-01 (auditoría integral)
-- pasadas las 19:00 hora Perú. Se usa (now() at time zone 'America/Lima')::date,
-- mismo criterio que core/formatters.js:fechaLocalISO() en el cliente.
--
-- Nota operativa (verificado 2026-08-05): `db query` no soporta cuerpos de
-- función con dollar-quoting ($$...$$) — falla con {"error":"no language
-- specified"} incluso en un caso trivial de una sola línea, en Windows y
-- también reproducido igual vía PowerShell (no es un problema de shell).
-- Aplicar esta migración con `db import` (ver README/AGENTS.md), NO con
-- `scripts/apply-migration.mjs` (usa `db query` internamente). `db import`
-- puede reportar un crash de cliente (`Assertion failed ... src\win\async.c`)
-- aun cuando el statement se ejecutó bien en el servidor — verificar siempre
-- después con una consulta de lectura, mismo criterio que el resto de gotchas
-- de CLI ya documentadas.
-- ============================================================

create or replace function public.dar_baja_empleado(p_empleado_id uuid)
returns public.empleados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date;
  v_empleado public.empleados;
  v_cuentas_personales uuid[];
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado';
  end if;

  v_hoy := (now() at time zone 'America/Lima')::date;

  -- Cuentas personales activas de este empleado (antes de cerrar la
  -- asignación): son las que se dan de baja junto con él. Reutilizables/
  -- compartidas NO se tocan acá — quedan libres y "por rotar" vía el
  -- trigger marcar_rotacion_pendiente() al cerrarse su asignación.
  select array_agg(c.id) into v_cuentas_personales
    from public.asignaciones_cuenta a
    join public.cuentas c on c.id = a.cuenta_id
   where a.empleado_id = p_empleado_id
     and a.fecha_fin is null
     and c.tipo_cuenta = 'personal';

  update public.asignaciones_cuenta
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;

  update public.asignaciones_licencia
     set fecha_fin = v_hoy, notas = 'Baja del empleado'
   where empleado_id = p_empleado_id
     and fecha_fin is null;

  if v_cuentas_personales is not null then
    update public.cuentas
       set deleted_at = now()
     where id = any(v_cuentas_personales);
  end if;

  update public.empleados
     set estado = 'Inactivo'
   where id = p_empleado_id
   returning * into v_empleado;

  return v_empleado;
end;
$$;

comment on function public.dar_baja_empleado(uuid) is
  'Baja atómica de un empleado: cierra asignaciones de cuentas y licencias, da de baja sus cuentas personales y marca estado=Inactivo, todo en una sola transacción de servidor. Reemplaza las 4 escrituras secuenciales que hacía el cliente (auditoría integral 2026-08-05, hallazgo A-01).';

-- Dueño explícito: si la función se llega a crear con un rol distinto al
-- habitual del proyecto en algún despliegue, un CREATE OR REPLACE posterior
-- con el rol normal fallaría (mismo motivo que kb_registrar_feedback, migración 032).
alter function public.dar_baja_empleado(uuid) owner to project_admin;

-- ============================================================
-- FIN DE MIGRACIÓN 038
-- ============================================================
