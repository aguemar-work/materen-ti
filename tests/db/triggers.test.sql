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
--   [111] (bloques 111-a y 111-b) crear_ticket_publico (ticket + evento +
--         intento atomicos, vinculacion por DNI, vinculos a activos solo con
--         staff, rate-limit por IP y DNI, guards 22023/42501) y
--         adjuntar_captura_ticket (solo la key tickets/<id>/captura.<ext>)
--   [112] (bloques 112-a a 112-c) purgar_datos_temporales (reglas de config_retencion,
--         entregas, notificaciones leidas, ip/user_agent de accesos_log, auditoria
--         purga_ejecutada), anonimizar_empleado (plazo, que se anonimiza y que se
--         conserva) y entorno / es_branch()
--   [108] (bloques 108-a a 108-f) solicitudes de servicio: catalogo y privilegios,
--         crear_solicitud (alta con persona nueva en la misma transaccion, validaciones,
--         una sola abierta por tipo), AUTOCOMPLETADO por cuenta/entrega abierta/equipo/
--         licencia/rotacion, integridad (whitelist, omitir con motivo, cancelar), baja que
--         crea su solicitud con pasos reales, Inicio (solicitudes_abiertas), reingreso y
--         convertir_ticket_en_solicitud
--
-- OJO — esta conexión (project_admin, ver AGENTS.md) tiene BYPASSRLS y el
-- CLI bloquea los cambios de rol y de configuración de sesión ("Changing SQL session configuration
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

-- ------------------------------------------------------------
-- 102-a: migracion 102 (ciclo de vida del empleado). empleado_eventos
-- registra creado y cambios de area/contacto/estado sin guardar valores de
-- contacto, ignora UPDATEs sin cambio real; la whitelist rechaza Inactivo a
-- Suspendido; la tabla es inmutable. Modo compatibilidad forzado (el
-- interruptor puede estar activo en la base; todo se revierte).
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_emp uuid;
  v_ev record;
  v_n int;
  v_n2 int;
  fallos text := '';
begin
  update public.empleados_ajustes set valor = false where clave = 'exigir_contexto_rpc';
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 102a') returning id into v_empresa;
  insert into public.areas_obras (nombre) values ('__TEST_CI__ Area 102A') returning id into v_a1;
  insert into public.areas_obras (nombre) values ('__TEST_CI__ Area 102B') returning id into v_a2;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, area_obra_id)
    values ('Test', 'CI 102a', '99010201', v_empresa, v_a1) returning id into v_emp;

  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'creado' and rol_actor = 'sistema';
  if v_n <> 1 then fallos := fallos || '[102] el alta no registro un evento creado; '; end if;

  update public.empleados set area_obra_id = v_a2 where id = v_emp;
  select * into v_ev from public.empleado_eventos where empleado_id = v_emp and evento = 'area_cambiada';
  if v_ev.valor_anterior is distinct from '__TEST_CI__ Area 102A' or v_ev.valor_nuevo is distinct from '__TEST_CI__ Area 102B' then
    fallos := fallos || '[102] area_cambiada no guardo los nombres legibles; ';
  end if;

  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp;
  update public.empleados set notas = 'solo una nota' where id = v_emp;
  select count(*) into v_n2 from public.empleado_eventos where empleado_id = v_emp;
  if v_n2 <> v_n then fallos := fallos || '[102] un UPDATE sin cambio rastreado genero eventos; '; end if;

  update public.empleados set telefono = '999111222' where id = v_emp;
  select * into v_ev from public.empleado_eventos where empleado_id = v_emp and evento = 'contacto_cambiado';
  if v_ev.campo is distinct from 'telefono' or v_ev.valor_anterior is not null or v_ev.valor_nuevo is not null or v_ev.detalle is distinct from 'actualizado' then
    fallos := fallos || '[102] contacto_cambiado guardo valores o no indico la columna; ';
  end if;

  update public.empleados set estado = 'Suspendido' where id = v_emp;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'estado_cambiado' and valor_anterior = 'Activo' and valor_nuevo = 'Suspendido';
  if v_n <> 1 then fallos := fallos || '[102] el cambio directo de estado no quedo registrado; '; end if;

  update public.empleados set estado = 'Inactivo' where id = v_emp;
  begin
    update public.empleados set estado = 'Suspendido' where id = v_emp;
    fallos := fallos || '[102] permitio Inactivo a Suspendido; ';
  exception when others then
    if sqlerrm not like '%no permitida%' then fallos := fallos || '[102] Inactivo a Suspendido se rechazo por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  begin
    update public.empleado_eventos set detalle = 'manipulado' where empleado_id = v_emp;
    fallos := fallos || '[102] empleado_eventos admitio un UPDATE; ';
  exception when others then
    if sqlerrm not like '%inmutable%' then fallos := fallos || '[102] el UPDATE se rechazo por otro motivo: ' || sqlerrm || '; '; end if;
  end;
  begin
    delete from public.empleado_eventos where empleado_id = v_emp;
    fallos := fallos || '[102] empleado_eventos admitio un DELETE; ';
  exception when others then
    if sqlerrm not like '%inmutable%' then fallos := fallos || '[102] el DELETE se rechazo por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [102a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [102a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 102-b: con exigir_contexto_rpc = true, el estado solo cambia bajo el
-- contexto rpc_empleado (SQLSTATE 42501 si no); marcar/restaurar_contexto;
-- mientras hay contexto el trigger de eventos no escribe estado_cambiado y la
-- whitelist sigue aplicando.
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_o text;
  v_n int;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 102b') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Test', 'CI 102b', '99010202', v_empresa) returning id into v_emp;
  update public.empleados_ajustes set valor = true where clave = 'exigir_contexto_rpc';

  begin
    update public.empleados set estado = 'Suspendido' where id = v_emp;
    fallos := fallos || '[102] modo estricto permitio un cambio de estado sin contexto; ';
  exception when insufficient_privilege then
    null;
  when others then
    fallos := fallos || '[102] modo estricto rechazo con otro error: ' || sqlerrm || '; ';
  end;

  update public.empleados set estado = 'Activo', cargo = 'Operario' where id = v_emp;

  perform public.marcar_contexto('sistema', 'rpc_empleado');
  select origen into v_o from public.contexto_actual();
  if v_o is distinct from 'rpc_empleado' then fallos := fallos || '[102] contexto_actual no devolvio el contexto marcado; '; end if;

  update public.empleados set estado = 'Suspendido' where id = v_emp;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'estado_cambiado';
  if v_n <> 0 then fallos := fallos || '[102] con contexto rpc_empleado se registro estado_cambiado; '; end if;

  update public.empleados set estado = 'Inactivo' where id = v_emp;
  begin
    update public.empleados set estado = 'Suspendido' where id = v_emp;
    fallos := fallos || '[102] con contexto se salto la whitelist; ';
  exception when others then
    if sqlerrm not like '%no permitida%' then fallos := fallos || '[102] con contexto la whitelist rechazo por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  perform public.restaurar_contexto(null, null);
  select count(*) into v_n from public.contexto_actual();
  if v_n <> 0 then fallos := fallos || '[102] restaurar_contexto no borro el contexto; '; end if;
  begin
    update public.empleados set estado = 'Activo' where id = v_emp;
    fallos := fallos || '[102] tras restaurar el contexto se permitio un cambio de estado; ';
  exception when insufficient_privilege then
    null;
  when others then
    fallos := fallos || '[102] tras restaurar rechazo con otro error: ' || sqlerrm || '; ';
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [102b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [102b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 102-c: suspender/reactivar (funciones internas, la conexion no tiene
-- auth.uid() y el guard solo se prueba en 102-e). En modo estricto: prueba
-- que las RPC marcan el contexto. Suspender marca rotacion en la cuenta
-- reutilizable, no en la personal, SIN cerrar asignaciones.
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_cr uuid;
  v_cp uuid;
  v_fecha date;
  v_fecha2 date;
  v_rot_r boolean;
  v_rot_p boolean;
  v_n int;
  v_ev record;
  fallos text := '';
begin
  update public.empleados_ajustes set valor = true where clave = 'exigir_contexto_rpc';
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 102c') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, fecha_alta)
    values ('Test', 'CI 102c', '99010203', v_empresa, '2020-01-15') returning id into v_emp;
  insert into public.plataformas (id, nombre) values ('__test_ci_102c__', '__TEST_CI__ Plataforma 102c');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_102c__', '__test_ci_102c_r__@correo.test', 'reutilizable') returning id into v_cr;
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_102c__', '__test_ci_102c_p__@correo.test', 'personal') returning id into v_cp;
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cr, v_emp);
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cp, v_emp);

  begin
    perform public.empleado_suspender_interno(v_emp, '   ');
    fallos := fallos || '[102] suspender acepto un motivo vacio; ';
  exception when others then
    if sqlerrm not like '%motivo%' then fallos := fallos || '[102] motivo vacio rechazado por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  perform public.empleado_suspender_interno(v_emp, 'Investigacion interna');
  if (select estado::text from public.empleados where id = v_emp) <> 'Suspendido' then fallos := fallos || '[102] suspender no dejo Suspendido; '; end if;
  select requiere_rotacion into v_rot_r from public.cuentas where id = v_cr;
  select requiere_rotacion into v_rot_p from public.cuentas where id = v_cp;
  if v_rot_r is distinct from true then fallos := fallos || '[102] la cuenta reutilizable no quedo con requiere_rotacion; '; end if;
  if v_rot_p is distinct from false then fallos := fallos || '[102] la cuenta personal quedo marcada para rotar; '; end if;
  select count(*) into v_n from public.asignaciones_cuenta where empleado_id = v_emp and fecha_fin is null;
  if v_n <> 2 then fallos := fallos || '[102] suspender cerro asignaciones de cuenta; '; end if;

  select * into v_ev from public.empleado_eventos where empleado_id = v_emp and evento = 'suspendido';
  if v_ev.detalle is distinct from 'Investigacion interna' or v_ev.valor_anterior is distinct from 'Activo' or v_ev.valor_nuevo is distinct from 'Suspendido' or v_ev.rol_actor is distinct from 'sistema' then
    fallos := fallos || '[102] evento suspendido incompleto; ';
  end if;
  select count(*) into v_n from public.notificaciones where tipo = 'empleado_suspendido' and entidad_id = v_emp;
  if v_n <> 1 then fallos := fallos || '[102] suspender no genero la notificacion; '; end if;
  select count(*) into v_n from public.contexto_actual();
  if v_n <> 0 then fallos := fallos || '[102] suspender dejo el contexto marcado; '; end if;

  begin
    perform public.empleado_suspender_interno(v_emp, 'otra vez');
    fallos := fallos || '[102] suspender acepto a un Suspendido; ';
  exception when others then
    if sqlerrm not like '%Solo se puede suspender%' then fallos := fallos || '[102] doble suspension rechazada por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  select fecha_alta into v_fecha from public.empleados where id = v_emp;
  perform public.empleado_reactivar_interno(v_emp, 'Sin cargos');
  select fecha_alta into v_fecha2 from public.empleados where id = v_emp;
  if (select estado::text from public.empleados where id = v_emp) <> 'Activo' then fallos := fallos || '[102] reactivar no dejo Activo; '; end if;
  if v_fecha2 is distinct from v_fecha then fallos := fallos || '[102] reactivar toco fecha_alta; '; end if;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'reactivado' and detalle = 'Sin cargos';
  if v_n <> 1 then fallos := fallos || '[102] falta el evento reactivado; '; end if;
  begin
    perform public.empleado_reactivar_interno(v_emp);
    fallos := fallos || '[102] reactivar acepto a un Activo; ';
  exception when others then
    if sqlerrm not like '%ya est% Activo%' then fallos := fallos || '[102] reactivar un Activo rechazado por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [102c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [102c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 102-d: dar_baja (un solo argumento: mismo comportamiento que la 086, mas
-- evento) con y sin motivo, y reingresar_empleado. Modo estricto.
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_area uuid;
  v_emp uuid;
  v_cr uuid;
  v_cp uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_n int;
  v_ev record;
  fallos text := '';
begin
  update public.empleados_ajustes set valor = true where clave = 'exigir_contexto_rpc';
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 102d') returning id into v_empresa;
  insert into public.areas_obras (nombre) values ('__TEST_CI__ Area 102d') returning id into v_area;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, fecha_alta)
    values ('Test', 'CI 102d', '99010204', v_empresa, '2020-01-15') returning id into v_emp;
  insert into public.plataformas (id, nombre) values ('__test_ci_102d__', '__TEST_CI__ Plataforma 102d');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_102d__', '__test_ci_102d_r__@correo.test', 'reutilizable') returning id into v_cr;
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_102d__', '__test_ci_102d_p__@correo.test', 'personal') returning id into v_cp;
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cr, v_emp);
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cp, v_emp);

  perform public.empleado_dar_baja_interno(v_emp);
  if (select estado::text from public.empleados where id = v_emp) <> 'Inactivo' then fallos := fallos || '[102] la baja no dejo Inactivo; '; end if;
  select count(*) into v_n from public.asignaciones_cuenta where empleado_id = v_emp and fecha_fin is null;
  if v_n <> 0 then fallos := fallos || '[102] la baja dejo asignaciones de cuenta abiertas; '; end if;
  select count(*) into v_n from public.asignaciones_cuenta where empleado_id = v_emp and fecha_fin = v_hoy and notas = 'Baja del empleado';
  if v_n <> 2 then fallos := fallos || '[102] la baja no cerro con fecha de Lima y nota; '; end if;
  if (select deleted_at from public.cuentas where id = v_cp) is null then fallos := fallos || '[102] la baja no dio de baja la cuenta personal; '; end if;
  if (select deleted_at from public.cuentas where id = v_cr) is not null or (select requiere_rotacion from public.cuentas where id = v_cr) is not true then
    fallos := fallos || '[102] la cuenta reutilizable debia quedar viva y por rotar; ';
  end if;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'baja_ejecutada' and detalle is null and valor_nuevo = 'Inactivo';
  if v_n <> 1 then fallos := fallos || '[102] falta el evento baja_ejecutada sin motivo; '; end if;

  perform public.empleado_dar_baja_interno(v_emp);
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'baja_ejecutada';
  if v_n <> 1 then fallos := fallos || '[102] una segunda baja repitio el evento; '; end if;

  begin
    perform public.dar_baja_empleado(v_emp);
    fallos := fallos || '[102] dar_baja_empleado de un argumento no rechazo la llamada sin sesion; ';
  exception when insufficient_privilege then
    null;
  when others then
    fallos := fallos || '[102] dar_baja_empleado de un argumento fallo con otro error: ' || sqlerrm || '; ';
  end;

  perform public.empleado_dar_baja_interno(v_emp, 'Fin de contrato');
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'baja_ejecutada' and detalle = 'Fin de contrato';
  if v_n <> 0 then fallos := fallos || '[102] una baja repetida sobre un Inactivo registro un evento; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [102d] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [102d]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 102-d2: reingresar_empleado (interna) con datos, con la baja con motivo.
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_area uuid;
  v_emp uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_n int;
  v_ev record;
  fallos text := '';
begin
  update public.empleados_ajustes set valor = true where clave = 'exigir_contexto_rpc';
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 102d2') returning id into v_empresa;
  insert into public.areas_obras (nombre) values ('__TEST_CI__ Area 102d') returning id into v_area;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, fecha_alta)
    values ('Test', 'CI 102d2', '99010205', v_empresa, '2020-01-15') returning id into v_emp;
  perform public.empleado_dar_baja_interno(v_emp, 'Fin de contrato');
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'baja_ejecutada' and detalle = 'Fin de contrato';
  if v_n <> 1 then fallos := fallos || '[102] la baja con motivo no registro el motivo; '; end if;

  perform public.empleado_reingresar_interno(v_emp, jsonb_build_object('cargo', 'Operario', 'area_obra_id', v_area, 'clave_ignorada', 'x'));
  select * into v_ev from public.empleados where id = v_emp;
  if v_ev.estado::text <> 'Activo' or v_ev.fecha_alta is distinct from v_hoy or v_ev.cargo is distinct from 'Operario' or v_ev.area_obra_id is distinct from v_area then
    fallos := fallos || '[102] el reingreso no dejo Activo con fecha de hoy y los datos; ';
  end if;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'reingreso';
  if v_n <> 1 then fallos := fallos || '[102] falta el evento reingreso; '; end if;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp
    and ((evento = 'cargo_cambiado' and valor_nuevo = 'Operario') or (evento = 'area_cambiada' and valor_nuevo = '__TEST_CI__ Area 102d'));
  if v_n <> 2 then fallos := fallos || '[102] el reingreso no registro cargo y area; '; end if;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'estado_cambiado';
  if v_n <> 0 then fallos := fallos || '[102] el reingreso duplico el estado en estado_cambiado; '; end if;

  begin
    perform public.empleado_reingresar_interno(v_emp);
    fallos := fallos || '[102] reingresar acepto a un Activo; ';
  exception when others then
    if sqlerrm not like '%Solo se puede reingresar%' then fallos := fallos || '[102] reingresar un Activo rechazado por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  perform public.empleado_dar_baja_interno(v_emp, 'Segunda baja');
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'baja_ejecutada' and detalle = 'Segunda baja';
  if v_n <> 1 then fallos := fallos || '[102] la baja con motivo no registro el motivo; '; end if;
  begin
    perform public.empleado_reingresar_interno(v_emp, jsonb_build_object('area_obra_id', gen_random_uuid()));
    fallos := fallos || '[102] reingresar acepto un area inexistente; ';
  exception when others then
    if sqlerrm not like '%no existe%' then fallos := fallos || '[102] area inexistente rechazada por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [102d2] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [102d2]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 102-e: guards sin sesion (SQLSTATE 42501) de las 5 RPC publicas, EXECUTE y
-- privilegios de tabla, firma unica de dar_baja_empleado, whitelist.
-- ------------------------------------------------------------
do $$
declare
  v_sql text;
  fallos text := '';
begin
  foreach v_sql in array array[
    'select public.suspender_empleado(gen_random_uuid(), ''x'')',
    'select public.reactivar_empleado(gen_random_uuid())',
    'select public.reingresar_empleado(gen_random_uuid())',
    'select public.dar_baja_empleado(gen_random_uuid(), ''x'')',
    'select public.registrar_revision_accesos(gen_random_uuid())'
  ] loop
    begin
      execute v_sql;
      fallos := fallos || '[102] sin sesion no se rechazo: ' || v_sql || '; ';
    exception when insufficient_privilege then
      null;
    when others then
      fallos := fallos || '[102] rechazo con otro error (' || sqlstate || ') en ' || v_sql || '; ';
    end;
  end loop;

  if to_regprocedure('public.dar_baja_empleado(uuid)') is not null then
    fallos := fallos || '[102] sigue existiendo dar_baja_empleado(uuid); ';
  end if;
  if has_function_privilege('authenticated', 'public.marcar_contexto(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.contexto_actual()', 'execute')
     or has_function_privilege('authenticated', 'public.empleado_dar_baja_interno(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.dar_baja_empleado(uuid,text)', 'execute') then
    fallos := fallos || '[102] EXECUTE abierto donde no corresponde; ';
  end if;
  if not has_function_privilege('authenticated', 'public.suspender_empleado(uuid,text)', 'execute') then
    fallos := fallos || '[102] suspender_empleado sin EXECUTE para authenticated; ';
  end if;
  if has_table_privilege('authenticated', 'public.empleado_eventos', 'insert')
     or has_table_privilege('authenticated', 'public.empleado_eventos', 'update')
     or has_table_privilege('authenticated', 'public.empleado_eventos', 'delete')
     or has_table_privilege('authenticated', 'public.contexto_transaccion', 'select')
     or has_table_privilege('anon', 'public.empleado_eventos', 'select') then
    fallos := fallos || '[102] privilegios de tabla abiertos donde no corresponde; ';
  end if;
  if (select count(*) from public.transiciones_empleado_permitidas) <> 5
     or exists (select 1 from public.transiciones_empleado_permitidas where origen = 'Inactivo' and destino = 'Suspendido') then
    fallos := fallos || '[102] whitelist de transiciones inesperada; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [102e] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [102e]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 102-f: notificaciones_tipo_check ampliado conservando los valores previos,
-- vista del ultimo control de accesos y backfill idempotente.
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_n int;
  fallos text := '';
begin
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino)
    values ('empleado_suspendido', 'empleado', gen_random_uuid(), 't', '/x');
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino)
    values ('ticket_correo_fallido', 'ticket', gen_random_uuid(), 't', '/x');
  begin
    insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino)
      values ('tipo_inventado', 'empleado', gen_random_uuid(), 't', '/x');
    fallos := fallos || '[102] notificaciones acepto un tipo inventado; ';
  exception when check_violation then
    null;
  end;

  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 102f') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Test', 'CI 102f', '99010206', v_empresa) returning id into v_emp;
  insert into public.empleado_revisiones_acceso (empleado_id, revisado_at, nota) values (v_emp, now() - interval '30 days', 'primera');
  insert into public.empleado_revisiones_acceso (empleado_id, revisado_at, nota) values (v_emp, now(), 'segunda');
  select count(*) into v_n from public.v_empleado_ultima_revision_acceso where empleado_id = v_emp and nota = 'segunda';
  if v_n <> 1 then fallos := fallos || '[102] la vista no devolvio la ultima revision; '; end if;

  select count(*) into v_n from public.empleados e where not exists (
    select 1 from public.empleado_eventos x where x.empleado_id = e.id and x.evento = 'creado');
  if v_n <> 0 then fallos := fallos || '[102] hay empleados sin evento creado; '; end if;
  insert into public.empleado_eventos (empleado_id, evento, user_id, rol_actor, detalle, created_at)
    select e.id, 'creado', e.created_by, 'legado', 'Registro anterior a la auditoria', e.created_at
      from public.empleados e
     where not exists (select 1 from public.empleado_eventos x where x.empleado_id = e.id and x.evento = 'creado');
  get diagnostics v_n = row_count;
  if v_n <> 0 then fallos := fallos || '[102] el backfill no es idempotente; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [102f] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [102f]: %', fallos;
  end if;
end $$;

-- ============================================================
-- Bloques 101-a a 101-i — migración 101 (RPC transaccionales de cuentas,
-- equipos y licencias, auditoría CRUD de cuentas, eventos de equipo).
-- Agregados 2026-10-01 (Ciclo 21, H2). Requieren 099, 100 y 101 aplicadas:
-- contra una base sin ellas fallan (es lo esperado).
--
-- Esta conexión (project_admin) no tiene auth.uid() y el servidor no admite cambiar
-- la configuración de sesión, así que NO puede llamar a las RPC públicas con un permiso
-- válido: cada RPC pública es guard (exigir_permiso) + función núcleo
-- <nombre>_nucleo con TODA la lógica, y estos bloques ejercen los núcleos
-- (caso feliz y rechazos con datos sintéticos) y las RPC públicas solo para
-- verificar el rechazo 42501 sin sesión (101-i). Mismo límite que el resto
-- del archivo: la CARRERA real entre dos sesiones no se prueba aquí.
-- Un bloque por tema por el límite de línea de comandos de los anteriores.
-- Los empleados dados de baja se insertan YA 'Inactivo' (no se actualizan:
-- la migración 102 restringe el UPDATE de estado a la RPC de baja).
-- ============================================================

-- ------------------------------------------------------------
-- Bloque 101-a — [101] crear_cuenta_asignada: caso feliz, rechazos,
-- atomicidad y auditoría de alta (trigger cuentas_log_evento)
-- ------------------------------------------------------------
do $$
declare
  v_emp uuid;
  v_baja uuid;
  v_asig public.asignaciones_cuenta;
  v_c public.cuentas;
  v_n int;
  v_det text;
  v_plat text;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 101a');
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    select 'Test', 'CI 101a', '98101001', e.id from public.empresas e where e.nombre = '__TEST_CI__ Empresa 101a'
    returning id into v_emp;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado)
    select 'Test', 'CI 101a Baja', '98101002', e.id, 'Inactivo' from public.empresas e where e.nombre = '__TEST_CI__ Empresa 101a'
    returning id into v_baja;
  insert into public.plataformas (id, nombre) values ('__test_ci_101a__', '__TEST_CI__ Plataforma 101a');

  v_asig := public.crear_cuenta_asignada_nucleo('__test_ci_101a__', '  __TEST_CI_101A__@Correo.TEST ', v_emp,
    'enc2:AAAA:BBBB', '  https://x.test  ', 'una' || repeat(' ', 3) || 'nota', 'reutilizable');
  select * into v_c from public.cuentas where id = v_asig.cuenta_id;
  if v_c.usuario <> '__test_ci_101a__@correo.test' then fallos := fallos || '[101] el usuario no se normalizó; '; end if;
  if v_c.password <> 'enc2:AAAA:BBBB' or v_c.last_password_change is null then fallos := fallos || '[101] password o last_password_change mal; '; end if;
  if v_c.url <> 'https://x.test' or v_c.notas <> 'una nota' or v_c.tipo_cuenta <> 'reutilizable' then fallos := fallos || '[101] url/notas/tipo mal; '; end if;
  if v_asig.empleado_id <> v_emp or v_asig.fecha_fin is not null
     or v_asig.fecha_inicio <> (now() at time zone 'America/Lima')::date then fallos := fallos || '[101] la asignación inicial es incorrecta; '; end if;

  -- auditoría de alta: una fila, sin la contraseña
  select count(*), max(detalle), max(plataforma) into v_n, v_det, v_plat
    from public.accesos_log where cuenta_id = v_c.id and accion = 'creado';
  if v_n <> 1 then fallos := fallos || '[101] el alta no dejó una fila creado en accesos_log (' || v_n || '); '; end if;
  if v_det like '%enc2%' or v_det like '%AAAA%' then fallos := fallos || '[101] accesos_log guardó la contraseña; '; end if;
  if v_plat <> '__TEST_CI__ Plataforma 101a' then fallos := fallos || '[101] accesos_log sin el nombre de la plataforma; '; end if;

  -- personal por defecto y sin contraseña: last_password_change NULL
  v_asig := public.crear_cuenta_asignada_nucleo('__test_ci_101a__', '__test_ci_101a_b__@correo.test', v_emp);
  select * into v_c from public.cuentas where id = v_asig.cuenta_id;
  if v_c.tipo_cuenta <> 'personal' or v_c.password is not null or v_c.last_password_change is not null then
    fallos := fallos || '[101] la cuenta por defecto no es personal sin contraseña; ';
  end if;

  -- rechazos (cada uno debe dejar 0 cuentas nuevas: todo o nada)
  begin
    perform public.crear_cuenta_asignada_nucleo('__test_ci_101a__', '__test_ci_101a__@correo.test', v_emp);
    fallos := fallos || '[101] permitió un usuario duplicado en la plataforma; ';
  exception when unique_violation then null;
  when others then fallos := fallos || '[101] el duplicado falló con otro error (' || sqlstate || '); ';
  end;
  begin
    perform public.crear_cuenta_asignada_nucleo('__test_ci_101a__', '__test_ci_101a_c__@correo.test', v_emp, 'en claro');
    fallos := fallos || '[101] aceptó una contraseña sin cifrar; ';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm not like '%cifrada%' then fallos := fallos || '[101] contraseña en claro: error inesperado ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.crear_cuenta_asignada_nucleo('__test_ci_101a__', '__test_ci_101a_d__@correo.test', v_baja);
    fallos := fallos || '[101] asignó una cuenta a un empleado dado de baja; ';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm not like '%baja%' then fallos := fallos || '[101] empleado de baja: error inesperado ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.crear_cuenta_asignada_nucleo('__test_ci_101a__', '__test_ci_101a_e__@correo.test', gen_random_uuid());
    fallos := fallos || '[101] aceptó un empleado inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] empleado inexistente: error ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.crear_cuenta_asignada_nucleo('__no_existe__', '__test_ci_101a_f__@correo.test', v_emp);
    fallos := fallos || '[101] aceptó una plataforma inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] plataforma inexistente: error ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.crear_cuenta_asignada_nucleo('__test_ci_101a__', '   ', v_emp);
    fallos := fallos || '[101] aceptó un usuario vacío; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[101] usuario vacío: error ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.crear_cuenta_asignada_nucleo('__test_ci_101a__', '__test_ci_101a_g__@correo.test', v_emp, null, null, null, 'inventado');
    fallos := fallos || '[101] aceptó un tipo de cuenta inventado; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[101] tipo inventado: error ' || sqlstate || '; '; end if;
  end;
  select count(*) into v_n from public.cuentas where usuario like '__test_ci_101a_%' and usuario not in ('__test_ci_101a__@correo.test', '__test_ci_101a_b__@correo.test');
  if v_n <> 0 then fallos := fallos || '[101] un alta rechazada dejó ' || v_n || ' cuenta(s) a medias; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [101a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 101-b — [101] traspasar_cuenta: rotación, rechazos y atomicidad
-- ------------------------------------------------------------
do $$
declare
  v_e1 uuid;
  v_e2 uuid;
  v_baja uuid;
  v_a1 public.asignaciones_cuenta;
  v_a2 public.asignaciones_cuenta;
  v_a3 public.asignaciones_cuenta;
  v_p public.asignaciones_cuenta;
  v_c public.cuentas;
  v_old public.asignaciones_cuenta;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 101b');
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    select 'Test', 'CI 101b Uno', '98101011', id from public.empresas where nombre = '__TEST_CI__ Empresa 101b' returning id into v_e1;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    select 'Test', 'CI 101b Dos', '98101012', id from public.empresas where nombre = '__TEST_CI__ Empresa 101b' returning id into v_e2;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado)
    select 'Test', 'CI 101b Baja', '98101013', id, 'Inactivo' from public.empresas where nombre = '__TEST_CI__ Empresa 101b' returning id into v_baja;
  insert into public.plataformas (id, nombre) values ('__test_ci_101b__', '__TEST_CI__ Plataforma 101b');

  v_a1 := public.crear_cuenta_asignada_nucleo('__test_ci_101b__', '__test_ci_101b__@correo.test', v_e1, 'enc2:AAAA:BBBB', null, null, 'compartida');
  v_p := public.crear_cuenta_asignada_nucleo('__test_ci_101b__', '__test_ci_101b_p__@correo.test', v_e1);

  -- rechazos que no deben tocar la asignación vigente (todo o nada)
  begin
    perform public.traspasar_cuenta_nucleo(v_a1.id, v_baja, null, null);
    fallos := fallos || '[101] traspasó a un empleado de baja; ';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm not like '%no está activo%' then fallos := fallos || '[101] destino de baja: error ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.traspasar_cuenta_nucleo(v_a1.id, v_e1, null, null);
    fallos := fallos || '[101] traspasó al mismo empleado; ';
  exception when others then null;
  end;
  begin
    perform public.traspasar_cuenta_nucleo(v_a1.id, v_e2, null, 'en claro');
    fallos := fallos || '[101] aceptó una contraseña sin cifrar en el traspaso; ';
  exception when others then
    if sqlerrm not like '%cifrada%' then fallos := fallos || '[101] password en claro: error inesperado; '; end if;
  end;
  begin
    perform public.traspasar_cuenta_nucleo(v_p.id, v_e2, null, null);
    fallos := fallos || '[101] traspasó una cuenta personal; ';
  exception when others then
    if sqlerrm not like '%personal%' then fallos := fallos || '[101] personal: error inesperado; '; end if;
  end;
  begin
    perform public.traspasar_cuenta_nucleo(gen_random_uuid(), v_e2, null, null);
    fallos := fallos || '[101] traspasó una asignación inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] asignación inexistente: error ' || sqlstate || '; '; end if;
  end;
  select * into v_old from public.asignaciones_cuenta where id = v_a1.id;
  if v_old.fecha_fin is not null then fallos := fallos || '[101] un traspaso rechazado cerró la asignación; '; end if;

  -- traspaso con contraseña nueva: cierra, rota (marca limpia) y abre la nueva
  v_a2 := public.traspasar_cuenta_nucleo(v_a1.id, v_e2, null, 'enc2:EEEE:FFFF');
  select * into v_old from public.asignaciones_cuenta where id = v_a1.id;
  select * into v_c from public.cuentas where id = v_a1.cuenta_id;
  if v_old.fecha_fin <> v_hoy or v_old.notas <> 'Traspaso a otro empleado' then fallos := fallos || '[101] la asignación vieja no quedó cerrada con la nota por defecto; '; end if;
  if v_a2.empleado_id <> v_e2 or v_a2.fecha_fin is not null or v_a2.cuenta_id <> v_a1.cuenta_id then fallos := fallos || '[101] la asignación nueva es incorrecta; '; end if;
  if v_c.password <> 'enc2:EEEE:FFFF' or v_c.requiere_rotacion then fallos := fallos || '[101] la rotación no dejó password nueva y marca limpia; '; end if;

  -- traspaso sin contraseña: la marca de rotación queda como aviso
  v_a3 := public.traspasar_cuenta_nucleo(v_a2.id, v_e1, 'cambio de obra', null);
  select * into v_old from public.asignaciones_cuenta where id = v_a2.id;
  select * into v_c from public.cuentas where id = v_a1.cuenta_id;
  if v_old.notas <> 'cambio de obra' then fallos := fallos || '[101] el traspaso no conservó las notas; '; end if;
  if v_c.requiere_rotacion is distinct from true then fallos := fallos || '[101] el traspaso sin password no dejó requiere_rotacion; '; end if;

  -- la asignación ya cerrada no se traspasa
  begin
    perform public.traspasar_cuenta_nucleo(v_a1.id, v_e2, null, null);
    fallos := fallos || '[101] traspasó una asignación cerrada; ';
  exception when others then
    if sqlerrm not like '%cerrada%' then fallos := fallos || '[101] asignación cerrada: error inesperado; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [101b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 101-c — [101] cerrar_asignacion_cuenta, revocar_cuenta_personal
-- (delegación) y auditoría de edición/baja de cuentas
-- ------------------------------------------------------------
do $$
declare
  v_e1 uuid;
  v_a public.asignaciones_cuenta;
  v_r public.asignaciones_cuenta;
  v_cuenta uuid;
  v_n1 int;
  v_n2 int;
  v_det text;
  v_sec boolean;
  v_delega boolean;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 101c');
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    select 'Test', 'CI 101c', '98101021', id from public.empresas where nombre = '__TEST_CI__ Empresa 101c' returning id into v_e1;
  insert into public.plataformas (id, nombre) values ('__test_ci_101c__', '__TEST_CI__ Plataforma 101c');
  v_a := public.crear_cuenta_asignada_nucleo('__test_ci_101c__', '__test_ci_101c__@correo.test', v_e1, 'enc2:AAAA:BBBB', null, 'orig', 'reutilizable');
  v_cuenta := v_a.cuenta_id;

  -- editar: una fila editado con los campos, sin valores de contraseña
  update public.cuentas set notas = 'otra', password = 'enc2:CCCC:DDDD' where id = v_cuenta;
  select count(*), max(detalle) into v_n1, v_det from public.accesos_log where cuenta_id = v_cuenta and accion = 'editado';
  if v_n1 <> 1 or v_det not like '%notas%' or v_det not like '%contraseña cambiada%' or v_det like '%CCCC%' then
    fallos := fallos || '[101] la edición no se auditó bien (' || v_n1 || ', ' || coalesce(v_det, 'sin detalle') || '); ';
  end if;

  -- cerrar: fecha de Lima y notas; el UPDATE anidado de requiere_rotacion NO genera ruido
  v_r := public.cerrar_asignacion_cuenta_nucleo(v_a.id, '  fin de contrato  ');
  select count(*) into v_n2 from public.accesos_log where cuenta_id = v_cuenta and accion = 'editado';
  if v_r.fecha_fin <> v_hoy or v_r.notas <> 'fin de contrato' then fallos := fallos || '[101] el cierre no dejó fecha de Lima y notas; '; end if;
  if v_n2 <> v_n1 then fallos := fallos || '[101] el aviso de rotación anidado generó una fila editado; '; end if;
  if not (select requiere_rotacion from public.cuentas where id = v_cuenta) then fallos := fallos || '[101] el cierre no marcó requiere_rotacion; '; end if;

  -- cerrar otra vez: sin cambios (ni fecha ni notas)
  v_r := public.cerrar_asignacion_cuenta_nucleo(v_a.id, 'otra nota');
  if v_r.notas <> 'fin de contrato' then fallos := fallos || '[101] cerrar una asignación cerrada pisó las notas; '; end if;
  begin
    perform public.cerrar_asignacion_cuenta_nucleo(gen_random_uuid(), null);
    fallos := fallos || '[101] cerró una asignación inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] cerrar inexistente: error ' || sqlstate || '; '; end if;
  end;

  -- baja lógica: una fila eliminado
  update public.cuentas set deleted_at = now() where id = v_cuenta;
  select count(*) into v_n2 from public.accesos_log where cuenta_id = v_cuenta and accion = 'eliminado';
  if v_n2 <> 1 then fallos := fallos || '[101] la baja lógica no dejó una fila eliminado (' || v_n2 || '); '; end if;

  -- un UPDATE directo sin cambios relevantes no genera fila
  update public.cuentas set updated_at = now() where id = v_cuenta;
  select count(*) into v_n2 from public.accesos_log where cuenta_id = v_cuenta;
  if v_n2 <> 3 then fallos := fallos || '[101] un UPDATE sin cambios relevantes generó ruido (' || v_n2 || ' filas en total); '; end if;

  -- revocar_cuenta_personal conserva su forma y delega el cierre
  select prosecdef, position('cerrar_asignacion_cuenta' in prosrc) > 0 into v_sec, v_delega
    from pg_proc where pronamespace = 'public'::regnamespace and proname = 'revocar_cuenta_personal';
  if v_sec then fallos := fallos || '[101] revocar_cuenta_personal pasó a SECURITY DEFINER; '; end if;
  if not v_delega then fallos := fallos || '[101] revocar_cuenta_personal no delega en cerrar_asignacion_cuenta; '; end if;
  begin
    perform public.revocar_cuenta_personal(v_a.id);
    fallos := fallos || '[101] revocar_cuenta_personal no rechazó una llamada sin sesión de staff; ';
  exception when others then null;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [101c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 101-d — [101] mover_equipo y asignar_equipo
-- ------------------------------------------------------------
do $$
declare
  v_e1 uuid;
  v_e2 uuid;
  v_baja uuid;
  v_u1 uuid;
  v_u2 uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_m public.asignaciones_equipo;
  v_x public.asignaciones_equipo;
  v_old public.asignaciones_equipo;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 101d');
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    select 'Test', 'CI 101d Uno', '98101031', id from public.empresas where nombre = '__TEST_CI__ Empresa 101d' returning id into v_e1;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    select 'Test', 'CI 101d Dos', '98101032', id from public.empresas where nombre = '__TEST_CI__ Empresa 101d' returning id into v_e2;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado)
    select 'Test', 'CI 101d Baja', '98101033', id, 'Inactivo' from public.empresas where nombre = '__TEST_CI__ Empresa 101d' returning id into v_baja;
  insert into public.ubicaciones (nombre, tipo) values ('__TEST_CI__ Ubicación 101d 1', 'otro') returning id into v_u1;
  insert into public.ubicaciones (nombre, tipo) values ('__TEST_CI__ Ubicación 101d 2', 'otro') returning id into v_u2;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_101d__', '__TEST_CI__ Tipo 101d');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_101D_A__', '__test_ci_101d__') returning id into v_a;
  insert into public.equipos (codigo, tipo_id, estado) values ('__TEST_CI_101D_B__', '__test_ci_101d__', 'en_reparacion') returning id into v_b;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_101D_C__', '__test_ci_101d__') returning id into v_c;

  -- mover: libre a ubicación, y de ubicación a otra (cierra con motivo movimiento)
  v_m := public.mover_equipo_nucleo(v_a, v_u1);
  if v_m.ubicacion_id <> v_u1 or v_m.empleado_id is not null or v_m.fecha_fin is not null then fallos := fallos || '[101] mover no creó la asignación a ubicación; '; end if;
  v_x := public.mover_equipo_nucleo(v_a, v_u2);
  select * into v_old from public.asignaciones_equipo where id = v_m.id;
  if v_old.fecha_fin <> v_hoy or v_old.motivo_cierre <> 'movimiento' then fallos := fallos || '[101] mover no cerró la ubicación previa con motivo movimiento; '; end if;

  -- asignar a persona: retira la ubicación con entrega_a_empleado
  v_m := public.asignar_equipo_nucleo(v_a, v_e1, 'buen' || repeat(' ', 3) || 'estado');
  select * into v_old from public.asignaciones_equipo where id = v_x.id;
  if v_old.fecha_fin <> v_hoy or v_old.motivo_cierre <> 'entrega_a_empleado' then fallos := fallos || '[101] asignar no retiró la ubicación con entrega_a_empleado; '; end if;
  if v_m.empleado_id <> v_e1 or v_m.condicion_entrega <> 'buen estado' or v_m.fecha_inicio <> v_hoy then fallos := fallos || '[101] la asignación a persona es incorrecta; '; end if;
  if not (select tiene_asignacion_activa from public.equipos where id = v_a) then fallos := fallos || '[101] la disponibilidad derivada no se actualizó; '; end if;

  -- rechazos
  begin
    perform public.asignar_equipo_nucleo(v_a, v_e2, null);
    fallos := fallos || '[101] asignó un equipo que ya tiene portador; ';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm not like '%portador activo%' then fallos := fallos || '[101] portador activo: error inesperado ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.mover_equipo_nucleo(v_a, v_u1);
    fallos := fallos || '[101] movió un equipo que tiene una persona; ';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm not like '%lo tiene una persona%' then fallos := fallos || '[101] mover con persona: error inesperado ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.asignar_equipo_nucleo(v_b, v_e1, null);
    fallos := fallos || '[101] asignó un equipo no operativo; ';
  exception when others then
    if sqlerrm not like '%no está operativo%' then fallos := fallos || '[101] no operativo: error inesperado; '; end if;
  end;
  begin
    perform public.mover_equipo_nucleo(v_b, v_u1);
    fallos := fallos || '[101] movió un equipo no operativo; ';
  exception when others then null;
  end;
  begin
    perform public.asignar_equipo_nucleo(v_c, v_baja, null);
    fallos := fallos || '[101] asignó un equipo a un empleado de baja; ';
  exception when others then
    if sqlerrm not like '%no está activo%' then fallos := fallos || '[101] empleado de baja: error inesperado; '; end if;
  end;
  begin
    perform public.asignar_equipo_nucleo(gen_random_uuid(), v_e1, null);
    fallos := fallos || '[101] asignó un equipo inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] equipo inexistente: error ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.mover_equipo_nucleo(v_c, gen_random_uuid());
    fallos := fallos || '[101] movió a una ubicación inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] ubicación inexistente: error ' || sqlstate || '; '; end if;
  end;
  if exists (select 1 from public.asignaciones_equipo where equipo_id = v_c) then fallos := fallos || '[101] un rechazo dejó una asignación a medias; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [101d] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101d]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 101-e — [101] devolver_equipo
-- ------------------------------------------------------------
do $$
declare
  v_e1 uuid;
  v_u1 uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_asig_a public.asignaciones_equipo;
  v_asig_b public.asignaciones_equipo;
  v_asig_c public.asignaciones_equipo;
  v_ub public.asignaciones_equipo;
  v_eq public.equipos;
  v_old public.asignaciones_equipo;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 101e');
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    select 'Test', 'CI 101e', '98101041', id from public.empresas where nombre = '__TEST_CI__ Empresa 101e' returning id into v_e1;
  insert into public.ubicaciones (nombre, tipo) values ('__TEST_CI__ Ubicación 101e', 'otro') returning id into v_u1;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_101e__', '__TEST_CI__ Tipo 101e');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_101E_A__', '__test_ci_101e__') returning id into v_a;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_101E_B__', '__test_ci_101e__') returning id into v_b;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_101E_C__', '__test_ci_101e__') returning id into v_c;
  v_asig_a := public.asignar_equipo_nucleo(v_a, v_e1, null);
  v_asig_b := public.asignar_equipo_nucleo(v_b, v_e1, null);
  v_asig_c := public.asignar_equipo_nucleo(v_c, v_e1, null);

  -- motivo fuera del dominio y asignación inexistente
  begin
    perform public.devolver_equipo_nucleo(v_asig_a.id, null, 'movimiento', false);
    fallos := fallos || '[101] aceptó el motivo movimiento en una devolución; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[101] motivo inválido: error ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.devolver_equipo_nucleo(gen_random_uuid(), null, 'devolucion', false);
    fallos := fallos || '[101] devolvió una asignación inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] asignación inexistente: error ' || sqlstate || '; '; end if;
  end;
  select * into v_old from public.asignaciones_equipo where id = v_asig_a.id;
  if v_old.fecha_fin is not null then fallos := fallos || '[101] un rechazo cerró la asignación; '; end if;

  -- devolución normal por defecto: queda operativo y libre
  v_eq := public.devolver_equipo_nucleo(v_asig_a.id, '  sin   daños ');
  select * into v_old from public.asignaciones_equipo where id = v_asig_a.id;
  if v_old.fecha_fin <> v_hoy or v_old.motivo_cierre <> 'devolucion' or v_old.condicion_devolucion <> 'sin daños' then fallos := fallos || '[101] la devolución por defecto es incorrecta; '; end if;
  if v_eq.estado <> 'operativo' or v_eq.tiene_asignacion_activa then fallos := fallos || '[101] el equipo devuelto no quedó operativo y libre; '; end if;

  -- cerrada: no se devuelve dos veces
  begin
    perform public.devolver_equipo_nucleo(v_asig_a.id, null, 'devolucion', false);
    fallos := fallos || '[101] devolvió dos veces la misma asignación; ';
  exception when others then
    if sqlerrm not like '%cerrada%' then fallos := fallos || '[101] doble devolución: error inesperado; '; end if;
  end;

  -- a reparación
  v_eq := public.devolver_equipo_nucleo(v_asig_b.id, 'no enciende', 'cambio_equipo', true);
  if v_eq.estado <> 'en_reparacion' then fallos := fallos || '[101] p_a_reparacion no dejó el equipo en reparación; '; end if;

  -- pérdida tiene prioridad sobre reparación
  v_eq := public.devolver_equipo_nucleo(v_asig_c.id, null, 'perdida', true);
  if v_eq.estado <> 'perdido' then fallos := fallos || '[101] perdida no dejó el equipo perdido (prioridad sobre reparación); '; end if;
  if not exists (select 1 from public.eventos_equipo where equipo_id = v_c and evento = 'estado_cambiado') then fallos := fallos || '[101] la pérdida no dejó evento estado_cambiado; '; end if;

  -- una asignación a ubicación no es una devolución de persona
  v_ub := public.mover_equipo_nucleo(v_a, v_u1);
  begin
    perform public.devolver_equipo_nucleo(v_ub.id, null, 'devolucion', false);
    fallos := fallos || '[101] devolvió una asignación a ubicación; ';
  exception when others then
    if sqlerrm not like '%persona%' then fallos := fallos || '[101] ubicación como devolución: error inesperado; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [101e] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101e]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 101-f — [101] migrar_importacion_equipo (una fila)
-- ------------------------------------------------------------
do $$
declare
  v_e1 uuid;
  v_baja uuid;
  v_u1 uuid;
  v_f uuid;
  v_eq public.equipos;
  v_n int;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 101f');
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    select 'Test', 'CI 101f', '98101051', id from public.empresas where nombre = '__TEST_CI__ Empresa 101f' returning id into v_e1;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado)
    select 'Test', 'CI 101f Baja', '98101052', id, 'Inactivo' from public.empresas where nombre = '__TEST_CI__ Empresa 101f' returning id into v_baja;
  insert into public.ubicaciones (nombre, tipo) values ('__TEST_CI__ Ubicación 101f', 'otro') returning id into v_u1;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_101f__', '__TEST_CI__ Tipo 101f');

  -- a una persona: equipo normalizado, asignado y fila de la bandeja borrada
  insert into public.equipos_importacion (codigo, tipo_id, marca, modelo, serie, costo, notas, modo, empleado_id)
    values ('  __test_ci_101f_a__ ', '__test_ci_101f__', 'hp' || repeat(' ', 2) || 'pRObook', ' 450' || repeat(' ', 2) || 'g8 ', '__SERIE_101F_A__', 1500, ' obs ', 'empleado', v_e1)
    returning id into v_f;
  v_eq := public.migrar_importacion_equipo_nucleo(v_f);
  if v_eq.codigo <> '__TEST_CI_101F_A__' or v_eq.marca <> 'Hp Probook' or v_eq.modelo <> '450 g8' or v_eq.notas <> 'obs' then fallos := fallos || '[101] el equipo migrado no se normalizó; '; end if;
  if v_eq.moneda <> 'PEN' or v_eq.costo <> 1500 or v_eq.estado <> 'operativo' then fallos := fallos || '[101] costo, moneda o estado mal; '; end if;
  if not exists (select 1 from public.asignaciones_equipo where equipo_id = v_eq.id and empleado_id = v_e1 and fecha_fin is null) then fallos := fallos || '[101] no quedó asignado a la persona; '; end if;
  if exists (select 1 from public.equipos_importacion where id = v_f) then fallos := fallos || '[101] la fila de la bandeja no se borró; '; end if;

  -- p_datos pisa lo guardado: de disponible a ubicación, sin costo
  insert into public.equipos_importacion (codigo, tipo_id, modo) values ('__TEST_CI_101F_B__', '__test_ci_101f__', 'disponible') returning id into v_f;
  v_eq := public.migrar_importacion_equipo_nucleo(v_f,
    jsonb_build_object('modo', 'ubicacion', 'ubicacion_id', v_u1, 'serie', ' __SERIE_101F_B__ '));
  if v_eq.serie <> '__SERIE_101F_B__' or v_eq.moneda is not null then fallos := fallos || '[101] p_datos no se aplicó; '; end if;
  if not exists (select 1 from public.asignaciones_equipo where equipo_id = v_eq.id and ubicacion_id = v_u1 and fecha_fin is null) then fallos := fallos || '[101] no quedó en la ubicación; '; end if;

  -- estado no operativo sin asignación: se cambia al final
  insert into public.equipos_importacion (codigo, tipo_id, estado, modo) values ('__TEST_CI_101F_C__', '__test_ci_101f__', 'en_reparacion', 'disponible') returning id into v_f;
  v_eq := public.migrar_importacion_equipo_nucleo(v_f);
  if v_eq.estado <> 'en_reparacion' then fallos := fallos || '[101] el estado de la bandeja no se aplicó; '; end if;

  -- rechazos: cada uno deja la fila en la bandeja y ningún equipo nuevo
  insert into public.equipos_importacion (codigo, tipo_id, modo) values ('__TEST_CI_101F_A__', '__test_ci_101f__', 'disponible') returning id into v_f;
  begin
    perform public.migrar_importacion_equipo_nucleo(v_f);
    fallos := fallos || '[101] migró un código duplicado; ';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm not like '%Ya existe un equipo con el código%' then fallos := fallos || '[101] código duplicado: error ' || sqlstate || '; '; end if;
  end;
  update public.equipos_importacion set codigo = '__TEST_CI_101F_D__', tipo_id = null where id = v_f;
  begin
    perform public.migrar_importacion_equipo_nucleo(v_f);
    fallos := fallos || '[101] migró sin tipo; ';
  exception when others then
    if sqlerrm not like '%tipo%' then fallos := fallos || '[101] sin tipo: error inesperado; '; end if;
  end;
  update public.equipos_importacion set tipo_id = '__test_ci_101f__', estado = 'de_baja', modo = 'empleado', empleado_id = v_e1 where id = v_f;
  begin
    perform public.migrar_importacion_equipo_nucleo(v_f);
    fallos := fallos || '[101] migró un equipo no operativo asignado; ';
  exception when others then
    if sqlerrm not like '%no está operativo%' then fallos := fallos || '[101] no operativo asignado: error inesperado; '; end if;
  end;
  update public.equipos_importacion set estado = 'operativo', empleado_id = v_baja where id = v_f;
  begin
    perform public.migrar_importacion_equipo_nucleo(v_f);
    fallos := fallos || '[101] migró asignado a un empleado de baja; ';
  exception when others then
    if sqlerrm not like '%no está activo%' then fallos := fallos || '[101] empleado de baja: error inesperado; '; end if;
  end;
  begin
    perform public.migrar_importacion_equipo_nucleo(gen_random_uuid());
    fallos := fallos || '[101] migró una fila inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] fila inexistente: error ' || sqlstate || '; '; end if;
  end;
  select count(*) into v_n from public.equipos where codigo = '__TEST_CI_101F_D__';
  if v_n <> 0 or not exists (select 1 from public.equipos_importacion where id = v_f) then fallos := fallos || '[101] un rechazo dejó estado a medias; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [101f] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101f]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 101-g — [101] migrar_importacion_equipos (lote todo o nada)
-- ------------------------------------------------------------
do $$
declare
  v_f1 uuid;
  v_f2 uuid;
  v_f3 uuid;
  v_f4 uuid;
  v_r jsonb;
  v_n int;
  fallos text := '';
begin
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_101g__', '__TEST_CI__ Tipo 101g');
  insert into public.equipos_importacion (codigo, tipo_id, serie) values ('__TEST_CI_101G_1__', '__test_ci_101g__', '__SERIE_101G_1__') returning id into v_f1;
  insert into public.equipos_importacion (codigo, tipo_id) values ('__TEST_CI_101G_2__', '__test_ci_101g__') returning id into v_f2;
  insert into public.equipos_importacion (codigo, tipo_id) values ('__TEST_CI_101G_3__', '__test_ci_101g__') returning id into v_f3;
  insert into public.equipos_importacion (codigo, tipo_id) values ('__TEST_CI_101G_X__', null) returning id into v_f4;

  -- una bloqueada: no se migra ninguna y se informa cuál y por qué
  v_r := public.migrar_importacion_equipos_nucleo(array[v_f1, v_f2, v_f3, v_f4]);
  if (v_r->>'ok')::boolean or (v_r->>'migrados')::int <> 0 or jsonb_array_length(v_r->'bloqueados') <> 1 then fallos := fallos || '[101] el lote con una bloqueada no devolvió ok=false con 1 bloqueado: ' || v_r::text || '; '; end if;
  if (v_r->'bloqueados'->0->>'id')::uuid <> v_f4 or (v_r->'bloqueados'->0->>'motivo') not like '%tipo%' then fallos := fallos || '[101] la fila bloqueada o su motivo no son los esperados; '; end if;
  select count(*) into v_n from public.equipos where codigo like '__TEST_CI_101G_%';
  if v_n <> 0 then fallos := fallos || '[101] un lote bloqueado migró ' || v_n || ' equipo(s); '; end if;

  -- sin la bloqueada: migra las 3 y las borra de la bandeja
  v_r := public.migrar_importacion_equipos_nucleo(array[v_f1, v_f2, v_f3, v_f1]);
  if not (v_r->>'ok')::boolean or (v_r->>'migrados')::int <> 3 then fallos := fallos || '[101] el lote válido no migró 3: ' || v_r::text || '; '; end if;
  select count(*) into v_n from public.equipos where codigo like '__TEST_CI_101G_%';
  if v_n <> 3 then fallos := fallos || '[101] el lote válido creó ' || v_n || ' equipos; '; end if;
  if exists (select 1 from public.equipos_importacion where id in (v_f1, v_f2, v_f3)) then fallos := fallos || '[101] el lote no borró las filas migradas; '; end if;

  -- ya migradas: bloqueadas por no estar en la bandeja
  v_r := public.migrar_importacion_equipos_nucleo(array[v_f1]);
  if (v_r->>'ok')::boolean or (v_r->'bloqueados'->0->>'motivo') not like '%bandeja%' then fallos := fallos || '[101] una fila ya migrada no quedó bloqueada: ' || v_r::text || '; '; end if;

  -- repetidos dentro del lote: se bloquean los dos
  insert into public.equipos_importacion (codigo, tipo_id) values ('__TEST_CI_101G_R1__', '__test_ci_101g__') returning id into v_f1;
  insert into public.equipos_importacion (codigo, tipo_id) values ('__test_ci_101g_r1__', '__test_ci_101g__') returning id into v_f2;
  v_r := public.migrar_importacion_equipos_nucleo(array[v_f1, v_f2]);
  if (v_r->>'ok')::boolean or jsonb_array_length(v_r->'bloqueados') <> 2 or (v_r->'bloqueados'->0->>'motivo') not like '%repetido%' then fallos := fallos || '[101] los códigos repetidos del lote no se bloquearon: ' || v_r::text || '; '; end if;

  -- vacío y tope de 100
  v_r := public.migrar_importacion_equipos_nucleo('{}'::uuid[]);
  if not (v_r->>'ok')::boolean or (v_r->>'migrados')::int <> 0 then fallos := fallos || '[101] el lote vacío no devolvió ok con 0; '; end if;
  begin
    perform public.migrar_importacion_equipos_nucleo(array(select gen_random_uuid() from generate_series(1, 101)));
    fallos := fallos || '[101] aceptó más de 100 filas por lote; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[101] tope de lote: error ' || sqlstate || '; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [101g] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101g]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 101-h — [101] crear_licencia_con_cuenta
-- ------------------------------------------------------------
do $$
declare
  v_l public.licencias;
  v_c public.cuentas;
  v_n int;
  fallos text := '';
begin
  insert into public.plataformas (id, nombre) values ('__test_ci_101h__', '__TEST_CI__ Plataforma 101h');

  -- licencia con correo nuevo: normaliza como licenciaToRow y deja la cuenta sin asignar
  v_l := public.crear_licencia_con_cuenta_nucleo(
    '{"software":"  __TEST_CI__ Lic 101h ","tipo":"perpetua","cantidad":2,"fecha_vencimiento":"2030-01-01","renovacion_meses":12,"costo":100,"clave":"enc2:AAAA:BBBB"}'::jsonb,
    '{"plataforma_id":"__test_ci_101h__","usuario":"__TEST_CI_101H__@Correo.test","password":"enc2:CCCC:DDDD"}'::jsonb);
  select * into v_c from public.cuentas where id = v_l.cuenta_id;
  if v_l.software <> '__TEST_CI__ Lic 101h' or v_l.fecha_vencimiento is not null or v_l.renovacion_meses is not null or v_l.moneda <> 'PEN' or v_l.cantidad <> 2 then fallos := fallos || '[101] la licencia no se normalizó (perpetua, moneda, cantidad); '; end if;
  if v_c.usuario <> '__test_ci_101h__@correo.test' or v_c.tipo_cuenta <> 'compartida' or v_c.password <> 'enc2:CCCC:DDDD' then fallos := fallos || '[101] la cuenta nueva es incorrecta; '; end if;
  if exists (select 1 from public.asignaciones_cuenta where cuenta_id = v_c.id) then fallos := fallos || '[101] la cuenta del login quedó asignada; '; end if;

  -- sin cuenta nueva y con una existente
  v_l := public.crear_licencia_con_cuenta_nucleo(jsonb_build_object('software', '__TEST_CI__ Lic 101h b', 'cuenta_id', v_c.id));
  if v_l.cuenta_id <> v_c.id or v_l.tipo <> 'suscripcion' or v_l.cantidad <> 1 then fallos := fallos || '[101] la licencia con cuenta existente es incorrecta; '; end if;

  -- rechazos: ninguno deja una cuenta suelta (todo o nada)
  begin
    perform public.crear_licencia_con_cuenta_nucleo('{"software":"x"}'::jsonb,
      '{"plataforma_id":"__test_ci_101h__","usuario":"__test_ci_101h_x__@correo.test","password":"en claro"}'::jsonb);
    fallos := fallos || '[101] aceptó una contraseña de cuenta sin cifrar; ';
  exception when others then null;
  end;
  begin
    perform public.crear_licencia_con_cuenta_nucleo('{"software":"x","clave":"en claro"}'::jsonb,
      '{"plataforma_id":"__test_ci_101h__","usuario":"__test_ci_101h_y__@correo.test"}'::jsonb);
    fallos := fallos || '[101] aceptó una clave de licencia sin cifrar; ';
  exception when others then null;
  end;
  begin
    perform public.crear_licencia_con_cuenta_nucleo(jsonb_build_object('software', 'x', 'cuenta_id', v_c.id),
      '{"plataforma_id":"__test_ci_101h__","usuario":"__test_ci_101h_z__@correo.test"}'::jsonb);
    fallos := fallos || '[101] aceptó cuenta existente y nueva a la vez; ';
  exception when others then null;
  end;
  begin
    perform public.crear_licencia_con_cuenta_nucleo('{"software":"x"}'::jsonb,
      '{"plataforma_id":"__test_ci_101h__","usuario":"__test_ci_101h_w__@correo.test","tipo_cuenta":"personal"}'::jsonb);
    fallos := fallos || '[101] aceptó una cuenta personal como login; ';
  exception when others then null;
  end;
  begin
    perform public.crear_licencia_con_cuenta_nucleo('{"software":"  "}'::jsonb);
    fallos := fallos || '[101] aceptó una licencia sin software; ';
  exception when others then null;
  end;
  begin
    perform public.crear_licencia_con_cuenta_nucleo(jsonb_build_object('software', 'x', 'cuenta_id', gen_random_uuid()));
    fallos := fallos || '[101] aceptó una cuenta inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] cuenta inexistente: error ' || sqlstate || '; '; end if;
  end;
  select count(*) into v_n from public.cuentas where usuario like '__test_ci_101h_%' and usuario <> '__test_ci_101h__@correo.test';
  if v_n <> 0 then fallos := fallos || '[101] un rechazo dejó ' || v_n || ' cuenta(s) suelta(s); '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [101h] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101h]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- Bloque 101-i — [101] verificar_equipo, CHECK de eventos_equipo, rechazo
-- 42501 de las 10 RPC públicas sin sesión y EXECUTE de núcleos/apoyo
-- ------------------------------------------------------------
do $$
declare
  v_ub uuid;
  v_eq uuid;
  v_ev public.eventos_equipo;
  v_n int;
  v_f text;
  v_rpc text[] := array[
    'crear_cuenta_asignada(''x'', ''y'', ''00000000-0000-4000-8000-000000000001'')',
    'traspasar_cuenta(''00000000-0000-4000-8000-000000000001'', ''00000000-0000-4000-8000-000000000002'')',
    'cerrar_asignacion_cuenta(''00000000-0000-4000-8000-000000000001'')',
    'asignar_equipo(''00000000-0000-4000-8000-000000000001'', ''00000000-0000-4000-8000-000000000002'')',
    'devolver_equipo(''00000000-0000-4000-8000-000000000001'')',
    'mover_equipo(''00000000-0000-4000-8000-000000000001'', ''00000000-0000-4000-8000-000000000002'')',
    'migrar_importacion_equipo(''00000000-0000-4000-8000-000000000001'')',
    'migrar_importacion_equipos(array[''00000000-0000-4000-8000-000000000001''::uuid])',
    'crear_licencia_con_cuenta(''{"software":"x"}''::jsonb)',
    'verificar_equipo(''00000000-0000-4000-8000-000000000001'')'
  ];
  fallos text := '';
begin
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_101i__', '__TEST_CI__ Tipo 101i');
  insert into public.ubicaciones (nombre, tipo) values ('__TEST_CI__ Ubicación 101i', 'otro') returning id into v_ub;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_101I__', '__test_ci_101i__') returning id into v_eq;

  -- verificar_equipo: solo deja el evento, no mueve ni cambia nada
  v_ev := public.verificar_equipo_nucleo(v_eq, v_ub, '  todo bien ');
  if v_ev.evento <> 'verificado' or v_ev.equipo_id <> v_eq or v_ev.detalle <> 'Verificado físicamente en __TEST_CI__ Ubicación 101i — todo bien' then fallos := fallos || '[101] el evento verificado es incorrecto: ' || coalesce(v_ev.detalle, 'sin detalle') || '; '; end if;
  v_ev := public.verificar_equipo_nucleo(v_eq);
  if v_ev.detalle <> 'Verificado físicamente' then fallos := fallos || '[101] verificar sin ubicación ni nota mal; '; end if;
  if exists (select 1 from public.asignaciones_equipo where equipo_id = v_eq) or (select estado from public.equipos where id = v_eq) <> 'operativo' then fallos := fallos || '[101] verificar modificó el equipo; '; end if;
  begin
    perform public.verificar_equipo_nucleo(gen_random_uuid());
    fallos := fallos || '[101] verificó un equipo inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] verificar inexistente: error ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.verificar_equipo_nucleo(v_eq, gen_random_uuid());
    fallos := fallos || '[101] verificó con una ubicación inexistente; ';
  exception when others then
    if sqlstate <> 'P0002' then fallos := fallos || '[101] ubicación inexistente: error ' || sqlstate || '; '; end if;
  end;

  -- CHECK de eventos_equipo: los nuevos y los viejos pasan, uno inventado no
  foreach v_f in array array['acta_adjuntada', 'recepcion_confirmada', 'verificado', 'registrado', 'asignado', 'devuelto', 'estado_cambiado'] loop
    begin
      insert into public.eventos_equipo (equipo_id, evento) values (v_eq, v_f);
    exception when others then
      fallos := fallos || '[101] eventos_equipo rechazó ' || v_f || '; ';
    end;
  end loop;
  begin
    insert into public.eventos_equipo (equipo_id, evento) values (v_eq, 'inventado');
    fallos := fallos || '[101] eventos_equipo aceptó un evento inventado; ';
  exception when check_violation then null;
  end;

  -- las 10 RPC públicas rechazan sin sesión con 42501
  foreach v_f in array v_rpc loop
    begin
      execute 'select public.' || v_f;
      fallos := fallos || '[101] ' || split_part(v_f, '(', 1) || ' no rechazó sin sesión; ';
    exception when others then
      if sqlstate <> '42501' then fallos := fallos || '[101] ' || split_part(v_f, '(', 1) || ' lanzó ' || sqlstate || ' en vez de 42501; '; end if;
    end;
  end loop;

  -- EXECUTE: las 10 públicas a authenticated; ningún núcleo ni función de apoyo
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname in ('crear_cuenta_asignada','traspasar_cuenta','cerrar_asignacion_cuenta','asignar_equipo','devolver_equipo','mover_equipo','migrar_importacion_equipo','migrar_importacion_equipos','crear_licencia_con_cuenta','verificar_equipo');
  if v_n <> 10 then fallos := fallos || '[101] solo ' || v_n || ' de 10 RPC públicas tienen EXECUTE para authenticated; '; end if;
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
     and (p.proname like '%\_nucleo' or p.proname in ('texto_limpio','cuenta_insertar_validada','importacion_motivo_bloqueo','cuentas_log_evento'));
  if v_n <> 0 then fallos := fallos || '[101] ' || v_n || ' núcleo(s) o función(es) de apoyo expuestas a authenticated/anon; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [101i] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [101i]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 103-a: config_parametros — semillas, validación del valor, privilegios,
-- policies y lectura (parametro_entero, contacto_ti_publico)
-- ------------------------------------------------------------
do $$
declare
  v_n int;
  r record;
  fallos text := '';
begin
  select count(*) into v_n from public.config_parametros
   where clave in ('dias_ventana_alta', 'dias_por_vencer_licencia', 'dias_por_vencer_garantia',
                   'umbral_recurrencia_tickets', 'dias_ticket_viejo', 'dias_autocierre_resuelto',
                   'max_reavisos', 'dias_acta_sin_adjuntar', 'dias_verificacion_equipo', 'contacto_ti');
  if v_n <> 10 then fallos := fallos || '[103] faltan parametros sembrados (' || v_n || ' de 10); '; end if;
  if public.parametro_entero('clave_que_no_existe', 7) <> 7 then fallos := fallos || '[103] parametro_entero no devolvio el defecto; '; end if;
  if public.parametro_entero('umbral_recurrencia_tickets', 0, 'n') < 1 then fallos := fallos || '[103] parametro_entero no leyo el campo n del umbral; '; end if;

  -- el valor solo cambia dentro del mismo tipo y con rango sensato
  for r in select * from (values
      ('dias_ventana_alta', '"treinta"', '%de tipo%'),
      ('dias_ventana_alta', '-5', '%entero mayor o igual a 0%'),
      ('dias_ventana_alta', '2.5', '%entero mayor o igual a 0%'),
      ('umbral_recurrencia_tickets', '{"n":0,"dias":30}', '%umbral de recurrencia%'),
      ('contacto_ti', '{"otro":"x"}', '%contacto de TI%')) as t(clave, valor, patron)
  loop
    begin
      update public.config_parametros set valor = r.valor::jsonb where clave = r.clave;
      fallos := fallos || '[103] acepto ' || r.clave || ' = ' || r.valor || '; ';
    exception when others then
      if sqlerrm not like r.patron then
        fallos := fallos || '[103] ' || r.clave || ' se rechazo por otro motivo: ' || sqlerrm || '; ';
      end if;
    end;
  end loop;
  begin
    update public.config_parametros set clave = 'otra_clave' where clave = 'max_reavisos';
    fallos := fallos || '[103] permitio cambiar la clave de un parametro; ';
  exception when others then
    if sqlerrm not like '%clave%' then fallos := fallos || '[103] el cambio de clave se rechazo por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  -- cambios validos: quedan y se leen (updated_by lo fija auth.uid(): no se prueba aqui, el CLI no simula sesion)
  update public.config_parametros set valor = '45'::jsonb where clave = 'dias_ventana_alta';
  update public.config_parametros set valor = '{"n":4,"dias":10}'::jsonb where clave = 'umbral_recurrencia_tickets';
  update public.config_parametros set valor = '{"texto":"Anexo 123","correo":"ti@example.test","telefono":""}'::jsonb where clave = 'contacto_ti';
  if public.parametro_entero('dias_ventana_alta', 0) <> 45 then fallos := fallos || '[103] parametro_entero no leyo el valor nuevo; '; end if;
  if public.parametro_entero('umbral_recurrencia_tickets', 0, 'n') <> 4 or public.parametro_entero('umbral_recurrencia_tickets', 0, 'dias') <> 10 then
    fallos := fallos || '[103] parametro_entero no leyo n/dias del umbral; ';
  end if;
  if public.contacto_ti_publico() ->> 'correo' is distinct from 'ti@example.test' or not (public.contacto_ti_publico() ?& array['texto', 'correo', 'telefono']) then
    fallos := fallos || '[103] contacto_ti_publico no devolvio el contacto; ';
  end if;

  -- privilegios y policies: staff lee, solo el jefe edita, nadie inserta ni borra
  if not has_table_privilege('authenticated', 'public.config_parametros', 'select')
     or has_table_privilege('authenticated', 'public.config_parametros', 'insert')
     or has_table_privilege('authenticated', 'public.config_parametros', 'delete')
     or has_table_privilege('anon', 'public.config_parametros', 'select')
     or not has_column_privilege('authenticated', 'public.config_parametros', 'valor', 'update')
     or has_column_privilege('authenticated', 'public.config_parametros', 'clave', 'update') then
    fallos := fallos || '[103] privilegios de config_parametros incorrectos; ';
  end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'config_parametros'
    and ((cmd = 'SELECT' and qual like '%es_staff%') or (cmd = 'UPDATE' and qual like '%es_jefe%' and with_check like '%es_jefe%'));
  if v_n <> 2 then fallos := fallos || '[103] faltan las policies SELECT es_staff / UPDATE es_jefe; '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'config_parametros' and cmd in ('INSERT', 'DELETE', 'ALL');
  if v_n <> 0 then fallos := fallos || '[103] config_parametros tiene policies de INSERT/DELETE; '; end if;
  if not has_function_privilege('anon', 'public.contacto_ti_publico()', 'execute')
     or has_function_privilege('anon', 'public.dashboard_resumen()', 'execute')
     or not has_function_privilege('authenticated', 'public.dashboard_resumen()', 'execute')
     or has_function_privilege('authenticated', 'public.dashboard_resumen_de(uuid)', 'execute')
     or not has_function_privilege('project_admin', 'public.dashboard_resumen_de(uuid)', 'execute') then
    fallos := fallos || '[103] EXECUTE de contacto_ti_publico / dashboard_resumen(_de) incorrecto; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [103a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [103a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 103-b: dashboard_resumen — guard 42501, forma completa para el JEFE y
-- secciones en null (no error) para un ASISTENTE con solo el módulo tickets
-- ------------------------------------------------------------
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  r jsonb;
  k text;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_103b_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_103b_asis@example.test') returning id into v_asis;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  update public.staff set activo = true where user_id = v_asis;
  delete from public.staff_modulos_permisos where staff_user_id = v_asis and modulo <> 'tickets';

  -- sin sesión (usuario NULL) y con un usuario que no es staff: 42501
  begin
    perform public.dashboard_resumen_de(null);
    fallos := fallos || '[103] dashboard_resumen respondio sin sesion; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[103] sin sesion lanzo ' || sqlstate || ' en vez de 42501; '; end if;
  end;
  begin
    perform public.dashboard_resumen_de(gen_random_uuid());
    fallos := fallos || '[103] dashboard_resumen respondio a un usuario sin staff; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[103] usuario sin staff lanzo ' || sqlstate || ' en vez de 42501; '; end if;
  end;

  -- ASISTENTE solo con tickets: sin permiso = null, y no cuenta como error
  r := public.dashboard_resumen_de(v_asis);
  if not (r ?& array['generado_en', 'kpis', 'tickets', 'rotaciones_pendientes', 'cuentas_sin_password', 'equipos_sin_devolver',
                     'licencias_por_vencer', 'garantias_por_vencer', 'altas_incompletas', 'problemas', 'encuestas_sin_responder',
                     'custodia_hoy', 'actas_pendientes', 'solicitudes_abiertas', 'errores']) then
    fallos := fallos || '[103] faltan claves en el resumen del ASISTENTE; ';
  end if;
  if jsonb_typeof(r -> 'tickets') <> 'object' or jsonb_typeof(r -> 'encuestas_sin_responder') <> 'number' then
    fallos := fallos || '[103] el ASISTENTE no recibio la seccion de su modulo tickets; ';
  end if;
  foreach k in array array['rotaciones_pendientes', 'cuentas_sin_password', 'equipos_sin_devolver', 'licencias_por_vencer',
                           'garantias_por_vencer', 'altas_incompletas', 'problemas', 'custodia_hoy', 'actas_pendientes'] loop
    if jsonb_typeof(r -> k) <> 'null' then fallos := fallos || '[103] ' || k || ' no es null sin el modulo; '; end if;
  end loop;
  if jsonb_typeof(r -> 'kpis' -> 'tickets_abiertos') <> 'number' or jsonb_typeof(r -> 'kpis' -> 'equipos_total') <> 'null'
     or jsonb_typeof(r -> 'kpis' -> 'empleados_activos') <> 'null' then
    fallos := fallos || '[103] los kpis no se filtran por modulo; ';
  end if;
  if r -> 'errores' <> '[]'::jsonb then fallos := fallos || '[103] una seccion sin permiso conto como error: ' || (r ->> 'errores') || '; '; end if;

  -- JEFE: todas las secciones, sin errores
  r := public.dashboard_resumen_de(v_jefe);
  foreach k in array array['kpis', 'tickets', 'problemas'] loop
    if jsonb_typeof(r -> k) <> 'object' then fallos := fallos || '[103] ' || k || ' no es un objeto para el JEFE; '; end if;
  end loop;
  foreach k in array array['rotaciones_pendientes', 'cuentas_sin_password', 'equipos_sin_devolver', 'licencias_por_vencer',
                           'garantias_por_vencer', 'altas_incompletas', 'custodia_hoy', 'solicitudes_abiertas'] loop
    if jsonb_typeof(r -> k) <> 'array' then fallos := fallos || '[103] ' || k || ' no es un arreglo para el JEFE; '; end if;
  end loop;
  if jsonb_typeof(r -> 'actas_pendientes') not in ('array', 'null') then fallos := fallos || '[103] actas_pendientes invalida; '; end if;
  if not ((r -> 'tickets') ?& array['sin_asignar', 'sin_vincular', 'viejos', 'mios', 'mios_total', 'vigentes', 'vencidos', 'por_vencer'])
     or not ((r -> 'problemas') ?& array['acciones_vencidas', 'recurrentes'])
     or not ((r -> 'kpis') ?& array['empleados_activos', 'empleados_total', 'cuentas_asignadas', 'correos_compartidos',
                                    'cuentas_por_rotar', 'licencias_por_vencer', 'equipos_total', 'tickets_abiertos']) then
    fallos := fallos || '[103] faltan claves anidadas en el resumen del JEFE; ';
  end if;
  if r -> 'errores' <> '[]'::jsonb then fallos := fallos || '[103] el JEFE recibio errores: ' || (r ->> 'errores') || '; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [103b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [103b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 103-c: v_licencias_cupo (cuenta vs asignación directa) y su reflejo en
-- dashboard_resumen (licencias por vencer, cuentas sin contraseña)
-- ------------------------------------------------------------
do $$
declare
  v_jefe uuid;
  v_empresa uuid;
  v_e1 uuid;
  v_e2 uuid;
  v_cuenta uuid;
  v_l1 uuid;
  v_l2 uuid;
  v_a2 uuid;
  v_e3 uuid;
  v_eq uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  r jsonb;
  c record;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_103c_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 103c') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 103c Uno', '99010301', v_empresa) returning id into v_e1;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 103c Dos', '99010302', v_empresa) returning id into v_e2;
  insert into public.plataformas (id, nombre) values ('__test_ci_103__', '__TEST_CI__ Plataforma 103');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_103__', '__test_ci_103c__@correo.test', 'compartida') returning id into v_cuenta;

  -- L1: login por la cuenta (cantidad 2, vence en 5 dias); L2: sin cuenta (cantidad 3, dos directas)
  insert into public.licencias (software, cantidad, cuenta_id, fecha_vencimiento) values ('__TEST_CI__ Lic 103c uno', 2, v_cuenta, v_hoy + 5) returning id into v_l1;
  insert into public.licencias (software, cantidad) values ('__TEST_CI__ Lic 103c dos', 3) returning id into v_l2;
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta, v_e1);
  insert into public.asignaciones_licencia (licencia_id, empleado_id) values (v_l2, v_e1);
  insert into public.asignaciones_licencia (licencia_id, empleado_id) values (v_l2, v_e2) returning id into v_a2;

  select * into c from public.v_licencias_cupo where licencia_id = v_l1;
  if c.origen is distinct from 'cuenta' or c.usados is distinct from 1 or c.libres is distinct from 1 or c.usados_cuenta is distinct from 1 or c.usados_directos is distinct from 0 then
    fallos := fallos || '[103] cupo de la licencia con cuenta incorrecto; ';
  end if;
  select * into c from public.v_licencias_cupo where licencia_id = v_l2;
  if c.origen is distinct from 'licencia' or c.usados is distinct from 2 or c.libres is distinct from 1 or c.cantidad is distinct from 3 then
    fallos := fallos || '[103] cupo de la licencia directa incorrecto; ';
  end if;
  update public.asignaciones_licencia set fecha_fin = v_hoy where id = v_a2;
  select * into c from public.v_licencias_cupo where licencia_id = v_l2;
  if c.usados is distinct from 1 or c.libres is distinct from 2 then fallos := fallos || '[103] cerrar una asignacion no libero el asiento; '; end if;
  update public.licencias set deleted_at = now() where id = v_l2;
  if exists (select 1 from public.v_licencias_cupo where licencia_id = v_l2) then fallos := fallos || '[103] la vista muestra una licencia eliminada; '; end if;
  if not (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.v_licencias_cupo'::regclass) then
    fallos := fallos || '[103] v_licencias_cupo no es security_invoker; ';
  end if;

  -- reflejo en el Inicio
  r := public.dashboard_resumen_de(v_jefe);
  if not (r -> 'licencias_por_vencer' @> jsonb_build_array(jsonb_build_object('licencia_id', v_l1, 'vencida', false, 'cantidad', 2))) then
    fallos := fallos || '[103] licencias_por_vencer no trae la licencia que vence en 5 dias; ';
  end if;
  if not (r -> 'cuentas_sin_password' @> jsonb_build_array(jsonb_build_object('cuenta_id', v_cuenta, 'tipo_cuenta', 'compartida',
        'titulares', jsonb_build_array(jsonb_build_object('id', v_e1))))) then
    fallos := fallos || '[103] cuentas_sin_password no trae la cuenta sin contrasena con su titular; ';
  end if;
  update public.licencias set fecha_vencimiento = v_hoy - 1 where id = v_l1;
  r := public.dashboard_resumen_de(v_jefe);
  if not (r -> 'licencias_por_vencer' @> jsonb_build_array(jsonb_build_object('licencia_id', v_l1, 'vencida', true))) then
    fallos := fallos || '[103] una licencia ya vencida no figura como vencida; ';
  end if;

  -- equipos: equipo_id en custodia_hoy y empleado_baja_at en equipos_sin_devolver
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado) values ('Test', 'CI 103c Baja', '99010303', v_empresa, 'Inactivo') returning id into v_e3;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_103c__', '__TEST_CI__ Tipo 103c');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_103C__', '__test_ci_103c__') returning id into v_eq;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_eq, v_e3);
  r := public.dashboard_resumen_de(v_jefe);
  if not (r -> 'custodia_hoy' @> jsonb_build_array(jsonb_build_object('equipo_id', v_eq, 'evento', 'entregado', 'equipo_codigo', '__TEST_CI_103C__'))) then
    fallos := fallos || '[103] custodia_hoy no trae equipo_id; ';
  end if;
  if not (r -> 'equipos_sin_devolver' @> jsonb_build_array(jsonb_build_object('empleado_id', v_e3, 'codigo', '__TEST_CI_103C__')))
     or jsonb_typeof((select x -> 'empleado_baja_at' from jsonb_array_elements(r -> 'equipos_sin_devolver') x where x ->> 'empleado_id' = v_e3::text)) is distinct from 'string' then
    fallos := fallos || '[103] equipos_sin_devolver no trae empleado_baja_at; ';
  end if;

  if r -> 'errores' <> '[]'::jsonb then fallos := fallos || '[103] el resumen trajo errores: ' || (r ->> 'errores') || '; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [103c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [103c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 103-d: tickets en dashboard_resumen (sin asignar, sin vincular, viejos,
-- mios por prioridad) y recurrencia de categorias / acciones vencidas
-- ------------------------------------------------------------
do $$
declare
  v_jefe uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;
  v_t4 uuid;
  v_prob uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  r jsonb;
  c record;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_103d_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  insert into public.categorias_ticket (id, nombre) values ('__test_ci_103d__', '__TEST_CI__ Categoria 103d');

  insert into public.tickets (codigo, token, titulo, descripcion, estado, categoria_id, vinculado, created_at)
    values ('__TESTCI-103D1__', 'testci103dtoken0000001', '__TEST_CI__ T1 viejo sin asignar', 'd', 'abierto', '__test_ci_103d__', false, now() - interval '10 days')
    returning id into v_t1;
  insert into public.tickets (codigo, token, titulo, descripcion, estado, categoria_id, asignado_a, prioridad)
    values ('__TESTCI-103D2__', 'testci103dtoken0000002', '__TEST_CI__ T2 baja mio', 'd', 'abierto', '__test_ci_103d__', v_jefe, 'baja')
    returning id into v_t2;
  insert into public.tickets (codigo, token, titulo, descripcion, estado, categoria_id, asignado_a, prioridad)
    values ('__TESTCI-103D3__', 'testci103dtoken0000003', '__TEST_CI__ T3 urgente mio', 'd', 'abierto', '__test_ci_103d__', v_jefe, 'urgente')
    returning id into v_t3;
  insert into public.tickets (codigo, token, titulo, descripcion, estado, asignado_a, prioridad)
    values ('__TESTCI-103D4__', 'testci103dtoken0000004', '__TEST_CI__ T4 cerrado mio', 'd', 'cerrado', v_jefe, 'alta')
    returning id into v_t4;

  r := public.dashboard_resumen_de(v_jefe);
  if not (r -> 'tickets' -> 'sin_asignar' @> jsonb_build_array(jsonb_build_object('ticket_id', v_t1, 'codigo', '__TESTCI-103D1__')))
     or (r -> 'tickets' -> 'sin_asignar' @> jsonb_build_array(jsonb_build_object('ticket_id', v_t2))) then
    fallos := fallos || '[103] sin_asignar incorrecto; ';
  end if;
  if not (r -> 'tickets' -> 'sin_vincular' @> jsonb_build_array(jsonb_build_object('ticket_id', v_t1)))
     or (r -> 'tickets' -> 'sin_vincular' @> jsonb_build_array(jsonb_build_object('ticket_id', v_t2))) then
    fallos := fallos || '[103] sin_vincular incorrecto; ';
  end if;
  if not (r -> 'tickets' -> 'viejos' @> jsonb_build_array(jsonb_build_object('ticket_id', v_t1)))
     or (r -> 'tickets' -> 'viejos' @> jsonb_build_array(jsonb_build_object('ticket_id', v_t3))) then
    fallos := fallos || '[103] viejos incorrecto (10 dias si, recien creado no); ';
  end if;
  if (r -> 'tickets' -> 'mios' -> 0 ->> 'codigo') is distinct from '__TESTCI-103D3__'
     or (r -> 'tickets' -> 'mios' -> 1 ->> 'codigo') is distinct from '__TESTCI-103D2__'
     or (r -> 'tickets' ->> 'mios_total')::int <> 2 or jsonb_array_length(r -> 'tickets' -> 'mios') <> 2 then
    fallos := fallos || '[103] mios no ordena por prioridad (urgente antes que baja) o cuenta mal; ';
  end if;
  if r -> 'tickets' -> 'mios' @> jsonb_build_array(jsonb_build_object('id', v_t4)) then
    fallos := fallos || '[103] un ticket cerrado figura en mios; ';
  end if;

  -- recurrencia: 3 tickets sin problema -> la categoria aparece; vincular uno -> deja de aparecer
  select * into c from public.v_categorias_recurrentes where categoria_id = '__test_ci_103d__';
  if c.total is distinct from 3 or jsonb_array_length(c.tickets) is distinct from 3 or c.categoria_nombre is distinct from '__TEST_CI__ Categoria 103d' then
    fallos := fallos || '[103] v_categorias_recurrentes no agrupo los 3 tickets; ';
  end if;
  if not (r -> 'problemas' -> 'recurrentes' @> jsonb_build_array(jsonb_build_object('categoria_id', '__test_ci_103d__', 'total', 3))) then
    fallos := fallos || '[103] problemas.recurrentes no trae la categoria; ';
  end if;
  insert into public.problemas (titulo, descripcion) values ('__TEST_CI__ Problema 103d', 'd') returning id into v_prob;
  insert into public.problema_tickets (problema_id, ticket_id) values (v_prob, v_t1);
  if exists (select 1 from public.v_categorias_recurrentes where categoria_id = '__test_ci_103d__') then
    fallos := fallos || '[103] la categoria sigue siendo recurrente con 2 tickets sin problema; ';
  end if;

  -- acciones correctivas vencidas
  insert into public.acciones_correctivas (problema_id, descripcion, fecha_limite) values (v_prob, '__TEST_CI__ accion vencida', v_hoy - 2);
  r := public.dashboard_resumen_de(v_jefe);
  if not (r -> 'problemas' -> 'acciones_vencidas' @> jsonb_build_array(jsonb_build_object('problema_id', v_prob,
        'problema_titulo', '__TEST_CI__ Problema 103d', 'descripcion', '__TEST_CI__ accion vencida'))) then
    fallos := fallos || '[103] acciones_vencidas no trae la accion con fecha_limite pasada; ';
  end if;

  if r -> 'errores' <> '[]'::jsonb then fallos := fallos || '[103] el resumen trajo errores: ' || (r ->> 'errores') || '; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [103d] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [103d]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 110-a: actas — registrar_acta (reemplazo logico atomico), unicidad,
-- reglas por tipo de asignacion y evento acta_adjuntada
-- ------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_empresa uuid;
  v_emp uuid;
  v_equipo uuid;
  v_equipo2 uuid;
  v_ubic uuid;
  v_asig uuid;
  v_asig_ub uuid;
  v_a1 public.actas;
  v_a2 public.actas;
  v_n int;
  v_sha text := repeat('a', 64);
  v_hoy date := (now() at time zone 'America/Lima')::date;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_110a@example.test') returning id into v_user;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 110a') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 110a', '99011001', v_empresa) returning id into v_emp;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_110a__', '__TEST_CI__ Tipo 110a');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_110A__', '__test_ci_110a__') returning id into v_equipo;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_110B__', '__test_ci_110a__') returning id into v_equipo2;
  insert into public.ubicaciones (nombre, tipo) values ('__TEST_CI__ Ubicacion 110a', 'otro') returning id into v_ubic;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_equipo, v_emp) returning id into v_asig;
  insert into public.asignaciones_equipo (equipo_id, ubicacion_id) values (v_equipo2, v_ubic) returning id into v_asig_ub;

  -- alta: empleado y equipo salen de la asignacion; el evento queda en la hoja de vida
  v_a1 := public.registrar_acta(v_asig, 'entrega', 'actas/x/a-entrega.pdf', 1000, v_sha, null, v_user);
  if v_a1.empleado_id is distinct from v_emp or v_a1.equipo_id is distinct from v_equipo or v_a1.deleted_at is not null then
    fallos := fallos || '[110] registrar_acta no derivo empleado/equipo de la asignacion; ';
  end if;
  select count(*) into v_n from public.eventos_equipo where equipo_id = v_equipo and evento = 'acta_adjuntada' and user_id = v_user;
  if v_n <> 1 then fallos := fallos || '[110] el alta no registro el evento acta_adjuntada del autor; '; end if;

  -- reemplazo: la vigente se retira y la nueva queda; siempre una sola vigente
  v_a2 := public.registrar_acta(v_asig, 'entrega', 'actas/x/a-entrega-2.pdf', 2000, v_sha, null, v_user);
  select count(*) into v_n from public.actas where asignacion_equipo_id = v_asig and tipo = 'entrega' and deleted_at is null;
  if v_n <> 1 or (select deleted_at from public.actas where id = v_a1.id) is null or v_a2.deleted_at is not null then
    fallos := fallos || '[110] el reemplazo no dejo exactamente una acta vigente; ';
  end if;
  select count(*) into v_n from public.actas where asignacion_equipo_id = v_asig and tipo = 'entrega';
  if v_n <> 2 then fallos := fallos || '[110] el reemplazo borro la acta anterior en vez de retirarla; '; end if;
  begin
    insert into public.actas (asignacion_equipo_id, tipo, empleado_id, equipo_id, pdf_key, tamano_bytes, sha256)
      values (v_asig, 'entrega', v_emp, v_equipo, 'actas/x/a-entrega-3.pdf', 10, v_sha);
    fallos := fallos || '[110] permitio dos actas vigentes del mismo tipo; ';
  exception when unique_violation then null;
  end;

  -- reglas de registrar_acta
  begin
    perform public.registrar_acta(v_asig, 'devolucion', 'actas/x/a-devolucion.pdf', 10, v_sha, null, v_user);
    fallos := fallos || '[110] acta de devolucion con la asignacion vigente; ';
  exception when others then if sqlstate <> '22023' then fallos := fallos || '[110] devolucion vigente lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.registrar_acta(v_asig_ub, 'entrega', 'actas/x/b-entrega.pdf', 10, v_sha, null, v_user);
    fallos := fallos || '[110] acta de una asignacion a ubicacion; ';
  exception when others then if sqlstate <> '22023' then fallos := fallos || '[110] asignacion a ubicacion lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.registrar_acta(gen_random_uuid(), 'entrega', 'actas/x/c.pdf', 10, v_sha, null, v_user);
    fallos := fallos || '[110] acta de una asignacion inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[110] asignacion inexistente lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.registrar_acta(v_asig, 'baja', 'actas/x/d.pdf', 10, v_sha, null, v_user);
    fallos := fallos || '[110] tipo de acta inventado; ';
  exception when others then if sqlstate <> '22023' then fallos := fallos || '[110] tipo inventado lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.registrar_acta(v_asig, 'entrega', 'actas/x/e.pdf', 10, v_sha, v_hoy + 3, v_user);
    fallos := fallos || '[110] fecha de firma futura; ';
  exception when others then if sqlstate <> '22023' then fallos := fallos || '[110] fecha futura lanzo ' || sqlstate || '; '; end if;
  end;
  update public.asignaciones_equipo set fecha_fin = v_hoy where id = v_asig;
  begin
    perform public.registrar_acta(v_asig, 'devolucion', 'actas/x/a-devolucion.pdf', 10, v_sha, v_hoy, v_user);
  exception when others then fallos := fallos || '[110] rechazo la devolucion de una asignacion cerrada: ' || sqlerrm || '; ';
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [110a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [110a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 110-b: actas — CHECKs, inmutabilidad (solo deleted_at cambia), FK sin
-- borrado fisico, privilegios y policies (sin INSERT para clientes)
-- ------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_empresa uuid;
  v_emp uuid;
  v_equipo uuid;
  v_asig uuid;
  v_a2 public.actas;
  v_n int;
  v_sha text := repeat('a', 64);
  v_hoy date := (now() at time zone 'America/Lima')::date;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_110c@example.test') returning id into v_user;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 110c') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 110c', '99011003', v_empresa) returning id into v_emp;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_110c__', '__TEST_CI__ Tipo 110c');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_110D__', '__test_ci_110c__') returning id into v_equipo;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_equipo, v_emp) returning id into v_asig;
  v_a2 := public.registrar_acta(v_asig, 'entrega', 'actas/x/h-entrega.pdf', 1000, v_sha, v_hoy, v_user);

  -- CHECKs de la tabla
  begin perform public.registrar_acta(v_asig, 'entrega', 'otro/x.pdf', 10, v_sha, null, v_user); fallos := fallos || '[110] pdf_key fuera de actas/; ';
  exception when check_violation then null; end;
  begin perform public.registrar_acta(v_asig, 'entrega', 'actas/x/f.pdf', 10, 'XYZ', null, v_user); fallos := fallos || '[110] sha256 invalido; ';
  exception when check_violation then null; end;
  begin perform public.registrar_acta(v_asig, 'entrega', 'actas/x/g.pdf', 0, v_sha, null, v_user); fallos := fallos || '[110] tamano 0; ';
  exception when check_violation then null; end;

  -- inmutabilidad: solo deleted_at cambia
  begin
    update public.actas set pdf_key = 'actas/x/otro.pdf' where id = v_a2.id;
    fallos := fallos || '[110] permitio cambiar pdf_key; ';
  exception when others then if sqlerrm not like '%no se puede modificar%' then fallos := fallos || '[110] pdf_key se rechazo por otro motivo: ' || sqlerrm || '; '; end if;
  end;
  begin
    update public.actas set sha256 = repeat('b', 64) where id = v_a2.id;
    fallos := fallos || '[110] permitio cambiar sha256; ';
  exception when others then if sqlerrm not like '%no se puede modificar%' then fallos := fallos || '[110] sha256 se rechazo por otro motivo: ' || sqlerrm || '; '; end if;
  end;
  update public.actas set deleted_at = now() where id = v_a2.id;
  update public.actas set deleted_at = null where id = v_a2.id;

  -- las FK no permiten borrar fisicamente una asignacion con acta
  begin
    delete from public.asignaciones_equipo where id = v_asig;
    fallos := fallos || '[110] permitio borrar una asignacion con acta; ';
  exception when foreign_key_violation then null; end;

  -- privilegios y policies
  if not has_table_privilege('authenticated', 'public.actas', 'select') or has_table_privilege('authenticated', 'public.actas', 'insert')
     or has_table_privilege('anon', 'public.actas', 'select')
     or has_column_privilege('authenticated', 'public.actas', 'pdf_key', 'update')
     or not has_column_privilege('authenticated', 'public.actas', 'deleted_at', 'update')
     or has_function_privilege('authenticated', 'public.registrar_acta(uuid,text,text,integer,text,date,uuid)', 'execute')
     or not has_function_privilege('project_admin', 'public.registrar_acta(uuid,text,text,integer,text,date,uuid)', 'execute') then
    fallos := fallos || '[110] privilegios de actas / registrar_acta incorrectos; ';
  end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'actas'
    and ((cmd = 'SELECT' and qual like '%puede_actual%') or (cmd = 'UPDATE' and qual like '%puede_actual%') or (cmd = 'DELETE' and qual like '%es_jefe%'));
  if v_n <> 3 then fallos := fallos || '[110] faltan las policies SELECT/UPDATE puede_actual y DELETE es_jefe; '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'actas' and cmd in ('INSERT', 'ALL');
  if v_n <> 0 then fallos := fallos || '[110] actas tiene policy de INSERT; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [110b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [110b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 110-c: v_actas_pendientes — umbral de dias, fecha de corte, acta vigente,
-- y su reflejo en dashboard_resumen (solo asignaciones activas)
-- ------------------------------------------------------------
do $$
declare
  v_jefe uuid;
  v_empresa uuid;
  v_emp uuid;
  v_equipo uuid;
  v_asig uuid;
  v_acta public.actas;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  c record;
  r jsonb;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_110b_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 110b') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 110b', '99011002', v_empresa) returning id into v_emp;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_110b__', '__TEST_CI__ Tipo 110b');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_110C__', '__test_ci_110b__') returning id into v_equipo;
  insert into public.asignaciones_equipo (equipo_id, empleado_id, fecha_inicio) values (v_equipo, v_emp, v_hoy - 10) returning id into v_asig;
  update public.config_parametros set valor = to_jsonb((v_hoy - 30)::text) where clave = 'actas_pendientes_desde';

  select * into c from public.v_actas_pendientes where asignacion_id = v_asig;
  if c.asignacion_id is null or c.dias is distinct from 10 or c.activa is not true or c.empleado_id is distinct from v_emp or c.equipo_codigo is distinct from '__TEST_CI_110C__' then
    fallos := fallos || '[110] la entrega de hace 10 dias sin acta no figura como pendiente; ';
  end if;
  if not (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.v_actas_pendientes'::regclass) then
    fallos := fallos || '[110] v_actas_pendientes no es security_invoker; ';
  end if;

  r := public.dashboard_resumen_de(v_jefe);
  if not (r -> 'actas_pendientes' @> jsonb_build_array(jsonb_build_object('asignacion_id', v_asig, 'dias', 10, 'equipo_codigo', '__TEST_CI_110C__'))) then
    fallos := fallos || '[110] dashboard_resumen no trae actas_pendientes; ';
  end if;
  if r -> 'errores' <> '[]'::jsonb then fallos := fallos || '[110] el resumen trajo errores: ' || (r ->> 'errores') || '; '; end if;

  -- con acta de entrega vigente deja de ser pendiente; si se retira, vuelve
  v_acta := public.registrar_acta(v_asig, 'entrega', 'actas/x/p-entrega.pdf', 10, repeat('c', 64), null, v_jefe);
  if exists (select 1 from public.v_actas_pendientes where asignacion_id = v_asig) then fallos := fallos || '[110] sigue pendiente con acta vigente; '; end if;
  update public.actas set deleted_at = now() where id = v_acta.id;
  if not exists (select 1 from public.v_actas_pendientes where asignacion_id = v_asig) then fallos := fallos || '[110] no volvio a pendiente al retirar el acta; '; end if;

  -- un acta de devolucion no cubre la entrega
  update public.asignaciones_equipo set fecha_fin = v_hoy where id = v_asig;
  perform public.registrar_acta(v_asig, 'devolucion', 'actas/x/p-devolucion.pdf', 10, repeat('d', 64), null, v_jefe);
  select * into c from public.v_actas_pendientes where asignacion_id = v_asig;
  if c.asignacion_id is null or c.activa is not false then fallos := fallos || '[110] la devolucion cubrio la entrega o activa no es false; '; end if;
  r := public.dashboard_resumen_de(v_jefe);
  if r -> 'actas_pendientes' @> jsonb_build_array(jsonb_build_object('asignacion_id', v_asig)) then
    fallos := fallos || '[110] el Inicio lista una asignacion ya cerrada; ';
  end if;

  -- umbral de dias y fecha de corte
  update public.asignaciones_equipo set fecha_inicio = v_hoy - 1, fecha_fin = null where id = v_asig;
  if exists (select 1 from public.v_actas_pendientes where asignacion_id = v_asig) then fallos := fallos || '[110] una entrega de ayer ya es pendiente (umbral 3 dias); '; end if;
  update public.asignaciones_equipo set fecha_inicio = v_hoy - 10 where id = v_asig;
  update public.config_parametros set valor = to_jsonb((v_hoy - 5)::text) where clave = 'actas_pendientes_desde';
  if exists (select 1 from public.v_actas_pendientes where asignacion_id = v_asig) then fallos := fallos || '[110] la fecha de corte no excluyo una entrega anterior; '; end if;
  begin
    update public.config_parametros set valor = '"no-es-fecha"'::jsonb where clave = 'actas_pendientes_desde';
    fallos := fallos || '[110] actas_pendientes_desde acepto un valor que no es fecha; ';
  exception when others then if sqlerrm not like '%fecha%' then fallos := fallos || '[110] fecha de corte invalida se rechazo por otro motivo: ' || sqlerrm || '; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [110c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [110c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 111-a: crear_ticket_publico — ticket + evento + intento en una
-- transaccion, vinculacion por DNI, clasificacion heredada, vinculos a
-- activos SOLO con staff, rate-limit por IP y por DNI, guards y privilegios.
-- OJO: cada llamada exitosa consume un codigo TCK-XXXX de la secuencia (la
-- secuencia no se revierte): este bloque hace solo 3 creaciones; los limites
-- se prueban sembrando intentos_publicos, sin crear tickets.
-- ------------------------------------------------------------
do $$
declare
  v_staff uuid;
  v_inactivo uuid;
  v_empresa uuid;
  v_emp uuid;
  v_equipo uuid;
  v_sub uuid;
  v_cat text := '__test_ci_111a__';
  v_cat2 text := '__test_ci_111a2__';
  v_sub2 uuid;
  r jsonb;
  t public.tickets;
  v_n int;
  v_i int;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_111a_staff@example.test') returning id into v_staff;
  insert into auth.users (email) values ('__test_ci_111a_inactivo@example.test') returning id into v_inactivo;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_staff;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 111a') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 111a', '99111001', v_empresa) returning id into v_emp;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_111a__', '__TEST_CI__ Tipo 111a');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_111A__', '__test_ci_111a__') returning id into v_equipo;
  insert into public.categorias_ticket (id, nombre) values (v_cat, '__TEST_CI__ Categoria 111a');
  insert into public.categorias_ticket (id, nombre) values (v_cat2, '__TEST_CI__ Categoria 111a2');
  insert into public.subcategorias_ticket (categoria_id, nombre, tipo_sugerido) values (v_cat, '__TEST_CI__ Sub 111a', 'solicitud') returning id into v_sub;
  insert into public.subcategorias_ticket (categoria_id, nombre) values (v_cat2, '__TEST_CI__ Sub 111a2') returning id into v_sub2;

  -- 1) creacion publica: se ignora todo lo que es de staff
  r := public.crear_ticket_publico(jsonb_build_object(
    'titulo', ' Impresora ', 'descripcion', 'No imprime', 'categoria_id', v_cat, 'subcategoria_id', v_sub,
    'contacto', '99.111.001', 'token', lpad('1', 24, 'T'), 'ip', '10.111.0.1',
    'origen', 'staff_interno', 'tipo', 'incidente', 'equipo_id', v_equipo, 'empleado_id_manual', v_emp));
  if r ->> 'ok' <> 'true' or (r ->> 'vinculado') <> 'true' or (r ->> 'codigo') not like 'TCK-%' or (r ->> 'token') <> lpad('1', 24, 'T') then
    fallos := fallos || '[111] la creacion publica no devolvio ok/vinculado/codigo/token: ' || r::text || '; ';
  end if;
  select * into t from public.tickets where id = (r ->> 'id')::uuid;
  if t.origen <> 'empleado' or t.creado_por is not null then fallos := fallos || '[111] un ticket publico salio con origen de staff; '; end if;
  if t.tipo is distinct from 'solicitud' then fallos := fallos || '[111] el tipo no se heredo de la subcategoria (' || coalesce(t.tipo, 'null') || '); '; end if;
  if t.equipo_id is not null or t.cuenta_id is not null or t.licencia_id is not null then fallos := fallos || '[111] el ticket publico acepto un vinculo a activos; '; end if;
  if t.empleado_id is distinct from v_emp or t.vinculado is not true or t.contacto_ingresado is distinct from '99.111.001' or t.titulo <> 'Impresora' then
    fallos := fallos || '[111] la vinculacion por DNI o el recorte del titulo fallaron; ';
  end if;
  select count(*) into v_n from public.ticket_eventos where ticket_id = t.id and evento = 'creado' and detalle = 'Origen: empleado' and user_id is null;
  if v_n <> 1 then fallos := fallos || '[111] falta el evento creado del ticket publico; '; end if;
  select count(*) into v_n from public.intentos_publicos where ambito = 'tickets.crear' and clave = '10.111.0.1';
  if v_n <> 1 then fallos := fallos || '[111] no se registro el intento por IP; '; end if;
  select count(*) into v_n from public.intentos_publicos where ambito = 'tickets.crear.dni' and clave = '99111001';
  if v_n <> 1 then fallos := fallos || '[111] no se registro el intento por DNI; '; end if;

  -- 2) DNI sin coincidencia: entra sin vincular, con su evento
  r := public.crear_ticket_publico(jsonb_build_object(
    'titulo', 'Otro', 'descripcion', 'd', 'categoria_id', v_cat, 'contacto', '00000000', 'token', lpad('2', 24, 'T'), 'ip', '10.111.0.2'));
  select * into t from public.tickets where id = (r ->> 'id')::uuid;
  if r ->> 'vinculado' <> 'false' or t.empleado_id is not null or t.vinculado is not false or t.tipo is not null then
    fallos := fallos || '[111] un DNI sin coincidencia no quedo sin vincular y sin tipo; ';
  end if;
  select count(*) into v_n from public.ticket_eventos where ticket_id = t.id and evento = 'creado' and detalle = 'Origen: empleado (sin vincular)';
  if v_n <> 1 then fallos := fallos || '[111] falta el evento creado (sin vincular); '; end if;

  -- 3) staff: origen, tipo corregido, vinculos y empleado a mano; no consume el limite publico
  r := public.crear_ticket_publico(jsonb_build_object(
    'titulo', 'Interno', 'descripcion', 'd', 'categoria_id', v_cat, 'subcategoria_id', v_sub, 'token', lpad('3', 24, 'T'), 'ip', '10.111.0.3',
    'staff_id', v_staff, 'origen', 'staff_interno', 'tipo', 'incidente', 'equipo_id', v_equipo, 'empleado_id_manual', v_emp));
  select * into t from public.tickets where id = (r ->> 'id')::uuid;
  if t.origen <> 'staff_interno' or t.creado_por is distinct from v_staff or t.tipo is distinct from 'incidente'
     or t.equipo_id is distinct from v_equipo or t.empleado_id is distinct from v_emp or t.vinculado is not true then
    fallos := fallos || '[111] el ticket de staff no conservo origen/tipo/equipo/empleado; ';
  end if;
  select count(*) into v_n from public.ticket_eventos where ticket_id = t.id and evento = 'creado' and user_id = v_staff and user_email = '__test_ci_111a_staff@example.test';
  if v_n <> 1 then fallos := fallos || '[111] el evento del ticket de staff no lleva autor y correo; '; end if;
  select count(*) into v_n from public.intentos_publicos where clave = '10.111.0.3';
  if v_n <> 0 then fallos := fallos || '[111] el staff consumio cupo del rate-limit publico; '; end if;

  -- 4) rechazos de negocio: no lanzan, no crean y NO cuentan como intento
  if public.crear_ticket_publico(jsonb_build_object('titulo', '', 'descripcion', 'd', 'categoria_id', v_cat, 'token', lpad('4', 24, 'T'), 'ip', '10.111.0.4')) ->> 'code' is distinct from 'datos_requeridos' then
    fallos := fallos || '[111] titulo vacio no dio datos_requeridos; ';
  end if;
  if public.crear_ticket_publico(jsonb_build_object('titulo', repeat('x', 201), 'descripcion', 'd', 'categoria_id', v_cat, 'token', lpad('4', 24, 'T'), 'ip', '10.111.0.4')) ->> 'code' is distinct from 'texto_muy_largo' then
    fallos := fallos || '[111] titulo de 201 caracteres no dio texto_muy_largo; ';
  end if;
  if public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'contacto', repeat('9', 101), 'token', lpad('4', 24, 'T'), 'ip', '10.111.0.4')) ->> 'code' is distinct from 'texto_muy_largo' then
    fallos := fallos || '[111] contacto de 101 caracteres no dio texto_muy_largo; ';
  end if;
  if public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', '__no_existe__', 'token', lpad('4', 24, 'T'), 'ip', '10.111.0.4')) ->> 'code' is distinct from 'categoria_invalida' then
    fallos := fallos || '[111] categoria inexistente no dio categoria_invalida; ';
  end if;
  if public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'subcategoria_id', v_sub2, 'token', lpad('4', 24, 'T'), 'ip', '10.111.0.4')) ->> 'code' is distinct from 'categoria_invalida' then
    fallos := fallos || '[111] subcategoria de otra categoria no dio categoria_invalida; ';
  end if;
  if public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'token', lpad('4', 24, 'T'), 'ip', '10.111.0.4',
       'staff_id', v_staff, 'equipo_id', gen_random_uuid())) ->> 'code' is distinct from 'vinculo_invalido' then
    fallos := fallos || '[111] equipo inexistente no dio vinculo_invalido; ';
  end if;
  if public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'token', lpad('4', 24, 'T'), 'ip', '10.111.0.4',
       'staff_id', v_staff, 'empleado_id_manual', gen_random_uuid())) ->> 'code' is distinct from 'empleado_invalido' then
    fallos := fallos || '[111] empleado a mano inexistente no dio empleado_invalido; ';
  end if;
  select count(*) into v_n from public.intentos_publicos where clave = '10.111.0.4';
  if v_n <> 0 then fallos := fallos || '[111] un rechazo de negocio se registro como intento; '; end if;

  -- 5) entradas imposibles: 22023; staff que no es staff activo: 42501
  begin
    perform public.crear_ticket_publico('[]'::jsonb);
    fallos := fallos || '[111] acepto un p_datos que no es objeto; ';
  exception when others then if sqlstate <> '22023' then fallos := fallos || '[111] p_datos invalido lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'token', 'corto', 'ip', '10.111.0.5'));
    fallos := fallos || '[111] acepto un token de forma invalida; ';
  exception when others then if sqlstate <> '22023' then fallos := fallos || '[111] token invalido lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'token', lpad('5', 24, 'T'), 'staff_id', 'no-es-uuid'));
    fallos := fallos || '[111] acepto un staff_id que no es uuid; ';
  exception when others then if sqlstate <> '22023' then fallos := fallos || '[111] staff_id mal formado lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'token', lpad('5', 24, 'T'), 'staff_id', v_inactivo));
    fallos := fallos || '[111] acepto un staff inactivo; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[111] staff inactivo lanzo ' || sqlstate || ' en vez de 42501; '; end if;
  end;
  begin
    perform public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'token', lpad('5', 24, 'T'), 'staff_id', gen_random_uuid()));
    fallos := fallos || '[111] acepto un staff_id inexistente; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[111] staff inexistente lanzo ' || sqlstate || ' en vez de 42501; '; end if;
  end;

  -- 6) rate-limit por IP: con 8 intentos sembrados, el siguiente se bloquea sin crear ni registrar
  for v_i in 1..8 loop
    insert into public.intentos_publicos (ambito, clave) values ('tickets.crear', '10.111.0.9');
  end loop;
  select count(*) into v_n from public.tickets;
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'token', lpad('6', 24, 'T'), 'ip', '10.111.0.9'));
  if r ->> 'code' is distinct from 'demasiados_intentos' or (select count(*) from public.tickets) <> v_n
     or (select count(*) from public.intentos_publicos where ambito = 'tickets.crear' and clave = '10.111.0.9') <> 8 then
    fallos := fallos || '[111] el noveno intento por IP no se bloqueo limpiamente; ';
  end if;

  -- 7) rate-limit por DNI: 5 intentos sembrados (de IP distintas), el siguiente se bloquea y no cuenta para su IP
  for v_i in 1..5 loop
    insert into public.intentos_publicos (ambito, clave) values ('tickets.crear.dni', '99111999');
  end loop;
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'contacto', '99111999', 'token', lpad('7', 24, 'T'), 'ip', '10.111.0.10'));
  if r ->> 'code' is distinct from 'demasiados_intentos'
     or (select count(*) from public.intentos_publicos where clave = '10.111.0.10') <> 0 then
    fallos := fallos || '[111] el sexto intento por DNI no se bloqueo limpiamente; ';
  end if;

  -- 8) privilegios
  if has_function_privilege('authenticated', 'public.crear_ticket_publico(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.crear_ticket_publico(jsonb)', 'execute')
     or not has_function_privilege('project_admin', 'public.crear_ticket_publico(jsonb)', 'execute') then
    fallos := fallos || '[111] privilegios de crear_ticket_publico incorrectos; ';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.crear_ticket_publico(jsonb)'::regprocedure) then
    fallos := fallos || '[111] crear_ticket_publico no es SECURITY DEFINER; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [111a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [111a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 111-b: adjuntar_captura_ticket — solo la key tickets/<id>/captura.<ext>,
-- solo el primer adjunto, adjunto_url queda en NULL y privilegios
-- ------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_otro uuid := gen_random_uuid();
  t public.tickets;
  fallos text := '';
begin
  insert into public.tickets (codigo, token, titulo, descripcion)
    values ('__TEST_CI_111B__', lpad('B', 24, 'T'), 'Para adjuntar', 'd') returning id into v_id;

  -- keys que no corresponden: no tocan nada
  if public.adjuntar_captura_ticket(v_id, 'tickets/' || v_otro::text || '/captura.jpg') then fallos := fallos || '[111] acepto la key de OTRO ticket; '; end if;
  if public.adjuntar_captura_ticket(v_id, 'tickets/' || v_id::text || '/otro.jpg') then fallos := fallos || '[111] acepto un nombre de archivo distinto de captura; '; end if;
  if public.adjuntar_captura_ticket(v_id, 'tickets/' || v_id::text || '/captura.exe') then fallos := fallos || '[111] acepto una extension no permitida; '; end if;
  if public.adjuntar_captura_ticket(v_id, 'tickets/' || v_id::text || '/../x/captura.jpg') then fallos := fallos || '[111] acepto una key con puntos; '; end if;
  if public.adjuntar_captura_ticket(v_id, lpad('B', 24, 'T') || '/captura.jpg') then fallos := fallos || '[111] acepto la key legada con el token; '; end if;
  if public.adjuntar_captura_ticket(null, 'tickets/x/captura.jpg') or public.adjuntar_captura_ticket(v_id, null) then fallos := fallos || '[111] acepto argumentos nulos; '; end if;
  if public.adjuntar_captura_ticket(v_otro, 'tickets/' || v_otro::text || '/captura.jpg') then fallos := fallos || '[111] adjunto a un ticket inexistente; '; end if;
  select * into t from public.tickets where id = v_id;
  if t.adjunto_key is not null then fallos := fallos || '[111] una key rechazada igual quedo guardada; '; end if;

  -- la valida se guarda, con adjunto_url en NULL
  if not public.adjuntar_captura_ticket(v_id, 'tickets/' || v_id::text || '/captura.webp') then fallos := fallos || '[111] rechazo la key valida; '; end if;
  select * into t from public.tickets where id = v_id;
  if t.adjunto_key is distinct from 'tickets/' || v_id::text || '/captura.webp' or t.adjunto_url is not null then
    fallos := fallos || '[111] la key valida no quedo guardada con adjunto_url en NULL; ';
  end if;

  -- un segundo adjunto no pisa el primero
  if public.adjuntar_captura_ticket(v_id, 'tickets/' || v_id::text || '/captura.png') then fallos := fallos || '[111] un segundo adjunto piso el primero; '; end if;
  select * into t from public.tickets where id = v_id;
  if t.adjunto_key is distinct from 'tickets/' || v_id::text || '/captura.webp' then fallos := fallos || '[111] la key original cambio; '; end if;

  -- privilegios
  if has_function_privilege('authenticated', 'public.adjuntar_captura_ticket(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.adjuntar_captura_ticket(uuid,text)', 'execute')
     or not has_function_privilege('project_admin', 'public.adjuntar_captura_ticket(uuid,text)', 'execute') then
    fallos := fallos || '[111] privilegios de adjuntar_captura_ticket incorrectos; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [111b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [111b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 112-a: purgar_datos_temporales — borra lo viejo y respeta lo reciente, vacia
-- el payload de entregas usadas, solo notificaciones leidas, ip/user_agent de
-- accesos_log sin borrar filas, regla inactiva y dias editables, auditoria
-- purga_ejecutada sin datos personales, privilegios y CHECK de config_retencion
-- ------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_n1 uuid;
  v_n2 uuid;
  v_n3 uuid;
  v_n4 uuid;
  v_r jsonb;
  v_r2 jsonb;
  v_n int;
  v_txt text;
  v_otros boolean;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_112a@example.test') returning id into v_user;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set activo = true, created_at = now() - interval '900 days' where user_id = v_user;

  -- intentos de rate-limit (la nueva y las tres legadas) y contexto de transaccion
  insert into public.intentos_publicos (ambito, clave, created_at) values
    ('__test_ci_112__', 'viejo', now() - interval '10 days'),
    ('__test_ci_112__', 'reciente', now() - interval '1 day');
  insert into public.ticket_busqueda_intentos (ip, dni, created_at) values
    ('__test_ci_112_viejo__', '99999999', now() - interval '10 days'),
    ('__test_ci_112_reciente__', '99999999', now() - interval '1 day');
  insert into public.ticket_creacion_intentos (ip, created_at) values
    ('__test_ci_112_viejo__', now() - interval '10 days'),
    ('__test_ci_112_reciente__', now() - interval '1 day');
  insert into public.encuesta_respuesta_intentos (ip, created_at) values
    ('__test_ci_112_viejo__', now() - interval '10 days'),
    ('__test_ci_112_reciente__', now() - interval '1 day');
  insert into public.contexto_transaccion (txid, rol, origen, creado_en) values
    (-1120001, 'sistema', '__test_ci_112__', now() - interval '3 days'),
    (-1120002, 'sistema', '__test_ci_112__', now() - interval '1 hour');

  -- entregas: abierta hace 40 d aunque su enlace siga vigente (se vacia), abierta hace 10 d (queda),
  -- vencida hace 40 d sin abrir (se vacia), vigente (queda)
  insert into public.entregas (token_hash, empleado_nombre, payload, expires_at, viewed_at) values
    ('__test_ci_112_e1__', 'Test CI 112', 'enc2:AAAA:BBBB', now() + interval '1 day', now() - interval '40 days'),
    ('__test_ci_112_e2__', 'Test CI 112', 'enc2:AAAA:BBBB', now() + interval '1 day', now() - interval '10 days'),
    ('__test_ci_112_e3__', 'Test CI 112', 'enc2:AAAA:BBBB', now() - interval '40 days', null),
    ('__test_ci_112_e4__', 'Test CI 112', 'enc2:AAAA:BBBB', now() + interval '1 day', null);

  -- notificaciones: personal leida vieja (se borra), personal sin leer vieja
  -- (queda), personal leida reciente (queda), general vieja leida por el staff
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino, creado_en, destinatario_id)
    values ('ticket_creado', 'x', gen_random_uuid(), '__test_ci_112__ n1', '/', now() - interval '200 days', v_user) returning id into v_n1;
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino, creado_en, destinatario_id)
    values ('ticket_creado', 'x', gen_random_uuid(), '__test_ci_112__ n2', '/', now() - interval '200 days', v_user) returning id into v_n2;
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino, creado_en, destinatario_id)
    values ('ticket_creado', 'x', gen_random_uuid(), '__test_ci_112__ n3', '/', now() - interval '10 days', v_user) returning id into v_n3;
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino, creado_en)
    values ('ticket_creado', 'x', gen_random_uuid(), '__test_ci_112__ n4', '/', now() - interval '200 days') returning id into v_n4;
  insert into public.notificaciones_lecturas (notificacion_id, usuario_id) values (v_n1, v_user), (v_n3, v_user), (v_n4, v_user);

  -- accesos_log: una fila de hace 400 d con ip y user_agent, otra de hace 10 d
  insert into public.accesos_log (cuenta_usuario, accion, ip, user_agent, detalle, created_at) values
    ('__test_ci_112_log_viejo__', 'ver', '203.0.113.7', 'navegador de prueba', 'detalle conservado', now() - interval '400 days'),
    ('__test_ci_112_log_nuevo__', 'ver', '203.0.113.8', 'navegador de prueba', 'detalle conservado', now() - interval '10 days');

  -- regla inactiva: no se purga mientras activo = false
  update public.config_retencion set activo = false where tabla = 'intentos_publicos';
  insert into public.intentos_publicos (ambito, clave, created_at) values ('__test_ci_112__', 'viejo_inactiva', now() - interval '10 days');

  v_r := public.purgar_datos_temporales();

  if (v_r ->> 'errores')::int <> 0 then fallos := fallos || '[112] la purga informo errores: ' || (v_r ->> 'errores') || '; '; end if;
  if jsonb_exists(v_r -> 'tablas', 'intentos_publicos') then fallos := fallos || '[112] una regla inactiva figura en el resultado; '; end if;
  select count(*) into v_n from public.intentos_publicos where clave = 'viejo_inactiva';
  if v_n <> 1 then fallos := fallos || '[112] se purgo una regla inactiva; '; end if;

  -- reactivada con 365 dias la fila de 10 dias queda; con 7 dias se borra
  update public.config_retencion set activo = true, dias = 365 where tabla = 'intentos_publicos';
  v_r2 := public.purgar_datos_temporales();
  select count(*) into v_n from public.intentos_publicos where clave = 'viejo';
  if v_n <> 1 then fallos := fallos || '[112] con 365 dias se borro una fila de 10 dias; '; end if;
  update public.config_retencion set dias = 7 where tabla = 'intentos_publicos';
  v_r2 := public.purgar_datos_temporales();
  select count(*) into v_n from public.intentos_publicos where ambito = '__test_ci_112__' and clave in ('viejo', 'viejo_inactiva');
  if v_n <> 0 then fallos := fallos || '[112] intentos_publicos viejos sin purgar; '; end if;
  select count(*) into v_n from public.intentos_publicos where ambito = '__test_ci_112__' and clave = 'reciente';
  if v_n <> 1 then fallos := fallos || '[112] se purgo un intento reciente; '; end if;

  select count(*) into v_n from public.ticket_busqueda_intentos where ip = '__test_ci_112_viejo__';
  if v_n <> 0 then fallos := fallos || '[112] ticket_busqueda_intentos viejo sin purgar; '; end if;
  select count(*) into v_n from public.ticket_busqueda_intentos where ip = '__test_ci_112_reciente__';
  if v_n <> 1 then fallos := fallos || '[112] se purgo un ticket_busqueda_intentos reciente; '; end if;
  select count(*) into v_n from public.ticket_creacion_intentos where ip = '__test_ci_112_viejo__';
  if v_n <> 0 then fallos := fallos || '[112] ticket_creacion_intentos viejo sin purgar; '; end if;
  select count(*) into v_n from public.encuesta_respuesta_intentos where ip = '__test_ci_112_viejo__';
  if v_n <> 0 then fallos := fallos || '[112] encuesta_respuesta_intentos viejo sin purgar; '; end if;
  select count(*) into v_n from public.encuesta_respuesta_intentos where ip = '__test_ci_112_reciente__';
  if v_n <> 1 then fallos := fallos || '[112] se purgo un encuesta_respuesta_intentos reciente; '; end if;

  select count(*) into v_n from public.contexto_transaccion where txid = -1120001;
  if v_n <> 0 then fallos := fallos || '[112] contexto_transaccion de 3 dias sin purgar; '; end if;
  select count(*) into v_n from public.contexto_transaccion where txid = -1120002;
  if v_n <> 1 then fallos := fallos || '[112] se purgo un contexto de hace 1 hora; '; end if;

  -- entregas: las 4 filas quedan, solo cambia el payload
  select count(*) into v_n from public.entregas where token_hash in ('__test_ci_112_e1__', '__test_ci_112_e2__', '__test_ci_112_e3__', '__test_ci_112_e4__');
  if v_n <> 4 then fallos := fallos || '[112] se borro una fila de entregas (' || v_n || '); '; end if;
  select payload into v_txt from public.entregas where token_hash = '__test_ci_112_e1__';
  if v_txt <> '' then fallos := fallos || '[112] la entrega abierta hace 40 dias conserva el payload; '; end if;
  select payload into v_txt from public.entregas where token_hash = '__test_ci_112_e3__';
  if v_txt <> '' then fallos := fallos || '[112] la entrega vencida hace 40 dias conserva el payload; '; end if;
  select payload into v_txt from public.entregas where token_hash = '__test_ci_112_e2__';
  if v_txt <> 'enc2:AAAA:BBBB' then fallos := fallos || '[112] se vacio la entrega abierta hace 10 dias; '; end if;
  select payload into v_txt from public.entregas where token_hash = '__test_ci_112_e4__';
  if v_txt <> 'enc2:AAAA:BBBB' then fallos := fallos || '[112] se vacio una entrega vigente; '; end if;

  -- notificaciones: solo las leidas
  if exists (select 1 from public.notificaciones where id = v_n1) then fallos := fallos || '[112] notificacion personal leida de 200 dias sin purgar; '; end if;
  if not exists (select 1 from public.notificaciones where id = v_n2) then fallos := fallos || '[112] se purgo una notificacion NO leida; '; end if;
  if not exists (select 1 from public.notificaciones where id = v_n3) then fallos := fallos || '[112] se purgo una notificacion reciente; '; end if;
  select count(*) into v_n from public.notificaciones_lecturas where notificacion_id = v_n1;
  if v_n <> 0 then fallos := fallos || '[112] la lectura de una notificacion purgada quedo huerfana; '; end if;
  -- la general solo se purga si ningun OTRO staff activo ya existente la dejo sin leer
  -- (en produccion puede haber staff real que no la leyo: entonces debe quedar)
  select exists (select 1 from public.staff s where s.activo and s.user_id <> v_user and s.created_at <= now() - interval '200 days') into v_otros;
  if not v_otros and exists (select 1 from public.notificaciones where id = v_n4) then fallos := fallos || '[112] notificacion general leida por todo el staff sin purgar; '; end if;
  if v_otros and not exists (select 1 from public.notificaciones where id = v_n4) then fallos := fallos || '[112] se purgo una general que otro staff no leyo; '; end if;

  -- accesos_log: las dos filas siguen, la vieja sin ip ni user_agent
  select count(*) into v_n from public.accesos_log where cuenta_usuario in ('__test_ci_112_log_viejo__', '__test_ci_112_log_nuevo__');
  if v_n <> 2 then fallos := fallos || '[112] la purga borro filas de accesos_log; '; end if;
  select count(*) into v_n from public.accesos_log where cuenta_usuario = '__test_ci_112_log_viejo__' and ip is null and user_agent is null and detalle = 'detalle conservado';
  if v_n <> 1 then fallos := fallos || '[112] la fila de accesos_log de 400 dias conserva ip/user_agent o perdio el detalle; '; end if;
  select count(*) into v_n from public.accesos_log where cuenta_usuario = '__test_ci_112_log_nuevo__' and ip = '203.0.113.8' and user_agent is not null;
  if v_n <> 1 then fallos := fallos || '[112] se nulifico ip/user_agent de una fila de 10 dias; '; end if;

  -- repetir no encuentra nada nuevo
  v_r2 := public.purgar_datos_temporales();
  if (v_r2 ->> 'total')::bigint <> 0 then fallos := fallos || '[112] una segunda purga seguida encontro filas (' || (v_r2 ->> 'total') || '); '; end if;

  -- auditoria: solo conteos, sin ip, correo ni nombres
  select count(*) into v_n from public.accesos_log where accion = 'purga_ejecutada' and created_at = now() and cuenta_usuario = '(sistema)';
  if v_n < 1 then fallos := fallos || '[112] la purga no dejo la fila purga_ejecutada; '; end if;
  select count(*) into v_n from public.accesos_log
   where accion = 'purga_ejecutada' and created_at = now()
     and (detalle !~ '^[{]' or detalle ~ '@' or detalle ~ '[0-9]+[.][0-9]+[.][0-9]+[.][0-9]+');
  if v_n <> 0 then fallos := fallos || '[112] el detalle de purga_ejecutada no es un JSON de conteos limpio; '; end if;

  -- config_retencion: CHECK, trigger de validacion, privilegios y policies
  begin insert into public.config_retencion (tabla, dias, accion) values ('tickets', 7, 'borrar'); fallos := fallos || '[112] acepto una tabla fuera de la lista; ';
  exception when check_violation then null; end;
  begin update public.config_retencion set dias = 0 where tabla = 'entregas'; fallos := fallos || '[112] acepto dias = 0; ';
  exception when check_violation then null; end;
  begin update public.config_retencion set dias = 4000 where tabla = 'entregas'; fallos := fallos || '[112] acepto dias = 4000; ';
  exception when check_violation then null; end;
  begin update public.config_retencion set accion = 'nulificar_columna' where tabla = 'intentos_publicos'; fallos := fallos || '[112] acepto cambiar la accion de una regla; ';
  exception when others then null; end;
  begin update public.config_retencion set tabla = 'accesos_log' where tabla = 'entregas'; fallos := fallos || '[112] acepto cambiar la tabla de una regla; ';
  exception when others then null; end;
  select count(*) into v_n from public.config_retencion;
  if v_n <> 8 then fallos := fallos || '[112] config_retencion no tiene las 8 reglas sembradas (' || v_n || '); '; end if;
  if has_table_privilege('authenticated', 'public.config_retencion', 'insert')
     or has_table_privilege('authenticated', 'public.config_retencion', 'delete')
     or has_table_privilege('anon', 'public.config_retencion', 'select')
     or not has_table_privilege('authenticated', 'public.config_retencion', 'select')
     or not has_column_privilege('authenticated', 'public.config_retencion', 'dias', 'update')
     or not has_column_privilege('authenticated', 'public.config_retencion', 'activo', 'update')
     or has_column_privilege('authenticated', 'public.config_retencion', 'tabla', 'update')
     or has_column_privilege('authenticated', 'public.config_retencion', 'accion', 'update') then
    fallos := fallos || '[112] privilegios de config_retencion incorrectos; ';
  end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'config_retencion'
    and ((cmd = 'SELECT' and qual like '%es_staff%') or (cmd = 'UPDATE' and qual like '%es_jefe%'));
  if v_n <> 2 then fallos := fallos || '[112] faltan las policies SELECT es_staff / UPDATE es_jefe de config_retencion; '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'config_retencion' and cmd in ('INSERT', 'DELETE', 'ALL');
  if v_n <> 0 then fallos := fallos || '[112] config_retencion tiene policy de INSERT/DELETE; '; end if;

  -- EXECUTE y guard
  if has_function_privilege('authenticated', 'public.purgar_datos_temporales()', 'execute')
     or has_function_privilege('anon', 'public.purgar_datos_temporales()', 'execute')
     or not has_function_privilege('project_admin', 'public.purgar_datos_temporales()', 'execute')
     or has_function_privilege('anon', 'public.purgar_datos_temporales_manual()', 'execute')
     or not has_function_privilege('authenticated', 'public.purgar_datos_temporales_manual()', 'execute') then
    fallos := fallos || '[112] EXECUTE de purgar_datos_temporales / _manual incorrecto; ';
  end if;
  begin
    perform public.purgar_datos_temporales_manual();
    fallos := fallos || '[112] purgar_datos_temporales_manual sin sesion no fue rechazada; ';
  exception when insufficient_privilege then null; end;

  if fallos = '' then
    raise exception 'TESTS_OK [112a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [112a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 112-b: anonimizar_empleado — plazo, estado y motivo, qué se anonimiza y qué
-- se conserva (historial, asignaciones, tickets), sin datos personales en los
-- eventos, doble anonimización, parametro con piso de 1 año y privilegios
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_otro uuid;
  v_rec uuid;
  v_act uuid;
  v_equipo uuid;
  v_asig uuid;
  v_cuenta uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;
  v_r jsonb;
  e public.empleados;
  v_n int;
  v_txt text;
  v_ev_antes int;
  v_ev_equipo int;
  v_baja timestamptz;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 112b') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado, correo_personal, telefono, whatsapp, notas, cargo)
    values ('Zulema', 'Quispe Test112', '99112001', v_empresa, 'Inactivo', 'zq112@example.test', '999000111', '999000222', 'nota privada 112', 'Chofer')
    returning id into v_emp;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado, telefono)
    values ('Otra', 'Persona112', '99112002', v_empresa, 'Inactivo', '988777666') returning id into v_otro;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado)
    values ('Reciente', 'Baja112', '99112003', v_empresa, 'Inactivo') returning id into v_rec;
  insert into public.empleados (nombres, apellidos, dni, empresa_id)
    values ('Activo', 'Vigente112', '99112004', v_empresa) returning id into v_act;

  -- las bajas: v_emp y v_otro hace 6 anios, v_rec hace un mes
  insert into public.empleado_eventos (empleado_id, evento, rol_actor, detalle, created_at) values
    (v_emp, 'baja_ejecutada', 'jefe', 'Renuncia', now() - interval '6 years'),
    (v_otro, 'baja_ejecutada', 'jefe', 'Renuncia', now() - interval '6 years'),
    (v_rec, 'baja_ejecutada', 'jefe', 'Renuncia', now() - interval '1 month');

  -- historial de equipos, cuentas y tickets del empleado
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_112b__', '__TEST_CI__ Tipo 112b');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_112B__', '__test_ci_112b__') returning id into v_equipo;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_equipo, v_emp) returning id into v_asig;
  insert into public.plataformas (id, nombre) values ('__test_ci_112b__', '__TEST_CI__ Plataforma 112b');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_112b__', '__test_ci_112b__@correo.test', 'personal') returning id into v_cuenta;
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta, v_emp);
  insert into public.tickets (codigo, token, titulo, descripcion, empleado_id, contacto_ingresado, estado)
    values ('__TEST_CI_112B1__', lpad('1', 24, 'T'), 'Titulo del ticket 1', 'Descripcion 1', v_emp, 'contacto libre 112', 'cerrado') returning id into v_t1;
  insert into public.tickets (codigo, token, titulo, descripcion, contacto_ingresado)
    values ('__TEST_CI_112B2__', lpad('2', 24, 'T'), 'Titulo del ticket 2', 'Descripcion 2', '999000111') returning id into v_t2;
  insert into public.tickets (codigo, token, titulo, descripcion, contacto_ingresado)
    values ('__TEST_CI_112B3__', lpad('3', 24, 'T'), 'Titulo del ticket 3', 'Descripcion 3', 'ajeno112@example.test') returning id into v_t3;
  insert into public.entregas (token_hash, empleado_id, empleado_nombre, payload, expires_at) values
    ('__test_ci_112b_e1__', v_emp, 'Zulema Quispe Test112', '', now() - interval '6 years'),
    ('__test_ci_112b_e2__', v_otro, 'Otra Persona112', '', now() - interval '6 years');
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino) values
    ('empleado_baja', 'empleado', v_emp, 'Empleado dado de baja · Zulema Quispe Test112', '/empleados/x'),
    ('empleado_baja', 'empleado', v_otro, 'Empleado dado de baja · Otra Persona112', '/empleados/y');
  insert into public.accesos_log (cuenta_usuario, accion, detalle) values
    ('__test_ci_112b__', 'entrega_abierta', 'Entrega abierta — Zulema Quispe Test112'),
    ('__test_ci_112b__', 'enviar', 'Entrega creada para Zulema Quispe Test112 (expira en 24h)'),
    ('__test_ci_112b__', 'entrega_abierta', 'Entrega abierta — Otra Persona112');
  select count(*) into v_ev_equipo from public.eventos_equipo where equipo_id = v_equipo;
  select count(*) into v_n from public.eventos_equipo where equipo_id = v_equipo and detalle like '%Zulema Quispe Test112%';
  if v_n < 1 then fallos := fallos || '[112] el fixture no genero el evento "Entregado a" con el nombre; '; end if;
  select count(*) into v_ev_antes from public.empleado_eventos where empleado_id = v_emp;

  -- fecha de baja derivada de la hoja de vida
  v_baja := public.empleado_fecha_baja(v_emp);
  if v_baja > now() - interval '5 years 11 months' or v_baja < now() - interval '6 years 1 month' then fallos := fallos || '[112] empleado_fecha_baja no devolvio la baja de hace 6 anios; '; end if;
  v_baja := public.empleado_fecha_baja(v_rec);
  if v_baja < now() - interval '2 months' then fallos := fallos || '[112] empleado_fecha_baja de una baja reciente es vieja; '; end if;

  -- rechazos (ninguno modifica nada)
  begin perform public.anonimizar_empleado_interno(v_act, 'prueba');
    fallos := fallos || '[112] anonimizo a un empleado Activo; ';
  exception when raise_exception then if sqlerrm not like '%Inactivo%' then fallos := fallos || '[112] el rechazo del Activo dio otro mensaje: ' || sqlerrm || '; '; end if; end;
  begin perform public.anonimizar_empleado_interno(v_rec, 'prueba');
    fallos := fallos || '[112] anonimizo una baja de hace un mes; ';
  exception when raise_exception then if sqlerrm not like '%cumple%' then fallos := fallos || '[112] el rechazo por plazo dio otro mensaje: ' || sqlerrm || '; '; end if; end;
  begin perform public.anonimizar_empleado_interno(v_emp, '   ');
    fallos := fallos || '[112] anonimizo sin motivo; ';
  exception when raise_exception then null; end;
  begin perform public.anonimizar_empleado_interno(v_emp, repeat('x', 201));
    fallos := fallos || '[112] acepto un motivo de 201 caracteres; ';
  exception when raise_exception then null; end;
  begin perform public.anonimizar_empleado_interno(gen_random_uuid(), 'prueba');
    fallos := fallos || '[112] anonimizo un empleado inexistente; ';
  exception when raise_exception then null; end;
  -- piso de 1 anio aunque el parametro valga 0, y parametro mayor que la antiguedad
  update public.config_parametros set valor = '0'::jsonb where clave = 'anios_anonimizacion_empleado';
  begin perform public.anonimizar_empleado_interno(v_rec, 'prueba');
    fallos := fallos || '[112] con el parametro en 0 anonimizo una baja de un mes; ';
  exception when raise_exception then null; end;
  update public.config_parametros set valor = '10'::jsonb where clave = 'anios_anonimizacion_empleado';
  begin perform public.anonimizar_empleado_interno(v_emp, 'prueba');
    fallos := fallos || '[112] con el parametro en 10 anonimizo una baja de 6 anios; ';
  exception when raise_exception then null; end;
  update public.config_parametros set valor = '5'::jsonb where clave = 'anios_anonimizacion_empleado';
  select nombres into v_txt from public.empleados where id = v_emp;
  if v_txt <> 'Zulema' then fallos := fallos || '[112] un rechazo modifico al empleado; '; end if;

  -- la anonimizacion
  v_r := public.anonimizar_empleado_interno(v_emp, 'Plazo de 5 anios cumplido');

  select * into e from public.empleados where id = v_emp;
  if e.nombres <> 'Empleado' or e.apellidos <> 'anonimizado' then fallos := fallos || '[112] nombre sin anonimizar; '; end if;
  if e.dni !~ '^ANON-[0-9a-f]{16}$' then fallos := fallos || '[112] dni con formato inesperado: ' || e.dni || '; '; end if;
  if e.correo_personal is not null or e.telefono is not null or e.whatsapp is not null or e.notas is not null then fallos := fallos || '[112] contacto o notas sin limpiar; '; end if;
  if e.anonimizado_at is null then fallos := fallos || '[112] anonimizado_at sin marcar; '; end if;
  if e.cargo <> 'Chofer' or e.estado::text <> 'Inactivo' or e.empresa_id <> v_empresa then fallos := fallos || '[112] se perdio cargo, estado o empresa; '; end if;
  select * into e from public.empleados where id = v_otro;
  if e.nombres <> 'Otra' or e.dni <> '99112002' or e.telefono <> '988777666' or e.anonimizado_at is not null then fallos := fallos || '[112] se modifico a otro empleado; '; end if;

  -- tickets: solo el contacto; el resto queda
  select count(*) into v_n from public.tickets where id = v_t1 and contacto_ingresado is null and titulo = 'Titulo del ticket 1' and descripcion = 'Descripcion 1' and empleado_id = v_emp;
  if v_n <> 1 then fallos := fallos || '[112] ticket vinculado: contacto sin limpiar o ticket alterado; '; end if;
  select count(*) into v_n from public.tickets where id = v_t2 and contacto_ingresado is null;
  if v_n <> 1 then fallos := fallos || '[112] ticket que repetia el telefono sin limpiar; '; end if;
  select count(*) into v_n from public.tickets where id = v_t3 and contacto_ingresado = 'ajeno112@example.test';
  if v_n <> 1 then fallos := fallos || '[112] se limpio el contacto de un ticket ajeno; '; end if;
  if (v_r ->> 'tickets_contacto')::int <> 2 then fallos := fallos || '[112] el resumen cuenta ' || (v_r ->> 'tickets_contacto') || ' tickets, esperaba 2; '; end if;

  -- entregas, notificaciones, auditoria de accesos y eventos de equipos
  select count(*) into v_n from public.entregas where token_hash = '__test_ci_112b_e1__' and empleado_nombre = 'Empleado anonimizado';
  if v_n <> 1 then fallos := fallos || '[112] entrega sin anonimizar; '; end if;
  select count(*) into v_n from public.entregas where token_hash = '__test_ci_112b_e2__' and empleado_nombre = 'Otra Persona112';
  if v_n <> 1 then fallos := fallos || '[112] se modifico la entrega de otro empleado; '; end if;
  select count(*) into v_n from public.notificaciones where entidad_id = v_emp and titulo = 'Empleado dado de baja · Empleado anonimizado';
  if v_n <> 1 then fallos := fallos || '[112] notificacion del empleado sin anonimizar; '; end if;
  select count(*) into v_n from public.notificaciones where entidad_id = v_otro and titulo = 'Empleado dado de baja · Otra Persona112';
  if v_n <> 1 then fallos := fallos || '[112] se modifico la notificacion de otro empleado; '; end if;
  select count(*) into v_n from public.accesos_log where cuenta_usuario = '__test_ci_112b__' and detalle like '%Zulema%';
  if v_n <> 0 then fallos := fallos || '[112] accesos_log conserva el nombre; '; end if;
  select count(*) into v_n from public.accesos_log where cuenta_usuario = '__test_ci_112b__' and detalle in ('Entrega abierta — Empleado anonimizado', 'Entrega creada para Empleado anonimizado (expira en 24h)');
  if v_n <> 2 then fallos := fallos || '[112] accesos_log: el reemplazo del nombre no conservo el resto del texto; '; end if;
  select count(*) into v_n from public.accesos_log where cuenta_usuario = '__test_ci_112b__' and detalle = 'Entrega abierta — Otra Persona112';
  if v_n <> 1 then fallos := fallos || '[112] se modifico el accesos_log de otra persona; '; end if;
  select count(*) into v_n from public.eventos_equipo where equipo_id = v_equipo;
  if v_n <> v_ev_equipo then fallos := fallos || '[112] cambio la cantidad de eventos del equipo; '; end if;
  select count(*) into v_n from public.eventos_equipo where equipo_id = v_equipo and detalle like '%Zulema%';
  if v_n <> 0 then fallos := fallos || '[112] eventos_equipo conserva el nombre; '; end if;
  select count(*) into v_n from public.eventos_equipo where equipo_id = v_equipo and detalle like 'Entregado a Empleado anonimizado%';
  if v_n <> 1 then fallos := fallos || '[112] eventos_equipo: falta "Entregado a Empleado anonimizado"; '; end if;

  -- historial intacto: asignaciones, cuenta y eventos del empleado
  select count(*) into v_n from public.asignaciones_equipo where id = v_asig and empleado_id = v_emp and fecha_fin is null;
  if v_n <> 1 then fallos := fallos || '[112] la asignacion de equipo cambio; '; end if;
  select count(*) into v_n from public.asignaciones_cuenta where cuenta_id = v_cuenta and empleado_id = v_emp;
  if v_n <> 1 then fallos := fallos || '[112] la asignacion de cuenta cambio; '; end if;
  if (v_r ->> 'asignaciones_abiertas')::int <> 2 then fallos := fallos || '[112] el resumen debia informar 2 asignaciones abiertas; '; end if;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp;
  if v_n < v_ev_antes + 1 then fallos := fallos || '[112] la hoja de vida perdio eventos o no sumo el anonimizado; '; end if;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'anonimizado' and detalle like '%Plazo de 5 anios cumplido%';
  if v_n <> 1 then fallos := fallos || '[112] falta el evento anonimizado con el motivo; '; end if;
  select count(*) into v_n from public.empleado_eventos
   where empleado_id = v_emp
     and (coalesce(detalle, '') || coalesce(campo, '') || coalesce(valor_anterior, '') || coalesce(valor_nuevo, '') || coalesce(user_email, '')) ~* '(zulema|quispe|99112001|zq112|999000111|999000222|nota privada)';
  if v_n <> 0 then fallos := fallos || '[112] la hoja de vida contiene datos personales del empleado; '; end if;

  -- no se anonimiza dos veces
  begin perform public.anonimizar_empleado_interno(v_emp, 'otra vez');
    fallos := fallos || '[112] anonimizo dos veces; ';
  exception when raise_exception then if sqlerrm not like '%ya fue anonimizado%' then fallos := fallos || '[112] el doble intento dio otro mensaje: ' || sqlerrm || '; '; end if; end;

  -- vista y privilegios
  select count(*) into v_n from public.v_empleados_anonimizables;
  if v_n <> 0 then fallos := fallos || '[112] la vista devolvio filas sin sesion de JEFE; '; end if;
  if pg_get_viewdef('public.v_empleados_anonimizables'::regclass) not like '%puede_actual%' then fallos := fallos || '[112] la vista no filtra por puede_actual; '; end if;
  if not has_table_privilege('authenticated', 'public.v_empleados_anonimizables', 'select')
     or has_table_privilege('anon', 'public.v_empleados_anonimizables', 'select')
     or has_function_privilege('authenticated', 'public.anonimizar_empleado_interno(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.anonimizar_empleado_interno(uuid,text)', 'execute')
     or not has_function_privilege('project_admin', 'public.anonimizar_empleado_interno(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.anonimizar_empleado(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.anonimizar_empleado(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.empleado_fecha_baja(uuid)', 'execute')
     or has_function_privilege('anon', 'public.empleado_fecha_baja(uuid)', 'execute') then
    fallos := fallos || '[112] privilegios de la vista o de las funciones de anonimizacion incorrectos; ';
  end if;
  begin perform public.anonimizar_empleado(v_otro, 'prueba');
    fallos := fallos || '[112] anonimizar_empleado sin sesion no fue rechazada; ';
  exception when insufficient_privilege then null; end;
  select count(*) into v_n from public.empleados where id = v_otro and anonimizado_at is null;
  if v_n <> 1 then fallos := fallos || '[112] el intento sin sesion modifico al empleado; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [112b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [112b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 112-c: entorno — una sola fila, produccion por defecto, es_branch() solo
-- con 'branch', la fila no se borra ni se vacia y ningun cliente la escribe
-- ------------------------------------------------------------
do $$
declare
  v_n int;
  v_txt text;
  fallos text := '';
begin
  select count(*) into v_n from public.entorno;
  if v_n <> 1 then fallos := fallos || '[112] entorno debe tener exactamente 1 fila (' || v_n || '); '; end if;
  select nombre into v_txt from public.entorno where id = 1;
  if v_txt <> 'produccion' then fallos := fallos || '[112] el entorno no es produccion: ' || coalesce(v_txt, 'null') || '; '; end if;
  if public.es_branch() then fallos := fallos || '[112] es_branch() es true en produccion; '; end if;

  update public.entorno set nombre = 'branch' where id = 1;
  if not public.es_branch() then fallos := fallos || '[112] es_branch() es false con nombre = branch; '; end if;
  update public.entorno set nombre = 'produccion' where id = 1;
  if public.es_branch() then fallos := fallos || '[112] es_branch() sigue true al volver a produccion; '; end if;

  begin update public.entorno set nombre = 'staging' where id = 1; fallos := fallos || '[112] acepto un nombre de entorno fuera de la lista; ';
  exception when check_violation then null; end;
  begin insert into public.entorno (id, nombre) values (2, 'branch'); fallos := fallos || '[112] acepto una segunda fila de entorno; ';
  exception when check_violation then null; end;
  begin insert into public.entorno (id, nombre) values (1, 'branch'); fallos := fallos || '[112] acepto duplicar la fila 1; ';
  exception when unique_violation then null; end;
  update public.entorno set id = 2 where id = 1;
  select count(*) into v_n from public.entorno where id = 1;
  if v_n <> 1 then fallos := fallos || '[112] un UPDATE cambio el id de la fila de entorno; '; end if;
  begin delete from public.entorno; fallos := fallos || '[112] permitio borrar la fila de entorno; ';
  exception when raise_exception then null; end;
  begin truncate public.entorno; fallos := fallos || '[112] permitio TRUNCATE de entorno; ';
  exception when raise_exception then null; end;
  select count(*) into v_n from public.entorno;
  if v_n <> 1 then fallos := fallos || '[112] la fila de entorno desaparecio; '; end if;

  if has_table_privilege('authenticated', 'public.entorno', 'insert')
     or has_table_privilege('authenticated', 'public.entorno', 'update')
     or has_table_privilege('authenticated', 'public.entorno', 'delete')
     or has_table_privilege('anon', 'public.entorno', 'select')
     or not has_table_privilege('authenticated', 'public.entorno', 'select')
     or has_function_privilege('anon', 'public.es_branch()', 'execute')
     or not has_function_privilege('authenticated', 'public.es_branch()', 'execute') then
    fallos := fallos || '[112] privilegios de entorno / es_branch incorrectos; ';
  end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'entorno' and cmd = 'SELECT' and qual like '%es_staff%';
  if v_n <> 1 then fallos := fallos || '[112] falta la policy SELECT es_staff de entorno; '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'entorno' and cmd <> 'SELECT';
  if v_n <> 0 then fallos := fallos || '[112] entorno tiene policies de escritura; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [112c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [112c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 108-a: catálogo (7 tipos, 24 pasos), privilegios (el cliente solo lee),
-- policies, EXECUTE de RPC y núcleos, y el guard 42501 de las 5 RPC sin sesión
-- ------------------------------------------------------------
do $$
declare
  v_n int;
  v_f text;
  fallos text := '';
begin
  select count(*) into v_n from public.solicitud_tipos;
  if v_n <> 7 then fallos := fallos || '[108] se esperaban 7 tipos y hay ' || v_n || '; '; end if;
  select count(*) into v_n from public.solicitud_plantilla_pasos;
  if v_n <> 24 then fallos := fallos || '[108] se esperaban 24 pasos de plantilla y hay ' || v_n || '; '; end if;
  select count(*) into v_n from public.solicitud_tipos t
   where not exists (select 1 from public.solicitud_plantilla_pasos p where p.tipo_id = t.id);
  if v_n <> 0 then fallos := fallos || '[108] hay tipos sin pasos de plantilla; '; end if;
  select count(*) into v_n from public.solicitud_plantilla_pasos where tipo_id = 'baja_empleado' and dinamico;
  if v_n <> 3 then fallos := fallos || '[108] la baja debe tener 3 pasos dinamicos y tiene ' || v_n || '; '; end if;
  select count(*) into v_n from public.transiciones_solicitud_permitidas;
  if v_n <> 2 then fallos := fallos || '[108] la whitelist debe tener 2 transiciones; '; end if;
  if exists (select 1 from public.transiciones_solicitud_permitidas where origen <> 'abierta') then
    fallos := fallos || '[108] completada y cancelada deben ser terminales; ';
  end if;

  -- el cliente solo lee: sin INSERT/UPDATE, DELETE solo por RLS (jefe), anon nada
  if has_table_privilege('authenticated', 'public.solicitudes', 'insert')
     or has_table_privilege('authenticated', 'public.solicitudes', 'update')
     or has_table_privilege('authenticated', 'public.solicitud_pasos', 'insert')
     or has_table_privilege('authenticated', 'public.solicitud_pasos', 'update')
     or has_table_privilege('authenticated', 'public.solicitud_tipos', 'insert')
     or has_table_privilege('authenticated', 'public.solicitud_plantilla_pasos', 'update')
     or has_table_privilege('authenticated', 'public.transiciones_solicitud_permitidas', 'insert')
     or not has_table_privilege('authenticated', 'public.solicitudes', 'select')
     or not has_table_privilege('authenticated', 'public.solicitud_pasos', 'select')
     or has_table_privilege('anon', 'public.solicitudes', 'select')
     or has_table_privilege('anon', 'public.solicitud_pasos', 'select')
     or has_table_privilege('anon', 'public.solicitud_tipos', 'select') then
    fallos := fallos || '[108] privilegios de tablas incorrectos; ';
  end if;
  if has_sequence_privilege('authenticated', 'public.solicitud_codigo_seq', 'usage')
     or has_sequence_privilege('anon', 'public.solicitud_codigo_seq', 'usage') then
    fallos := fallos || '[108] la secuencia de codigos es usable por clientes; ';
  end if;

  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename in ('solicitudes', 'solicitud_pasos', 'solicitud_tipos', 'solicitud_plantilla_pasos')
    and cmd = 'SELECT' and qual like '%puede_actual%empleados%';
  if v_n <> 4 then fallos := fallos || '[108] faltan policies SELECT con el modulo empleados (' || v_n || '/4); '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename in ('solicitudes', 'solicitud_pasos')
    and cmd = 'DELETE' and qual like '%es_jefe%';
  if v_n <> 2 then fallos := fallos || '[108] faltan policies DELETE es_jefe; '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public'
    and tablename in ('solicitudes', 'solicitud_pasos', 'solicitud_tipos', 'solicitud_plantilla_pasos', 'transiciones_solicitud_permitidas')
    and cmd in ('INSERT', 'UPDATE', 'ALL');
  if v_n <> 0 then fallos := fallos || '[108] las tablas de solicitudes tienen policies de escritura; '; end if;
  select count(*) into v_n from pg_class where oid in ('public.solicitudes'::regclass, 'public.solicitud_pasos'::regclass,
    'public.solicitud_tipos'::regclass, 'public.solicitud_plantilla_pasos'::regclass, 'public.transiciones_solicitud_permitidas'::regclass) and relrowsecurity;
  if v_n <> 5 then fallos := fallos || '[108] alguna tabla de solicitudes sin RLS; '; end if;

  -- EXECUTE: RPC a authenticated; nucleos, internas y triggers solo a project_admin
  foreach v_f in array array[
    'public.crear_solicitud(text, uuid, jsonb, jsonb, text, text, uuid)',
    'public.completar_paso_solicitud(uuid, uuid, text)',
    'public.omitir_paso_solicitud(uuid, text)',
    'public.cancelar_solicitud(uuid, text)',
    'public.convertir_ticket_en_solicitud(uuid, text, text)'] loop
    if not has_function_privilege('authenticated', v_f, 'execute') or has_function_privilege('anon', v_f, 'execute') then
      fallos := fallos || '[108] EXECUTE incorrecto en ' || v_f || '; ';
    end if;
  end loop;
  foreach v_f in array array[
    'public.crear_solicitud_nucleo(text, uuid, jsonb, jsonb, text, text, uuid)',
    'public.completar_paso_solicitud_nucleo(uuid, uuid, text)',
    'public.omitir_paso_solicitud_nucleo(uuid, text)',
    'public.cancelar_solicitud_nucleo(uuid, text)',
    'public.convertir_ticket_en_solicitud_nucleo(uuid, text, text)',
    'public.solicitud_baja_crear(uuid, text, uuid[], uuid[], integer, integer, integer)',
    'public.solicitud_marcar_paso(uuid, text, uuid, uuid)',
    'public.solicitud_revertir_paso(text, uuid)',
    'public.solicitud_evaluar_cierre(uuid)',
    'public.siguiente_codigo_solicitud()'] loop
    if has_function_privilege('authenticated', v_f, 'execute') or has_function_privilege('anon', v_f, 'execute')
       or not has_function_privilege('project_admin', v_f, 'execute') then
      fallos := fallos || '[108] EXECUTE incorrecto en ' || v_f || '; ';
    end if;
  end loop;

  -- sin sesion (auth.uid() NULL) cada RPC publica responde 42501
  begin perform public.crear_solicitud('alta_empleado'); fallos := fallos || '[108] crear_solicitud respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[108] crear_solicitud sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.completar_paso_solicitud(gen_random_uuid()); fallos := fallos || '[108] completar_paso_solicitud respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[108] completar_paso_solicitud sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.omitir_paso_solicitud(gen_random_uuid(), 'x'); fallos := fallos || '[108] omitir_paso_solicitud respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[108] omitir_paso_solicitud sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.cancelar_solicitud(gen_random_uuid(), 'x'); fallos := fallos || '[108] cancelar_solicitud respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[108] cancelar_solicitud sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.convertir_ticket_en_solicitud(gen_random_uuid(), 'acceso_nuevo'); fallos := fallos || '[108] convertir_ticket_en_solicitud respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[108] convertir_ticket_en_solicitud sin sesion lanzo ' || sqlstate || '; '; end if; end;

  if fallos = '' then
    raise exception 'TESTS_OK [108a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [108a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 108-b: crear_solicitud_nucleo — alta con persona nueva en la misma
-- transaccion, validaciones del empleado, una sola alta/baja/cambio abierta,
-- baja a mano rechazada, estado del empleado y limites de nota/datos/origen
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_e2 uuid;
  v_sol public.solicitudes;
  v_sol2 public.solicitudes;
  v_n int;
  v_paso record;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 108b') returning id into v_empresa;

  v_sol := public.crear_solicitud_nucleo('alta_empleado', null,
    jsonb_build_object('nombres', '  Test ', 'apellidos', 'CI 108b', 'dni', '99010801', 'empresa_id', v_empresa, 'cargo', 'Operario'),
    '{}'::jsonb, '   Pedido de RRHH por correo   ', 'rrhh_correo', null);
  select id into v_emp from public.empleados where dni = '99010801';
  if v_emp is null then fallos := fallos || '[108] el alta no creo a la persona; '; end if;
  if v_sol.codigo !~ '^SOL-[0-9]{4,}$' then fallos := fallos || '[108] codigo con formato inesperado: ' || v_sol.codigo || '; '; end if;
  if v_sol.empleado_id is distinct from v_emp or v_sol.estado <> 'abierta' or v_sol.origen <> 'rrhh_correo' or v_sol.tipo_id <> 'alta_empleado' then
    fallos := fallos || '[108] la solicitud de alta quedo incompleta; ';
  end if;
  if v_sol.nota is distinct from 'Pedido de RRHH por correo' then fallos := fallos || '[108] la nota no se limpio; '; end if;
  if (select nombres from public.empleados where id = v_emp) <> 'Test' or (select cargo from public.empleados where id = v_emp) <> 'Operario' then
    fallos := fallos || '[108] los datos del empleado nuevo no se guardaron limpios; ';
  end if;
  if v_sol.creada_por is not null then fallos := fallos || '[108] creada_por debia ser NULL sin sesion; '; end if;
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id;
  if v_n <> 7 then fallos := fallos || '[108] el alta debia copiar 7 pasos y copio ' || v_n || '; '; end if;
  select estado, automatico, referencia_id into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'registrar_empleado';
  if v_paso.estado is distinct from 'hecho' or v_paso.referencia_id is distinct from v_emp then
    fallos := fallos || '[108] registrar_empleado debia nacer hecho con la persona de referencia; ';
  end if;
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id and estado = 'pendiente';
  if v_n <> 6 then fallos := fallos || '[108] debian quedar 6 pasos pendientes y hay ' || v_n || '; '; end if;
  -- autocompleta se copia de la plantilla: 5 de los 7 pasos del alta se marcan solos
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id and autocompleta;
  if v_n <> 5 then fallos := fallos || '[108] el alta debia copiar autocompleta en 5 pasos y copio ' || v_n || '; '; end if;
  select count(*) into v_n from public.empleado_eventos where empleado_id = v_emp and evento = 'creado';
  if v_n <> 1 then fallos := fallos || '[108] la persona creada por la RPC no dejo su evento creado; '; end if;

  -- el codigo es correlativo
  v_sol2 := public.crear_solicitud_nucleo('cambio_puesto', v_emp);
  if substring(v_sol2.codigo from 5)::int <> substring(v_sol.codigo from 5)::int + 1 then fallos := fallos || '[108] codigos no correlativos; '; end if;

  -- una sola alta / cambio de puesto abierta por persona, con el codigo de la existente
  begin
    perform public.crear_solicitud_nucleo('alta_empleado', v_emp);
    fallos := fallos || '[108] permitio una segunda alta abierta; ';
  exception when others then
    if sqlerrm not like '%' || v_sol.codigo || '%' then fallos := fallos || '[108] la segunda alta se rechazo sin citar el codigo: ' || sqlerrm || '; '; end if;
  end;
  begin
    perform public.crear_solicitud_nucleo('cambio_puesto', v_emp);
    fallos := fallos || '[108] permitio un segundo cambio de puesto abierto; ';
  exception when others then
    if sqlerrm not like '%' || v_sol2.codigo || '%' then fallos := fallos || '[108] el segundo cambio se rechazo sin citar el codigo: ' || sqlerrm || '; '; end if;
  end;
  begin
    insert into public.solicitudes (tipo_id, empleado_id) values ('alta_empleado', v_emp);
    fallos := fallos || '[108] el indice unico no freno una alta duplicada; ';
  exception when unique_violation then null; end;
  -- acceso, equipo y licencia SI admiten varias abiertas
  perform public.crear_solicitud_nucleo('acceso_nuevo', v_emp);
  perform public.crear_solicitud_nucleo('acceso_nuevo', v_emp);
  select count(*) into v_n from public.solicitudes where empleado_id = v_emp and tipo_id = 'acceso_nuevo' and estado = 'abierta';
  if v_n <> 2 then fallos := fallos || '[108] acceso_nuevo debia admitir dos abiertas; '; end if;

  -- validaciones del alta con persona nueva
  begin
    perform public.crear_solicitud_nucleo('alta_empleado', null, jsonb_build_object('nombres', 'A', 'apellidos', 'B', 'dni', '99010801', 'empresa_id', v_empresa));
    fallos := fallos || '[108] permitio un DNI repetido; ';
  exception when others then if sqlerrm not like '%Ya existe un empleado con ese DNI%' then fallos := fallos || '[108] DNI repetido rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.crear_solicitud_nucleo('alta_empleado', null, jsonb_build_object('nombres', 'A', 'apellidos', 'B', 'dni', '1234', 'empresa_id', v_empresa));
    fallos := fallos || '[108] permitio un DNI de 4 digitos; ';
  exception when others then if sqlerrm not like '%8 dígitos%' then fallos := fallos || '[108] DNI corto rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.crear_solicitud_nucleo('alta_empleado', null, jsonb_build_object('nombres', 'A', 'apellidos', 'B', 'dni', '99010802', 'empresa_id', gen_random_uuid()));
    fallos := fallos || '[108] permitio una empresa inexistente; ';
  exception when others then if sqlerrm not like '%empresa indicada no existe%' then fallos := fallos || '[108] empresa inexistente rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.crear_solicitud_nucleo('alta_empleado', null, jsonb_build_object('nombres', 'A', 'apellidos', 'B', 'dni', '99010802'));
    fallos := fallos || '[108] permitio un alta sin empresa; ';
  exception when others then if sqlerrm not like '%empresa es obligatoria%' then fallos := fallos || '[108] alta sin empresa rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.crear_solicitud_nucleo('alta_empleado', null, jsonb_build_object('nombres', '', 'apellidos', 'B', 'dni', '99010802', 'empresa_id', v_empresa));
    fallos := fallos || '[108] permitio nombres vacios; ';
  exception when others then if sqlerrm not like '%nombres%obligatorios%' then fallos := fallos || '[108] nombres vacios rechazados por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.crear_solicitud_nucleo('alta_empleado', null, jsonb_build_object('nombres', 'A', 'apellidos', 'B', 'dni', '99010802', 'empresa_id', v_empresa, 'fecha_alta', 'ayer'));
    fallos := fallos || '[108] permitio una fecha invalida; ';
  exception when others then if sqlerrm not like '%fecha de ingreso%' then fallos := fallos || '[108] fecha invalida rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.crear_solicitud_nucleo('alta_empleado');
    fallos := fallos || '[108] permitio un alta sin persona; ';
  exception when others then if sqlerrm not like '%Indique los datos%' then fallos := fallos || '[108] alta sin persona rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.crear_solicitud_nucleo('alta_empleado', v_emp, jsonb_build_object('nombres', 'A'));
    fallos := fallos || '[108] permitio id y datos a la vez; ';
  exception when others then if sqlerrm not like '%no ambos%' then fallos := fallos || '[108] id y datos rechazados por otro motivo: ' || sqlerrm || '; '; end if; end;
  select count(*) into v_n from public.empleados where dni = '99010802';
  if v_n <> 0 then fallos := fallos || '[108] un alta rechazada dejo a la persona creada; '; end if;

  -- tipo, baja a mano, empleado ausente o inexistente
  begin perform public.crear_solicitud_nucleo('inventado', v_emp); fallos := fallos || '[108] permitio un tipo inexistente; ';
  exception when others then if sqlerrm not like '%no existe o no está disponible%' then fallos := fallos || '[108] tipo inexistente rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_solicitud_nucleo('baja_empleado', v_emp); fallos := fallos || '[108] permitio crear una baja a mano; ';
  exception when others then if sqlerrm not like '%Dar de baja%' then fallos := fallos || '[108] baja a mano rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_solicitud_nucleo('cambio_puesto'); fallos := fallos || '[108] permitio un cambio de puesto sin empleado; ';
  exception when others then if sqlerrm not like '%Elija al empleado%' then fallos := fallos || '[108] sin empleado rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_solicitud_nucleo('licencia', gen_random_uuid()); fallos := fallos || '[108] permitio un empleado inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[108] empleado inexistente lanzo ' || sqlstate || ' en vez de P0002; '; end if; end;

  -- limites de nota, datos y origen
  begin perform public.crear_solicitud_nucleo('licencia', v_emp, null, '{}'::jsonb, repeat('x', 1001)); fallos := fallos || '[108] permitio una nota de 1001 caracteres; ';
  exception when others then if sqlerrm not like '%1000%' then fallos := fallos || '[108] nota larga rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_solicitud_nucleo('licencia', v_emp, null, '[1]'::jsonb); fallos := fallos || '[108] permitio datos que no son un objeto; ';
  exception when others then if sqlerrm not like '%objeto JSON%' then fallos := fallos || '[108] datos no objeto rechazados por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_solicitud_nucleo('licencia', v_emp, null, jsonb_build_object('x', repeat('y', 4100))); fallos := fallos || '[108] permitio datos de mas de 4000 caracteres; ';
  exception when others then if sqlerrm not like '%4000%' then fallos := fallos || '[108] datos largos rechazados por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_solicitud_nucleo('licencia', v_emp, null, '{}'::jsonb, null, 'inventado'); fallos := fallos || '[108] permitio un origen inventado; ';
  exception when others then if sqlerrm not like '%origen%' then fallos := fallos || '[108] origen inventado rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- estado del empleado: solo la devolucion de equipo admite a un Inactivo
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado) values ('Test', 'CI 108b Baja', '99010803', v_empresa, 'Inactivo') returning id into v_e2;
  begin perform public.crear_solicitud_nucleo('cambio_puesto', v_e2); fallos := fallos || '[108] permitio un cambio de puesto a un Inactivo; ';
  exception when others then if sqlerrm not like '%no está activo%' then fallos := fallos || '[108] Inactivo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_solicitud_nucleo('alta_empleado', v_e2); fallos := fallos || '[108] permitio un alta a un Inactivo; ';
  exception when others then if sqlerrm not like '%no está activo%' then fallos := fallos || '[108] alta a Inactivo rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  v_sol2 := public.crear_solicitud_nucleo('devolucion_equipo', v_e2);
  if v_sol2.estado <> 'abierta' then fallos := fallos || '[108] la devolucion de un Inactivo debia abrirse; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [108b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [108b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 108-c: AUTOCOMPLETADO — usar los modulos de siempre marca el paso de la
-- solicitud abierta de ESA persona (cuenta, entrega abierta, equipo, licencia),
-- una sola marca por evento, y la solicitud se completa sola con el ultimo paso
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_otro uuid;
  v_e3 uuid;
  v_sol public.solicitudes;
  v_sol_b public.solicitudes;
  v_cuenta uuid;
  v_cuenta2 uuid;
  v_cuenta3 uuid;
  v_cuenta4 uuid;
  v_asig_cta uuid;
  v_asig_otro uuid;
  v_asig_cta3 uuid;
  v_entrega uuid;
  v_eq uuid;
  v_eq2 uuid;
  v_asig_eq uuid;
  v_ubic uuid;
  v_lic uuid;
  v_asig_lic uuid;
  v_paso record;
  v_n int;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 108c') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 108c Uno', '99010811', v_empresa) returning id into v_emp;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 108c Otro', '99010812', v_empresa) returning id into v_otro;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 108c Tres', '99010813', v_empresa) returning id into v_e3;
  insert into public.plataformas (id, nombre) values ('__test_ci_108c__', '__TEST_CI__ Plataforma 108c');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_108c__', '__test_ci_108c_1__@correo.test', 'personal') returning id into v_cuenta;
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_108c__', '__test_ci_108c_2__@correo.test', 'personal') returning id into v_cuenta2;
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_108c__', '__test_ci_108c_3__@correo.test', 'personal') returning id into v_cuenta3;
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_108c__', '__test_ci_108c_4__@correo.test', 'personal') returning id into v_cuenta4;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_108c__', '__TEST_CI__ Tipo 108c');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_108C_1__', '__test_ci_108c__') returning id into v_eq;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_108C_2__', '__test_ci_108c__') returning id into v_eq2;
  insert into public.ubicaciones (nombre, tipo) values ('__TEST_CI__ Ubicacion 108c', 'otro') returning id into v_ubic;
  insert into public.licencias (software, cantidad) values ('__TEST_CI__ Lic 108c', 3) returning id into v_lic;

  v_sol := public.crear_solicitud_nucleo('alta_empleado', v_emp);

  -- la cuenta de OTRA persona no marca el paso de esta alta
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta2, v_otro) returning id into v_asig_otro;
  select estado into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'crear_cuenta';
  if v_paso.estado <> 'pendiente' then fallos := fallos || '[108] la cuenta de otra persona marco el paso; '; end if;

  -- cuenta asignada a la persona -> crear_cuenta
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta, v_emp) returning id into v_asig_cta;
  select estado, automatico, referencia_id, hecho_at into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'crear_cuenta';
  if v_paso.estado <> 'hecho' or not v_paso.automatico or v_paso.referencia_id is distinct from v_asig_cta or v_paso.hecho_at is null then
    fallos := fallos || '[108] la asignacion de cuenta no marco crear_cuenta con su referencia; ';
  end if;

  -- entrega: crearla no marca; ABRIRLA (viewed_at) si; deshacer la apertura reabre el paso
  insert into public.entregas (token_hash, empleado_id, empleado_nombre, payload, expires_at)
    values ('__test_ci_108c_e1__', v_emp, 'Test CI 108c Uno', '', now() + interval '1 day') returning id into v_entrega;
  select estado into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'entregar_credenciales';
  if v_paso.estado <> 'pendiente' then fallos := fallos || '[108] crear la entrega ya marco entregar_credenciales; '; end if;
  update public.entregas set viewed_at = now() where id = v_entrega;
  select estado, automatico, referencia_id into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'entregar_credenciales';
  if v_paso.estado <> 'hecho' or not v_paso.automatico or v_paso.referencia_id is distinct from v_entrega then
    fallos := fallos || '[108] abrir la entrega no marco entregar_credenciales; ';
  end if;
  update public.entregas set viewed_at = null where id = v_entrega;
  select estado, automatico, referencia_id, hecho_at into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'entregar_credenciales';
  if v_paso.estado <> 'pendiente' or v_paso.automatico or v_paso.referencia_id is not null or v_paso.hecho_at is not null then
    fallos := fallos || '[108] deshacer la apertura no reabrio el paso; ';
  end if;
  update public.entregas set viewed_at = now() where id = v_entrega;

  -- equipo a una UBICACION no marca; a la persona si
  insert into public.asignaciones_equipo (equipo_id, ubicacion_id) values (v_eq2, v_ubic);
  select estado into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'asignar_equipo';
  if v_paso.estado <> 'pendiente' then fallos := fallos || '[108] una asignacion a ubicacion marco asignar_equipo; '; end if;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_eq, v_emp) returning id into v_asig_eq;
  select estado, referencia_id into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'asignar_equipo';
  if v_paso.estado <> 'hecho' or v_paso.referencia_id is distinct from v_asig_eq then fallos := fallos || '[108] la asignacion de equipo no marco asignar_equipo; '; end if;

  -- licencia -> asignar_licencia
  insert into public.asignaciones_licencia (licencia_id, empleado_id) values (v_lic, v_emp) returning id into v_asig_lic;
  select estado, referencia_id into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'asignar_licencia';
  if v_paso.estado <> 'hecho' or v_paso.referencia_id is distinct from v_asig_lic then fallos := fallos || '[108] la asignacion de licencia no marco asignar_licencia; '; end if;

  -- quedan dos pasos manuales: la solicitud sigue abierta
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id and estado = 'pendiente';
  if v_n <> 2 then fallos := fallos || '[108] debian quedar 2 pasos manuales y quedan ' || v_n || '; '; end if;
  if (select estado from public.solicitudes where id = v_sol.id) <> 'abierta' then fallos := fallos || '[108] la solicitud se cerro con pasos pendientes; '; end if;

  -- paso manual con referencia: debe ser de ESTA persona y el paso debe admitirla
  begin
    perform public.completar_paso_solicitud_nucleo((select id from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'dar_accesos_area'), v_asig_otro);
    fallos := fallos || '[108] acepto una referencia de otra persona; ';
  exception when others then if sqlerrm not like '%no pertenece al empleado%' then fallos := fallos || '[108] referencia ajena rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.completar_paso_solicitud_nucleo((select id from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'confirmar_recepcion'), v_asig_cta);
    fallos := fallos || '[108] un paso sin referencia_tipo acepto una referencia; ';
  exception when others then if sqlerrm not like '%no admite una referencia%' then fallos := fallos || '[108] referencia en paso sin tipo rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin
    perform public.completar_paso_solicitud_nucleo(gen_random_uuid());
    fallos := fallos || '[108] completo un paso inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[108] paso inexistente lanzo ' || sqlstate || '; '; end if; end;
  perform public.completar_paso_solicitud_nucleo((select id from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'dar_accesos_area'), v_asig_cta, '  accesos del area  ');
  select estado, automatico, referencia_id, nota into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'dar_accesos_area';
  if v_paso.estado <> 'hecho' or v_paso.automatico or v_paso.referencia_id is distinct from v_asig_cta or v_paso.nota is distinct from 'accesos del area' then
    fallos := fallos || '[108] completar a mano dejo el paso mal; ';
  end if;
  begin
    perform public.completar_paso_solicitud_nucleo((select id from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'dar_accesos_area'));
    fallos := fallos || '[108] completo dos veces el mismo paso; ';
  exception when others then if sqlerrm not like '%ya fue resuelto%' then fallos := fallos || '[108] doble completar rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- el ultimo paso completa la solicitud SOLA
  perform public.completar_paso_solicitud_nucleo((select id from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'confirmar_recepcion'));
  select * into v_sol from public.solicitudes where id = v_sol.id;
  if v_sol.estado <> 'completada' or v_sol.completada_at is null then fallos := fallos || '[108] la solicitud no se completo sola; '; end if;
  begin
    perform public.completar_paso_solicitud_nucleo((select id from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'confirmar_recepcion'));
    fallos := fallos || '[108] completo un paso de una solicitud cerrada; ';
  exception when others then if sqlerrm not like '%ya no está abierta%' then fallos := fallos || '[108] paso de solicitud cerrada rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- una solicitud cerrada ya no recibe marcas del sistema
  insert into public.asignaciones_licencia (licencia_id, empleado_id) values (v_lic, v_emp);
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'asignar_licencia' and referencia_id = v_asig_lic;
  if v_n <> 1 then fallos := fallos || '[108] una solicitud completada recibio una marca nueva; '; end if;

  -- DOS solicitudes abiertas con el mismo paso pendiente: cada evento marca UNA, la mas antigua
  v_sol := public.crear_solicitud_nucleo('alta_empleado', v_e3);
  v_sol_b := public.crear_solicitud_nucleo('acceso_nuevo', v_e3);
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta3, v_e3) returning id into v_asig_cta3;
  select estado into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'crear_cuenta';
  if v_paso.estado <> 'hecho' then fallos := fallos || '[108] la solicitud mas antigua no recibio la marca; '; end if;
  select estado into v_paso from public.solicitud_pasos where solicitud_id = v_sol_b.id and clave = 'crear_cuenta';
  if v_paso.estado <> 'pendiente' then fallos := fallos || '[108] un solo evento marco dos solicitudes; '; end if;
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta4, v_e3);
  select estado into v_paso from public.solicitud_pasos where solicitud_id = v_sol_b.id and clave = 'crear_cuenta';
  if v_paso.estado <> 'hecho' then fallos := fallos || '[108] el segundo evento no marco la siguiente solicitud; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [108c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [108c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 108-d: integridad — transiciones (whitelist), identidad inmutable, nunca
-- completada con pasos pendientes, omitir con motivo (obligatorio solo el
-- jefe), cancelar con motivo y pasos congelados en una solicitud cerrada
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_sol public.solicitudes;
  v_sol2 public.solicitudes;
  v_p_datos uuid;
  v_p_accesos uuid;
  v_p_equipo uuid;
  v_paso record;
  v_n int;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 108d') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 108d', '99010821', v_empresa) returning id into v_emp;

  v_sol := public.crear_solicitud_nucleo('cambio_puesto', v_emp);
  select id into v_p_datos from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'actualizar_datos';
  select id into v_p_accesos from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'revisar_accesos';
  select id into v_p_equipo from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'reasignar_equipo';

  -- no se completa con pasos pendientes
  begin
    update public.solicitudes set estado = 'completada', completada_at = now() where id = v_sol.id;
    fallos := fallos || '[108] completo una solicitud con pasos pendientes; ';
  exception when others then if sqlerrm not like '%quedan pasos pendientes%' then fallos := fallos || '[108] completar con pendientes rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- la identidad no cambia
  begin update public.solicitudes set tipo_id = 'licencia' where id = v_sol.id; fallos := fallos || '[108] cambio el tipo de una solicitud; ';
  exception when others then if sqlerrm not like '%no cambia de código%' then fallos := fallos || '[108] cambio de tipo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.solicitudes set codigo = 'SOL-9999' where id = v_sol.id; fallos := fallos || '[108] cambio el codigo de una solicitud; ';
  exception when others then if sqlerrm not like '%no cambia de código%' then fallos := fallos || '[108] cambio de codigo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.solicitud_pasos set clave = 'otra' where id = v_p_datos; fallos := fallos || '[108] cambio la clave de un paso; ';
  exception when others then if sqlerrm not like '%no cambia de solicitud, clave%' then fallos := fallos || '[108] cambio de clave rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin insert into public.solicitud_pasos (solicitud_id, orden, clave, label) values (v_sol.id, 9, 'actualizar_datos', 'Duplicado'); fallos := fallos || '[108] permitio un paso duplicado; ';
  exception when unique_violation then null; end;

  -- omitir: motivo obligatorio
  begin perform public.omitir_paso_solicitud_nucleo(v_p_equipo, '   '); fallos := fallos || '[108] omitio sin motivo; ';
  exception when others then if sqlerrm not like '%motivo%obligatorio%' then fallos := fallos || '[108] omitir sin motivo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.omitir_paso_solicitud_nucleo(v_p_equipo, repeat('m', 501)); fallos := fallos || '[108] omitio con un motivo de 501 caracteres; ';
  exception when others then if sqlerrm not like '%500%' then fallos := fallos || '[108] motivo largo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  -- un paso obligatorio no lo omite quien no es jefe (aqui no hay sesion: no hay jefe)
  begin perform public.omitir_paso_solicitud_nucleo(v_p_accesos, 'No aplica'); fallos := fallos || '[108] omitio un paso obligatorio sin ser jefe; ';
  exception when others then if sqlerrm not like '%solo un jefe%' then fallos := fallos || '[108] omitir obligatorio rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  -- un opcional si, con motivo
  perform public.omitir_paso_solicitud_nucleo(v_p_equipo, '  No tenia equipo asignado  ');
  select estado, motivo_omision, hecho_at, automatico into v_paso from public.solicitud_pasos where id = v_p_equipo;
  if v_paso.estado <> 'omitido' or v_paso.motivo_omision is distinct from 'No tenia equipo asignado' or v_paso.hecho_at is null or v_paso.automatico then
    fallos := fallos || '[108] omitir dejo el paso mal; ';
  end if;
  begin update public.solicitud_pasos set estado = 'hecho' where id = v_p_equipo; fallos := fallos || '[108] un paso omitido volvio a hecho; ';
  exception when others then if sqlerrm not like '%no permitida%' then fallos := fallos || '[108] omitido a hecho rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.solicitud_pasos set estado = 'omitido', hecho_at = now() where id = v_p_datos; fallos := fallos || '[108] omitio sin motivo por UPDATE directo; ';
  exception when check_violation then null; end;

  -- omitidos u hechos: al quedar todos resueltos se completa sola
  perform public.completar_paso_solicitud_nucleo(v_p_datos);
  select estado into v_paso from public.solicitudes where id = v_sol.id;
  if v_paso.estado <> 'abierta' then fallos := fallos || '[108] se completo con un paso pendiente; '; end if;
  perform public.completar_paso_solicitud_nucleo(v_p_accesos);
  select estado into v_paso from public.solicitudes where id = v_sol.id;
  if v_paso.estado <> 'completada' then fallos := fallos || '[108] con todos los pasos hechos u omitidos no se completo; '; end if;

  -- terminales: completada no vuelve a abierta ni pasa a cancelada; sus pasos quedan congelados
  begin update public.solicitudes set estado = 'abierta', completada_at = null where id = v_sol.id; fallos := fallos || '[108] reabrio una solicitud completada; ';
  exception when others then if sqlerrm not like '%no permitida%' then fallos := fallos || '[108] reabrir rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.solicitudes set estado = 'cancelada', cancelada_at = now(), motivo_cancelacion = 'x', completada_at = null where id = v_sol.id; fallos := fallos || '[108] cancelo una solicitud completada; ';
  exception when others then if sqlerrm not like '%no permitida%' then fallos := fallos || '[108] cancelar completada rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.solicitud_pasos set estado = 'pendiente', hecho_at = null where id = v_p_datos; fallos := fallos || '[108] reabrio un paso de una solicitud completada; ';
  exception when others then if sqlerrm not like '%ya no está abierta%' then fallos := fallos || '[108] paso de solicitud completada rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.cancelar_solicitud_nucleo(v_sol.id, 'tarde'); fallos := fallos || '[108] cancelo una solicitud completada por la RPC; ';
  exception when others then if sqlerrm not like '%ya está completada%' then fallos := fallos || '[108] cancelar completada por la RPC rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- cancelar: motivo obligatorio, queda registrado y la solicitud cancelada se congela
  v_sol2 := public.crear_solicitud_nucleo('acceso_nuevo', v_emp);
  begin perform public.cancelar_solicitud_nucleo(v_sol2.id, ' '); fallos := fallos || '[108] cancelo sin motivo; ';
  exception when others then if sqlerrm not like '%motivo%obligatorio%' then fallos := fallos || '[108] cancelar sin motivo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.cancelar_solicitud_nucleo(gen_random_uuid(), 'x'); fallos := fallos || '[108] cancelo una solicitud inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[108] cancelar inexistente lanzo ' || sqlstate || '; '; end if; end;
  begin update public.solicitudes set estado = 'cancelada', cancelada_at = now() where id = v_sol2.id; fallos := fallos || '[108] el CHECK permitio cancelar sin motivo; ';
  exception when check_violation then null; end;
  v_sol2 := public.cancelar_solicitud_nucleo(v_sol2.id, '  Pedido duplicado  ');
  if v_sol2.estado <> 'cancelada' or v_sol2.cancelada_at is null or v_sol2.motivo_cancelacion is distinct from 'Pedido duplicado' then
    fallos := fallos || '[108] cancelar dejo la solicitud mal; ';
  end if;
  begin perform public.cancelar_solicitud_nucleo(v_sol2.id, 'otra vez'); fallos := fallos || '[108] cancelo dos veces; ';
  exception when others then if sqlerrm not like '%ya está cancelada%' then fallos := fallos || '[108] doble cancelacion rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.completar_paso_solicitud_nucleo((select id from public.solicitud_pasos where solicitud_id = v_sol2.id and clave = 'crear_cuenta')); fallos := fallos || '[108] completo un paso de una solicitud cancelada; ';
  exception when others then if sqlerrm not like '%ya no está abierta%' then fallos := fallos || '[108] paso de solicitud cancelada rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  -- y el sistema tampoco marca pasos de una cancelada
  insert into public.plataformas (id, nombre) values ('__test_ci_108d__', '__TEST_CI__ Plataforma 108d');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_108d__', '__test_ci_108d__@correo.test', 'personal');
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) select id, v_emp from public.cuentas where usuario = '__test_ci_108d__@correo.test';
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol2.id and estado <> 'pendiente';
  if v_n <> 0 then fallos := fallos || '[108] el autocompletado toco una solicitud cancelada; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [108d] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [108d]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 108-e: dar de baja crea la solicitud de baja con los pasos REALES (rotar
-- cada cuenta compartida/reutilizable, recuperar cada equipo, cerrar las
-- cuentas personales en su plataforma), cancela las otras solicitudes abiertas,
-- no se repite en una segunda baja y se completa sola al rotar y devolver
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_vacio uuid;
  v_reing uuid;
  v_eq2 uuid;
  v_c_pers uuid;
  v_c_reut uuid;
  v_c_comp uuid;
  v_lic uuid;
  v_eq uuid;
  v_asig_eq uuid;
  v_sol_alta public.solicitudes;
  v_sol_cambio public.solicitudes;
  v_sol public.solicitudes;
  v_paso record;
  v_n int;
  v_ids uuid[];
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 108e') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 108e', '99010831', v_empresa) returning id into v_emp;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 108e Vacio', '99010832', v_empresa) returning id into v_vacio;
  insert into public.plataformas (id, nombre) values ('__test_ci_108e__', '__TEST_CI__ Plataforma 108e');
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_108e__', '__test_ci_108e_p__@correo.test', 'personal') returning id into v_c_pers;
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_108e__', '__test_ci_108e_r__@correo.test', 'reutilizable') returning id into v_c_reut;
  insert into public.cuentas (plataforma_id, usuario, tipo_cuenta) values ('__test_ci_108e__', '__test_ci_108e_c__@correo.test', 'compartida') returning id into v_c_comp;
  insert into public.licencias (software, cantidad) values ('__TEST_CI__ Lic 108e', 2) returning id into v_lic;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_108e__', '__TEST_CI__ Tipo 108e');
  insert into public.equipos (codigo, tipo_id, marca, modelo) values ('__TEST_CI_108E__', '__test_ci_108e__', 'Marca', 'Modelo') returning id into v_eq;
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_c_pers, v_emp), (v_c_reut, v_emp), (v_c_comp, v_emp);
  insert into public.asignaciones_licencia (licencia_id, empleado_id) values (v_lic, v_emp);
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_eq, v_emp) returning id into v_asig_eq;

  v_sol_alta := public.crear_solicitud_nucleo('alta_empleado', v_emp);
  v_sol_cambio := public.crear_solicitud_nucleo('cambio_puesto', v_emp);

  perform public.empleado_dar_baja_interno(v_emp, 'Renuncia');

  if (select estado::text from public.empleados where id = v_emp) <> 'Inactivo' then fallos := fallos || '[108] la baja no dejo Inactivo; '; end if;
  select count(*) into v_n from public.solicitudes where empleado_id = v_emp and tipo_id = 'baja_empleado';
  if v_n <> 1 then fallos := fallos || '[108] la baja debia crear 1 solicitud y creo ' || v_n || '; '; end if;
  select * into v_sol from public.solicitudes where empleado_id = v_emp and tipo_id = 'baja_empleado';
  if v_sol.estado <> 'abierta' or v_sol.origen <> 'sistema' or v_sol.nota is distinct from 'Renuncia' or v_sol.codigo !~ '^SOL-' then
    fallos := fallos || '[108] la solicitud de baja quedo mal (estado ' || coalesce(v_sol.estado, '?') || '); ';
  end if;

  -- las otras solicitudes abiertas de la persona se cancelan
  select count(*) into v_n from public.solicitudes where id in (v_sol_alta.id, v_sol_cambio.id) and estado = 'cancelada' and motivo_cancelacion like '%baja%';
  if v_n <> 2 then fallos := fallos || '[108] la baja no cancelo las otras solicitudes abiertas (' || v_n || '/2); '; end if;

  -- pasos reales: 1 cerrar_accesos hecho, 2 rotar (reutilizable y compartida), 1 recuperar equipo, 1 cerrar cuentas personales
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id;
  if v_n <> 5 then fallos := fallos || '[108] la baja debia tener 5 pasos y tiene ' || v_n || '; '; end if;
  select estado, automatico, nota into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'cerrar_accesos';
  if v_paso.estado <> 'hecho' or not v_paso.automatico or v_paso.nota not like '3 asignaciones de cuenta y 1 de licencia%' then
    fallos := fallos || '[108] cerrar_accesos incorrecto: ' || coalesce(v_paso.nota, '?') || '; ';
  end if;
  select array_agg(objetivo_id order by label) into v_ids from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'rotar_contrasenas' and estado = 'pendiente';
  if cardinality(v_ids) is distinct from 2 or not (v_c_reut = any (v_ids)) or not (v_c_comp = any (v_ids)) or v_c_pers = any (v_ids) then
    fallos := fallos || '[108] los pasos de rotacion no apuntan a la reutilizable y la compartida; ';
  end if;
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'rotar_contrasenas' and label like 'Rotar la contraseña de __test_ci_108e_%@correo.test%';
  if v_n <> 2 then fallos := fallos || '[108] la etiqueta de rotacion no nombra la cuenta; '; end if;
  select objetivo_id, label, obligatorio into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'devolver_equipo';
  if v_paso.objetivo_id is distinct from v_asig_eq or v_paso.label not like 'Recuperar el equipo __TEST_CI_108E__ · Marca Modelo' or not v_paso.obligatorio then
    fallos := fallos || '[108] el paso de recuperar equipo incorrecto: ' || coalesce(v_paso.label, '?') || '; ';
  end if;
  select estado, nota into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'cerrar_cuentas_plataforma';
  if v_paso.estado <> 'pendiente' or v_paso.nota not like '1 cuenta personal%' then fallos := fallos || '[108] cerrar_cuentas_plataforma incorrecto; '; end if;
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id and autocompleta
    and clave in ('cerrar_accesos', 'rotar_contrasenas', 'devolver_equipo');
  if v_n <> 4 then fallos := fallos || '[108] los pasos reales de la baja debian copiar autocompleta (' || v_n || '/4); '; end if;
  select autocompleta into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'cerrar_cuentas_plataforma';
  if v_paso.autocompleta then fallos := fallos || '[108] cerrar_cuentas_plataforma es manual y no debia marcarse autocompleta; '; end if;

  -- la baja repetida sobre un Inactivo es inocua: no crea otra solicitud
  perform public.empleado_dar_baja_interno(v_emp, 'otra vez');
  select count(*) into v_n from public.solicitudes where empleado_id = v_emp and tipo_id = 'baja_empleado';
  if v_n <> 1 then fallos := fallos || '[108] una segunda baja duplico la solicitud; '; end if;

  -- rotar la contraseña (la 100 limpia requiere_rotacion) marca SOLO el paso de esa cuenta
  update public.cuentas set password = 'enc2:AAAA:BBBB' where id = v_c_reut;
  select estado, automatico, referencia_id into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'rotar_contrasenas' and objetivo_id = v_c_reut;
  if v_paso.estado <> 'hecho' or not v_paso.automatico or v_paso.referencia_id is distinct from v_c_reut then fallos := fallos || '[108] rotar la reutilizable no marco su paso; '; end if;
  select estado into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'rotar_contrasenas' and objetivo_id = v_c_comp;
  if v_paso.estado <> 'pendiente' then fallos := fallos || '[108] rotar una cuenta marco el paso de otra; '; end if;

  -- devolver el equipo (se cierra su asignacion) marca el paso de ESA asignacion
  update public.asignaciones_equipo set fecha_fin = current_date, motivo_cierre = 'baja_empleado' where id = v_asig_eq;
  select estado, referencia_id into v_paso from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'devolver_equipo';
  if v_paso.estado <> 'hecho' or v_paso.referencia_id is distinct from v_asig_eq then fallos := fallos || '[108] devolver el equipo no marco su paso; '; end if;

  -- quedan la compartida y la cuenta real en la plataforma: sigue abierta
  if (select estado from public.solicitudes where id = v_sol.id) <> 'abierta' then fallos := fallos || '[108] la baja se cerro con pasos pendientes; '; end if;
  update public.cuentas set password = 'enc2:CCCC:DDDD' where id = v_c_comp;
  if (select estado from public.solicitudes where id = v_sol.id) <> 'abierta' then fallos := fallos || '[108] la baja se cerro sin cerrar las cuentas personales; '; end if;
  perform public.completar_paso_solicitud_nucleo((select id from public.solicitud_pasos where solicitud_id = v_sol.id and clave = 'cerrar_cuentas_plataforma'), null, 'Cuenta suspendida en la plataforma');
  select * into v_sol from public.solicitudes where id = v_sol.id;
  if v_sol.estado <> 'completada' or v_sol.completada_at is null then fallos := fallos || '[108] la baja no se completo sola al terminar los pasos; '; end if;

  -- una baja sin nada pendiente nace completada (solo cerrar_accesos, hecho)
  perform public.empleado_dar_baja_interno(v_vacio, null);
  select * into v_sol from public.solicitudes where empleado_id = v_vacio and tipo_id = 'baja_empleado';
  if v_sol.estado is distinct from 'completada' then fallos := fallos || '[108] una baja sin pendientes debia nacer completada; '; end if;
  select count(*) into v_n from public.solicitud_pasos where solicitud_id = v_sol.id;
  if v_n <> 1 then fallos := fallos || '[108] una baja sin pendientes debia tener solo cerrar_accesos; '; end if;

  -- una baja nueva tras un reingreso: la anterior (aun abierta) se cancela, no choca con el indice
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 108e Reingresado', '99010833', v_empresa) returning id into v_reing;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_108E2__', '__test_ci_108e__') returning id into v_eq2;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_eq2, v_reing);
  perform public.empleado_dar_baja_interno(v_reing, 'Primera baja');
  update public.empleados set estado = 'Activo' where id = v_reing;
  perform public.empleado_dar_baja_interno(v_reing, 'Segunda baja');
  select count(*) into v_n from public.solicitudes where empleado_id = v_reing and tipo_id = 'baja_empleado' and estado = 'cancelada' and nota = 'Primera baja';
  if v_n <> 1 then fallos := fallos || '[108] la segunda baja no cancelo la primera abierta; '; end if;
  select count(*) into v_n from public.solicitudes where empleado_id = v_reing and tipo_id = 'baja_empleado' and estado = 'abierta' and nota = 'Segunda baja';
  if v_n <> 1 then fallos := fallos || '[108] la segunda baja no quedo abierta; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [108e] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [108e]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 108-f: dashboard_resumen_de (solicitudes_abiertas y altas_incompletas
-- derivadas, null sin el modulo empleados, sin errores), reingreso que abre un
-- alta y convertir_ticket_en_solicitud
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_rein uuid;
  v_jefe uuid;
  v_asis_t uuid;
  v_asis_e uuid;
  v_sol public.solicitudes;
  v_sol2 public.solicitudes;
  v_ticket uuid;
  v_ticket_sin uuid;
  v_item jsonb;
  r jsonb;
  v_n int;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_108f_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_108f_tk@example.test') returning id into v_asis_t;
  insert into auth.users (email) values ('__test_ci_108f_em@example.test') returning id into v_asis_e;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  update public.staff set activo = true where user_id in (v_asis_t, v_asis_e);
  delete from public.staff_modulos_permisos where staff_user_id = v_asis_t and modulo <> 'tickets';
  delete from public.staff_modulos_permisos where staff_user_id = v_asis_e and modulo <> 'empleados';

  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 108f') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, cargo) values ('Test', 'CI 108f', '99010841', v_empresa, 'Residente') returning id into v_emp;
  v_sol := public.crear_solicitud_nucleo('alta_empleado', v_emp, null, '{}'::jsonb, 'Pedido de RRHH', 'rrhh_correo');

  -- JEFE: la seccion trae la solicitud con su avance y el siguiente paso
  r := public.dashboard_resumen_de(v_jefe);
  if r -> 'errores' <> '[]'::jsonb then fallos := fallos || '[108] el resumen del JEFE trajo errores: ' || (r ->> 'errores') || '; '; end if;
  if jsonb_typeof(r -> 'solicitudes_abiertas') <> 'array' then fallos := fallos || '[108] solicitudes_abiertas no es un arreglo; '; end if;
  select x into v_item from jsonb_array_elements(r -> 'solicitudes_abiertas') as t(x) where x ->> 'solicitud_id' = v_sol.id::text;
  if v_item is null then
    fallos := fallos || '[108] la solicitud abierta no figura en el Inicio; ';
  else
    if v_item ->> 'codigo' <> v_sol.codigo or v_item ->> 'tipo_id' <> 'alta_empleado' or v_item ->> 'tipo' <> 'Alta de empleado'
       or v_item ->> 'empleado_id' <> v_emp::text or v_item ->> 'empleado' <> 'Test CI 108f' or v_item ->> 'cargo' <> 'Residente' then
      fallos := fallos || '[108] datos de identidad de la fila del Inicio incorrectos; ';
    end if;
    if (v_item ->> 'pasos_total')::int <> 7 or (v_item ->> 'pasos_hechos')::int <> 1 then fallos := fallos || '[108] avance del Inicio incorrecto: ' || (v_item ->> 'pasos_hechos') || '/' || (v_item ->> 'pasos_total') || '; '; end if;
    if v_item ->> 'siguiente' <> 'Crear la cuenta de correo' or v_item ->> 'siguiente_modulo' <> 'correos' then fallos := fallos || '[108] el siguiente paso del Inicio es incorrecto; '; end if;
    if (v_item ->> 'dias')::int <> 0 then fallos := fallos || '[108] los dias de la solicitud de hoy no son 0; '; end if;
  end if;
  -- altas_incompletas conserva su forma y sale de las solicitudes de alta
  select x into v_item from jsonb_array_elements(r -> 'altas_incompletas') as t(x) where x ->> 'empleado_id' = v_emp::text;
  if v_item is null then
    fallos := fallos || '[108] altas_incompletas no trae el alta abierta; ';
  elsif v_item -> 'faltan' <> '["crear_cuenta","entregar_credenciales","confirmar_recepcion"]'::jsonb or v_item ->> 'nombre' <> 'Test CI 108f' or v_item ->> 'cargo' <> 'Residente' then
    fallos := fallos || '[108] altas_incompletas con forma incorrecta: ' || v_item::text || '; ';
  end if;

  -- sin el modulo empleados: null y NO es un error
  r := public.dashboard_resumen_de(v_asis_t);
  if jsonb_typeof(r -> 'solicitudes_abiertas') <> 'null' or jsonb_typeof(r -> 'altas_incompletas') <> 'null' then fallos := fallos || '[108] sin el modulo empleados las secciones debian ser null; '; end if;
  if r -> 'errores' <> '[]'::jsonb then fallos := fallos || '[108] una seccion sin permiso conto como error; '; end if;
  -- con solo empleados: la seccion llega
  r := public.dashboard_resumen_de(v_asis_e);
  if jsonb_typeof(r -> 'solicitudes_abiertas') <> 'array' then fallos := fallos || '[108] con el modulo empleados faltó solicitudes_abiertas; '; end if;

  -- cancelada o completada deja de listarse
  perform public.cancelar_solicitud_nucleo(v_sol.id, 'Prueba');
  r := public.dashboard_resumen_de(v_jefe);
  if exists (select 1 from jsonb_array_elements(r -> 'solicitudes_abiertas') x where x ->> 'solicitud_id' = v_sol.id::text)
     or exists (select 1 from jsonb_array_elements(r -> 'altas_incompletas') x where x ->> 'empleado_id' = v_emp::text) then
    fallos := fallos || '[108] una solicitud cancelada sigue en el Inicio; ';
  end if;

  -- reingreso: reingresar_empleado abre un alta (origen sistema); sin duplicar
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado, fecha_alta) values ('Test', 'CI 108f Reingreso', '99010842', v_empresa, 'Inactivo', '2020-01-15') returning id into v_rein;
  perform public.empleado_reingresar_interno(v_rein, '{}'::jsonb);
  select * into v_sol2 from public.solicitudes where empleado_id = v_rein and tipo_id = 'alta_empleado';
  if v_sol2.id is null or v_sol2.estado <> 'abierta' or v_sol2.origen <> 'sistema' or v_sol2.nota is distinct from 'Reingreso del empleado.' then
    fallos := fallos || '[108] el reingreso no abrio su alta; ';
  end if;
  select count(*) into v_n from public.solicitudes where empleado_id = v_rein and tipo_id = 'alta_empleado';
  if v_n <> 1 then fallos := fallos || '[108] el reingreso creo ' || v_n || ' altas; '; end if;

  -- convertir un ticket en solicitud
  insert into public.tickets (codigo, token, titulo, descripcion, empleado_id, tipo)
    values ('__TEST_CI_108F__', lpad('1', 24, 'F'), 'Necesito acceso al ERP', 'Descripcion', v_emp, 'incidente') returning id into v_ticket;
  insert into public.tickets (codigo, token, titulo, descripcion)
    values ('__TEST_CI_108F2__', lpad('2', 24, 'F'), 'Sin empleado', 'Descripcion') returning id into v_ticket_sin;
  v_sol := public.convertir_ticket_en_solicitud_nucleo(v_ticket, 'acceso_nuevo', 'Pedido por ticket');
  if v_sol.ticket_id is distinct from v_ticket or v_sol.origen <> 'ticket' or v_sol.empleado_id <> v_emp or v_sol.tipo_id <> 'acceso_nuevo'
     or v_sol.datos ->> 'ticket_codigo' is distinct from '__TEST_CI_108F__' then
    fallos := fallos || '[108] convertir_ticket_en_solicitud dejo la solicitud mal; ';
  end if;
  if (select tipo from public.tickets where id = v_ticket) is distinct from 'solicitud' then fallos := fallos || '[108] el ticket no quedo como tipo solicitud; '; end if;
  if (select estado from public.tickets where id = v_ticket) <> 'abierto' then fallos := fallos || '[108] convertir toco el estado del ticket; '; end if;
  begin perform public.convertir_ticket_en_solicitud_nucleo(v_ticket, 'licencia'); fallos := fallos || '[108] convirtio dos veces el mismo ticket; ';
  exception when others then if sqlerrm not like '%ya tiene una solicitud vinculada%' then fallos := fallos || '[108] segunda conversion rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.convertir_ticket_en_solicitud_nucleo(v_ticket_sin, 'acceso_nuevo'); fallos := fallos || '[108] convirtio un ticket sin empleado; ';
  exception when others then if sqlerrm not like '%no tiene un empleado vinculado%' then fallos := fallos || '[108] ticket sin empleado rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.convertir_ticket_en_solicitud_nucleo(gen_random_uuid(), 'acceso_nuevo'); fallos := fallos || '[108] convirtio un ticket inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[108] ticket inexistente lanzo ' || sqlstate || '; '; end if; end;
  begin insert into public.solicitudes (tipo_id, empleado_id, ticket_id) values ('licencia', v_emp, v_ticket); fallos := fallos || '[108] el indice permitio dos solicitudes vivas para un ticket; ';
  exception when unique_violation then null; end;
  -- cancelar la solicitud libera el ticket
  perform public.cancelar_solicitud_nucleo(v_sol.id, 'Se pidio por error');
  v_sol2 := public.convertir_ticket_en_solicitud_nucleo(v_ticket, 'licencia');
  if v_sol2.ticket_id is distinct from v_ticket then fallos := fallos || '[108] tras cancelar no se pudo convertir de nuevo; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [108f] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [108f]: %', fallos;
  end if;
end $$;
