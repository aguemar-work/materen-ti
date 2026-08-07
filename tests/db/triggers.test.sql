-- ============================================================
-- Tests de triggers de negocio — se ejecutan con scripts/test-db.mjs
--
-- SEGURO CONTRA PRODUCCIÓN: cada bloque `do $$ ... end $$` termina
-- SIEMPRE en `raise exception` (TESTS_OK o TESTS_FALLARON), lo que fuerza
-- el ROLLBACK de todos sus fixtures. Nada persiste.
--
-- Dos bloques independientes (no uno solo): el CLI en Windows termina
-- pasando el SQL por un cmd.exe interno (npx.cmd es un batch shim) con
-- límite ~8 KB de línea de comandos, y un solo `do $$ ... $$` con toda
-- la cobertura ya lo supera. scripts/test-db.mjs corre cada bloque en su
-- propia llamada al CLI y agrega los resultados.
--
-- Cobertura:
--   [008] exclusividad de cuentas reutilizables (trg_check_reutilizable)
--   [009] rotación al cerrar asignación (trg_marcar_rotacion)
--   [019] estados terminales de ticket (trg_check_transicion_ticket)
--   [017] reabrir solo JEFE (check_reabrir_solo_jefe, sin sesión de jefe)
--   [031] kb_articulos: created_by no manipulable (set_created_updated_by),
--         check constraint de estado, lógica de "artículos relacionados"
--   [032] kb_registrar_feedback exige es_staff() (guard de la función)
--   [033] problemas/acciones_correctivas: created_by no manipulable, check
--         constraint de estado, autovínculo de ticket_disparador_id
--         (vincular_ticket_disparador), responsable exige staff activo
--         (check_responsable_problema_activo/check_responsable_accion_activo),
--         no cerrar con acciones pendientes/en_progreso (check_problema_cierre),
--         problema cerrado rechaza acciones nuevas/reactivadas
--         (check_problema_no_cerrado), fecha_completada se llena/limpia sola
--         (set_fecha_completada)
--   [038] dar_baja_empleado exige es_staff() (guard de la función, mismo
--         alcance de prueba que [032] — ver nota del bloque 3)
--
-- OJO — esta conexión (project_admin, ver AGENTS.md) tiene BYPASSRLS y el
-- CLI bloquea `SET ROLE`/`SET LOCAL` ("Changing SQL session configuration
-- is not allowed"), así que este archivo SOLO puede probar invariantes de
-- TRIGGERS/constraints (corren igual sin importar el rol) — NO puede
-- simular una sesión de STAFF/JEFE real para ejercer las políticas RLS de
-- kb_articulos/problemas (visibilidad, gates por rol). Esa parte queda
-- pendiente de verificación manual en el navegador con dos cuentas reales.
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

-- ============================================================
-- Bloque 2 — [033] problemas / acciones_correctivas
-- Aparte del bloque anterior para no superar el límite de línea de
-- comandos del CLI en Windows (ver nota arriba).
-- ============================================================
do $$
declare
  v_problema_creador_falso uuid := '00000000-0000-4000-8000-000000000098';
  v_problema_creador_final uuid;
  v_staff_falso uuid := '00000000-0000-4000-8000-000000000097';
  v_problema_id uuid;
  v_problema_id2 uuid;
  v_ticket_disparador uuid;
  v_accion_id uuid;
  v_accion_id2 uuid;
  v_vinculado_count int;
  v_fecha_completada timestamptz;
  fallos text := '';
begin
  -- ── [033] created_by de problemas no lo puede fijar el cliente ──
  insert into public.tickets (codigo, token, titulo, descripcion, estado, categoria_id)
    values ('__TESTCI-PRB__', '__test_ci_prb_token__', '__TEST_CI__ Ticket disparador', 'desc', 'abierto', 'otro')
    returning id into v_ticket_disparador;

  insert into public.problemas (titulo, descripcion, ticket_disparador_id, created_by)
    values ('__TEST_CI__ Problema', 'Cronología de prueba', v_ticket_disparador, v_problema_creador_falso)
    returning id, created_by into v_problema_id, v_problema_creador_final;
  if v_problema_creador_final is not distinct from v_problema_creador_falso then
    fallos := fallos || '[033] created_by de problemas no fue sobrescrito por el trigger; ';
  end if;

  -- ── [033] check constraint de estado rechaza valores fuera del set ──
  begin
    insert into public.problemas (titulo, descripcion, estado)
      values ('__TEST_CI__ Estado invalido', 'desc', 'cerradoo');
    fallos := fallos || '[033] el check constraint de estado de problemas no rechazó un valor inválido; ';
  exception when others then
    null; -- esperado
  end;

  -- ── [033] vincular_ticket_disparador: se autovincula en problema_tickets ──
  select count(*) into v_vinculado_count
  from public.problema_tickets
  where problema_id = v_problema_id and ticket_id = v_ticket_disparador;
  if v_vinculado_count <> 1 then
    fallos := fallos || '[033] el ticket_disparador_id no se autovinculó en problema_tickets; ';
  end if;

  -- ── [033] responsable de un problema exige staff activo ──────
  begin
    update public.problemas set responsable_id = v_staff_falso where id = v_problema_id;
    fallos := fallos || '[033] permitió asignar un problema a alguien que no es staff activo; ';
  exception when others then
    null; -- esperado
  end;

  -- ── [033] no se puede cerrar un problema con acciones pendientes ──
  insert into public.acciones_correctivas (problema_id, descripcion, fecha_limite)
    values (v_problema_id, '__TEST_CI__ Accion pendiente', current_date + 7)
    returning id into v_accion_id;

  begin
    update public.problemas set estado = 'cerrado' where id = v_problema_id;
    fallos := fallos || '[033] permitió cerrar un problema con una acción correctiva pendiente; ';
  exception when others then
    null; -- esperado
  end;

  -- ── [033] set_fecha_completada llena fecha_completada al completar ──
  update public.acciones_correctivas set estado = 'completada' where id = v_accion_id;
  select fecha_completada into v_fecha_completada from public.acciones_correctivas where id = v_accion_id;
  if v_fecha_completada is null then
    fallos := fallos || '[033] completar una acción correctiva no llenó fecha_completada; ';
  end if;

  -- ── [033] sin acciones pendientes/en_progreso, cerrar sí procede ──
  begin
    update public.problemas set estado = 'cerrado' where id = v_problema_id;
  exception when others then
    fallos := fallos || '[033] no dejó cerrar un problema sin acciones pendientes/en_progreso; ';
  end;

  -- ── [033] un problema cerrado rechaza acciones correctivas nuevas ──
  begin
    insert into public.acciones_correctivas (problema_id, descripcion, fecha_limite)
      values (v_problema_id, '__TEST_CI__ Accion en problema cerrado', current_date + 7);
    fallos := fallos || '[033] permitió agregar una acción correctiva a un problema cerrado; ';
  exception when others then
    null; -- esperado
  end;

  -- ── [033] un problema cerrado rechaza reactivar una acción completada ──
  begin
    update public.acciones_correctivas set estado = 'pendiente' where id = v_accion_id;
    fallos := fallos || '[033] permitió reactivar una acción correctiva de un problema cerrado; ';
  exception when others then
    null; -- esperado
  end;

  -- ── [033] responsable de una acción correctiva exige staff activo ──
  -- (problema aparte, sin cerrar, para no mezclar con el bloqueo de arriba)
  insert into public.problemas (titulo, descripcion)
    values ('__TEST_CI__ Problema dos', 'Otra cronología de prueba')
    returning id into v_problema_id2;
  insert into public.acciones_correctivas (problema_id, descripcion, fecha_limite)
    values (v_problema_id2, '__TEST_CI__ Accion dos', current_date + 7)
    returning id into v_accion_id2;

  begin
    update public.acciones_correctivas set responsable_id = v_staff_falso where id = v_accion_id2;
    fallos := fallos || '[033] permitió asignar una acción correctiva a alguien que no es staff activo; ';
  exception when others then
    null; -- esperado
  end;

  -- ── [033] set_fecha_completada limpia fecha_completada al reabrir ──
  update public.acciones_correctivas set estado = 'completada' where id = v_accion_id2;
  update public.acciones_correctivas set estado = 'en_progreso' where id = v_accion_id2;
  select fecha_completada into v_fecha_completada from public.acciones_correctivas where id = v_accion_id2;
  if v_fecha_completada is not null then
    fallos := fallos || '[033] reabrir una acción correctiva no limpió fecha_completada; ';
  end if;

  -- ── Veredicto (SIEMPRE excepción → rollback total) ──────────
  if fallos = '' then
    raise exception 'TESTS_OK [033] — 11 invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [033]: %', fallos;
  end if;
end $$;

-- ============================================================
-- Bloque 3 — [038] dar_baja_empleado (baja atómica de empleado)
-- Aparte del bloque 2 por el mismo límite de línea de comandos.
--
-- OJO: igual que [032] kb_registrar_feedback, esta conexión (project_admin)
-- no tiene auth.uid() — no es una sesión de staff real —, así que solo
-- puede verificar el guard de rechazo, no la lógica de las 4 escrituras
-- atómicas (cerrar asignaciones de cuenta/licencia, dar de baja cuentas
-- personales, marcar Inactivo). Esa lógica se verificó por inspección
-- contra el esquema real (columnas/tipos/constraints) al escribir la
-- migración 038 (auditoría integral 2026-08-05, hallazgo A-01) — pendiente
-- de verificación funcional con una sesión de staff real en el navegador,
-- mismo criterio que las policies RLS de kb_articulos/problemas.
-- ============================================================
do $$
declare
  fallos text := '';
begin
  begin
    perform public.dar_baja_empleado('00000000-0000-4000-8000-000000000001');
    fallos := fallos || '[038] dar_baja_empleado no rechazó una llamada sin sesión de staff; ';
  exception when others then
    null; -- esperado
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [038] — guard de es_staff() verificado, todo revertido';
  else
    raise exception 'TESTS_FALLARON [038]: %', fallos;
  end if;
end $$;
