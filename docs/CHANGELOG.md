# Changelog de documentación

> Registro discreto de cambios a la documentación del proyecto (no del
> producto — para eso están los commits y `migrations/`). Una línea por
> actualización; el detalle vive en el propio documento tocado. No forma
> parte de la lectura principal de README/AGENTS/PANORAMA/GUIA-UX-UI: es
> solo un rastro de cuándo y por qué se actualizó cada uno.
>
> Regla asociada (`AGENTS.md`, "Reglas del proyecto"): toda modificación de
> código/esquema que cambie dominio, seguridad o UI debe actualizar la
> documentación correspondiente en el mismo cambio, y dejar una línea acá.

- **2026-08-19** — Desglose 1-5 y baja satisfacción (`README.md`,
  `docs/GUIA-UX-UI.md`): "Por solicitante" separa Respondidas/Pendientes y
  "Por técnico" separa Total/Respondidas; ambas ganan 5 columnas con el
  conteo por nivel (1 a 5), calculado en el cliente agrupando el histórico
  ya cargado (`respuestas`), sin tocar la RPC `reporte_satisfaccion_consolidado()`.
  Nuevo chip "Solo insatisfechos" (nivel ≤ 3, incluye "Neutral" — decisión
  explícita del usuario) sobre "Todas las respuestas", y nueva sección
  "Respuestas con baja satisfacción" en el PDF (ordenada peor-primero).
  `.resumenes-grid` pasa de 2 columnas lado a lado a apiladas (las tablas ya
  no entran cómodas a media pantalla con 9 columnas). Hallazgo de paso: el
  glifo "≤" en un título de PDF rompe la fuente helvetica estándar de jsPDF
  (WinAnsi/Latin-1, sin ese símbolo) — sale con espacios entre cada letra;
  se evitó ahí y en las columnas de nivel (que usan "1".."5", no "★", a
  diferencia de la pantalla). `tests/reporte-satisfaccion-pdf.test.js`
  actualizado (9 tests).

- **2026-08-18** — PDF de "Satisfacción de tickets" (`README.md`,
  `docs/GUIA-UX-UI.md`): `/tickets/satisfaccion` gana un botón "Descargar
  PDF" (histórico completo: KPIs, por solicitante, por técnico y las 40
  respuestas más recientes con nota de cuántas quedaron afuera). Las
  primitivas de layout de PDF de `reporte.js` (título de sección, nota,
  bloque de KPIs, tabla, pie de página) se extrajeron a
  `frontend/src/core/pdfReporte.js` para que `reporteSatisfaccion.js` (nuevo)
  las reuse en vez de duplicarlas — mismo lenguaje visual en los dos
  documentos. `reporte.js` no cambia de comportamiento (mismos 2 exports
  públicos, mismos tests en verde). Nuevo
  `frontend/tests/reporte-satisfaccion-pdf.test.js` (6 tests).

- **2026-08-18** — Autoauditoría de las pruebas negativas de autorización
  (`README.md`, `AGENTS.md`, `.github/workflows/ci.yml`): los 3 helpers
  compartidos (`esperarSinAcceso`/`esperarRpcRechazada`/`esperarAccionRechazada`,
  ahora centralizados en `frontend/tests/integration/_autorizacion-helpers.js`)
  dejan de aceptar cualquier error como prueba de rechazo — exigen
  SQLSTATE `42501`, `P0001` con el mensaje del guard, o el `statusCode`
  HTTP real de la edge function (verificado en vivo antes de escribirlos,
  no supuesto). Sus mensajes de fallo ya no imprimen `JSON.stringify(data)`
  ni `JSON.stringify({data, error})` — solo código/status/conteo. Nuevo
  `frontend/tests/autorizacion-helpers.test.js` (17 tests unitarios, sin
  red) prueba ambas cosas. Documentación corregida para no prometer un
  pipeline verde con el hallazgo P0-05 (`tiene_permiso_modulo` sin
  `revoke`) todavía en rojo a propósito, y el conteo de `npm test` de
  `AGENTS.md` deja de fijar una cifra (ya quedó obsoleta una vez). No se
  tocó RLS, `entregaCrear`, ninguna migración ni ninguna cuenta.

- **2026-08-18** — Pruebas negativas de autorización (`README.md`,
  `AGENTS.md`, `docs/HISTORIAL-AUDITORIAS.md` Ciclo 11): bloque 4 nuevo en
  `tests/db/triggers.test.sql` (cerrar_ticket/staff_nombres/reporte_tickets*
  sin sesión — 4/4 bloques OK) y dos archivos nuevos en
  `frontend/tests/integration/`: `autorizacion-anonima.smoke.test.js` (sin
  cuentas nuevas, corrido contra producción: 25/26 pasan — el fallo es un
  hallazgo real, `tiene_permiso_modulo` sin `revoke`, no corregido a
  propósito) y `autorizacion-roles.smoke.test.js` (ASISTENTE sin
  módulo/`credenciales.ver`, staff inactivo, accesos_sensibles fila por
  fila — necesita 4 cuentas de staff dedicadas que hoy no existen, cada
  bloque se omite por separado sin bloquear CI).

- **2026-08-18** — `ci.yml` (`README.md`, `AGENTS.md`,
  `docs/HISTORIAL-AUDITORIAS.md` P0-04): el job `test-integration` deja de
  omitirse en verde con `::warning::` cuando faltan sus 4 secrets
  (`VITE_INSFORGE_URL`/`ANON_KEY`, `INSFORGE_TEST_STAFF_EMAIL`/`PASSWORD`) —
  ahora falla (`::error::` + `exit 1`), sin imprimir valores. `tests-db` no
  se toca (usa un token de CLI, no una cuenta de staff). No hay branch
  protection en `main` hoy (verificado vía API de GitHub): marcar los jobs
  como required status check sigue pendiente de que el usuario lo configure.

- **2026-08-17** — Migraciones 064-070 + `functions/equipos-fotos.ts` (nueva)
  (`README.md`, `AGENTS.md`, `docs/PANORAMA_SISTEMA.md`,
  `docs/HISTORIAL-AUDITORIAS.md` Ciclo 8): verificación de un análisis de
  seguridad externo — 7 hallazgos confirmados como gaps reales, corregidos.
  064: `accesos_log` gana `ip`/`user_agent` + auditoría de intentos fallidos
  de `entregaAbrir`. 065: límite por DNI en `personal-registro` (antes solo
  IP). 066/067: `entregas.token` deja de guardarse en texto plano (paso 2
  pendiente de aplicar, ver advertencia en el archivo). 068: RLS real por
  módulo en `licencias`/`equipos`/`cuentas` (antes solo control de UI);
  `empleados` excepción a propósito (solo alta/edición gateadas). 069/070:
  tracking de qué migración/versión de cada edge function está realmente
  aplicada/desplegada (`schema_migrations`, `function_deploys`), consultable
  vía la acción `version` nueva en las 5 edge functions. Nueva edge function
  `equipos-fotos.ts`: valida magic bytes + tamaño en servidor (antes subía
  directo del navegador al bucket sin validar). `Cache-Control: no-store` en
  `credenciales`/`tickets`/`personal-registro`. Se retira la propagación del
  token de entrega como `?entrega=<token>` en `EntregaView.vue`/
  `TicketNuevoView.vue`. Documentación: URL real de producción y nombre del
  proyecto backend redactados a placeholders en README/AGENTS/CHANGELOG/
  HISTORIAL-AUDITORIAS/`.env.example`; nota nueva en `AGENTS.md` sobre qué no
  compartir con IA externa/terceros.
- **2026-08-17** — Migración 063 (`README.md`, `docs/HISTORIAL-AUDITORIAS.md`):
  segunda pasada del InsForge Backend Advisor tras la 062 (31 hallazgos).
  Corregidos: 9 políticas RLS en 5 tablas que llamaban `auth.uid()` sin
  envolver en subquery (`ALTER POLICY ... (select auth.uid())`, mismo
  `qual`/`with_check`) y un grant faltante en `staff_nombres()` (migración
  061, quedó fuera del hardening de la 062 por no estar en el reporte
  original). Dos grupos del reporte quedan como **riesgo aceptado, sin
  cambios**: 10 funciones `SECURITY DEFINER` que el advisor vuelve a marcar
  "dangerous" por tener `EXECUTE` a `authenticated` (aplicar la sugerencia
  rompería el patrón de RLS-helper/RPC-gateada) y 11 tablas con RLS de solo
  SELECT (escriben vía trigger `SECURITY DEFINER` o edge function admin;
  abrir INSERT a `authenticated` sería una regresión de seguridad, no una
  mejora). Ver Ciclo 7 en `docs/HISTORIAL-AUDITORIAS.md` para el detalle.
- **2026-08-17** — Migración 062 (`README.md`, `docs/PANORAMA_SISTEMA.md`,
  `docs/HISTORIAL-AUDITORIAS.md`, `AGENTS.md`): respuesta a los 80 hallazgos del InsForge
  Backend Advisor. `REVOKE EXECUTE ... FROM PUBLIC` en las 16 funciones
  `SECURITY DEFINER` marcadas "callable by: public", con `GRANT` de vuelta a
  `authenticated` solo en las 10 que un rol autenticado realmente invoca
  (RLS o RPC del cliente) — ninguna se convirtió a `SECURITY INVOKER`, la
  sugerencia genérica del advisor, porque rompería el patrón de recursión de
  RLS ya documentado. Investigando esas 16 apareció un hallazgo no reportado
  individualmente por el advisor: 3 funciones `_test_reporte_*` (gemelas de
  `scripts/paridad-reporte-tickets.mjs`) habían quedado en producción por
  descuido sin el guard `es_staff()` de las reales — fuga real de datos sin
  autenticar, eliminadas en la misma migración. Suma 61 índices en columnas
  FK sin índice y autovacuum más agresivo (+ `VACUUM ANALYZE` inmediato) en
  las 3 tablas con >20% de tuplas muertas. Ver Ciclo 6 en
  `docs/HISTORIAL-AUDITORIAS.md` para el detalle hallazgo por hallazgo.
- **2026-08-17** — Bug en producción (`README.md`, `AGENTS.md`,
  `docs/HISTORIAL-AUDITORIAS.md`): `GET /empleados` devolvía 400 `PGRST200`
  ("Could not find a relationship between 'areas_obras' and 'ubicaciones'")
  — la migración 059 eliminó `areas_obras.ubicacion_id`, pero
  `api/domains/empleados.js` seguía pidiendo el embed anidado
  `areas_obras(nombre, ubicaciones(nombre))` que dependía de esa columna.
  Fix: `SELECT_EMPLEADO` pide `areas_obras(nombre)` y `ubicaciones(nombre)`
  como dos embeds independientes (el modelo real desde la 059). Guardia
  adicional en `DashboardView.vue`: el `Promise.all` de carga ya no deja
  `stats` en `null` sin aviso — `catch` con toast + `v-if` en el template que
  antes leía `stats.cuentasAsignadas` sin verificar. Nuevo
  `tests/integration/embeds.smoke.test.js`: una consulta real por cada
  `select()` con embed del resto de dominios (el smoke existente solo
  cubría `tickets`, por eso no atrapó esto — ver Q-01 en
  `docs/HISTORIAL-AUDITORIAS.md`, que sigue abierto porque los 4 secrets de
  `test-integration` todavía no existen en el repo; pasos para crearlos
  documentados en `README.md`, sección "CI: secrets del smoke de
  integración").
- **2026-08-17** — Migración 061 (`README.md`, `docs/PANORAMA_SISTEMA.md`,
  `docs/HISTORIAL-AUDITORIAS.md`): fix de bug en producción — un ASISTENTE
  que genera el reporte de tickets veía a sus compañeros como "Staff" (la
  RLS de SELECT de `staff` es "propio registro o jefe"). Mismo patrón
  encontrado en otras 6 pantallas no reportadas por el usuario ("Asignado
  a" de tickets, Responsable de Problemas/acciones correctivas, autor de
  KB, reporte de satisfacción) — sistémico, no aislado al reporte. Fix: RPC
  `staff_nombres()` (`SECURITY DEFINER` angosto, mismo patrón que
  `kb_registrar_feedback` de la migración 032) en vez de ampliar la policy
  de SELECT. De paso, extiende el UPDATE de `staff` para autoedición de
  `nombre` (JEFE sigue editando cualquier fila), blindado con el mismo
  patrón de trigger de columnas congeladas que la migración 019 usó para
  H-06 en `tickets` — actualiza la fila de H-06 en
  `docs/HISTORIAL-AUDITORIAS.md`. Feature adicional: selector de alcance
  ("Solo mi actividad" / "Todo el equipo") en el reporte de tickets,
  visible junto al periodo en pantalla y en el PDF.
- **2026-08-17** — Cierra P-02 (`docs/HISTORIAL-AUDITORIAS.md`): reporte de
  usuario de que Equipos "se refresca a cada rato" durante una importación
  masiva y termina en `502 Bad Gateway`. Causa: `useRealtimeRefresco.js`
  relanzaba el fetch pesado de la lista en cada evento `'changed'`, sin
  debounce, y `ImportarEquiposView.vue` migra fila por fila (cada
  INSERT/UPDATE dispara el trigger de BD). Fix: nueva `crearRefrescoDebounced`
  (leading + trailing coalescente + guardia de solicitud-en-curso) en
  `useRealtimeRefresco.js`, opt-in vía `debounceMs`, aplicada a las 4 vistas
  de lista (equipos/empleados/licencias/correos) y al `tickets:list` de
  `AppLayout.vue`; `AppNotifications.vue`/`TicketSeguimientoView.vue` quedan
  sin cambios porque necesitan reaccionar a cada evento. Además se agregó
  `ConfirmDialog` antes de "Migrar todas las filas listas" — antes escribía
  en lote sin confirmación previa. `docs/GUIA-UX-UI.md` no se toca: el
  diálogo reusa el componente y patrón ya existente (el mismo que "Vaciar
  bandeja"), sin UI nueva.
- **2026-08-16** — Cierra los 8 tests en rojo del reporte de tickets
  (`frontend/tests/reporte-tickets-agregacion.test.js` y `reporte-pdf.test.js`),
  rotos desde el commit `030cc89` (2026-08-15, "Pruebas") sin que CI lo
  notara (ver `docs/HISTORIAL-AUDITORIAS.md` Q-01). Tres decisiones:
  **Backlog por antigüedad retirado del reporte de tickets — sin uso real.
  Con el volumen actual (~63 tickets) la métrica no aporta señal. Se perdió
  originalmente sin documentar en el commit 030cc89; se confirma ahora como
  decisión deliberada. Si el volumen crece, es la primera métrica a
  reconsiderar.** `porSolicitante.sinResolver` se retira con la misma
  decisión y el mismo razonamiento. `porTecnico` (forma `{total, mismoPeriodo,
  arrastrados}`) queda como está — es correcta y ya la consumían bien
  `ReporteTicketsModal.vue`/`reporte.js`, solo los tests verificaban la forma
  vieja. `porSolicitante.total` sí cambia de etiqueta (no de dato): pasa de
  "Total" a "Histórico" en el modal y el PDF, con nota aclaratoria, porque
  dentro de un reporte por periodo "Total" se leía como si fuera de ese
  periodo. `tasaReapertura` sin cambios (ya usa resueltos como denominador,
  como fija `docs/PANORAMA_SISTEMA.md` §5). Línea base real verificada:
  **95 tests pasan + 1 se salta (96 total, 0 en rojo)** — ni el "88/97" ni
  el "96/97" que se habían documentado antes eran correctos; `AGENTS.md`
  corregido con la cifra real. Detalle completo en
  `docs/PANORAMA_SISTEMA.md` §6.
- **2026-08-16** — Proceso (hallazgo A-05/W-04/Q-05): agrega
  `.github/pull_request_template.md` (checklist de documentación/tests/capa
  de deploy afectada) y `CONTRIBUTING.md` (convención de commits `fix(scope):`/
  `feat(scope):` que ya existía de hecho pero no estaba escrita, con la
  regla de "un commit = un cambio coherente" y el episodio de `030cc89` como
  caso real de por qué — 30+ archivos sin relación bajo un solo mensaje,
  que borró una sección del reporte de gerencia sin que nadie lo notara
  durante un día).
- **2026-08-16** — Migración 059: separa `areas_obras` (función) de
  `ubicaciones` (lugar) — la 058 las había mezclado en una sola relación,
  y "Almacén" (área funcional de logística, 5 empleados) rompía esa premisa:
  no es un lugar. `ubicaciones` gana `tipo` (sede/almacen/obra/otro);
  `empleados` gana `ubicacion_id` propio, independiente de su área;
  `areas_obras.ubicacion_id` se elimina (leída antes en el backfill).
  Aplicado en un branch de InsForge primero, validado (28 empleados con
  ubicación derivada, exacto) antes de producción. Frontend:
  `EmpleadoForm.vue` gana un select de Ubicación independiente del de
  Área/Obra; `EmpleadosView.vue` gana un filtro de Ubicación;
  `AreasObrasPanel.vue` pierde el campo de ubicación; `UbicacionesPanel.vue`
  gana el select de tipo. Cierra el pendiente de `docs/PANORAMA_SISTEMA.md`
  §7 sobre "consolidar en un catálogo único" — la idea original era la
  equivocada, ver §6. "Obra" queda sin dividir (cero referencias reales,
  pendiente sin urgencia).
- **2026-08-16** — Migración 060: permiso individual `credenciales.ver`
  (tabla `staff_permisos`, mismo patrón que `staff_modulos_permisos` de 056).
  Gatea revelar/enviar contraseñas de Cuentas y Licencias en
  `functions/credenciales.ts` (consulta directa, no RPC — el handler corre
  sin sesión de usuario); JEFE exento siempre. Otorgar/revocar queda
  auditado en `accesos_log` (no solo el rechazo — se audita también el
  otorgamiento, que es el evento más importante). Backfill de los 3 staff
  activos + `handle_new_staff_user` extendido. Toggle sin `ConfirmDialog` en
  `StaffView.vue` (la auditoría del trigger hace aceptable la fricción baja)
  y gate cosmético en los 4 sitios del frontend que revelan/envían
  credenciales (`CorreosView`, `CuentasPanel`, `EmpleadosView`,
  `LicenciasView`). **Advertencia explícita agregada en `AGENTS.md`**: la
  regla de quién puede ver contraseñas está escrita dos veces (SQL y
  `credenciales.ts`, por la misma razón que ya obligaba a esto en
  `revelarAccesoSensible`/024) — cambiar una sin la otra es el riesgo real.
  Pendiente de branch+aplicación en InsForge (sesión de CLI expirada a
  mitad de tarea) — ver `docs/HISTORIAL-AUDITORIAS.md` si aplica.
- **2026-08-16** — Cierra H-12 en código (`docs/HISTORIAL-AUDITORIAS.md`):
  las 4 edge functions y `frontend/package.json` quedan en la misma versión
  exacta de `@insforge/sdk` (`1.5.2`, sin rango). Se subió el frontend en vez
  de bajar las functions: revisado el diff de tipos completo 1.4.0→1.5.2 y
  las release notes contra cada API que el proyecto usa de verdad, sin
  breaking changes reales (el único cambio real, `getPublicUrl()`, no se usa
  en este repo). Verificado con `deno check` limpio y el frontend con la
  dependencia instalada de verdad (no solo tipos): build + tests en la misma
  línea base (88/97, sin regresiones). De paso se corrigió un alias de
  `frontend/vitest.config.js` que solo interceptaba el string exacto sin
  versión y rompía 2 archivos de test al fijarla. `functions/deno.lock`
  queda versionado (fija dependencias transitivas para `deno check`
  reproducible — no participa del deploy real, que no lee lockfiles).
  **Redesplegar las 4 funciones queda pendiente**, a propósito, coordinado
  por el usuario — hasta entonces cada una sigue en la versión de su último
  deploy real, no la del código fuente. Detalle completo en
  `docs/HISTORIAL-AUDITORIAS.md` (H-12) y checklist de deploy en `README.md`.
- **2026-08-16** — Nuevo hallazgo H-12 (`docs/HISTORIAL-AUDITORIAS.md`, abierto):
  detectado al generar `functions/deno.lock` para Q-04 — las 4 edge functions
  importan `npm:@insforge/sdk` sin versión fijada (H-09 solo pinneó
  `frontend/package.json`), hoy resuelve a `1.5.2` vs. el `1.4.0` del
  frontend. Sin acción de código: fijar el import implica redesplegar las 4
  funciones, decisión que corresponde a otro cambio.
- **2026-08-16** — Cierra Q-04 (`docs/HISTORIAL-AUDITORIAS.md`): `functions/*.ts`
  nunca se compilaban ni se linteaban. Runtime real verificado primero (Deno
  Subhosting, no Node — imports `npm:@insforge/sdk` y `Deno.env`) en vez de
  asumir: `functions/tsconfig.json` + `deno check` para el type-check (no
  `tsc`, que no resuelve `npm:` ni conoce el global `Deno`); `eslint.config.js`
  (raíz) cubre `frontend/src` y `functions/` con reglas calibradas contra el
  estilo real — 0 violaciones nuevas quedan en `error`, los hallazgos de
  estilo preexistentes en `warn`. Nuevo job `lint-y-typecheck` en `ci.yml`.
  Corregidos los 10 errores de tipo reales que apareció el type-check en
  `functions/*.ts` y 8 `no-unused-vars`/`no-useless-assignment` reales en
  `frontend/src` — ninguno era un bug funcional (ver detalle en
  `docs/HISTORIAL-AUDITORIAS.md`, Q-04). `.prettierrc.json` queda configurado
  para uso manual (`npm run format`), no como gate de CI: `prettier --check`
  marca 130 archivos existentes solo por espaciado/orden, reformatearlos de
  golpe está fuera de alcance. `@insforge/sdk` sin tocar (pin de H-09 vigente).
- **2026-08-16** — Cierra U-07 (`docs/HISTORIAL-AUDITORIAS.md`): la encuesta
  de satisfacción se generaba al cerrar un ticket pero sin ningún canal para
  que el empleado se enterara desde que la migración 055 retiró el correo (8
  respondidas de 48 generadas). Sin tocar esquema ni el trigger
  `crear_encuesta_al_cerrar()`: el formulario (extraído a
  `EncuestaSatisfaccionForm.vue`, reusado sin duplicar lógica) se embebe en
  `/soporte/:token` en cuanto el ticket pasa a `cerrado` — la plomería
  realtime ya existía (`notify_ticket_estado()` + `useRealtimeRefresco`),
  solo se conectó. Además, `/tickets/:id` gana un botón "Copiar mensaje de
  WhatsApp" (mismo patrón que `copiarEnlaceSoporte()`, sin abrir `wa.me`),
  para lo cual `getTicket()` ahora expone `token`. Detalle en
  `docs/PANORAMA_SISTEMA.md` §5 y `docs/HISTORIAL-AUDITORIAS.md`.
- **2026-08-13** — Observabilidad y rendimiento del dashboard (roadmap
  pedido explícitamente por el usuario). `@sentry/vue` instalado e
  inicializado en `main.js` (solo `PROD` + `VITE_SENTRY_DSN` configurado,
  sin Session Replay/tracing/logs, `sendDefaultPii: false` — esta app
  maneja DNI/tickets/credenciales); DSN real y host de ingesta en el
  `connect-src` de ambos `vercel.json` ya configurados por el usuario —
  cierra D-01, verificado de punta a punta (build de producción real +
  Playwright: sin violaciones de CSP, evento de prueba aceptado por
  Sentry). `api/domains/dashboard.js`: `getEstadisticas()` pasa de
  descargar filas completas a `count`/`head` (P-01); `pendientesTickets()`
  consolida 3 round-trips solapados en 1 (P-04). Detalle y estado en
  `docs/HISTORIAL-AUDITORIAS.md` (Ciclo 2). También se agregó el atajo
  Ctrl/Cmd+K para el buscador global — ver `docs/GUIA-UX-UI.md`.
- **2026-08-13** — Cierre completo del backlog del Ciclo 4 (47 hallazgos
  UX4-07 a UX4-53, `docs/HISTORIAL-AUDITORIAS.md`): patrón de tarjetas
  móviles en 7 vistas, `aria-label` en botones de contraseña, objetivos
  táctiles bajo 44px, `ConfirmDialog` reemplazando `confirm()` nativo en
  `StaffView.vue`, foco visible en radios ocultos, `aria-live`/`role=status`
  en formularios públicos, campo "Notas" reactivado en `EmpleadoForm.vue`,
  esqueleto de carga en el Dashboard, y varias correcciones puntuales de
  accesibilidad/tokens/tono. Implementado por 6 agentes en paralelo sobre
  conjuntos de archivos sin superposición; verificado con `npm run build` +
  `npm test` tras consolidar, más revisión manual de los cambios de mayor
  riesgo. Detalle completo por ítem en `docs/HISTORIAL-AUDITORIAS.md`.
- **2026-08-13** — Retiro de toda funcionalidad de correo en tickets
  (decisión de producto: el sistema no debe enviar avisos/notificaciones por
  correo por el momento). Migración 055 elimina el trigger/función
  `notify_correo_fallido()` (049); `functions/tickets.ts` pierde el correo de
  confirmación al crear y la acción `enviarEncuesta` (con su `plantillaCorreo`
  helper); frontend pierde la llamada automática a `enviarEncuesta()` en
  `marcarResuelto()` (`TicketDetalleView.vue`/`ticketDetalle.js`) y las
  referencias a `correo_fallido`/`ticket_correo_fallido` en
  `dominio-tickets.js`/`notificacionIconos.js`. La encuesta de satisfacción
  sigue generándose al cerrar, pero sin ningún aviso — el enlace queda sin
  canal de entrega. Actualizados README.md, `docs/PANORAMA_SISTEMA.md` y
  `docs/HISTORIAL-AUDITORIAS.md` (S-01 marcado como superado).
- **2026-08-13** — Primer porteo real de `design.pen` a producción, 5
  commits (Fases A-E): tokens aditivos en `main.css` (`space-1..12`,
  `danger-hover`/`-solid`, `whatsapp-text`); 5 variantes de `.btn` con foco
  en anillo externo unificado (de paso resuelve DS-01, unifica `:disabled`
  a `.5`); 4 variantes semánticas de `.toast`; hover de fondo en
  `ThOrdenable`; símbolo de marca a 4 pétalos + diamante. DS-03/DS-04/DS-05
  y la propuesta de paleta en notación de puntos siguen sin portar, a
  propósito. Detalle en `docs/GUIA-UX-UI.md` y `docs/HISTORIAL-AUDITORIAS.md`.
- **2026-08-12** — Unificado el botón "Asignar a un empleado" en
  `LicenciasView.vue` para todas las licencias, sin importar si tienen
  login o no (antes solo aparecía para licencias sin login). Nuevas
  funciones `licenciasApi.asignarUsuario()`/`liberarUsuario()`
  (`frontend/src/api/domains/licencias.js`) deciden el mecanismo: con
  login delegan en `asignarCuentaExistente`/`cerrarAsignacion` del correo
  compartido (mismo camino que el módulo Correos); sin login usan
  `asignarLicencia`/`cerrarAsignacionLicencia` directo. `mapLicencia()`
  agrega `origen: 'cuenta'|'licencia'` a cada entrada de `usuarios` para
  que `liberarUsuario()` sepa a qué tabla cerrar. Actualizados
  `stores/licencias.js`, el hint de `LicenciaForm.vue`, `README.md` y la
  lista de métodos de `tests/insforge-api-shape.test.js` (150→152).
- **2026-08-12** — **Fix de incidente en producción**: la CSP agregada en
  S-04 bloqueaba el WebSocket del realtime (`wss://<INSFORGE_PROJECT_URL>`)
  porque `connect-src` solo tenía el esquema `https://` del mismo host.
  Agregado `wss://` explícito en `frontend/vercel.json` y su copia
  `frontend/public/vercel.json`. Actualizado el hallazgo S-04 en
  `docs/HISTORIAL-AUDITORIAS.md` con el incidente y la lección aprendida.
- **2026-08-12** — Nueva regla en `AGENTS.md` ("Diagnóstico/pruebas contra
  producción"): extiende la práctica de usar un branch de InsForge (antes
  solo para tablas de prueba nuevas, `docs/PANORAMA_SISTEMA.md` §7) a
  cualquier INSERT/UPDATE/DELETE de diagnóstico contra datos reales —
  limpieza en la misma sesión + registro explícito obligatorio. Agregada
  nota junto a `siguiente_codigo_ticket()` en `docs/PANORAMA_SISTEMA.md`
  explicando que los huecos de `TCK-00XX` son esperables (`nextval()` no
  es transaccional), a raíz del salto 0096→0120 documentado en T-05.
- **2026-08-12** — **Fix de bug en producción** (migración 054): eliminada
  la sobrecarga vieja de 5 argumentos de `crear_notificacion()`, viva por
  error desde la migración 048 (`create or replace function` con firma
  distinta crea sobrecarga, no reemplaza), que rompía con 500 la creación
  de tickets/cuentas y el alta/baja de empleados (ambigüedad de función).
  Reproducido y verificado el fix directo contra producción. Agregado
  hallazgo T-05 (Resuelto) a `docs/HISTORIAL-AUDITORIAS.md`, fila 054 en
  el historial de migraciones de `README.md`, y corregida la descripción
  de `crear_notificacion()` en `docs/PANORAMA_SISTEMA.md`.
- **2026-08-12** — Dividido `AppLayout.vue` (1161 líneas, A-06) en
  `AppSearch.vue`, `AppNav.vue` y `AppNotifications.vue`; queda en 517
  líneas como orquestador (socket realtime, drawer/colapso, tema, logout).
  Icono de aviso centralizado en `core/notificacionIconos.js` (antes
  duplicado con `NotificacionesCampana.vue`). Actualizada la tabla de
  `docs/GUIA-UX-UI.md` con la nueva composición del shell y una nota sobre
  `:global()` en `<style scoped>` (pierde el selector descendiente al
  compilar en este proyecto — verificado contra el CSS de `dist/`).
- **2026-08-12** — Nuevo job `deploy-manual` en `.github/workflows/ci.yml`
  (`workflow_dispatch`): aplica una migración a la vez vía `db import` y/o
  redespliega las 4 edge functions, en Linux en vez de a mano en Windows.
  Actualizado el checklist de deploy y la nota de producción de `vercel.json`
  en `README.md`. Marca D-02/D-03 como **Parcial** en
  `docs/HISTORIAL-AUDITORIAS.md` (sigue siendo manual a propósito, no hay
  tracking de migraciones ya aplicadas).
- **2026-08-12** — Resueltos varios hallazgos de `docs/HISTORIAL-AUDITORIAS.md`
  con cambio de código: U-02/U-03/U-04 (tokens CSS, `:focus-visible`),
  A-02 (router `meta.roles`), S-04 (CSP/HSTS en `vercel.json`). Descartado
  D-07 (alias CSS con 677 usos reales, no es código muerto). Medido P-03:
  los chunks de `html2canvas`/`dompurify` existen en `dist/` pero nunca se
  cargan en producción (lazy dentro de jsPDF, `doc.html()` no se usa) — sin
  cambio de código.
- **2026-08-12** — Fusionado `AUDIT_REPORT.md` (raíz, reconciliación de
  solo lectura del 2026-08-11) dentro de `docs/HISTORIAL-AUDITORIAS.md`:
  actualizados con evidencia S-03/T-02, P-01, T-04, P-02, U-05, A-02, U-02,
  U-03/U-04, P-04 (quitado el matiz "no reverificado"); cambiados a
  **Resuelto** S-05/S-06 y U-06; cambiado a **Parcial** Q-02/Q-03;
  corregido A-03 (bajó a 1446 líneas, no creció); confirmado P-03 con
  evidencia dura. Se agregaron 3 hallazgos nuevos: A-06 (`AppLayout.vue`
  god-component), A-07 (duplicación de "encuesta"), D-07 (alias CSS legacy
  sin eliminar). `AUDIT_REPORT.md` se elimina de la raíz tras la fusión.
- **2026-08-11** — Inventario de archivos (`docs/INVENTARIO-ARCHIVOS.md`,
  nuevo): limpieza confirmada de bajo riesgo aplicada — eliminado
  `sistema_credenciales_ti.html.bak`, destrackeado `.vite/deps/*` (+
  `.gitignore`), borradas 5 reglas CSS muertas en `main.css`, limpiado un
  comentario obsoleto en `CorreosView.vue`, corregidas las secciones de
  clases legacy de `docs/GUIA-UX-UI.md` (decían "sin uso", en realidad ya
  no existen). Se agregaron 2 hallazgos nuevos a
  `docs/HISTORIAL-AUDITORIAS.md` (Q-06, W-06) y se marcaron D-04/D-05 como
  resueltos.
- **2026-08-12** — Cierre de la migración de `design.pen` (ronda 2): los 5
  puntos pendientes de la Fase 3 resueltos — adopción real de
  `space-1..12` en los 46 componentes (83 propiedades migradas, 2
  excepciones documentadas), sidebar real reagrupado en 3 subgrupos
  (antes solo mockup), `$social.whatsapp` tokenizado, `Botón icono` a
  49×49px con spec de `aria-label` por instancia, y foco visible
  extendido a `Ítem de navegación`/`Paginación`/`Ítem de menú` (`Ítem de
  combo` documentado como no-focusable). Los 5 hallazgos DS-01 a DS-05
  de la pasada anterior siguen abiertos a propósito — dependen de
  desarrollo, no de diseño. Detalle en `docs/GUIA-UX-UI.md`.
- **2026-08-12** — Auditoría de Design System (`design.pen` vs. producción):
  5 hallazgos nuevos en `docs/HISTORIAL-AUDITORIAS.md` (DS-01 a DS-05:
  `.btn-danger:hover` en oscuro, `:disabled` inconsistente, error de
  formulario sin tratamiento visual, cobertura de `:focus-visible`/`$ring`,
  selects de filtro sin nombre accesible), cada uno con ficha de desarrollo
  (qué cambia, selector, cómo verificar en QA). U-01 ampliado con la
  medición en tema oscuro. Ninguno de los 5 se corrigió en `main.css`/`.vue`
  en esta pasada — son hallazgos y propuestas, no cambios de código.
  `docs/GUIA-UX-UI.md` documenta en paralelo lo que sí se aplicó dentro de
  `design.pen` (3 fixes de bajo riesgo + fundación de escalamiento: escala
  `space-1..12`, variant sets completos de Botón/Campo de texto/Campo
  select, propuesta de reagrupación del sidebar sin tocar rutas).
- **2026-08-11** — Revisión general de toda la documentación: `README.md`
  (migraciones 039–047, módulos Notificaciones/Encuestas/Pre-registro de
  personal), `AGENTS.md` (vigencia, regla de "docs por cambio"),
  `docs/PANORAMA_SISTEMA.md` (esquema hasta 047, decisiones revisadas),
  `docs/GUIA-UX-UI.md` (vigencia, componente `NotificacionesCampana`). Se
  fusionaron los dos informes de auditoría sueltos en la raíz en
  `docs/HISTORIAL-AUDITORIAS.md` (con estado reconciliado hallazgo por
  hallazgo) y se crea este changelog.
