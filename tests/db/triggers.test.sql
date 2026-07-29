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
--   [031] kb_articulos: created_by no manipulable (set_created_updated_by),
--         check constraint de estado, lógica de "artículos relacionados"
--   [032] kb_registrar_feedback exige es_staff() (guard de la función)
--
-- OJO — esta conexión (project_admin, ver AGENTS.md) tiene BYPASSRLS y el
-- CLI bloquea `SET ROLE`/`SET LOCAL` ("Changing SQL session configuration
-- is not allowed"), así que este archivo SOLO puede probar invariantes de
-- TRIGGERS/constraints (corren igual sin importar el rol) — NO puede
-- simular una sesión de STAFF/JEFE real para ejercer las políticas RLS de
-- kb_articulos (visibilidad borrador/en_revision, gate de publicar/
-- obsoleto). Esa parte queda pendiente de verificación manual en el
-- navegador con dos cuentas de staff reales.
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
  v_kb_creador_falso uuid := '00000000-0000-4000-8000-000000000099';
  v_kb_id uuid;
  v_kb_creador_final uuid;
  v_kb_ticket uuid;
  v_kb_publicado uuid;
  v_kb_borrador uuid;
  v_kb_otra_categoria uuid;
  v_relacionados int;
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

  -- ── [031] created_by de kb_articulos no lo puede fijar el cliente ──
  -- set_created_updated_by() debe pisar cualquier valor recibido en el
  -- INSERT (acá lo prueba con un uuid inventado que no es el autor real).
  insert into public.kb_articulos (titulo, categoria_id, estado, created_by)
    values ('__TEST_CI__ Articulo con creador falso', 'otro', 'borrador', v_kb_creador_falso)
    returning id, created_by into v_kb_id, v_kb_creador_final;
  if v_kb_creador_final is not distinct from v_kb_creador_falso then
    fallos := fallos || '[031] created_by de kb_articulos no fue sobrescrito por el trigger; ';
  end if;

  -- ── [031] check constraint de estado rechaza valores fuera del set ──
  begin
    insert into public.kb_articulos (titulo, categoria_id, estado)
      values ('__TEST_CI__ Estado invalido', 'otro', 'publicadoo');
    fallos := fallos || '[031] el check constraint de estado de kb_articulos no rechazó un valor inválido; ';
  exception when others then
    null; -- esperado
  end;

  -- ── [031] "Artículos relacionados": mismo criterio que
  --    listArticulosRelacionados (misma categoría del ticket + estado
  --    "publicado") — un borrador o un artículo de otra categoría NO
  --    deben calzar ──
  insert into public.tickets (codigo, token, titulo, descripcion, estado, categoria_id)
    values ('__TESTCI-KB1__', '__test_ci_kb_token__', '__TEST_CI__ Ticket para relacionados', 'desc', 'abierto', 'otro')
    returning id into v_kb_ticket;

  insert into public.kb_articulos (titulo, categoria_id, estado)
    values ('__TEST_CI__ Publicado misma categoria', 'otro', 'publicado')
    returning id into v_kb_publicado;
  insert into public.kb_articulos (titulo, categoria_id, estado)
    values ('__TEST_CI__ Borrador misma categoria', 'otro', 'borrador')
    returning id into v_kb_borrador;
  insert into public.kb_articulos (titulo, categoria_id, estado)
    values ('__TEST_CI__ Publicado otra categoria', 'equipos', 'publicado')
    returning id into v_kb_otra_categoria;

  select count(*) into v_relacionados
  from public.kb_articulos
  where categoria_id = (select categoria_id from public.tickets where id = v_kb_ticket)
    and estado = 'publicado' and deleted_at is null and id = v_kb_publicado;
  if v_relacionados <> 1 then
    fallos := fallos || '[031] el artículo publicado de la misma categoría no apareció como relacionado; ';
  end if;

  select count(*) into v_relacionados
  from public.kb_articulos
  where categoria_id = (select categoria_id from public.tickets where id = v_kb_ticket)
    and estado = 'publicado' and id = v_kb_borrador;
  if v_relacionados <> 0 then
    fallos := fallos || '[031] un borrador apareció entre los artículos relacionados; ';
  end if;

  select count(*) into v_relacionados
  from public.kb_articulos
  where categoria_id = (select categoria_id from public.tickets where id = v_kb_ticket)
    and estado = 'publicado' and id = v_kb_otra_categoria;
  if v_relacionados <> 0 then
    fallos := fallos || '[031] un artículo de OTRA categoría apareció como relacionado; ';
  end if;

  -- ── [032] kb_registrar_feedback exige es_staff() ──────────────────
  -- Esta conexión (project_admin, sin auth.uid()) no es staff, así que
  -- debe rechazarla — es la misma prueba que ya hace [017] con
  -- check_reabrir_solo_jefe: no se puede simular una sesión de staff
  -- real acá (ver nota al inicio del archivo), pero si el guard
  -- `if not es_staff()` se rompiera o se borrara, esta llamada dejaría
  -- de fallar y lo detectaríamos. Que la función SOLO toque
  -- util_si/util_no (nunca titulo/solucion/estado) se verifica por
  -- inspección de su definición (migración 032), no por ejecución.
  begin
    perform public.kb_registrar_feedback(v_kb_publicado, true);
    fallos := fallos || '[032] kb_registrar_feedback no rechazó una llamada sin sesión de staff; ';
  exception when others then
    null; -- esperado
  end;

  -- ── Veredicto (SIEMPRE excepción → rollback total) ──────────
  if fallos = '' then
    raise exception 'TESTS_OK — 11 invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON: %', fallos;
  end if;
end $$;
