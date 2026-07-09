-- ============================================================
-- Tests de triggers de negocio — se ejecutan con scripts/test-db.mjs
--
-- SEGURO CONTRA PRODUCCIÓN: el bloque termina SIEMPRE en
-- `raise exception` (TESTS_OK o TESTS_FALLARON), lo que fuerza el
-- ROLLBACK de todos los fixtures. Nada persiste.
--
-- Cobertura:
--   [008] exclusividad de cuentas reutilizables (trg_check_reutilizable)
--   [009] rotación al cerrar asignación (trg_marcar_rotacion)
--   [019] estados terminales de ticket (trg_check_transicion_ticket)
--   [017] reabrir solo JEFE (check_reabrir_solo_jefe, sin sesión de jefe)
-- ============================================================
do $$
declare
  v_empresa uuid;
  v_emp1 uuid;
  v_emp2 uuid;
  v_cuenta uuid;
  v_asig1 uuid;
  v_requiere boolean;
  v_ticket uuid;
  v_estado text;
  fallos text := '';
begin
  -- ── Fixtures (todo se revierte con el rollback final) ──────
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa')
    returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Test', 'CI Uno', '99999991', v_empresa) returning id into v_emp1;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Test', 'CI Dos', '99999992', v_empresa) returning id into v_emp2;
  insert into public.plataformas (id, nombre)
    values ('__test_ci__', '__TEST_CI__ Plataforma');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta)
    values ('__test_ci__', '__test_ci__@correo.test', 'reutilizable')
    returning id into v_cuenta;

  -- ── [008] una reutilizable no admite dos asignaciones activas ──
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id)
    values (v_cuenta, v_emp1) returning id into v_asig1;
  begin
    insert into public.asignaciones_cuenta (cuenta_id, empleado_id)
      values (v_cuenta, v_emp2);
    fallos := fallos || '[008] permitió una segunda asignación activa de una cuenta reutilizable; ';
  exception when others then
    null; -- esperado: el trigger la rechaza
  end;

  -- ── [009] cerrar la asignación marca requiere_rotacion ─────
  update public.asignaciones_cuenta set fecha_fin = current_date where id = v_asig1;
  select requiere_rotacion into v_requiere from public.cuentas where id = v_cuenta;
  if v_requiere is distinct from true then
    fallos := fallos || '[009] cerrar la asignación no marcó requiere_rotacion; ';
  end if;

  -- ── [019] un ticket cerrado no puede volver a abierto ──────
  insert into public.tickets (codigo, token, titulo, descripcion, estado)
    values ('__TESTCI-000__', '__test_ci_token__', 'Test CI', 'Ticket de prueba CI', 'cerrado')
    returning id into v_ticket;
  begin
    update public.tickets set estado = 'abierto' where id = v_ticket;
    fallos := fallos || '[019] permitió cerrado→abierto directo (bypass de la máquina de estados); ';
  exception when others then
    null; -- esperado
  end;

  -- ── [017] cerrado→reabierto exige JEFE (esta conexión no lo es) ──
  begin
    update public.tickets set estado = 'reabierto' where id = v_ticket;
    fallos := fallos || '[017] permitió reabrir sin ser JEFE; ';
  exception when others then
    null; -- esperado
  end;

  -- El ticket debe seguir cerrado tras ambos intentos
  select estado into v_estado from public.tickets where id = v_ticket;
  if v_estado <> 'cerrado' then
    fallos := fallos || format('[019] el ticket quedó en "%s" en vez de cerrado; ', v_estado);
  end if;

  -- ── Veredicto (SIEMPRE excepción → rollback total) ──────────
  if fallos = '' then
    raise exception 'TESTS_OK — 4 invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON: %', fallos;
  end if;
end $$;
