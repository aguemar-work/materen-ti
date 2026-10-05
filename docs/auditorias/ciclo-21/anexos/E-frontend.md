# Anexo E — Inventario del frontend (`frontend/src`) (Fase 0, Ciclo 21)

Fuente: lectura directa del código en la rama `rediseno/sistema-visual` (subagente, 2026-10-01, solo lectura; la única ejecución fue `npx vitest run`, que no escribe en el repo). `S/` = `frontend/src/`, `T/` = `frontend/tests/`. [V] = Verificado leyendo el código; [I] = Inferido.

## 1. Rutas y guard
Guard único `S/router/guards.js:11-53`: `meta.public` salta todo (:14); `auth.cargarSesion()` en **cada** navegación (:21); sin staff → `/login`; `meta.roles` contra `{ jefe: auth.esJefe }` (:37-42); `meta.modulo` contra `auth.puedeVerModulo()` (:47-52). Ambos rechazos registran `accesoDenegado` (edge `credenciales`, fire-and-forget) y redirigen a `/dashboard` (o `redirigirDenegado`).

| path | componente | public | roles | modulo |
|---|---|---|---|---|
| `/login` | auth/LoginView | – | – | – |
| `/dashboard` | dashboard/DashboardView | – | – | – (sin gate) |
| `/empleados`, `/empleados/:id` | empleados/* | – | – | empleados |
| `/accesos-sensibles` | accesosSensibles/AccesosSensiblesView | – | jefe | – |
| `/configuracion` (+ `empresas`, `areas-obras`, `plataformas`, `tipos-equipo`, `ubicaciones`, `categorias-ticket`) | configuracion/*, empresas/, plataformas/ | – | – | – (cualquier staff) |
| `/configuracion/staff` | staff/StaffView | – | jefe | – |
| `/correos`, `/licencias`, `/equipos`, `/equipos/importar` | correos/, licencias/, equipos/* | – | – | correos / licencias / equipos |
| `/base-conocimiento(/:id)` | kb/* | – | – | base_conocimiento |
| `/problemas(/:id)` | problemas/* | – | – | problemas |
| `/tickets`, `/tickets/:id`, `/tickets/satisfaccion` | tickets/* | – | – | tickets |
| `/actividad` | actividad/ActividadView | – | jefe | – |
| `/encuestas(/:id)` | encuestas/* | – | – | encuestas |
| `/soporte`, `/soporte/nuevo`, `/soporte/buscar`, `/soporte/:token`, `/soporte/:token/satisfaccion` | soporte/, tickets/* | **true** | – | – |
| `/entrega/:token` | entregas/EntregaView | **true** | – | – |
| `/encuesta/:slug` | encuestas/EncuestaPublicaView | **true** | – | – |
| `/ticket/*`, `/empresas`, `/plataformas`, `/staff` | redirects legacy | – | – | – |
| `/:pathMatch(.*)*` | errores/NotFoundView | true | – | – |

Módulos habilitables: `S/constants/modulos.js:7-16` (8 ids). `puedeVerModulo` (`stores/auth.js:68`): JEFE exento; `modulosVisibles` desde `staff_modulos_permisos`. **Dos listas de los 8 módulos que nada sincroniza**: `constants/modulos.js` (solo la usan `StaffModulosForm`/`StaffView`) y `components/shared/navegacion.js:42-61` (sidebar); el comentario de `constants/modulos.js:2-3` que dice que `AppNav` la usa está desactualizado [V].

## 2. Módulos UI (resumen; 20 carpetas)
accesosSensibles (vista + form, revelado 8 s), actividad (auditoría JEFE; trae 200 filas y filtra en cliente `ActividadView.vue:69-71,186`), auth (login + reset por código), configuracion (pestañas; 3 catálogos con `useCrudCatalogo`, categorías de ticket 2 niveles), correos (paginado, revelar, rotar, exportar), cuentas (panel de accesos del empleado: revelar, traspasar, revocar, historial, entrega WhatsApp), dashboard (KPIs + feed `pendientesFeed.js`), empleados (listado, ficha con `pasosAlta`, form con prechequeo de DNI, `BajaEmpleadoModal` con checklist cosmético de 300 ms/ítem sobre RPC atómico), empresas/plataformas (catálogos con store a mano), encuestas (plantillas JEFE, rondas, pública), entregas (pública), equipos (`EquiposView.vue` 1183 líneas; form con `MAX_FOTOS=4`; importación Excel 780 líneas; actas; PDF), errores, kb, licencias (812 líneas; puede crear el correo al vuelo), problemas (transición lineal en cliente), soporte (landing), staff (JEFE: rol, activo, módulos, `credenciales.ver`), tickets (`TicketsView.vue` 870; detalle página/panel sobre `useTicketDetalleLogica`; piezas compartidas `TicketCamposGestion/Composer/Contexto/Resumen/Solicitante/TimelineUnificado`; interno; reportes PDF; portal público).

`AGENTS.md` (helper 3) nombra `TicketComentarios.vue` y `TicketHistorial.vue`: **no existen** (los reemplazó `TicketTimelineUnificado.vue`) [V]. `Modal.vue` tiene 25 consumidores (AGENTS dice 26); `AppDialog.vue` solo 1 [V].

## 3. Stores
Paginados (`crearStorePaginado`): tickets (sin `resetearFiltros`, deliberado), empleados, correos, equipos, licencias, kb, problemas — los 6 últimos llaman `resetearFiltros()` en `onMounted` de su vista [V]. Catálogo (`crearCatalogoStore`): ubicaciones, areasObras, tiposEquipo, categoriasTicket. A mano: auth, cuentas, **empresas y plataformas (misma forma que `crearCatalogoStore`, duplicación residual)**, encuestas, staff, accesosSensibles, notificaciones, ticketDetalle, problemaDetalle. `crearStorePaginado` tiene `_peticionId` (descarta respuestas obsoletas) y `enriquecer` que nunca tumba la página.

## 4. Capa de datos
Barrel `S/api/insforge.js` (18 dominios); forma fijada por `T/insforge-api-shape.test.js` (164 métodos). `getClient()` fija `functionsUrl`. Helpers `sanitizarTermino`, `ordenValido` (lista blanca de orden), `entregarQuery`.

Edge functions vía `crearInvocador` (`S/api/invocarFuncion.js`): `passwords.js` → `credenciales` (8 acciones); `ticketsPublicos.js` → `tickets` (6); `encuestaPublica.js` → `encuestas` (2); `domains/equipos.js` → `equipos-fotos` (2). Error de transporte → `esperarReintento()` global y reintento.

RPC desde el cliente (6): `dar_baja_empleado`, `revocar_cuenta_personal`, `cerrar_ticket`, `reporte_satisfaccion_consolidado`, `staff_nombres`, `kb_registrar_feedback`. `reporte_tickets` y `reporte_tickets_resumen` existen en BD **sin consumidor**: el reporte por periodo se agrega en cliente (`reportesTickets.js:61-200`, lotes de 30 ids) [V].

Operaciones multi-escritura **sin transacción** en cliente [V]: `cuentas.createCuenta` (2-3 escrituras), `cuentas.traspasarCuenta` (4: cerrar asignación → rotar → nueva), `equipos.moverEquipo/asignarEquipo/devolverEquipo` (2-3), `ImportarEquiposView` (3-4 por fila). Contraste: baja de empleado, revocar personal y cerrar ticket sí van por RPC.

## 5. Reglas de negocio con presencia en la interfaz (selección)
| archivo:línea | Regla | ¿Contraparte servidor? |
|---|---|---|
| `useTicketDetalleLogica.js:176-183` | Iniciar atención exige asignado + tipo | Sí: `check_iniciar_completo` (035) [verificado en Fase 0 contra `pg_trigger`] |
| `useTicketDetalleLogica.js:215-219, 283-287` | Rechazar/Reabrir exigen motivo (se guarda como comentario) | **No** (solo cliente) |
| `TicketsView.vue:191-194` | Cerrar en lote solo si todos `resuelto` | whitelist 050 cubre la transición; el lote es un bucle en cliente |
| `dominio-tickets.js:87-92`, `dashboard.js:92,124,162`, `reportesTickets.js:24` | "Vigentes" = excluir resuelto/cerrado/rechazado, repetido ≥4 veces | RPC 053 usa la misma exclusión |
| `dominio-empleados.js:44,52-67,90-104` | `DIAS_VENTANA_ALTA=30`; `altaIncompleta` (solo cuentas); `pasosAlta` | No: derivado por diseño |
| `dominio-licencias.js:12-19`; `dashboard.js:125` | Por vencer = 30 días (constante) vs garantías `30` literal | No |
| `licencias.js:243-296`, `AsignarLicenciaModal.vue:40` | Cupo de asientos deshabilita asignar | Sí: `check_tope_licencia` |
| `EquipoForm.vue:106` | `MAX_FOTOS=4` | Sí en function, no en BD |
| `EquiposView.vue:431,546,557-572` | Solo disponible/en_ubicación se asigna; baja/perdido bloqueado si asignado | Parcial: `check_asignacion_equipo`, `check_baja_equipo_con_portador` (080, solo portador persona) |
| `cuentas.js:74-76`, `correos.js:146-150`, `accesosSensibles.js:79-80` | `password_cambiada` ⇒ solo entonces se toca `password` | No (cliente) |
| `EmpleadoForm.vue:170,198` | Prechequeo DNI duplicado | Sí: `empleados_dni_key` UNIQUE (verificado en Fase 0) |
| `ProblemaDetalleView.vue:108-113` | Transición lineal abierto→diagnostico→acciones→cerrado | Parcial: solo el cierre con acciones pendientes está en trigger |
| `problemas.js:247-271` | Recurrente = 3+ tickets misma categoría en 30 días | No (cómputo en vivo, decisión 033) |
| `reportesTickets.js:28,34,328` | `MAX_COMENTARIOS=20`, lotes 30, `MIN_MUESTRA_PROMEDIO=3` | No |
| `core/entregas.js:8-18` | Entrega 24 h, un solo uso, texto WhatsApp | Sí: `credenciales.ts` |
| `useRevelado.js:44` | Oculta la contraseña a los 8 s (CB-04 vigente en V2) | No (UX); servidor rate-limit |
| `ActividadView.vue:69-71,186` | Filtros en cliente sobre 200 filas | No; recorta la auditoría visible |
| `filtrosTickets.js:126` | "Usted" sin sesión → UUID imposible | No |

## 6. Manejo de errores de base [V]
- Única traducción centralizada: `S/api/erroresDb.js:5-9` (23505 + `uq_cuentas_usuario_plataforma`). Otras por substring: `EquipoForm.vue:320-327`, `CategoriasTicketPanel.vue:101`. `notificaciones.js` ignora 23505. `tickets.js:248-256` degrada ante 42703 (`resuelto_at`).
- Edge functions: `crearInvocador` traduce `code` por mapa; desconocido → "Error de … (<code>)".
- **Llegan crudos** (`e?.message` en ~149 sitios): `P0001` de triggers (texto del `raise` tal cual; `LicenciasView.vue:357-360` y `ProblemaDetalleView.vue:104-107` dependen de eso), `42501` (ningún archivo de `S/` menciona `42501`, `row-level` ni `permission denied`), `23503`, `23514`, otros `23505`, `PGRST*`.
- Red: `core/error-red.js` solo cubre edge functions; una caída en PostgREST directo llega cruda [I].

## 7. Dashboard: requests al aterrizar [V]
`DashboardView.vue:148-157` en `Promise.all`: `getEstadisticas` (7: `empleados` filas completas + 6 count/head), `misTickets` (1, ordena en memoria y recorta a 5), `listPendientes` (5, incl. **todas** las `asignaciones_equipo` activas con embed), `pendientesTickets` (1, todas las filas abiertas), `pendientesProblemas` (3-4, incl. **todas** las filas de `problema_tickets`), `altasIncompletas` (1). Más el shell: `AppLayout.vue:118-126` repite `pendientesTickets()`, realtime `tickets:list`, `AppNotifications` (2 + 2 canales), y el guard `cargarSesion` (4 requests por navegación). **≈25-26 HTTP + 1 socket con 3 canales** por aterrizaje.

## 8. Helpers compartidos (AGENTS) y duplicaciones residuales [V]
Consumidores confirmados: `crearInvocador` (4), `acta-base` (5), piezas de ticket (2 vistas), `crearStorePaginado` (7) / `crearCatalogoStore` (4), `useFormularioModal` (10 + AppDialog), `usePopoverFlotante` (4), `useFiltrosUrl` (9 vistas + AppFiltros). Otros: `useCrudCatalogo` (3), `useRevelado` (4), `useBusqueda` (12), `useRealtimeRefresco` (7 + layout).

Duplicaciones residuales: (1) stores `empresas`/`plataformas` repiten `crearCatalogoStore`; (2) copiar al portapapeles + "copiado" 1500 ms repetido en ≥6 sitios; (3) literales `no_autenticado`/`no_es_staff` en `passwords.js` y `equipos.js`; (4) exclusión de estados terminales escrita 5 veces pese a `ESTADOS_VIGENTES`; (5) `fechaEnDias` alias de `fechaLocalISO` + `fechaHaceDias` propio en problemas; (6) umbral 30 días constante vs literal; (7) detección de únicos por substring; (8) multi-escritura sin RPC (ver §4); (9) dos listas de módulos; (10) `pendientesTickets()` duplicado layout/vista.

## 9. Tests y CI [V]
- `T/`: 56 archivos. 29 unitarios puros (dominio, store paginado, forma del API, invocador, PDF, actas, formatters, **edge functions importadas directo**: `functions-handler`, `credenciales` AES, validaciones de tickets/fotos), 20 de render (`happy-dom`), 1 composable, 6 smoke de integración (`describe.skipIf` por secrets; `permisos-credenciales-sincronizados` además `ctx.skip`), + `tests/db/triggers.test.sql` (5 bloques, rollback por `raise`).
- Corrida local: **51 archivos pasados | 5 saltados; 512 tests pasados | 34 saltados**, 60 s, solo con `--no-file-parallelism` (en paralelo el host se queda sin memoria).
- CI `.github/workflows/ci.yml`: `lint-y-typecheck` (eslint + `deno check`), `build-y-tests` (build, vitest, `patrones-ui.mjs`, `npm audit --audit-level=high`), `test-integration` (falla si faltan 4 secrets, P0-04), `tests-db` (omite con warning sin `INSFORGE_ACCESS_TOKEN`), `resumen-verificacion`, `secrets-smoke-pendientes` (cron lunes), `deploy-manual` (dispatch: una migración + registro; redeploy + `function_deploys`). Disparadores: push a `main`, PR, dispatch, cron.

## 10. Portal público (todo por edge function) [V]
`/soporte` (landing sin datos); `/soporte/nuevo` (catálogo + DNI 8 + categoría + título + descripción + captura comprimida; confirmación con código, token y `vinculado`); `/soporte/buscar` (tickets activos + cerrados con encuesta pendiente del DNI, con enlace de seguimiento); `/soporte/:token` (título, código, estado, fechas, comentarios no internos; realtime `ticket:<token>` sin sesión; encuesta embebida al cerrar); `/soporte/:token/satisfaccion`; `/entrega/:token` (tras "Revelar": nombre + usuario/contraseña en claro una sola vez); `/encuesta/:slug`.
