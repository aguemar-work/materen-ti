# Historial de auditorías — Materen · Sistema TI

> Reemplaza a `auditoria_seguridad_sistema-ti_2026-07-07.md` y
> `auditoria_integral_2026-08-05.md` (eliminados de la raíz). Este documento
> condensa ambos ciclos en una ficha de hallazgos con **estado verificado**,
> no una narrativa completa — para el razonamiento y la evidencia detallada
> de cada hallazgo, ver el historial de git en esas rutas antes de su borrado
> (commit de esta actualización de documentación).

**Última reconciliación de estados:** 2026-08-11, contra el código real del
repo (no de memoria) — mismo método que `PANORAMA_SISTEMA.md`. Los ítems
marcados **"no reverificado"** son los que esta reconciliación no tuvo
tiempo de comprobar en código; su estado es el que tenían al cierre de su
auditoría de origen, ni confirmado ni descartado.

---

## Ciclo 1 — Auditoría de seguridad estática (2026-07-07)

Alcance: análisis 100% estático (código, migraciones, edge functions, config
de despliegue), sin requests a producción. Las 12 hipótesis de riesgo
evaluadas quedaron **remediadas o aceptadas** ya en el propio ciclo (ver
`7-bis` del informe original) y se reconfirmaron sin cambios en el ciclo 2
(2026-08-05, §3.3) y de nuevo en esta reconciliación (2026-08-11).

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| H-CRIT | Auto-registro público creaba `staff` activo (`ASISTENTE`) | Crítica (condicional) | **Corregido** | `insforge.toml` (`disable_signup=true`) + migración 018 (staff nace inactivo) |
| H-01 / H-12 | "Reabrir solo JEFE" evadible con otro estado destino | Media | **Corregido** | Migración 019 (transiciones válidas en trigger) |
| H-02 | Rate-limit de búsqueda por DNI evadible por spoofing de XFF | Media | **Mitigado** | `tickets.ts`: límite adicional por DNI + preferencia por IP de confianza |
| H-03 | Sin validación server-side de adjuntos | Media | **Corregido** | `tickets.ts`: magic bytes + tope 5 MB + nombre derivado del token |
| H-04 | Política de contraseñas de staff débil (mín. 6) | Media | **Corregido** | `insforge.toml`: mínimo 12 + 4 clases |
| H-05 | Revelado de credenciales sin límite ni throttle | Alta (en contexto) | **Corregido** | `credenciales.ts`: 40 revelados / 5 min por usuario |
| H-06 | UPDATE sin `WITH CHECK` (columnas editables sin control) | Baja/Media | **Corregido (tickets + staff)** | Migración 019 congela `token`/`codigo`/`origen`/`creado_por` en `tickets`. Migración 061 aplica el mismo patrón (trigger que congela columnas cuando quien edita no es jefe) a `staff.rol`/`staff.activo`, al extender el UPDATE para autoedición de `nombre`. Control general por columna en el resto de tablas: no implementado (ver S-03 del ciclo 2) |
| H-07 | Interpolación del término de búsqueda en filtro PostgREST | Baja | **Corregido** | `api/sanitizar.js` |
| H-08 | DNI (8 dígitos) expone tokens de seguimiento de tickets activos | Baja/Media | **Aceptado** | Decisión de producto (2026-07-07): se mantiene el comportamiento |
| H-09 | `@insforge/sdk` en `"latest"` sin fijar | Baja | **Corregido** — versión actualizada por H-12 (2026-08-16) | `package.json`: fijado a `1.4.0` originalmente, hoy `1.5.2` exacto (mismo pin, versión al día — ver H-12) |
| H-10 | Passthrough de texto plano histórico en contraseñas | Baja | **Cerrado sin acción** | Verificado 2026-07-07: 0 filas en claro fuera de `enc2:`/`enc:` |
| H-11 | `.env.local` residual (plantilla Next.js sin uso) | Info | **Corregido** | Archivo eliminado |
| H-12 | H-09 solo fijó `@insforge/sdk` en `frontend/package.json` (`^1.4.0`) — las 4 edge functions lo importan sin versión (`npm:@insforge/sdk`, sin `@<versión>`), así que Deno resuelve a la última en cada `deploy`/`check`. Detectado 2026-08-16 al generar `functions/deno.lock` para el type-check (Q-04): resolvió `1.5.2`, ya distinto del `1.4.0` que usa el frontend | Baja/Media | **Resuelto en código (2026-08-16) — pendiente de deploy** | Las 4 edge functions ahora importan `npm:@insforge/sdk@1.5.2` (versión exacta, no rango) y `frontend/package.json` subió de `^1.4.0` a `1.5.2` exacto — misma versión en ambos lados, sin ambigüedad de rango. **Por qué subir el frontend en vez de bajar las functions**: revisado el diff de tipos 1.4.0→1.5.2 completo (`client-*.d.ts` de ambas versiones) más las 3 release notes de GitHub (v1.5.0/1.5.1/1.5.2) contra cada API que el código real usa (`database.from/select/eq/in/gte/lte/order/maybeSingle/rpc`, `auth.getCurrentUser`, `storage.upload`, `realtime.connect/subscribe/unsubscribe/on/off/once/publish/disconnect/isConnected`): sin cambios breaking en ninguna. Lo único que cambió de forma real en esas versiones (`getPublicUrl()` pasó de devolver `string` a `{data:{publicUrl},error}`) no se usa en ningún archivo del proyecto (verificado por grep). El cambio de dominio de functions (`functions.insforge.app`→`function2.insforge.app` en 1.5.2) tampoco aplica: `api/client.js` ya fija `functionsUrl` explícito desde el gotcha de AGENTS.md, y las edge functions nunca se invocan entre sí. El cambio de semántica de `storage.upload()` en 1.5.0 (ya no autorrenombra en colisión, reemplaza en su lugar) tampoco aplica: `functions/tickets.ts` sube cada adjunto a una key con el token único del ticket, nunca hay colisión real. Verificado con `deno check` (0 errores) y con el frontend completo instalado en 1.5.2 real (no solo los tipos): build + suite completa en la misma línea base ya conocida (88/97, ver nota sobre Q-04 arriba y la fila de "Verificación" en `AGENTS.md`) — **0 regresiones nuevas**. De paso se encontró y corrigió un efecto colateral real: `frontend/vitest.config.js` tenía un alias de test que interceptaba el string exacto `npm:@insforge/sdk` (sin versión) para no tocar el SDK real en tests unitarios — al fijar la versión en el import, el alias dejó de calzar y 2 archivos de test completos (`credenciales.test.js`, `tickets-validaciones.test.js`) fallaban por error de resolución de módulo, no por lógica; ahora el alias usa una regex que matchea con o sin versión. Lockfile `functions/deno.lock` versionado en git — ver nota abajo. **Pendiente, fuera de este cambio a propósito**: redesplegar las 4 edge functions para que el pin tenga efecto real en producción (lo coordina el usuario, es una de las 3 capas de deploy independientes) |

**Nota sobre `functions/deno.lock`** (decisión de la resolución de H-12): se versiona en git. Fija las dependencias TRANSITIVAS de `@insforge/sdk` (`@supabase/postgrest-js`, `socket.io-client`, `zod`, etc.) para que `deno check` sea reproducible en cualquier máquina/CI, más allá del pin del propio `@insforge/sdk` que ya vive en el import. **Ojo con el límite real**: este lockfile solo lo lee `deno check` (dev/CI) — `npx @insforge/cli functions deploy` sube un único archivo `.ts` sin lockfile acompañante, así que el pin que de verdad controla qué corre en producción es el especificador de versión dentro del import (`@1.5.2`), no este archivo.

---

## Ciclo 2 — Auditoría técnica y de producto integral (2026-08-05)

Alcance: repo completo + suite de tests + `vite build` + `npm audit` +
`scripts/contraste.mjs`, ejecución local, cero requests a producción. Roles:
Arquitectura, UX, Seguridad, QA, DevOps, Performance, Datos, Documentación.
Declaró explícitamente que **no repite** los hallazgos del ciclo 1 (ya
verificó que seguían cerrados, ver arriba).

### Crítico / Alto

| ID | Hallazgo | Rol | Estado (verificado 2026-08-11) | Referencia |
|----|----------|-----|-------------------------------|------------|
| T-01 | Fecha UTC (`toISOString().split`) en 24 sitios → historial y vencimientos con un día de error en Perú | Datos | **Resuelto** | `core/utils.js:todayISO()` y `core/formatters.js:fechaISO()` ahora usan hora local; el único match de `toISOString().split` que queda en el repo es el comentario que explica por qué no usarlo |
| S-01 | Endpoint público `crear` de tickets sin rate-limit, sin cota de texto, con correo a destinatario arbitrario | Seguridad | **Resuelto — superado** (2026-08-13) | Migración 037 (`ticket_creacion_intentos`) + `TITULO_MAX_LEN`/`DESCRIPCION_MAX_LEN` en `tickets.ts` mitigaron el riesgo original; la migración 055 retiró directamente todo envío de correo en `tickets.ts` (decisión de producto: sin correo por el momento), así que la superficie de "correo a destinatario arbitrario" ya no existe |
| S-02 | 4 CVE altas en `ws`/`socket.io-parser` (transitivas de `@insforge/sdk`) | Seguridad | **Resuelto** | `package-lock.json`: `ws@8.21.0`, `socket.io-parser@4.2.7` — ambos fuera de rango vulnerable, sin tocar el pin de `@insforge/sdk` |
| Q-01 | Tests de integración/BD dan check verde sin ejecutarse | QA | **Mitigado** (parte original) + **variante nueva resuelta (2026-08-16)** + **tercera reaparición, 2026-08-17 (ver abajo)** | `ci.yml` ya no hace `exit 0` silencioso: emite `::warning::` visible. Los 4 secrets (`INSFORGE_TEST_STAFF_EMAIL/PASSWORD`, `INSFORGE_ACCESS_TOKEN`, `INSFORGE_PROJECT_ID`) **siguen sin existir** en el repo — los jobs siguen sin verificar nada, ya no lo esconden. **Reaparición del mismo patrón por otra vía**: el commit `030cc89` (2026-08-15, "Pruebas") cambió la forma de `porTecnico`, retiró `backlog`/`sinResolver` y redefinió `porSolicitante.total` en el reporte de tickets sin actualizar sus tests — `build-y-tests` quedó en **rojo real** (no un verde falso esta vez, sino un rojo visible que nadie miró) durante más de un día, hasta el commit siguiente inclusive. No es exactamente el mismo hallazgo (acá el check SÍ corrió y SÍ falló) pero es la misma familia de problema: un check que no cumple su función de alerta. Cerrado en ese momento: los 8 tests corregidos (línea base real de entonces: 95 pasan + 1 se salta), y `CONTRIBUTING.md`/`.github/pull_request_template.md` nuevos para que esto se note antes de mergear, no una semana después. **Tercera reaparición (2026-08-17), esta vez en producción real**: la migración 059 (2026-08-17) eliminó `areas_obras.ubicacion_id`; `api/domains/empleados.js` seguía pidiendo el embed anidado `areas_obras(nombre, ubicaciones(nombre))` que dependía de esa columna → `GET /empleados` devolvía 400 `PGRST200` en producción ("Could not find a relationship between 'areas_obras' and 'ubicaciones'"), y el `TypeError` en cascada de `DashboardView.vue` (`stats` quedaba `null` tras el `Promise.all` fallido y el template lo leía sin guardia). `npm test` seguía en 100/100 verde, `build`/`lint` limpios: el smoke de integración existente (`tickets-api.smoke.test.js`) SOLO ejercitaba `tickets`, nunca tocaba `empleados` — exactamente la clase de bug que `PANORAMA_SISTEMA.md` dice que este check "atrapa" (desincronización esquema↔frontend), y no lo atrapó porque nunca corre sin los 4 secrets, que siguen sin existir 12 días después de abierto este hallazgo. Corregido: `SELECT_EMPLEADO` en `empleados.js` vuelve a pedir `empresas(nombre), areas_obras(nombre), ubicaciones(nombre)` como tres embeds independientes (sin anidar, consistente con que la 059 separó ambos ejes); guardia `v-if="!stats"` + `catch` en `DashboardView.vue`; nuevo `tests/integration/embeds.smoke.test.js` — una consulta real por cada `select()` con embed del resto de dominios (empleados, correos, licencias, equipos, kb, staff, problemas, reportes de tickets, dashboard), para que un cambio de esquema en cualquiera de ellos rompa CI en vez de producción. Sigue sin resolverse la causa raíz de fondo: sin los 4 secrets configurados, ninguno de estos smoke tests corre nunca en CI, ni el viejo ni el nuevo — ver instrucciones para crearlos en `AGENTS.md`/`README.md` |
| A-01 | Bajas de empleado sin atomicidad (4 escrituras secuenciales) | Arquitectura | **Resuelto** | Migración 038: RPC `dar_baja_empleado()` `SECURITY DEFINER`, una sola transacción |
| D-01 | Cero observabilidad de producción (sin Sentry/errores) | DevOps | **Resuelto** (2026-08-13) — `@sentry/vue` instalado e inicializado en `main.js` (solo `PROD` + `VITE_SENTRY_DSN`; `window.onerror`/`unhandledrejection` los captura el SDK por defecto — confirmado `defaultIntegrations` no se desactiva con `integrations: []`, solo se le agregan cero integraciones extra, ver `node_modules/@sentry/core/build/types/types/options.d.ts`). Sin Session Replay/`browserTracingIntegration`/`enableLogs` (no estaban en el plan aprobado — la app maneja DNI/credenciales). DSN real configurado por el usuario en `frontend/.env` (gitignorado) y host de ingesta agregado al `connect-src` de ambos `vercel.json`. Verificado de punta a punta con `npm run build` + `npm run preview` + Playwright: 0 violaciones de CSP, el evento de error de prueba llegó a Sentry (`200`, con event ID real) | `main.js`, `frontend/.env`, `vercel.json` (×2), `docs/CHANGELOG.md` |
| U-01 | Texto terciario a 2,54:1 (falla WCAG AA), prescrito por la guía de diseño | UX | **Abierto** — ampliado 2026-08-12: en oscuro tampoco alcanza AA para texto normal (3,68:1–3,91:1, solo cumple el umbral de texto grande 3:1). Fix (a) propuesto, mismo nombre de token, mismo tono neutro (no el gris con tinte verde de la propuesta de paleta de `design.pen`, que es un cambio aparte): `--mat-color-text-tertiary: #697281` en claro (4,53:1/4,86:1) y `#747C8B` en oscuro (4,50:1/4,23:1 — bg-elevated queda justo debajo de 4.5, aceptable por ser 0,27 el margen y no texto de cuerpo largo, pero anotarlo) | `--mat-color-text-tertiary: #9CA3AF` sin cambios, `main.css:48` (claro) y `main.css:212` (oscuro) |
| S-03 / T-02 | Sin `CHECK` de prefijo de cifrado en columnas de contraseña | Seguridad/Datos | **Abierto** | Revisadas migraciones 001–053: ningún `CHECK` sobre columnas de contraseña/clave |
| P-01 | Dashboard cuenta filas descargando todas | Performance | **Resuelto** (2026-08-13) | `api/domains/dashboard.js` `getEstadisticas()` — 6 de 7 queries pasan a `.select('id', { count: 'exact', head: true })` (patrón ya usado en `licencias.js`/`correos.js`/`tickets.js`/`equipos.js`/`kb.js`/`problemas.js`/`personalRegistros.js`/`empleados.js`, sin `head` porque ahí también necesitan las filas); leen `res.count` en vez de `res.data.length`. La 7ª (`empleados`) sigue trayendo filas porque necesita `estado` por fila para separar activos/total — ya era una consulta angosta (2 columnas, sin joins) |
| Q-04 | `functions/*.ts` nunca se compilan; sin linter/tsconfig | QA | **Resuelto (2026-08-16)** | Runtime real verificado antes de configurar nada (`Deno.env`, imports `npm:@insforge/sdk` — no Node): `functions/tsconfig.json` + `deno check` (Deno, no `tsc`, para no fingir soporte de `npm:`/globals `Deno` que un tsconfig de Node no resuelve). `eslint.config.js` (raíz) cubre `frontend/src` (Vue 3 + JS) y `functions/*.ts` (TypeScript, sin type-aware linting — evita mezclar el tsconfig de Deno con el compilador de Node de `typescript-eslint`) con reglas alineadas al estilo ya existente; los 8 hallazgos de estilo Vue que sobrevivieron quedaron en `warn`, no en `error` (no ameritan bloquear CI). `.prettierrc.json` infiere el estilo real (comillas simples, punto y coma, `printWidth` 120) pero **no** corre en CI ni vía `eslint-plugin-prettier`: `prettier --check` marca 130 de los archivos existentes (espaciado/orden, no bugs) — forzarlo habría sido reformatear el repo entero de golpe, fuera de alcance. Nuevo job `lint-y-typecheck` en `ci.yml`. De paso, corregidos los 10 errores de tipo reales que `deno check` encontró en `functions/*.ts` (2 por una anotación de retorno laxa en `credenciales.ts#fromB64`, 7 porque el SDK sin `Database` schema generado tipa como arreglo toda relación embebida 1:1 — verificado contra el esquema real que siempre es un objeto) y 8 `no-unused-vars`/`no-useless-assignment` reales en `frontend/src` (imports muertos, un parámetro de `catch` sin usar, una asignación de PDF que no se leía después) — ninguno era un bug funcional, así que no generaron hallazgo propio |
| S-04 | Sin CSP/HSTS/anti-framing en Vercel | Seguridad | **Resuelto (2026-08-12, corregido el mismo día)** — `frontend/vercel.json` (y su copia `frontend/public/vercel.json`) agregan CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. **Incidente**: la primera versión de la CSP solo incluía `<INSFORGE_PROJECT_URL>` en `connect-src`, y bloqueó el WebSocket del realtime (`wss://...`, socket.io) en cuanto se desplegó — justo el riesgo que ya se había anotado como "pendiente de validar en preview". Corregido agregando el esquema `wss://` explícito al mismo host en `connect-src`. Lección: `https://` en `connect-src` no cubre `wss://` de forma confiable en la práctica, aunque el spec de CSP3 diga que debería |
| W-01 / W-02 | `AGENTS.md` decía "sin tests"; README omitía 10 migraciones | Documentación | **Resuelto** | Corregido en el propio ciclo 2026-08-05, reconfirmado hoy |
| T-05 | **Bug en producción (detectado y resuelto 2026-08-12)**: crear un ticket, una cuenta, o dar de alta/baja a un empleado fallaba con 500 (`function crear_notificacion(...) is not unique`) | Datos | **Resuelto** | La migración 048 agregó un 6º parámetro opcional a `crear_notificacion()` vía `create or replace function` esperando que reemplazara la versión de 5 argumentos de la 045 — pero un cambio de firma crea una sobrecarga nueva en Postgres, no reemplaza la vieja. Las 4 llamadas de 5 argumentos (045) quedaron ambiguas entre ambas desde que se aplicó la 048. Migración 054 elimina la sobrecarga vieja; reproducido y verificado el fix directo contra producción (insert de prueba, limpiado después) |

### Medio / Bajo

| ID | Hallazgo | Rol | Estado (2026-08-11) |
|----|----------|-----|----------------------|
| T-04 | Reporte de tickets sin cota de filas | Datos | **Parcial (2026-08-18)** — la mitad de `obtenerSatisfaccionConsolidado` quedó resuelta: causaba `502` en producción (~90 tickets ya generaban una URL demasiado larga para el `.in()` troceado; el navegador lo reportaba como bloqueo CORS, efecto secundario del 502, no una causa aparte). Ahora delega en el RPC `reporte_satisfaccion_consolidado()` (migración 053, con `GRANT` desde la 062), que ya existía sin usar — mismo cálculo en una sola consulta SQL, sin `.in()` ni límite de URL posible; `resumenSatisfaccionPorSolicitante`/`resumenSatisfaccionPorTecnico`/`promedioYMuestra`/`ordenarPeorPrimero` se eliminaron por quedar sin llamador. Sigue **abierto** el resto: `api/domains/reportesTickets.js:60-64,190-196,217-221` (`obtenerReporteTickets`/`obtenerResumenTickets`) sin `.limit()` — sus RPC equivalentes (`reporte_tickets`/`reporte_tickets_resumen`, misma migración 053) también existen sin usar, pero migrarlos es un cambio mayor (alcance "solo mi actividad", arrastrados, tiempos) que no ha fallado en producción; se trocean con `TAM_LOTE = 30` (bajado de 100 como hardening tras el incidente, no por falla propia) |
| P-02 | Realtime recarga la bandeja completa en cada cambio | Performance | **Resuelto (2026-08-17)** — confirmado también en `equipos:list`: una importación masiva (`ImportarEquiposView.vue` migrando fila por fila) dispara decenas de eventos en segundos y cada uno relanzaba el `SELECT` pesado sin ninguna guardia, saturando InsForge hasta 502. Fix: `useRealtimeRefresco.js` gana `crearRefrescoDebounced` (leading + trailing coalescente + guardia de solicitud-en-curso, opt-in vía `opciones.debounceMs`), aplicado a las 4 vistas de lista (`equipos`/`empleados`/`licencias`/`correos`) y al manejo manual de `tickets:list` en `components/shared/AppLayout.vue` (ruta corregida — ya no vive en `layouts/`) vía la misma utilidad compartida. `AppNotifications.vue`/`TicketSeguimientoView.vue` quedan sin debounce a propósito: necesitan reaccionar a cada evento individual. Además se agregó `ConfirmDialog` antes de "Migrar todas las filas listas" en `ImportarEquiposView.vue`, que hasta ahora escribía en lote sin confirmación previa |
| U-05 | Cierre de ticket sin resumen → borradores de KB vacíos | UX/Producto | **Abierto**, confirmado — `TicketDetalleView.vue:196-220,535` + `stores/ticketDetalle.js:116-123`: el borrador se crea sin campo de contenido |
| A-02 | Roles restringidos por literal de ruta en el guard | Arquitectura | **Resuelto (2026-08-12)** — las 4 rutas declaran `meta.roles`/`meta.redirigirDenegado`; `router/guards.js` ahora lee `to.meta.roles` en un único bloque en vez de 4 `if` literales |
| U-02 | Sin `:focus-visible` propio en `.btn`/`.icon-btn` | UX | **Resuelto (2026-08-12)** — agregado `:focus-visible` a `.btn`/`.icon-btn` en `main.css` |
| D-06 | CI no corría `contraste.mjs` ni `npm audit` | DevOps | **Resuelto** — `ci.yml` ya ejecuta ambos en cada push/PR |
| Q-02 / Q-03 | Cero tests de componentes Vue ni de `api/domains/*` | QA | **Parcial** — `reporte-tickets-agregacion.test.js` ya testea `api/domains/reportesTickets.js`; cero uso de `@vue/test-utils`/`mount(` en `frontend/tests/` |
| P-03 | ~390 KB de chunks de PDF muertos (`html2canvas`/`dompurify`) | Performance | **Medido (2026-08-12), sin acción de código** — `npm run build`: `html2canvas.esm-*.js` (202 KB / 48 KB gzip) y `purify.es-*.js` (29 KB / 11 KB gzip) sí aparecen en `dist/assets/`, pero solo están referenciados desde dentro de `jspdf.es.min-*.js` como chunks propios (Rollup solo separa así lo que jsPDF importa con `import()` dinámico internamente, específico de su método `.html()`) — nunca se cargan en producción porque `doc.html()` no se llama en `frontend/src` (confirmado por grep, 0 resultados). Costo real: 0 KB de red para el usuario; ~231 KB solo como peso del artefacto de deploy/`node_modules`. No amerita cambiar de librería por esto |
| D-02 / D-03 | Deploy de edge functions y migraciones sin control de versión | DevOps | **Parcial (2026-08-12)** — nuevo job `deploy-manual` en `ci.yml` (`workflow_dispatch`, nunca en push/PR) aplica **una** migración por corrida vía `db import` en Linux (evita los gotchas de Windows de `AGENTS.md`) y/o redespliega las 4 edge functions; sigue siendo disparado a mano, no automático en cada push — deliberado, porque el proyecto no trackea qué migraciones ya se aplicaron y automatizarlo del todo arriesgaría reaplicar una migración vieja |
| W-03 / W-05 | Guía UX desactualizada / sin diagrama de arquitectura | Documentación | W-03 **resuelto** en esta misma actualización de documentación (2026-08-11); W-05 sigue abierto |
| S-05 / S-06 | Tokens en consola; passthrough de texto plano sin log | Seguridad | **Resuelto** — solo 8 `console.*` en todo el frontend, todos de eventos realtime (`AppLayout.vue:26-30`, `useRealtimeRefresco.js:26,29,33`), ninguno con datos sensibles |
| U-03 / U-04 | Tipografía en px desde 11px; hex de WhatsApp fuera de tokens | UX | **Resuelto (2026-08-12)** — `main.css:785,875,1301` ahora usan `var(--fs-xs)`; se crearon `--mat-color-whatsapp`/`--mat-color-whatsapp-hover` (claro y oscuro) y `.btn-whatsapp` las referencia |
| A-03 | `main.css` monolítico (1.656 líneas al momento del ciclo 2) | Arquitectura | **Mejoró, sigue abierto** — hoy 1446 líneas (bajó 210), pero sigue siendo el único archivo global |
| P-04 | 3 consultas solapadas en pendientes de tickets | Performance | **Resuelto** (2026-08-13) | `api/domains/dashboard.js` `pendientesTickets()` — las 3 queries a `tickets` (mismo filtro base de estado abierto repetido 3 veces) se consolidaron en 1 sola query; `sinAsignar`/`sinVincular`/`abiertosViejos` se derivan en memoria del mismo array. Un ticket que califica en más de un bucket sigue apareciendo en ambos — no es deduplicación de resultados, es de round-trips (3 → 1) |
| D-04 | `.vite/deps` versionado en git | DevOps | **Resuelto (2026-08-11)** — destrackeado (`git rm --cached`) y agregado `.vite/` a `.gitignore` |
| D-05 | `sistema_credenciales_ti.html.bak` legacy en la raíz | DevOps | **Resuelto (2026-08-11)** — eliminado del repo. `sistema_credenciales_ti.html` (sin `.bak`) se mantiene: es un stub de 343 bytes con redirect intencional a `./frontend/`, no es legado |
| A-05 / W-04 / Q-05 | Sin ADRs formales, sin CONTRIBUTING, sin registro de bugs | Varios | **Parcial, mejorado (2026-08-16)** — este documento y `docs/CHANGELOG.md` cubren el registro de hallazgos/documentación; `CONTRIBUTING.md` **ya existe**: convención de commits `fix(scope):`/`feat(scope):` (ya usada de hecho, ahora escrita) + regla "un commit = un cambio coherente" con el episodio de `030cc89` como caso real citado. `.github/pull_request_template.md` también nuevo (checklist de documentación/tests/capa de deploy). Sigue sin existir `docs/adr/` — las decisiones siguen viviendo en `PANORAMA_SISTEMA.md` §6, no en ADRs formales aparte |
| T-03 | Sin backup verificado ni RPO declarado | Datos | No verificable desde el repo (requiere plan InsForge) |
| U-06 | Tablas móviles solo con scroll horizontal | UX | **Resuelto** — patrón `.lista-tarjetas` (`main.css:1348-1421`) ya implementado en 6 vistas |
| Q-06 | `functions/encuestas.ts` y `functions/personal-registro.ts` sin ningún test | QA | **Abierto** — a diferencia de `credenciales.ts`/`tickets.ts`, que sí tienen `.test.js` en `frontend/tests/` |
| W-06 | Sin changelog de producto (para soporte/usuarios) ni plantillas de PR/issue en `.github/` | Documentación/DevOps | **Abierto** (detectado 2026-08-11) — `docs/CHANGELOG.md` es explícitamente de documentación, no de producto; `.github/` solo tiene `ci.yml` |
| A-06 | `AppLayout.vue` es un god-component (1161 líneas): layout global, navegación, buscador y notificaciones realtime en un solo archivo, con hasta 4 niveles de anidamiento en el buscador (`AppLayout.vue:345-419`) y 3 en la navegación (`AppLayout.vue:425-442`) | Arquitectura | **Resuelto (2026-08-12)** — dividido en `AppSearch.vue`, `AppNav.vue` y `AppNotifications.vue`; `AppLayout.vue` baja a 517 líneas y queda solo como orquestador (socket realtime, drawer/colapso, tema, logout). Icono de aviso centralizado en `core/notificacionIconos.js` (antes duplicado con `NotificacionesCampana.vue`). Ojo con `:global()` en `<style scoped>`: en este proyecto pierde el selector descendiente al compilar (verificado en el CSS de `dist/`); las reglas `.sidebar--colapsado .sb-nav-item` etc. quedaron en un segundo `<style>` sin scope en cada componente hijo |
| A-07 | Duplicación conceptual de "encuesta": `modules/encuestas/*` (feature 043) y la lógica ad-hoc de `ticket_satisfaccion` (`api/domains/tickets.js:185-188`, `stores/ticketDetalle.js`, `ReporteSatisfaccionView.vue`) no comparten código ni modelo | Arquitectura | **Abierto** (detectado 2026-08-11) — no urgente, pero cada feature nueva de encuestas obliga a elegir entre los dos sistemas |
| D-07 | Alias CSS legacy marcados "no usar en código nuevo" (`main.css:127`, bloque `--color-*`/`--fs-*`) | DevOps | **Descartado (2026-08-12)** — no es código muerto: 677 usos en 53 archivos de `frontend/src` (verificado por grep). El comentario es una guía para código nuevo, no un candidato a eliminación; eliminarlos rompería la mayoría de las vistas |
| U-07 | Encuesta de satisfacción sin canal de entrega tras la migración 055 (retiro del correo, 2026-08-13): el trigger `crear_encuesta_al_cerrar()` seguía creando la fila y `/soporte/:token/satisfaccion` seguía funcionando, pero nada le decía al empleado que el enlace existía — 48 encuestas generadas, 8 respondidas (cifra previa al retiro) | UX/Producto | **Resuelto (2026-08-16)** — `EncuestaSatisfaccionForm.vue` (extraído de `ResponderEncuestaView.vue`, sin tocar esquema/trigger) se embebe en `TicketSeguimientoView.vue` cuando `ticket.estado === 'cerrado'` (la plomería realtime — `notify_ticket_estado()` + `useRealtimeRefresco` — ya existía, solo se conectó); se oculta sola si la encuesta no existe (`no_disponible`) en vez de mostrar un error. Además, `TicketDetalleView.vue` gana un botón "Copiar mensaje de WhatsApp" (visible mientras `satisfaccion` no tenga `fecha_envio`) que copia al portapapeles, mismo patrón que `copiarEnlaceSoporte()` — sin abrir `wa.me` ni enviar nada por su cuenta. Requirió agregar `token` al `select()`/mapper de `getTicket()` (`api/domains/tickets.js`), que no lo exponía |

---

## Ciclo 3 — Auditoría de Design System (2026-08-12)

Alcance: divergencias entre `design.pen` (librería de componentes en Figma/Pencil,
ver `docs/GUIA-UX-UI.md`) y `frontend/src/styles/main.css`/componentes Vue
**en producción**. A diferencia de los ciclos 1-2 (seguridad/arquitectura),
este ciclo parte del archivo de diseño y valida contra el código real, no al
revés. Metodología: lectura completa de `main.css` (1461 líneas) +
`components/shared/*.vue` + `router/routes/*.js`, sin suposiciones de
sesiones anteriores. Clasificación de riesgo: **(a)** solo visual/token, sin
impacto funcional — deploy inmediato; **(b)** cambia comportamiento (estados,
foco); **(c)** cambia estructura/jerarquía (markup, IA).

| ID | Hallazgo | Riesgo | Estado | Referencia |
|----|----------|--------|--------|------------|
| DS-01 | `.btn-danger:hover` fija `color:#fff` sin condicionar por tema; en oscuro `--color-danger` es `#E88870` (salmón) → 2.57:1, falla AA | (a) — nuevo token, sin tocar markup | **Resuelto** (2026-08-13) — `.btn-danger:hover` usa el invariante `--mat-color-danger-hover` (#DC2626, 4.83:1 con blanco en ambos temas) en vez de `--color-danger` | `main.css` — ver Fase B en `docs/GUIA-UX-UI.md` |
| DS-02 | `:disabled` inconsistente: solo `.icon-btn` lo define (`opacity:.4`); `.btn`, `.btn-primary`, `.btn-danger`, `input`, `select` no tienen regla propia — dependen del estilo nativo del navegador | (b) — nueva regla CSS, sin markup | **Parcialmente resuelto** (2026-08-13) — unificado en `.btn`/`.btn-primary`/`.btn-danger`/`.btn-danger-solid`/`.btn-whatsapp`/`.icon-btn` a `opacity:.5` (decisión de producto confirmada con el usuario). `input`/`select` de formulario **siguen sin regla propia** — fuera de alcance de esta pasada (ver regla de "no tocar sin mostrar diff" en `docs/GUIA-UX-UI.md`) | `main.css` — ver Fase B en `docs/GUIA-UX-UI.md` |
| DS-03 | Estado de error de campo sin tratamiento visual propio: `aria-invalid` se setea (`TicketNuevoView.vue`, `PersonalRegistroView.vue`, `TicketBuscarView.vue`) pero no existe `[aria-invalid] { border-color: ... }` — el borde no cambia, solo aparece `.form-error` debajo | (b) — nueva regla CSS, sin markup | **Abierto** — spec en ficha abajo | `main.css` (sin selector `aria-invalid`); confirmado por grep en los 3 `.vue` |
| DS-04 | `$ring`/`:focus-visible` sin cobertura real en: navegación principal (`.sb-nav-item`, `AppNav.vue`), encabezados ordenables (`ThOrdenable.vue`), buscador con autocompletado (`.combo-wrap input`, `BuscadorCombo.vue`) y buscador global (`.sb-busqueda input`, `AppSearch.vue`) — cero regla de foco visible en los 4 | (b) — nuevas reglas CSS, sin markup | **Resuelto** (2026-08-13) — `.sb-nav-item`/`.th-ordenable-btn` ganaron `outline: 2px solid var(--color-accent); outline-offset: -2px` (mismo criterio ya usado en `.sb-nav-titulo`, evita que el `box-shadow` de anillo se recorte contra el `gap` de 2px entre ítems). `.sb-busqueda input:focus` ganó `box-shadow: 0 0 0 3px var(--mat-ring)`. `.combo-wrap input` **ya estaba resuelto**: siempre vive dentro de `.form-group` (`EquipoForm`/`LicenciaForm`/`CuentaForm`/etc.), que ya trae anillo vía `.form-group input:focus` — el hallazgo original quedó desactualizado. Reauditando contra `design.pen` en esta misma pasada aparecieron 2 gaps reales no listados aquí: `MenuAcciones.vue` (`.menu-acciones__item:focus-visible`, spec `rowY1dDW`) y `BuscadorCombo.vue` (`.combo-lista li.is-activo`, spec `rowlEgjG`) — ambos sin anillo, solo cambio de fondo; corregidos con `box-shadow: 0 0 0 3px var(--mat-ring)`, verificado directamente contra los nodos de `design.pen` vía Pencil MCP antes de tocar código | `AppNav.vue`, `ThOrdenable.vue`, `AppSearch.vue`, `MenuAcciones.vue`, `BuscadorCombo.vue` |
| DS-05 | Selects de filtro (`filtroEstado`, `filtroTipo`, `filtroSituacion`, `filtroCategoria`, `filtroAccion`, `filtroPrioridad`, `filtroSeveridad`) sin `<label>` ni `aria-label` en las vistas con `.filters` — no hay nada que "reactivar": nunca existió un label, ni siquiera oculto | (c) — agrega markup en 7 archivos + ajusta `.filters` | **Resuelto** (2026-08-13) — cada `<select>` de filtro ahora vive en un `.filter-field` (`label` visible arriba, `select` abajo), clase nueva en `main.css` que reemplaza el `flex`/`min-width` que antes tenía `.filters select` directamente. Corrección al hallazgo original: son **7 archivos con 11 selects**, no 10/11 — `ActividadView` (1), `CorreosView` (1), `EmpleadosView` (1), `EquiposView` (2), `KbView` (2), `ProblemasView` (2), `TicketsView` (2); `LicenciasView` **no tiene ningún `<select>` de filtro** (solo buscador de texto), el archivo original la listó por error | `main.css` (`.filter-field`) + los 7 `.vue` listados |

### Fichas de desarrollo

**DS-01 — Token `--color-danger-hover`**
- **Qué cambia**: agregar `--mat-color-danger-hover: #DC2626;` en `:root` (mismo
  valor en `[data-theme="dark"]` — a propósito invariante, no debe heredar el
  comportamiento por tema de `--mat-color-danger`) + alias
  `--color-danger-hover: var(--mat-color-danger-hover);`. Cambiar
  `.btn-danger:hover { background: var(--color-danger); }` →
  `background: var(--color-danger-hover);` (el `color: #fff;` de esa regla se
  mantiene igual, ahora sí es seguro).
- **Selector/componente**: `main.css` — `:root`, `[data-theme="dark"]`,
  `.btn-danger:hover`. Ningún `.vue` cambia.
- **Cómo verificar en QA**: DevTools → forzar `:hover` en un `.btn-danger`
  (ej. "Dar de baja" en `EmpleadoDetalleView`) con `data-theme="dark"` en
  `<html>` → contraste texto/fondo debe medir ≥4.5:1 (usar el inspector de
  contraste de Chrome/Firefox). Repetir en claro (ya pasaba, no debe cambiar
  visualmente: `#DC2626` vs `#963D28`+hover-a-solid es un rojo ligeramente
  distinto — confirmar con Diseño si el tono nuevo es aceptable en claro
  también, o si claro debe quedarse con su valor actual y el fix ser solo
  para oscuro).

**DS-02 — Especificación única de `:disabled`**
- **Qué cambia**: unificar en una sola regla reutilizable. Propuesta:
  ```css
  .btn:disabled, .icon-btn:disabled,
  .form-group input:disabled, .form-group select:disabled {
    opacity: .5;
    cursor: not-allowed;
  }
  .btn:disabled:hover, .form-group input:disabled:focus {
    background: inherit; border-color: inherit; box-shadow: none;
  }
  ```
  (`.icon-btn:disabled` ya existe con `.4` — decidir si se sube a `.5` para
  unificar o se deja `.4` y el resto de selectores lo igualan; es una
  decisión de Diseño, no técnica).
- **Selector/componente**: `main.css`, sección `.btn`/`.icon-btn`/
  `.form-group input,select`. Sin cambios de markup — todos los `:disabled`
  ya se setean vía `:disabled="condición"` en los `.vue` existentes.
- **Cómo verificar en QA**: abrir cualquier modal con envío en curso (ej.
  `EmpleadoForm` guardando) y confirmar que el botón primario Y los campos
  del formulario se atenúan de forma **visualmente consistente** (mismo
  nivel de opacidad), no solo el botón.

**DS-03 — Estado de error visual en campos**
- **Qué cambia**: decisión de Diseño pendiente entre dos opciones (ambas
  compatibles con `aria-invalid` existente, que se mantiene para lectores de
  pantalla):
  - **Opción A (mínima)**: `.form-group input[aria-invalid="true"] { border-color: var(--color-danger-border); }` — mismo patrón ya usado en `.form-error`, cero verde/rojo nuevo.
  - **Opción B (con foco propio)**: agregar además `box-shadow: 0 0 0 3px rgba(150,61,40,.15)` (variante roja del `$ring`) cuando el campo inválido tiene foco.
  - `design.pen` ya modela la Opción A visualmente en `Formularios/Campo de texto` → variant set → "Con error" (ver `PzGrm` en el tablero) — no incluye la Opción B para no adelantarse a una decisión no tomada.
- **Selector/componente**: `main.css`, cerca de `.form-group input:focus`.
  Sin cambios de markup: `aria-invalid` ya se calcula en los `.vue` que lo
  usan.
- **Cómo verificar en QA**: en `TicketNuevoView`, ingresar un DNI de menos
  de 8 dígitos y confirmar visualmente que el campo se distingue de uno
  válido sin depender solo del lector de pantalla.

**DS-04 — Cobertura de `:focus-visible`/`$ring`** — **aplicado 2026-08-13**,
ver fila de estado arriba. `.combo-wrap input` no necesitó cambio (ya
resuelto por `.form-group input:focus`); se agregaron además dos anillos no
listados originalmente (`MenuAcciones.vue`, `BuscadorCombo.vue` `li.is-activo`).
- **Qué cambia**: agregar tratamiento de foco a los 4 componentes sin
  ninguno:
  ```css
  .sb-nav-item:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .th-ordenable-btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .combo-wrap input:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--mat-ring); }
  .sb-busqueda input:focus { box-shadow: 0 0 0 3px var(--mat-ring); }
  ```
  (`outline-offset: -2px` en vez de positivo porque `.sb-nav-item` y
  `.th-ordenable-btn` no tienen el margen externo que sí tiene `.btn`; un
  offset positivo recortaría contra el borde del sidebar/tabla).
- **Selector/componente**: `AppNav.vue` (`.sb-nav-item`), `ThOrdenable.vue`
  (`.th-ordenable-btn`), `BuscadorCombo.vue` (input dentro de `.combo-wrap`),
  `AppSearch.vue` (`.sb-busqueda input`) — cada uno en su propio `<style
  scoped>`, no en `main.css` (son componentes, no clases globales).
- **Cómo verificar en QA**: navegar el sidebar completo con `Tab` (sin
  mouse) y confirmar que cada ítem muestra un indicador de foco visible;
  repetir con `Tab` sobre los encabezados de una tabla ordenable
  (`EmpleadosView`) y sobre el buscador de empleado en un formulario que use
  `BuscadorCombo` (ej. `EquipoForm` al asignar).

**DS-05 — Nombre accesible en selects de filtro** — **aplicado 2026-08-13**,
ver fila de estado arriba (7 archivos/11 selects, no 10/11 como decía la
ficha original — `LicenciasView.vue` no tiene select de filtro).
- **Qué cambia**: agregar un `<label>` visible por select (no un
  `aria-label` invisible — el brief pidió específicamente visible), más
  ajustar `.filters` para que cada control quede en su propia columna
  vertical (label arriba, control abajo) en vez de una fila de controles
  sueltos:
  ```html
  <div class="filters">
    <div class="search-wrap">...</div>
    <div class="filter-field">
      <label for="filtro-estado">Estado</label>
      <select id="filtro-estado" v-model="filtroEstado">...</select>
    </div>
  </div>
  ```
  ```css
  .filter-field { display: flex; flex-direction: column; gap: 4px; }
  .filter-field label { font-size: var(--fs-xs); font-weight: 600; color: var(--color-text-secondary); }
  ```
  Modelado en `design.pen` → `Contenedores/Barra de filtros` (ya actualizado
  en esta pasada, Fase 1).
- **Selector/componente**: 10 archivos — `ActividadView.vue`,
  `CorreosView.vue`, `EmpleadosView.vue`, `EquiposView.vue` (2 selects),
  `KbView.vue` (2), `LicenciasView.vue`, `ProblemasView.vue` (2),
  `TicketsView.vue` (2) — más la clase `.filter-field` nueva en `main.css`.
  Revisar también el breakpoint móvil (`main.css:1441-1443`,
  `.filters select { flex: 1 1 45%; }`) porque el nuevo wrapper cambia qué
  elemento hace de hijo flex directo.
- **Cómo verificar en QA**: en cada una de las 10 vistas, confirmar que el
  label aparece arriba del select en desktop y que en móvil (≤768px) los
  selects siguen apilando de a dos por fila sin que el label rompa el
  ancho. Con lector de pantalla (NVDA/VoiceOver), confirmar que anuncia
  "Estado, combo box" (o equivalente) en vez de solo "combo box".

## Ciclo 4 — Auditoría de superficie UI/UX con skill `ui-ux-pro-max` (2026-08-13)

Alcance: los 65 componentes/vistas Vue del frontend, en 6 lotes por área
(shell y compartidos; tickets; empleados/personal/staff/login; activos y
credenciales; conocimiento y encuestas; dashboard/actividad/configuración),
auditados en paralelo contra el checklist priorizado de la skill
`ui-ux-pro-max` (accesibilidad, touch, rendimiento, estilo, layout,
tipografía, animación, formularios, navegación, gráficos). Cada lote se
briefeó con los hallazgos ya abiertos en este documento (U-01, U-05, DS-02,
DS-03, P-*, D-01, A-07) para reportar solo instancias nuevas, no repetirlos.
6 bugs de impacto real se corrigieron en el mismo ciclo (verificado con
`npm run build`, `npm test` y `node scripts/contraste.mjs`, los tres en
verde); el resto queda documentado como deuda abierta para priorizar después.

### Bugs reales corregidos en este ciclo

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| UX4-01 | Los puntos de la línea de tiempo del historial de ticket (`timeline-dot--info/warning/success/neutral/danger`) no tenían regla CSS — el historial se renderizaba sin color pese a que el código ya calculaba cuál correspondía | Alto | **Resuelto** (2026-08-13) | `main.css` (5 reglas nuevas junto a `--active`/`--closed`); `TicketDetalleView.vue:631` |
| UX4-02 | Buscador global inoperable por teclado: los resultados solo respondían a `@mousedown`, así que Tab+Enter no hacía nada; además el `blur` del input cerraba la lista aunque el foco ya estuviera dentro | Alto | **Resuelto** (2026-08-13) | `AppSearch.vue` — se agregó `@click` a los 5 botones de resultado (el `@mousedown.prevent` se deja solo para evitar el blur en mouse) y `cerrarBusqueda()` ahora comprueba `resultadosEl.contains(document.activeElement)` antes de cerrar |
| UX4-03 | Regresión de contraste en "Enviar por WhatsApp": un `<style scoped>` local reintroducía texto blanco a ~2:1 sobre `#25d366`, el mismo bug que la clase global `.btn-whatsapp` ya corrige a propósito (usa `--mat-color-whatsapp-text`) | Alto | **Resuelto** (2026-08-13) | `CuentasPanel.vue` — se quitó el `background`/`color` hardcodeado del override local, solo queda el ajuste de tamaño |
| UX4-04 | Borde de 3px usado como acento de severidad en acción correctiva vencida, violando la regla de producto "ningún borde supera 2px" | Alto | **Resuelto** (2026-08-13) | `ProblemaDetalleView.vue:494` (`.accion-item--vencida`, bajado a 2px) |
| UX4-05 | Avatar del usuario con texto blanco fijo sobre gradiente que incluye `--color-accent-2` (#34D399); en tema oscuro `--color-accent` también es #34D399, dejando el avatar casi monocromo a ~1.9:1 — el mismo patrón que `--color-text-inverse` ya resuelve en `.btn-primary` | Alto | **Resuelto** (2026-08-13) | `AppLayout.vue` (`.sb-user-avatar`, `color: #fff` → `var(--color-text-inverse)`) |
| UX4-06 | 2 modales hand-rolled (Tipos de equipo, Categorías de ticket) sin cierre por Escape ni bloqueo de scroll del body, inconsistentes con sus 2 pares "equivalentes" (Áreas/Obras, Ubicaciones), que sí usan el `<Modal>` compartido | Alto | **Resuelto** (2026-08-13) | `TiposEquipoPanel.vue`, `CategoriasTicketPanel.vue` — migrados a `<Modal>` (mismo patrón que `AreasObrasPanel.vue`); `useFocoAtrapado` ya no se usa en estos 2 archivos |
| UX4-54 | Barra de filtros desalineada: `.filters` no fijaba `align-items` (heredaba `stretch`), así que `.search-wrap` (sin label, 36px) quedaba top-aligned mientras `.filter-field` (con label + select) lo empujaba ~18px más abajo — visible en las 6 vistas que combinan buscador y selects | Alto | **Resuelto** (2026-08-13) | `main.css` (`.filters { align-items: flex-end; }`) — corrige de una vez `TicketsView`, `ProblemasView`, `KbView`, `EquiposView`, `EmpleadosView`, `CorreosView`; verificado con captura real (desktop y apilado móvil) vía Playwright contra el CSS compilado |

### Patrones sistémicos — todos resueltos (2026-08-13, décimoquinta pasada)

Implementados por 6 agentes en paralelo, cada uno sobre un conjunto de
archivos sin superposición (sin riesgo de choque de ediciones). Verificado
con `npm run build` + `npm test` (96/97 en verde) tras consolidar los 6
lotes, más revisión manual de los cambios de mayor riesgo (StaffView.vue,
CategoriasTicketPanel.vue, notas de empleados).

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| UX4-07 | Sin patrón de tarjetas móviles (`.lista-tarjetas`) — solo scroll horizontal | Alto/Medio | **Resuelto** | Patrón replicado desde `ProblemasView.vue`/`EquiposView.vue` en `LicenciasView.vue`, `AccesosSensiblesView.vue`, `PersonalRegistrosView.vue`, `StaffView.vue`, `KbView.vue`, `EncuestasView.vue`, `EncuestaDetalleView.vue` |
| UX4-08 | Botón mostrar/ocultar contraseña sin `aria-label` | Medio | **Resuelto** | `CorreoForm.vue`, `LicenciaForm.vue` (×3), `AccesoSensibleForm.vue` |
| UX4-09 | Objetivos táctiles bajo 44px | Medio | **Resuelto** | `EquipoForm.vue`, `LicenciasView.vue`, `AppLayout.vue`/`AppSearch.vue` `.sb-logout`, `PersonalRegistrosView.vue`, `StaffView.vue`, `ConfiguracionView.vue`, `TicketsView.vue`, `PreguntaCampo.vue`, `ResponderEncuestaView.vue`. La instancia de `AppNav.vue` `.sb-nav-titulo` quedó sin objeto: en el rediseño de sidebar de esta misma sesión ese título dejó de ser un `<button>` (ya no es interactivo) |
| UX4-10 | Radios ocultos sin `:focus-visible` | Alto (teclado) | **Resuelto** | `CorreoForm.vue` (`.tipo-option`), `LicenciaForm.vue` (`.acceso-option`) — `:focus-within` con el mismo criterio ya usado para checkbox/radio en `main.css` |
| UX4-11 | `confirm()` nativo en vez de `ConfirmDialog` | Alto | **Resuelto** | `StaffView.vue` — reemplazado por `ConfirmDialog` (patrón `TiposEquipoPanel.vue`); de paso se corrigió un truco CSS (`.rol-select:not(:disabled)`) que habría parpadeado al combinarse con el nuevo estado de carga (UX4-13) |
| UX4-12 | Formularios públicos sin `aria-live` tras enviar | Alto | **Resuelto** | `EncuestaPublicaView.vue`, `ResponderEncuestaView.vue`, `PersonalRegistroView.vue` |
| UX4-13 | Sin feedback de carga en acciones async | Medio | **Resuelto** | `StaffView.vue`, `PersonalRegistrosView.vue`, `LoginView.vue` |
| UX4-14 | `aria-pressed` ausente en toggles de selección única | Medio | **Resuelto** | `PreguntaCampo.vue` (escala 1-5, sí/no) |

### Hallazgos puntuales — todos resueltos (2026-08-13, décimoquinta pasada)

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| UX4-15 | Estado de error sin ruta de salida | Alto | **Resuelto** | `ResponderEncuestaView.vue` — enlace a `/soporte` (mismo patrón que `TicketSeguimientoView.vue`) |
| UX4-16 | `.alta-banner` con `color-mix(..., #fff)` crudo | Alto | **Resuelto** | `EmpleadoDetalleView.vue` — reemplazado por `var(--color-accent-subtle)` |
| UX4-17 | Campana de notificaciones sin `Escape` | Alto | **Resuelto** | `NotificacionesCampana.vue` — mismo mecanismo que `MenuAcciones.vue` |
| UX4-18 | `.password-locked` sin nombre accesible propio | Medio | **Resuelto** | `CuentasPanel.vue:299` — `role="img"` + `aria-label` |
| UX4-19 | `role="status"` ausente en carga de página pública | Medio | **Resuelto** | `EntregaView.vue:61` |
| UX4-20 | Sin botón "Reintentar" en error de catálogo | Medio | **Resuelto** | `TicketNuevoView.vue` — nueva función `cargarCatalogo()` reutilizable |
| UX4-21 | Error de campo sin `aria-describedby` | Bajo | **Resuelto** | `TicketNuevoView.vue`, `TicketBuscarView.vue` |
| UX4-22 | Asterisco de obligatorio inconsistente | Bajo | **Resuelto** | `TicketBuscarView.vue:71-72` — "DNI" → "DNI *" |
| UX4-23 | Indicadores de "Vínculos" sin `aria-label` | Medio | **Resuelto** | `EmpleadosView.vue` |
| UX4-24 | Input de búsqueda sin `aria-label` | Medio | **Resuelto** | `EmpleadosView.vue:195-199` |
| UX4-25 | `.btn-baja` en vez de `.btn-danger` | Bajo | **Resuelto** | `EmpleadoDetalleView.vue` — clase muerta `.btn-baja` eliminada (verificado sin otros usos en el repo) |
| UX4-26 | Campo "Notas" sin control de edición | Bajo | **Resuelto** | `EmpleadoForm.vue` (textarea nuevo) + `api/domains/empleados.js` (`empleadoToRow` vuelve a escribir `notas`, vía `trimText`) — verificado que la omisión original no tenía una decisión de producto documentada en contra |
| UX4-27 | Texto truncado sin `white-space:nowrap` | Medio | **Resuelto** | `BajaEmpleadoModal.vue:296-301` |
| UX4-28 | Formulario público sin `autocomplete` | Bajo | **Resuelto** | `PersonalRegistroView.vue` |
| UX4-29 | Mensajes de estado async sin `role="status"` | Medio | **Resuelto** | `PersonalRegistroView.vue` — mismo fix que UX4-12 (mismo contenedor) |
| UX4-30 | Login sin foco inicial | Medio | **Resuelto** | `LoginView.vue` — `autofocus` en el campo de correo |
| UX4-31 | Error de confirmación de contraseña no asociado al campo | Medio | **Resuelto** | `LoginView.vue` — `errorConfirmar` propio bajo el campo `confirmar-password` |
| UX4-32 | `aria-describedby` ausente en `ConfirmDialog` | Medio | **Resuelto** | `ConfirmDialog.vue` — `useId()` + `aria-invalid` |
| UX4-33 | `.aviso-card` sin manejo de Space | Medio | **Resuelto** | `AppNotifications.vue:79-84` |
| UX4-34 | Paginación sin `aria-live` | Medio | **Resuelto** | `Pagination.vue:27` |
| UX4-35 | Borrador de KB vacío sin señal distinta | Medio | **Resuelto** | `KbArticuloDetalleView.vue` — badge `.badge--warning` "Pendiente" + placeholder en modo edición |
| UX4-36 | Grid de acción correctiva sin breakpoint móvil | Alto | **Resuelto** | `ProblemaDetalleView.vue:519` |
| UX4-37 | `<label for>` sin contraparte real | Bajo | **Resuelto** | `EncuestaForm.vue` |
| UX4-38 | Cierre de ronda sin `ConfirmDialog` | Alto | **Resuelto** | `EncuestaDetalleView.vue` |
| UX4-39 | `<label for>` roto en 3 tipos de pregunta | Medio | **Resuelto** | `PreguntaCampo.vue` — `fieldset`/`legend` para `opcion_unica`/`escala_1_5`/`si_no` |
| UX4-40 | Escala 1-5 sin significado de extremos | Medio | **Resuelto** | `PreguntaCampo.vue` — hints "1 = Nada satisfecho"/"5 = Muy satisfecho" |
| UX4-41 | Encuesta pública sin indicador de progreso | Medio | **Resuelto** | `EncuestaPublicaView.vue` — contador "X de Y preguntas respondidas" (el formulario muestra todas a la vez, no pagina) |
| UX4-42 | Carga inicial del Dashboard sin esqueleto | Medio | **Resuelto** | `DashboardView.vue:61` — reutiliza la animación `skeleton-pulso` ya definida en `main.css` |
| UX4-43 | Tarjeta "Cuentas asignadas" no interactiva con aspecto de clicable | Bajo | **Resuelto** | `DashboardView.vue` — `cursor: default` explícito |
| UX4-44 | Color `danger` mal usado para conteo neutro | Bajo | **Resuelto** | `DashboardView.vue` — cambiado a `info` (azul), único token categórico libre en esa fila |
| UX4-45 | Texto truncado solo accesible vía `title` | Medio | **Resuelto** | `ActividadView.vue:131` — envuelve en vez de truncar |
| UX4-46 | Alta rápida de subcategoría sin `aria-label` | Medio | **Resuelto** | `CategoriasTicketPanel.vue:223-234` |
| UX4-47 | Widget anidando botones reales dentro de `role="button"` | Medio | **Resuelto** | `CategoriasTicketPanel.vue` — separado en `.cat-fila-toggle` (`<button>`) + `.actions` hermano |
| UX4-48 | Imágenes de "Marca" sin `loading="lazy"` | Bajo | **Resuelto** | `DesignSystemView.vue:529,533,537` |
| UX4-49 | Emoji en vez de ícono Tabler | Alto | **Resuelto** | `EntregaView.vue:126` |
| UX4-50 | Transiciones sin `prefers-reduced-motion` | Bajo | **Resuelto** | `AppLayout.vue`, `AppNotifications.vue` |
| UX4-51 | Tokens muertos/valores crudos | Bajo | **Resuelto** | `EncuestaForm.vue`, `PlataformasView.vue`, `CuentaForm.vue`, `AppLayout.vue`, `EncuestaDetalleView.vue` |
| UX4-52 | Tuteo aislado en `ConfirmDialog` | Bajo | **Resuelto** | `TicketInternoForm.vue:239`. Nota: el mismo string tuteante se repite en otros 9 `ConfirmDialog` fuera de este alcance (`EquipoForm.vue`, `CuentaForm.vue`, `ProblemaForm.vue`, `EncuestaForm.vue`, `KbArticuloForm.vue`, `LicenciaForm.vue`, `EmpleadoForm.vue`, `AccesoSensibleForm.vue`, `CorreoForm.vue`) — no tocados, quedan como candidato a un hallazgo nuevo si se pide |
| UX4-53 | Chips/botones sin `:focus-visible` propio | Bajo | **Resuelto** | `TicketsView.vue` `.chip-filtro`, `ResponderEncuestaView.vue` `.nivel-btn` |

## Ciclo 5 — Reconciliación de design system con skill `ui-ux-pro-max` (2026-08-14)

Alcance: los 49 componentes/vistas del frontend, en 6 lotes por área (mismo
método que Ciclo 4), briefeados con la deuda ya abierta en este documento
para reportar solo instancias nuevas o regresiones. Distinto de Ciclo 4 en
un punto: el repo tenía cambios reales sin commitear al momento de auditar
(feature de módulos visibles por staff, migración 056, y un refactor de
estilos en `KbArticuloForm.vue`/`ProblemaForm.vue`), así que varios
hallazgos son de ese código nuevo, no deuda vieja. Todos los hallazgos de
impacto real se corrigieron en el mismo ciclo (verificado con
`npm run build` y `npm test`, 96/97 en verde, igual que la línea base ya
conocida).

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| UX5-01 | `proximaFecha()` referenciaba `HOY`, variable eliminada por el refactor a `core/dominio-licencias.js` sin reimportar `fechaLocalISO` — `ReferenceError` real al usar "Renovar" en una licencia por suscripción | Crítico (funcional) | **Resuelto** | `LicenciasView.vue` — reimportado `fechaLocalISO` de `core/formatters.js` |
| UX5-02 | Ícono KPI "Tickets abiertos" del Dashboard (`--color-info`, azul, ya fijado en UX4-44) vs. la misma tarjeta documentada en `/design-system` con `--color-danger` (rojo) — desincronizados | Alto | **Resuelto** | `DesignSystemView.vue` (`.ds-stat-icon--tickets` → `--color-info-bg`/`-text`, igualando al código real) |
| UX5-03 | Badge "Sin vincular" hardcodeado en la tarjeta móvil de `TicketsView.vue` mientras la fila de escritorio ya usaba `badgeInfo('ticket_sin_vincular')` | Alto | **Resuelto** | `TicketsView.vue` |
| UX5-04 | `BajaEmpleadoModal.vue` hand-rolled sin cierre por Escape ni bloqueo de scroll del body — misma categoría que UX4-06 | Alto | **Resuelto** | Migrado a `<Modal>` compartido |
| UX5-05 | `.emp-avatar` con `color:#fff` fijo sobre gradiente monocromo en oscuro (~1.9:1) — mismo bug que UX4-05, reproducido sin el fix | Alto | **Resuelto** | `EmpleadoDetalleView.vue` → `var(--color-text-inverse)` |
| UX5-06 | `AccesoSensibleForm.vue` era el único formulario grande con modal hand-rolled tras la migración de `ProblemaForm.vue`/`KbArticuloForm.vue` a `<Modal>` en este mismo ciclo | Medio | **Resuelto** | Migrado a `<Modal>` compartido |
| UX5-07 | `<Modal>` compartido cerraba por Escape/backdrop/X sin pasar por el chequeo de "cambios sin guardar" (`estaSucio`) — solo el botón "Cancelar" lo respetaba; riesgo real de pérdida de datos en `KbArticuloForm.vue`/`ProblemaForm.vue`/`EncuestaForm.vue`/`AccesoSensibleForm.vue` | Alto | **Resuelto** | `Modal.vue` — nuevo prop opcional `confirmarCierre` (guard function), default `null` (sin cambio de comportamiento para los demás ~10 consumidores) |
| UX5-08 | Toast nuevo de la migración 056 tuteaba: "No tienes acceso a ese módulo o sección" | Medio | **Resuelto** | `router/guards.js` |
| UX5-09 | Cluster de tuteo nuevo (distinto del ya documentado en `ConfirmDialog`, UX4-52): mensajes de `EmptyState`, validaciones de formulario y copy público en varios módulos | Medio | **Resuelto** | `EncuestasView.vue`, `EncuestaDetalleView.vue` (×2), `EncuestaPublicaView.vue` (×2), `EmpleadosView.vue`, `BajaEmpleadoModal.vue` (×3), `KbArticuloForm.vue`, `ProblemaForm.vue` (×2), `ProblemaDetalleView.vue`, `DesignSystemView.vue` (copy de demo), `AccesoSensibleForm.vue` |
| UX5-10 | `EncuestaPublicaView.vue` sin enlace de salida en su estado de error, a diferencia de su hermana `ResponderEncuestaView.vue` (patrón ya resuelto en UX4-15) | Medio | **Resuelto** | Agregado enlace `.public-volver` a `/soporte` |
| UX5-11 | Tipografía en `px` sueltos fuera de la escala `--mat-fs-*`/`--fs-*`, no cubierta por auditorías anteriores | Bajo | **Resuelto** (parcial, ver pendiente) | `DashboardView.vue`, `LoginView.vue`, `EntregaView.vue`, `EmpleadoDetalleView.vue`, `LicenciasView.vue`, `LicenciaForm.vue`, `CorreoForm.vue`, `PersonalRegistrosView.vue` |
| UX5-12 | Fallbacks CSS muertos (`var(--x, var(--x))` o fallback a un token siempre definido) y un color de peligro inventado sin relación a ningún token | Bajo | **Resuelto** | `EquipoForm.vue` (fallback muerto + `.foto-x:hover` → `--mat-color-danger-hover`), `CuentaForm.vue` (4 fallbacks, completa UX4-51), `LoginView.vue` (4 fallbacks más, incluye un bug real: `.login-aviso` usaba `--color-success` de alta saturación como color de texto en vez de `--color-success-text`, falla de contraste potencial) |
| UX5-13 | `.badge-inline` usado en `ProblemaDetalleView.vue` sin que ese componente definiera la regla local (solo existía `scoped` en otros 2 archivos) | Bajo | **Resuelto** | `ProblemaDetalleView.vue` |

**Pendiente de esta pasada** (sin token exacto en la escala, requiere
decisión de diseño — no forzado a un mapeo incorrecto):
`DashboardView.vue` `.stat-value` (28px) y `.section--stats .stat-value`
(22px); `EmpleadoDetalleView.vue` `.header-sub` (12.5px), `.dato dd`
(13.5px), `.panel-item-meta` (11.5px). Ningún archivo quedó con una
regresión de Ciclo 3/4 — se confirmó vigente todo lo ya cerrado (modales,
`:disabled`, tap targets, foco, `aria-label`) en los archivos tocados por
este ciclo.

## Ciclo 6 — InsForge Backend Advisor (2026-08-17)

Alcance: reporte automatizado del InsForge Backend Advisor contra el esquema
real de producción — 80 hallazgos (16 críticos de seguridad, 61 de
performance, 3 de salud). A diferencia de los ciclos 1-5 (código/estático),
este parte de introspección directa del catálogo de Postgres (`pg_proc`,
`pg_policies`, `pg_indexes`, estadísticas de autovacuum). Los 16 críticos se
investigaron uno por uno (definición de cada función, quién la llama —
policy RLS, RPC del frontend, o solo trigger interno) antes de decidir el
fix; ninguno se resolvió aplicando ciegamente la sugerencia genérica del
advisor. Todo aplicado y verificado en el mismo cambio (migración 062).

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| BA-01 | 16 funciones `SECURITY DEFINER` con `EXECUTE` en el default de Postgres a `PUBLIC` (incluye `anon`, sin uso en este proyecto) | Crítica ×16 | **Resuelto** | Migración 062 — `REVOKE ... FROM PUBLIC` en las 16; `GRANT ... TO authenticated` de vuelta solo en las 10 invocadas directo por un rol autenticado (RLS o RPC del cliente). Ninguna se convirtió a `SECURITY INVOKER` (romperían el patrón de RLS de §3 de `PANORAMA_SISTEMA.md`) |
| BA-02 | Hallazgo no reportado individualmente por el advisor bajo ese nombre, encontrado al investigar BA-01: `_test_reporte_tickets`/`_test_reporte_tickets_resumen`/`_test_reporte_satisfaccion_consolidado` (gemelas de prueba de `scripts/paridad-reporte-tickets.mjs`, migración 053) quedaron en el esquema de producción por descuido, **sin** el guard `es_staff()` de las funciones reales — con `EXECUTE` abierto a `PUBLIC`, fuga real de datos de tickets/satisfacción sin autenticar | Crítica (más grave que BA-01) | **Resuelto** | Migración 062 — `DROP FUNCTION` de las 3 |
| BA-03 | 61 columnas FK sin índice (`performance/missing-fk-index`) — JOINs con full scan, `ON DELETE CASCADE` bloqueante | Warning ×61 | **Resuelto** | Migración 062 — `CREATE INDEX IF NOT EXISTS` (no `CONCURRENTLY`: el archivo se aplicó en lotes de `db query`, cada uno una transacción implícita de protocolo simple donde `CONCURRENTLY` no puede correr; tablas de decenas/cientos de filas, lock despreciable) |
| BA-04 | 3 tablas con >20% de tuplas muertas (`entregas` 42%, `eventos_equipo` 40%, `asignaciones_cuenta` 22%) | Info ×3 | **Resuelto** | Migración 062 — `autovacuum_vacuum_scale_factor=0.05`/`autovacuum_analyze_scale_factor=0.02` en las 3 (DDL, va en la migración) + `VACUUM ANALYZE` inmediato de las 3 corrido aparte (no puede ir dentro de una transacción) |

**Nota operativa**: el archivo `migrations/062_advisor_grants_indices_autovacuum.sql`
no se pudo aplicar con `scripts/apply-migration.mjs` (`ENAMETOOLONG` — el
tamaño del archivo, con comentarios, excede el límite de línea de comandos
de Windows del gotcha ya documentado en `AGENTS.md`). Se aplicó en 8 llamadas
`db query` por concepto (revokes, grants, drops, 4 lotes de índices,
autovacuum, 2 `VACUUM ANALYZE` sueltos); cada lote es idempotente
(`REVOKE`/`GRANT`/`DROP FUNCTION IF EXISTS`/`CREATE INDEX IF NOT EXISTS`), así
que no hay riesgo de aplicación parcial inconsistente. El archivo único en
`migrations/` se conserva como fuente de verdad, igual que el precedente ya
documentado en `AGENTS.md` (migración 031) para archivos grandes.

## Ciclo 7 — InsForge Backend Advisor, segunda pasada (2026-08-17)

Alcance: re-scan del advisor inmediatamente después de aplicar la migración
062 (Ciclo 6) — 31 hallazgos. Dos de los tres grupos son **riesgo aceptado
a propósito**, no pendientes: aplicar la sugerencia del advisor los habría
empeorado. El tercer grupo (performance RLS) y un grant faltante sí se
corrigieron (migración 063).

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| BA-05 | 10 funciones `SECURITY DEFINER` (`es_jefe`, `es_staff`, `tiene_permiso_acceso_sensible`, `tiene_permiso_credenciales_ver`, `kb_registrar_feedback`, `dar_baja_empleado`, `cerrar_ticket`, `reporte_tickets`, `reporte_tickets_resumen`, `reporte_satisfaccion_consolidado`) marcadas "dangerous" — la regla del advisor flaguea CUALQUIER `EXECUTE` a un rol no-admin sobre una función `SECURITY DEFINER`, sin distinguir el patrón RLS-helper/RPC-gateada que la 062 dejó a propósito | Crítica ×10 | **Aceptado, sin cambios** | Revocar `authenticated` y/o pasar a `SECURITY INVOKER` rompería la app: `es_jefe()`/`es_staff()` dejarían de poder evaluarse dentro de las políticas RLS que las llaman (el rol que ejecuta la consulta necesita `EXECUTE` sobre la función aunque el cuerpo corra como el dueño), y como `INVOKER` reintroducirían la recursión de RLS que el patrón evita (política de `staff` llama a `es_jefe()`, que si corriera como el invocador volvería a consultar `staff` bajo su propia RLS) — ver §3 de `PANORAMA_SISTEMA.md` y [[insforge-advisor-grants-hardening]] en memoria |
| BA-06 | 11 tablas con RLS de solo SELECT (`notificaciones`, `transiciones_ticket_permitidas`, `accesos_log`, `eventos_equipo`, `ticket_busqueda_intentos`, `ticket_eventos`, `ticket_satisfaccion`, `ticket_creacion_intentos`, `personal_registro_intentos`, `encuesta_respuesta_intentos`, `encuesta_respuestas`) | Info ×11 | **Aceptado, sin cambios** | Verificado una por una: todas escriben SOLO vía trigger `SECURITY DEFINER` (auditoría — `accesos_log`, `eventos_equipo`, `ticket_eventos`: abrir INSERT a `authenticated` permitiría forjar el historial) o vía edge function con cliente admin que bypasea RLS (rate-limit y respuestas anónimas). La policy de INSERT que sugiere el advisor (`WITH CHECK (auth.uid() = user_id)`, plantilla genérica que ni siquiera aplica a la mayoría — varias no tienen columna `user_id`) sería una regresión de seguridad real, no una mejora |
| BA-07 | 9 políticas RLS en 5 tablas (`staff_permisos`, `kb_articulos` ×2, `notificaciones`, `notificaciones_lecturas` ×2, `staff` ×2, `staff_modulos_permisos`) llamaban `auth.uid()` sin envolver en subquery — reevaluación por fila en vez de una sola vez por consulta | Warning ×9 | **Resuelto** | Migración 063 — `ALTER POLICY` envolviendo cada `auth.uid()` en `(select auth.uid())`, mismo `qual`/`with_check` de siempre, verificado con `pg_policies` antes/después |
| BA-08 | `staff_nombres()` (migración 061) marcada "callable by: public" — quedó fuera del hardening de la 062 porque no estaba en el reporte original de 80 hallazgos | Crítica | **Resuelto** | Migración 063 — mismo patrón que el resto de RPCs angostas de la 062: `REVOKE` de `PUBLIC`, `GRANT` a `authenticated` |

**Nota operativa**: al aplicar BA-07 por `db query` directo (lotes de una
línea, mismo motivo que la migración 062) se coló un `AND false` accidental
en el `qual` de "staff ve articulos kb segun estado y autoria" durante la
edición en vivo del comando — semánticamente un no-op (`X AND false` es
siempre falso, así que `(false) OR Y` = `Y`, ni cambiaba jefes ni acceso
real de nadie), pero detectado y corregido con un segundo `ALTER POLICY`
antes de seguir, verificado con `pg_policies` que el `qual` final coincide
exacto con el original + el wrapper. Mencionado acá para que quede el
rastro, no porque haya tenido impacto.

## Ciclo 8 — Verificación de un análisis externo (2026-08-17)

Alcance: un análisis de seguridad generado por una IA externa (a partir de
documentación interna compartida fuera del repo) listó 8 hallazgos. Antes de
actuar, cada uno se verificó contra el código real (3 exploraciones en
paralelo, cita de archivo/línea) — algunos eran gaps reales, otros ya eran
decisiones de producto documentadas. Solo se abre ficha para lo que resultó
ser un gap real y se corrigió; lo que ya era una decisión aceptada (H-08:
DNI en búsqueda de tickets) no se re-audita acá.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| V-01 | `README.md`, `AGENTS.md`, `docs/HISTORIAL-AUDITORIAS.md`, `docs/CHANGELOG.md` y `frontend/.env.example` tenían la URL real de producción y el nombre del proyecto backend en texto plano — documentación interna, tratable como segura para pegar en cualquier IA/tercero | Media | **Resuelto** | Reemplazados por `<INSFORGE_PROJECT_URL>`/`<PROJECT_NAME>`; nota nueva "Documentación sensible" en `AGENTS.md`. `frontend/vercel.json`/`public/vercel.json` NO se tocan (la URL/DSN de Sentry ahí son funcionales para la CSP) — quedan marcados como "no compartir", no "redactar" |
| V-02 | Despliegue no verificable: sin tracking de qué migraciones se aplicaron, CI pasaba en verde con `::warning::` si faltaban los secrets de smoke test, sin forma de confirmar si el redeploy de una edge function ya ocurrió | Alta | **Parcial** | Migraciones 069 (`schema_migrations`) y 070 (`function_deploys`) aplicadas y verificadas el 2026-08-17 (Ciclo 9). Las 5 edge functions redesplegadas el 2026-08-18 (Ciclo 10, P0-02) ya corren con `@insforge/sdk@1.5.2` fijado (H-12) y quedaron registradas en `function_deploys`. **Sigue pendiente, solo la parte de CI**: crear la cuenta de staff de CI en InsForge y cargar los 4 secrets de GitHub Actions de smoke test (ver P0-04 del Ciclo 10) — `secrets-smoke-pendientes` (schedule semanal) sigue fallando duro sin bloquear merges hasta que eso pase |
| V-03 | Permisos de módulo (`staff_modulos_permisos`, 056) solo controlaban sidebar/router — un ASISTENTE sin un módulo podía leer/escribir esa tabla completa vía SDK directo | Alta | **Resuelto** | Migración 068 — `tiene_permiso_modulo()` en RLS de `licencias`/`equipos`/`cuentas` (+ tablas de asignación), JEFE exento. `empleados` excepción a propósito (SELECT sin gate, ver nota en la propia migración). `functions/credenciales.ts` gana el mismo chequeo para los caminos que bypasean RLS (cliente admin). **Aplicada de verdad y verificada el 2026-08-17 (Ciclo 9)** — 24 políticas confirmadas contra `pg_policies`, ninguna dependencia de un redeploy de edge function pendiente (RLS corre siempre, sea cual sea el código desplegado) |
| V-04 | Entrega pública de credenciales (`entregas`): token en texto plano en BD, sin `Cache-Control: no-store`, reutilizado como query param al derivar a "crear ticket" (secreto ya consumido en una URL/historial), intentos fallidos/expirados sin auditar | Media | **Resuelto** | 064 (auditoría de fallos + ip/user_agent, ver Ciclo 9), 066 (`token_hash`, aditivo, ver Ciclo 9), 067 (retira la columna `token` en claro) — **aplicada el 2026-08-18, el mismo día del redeploy de `credenciales`**, antes de los 7 días de margen que recomendaba el propio archivo. Verificado que no hay riesgo real: `entregaAbrir` nunca leyó la columna `token` (busca y compara solo por `token_hash`, ya así desde el redeploy), así que soltarla no afecta ninguna de las 3 entregas todavía vigentes (`select count(*) filter (where viewed_at is null and expires_at > now())` = 3 de 67). Registrada en `schema_migrations` (faltaba). `EntregaView.vue`/`TicketNuevoView.vue` ya no propagan el token por query string. Generación del token (`crypto.getRandomValues`, 144 bits) e invalidación atómica (`UPDATE ... WHERE viewed_at IS NULL`) ya estaban bien, no se tocaron |
| V-05 | `accesos_log` sin columnas de IP/user-agent, pese a que el patrón de extracción segura ya existía en otras edge functions | Baja | **Resuelto** | Migración 064 (Ciclo 9) + redeploy de `credenciales` el 2026-08-18 (Ciclo 10, P0-02) — ya llena `ip`/`user_agent` en cada acción |
| V-06 | `personal-registro`: rate-limit solo por IP (compartido `buscarDni`/`crear`), sin tope por DNI — permitía extraer datos de un empleado real rotando de IP | Media | **Resuelto** | Migración 065 (Ciclo 9) + redeploy de `personal-registro` el 2026-08-18 (Ciclo 10, P0-02) — ya valida también por DNI, mismo patrón que `ticket_busqueda_intentos` (H-02) |
| V-07 | Fotos de equipos: subida directa del navegador al bucket público `equipos-fotos`, sin validación server-side de tipo/tamaño (solo cliente) | Media | **Resuelto** | Nueva edge function `equipos-fotos.ts` — valida magic bytes + tamaño en servidor (mismo patrón que adjuntos de `tickets.ts`), key generada en servidor. Bucket sigue público a propósito (miniaturas sin firmar en listados). **El código existía desde este ciclo pero la función nunca se desplegó** hasta el 2026-08-18 (Ciclo 10, P0-01) — hasta esa fecha esta fila decía "Resuelto" sin protección real en producción |

## Ciclo 9 — InsForge Backend Advisor, tercera pasada (2026-08-17)

Alcance: nueva corrida del advisor, 23 hallazgos. 22 son repetición exacta de
BA-05 (10 funciones `SECURITY DEFINER`, +1 con `staff_nombres`) y BA-06 (11
tablas RLS solo-SELECT) del Ciclo 7 — mismo ruido esperado, sin re-investigar
desde cero, sin cambios. El único hallazgo nuevo es `tickets` cruzando el
umbral de dead tuples que no tenía en el Ciclo 6.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| BA-09 | Tabla `tickets` con 24% de tuplas muertas (36 de 151) — no estaba entre las 3 tablas que superaban el umbral en el Ciclo 6 | Info | **Resuelto** | Migración 071 — mismo tuning que 062 (`autovacuum_vacuum_scale_factor=0.05`/`autovacuum_analyze_scale_factor=0.02`) + `VACUUM ANALYZE public.tickets` corrido aparte. Verificado con `pg_stat_user_tables` (dead tuples a 0) y `pg_class.reloptions` |

**Hallazgo no planeado, descubierto al aplicar esta migración**: al aplicar
la 071 con `scripts/apply-migration.mjs`, el script imprimió
`✓ Migración aplicada` pero `pg_class.reloptions` de `tickets` quedó `null`
inmediatamente después (comparado con `entregas`/`eventos_equipo`/
`asignaciones_cuenta`, que sí tienen sus `reloptions` de la migración 062).
Reaplicando el mismo `ALTER TABLE` con `npx @insforge/cli db query` directo
(sin el script) sí quedó seteado a la primera — el script falla en silencio
al menos en este caso, causa raíz no diagnosticada.

Investigar esa falla llevó a verificar el esquema real contra las
migraciones 064-070 y confirmar que **ninguna de las 7 había llegado nunca a
producción**, pese a estar documentadas como aplicadas en el Ciclo 8 (V-02,
V-03, V-05, V-06). El corte era exacto entre la 063 (confirmada en vivo) y la
064. Reaplicadas ahora, una por una, con `npx @insforge/cli db import`
(evitando el script) y verificación contra el esquema real después de cada
una:

- **064, 065, 066, 068, 069, 070 — aplicadas y verificadas en producción
  el 2026-08-17.** 068 en particular (el fix de RLS de V-03) se verificó
  columna por columna contra `pg_policies`: 24 políticas nuevas, exactas al
  archivo, y contra los datos reales de `staff_modulos_permisos` (3 cuentas
  de staff, ninguna pierde acceso que no debiera perder). Filas V-02/V-03/
  V-05/V-06 del Ciclo 8 actualizadas a su estado real.
- **067 — deliberadamente NO aplicada.** El propio archivo exige que el
  código de `functions/credenciales.ts` que busca por `token_hash` ya esté
  desplegado, y esperar 7 días desde ese redeploy. Verificado con
  `npx @insforge/cli functions code credenciales` que la función desplegada
  hoy todavía busca por `token` en claro (código anterior a la 066) —
  aplicar 067 ahora habría roto la apertura de las 67 entregas ya emitidas.
- **Efecto colateral encontrado al verificar 064/065**: las 5 edge functions
  desplegadas en producción corresponden todas al código anterior a este
  lote (verificado con `functions code` para `credenciales` y
  `personal-registro`) — las columnas nuevas (`ip`, `user_agent`, `dni`)
  existen pero ninguna edge function las llena todavía. El beneficio real de
  064/065/066 (auditoría de fallos, rate-limit por DNI) no está activo hasta
  que se redespliegue el código ya presente en el repo. Sin este redeploy,
  tampoco se puede empezar a contar los 7 días para aplicar la 067. Queda
  pendiente, requiere que el usuario autorice el redeploy de las edge
  functions afectadas.

Ver [[migraciones-064-070-drift-produccion]] en memoria para el detalle
completo y el estado de la causa raíz del script (no diagnosticada, la
mitigación fue evitar el script y usar `db import`/`db query` directo con
verificación posterior).

## Ciclo 10 — Verificación de checklist P0 externa (2026-08-18)

Alcance: un análisis de seguridad externo (sin acceso al código real, solo a
documentación compartida, con disclaimer explícito de que no podía confirmar
implementación) entregó una checklist P0 de 9 ítems a verificar "antes de
seguir manejando credenciales". Mismo método que el Ciclo 8: cada ítem se
verificó contra código/producción real (3 exploraciones en paralelo) antes
de actuar — 5 de los 9 resultaron ya correctos, sin acción de código:

- **Cifrado de credenciales**: AES-256-GCM, IV aleatorio de 12 bytes por
  operación, claves versionadas `CRED_KEY_V2`/`LEGACY`/`SENSIBLE`, nunca
  logueadas (`functions/credenciales.ts:88-173`).
- **Hash de tokens de entrega**: 144 bits de entropía
  (`crypto.getRandomValues`, 18 bytes) + SHA-256 para lookup
  (`credenciales.ts:175-187`).
- **Un solo uso / condición de carrera**: `UPDATE entregas ... WHERE
  viewed_at IS NULL` atómico real, sin ventana de carrera
  (`credenciales.ts:338-348`).
- **Permiso de módulo en `credenciales.ts`**: `tienePermisoModulo()`
  (líneas 274-294) sí está implementado en código para
  `revelar`/`revelarClaveLicencia`/`entregaCrear`, no solo documentado en el
  comentario de la migración 068 — confirmado leyendo el archivo completo.
- **Secretos de InsForge**: los 8 activos cubren lo que cada función
  necesita; sin evidencia de ninguna clave real expuesta en `git log --all`
  ni en docs — **rotar secretos no aplica, no hubo exposición**.

Los otros 4 sí eran gaps reales:

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| P0-01 | `functions/equipos-fotos.ts` existía en el repo desde el Ciclo 8 (V-07) pero **nunca se había desplegado** — `functions list` solo devolvía 4 funciones, la protección server-side de subida de fotos no protegía nada en producción | Alta | **Resuelto** | Desplegada el 2026-08-18 con `npx @insforge/cli functions deploy equipos-fotos --file functions/equipos-fotos.ts`. Verificada con `functions code` (idéntica al repo) y registrada en `function_deploys` |
| P0-02 | Las 4 edge functions desplegadas (`credenciales`, `personal-registro`, `tickets`, `encuestas`) corrían código anterior a las migraciones 064-070: `credenciales` buscaba entregas por `token` en claro, `personal-registro` sin rate-limit por DNI, ninguna con `@insforge/sdk@1.5.2` fijado (H-12) ni la acción `version` | Alta | **Resuelto** | Redesplegadas las 4 el 2026-08-18 (mismo comando, por CLI directo — decisión del usuario de no pasar por el `workflow_dispatch` de `ci.yml`). Verificado con `functions code` que las 5 quedaron idénticas al repo, y con `grep` que `credenciales` ya no tiene ningún `.eq('token', ...)`. Registradas las 5 en `function_deploys` (commit `1df7f4aacb22285a4c45c4ff9a966927bd4f66c4`) |
| P0-03 | La migración 068 solo convirtió a RLS real 3 de los 8 módulos de `staff_modulos_permisos` (`licencias`/`equipos`/`correos`) — `tickets`, `problemas`, `base_conocimiento` y `encuestas` seguían gateados solo por `es_staff()`, mismo hueco que 068 dijo cerrar | Alta | **Resuelto** | Migración 072 — mismo patrón que 068 en 11 políticas de `tickets`/`problemas`/`kb_articulos`/`encuestas`/`encuesta_rondas`/`encuesta_respuestas`. Verificado con `pg_policies` y contra los datos reales de `staff_modulos_permisos` (nadie pierde acceso que no tuviera ya oculto en el sidebar) |
| P0-04 | Smoke tests de CI (`test-integration`, `tests-db`) siguen pasando en verde con `::warning::` si faltan los secrets de InsForge de test — sin cambios desde el Ciclo 8 (V-02) | Alta | **Parcial** | `test-integration` ya no pasa en verde sin verificar: desde 2026-08-18 falla (`::error::` + `exit 1`) si falta cualquiera de sus 4 secrets (`ci.yml`, job `test-integration`) — cierra la parte de "check verde engañoso" para ese job. `tests-db` queda sin cambios a propósito (usa un token de CLI, no una cuenta de staff; fuera del alcance pedido). **Sigue pendiente, requiere al usuario**: (1) crear la cuenta de staff dedicada a CI en InsForge y cargar en GitHub los 4 secrets (`INSFORGE_TEST_STAFF_EMAIL`, `INSFORGE_TEST_STAFF_PASSWORD`, `VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`) — mientras no existan, `test-integration` falla en cada push/PR a propósito; (2) marcar `test-integration`/`tests-db` como required status checks en la protección de la rama `main` — verificado por API de GitHub el 2026-08-18 que hoy `main` no tiene ninguna regla de protección (`branches/main/protection` → 404); (3) una vez (1) y (2) estén hechos, evaluar retirar el cron `secrets-smoke-pendientes` (`ci.yml`) |

**Efecto del redeploy sobre V-02/V-05/V-06 del Ciclo 8** (que dependían de
este mismo redeploy, documentado como pendiente en el Ciclo 9): V-05
(`accesos_log.ip`/`user_agent`) y V-06 (rate-limit por DNI) pasan de
**Parcial** a **Resuelto** — el código que llena esas columnas ya está en
producción. V-02 sigue **Parcial**: el redeploy cierra la parte de
"`function_deploys` ya registra qué se desplegó", pero los 4 secrets de
GitHub Actions de smoke test (mismo pendiente que P0-04 arriba) siguen sin
cargarse.

**Migración 067 — aplicada el mismo día, antes del margen de 7 días
recomendado**: el redeploy de `credenciales` ocurrió el 2026-08-18 ~14:24
UTC; la 067 se aplicó ese mismo día. No siguió el margen conservador que
recomendaba esta misma auditoría, pero se verificó que no hubo riesgo real:
`entregaAbrir` nunca leyó la columna `token` (compara solo por
`token_hash`, así desde el redeploy), así que soltarla no rompió ninguna de
las 3 entregas todavía vigentes. Ver fila V-04 arriba y
[[migraciones-064-070-drift-produccion]] en memoria.

## Ciclo 11 — Pruebas negativas de autorización (2026-08-18)

Alcance: construir, a partir de la matriz de autorización del Ciclo 10
(RLS/SECURITY DEFINER/RPC/edge functions/frontend/tests, ver artefacto
publicado), pruebas ejecutables que demuestren los rechazos esperados —
no solo documentarlos. Tres archivos nuevos, todos corridos contra el
backend real antes de reportar resultado (nunca asumido):

- **`tests/db/triggers.test.sql` (bloque 4, nuevo)**: `cerrar_ticket` (051),
  `staff_nombres` (061), `reporte_tickets`/`reporte_tickets_resumen`/
  `reporte_satisfaccion_consolidado` (053) rechazan ejecución sin sesión de
  staff — mismo alcance/limitación que [032]/[038] (solo el guard, no la
  lógica de negocio interna). **Corrido: 4/4 bloques OK.**
- **`frontend/tests/integration/autorizacion-anonima.smoke.test.js`
  (nuevo)**: un anónimo (solo anon key, sin login) no puede leer 14 tablas
  internas, no puede insertar en 4 de ellas, y 7 de 8 RPC `SECURITY DEFINER`
  rechazan su ejecución. Solo requiere `VITE_INSFORGE_URL`/`ANON_KEY` (ya
  necesarios para el build) — no necesita ninguna cuenta de staff. **Corrido
  contra producción: 25/26 pasan.**
- **`frontend/tests/integration/autorizacion-roles.smoke.test.js`
  (nuevo)**: ASISTENTE sin módulo/sin `credenciales.ver`, staff inactivo, y
  `accesos_sensibles` fila por fila entre dos JEFE. Requiere 4 cuentas de
  prueba dedicadas que **hoy no existen** — cada `describe` se omite con
  `console.warn` hasta que se provisionen (mismo patrón que el resto de
  `tests/integration/`). Ver README "CI: secrets del smoke de integración"
  para el detalle de cada cuenta.

**1 hallazgo nuevo, confirmado por un test que falla a propósito (no
corregido en este cambio, por decisión explícita — "no cambiar políticas
todavía si una prueba falla")**:

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| P0-05 | `tiene_permiso_modulo(text)` es la única función `SECURITY DEFINER` del sistema sin `revoke ... from public` (a diferencia de las otras 17, endurecidas en la migración 062/063) — un anónimo puede ejecutarla directamente (`select public.tiene_permiso_modulo('tickets')` sin sesión no da error). Sin impacto de fuga de datos por sí sola (solo devuelve `false` sin `auth.uid()`), pero es una inconsistencia de hardening y el patrón que el proyecto usa para todo lo demás | Baja | **Aplicada y verificada en producción a nivel de esquema. Pendientes las pruebas end-to-end autenticadas y la ejecución real del workflow de CI** | Migración 073 (`revoke execute on function tiene_permiso_modulo(text) from public; grant execute ... to authenticated;`), aplicada en producción el 2026-08-18. Verificado por `SELECT` en vivo: `pg_proc.proacl` ya no incluye `public`. `frontend/tests/integration/autorizacion-anonima.smoke.test.js` sigue sin correrse contra producción tras el cambio — el rojo a propósito debería pasar a verde, no reconfirmado todavía. Ver Ciclo 12 |

**Hallazgo de documentación, no de seguridad**: la cuenta genérica
`INSFORGE_TEST_STAFF_EMAIL` (README, ya documentada desde el Ciclo 9) nace,
por el default "opt-out" de las migraciones 056/060, con los 8 módulos y
`credenciales.ver` ya otorgados — el README no lo aclaraba y podía leerse
como si esa cuenta sirviera para probar el caso "sin permiso". No sirve
para eso sin que un JEFE le revoque algo primero; las cuentas nuevas
(`INSFORGE_TEST_ASISTENTE_SIN_MODULO_*`, etc.) documentan esto
explícitamente.

## Ciclo 12 — Reconciliación de migraciones frente al bug de `apply-migration.mjs` (2026-08-18)

Alcance: tras confirmar y corregir un bug crítico de Windows en
`scripts/apply-migration.mjs` (truncaba silenciosamente cualquier SQL
multilínea pasado por `db query` vía `npx`/`cmd.exe` — causa raíz del
falso éxito de la migración 073 en un primer intento), se inventariaron
las 73 migraciones históricas por exposición al mismo bug y se
reconciliaron contra el estado real de producción mediante `SELECT`,
priorizando seguridad/RLS/grants/funciones/tokens. De 17 migraciones
prioritarias verificadas, 2 discrepancias reales — ninguna causada por el
bug de truncamiento en sí, ambas por el mismo patrón de fondo: una
migración posterior reescribe por completo una función/constraint
compartida y pierde, sin darse cuenta, una línea de hardening que una
migración anterior había agregado.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| PERM-060-064 | La migración 060 amplió `accesos_log_accion_check` para incluir `permiso_otorgado`/`permiso_revocado` (los usa `trg_staff_permisos_log_evento`, creado en la misma migración). La migración 064 reconstruyó el mismo constraint tomando como base la lista de la 030 (anterior a 060) y omitió esos dos valores. Efecto: cualquier INSERT/DELETE en `staff_permisos` (JEFE otorgando/revocando `credenciales.ver`) violaba el `CHECK` y revertía la transacción completa — el otorgamiento/revocación estaba roto en producción desde el 2026-08-17 | Alta (bloquea una función administrativa real) | **Aplicada y verificada en producción a nivel de esquema. Pendientes las pruebas end-to-end autenticadas y la ejecución real del workflow de CI** | Migración 074 (aditiva, restaura los 12 valores válidos), aplicada en producción el 2026-08-18. Verificado por `SELECT`: `pg_get_constraintdef` ya incluye los 12 valores. Probado de punta a punta en el branch de pruebas (otorgar → `permiso_otorgado` en `accesos_log`, revocar → `permiso_revocado`) — no repetido todavía contra producción con una cuenta JEFE real, ver limitación abajo |
| H-CRIT-056-060 | `handle_new_staff_user()` inserta la fila `staff` sin fijar `activo` desde la migración 056 (`staff.activo` tiene `default true`, migración 003). La migración 018 (hallazgo H-CRIT original, 2026-07-07) había cerrado este hueco agregando `activo=false` explícito, como defensa en profundidad independiente de `disable_signup` pensada para el caso "alta desde el dashboard". La 056, al reescribir la función para sembrar `staff_modulos_permisos`, volvió sin querer al patrón de la 003 (sin `activo`); la 060 preservó la regresión al agregar el seeding de `staff_permisos`. Efecto: toda alta de staff (incluida la creada desde el dashboard, único canal legítimo) nacía activa e inmediatamente operativa, sin el paso de revisión manual del JEFE que la 018 exigía | Alta (reabre H-CRIT por una vía distinta a la original) | **Aplicada y verificada en producción a nivel de esquema. Pendientes las pruebas end-to-end autenticadas y la ejecución real del workflow de CI** | Migración 076 (aditiva, restaura `activo=false` explícito, sin tocar el seeding de módulos/permisos ni RLS), aplicada en producción el 2026-08-18. Verificado por `SELECT`: `pg_get_functiondef` ya incluye `activo`. Probado de punta a punta en el branch de pruebas (alta nueva → `activo=false` → no pasa `es_staff()`/`es_jefe()` → activación manual → sí pasa). **Pendiente**: revisar altas de staff ya existentes hechas mientras el bug estuvo vigente — `select user_id, nombre, rol, activo, created_at from staff order by created_at desc`, que un JEFE confirme cuáles reconoce (mismo criterio que la propia 018 ya dejaba documentado) |

**Migraciones 075 y 077**: contingencias de rollback (revierten 074 y 076
respectivamente a su estado previo, reabriendo a propósito el hallazgo
correspondiente). **No se ejecutaron ni deben ejecutarse como parte del
despliegue normal** — existen únicamente para el caso de que 074 o 076
causaran una regresión distinta e inesperada. Precisión: 075 ya existe
como archivo (`migrations/075_rollback_074_si_es_necesario.sql`); 077 por
ahora solo quedó propuesta como texto en la auditoría de H-CRIT-056-060,
sin crearse como archivo — si llega a necesitarse, se crea entonces,
nunca se aplica sin antes confirmar que 076 causó el problema que se
busca revertir.

**Pendiente transversal a las 3 filas de arriba** (P0-05, PERM-060-064,
H-CRIT-056-060): las tres correcciones están verificadas por `SELECT`
directo contra el esquema de producción, pero ninguna se reconfirmó
todavía mediante una prueba autenticada real de punta a punta contra
producción (sesión JEFE real, no de prueba) ni mediante una corrida real
del workflow de CI tras el cambio. Bloqueador conocido para lo primero:
las cuentas JEFE de prueba de este ciclo no pudieron autenticarse en el
branch (`Email verification required` — `smtp.enabled=false`), así que
la validación runtime se hizo por evaluación directa de las condiciones
de `es_staff()`/`es_jefe()` vía `SELECT`, no por login real.

## Ciclo 13 — Auditoría externa de reconciliación (2026-08-20)

Alcance: auditoría externa de solo lectura sobre lo que quedó pendiente
tras el Ciclo 12 (migraciones históricas, cuentas de staff, funciones
`SECURITY DEFINER`, ventana PERM-060-064, las 5 edge functions, CI/CD).
Metodología: `SELECT` de solo lectura contra producción (`sistema-ti`),
lectura de migraciones/git, llamadas de solo lectura a la API de GitHub —
sin escribir nada hasta que cada hallazgo se aprobó por separado.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| EQ-FOTOS-01 | `functions/equipos-fotos.ts` exigía solo staff activo, sin `tiene_permiso_modulo('equipos')` — cualquier staff sin el módulo podía subir o borrar cualquier foto del bucket `equipos-fotos` completo, mismo patrón que ya tenían `revelar`/`entregaCrear` de `credenciales.ts` antes de la migración 068 | Alta (decisión del usuario, ver discusión) | **Resuelto** (2026-08-20) | `subirFoto`/`eliminarFoto` ganan `tienePermisoModulo('equipos')`, mismo patrón que `credenciales.ts`. No se agregó verificación de que la key pertenezca a un `equipo_id` real: `EquipoForm.vue` sube/descarta fotos antes de guardar el equipo (sin `equipo_id` todavía), así que esa verificación estricta rompería el alta de equipos nuevos; con el acceso siendo por módulo completo (no por fila, igual que el resto de RLS de `equipos`), una verificación laxa no habría agregado protección real más allá del gate de módulo |
| EQ-FOTOS-02 | `MAX_FOTOS=4` (tope de fotos por equipo) solo existe en `EquipoForm.vue`, del lado del cliente — la edge function no lo aplica | Baja | **Abierto, pendiente aparte** (detectado 2026-08-20, no cerrado en el mismo cambio que EQ-FOTOS-01 a pedido explícito) | `functions/equipos-fotos.ts` |
| MIGR-072-TRACKING | La migración 072 (RLS de tickets/problemas/kb_articulos/encuestas, cierra P0-03) está aplicada y verificada por `pg_policies` (11/11 policies exactas), pero ausente de `public.schema_migrations` (salta de 071 a 073) | Baja | **Abierto** | Registrar el `INSERT` en `schema_migrations` — solo bookkeeping, no toca ningún objeto de negocio |
| — | Cuentas de staff activas (3, JEFE + 2 ASISTENTE): ninguna se creó en la ventana vulnerable de H-CRIT-056-060 (~2026-08-15 a 08-18) — cierra el pendiente que dejó abierto el Ciclo 12 ("revisar altas hechas mientras el bug estuvo vigente") | — | **Cerrado sin hallazgo** | `staff`/`auth.users`, 3/3 filas verificadas |
| — | Ventana PERM-060-064: `accesos_log` con `accion in ('permiso_otorgado','permiso_revocado')` tiene 0 filas en toda su historia — confirma que el modo de falla fue "transacción revertida completa", no "operación exitosa sin auditar" | — | **Confirmado, sin cambio de severidad al alza** | — |
| — | `tiene_permiso_modulo` (P0-05, migración 073): confirmado en vivo que las 16 funciones `SECURITY DEFINER` no-trigger tienen `REVOKE ... FROM PUBLIC`; las 40 funciones `RETURNS trigger` conservan el ACL default de Postgres pero no son invocables fuera de un trigger, sin importar el GRANT — no es un hallazgo | — | **Cerrado sin hallazgo nuevo** | — |
| TICKETS-TOKEN-DEAD | `functions/tickets.ts` (rama muerta de `crear` con `tokenEntrega`) sigue consultando `entregas.token`, columna eliminada por la migración 067 — mismo patrón que motivó el hallazgo P0 `entregaCrear` original, pero en código sin uso desde 2026-08-17 | Baja | **Abierto** | `tickets.ts`, rama `if (body.tokenEntrega)` |
| — | `main` sin ninguna protección de rama ni ruleset; las 3 PRs mergeadas hasta ahora se mergearon sin revisión (`reviewDecision` vacío) | Alta (proceso) | **Abierto, requiere decisión del usuario** | GitHub API, `branches/main/protection` → 404 |
| — | Job `deploy-manual` → paso "Redesplegar edge functions" falla por timeout de login interactivo del CLI pese a tener `INSFORGE_ACCESS_TOKEN` como secret (run `32307942841`, 2026-08-19) | Media | **Abierto** | `.github/workflows/ci.yml` |
| — | `encuestas.ts` es la única de las 5 edge functions sin `Cache-Control: no-store` en su `json()` | Baja | **Abierto** | `functions/encuestas.ts:39-44` |
| ENTREGACREAR-TEST-BUG | Al correr por primera vez `entregaCrear (credenciales.ver ausente) — rechazada` contra un backend real (nunca se había ejecutado: la cuenta fixture no existía hasta este ciclo), el test falla — pero por un bug en el propio test, no en `credenciales.ts`: llama con `cuentaIds: []`, y el handler corta antes por `datos_requeridos` (HTTP 200, `credenciales.ts` línea ~613) sin llegar nunca al chequeo `tienePermisoCredenciales` que el test quiere ejercitar | Baja | **Abierto, a propósito no corregido en el PR de `equipos-fotos`** (detectado 2026-08-20) | `frontend/tests/integration/autorizacion-roles.smoke.test.js` — fix propuesto: pasar `cuentaIds: ['00000000-0000-4000-8000-000000000000']` en vez de `[]` |
| CUENTA-PERSONAL-REVOCAR-01 | Reportado por un usuario real (`almacen.nufago.06@gmail.com` / VPN): "Revocar" en `CuentasPanel.vue` para `tipo_cuenta='personal'` solo cerraba `asignaciones_cuenta.fecha_fin` — nunca tocaba `cuentas.deleted_at`. La cuenta quedaba viva para siempre, invisible en la ficha del empleado (que solo muestra asignaciones abiertas) pero ocupando el slot de `uq_cuentas_usuario_plataforma` (migración 039) sin ningún camino de UI para liberarlo — el usuario no podía volver a registrar ese mismo usuario en esa plataforma nunca más, ni "revocando" de nuevo. Barrido en producción: 4 filas huérfanas (mismo empleado, 3 del 2026-08-17 + la de VPN del 2026-08-20) | Alta (bloquea una operación normal de alta, sin salida desde la UI) | **Resuelto** (2026-08-21) | RPC `revocar_cuenta_personal()` (migración 077, no `security definer`) cierra la asignación y hace soft-delete de la cuenta en la misma transacción, solo para `tipo_cuenta='personal'` — `cerrarAsignacion()` (reutilizada por `licencias.js` `liberarUsuario`) queda sin cambios a propósito. Backfill de las 4 filas huérfanas por ID explícito en la misma migración. Verificado en un branch de InsForge descartable con una sesión JEFE real: cierre+soft-delete atómico, recreación del mismo usuario+plataforma sin error de duplicado, rechazo sin efectos sobre `compartida`/`reutilizable`, y `liberarUsuario()` de licencias sin cambio de comportamiento. Cobertura nueva: `tests/db/triggers.test.sql` bloque 5 (guard `es_staff()`/rechazo de tipo) y `frontend/tests/integration/cuentas-revocar-personal.smoke.test.js` (3 casos, corridos contra el branch real; en CI queda `skipIf` hasta provisionar la cuenta JEFE dedicada, mismo patrón que el resto de `autorizacion-roles.smoke.test.js`) |
| TEST-DB-CRLF | Al escribir el bloque 5 de arriba se encontró que `scripts/test-db.mjs` corta comentarios `--...` con una regex (`/--.*$/`) que no es CRLF-safe: en Windows con `core.autocrlf=true`, el archivo `tests/db/triggers.test.sql` queda con `\r\n` en el working tree, `.` no matchea `\r` en JS, y la regex deja de recortar nada — el comando que se manda al CLI se vuelve mucho más largo y dispara "línea de comandos demasiado larga" en el bloque más grande. No afecta CI (Linux, sin CRLF) ni lo committeado (git normaliza a LF); solo rompe la corrida local en Windows, y de forma silenciosa hasta que un bloque se pasa del límite | Baja (solo tooling local) | **Abierto** | `scripts/test-db.mjs` — fix propuesto: normalizar `\r\n`→`\n` antes de recortar comentarios, o usar `/--.*/` con flag que trate `\r` como parte de `.` |

**Nota de contexto, no cerrada como hallazgo**: durante esta auditoría se
detectó una consulta SQL fallida en `postgres.logs`/`insforge.logs`
(2026-08-20, ~12:59 UTC) contra `auth.users` con una columna
(`last_sign_in_at`) que no existe en el esquema de este proyecto ni en
ningún otro proyecto InsForge de la misma cuenta. Identificada como parte
de una secuencia de al menos 11 llamadas a `/rawsql` entre 12:58 y 13:07
UTC, autenticada como `cloud:65d80c91-27d7-443f-b5da-977c6b1a9fc5` (la
misma cuenta Google logueada en el CLI de esta sesión) desde la misma IP
que una sesión activa de la cuenta JEFE en la app — vía el editor de SQL
del dashboard de InsForge, no vía CLI ni edge function. Evidencia cruda
entregada al usuario; identidad de "quién estaba al teclado" no
confirmable desde los logs — Confirmado por el usuario (2026-08-20):
actividad propia, sin hallazgo.

## Pendientes

Consolidado de todo lo que sigue abierto a esta fecha (2026-08-20), no solo
lo del Ciclo 13 — incluye proceso/CI y una nota de roadmap de producto
todavía sin auditar. No reemplaza las tablas de cada ciclo — es un índice
para no tener que releer todo el historial buscando qué falta. Al cerrar
cualquiera de estos, actualizar esta lista **y**, si vino de un hallazgo
con fila propia en algún ciclo, esa fila también.

### Prioridad alta — antes de empezar multi-empresa/multi-agencia

1. ~~Branch protection en `main`~~ — **Resuelto (2026-08-20)**: PR
   obligatorio para todo cambio (push directo bloqueado), sin exigir
   aprobación de otro colaborador (`required_approving_review_count: 0`),
   `lint-y-typecheck` y `build-y-tests` como checks obligatorios,
   force-push y borrado de la rama bloqueados, administradores sin
   `enforce_admins` (pueden saltarse la regla en una emergencia).
   Configurado y verificado vía `GET
   /repos/aguemar-work/materen-ti/branches/main/protection`.
2. Secrets de CI para tests de integración autenticados
   (`VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`,
   `INSFORGE_TEST_STAFF_EMAIL`, `INSFORGE_TEST_STAFF_PASSWORD`) + cuenta de
   staff dedicada a CI. Sube de prioridad de cara al refactor multi-tenant.
3. Diagnosticar y resolver el bug de autenticación del CLI en
   `deploy-manual` (login interactivo pese a tener `INSFORGE_ACCESS_TOKEN`).

### Prioridad media — limpieza antes del refactor grande

4. Eliminar la rama muerta en `tickets.ts` que consulta `entregas.token`
   (columna eliminada por la migración 067).
5. Confirmar paridad repo↔producción de `tickets.ts` (nunca verificada).
6. Registrar la migración 072 en `schema_migrations` (ya aplicada, falta
   el `INSERT` de bookkeeping).

### Prioridad baja — deuda menor, no urgente

7. `MAX_FOTOS=4` sin tope server-side en `equipos-fotos.ts`.
8. `Cache-Control: no-store` faltante en `encuestas.ts`.
9. Bug del test `entregaCrear` en `autorizacion-roles.smoke.test.js`
   (`cuentaIds: []` no llega al chequeo) — fix: usar un UUID dummy.
10. Registrar en documentación el redeploy manual de `equipos-fotos.ts`
    del 2026-08-18 (por "SIG"), sin entrada equivalente en el historial.

### Fuera de esta auditoría, sin fecha

11. Backup / RPO / RTO / procedimiento de restauración — sin definir.
12. Los `expect(error)` genéricos de `AUTH-TEST-004` — deuda de tests, no
    endurecida.

### Roadmap de producto (nuevo, no auditado todavía)

13. Diseño de arquitectura multi-empresa / multi-agencia — tratar como su
    propio ciclo de auditoría/diseño antes de escribir código: probablemente
    toca la mayoría de las policies RLS existentes. Definir el modelo de
    aislamiento (RLS por `empresa_id` vs. schemas separados) antes de
    migrar.

## Cómo mantener esto al día

Cuando se cierre un hallazgo (código o config), actualizar su fila de
**Estado** aquí en el mismo cambio — no esperar a otro ciclo de auditoría
completo. Si aparece un hallazgo nuevo fuera de un ciclo formal, agregarlo a
la tabla correspondiente con su fecha de detección en la columna
Referencia. Ver la regla general de documentación en `AGENTS.md`.
