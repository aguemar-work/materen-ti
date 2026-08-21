-- ============================================================
-- MIGRACIÓN 077 — revocar_cuenta_personal(): cierre de asignación +
-- soft-delete atómicos, solo para cuentas tipo 'personal'.
--
-- Hallazgo (auditoría externa, 2026-08-20): "Revocar" en CuentasPanel.vue
-- solo cerraba la asignación (asignaciones_cuenta.fecha_fin), sin tocar
-- cuentas.deleted_at. La fila de `cuentas` seguía viva para siempre,
-- ocupando el slot del índice único uq_cuentas_usuario_plataforma
-- (migración 039) sin que quedara ningún camino de UI para liberarlo —
-- una cuenta personal "revocada" bloqueaba permanentemente volver a
-- registrar ese mismo usuario en esa plataforma. Reportado por un
-- usuario real con almacen.nufago.06@gmail.com / VPN.
--
-- Alcance deliberadamente angosto:
--   - NO modifica cerrarAsignacion() / su equivalente RPC: esa función la
--     reutiliza también licencias.js (liberarUsuario, cuando el origen es
--     una cuenta) para liberar un asiento de licencia, sin relación con
--     este hallazgo — cambiar su comportamiento ahí sería un efecto
--     colateral no pedido.
--   - NO toca 'compartida'/'reutilizable': esas deben poder quedar sin
--     asignar y reutilizarse después (comportamiento correcto, sin
--     cambios) — de ahí que la función rechace explícitamente cualquier
--     tipo_cuenta distinto de 'personal'.
--   - NO es security definer: corre con el RLS normal del que llama,
--     mismo modelo de permisos vigente hoy (es_staff() + módulo "correos"
--     en las policies de asignaciones_cuenta/cuentas, migración 068) —
--     sin elevar privilegios.
-- ============================================================

create or replace function public.revocar_cuenta_personal(p_asignacion_id uuid)
returns void
language plpgsql
as $$
declare
  v_cuenta_id uuid;
  v_tipo_cuenta text;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  select cuenta_id into v_cuenta_id
  from public.asignaciones_cuenta
  where id = p_asignacion_id;

  if v_cuenta_id is null then
    raise exception 'Asignación no encontrada';
  end if;

  select tipo_cuenta into v_tipo_cuenta
  from public.cuentas
  where id = v_cuenta_id;

  if v_tipo_cuenta is distinct from 'personal' then
    raise exception 'revocar_cuenta_personal solo aplica a cuentas tipo "personal" (usar cerrarAsignacion para compartida/reutilizable)';
  end if;

  update public.asignaciones_cuenta
  set fecha_fin = current_date
  where id = p_asignacion_id;

  update public.cuentas
  set deleted_at = now()
  where id = v_cuenta_id;
end;
$$;

comment on function public.revocar_cuenta_personal(uuid) is
  'Cierra la asignación y hace soft-delete de la cuenta en la misma transacción — solo para tipo_cuenta=personal. Evita que "Revocar" deje una fila viva bloqueando uq_cuentas_usuario_plataforma para siempre (hallazgo 2026-08-20).';

revoke execute on function public.revocar_cuenta_personal(uuid) from public;
grant execute on function public.revocar_cuenta_personal(uuid) to authenticated;

-- ============================================================
-- BACKFILL: las 4 filas huérfanas detectadas en el barrido de auditoría
-- (2026-08-20) — cuentas 'personal', deleted_at is null, sin ninguna
-- asignación activa. Por ID explícito a propósito (no por WHERE
-- re-evaluado al aplicar): exactamente estas 4, ninguna otra que pudiera
-- calzar el mismo patrón entre el barrido y este deploy. Las 4 pertenecen
-- al mismo empleado (Danny David Pomachagua Chepe), revocadas el mismo
-- día en que se le asignaron.
-- ============================================================

update public.cuentas
set deleted_at = now()
where id in (
  '9b6d6d2c-9688-43c7-8a56-b6ccb106f0cd', -- bitrix24
  '29d892fa-c0e3-47cb-9096-06f22a7ba7f8', -- correo_corp
  'a676623d-4451-4a9d-8e08-19570c159480', -- materen
  '9d22169e-7c9d-4b1f-a6b5-1bbb9f3dbf3a'  -- vpn (el caso reportado)
)
and tipo_cuenta = 'personal'
and deleted_at is null;

-- ============================================================
-- FIN DE MIGRACIÓN 077
-- ============================================================
