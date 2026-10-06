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
--   [115] (bloques 115-a a 115-f) reportes: v_ticket_hechos, vistas KPI mensuales,
--         backlog_tramos_en y reporte_tickets_de / reporte_satisfaccion_consolidado_de
--         (doble cuenta eliminada, rechazados aparte, reapertura desde rechazado no
--         cuenta, CSAT con n < minimo insuficiente, periodo en curso sin comparacion,
--         guard 42501 por modulo y por tecnico ajeno, paridad RPC vs vistas)
--   [116] (bloques 116-a a 116-c) catalogo de tickets v2: categorias, subcategorias con
--         tipo y prioridad sugeridos, tickets de las subcategorias movidas, marca de
--         config_parametros, evento categoria_cambiada; crear_ticket_publico con la
--         prioridad de la subcategoria (el staff puede elegir otra) y reclasificar_ticket
--         (solo JEFE, ticket cerrado incluido, sin tocar tipo ni prioridad)
--   [117] (bloques 117-a a 117-e) reportes centralizados: guard por modulo fuente (42501
--         tambien con el resto de los modulos y con staff inactivo), auditoria solo JEFE,
--         privilegios de publicas/nucleos/auxiliares, periodo P0001; inventario, licencias y
--         correos por deltas sobre fixtures; personal (movimientos de empleado_eventos,
--         revisiones pendientes), solicitudes, cambios, problemas/KB con avisos, encuestas
--         anonimas y auditoria; ninguna salida con DNI, contacto, IP ni user_agent
--   [108] (bloques 108-a a 108-f) solicitudes de servicio: catalogo y privilegios,
--         crear_solicitud (alta con persona nueva en la misma transaccion, validaciones,
--         una sola abierta por tipo), AUTOCOMPLETADO por cuenta/entrega abierta/equipo/
--         licencia/rotacion, integridad (whitelist, omitir con motivo, cancelar), baja que
--         crea su solicitud con pasos reales, Inicio (solicitudes_abiertas), reingreso y
--         convertir_ticket_en_solicitud
--   [107] (bloques 107-a a 107-d) catalogo de servicios (CHECK, nombre unico, tope de 15,
--         servicio_id ON DELETE SET NULL en los cuatro catalogos), cambios (plan de retroceso y
--         ventana, whitelist por tipo, contenido congelado fuera de borrador, aprobador jefe activo,
--         libro inmutable con actor y rol, enlace con tickets), emergencia (ejecucion sin aprobacion
--         previa, plazo de 48 h, aprobacion a posteriori, no cierra sin ella), vistas
--         v_cambios_aprobacion_vencida / v_kpi_cambios y cambio_id de schema_migrations y
--         function_deploys
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

  -- Fechas de calendario: valen para la firma de la 053 (timestamptz, por
  -- cast implícito) y para la de la 115 (date, date, uuid); en las dos el
  -- guard rechaza sin sesión. reporte_tickets_resumen dejó de existir en la 115.
  begin
    perform public.reporte_tickets(current_date - 30, current_date);
    fallos := fallos || '[053/115] reporte_tickets no rechazó una llamada sin sesión de staff; ';
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
    raise exception 'TESTS_OK [051/061/053] — 4 invariantes verificados, todo revertido';
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
  -- 8 reglas de la 112, mas la de empleado_enlaces cuando la 109 esta aplicada
  if v_n <> 8 + (case when to_regclass('public.empleado_enlaces') is not null then 1 else 0 end) then fallos := fallos || '[112] config_retencion no tiene las reglas sembradas (' || v_n || '); '; end if;
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

-- ------------------------------------------------------------
-- 106-a: esquema de la KEDB (columnas, tipo por defecto y CHECK), tabla de
-- usos (privilegios, policies, RLS), EXECUTE de RPC y núcleos, vista
-- security_invoker, índice único del workaround y el guard 42501 sin sesión
-- ------------------------------------------------------------
do $$
declare
  v_n int;
  v_f text;
  v_id uuid;
  v_opts text[];
  fallos text := '';
begin
  select count(*) into v_n from information_schema.columns where table_schema = 'public'
    and ((table_name = 'problemas' and column_name in ('workaround', 'error_conocido', 'kb_articulo_id'))
      or (table_name = 'kb_articulos' and column_name in ('tipo', 'problema_id')));
  if v_n <> 5 then fallos := fallos || '[106] se esperaban 5 columnas nuevas y hay ' || v_n || '; '; end if;

  -- un artículo sin tipo explícito es 'solucion'; el CHECK rechaza lo demás
  insert into public.kb_articulos (titulo) values ('__TEST_CI__ KB 106a') returning id into v_id;
  if (select tipo from public.kb_articulos where id = v_id) is distinct from 'solucion' then
    fallos := fallos || '[106] el tipo por defecto no es solucion; ';
  end if;
  begin update public.kb_articulos set tipo = 'otro' where id = v_id; fallos := fallos || '[106] el CHECK de tipo admitio un valor fuera de dominio; ';
  exception when check_violation then null; end;
  update public.kb_articulos set tipo = 'procedimiento' where id = v_id;
  update public.kb_articulos set tipo = 'workaround' where id = v_id;

  insert into public.problemas (titulo, descripcion) values ('__TEST_CI__ Problema 106a', 'd') returning id into v_id;
  if (select error_conocido from public.problemas where id = v_id) is distinct from false then
    fallos := fallos || '[106] error_conocido no nace en false; ';
  end if;
  begin update public.problemas set workaround = repeat('x', 5001) where id = v_id; fallos := fallos || '[106] el CHECK de largo admitio un workaround de 5001 caracteres; ';
  exception when check_violation then null; end;
  update public.problemas set workaround = repeat('x', 5000) where id = v_id;

  -- ticket_kb_usos: RLS, el cliente solo lee y borra por RLS (jefe), anon nada
  if not exists (select 1 from pg_class where oid = 'public.ticket_kb_usos'::regclass and relrowsecurity) then
    fallos := fallos || '[106] ticket_kb_usos sin RLS; ';
  end if;
  if has_table_privilege('authenticated', 'public.ticket_kb_usos', 'insert')
     or has_table_privilege('authenticated', 'public.ticket_kb_usos', 'update')
     or not has_table_privilege('authenticated', 'public.ticket_kb_usos', 'select')
     or has_table_privilege('anon', 'public.ticket_kb_usos', 'select')
     or has_table_privilege('anon', 'public.ticket_kb_usos', 'insert') then
    fallos := fallos || '[106] privilegios de ticket_kb_usos incorrectos; ';
  end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'ticket_kb_usos'
    and cmd = 'SELECT' and qual like '%puede_actual%tickets%' and qual like '%puede_actual%base_conocimiento%';
  if v_n <> 1 then fallos := fallos || '[106] falta la policy SELECT con tickets o base_conocimiento; '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'ticket_kb_usos'
    and cmd = 'DELETE' and qual like '%es_jefe%';
  if v_n <> 1 then fallos := fallos || '[106] falta la policy DELETE es_jefe; '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'ticket_kb_usos' and cmd in ('INSERT', 'UPDATE', 'ALL');
  if v_n <> 0 then fallos := fallos || '[106] ticket_kb_usos tiene policies de escritura; '; end if;

  -- EXECUTE: RPC a authenticated; nucleos solo a project_admin
  foreach v_f in array array[
    'public.publicar_workaround_problema(uuid, text, text, text)',
    'public.crear_kb_desde_ticket(uuid, text, text, text)',
    'public.registrar_uso_kb_ticket(uuid, uuid)'] loop
    if not has_function_privilege('authenticated', v_f, 'execute') or has_function_privilege('anon', v_f, 'execute') then
      fallos := fallos || '[106] EXECUTE incorrecto en ' || v_f || '; ';
    end if;
  end loop;
  foreach v_f in array array[
    'public.publicar_workaround_problema_nucleo(uuid, text, text, text, boolean)',
    'public.crear_kb_desde_ticket_nucleo(uuid, text, text, text)',
    'public.registrar_uso_kb_ticket_nucleo(uuid, uuid)'] loop
    if has_function_privilege('authenticated', v_f, 'execute') or has_function_privilege('anon', v_f, 'execute')
       or not has_function_privilege('project_admin', v_f, 'execute') then
      fallos := fallos || '[106] EXECUTE incorrecto en ' || v_f || '; ';
    end if;
  end loop;

  -- vista security_invoker, sin acceso anonimo
  select reloptions into v_opts from pg_class where oid = 'public.v_kpi_kb'::regclass;
  if v_opts is null or not ('security_invoker=true' = any (v_opts)) then fallos := fallos || '[106] v_kpi_kb no es security_invoker; '; end if;
  if has_table_privilege('anon', 'public.v_kpi_kb', 'select') or not has_table_privilege('authenticated', 'public.v_kpi_kb', 'select') then
    fallos := fallos || '[106] privilegios de v_kpi_kb incorrectos; ';
  end if;

  -- un solo workaround vivo por problema
  insert into public.kb_articulos (titulo, tipo, problema_id) values ('__TEST_CI__ WA 106a-1', 'workaround', v_id) returning id into v_id;
  begin
    insert into public.kb_articulos (titulo, tipo, problema_id)
      values ('__TEST_CI__ WA 106a-2', 'workaround', (select problema_id from public.kb_articulos where id = v_id));
    fallos := fallos || '[106] el indice permitio dos workaround vivos para un problema; ';
  exception when unique_violation then null; end;
  update public.kb_articulos set deleted_at = now() where id = v_id;
  insert into public.kb_articulos (titulo, tipo, problema_id)
    values ('__TEST_CI__ WA 106a-3', 'workaround', (select problema_id from public.kb_articulos where id = v_id));

  -- sin sesion (auth.uid() NULL) cada RPC publica responde 42501
  begin perform public.publicar_workaround_problema(gen_random_uuid()); fallos := fallos || '[106] publicar_workaround_problema respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[106] publicar_workaround_problema sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.crear_kb_desde_ticket(gen_random_uuid()); fallos := fallos || '[106] crear_kb_desde_ticket respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[106] crear_kb_desde_ticket sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.registrar_uso_kb_ticket(gen_random_uuid(), gen_random_uuid()); fallos := fallos || '[106] registrar_uso_kb_ticket respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[106] registrar_uso_kb_ticket sin sesion lanzo ' || sqlstate || '; '; end if; end;

  if fallos = '' then
    raise exception 'TESTS_OK [106a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [106a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 106-b: check_problema_cierre — un error conocido no se cierra (ni queda
-- cerrado) sin workaround o causa raiz; el texto en blanco cuenta como vacio;
-- la regla de la 033 (acciones pendientes) sigue vigente
-- ------------------------------------------------------------
do $$
declare
  v_p uuid;
  v_q uuid;
  v_r uuid;
  fallos text := '';
begin
  -- error conocido sin documentar: no cierra
  insert into public.problemas (titulo, descripcion, error_conocido) values ('__TEST_CI__ Problema 106b', 'd', true) returning id into v_p;
  update public.problemas set estado = 'diagnostico' where id = v_p;
  update public.problemas set estado = 'acciones' where id = v_p;
  begin update public.problemas set estado = 'cerrado' where id = v_p; fallos := fallos || '[106] cerro un error conocido sin workaround ni causa raiz; ';
  exception when others then if sqlerrm not like '%error conocido%' then fallos := fallos || '[106] cierre sin documentar rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- en blanco = vacio
  update public.problemas set workaround = '   ', causa_raiz = chr(10) where id = v_p;
  begin update public.problemas set estado = 'cerrado' where id = v_p; fallos := fallos || '[106] cerro con workaround y causa raiz en blanco; ';
  exception when others then if sqlerrm not like '%error conocido%' then fallos := fallos || '[106] cierre con texto en blanco rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- con workaround, cierra
  update public.problemas set workaround = 'Reiniciar el servicio' where id = v_p;
  update public.problemas set estado = 'cerrado' where id = v_p;
  if (select estado from public.problemas where id = v_p) <> 'cerrado' then fallos := fallos || '[106] no cerro con workaround; '; end if;

  -- ya cerrado: no se puede vaciar el workaround si no hay causa raiz...
  begin update public.problemas set workaround = null where id = v_p; fallos := fallos || '[106] se vacio el workaround de un error conocido cerrado; ';
  exception when others then if sqlerrm not like '%error conocido%' then fallos := fallos || '[106] vaciar el workaround rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  -- ...ni marcar como error conocido uno cerrado sin documentacion
  insert into public.problemas (titulo, descripcion) values ('__TEST_CI__ Problema 106b2', 'd') returning id into v_q;
  update public.problemas set estado = 'diagnostico' where id = v_q;
  update public.problemas set estado = 'acciones' where id = v_q;
  update public.problemas set estado = 'cerrado' where id = v_q;
  begin update public.problemas set error_conocido = true where id = v_q; fallos := fallos || '[106] marco error conocido un problema cerrado sin documentacion; ';
  exception when others then if sqlerrm not like '%error conocido%' then fallos := fallos || '[106] marcar error conocido rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  -- con causa raiz documentada, si
  update public.problemas set causa_raiz = 'Pasta termica defectuosa' where id = v_q;
  update public.problemas set error_conocido = true where id = v_q;

  -- un problema que NO es error conocido cierra sin workaround (comportamiento de siempre)
  insert into public.problemas (titulo, descripcion) values ('__TEST_CI__ Problema 106b3', 'd') returning id into v_r;
  update public.problemas set estado = 'diagnostico' where id = v_r;
  update public.problemas set estado = 'acciones' where id = v_r;
  insert into public.acciones_correctivas (problema_id, descripcion, fecha_limite) values (v_r, '__TEST_CI__ accion 106b', current_date + 5);
  begin update public.problemas set estado = 'cerrado' where id = v_r; fallos := fallos || '[106] cerro con una accion correctiva pendiente; ';
  exception when others then if sqlerrm not like '%acciones correctivas%' then fallos := fallos || '[106] la regla de la 033 cambio de mensaje: ' || sqlerrm || '; '; end if; end;
  update public.acciones_correctivas set estado = 'completada' where problema_id = v_r;
  update public.problemas set estado = 'cerrado' where id = v_r;
  if (select estado from public.problemas where id = v_r) <> 'cerrado' then fallos := fallos || '[106] un problema comun no cerro; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [106b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [106b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 106-c: publicar_workaround_problema_nucleo — crea y actualiza UN articulo
-- de workaround, marca el problema como error conocido, respeta la regla de
-- publicacion (jefe publica; otro rol deja en revision) y valida la entrada
-- ------------------------------------------------------------
do $$
declare
  v_t uuid;
  v_t2 uuid;
  v_p uuid;
  v_p2 uuid;
  v_a public.kb_articulos;
  v_b public.kb_articulos;
  v_prob public.problemas;
  v_n int;
  fallos text := '';
begin
  insert into public.categorias_ticket (id, nombre) values ('__test_ci_106c__', '__TEST_CI__ Categoria 106c');
  insert into public.categorias_ticket (id, nombre) values ('__test_ci_106c2__', '__TEST_CI__ Categoria 106c2');
  insert into public.tickets (codigo, token, titulo, descripcion, categoria_id)
    values ('__TESTCI-106C1__', 'testci106ctoken0000001', '__TEST_CI__ T1', 'd', '__test_ci_106c__') returning id into v_t;
  insert into public.tickets (codigo, token, titulo, descripcion, categoria_id)
    values ('__TESTCI-106C2__', 'testci106ctoken0000002', '__TEST_CI__ T2', 'd', '__test_ci_106c2__') returning id into v_t2;
  insert into public.problemas (titulo, descripcion, ticket_disparador_id)
    values ('__TEST_CI__ Caidas de internet', 'Cortes varias veces al mes', v_t) returning id into v_p;
  insert into public.problema_tickets (problema_id, ticket_id) values (v_p, v_t2);

  -- primera publicacion de un no-jefe: articulo nuevo en revision
  v_a := public.publicar_workaround_problema_nucleo(v_p, 'Paso 1' || chr(10) || 'Paso 2', null, null, false);
  if v_a.tipo <> 'workaround' or v_a.problema_id is distinct from v_p or v_a.estado <> 'en_revision' then
    fallos := fallos || '[106] el articulo nuevo no es workaround/en_revision vinculado al problema; ';
  end if;
  if v_a.solucion is distinct from ('Paso 1' || chr(10) || 'Paso 2') then fallos := fallos || '[106] el workaround perdio sus saltos de linea; '; end if;
  if v_a.titulo is distinct from 'Workaround: __TEST_CI__ Caidas de internet' or v_a.sintoma is distinct from 'Cortes varias veces al mes' then
    fallos := fallos || '[106] titulo o sintoma por defecto incorrectos; ';
  end if;
  if v_a.ticket_origen_id is distinct from v_t then fallos := fallos || '[106] ticket_origen_id no es el disparador; '; end if;
  if v_a.categoria_id is null or v_a.categoria_id not in ('__test_ci_106c__', '__test_ci_106c2__') then fallos := fallos || '[106] la categoria no sale de los tickets vinculados; '; end if;
  select * into v_prob from public.problemas where id = v_p;
  if v_prob.error_conocido is not true or v_prob.kb_articulo_id is distinct from v_a.id or v_prob.workaround is distinct from v_a.solucion then
    fallos := fallos || '[106] el problema no quedo como error conocido con su articulo; ';
  end if;

  -- reenviar lo mismo: mismo articulo, mismo estado
  v_b := public.publicar_workaround_problema_nucleo(v_p, null, null, null, false);
  if v_b.id <> v_a.id or v_b.estado <> 'en_revision' then fallos := fallos || '[106] reenviar duplico el articulo o cambio su estado; '; end if;
  select count(*) into v_n from public.kb_articulos where problema_id = v_p and tipo = 'workaround' and deleted_at is null;
  if v_n <> 1 then fallos := fallos || '[106] hay ' || v_n || ' articulos de workaround vivos; '; end if;

  -- un jefe lo publica
  v_b := public.publicar_workaround_problema_nucleo(v_p, null, null, null, true);
  if v_b.id <> v_a.id or v_b.estado <> 'publicado' then fallos := fallos || '[106] el jefe no publico el articulo; '; end if;
  -- un no-jefe que no cambia nada no lo despublica; si cambia el texto, vuelve a revision
  v_b := public.publicar_workaround_problema_nucleo(v_p, null, null, null, false);
  if v_b.estado <> 'publicado' then fallos := fallos || '[106] reenviar lo mismo despublico el articulo; '; end if;
  v_b := public.publicar_workaround_problema_nucleo(v_p, 'Texto nuevo', 'Titulo nuevo', null, false);
  if v_b.estado <> 'en_revision' or v_b.solucion <> 'Texto nuevo' or v_b.titulo <> 'Titulo nuevo' then
    fallos := fallos || '[106] cambiar el texto no devolvio el articulo a revision con el contenido nuevo; ';
  end if;
  if (select workaround from public.problemas where id = v_p) <> 'Texto nuevo' then fallos := fallos || '[106] el problema no guardo el workaround nuevo; '; end if;

  -- validaciones
  insert into public.problemas (titulo, descripcion) values ('__TEST_CI__ Problema sin workaround', 'd') returning id into v_p2;
  begin perform public.publicar_workaround_problema_nucleo(v_p2, '   ', null, null, true); fallos := fallos || '[106] publico sin workaround; ';
  exception when others then if sqlerrm not like '%Escriba el workaround%' then fallos := fallos || '[106] sin workaround rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.publicar_workaround_problema_nucleo(v_p2, repeat('x', 5001), null, null, true); fallos := fallos || '[106] publico un workaround de 5001 caracteres; ';
  exception when others then if sqlerrm not like '%5000 caracteres%' then fallos := fallos || '[106] workaround largo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.publicar_workaround_problema_nucleo(v_p2, 'ok', repeat('t', 201), null, true); fallos := fallos || '[106] publico con un titulo de 201 caracteres; ';
  exception when others then if sqlerrm not like '%200 caracteres%' then fallos := fallos || '[106] titulo largo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.publicar_workaround_problema_nucleo(gen_random_uuid(), 'ok', null, null, true); fallos := fallos || '[106] publico un problema inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[106] problema inexistente lanzo ' || sqlstate || '; '; end if; end;
  update public.problemas set deleted_at = now() where id = v_p2;
  begin perform public.publicar_workaround_problema_nucleo(v_p2, 'ok', null, null, true); fallos := fallos || '[106] publico un problema eliminado; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[106] problema eliminado lanzo ' || sqlstate || '; '; end if; end;
  select count(*) into v_n from public.kb_articulos where problema_id = v_p2;
  if v_n <> 0 then fallos := fallos || '[106] una publicacion rechazada dejo un articulo; '; end if;

  -- si el articulo vigente se elimina, publicar crea otro (el indice solo mira los vivos)
  update public.kb_articulos set deleted_at = now() where id = v_a.id;
  v_b := public.publicar_workaround_problema_nucleo(v_p, null, null, null, true);
  if v_b.id = v_a.id or (select kb_articulo_id from public.problemas where id = v_p) <> v_b.id then fallos := fallos || '[106] no creo un articulo nuevo tras eliminar el anterior; '; end if;

  -- el error conocido documentado ya puede cerrarse
  update public.problemas set estado = 'diagnostico' where id = v_p;
  update public.problemas set estado = 'acciones' where id = v_p;
  update public.problemas set estado = 'cerrado' where id = v_p;
  if (select estado from public.problemas where id = v_p) <> 'cerrado' then fallos := fallos || '[106] el error conocido publicado no pudo cerrarse; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [106c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [106c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 106-d: crear_kb_desde_ticket_nucleo — solo desde un ticket resuelto o
-- cerrado, exige solucion, copia sintoma/titulo/categoria, nace borrador y no
-- se duplica
-- ------------------------------------------------------------
do $$
declare
  v_t uuid;
  v_t2 uuid;
  v_a public.kb_articulos;
  v_n int;
  fallos text := '';
begin
  insert into public.categorias_ticket (id, nombre) values ('__test_ci_106d__', '__TEST_CI__ Categoria 106d');
  insert into public.tickets (codigo, token, titulo, descripcion, categoria_id, estado)
    values ('__TESTCI-106D0__', 'testci106dtoken0000000', '__TEST_CI__ Abierto', 'd', '__test_ci_106d__', 'abierto')
    returning id into v_t;
  begin perform public.crear_kb_desde_ticket_nucleo(v_t, 'Reiniciar el spooler'); fallos := fallos || '[106] creo un articulo desde un ticket abierto; ';
  exception when others then if sqlerrm not like '%resuelto o cerrado%' then fallos := fallos || '[106] ticket abierto rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  insert into public.tickets (codigo, token, titulo, descripcion, categoria_id, estado)
    values ('__TESTCI-106D1__', 'testci106dtoken0000001', '__TEST_CI__ No imprime', 'La impresora no responde', '__test_ci_106d__', 'resuelto')
    returning id into v_t;
  begin perform public.crear_kb_desde_ticket_nucleo(v_t); fallos := fallos || '[106] creo un articulo sin solucion; ';
  exception when others then if sqlerrm not like '%no tiene nota de resolución%' then fallos := fallos || '[106] sin solucion rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_kb_desde_ticket_nucleo(v_t, '   '); fallos := fallos || '[106] creo un articulo con solucion en blanco; ';
  exception when others then if sqlerrm not like '%no tiene nota de resolución%' then fallos := fallos || '[106] solucion en blanco rechazada por otro motivo: ' || sqlerrm || '; '; end if; end;
  select count(*) into v_n from public.kb_articulos where ticket_origen_id = v_t;
  if v_n <> 0 then fallos := fallos || '[106] un intento rechazado dejo un articulo; '; end if;

  v_a := public.crear_kb_desde_ticket_nucleo(v_t, 'Paso 1' || chr(10) || 'Paso 2');
  if v_a.estado <> 'borrador' or v_a.tipo <> 'solucion' or v_a.ticket_origen_id is distinct from v_t or v_a.categoria_id is distinct from '__test_ci_106d__' then
    fallos := fallos || '[106] el articulo desde ticket nacio mal; ';
  end if;
  if v_a.titulo is distinct from '__TEST_CI__ No imprime' or v_a.sintoma is distinct from 'La impresora no responde' then fallos := fallos || '[106] titulo o sintoma no se copiaron del ticket; '; end if;
  if v_a.solucion is distinct from ('Paso 1' || chr(10) || 'Paso 2') then fallos := fallos || '[106] la solucion perdio sus saltos de linea; '; end if;

  begin perform public.crear_kb_desde_ticket_nucleo(v_t, 'Otra solucion'); fallos := fallos || '[106] creo dos articulos de solucion para el mismo ticket; ';
  exception when others then if sqlerrm not like '%ya tiene un artículo%' then fallos := fallos || '[106] segundo articulo rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- eliminado el articulo, se puede volver a crear; titulo y sintoma propios
  update public.kb_articulos set deleted_at = now() where id = v_a.id;
  v_a := public.crear_kb_desde_ticket_nucleo(v_t, 'Solucion revisada', 'Impresora sin respuesta', 'No imprime nada');
  if v_a.titulo <> 'Impresora sin respuesta' or v_a.sintoma <> 'No imprime nada' then fallos := fallos || '[106] titulo y sintoma propios ignorados; '; end if;

  -- un ticket cerrado tambien vale; uno inexistente es P0002
  insert into public.tickets (codigo, token, titulo, descripcion, estado)
    values ('__TESTCI-106D2__', 'testci106dtoken0000002', '__TEST_CI__ Cerrado', 'd', 'cerrado') returning id into v_t2;
  v_a := public.crear_kb_desde_ticket_nucleo(v_t2, 'Hecho');
  if v_a.estado <> 'borrador' or v_a.categoria_id is not null then fallos := fallos || '[106] el articulo del ticket cerrado sin categoria nacio mal; '; end if;
  begin perform public.crear_kb_desde_ticket_nucleo(gen_random_uuid(), 'x'); fallos := fallos || '[106] creo desde un ticket inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[106] ticket inexistente lanzo ' || sqlstate || '; '; end if; end;

  if fallos = '' then
    raise exception 'TESTS_OK [106d] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [106d]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 106-e: registrar_uso_kb_ticket_nucleo (idempotente, solo publicados) y
-- v_kpi_kb (usos de 90 dias y totales)
-- ------------------------------------------------------------
do $$
declare
  v_t uuid;
  v_a uuid;
  v_rev uuid;
  v_sin uuid;
  v_uso public.ticket_kb_usos;
  v_k record;
  v_n int;
  fallos text := '';
begin
  insert into public.tickets (codigo, token, titulo, descripcion) values ('__TESTCI-106E1__', 'testci106etoken0000001', '__TEST_CI__ T', 'd') returning id into v_t;
  insert into public.kb_articulos (titulo, estado, tipo) values ('__TEST_CI__ Publicado 106e', 'publicado', 'solucion') returning id into v_a;
  insert into public.kb_articulos (titulo, estado) values ('__TEST_CI__ En revision 106e', 'en_revision') returning id into v_rev;
  insert into public.kb_articulos (titulo, estado) values ('__TEST_CI__ Sin uso 106e', 'publicado') returning id into v_sin;

  v_uso := public.registrar_uso_kb_ticket_nucleo(v_t, v_a);
  if v_uso.ticket_id <> v_t or v_uso.kb_articulo_id <> v_a or v_uso.created_at is null then fallos := fallos || '[106] el uso no se registro bien; '; end if;
  v_uso := public.registrar_uso_kb_ticket_nucleo(v_t, v_a);
  select count(*) into v_n from public.ticket_kb_usos where ticket_id = v_t and kb_articulo_id = v_a;
  if v_n <> 1 then fallos := fallos || '[106] registrar dos veces duplico el uso (' || v_n || '); '; end if;

  begin perform public.registrar_uso_kb_ticket_nucleo(v_t, v_rev); fallos := fallos || '[106] registro el uso de un articulo en revision; ';
  exception when others then if sqlerrm not like '%artículos publicados%' then fallos := fallos || '[106] articulo en revision rechazado por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.registrar_uso_kb_ticket_nucleo(gen_random_uuid(), v_a); fallos := fallos || '[106] registro el uso en un ticket inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[106] ticket inexistente lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.registrar_uso_kb_ticket_nucleo(v_t, gen_random_uuid()); fallos := fallos || '[106] registro el uso de un articulo inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[106] articulo inexistente lanzo ' || sqlstate || '; '; end if; end;

  -- v_kpi_kb: 1 uso reciente; el articulo sin uso aparece en cero
  select * into v_k from public.v_kpi_kb where kb_articulo_id = v_a;
  if v_k.usos_90d is distinct from 1 or v_k.usos_total is distinct from 1 or v_k.ultimo_uso_at is null or v_k.tipo is distinct from 'solucion' then
    fallos := fallos || '[106] v_kpi_kb no cuenta el uso reciente; ';
  end if;
  select * into v_k from public.v_kpi_kb where kb_articulo_id = v_sin;
  if v_k.usos_90d is distinct from 0 or v_k.usos_total is distinct from 0 or v_k.ultimo_uso_at is not null then fallos := fallos || '[106] v_kpi_kb no muestra en cero al articulo sin uso; '; end if;

  -- un uso de hace 100 dias cuenta en el total pero no en los 90 dias
  update public.ticket_kb_usos set created_at = now() - interval '100 days' where ticket_id = v_t and kb_articulo_id = v_a;
  select * into v_k from public.v_kpi_kb where kb_articulo_id = v_a;
  if v_k.usos_90d is distinct from 0 or v_k.usos_total is distinct from 1 then fallos := fallos || '[106] v_kpi_kb no separa los 90 dias del total; '; end if;

  -- un articulo eliminado sale de la vista
  update public.kb_articulos set deleted_at = now() where id = v_sin;
  if exists (select 1 from public.v_kpi_kb where kb_articulo_id = v_sin) then fallos := fallos || '[106] v_kpi_kb lista un articulo eliminado; '; end if;

  -- eliminar el articulo (jefe, fisico) borra sus usos
  delete from public.kb_articulos where id = v_a;
  select count(*) into v_n from public.ticket_kb_usos where ticket_id = v_t;
  if v_n <> 0 then fallos := fallos || '[106] borrar el articulo dejo usos huerfanos; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [106e] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [106e]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 107-a: servicios (CHECK, nombre unico, dueno, tope de 15), servicio_id en los
-- cuatro catalogos (ON DELETE SET NULL), cambio_id, whitelist, RLS, privilegios
-- y EXECUTE (los servicios vivos se dan de baja DENTRO del bloque, que se revierte)
-- ------------------------------------------------------------
do $$
declare
  v_n int;
  v_f text;
  v_i int;
  v_user uuid;
  fallos text := '';
begin
  -- columnas y FK
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and column_name = 'servicio_id' and is_nullable = 'YES'
     and table_name in ('categorias_ticket', 'plataformas', 'licencias', 'tipos_equipo');
  if v_n <> 4 then fallos := fallos || '[107] se esperaban 4 columnas servicio_id nullables y hay ' || v_n || '; '; end if;
  select count(*) into v_n from pg_constraint
   where contype = 'f' and confrelid = 'public.servicios'::regclass and confdeltype = 'n'
     and conrelid in ('public.categorias_ticket'::regclass, 'public.plataformas'::regclass, 'public.licencias'::regclass, 'public.tipos_equipo'::regclass);
  if v_n <> 4 then fallos := fallos || '[107] las 4 FK a servicios deben ser ON DELETE SET NULL (' || v_n || '/4); '; end if;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and column_name = 'cambio_id' and is_nullable = 'YES'
     and table_name in ('schema_migrations', 'function_deploys');
  if v_n <> 2 then fallos := fallos || '[107] faltan las columnas cambio_id de schema_migrations y function_deploys; '; end if;

  -- whitelist: 14 filas, 2 solo jefe, terminales sin salida
  select count(*) into v_n from public.transiciones_cambio_permitidas;
  if v_n <> 14 then fallos := fallos || '[107] la whitelist debe tener 14 transiciones y tiene ' || v_n || '; '; end if;
  if exists (select 1 from public.transiciones_cambio_permitidas where origen in ('cerrado', 'rechazado', 'cancelado', 'revertido')) then
    fallos := fallos || '[107] cerrado, rechazado, cancelado y revertido deben ser terminales; ';
  end if;
  select count(*) into v_n from public.transiciones_cambio_permitidas where solo_jefe;
  if v_n <> 2 then fallos := fallos || '[107] solo aprobar y rechazar son de jefe (' || v_n || '); '; end if;
  select count(*) into v_n from public.transiciones_cambio_permitidas
   where destino = 'en_ejecucion' and origen in ('borrador', 'solicitado') and tipos <> array['emergencia'];
  if v_n <> 0 then fallos := fallos || '[107] solo la emergencia se ejecuta sin aprobacion previa; '; end if;

  -- el catalogo sembrado existe (en produccion el jefe pudo editarlo)
  select count(*) into v_n from public.servicios
   where id in ('correo', 'bitrix24', 'vpn', 'erp', 'red', 'equipos', 'impresion', 'telefonia', 'licencias', 'accesos');
  if v_n = 0 then fallos := fallos || '[107] no hay ningun servicio sembrado; '; end if;

  -- desde aqui el catalogo se vacia (rollback del bloque)
  update public.servicios set deleted_at = now() where deleted_at is null;

  -- CHECK de id, nombre, criticidad, horario y dueno
  begin insert into public.servicios (id, nombre) values ('Mal Id', 'Nombre valido'); fallos := fallos || '[107] el CHECK admitio un id con mayusculas y espacios; ';
  exception when check_violation then null; end;
  begin insert into public.servicios (id, nombre) values ('s_corto', 'x'); fallos := fallos || '[107] el CHECK admitio un nombre de un caracter; ';
  exception when check_violation then null; end;
  begin insert into public.servicios (id, nombre, criticidad) values ('s_crit', 'Servicio crit', 'urgente'); fallos := fallos || '[107] el CHECK admitio una criticidad fuera de dominio; ';
  exception when check_violation then null; end;
  begin insert into public.servicios (id, nombre, horario) values ('s_hor', 'Servicio hor', repeat('x', 61)); fallos := fallos || '[107] el CHECK admitio un horario de 61 caracteres; ';
  exception when check_violation then null; end;
  begin insert into public.servicios (id, nombre, dueno_user_id) values ('s_dueno', 'Servicio dueno', gen_random_uuid()); fallos := fallos || '[107] el dueno admitio un usuario que no es staff; ';
  exception when foreign_key_violation then null; end;

  -- nombre unico entre los vivos (sin distinguir mayusculas); uno dado de baja libera el nombre
  insert into public.servicios (id, nombre) values ('s_uno', '__TEST_CI__ Servicio 107');
  begin insert into public.servicios (id, nombre) values ('s_dos', '__test_ci__ servicio 107'); fallos := fallos || '[107] se admitieron dos servicios vivos con el mismo nombre; ';
  exception when unique_violation then null; end;
  update public.servicios set deleted_at = now() where id = 's_uno';
  insert into public.servicios (id, nombre) values ('s_dos', '__TEST_CI__ Servicio 107');
  update public.servicios set deleted_at = now() where id = 's_dos';

  -- dueno: un integrante del staff (el trigger de auth.users lo crea)
  insert into auth.users (email) values ('__test_ci_107a_dueno@example.test') returning id into v_user;
  insert into public.servicios (id, nombre, dueno_user_id, criticidad, horario)
    values ('s_dueno', '__TEST_CI__ Con dueno', v_user, 'critica', '24 x 7');
  update public.servicios set deleted_at = now() where id = 's_dueno';

  -- servicio_id en los cuatro catalogos: ON DELETE SET NULL y FK real
  insert into public.servicios (id, nombre) values ('s_fk', '__TEST_CI__ FK');
  insert into public.categorias_ticket (id, nombre, servicio_id) values ('__test_ci_107a__', '__TEST_CI__ Categoria', 's_fk');
  insert into public.plataformas (id, nombre, servicio_id) values ('__test_ci_107a__', '__TEST_CI__ Plataforma', 's_fk');
  insert into public.licencias (software, tipo, servicio_id) values ('__TEST_CI__ Software 107', 'perpetua', 's_fk');
  insert into public.tipos_equipo (id, nombre, servicio_id) values ('__test_ci_107a__', '__TEST_CI__ Tipo', 's_fk');
  begin insert into public.categorias_ticket (id, nombre, servicio_id) values ('__test_ci_107a_2__', '__TEST_CI__ Categoria 2', 'no_existe');
    fallos := fallos || '[107] una categoria admitio un servicio inexistente; ';
  exception when foreign_key_violation then null; end;
  delete from public.servicios where id = 's_fk';
  select count(*) into v_n from (
    select servicio_id from public.categorias_ticket where id = '__test_ci_107a__'
    union all select servicio_id from public.plataformas where id = '__test_ci_107a__'
    union all select servicio_id from public.licencias where software = '__TEST_CI__ Software 107'
    union all select servicio_id from public.tipos_equipo where id = '__test_ci_107a__') t
   where servicio_id is not null;
  if v_n <> 0 then fallos := fallos || '[107] borrar el servicio no dejo en NULL las 4 filas que lo referenciaban (' || v_n || '); '; end if;

  -- tope de 15 servicios vivos
  for v_i in 1..15 loop
    insert into public.servicios (id, nombre) values ('s_tope_' || v_i, '__TEST_CI__ Tope ' || v_i);
  end loop;
  begin insert into public.servicios (id, nombre) values ('s_tope_16', '__TEST_CI__ Tope 16'); fallos := fallos || '[107] se admitio el servicio numero 16; ';
  exception when others then if sqlerrm not like '%15 servicios%' then fallos := fallos || '[107] el tope fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  update public.servicios set deleted_at = now() where id = 's_tope_1';
  insert into public.servicios (id, nombre) values ('s_tope_16', '__TEST_CI__ Tope 16');
  begin update public.servicios set deleted_at = null where id = 's_tope_1'; fallos := fallos || '[107] se restauro un servicio por encima del tope; ';
  exception when others then if sqlerrm not like '%15 servicios%' then fallos := fallos || '[107] restaurar por encima del tope fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  update public.servicios set descripcion = 'Editado' where id = 's_tope_2';

  -- RLS y policies
  select count(*) into v_n from pg_class
   where oid in ('public.servicios'::regclass, 'public.cambios'::regclass, 'public.cambio_eventos'::regclass,
                 'public.cambio_tickets'::regclass, 'public.transiciones_cambio_permitidas'::regclass) and relrowsecurity;
  if v_n <> 5 then fallos := fallos || '[107] alguna tabla sin RLS (' || v_n || '/5); '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'servicios'
    and ((cmd = 'SELECT' and qual like '%staff:activo%')
      or (cmd = 'INSERT' and with_check like '%rol:jefe%')
      or (cmd = 'UPDATE' and qual like '%rol:jefe%' and with_check like '%rol:jefe%')
      or (cmd = 'DELETE' and qual like '%rol:jefe%'));
  if v_n <> 4 then fallos := fallos || '[107] servicios: faltan policies (SELECT staff activo; INSERT/UPDATE/DELETE jefe) (' || v_n || '/4); '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public'
    and tablename in ('cambios', 'cambio_eventos', 'cambio_tickets') and cmd = 'SELECT' and qual like '%puede_actual%tickets%';
  if v_n <> 3 then fallos := fallos || '[107] faltan policies SELECT con el modulo tickets (' || v_n || '/3); '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public'
    and tablename in ('cambios', 'cambio_eventos', 'cambio_tickets', 'transiciones_cambio_permitidas') and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if v_n <> 0 then fallos := fallos || '[107] las tablas de cambios tienen policies de escritura; '; end if;

  -- privilegios: los clientes no escriben cambios, ni leen nada como anon
  if has_table_privilege('authenticated', 'public.cambios', 'insert')
     or has_table_privilege('authenticated', 'public.cambios', 'update')
     or has_table_privilege('authenticated', 'public.cambios', 'delete')
     or has_table_privilege('authenticated', 'public.cambio_eventos', 'insert')
     or has_table_privilege('authenticated', 'public.cambio_eventos', 'update')
     or has_table_privilege('authenticated', 'public.cambio_eventos', 'delete')
     or has_table_privilege('authenticated', 'public.cambio_tickets', 'insert')
     or has_table_privilege('authenticated', 'public.cambio_tickets', 'delete')
     or has_table_privilege('authenticated', 'public.transiciones_cambio_permitidas', 'insert')
     or not has_table_privilege('authenticated', 'public.cambios', 'select')
     or not has_table_privilege('authenticated', 'public.cambio_eventos', 'select')
     or not has_table_privilege('authenticated', 'public.cambio_tickets', 'select')
     or has_table_privilege('anon', 'public.cambios', 'select')
     or has_table_privilege('anon', 'public.cambio_eventos', 'select')
     or has_table_privilege('anon', 'public.cambio_tickets', 'select')
     or has_table_privilege('anon', 'public.servicios', 'select') then
    fallos := fallos || '[107] privilegios de tablas incorrectos; ';
  end if;
  if not has_table_privilege('authenticated', 'public.servicios', 'insert')
     or not has_table_privilege('authenticated', 'public.servicios', 'update') then
    fallos := fallos || '[107] el catalogo de servicios debe poder escribirse desde el cliente (la RLS lo limita al jefe); ';
  end if;
  if has_sequence_privilege('authenticated', 'public.cambio_codigo_seq', 'usage')
     or has_sequence_privilege('anon', 'public.cambio_codigo_seq', 'usage') then
    fallos := fallos || '[107] la secuencia de codigos es usable por clientes; ';
  end if;

  -- EXECUTE: RPC a authenticated; nucleos, internas y triggers solo a project_admin
  foreach v_f in array array[
    'public.crear_cambio(text, text, text, text, text, text, timestamptz, timestamptz, boolean)',
    'public.actualizar_cambio(uuid, text, text, text, text, text, text, timestamptz, timestamptz)',
    'public.transicionar_cambio(uuid, text, text)',
    'public.aprobar_cambio(uuid, text)',
    'public.rechazar_cambio(uuid, text)',
    'public.vincular_cambio_ticket(uuid, uuid)',
    'public.desvincular_cambio_ticket(uuid, uuid)'] loop
    if not has_function_privilege('authenticated', v_f, 'execute') or has_function_privilege('anon', v_f, 'execute') then
      fallos := fallos || '[107] EXECUTE incorrecto en ' || v_f || '; ';
    end if;
  end loop;
  foreach v_f in array array[
    'public.crear_cambio_nucleo(text, text, text, text, text, text, timestamptz, timestamptz, boolean, uuid, boolean)',
    'public.actualizar_cambio_nucleo(uuid, text, text, text, text, text, text, timestamptz, timestamptz, uuid, boolean)',
    'public.transicionar_cambio_nucleo(uuid, text, text, uuid, boolean)',
    'public.aprobar_cambio_nucleo(uuid, text, uuid, boolean)',
    'public.rechazar_cambio_nucleo(uuid, text, uuid, boolean)',
    'public.vincular_cambio_ticket_nucleo(uuid, uuid, uuid, boolean)',
    'public.desvincular_cambio_ticket_nucleo(uuid, uuid, uuid, boolean)',
    'public.registrar_evento_cambio(uuid, text, text, text, text, uuid, text)',
    'public.cambio_validar_campos(text, text, text, text, text, text, timestamptz, timestamptz)',
    'public.check_transicion_cambio()',
    'public.check_tope_servicios()',
    'public.siguiente_codigo_cambio()',
    'public.texto_multilinea(text)'] loop
    if has_function_privilege('authenticated', v_f, 'execute') or has_function_privilege('anon', v_f, 'execute')
       or not has_function_privilege('project_admin', v_f, 'execute') then
      fallos := fallos || '[107] EXECUTE incorrecto en ' || v_f || '; ';
    end if;
  end loop;

  -- sin sesion (auth.uid() NULL) cada RPC publica responde 42501
  begin perform public.crear_cambio('Titulo', 'normal', 'bajo', 'correo', 'd'); fallos := fallos || '[107] crear_cambio respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[107] crear_cambio sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.actualizar_cambio(gen_random_uuid(), 'Titulo', 'normal', 'bajo', 'correo', 'd'); fallos := fallos || '[107] actualizar_cambio respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[107] actualizar_cambio sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.transicionar_cambio(gen_random_uuid(), 'solicitado'); fallos := fallos || '[107] transicionar_cambio respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[107] transicionar_cambio sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.aprobar_cambio(gen_random_uuid()); fallos := fallos || '[107] aprobar_cambio respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[107] aprobar_cambio sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.rechazar_cambio(gen_random_uuid(), 'x'); fallos := fallos || '[107] rechazar_cambio respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[107] rechazar_cambio sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.vincular_cambio_ticket(gen_random_uuid(), gen_random_uuid()); fallos := fallos || '[107] vincular_cambio_ticket respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[107] vincular_cambio_ticket sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.desvincular_cambio_ticket(gen_random_uuid(), gen_random_uuid()); fallos := fallos || '[107] desvincular_cambio_ticket respondio sin sesion; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[107] desvincular_cambio_ticket sin sesion lanzo ' || sqlstate || '; '; end if; end;

  if fallos = '' then
    raise exception 'TESTS_OK [107a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [107a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 107-b: trigger y CHECK de los cambios con SQL directo (project_admin tampoco se
-- salta la whitelist): plan y ventana, congelado fuera de borrador, aprobador jefe
-- activo, emergencia sin aprobar no cierra, libro inmutable, enlace con tickets
-- ------------------------------------------------------------
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  v_n uuid;
  v_n2 uuid;
  v_e uuid;
  v_s uuid;
  v_t uuid;
  v_ev uuid;
  v_codigo text;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_107b_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_107b_asis@example.test') returning id into v_asis;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  update public.staff set activo = true where user_id = v_asis;
  update public.servicios set deleted_at = now() where deleted_at is null;
  insert into public.servicios (id, nombre) values ('s107b', '__TEST_CI__ Servicio 107b');

  insert into public.cambios (titulo, tipo, riesgo, servicio_id, descripcion)
    values ('__TEST_CI__ Normal 107b', 'normal', 'medio', 's107b', 'Descripcion') returning id, codigo into v_n, v_codigo;
  if v_codigo !~ '^CHG-[0-9]{4,}$' then fallos := fallos || '[107] el codigo no tiene la forma CHG-####: ' || v_codigo || '; '; end if;

  -- sin plan de retroceso ni ventana no sale de borrador (CHECK)
  begin update public.cambios set estado = 'solicitado' where id = v_n; fallos := fallos || '[107] un cambio normal salio de borrador sin plan ni ventana; ';
  exception when check_violation then null; end;
  begin update public.cambios set plan_retroceso = '   ', ventana_inicio = now(), ventana_fin = now() + interval '1 hour', estado = 'solicitado' where id = v_n;
    fallos := fallos || '[107] un plan de retroceso en blanco conto como plan; ';
  exception when check_violation then null; end;
  -- ventana coherente: ambas o ninguna, y fin posterior al inicio
  begin update public.cambios set ventana_inicio = now() where id = v_n; fallos := fallos || '[107] se admitio una ventana con solo el inicio; ';
  exception when check_violation then null; end;
  begin update public.cambios set ventana_inicio = now(), ventana_fin = now() - interval '1 hour' where id = v_n; fallos := fallos || '[107] se admitio una ventana que termina antes de empezar; ';
  exception when check_violation then null; end;

  update public.cambios
     set plan_retroceso = 'Restaurar la configuracion anterior', ventana_inicio = now() + interval '1 day', ventana_fin = now() + interval '1 day 2 hours'
   where id = v_n;
  update public.cambios set estado = 'solicitado' where id = v_n;

  -- contenido congelado fuera de borrador
  begin update public.cambios set titulo = 'Otro titulo' where id = v_n; fallos := fallos || '[107] se edito el titulo de un cambio solicitado; ';
  exception when others then if sqlerrm not like '%no se edita%' then fallos := fallos || '[107] editar un solicitado fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.cambios set plan_retroceso = 'Otro plan' where id = v_n; fallos := fallos || '[107] se edito el plan de un cambio solicitado; ';
  exception when others then if sqlerrm not like '%no se edita%' then fallos := fallos || '[107] editar el plan fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.cambios set codigo = 'CHG-9999' where id = v_n; fallos := fallos || '[107] se cambio el codigo de un cambio; ';
  exception when others then if sqlerrm not like '%no cambia de c%' then fallos := fallos || '[107] cambiar el codigo fallo por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- aprobar: exige aprobador, y que sea un jefe activo
  begin update public.cambios set estado = 'aprobado' where id = v_n; fallos := fallos || '[107] un cambio normal paso a aprobado sin aprobador; ';
  exception when others then if sqlerrm not like '%solo pasa a aprobado%' then fallos := fallos || '[107] aprobar sin aprobador fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.cambios set estado = 'aprobado', aprobado_por = v_asis, aprobado_at = now() where id = v_n; fallos := fallos || '[107] un asistente figuro como aprobador; ';
  exception when others then if sqlerrm not like '%jefe activo%' then fallos := fallos || '[107] aprobador asistente fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.cambios set aprobado_por = v_jefe where id = v_n; fallos := fallos || '[107] se admitio aprobado_por sin aprobado_at; ';
  exception when check_violation then null; end;
  update public.cambios set estado = 'aprobado', aprobado_por = v_jefe, aprobado_at = now() where id = v_n;

  -- whitelist
  begin update public.cambios set estado = 'cerrado' where id = v_n; fallos := fallos || '[107] aprobado -> cerrado no deberia permitirse; ';
  exception when others then if sqlerrm not like '%no permitida%' then fallos := fallos || '[107] aprobado -> cerrado fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin update public.cambios set aprobacion_pendiente_hasta = now() where id = v_n; fallos := fallos || '[107] un cambio normal admitio un plazo de aprobacion; ';
  exception when check_violation then null; end;

  -- un cambio normal no se ejecuta sin pasar por la aprobacion
  insert into public.cambios (titulo, tipo, riesgo, servicio_id, descripcion)
    values ('__TEST_CI__ Normal 107b-2', 'normal', 'bajo', 's107b', 'Descripcion') returning id into v_n2;
  begin update public.cambios set estado = 'en_ejecucion' where id = v_n2; fallos := fallos || '[107] un cambio normal en borrador paso a en_ejecucion; ';
  exception when others then if sqlerrm not like '%no permitida%' then fallos := fallos || '[107] normal -> en_ejecucion fallo por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- un borrador incompleto se puede cancelar
  update public.cambios set estado = 'cancelado' where id = v_n2;
  begin update public.cambios set estado = 'solicitado' where id = v_n2; fallos := fallos || '[107] un cambio cancelado volvio a solicitado; ';
  exception when others then if sqlerrm not like '%no permitida%' then fallos := fallos || '[107] cancelado -> solicitado fallo por otro motivo: ' || sqlerrm || '; '; end if; end;

  -- estandar: preautorizado (sin plan), pero con ventana
  insert into public.cambios (titulo, tipo, riesgo, servicio_id, descripcion)
    values ('__TEST_CI__ Estandar 107b', 'estandar', 'bajo', 's107b', 'Rutina') returning id into v_s;
  begin update public.cambios set estado = 'aprobado' where id = v_s; fallos := fallos || '[107] un estandar paso a aprobado sin ventana; ';
  exception when check_violation then null; end;
  update public.cambios set ventana_inicio = now(), ventana_fin = now() + interval '1 hour' where id = v_s;
  update public.cambios set estado = 'aprobado' where id = v_s;
  if (select aprobado_por from public.cambios where id = v_s) is not null then fallos := fallos || '[107] un estandar preautorizado no deberia tener aprobador; '; end if;

  -- emergencia: se ejecuta sin aprobacion previa, pero no se cierra sin aprobacion a posteriori
  insert into public.cambios (titulo, tipo, riesgo, servicio_id, descripcion, plan_retroceso)
    values ('__TEST_CI__ Emergencia 107b', 'emergencia', 'alto', 's107b', 'Caida', 'Volver al enlace anterior') returning id into v_e;
  update public.cambios set estado = 'en_ejecucion' where id = v_e;
  update public.cambios set estado = 'implementado' where id = v_e;
  begin update public.cambios set estado = 'cerrado' where id = v_e; fallos := fallos || '[107] una emergencia sin aprobar se cerro; ';
  exception when others then if sqlerrm not like '%aprobaci_n a posteriori%' then fallos := fallos || '[107] cerrar la emergencia fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  update public.cambios set aprobado_por = v_jefe, aprobado_at = now() where id = v_e;
  update public.cambios set estado = 'cerrado' where id = v_e;
  if (select estado from public.cambios where id = v_e) <> 'cerrado' then fallos := fallos || '[107] la emergencia aprobada no cerro; '; end if;

  -- libro inmutable y con dominio cerrado
  perform public.registrar_evento_cambio(v_n, 'editado', 'solicitado', 'solicitado', 'Prueba', v_jefe, 'jefe');
  select id into v_ev from public.cambio_eventos where cambio_id = v_n limit 1;
  begin update public.cambio_eventos set detalle = 'Alterado' where id = v_ev; fallos := fallos || '[107] se modifico un evento del libro; ';
  exception when others then if sqlerrm not like '%inmutable%' then fallos := fallos || '[107] UPDATE del libro fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin delete from public.cambio_eventos where id = v_ev; fallos := fallos || '[107] se borro un evento del libro; ';
  exception when others then if sqlerrm not like '%inmutable%' then fallos := fallos || '[107] DELETE del libro fallo por otro motivo: ' || sqlerrm || '; '; end if; end;
  begin perform public.registrar_evento_cambio(v_n, 'inventado', null, null, null, v_jefe, 'jefe'); fallos := fallos || '[107] el libro admitio un evento fuera de dominio; ';
  exception when check_violation then null; end;
  begin perform public.registrar_evento_cambio(v_n, 'editado', null, null, null, v_jefe, 'usuario'); fallos := fallos || '[107] el libro admitio un rol fuera de dominio; ';
  exception when check_violation then null; end;

  -- enlace con tickets: clave unica y se va con el ticket
  insert into public.tickets (codigo, token, titulo, descripcion, estado)
    values ('__TESTCI-107B__', '__test_ci_107b_token__', 'Test CI 107b', 'Ticket de prueba', 'abierto') returning id into v_t;
  insert into public.cambio_tickets (cambio_id, ticket_id, vinculado_por) values (v_n, v_t, v_jefe);
  begin insert into public.cambio_tickets (cambio_id, ticket_id) values (v_n, v_t); fallos := fallos || '[107] se enlazo dos veces el mismo ticket; ';
  exception when unique_violation then null; end;
  delete from public.tickets where id = v_t;
  if exists (select 1 from public.cambio_tickets where cambio_id = v_n) then fallos := fallos || '[107] el enlace sobrevivio al ticket; '; end if;

  -- un cambio con eventos no se puede borrar (el libro es parte de su historia)
  begin delete from public.cambios where id = v_n; fallos := fallos || '[107] se borro un cambio con libro; ';
  exception when foreign_key_violation then null; end;

  if fallos = '' then
    raise exception 'TESTS_OK [107b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [107b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 107-c: nucleos — ciclo de vida de un cambio normal (borrador, solicitado,
-- aprobado, en ejecucion, implementado, cerrado), validaciones de crear, jefe
-- para aprobar y rechazar, motivos, estandar preautorizado, libro con actor y
-- rol, y vincular / desvincular tickets
-- ------------------------------------------------------------
do $$
declare
  v_jefe uuid;
  v_tec uuid;
  v_c public.cambios;
  v_c2 public.cambios;
  v_c3 public.cambios;
  v_c4 public.cambios;
  v_est public.cambios;
  v_t uuid;
  v_vinc public.cambio_tickets;
  v_ok boolean;
  v_evs text;
  v_n int;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_107c_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_107c_tec@example.test') returning id into v_tec;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  update public.staff set activo = true where user_id = v_tec;
  update public.servicios set deleted_at = now() where deleted_at is null;
  insert into public.servicios (id, nombre) values ('s107c', '__TEST_CI__ Servicio 107c');
  insert into public.servicios (id, nombre) values ('s107c_baja', '__TEST_CI__ Servicio 107c baja');
  update public.servicios set deleted_at = now() where id = 's107c_baja';

  -- validaciones de crear_cambio_nucleo
  begin perform public.crear_cambio_nucleo('ab', 'normal', 'bajo', 's107c', 'd', 'p', null, null, false, v_tec, false); fallos := fallos || '[107] se admitio un titulo de 2 caracteres; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%t_tulo%' then fallos := fallos || '[107] titulo corto: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_cambio_nucleo('Titulo valido', 'otro', 'bajo', 's107c', 'd', 'p', null, null, false, v_tec, false); fallos := fallos || '[107] se admitio un tipo fuera de dominio; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%tipo de cambio%' then fallos := fallos || '[107] tipo invalido: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_cambio_nucleo('Titulo valido', 'normal', 'extremo', 's107c', 'd', 'p', null, null, false, v_tec, false); fallos := fallos || '[107] se admitio un riesgo fuera de dominio; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%riesgo%' then fallos := fallos || '[107] riesgo invalido: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_cambio_nucleo('Titulo valido', 'normal', 'bajo', 'no_existe', 'd', 'p', null, null, false, v_tec, false); fallos := fallos || '[107] se admitio un servicio inexistente; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%servicio%' then fallos := fallos || '[107] servicio inexistente: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_cambio_nucleo('Titulo valido', 'normal', 'bajo', 's107c_baja', 'd', 'p', null, null, false, v_tec, false); fallos := fallos || '[107] se admitio un servicio dado de baja; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%servicio%' then fallos := fallos || '[107] servicio de baja: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_cambio_nucleo('Titulo valido', 'normal', 'bajo', 's107c', '   ', 'p', null, null, false, v_tec, false); fallos := fallos || '[107] se admitio una descripcion vacia; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%descripci%' then fallos := fallos || '[107] descripcion vacia: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_cambio_nucleo('Titulo valido', 'normal', 'bajo', 's107c', 'd', 'p', now(), now() - interval '1 hour', false, v_tec, false); fallos := fallos || '[107] se admitio una ventana invertida; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%termina antes%' then fallos := fallos || '[107] ventana invertida: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_cambio_nucleo('Titulo valido', 'normal', 'bajo', 's107c', 'd', 'p', now(), null, false, v_tec, false); fallos := fallos || '[107] se admitio una ventana a medias; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%inicio y el fin%' then fallos := fallos || '[107] ventana a medias: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  -- enviar sin plan o sin ventana: mensajes claros y nada queda creado
  begin perform public.crear_cambio_nucleo('Titulo valido', 'normal', 'bajo', 's107c', 'd', null, now() + interval '1 day', now() + interval '2 days', true, v_tec, false); fallos := fallos || '[107] se envio un normal sin plan de retroceso; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%plan de retroceso%' then fallos := fallos || '[107] enviar sin plan: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.crear_cambio_nucleo('Titulo valido', 'normal', 'bajo', 's107c', 'd', 'Plan', null, null, true, v_tec, false); fallos := fallos || '[107] se envio un normal sin ventana; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%ventana%' then fallos := fallos || '[107] enviar sin ventana: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;

  -- borrador: se limpia el titulo y se conservan los saltos de linea
  v_c := public.crear_cambio_nucleo('  Cambio   de   router  ', 'normal', 'medio', 's107c', E'Linea 1\nLinea 2', 'Volver a la configuracion guardada', null, null, false, v_tec, false);
  if v_c.titulo <> 'Cambio de router' then fallos := fallos || '[107] el titulo no se limpio: ' || v_c.titulo || '; '; end if;
  if position(chr(10) in v_c.descripcion) = 0 then fallos := fallos || '[107] la descripcion perdio sus saltos de linea; '; end if;
  if v_c.estado <> 'borrador' or v_c.solicitado_por is distinct from v_tec or v_c.codigo !~ '^CHG-[0-9]{4,}$' then fallos := fallos || '[107] el borrador nacio mal; '; end if;

  -- editar el borrador
  v_c := public.actualizar_cambio_nucleo(v_c.id, 'Cambio del router principal', 'normal', 'alto', 's107c', 'Cambiar el router', 'Plan A', now() + interval '1 day', now() + interval '1 day 3 hours', v_tec, false);
  if v_c.titulo <> 'Cambio del router principal' or v_c.riesgo <> 'alto' or v_c.ventana_inicio is null then fallos := fallos || '[107] actualizar_cambio_nucleo no aplico los datos; '; end if;
  begin perform public.actualizar_cambio_nucleo(v_c.id, 'Titulo valido', 'normal', 'alto', 'no_existe', 'd', 'p', null, null, v_tec, false); fallos := fallos || '[107] actualizar admitio un servicio inexistente; ';
  exception when others then if sqlstate <> 'P0001' then fallos := fallos || '[107] actualizar con servicio inexistente: ' || sqlstate || '; '; end if; end;
  begin perform public.actualizar_cambio_nucleo(gen_random_uuid(), 'Titulo valido', 'normal', 'alto', 's107c', 'd', 'p', null, null, v_tec, false); fallos := fallos || '[107] actualizar un cambio inexistente no fallo; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[107] actualizar inexistente lanzo ' || sqlstate || '; '; end if; end;

  -- solicitar
  v_c := public.transicionar_cambio_nucleo(v_c.id, 'solicitado', null, v_tec, false);
  if v_c.estado <> 'solicitado' or v_c.solicitado_at is null then fallos := fallos || '[107] no quedo solicitado con su fecha; '; end if;
  begin perform public.actualizar_cambio_nucleo(v_c.id, 'Titulo valido', 'normal', 'alto', 's107c', 'd', 'p', null, null, v_tec, false); fallos := fallos || '[107] se edito un cambio solicitado; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%no se edita%' then fallos := fallos || '[107] editar solicitado: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;

  -- aprobar: solo un jefe (por las dos puertas)
  begin perform public.aprobar_cambio_nucleo(v_c.id, null, v_tec, false); fallos := fallos || '[107] un tecnico aprobo un cambio; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%Solo un jefe%' then fallos := fallos || '[107] aprobar como tecnico: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.transicionar_cambio_nucleo(v_c.id, 'aprobado', null, v_tec, false); fallos := fallos || '[107] un tecnico aprobo con transicionar; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%Solo un jefe%' then fallos := fallos || '[107] transicionar a aprobado como tecnico: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.rechazar_cambio_nucleo(v_c.id, 'No', v_tec, false); fallos := fallos || '[107] un tecnico rechazo un cambio; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%Solo un jefe%' then fallos := fallos || '[107] rechazar como tecnico: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  v_c := public.aprobar_cambio_nucleo(v_c.id, 'Autorizado', v_jefe, true);
  if v_c.estado <> 'aprobado' or v_c.aprobado_por is distinct from v_jefe or v_c.aprobado_at is null then fallos := fallos || '[107] la aprobacion no registro al jefe; '; end if;
  begin perform public.aprobar_cambio_nucleo(v_c.id, null, v_jefe, true); fallos := fallos || '[107] se aprobo dos veces; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%no admite aprobaci%' then fallos := fallos || '[107] doble aprobacion: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.transicionar_cambio_nucleo(v_c.id, 'implementado', null, v_tec, false); fallos := fallos || '[107] aprobado -> implementado no deberia permitirse; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%no puede pasar%' then fallos := fallos || '[107] aprobado -> implementado: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;

  -- ejecutar, implementar, cerrar
  v_c := public.transicionar_cambio_nucleo(v_c.id, 'en_ejecucion', null, v_tec, false);
  if v_c.inicio_real_at is null or v_c.aprobacion_pendiente_hasta is not null then fallos := fallos || '[107] en_ejecucion mal registrado; '; end if;
  v_c := public.transicionar_cambio_nucleo(v_c.id, 'implementado', 'Router cambiado sin incidentes', v_tec, false);
  if v_c.fin_real_at is null or v_c.resultado <> 'Router cambiado sin incidentes' then fallos := fallos || '[107] implementado sin resultado ni fecha; '; end if;
  v_c := public.transicionar_cambio_nucleo(v_c.id, 'cerrado', null, v_jefe, true);
  if v_c.estado <> 'cerrado' then fallos := fallos || '[107] no cerro; '; end if;
  begin perform public.transicionar_cambio_nucleo(v_c.id, 'cancelado', 'tarde', v_tec, false); fallos := fallos || '[107] un cambio cerrado se cancelo; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%no puede pasar%' then fallos := fallos || '[107] cerrado es terminal: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;

  -- libro: orden, actor y rol
  select string_agg(evento, ',' order by orden) into v_evs from public.cambio_eventos where cambio_id = v_c.id;
  if v_evs is distinct from 'creado,editado,solicitado,aprobado,iniciado,implementado,cerrado' then fallos := fallos || '[107] libro inesperado: ' || coalesce(v_evs, 'vacio') || '; '; end if;
  if (select user_id from public.cambio_eventos where cambio_id = v_c.id and evento = 'creado') is distinct from v_tec
     or (select rol_actor from public.cambio_eventos where cambio_id = v_c.id and evento = 'creado') <> 'tecnico'
     or (select user_email from public.cambio_eventos where cambio_id = v_c.id and evento = 'creado') <> '__test_ci_107c_tec@example.test' then
    fallos := fallos || '[107] el evento creado no registra al tecnico; ';
  end if;
  if (select rol_actor from public.cambio_eventos where cambio_id = v_c.id and evento = 'aprobado') <> 'jefe' then fallos := fallos || '[107] el evento aprobado no registra el rol jefe; '; end if;

  -- rechazar: motivo obligatorio
  v_c2 := public.crear_cambio_nucleo('Cambio a rechazar', 'normal', 'bajo', 's107c', 'd', 'Plan', now() + interval '1 day', now() + interval '2 days', true, v_tec, false);
  if v_c2.estado <> 'solicitado' then fallos := fallos || '[107] crear con p_enviar no dejo el cambio solicitado; '; end if;
  begin perform public.rechazar_cambio_nucleo(v_c2.id, '   ', v_jefe, true); fallos := fallos || '[107] se rechazo sin motivo; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%motivo es obligatorio%' then fallos := fallos || '[107] rechazar sin motivo: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  v_c2 := public.rechazar_cambio_nucleo(v_c2.id, 'Ventana en cierre contable', v_jefe, true);
  if v_c2.estado <> 'rechazado' or v_c2.resultado <> 'Ventana en cierre contable' then fallos := fallos || '[107] el rechazo no guardo su motivo; '; end if;

  -- cancelar: sin motivo solo desde borrador
  v_c3 := public.crear_cambio_nucleo('Cambio a cancelar', 'normal', 'bajo', 's107c', 'd', null, null, null, false, v_tec, false);
  v_c3 := public.transicionar_cambio_nucleo(v_c3.id, 'cancelado', null, v_tec, false);
  if v_c3.estado <> 'cancelado' then fallos := fallos || '[107] un borrador no se cancelo sin motivo; '; end if;
  v_c3 := public.crear_cambio_nucleo('Cambio a cancelar 2', 'normal', 'bajo', 's107c', 'd', 'Plan', now() + interval '1 day', now() + interval '2 days', true, v_tec, false);
  begin perform public.transicionar_cambio_nucleo(v_c3.id, 'cancelado', null, v_tec, false); fallos := fallos || '[107] se cancelo un solicitado sin motivo; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%motivo es obligatorio%' then fallos := fallos || '[107] cancelar sin motivo: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  v_c3 := public.transicionar_cambio_nucleo(v_c3.id, 'cancelado', 'Ya no se necesita', v_tec, false);

  -- revertir: motivo obligatorio, desde en_ejecucion o implementado
  v_c4 := public.crear_cambio_nucleo('Cambio a revertir', 'normal', 'medio', 's107c', 'd', 'Plan', now() + interval '1 day', now() + interval '2 days', true, v_tec, false);
  v_c4 := public.aprobar_cambio_nucleo(v_c4.id, null, v_jefe, true);
  v_c4 := public.transicionar_cambio_nucleo(v_c4.id, 'en_ejecucion', null, v_tec, false);
  v_c4 := public.transicionar_cambio_nucleo(v_c4.id, 'implementado', null, v_tec, false);
  begin perform public.transicionar_cambio_nucleo(v_c4.id, 'revertido', null, v_tec, false); fallos := fallos || '[107] se revirtio sin motivo; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%motivo es obligatorio%' then fallos := fallos || '[107] revertir sin motivo: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  v_c4 := public.transicionar_cambio_nucleo(v_c4.id, 'revertido', 'Degrado la red de obra', v_tec, false);
  if v_c4.estado <> 'revertido' or v_c4.resultado <> 'Degrado la red de obra' then fallos := fallos || '[107] la reversion no guardo su motivo; '; end if;

  -- estandar: se envia y queda preautorizado, sin plan de retroceso y sin aprobador
  v_est := public.crear_cambio_nucleo('Rotacion de respaldos', 'estandar', 'bajo', 's107c', 'Rutina mensual', null, now() + interval '1 day', now() + interval '1 day 1 hour', true, v_tec, false);
  if v_est.estado <> 'aprobado' or v_est.aprobado_por is not null then fallos := fallos || '[107] el estandar no quedo preautorizado; '; end if;
  if not exists (select 1 from public.cambio_eventos where cambio_id = v_est.id and evento = 'aprobado' and detalle like '%preautorizado%') then
    fallos := fallos || '[107] el libro no dice que el estandar es preautorizado; ';
  end if;
  begin perform public.crear_cambio_nucleo('Estandar sin ventana', 'estandar', 'bajo', 's107c', 'd', null, null, null, true, v_tec, false); fallos := fallos || '[107] se envio un estandar sin ventana; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%ventana%' then fallos := fallos || '[107] estandar sin ventana: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;

  -- transicion de un cambio inexistente y estado de destino inventado
  begin perform public.transicionar_cambio_nucleo(gen_random_uuid(), 'solicitado', null, v_tec, false); fallos := fallos || '[107] transicionar un inexistente no fallo; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[107] transicionar inexistente lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.transicionar_cambio_nucleo(v_est.id, 'inventado', null, v_tec, false); fallos := fallos || '[107] se acepto un estado de destino inventado; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%destino no es v%' then fallos := fallos || '[107] destino inventado: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;

  -- vincular / desvincular tickets
  insert into public.tickets (codigo, token, titulo, descripcion, estado)
    values ('__TESTCI-107C__', '__test_ci_107c_token__', 'Test CI 107c', 'Ticket de prueba', 'abierto') returning id into v_t;
  v_vinc := public.vincular_cambio_ticket_nucleo(v_c.id, v_t, v_tec, false);
  if v_vinc.cambio_id <> v_c.id or v_vinc.ticket_id <> v_t or v_vinc.vinculado_por is distinct from v_tec then fallos := fallos || '[107] el enlace no se registro bien; '; end if;
  v_vinc := public.vincular_cambio_ticket_nucleo(v_c.id, v_t, v_tec, false);
  select count(*) into v_n from public.cambio_tickets where cambio_id = v_c.id;
  if v_n <> 1 then fallos := fallos || '[107] vincular dos veces duplico el enlace; '; end if;
  select count(*) into v_n from public.cambio_eventos where cambio_id = v_c.id and evento = 'ticket_vinculado';
  if v_n <> 1 then fallos := fallos || '[107] vincular dos veces repitio el evento; '; end if;
  v_vinc := public.vincular_cambio_ticket_nucleo(v_c4.id, v_t, v_jefe, true);
  select count(*) into v_n from public.cambio_tickets where ticket_id = v_t;
  if v_n <> 2 then fallos := fallos || '[107] un ticket debe poder enlazar varios cambios; '; end if;
  begin perform public.vincular_cambio_ticket_nucleo(v_c.id, gen_random_uuid(), v_tec, false); fallos := fallos || '[107] se enlazo un ticket inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[107] ticket inexistente lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.vincular_cambio_ticket_nucleo(gen_random_uuid(), v_t, v_tec, false); fallos := fallos || '[107] se enlazo a un cambio inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[107] cambio inexistente lanzo ' || sqlstate || '; '; end if; end;
  v_ok := public.desvincular_cambio_ticket_nucleo(v_c.id, v_t, v_tec, false);
  if v_ok is distinct from true then fallos := fallos || '[107] desvincular no devolvio true; '; end if;
  v_ok := public.desvincular_cambio_ticket_nucleo(v_c.id, v_t, v_tec, false);
  if v_ok is distinct from false then fallos := fallos || '[107] desvincular dos veces no devolvio false; '; end if;
  select count(*) into v_n from public.cambio_eventos where cambio_id = v_c.id and evento = 'ticket_desvinculado';
  if v_n <> 1 then fallos := fallos || '[107] desvincular debia dejar un solo evento; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [107c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [107c]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 107-d: emergencia (ejecucion sin aprobacion previa, plazo de 48 h, aprobacion
-- a posteriori, no cierra sin ella), vistas v_cambios_aprobacion_vencida y
-- v_kpi_cambios (security_invoker) y cambio_id de schema_migrations y
-- function_deploys
-- ------------------------------------------------------------
do $$
declare
  v_jefe uuid;
  v_tec uuid;
  v_e public.cambios;
  v_e2 public.cambios;
  v_e3 public.cambios;
  v_nor public.cambios;
  v_opts text[];
  v_k record;
  v_n int;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_107d_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_107d_tec@example.test') returning id into v_tec;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  update public.staff set activo = true where user_id = v_tec;
  update public.servicios set deleted_at = now() where deleted_at is null;
  insert into public.servicios (id, nombre) values ('s107d', '__TEST_CI__ Servicio 107d');

  -- la emergencia tambien necesita plan de retroceso, pero no ventana
  begin perform public.crear_cambio_nucleo('Caida del enlace', 'emergencia', 'alto', 's107d', 'Sin internet', null, null, null, true, v_tec, false); fallos := fallos || '[107] se envio una emergencia sin plan de retroceso; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%plan de retroceso%' then fallos := fallos || '[107] emergencia sin plan: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  v_e := public.crear_cambio_nucleo('Caida del enlace', 'emergencia', 'alto', 's107d', 'Sin internet', 'Volver al enlace de respaldo', null, null, true, v_tec, false);
  if v_e.estado <> 'solicitado' then fallos := fallos || '[107] la emergencia enviada no quedo solicitada; '; end if;

  -- se ejecuta sin esperar al jefe: plazo de 48 horas
  v_e := public.transicionar_cambio_nucleo(v_e.id, 'en_ejecucion', null, v_tec, false);
  if v_e.estado <> 'en_ejecucion' or v_e.aprobado_por is not null then fallos := fallos || '[107] la emergencia no se ejecuto sin aprobacion previa; '; end if;
  if v_e.aprobacion_pendiente_hasta is distinct from now() + interval '48 hours' then fallos := fallos || '[107] el plazo de aprobacion no es de 48 horas: ' || coalesce(v_e.aprobacion_pendiente_hasta::text, 'NULL') || '; '; end if;
  if not exists (select 1 from public.cambio_eventos where cambio_id = v_e.id and evento = 'iniciado' and detalle like '%Emergencia sin aprobaci%') then
    fallos := fallos || '[107] el libro no avisa que la emergencia corre sin aprobacion; ';
  end if;

  -- la vista de vencidas solo la lista pasado el plazo
  if exists (select 1 from public.v_cambios_aprobacion_vencida where cambio_id = v_e.id) then fallos := fallos || '[107] una emergencia dentro del plazo figura como vencida; '; end if;
  update public.cambios set aprobacion_pendiente_hasta = now() - interval '2 hours' where id = v_e.id;
  select * into v_k from public.v_cambios_aprobacion_vencida where cambio_id = v_e.id;
  if v_k.cambio_id is null or v_k.codigo <> v_e.codigo or v_k.servicio <> '__TEST_CI__ Servicio 107d' or v_k.vencida_hace < interval '1 hour' then
    fallos := fallos || '[107] la emergencia vencida no figura en la vista con sus datos; ';
  end if;
  select emergencias_sin_aprobar_vencidas, total_90d into v_k from public.v_kpi_cambios where tipo = 'emergencia';
  if v_k.emergencias_sin_aprobar_vencidas < 1 or v_k.total_90d < 1 then fallos := fallos || '[107] v_kpi_cambios no cuenta la emergencia vencida; '; end if;

  -- no se cierra sin la aprobacion a posteriori
  v_e := public.transicionar_cambio_nucleo(v_e.id, 'implementado', 'Enlace restablecido', v_tec, false);
  begin perform public.transicionar_cambio_nucleo(v_e.id, 'cerrado', null, v_jefe, true); fallos := fallos || '[107] una emergencia sin aprobar se cerro; ';
  exception when others then if sqlerrm not like '%aprobaci_n a posteriori%' then fallos := fallos || '[107] cerrar la emergencia: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  begin perform public.aprobar_cambio_nucleo(v_e.id, null, v_tec, false); fallos := fallos || '[107] un tecnico dio la aprobacion a posteriori; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%Solo un jefe%' then fallos := fallos || '[107] aprobacion a posteriori como tecnico: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;

  -- aprobacion a posteriori: sin cambio de estado, limpia el plazo, deja su evento
  v_e := public.aprobar_cambio_nucleo(v_e.id, 'Se entiende la urgencia', v_jefe, true);
  if v_e.estado <> 'implementado' or v_e.aprobado_por is distinct from v_jefe or v_e.aprobado_at is null or v_e.aprobacion_pendiente_hasta is not null then
    fallos := fallos || '[107] la aprobacion a posteriori no quedo bien registrada; ';
  end if;
  if not exists (select 1 from public.cambio_eventos where cambio_id = v_e.id and evento = 'aprobado' and rol_actor = 'jefe' and detalle like '%a posteriori%') then
    fallos := fallos || '[107] el libro no registra la aprobacion a posteriori; ';
  end if;
  if exists (select 1 from public.v_cambios_aprobacion_vencida where cambio_id = v_e.id) then fallos := fallos || '[107] una emergencia aprobada sigue como vencida; '; end if;
  begin perform public.aprobar_cambio_nucleo(v_e.id, null, v_jefe, true); fallos := fallos || '[107] se aprobo dos veces la emergencia; ';
  exception when others then if sqlstate <> 'P0001' then fallos := fallos || '[107] doble aprobacion de emergencia lanzo ' || sqlstate || '; '; end if; end;
  v_e := public.transicionar_cambio_nucleo(v_e.id, 'cerrado', null, v_tec, false);
  if v_e.estado <> 'cerrado' then fallos := fallos || '[107] la emergencia aprobada no cerro; '; end if;

  -- emergencia aprobada ANTES de ejecutarse: sin plazo pendiente
  v_e2 := public.crear_cambio_nucleo('Fuga en el cuarto de equipos', 'emergencia', 'medio', 's107d', 'Fuga', 'Apagar y aislar', null, null, true, v_tec, false);
  v_e2 := public.aprobar_cambio_nucleo(v_e2.id, null, v_jefe, true);
  v_e2 := public.transicionar_cambio_nucleo(v_e2.id, 'en_ejecucion', null, v_tec, false);
  if v_e2.aprobacion_pendiente_hasta is not null then fallos := fallos || '[107] una emergencia ya aprobada tiene plazo pendiente; '; end if;

  -- desde borrador: solo la emergencia se ejecuta directo, y la revertida sale de la vista
  v_e3 := public.crear_cambio_nucleo('Emergencia desde borrador', 'emergencia', 'alto', 's107d', 'Urgente', 'Revertir', null, null, false, v_tec, false);
  v_e3 := public.transicionar_cambio_nucleo(v_e3.id, 'en_ejecucion', null, v_tec, false);
  if v_e3.aprobacion_pendiente_hasta is null then fallos := fallos || '[107] la emergencia desde borrador no registro su plazo; '; end if;
  v_nor := public.crear_cambio_nucleo('Normal desde borrador', 'normal', 'bajo', 's107d', 'd', 'Plan', now() + interval '1 day', now() + interval '2 days', false, v_tec, false);
  begin perform public.transicionar_cambio_nucleo(v_nor.id, 'en_ejecucion', null, v_tec, false); fallos := fallos || '[107] un normal en borrador se ejecuto; ';
  exception when others then if sqlstate <> 'P0001' or sqlerrm not like '%no puede pasar%' then fallos := fallos || '[107] normal borrador -> en_ejecucion: ' || sqlstate || ' ' || sqlerrm || '; '; end if; end;
  update public.cambios set aprobacion_pendiente_hasta = now() - interval '1 hour' where id = v_e3.id;
  if not exists (select 1 from public.v_cambios_aprobacion_vencida where cambio_id = v_e3.id) then fallos := fallos || '[107] la emergencia vencida de prueba no figura; '; end if;
  v_e3 := public.transicionar_cambio_nucleo(v_e3.id, 'revertido', 'Empeoro la caida', v_tec, false);
  if exists (select 1 from public.v_cambios_aprobacion_vencida where cambio_id = v_e3.id) then fallos := fallos || '[107] una emergencia revertida sigue como vencida; '; end if;

  -- v_kpi_cambios: siempre las tres filas, porcentajes coherentes, security_invoker, sin anon
  select count(*) into v_n from public.v_kpi_cambios;
  if v_n <> 3 then fallos := fallos || '[107] v_kpi_cambios debe devolver 3 filas y devuelve ' || v_n || '; '; end if;
  select count(*) into v_n from public.v_kpi_cambios where tipo in ('estandar', 'normal', 'emergencia');
  if v_n <> 3 then fallos := fallos || '[107] v_kpi_cambios no cubre los tres tipos; '; end if;
  if (select sum(total_90d) from public.v_kpi_cambios) > 0
     and (select sum(pct_del_total_90d) from public.v_kpi_cambios) not between 99 and 101 then
    fallos := fallos || '[107] los porcentajes de v_kpi_cambios no suman 100; ';
  end if;
  select pct_revertidos_90d, revertidos_90d, ejecutados_90d into v_k from public.v_kpi_cambios where tipo = 'emergencia';
  if v_k.revertidos_90d < 1 or v_k.pct_revertidos_90d <= 0 or v_k.ejecutados_90d < v_k.revertidos_90d then fallos := fallos || '[107] v_kpi_cambios no cuenta la reversion; '; end if;
  select reloptions into v_opts from pg_class where oid = 'public.v_kpi_cambios'::regclass;
  if v_opts is null or not ('security_invoker=true' = any (v_opts)) then fallos := fallos || '[107] v_kpi_cambios no es security_invoker; '; end if;
  select reloptions into v_opts from pg_class where oid = 'public.v_cambios_aprobacion_vencida'::regclass;
  if v_opts is null or not ('security_invoker=true' = any (v_opts)) then fallos := fallos || '[107] v_cambios_aprobacion_vencida no es security_invoker; '; end if;
  if has_table_privilege('anon', 'public.v_kpi_cambios', 'select') or has_table_privilege('anon', 'public.v_cambios_aprobacion_vencida', 'select')
     or not has_table_privilege('authenticated', 'public.v_kpi_cambios', 'select') or not has_table_privilege('authenticated', 'public.v_cambios_aprobacion_vencida', 'select') then
    fallos := fallos || '[107] privilegios de las vistas de cambios incorrectos; ';
  end if;

  -- cambio_id en el tracking de despliegues: forma CHG-####, sin FK
  insert into public.schema_migrations (version, nombre_archivo, checksum, aplicada_por, cambio_id)
    values ('__t107ok', '__t107ok.sql', 'abc', 'test', 'CHG-0001');
  insert into public.schema_migrations (version, nombre_archivo, checksum, aplicada_por, cambio_id)
    values ('__t107ig', '__t107ig.sql', 'abc', 'test', 'CHG-12345');
  insert into public.schema_migrations (version, nombre_archivo, checksum, aplicada_por)
    values ('__t107nu', '__t107nu.sql', 'abc', 'test');
  begin insert into public.schema_migrations (version, nombre_archivo, checksum, aplicada_por, cambio_id) values ('__t107ko', '__t107ko.sql', 'abc', 'test', 'chg-1');
    fallos := fallos || '[107] schema_migrations admitio un cambio_id mal formado; ';
  exception when check_violation then null; end;
  insert into public.function_deploys (funcion, sha256, cambio_id) values ('__t107', 'abc', 'CHG-0002');
  begin insert into public.function_deploys (funcion, sha256, cambio_id) values ('__t107', 'abc', 'CHG-1'); fallos := fallos || '[107] function_deploys admitio un cambio_id de 1 digito; ';
  exception when check_violation then null; end;

  if fallos = '' then
    raise exception 'TESTS_OK [107d] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [107d]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 109-a: portal del empleado (esquema) — tabla, CHECK, privilegios por columna,
-- EXECUTE de las RPC, un solo enlace activo, guard 42501 sin sesion, trigger de
-- empleados que revoca al pasar a no-Activo y retencion (112) de los enlaces
-- muertos. La emision con sesion real y el guard de asignaciones para
-- authenticated se prueban en scripts/sql-local/verificar-migraciones.mjs (S16).
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_emp uuid;
  v_enl1 uuid;
  v_enl2 uuid;
  v_res jsonb;
  v_n int;
  v_tipo text;
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 109a') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 109a', '99010901', v_empresa) returning id into v_emp;

  -- tabla, RLS, policy, indice unico parcial
  if not (select relrowsecurity from pg_class where oid = 'public.empleado_enlaces'::regclass) then fallos := fallos || '[109] empleado_enlaces sin RLS; '; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'empleado_enlaces';
  if v_n <> 1 then fallos := fallos || '[109] se esperaba 1 policy en empleado_enlaces y hay ' || v_n || '; '; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'uq_empleado_enlaces_uno_activo' and indexdef like '%revocado_at IS NULL%') then
    fallos := fallos || '[109] falta el indice unico parcial de un enlace activo por empleado; ';
  end if;

  -- privilegios: el rol authenticated no lee el hash ni la IP y no escribe nada
  if has_column_privilege('authenticated', 'public.empleado_enlaces', 'token_hash', 'select')
     or has_column_privilege('authenticated', 'public.empleado_enlaces', 'ultimo_ip', 'select') then
    fallos := fallos || '[109] authenticated puede leer token_hash o ultimo_ip; ';
  end if;
  if not has_column_privilege('authenticated', 'public.empleado_enlaces', 'expires_at', 'select')
     or not has_column_privilege('authenticated', 'public.empleado_enlaces', 'revocado_at', 'select') then
    fallos := fallos || '[109] authenticated no lee las columnas no secretas; ';
  end if;
  if has_table_privilege('authenticated', 'public.empleado_enlaces', 'insert') or has_table_privilege('authenticated', 'public.empleado_enlaces', 'update')
     or has_table_privilege('authenticated', 'public.empleado_enlaces', 'delete') or has_table_privilege('anon', 'public.empleado_enlaces', 'select') then
    fallos := fallos || '[109] privilegios de tabla de empleado_enlaces demasiado abiertos; ';
  end if;

  -- EXECUTE
  if has_function_privilege('anon', 'public.portal_abrir(text,text)', 'execute') or has_function_privilege('authenticated', 'public.portal_abrir(text,text)', 'execute')
     or has_function_privilege('anon', 'public.portal_confirmar_equipo(text,uuid,text)', 'execute') or has_function_privilege('authenticated', 'public.portal_confirmar_equipo(text,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.portal_resolver_enlace(text)', 'execute') or has_function_privilege('authenticated', 'public.portal_resolver_enlace(text)', 'execute')
     or not has_function_privilege('project_admin', 'public.portal_abrir(text,text)', 'execute') then
    fallos := fallos || '[109] portal_abrir / confirmar / resolver deben ser solo de project_admin; ';
  end if;
  if has_function_privilege('anon', 'public.portal_emitir_enlace(uuid,text[],integer)', 'execute') or has_function_privilege('anon', 'public.portal_revocar_enlace(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.portal_emitir_enlace(uuid,text[],integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.portal_revocar_enlace(uuid)', 'execute') then
    fallos := fallos || '[109] EXECUTE de portal_emitir_enlace / portal_revocar_enlace incorrecto; ';
  end if;

  -- guard: sin sesion de staff, emitir y revocar son 42501
  begin perform public.portal_emitir_enlace(v_emp); fallos := fallos || '[109] emitir sin sesion no fue rechazado; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[109] emitir sin sesion lanzo ' || sqlstate || '; '; end if; end;
  begin perform public.portal_revocar_enlace(v_emp); fallos := fallos || '[109] revocar sin sesion no fue rechazado; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[109] revocar sin sesion lanzo ' || sqlstate || '; '; end if; end;

  -- CHECK de la tabla
  begin insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values (v_emp, 'no-es-un-hash', array['ver_equipos'], now() + interval '1 day');
    fallos := fallos || '[109] admitio un token_hash mal formado; '; exception when check_violation then null; end;
  begin insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values (v_emp, repeat('a', 64), array[]::text[], now() + interval '1 day');
    fallos := fallos || '[109] admitio un alcance vacio; '; exception when check_violation then null; end;
  begin insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values (v_emp, repeat('a', 64), array['confirmar_ticket'], now() + interval '1 day');
    fallos := fallos || '[109] admitio el alcance confirmar_ticket (pendiente de V2); '; exception when check_violation then null; end;
  begin insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values (v_emp, repeat('a', 64), array['ver_equipos', 'inventado'], now() + interval '1 day');
    fallos := fallos || '[109] admitio un alcance desconocido; '; exception when check_violation then null; end;

  -- un solo enlace activo por empleado
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values (v_emp, repeat('b', 64), array['ver_equipos'], now() + interval '1 day') returning id into v_enl1;
  begin insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values (v_emp, repeat('c', 64), array['ver_equipos'], now() + interval '1 day');
    fallos := fallos || '[109] admitio dos enlaces sin revocar para el mismo empleado; '; exception when unique_violation then null; end;
  update public.empleado_enlaces set revocado_at = now() where id = v_enl1;
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values (v_emp, repeat('c', 64), array['ver_equipos'], now() + interval '1 day') returning id into v_enl2;
  begin insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values (v_emp, repeat('c', 64), array['ver_equipos'], now() + interval '1 day');
    fallos := fallos || '[109] admitio un token_hash repetido; '; exception when unique_violation then null; end;

  -- pasar a Suspendido revoca el enlace; reactivar no lo revive
  perform public.empleado_suspender_interno(v_emp, 'Prueba 109');
  if (select revocado_at from public.empleado_enlaces where id = v_enl2) is null then fallos := fallos || '[109] suspender no revoco el enlace; '; end if;
  perform public.empleado_reactivar_interno(v_emp, 'Prueba 109');
  if (select revocado_at from public.empleado_enlaces where id = v_enl2) is null then fallos := fallos || '[109] reactivar revivio el enlace; '; end if;

  -- retencion (112): la regla existe y la purga borra solo los enlaces muertos hace mas de 30 dias
  select tabla into v_tipo from public.config_retencion where tabla = 'empleado_enlaces' and dias = 30 and accion = 'borrar';
  if v_tipo is null then fallos := fallos || '[109] falta la regla de retencion de empleado_enlaces; '; end if;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 109a Dos', '99010902', v_empresa) returning id into v_enl1;
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at, created_at, revocado_at)
    values (v_enl1, repeat('d', 64), array['ver_equipos'], now() - interval '50 days', now() - interval '60 days', null);
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at, created_at, revocado_at)
    values (v_emp, repeat('e', 64), array['ver_equipos'], now() + interval '5 days', now() - interval '2 days', now() - interval '40 days');
  v_res := public.purgar_datos_temporales();
  if coalesce((v_res -> 'tablas' ->> 'empleado_enlaces')::int, -1) < 2 then fallos := fallos || '[109] la purga no borro los enlaces muertos: ' || coalesce((v_res -> 'tablas' ->> 'empleado_enlaces'), 'sin entrada') || '; '; end if;
  if exists (select 1 from public.empleado_enlaces where token_hash in (repeat('d', 64), repeat('e', 64))) then fallos := fallos || '[109] quedaron enlaces muertos tras la purga; '; end if;
  if not exists (select 1 from public.empleado_enlaces where id = v_enl2) then fallos := fallos || '[109] la purga borro un enlace revocado hace poco; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [109a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [109a]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 109-b: portal_abrir — respuesta unica ante un token invalido, alcance, datos
-- minimos (nunca contrasena, URL ni notas), aislamiento entre empleados,
-- conteo de usos y auditoria
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_cuenta_a uuid;
  v_cuenta_b uuid;
  v_eq1 uuid;
  v_eq2 uuid;
  v_eq3 uuid;
  v_eq4 uuid;
  v_enl uuid;
  v_res jsonb;
  v_txt text;
  v_n int;
  v_nada constant jsonb := '{"ok": false, "code": "no_existe"}'::jsonb;
  c_tok constant text := 'T109bAAAAAAAAAAAAAAAAAAA';
  c_tok_acc constant text := 'T109bBBBBBBBBBBBBBBBBBBB';
  c_tok_venc constant text := 'T109bCCCCCCCCCCCCCCCCCCC';
  c_tok_rev constant text := 'T109bDDDDDDDDDDDDDDDDDDD';
  c_tok_inact constant text := 'T109bEEEEEEEEEEEEEEEEEEE';
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 109b') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Rosa', 'CI 109b', '99010911', v_empresa) returning id into v_a;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Otro', 'CI 109b Ajeno', '99010912', v_empresa) returning id into v_b;

  insert into public.plataformas (id, nombre) values ('__test_ci_109b__', '__TEST_CI__ Plataforma 109b');
  insert into public.cuentas (plataforma_id, usuario, password, url, notas, tipo_cuenta)
    values ('__test_ci_109b__', 'rosa109b@correo.test', 'enc2:SECRETO109:SECRETO109', 'https://secreto109.example/acceso', 'NOTA-SECRETA-109', 'personal') returning id into v_cuenta_a;
  insert into public.cuentas (plataforma_id, usuario, password, tipo_cuenta)
    values ('__test_ci_109b__', 'ajeno109b@correo.test', 'enc2:AJENO109:AJENO109', 'personal') returning id into v_cuenta_b;
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_cuenta_a, v_a), (v_cuenta_b, v_b);

  insert into public.tipos_equipo (id, nombre) values ('__test_ci_109b__', '__TEST_CI__ Tipo 109b');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_109B1__', '__test_ci_109b__') returning id into v_eq1;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_109B2__', '__test_ci_109b__') returning id into v_eq2;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_109B3__', '__test_ci_109b__') returning id into v_eq3;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_109B4__', '__test_ci_109b__') returning id into v_eq4;
  insert into public.asignaciones_equipo (equipo_id, empleado_id, condicion_entrega) values (v_eq1, v_a, 'Nuevo, con funda'), (v_eq2, v_a, null), (v_eq3, v_b, null);
  -- un equipo devuelto no aparece
  insert into public.asignaciones_equipo (equipo_id, empleado_id, fecha_inicio, fecha_fin, motivo_cierre)
    values (v_eq4, v_a, current_date - 30, current_date - 10, 'devolucion');

  insert into public.tickets (codigo, token, titulo, descripcion, empleado_id, estado) values
    ('__TESTCI-109B1__', 'tk109bAAAAAAAAAAAAAAAAAA', '__TEST_CI__ Ticket abierto de Rosa', 'd', v_a, 'abierto'),
    ('__TESTCI-109B2__', 'tk109bBBBBBBBBBBBBBBBBBB', '__TEST_CI__ Ticket cerrado de Rosa', 'd', v_a, 'cerrado'),
    ('__TESTCI-109B3__', 'tk109bCCCCCCCCCCCCCCCCCC', '__TEST_CI__ Ticket del ajeno', 'd', v_b, 'abierto');

  -- enlaces: completo (A), solo accesos (B), vencido, revocado y de un empleado Inactivo
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at)
    values (v_a, encode(sha256(convert_to(c_tok, 'UTF8')), 'hex'), array['ver_accesos', 'ver_equipos', 'ver_tickets', 'confirmar_equipo'], now() + interval '3 days') returning id into v_enl;
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at)
    values (v_b, encode(sha256(convert_to(c_tok_acc, 'UTF8')), 'hex'), array['ver_accesos'], now() + interval '3 days');
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Venc', 'CI 109b', '99010913', v_empresa) returning id into v_c;
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at, created_at)
    values (v_c, encode(sha256(convert_to(c_tok_venc, 'UTF8')), 'hex'), array['ver_equipos'], now() - interval '1 day', now() - interval '8 days');
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Rev', 'CI 109b', '99010914', v_empresa) returning id into v_c;
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at, revocado_at)
    values (v_c, encode(sha256(convert_to(c_tok_rev, 'UTF8')), 'hex'), array['ver_equipos'], now() + interval '3 days', now());
  insert into public.empleados (nombres, apellidos, dni, empresa_id, estado) values ('Inact', 'CI 109b', '99010915', v_empresa, 'Inactivo') returning id into v_c;
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at)
    values (v_c, encode(sha256(convert_to(c_tok_inact, 'UTF8')), 'hex'), array['ver_equipos'], now() + interval '3 days');

  -- SIN ORACULO: inexistente, mal formado, nulo, vencido, revocado e inactivo dan exactamente lo mismo
  if public.portal_abrir('T109bZZZZZZZZZZZZZZZZZZZ') is distinct from v_nada then fallos := fallos || '[109] token inexistente: respuesta distinta; '; end if;
  if public.portal_abrir('corto') is distinct from v_nada then fallos := fallos || '[109] token mal formado: respuesta distinta; '; end if;
  if public.portal_abrir(null) is distinct from v_nada then fallos := fallos || '[109] token nulo: respuesta distinta; '; end if;
  if public.portal_abrir(c_tok_venc) is distinct from v_nada then fallos := fallos || '[109] token vencido: respuesta distinta; '; end if;
  if public.portal_abrir(c_tok_rev) is distinct from v_nada then fallos := fallos || '[109] token revocado: respuesta distinta; '; end if;
  if public.portal_abrir(c_tok_inact) is distinct from v_nada then fallos := fallos || '[109] empleado Inactivo: respuesta distinta; '; end if;
  if public.portal_abrir(c_tok || 'x') is distinct from v_nada or public.portal_abrir(lower(c_tok)) is distinct from v_nada then fallos := fallos || '[109] token alterado: respuesta distinta; '; end if;
  -- el hash en hexadecimal NO sirve como token
  if public.portal_abrir(encode(sha256(convert_to(c_tok, 'UTF8')), 'hex')) is distinct from v_nada then fallos := fallos || '[109] el hash sirvio como token; '; end if;

  -- apertura valida
  v_res := public.portal_abrir(c_tok, '203.0.113.7');
  v_txt := v_res::text;
  if (v_res ->> 'ok')::boolean is not true then fallos := fallos || '[109] el token valido no abre: ' || v_txt || '; '; end if;
  if v_res ->> 'nombre' <> 'Rosa CI 109b' then fallos := fallos || '[109] nombre inesperado: ' || coalesce(v_res ->> 'nombre', 'null') || '; '; end if;
  if jsonb_array_length(v_res -> 'equipos') <> 2 then fallos := fallos || '[109] se esperaban 2 equipos vigentes y hay ' || jsonb_array_length(v_res -> 'equipos') || '; '; end if;
  if jsonb_array_length(v_res -> 'accesos') <> 1 then fallos := fallos || '[109] se esperaba 1 acceso; '; end if;
  if jsonb_array_length(v_res -> 'tickets') <> 1 then fallos := fallos || '[109] se esperaba 1 ticket activo; '; end if;
  -- forma exacta de cada renglon
  if (select array_agg(k order by k) from jsonb_object_keys((v_res -> 'accesos') -> 0) k) is distinct from array['plataforma', 'usuario'] then
    fallos := fallos || '[109] un acceso expone mas que plataforma y usuario; ';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys((v_res -> 'equipos') -> 0) k) is distinct from array['asignacion_id', 'codigo', 'condicion', 'confirmado_at', 'entregado', 'tipo'] then
    fallos := fallos || '[109] un equipo expone otras claves; ';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys((v_res -> 'tickets') -> 0) k) is distinct from array['codigo', 'creado', 'estado', 'titulo'] then
    fallos := fallos || '[109] un ticket expone otras claves; ';
  end if;
  -- NADA secreto ni ajeno en TODO el texto de la respuesta
  if v_txt like '%SECRETO109%' or v_txt like '%enc2:%' or v_txt like '%secreto109.example%' or v_txt like '%NOTA-SECRETA-109%' or v_txt like '%password%' then
    fallos := fallos || '[109] la respuesta filtra contrasena, URL o notas; ';
  end if;
  if v_txt like '%ajeno109b%' or v_txt like '%AJENO109%' or v_txt like '%109B3%' or v_txt like '%Ajeno%' or v_txt like '%tk109b%' then
    fallos := fallos || '[109] la respuesta incluye datos de otro empleado o el token de un ticket; ';
  end if;
  if v_txt like '%99010911%' then fallos := fallos || '[109] la respuesta incluye el DNI; '; end if;
  if v_txt not like '%Nuevo, con funda%' or v_txt not like '%rosa109b@correo.test%' or v_txt not like '%TESTCI-109B1%' then fallos := fallos || '[109] faltan los datos propios en la respuesta; '; end if;
  if v_txt like '%Ticket cerrado%' then fallos := fallos || '[109] aparece un ticket cerrado; '; end if;

  -- usos, ultimo uso, IP y auditoria (una fila por hora)
  select usos into v_n from public.empleado_enlaces where id = v_enl;
  if v_n <> 1 or (select ultimo_uso_at from public.empleado_enlaces where id = v_enl) is null or (select ultimo_ip from public.empleado_enlaces where id = v_enl) <> '203.0.113.7' then
    fallos := fallos || '[109] no se registro el uso del enlace; ';
  end if;
  perform public.portal_abrir(c_tok, '203.0.113.7');
  select usos into v_n from public.empleado_enlaces where id = v_enl;
  if v_n <> 2 then fallos := fallos || '[109] el segundo uso no se conto (' || v_n || '); '; end if;
  select count(*) into v_n from public.accesos_log where accion = 'portal_abierto' and cuenta_usuario = '(portal)' and detalle = 'Portal abierto por Rosa CI 109b';
  if v_n <> 1 then fallos := fallos || '[109] portal_abierto debe auditarse una vez por hora y hay ' || v_n || '; '; end if;
  if exists (select 1 from public.accesos_log where accion = 'portal_abierto' and (detalle like '%' || c_tok || '%')) then fallos := fallos || '[109] el token quedo en la auditoria; '; end if;

  -- alcance acotado: solo accesos, y solo los del dueño del enlace
  v_res := public.portal_abrir(c_tok_acc);
  if not (v_res ? 'accesos') or v_res ? 'equipos' or v_res ? 'tickets' then fallos := fallos || '[109] el alcance ver_accesos no acota la respuesta; '; end if;
  if v_res::text like '%rosa109b%' or v_res::text not like '%ajeno109b@correo.test%' then fallos := fallos || '[109] el enlace de otro empleado ve datos que no son suyos; '; end if;

  -- el empleado que pasa a Suspendido deja de abrir
  perform public.empleado_suspender_interno(v_a, 'Prueba 109b');
  if public.portal_abrir(c_tok) is distinct from v_nada then fallos := fallos || '[109] un empleado Suspendido sigue abriendo el portal; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [109b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [109b]: %', fallos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 109-c: portal_confirmar_equipo — solo equipos del propio empleado, idempotente,
-- evento recepcion_confirmada, alcance, token invalido y asignacion cerrada
-- ------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_a uuid;
  v_b uuid;
  v_eq_a uuid;
  v_eq_b uuid;
  v_eq_cer uuid;
  v_asig_a uuid;
  v_asig_b uuid;
  v_asig_cer uuid;
  v_enl uuid;
  v_res jsonb;
  v_res2 jsonb;
  v_ts timestamptz;
  v_n int;
  c_tok constant text := 'T109cAAAAAAAAAAAAAAAAAAA';
  c_tok_sin constant text := 'T109cBBBBBBBBBBBBBBBBBBB';
  fallos text := '';
begin
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 109c') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Ana', 'CI 109c', '99010921', v_empresa) returning id into v_a;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Beto', 'CI 109c', '99010922', v_empresa) returning id into v_b;
  insert into public.tipos_equipo (id, nombre) values ('__test_ci_109c__', '__TEST_CI__ Tipo 109c');
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_109CA__', '__test_ci_109c__') returning id into v_eq_a;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_109CB__', '__test_ci_109c__') returning id into v_eq_b;
  insert into public.equipos (codigo, tipo_id) values ('__TEST_CI_109CC__', '__test_ci_109c__') returning id into v_eq_cer;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_eq_a, v_a) returning id into v_asig_a;
  insert into public.asignaciones_equipo (equipo_id, empleado_id) values (v_eq_b, v_b) returning id into v_asig_b;
  insert into public.asignaciones_equipo (equipo_id, empleado_id, fecha_inicio, fecha_fin, motivo_cierre)
    values (v_eq_cer, v_a, current_date - 20, current_date - 5, 'devolucion') returning id into v_asig_cer;

  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at)
    values (v_a, encode(sha256(convert_to(c_tok, 'UTF8')), 'hex'), array['ver_equipos', 'confirmar_equipo'], now() + interval '2 days') returning id into v_enl;
  insert into public.empleado_enlaces (empleado_id, token_hash, alcance, expires_at)
    values (v_b, encode(sha256(convert_to(c_tok_sin, 'UTF8')), 'hex'), array['ver_equipos'], now() + interval '2 days');

  -- token invalido: la misma respuesta unica
  if public.portal_confirmar_equipo('T109cZZZZZZZZZZZZZZZZZZZ', v_asig_a) is distinct from '{"ok": false, "code": "no_existe"}'::jsonb
     or public.portal_confirmar_equipo(null, v_asig_a) is distinct from '{"ok": false, "code": "no_existe"}'::jsonb then
    fallos := fallos || '[109] confirmar con un token invalido no da no_existe; ';
  end if;

  -- sin el alcance confirmar_equipo
  if public.portal_confirmar_equipo(c_tok_sin, v_asig_b) is distinct from '{"ok": false, "code": "sin_alcance"}'::jsonb then fallos := fallos || '[109] sin alcance no da sin_alcance; '; end if;
  if (select confirmado_por_empleado_at from public.asignaciones_equipo where id = v_asig_b) is not null then fallos := fallos || '[109] se confirmo sin alcance; '; end if;

  -- un enlace NO confirma el equipo de otro empleado ni uno cerrado ni uno inexistente ni nulo
  if public.portal_confirmar_equipo(c_tok, v_asig_b) is distinct from '{"ok": false, "code": "no_encontrada"}'::jsonb then fallos := fallos || '[109] confirmo el equipo de otro empleado; '; end if;
  if (select confirmado_por_empleado_at from public.asignaciones_equipo where id = v_asig_b) is not null then fallos := fallos || '[109] el equipo ajeno quedo confirmado; '; end if;
  if public.portal_confirmar_equipo(c_tok, v_asig_cer) is distinct from '{"ok": false, "code": "no_encontrada"}'::jsonb then fallos := fallos || '[109] confirmo una asignacion cerrada; '; end if;
  if public.portal_confirmar_equipo(c_tok, gen_random_uuid()) is distinct from '{"ok": false, "code": "no_encontrada"}'::jsonb
     or public.portal_confirmar_equipo(c_tok, null) is distinct from '{"ok": false, "code": "no_encontrada"}'::jsonb then
    fallos := fallos || '[109] una asignacion inexistente no da no_encontrada; ';
  end if;

  -- confirmar la propia: fecha, enlace y evento
  v_res := public.portal_confirmar_equipo(c_tok, v_asig_a, '203.0.113.8');
  if (v_res ->> 'ok')::boolean is not true or (v_res ->> 'ya_confirmada')::boolean is not false then fallos := fallos || '[109] la confirmacion propia fallo: ' || v_res::text || '; '; end if;
  select confirmado_por_empleado_at into v_ts from public.asignaciones_equipo where id = v_asig_a;
  if v_ts is null or (select confirmacion_enlace_id from public.asignaciones_equipo where id = v_asig_a) is distinct from v_enl then fallos := fallos || '[109] no quedo la fecha o el enlace de la confirmacion; '; end if;
  select count(*) into v_n from public.eventos_equipo where equipo_id = v_eq_a and evento = 'recepcion_confirmada';
  if v_n <> 1 then fallos := fallos || '[109] se esperaba 1 evento recepcion_confirmada y hay ' || v_n || '; '; end if;
  if exists (select 1 from public.eventos_equipo where equipo_id = v_eq_a and evento = 'recepcion_confirmada' and (detalle like '%Ana%' or user_id is not null)) then fallos := fallos || '[109] el evento lleva el nombre o un actor; '; end if;

  -- idempotente: no cambia la fecha ni repite el evento
  v_res2 := public.portal_confirmar_equipo(c_tok, v_asig_a);
  if (v_res2 ->> 'ya_confirmada')::boolean is not true or (v_res2 ->> 'confirmado_at')::timestamptz is distinct from v_ts then fallos := fallos || '[109] la segunda confirmacion no es idempotente; '; end if;
  select count(*) into v_n from public.eventos_equipo where equipo_id = v_eq_a and evento = 'recepcion_confirmada';
  if v_n <> 1 then fallos := fallos || '[109] la segunda confirmacion repitio el evento; '; end if;

  -- y el portal la muestra
  if ((public.portal_abrir(c_tok) -> 'equipos' -> 0 ->> 'confirmado_at')::timestamptz) is distinct from v_ts then fallos := fallos || '[109] el portal no muestra la fecha confirmada; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [109c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [109c]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 113a — borrar a quien registró o aprobó un cambio (migración 113).
-- ============================================================
do $$
declare
  v_sol uuid;
  v_jefe uuid;
  v_c uuid;
  v_codigo text;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_113a_sol@example.test') returning id into v_sol;
  insert into auth.users (email) values ('__test_ci_113a_jefe@example.test') returning id into v_jefe;
  update public.servicios set deleted_at = now() where deleted_at is null;
  insert into public.servicios (id, nombre) values ('s113a', '__TEST_CI__ Servicio 113a');

  insert into public.cambios (titulo, tipo, riesgo, servicio_id, descripcion, solicitado_por, aprobado_por, aprobado_at)
    values ('__TEST_CI__ Estandar 113a', 'estandar', 'bajo', 's113a', 'Descripcion', v_sol, v_jefe, now())
    returning id, codigo into v_c, v_codigo;

  -- una aprobación sin fecha sigue prohibida
  begin
    update public.cambios set aprobado_at = null where id = v_c;
    fallos := fallos || '[113] se admitio un aprobado_por sin aprobado_at; ';
  exception when check_violation then null; end;

  -- borrar al solicitante y al aprobador ya no se bloquea
  begin delete from auth.users where id = v_sol;
  exception when others then fallos := fallos || '[113] no se pudo borrar al solicitante: ' || sqlerrm || '; '; end;
  begin delete from auth.users where id = v_jefe;
  exception when others then fallos := fallos || '[113] no se pudo borrar al aprobador: ' || sqlerrm || '; '; end;
  if exists (select 1 from public.cambios where id = v_c and (solicitado_por is not null or aprobado_por is not null)) then
    fallos := fallos || '[113] las claves foraneas no quedaron en NULL; ';
  end if;
  if exists (select 1 from public.cambios where id = v_c and aprobado_at is null) then
    fallos := fallos || '[113] se perdio la fecha de aprobacion; ';
  end if;

  -- el solicitante nunca pasa a otra persona, ni el codigo cambia
  begin update public.cambios set solicitado_por = gen_random_uuid() where id = v_c;
    fallos := fallos || '[113] se reasigno el solicitante a otro usuario; ';
  exception when others then null; end;
  begin update public.cambios set codigo = 'CHG-9999' where id = v_c;
    fallos := fallos || '[113] se cambio el codigo; ';
  exception when others then null; end;

  if fallos = '' then
    raise exception 'TESTS_OK [113a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [113a]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 114a — aviso al solicitante por categoría/subcategoría de ticket (migración 114):
-- blanco → NULL (trigger), CHECK de 600 caracteres y sin HTML, en las dos tablas.
-- ============================================================
do $$
declare
  v_sub uuid;
  v_aviso text;
  fallos text := '';
begin
  -- Un aviso en blanco se guarda como NULL (sin aviso)
  insert into public.categorias_ticket (id, nombre, aviso) values ('__test_ci_114a', '__TEST_CI__ Camaras 114a', '   ');
  select aviso into v_aviso from public.categorias_ticket where id = '__test_ci_114a';
  if v_aviso is not null then
    fallos := fallos || '[114] un aviso en blanco no quedo como NULL en categorias_ticket; ';
  end if;

  -- Se recortan espacios y saltos de línea alrededor
  update public.categorias_ticket set aviso = E'  Debera adjuntar la autorizacion de gerencia.\n ' where id = '__test_ci_114a';
  select aviso into v_aviso from public.categorias_ticket where id = '__test_ci_114a';
  if v_aviso is distinct from 'Debera adjuntar la autorizacion de gerencia.' then
    fallos := fallos || '[114] el aviso no se recorto (quedo "' || coalesce(v_aviso, 'NULL') || '"); ';
  end if;

  -- Tope: 600 caracteres pasan, 601 no
  begin
    update public.categorias_ticket set aviso = repeat('a', 600) where id = '__test_ci_114a';
  exception when check_violation then fallos := fallos || '[114] se rechazo un aviso de 600 caracteres; '; end;
  begin
    update public.categorias_ticket set aviso = repeat('a', 601) where id = '__test_ci_114a';
    fallos := fallos || '[114] se admitio un aviso de 601 caracteres; ';
  exception when check_violation then null; end;

  -- Sin HTML: una etiqueta se rechaza; un "<" de comparacion no
  begin
    update public.categorias_ticket set aviso = 'Adjunte <b>la autorizacion</b> firmada' where id = '__test_ci_114a';
    fallos := fallos || '[114] se admitio HTML en el aviso; ';
  exception when check_violation then null; end;
  begin
    update public.categorias_ticket set aviso = 'Solo cortes de < 5 minutos' where id = '__test_ci_114a';
  exception when check_violation then fallos := fallos || '[114] se rechazo un < que no es una etiqueta; '; end;

  -- NULL explicito borra el aviso
  update public.categorias_ticket set aviso = null where id = '__test_ci_114a';
  if exists (select 1 from public.categorias_ticket where id = '__test_ci_114a' and aviso is not null) then
    fallos := fallos || '[114] no se pudo borrar el aviso con NULL; ';
  end if;

  -- Subcategoria: mismo trigger y mismo CHECK
  insert into public.subcategorias_ticket (categoria_id, nombre, tipo_sugerido, aviso)
    values ('__test_ci_114a', '__TEST_CI__ Solicitud de imagen o corto', 'solicitud', E' \n ')
    returning id into v_sub;
  if (select aviso from public.subcategorias_ticket where id = v_sub) is not null then
    fallos := fallos || '[114] un aviso en blanco no quedo como NULL en subcategorias_ticket; ';
  end if;
  begin
    update public.subcategorias_ticket set aviso = ' Debera adjuntar la autorizacion de gerencia. ' where id = v_sub;
  exception when check_violation then fallos := fallos || '[114] se rechazo un aviso valido de subcategoria; '; end;
  if (select aviso from public.subcategorias_ticket where id = v_sub) is distinct from 'Debera adjuntar la autorizacion de gerencia.' then
    fallos := fallos || '[114] el aviso de la subcategoria no se recorto; ';
  end if;
  begin
    update public.subcategorias_ticket set aviso = repeat('b', 601) where id = v_sub;
    fallos := fallos || '[114] se admitio un aviso de 601 caracteres en subcategorias_ticket; ';
  exception when check_violation then null; end;
  begin
    update public.subcategorias_ticket set aviso = '<script>x</script>' where id = v_sub;
    fallos := fallos || '[114] se admitio HTML en el aviso de la subcategoria; ';
  exception when check_violation then null; end;

  if fallos = '' then
    raise exception 'TESTS_OK [114a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [114a]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 115a — reportes (migración 115): un ticket cuenta como resuelto en UN
-- solo período (el de su resolución vigente), el rechazado va aparte y fuera de
-- los tiempos, los arrastrados se distinguen de los del período, y la primera
-- respuesta se mide con el primer comentario visible de un staff.
-- Fixtures con fechas explícitas en marzo/abril de 2015 (un período que ninguna
-- base real tiene poblado: así los conteos exactos valen también contra
-- producción). El trigger tickets_resuelto_at se desactiva solo durante la
-- siembra (igual que el backfill de la 089); los triggers de autor/estado de
-- los comentarios también, porque esta conexión no tiene auth.uid(). Todo se
-- revierte con el raise final.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  v_empresa uuid;
  v_area uuid;
  v_e1 uuid;
  v_a uuid;
  v_b uuid;
  v_r uuid;
  v_m date := date '2015-03-01'; -- mes fijo y vacío en cualquier base: los conteos exactos no dependen de los datos reales
  v_n date;
  v_m_fin date;
  v_n_fin date;
  r jsonb;
  r2 jsonb;
  fila record;
  fallos text := '';
begin
  v_n := (v_m + interval '1 month')::date;
  v_m_fin := v_n - 1;
  v_n_fin := (v_n + interval '1 month')::date - 1;
  insert into auth.users (email) values ('__test_ci_115a_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_115a_asis@example.test') returning id into v_asis;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true, nombre = 'Jefe 115a' where user_id = v_jefe;
  update public.staff set activo = true, nombre = 'Asistente 115a' where user_id = v_asis;
  -- Desde la 118 el desglose por técnico muestra solo a los técnicos de mesa: el asistente lo es.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'staff' and column_name = 'tecnico_mesa') then
    execute 'update public.staff set tecnico_mesa = true where user_id = $1' using v_asis;
  end if;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 115a') returning id into v_empresa;
  insert into public.areas_obras (nombre) values ('__TEST_CI__ Obra 115a') returning id into v_area;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, area_obra_id) values ('Test', 'CI 115a', '99011501', v_empresa, v_area) returning id into v_e1;

  alter table public.tickets disable trigger tickets_resuelto_at;
  -- A: creado el 10 de M, resuelto el 12 de M por el jefe, reabierto el 20, vuelto a resolver el 2 de N por el asistente
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_115A_A', lpad('115aA', 24, 'x'), 'Ticket A', 'd', 'cerrado', 'alta', v_e1,
            ((v_m + 9) + time '10:00') at time zone 'America/Lima', ((v_n + 1) + time '09:00') at time zone 'America/Lima')
    returning id into v_a;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_a, 'estado_cambiado', 'De "abierto" a "en_progreso"', ((v_m + 9) + time '11:00') at time zone 'America/Lima', v_jefe),
    (v_a, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + 11) + time '10:00') at time zone 'America/Lima', v_jefe),
    (v_a, 'estado_cambiado', 'De "resuelto" a "cerrado"', ((v_m + 11) + time '10:00:01') at time zone 'America/Lima', v_jefe),
    (v_a, 'estado_cambiado', 'De "cerrado" a "reabierto"', ((v_m + 19) + time '10:00') at time zone 'America/Lima', null),
    (v_a, 'estado_cambiado', 'De "reabierto" a "resuelto"', ((v_n + 1) + time '09:00') at time zone 'America/Lima', v_asis),
    (v_a, 'estado_cambiado', 'De "resuelto" a "cerrado"', ((v_n + 1) + time '09:00:01') at time zone 'America/Lima', v_asis);
  -- R: rechazado en M (cuenta como creado y rechazado, nunca como resuelto ni en tiempos)
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_115A_R', lpad('115aR', 24, 'x'), 'Ticket R', 'd', 'rechazado', 'baja', v_e1,
            ((v_m + 3) + time '10:00') at time zone 'America/Lima', null)
    returning id into v_r;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_r, 'estado_cambiado', 'De "abierto" a "rechazado"', ((v_m + 3) + time '12:00') at time zone 'America/Lima', v_jefe);
  -- B: creado y resuelto el 14 de M por el asistente (4 horas), con respuesta a la media hora
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_115A_B', lpad('115aB', 24, 'x'), 'Ticket B', 'd', 'cerrado', 'media', v_e1,
            ((v_m + 13) + time '08:00') at time zone 'America/Lima', ((v_m + 13) + time '12:00') at time zone 'America/Lima')
    returning id into v_b;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_b, 'estado_cambiado', 'De "abierto" a "en_progreso"', ((v_m + 13) + time '09:00') at time zone 'America/Lima', v_asis),
    (v_b, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + 13) + time '12:00') at time zone 'America/Lima', v_asis),
    (v_b, 'estado_cambiado', 'De "resuelto" a "cerrado"', ((v_m + 13) + time '12:00:01') at time zone 'America/Lima', v_asis);
  alter table public.tickets enable trigger tickets_resuelto_at;
  alter table public.ticket_comentarios disable trigger trg_check_ticket_no_cerrado;
  alter table public.ticket_comentarios disable trigger trg_ticket_comentarios_by;
  insert into public.ticket_comentarios (ticket_id, autor_id, interno, mensaje, created_at) values
    (v_b, v_asis, true,  'nota interna (no cuenta)', ((v_m + 13) + time '08:10') at time zone 'America/Lima'),
    (v_b, v_asis, false, 'respuesta visible', ((v_m + 13) + time '08:30') at time zone 'America/Lima'),
    (v_b, null,   false, 'respuesta del solicitante (no cuenta)', ((v_m + 13) + time '08:05') at time zone 'America/Lima');
  alter table public.ticket_comentarios enable trigger trg_check_ticket_no_cerrado;
  alter table public.ticket_comentarios enable trigger trg_ticket_comentarios_by;

  -- v_ticket_hechos: resolución vigente, técnico que resolvió y primera respuesta
  select * into fila from public.v_ticket_hechos where ticket_id = v_a;
  if not fila.resuelto_vigente or fila.dia_resuelto <> v_n + 1 or fila.tecnico_resolvio_id is distinct from v_asis
     or fila.n_resoluciones <> 2 or fila.n_reaperturas <> 1 or fila.dia_primera_resolucion <> v_m + 11 then
    fallos := fallos || '[115] hechos del ticket A incorrectos (vigente=' || fila.resuelto_vigente || ', tecnico asis=' || (fila.tecnico_resolvio_id = v_asis) || ', resoluciones=' || fila.n_resoluciones || '); ';
  end if;
  select * into fila from public.v_ticket_hechos where ticket_id = v_r;
  if not fila.rechazado or fila.resuelto_vigente or fila.horas_resolucion is not null then
    fallos := fallos || '[115] el rechazado figura como resuelto o con tiempo; ';
  end if;
  select * into fila from public.v_ticket_hechos where ticket_id = v_b;
  if round(fila.horas_resolucion, 2) <> 4 or round(fila.horas_primera_respuesta, 2) <> 0.5 or fila.area_obra_id is distinct from v_area then
    fallos := fallos || '[115] horas o area del ticket B incorrectas (' || coalesce(fila.horas_resolucion::text, 'null') || ', ' || coalesce(fila.horas_primera_respuesta::text, 'null') || '); ';
  end if;

  -- Mes M: 3 creados (1 rechazado), 1 resuelto (B); A NO cuenta aunque se resolvió por primera vez en M
  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin);
  if (r -> 'volumen' ->> 'creados')::int <> 3 or (r -> 'volumen' ->> 'rechazados')::int <> 1
     or (r -> 'volumen' ->> 'resueltos')::int <> 1 or (r -> 'volumen' ->> 'resueltos_mismo_periodo')::int <> 1
     or (r -> 'volumen' ->> 'resueltos_arrastrados')::int <> 0 then
    fallos := fallos || '[115] volumen de M incorrecto: ' || (r ->> 'volumen') || '; ';
  end if;
  if (r -> 'atencion' -> 'resolucion' ->> 'n')::int <> 1 or (r -> 'atencion' -> 'resolucion' ->> 'mediana_horas')::numeric <> 4
     or (r -> 'atencion' -> 'primera_respuesta' ->> 'n')::int <> 1 or (r -> 'atencion' -> 'primera_respuesta' ->> 'mediana_horas')::numeric <> 0.5
     or (r -> 'atencion' ->> 'unidad') <> 'horas corridas' then
    fallos := fallos || '[115] atencion de M incorrecta: ' || (r ->> 'atencion') || '; ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'tickets') t where t ->> 'codigo' = '__TEST_CI_115A_R' and t ->> 'en_periodo' = 'creado') then
    fallos := fallos || '[115] el detalle de M no trae al rechazado como creado; ';
  end if;
  if exists (select 1 from jsonb_array_elements(r -> 'tickets') t where t ? 'dni' or t ? 'contacto_ingresado') then
    fallos := fallos || '[115] el detalle expone DNI o contacto; ';
  end if;

  -- Mes N: A cuenta una vez, como arrastrado, atribuido al asistente; la suma M+N = tickets resueltos distintos
  r2 := public.reporte_tickets_de(v_jefe, v_n, v_n_fin);
  if (r2 -> 'volumen' ->> 'creados')::int <> 0 or (r2 -> 'volumen' ->> 'resueltos')::int <> 1
     or (r2 -> 'volumen' ->> 'resueltos_arrastrados')::int <> 1 then
    fallos := fallos || '[115] volumen de N incorrecto: ' || (r2 ->> 'volumen') || '; ';
  end if;
  if (r -> 'volumen' ->> 'resueltos')::int + (r2 -> 'volumen' ->> 'resueltos')::int
     <> (select count(*) from public.tickets where codigo like '__TEST_CI_115A_%' and estado in ('resuelto', 'cerrado')) then
    fallos := fallos || '[115] la suma de resueltos por mes no da los tickets resueltos (doble cuenta); ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r2 -> 'anexos' -> 'arrastrados') a
                  where a ->> 'codigo' = '__TEST_CI_115A_A' and (a ->> 'tecnico_id')::uuid = v_asis and (a ->> 'dias_abierto')::int >= 20) then
    fallos := fallos || '[115] el anexo de arrastrados de N no trae al ticket A: ' || (r2 -> 'anexos' ->> 'arrastrados') || '; ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r2 -> 'por_tecnico') t where (t ->> 'tecnico_id')::uuid = v_asis and (t ->> 'resueltos')::int = 1 and (t ->> 'arrastrados')::int = 1) then
    fallos := fallos || '[115] por_tecnico de N no atribuye A al asistente: ' || (r2 ->> 'por_tecnico') || '; ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'por' -> 'area') a where (a ->> 'clave')::uuid = v_area and (a ->> 'creados')::int = 3 and (a ->> 'resueltos')::int = 1) then
    fallos := fallos || '[115] por area de M incorrecto: ' || (r -> 'por' ->> 'area') || '; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [115a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [115a]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 115b — reaperturas: una reapertura desde "rechazado" no cuenta; la
-- tasa usa el mismo conjunto (tickets con primera resolución en el período) y
-- el corte de dias_corte_reapertura; los eventos se atribuyen al mes en que
-- ocurrieron.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_empresa uuid;
  v_e1 uuid;
  v_x uuid;
  v_y uuid;
  v_z uuid;
  v_m date := date '2015-03-01'; -- mes fijo y vacío en cualquier base: los conteos exactos no dependen de los datos reales
  v_n date;
  v_m_fin date;
  v_n_fin date;
  r jsonb;
  fila record;
  fallos text := '';
begin
  v_n := (v_m + interval '1 month')::date;
  v_m_fin := v_n - 1;
  v_n_fin := (v_n + interval '1 month')::date - 1;
  insert into auth.users (email) values ('__test_ci_115b_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 115b') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 115b', '99011502', v_empresa) returning id into v_e1;

  alter table public.tickets disable trigger tickets_resuelto_at;
  -- X: rechazado y reabierto DESDE rechazado (050 lo permite): no es una reapertura del reporte
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at)
    values ('__TEST_CI_115B_X', lpad('115bX', 24, 'x'), 'Ticket X', 'd', 'reabierto', 'media', v_e1, ((v_m + 2) + time '10:00') at time zone 'America/Lima')
    returning id into v_x;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_x, 'estado_cambiado', 'De "abierto" a "rechazado"', ((v_m + 2) + time '12:00') at time zone 'America/Lima', v_jefe),
    (v_x, 'estado_cambiado', 'De "rechazado" a "reabierto"', ((v_m + 3) + time '12:00') at time zone 'America/Lima', v_jefe);
  -- Y: resuelto el 5 de M y reabierto el 10 de M (dentro del corte)
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at)
    values ('__TEST_CI_115B_Y', lpad('115bY', 24, 'x'), 'Ticket Y', 'd', 'reabierto', 'media', v_e1, ((v_m + 4) + time '10:00') at time zone 'America/Lima')
    returning id into v_y;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_y, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + 4) + time '15:00') at time zone 'America/Lima', v_jefe),
    (v_y, 'estado_cambiado', 'De "resuelto" a "cerrado"', ((v_m + 4) + time '15:00:01') at time zone 'America/Lima', v_jefe),
    (v_y, 'estado_cambiado', 'De "cerrado" a "reabierto"', ((v_m + 9) + time '10:00') at time zone 'America/Lima', null);
  -- Z: resuelto el 6 de M y reabierto 40 días después (fuera del corte de 30; el evento cae en N)
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at)
    values ('__TEST_CI_115B_Z', lpad('115bZ', 24, 'x'), 'Ticket Z', 'd', 'reabierto', 'media', v_e1, ((v_m + 5) + time '10:00') at time zone 'America/Lima')
    returning id into v_z;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_z, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + 5) + time '15:00') at time zone 'America/Lima', v_jefe),
    (v_z, 'estado_cambiado', 'De "resuelto" a "cerrado"', ((v_m + 5) + time '15:00:01') at time zone 'America/Lima', v_jefe),
    (v_z, 'estado_cambiado', 'De "cerrado" a "reabierto"', ((v_m + 45) + time '10:00') at time zone 'America/Lima', null);
  alter table public.tickets enable trigger tickets_resuelto_at;

  select * into fila from public.v_ticket_hechos where ticket_id = v_x;
  if fila.n_reaperturas <> 0 or fila.reabierto_en_corte or fila.primera_resolucion_at is not null then
    fallos := fallos || '[115] la reapertura desde rechazado conto como reapertura; ';
  end if;
  select * into fila from public.v_ticket_hechos where ticket_id = v_y;
  if fila.n_reaperturas <> 1 or not fila.reabierto_en_corte or fila.resuelto_vigente then
    fallos := fallos || '[115] el ticket Y deberia estar reabierto dentro del corte y sin resolucion vigente; ';
  end if;
  select * into fila from public.v_ticket_hechos where ticket_id = v_z;
  if fila.n_reaperturas <> 1 or fila.reabierto_en_corte then
    fallos := fallos || '[115] el ticket Z (reabierto a los 40 dias) no debe contar dentro del corte; ';
  end if;

  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin);
  if (r -> 'calidad' -> 'reaperturas' ->> 'base')::int <> 2 or (r -> 'calidad' -> 'reaperturas' ->> 'reabiertos')::int <> 1
     or (r -> 'calidad' -> 'reaperturas' ->> 'tasa_pct')::int <> 50 or (r -> 'calidad' -> 'reaperturas' ->> 'eventos')::int <> 1
     or (r -> 'calidad' -> 'reaperturas' ->> 'corte_dias')::int <> 30 then
    fallos := fallos || '[115] reaperturas de M incorrectas: ' || (r -> 'calidad' ->> 'reaperturas') || '; ';
  end if;
  if (r -> 'volumen' ->> 'resueltos')::int <> 0 then
    fallos := fallos || '[115] un ticket reabierto figura como resuelto en M; ';
  end if;
  r := public.reporte_tickets_de(v_jefe, v_n, v_n_fin);
  if (r -> 'calidad' -> 'reaperturas' ->> 'base')::int <> 0 or (r -> 'calidad' -> 'reaperturas' -> 'tasa_pct') <> 'null'::jsonb
     or (r -> 'calidad' -> 'reaperturas' ->> 'eventos')::int <> 1 then
    fallos := fallos || '[115] reaperturas de N incorrectas (base 0, tasa null, 1 evento): ' || (r -> 'calidad' ->> 'reaperturas') || '; ';
  end if;
  select * into fila from public.v_kpi_reaperturas where mes = v_m;
  if fila.base <> 2 or fila.reabiertos <> 1 or fila.tasa_pct <> 50 or fila.eventos <> 1 then
    fallos := fallos || '[115] v_kpi_reaperturas de M no coincide con la RPC; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [115b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [115b]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 115c — CSAT: con menos respuestas que csat_muestra_minima el promedio
-- viaja NULL e insuficiente = true; "insatisfecho" es nivel <= 2 (el 3 ya no
-- cuenta); los cerrados sin encuesta se listan aparte; el mínimo es un
-- parámetro editable.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_empresa uuid;
  v_e1 uuid;
  v_t uuid;
  v_m date := date '2015-03-01'; -- mes fijo y vacío en cualquier base: los conteos exactos no dependen de los datos reales
  v_m_fin date;
  v_niveles int[] := array[5, 4, 4, 3, 2];
  i int;
  r jsonb;
  fallos text := '';
begin
  v_m_fin := (v_m + interval '1 month')::date - 1;
  insert into auth.users (email) values ('__test_ci_115c_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 115c') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 115c', '99011503', v_empresa) returning id into v_e1;

  alter table public.tickets disable trigger tickets_resuelto_at;
  -- 4 encuestas respondidas (5, 4, 4, 3) + 1 cerrado sin encuesta + 1 encuesta pendiente
  for i in 1..4 loop
    insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
      values ('__TEST_CI_115C_' || i, lpad('115c' || i, 24, 'x'), 'Ticket ' || i, 'd', 'cerrado', 'media', v_e1,
              ((v_m + i) + time '08:00') at time zone 'America/Lima', ((v_m + i) + time '10:00') at time zone 'America/Lima')
      returning id into v_t;
    insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id)
      values (v_t, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + i) + time '10:00') at time zone 'America/Lima', v_jefe);
    insert into public.ticket_satisfaccion (ticket_id, nivel, comentario, fecha_envio, created_at)
      values (v_t, v_niveles[i], case when v_niveles[i] <= 2 then 'Mal' end, ((v_m + i + 1) + time '10:00') at time zone 'America/Lima', ((v_m + i) + time '10:00:01') at time zone 'America/Lima');
  end loop;
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_115C_SIN', lpad('115cS', 24, 'x'), 'Sin encuesta', 'd', 'cerrado', 'media', null,
            ((v_m + 10) + time '08:00') at time zone 'America/Lima', ((v_m + 10) + time '10:00') at time zone 'America/Lima')
    returning id into v_t;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id)
    values (v_t, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + 10) + time '10:00') at time zone 'America/Lima', v_jefe);
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_115C_PEN', lpad('115cP', 24, 'x'), 'Pendiente', 'd', 'cerrado', 'media', v_e1,
            ((v_m + 11) + time '08:00') at time zone 'America/Lima', ((v_m + 11) + time '10:00') at time zone 'America/Lima')
    returning id into v_t;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id)
    values (v_t, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + 11) + time '10:00') at time zone 'America/Lima', v_jefe);
  insert into public.ticket_satisfaccion (ticket_id, nivel, comentario, fecha_envio, created_at)
    values (v_t, null, null, null, ((v_m + 11) + time '10:00:01') at time zone 'America/Lima');
  alter table public.tickets enable trigger tickets_resuelto_at;

  -- n = 4 < 5: promedio NULL, insuficiente; generadas 5, respondidas 4 (80 %); 1 cerrado sin encuesta
  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin);
  if (r -> 'calidad' -> 'csat' ->> 'n')::int <> 4 or (r -> 'calidad' -> 'csat' -> 'promedio') <> 'null'::jsonb
     or (r -> 'calidad' -> 'csat' ->> 'insuficiente')::boolean is not true or (r -> 'calidad' -> 'csat' ->> 'minimo')::int <> 5
     or (r -> 'calidad' -> 'csat' ->> 'generadas')::int <> 5 or (r -> 'calidad' -> 'csat' ->> 'respondidas')::int <> 4
     or (r -> 'calidad' -> 'csat' ->> 'tasa_respuesta_pct')::int <> 80 then
    fallos := fallos || '[115] csat con n=4 incorrecto: ' || (r -> 'calidad' ->> 'csat') || '; ';
  end if;
  if (r -> 'calidad' -> 'csat' ->> 'insatisfechos')::int <> 0 or (r -> 'calidad' -> 'csat' -> 'niveles' ->> '3')::int <> 1 then
    fallos := fallos || '[115] el nivel 3 conto como insatisfecho; ';
  end if;
  if (r -> 'volumen' ->> 'cerrados_sin_encuesta')::int <> 1
     or not exists (select 1 from jsonb_array_elements(r -> 'anexos' -> 'cerrados_sin_encuesta') a where a ->> 'codigo' = '__TEST_CI_115C_SIN' and a ->> 'motivo' = 'sin_solicitante') then
    fallos := fallos || '[115] cerrados sin encuesta incorrecto: ' || (r -> 'anexos' ->> 'cerrados_sin_encuesta') || '; ';
  end if;

  -- quinta respuesta (nivel 2): n = 5 publica el promedio 3.6, 1 insatisfecho y 1 comentario bajo
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_115C_5', lpad('115c5', 24, 'x'), 'Ticket 5', 'd', 'cerrado', 'media', v_e1,
            ((v_m + 5) + time '08:00') at time zone 'America/Lima', ((v_m + 5) + time '10:00') at time zone 'America/Lima')
    returning id into v_t;
  alter table public.tickets disable trigger tickets_resuelto_at;
  update public.tickets set resuelto_at = ((v_m + 5) + time '10:00') at time zone 'America/Lima' where id = v_t;
  alter table public.tickets enable trigger tickets_resuelto_at;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id)
    values (v_t, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + 5) + time '10:00') at time zone 'America/Lima', v_jefe);
  insert into public.ticket_satisfaccion (ticket_id, nivel, comentario, fecha_envio, created_at)
    values (v_t, 2, 'Tardaron mucho', ((v_m + 6) + time '10:00') at time zone 'America/Lima', ((v_m + 5) + time '10:00:01') at time zone 'America/Lima');
  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin);
  if (r -> 'calidad' -> 'csat' ->> 'n')::int <> 5 or (r -> 'calidad' -> 'csat' ->> 'promedio')::numeric <> 3.6
     or (r -> 'calidad' -> 'csat' ->> 'insuficiente')::boolean is not false or (r -> 'calidad' -> 'csat' ->> 'insatisfechos')::int <> 1
     or (r -> 'calidad' ->> 'comentarios_bajos_total')::int <> 1 then
    fallos := fallos || '[115] csat con n=5 incorrecto: ' || (r -> 'calidad' ->> 'csat') || ' bajos=' || (r -> 'calidad' ->> 'comentarios_bajos_total') || '; ';
  end if;
  if (select sum(n) from public.v_kpi_csat where mes = v_m) <> 5 or (select sum(insatisfechos) from public.v_kpi_csat where mes = v_m) <> 1 then
    fallos := fallos || '[115] v_kpi_csat de M no coincide con la RPC; ';
  end if;

  -- el mínimo es un parámetro: con 6 la misma muestra vuelve a ser insuficiente
  update public.config_parametros set valor = '6'::jsonb where clave = 'csat_muestra_minima';
  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin);
  if (r -> 'calidad' -> 'csat' -> 'promedio') <> 'null'::jsonb or (r -> 'parametros' ->> 'csat_muestra_minima')::int <> 6 then
    fallos := fallos || '[115] el minimo de CSAT no sale de config_parametros; ';
  end if;
  r := public.reporte_satisfaccion_consolidado_de(v_jefe);
  if (r ->> 'muestraMinima')::int <> 6 or (r -> 'resumen' -> 'promedio') <> 'null'::jsonb
     -- el jefe no es técnico de mesa: desde la 118 su fila es «Jefatura y otros» (grupo 'otros', sin tecnico_id)
     or not exists (select 1 from jsonb_array_elements(r -> 'porTecnico') t
                     where ((t ->> 'tecnico_id')::uuid = v_jefe or t ->> 'grupo' = 'otros')
                       and (t ->> 'insuficiente')::boolean and (t ->> 'insatisfechos')::int = 1) then
    fallos := fallos || '[115] el consolidado de satisfaccion no aplica la misma muestra minima: ' || (r ->> 'resumen') || '; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [115c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [115c]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 115d — período: el período en curso nunca lleva comparación ni
-- "backlog al cierre"; un mes completo se compara con el mes de calendario
-- anterior; un rango de 7 días con los 7 anteriores; el alcance técnico no
-- compara; rangos inválidos se rechazan.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_m date := date '2015-03-01'; -- mes fijo y vacío en cualquier base: los conteos exactos no dependen de los datos reales
  v_m_fin date;
  r jsonb;
  fallos text := '';
begin
  v_m_fin := (v_m + interval '1 month')::date - 1;
  insert into auth.users (email) values ('__test_ci_115d_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;

  r := public.reporte_tickets_de(v_jefe, date_trunc('month', v_hoy)::date, (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date);
  if (r ->> 'periodo_completo')::boolean is not false or (r -> 'periodo' ->> 'en_curso')::boolean is not true
     or r -> 'comparacion' <> 'null'::jsonb or (r -> 'volumen' -> 'backlog' ->> 'referencia') <> 'ahora' then
    fallos := fallos || '[115] el periodo en curso lleva comparacion o backlog al cierre: ' || (r ->> 'periodo') || '; ';
  end if;
  if r ->> 'definiciones_version' is null or r -> 'generado_por' ->> 'user_id' <> v_jefe::text or r ->> 'generado_en' is null then
    fallos := fallos || '[115] faltan generado_en / generado_por / definiciones_version; ';
  end if;

  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin);
  if (r ->> 'periodo_completo')::boolean is not true or r -> 'comparacion' = 'null'::jsonb
     or (r -> 'comparacion' -> 'periodo' ->> 'desde')::date <> (v_m - interval '1 month')::date
     or (r -> 'comparacion' -> 'periodo' ->> 'hasta')::date <> v_m - 1
     or (r -> 'volumen' -> 'backlog' ->> 'referencia') <> 'cierre'
     or not (r -> 'comparacion' ?& array['volumen', 'atencion', 'csat', 'reaperturas', 'parcial']) then
    fallos := fallos || '[115] un mes completo no compara con el mes anterior: ' || coalesce(r -> 'comparacion' ->> 'periodo', 'null') || '; ';
  end if;
  r := public.reporte_tickets_de(v_jefe, v_m + 7, v_m + 13);
  if (r -> 'comparacion' -> 'periodo' ->> 'desde')::date <> v_m or (r -> 'comparacion' -> 'periodo' ->> 'hasta')::date <> v_m + 6 then
    fallos := fallos || '[115] una semana no compara con los 7 dias anteriores: ' || coalesce(r -> 'comparacion' ->> 'periodo', 'null') || '; ';
  end if;
  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin, v_jefe);
  if r -> 'comparacion' <> 'null'::jsonb or (r -> 'alcance' ->> 'tipo') <> 'tecnico' or r -> 'volumen' -> 'creados' <> 'null'::jsonb then
    fallos := fallos || '[115] el alcance tecnico compara o atribuye creados; ';
  end if;

  begin
    perform public.reporte_tickets_de(v_jefe, v_m_fin, v_m);
    fallos := fallos || '[115] se acepto un rango invertido; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[115] rango invertido lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.reporte_tickets_de(v_jefe, v_m - 400, v_m);
    fallos := fallos || '[115] se acepto un rango de mas de 366 dias; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[115] rango largo lanzo ' || sqlstate || '; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [115d] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [115d]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 115e — autorización: sin sesión o sin módulo tickets 42501; un
-- asistente recibe el reporte sin "por técnico" y puede pedir su propio
-- alcance, pero no el de otro técnico; el jefe recibe "por técnico". Las
-- vistas son security_invoker, las RPC viejas ya no existen y los EXECUTE son
-- los declarados.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  v_sinmod uuid;
  v_m date := date '2015-03-01'; -- mes fijo y vacío en cualquier base: los conteos exactos no dependen de los datos reales
  v_m_fin date;
  r jsonb;
  v text;
  fallos text := '';
begin
  v_m_fin := (v_m + interval '1 month')::date - 1;
  insert into auth.users (email) values ('__test_ci_115e_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_115e_asis@example.test') returning id into v_asis;
  insert into auth.users (email) values ('__test_ci_115e_sinmod@example.test') returning id into v_sinmod;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  update public.staff set activo = true where user_id in (v_asis, v_sinmod);
  delete from public.staff_modulos_permisos where staff_user_id = v_asis and modulo <> 'tickets';
  delete from public.staff_modulos_permisos where staff_user_id = v_sinmod;

  begin
    perform public.reporte_tickets_de(null, v_m, v_m_fin);
    fallos := fallos || '[115] reporte_tickets respondio sin sesion; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[115] sin sesion lanzo ' || sqlstate || ' en vez de 42501; '; end if;
  end;
  begin
    perform public.reporte_tickets_de(v_sinmod, v_m, v_m_fin);
    fallos := fallos || '[115] reporte_tickets respondio sin el modulo tickets; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[115] sin modulo lanzo ' || sqlstate || ' en vez de 42501; '; end if;
  end;
  begin
    perform public.reporte_tickets_de(v_asis, v_m, v_m_fin, v_jefe);
    fallos := fallos || '[115] un asistente obtuvo el reporte de otro tecnico; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[115] tecnico ajeno lanzo ' || sqlstate || ' en vez de 42501; '; end if;
  end;
  begin
    perform public.reporte_satisfaccion_consolidado_de(null);
    fallos := fallos || '[115] reporte_satisfaccion_consolidado respondio sin sesion; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[115] consolidado sin sesion lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.reporte_satisfaccion_consolidado_de(v_sinmod);
    fallos := fallos || '[115] reporte_satisfaccion_consolidado respondio sin el modulo; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[115] consolidado sin modulo lanzo ' || sqlstate || '; '; end if;
  end;

  r := public.reporte_tickets_de(v_asis, v_m, v_m_fin);
  if r -> 'por_tecnico' <> 'null'::jsonb or (r -> 'alcance' ->> 'tipo') <> 'equipo' then
    fallos := fallos || '[115] un asistente recibio la seccion por tecnico; ';
  end if;
  r := public.reporte_tickets_de(v_asis, v_m, v_m_fin, v_asis);
  if (r -> 'alcance' ->> 'tecnico_id')::uuid <> v_asis or r -> 'por_tecnico' <> 'null'::jsonb then
    fallos := fallos || '[115] un asistente no pudo pedir su propio alcance; ';
  end if;
  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin);
  if jsonb_typeof(r -> 'por_tecnico') <> 'array' then
    fallos := fallos || '[115] el jefe no recibio la seccion por tecnico; ';
  end if;
  if not (r ?& array['generado_en', 'generado_por', 'definiciones_version', 'periodo', 'periodo_completo', 'alcance', 'parametros',
                     'volumen', 'por', 'atencion', 'calidad', 'por_tecnico', 'anexos', 'tickets', 'comparacion']) then
    fallos := fallos || '[115] faltan claves de primer nivel en el reporte; ';
  end if;

  foreach v in array array['v_ticket_hechos', 'v_kpi_volumen', 'v_kpi_tiempos', 'v_kpi_reaperturas', 'v_kpi_csat', 'v_backlog_tramos'] loop
    if not (select reloptions @> array['security_invoker=true'] from pg_class where oid = ('public.' || v)::regclass) then
      fallos := fallos || '[115] ' || v || ' no es security_invoker; ';
    end if;
    if not has_table_privilege('authenticated', 'public.' || v, 'select') or has_table_privilege('anon', 'public.' || v, 'select') then
      fallos := fallos || '[115] privilegios de ' || v || ' incorrectos; ';
    end if;
  end loop;
  if to_regprocedure('public.reporte_tickets(timestamptz, timestamptz)') is not null
     or to_regprocedure('public.reporte_tickets_resumen(timestamptz, timestamptz)') is not null then
    fallos := fallos || '[115] las RPC de la 053 siguen existiendo; ';
  end if;
  if not has_function_privilege('authenticated', 'public.reporte_tickets(date, date, uuid)', 'execute')
     or has_function_privilege('anon', 'public.reporte_tickets(date, date, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.reporte_tickets_de(uuid, date, date, uuid, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.reporte_satisfaccion_consolidado_de(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.reporte_satisfaccion_consolidado()', 'execute') then
    fallos := fallos || '[115] EXECUTE de las RPC de reportes incorrecto; ';
  end if;
  if (select valor from public.config_parametros where clave = 'csat_muestra_minima') <> '5'::jsonb
     or (select valor from public.config_parametros where clave = 'dias_corte_reapertura') <> '30'::jsonb then
    fallos := fallos || '[115] faltan los parametros sembrados; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [115e] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [115e]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 115f — paridad interna: para un mes completo la RPC devuelve lo mismo
-- que las vistas mensuales (volumen, tiempos, csat) y el backlog "al cierre"
-- reconstruye el estado de cada ticket a ese instante.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_empresa uuid;
  v_e1 uuid;
  v_t uuid;
  v_m date := date '2015-03-01'; -- mes fijo y vacío en cualquier base: los conteos exactos no dependen de los datos reales
  v_n date;
  v_m_fin date;
  v_cierre timestamptz;
  r jsonb;
  fila record;
  i int;
  fallos text := '';
begin
  v_n := (v_m + interval '1 month')::date;
  v_m_fin := v_n - 1;
  v_cierre := v_n::timestamp at time zone 'America/Lima';
  insert into auth.users (email) values ('__test_ci_115f_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true where user_id = v_jefe;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 115f') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'CI 115f', '99011506', v_empresa) returning id into v_e1;

  alter table public.tickets disable trigger tickets_resuelto_at;
  -- 3 resueltos en M con 2, 6 y 10 horas (mediana 6, promedio 6) y encuesta 4, 4, 5
  for i in 1..3 loop
    insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
      values ('__TEST_CI_115F_' || i, lpad('115f' || i, 24, 'x'), 'Ticket ' || i, 'd', 'cerrado', case when i = 1 then 'alta' else 'media' end, v_e1,
              ((v_m + i) + time '08:00') at time zone 'America/Lima', ((v_m + i) + time '08:00') at time zone 'America/Lima' + make_interval(hours => 4 * i - 2))
      returning id into v_t;
    insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id)
      values (v_t, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + i) + time '08:00') at time zone 'America/Lima' + make_interval(hours => 4 * i - 2), v_jefe);
    insert into public.ticket_satisfaccion (ticket_id, nivel, fecha_envio, created_at)
      values (v_t, case when i = 3 then 5 else 4 end, ((v_m + i + 1) + time '10:00') at time zone 'America/Lima', ((v_m + i) + time '12:00') at time zone 'America/Lima');
  end loop;
  -- vigente al cierre de M: creado el 20 de M, resuelto recién en N (al cierre seguia abierto, 11 dias)
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_115F_V', lpad('115fV', 24, 'x'), 'Vigente al cierre', 'd', 'cerrado', 'media', v_e1,
            ((v_m + 19) + time '08:00') at time zone 'America/Lima', ((v_n + 4) + time '08:00') at time zone 'America/Lima')
    returning id into v_t;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_t, 'estado_cambiado', 'De "abierto" a "en_progreso"', ((v_m + 19) + time '09:00') at time zone 'America/Lima', v_jefe),
    (v_t, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_n + 4) + time '08:00') at time zone 'America/Lima', v_jefe);
  -- rechazado antes del cierre: no es backlog
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at)
    values ('__TEST_CI_115F_R', lpad('115fR', 24, 'x'), 'Rechazado', 'd', 'rechazado', 'media', v_e1, ((v_m + 2) + time '08:00') at time zone 'America/Lima')
    returning id into v_t;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id)
    values (v_t, 'estado_cambiado', 'De "abierto" a "rechazado"', ((v_m + 2) + time '09:00') at time zone 'America/Lima', v_jefe);
  -- creado despues del cierre: no cuenta en M
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at)
    values ('__TEST_CI_115F_N', lpad('115fN', 24, 'x'), 'De N', 'd', 'abierto', 'media', v_e1, ((v_n + 1) + time '08:00') at time zone 'America/Lima');
  alter table public.tickets enable trigger tickets_resuelto_at;

  r := public.reporte_tickets_de(v_jefe, v_m, v_m_fin);
  select * into fila from public.v_kpi_volumen where mes = v_m;
  if fila.creados <> (r -> 'volumen' ->> 'creados')::int or fila.resueltos <> (r -> 'volumen' ->> 'resueltos')::int
     or fila.rechazados <> (r -> 'volumen' ->> 'rechazados')::int or fila.resueltos_arrastrados <> (r -> 'volumen' ->> 'resueltos_arrastrados')::int then
    fallos := fallos || '[115] v_kpi_volumen y la RPC difieren en M; ';
  end if;
  if fila.creados <> 5 or fila.resueltos <> 3 or fila.rechazados <> 1 then
    fallos := fallos || '[115] volumen de M inesperado: creados=' || fila.creados || ' resueltos=' || fila.resueltos || ' rechazados=' || fila.rechazados || '; ';
  end if;
  select * into fila from public.v_kpi_tiempos where mes = v_m and prioridad is null;
  if fila.n_resolucion <> 3 or fila.mediana_horas_resolucion <> 6 or fila.promedio_horas_resolucion <> 6
     or fila.mediana_horas_resolucion <> (r -> 'atencion' -> 'resolucion' ->> 'mediana_horas')::numeric
     or fila.promedio_horas_resolucion <> (r -> 'atencion' -> 'resolucion' ->> 'promedio_horas')::numeric
     or fila.n_resolucion <> (r -> 'atencion' -> 'resolucion' ->> 'n')::int then
    fallos := fallos || '[115] v_kpi_tiempos y la RPC difieren en M (mediana ' || fila.mediana_horas_resolucion || ' vs ' || (r -> 'atencion' -> 'resolucion' ->> 'mediana_horas') || '); ';
  end if;
  if not exists (select 1 from public.v_kpi_tiempos where mes = v_m and prioridad = 'alta' and n_resolucion = 1 and mediana_horas_resolucion = 2)
     or not exists (select 1 from jsonb_array_elements(r -> 'atencion' -> 'por_prioridad') p where p ->> 'prioridad' = 'alta' and (p ->> 'mediana_horas')::numeric = 2) then
    fallos := fallos || '[115] el corte por prioridad difiere entre la vista y la RPC; ';
  end if;
  if (select sum(n) from public.v_kpi_csat where mes = v_m) <> (r -> 'calidad' -> 'csat' ->> 'n')::int
     or (select sum(suma_nivel) from public.v_kpi_csat where mes = v_m) <> 13 then
    fallos := fallos || '[115] v_kpi_csat y la RPC difieren en M; ';
  end if;

  -- backlog al cierre de M: solo el vigente (11 dias); ni el rechazado, ni los resueltos, ni el creado en N
  if (r -> 'volumen' -> 'backlog' ->> 'referencia') <> 'cierre' or (r -> 'volumen' -> 'backlog' ->> 'total')::int <> 1
     or not exists (select 1 from jsonb_array_elements(r -> 'volumen' -> 'backlog' -> 'tramos') t where t ->> 'clave' = 'de_8_a_30' and (t ->> 'cantidad')::int = 1) then
    fallos := fallos || '[115] backlog al cierre de M incorrecto: ' || (r -> 'volumen' ->> 'backlog') || '; ';
  end if;
  if (select sum(cantidad) from public.backlog_tramos_en(v_cierre)) <> 1
     or (select sum(cantidad) from public.backlog_tramos_en(((v_m + 1) + time '00:00') at time zone 'America/Lima')) <> 0
     or (select sum(cantidad) from public.backlog_tramos_en(((v_m + 2) + time '08:30') at time zone 'America/Lima')) <> 2 then
    fallos := fallos || '[115] backlog_tramos_en no reconstruye el estado al instante pedido; ';
  end if;
  if (select count(*) from public.v_backlog_tramos) <> 4 then
    fallos := fallos || '[115] v_backlog_tramos no devuelve los 4 tramos; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [115f] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [115f]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 116a — catálogo de tickets v2 (migración 116): las 7 categorías y las
-- 31 subcategorías con su tipo y prioridad sugeridos, tickets de las
-- subcategorías movidas alineados con su categoría nueva, marca en
-- config_parametros, servicios de las categorías nuevas, CHECK de
-- prioridad_sugerida y evento categoria_cambiada.
-- Comprueba PRESENCIA (no conteos exactos): si el dueño agrega subcategorías
-- desde Configuración, el bloque sigue pasando. Los conteos exactos (31/7) los
-- comprueba npm run test:sql-local (D7) y el bloque Verificación de la 116.
-- ============================================================
do $$
declare
  v_falta text;
  v_n int;
  v_valor jsonb;
  v_t uuid;
  fallos text := '';
begin
  select string_agg(x.id, ', ') into v_falta
    from (values ('accesos_cuentas', 'Accesos y Cuentas'), ('equipos', 'Hardware y Periféricos'),
                 ('red', 'Redes y Conectividad'), ('software', 'Software y Aplicaciones'),
                 ('seguridad', 'Seguridad de la Información'), ('cctv', 'Videovigilancia (CCTV)'),
                 ('otro', 'Consultas y Capacitación')) as x(id, nombre)
   where not exists (select 1 from public.categorias_ticket c where c.id = x.id and c.nombre = x.nombre and c.deleted_at is null);
  if v_falta is not null then fallos := fallos || '[116] faltan categorias vivas: ' || v_falta || '; '; end if;

  select string_agg(x.nombre, ', ') into v_falta
    from (values
      ('accesos_cuentas', 'Restablecer contraseña', 'solicitud', 'media'),
      ('accesos_cuentas', 'Desbloquear cuenta', 'solicitud', 'alta'),
      ('accesos_cuentas', 'No puedo ingresar al sistema', 'incidente', 'alta'),
      ('accesos_cuentas', 'Solicitar permisos o accesos (sistemas / carpetas)', 'solicitud', 'media'),
      ('accesos_cuentas', 'Crear cuenta de usuario (alta)', 'solicitud', 'media'),
      ('accesos_cuentas', 'Desactivar cuenta de usuario (baja)', 'solicitud', 'alta'),
      ('equipos', 'Equipo no enciende', 'incidente', 'alta'),
      ('equipos', 'Equipo lento o con fallas', 'incidente', 'media'),
      ('equipos', 'Impresora o escáner no funciona', 'incidente', 'media'),
      ('equipos', 'Accesorio dañado o faltante', 'incidente', 'baja'),
      ('equipos', 'Solicitar tóner o insumos', 'solicitud', 'baja'),
      ('equipos', 'Solicitar equipo o accesorio nuevo', 'solicitud', 'baja'),
      ('red', 'Sin internet o WiFi', 'incidente', 'alta'),
      ('red', 'VPN no conecta', 'incidente', 'alta'),
      ('red', 'Red lenta o intermitente', 'incidente', 'media'),
      ('red', 'Solicitar punto de red, WiFi o VPN', 'solicitud', 'baja'),
      ('software', 'Error o falla en aplicación', 'incidente', 'media'),
      ('software', 'Correo electrónico / Office 365', 'incidente', 'alta'),
      ('software', 'Licencia vencida o no se activa', 'incidente', 'media'),
      ('software', 'Instalar o actualizar software', 'solicitud', 'baja'),
      ('software', 'Solicitar licencia nueva', 'solicitud', 'baja'),
      ('seguridad', 'Virus o malware sospechoso', 'incidente', 'urgente'),
      ('seguridad', 'Correo sospechoso / phishing', 'incidente', 'alta'),
      ('seguridad', 'Pérdida o robo de equipo', 'incidente', 'urgente'),
      ('seguridad', 'Respaldo o recuperación de archivos', 'solicitud', 'media'),
      ('cctv', 'Cámara sin imagen o con falla', 'incidente', 'alta'),
      ('cctv', 'Solicitar acceso para visualizar cámaras', 'solicitud', 'media'),
      ('cctv', 'Solicitar revisión o extracción de grabación', 'solicitud', 'media'),
      ('otro', 'Consulta o asesoría', 'solicitud', 'baja'),
      ('otro', 'Solicitar capacitación', 'solicitud', 'baja'),
      ('otro', 'Otro (no clasificado)', 'solicitud', 'baja')
    ) as x(cat, nombre, tipo, prioridad)
   where not exists (select 1 from public.subcategorias_ticket s
                      where s.categoria_id = x.cat and s.nombre = x.nombre and s.deleted_at is null
                        and s.tipo_sugerido = x.tipo and s.prioridad_sugerida = x.prioridad);
  if v_falta is not null then fallos := fallos || '[116] subcategorias ausentes o con tipo/prioridad distintos: ' || v_falta || '; '; end if;

  -- Los avisos: los dos nuevos y el de «Cámaras», que se movió con ella
  if not exists (select 1 from public.subcategorias_ticket where categoria_id = 'accesos_cuentas' and nombre = 'No puedo ingresar al sistema' and aviso like '%Desbloquear cuenta%')
     or not exists (select 1 from public.subcategorias_ticket where categoria_id = 'cctv' and nombre = 'Solicitar revisión o extracción de grabación' and aviso like '%autorización de Gerencia%')
     or exists (select 1 from public.subcategorias_ticket where categoria_id = 'cctv' and nombre = 'Cámara sin imagen o con falla' and aviso is not null) then
    fallos := fallos || '[116] avisos del catalogo nuevo incorrectos; ';
  end if;

  -- Ningún ticket de una subcategoría movida quedó en la categoría anterior
  select count(*) into v_n
    from public.tickets t join public.subcategorias_ticket s on s.id = t.subcategoria_id
   where s.nombre in ('Impresora o escáner no funciona', 'Virus o malware sospechoso', 'Solicitar acceso para visualizar cámaras')
     and t.categoria_id is distinct from s.categoria_id;
  if v_n <> 0 then fallos := fallos || '[116] ' || v_n || ' tickets de subcategorias movidas siguen en la categoria anterior; '; end if;

  -- Marca de la vista v_tickets_por_reclasificar
  select valor into v_valor from public.config_parametros where clave = 'catalogo_tickets_v2';
  if v_valor is null or (v_valor ->> 'aplicada_at')::timestamptz > now()
     or (v_valor ->> 'subcategoria_no_clasificado')::uuid is distinct from (select id from public.subcategorias_ticket where categoria_id = 'otro' and nombre = 'Otro (no clasificado)' and deleted_at is null)
     or (v_valor ->> 'subcategoria_seguridad_legado')::uuid is distinct from (select id from public.subcategorias_ticket where categoria_id = 'seguridad' and nombre = 'Virus o malware sospechoso' and deleted_at is null) then
    fallos := fallos || '[116] la marca catalogo_tickets_v2 no apunta a las subcategorias de revision: ' || coalesce(v_valor::text, 'NULL') || '; ';
  end if;

  -- Las categorías nuevas tienen servicio
  if exists (select 1 from public.categorias_ticket where id in ('seguridad', 'cctv') and servicio_id is null) then
    fallos := fallos || '[116] seguridad o cctv quedaron sin servicio; ';
  end if;

  -- CHECK de prioridad_sugerida: los cuatro valores y NULL; nada más
  insert into public.categorias_ticket (id, nombre) values ('__test_ci_116a', '__TEST_CI__ 116a');
  begin
    insert into public.subcategorias_ticket (categoria_id, nombre, prioridad_sugerida) values ('__test_ci_116a', '__TEST_CI__ critica', 'critica');
    fallos := fallos || '[116] prioridad_sugerida acepto un valor fuera del CHECK; ';
  exception when check_violation then null; end;
  begin
    insert into public.subcategorias_ticket (categoria_id, nombre, prioridad_sugerida) values
      ('__test_ci_116a', '__TEST_CI__ u', 'urgente'), ('__test_ci_116a', '__TEST_CI__ b', 'baja'), ('__test_ci_116a', '__TEST_CI__ n', null);
  exception when check_violation then fallos := fallos || '[116] prioridad_sugerida rechazo un valor valido; '; end;

  -- Evento categoria_cambiada admitido; uno inventado, no
  insert into public.tickets (codigo, token, titulo, descripcion) values ('__TEST_CI_116A__', lpad('A', 24, 'U'), 't', 'd') returning id into v_t;
  begin
    insert into public.ticket_eventos (ticket_id, evento, detalle) values (v_t, 'categoria_cambiada', 'De "a" a "b"');
  exception when check_violation then fallos := fallos || '[116] ticket_eventos rechazo categoria_cambiada; '; end;
  begin
    insert into public.ticket_eventos (ticket_id, evento) values (v_t, 'categoria_inventada');
    fallos := fallos || '[116] ticket_eventos acepto un evento inventado; ';
  exception when check_violation then null; end;

  if fallos = '' then
    raise exception 'TESTS_OK [116a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [116a]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 116b — crear_ticket_publico (116): prioridad inicial desde la
-- subcategoría (NULL o sin subcategoría = media); el público no la elige; el
-- staff sí, y un valor fuera del CHECK deja la sugerida.
-- OJO: cada creación consume un código TCK-XXXX de la secuencia (igual que 111a).
-- ============================================================
do $$
declare
  v_staff uuid;
  v_cat text := '__test_ci_116b';
  v_alta uuid;
  v_nula uuid;
  r jsonb;
  v_p text;
  v_tipo text;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_116b_staff@example.test') returning id into v_staff;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'ASISTENTE', activo = true where user_id = v_staff;
  insert into public.categorias_ticket (id, nombre) values (v_cat, '__TEST_CI__ Categoria 116b');
  insert into public.subcategorias_ticket (categoria_id, nombre, tipo_sugerido, prioridad_sugerida)
    values (v_cat, '__TEST_CI__ Sub alta', 'incidente', 'alta') returning id into v_alta;
  insert into public.subcategorias_ticket (categoria_id, nombre, tipo_sugerido)
    values (v_cat, '__TEST_CI__ Sub sin prioridad', 'solicitud') returning id into v_nula;

  -- 1) público con subcategoría «alta»: alta; la prioridad que mande el cliente se ignora
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'subcategoria_id', v_alta,
         'token', lpad('1', 24, 'P'), 'ip', '10.116.0.1', 'prioridad', 'baja'));
  select prioridad, tipo into v_p, v_tipo from public.tickets where id = (r ->> 'id')::uuid;
  if v_p is distinct from 'alta' or v_tipo is distinct from 'incidente' then
    fallos := fallos || '[116] publico con subcategoria alta salio ' || coalesce(v_p, 'NULL') || '/' || coalesce(v_tipo, 'NULL') || '; ';
  end if;

  -- 2) público con subcategoría sin prioridad sugerida: media
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'subcategoria_id', v_nula,
         'token', lpad('2', 24, 'P'), 'ip', '10.116.0.2'));
  select prioridad into v_p from public.tickets where id = (r ->> 'id')::uuid;
  if v_p is distinct from 'media' then fallos := fallos || '[116] subcategoria sin prioridad no dio media (' || coalesce(v_p, 'NULL') || '); '; end if;

  -- 3) público sin subcategoría: media
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat,
         'token', lpad('3', 24, 'P'), 'ip', '10.116.0.3', 'prioridad', 'urgente'));
  select prioridad into v_p from public.tickets where id = (r ->> 'id')::uuid;
  if v_p is distinct from 'media' then fallos := fallos || '[116] sin subcategoria no dio media (' || coalesce(v_p, 'NULL') || '); '; end if;

  -- 4) staff sin prioridad explícita: la sugerida
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'subcategoria_id', v_alta,
         'token', lpad('4', 24, 'P'), 'ip', '10.116.0.4', 'staff_id', v_staff, 'origen', 'staff_interno'));
  select prioridad into v_p from public.tickets where id = (r ->> 'id')::uuid;
  if v_p is distinct from 'alta' then fallos := fallos || '[116] staff sin prioridad no tomo la sugerida (' || coalesce(v_p, 'NULL') || '); '; end if;

  -- 5) staff con prioridad explícita: se respeta (también sobre una sugerida)
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'subcategoria_id', v_alta,
         'token', lpad('5', 24, 'P'), 'ip', '10.116.0.5', 'staff_id', v_staff, 'prioridad', 'urgente'));
  select prioridad into v_p from public.tickets where id = (r ->> 'id')::uuid;
  if v_p is distinct from 'urgente' then fallos := fallos || '[116] staff con prioridad urgente salio ' || coalesce(v_p, 'NULL') || '; '; end if;
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'subcategoria_id', v_nula,
         'token', lpad('6', 24, 'P'), 'ip', '10.116.0.6', 'staff_id', v_staff, 'prioridad', 'baja'));
  select prioridad into v_p from public.tickets where id = (r ->> 'id')::uuid;
  if v_p is distinct from 'baja' then fallos := fallos || '[116] staff con prioridad baja salio ' || coalesce(v_p, 'NULL') || '; '; end if;

  -- 6) staff con un valor fuera del CHECK: deja la sugerida (no falla)
  r := public.crear_ticket_publico(jsonb_build_object('titulo', 't', 'descripcion', 'd', 'categoria_id', v_cat, 'subcategoria_id', v_alta,
         'token', lpad('7', 24, 'P'), 'ip', '10.116.0.7', 'staff_id', v_staff, 'prioridad', 'critica'));
  select prioridad into v_p from public.tickets where id = (r ->> 'id')::uuid;
  if r ->> 'ok' <> 'true' or v_p is distinct from 'alta' then fallos := fallos || '[116] prioridad invalida del staff no dejo la sugerida: ' || r::text || '; '; end if;

  -- 7) firma y privilegios intactos (111)
  if has_function_privilege('authenticated', 'public.crear_ticket_publico(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.crear_ticket_publico(jsonb)', 'execute')
     or not (select prosecdef from pg_proc where oid = 'public.crear_ticket_publico(jsonb)'::regprocedure) then
    fallos := fallos || '[116] crear_ticket_publico perdio sus privilegios o SECURITY DEFINER; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [116b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [116b]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 116c — reclasificar_ticket (116): solo JEFE (42501 en el núcleo sin
-- jefe y en la RPC sin sesión), motivo obligatorio (P0001), subcategoría o
-- ticket inexistentes (P0002); reclasifica un ticket CERRADO sin tocar tipo,
-- prioridad, estado ni resuelto_at; evento con actor y motivo; misma
-- subcategoría = clasificación confirmada; privilegios y vista solo JEFE.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_cat text := '__test_ci_116c';
  v_cat2 text := '__test_ci_116c2';
  v_s1 uuid;
  v_s2 uuid;
  v_borrada uuid;
  v_t uuid;
  v_res timestamptz;
  r jsonb;
  t public.tickets;
  v_n int;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_116c_jefe@example.test') returning id into v_jefe;
  insert into public.categorias_ticket (id, nombre) values (v_cat, '__TEST_CI__ Origen 116c'), (v_cat2, '__TEST_CI__ Destino 116c');
  insert into public.subcategorias_ticket (categoria_id, nombre) values (v_cat, '__TEST_CI__ S1') returning id into v_s1;
  insert into public.subcategorias_ticket (categoria_id, nombre) values (v_cat2, '__TEST_CI__ S2') returning id into v_s2;
  insert into public.subcategorias_ticket (categoria_id, nombre, deleted_at) values (v_cat2, '__TEST_CI__ Borrada', now()) returning id into v_borrada;
  insert into public.tickets (codigo, token, titulo, descripcion, categoria_id, subcategoria_id, estado, prioridad, tipo)
    values ('__TEST_CI_116C__', lpad('C', 24, 'U'), 'Cerrado', 'd', v_cat, v_s1, 'cerrado', 'baja', 'solicitud') returning id into v_t;
  select resuelto_at into v_res from public.tickets where id = v_t;

  -- 1) autorización
  begin
    perform public.reclasificar_ticket_nucleo(v_t, v_s2, 'motivo', v_jefe, false);
    fallos := fallos || '[116] el nucleo reclasifico sin jefe; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[116] sin jefe lanzo ' || sqlstate || '; '; end if; end;
  begin
    perform public.reclasificar_ticket_nucleo(v_t, v_s2, 'motivo', null, true);
    fallos := fallos || '[116] el nucleo reclasifico sin actor; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[116] sin actor lanzo ' || sqlstate || '; '; end if; end;
  begin
    perform public.reclasificar_ticket(v_t, v_s2, 'motivo');
    fallos := fallos || '[116] la RPC reclasifico sin sesion de jefe; ';
  exception when others then if sqlstate <> '42501' then fallos := fallos || '[116] la RPC sin sesion lanzo ' || sqlstate || '; '; end if; end;

  -- 2) validaciones
  begin
    perform public.reclasificar_ticket_nucleo(v_t, v_s2, E'  \n ', v_jefe, true);
    fallos := fallos || '[116] acepto un motivo vacio; ';
  exception when others then if sqlstate <> 'P0001' then fallos := fallos || '[116] motivo vacio lanzo ' || sqlstate || '; '; end if; end;
  begin
    perform public.reclasificar_ticket_nucleo(v_t, v_s2, repeat('m', 501), v_jefe, true);
    fallos := fallos || '[116] acepto un motivo de 501 caracteres; ';
  exception when others then if sqlstate <> 'P0001' then fallos := fallos || '[116] motivo largo lanzo ' || sqlstate || '; '; end if; end;
  begin
    perform public.reclasificar_ticket_nucleo(v_t, v_borrada, 'motivo', v_jefe, true);
    fallos := fallos || '[116] reclasifico a una subcategoria borrada; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[116] subcategoria borrada lanzo ' || sqlstate || '; '; end if; end;
  begin
    perform public.reclasificar_ticket_nucleo(gen_random_uuid(), v_s2, 'motivo', v_jefe, true);
    fallos := fallos || '[116] reclasifico un ticket inexistente; ';
  exception when others then if sqlstate <> 'P0002' then fallos := fallos || '[116] ticket inexistente lanzo ' || sqlstate || '; '; end if; end;
  if exists (select 1 from public.ticket_eventos where ticket_id = v_t) then
    fallos := fallos || '[116] un rechazo dejo eventos; ';
  end if;

  -- 3) un ticket CERRADO se reclasifica; tipo, prioridad, estado y resuelto_at intactos
  r := public.reclasificar_ticket_nucleo(v_t, v_s2, ' Pertenece a la otra categoria ', v_jefe, true);
  select * into t from public.tickets where id = v_t;
  if (r ->> 'cambio') <> 'true' or t.categoria_id <> v_cat2 or t.subcategoria_id <> v_s2 or t.estado <> 'cerrado'
     or t.prioridad <> 'baja' or t.tipo <> 'solicitud' or t.resuelto_at is distinct from v_res then
    fallos := fallos || '[116] la reclasificacion del ticket cerrado fallo: ' || r::text || '; ';
  end if;
  select count(*) into v_n from public.ticket_eventos
   where ticket_id = v_t and evento = 'categoria_cambiada' and user_id = v_jefe
     and user_email = '__test_ci_116c_jefe@example.test' and detalle like '%Pertenece a la otra categoria' and detalle like '%Destino 116c%';
  if v_n <> 1 then fallos := fallos || '[116] falta el evento categoria_cambiada con autor y motivo; '; end if;
  if exists (select 1 from public.ticket_eventos where ticket_id = v_t and evento <> 'categoria_cambiada') then
    fallos := fallos || '[116] reclasificar dejo eventos de estado, prioridad o tipo; ';
  end if;

  -- 4) misma subcategoría: no actualiza, pero deja la confirmación
  r := public.reclasificar_ticket_nucleo(v_t, v_s2, 'Revisado', v_jefe, true);
  if (r ->> 'cambio') <> 'false'
     or not exists (select 1 from public.ticket_eventos where ticket_id = v_t and evento = 'categoria_cambiada' and detalle like 'Clasificación confirmada%') then
    fallos := fallos || '[116] reclasificar a la misma subcategoria no dejo la confirmacion: ' || r::text || '; ';
  end if;

  -- 5) privilegios y vista
  if not has_function_privilege('authenticated', 'public.reclasificar_ticket(uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.reclasificar_ticket(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.reclasificar_ticket_nucleo(uuid,uuid,text,uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.reclasificar_ticket_nucleo(uuid,uuid,text,uuid,boolean)', 'execute') then
    fallos := fallos || '[116] privilegios de reclasificar_ticket / nucleo incorrectos; ';
  end if;
  if not exists (select 1 from pg_class where relname = 'v_tickets_por_reclasificar' and relnamespace = 'public'::regnamespace
                  and 'security_invoker=true' = any (reloptions)) then
    fallos := fallos || '[116] v_tickets_por_reclasificar no es security_invoker; ';
  end if;
  if has_table_privilege('anon', 'public.v_tickets_por_reclasificar', 'select') then
    fallos := fallos || '[116] anon puede leer v_tickets_por_reclasificar; ';
  end if;
  select count(*) into v_n from public.v_tickets_por_reclasificar;
  if v_n <> 0 then fallos := fallos || '[116] la vista devolvio filas sin sesion de jefe; '; end if;

  if fallos = '' then
    raise exception 'TESTS_OK [116c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [116c]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 117a — reportes centralizados (migración 117): cada núcleo exige el
-- módulo de su fuente (42501 sin él, también con el resto de los módulos y
-- con staff inactivo), la auditoría exige rol:jefe, las RPC públicas sin
-- sesión responden 42501, EXECUTE solo a authenticated en las públicas y
-- solo a project_admin en núcleos y auxiliares, y el período se valida (P0001).
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  v_inact uuid;
  v_caso record;
  v_sql text;
  v_mods text[] := array['tickets', 'empleados', 'correos', 'licencias', 'equipos', 'base_conocimiento', 'problemas', 'encuestas'];
  r jsonb;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_117a_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_117a_asis@example.test') returning id into v_asis;
  insert into auth.users (email) values ('__test_ci_117a_inact@example.test') returning id into v_inact;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true, nombre = 'Jefe 117a' where user_id = v_jefe;
  update public.staff set activo = true, nombre = 'Asistente 117a' where user_id = v_asis;
  update public.staff set activo = false where user_id = v_inact;

  for v_caso in
    select * from (values
      ('reporte_inventario_equipos_de', 'equipos',   false),
      ('reporte_licencias_de',          'licencias', false),
      ('reporte_correos_de',            'correos',   false),
      ('reporte_personal_de',           'empleados', true),
      ('reporte_solicitudes_de',        'empleados', true),
      ('reporte_cambios_de',            'tickets',   true),
      ('reporte_problemas_de',          'problemas', true),
      ('reporte_encuestas_de',          'encuestas', false)
    ) as c(fn, modulo, periodo)
  loop
    v_sql := 'select public.' || v_caso.fn || '($1'
             || case when v_caso.periodo then ', date ''2015-03-01'', date ''2015-03-31''' else '' end || ')';
    delete from public.staff_modulos_permisos where staff_user_id = v_asis;
    insert into public.staff_modulos_permisos (staff_user_id, modulo) values (v_asis, v_caso.modulo);
    begin
      execute v_sql into r using v_asis;
      if r ->> 'definiciones_version' is null or r ->> 'generado_en' is null or r -> 'generado_por' ->> 'user_id' <> v_asis::text
         or jsonb_typeof(r -> 'secciones') <> 'array' or jsonb_typeof(r -> 'filas_csv' -> 'filas') <> 'array' then
        fallos := fallos || '[117] ' || v_caso.fn || ' sin la forma comun; ';
      end if;
    exception when others then
      fallos := fallos || '[117] ' || v_caso.fn || ' con solo el modulo ' || v_caso.modulo || ' lanzo ' || sqlstate || '; ';
    end;
    delete from public.staff_modulos_permisos where staff_user_id = v_asis;
    insert into public.staff_modulos_permisos (staff_user_id, modulo)
      select v_asis, m from unnest(v_mods) m where m <> v_caso.modulo;
    begin
      execute v_sql into r using v_asis;
      fallos := fallos || '[117] ' || v_caso.fn || ' sin el modulo ' || v_caso.modulo || ' no rechazo; ';
    exception when others then
      if sqlstate <> '42501' then fallos := fallos || '[117] ' || v_caso.fn || ' sin modulo lanzo ' || sqlstate || '; '; end if;
    end;
    begin
      execute v_sql into r using v_inact;
      fallos := fallos || '[117] ' || v_caso.fn || ' acepto a un staff inactivo; ';
    exception when others then
      if sqlstate <> '42501' then fallos := fallos || '[117] ' || v_caso.fn || ' inactivo lanzo ' || sqlstate || '; '; end if;
    end;
  end loop;

  -- Auditoría: un asistente con TODOS los módulos no la recibe; el jefe sí.
  delete from public.staff_modulos_permisos where staff_user_id = v_asis;
  insert into public.staff_modulos_permisos (staff_user_id, modulo) select v_asis, m from unnest(v_mods) m;
  begin
    perform public.reporte_auditoria_de(v_asis, date '2015-03-01', date '2015-03-31');
    fallos := fallos || '[117] la auditoria se entrego a un asistente; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[117] auditoria de asistente lanzo ' || sqlstate || '; '; end if;
  end;
  r := public.reporte_auditoria_de(v_jefe, date '2015-03-01', date '2015-03-31');
  if r ->> 'reporte' <> 'auditoria' then fallos := fallos || '[117] la auditoria no llega al jefe; '; end if;

  -- Sin sesión (auth.uid() NULL) las RPC públicas responden 42501.
  for v_caso in
    select * from (values ('reporte_inventario_equipos()'), ('reporte_licencias()'), ('reporte_correos()'),
      ('reporte_personal(date ''2015-03-01'', date ''2015-03-31'')'), ('reporte_solicitudes(date ''2015-03-01'', date ''2015-03-31'')'),
      ('reporte_cambios(date ''2015-03-01'', date ''2015-03-31'')'), ('reporte_problemas(date ''2015-03-01'', date ''2015-03-31'')'),
      ('reporte_encuestas()'), ('reporte_auditoria(date ''2015-03-01'', date ''2015-03-31'')')) as c(llamada)
  loop
    begin
      execute 'select public.' || v_caso.llamada into r;
      fallos := fallos || '[117] ' || v_caso.llamada || ' sin sesion no rechazo; ';
    exception when others then
      if sqlstate <> '42501' then fallos := fallos || '[117] ' || v_caso.llamada || ' sin sesion lanzo ' || sqlstate || '; '; end if;
    end;
  end loop;

  -- Privilegios: públicas a authenticated (nunca anon); núcleos y auxiliares solo project_admin.
  for v_caso in
    select * from (values ('public.reporte_inventario_equipos()'), ('public.reporte_licencias()'), ('public.reporte_correos()'),
      ('public.reporte_personal(date,date)'), ('public.reporte_solicitudes(date,date)'), ('public.reporte_cambios(date,date)'),
      ('public.reporte_problemas(date,date)'), ('public.reporte_encuestas(uuid)'), ('public.reporte_auditoria(date,date)')) as c(f)
  loop
    if not has_function_privilege('authenticated', v_caso.f, 'execute') or has_function_privilege('anon', v_caso.f, 'execute') then
      fallos := fallos || '[117] privilegios de ' || v_caso.f || '; ';
    end if;
  end loop;
  for v_caso in
    select * from (values ('public.reporte_inventario_equipos_de(uuid)'), ('public.reporte_licencias_de(uuid)'), ('public.reporte_correos_de(uuid)'),
      ('public.reporte_personal_de(uuid,date,date)'), ('public.reporte_solicitudes_de(uuid,date,date)'), ('public.reporte_cambios_de(uuid,date,date)'),
      ('public.reporte_problemas_de(uuid,date,date)'), ('public.reporte_encuestas_de(uuid,uuid)'), ('public.reporte_auditoria_de(uuid,date,date)'),
      ('public.reporte_cabecera(uuid,text,date,date)'), ('public.reporte_tabla(text,text,jsonb,jsonb,text)'),
      ('public.reporte_etiqueta(text,text)'), ('public.reporte_validar_periodo(date,date)')) as c(f)
  loop
    if has_function_privilege('authenticated', v_caso.f, 'execute') or has_function_privilege('anon', v_caso.f, 'execute')
       or not has_function_privilege('project_admin', v_caso.f, 'execute') then
      fallos := fallos || '[117] ' || v_caso.f || ' no es solo project_admin; ';
    end if;
  end loop;

  -- Período: invertido o de más de 366 días → P0001.
  begin
    perform public.reporte_personal_de(v_jefe, date '2015-03-31', date '2015-03-01');
    fallos := fallos || '[117] se acepto un periodo invertido; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[117] periodo invertido lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.reporte_auditoria_de(v_jefe, date '2014-01-01', date '2015-03-01');
    fallos := fallos || '[117] se acepto un periodo de mas de 366 dias; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[117] periodo largo lanzo ' || sqlstate || '; '; end if;
  end;

  if fallos = '' then
    raise exception 'TESTS_OK [117a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [117a]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 117b — custodia al corte: inventario (situación, garantías con el
-- parámetro del Inicio, sin devolver con la fecha de baja de la hoja de vida,
-- actas pendientes), licencias (cupo y vencimientos) y correos (rotaciones y
-- su antigüedad). Son fotos de toda la base: se comparan contra el reporte
-- tomado ANTES de sembrar (deltas) y por las filas de los fixtures. Ninguna
-- salida lleva el DNI ni el contacto de los empleados sembrados.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_empresa uuid;
  v_area uuid;
  v_ubic uuid;
  v_ea uuid;
  v_eb uuid;
  v_q uuid[] := '{}';
  v_id uuid;
  v_l1 uuid;
  v_l2 uuid;
  v_c1 uuid;
  r0 jsonb;
  r1 jsonb;
  t jsonb;
  fila jsonb;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_117b_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true, nombre = 'Jefe 117b' where user_id = v_jefe;
  update public.config_parametros set valor = '30'::jsonb where clave = 'dias_por_vencer_garantia';
  update public.config_parametros set valor = '30'::jsonb where clave = 'dias_por_vencer_licencia';
  update public.config_parametros set valor = '"2000-01-01"'::jsonb where clave = 'actas_pendientes_desde';

  r0 := public.reporte_inventario_equipos_de(v_jefe);

  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 117b') returning id into v_empresa;
  insert into public.areas_obras (nombre) values ('__TEST_CI__ Obra 117b') returning id into v_area;
  insert into public.ubicaciones (nombre, tipo) values ('__TEST_CI__ Ubic 117b', 'otro') returning id into v_ubic;
  insert into public.tipos_equipo (id, nombre) values ('t117b', 'Tipo 117b') on conflict do nothing;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, area_obra_id, whatsapp, telefono, correo_personal)
    values ('Activa', 'CI 117b', '99011721', v_empresa, v_area, '999117211', '011172111', 'activa117b@correo.test') returning id into v_ea;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, area_obra_id, estado)
    values ('Baja', 'CI 117b', '99011722', v_empresa, v_area, 'Inactivo') returning id into v_eb;
  insert into public.empleado_eventos (empleado_id, evento, campo, valor_nuevo, rol_actor, detalle, created_at)
    values (v_eb, 'baja_ejecutada', 'estado', 'Inactivo', 'jefe', 'Renuncia', ((v_hoy - 20) + time '10:00') at time zone 'America/Lima');

  -- 0 asignado a la activa (sin acta), 1 asignado a la de baja, 2 disponible con garantía en 5 días,
  -- 3 en reparación con garantía vencida hace 2 días, 4 de baja con garantía en 3 días (no cuenta), 5 en una ubicación
  insert into public.equipos (codigo, tipo_id, estado, garantia_hasta) values ('__CI117B-0', 't117b', 'operativo', null) returning id into v_id; v_q := v_q || v_id;
  insert into public.equipos (codigo, tipo_id, estado, garantia_hasta) values ('__CI117B-1', 't117b', 'operativo', null) returning id into v_id; v_q := v_q || v_id;
  insert into public.equipos (codigo, tipo_id, estado, garantia_hasta) values ('__CI117B-2', 't117b', 'operativo', v_hoy + 5) returning id into v_id; v_q := v_q || v_id;
  insert into public.equipos (codigo, tipo_id, estado, garantia_hasta) values ('__CI117B-3', 't117b', 'en_reparacion', v_hoy - 2) returning id into v_id; v_q := v_q || v_id;
  insert into public.equipos (codigo, tipo_id, estado, garantia_hasta) values ('__CI117B-4', 't117b', 'de_baja', v_hoy + 3) returning id into v_id; v_q := v_q || v_id;
  insert into public.equipos (codigo, tipo_id, estado, garantia_hasta) values ('__CI117B-5', 't117b', 'operativo', null) returning id into v_id; v_q := v_q || v_id;
  insert into public.asignaciones_equipo (equipo_id, empleado_id, fecha_inicio) values (v_q[1], v_ea, v_hoy - 10);
  insert into public.asignaciones_equipo (equipo_id, empleado_id, fecha_inicio) values (v_q[2], v_eb, v_hoy - 100);
  insert into public.asignaciones_equipo (equipo_id, ubicacion_id, fecha_inicio) values (v_q[6], v_ubic, v_hoy - 30);

  r1 := public.reporte_inventario_equipos_de(v_jefe);

  -- Situación: deltas exactos por fila
  for fila in select * from jsonb_array_elements(r1 -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') loop
    if (fila ->> 'equipos')::int - coalesce((select (f0 ->> 'equipos')::int from jsonb_array_elements(r0 -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') f0
                                              where f0 ->> 'situacion' = fila ->> 'situacion'), 0)
       <> (case fila ->> 'situacion' when 'Asignado' then 2 when 'En ubicación' then 1 when 'Disponible' then 1
                                    when 'En reparación' then 1 when 'De baja' then 1 when 'Total' then 6 else 0 end) then
      fallos := fallos || '[117] delta de situacion incorrecto en ' || (fila ->> 'situacion') || '; ';
    end if;
  end loop;
  select x into t from jsonb_array_elements(r1 -> 'secciones' -> 0 -> 'tablas' -> 1 -> 'filas') x where x ->> 'tipo' = 'Tipo 117b';
  if t is null or (t ->> 'total')::int <> 6 or (t ->> 'en_uso')::int <> 3 or (t ->> 'disponibles')::int <> 1
     or (t ->> 'en_reparacion')::int <> 1 or (t ->> 'fuera')::int <> 1 then
    fallos := fallos || '[117] por tipo incorrecto: ' || coalesce(t::text, 'null') || '; ';
  end if;
  select x into t from jsonb_array_elements(r1 -> 'secciones' -> 1 -> 'tablas' -> 1 -> 'filas') x where x ->> 'area' = '__TEST_CI__ Obra 117b';
  if t is null or (t ->> 'personas')::int <> 2 or (t ->> 'equipos')::int <> 2 then
    fallos := fallos || '[117] custodia por area incorrecta: ' || coalesce(t::text, 'null') || '; ';
  end if;
  select x into t from jsonb_array_elements(r1 -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x where x ->> 'ubicacion' = '__TEST_CI__ Ubic 117b';
  if t is null or (t ->> 'operativos')::int <> 1 or (t ->> 'total')::int <> 1 then
    fallos := fallos || '[117] por ubicacion incorrecto; ';
  end if;
  -- Garantías: la disponible (5 días, por vencer) y la en reparación (vencida, -2); la de baja no
  if not exists (select 1 from jsonb_array_elements(r1 -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas') x
                  where x ->> 'codigo' = '__CI117B-2' and (x ->> 'dias')::int = 5 and x ->> 'situacion' = 'Por vencer')
     or not exists (select 1 from jsonb_array_elements(r1 -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas') x
                     where x ->> 'codigo' = '__CI117B-3' and (x ->> 'dias')::int = -2 and x ->> 'situacion' = 'Vencida')
     or exists (select 1 from jsonb_array_elements(r1 -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas') x where x ->> 'codigo' = '__CI117B-4') then
    fallos := fallos || '[117] garantias incorrectas; ';
  end if;
  -- Sin devolver: el equipo de la persona de baja, con la fecha del evento (no updated_at)
  if not exists (select 1 from jsonb_array_elements(r1 -> 'secciones' -> 2 -> 'tablas' -> 1 -> 'filas') x
                  where x ->> 'codigo' = '__CI117B-1' and (x ->> 'baja')::date = v_hoy - 20 and (x ->> 'dias_baja')::int = 20
                    and x ->> 'persona' = 'Baja CI 117b') then
    fallos := fallos || '[117] sin devolver no trae la fecha de baja del evento; ';
  end if;
  -- Actas pendientes: las dos entregas a personas, sin acta, con más de 3 días
  if (select count(*) from jsonb_array_elements(r1 -> 'secciones' -> 2 -> 'tablas' -> 2 -> 'filas') x
       where x ->> 'codigo' in ('__CI117B-0', '__CI117B-1')) <> 2 then
    fallos := fallos || '[117] actas pendientes incorrectas; ';
  end if;
  -- CSV: todo el parque, sin tope; el fixture con su situación y portador
  if jsonb_array_length(r1 -> 'filas_csv' -> 'filas') <> jsonb_array_length(r0 -> 'filas_csv' -> 'filas') + 6
     or not exists (select 1 from jsonb_array_elements(r1 -> 'filas_csv' -> 'filas') x
                     where x ->> 0 = '__CI117B-0' and x ->> 7 = 'Asignado' and x ->> 8 = 'Activa CI 117b') then
    fallos := fallos || '[117] CSV de inventario incompleto; ';
  end if;

  -- Licencias
  r0 := public.reporte_licencias_de(v_jefe);
  insert into public.licencias (software, tipo, cantidad, fecha_vencimiento) values ('__CI117B Suscripcion', 'suscripcion', 2, v_hoy + 5) returning id into v_l1;
  insert into public.licencias (software, tipo, cantidad) values ('__CI117B Perpetua', 'perpetua', 1) returning id into v_l2;
  insert into public.licencias (software, tipo, cantidad, fecha_vencimiento) values ('__CI117B Vencida', 'suscripcion', 1, v_hoy - 3);
  insert into public.asignaciones_licencia (licencia_id, empleado_id) values (v_l1, v_ea), (v_l2, v_ea);
  r1 := public.reporte_licencias_de(v_jefe);
  select x into t from jsonb_array_elements(r1 -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x where x ->> 'software' = '__CI117B Suscripcion';
  if t is null or (t ->> 'usados')::int <> 1 or (t ->> 'libres')::int <> 1 or t ->> 'situacion' <> 'Por vencer' then
    fallos := fallos || '[117] cupo de la suscripcion incorrecto: ' || coalesce(t::text, 'null') || '; ';
  end if;
  select x into t from jsonb_array_elements(r1 -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x where x ->> 'software' = '__CI117B Perpetua';
  if t is null or (t ->> 'libres')::int <> 0 or t ->> 'situacion' <> 'Perpetua' then
    fallos := fallos || '[117] cupo de la perpetua incorrecto; ';
  end if;
  for fila in select * from jsonb_array_elements(r1 -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') loop
    if (fila ->> 'valor')::int - (select (f0 ->> 'valor')::int from jsonb_array_elements(r0 -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') f0
                                   where f0 ->> 'indicador' = fila ->> 'indicador')
       <> (case when fila ->> 'indicador' = 'Licencias registradas' then 3 when fila ->> 'indicador' = 'Asientos comprados' then 4
               when fila ->> 'indicador' = 'Asientos usados' then 2 when fila ->> 'indicador' = 'Asientos libres' then 2
               when fila ->> 'indicador' = 'Licencias sin asientos libres' then 1 when fila ->> 'indicador' = 'Vencidas' then 1
               when fila ->> 'indicador' like 'Por vencer%' then 1 else 0 end) then
      fallos := fallos || '[117] delta de licencias incorrecto en ' || (fila ->> 'indicador') || '; ';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(r1 -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas') x where x ->> 'software' like '__CI117B%') <> 2
     or not exists (select 1 from jsonb_array_elements(r1 -> 'filas_csv' -> 'filas') x where x ->> 0 = '__CI117B Suscripcion' and x ->> 10 = 'Activa CI 117b') then
    fallos := fallos || '[117] vencimientos o CSV de licencias incorrectos; ';
  end if;

  -- Correos
  insert into public.plataformas (id, nombre) values ('ci117b', 'Plataforma 117b') on conflict do nothing;
  insert into public.cuentas (plataforma_id, usuario, password, tipo_cuenta, requiere_rotacion, last_password_change)
    values ('ci117b', 'compartida117b@empresa.test', 'enc2:AAAA:BBBB', 'compartida', true, now() - interval '40 days') returning id into v_c1;
  insert into public.cuentas (plataforma_id, usuario, password, tipo_cuenta) values ('ci117b', 'reutilizable117b@empresa.test', null, 'reutilizable');
  insert into public.asignaciones_cuenta (cuenta_id, empleado_id) values (v_c1, v_ea);
  r1 := public.reporte_correos_de(v_jefe);
  select x into t from jsonb_array_elements(r1 -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x where x ->> 'plataforma' = 'Plataforma 117b';
  if t is null or (t ->> 'compartidas')::int <> 1 or (t ->> 'reutilizables')::int <> 1 or (t ->> 'total')::int <> 2
     or (t ->> 'por_rotar')::int <> 1 or (t ->> 'sin_password')::int <> 1 then
    fallos := fallos || '[117] correos por plataforma incorrecto: ' || coalesce(t::text, 'null') || '; ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r1 -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x
                  where x ->> 'cuenta' = 'compartida117b@empresa.test' and (x ->> 'dias')::int between 39 and 41 and x ->> 'titulares' = 'Activa CI 117b')
     or not exists (select 1 from jsonb_array_elements(r1 -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas') x where x ->> 'cuenta' = 'reutilizable117b@empresa.test')
     or (select count(*) from jsonb_array_elements(r1 -> 'filas_csv' -> 'filas') x where x ->> 2 like '%117b@empresa.test') <> 2 then
    fallos := fallos || '[117] rotaciones, reutilizables o CSV de correos incorrectos; ';
  end if;
  if (r1::text || public.reporte_inventario_equipos_de(v_jefe)::text || public.reporte_licencias_de(v_jefe)::text) ~ '(99011721|99011722|999117211|011172111|activa117b@correo)'
     or (r1::text) like '%enc2:%' then
    fallos := fallos || '[117] un reporte de custodia expone DNI, contacto o contrasena; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [117b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [117b]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 117c — personal: movimientos del período desde empleado_eventos
-- (alta, reingreso, baja por RPC y baja de registro anterior, suspensión,
-- reactivación; un evento fuera del período no cuenta), revisiones de acceso
-- pendientes con el parámetro dias_revision_accesos, foto de hoy por empresa
-- y CSV sin DNI ni contacto. Período fijo de marzo de 2015 (vacío en
-- cualquier base real).
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_empresa uuid;
  v_e uuid[] := '{}';
  v_id uuid;
  r0 jsonb;
  r jsonb;
  t jsonb;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_117c_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true, nombre = 'Jefe 117c' where user_id = v_jefe;
  update public.config_parametros set valor = '180'::jsonb where clave = 'dias_revision_accesos';

  r0 := public.reporte_personal_de(v_jefe, date '2015-03-01', date '2015-03-31');

  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 117c') returning id into v_empresa;
  -- 1 alta vieja sin revisión (pendiente), 2 alta vieja revisada hace 10 días, 3 alta reciente, 4 suspendida, 5 dada de baja
  insert into public.empleados (nombres, apellidos, dni, empresa_id, fecha_alta, cargo, whatsapp, telefono, correo_personal)
    values ('Uno', 'CI 117c', '99011731', v_empresa, date '2010-01-01', 'Topografo', '999117311', '011173111', 'uno117c@correo.test') returning id into v_id; v_e := v_e || v_id;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, fecha_alta, cargo)
    values ('Dos', 'CI 117c', '99011732', v_empresa, date '2010-01-01', 'Topografo') returning id into v_id; v_e := v_e || v_id;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, fecha_alta)
    values ('Tres', 'CI 117c', '99011733', v_empresa, v_hoy - 5) returning id into v_id; v_e := v_e || v_id;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, fecha_alta, estado)
    values ('Cuatro', 'CI 117c', '99011734', v_empresa, date '2010-01-01', 'Suspendido') returning id into v_id; v_e := v_e || v_id;
  insert into public.empleados (nombres, apellidos, dni, empresa_id, fecha_alta, estado)
    values ('Cinco', 'CI 117c', '99011735', v_empresa, date '2010-01-01', 'Inactivo') returning id into v_id; v_e := v_e || v_id;
  insert into public.empleado_revisiones_acceso (empleado_id, revisado_por, revisado_at) values (v_e[2], v_jefe, now() - interval '10 days');
  insert into public.empleado_eventos (empleado_id, evento, campo, valor_nuevo, rol_actor, detalle, created_at) values
    (v_e[1], 'creado',         'estado', 'Activo',     'jefe',   'Alta en el sistema',   timestamptz '2015-03-05 10:00-05'),
    (v_e[2], 'reingreso',      'estado', 'Activo',     'jefe',   'Reingreso',            timestamptz '2015-03-10 10:00-05'),
    (v_e[5], 'baja_ejecutada', 'estado', 'Inactivo',   'jefe',   'Renuncia',             timestamptz '2015-03-15 10:00-05'),
    (v_e[3], 'estado_cambiado','estado', 'Inactivo',   'legado', 'Fecha aproximada',     timestamptz '2015-03-20 10:00-05'),
    (v_e[4], 'suspendido',     'estado', 'Suspendido', 'jefe',   'Investigacion',        timestamptz '2015-03-25 10:00-05'),
    (v_e[4], 'reactivado',     'estado', 'Activo',     'jefe',   null,                   timestamptz '2015-03-26 10:00-05'),
    (v_e[1], 'baja_ejecutada', 'estado', 'Inactivo',   'jefe',   'Fuera del periodo',    timestamptz '2015-04-02 10:00-05'),
    (v_e[1], 'accesos_revisados', null,  null,         'jefe',   'No es un movimiento',  timestamptz '2015-03-06 10:00-05');

  r := public.reporte_personal_de(v_jefe, date '2015-03-01', date '2015-03-31');

  if (select string_agg((x ->> 'movimiento') || '=' || (x ->> 'cantidad'), ',' order by x ->> 'movimiento')
        from jsonb_array_elements(r -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x)
     <> 'Altas=1,Bajas=2,Reactivaciones=1,Reingresos=1,Suspensiones=1' then
    fallos := fallos || '[117] movimientos del periodo incorrectos: ' || (r -> 'secciones' -> 1 -> 'tablas' -> 0 ->> 'filas') || '; ';
  end if;
  if jsonb_array_length(r -> 'secciones' -> 1 -> 'tablas' -> 1 -> 'filas') <> 2
     or jsonb_array_length(r -> 'secciones' -> 1 -> 'tablas' -> 2 -> 'filas') <> 2
     or not exists (select 1 from jsonb_array_elements(r -> 'secciones' -> 1 -> 'tablas' -> 2 -> 'filas') x
                     where x ->> 'persona' = 'Cinco CI 117c' and x ->> 'detalle' = 'Renuncia' and (x ->> 'fecha')::date = date '2015-03-15') then
    fallos := fallos || '[117] detalle de altas o bajas incorrecto; ';
  end if;
  -- Revisiones: Uno (nunca revisado, alta 2010) y Cuatro (suspendida) pendientes; Dos (revisado) y Tres (reciente) no; Cinco (baja) no
  if (select string_agg(x ->> 'persona', ',' order by x ->> 'persona') from jsonb_array_elements(r -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas') x
       where x ->> 'persona' like '%CI 117c') <> 'Cuatro CI 117c,Uno CI 117c'
     or not exists (select 1 from jsonb_array_elements(r -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas') x
                     where x ->> 'persona' = 'Uno CI 117c' and (x ->> 'dias')::int = v_hoy - date '2010-01-01' and x -> 'ultima_revision' = 'null'::jsonb) then
    fallos := fallos || '[117] revisiones pendientes incorrectas; ';
  end if;
  -- Foto de hoy: la empresa del fixture y los deltas del resumen
  select x into t from jsonb_array_elements(r -> 'secciones' -> 0 -> 'tablas' -> 1 -> 'filas') x where x ->> 'empresa' = '__TEST_CI__ Empresa 117c';
  if t is null or (t ->> 'activos')::int <> 3 or (t ->> 'suspendidos')::int <> 1 then
    fallos := fallos || '[117] por empresa incorrecto: ' || coalesce(t::text, 'null') || '; ';
  end if;
  if (select (x ->> 'cantidad')::int from jsonb_array_elements(r -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x where x ->> 'indicador' = 'Activos')
     - (select (x ->> 'cantidad')::int from jsonb_array_elements(r0 -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x where x ->> 'indicador' = 'Activos') <> 3
     or (select (x ->> 'cantidad')::int from jsonb_array_elements(r -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x where x ->> 'indicador' = 'Revisiones de acceso pendientes')
     - (select (x ->> 'cantidad')::int from jsonb_array_elements(r0 -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x where x ->> 'indicador' = 'Revisiones de acceso pendientes') <> 2 then
    fallos := fallos || '[117] deltas del resumen de personal incorrectos; ';
  end if;
  -- CSV: todos los empleados vivos, sin tope y sin DNI ni contacto
  if jsonb_array_length(r -> 'filas_csv' -> 'filas') <> jsonb_array_length(r0 -> 'filas_csv' -> 'filas') + 5
     or exists (select 1 from jsonb_array_elements(r -> 'filas_csv' -> 'columnas') c where c ->> 'clave' in ('dni', 'telefono', 'whatsapp', 'correo_personal'))
     or r::text ~ '(9901173[1-5]|999117311|011173111|uno117c@correo)' then
    fallos := fallos || '[117] el reporte de personal expone DNI o contacto, o el CSV tiene tope; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [117c] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [117c]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 117d — solicitudes (creadas, completadas y canceladas por la fecha
-- de cada hecho; mediana y promedio del trámite con n; abiertas por tramo) y
-- cambios (misma definición que v_kpi_cambios sobre el período: sin
-- borradores ni cancelados; emergencias sin aprobar de la vista de la 107;
-- revertidos con su motivo). Códigos explícitos: ninguna secuencia avanza.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_empresa uuid;
  v_e1 uuid;
  v_e2 uuid;
  r jsonb;
  t jsonb;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_117d_jefe@example.test') returning id into v_jefe;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true, nombre = 'Jefe 117d' where user_id = v_jefe;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 117d') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Uno', 'CI 117d', '99011741', v_empresa) returning id into v_e1;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Dos', 'CI 117d', '99011742', v_empresa) returning id into v_e2;

  insert into public.solicitudes (codigo, tipo_id, empleado_id, estado, created_at, completada_at) values
    ('__TEST_CI_117D_S1', 'alta_empleado', v_e1, 'completada', timestamptz '2015-03-02 12:00-05', timestamptz '2015-03-04 12:00-05'),
    ('__TEST_CI_117D_S2', 'alta_empleado', v_e2, 'completada', timestamptz '2015-03-05 12:00-05', timestamptz '2015-03-09 12:00-05');
  insert into public.solicitudes (codigo, tipo_id, empleado_id, estado, created_at, cancelada_at, motivo_cancelacion) values
    ('__TEST_CI_117D_S3', 'baja_empleado', v_e1, 'cancelada', timestamptz '2015-03-10 12:00-05', timestamptz '2015-03-11 12:00-05', 'Duplicada');
  insert into public.solicitudes (codigo, tipo_id, empleado_id, estado, created_at) values
    ('__TEST_CI_117D_S4', 'licencia', v_e1, 'abierta', now() - interval '10 days');

  r := public.reporte_solicitudes_de(v_jefe, date '2015-03-01', date '2015-03-31');
  if (select string_agg((x ->> 'indicador') || '=' || (x ->> 'cantidad'), ',') from jsonb_array_elements(r -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x
       where x ->> 'indicador' <> 'Abiertas hoy')
     <> 'Creadas en el período=3,Completadas en el período=2,Canceladas en el período=1' then
    fallos := fallos || '[117] resumen de solicitudes incorrecto: ' || (r -> 'secciones' -> 0 -> 'tablas' -> 0 ->> 'filas') || '; ';
  end if;
  select x into t from jsonb_array_elements(r -> 'secciones' -> 0 -> 'tablas' -> 1 -> 'filas') x where x ->> 'tipo' = 'Alta de empleado';
  if t is null or (t ->> 'creadas')::int <> 2 or (t ->> 'completadas')::int <> 2 or (t ->> 'n')::int <> 2
     or (t ->> 'mediana')::numeric <> 3.0 or (t ->> 'promedio')::numeric <> 3.0 then
    fallos := fallos || '[117] tiempo de tramite por tipo incorrecto: ' || coalesce(t::text, 'null') || '; ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'secciones' -> 1 -> 'tablas' -> 1 -> 'filas') x
                  where x ->> 'codigo' = '__TEST_CI_117D_S4' and (x ->> 'dias')::int = 10 and x ->> 'avance' = '0 de 0') then
    fallos := fallos || '[117] la abierta no aparece con su antiguedad; ';
  end if;
  if (select count(*) from jsonb_array_elements(r -> 'filas_csv' -> 'filas') x where x ->> 0 like '__TEST_CI_117D_S%') <> 4
     or r::text ~ '(99011741|99011742)' then
    fallos := fallos || '[117] CSV de solicitudes incompleto o con DNI; ';
  end if;

  insert into public.cambios (codigo, titulo, tipo, riesgo, servicio_id, descripcion, plan_retroceso, ventana_inicio, ventana_fin,
                              estado, resultado, inicio_real_at, fin_real_at, created_at) values
    ('__TEST_CI_117D_C1', 'Cambio revertido', 'normal', 'medio', 'correo', 'd', 'volver', timestamptz '2015-03-03 10:00-05', timestamptz '2015-03-03 12:00-05',
     'revertido', 'Fallo la migracion', timestamptz '2015-03-03 10:00-05', timestamptz '2015-03-03 11:00-05', timestamptz '2015-03-03 09:00-05'),
    ('__TEST_CI_117D_C2', 'Cambio estandar', 'estandar', 'bajo', 'correo', 'd', null, timestamptz '2015-03-04 10:00-05', timestamptz '2015-03-04 12:00-05',
     'cerrado', 'Listo', timestamptz '2015-03-04 10:00-05', timestamptz '2015-03-04 11:00-05', timestamptz '2015-03-04 09:00-05'),
    ('__TEST_CI_117D_C4', 'Cambio en borrador', 'normal', 'bajo', 'correo', 'd', null, null, null,
     'borrador', null, null, null, timestamptz '2015-03-06 09:00-05'),
    ('__TEST_CI_117D_C5', 'Cambio cancelado', 'normal', 'bajo', 'correo', 'd', null, null, null,
     'cancelado', 'No hizo falta', null, null, timestamptz '2015-03-07 09:00-05');
  insert into public.cambios (codigo, titulo, tipo, riesgo, servicio_id, descripcion, plan_retroceso, estado, inicio_real_at,
                              aprobacion_pendiente_hasta, created_at) values
    ('__TEST_CI_117D_C3', 'Emergencia sin aprobar', 'emergencia', 'alto', 'correo', 'd', 'volver', 'en_ejecucion', timestamptz '2015-03-05 10:00-05',
     now() - interval '1 day', timestamptz '2015-03-05 09:00-05');

  r := public.reporte_cambios_de(v_jefe, date '2015-03-01', date '2015-03-31');
  if (select string_agg((x ->> 'tipo') || ':' || (x ->> 'pedidos') || '/' || (x ->> 'ejecutados') || '/' || (x ->> 'implementados')
                        || '/' || (x ->> 'revertidos') || '/' || coalesce(x ->> 'pct_revertidos', '-'), ',')
        from jsonb_array_elements(r -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x)
     <> 'Estándar:1/1/1/0/0,Normal:1/1/0/1/100,Emergencia:1/1/0/0/0' then
    fallos := fallos || '[117] cambios por tipo incorrectos: ' || (r -> 'secciones' -> 0 -> 'tablas' -> 0 ->> 'filas') || '; ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x
                  where x ->> 'codigo' = '__TEST_CI_117D_C3' and (x ->> 'dias')::int = 1 and x ->> 'estado' = 'En ejecución') then
    fallos := fallos || '[117] la emergencia sin aprobar no aparece; ';
  end if;
  if jsonb_array_length(r -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas') <> 1
     or r -> 'secciones' -> 2 -> 'tablas' -> 0 -> 'filas' -> 0 ->> 'motivo' <> 'Fallo la migracion' then
    fallos := fallos || '[117] revertidos incorrectos; ';
  end if;
  if (select string_agg(x ->> 0, ',' order by x ->> 0) from jsonb_array_elements(r -> 'filas_csv' -> 'filas') x)
     <> '__TEST_CI_117D_C1,__TEST_CI_117D_C2,__TEST_CI_117D_C3,__TEST_CI_117D_C5' then
    fallos := fallos || '[117] CSV de cambios incorrecto (el borrador no va, el cancelado si); ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [117d] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [117d]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 117e — problemas y conocimiento (secciones según módulos, con aviso),
-- encuestas (resultados anónimos por pregunta, porcentajes sobre quienes
-- respondieron, CSV por respuesta) y auditoría (conteos del período, «quién»
-- sin sesión, nunca IP ni user_agent).
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_p1 uuid;
  v_enc uuid;
  v_ronda uuid;
  r jsonb;
  t jsonb;
  fallos text := '';
begin
  insert into auth.users (email) values ('__test_ci_117e_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_117e_asis@example.test') returning id into v_asis;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true, nombre = 'Jefe 117e' where user_id = v_jefe;
  update public.staff set activo = true, nombre = 'Asistente 117e' where user_id = v_asis;
  delete from public.staff_modulos_permisos where staff_user_id = v_asis;
  insert into public.staff_modulos_permisos (staff_user_id, modulo) values (v_asis, 'problemas');

  -- Problemas
  insert into public.problemas (titulo, descripcion, estado, severidad, error_conocido, created_at)
    values ('__TEST_CI_117E Problema conocido', 'd', 'abierto', 'alta', true, timestamptz '2015-03-02 10:00-05') returning id into v_p1;
  insert into public.problemas (titulo, descripcion, estado, severidad, created_at)
    values ('__TEST_CI_117E Problema viejo', 'd', 'abierto', 'baja', timestamptz '2015-04-02 10:00-05');
  insert into public.acciones_correctivas (problema_id, descripcion, estado, fecha_limite)
    values (v_p1, '__TEST_CI_117E Accion', 'pendiente', v_hoy - 4);
  r := public.reporte_problemas_de(v_jefe, date '2015-03-01', date '2015-03-31');
  if (select (x ->> 'cantidad')::int from jsonb_array_elements(r -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x
       where x ->> 'indicador' = 'Creados en el período') <> 1 then
    fallos := fallos || '[117] problemas creados en el periodo incorrecto; ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x
                  where x ->> 'problema' = '__TEST_CI_117E Problema conocido' and x ->> 'workaround' = 'No' and x ->> 'severidad' = 'Alta')
     or not exists (select 1 from jsonb_array_elements(r -> 'secciones' -> 1 -> 'tablas' -> 1 -> 'filas') x
                     where x ->> 'accion' = '__TEST_CI_117E Accion' and (x ->> 'dias')::int = 4) then
    fallos := fallos || '[117] errores conocidos o acciones vencidas incorrectos; ';
  end if;
  if jsonb_array_length(r -> 'secciones') <> 4 or jsonb_array_length(r -> 'avisos') <> 0 then
    fallos := fallos || '[117] el jefe no recibe las 4 secciones de problemas; ';
  end if;
  r := public.reporte_problemas_de(v_asis, date '2015-03-01', date '2015-03-31');
  if jsonb_array_length(r -> 'secciones') <> 2 or jsonb_array_length(r -> 'avisos') <> 2
     or exists (select 1 from jsonb_array_elements(r -> 'secciones') s where s ->> 'id' in ('conocimiento', 'recurrencias')) then
    fallos := fallos || '[117] sin conocimiento ni tickets, las secciones no se omiten con aviso: ' || (r ->> 'avisos') || '; ';
  end if;

  -- Encuestas
  insert into public.encuestas (titulo, preguntas) values ('__TEST_CI_117E Encuesta', jsonb_build_array(
      jsonb_build_object('id', 'q1', 'tipo', 'escala_1_5', 'etiqueta', 'Satisfaccion'),
      jsonb_build_object('id', 'q2', 'tipo', 'opcion_unica', 'etiqueta', 'Canal', 'opciones', jsonb_build_array('A', 'B')),
      jsonb_build_object('id', 'q3', 'tipo', 'si_no', 'etiqueta', 'Equipo adecuado'),
      jsonb_build_object('id', 'q4', 'tipo', 'texto_largo', 'etiqueta', 'Comentario')))
    returning id into v_enc;
  insert into public.encuesta_rondas (encuesta_id, slug, abierta_en) values (v_enc, '__ci-117e-ronda', now() - interval '2 days') returning id into v_ronda;
  insert into public.encuesta_respuestas (ronda_id, respuestas, created_at) values
    (v_ronda, '{"q1": 5, "q2": "A", "q3": true, "q4": "Muy bien"}'::jsonb, now() - interval '3 hours'),
    (v_ronda, '{"q1": 3, "q2": "B", "q3": false, "q4": ""}'::jsonb, now() - interval '2 hours'),
    (v_ronda, '{"q1": 4, "q2": "A"}'::jsonb, now() - interval '1 hour');
  r := public.reporte_encuestas_de(v_jefe, v_ronda);
  t := r -> 'secciones' -> 0 -> 'tablas';
  if (r -> 'ronda' ->> 'respuestas')::int <> 3 or jsonb_array_length(t) <> 4
     or (select string_agg((x ->> 'opcion') || '=' || (x ->> 'respuestas'), ',') from jsonb_array_elements(t -> 0 -> 'filas') x) <> '5=1,4=1,3=1,2=0,1=0'
     or t -> 0 ->> 'nota' not like '%promedio 4,00 sobre 5%'
     or (select string_agg((x ->> 'opcion') || '=' || (x ->> 'respuestas') || '/' || (x ->> 'pct'), ',') from jsonb_array_elements(t -> 1 -> 'filas') x) <> 'A=2/67,B=1/33'
     or (select string_agg((x ->> 'opcion') || '=' || (x ->> 'pct'), ',') from jsonb_array_elements(t -> 2 -> 'filas') x) <> 'Sí=50,No=50'
     or t -> 2 ->> 'nota' not like '2 de 3 respondieron%'
     or jsonb_array_length(t -> 3 -> 'filas') <> 1 or t -> 3 -> 'filas' -> 0 ->> 'respuesta' <> 'Muy bien' then
    fallos := fallos || '[117] resultados de la encuesta incorrectos: ' || t::text || '; ';
  end if;
  if jsonb_array_length(r -> 'filas_csv' -> 'filas') <> 3 or jsonb_array_length(r -> 'filas_csv' -> 'columnas') <> 4
     or r -> 'filas_csv' -> 'filas' -> 0 <> '["5", "A", "Sí", "Muy bien"]'::jsonb
     or r -> 'filas_csv' -> 'filas' -> 2 <> '["4", "A", "", ""]'::jsonb then
    fallos := fallos || '[117] CSV de la encuesta incorrecto: ' || (r ->> 'filas_csv') || '; ';
  end if;
  begin
    perform public.reporte_encuestas_de(v_jefe, gen_random_uuid());
    fallos := fallos || '[117] una ronda inexistente no se rechazo; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[117] ronda inexistente lanzo ' || sqlstate || '; '; end if;
  end;

  -- Auditoría (marzo de 2015)
  insert into public.accesos_log (user_id, user_email, cuenta_usuario, plataforma, accion, detalle, ip, user_agent, created_at) values
    (v_jefe, 'jefe117e@empresa.test', 'cuenta117e', 'Gmail', 'ver',             'Motivo: soporte', '203.0.113.117', 'AgenteCI117', timestamptz '2015-03-02 10:00-05'),
    (v_jefe, 'jefe117e@empresa.test', 'cuenta117e', 'Gmail', 'copiar',          null,              '203.0.113.117', 'AgenteCI117', timestamptz '2015-03-02 10:01-05'),
    (v_asis, 'asis117e@empresa.test', '(ruta)',     null,    'acceso_denegado', 'Ruta /actividad', '203.0.113.117', 'AgenteCI117', timestamptz '2015-03-03 10:00-05'),
    (v_jefe, 'jefe117e@empresa.test', 'Acceso 117e', null,   'permiso_otorgado', 'Asistente 117e', null,           null,          timestamptz '2015-03-04 10:00-05'),
    (null,   null,                    '(sistema)',  null,    'purga_ejecutada', '{"entregas": 2}', null,           null,          timestamptz '2015-03-05 10:00-05'),
    (null,   null,                    'cuenta117e', 'Gmail', 'entrega_abierta', 'Abierta',         '203.0.113.117', 'AgenteCI117', timestamptz '2015-03-06 10:00-05'),
    (v_jefe, 'jefe117e@empresa.test', 'cuenta117e', 'Gmail', 'ver',             'Fuera',           null,           null,          timestamptz '2015-04-01 10:00-05');
  r := public.reporte_auditoria_de(v_jefe, date '2015-03-01', date '2015-03-31');
  if (select sum((x ->> 'registros')::int) from jsonb_array_elements(r -> 'secciones' -> 0 -> 'tablas' -> 0 -> 'filas') x) <> 6
     or jsonb_array_length(r -> 'filas_csv' -> 'filas') <> 6 then
    fallos := fallos || '[117] conteo de auditoria del periodo incorrecto; ';
  end if;
  select x into t from jsonb_array_elements(r -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x where x ->> 'quien' = 'Jefe 117e';
  if t is null or (t ->> 'vistas')::int <> 1 or (t ->> 'copias')::int <> 1 or (t ->> 'total')::int <> 3 then
    fallos := fallos || '[117] auditoria por persona incorrecta: ' || coalesce(t::text, 'null') || '; ';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'secciones' -> 1 -> 'tablas' -> 0 -> 'filas') x where x ->> 'quien' = 'Empleado, vía enlace')
     or not exists (select 1 from jsonb_array_elements(r -> 'secciones' -> 5 -> 'tablas' -> 0 -> 'filas') x where x ->> 'quien' = 'Sistema')
     or jsonb_array_length(r -> 'secciones' -> 3 -> 'tablas' -> 0 -> 'filas') <> 1
     or jsonb_array_length(r -> 'secciones' -> 4 -> 'tablas' -> 0 -> 'filas') <> 1 then
    fallos := fallos || '[117] quien sin sesion, denegados o permisos incorrectos; ';
  end if;
  if r::text like '%203.0.113.117%' or r::text like '%AgenteCI117%'
     or exists (select 1 from jsonb_array_elements(r -> 'filas_csv' -> 'columnas') c where c ->> 'clave' in ('ip', 'user_agent')) then
    fallos := fallos || '[117] la auditoria expone IP o user_agent; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [117e] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [117e]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 118a — tablero de mesa de ayuda (migración 118): en una semana de
-- marzo de 2015 (vacía en cualquier base) el % resuelto cuenta solo lo que
-- ingresó y no se rechazó, por día cubre los 7 días, los pendientes al inicio
-- y al cierre salen de backlog_tickets_en (lo mismo que los tramos), los
-- solicitantes agrupan lo que ingresó, y por técnico muestra a cada técnico de
-- mesa (aunque no haya resuelto nada) y a la jefatura en «otros».
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  v_asis2 uuid;
  v_empresa uuid;
  v_e1 uuid;
  v_e2 uuid;
  v_t uuid;
  v_lun date := date '2015-03-09'; -- lunes de una semana fija y vacía en cualquier base
  v_dom date;
  r jsonb;
  f jsonb;
  fallos text := '';
begin
  v_dom := v_lun + 6;
  insert into auth.users (email) values ('__test_ci_118a_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_118a_asis@example.test') returning id into v_asis;
  insert into auth.users (email) values ('__test_ci_118a_asis2@example.test') returning id into v_asis2;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true, nombre = 'Jefe 118a', tecnico_mesa = false where user_id = v_jefe;
  update public.staff set activo = true, nombre = 'Tecnico 118a', tecnico_mesa = true where user_id = v_asis;
  update public.staff set activo = true, nombre = 'Tecnico Dos 118a', tecnico_mesa = true where user_id = v_asis2;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 118a') returning id into v_empresa;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'Uno 118a', '99011811', v_empresa) returning id into v_e1;
  insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Test', 'Dos 118a', '99011812', v_empresa) returning id into v_e2;

  alter table public.tickets disable trigger tickets_resuelto_at;
  -- T1: ingresa y se resuelve el martes (técnico), encuesta 5
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_118A_1', lpad('118a1', 24, 'x'), 'T1', 'd', 'cerrado', 'media', v_e1,
            ((v_lun + 1) + time '08:00') at time zone 'America/Lima', ((v_lun + 1) + time '10:00') at time zone 'America/Lima')
    returning id into v_t;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_t, 'estado_cambiado', 'De "abierto" a "resuelto"', ((v_lun + 1) + time '10:00') at time zone 'America/Lima', v_asis);
  insert into public.ticket_satisfaccion (ticket_id, nivel, fecha_envio, created_at)
    values (v_t, 5, ((v_lun + 2) + time '09:00') at time zone 'America/Lima', ((v_lun + 1) + time '10:00:01') at time zone 'America/Lima');
  -- T2: ingresa el martes, lo resuelve el jefe el jueves, encuesta 2
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_118A_2', lpad('118a2', 24, 'x'), 'T2', 'd', 'cerrado', 'alta', v_e1,
            ((v_lun + 1) + time '09:00') at time zone 'America/Lima', ((v_lun + 3) + time '09:00') at time zone 'America/Lima')
    returning id into v_t;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_t, 'estado_cambiado', 'De "abierto" a "resuelto"', ((v_lun + 3) + time '09:00') at time zone 'America/Lima', v_jefe);
  insert into public.ticket_satisfaccion (ticket_id, nivel, fecha_envio, created_at)
    values (v_t, 2, ((v_lun + 4) + time '09:00') at time zone 'America/Lima', ((v_lun + 3) + time '09:00:01') at time zone 'America/Lima');
  -- T3: ingresa el miércoles y se rechaza
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at)
    values ('__TEST_CI_118A_3', lpad('118a3', 24, 'x'), 'T3', 'd', 'rechazado', 'baja', v_e2,
            ((v_lun + 2) + time '08:00') at time zone 'America/Lima')
    returning id into v_t;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_t, 'estado_cambiado', 'De "abierto" a "rechazado"', ((v_lun + 2) + time '09:00') at time zone 'America/Lima', v_jefe);
  -- T4: ingresa el jueves y sigue abierto, asignado al técnico
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, asignado_a, created_at)
    values ('__TEST_CI_118A_4', lpad('118a4', 24, 'x'), 'T4', 'd', 'abierto', 'media', v_e2, v_asis,
            ((v_lun + 3) + time '08:00') at time zone 'America/Lima');
  -- T5: ingresó el jueves anterior y el técnico lo resuelve el lunes (arrastrado)
  insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
    values ('__TEST_CI_118A_5', lpad('118a5', 24, 'x'), 'T5', 'd', 'cerrado', 'media', v_e1,
            ((v_lun - 4) + time '08:00') at time zone 'America/Lima', (v_lun + time '10:00') at time zone 'America/Lima')
    returning id into v_t;
  insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id) values
    (v_t, 'estado_cambiado', 'De "abierto" a "resuelto"', (v_lun + time '10:00') at time zone 'America/Lima', v_asis);
  alter table public.tickets enable trigger tickets_resuelto_at;

  r := public.reporte_tickets_de(v_jefe, v_lun, v_dom);
  f := r -> 'tablero';
  if (f ->> 'ingresaron')::int <> 4 or (f ->> 'rechazados')::int <> 1 or (f ->> 'validos')::int <> 3
     or (f ->> 'resueltos')::int <> 3 or (f ->> 'resueltos_de_ingresados')::int <> 2 or (f ->> 'pct_resuelto')::int <> 67
     or (f ->> 'pendientes_inicio')::int <> 1 or (f ->> 'pendientes_cierre')::int <> 1 then
    fallos := fallos || '[118] tablero de la semana incorrecto: ' || coalesce(f::text, 'null') || '; ';
  end if;
  if jsonb_array_length(r -> 'por_dia') <> 7
     or (r -> 'por_dia' -> 1 ->> 'ingresaron')::int <> 2 or (r -> 'por_dia' -> 1 ->> 'resueltos')::int <> 1
     or (r -> 'por_dia' -> 0 ->> 'resueltos')::int <> 1 or (r -> 'por_dia' -> 2 ->> 'rechazados')::int <> 1
     or (select sum((d ->> 'ingresaron')::int) from jsonb_array_elements(r -> 'por_dia') d) <> 4 then
    fallos := fallos || '[118] por_dia incorrecto: ' || coalesce(r ->> 'por_dia', 'null') || '; ';
  end if;
  if (r -> 'pendientes' ->> 'total')::int <> 1 or (r -> 'pendientes' ->> 'referencia') <> 'cierre'
     or (r -> 'pendientes' -> 'lista' -> 0 ->> 'codigo') <> '__TEST_CI_118A_4'
     or (r -> 'pendientes' -> 'lista' -> 0 ->> 'dias')::int <> 3
     or (r -> 'pendientes' ->> 'total')::int <> (r -> 'volumen' -> 'backlog' ->> 'total')::int then
    fallos := fallos || '[118] pendientes incorrectos: ' || coalesce(r ->> 'pendientes', 'null') || '; ';
  end if;
  if (r -> 'solicitantes' ->> 'total')::int <> 2
     or not exists (select 1 from jsonb_array_elements(r -> 'solicitantes' -> 'top') s
                     where s ->> 'solicitante' = 'Test Dos 118a' and (s ->> 'tickets')::int = 2 and (s ->> 'sin_resolver')::int = 1)
     or not exists (select 1 from jsonb_array_elements(r -> 'solicitantes' -> 'top') s
                     where s ->> 'solicitante' = 'Test Uno 118a' and (s ->> 'tickets')::int = 2 and (s ->> 'sin_resolver')::int = 0) then
    fallos := fallos || '[118] solicitantes incorrectos: ' || coalesce(r ->> 'solicitantes', 'null') || '; ';
  end if;
  if (r -> 'calidad' -> 'csat' ->> 'satisfechos')::int <> 1 or (r -> 'calidad' -> 'csat' ->> 'regulares')::int <> 0
     or r -> 'calidad' -> 'csat' -> 'pct_satisfaccion' <> 'null'::jsonb then
    fallos := fallos || '[118] satisfechos del periodo incorrectos: ' || (r -> 'calidad' ->> 'csat') || '; ';
  end if;
  -- por técnico: el técnico (2 resueltos: 1 del período y 1 arrastrado, 1 asignado hoy), el otro técnico en cero y la
  -- jefatura en «otros» (sin nombre ni id)
  if not exists (select 1 from jsonb_array_elements(r -> 'por_tecnico') t
                  where (t ->> 'tecnico_id')::uuid = v_asis and t ->> 'grupo' = 'tecnico' and (t ->> 'resueltos')::int = 2
                    and (t ->> 'mismo_periodo')::int = 1 and (t ->> 'arrastrados')::int = 1 and (t ->> 'asignados_hoy')::int = 1
                    and (t -> 'csat' ->> 'satisfechos')::int = 1)
     or not exists (select 1 from jsonb_array_elements(r -> 'por_tecnico') t
                     where (t ->> 'tecnico_id')::uuid = v_asis2 and (t ->> 'resueltos')::int = 0)
     or not exists (select 1 from jsonb_array_elements(r -> 'por_tecnico') t
                     where t ->> 'grupo' = 'otros' and t -> 'tecnico_id' = 'null'::jsonb and (t ->> 'resueltos')::int = 1)
     or exists (select 1 from jsonb_array_elements(r -> 'por_tecnico') t where (t ->> 'tecnico_id')::uuid = v_jefe) then
    fallos := fallos || '[118] por_tecnico incorrecto: ' || coalesce(r ->> 'por_tecnico', 'null') || '; ';
  end if;
  if (select sum((t ->> 'resueltos')::int) from jsonb_array_elements(r -> 'por_tecnico') t) <> (r -> 'tablero' ->> 'resueltos')::int then
    fallos := fallos || '[118] la suma por tecnico no da los resueltos del tablero; ';
  end if;
  if r ->> 'definiciones_version' <> 'reportes-2026-10-06' then
    fallos := fallos || '[118] definiciones_version no se actualizo; ';
  end if;
  -- un día: un solo elemento en por_dia; la semana se compara con los 7 días anteriores (con su tablero)
  r := public.reporte_tickets_de(v_jefe, v_lun + 1, v_lun + 1);
  if jsonb_array_length(r -> 'por_dia') <> 1 or (r -> 'tablero' ->> 'ingresaron')::int <> 2
     or (r -> 'comparacion' -> 'periodo' ->> 'desde')::date <> v_lun or r -> 'comparacion' -> 'tablero' is null then
    fallos := fallos || '[118] el reporte de un dia es incorrecto: ' || coalesce(r ->> 'tablero', 'null') || '; ';
  end if;
  -- alcance técnico: sin tablero, por día, pendientes ni solicitantes
  r := public.reporte_tickets_de(v_jefe, v_lun, v_dom, v_asis);
  if r -> 'tablero' <> 'null'::jsonb or r -> 'por_dia' <> 'null'::jsonb or r -> 'pendientes' <> 'null'::jsonb or r -> 'solicitantes' <> 'null'::jsonb then
    fallos := fallos || '[118] el alcance tecnico trae bloques de equipo; ';
  end if;
  -- más de 31 días: sin por_dia
  r := public.reporte_tickets_de(v_jefe, v_lun - 40, v_dom);
  if r -> 'por_dia' <> 'null'::jsonb then
    fallos := fallos || '[118] por_dia aparece en un periodo de mas de 31 dias; ';
  end if;
  -- la lista de vigentes y los tramos cuentan lo mismo a cualquier instante
  if (select sum(cantidad) from public.backlog_tramos_en((v_lun + 4)::timestamp at time zone 'America/Lima'))
     <> (select count(*) from public.backlog_tickets_en((v_lun + 4)::timestamp at time zone 'America/Lima')) then
    fallos := fallos || '[118] backlog_tramos_en y backlog_tickets_en no coinciden; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [118a] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [118a]: %', fallos;
  end if;
end $$;

-- ============================================================
-- BLOQUE 118b — satisfacción por período (118): por solicitante (tickets,
-- encuestas que le faltan, % y situación con los umbrales de
-- config_parametros), por técnico de mesa solo para el JEFE (la jefatura en
-- «otros»), el técnico de cada respuesta oculto para el resto, el consolidado
-- de la 115 delegando, y el período validado.
-- ============================================================
do $$
declare
  v_jefe uuid;
  v_asis uuid;
  v_sinmod uuid;
  v_empresa uuid;
  v_e uuid[] := array[]::uuid[];
  v_id uuid;
  v_t uuid;
  v_m date := date '2015-03-01'; -- mes fijo y vacío en cualquier base
  v_m_fin date;
  -- (empleado 1..4, nivel o null = sin responder, -1 = sin encuesta, resolvió el técnico)
  v_casos int[][] := array[[1, 5, 1], [1, 5, 1], [1, 4, 1], [1, 4, 1], [1, 3, 1],
                           [2, 5, 0], [2, 2, 0], [2, 1, 0],
                           [3, 5, 0], [3, 0, 0],
                           [4, -1, 0]];
  i int;
  r jsonb;
  s jsonb;
  fallos text := '';
begin
  v_m_fin := (v_m + interval '1 month')::date - 1;
  insert into auth.users (email) values ('__test_ci_118b_jefe@example.test') returning id into v_jefe;
  insert into auth.users (email) values ('__test_ci_118b_asis@example.test') returning id into v_asis;
  insert into auth.users (email) values ('__test_ci_118b_sinmod@example.test') returning id into v_sinmod;
  alter table public.staff disable trigger trg_staff_autoedicion_solo_nombre;
  update public.staff set rol = 'JEFE', activo = true, nombre = 'Jefe 118b', tecnico_mesa = false where user_id = v_jefe;
  update public.staff set activo = true, nombre = 'Tecnico 118b', tecnico_mesa = true where user_id = v_asis;
  update public.staff set activo = true where user_id = v_sinmod;
  delete from public.staff_modulos_permisos where staff_user_id = v_sinmod;
  insert into public.empresas (nombre) values ('__TEST_CI__ Empresa 118b') returning id into v_empresa;
  for i in 1..4 loop
    insert into public.empleados (nombres, apellidos, dni, empresa_id) values ('Persona', i || ' 118b', '9901182' || i, v_empresa) returning id into v_id;
    v_e := v_e || v_id;
  end loop;

  alter table public.tickets disable trigger tickets_resuelto_at;
  for i in 1..array_length(v_casos, 1) loop
    insert into public.tickets (codigo, token, titulo, descripcion, estado, prioridad, empleado_id, created_at, resuelto_at)
      values ('__TEST_CI_118B_' || i, lpad('118b' || i, 24, 'x'), 'Ticket ' || i, 'd', 'cerrado', 'media', v_e[v_casos[i][1]],
              ((v_m + i) + time '08:00') at time zone 'America/Lima', ((v_m + i) + time '10:00') at time zone 'America/Lima')
      returning id into v_t;
    insert into public.ticket_eventos (ticket_id, evento, detalle, created_at, user_id)
      values (v_t, 'estado_cambiado', 'De "en_progreso" a "resuelto"', ((v_m + i) + time '10:00') at time zone 'America/Lima',
              case when v_casos[i][3] = 1 then v_asis else v_jefe end);
    if v_casos[i][2] >= 0 then
      insert into public.ticket_satisfaccion (ticket_id, nivel, fecha_envio, created_at)
        values (v_t, nullif(v_casos[i][2], 0),
                case when v_casos[i][2] > 0 then ((v_m + i + 1) + time '10:00') at time zone 'America/Lima' end,
                ((v_m + i) + time '10:00:01') at time zone 'America/Lima');
    end if;
  end loop;
  alter table public.tickets enable trigger tickets_resuelto_at;

  r := public.reporte_satisfaccion_de(v_jefe, v_m, v_m_fin);
  s := r -> 'resumen';
  -- 11 tickets, 10 encuestas, 9 respondidas; 6 satisfechos de 9 = 67 %; promedio 34/9 = 3.78
  if (s ->> 'tickets')::int <> 11 or (s ->> 'encuestasGeneradas')::int <> 10 or (s ->> 'encuestasRespondidas')::int <> 9
     or (s ->> 'faltan')::int <> 1 or (s ->> 'satisfechos')::int <> 6 or (s ->> 'regulares')::int <> 1
     or (s ->> 'insatisfechos')::int <> 2 or (s ->> 'pctSatisfaccion')::int <> 67 or (s ->> 'promedio')::numeric <> 3.78 then
    fallos := fallos || '[118] resumen de satisfaccion incorrecto: ' || s::text || '; ';
  end if;
  if (r -> 'periodo' ->> 'desde')::date <> v_m or (r -> 'umbrales' ->> 'conformePct')::int <> 80 or jsonb_array_length(r -> 'porMes') <> 1 then
    fallos := fallos || '[118] periodo, umbrales o meses incorrectos; ';
  end if;
  -- situaciones por solicitante
  select x into s from jsonb_array_elements(r -> 'porSolicitante') x where (x ->> 'empleado_id')::uuid = v_e[1];
  if s is null or s ->> 'situacion' <> 'conforme' or (s ->> 'pctSatisfaccion')::int <> 80 or (s ->> 'tickets')::int <> 5 then
    fallos := fallos || '[118] solicitante 1 (conforme) incorrecto: ' || coalesce(s::text, 'null') || '; ';
  end if;
  select x into s from jsonb_array_elements(r -> 'porSolicitante') x where (x ->> 'empleado_id')::uuid = v_e[2];
  if s is null or s ->> 'situacion' <> 'inconforme' or (s ->> 'pctSatisfaccion')::int <> 33 then
    fallos := fallos || '[118] solicitante 2 (inconforme) incorrecto: ' || coalesce(s::text, 'null') || '; ';
  end if;
  select x into s from jsonb_array_elements(r -> 'porSolicitante') x where (x ->> 'empleado_id')::uuid = v_e[3];
  if s is null or s ->> 'situacion' <> 'pocas_respuestas' or (s ->> 'faltan')::int <> 1 or (s ->> 'pctSatisfaccion')::int <> 100 then
    fallos := fallos || '[118] solicitante 3 (pocas respuestas, le falta 1) incorrecto: ' || coalesce(s::text, 'null') || '; ';
  end if;
  select x into s from jsonb_array_elements(r -> 'porSolicitante') x where (x ->> 'empleado_id')::uuid = v_e[4];
  if s is null or s ->> 'situacion' <> 'sin_respuestas' or (s ->> 'tickets')::int <> 1 or (s ->> 'encuestasGeneradas')::int <> 0
     or s -> 'pctSatisfaccion' <> 'null'::jsonb then
    fallos := fallos || '[118] solicitante 4 (sin respuestas) incorrecto: ' || coalesce(s::text, 'null') || '; ';
  end if;
  -- por técnico: el técnico con 5 tickets y 80 %; la jefatura en «otros» con 6 tickets y n insuficiente (4 < 5)
  if not exists (select 1 from jsonb_array_elements(r -> 'porTecnico') t
                  where (t ->> 'tecnico_id')::uuid = v_asis and (t ->> 'tickets')::int = 5 and (t ->> 'pctSatisfaccion')::int = 80)
     or not exists (select 1 from jsonb_array_elements(r -> 'porTecnico') t
                     where t ->> 'grupo' = 'otros' and (t ->> 'tickets')::int = 6 and (t ->> 'muestra')::int = 4
                       and (t ->> 'insuficiente')::boolean and t -> 'pctSatisfaccion' = 'null'::jsonb) then
    fallos := fallos || '[118] satisfaccion por tecnico incorrecta: ' || coalesce(r ->> 'porTecnico', 'null') || '; ';
  end if;
  -- un umbral más alto: el solicitante 1 pasa a regular
  update public.config_parametros set valor = '85'::jsonb where clave = 'satisfaccion_conforme_pct';
  r := public.reporte_satisfaccion_de(v_jefe, v_m, v_m_fin);
  if not exists (select 1 from jsonb_array_elements(r -> 'porSolicitante') x where (x ->> 'empleado_id')::uuid = v_e[1] and x ->> 'situacion' = 'regular') then
    fallos := fallos || '[118] el umbral de conforme no sale de config_parametros; ';
  end if;
  -- un asistente: sin por técnico ni el técnico de cada respuesta; el consolidado le da una lista vacía
  r := public.reporte_satisfaccion_de(v_asis, v_m, v_m_fin);
  if r -> 'porTecnico' <> 'null'::jsonb or exists (select 1 from jsonb_array_elements(r -> 'respuestas') x where x -> 'tecnico_id' <> 'null'::jsonb) then
    fallos := fallos || '[118] un asistente recibio la satisfaccion por tecnico; ';
  end if;
  if jsonb_typeof(public.reporte_satisfaccion_consolidado_de(v_asis) -> 'porTecnico') <> 'array'
     or jsonb_array_length(public.reporte_satisfaccion_consolidado_de(v_asis) -> 'porTecnico') <> 0 then
    fallos := fallos || '[118] el consolidado no devuelve una lista vacia por tecnico al asistente; ';
  end if;
  -- guard y período
  begin
    perform public.reporte_satisfaccion_de(v_sinmod, v_m, v_m_fin);
    fallos := fallos || '[118] satisfaccion respondio sin el modulo tickets; ';
  exception when others then
    if sqlstate <> '42501' then fallos := fallos || '[118] sin modulo lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.reporte_satisfaccion_de(v_jefe, v_m, null);
    fallos := fallos || '[118] se acepto un periodo con una sola fecha; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[118] una sola fecha lanzo ' || sqlstate || '; '; end if;
  end;
  begin
    perform public.reporte_satisfaccion_de(v_jefe, v_m - 400, v_m);
    fallos := fallos || '[118] se acepto un periodo de mas de 366 dias; ';
  exception when others then
    if sqlstate <> 'P0001' then fallos := fallos || '[118] periodo largo lanzo ' || sqlstate || '; '; end if;
  end;
  if not has_function_privilege('authenticated', 'public.reporte_satisfaccion(date, date)', 'execute')
     or has_function_privilege('anon', 'public.reporte_satisfaccion(date, date)', 'execute')
     or has_function_privilege('authenticated', 'public.reporte_satisfaccion_de(uuid, date, date)', 'execute')
     or has_function_privilege('authenticated', 'public.satisfaccion_fila(integer, integer, integer, numeric, integer, integer, integer, integer, integer, integer, integer[])', 'execute') then
    fallos := fallos || '[118] EXECUTE de satisfaccion incorrecto; ';
  end if;

  if fallos = '' then
    raise exception 'TESTS_OK [118b] — invariantes verificados, todo revertido';
  else
    raise exception 'TESTS_FALLARON [118b]: %', fallos;
  end if;
end $$;
