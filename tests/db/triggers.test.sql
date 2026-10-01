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
--   [051/061/053] cerrar_ticket, staff_nombres, reporte_tickets,
--         reporte_tickets_resumen, reporte_satisfaccion_consolidado exigen
--         es_staff() — mismo alcance de prueba que [032]/[038] (bloque 4,
--         agregado 2026-08-18 al implementar pruebas negativas de
--         autorización — ver docs/HISTORIAL-AUDITORIAS.md)
--   [077] revocar_cuenta_personal exige es_staff() (guard de la función),
--         y rechaza cuentas tipo 'compartida'/'reutilizable' (bloque 5,
--         agregado 2026-08-20 — hallazgo de "Revocar" sin soft-delete real
--         en cuentas personales, ver docs/HISTORIAL-AUDITORIAS.md)
--   [100] (bloques 6 a 8, agregados 2026-10-01, Ciclo 21) topes de licencia y
--         de cuenta bajo FOR UPDATE, indice unico asignaciones_equipo_una_activa,
--         updated_at de equipos intacto ante la cascada de disponibilidad (085),
--         CHECK de motivo_cierre/fotos/DNI, trigger cuentas_password_cambio y
--         whitelist de transiciones de problemas. Cambio en el bloque 2 [033]:
--         el problema avanza abierto-diagnostico-acciones antes de cerrarse.
--   [099] (bloques 9 a 11) puede()/puede_actual()/exigir_permiso(),
--         ticket_token_existe con validacion de forma, accesos_log_accion_check
--         ampliado y trigger del ultimo JEFE con permiso sobre un acceso sensible
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

  -- Desde la migración 100 el estado avanza por la whitelist (abierto,
  -- diagnostico, acciones, cerrado): sin estos dos pasos el rechazo vendría
  -- de la whitelist y no de check_problema_cierre, que es lo que se prueba.
  update public.problemas set estado = 'diagnostico' where id = v_problema_id;
  update public.problemas set estado = 'acciones' where id = v_problema_id;

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

-- ============================================================
-- Bloque 4 — RPCs sensibles sin sesión de staff: cerrar_ticket (051),
-- staff_nombres (061), reporte_tickets / reporte_tickets_resumen /
-- reporte_satisfaccion_consolidado (053)
-- Aparte del bloque 3 por el mismo límite de línea de comandos.
--
-- Agregado 2026-08-18 (pruebas negativas de autorización): estas 5 RPC
-- tenían guard `if not es_staff() then raise exception` verificado por
-- inspección del SQL real, pero ninguna tenía prueba ejecutable. Mismo
-- alcance y misma limitación que [032]/[038]: esta conexión (project_admin)
-- no tiene auth.uid() — no es una sesión de staff real —, así que solo
-- verifica el rechazo del guard, no la lógica de negocio interna (el cierre
-- real de un ticket, el contenido del reporte, etc.) — eso sigue pendiente
-- de verificación funcional con una sesión de staff real, mismo criterio
-- que el resto de este archivo. Ninguna requiere fixtures: el guard es la
-- primera línea ejecutable de las 5 funciones (verificado leyendo
-- migrations/051, 061 y 053 antes de escribir este bloque), así que un
-- UUID/rango de fechas inventado nunca llega a ejecutarse.
-- ============================================================
do $$
declare
  fallos text := '';
begin
  begin
    perform public.cerrar_ticket('00000000-0000-4000-8000-000000000001');
    fallos := fallos || '[051] cerrar_ticket no rechazó una llamada sin sesión de staff; ';
  exception when others then
    null; -- esperado
  end;

  begin
    perform public.staff_nombres();
    fallos := fallos || '[061] staff_nombres no rechazó una llamada sin sesión de staff; ';
  exception when others then
    null; -- esperado
  end;

  begin
    perform public.reporte_tickets(now() - interval '30 days', now());
    fallos := fallos || '[053] reporte_tickets no rechazó una llamada sin sesión de staff; ';
  exception when others then
    null; -- esperado
  end;

  begin
    perform public.reporte_tickets_resumen(now() - interval '30 days', now());
    fallos := fallos || '[053] reporte_tickets_resumen no rechazó una llamada sin sesión de staff; ';
  exception when others then
    null; -- esperado
  end;

  begin
    perform public.reporte_satisfaccion_consolidado();
    fallos := fallos || '[053] reporte_satisfaccion_consolidado no rechazó una llamada sin sesión de staff; ';
  exception when others then
    null; -- esperado
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [051/061/053] — 5 invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [051/061/053]: %', fallos;
  end if;
end $$;

-- ============================================================
-- Bloque 5 — [077] revocar_cuenta_personal
-- Aparte del bloque 4 por el mismo límite de línea de comandos.
--
-- OJO: mismo alcance y misma limitación que [032]/[038]/[051] — esta
-- conexión (project_admin) no tiene auth.uid(), así que solo verifica el
-- guard de rechazo (es_staff(), y el rechazo de compartida/reutilizable
-- vía un fixture real). La lógica de negocio interna (que cierre la
-- asignación Y haga soft-delete de la cuenta EN LA MISMA transacción, y
-- que eso libere de verdad el índice único usuario+plataforma) exige una
-- sesión de staff real — cubierta por
-- frontend/tests/integration/cuentas-revocar-personal.smoke.test.js
-- (pendiente de la cuenta dedicada, mismo patrón que autorizacion-roles).
-- ============================================================
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_cuenta_reutilizable uuid;
  v_asig uuid;
  fallos text := '';
begin
  -- ── [077] sin sesión de staff, rechaza ──────────────────────
  begin
    perform public.revocar_cuenta_personal('00000000-0000-4000-8000-000000000001');
    fallos := fallos || '[077] revocar_cuenta_personal no rechazó una llamada sin sesión de staff; ';
  exception when others then
    null; -- esperado
  end;

  -- ── [077] sobre una cuenta 'reutilizable', rechaza sin tocar nada ──
  -- (aunque esta conexión no es staff y ya rechazaría por eso, el mensaje
  -- de la excepción debe ser el de tipo_cuenta, no el de es_staff() — se
  -- verifica igual por si algún día esta suite corre con BYPASSRLS +
  -- auth.uid() simulado; hoy documenta la intención de la función)
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 077')
    returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Test', 'CI 077', '99999977', v_empresa) returning id into v_emp;
  insert into public.plataformas (id, nombre)
    values ('__test_ci_077__', '__TEST_CI__ Plataforma 077');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta)
    values ('__test_ci_077__', '__test_ci_077__@correo.test', 'reutilizable')
    returning id into v_cuenta_reutilizable;
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id)
    values (v_cuenta_reutilizable, v_emp) returning id into v_asig;

  begin
    perform public.revocar_cuenta_personal(v_asig);
    fallos := fallos || '[077] revocar_cuenta_personal no rechazó una cuenta tipo "reutilizable"; ';
  exception when others then
    null; -- esperado (rechaza por es_staff() o por tipo_cuenta, cualquiera de los dos es correcto acá)
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [077] — 2 invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [077]: %', fallos;
  end if;
end $$;

-- ============================================================
-- Bloques 6 a 11 — migraciones 099 (permisos unificados) y 100 (integridad
-- y trazabilidad). Agregados 2026-10-01 (Ciclo 21, H1). Requieren AMBAS
-- migraciones aplicadas: contra una base sin ellas fallan (es lo esperado).
--
-- Mismo alcance y limitación que el resto del archivo: esta conexión
-- (project_admin) no tiene auth.uid() y una sola sesión no puede probar la
-- CARRERA real de los bloqueos FOR UPDATE; lo que verifican los bloques es
-- que (a) el caso feliz sigue funcionando con el bloqueo, (b) el segundo
-- insert se rechaza y (c) el índice único rechaza lo que el trigger deja
-- pasar si se lo desactiva. Para crear personal de prueba se insertan filas
-- en auth.users (el trigger handle_new_staff_user crea el staff INACTIVO,
-- como en producción); activarlo exige desactivar un instante el trigger
-- trg_staff_autoedicion_solo_nombre (ALTER TABLE ... DISABLE TRIGGER es
-- transaccional: el rollback final lo restaura). Un bloque por tema por el
-- mismo límite de línea de comandos de los anteriores.
-- ============================================================

-- ------------------------------------------------------------
-- Bloque 6 — [100] topes bajo FOR UPDATE, índice único de portador activo y
-- updated_at de equipos intacto ante la cascada de disponibilidad
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp1 uuid;
  v_emp2 uuid;
  v_lic uuid;
  v_cuenta uuid;
  v_equipo uuid;
  v_upd timestamptz;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 100a')
    returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Test', 'CI 100a Uno', '99999961', v_empresa) returning id into v_emp1;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Test', 'CI 100a Dos', '99999962', v_empresa) returning id into v_emp2;

  -- ── [100] tope de licencia: caso feliz y rechazo del segundo asiento ──
  insert into public.licencias (software, cantidad) values ('__TEST_CI__ Licencia 100', 1)
    returning id into v_lic;
  begin
    insert into public.asignaciones_licencia (licencia_id, empleado_id) values (v_lic, v_emp1);
  exception when others then
    fallos := fallos || '[100] check_tope_licencia rechazó el caso feliz: ' || sqlerrm || '; ';
  end;
  begin
    insert into public.asignaciones_licencia (licencia_id, empleado_id) values (v_lic, v_emp2);
    fallos := fallos || '[100] check_tope_licencia permitió superar el tope; ';
  exception when others then
    if sqlerrm not like '%todos sus asientos%' then
      fallos := fallos || '[100] check_tope_licencia rechazó con otro motivo: ' || sqlerrm || '; ';
    end if;
  end;

  -- ── [100] tope por cuenta: dos licencias con la misma cuenta, rige el menor ──
  insert into public.plataformas (id, nombre) values ('__test_ci_100a__', '__TEST_CI__ Plataforma 100a');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta)
    values ('__test_ci_100a__', '__test_ci_100a__@correo.test', 'compartida') returning id into v_cuenta;
  insert into public.licencias (software, cantidad, cuenta_id) values ('__TEST_CI__ Lic A', 3, v_cuenta);
  insert into public.licencias (software, cantidad, cuenta_id) values ('__TEST_CI__ Lic B', 1, v_cuenta);
  begin
    insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta, v_emp1);
  exception when others then
    fallos := fallos || '[100] check_tope_licencia_cuenta rechazó el caso feliz: ' || sqlerrm || '; ';
  end;
  begin
    insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta, v_emp2);
    fallos := fallos || '[100] check_tope_licencia_cuenta no tomó el tope más restrictivo (1); ';
  exception when others then
    if sqlerrm not like '%asiento%' then
      fallos := fallos || '[100] check_tope_licencia_cuenta rechazó con otro motivo: ' || sqlerrm || '; ';
    end if;
  end;

  -- ── [100] equipo con portador activo: el índice único rechaza al segundo ──
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_100a__', '__TEST_CI__ Tipo 100a');
  insert into public.equipos (codigo, tipo_id, updated_at)
    values ('__TEST_CI_100A__', '__test_ci_100a__', now() - interval '5 days')
    returning id into v_equipo;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_equipo, v_emp1);

  -- la cascada de disponibilidad (085) no debe mover equipos.updated_at
  select updated_at into v_upd from public.equipos where id = v_equipo;
  if v_upd > now() - interval '4 days' then
    fallos := fallos || '[100] la cascada de disponibilidad modificó equipos.updated_at; ';
  end if;

  -- con el trigger legible desactivado, solo el índice único impide el segundo portador
  alter table public.asignaciones_equipo disable trigger trg_check_asignacion_equipo;
  begin
    insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_equipo, v_emp2);
    fallos := fallos || '[100] permitió un segundo portador activo del mismo equipo; ';
  exception
    when unique_violation then
      null; -- esperado: asignaciones_equipo_una_activa
    when others then
      fallos := fallos || '[100] el segundo portador falló con otro error (' || sqlstate || '); ';
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [100a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [100a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 7 — [100] CHECKs (motivo_cierre, fotos, DNI) y trigger
-- cuentas_password_cambio
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_equipo uuid;
  v_asig uuid;
  v_asig_c uuid;
  v_cuenta uuid;
  v_old timestamptz;
  v_lpc timestamptz;
  v_req boolean;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 100b')
    returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Test', 'CI 100b', '99999963', v_empresa) returning id into v_emp;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_100b__', '__TEST_CI__ Tipo 100b');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_100B__', '__test_ci_100b__')
    returning id into v_equipo;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_equipo, v_emp)
    returning id into v_asig;

  -- ── [100] motivo_cierre: el valor con espacios y el libre se rechazan ──
  begin
    update public.asignaciones_equipo set fecha_fin = current_date, motivo_cierre = 'entrega a empleado'
      where id = v_asig;
    fallos := fallos || '[100] motivo_cierre aceptó "entrega a empleado" (con espacios); ';
  exception when check_violation then
    null; -- esperado
  end;
  begin
    update public.asignaciones_equipo set fecha_fin = current_date, motivo_cierre = 'entrega_a_empleado'
      where id = v_asig;
  exception when others then
    fallos := fallos || '[100] motivo_cierre rechazó entrega_a_empleado: ' || sqlerrm || '; ';
  end;

  -- ── [100] equipos_fotos_max: 5 fotos se rechazan, 4 pasan ──
  begin
    update public.equipos set fotos = '["a","b","c","d","e"]'::jsonb where id = v_equipo;
    fallos := fallos || '[100] equipos_fotos_max aceptó 5 fotos; ';
  exception when check_violation then
    null; -- esperado
  end;
  begin
    update public.equipos set fotos = '["a","b","c","d"]'::jsonb where id = v_equipo;
  exception when others then
    fallos := fallos || '[100] equipos_fotos_max rechazó 4 fotos: ' || sqlerrm || '; ';
  end;

  -- ── [100] empleados_dni_formato: 7 dígitos se rechaza, ANON-... pasa ──
  begin
    insert into public.empleados (nombres, apellidos, dni, empresa_id)
      values ('Test', 'CI 100b Corto', '1234567', v_empresa);
    fallos := fallos || '[100] empleados_dni_formato aceptó un DNI de 7 dígitos; ';
  exception when check_violation then
    null; -- esperado
  end;
  begin
    insert into public.empleados (nombres, apellidos, dni, empresa_id)
      values ('Test', 'CI 100b Anon', 'ANON-0123456789ab', v_empresa);
  exception when others then
    fallos := fallos || '[100] empleados_dni_formato rechazó un DNI ANON-: ' || sqlerrm || '; ';
  end;

  -- ── [100] cuentas_password_cambio: el servidor decide ──
  insert into public.plataformas (id, nombre) values ('__test_ci_100b__', '__TEST_CI__ Plataforma 100b');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta, password, last_password_change)
    values ('__test_ci_100b__', '__test_ci_100b__@correo.test', 'reutilizable', 'enc2:AAAA:BBBB',
            now() - interval '10 days')
    returning id, last_password_change into v_cuenta, v_old;

  -- sin cambiar la contraseña, el cliente no puede falsear la fecha ni la marca
  update public.cuentas set notas = 'edicion', last_password_change = now(), requiere_rotacion = true
    where id = v_cuenta;
  select last_password_change, requiere_rotacion into v_lpc, v_req from public.cuentas where id = v_cuenta;
  if v_lpc is distinct from v_old then
    fallos := fallos || '[100] el cliente pudo cambiar last_password_change sin cambiar la contraseña; ';
  end if;
  if v_req is distinct from false then
    fallos := fallos || '[100] el cliente pudo activar requiere_rotacion directamente; ';
  end if;

  -- cerrar la asignación (marcar_rotacion_pendiente, anidado) SÍ activa la marca
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta, v_emp)
    returning id into v_asig_c;
  update public.asignaciones_cuenta set fecha_fin = current_date where id = v_asig_c;
  select requiere_rotacion into v_req from public.cuentas where id = v_cuenta;
  if v_req is distinct from true then
    fallos := fallos || '[100] el trigger de contraseña revirtió la marca de marcar_rotacion_pendiente; ';
  end if;

  -- el cliente no puede limpiar la marca sin rotar la contraseña
  update public.cuentas set requiere_rotacion = false where id = v_cuenta;
  select requiere_rotacion into v_req from public.cuentas where id = v_cuenta;
  if v_req is distinct from true then
    fallos := fallos || '[100] el cliente pudo limpiar requiere_rotacion sin cambiar la contraseña; ';
  end if;

  -- cambiar la contraseña: fecha nueva y marca limpia
  update public.cuentas set password = 'enc2:CCCC:DDDD' where id = v_cuenta;
  select last_password_change, requiere_rotacion into v_lpc, v_req from public.cuentas where id = v_cuenta;
  if v_lpc is null or v_lpc <= v_old then
    fallos := fallos || '[100] cambiar la contraseña no actualizó last_password_change; ';
  end if;
  if v_req is distinct from false then
    fallos := fallos || '[100] cambiar la contraseña no limpió requiere_rotacion; ';
  end if;

  -- borrar la contraseña deja last_password_change en NULL
  update public.cuentas set password = null where id = v_cuenta;
  select last_password_change into v_lpc from public.cuentas where id = v_cuenta;
  if v_lpc is not null then
    fallos := fallos || '[100] borrar la contraseña no dejó last_password_change en NULL; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [100b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [100b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 8 — [100] transiciones de estado de problemas (whitelist)
-- ------------------------------------------------------------
do $$
declare
  v_problema uuid;
  v_reglas int;
  fallos text := '';
begin
  select count(*) into v_reglas from public.transiciones_problema_permitidas;
  if v_reglas <> 6 then
    fallos := fallos || '[100] transiciones_problema_permitidas debería tener 6 reglas y tiene ' || v_reglas || '; ';
  end if;

  insert into public.problemas (titulo, descripcion) values ('__TEST_CI__ Problema 100', 'Transiciones')
    returning id into v_problema;

  -- abierto a cerrado directo: rechazado POR LA WHITELIST
  begin
    update public.problemas set estado = 'cerrado' where id = v_problema;
    fallos := fallos || '[100] permitió abierto a cerrado directo; ';
  exception when others then
    if sqlerrm not like '%no permitida%' then
      fallos := fallos || '[100] abierto a cerrado se rechazó por otro motivo: ' || sqlerrm || '; ';
    end if;
  end;

  -- flujo normal de la UI y retrocesos permitidos
  begin
    update public.problemas set estado = 'diagnostico' where id = v_problema;
    update public.problemas set estado = 'acciones' where id = v_problema;
    update public.problemas set estado = 'diagnostico' where id = v_problema;
    update public.problemas set estado = 'abierto' where id = v_problema;
    update public.problemas set estado = 'diagnostico' where id = v_problema;
    update public.problemas set estado = 'acciones' where id = v_problema;
    update public.problemas set estado = 'cerrado' where id = v_problema;
  exception when others then
    fallos := fallos || '[100] el flujo normal de transiciones fue rechazado: ' || sqlerrm || '; ';
  end;

  -- reabrir un cerrado exige jefe (esta conexión no lo es)
  begin
    update public.problemas set estado = 'abierto' where id = v_problema;
    fallos := fallos || '[100] permitió reabrir un problema cerrado sin ser jefe; ';
  exception when others then
    if sqlerrm not like '%jefe%' then
      fallos := fallos || '[100] reabrir se rechazó por otro motivo: ' || sqlerrm || '; ';
    end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [100c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [100c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 9 — [099] puede(): JEFE, ASISTENTE con y sin módulo, inactivo,
-- credenciales.ver, accesos sensibles y sin sesión
-- ------------------------------------------------------------
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  v_asis_cred uuid;
  v_inact uuid;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_099_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_099_asis@example.test') returning id into v_asis;
  insert into auth.users (email) values ('__test_ci_099_cred@example.test') returning id into v_asis_cred;
  insert into auth.users (email) values ('__test_ci_099_inact@example.test') returning id into v_inact;

  -- handle_new_staff_user los crea ASISTENTE inactivos con los 8 módulos y credenciales.ver
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  update public.staff set activo = true where user_id in (v_asis, v_asis_cred);
  delete from public.staff_modulos_permisos where staff_user_id = v_asis and modulo <> 'tickets';
  delete from public.staff_permisos where staff_user_id in (v_asis, v_jefe);

  if public.puede(null, 'staff:activo') then fallos := fallos || '[099] puede(NULL) fue true; '; end if;
  if public.puede(gen_random_uuid(), 'staff:activo') then fallos := fallos || '[099] un usuario sin staff pasó; '; end if;

  -- JEFE activo: todo, salvo accesos sensibles sin fila
  if not public.puede(v_jefe, 'staff:activo') then fallos := fallos || '[099] JEFE sin staff:activo; '; end if;
  if not public.puede(v_jefe, 'rol:jefe') then fallos := fallos || '[099] JEFE sin rol:jefe; '; end if;
  if not public.puede(v_jefe, 'modulo:equipos') then fallos := fallos || '[099] JEFE sin modulo:equipos; '; end if;
  if not public.puede(v_jefe, 'credenciales.ver') then fallos := fallos || '[099] JEFE sin credenciales.ver (atajo); '; end if;
  if public.puede(v_jefe, 'acceso_sensible:' || gen_random_uuid()::text) then fallos := fallos || '[099] JEFE exento de acceso_sensible; '; end if;
  if public.puede(v_jefe, 'acceso_sensible:no-es-un-uuid') then fallos := fallos || '[099] acceso_sensible con uuid inválido fue true; '; end if;

  -- ASISTENTE activo solo con el módulo tickets y sin credenciales.ver
  if not public.puede(v_asis, 'staff:activo') then fallos := fallos || '[099] ASISTENTE activo sin staff:activo; '; end if;
  if public.puede(v_asis, 'rol:jefe') then fallos := fallos || '[099] ASISTENTE con rol:jefe; '; end if;
  if not public.puede(v_asis, 'modulo:tickets') then fallos := fallos || '[099] ASISTENTE sin su módulo tickets; '; end if;
  if public.puede(v_asis, 'modulo:equipos') then fallos := fallos || '[099] ASISTENTE con un módulo que no tiene; '; end if;
  if public.puede(v_asis, 'credenciales.ver') then fallos := fallos || '[099] ASISTENTE sin la fila con credenciales.ver; '; end if;
  if public.puede(v_asis, 'permiso.inexistente') then fallos := fallos || '[099] permiso desconocido fue true; '; end if;

  -- ASISTENTE con la fila de credenciales.ver
  if not public.puede(v_asis_cred, 'credenciales.ver') then fallos := fallos || '[099] ASISTENTE con la fila sin credenciales.ver; '; end if;
  if not public.puede(v_asis_cred, 'modulo:equipos') then fallos := fallos || '[099] ASISTENTE con 8 módulos sin modulo:equipos; '; end if;

  -- staff inactivo: nada, aunque conserve módulos y credenciales.ver
  if public.puede(v_inact, 'staff:activo') or public.puede(v_inact, 'modulo:tickets')
     or public.puede(v_inact, 'credenciales.ver') or public.puede(v_inact, 'rol:jefe') then
    fallos := fallos || '[099] staff inactivo con algún permiso; ';
  end if;

  -- sin sesión (auth.uid() NULL): puede_actual es false y exigir_permiso lanza 42501
  if public.puede_actual('staff:activo') then fallos := fallos || '[099] puede_actual sin sesión fue true; '; end if;
  begin
    perform public.exigir_permiso('staff:activo');
    fallos := fallos || '[099] exigir_permiso no lanzó sin sesión; ';
  exception when others then
    if sqlstate <> '42501' then
      fallos := fallos || '[099] exigir_permiso lanzó ' || sqlstate || ' en vez de 42501; ';
    end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [099a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [099a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 10 — [099] ticket_token_existe valida la forma y
-- accesos_log_accion_check admite los valores nuevos
-- ------------------------------------------------------------
do $$
declare
  v_accion text;
  fallos text := '';
begin
  insert into public.tickets (codigo, token, titulo, descripcion, estado, categoria_id)
    values ('__TESTCI-099A__', 'testci099tokenabcdefghij', '__TEST_CI__ Ticket token', 'desc', 'abierto', 'otro');
  insert into public.tickets (codigo, token, titulo, descripcion, estado, categoria_id)
    values ('__TESTCI-099B__', '__test_ci_099_corto', '__TEST_CI__ Ticket token corto', 'desc', 'abierto', 'otro');

  if not public.ticket_token_existe('testci099tokenabcdefghij') then
    fallos := fallos || '[099] ticket_token_existe no encontró un token válido de 24 caracteres; ';
  end if;
  if public.ticket_token_existe('__test_ci_099_corto') then
    fallos := fallos || '[099] ticket_token_existe consultó un token que no mide 24 caracteres; ';
  end if;
  if public.ticket_token_existe('testci099tokenabcdefghi!') then
    fallos := fallos || '[099] ticket_token_existe aceptó un carácter fuera de base64url; ';
  end if;
  if public.ticket_token_existe(null) then
    fallos := fallos || '[099] ticket_token_existe(NULL) fue true; ';
  end if;

  -- accesos_log: valores nuevos y viejos pasan, uno inventado no
  foreach v_accion in array array['revelado_fallido', 'revelado_denegado', 'purga_ejecutada',
                                  'portal_abierto', 'exportacion', 'permiso_otorgado', 'entrega_fallida', 'ver']
  loop
    begin
      insert into public.accesos_log (cuenta_usuario, accion) values ('__TEST_CI__', v_accion);
    exception when others then
      fallos := fallos || '[099] accesos_log rechazó la acción ' || v_accion || '; ';
    end;
  end loop;
  begin
    insert into public.accesos_log (cuenta_usuario, accion) values ('__TEST_CI__', 'accion_inventada');
    fallos := fallos || '[099] accesos_log aceptó una acción inventada; ';
  exception when check_violation then
    null; -- esperado
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [099b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [099b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 11 — [099] no desactivar al único JEFE con permiso sobre un
-- acceso sensible (trg_staff_ultimo_jefe_acceso_sensible)
-- ------------------------------------------------------------
do $$
declare
  v_jefe1 uuid;
  v_jefe2 uuid;
  v_acceso uuid;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_099_jefe1@example.test') returning id into v_jefe1;
  insert into auth.users (email) values ('__test_ci_099_jefe2@example.test') returning id into v_jefe2;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id in (v_jefe1, v_jefe2);

  -- el trigger de alta daría el permiso a auth.uid() (NULL aquí): se otorga a mano
  alter table public.accesos_sensibles disable trigger trg_acceso_sensible_permiso_creador;
  insert into public.accesos_sensibles (nombre, categoria, usuario) values ('__TEST_CI__ Acceso 099', 'otro', 'usuario')
    returning id into v_acceso;
  insert into public.accesos_sensibles_permisos (acceso_id, staff_user_id) values (v_acceso, v_jefe1);

  -- único jefe activo con permiso: no se puede desactivar ni degradar
  begin
    update public.staff set activo = false where user_id = v_jefe1;
    fallos := fallos || '[099] permitió desactivar al único jefe con permiso sobre un acceso sensible; ';
  exception when others then
    if sqlerrm not like '%jefe activo con permiso%' then
      fallos := fallos || '[099] la desactivación se rechazó por otro motivo: ' || sqlerrm || '; ';
    end if;
  end;
  begin
    update public.staff set rol = 'ASISTENTE' where user_id = v_jefe1;
    fallos := fallos || '[099] permitió degradar al único jefe con permiso sobre un acceso sensible; ';
  exception when others then
    if sqlerrm not like '%jefe activo con permiso%' then
      fallos := fallos || '[099] la degradación se rechazó por otro motivo: ' || sqlerrm || '; ';
    end if;
  end;

  -- con otro jefe activo que también tiene permiso, sí se puede
  insert into public.accesos_sensibles_permisos (acceso_id, staff_user_id) values (v_acceso, v_jefe2);
  begin
    update public.staff set activo = false where user_id = v_jefe1;
  exception when others then
    fallos := fallos || '[099] bloqueó la desactivación habiendo otro jefe con permiso: ' || sqlerrm || '; ';
  end;

  -- ahora v_jefe2 es el único activo con permiso: tampoco se puede desactivar
  begin
    update public.staff set activo = false where user_id = v_jefe2;
    fallos := fallos || '[099] permitió desactivar al último jefe activo con permiso; ';
  exception when others then
    null; -- esperado
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [099c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [099c]: %', fallos;
  end if;
end $$;
