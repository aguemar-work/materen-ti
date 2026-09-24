# Historial de auditorías — Materen · Sistema TI

> **Nota de normalización de nombres (2026-09-01).** El sistema tenía dos
> nombres para cada token (`--mat-color-x` con el valor, `--color-x` como
> puente). Al colapsarlo a uno solo, el renombrado barrió también las entradas
> de este archivo: donde una entrada antigua dice `--color-x` puede haber
> dicho `--mat-color-x` cuando se escribió. **El token del que habla es el
> mismo**; solo se muestra con el nombre vigente. No se revirtió entrada por
> entrada a propósito — un lector futuro solo conocerá los nombres actuales, y
> dejar los viejos lo obligaría a traducir cada vez.

> Reemplaza a `auditoria_seguridad_sistema-ti_2026-07-07.md` y
> `auditoria_integral_2026-08-05.md` (eliminados de la raíz). Este documento
> condensa ambos ciclos en una ficha de hallazgos con **estado verificado**,
> no una narrativa completa — para el razonamiento y la evidencia detallada
> de cada hallazgo, ver el historial de git en esas rutas antes de su borrado
> (commit de esta actualización de documentación).

**Última reconciliación de estados:** 2026-08-11, contra el código real del
repo (no de memoria) — mismo método que `PANORAMA-SISTEMA.md`. Los ítems
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
| Q-01 | Tests de integración/BD dan check verde sin ejecutarse | QA | **Mitigado** (parte original) + **variante nueva resuelta (2026-08-16)** + **tercera reaparición, 2026-08-17 (ver abajo)** | `ci.yml` ya no hace `exit 0` silencioso: emite `::warning::` visible. Los 4 secrets (`INSFORGE_TEST_STAFF_EMAIL/PASSWORD`, `INSFORGE_ACCESS_TOKEN`, `INSFORGE_PROJECT_ID`) **siguen sin existir** en el repo — los jobs siguen sin verificar nada, ya no lo esconden. **Reaparición del mismo patrón por otra vía**: el commit `030cc89` (2026-08-15, "Pruebas") cambió la forma de `porTecnico`, retiró `backlog`/`sinResolver` y redefinió `porSolicitante.total` en el reporte de tickets sin actualizar sus tests — `build-y-tests` quedó en **rojo real** (no un verde falso esta vez, sino un rojo visible que nadie miró) durante más de un día, hasta el commit siguiente inclusive. No es exactamente el mismo hallazgo (acá el check SÍ corrió y SÍ falló) pero es la misma familia de problema: un check que no cumple su función de alerta. Cerrado en ese momento: los 8 tests corregidos (línea base real de entonces: 95 pasan + 1 se salta), y `CONTRIBUTING.md`/`.github/pull_request_template.md` nuevos para que esto se note antes de mergear, no una semana después. **Tercera reaparición (2026-08-17), esta vez en producción real**: la migración 059 (2026-08-17) eliminó `areas_obras.ubicacion_id`; `api/domains/empleados.js` seguía pidiendo el embed anidado `areas_obras(nombre, ubicaciones(nombre))` que dependía de esa columna → `GET /empleados` devolvía 400 `PGRST200` en producción ("Could not find a relationship between 'areas_obras' and 'ubicaciones'"), y el `TypeError` en cascada de `DashboardView.vue` (`stats` quedaba `null` tras el `Promise.all` fallido y el template lo leía sin guardia). `npm test` seguía en 100/100 verde, `build`/`lint` limpios: el smoke de integración existente (`tickets-api.smoke.test.js`) SOLO ejercitaba `tickets`, nunca tocaba `empleados` — exactamente la clase de bug que `PANORAMA-SISTEMA.md` dice que este check "atrapa" (desincronización esquema↔frontend), y no lo atrapó porque nunca corre sin los 4 secrets, que siguen sin existir 12 días después de abierto este hallazgo. Corregido: `SELECT_EMPLEADO` en `empleados.js` vuelve a pedir `empresas(nombre), areas_obras(nombre), ubicaciones(nombre)` como tres embeds independientes (sin anidar, consistente con que la 059 separó ambos ejes); guardia `v-if="!stats"` + `catch` en `DashboardView.vue`; nuevo `tests/integration/embeds.smoke.test.js` — una consulta real por cada `select()` con embed del resto de dominios (empleados, correos, licencias, equipos, kb, staff, problemas, reportes de tickets, dashboard), para que un cambio de esquema en cualquiera de ellos rompa CI en vez de producción. Sigue sin resolverse la causa raíz de fondo: sin los 4 secrets configurados, ninguno de estos smoke tests corre nunca en CI, ni el viejo ni el nuevo — ver instrucciones para crearlos en `AGENTS.md`/`README.md` |
| A-01 | Bajas de empleado sin atomicidad (4 escrituras secuenciales) | Arquitectura | **Resuelto** | Migración 038: RPC `dar_baja_empleado()` `SECURITY DEFINER`, una sola transacción |
| D-01 | Cero observabilidad de producción (sin Sentry/errores) | DevOps | **Resuelto** (2026-08-13) — `@sentry/vue` instalado e inicializado en `main.js` (solo `PROD` + `VITE_SENTRY_DSN`; `window.onerror`/`unhandledrejection` los captura el SDK por defecto — confirmado `defaultIntegrations` no se desactiva con `integrations: []`, solo se le agregan cero integraciones extra, ver `node_modules/@sentry/core/build/types/types/options.d.ts`). Sin Session Replay/`browserTracingIntegration`/`enableLogs` (no estaban en el plan aprobado — la app maneja DNI/credenciales). DSN real configurado por el usuario en `frontend/.env` (gitignorado) y host de ingesta agregado al `connect-src` de ambos `vercel.json`. Verificado de punta a punta con `npm run build` + `npm run preview` + Playwright: 0 violaciones de CSP, el evento de error de prueba llegó a Sentry (`200`, con event ID real) | `main.js`, `frontend/.env`, `vercel.json` (×2), `docs/CHANGELOG.md` |
| U-01 | Texto terciario a 2,54:1 (falla WCAG AA), prescrito por la guía de diseño | UX | **Abierto** — ampliado 2026-08-12: en oscuro tampoco alcanza AA para texto normal (3,68:1–3,91:1, solo cumple el umbral de texto grande 3:1). Fix (a) propuesto, mismo nombre de token, mismo tono neutro (no el gris con tinte verde de la propuesta de paleta de `design.pen`, que es un cambio aparte): `--color-text-tertiary: #697281` en claro (4,53:1/4,86:1) y `#747C8B` en oscuro (4,50:1/4,23:1 — bg-elevated queda justo debajo de 4.5, aceptable por ser 0,27 el margen y no texto de cuerpo largo, pero anotarlo). **Ver DP-08** (ciclo "Revisión de `design.pen`" abajo): la paleta dot-notation de `design.pen` propone un segundo valor distinto (`#6B737E`) para el mismo rol — dos arreglos en competencia, sin resolver | `--color-text-tertiary: #9CA3AF` sin cambios, `main.css:48` (claro) y `main.css:212` (oscuro) |
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
| U-03 / U-04 | Tipografía en px desde 11px; hex de WhatsApp fuera de tokens | UX | **Resuelto (2026-08-12)** — `main.css:785,875,1301` ahora usan `var(--fs-xs)`; se crearon `--color-whatsapp`/`--color-whatsapp-hover` (claro y oscuro) y `.btn-whatsapp` las referencia |
| A-03 | `main.css` monolítico (1.656 líneas al momento del ciclo 2) | Arquitectura | **Mejoró, sigue abierto** — hoy 1446 líneas (bajó 210), pero sigue siendo el único archivo global |
| P-04 | 3 consultas solapadas en pendientes de tickets | Performance | **Resuelto** (2026-08-13) | `api/domains/dashboard.js` `pendientesTickets()` — las 3 queries a `tickets` (mismo filtro base de estado abierto repetido 3 veces) se consolidaron en 1 sola query; `sinAsignar`/`sinVincular`/`abiertosViejos` se derivan en memoria del mismo array. Un ticket que califica en más de un bucket sigue apareciendo en ambos — no es deduplicación de resultados, es de round-trips (3 → 1) |
| D-04 | `.vite/deps` versionado en git | DevOps | **Resuelto (2026-08-11)** — destrackeado (`git rm --cached`) y agregado `.vite/` a `.gitignore` |
| D-05 | `sistema_credenciales_ti.html.bak` legacy en la raíz | DevOps | **Resuelto (2026-08-11)** — eliminado del repo. `sistema_credenciales_ti.html` (sin `.bak`) se mantiene: es un stub de 343 bytes con redirect intencional a `./frontend/`, no es legado |
| A-05 / W-04 / Q-05 | Sin ADRs formales, sin CONTRIBUTING, sin registro de bugs | Varios | **Parcial, mejorado (2026-08-16)** — este documento y `docs/CHANGELOG.md` cubren el registro de hallazgos/documentación; `CONTRIBUTING.md` **ya existe**: convención de commits `fix(scope):`/`feat(scope):` (ya usada de hecho, ahora escrita) + regla "un commit = un cambio coherente" con el episodio de `030cc89` como caso real citado. `.github/pull_request_template.md` también nuevo (checklist de documentación/tests/capa de deploy). Sigue sin existir `docs/adr/` — las decisiones siguen viviendo en `PANORAMA-SISTEMA.md` §6, no en ADRs formales aparte |
| T-03 | Sin backup verificado ni RPO declarado | Datos | No verificable desde el repo (requiere plan InsForge) |
| U-06 | Tablas móviles solo con scroll horizontal | UX | **Resuelto** — patrón `.lista-tarjetas` (`main.css:1348-1421`) ya implementado en 6 vistas |
| Q-06 | `functions/encuestas.ts` y `functions/personal-registro.ts` sin ningún test | QA | **Abierto (parcial)** — `encuestas.ts` sigue sin `.test.js`, a diferencia de `credenciales.ts`/`tickets.ts`. La mitad de `personal-registro.ts` quedó **cerrada por retiro**: el módulo entero (edge function incluida) se eliminó en la migración 084 (2026-08-29) |
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
| DS-01 | `.btn-danger:hover` fija `color:#fff` sin condicionar por tema; en oscuro `--color-danger` es `#E88870` (salmón) → 2.57:1, falla AA | (a) — nuevo token, sin tocar markup | **Resuelto** (2026-08-13) — `.btn-danger:hover` usa el invariante `--color-danger-hover` (#DC2626, 4.83:1 con blanco en ambos temas) en vez de `--color-danger` | `main.css` — ver Fase B en `docs/GUIA-UX-UI.md` |
| DS-02 | `:disabled` inconsistente: solo `.icon-btn` lo define (`opacity:.4`); `.btn`, `.btn-primary`, `.btn-danger`, `input`, `select` no tienen regla propia — dependen del estilo nativo del navegador | (b) — nueva regla CSS, sin markup | **Parcialmente resuelto** (2026-08-13) — unificado en `.btn`/`.btn-primary`/`.btn-danger`/`.btn-danger-solid`/`.btn-whatsapp`/`.icon-btn` a `opacity:.5` (decisión de producto confirmada con el usuario). `input`/`select` de formulario **siguen sin regla propia** — fuera de alcance de esta pasada (ver regla de "no tocar sin mostrar diff" en `docs/GUIA-UX-UI.md`) | `main.css` — ver Fase B en `docs/GUIA-UX-UI.md` |
| DS-03 | Estado de error de campo sin tratamiento visual propio: `aria-invalid` se setea (`TicketNuevoView.vue`, `PersonalRegistroView.vue`, `TicketBuscarView.vue`) pero no existe `[aria-invalid] { border-color: ... }` — el borde no cambia, solo aparece `.form-error` debajo | (b) — nueva regla CSS, sin markup | **Resuelto (2026-09-01)** — Opción A aplicada tal como especificada en la ficha de abajo | `main.css`, junto a `.form-group input:focus` |
| DS-04 | `$ring`/`:focus-visible` sin cobertura real en: navegación principal (`.sb-nav-item`, `AppNav.vue`), encabezados ordenables (`ThOrdenable.vue`), buscador con autocompletado (`.combo-wrap input`, `BuscadorCombo.vue`) y buscador global (`.sb-busqueda input`, `AppSearch.vue`) — cero regla de foco visible en los 4 | (b) — nuevas reglas CSS, sin markup | **Resuelto** (2026-08-13) — `.sb-nav-item`/`.th-ordenable-btn` ganaron `outline: 2px solid var(--color-accent); outline-offset: -2px` (mismo criterio ya usado en `.sb-nav-titulo`, evita que el `box-shadow` de anillo se recorte contra el `gap` de 2px entre ítems). `.sb-busqueda input:focus` ganó `box-shadow: 0 0 0 3px var(--ring)`. `.combo-wrap input` **ya estaba resuelto**: siempre vive dentro de `.form-group` (`EquipoForm`/`LicenciaForm`/`CuentaForm`/etc.), que ya trae anillo vía `.form-group input:focus` — el hallazgo original quedó desactualizado. Reauditando contra `design.pen` en esta misma pasada aparecieron 2 gaps reales no listados aquí: `MenuAcciones.vue` (`.menu-acciones__item:focus-visible`, spec `rowY1dDW`) y `BuscadorCombo.vue` (`.combo-lista li.is-activo`, spec `rowlEgjG`) — ambos sin anillo, solo cambio de fondo; corregidos con `box-shadow: 0 0 0 3px var(--ring)`, verificado directamente contra los nodos de `design.pen` vía Pencil MCP antes de tocar código | `AppNav.vue`, `ThOrdenable.vue`, `AppSearch.vue`, `MenuAcciones.vue`, `BuscadorCombo.vue` |
| DS-05 | Selects de filtro (`filtroEstado`, `filtroTipo`, `filtroSituacion`, `filtroCategoria`, `filtroAccion`, `filtroPrioridad`, `filtroSeveridad`) sin `<label>` ni `aria-label` en las vistas con `.filters` — no hay nada que "reactivar": nunca existió un label, ni siquiera oculto | (c) — agrega markup en 7 archivos + ajusta `.filters` | **Resuelto** (2026-08-13) — cada `<select>` de filtro ahora vive en un `.filter-field` (`label` visible arriba, `select` abajo), clase nueva en `main.css` que reemplaza el `flex`/`min-width` que antes tenía `.filters select` directamente. Corrección al hallazgo original: son **7 archivos con 11 selects**, no 10/11 — `ActividadView` (1), `CorreosView` (1), `EmpleadosView` (1), `EquiposView` (2), `KbView` (2), `ProblemasView` (2), `TicketsView` (2); `LicenciasView` **no tiene ningún `<select>` de filtro** (solo buscador de texto), el archivo original la listó por error | `main.css` (`.filter-field`) + los 7 `.vue` listados |

### Fichas de desarrollo

**DS-01 — Token `--color-danger-hover`**
- **Qué cambia**: agregar `--color-danger-hover: #DC2626;` en `:root` (mismo
  valor en `[data-theme="dark"]` — a propósito invariante, no debe heredar el
  comportamiento por tema de `--color-danger`) + alias
  `--color-danger-hover: var(--color-danger-hover);`. Cambiar
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
  .combo-wrap input:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--ring); }
  .sb-busqueda input:focus { box-shadow: 0 0 0 3px var(--ring); }
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
| UX4-03 | Regresión de contraste en "Enviar por WhatsApp": un `<style scoped>` local reintroducía texto blanco a ~2:1 sobre `#25d366`, el mismo bug que la clase global `.btn-whatsapp` ya corrige a propósito (usa `--color-whatsapp-text`) | Alto | **Resuelto** (2026-08-13) | `CuentasPanel.vue` — se quitó el `background`/`color` hardcodeado del override local, solo queda el ajuste de tamaño |
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
| UX5-11 | Tipografía en `px` sueltos fuera de la escala `--fs-*`/`--fs-*`, no cubierta por auditorías anteriores | Bajo | **Resuelto** (parcial, ver pendiente) | `DashboardView.vue`, `LoginView.vue`, `EntregaView.vue`, `EmpleadoDetalleView.vue`, `LicenciasView.vue`, `LicenciaForm.vue`, `CorreoForm.vue`, `PersonalRegistrosView.vue` |
| UX5-12 | Fallbacks CSS muertos (`var(--x, var(--x))` o fallback a un token siempre definido) y un color de peligro inventado sin relación a ningún token | Bajo | **Resuelto** | `EquipoForm.vue` (fallback muerto + `.foto-x:hover` → `--color-danger-hover`), `CuentaForm.vue` (4 fallbacks, completa UX4-51), `LoginView.vue` (4 fallbacks más, incluye un bug real: `.login-aviso` usaba `--color-success` de alta saturación como color de texto en vez de `--color-success-text`, falla de contraste potencial) |
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
| BA-01 | 16 funciones `SECURITY DEFINER` con `EXECUTE` en el default de Postgres a `PUBLIC` (incluye `anon`, sin uso en este proyecto) | Crítica ×16 | **Resuelto** | Migración 062 — `REVOKE ... FROM PUBLIC` en las 16; `GRANT ... TO authenticated` de vuelta solo en las 10 invocadas directo por un rol autenticado (RLS o RPC del cliente). Ninguna se convirtió a `SECURITY INVOKER` (romperían el patrón de RLS de §3 de `PANORAMA-SISTEMA.md`) |
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
| BA-05 | 10 funciones `SECURITY DEFINER` (`es_jefe`, `es_staff`, `tiene_permiso_acceso_sensible`, `tiene_permiso_credenciales_ver`, `kb_registrar_feedback`, `dar_baja_empleado`, `cerrar_ticket`, `reporte_tickets`, `reporte_tickets_resumen`, `reporte_satisfaccion_consolidado`) marcadas "dangerous" — la regla del advisor flaguea CUALQUIER `EXECUTE` a un rol no-admin sobre una función `SECURITY DEFINER`, sin distinguir el patrón RLS-helper/RPC-gateada que la 062 dejó a propósito | Crítica ×10 | **Aceptado, sin cambios** | Revocar `authenticated` y/o pasar a `SECURITY INVOKER` rompería la app: `es_jefe()`/`es_staff()` dejarían de poder evaluarse dentro de las políticas RLS que las llaman (el rol que ejecuta la consulta necesita `EXECUTE` sobre la función aunque el cuerpo corra como el dueño), y como `INVOKER` reintroducirían la recursión de RLS que el patrón evita (política de `staff` llama a `es_jefe()`, que si corriera como el invocador volvería a consultar `staff` bajo su propia RLS) — ver §3 de `PANORAMA-SISTEMA.md` y [[insforge-advisor-grants-hardening]] en memoria |
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
| P0-05 | `tiene_permiso_modulo(text)` es la única función `SECURITY DEFINER` del sistema sin `revoke ... from public` (a diferencia de las otras 17, endurecidas en la migración 062/063) — un anónimo puede ejecutarla directamente (`select public.tiene_permiso_modulo('tickets')` sin sesión no da error). Sin impacto de fuga de datos por sí sola (solo devuelve `false` sin `auth.uid()`), pero es una inconsistencia de hardening y el patrón que el proyecto usa para todo lo demás | Baja | **Resuelto** (esquema aplicado 2026-08-18; verificación end-to-end del test 2026-08-31) | Migración 073 (`revoke execute on function tiene_permiso_modulo(text) from public; grant execute ... to authenticated;`), aplicada en producción el 2026-08-18. Verificado por `SELECT` en vivo: `pg_proc.proacl` ya no incluye `public`. **Reconfirmado end-to-end el 2026-08-31**: `frontend/tests/integration/autorizacion-anonima.smoke.test.js` corrido contra producción — 26/26 en verde, incluido el test de `tiene_permiso_modulo` que antes fallaba a propósito; la suite completa cierra en 0 fallas. El test se conservó como **no-regresión** (renombrado: ya no dice "hoy no lo hace") porque un `CREATE OR REPLACE` que recree la función desde cero le devolvería el EXECUTE a PUBLIC por default de Postgres. Cerrado también el rastro documental: `AGENTS.md` seguía afirmando durante 13 días que ese rojo era esperado — corregido en la misma fecha. Ver Ciclo 12 |

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
| EQ-FOTOS-02 | `MAX_FOTOS=4` (tope de fotos por equipo) solo existe en `EquipoForm.vue`, del lado del cliente — la edge function no lo aplica | Baja | **Mitigado (2026-08-31), no cerrado del todo — requiere deploy manual de la function** | `functions/equipos-fotos.ts` gana `MAX_FOTOS_POR_EQUIPO = 4`: `subirFoto`, después del gate `tienePermisoModulo('equipos')` y antes de decodificar/subir, hace un SELECT de `equipos.fotos` (`deleted_at is null`) y rechaza con `{ok:false, code:'limite_fotos'}` si ya hay 4. **Esquema real verificado antes de escribirlo** (no asumido): las fotos son la columna `equipos.fotos jsonb` (array de `{url,key}`, migración 015), no existe tabla `equipos_fotos`, y las keys del bucket son planas (`equipos/<uuid>.<ext>`) — contar por storage es imposible, y `eliminarFoto` solo borra el objeto del bucket sin tocar la columna. Status 200 con `{ok:false,code}` a propósito (igual que `archivo_invalido` del mismo archivo): el SDK devuelve `data=null` en toda respuesta no-2xx, así que con un 409 el cliente perdería el `code` y con él el mensaje en español. `api/domains/equipos.js` migrado de `functions.invoke()` a mano a `crearInvocador()` (era el último consumidor de edge function del frontend que lo hacía a mano, sin reintento de red ni mapa de códigos — ver ARQ-01) y mapea `limite_fotos`. **Por qué no queda cerrado**: (1) en el alta de un equipo no hay fila que contar todavía (el formulario sube antes del primer INSERT), ahí no hay tope server-side; (2) un cliente que omita `equipoId` a propósito esquiva el conteo. Cierra el bypass accidental/DevTools, no es una frontera dura — esa sería un `check (jsonb_array_length(fotos) <= 4)` en `equipos`, **no hecho**: el array lo escribe el cliente con su propia sesión, no esta función. No se creó migración para eso (decisión pendiente del usuario). `npm run typecheck:functions` (Deno 2.9.5, 4 functions) y `npm run lint` en verde |
| MIGR-072-TRACKING | La migración 072 (RLS de tickets/problemas/kb_articulos/encuestas, cierra P0-03) está aplicada y verificada por `pg_policies` (11/11 policies exactas), pero ausente de `public.schema_migrations` (salta de 071 a 073) | Baja | **Resuelto** (2026-08-22) | Reconfirmado que seguía sin registrar (0 filas para version='072') antes de aplicar nada. `INSERT` en `schema_migrations` con checksum real del archivo (`aplicada_por='verificacion-manual-2026-08-22'`, mismo patrón que 073/074/076), verificado por `SELECT` independiente contra producción — solo bookkeeping, sin tocar ningún objeto de negocio |
| — | Cuentas de staff activas (3, JEFE + 2 ASISTENTE): ninguna se creó en la ventana vulnerable de H-CRIT-056-060 (~2026-08-15 a 08-18) — cierra el pendiente que dejó abierto el Ciclo 12 ("revisar altas hechas mientras el bug estuvo vigente") | — | **Cerrado sin hallazgo** | `staff`/`auth.users`, 3/3 filas verificadas |
| — | Ventana PERM-060-064: `accesos_log` con `accion in ('permiso_otorgado','permiso_revocado')` tiene 0 filas en toda su historia — confirma que el modo de falla fue "transacción revertida completa", no "operación exitosa sin auditar" | — | **Confirmado, sin cambio de severidad al alza** | — |
| — | `tiene_permiso_modulo` (P0-05, migración 073): confirmado en vivo que las 16 funciones `SECURITY DEFINER` no-trigger tienen `REVOKE ... FROM PUBLIC`; las 40 funciones `RETURNS trigger` conservan el ACL default de Postgres pero no son invocables fuera de un trigger, sin importar el GRANT — no es un hallazgo | — | **Cerrado sin hallazgo nuevo** | — |
| TICKETS-TOKEN-DEAD | `functions/tickets.ts` (rama muerta de `crear` con `tokenEntrega`) sigue consultando `entregas.token`, columna eliminada por la migración 067 — mismo patrón que motivó el hallazgo P0 `entregaCrear` original, pero en código sin uso desde 2026-08-17 | Baja | **Resuelto** (2026-08-24) | Antes de tocar código: confirmada paridad repo↔producción byte a byte (mismo SHA-256, `functions code tickets`) — primera vez que se verifica `tickets.ts` (a diferencia de `credenciales.ts`, Ciclo 10). PR #14 elimina la rama `if (body.tokenEntrega)` y el comentario asociado (`deno check` + `eslint` + suite completa en verde). Redeploy manual a producción tras el merge; reverificada la paridad post-deploy con el mismo método de hash — coincide exactamente |
| — | `main` sin ninguna protección de rama ni ruleset; las 3 PRs mergeadas hasta ahora se mergearon sin revisión (`reviewDecision` vacío) | Alta (proceso) | **Abierto, requiere decisión del usuario** | GitHub API, `branches/main/protection` → 404 |
| — | Job `deploy-manual` → paso "Redesplegar edge functions" falla por timeout de login interactivo del CLI pese a tener `INSFORGE_ACCESS_TOKEN` como secret (run `32307942841`, 2026-08-19) | Media | **Abierto** | `.github/workflows/ci.yml` |
| — | `encuestas.ts` es la única de las 5 edge functions sin `Cache-Control: no-store` en su `json()` | Baja | **Abierto** | `functions/encuestas.ts:39-44` |
| ENTREGACREAR-TEST-BUG | Al correr por primera vez `entregaCrear (credenciales.ver ausente) — rechazada` contra un backend real (nunca se había ejecutado: la cuenta fixture no existía hasta este ciclo), el test falla — pero por un bug en el propio test, no en `credenciales.ts`: llama con `cuentaIds: []`, y el handler corta antes por `datos_requeridos` (HTTP 200, `credenciales.ts` línea ~613) sin llegar nunca al chequeo `tienePermisoCredenciales` que el test quiere ejercitar | Baja | **Abierto, a propósito no corregido en el PR de `equipos-fotos`** (detectado 2026-08-20) | `frontend/tests/integration/autorizacion-roles.smoke.test.js` — fix propuesto: pasar `cuentaIds: ['00000000-0000-4000-8000-000000000000']` en vez de `[]` |
| CUENTA-PERSONAL-REVOCAR-01 | Reportado por un usuario real (`almacen.nufago.06@gmail.com` / VPN): "Revocar" en `CuentasPanel.vue` para `tipo_cuenta='personal'` solo cerraba `asignaciones_cuenta.fecha_fin` — nunca tocaba `cuentas.deleted_at`. La cuenta quedaba viva para siempre, invisible en la ficha del empleado (que solo muestra asignaciones abiertas) pero ocupando el slot de `uq_cuentas_usuario_plataforma` (migración 039) sin ningún camino de UI para liberarlo — el usuario no podía volver a registrar ese mismo usuario en esa plataforma nunca más, ni "revocando" de nuevo. Barrido en producción: 4 filas huérfanas (mismo empleado, 3 del 2026-08-17 + la de VPN del 2026-08-20) | Alta (bloquea una operación normal de alta, sin salida desde la UI) | **Resuelto** (2026-08-21) | RPC `revocar_cuenta_personal()` (migración 077, no `security definer`) cierra la asignación y hace soft-delete de la cuenta en la misma transacción, solo para `tipo_cuenta='personal'` — `cerrarAsignacion()` (reutilizada por `licencias.js` `liberarUsuario`) queda sin cambios a propósito. Backfill de las 4 filas huérfanas por ID explícito en la misma migración. Verificado en un branch de InsForge descartable con una sesión JEFE real: cierre+soft-delete atómico, recreación del mismo usuario+plataforma sin error de duplicado, rechazo sin efectos sobre `compartida`/`reutilizable`, y `liberarUsuario()` de licencias sin cambio de comportamiento. Cobertura nueva: `tests/db/triggers.test.sql` bloque 5 (guard `es_staff()`/rechazo de tipo) y `frontend/tests/integration/cuentas-revocar-personal.smoke.test.js` (3 casos, corridos contra el branch real; en CI queda `skipIf` hasta provisionar la cuenta JEFE dedicada, mismo patrón que el resto de `autorizacion-roles.smoke.test.js`) |
| TEST-DB-CRLF | Al escribir el bloque 5 de arriba se encontró que `scripts/test-db.mjs` corta comentarios `--...` con una regex (`/--.*$/`) que no es CRLF-safe: en Windows con `core.autocrlf=true`, el archivo `tests/db/triggers.test.sql` queda con `\r\n` en el working tree, `.` no matchea `\r` en JS, y la regex deja de recortar nada — el comando que se manda al CLI se vuelve mucho más largo y dispara "línea de comandos demasiado larga" en el bloque más grande. No afecta CI (Linux, sin CRLF) ni lo committeado (git normaliza a LF); solo rompe la corrida local en Windows, y de forma silenciosa hasta que un bloque se pasa del límite | Baja (solo tooling local) | **Abierto** | `scripts/test-db.mjs` — fix propuesto: normalizar `\r\n`→`\n` antes de recortar comentarios, o usar `/--.*/` con flag que trate `\r` como parte de `.` |
| GIT-ADD-CONTAMINACION-01 | Hallazgo de proceso, no solo de git: el commit `950b89c` (PR #7) incluyó por error la línea `'getTendencias'` en `insforge-api-shape.test.js` — un cambio de una sesión concurrente sin commitear, presente en el mismo working tree, que un `git add <archivo>` re-stageó sin querer al ejecutarse sobre un archivo que había sido restaurado a su versión "con ambos cambios" entre una verificación anterior y el `add` final. La verificación posterior (`git diff --cached` + `git status --short`) no lo detectó porque confirmó "¿son los archivos correctos?", no "¿es el CONTENIDO exactamente el esperado, línea por línea, incluso en archivos ya verificados en un paso previo?". La causa raíz real no es el comando de git en sí — es trabajar un cambio quirúrgico sobre un working tree que en ese momento tenía ~27 archivos ajenos sin commitear: ese volumen es en sí mismo un costo operativo real y creciente, no solo un detalle técnico puntual de esta corrección | Baja (detectado por CI antes de mergear a `main`, gracias a la branch protection del hallazgo #1 de "Pendientes", ya cerrado — esa protección funcionó exactamente para esto) | **Resuelto** | Commit `63a410d`, corregido sin `amend` ni force-push (push normal al mismo branch), verificado con `git stash --keep-index` contra el estado exacto a pushear antes de commitear |
| MIGR-078-APLICADA-POR-DASHBOARD | Al verificar la migración 078 (`notify_ticket_personal()`, fusión resuelto/cerrado) en `sistema-ti` tras abrir el PR, apareció ya aplicada en producción sin estar registrada en `schema_migrations` — pese a que solo se había corrido `db import` contra un branch de InsForge descartable, nunca contra el proyecto padre. Investigación forense (mismo método que el hallazgo 1.3, `insforge.logs`): reproducción controlada confirmó que un branch NO filtra DDL/funciones hacia el padre sin un `branch merge` explícito (nunca ejecutado), descartando esa hipótesis. El audit log (`EXECUTE_RAW_SQL`, actor `cloud:65d80c91-...`, IP real, `POST /rawsql` vía el SQL Editor del dashboard, 2026-08-21T21:24:55Z) identificó la causa real: el usuario aplicó la función manualmente desde el dashboard, adelantándose al ciclo de aprobación coordinado, mientras la prueba en el branch seguía en curso — confirmado por el propio usuario. No hay tercer actor ni sesión comprometida | Baja (sin impacto real: el código aplicado coincide exactamente con lo probado y aprobado; solo faltaba el bookkeeping) | **Resuelto** (2026-08-21) | `schema_migrations` registrada manualmente (`aplicada_por='dashboard-manual-2026-08-21'`), verificada por `SELECT` independiente. Sin cambio de código — es un hallazgo de proceso: coordinar antes de aplicar manualmente cuando hay una prueba en curso en paralelo |
| ACCESOS-SENSIBLES-UPDATE-DELETE-TEST | Al provisionar las 4 cuentas de fixture del ítem 2 de Pendientes y correr por primera vez contra un JEFE real sin permiso de fila, 2 tests de `autorizacion-roles.smoke.test.js` ("JEFE sin permiso de fila no puede editar/eliminar") fallan con `expected null to be truthy` — esperan `error` en la respuesta, pero un `UPDATE`/`DELETE` bloqueado por `USING` en Postgres/PostgREST no lanza error: solo afecta 0 filas en silencio (a diferencia de `INSERT`, que sí viola `WITH CHECK` con error real) | Baja | **Abierto, confirmado sin riesgo real (2026-08-24)** | Diagnóstico aislado en una rama descartable (borrada tras el diagnóstico, sin llegar a `main`): fixture creado por `INSFORGE_TEST_JEFE_CON_FILA`, intento de `UPDATE` y luego `DELETE` por `INSFORGE_TEST_JEFE_SIN_FILA`, `SELECT` de verificación con sesión de JEFE_A después de cada intento, antes de limpiar nada. La fila quedó exactamente intacta en ambos casos (`updated_at` sin cambiar, `notas` sin escribir, fila presente hasta el cleanup real) — RLS bloqueó de verdad, sin bypass. Mismo patrón de deuda que `AUTH-TEST-004`/`ENTREGACREAR-TEST-BUG` (ítem 9). Fix propuesto, no aplicado: reemplazar `expect(error).toBeTruthy()` por una verificación de que la fila no cambió (re-`SELECT` o comprobar `data` vacío) |
| REPORTE-TICKETS-RPC-MUERTOS | La migración 053 creó `reporte_tickets(p_desde,p_hasta)`/`reporte_tickets_resumen(p_desde,p_hasta)` explícitamente para reemplazar las consultas crudas de `obtenerReporteTickets()`/`obtenerResumenTickets()` (comentario propio de la migración lo dice) — pero el frontend nunca migró: `frontend/src/api/domains/reportesTickets.js` sigue haciendo las mismas consultas de siempre. Detectado al auditar el flujo completo de tickets de punta a punta | Baja | **Abierto** (detectado 2026-08-24) | `migrations/053_reporte_tickets_rpc.sql` vs. `frontend/src/api/domains/reportesTickets.js:61-241`; el único código que invoca esos 2 RPC hoy es `frontend/tests/integration/autorizacion-anonima.smoke.test.js:119-126` (verifica que rechacen a un anónimo). Hipótesis de por qué el corte quedó a medias: ninguno de los 2 RPC recibe un parámetro `asignadoA`/`p_asignado`, necesario para el filtro "Solo mi actividad" que sí soporta el camino actual |
| TICKET-EVENTOS-REASIGNADO-SIN-DETALLE | `evento_ticket_cambios()` registra el evento `'reasignado'` siempre con `detalle = null`, a diferencia de los demás eventos que dispara la misma función (`estado_cambiado`, `prioridad_cambiada`, `nivel_atencion_cambiado`, `tipo_cambiado`), que sí arman un `detalle` tipo "De X a Y". Detectado al auditar el flujo completo de tickets de punta a punta | Baja | **Abierto** (detectado 2026-08-24) | `migrations/035_tickets_tipo.sql` (definición vigente de `evento_ticket_cambios()`) |
| EQUIPOS-TABLAS-SATELITE-SIN-GATE | Las migraciones 068/072 instalaron `es_jefe() OR (es_staff() AND tiene_permiso_modulo('equipos'))` en `equipos`/`tipos_equipo`/`asignaciones_equipo`/`eventos_equipo` con el objetivo declarado de cerrar el hueco de módulo en todo el dominio Equipos — pero nunca tocaron 3 tablas satélite del mismo dominio: `equipo_accesorios`, `catalogo_almacen`, `equipos_importacion`. Confirmado por `SELECT` directo a `pg_policies` (no por el nombre de la migración): las 3 seguían con `es_staff()` plano en SELECT/INSERT/UPDATE (y también en DELETE para `equipo_accesorios`/`equipos_importacion`; `catalogo_almacen` ya tenía DELETE `es_jefe()`, igual que las 4 tablas principales). Un ASISTENTE sin el módulo `equipos` podía leer/escribir directo por SDK las 3 tablas — accesorios de cualquier equipo, el catálogo de almacén, y la bandeja completa de importación masiva (con `empleado_id`/`ubicacion_id` de destino). Detectado al auditar el flujo completo de Equipos de punta a punta | Media-Alta (acceso no autorizado real vía SDK directo — requiere ser staff activo, no explotable de forma anónima ni remota trivial) | **Resuelto** (2026-08-25) | Migración 079 (`079_rls_equipos_tablas_satelite.sql`) reemplaza las 11 policies que usaban `es_staff()` plano por el mismo patrón de 068/072; el DELETE de `catalogo_almacen` (ya `es_jefe()`) queda sin tocar. Verificación en dos capas antes de aplicar a producción: (1) evaluación directa por `SELECT` de `es_jefe()`/`es_staff()`/`tiene_permiso_modulo('equipos')` contra los datos reales de las cuentas fixture — confirmó que `ci-tests-sin-modulo` (ASISTENTE activo, sin módulos) pasaba la policy vieja y no la nueva, que otorgándole el módulo `equipos` sí vuelve a pasar (sin sobre-restringir), y que ambas cuentas JEFE pasan igual en las dos versiones (sin regresión) — mismo método ya aceptado en el Ciclo 12 para cuando no es viable autenticar una sesión HTTP real en un branch; (2) pruebas de flujo real en un branch de InsForge descartable ya con la migración aplicada: `reemplazarAccesoriosEquipo()` (delete+insert de línea de accesorio sobre un equipo real), alta/edición/soft-delete de `catalogo_almacen`, y el flujo completo de la bandeja de importación (`bulkCrearImportacion` → edición → `migrarFila` → `eliminarImportacion`) — los 3 funcionaron igual que antes. Aplicado a producción y verificado byte a byte contra `pg_policies` (12/12 policies idénticas al branch probado), registrado en `schema_migrations` (`aplicada_por='claude-deploy-2026-08-25'`), branch descartable borrado |
| EQUIPOS-BAJA-SIN-WHITELIST-DB | `equipos.estado` no tenía ninguna protección a nivel de base de datos — a diferencia de `tickets`, que desde la migración 050 tiene una whitelist explícita de transiciones (`transiciones_ticket_permitidas`). El único freno contra "dar de baja/perder un equipo con una asignación abierta" vivía en `EquiposView.vue:298-302` (`pedirCambiarEstado`), sin respaldo de trigger — cualquier `UPDATE` directo por SDK podía saltarse la regla. (`ImportarEquiposView.vue:300-312`, `asignacionIncompatible()`, resultó ser un caso distinto: protege que una fila de importación no asigne y a la vez pida un `estado` no operativo en la misma migración, ya cubierto por `check_asignacion_equipo()` — no aporta una segunda regla a replicar). Detectado al auditar el flujo completo de Equipos de punta a punta | Media (integridad de datos — un equipo puede quedar `de_baja`/`perdido` mientras un empleado real todavía lo tiene, sin ningún registro de devolución; no es un hallazgo de acceso no autorizado) | **Resuelto** (2026-08-25) — **versión mínima a propósito, NO una whitelist completa tipo tickets** | Migración 080 (`080_check_baja_equipo_con_portador.sql`): trigger `BEFORE UPDATE OF estado ON equipos` que replica **exactamente** la regla real de `pedirCambiarEstado()` (confirmado leyendo el condicional, no asumido), decisión explícita tomada antes de escribir el trigger (ver `AskUserQuestion` de esta sesión: paridad exacta en ambos ejes, no ampliar alcance) — rechaza solo la transición `operativo → de_baja/perdido` cuando existe una fila en `asignaciones_equipo` con `empleado_id is not null and fecha_fin is null`. **Dos huecos que la regla de UI ya tenía y que esta migración deja explícitamente sin cubrir** (paridad exacta, no ampliación): (1) `situacion` (la derivación client-side que usa el guard de UI) cae directo al `estado` físico en cuanto este deja de ser `'operativo'` — el guard nunca pudo bloquear `en_reparacion → de_baja/perdido` ni ningún salto entre `de_baja`/`perdido`, así que un equipo puede estar asignado a un empleado real y quedar `en_reparacion` simultáneamente (ya documentado como "cosa rara" en la auditoría de flujo, sin fila propia hasta ahora) sin que nada impida después darlo de baja/perdido desde ese estado con el portador todavía activo; (2) el guard (y por lo tanto el trigger) solo mira `empleado_id`, no `ubicacion_id` — un equipo con una asignación abierta a una **ubicación** (almacén/área) puede pasar a `de_baja`/`perdido` sin ningún freno, ni de UI ni de DB. Ambos quedan como deuda abierta, ver Pendientes ítem 17. Verificado en un branch de InsForge descartable antes de aplicar a producción: caso negativo (equipo `operativo` con asignación abierta a empleado real → `UPDATE` directo a `de_baja` y a `perdido`, ambos rechazados con el mensaje del `RAISE EXCEPTION`), caso positivo (cerrando la asignación primero, mismo orden que `devolverEquipo()`, el mismo `UPDATE` pasa igual que antes), y el flujo real de alta masiva con asignación (`createEquipo` → `asignarEquipo`, sin tocar el trigger nuevo porque la UI nunca migra una fila que asigne y a la vez pida `de_baja`/`perdido`). Aplicado a producción y verificado byte a byte (función + trigger idénticos al branch probado), registrado en `schema_migrations` (`aplicada_por='claude-deploy-2026-08-25'`), branch descartable borrado |
| EMPLEADOS-SOFT-DELETE-MUERTO | `softDeleteEmpleado()` (`frontend/src/api/domains/empleados.js`) y la acción equivalente del store (`frontend/src/stores/empleados.js`) existen y funcionan, pero ningún componente de `frontend/src/modules/empleados/` los llama — a diferencia de todos los demás módulos con soft-delete (empresas, licencias, equipos, correos, plataformas, KB, encuestas, catálogos), que sí tienen un botón "Eliminar" funcional en su UI. Detectado al auditar el flujo completo de Empleados de punta a punta | Baja | **Abierto** (detectado 2026-08-25) | `frontend/src/api/domains/empleados.js` (`softDeleteEmpleado`), `frontend/src/stores/empleados.js` — sin caller en `frontend/src/modules/empleados/` |
| EMPLEADOS-REINGRESO-DNI-SIN-MANEJO | Dar de alta un empleado con un DNI ya existente (el `unique` de `dni`, migración 002, es global — no distingue activo/inactivo) por el camino normal "Nuevo empleado" revienta con el error crudo de Postgres (`23505 duplicate key`), sin manejo amigable ni oferta de reactivar el registro existente. Detectado al auditar el flujo completo de Empleados de punta a punta | Baja | **Abierto** (detectado 2026-08-25) | `frontend/src/modules/empleados/EmpleadoForm.vue` (`guardar()`, catch genérico). **Nota (2026-08-29)**: la mención original al camino alternativo "Migrar a empleado" desde `/personal` (que sí manejaba el conflicto) quedó obsoleta — ese módulo se retiró completo en la migración 084. El hallazgo en sí (el camino normal sigue sin manejo amigable) sigue abierto igual |
| PERSONAL-REGISTRO-DNI-EXOFFBOARD | `functions/personal-registro.ts`'s `buscarDni` no filtraba `deleted_at is null` al buscar coincidencia por DNI, a diferencia de `functions/tickets.ts` (`crear` y `buscarPorDni`), que sí excluyen empleados offboardeados explícitamente. Detectado al auditar el flujo completo de Empleados de punta a punta | Baja | **Cerrado por retiro del módulo** (2026-08-29, migración 084) — `functions/personal-registro.ts` ya no existe, el hallazgo dejó de aplicar | `functions/tickets.ts` (`crear`, `buscarPorDni`) sigue con el criterio correcto, sin cambios |
| EMPLEADOS-SIN-AUDITORIA | No existe ninguna tabla ni mecanismo equivalente a `ticket_eventos`/`eventos_equipo` para `empleados` — ningún cambio a una fila de empleado (incluida la baja, `dar_baja_empleado()`, un evento de negocio significativo) deja registro de qué cambió ni de cuál era el valor anterior. Los únicos triggers sobre `empleados` son genéricos: `set_updated_at`, `set_created_updated_by`, `notify_list_changed` (sin payload, solo "la lista cambió, refrescá"), y 2 notificaciones de campana (alta/baja) sin captura de valores. `dar_baja_empleado()` tampoco escribe en `accesos_log`. Contraste directo con Tickets (9 tipos de evento) y Equipos (4 tipos de evento), ambos con tabla append-only dedicada. Detectado al auditar el flujo completo de Empleados de punta a punta | Baja | **Abierto** (detectado 2026-08-25) | `migrations/002_empleados_cuentas.sql`, `005_created_by.sql`, `026_realtime_listas.sql`, `045_notificaciones.sql`, `038_baja_empleado_atomica.sql` — ningún `insert` a una tabla de auditoría en ninguno |
| EMPLEADOS-ROUTER-MAS-ESTRICTO-QUE-RLS | El router (`meta.modulo: 'empleados'` en `frontend/src/router/routes/staff.routes.js`, tanto `/empleados` como `/empleados/:id`) bloquea la pantalla completa a un ASISTENTE sin el módulo `empleados` otorgado — pero la policy RLS de SELECT sobre `empleados` es `es_staff()` puro, sin ningún gate de módulo (decisión explícita de la migración 068, para no dejar en blanco los nombres de empleado embebidos en Equipos/Licencias/Correos). Esa misma sesión, consultando la tabla directo por SDK, sí podría leerla completa. **Nota de contexto, no vulnerabilidad**: la apertura de SELECT ya es intencional y está documentada (`README.md`, `docs/PANORAMA-SISTEMA.md`); lo que no estaba anotado en ningún lado hasta ahora es que, en la dirección opuesta, el router es más estricto que la base de datos. Detectado al auditar el flujo completo de Empleados de punta a punta | Info (nota de contexto, no es un hallazgo de seguridad) | **Confirmado, sin acción — documentado como nota** (2026-08-25) | `frontend/src/router/routes/staff.routes.js`, `frontend/src/router/guards.js` vs. `migrations/068_rls_modulos_reales.sql` (SELECT sin gate) |
| CUENTAS-TABLAS-SATELITE-SIN-GATE | La migración 068 instaló `es_jefe() OR (es_staff() AND tiene_permiso_modulo('correos'))` en `cuentas`/`asignaciones_cuenta` con el objetivo declarado de cerrar el hueco de módulo en el dominio Cuentas — pero nunca tocó 2 tablas satélite del mismo dominio: `plataformas` y `entregas`. Mismo patrón exacto que EQUIPOS-TABLAS-SATELITE-SIN-GATE (fila anterior, migración 079). Confirmado por `SELECT` directo a `pg_policies` (no por el nombre de la migración): las 2 seguían con `es_staff()` plano en los comandos que no eran DELETE jefe-only (`plataformas`: SELECT/INSERT/UPDATE; `entregas`: SELECT — no tiene policy de INSERT/UPDATE para el cliente, solo la edge function `credenciales.ts` con cliente admin crea entregas y marca `viewed_at`). Un ASISTENTE sin el módulo `correos` podía leer/escribir directo por SDK el catálogo completo de `plataformas`, y leer el listado completo de `entregas` de toda la empresa (`empleado_nombre`, `expires_at`, `viewed_at`, `token_hash`, `payload` cifrado de credenciales). Detectado al auditar el flujo completo de Cuentas de punta a punta | Media-Alta (acceso no autorizado real vía SDK directo — requiere ser staff activo, no explotable de forma anónima ni remota trivial; mismo criterio de severidad que el hallazgo gemelo de Equipos) | **Resuelto** (2026-08-26) | Migración 081 (`081_rls_cuentas_tablas_satelite.sql`) reemplaza las 4 policies que usaban `es_staff()` plano por el mismo patrón de 068 (3 en `plataformas`: SELECT/INSERT/UPDATE; 1 en `entregas`: SELECT); el DELETE de ambas (ya `es_jefe()`) queda sin tocar. Verificación en dos capas antes de aplicar a producción, mismo método aceptado desde EQUIPOS-TABLAS-SATELITE-SIN-GATE: (1) evaluación directa por `SELECT` de `es_jefe()`/`es_staff()`/`tiene_permiso_modulo('correos')` contra los datos reales de las cuentas fixture en un branch de InsForge descartable — confirmó que `ci-tests-sin-modulo` y `ci-tests@materen-ti-test.local` (ambos ASISTENTE activo sin el módulo `correos`) pasaban la policy vieja y no la nueva, que otorgándole el módulo `correos` a `ci-tests-sin-modulo` sí vuelve a pasar (sin sobre-restringir), y que ambas cuentas JEFE pasan igual en las dos versiones (sin regresión); (2) revisión de los flujos reales que leen estas tablas: `CuentaForm.vue`/`CorreoForm.vue` ya están detrás del router gate `modulo:'correos'`; `LicenciaForm.vue` también lee `plataformas` para su sub-flujo "vincular correo nuevo", pero ese sub-flujo ya requería el módulo `correos` desde la 068 (el `INSERT` en `cuentas` que dispara `createCorreo` ya estaba gateado) — no es una regresión nueva, solo extiende la misma restricción ya vigente al catálogo; la pestaña Configuración→Plataformas no tiene gate de módulo en el router (igual que Configuración→Tipos de equipo desde 068/079) — un staff sin `correos` ahora ve la lista vacía, mismo patrón ya aceptado; `entregas` no tiene ningún consumidor UI directo (solo la edge function con cliente admin), sin impacto de flujo. Aplicado a producción y verificado byte a byte contra `pg_policies` (6/6 policies idénticas al branch probado), registrado en `schema_migrations` (`aplicada_por='INACONS'`), branch descartable borrado |

**Nota de documentación (2026-08-24)**: de los 9 valores permitidos en el
`CHECK` de `ticket_eventos.evento`, dos quedaron vestigiales desde la
migración 055 (retiro de todo envío de correo en `functions/tickets.ts`):
`'correo_fallido'` y `'encuesta_enviada'`. Ningún código inserta esos
eventos hoy, y el trigger `notify_correo_fallido()` (migración 049, que
escucha `evento='correo_fallido'` en `ticket_eventos`) quedó sin poder
dispararse nunca — no se retira nada del `CHECK` ni del código (puede haber
filas históricas con esos valores, y retirarlos no es parte de esta
auditoría), pero un lector futuro de la tabla no debería asumir que los 9
valores siguen produciéndose por igual.

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
2. ~~Secrets de CI para tests de integración autenticados~~ —
   **Resuelto (2026-08-24)**: eran dos partes distintas que este ítem no
   separaba. **(a)** Los 4 secrets base (`VITE_INSFORGE_URL`,
   `VITE_INSFORGE_ANON_KEY`, `INSFORGE_TEST_STAFF_EMAIL`,
   `INSFORGE_TEST_STAFF_PASSWORD`) + la cuenta genérica de staff dedicada a
   CI (`ci-tests@materen-ti-test.local`) ya estaban resueltos desde antes
   de esta auditoría. **(b)** Las 4 cuentas de rol específico que sí
   faltaban (`INSFORGE_TEST_ASISTENTE_SIN_MODULO_*`,
   `INSFORGE_TEST_STAFF_INACTIVO_*`, `INSFORGE_TEST_JEFE_CON_FILA_*`,
   `INSFORGE_TEST_JEFE_SIN_FILA_*`) — creadas en InsForge (dashboard +
   activación/rol manual) y sus 8 secrets cargados en GitHub Actions. En
   el camino se encontró y corrigió un problema de workflow real: el
   bloque `env:` del job `test-integration` (`.github/workflows/ci.yml`)
   nunca reenviaba esos 8 secrets al proceso, aunque ya existieran a nivel
   de repo — PR #16 agrega las 8 líneas faltantes al mismo bloque.
   Verificado con el log real del job `test-integration` (run
   `32775965136`, PR #16): de los 18 tests que estaban en `skipped`, 15
   corren y pasan de verdad. Los 3 restantes (`entregaCrear` y 2 del
   bloque `accesos_sensibles` fila por fila) fallan por deuda de test ya
   documentada aparte, no por las cuentas — ver `ENTREGACREAR-TEST-BUG`
   (ítem 9 de esta lista) y el nuevo hallazgo
   `ACCESOS-SENSIBLES-UPDATE-DELETE-TEST` (Ciclo 13, ítem 12 de esta
   lista), este último confirmado sin riesgo real mediante un diagnóstico
   aislado antes de documentarlo.
3. Diagnosticar y resolver el bug de autenticación del CLI — **alcance
   ampliado (2026-08-21): no es exclusivo de `deploy-manual`**. El job
   `tests-db` tiene exactamente el mismo patrón: el CLI (`npx
   @insforge/cli db query`, invocado desde `scripts/test-db.mjs`) cae a
   login interactivo por OAuth pese a tener `INSFORGE_ACCESS_TOKEN`
   presente y no vacío (confirmado: el propio job valida que el secret
   existe antes de correr el script), imprime la URL de
   `https://api.insforge.dev/api/oauth/v1/authorize?...` y `Waiting for
   authentication...`, y termina en `Error: Authentication timed out.`
   ~25 minutos después (14:31:26Z → 14:56:36Z en el run #79, mismo tiempo
   de espera en los 5 bloques de `tests/db/triggers.test.sql`, uno por
   uno). Confirmado sistémico: **9/9 corridas recientes de `tests-db`
   (runs #71 a #79) fallan**, mientras `lint-y-typecheck` pasa en las 9 y
   `test-integration`/`build-y-tests` pasan en casi todas — no es ruido
   aleatorio, es reproducible en cada corrida. El run #80
   (`workflow_dispatch` manual) se canceló a mano tras confirmar el mismo
   patrón en curso — sin riesgo: los bloques SQL nunca llegan a
   ejecutarse (la conexión nunca se autentica), así que no hay ninguna
   transacción a medias ni lock en producción que limpiar. Misma causa
   raíz en ambos jobs, todavía sin diagnosticar (no investigado por qué
   el CLI no toma el token) — queda como su propio punto de esta lista,
   no se aborda junto con esta actualización de alcance.

   **Causa raíz confirmada (2026-08-21, evidencia de código —
   `@insforge/cli` 0.2.8, bundle inspeccionado con `npm pack` + lectura
   directa de `dist/index.js`)**: `requireAuth()` — el gate que corre
   antes de prácticamente todo comando (`db query`, `db import`,
   `functions deploy`, etc.) — nunca consulta `INSFORGE_ACCESS_TOKEN`.
   Solo revisa `getCredentials()`, que lee exclusivamente
   `~/.insforge/credentials.json` en disco; si ese archivo no existe
   (cualquier runner de CI limpio, siempre) cae directo a login OAuth
   interactivo, sin importar qué contenga la env var. La env var recién
   se consulta más abajo, dentro de `platformFetch()`, para el header
   `Authorization` de la llamada real — pero a esa altura `requireAuth()`
   ya trabó todo. Por eso el fallo es sistémico (9/9) y no intermitente:
   no depende del azar, depende de que el runner nunca tuvo esa sesión
   guardada. Explica también por qué funciona en local: la máquina del
   desarrollador ya tiene un `credentials.json` real de un login OAuth
   por navegador hecho alguna vez, no una configuración especial de env
   var.

   Se evaluaron y descartaron tres alternativas, cada una con su motivo:
   - **`uak_` (Personal API Key)**: sí pasa por `requireAuth()` con
     refresh automático (el CLI detecta el prefijo `uak_` y renueva
     sola), pero es acceso total a la cuenta personal, no
     acotado al proyecto — mismo motivo por el que ya se descartó una
     vez en esta sesión al provisionar la cuenta de CI; se mantiene la
     misma decisión.
   - **Bypass OSS/self-hosted** (`link --api-base-url <url> --api-key
     <key>` con el proyecto real, dejando que el CLI guarde el
     `project_id` sentinela que activa `isOssProject()`): evita
     `requireAuth()` por completo, confirmado en el código — pero es un
     modo no diseñado para el servicio cloud (la clave `ik_` del
     dashboard, pensada para otro flujo), frágil ante cualquier
     actualización del CLI que valide mejor esa condición, y exigiría
     cambiar la arquitectura de cómo `ci.yml` linkea el proyecto (hoy
     usa `INSFORGE_PROJECT_ID` con el UUID real, no el sentinela).
   - **Reportar el bug a InsForge** (`requireAuth()` debería consultar
     `INSFORGE_ACCESS_TOKEN` igual que `getAccessToken()` ya hace): la
     única que resuelve la causa real, pero no depende de nosotros.

   **Decisión (2026-08-21): no aplicar ningún workaround por ahora.**
   `deploy-manual`/`tests-db` siguen sin funcionar en CI, documentado
   como limitación conocida del CLI (no un bug propio del repo) — el
   deploy real sigue siendo manual, como ya viene funcionando en toda
   esta sesión (`equipos-fotos`, migración 077). Se retoma en una
   auditoría futura, evaluando entonces si InsForge ya corrigió el bug
   o si conviene reconsiderar alguna de las alternativas descartadas.

   **Escalada de severidad (2026-08-22)**: confirmado que el fallo no
   fue un evento acotado a los runs #71-#79 — sigue sistemático en TODO
   run de CI desde el 21/08, sin excepción: el run sobre `main` tras el
   merge del PR #11, y cada PR abierto desde entonces (incluido el
   PR #12, del reporte de equipos), todos con `tests-db` en fallo por la
   misma causa. No bloquea merges porque `tests-db` no es un check
   obligatorio de branch protection (solo `lint-y-typecheck` y
   `build-y-tests` lo son, verificado vía `GET
   /repos/.../branches/main/protection/required_status_checks`) — pero
   la consecuencia real es más seria que "un check en rojo que nadie
   mira": **ningún test de nivel base de datos
   (`tests/db/triggers.test.sql`, incluidos los 5 bloques de guards de
   autorización agregados en esta misma auditoría) se está ejecutando de
   verdad en CI desde esa fecha**. Solo `test-integration` (nivel
   HTTP/API, vía el SDK autenticado) sigue corriendo y verificando algo
   real contra el backend; la capa de verificación a nivel SQL directo
   quedó completamente ciega desde el 21/08, sin que ningún check
   obligatorio lo señale como bloqueante — mismo patrón de fondo que
   Q-01 (un check que no cumple su función de alerta), aplicado ahora a
   `tests-db` en vez de a los smoke tests de integración.

### Prioridad media — limpieza antes del refactor grande

4. ~~Eliminar la rama muerta en `tickets.ts` que consulta
   `entregas.token`~~ — **Resuelto (2026-08-24)**: ver fila
   TICKETS-TOKEN-DEAD (Ciclo 13).
5. ~~Confirmar paridad repo↔producción de `tickets.ts`~~ — **Resuelto
   (2026-08-24)**: paridad confirmada byte a byte, antes y después del
   redeploy — ver fila TICKETS-TOKEN-DEAD.
6. ~~Registrar la migración 072 en `schema_migrations`~~ — **Resuelto
   (2026-08-22)**: ver fila MIGR-072-TRACKING (Ciclo 13).
7. ~~3 tablas satélite de Equipos (`equipo_accesorios`, `catalogo_almacen`,
   `equipos_importacion`) sin el gate de módulo `tiene_permiso_modulo
   ('equipos')` que sí tienen las 4 tablas principales~~ — **Resuelto
   (2026-08-25)**: ver fila EQUIPOS-TABLAS-SATELITE-SIN-GATE (Ciclo 13),
   migración 079.
8. ~~`equipos.estado` sin ninguna protección a nivel de base de datos
   contra dar de baja/perder un equipo con una asignación abierta a un
   empleado~~ — **Resuelto (2026-08-25)**, versión mínima (paridad
   exacta con la UI, no whitelist completa): ver fila
   EQUIPOS-BAJA-SIN-WHITELIST-DB (Ciclo 13), migración 080.

### Prioridad baja — deuda menor, no urgente

9. `MAX_FOTOS=4` sin tope server-side en `equipos-fotos.ts`. → **mitigado 2026-08-31**, ver EQ-FOTOS-02 (pendiente el `check` en BD y el deploy de la function).
10. `Cache-Control: no-store` faltante en `encuestas.ts`.
11. Bug del test `entregaCrear` en `autorizacion-roles.smoke.test.js`
    (`cuentaIds: []` no llega al chequeo) — fix: usar un UUID dummy.
12. Registrar en documentación el redeploy manual de `equipos-fotos.ts`
    del 2026-08-18 (por "SIG"), sin entrada equivalente en el historial.
13. Hallazgo colateral de la fusión resuelto/cerrado (2026-08-21): en la
    búsqueda pública por DNI (`functions/tickets.ts`, acción de
    `TicketBuscarView.vue`), los tickets en estado `resuelto` no aparecen
    ni en `activos` (solo `abierto`/`en_progreso`/`reabierto`) ni en
    `cerrados` (solo `estado='cerrado'` exacto, para calcular encuesta
    pendiente) — desaparecen por completo de los resultados mientras
    están en ese estado. No es un bug activo hoy (`cerrar_ticket()` hace
    el salto resuelto→cerrado atómico, nadie queda parado ahí), pero es
    un gap latente si algún día existiera un camino que sí lo deje ahí.
    No se toca sin pedirlo aparte.
14. Los 2 tests de `accesos_sensibles` fila por fila (`UPDATE`/`DELETE`
    sin permiso) esperan `error` truthy, pero un bloqueo por RLS bajo
    `USING` no lanza error — afecta 0 filas en silencio. Confirmado sin
    riesgo real mediante diagnóstico aislado (2026-08-24, ver
    `ACCESOS-SENSIBLES-UPDATE-DELETE-TEST`, Ciclo 13). Fix: verificar que
    la fila no cambió en vez de esperar `error`.
15. `reporte_tickets`/`reporte_tickets_resumen` (migración 053) nunca
    fueron adoptados por el frontend — código muerto en producción, ver
    `REPORTE-TICKETS-RPC-MUERTOS` (Ciclo 13).
16. Evento `'reasignado'` en `ticket_eventos` siempre loguea
    `detalle = null`, a diferencia de los demás eventos del mismo
    trigger — ver `TICKET-EVENTOS-REASIGNADO-SIN-DETALLE` (Ciclo 13).
17. `equipos.estado` sigue sin protección de DB para 2 casos que la
    migración 080 dejó a propósito fuera de alcance (paridad exacta con
    la regla vieja de UI, ver EQUIPOS-BAJA-SIN-WHITELIST-DB, Ciclo 13):
    (a) `en_reparacion → de_baja/perdido` con un empleado real todavía
    como portador (la derivación de `situacion` oculta la asignación en
    cuanto `estado` deja de ser `operativo`, así que ni la UI ni el
    trigger nuevo lo detectan); (b) ninguna protección para asignación
    abierta a una **ubicación** (solo se mira `empleado_id`). Si se
    quiere cerrar del todo, es una whitelist de transiciones completa
    tipo tickets (migración 050), no una extensión puntual de este
    trigger.
18. `softDeleteEmpleado()`/`deleted_at` sin ningún caller en la UI —
    único módulo con soft-delete sin botón "Eliminar" funcional pese a
    tener el código escrito. Ver EMPLEADOS-SOFT-DELETE-MUERTO (Ciclo 13).
19. Alta de un empleado con un DNI ya existente por el camino normal
    revienta con el error crudo de Postgres, sin oferta de reactivar. Ver
    EMPLEADOS-REINGRESO-DNI-SIN-MANEJO (Ciclo 13).
20. ~~`personal-registro.buscarDni` no excluye ex-empleados (`deleted_at`)~~
    — **cerrado por retiro del módulo** (migración 084, 2026-08-29). Ver
    PERSONAL-REGISTRO-DNI-EXOFFBOARD (Ciclo 13).
21. Empleados no tiene ningún event log — ni siquiera la baja
    (`dar_baja_empleado()`) deja rastro de qué cambió ni del valor
    anterior, a diferencia de Tickets/Equipos. Ver EMPLEADOS-SIN-AUDITORIA
    (Ciclo 13).
22. Nota de contexto (no un hallazgo de seguridad): el router bloquea la
    pantalla completa de Empleados a un ASISTENTE sin el módulo, aunque
    la policy RLS de SELECT sea `es_staff()` puro sin gate — el router es
    más estricto que la base de datos, en la dirección opuesta a lo que
    suele buscarse. Ver EMPLEADOS-ROUTER-MAS-ESTRICTO-QUE-RLS (Ciclo 13).

### Fuera de esta auditoría, sin fecha

23. Backup / RPO / RTO / procedimiento de restauración — sin definir.
24. Los `expect(error)` genéricos de `AUTH-TEST-004` — deuda de tests, no
    endurecida.
25. Los 3 tests `no destroza los acentos ni el guión largo del castellano`
    (`reporte-pdf.test.js`, `reporte-equipos-pdf.test.js`,
    `reporte-satisfaccion-pdf.test.js`) fallan buscando el byte `\x97`
    (guion largo en codificación WinAnsi) en el PDF crudo que genera jsPDF —
    detectado 2026-09-23 revisando el rediseño de UI del resto de módulos.
    **Confirmado que no es una regresión de ese cambio**: falla igual con
    `git stash` de todo `frontend/src/modules` (ninguno de esos 3 tests ni
    su código fuente están en ese diff). No investigado a fondo — candidato
    a un cambio de versión de `jspdf` o de cómo mapea `Times-Roman` ese
    carácter en este entorno; los otros 8-9 casos de cada archivo (acentos,
    contenido, estructura del PDF) siguen en verde.

### Roadmap de producto (nuevo, no auditado todavía)

25. Diseño de arquitectura multi-empresa / multi-agencia — tratar como su
    propio ciclo de auditoría/diseño antes de escribir código: probablemente
    toca la mayoría de las policies RLS existentes. Definir el modelo de
    aislamiento (RLS por `empresa_id` vs. schemas separados) antes de
    migrar.

## Ciclo 14 — Auditoría UI/UX completa desde cero (2026-08-26)

Alcance: pedido explícito del usuario, auditoría completa del sistema
**desde cero** — a diferencia de los ciclos anteriores, sin apoyarse en
"qué ya se revisó" (el "Repaso de consistencia — módulo por módulo" de
`docs/GUIA-UX-UI.md`, ago-2026), para el caso de que el criterio hubiera
cambiado desde entonces. Método: 15 agentes en paralelo (uno por grupo de
módulos, agrupando los más chicos, más uno para
`frontend/src/components/shared/`), cada uno contra `docs/GUIA-UX-UI.md`
completo, con un segundo agente que reabre archivo y guía para confirmar o
descartar cada hallazgo antes de reportarlo. 57 hallazgos confirmados, 0
descartados en verificación. El grupo `shared-components` no llegó a
verificarse (límite de gasto de la cuenta a mitad del run) — su resultado
de 0 hallazgos queda **sin confirmar**, no leer como "componentes
compartidos limpios"; repetir esa verificación cuando se libere el límite.
El grupo `wip-direccion-azul` (`StyleLabView.vue`/`DesignSystemView.vue`,
la migración de paleta azul ya "aprobada, pendiente de portar") se evaluó
con un criterio distinto: no contra navy/mint actual, sino contra lo que
la propia guía documenta como plan aprobado — sus hallazgos no son
incumplimiento de producción.

Se corrigieron los 9 hallazgos de severidad alta que sí son de producción
(4 aplicados directo por ser solo texto; 5 estructurales — migración a
`<Modal>`, paridad tabla→tarjetas, consolidación en `MenuAcciones` —
mediante 5 agentes en paralelo con verificación posterior); el resto
(medio/bajo) queda documentado para priorizar después. Verificado con
`npm test` (184/214, 30 skip, misma línea base) tras consolidar todos los
lotes. La mayoría de los 57 no son problemas independientes sino ~9
patrones sistémicos repetidos en muchos archivos — agrupados así abajo en
vez de una fila por instancia.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| UX6-01 | Tuteo nuevo en `EmptyState`/validaciones/placeholders/tooltips, no cubierto por UX4-52/UX5-08/UX5-09 (alto en accesos públicos y de credenciales: es la puerta de entrada al sistema y un formulario público) | Alto/Medio | **Resuelto (parcial)** | Corregido: `AreasObrasPanel.vue`, `UbicacionesPanel.vue`, `TiposEquipoPanel.vue`, `CategoriasTicketPanel.vue` (6 strings), `LoginView.vue` (4), `PersonalRegistroView.vue` (6), `AccesosSensiblesView.vue` (10× "No tienes permiso" → "No tiene permiso"). Pendiente, mismo patrón: `TicketInternoForm.vue`, `TicketNuevoView.vue`, `TicketDetalleView.vue`, `TicketDetallePanel.vue`, `EquiposView.vue`, `EquipoForm.vue`, `ImportarEquiposView.vue`, `acta.js`, `acta-devolucion.js`, `EncuestaDetalleView.vue`, `EncuestaForm.vue`, `CorreosView.vue`, `KbView.vue`, `KbArticuloDetalleView.vue`, `CuentasPanel.vue`, `CuentaForm.vue` |
| UX6-02 | Tuteo — `ConfirmDialog` "Tienes cambios sin guardar, ¿deseas continuar?" sigue igual en los 8 archivos que UX4-52 ya nombró (`AccesoSensibleForm.vue`, el 9º, ya no lo usa) | Bajo | **Pendiente** | `CorreoForm.vue`, `CuentaForm.vue`, `EmpleadoForm.vue`, `EncuestaForm.vue`, `EquipoForm.vue`, `KbArticuloForm.vue`, `LicenciaForm.vue`, `ProblemaForm.vue` — mismo string en los 8, candidato a fix único de texto si se pide |
| UX6-03 | Modales hand-rolled sin `<Modal>` compartido (sin Escape ni bloqueo de scroll del body) | Alto | **Resuelto** | Migrados (mismo patrón ya probado de `AccesoSensibleForm.vue`: `<form>` con `id` en el slot por defecto + botón `type="submit" form="..."` en `#acciones`): `CuentasPanel.vue` (modales "Traspasar" e "Historial"), `CuentaForm.vue`, `PlataformasView.vue`, `EmpleadoForm.vue` (pasada de Empleados, ago 2026). Auditoría de consistencia ago-2026 (3er hallazgo del ciclo, ver `CHANGELOG.md`) encontró que esta fila daba por migrados 3 archivos que en el código seguían con `modal-bg` hand-rolled (`TicketInternoForm.vue`, `ReporteTicketsModal.vue`, `EmpresasView.vue` — este último sin ningún manejo de teclado/foco, ni `useCerrarConEscape`) — la propia clase de bug que este hallazgo describe, ahora en la documentación en vez del código. Cerrado de verdad en esa pasada: los 3 anteriores más `EquipoForm.vue`, `EquiposView.vue` (modales "Entregar", "Devolución", "Hoja de vida"), `LicenciaForm.vue` y el modal "Asignar asiento" de `LicenciasView.vue`. Verificado con `grep -rl 'class="modal-bg"'`: cero hand-rolled fuera de la definición en `Modal.vue`. Los composables `useCerrarConEscape.js`/`useFocoAtrapado.js` quedaron sin ningún uso real y se eliminaron |
| UX6-04 | Botones de ícono sin `aria-label` (solo `title`) | Medio/Bajo | **Pendiente** | `TicketDetalleView.vue`, `TicketDetallePanel.vue`, `EquiposView.vue` (×4, edición inline de Ubicación), `EmpleadoDetalleView.vue` (×2), `ProblemaDetalleView.vue` (×2), `KbArticuloDetalleView.vue` |
| UX6-05 | Header de columna "Acciones" en `sr-only` en vez de texto visible — quedó fuera del "Repaso de consistencia" de ago-2026 | Medio/Bajo | **Resuelto (parcial)** | Corregido: `StaffView.vue`, `LicenciasView.vue` (ver nota de alcance en UX6-07). Pendiente: `AreasObrasPanel.vue`, `UbicacionesPanel.vue`, `TiposEquipoPanel.vue`, `CuentasPanel.vue`, `EmpresasView.vue`, `PlataformasView.vue` |
| UX6-06 | Falta el patrón tabla→tarjetas en móvil — mismo hueco declarado pendiente en la guía para Configuración | Medio | **Pendiente** | `AreasObrasPanel.vue`, `UbicacionesPanel.vue`, `TiposEquipoPanel.vue`, `CuentasPanel.vue`, `EmpresasView.vue`, `PlataformasView.vue` |
| UX6-07 | Acciones sueltas sin consolidar en `MenuAcciones` (umbral de 3+ ya documentado) | Alto | **Resuelto** | Corregido: `StaffView.vue` (`accionesDe(miembro)` nueva, markup unificado desktop/móvil, borra la clase muerta `.icon-btn.activo`). **Corrección 2026-09-01**: esta fila decía que `LicenciasView.vue` ya tenía su tabla de escritorio consolidada — la auditoría visual e interactiva de esa fecha encontró, contra la app real, que la tabla de escritorio seguía con 4 `icon-btn` sueltos; solo la tarjeta móvil usaba `MenuAcciones`. El código nunca tuvo el fix que este párrafo daba por aplicado (no fue una regresión posterior, fue una discrepancia entre lo documentado y lo real desde el origen). Corregido de verdad en esa misma fecha: la tabla de escritorio ahora usa `<MenuAcciones :acciones="accionesDe(lic)">`, igual que la tarjeta móvil — cero duplicación de markup, verificado con `npm run build` + `npm test` (215/215) contra la app real (branch de prueba de InsForge). `CuentasPanel.vue` sigue pendiente. |
| UX6-08 | Tarjeta móvil de `LicenciasView.vue` sin paridad con escritorio: faltaban credenciales (mostrar/copiar clave) y la lista de usuarios con "Liberar asiento" | Alto | **Resuelto** | `LicenciasView.vue` — reutiliza las mismas funciones que ya usa la tabla de escritorio (`toggleClave`, `copiarClave`, `pedirLiberar`), sin reimplementar lógica |
| UX6-09 | Hallazgos puntuales de un solo módulo | Medio/Bajo | **Pendiente** | 7 tablas de `ReporteTicketsModal.vue` sin `scope="col"`/`aria-label`; `title`/`aria-label` divergentes en los botones de clave de `LicenciasView.vue` cuando falta permiso; `.acceso-option:hover` sin fondo tenue en `LicenciaForm.vue`; `TiposEquipoPanel.vue` reinventa badges con `.chip` en vez de `.badge`; doble acento `.btn-primary` visible en `ProblemaDetalleView.vue`; texto en negrita en celda de tabla (`ProblemasView.vue`, `KbView.vue`); `LoginView.vue` no reutiliza el shell público (`.public-page`/`PublicBrand`) y `.login-error` duplica `.form-error` con `--color-danger` en vez de `--color-danger-text`; `.password-toggle` sin `:focus-visible`; `CorreoForm.vue` reinventa el color de "seleccionado" en vez de `--color-accent-subtle` |
| UX6-10 | `DashboardView.vue` abandonó la grilla de 12 columnas documentada (`.dashboard-row`/`grid-template-areas` propio) sin que la guía se actualizara | Medio | **Pendiente** | `DashboardView.vue` — decisión a tomar: documentar el layout nuevo en `docs/GUIA-UX-UI.md` o revertir a la grilla estándar |
| UX6-11 | Reconfirmaciones de deuda ya nombrada en la guía, sin hallazgo nuevo | Bajo | **Reconfirmado, sin cambios** | Sombra inerte `--shadow-sm: none` en `.panel-lista`/`.stat-card` del Dashboard (la guía ya la marca como "limpieza de alcance mayor, no parte de este repaso"); filtro "Situación" de `EquiposView.vue` sin default no-vacío (la guía ya lo marca "aplicar si se reporta la misma confusión") |
| UX6-12 | `styleLab`/`designSystem` (dirección azul, WIP): tuteo/voseo en el propio lab, colores semánticos (warning/danger/info) que divergen de lo que la guía dice que "no se tocan" en esta migración, `--color-primary` sin la redirección a `--color-accent-text` que la guía ya da por cerrada (fallaría AA en oscuro si se usara), la sección "Elevación" no cubre el caso Toast que el propio plan incluye, ítem de nav de ejemplo sin `:focus-visible` | Alto (interno al lab) | **Resuelto** (2026-08-27, previo al porteo a `main.css` — ver `docs/GUIA-UX-UI.md`, changelog "migración de marca al azul, Fases G0-G5") | `frontend/src/modules/styleLab/StyleLabView.vue` |

**(a) Qué cambió**: `AreasObrasPanel.vue`, `UbicacionesPanel.vue`,
`TiposEquipoPanel.vue`, `CategoriasTicketPanel.vue`, `LoginView.vue`,
`PersonalRegistroView.vue`, `AccesosSensiblesView.vue`,
`TicketInternoForm.vue`, `ReporteTicketsModal.vue`, `CuentasPanel.vue`,
`CuentaForm.vue`, `StaffView.vue`, `EmpresasView.vue`, `PlataformasView.vue`,
`LicenciasView.vue` + `docs/GUIA-UX-UI.md` + este documento. **(b) Riesgo**:
bajo en los fixes de texto; medio en las 6 migraciones a `<Modal>` y en la
consolidación de `StaffView.vue`/`LicenciasView.vue` (mismo tipo de cambio
de markup ya validado en Ciclos 4/5) — verificado con `npm test` tras
consolidar todos los lotes, sin regresiones. **(c) Pendiente**: 48
hallazgos de severidad media/baja documentados arriba sin corregir, para
priorizar después; verificación de `frontend/src/components/shared/`
repetida cuando se libere el límite de gasto. UX6-12 (`styleLab`), que este
párrafo listaba como bloqueante antes de portar la dirección azul, quedó
**resuelto el 2026-08-27** (ver fila de la tabla arriba) — cerrado antes
del porteo, no después.

**Nota de documentación (2026-08-27), sin fila propia por ser hallazgo de
documentación, no de código**: la sección "Identidad de marca" de
`docs/GUIA-UX-UI.md` afirmaba desde el 2026-08-22 que producción ya estaba
en navy/mint (`#00203F`/`#36ECDE`). Verificado al portar la migración de
marca al azul (2026-08-27): el valor real de `main.css` en ese momento era
teal-green (`#157955`), la reconciliación del 22-ago nunca fue correcta.
Corregido en el mismo cambio que la migración de marca — mismo patrón de
fondo que Q-01 (documentación/check afirmando un estado que el código no
tenía), esta vez detectado antes de que causara un incidente real.

**Nota (2026-08-27), sin fila propia por no venir de un ciclo de auditoría
formal**: `TicketsView.vue` (Tabla/Isla, ver UX6-12 arriba) tuvo 2 bugs de
sincronización consecutivos por mantener el mismo estado de filtros en 2
superficies separadas (dropdown+chips en Tabla, nav-list+toggles en
Isla) — el segundo (cambiar a Isla con "Sin asignar" activo lo descartaba
en silencio, `sinAsignar: false` fijo en esa rama del watcher) se detectó
inmediatamente después de corregir el primero. Resuelto de raíz, no con
otro parche puntual: reemplazado por un solo modelo de Vistas
(`VISTAS_TICKETS`) compartido entre ambos modos, con un solo watcher — ver
`docs/GUIA-UX-UI.md`, "Filtros de Tickets: modelo de Vistas". Mismo patrón
que otros hallazgos de este historial (Q-01, la nota de arriba): un
síntoma puntual corregido dos veces era la señal de un problema
estructural, no de casos aislados.

## Ciclo 15 — Arquitectura y clean code de `frontend/src` (2026-08-31)

Alcance: pedido explícito del usuario, revisión de arquitectura/clean code
de **todo** `frontend/src` (~150 archivos) — no de UI/UX (eso es el ciclo
14), sino de capas, acoplamiento, duplicación y mantenibilidad. Método: 6
agentes en paralelo por capa (`api/`, `stores/`, `core/`+`composables/`,
`components/shared/`, y `modules/` partido en dos: operativo —
tickets/empleados/equipos/cuentas/correos/licencias— y el resto +
`router/`), cada uno leyendo los archivos completos, no por grep. 22
hallazgos.

**Conclusión general**: la arquitectura en capas se respeta con disciplina
(sin dependencias circulares, sin acoplamiento entre stores, `api/domains/*`
muy uniforme). Casi toda la deuda encontrada es de un solo tipo: una
convención buena y consistente **replicada a mano** en vez de factorizada —
el proyecto ya tiene el patrón para resolverlo (`crearCatalogoStore()` en
`stores/catalogos.js`, `core/pdfReporte.js`) y no lo generalizó.

**Cerrados en este ciclo: 18 de 22** — los 3 críticos, 10 de los 11
importantes (7 resueltos, 2 parciales, 1 aceptado y documentado) y 5 de los
8 opcionales. Verificado con `npm run lint` (0 errores, los 8 warnings
preexistentes), `npx vite build`, `node scripts/contraste.mjs` (0 fallas) y
`npm test` (**215 pasan + 30 se saltan**; 184+30 era la línea base, +31 de
las cuatro suites nuevas de este ciclo: `invocarFuncion`, `acta-equipos`,
`crearStorePaginado`, `useCrudCatalogo`).

Quedan abiertos 4. Los 2 que importan son del mismo tipo y **no se hicieron
a propósito**: ARQ-09 (los god-components: `TicketsView` 1526 líneas,
`EquiposView` 1018, `AppLayout` 573) y ARQ-13 (el god-composable de la ficha
de ticket). Partirlos son cirugías de 700 a 1500 líneas sobre vistas muy
iteradas a mano, y sin `@vue/test-utils` la única verificación real es abrir
la pantalla — conviene uno por cambio, con revisión visual. Los otros 2
(ARQ-20 nomenclatura BEM, ARQ-21 organización de carpetas) son churn con
poco retorno.

**Criterio que se repitió en todo el ciclo**: la duplicación que se eliminó
fue siempre la de *plomería* (mecánica de red, de estado, de plumbing de un
modal, de CSS), nunca la de *contenido*. Los templates de los 3 catálogos,
las columnas de cada tabla y los campos de cada formulario quedaron como
estaban a propósito: no son copias, son lo que distingue una pantalla de la
otra. Tres hallazgos resultaron ser más que cosméticos al tocarlos (ARQ-15,
un ciclo real de imports; ARQ-18, código muerto; ARQ-06, que además cerró el
hueco de estilos de `ReporteTicketsModal.vue`).

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| ARQ-01 | `invoke()` triplicado casi carácter por carácter en las 3 vías a edge functions; ya divergido (solo `passwords.js` soportaba `reintentarRed`; solo tickets/encuestas adjuntaban `.code` al error). Un fix del reintento había que aplicarlo 3 veces y nada avisaba si se olvidaba una | Crítico | **Resuelto** | Nuevo `api/invocarFuncion.js` (`crearInvocador(nombre, mensajeError)`); `passwords.js`/`ticketsPublicos.js`/`encuestaPublica.js` conservan solo su mapa de códigos→mensaje. Las 3 quedan con el mismo contrato (`.code` siempre, `reintentarRed` disponible, reintento que conserva las opciones). Cubierto por `tests/invocarFuncion.test.js` (5 casos) |
| ARQ-02 | `TicketDetalleView.vue` y `TicketDetallePanel.vue` duplicaban campos de gestión, hilo de comentarios, composer e historial (~200 líneas de template + ~120 de CSS). Drift real ya visible: el orden del encabezado de cada burbuja (fecha inline vs. línea aparte) sólo se aplicó al panel | Crítico | **Resuelto** | 4 componentes nuevos compartidos: `TicketCamposGestion.vue`, `TicketComentarios.vue`, `TicketComposer.vue`, `TicketHistorial.vue`. Las diferencias reales quedan explícitas como props (`id-prefijo`, `label-asignado`, `fecha-inline`, `acotado`) en vez de duplicadas. El auto-crecimiento del textarea bajó de `useTicketDetalleLogica.js` a `TicketComposer.vue` (es del control, no del dominio) |
| ARQ-03 | `equipos/acta.js` y `acta-devolucion.js`: `esc()`, el bloque `<style>` completo y el andamiaje `window.open`/`print` idénticos byte a byte | Crítico | **Resuelto** | Nuevo `equipos/acta-base.js` (escapado, estilos, `tablaDatos`/`seccion`/`firma`, `construirActa`/`abrirActa`); cada acta conserva solo sus secciones, su cláusula y sus firmas. Equivalencia del HTML generado verificada contra la versión commiteada en 5 escenarios antes de borrar la copia vieja; regresión fijada en `tests/acta-equipos.test.js` (7 casos, no había ninguno) |
| ARQ-04 | 7 stores de paginación server-side (`tickets`, `empleados`, `correos`, `equipos`, `licencias`, `kb`, `problemas`) repiten a mano ~35-40 líneas de `cargar/irAPagina/aplicarFiltros/resetearFiltros/ordenarPor` + guard `_peticionId` | Importante | **Resuelto** | Nuevo `stores/crearStorePaginado.js`, análogo de `crearCatalogoStore()`. Migrados los 7: `tickets`, `empleados`, `correos`, `equipos`, `licencias`, `kb`, `problemas`. Puntos de extensión para los 3 casos que no eran idénticos: `enriquecer` (conteos por fila de Empleados), `extra` devuelto por `listarPagina` (catálogos que Equipos cachea en la misma tanda) y `state`/`actions` propios (Vistas y `cargarMas` de Tickets). Tickets conserva intacto `resetearBusqueda()`, su excepción documentada en `AGENTS.md`. Cubierto por `tests/crearStorePaginado.test.js` (9 casos, incluido el guard `_peticionId`) |
| ARQ-05 | 7 pantallas de catálogo CRUD casi copy-paste (`AreasObrasPanel`, `UbicacionesPanel`, `TiposEquipoPanel`, `CategoriasTicketPanel`, `EmpresasView`, `PlataformasView`, listado de `StaffView`) | Importante | **Resuelto (parcial)** | Nuevo `composables/useCrudCatalogo.js` (cargar al montar, abrir alta/edición, guardar, eliminar con confirmación, orden + paginación), con puntos de extensión para lo que no era idéntico: `actualizar` propio, `despuesDeGuardar`/`despuesDeEliminar` (Tipos de equipo refresca la copia del catálogo que cachea `stores/equipos.js`) y `mensajeErrorGuardar`. Migrados los 3 que comparten vocabulario y ya usan `<Modal>`: `AreasObrasPanel` (198→136 líneas), `UbicacionesPanel` (217→161), `TiposEquipoPanel` (259→202); ningún template cambió. Cubierto por `tests/useCrudCatalogo.test.js` (10 casos). **Alcance menor al estimado, a propósito**: (a) los templates NO se unificaron — las columnas de cada tabla y los campos de cada formulario no son duplicación, son lo que distingue un catálogo de otro; (b) `EmpresasView`/`PlataformasView` quedan fuera de `useCrudCatalogo.js` — meterlos exigiría estirar el composable con una opción más para un solo caso; `EmpresasView.vue` ya migró a `<Modal>` en la auditoría de consistencia ago-2026 (UX6-03), pero eso no cambia esta decisión: sigue siendo un caso aparte, no una plantilla de catálogo más; (c) `CategoriasTicketPanel` no entra: tiene dos niveles (categorías + subcategorías), es otro patrón |
| ARQ-06 | Layout "detalle con columna lateral" y "listado con filtros" duplicados clase por clase entre KB y Problemas (`.datos-title`, `.tk-seccion`, `.tk-detalle`, `.tk-nota`) | Importante | **Resuelto** | Las 4 clases del vocabulario de ficha (`.datos-title`, `.tk-seccion`, `.tk-detalle`, `.tk-nota`) pasan a `main.css`: eran 23 copias byte a byte repartidas en 8 archivos. Se verificó una por una antes de mover — `.tk-seccion` y `.tk-detalle` eran idénticas en todas sus copias; `.tk-nota` y `.datos-title` lo eran salvo en 2 vistas, que conservan **solo su diferencia** y ganan por especificidad (0,2,0 vs 0,1,0), sin depender del orden de carga. **Cierra de paso un hueco conocido**: `ReporteTicketsModal.vue` usaba las 3 clases sin definir ninguna, así que ahí se veían sin estilo — ahora toman la global sin tocar ese archivo. Documentado en `docs/GUIA-UX-UI.md` ("Vocabulario de ficha") con la regla de no volver a copiarlas |
| ARQ-07 | Boilerplate de formulario modal (~40 líneas: `useDetectorDeCambios` + confirmar descarte + reset + `watch(prop,{immediate})`) repetido a mano en los 5 forms operativos | Importante | **Resuelto** | Nuevo `composables/useFormularioModal.js` (ref del modal + detección de cambios + flujo de descarte). Migrados los 7 que ya usan `<Modal>`: `AccesoSensibleForm`, `CorreoForm`, `CuentaForm`, `EmpleadoForm`, `EncuestaForm`, `KbArticuloForm`, `ProblemaForm`. Ningún template cambió (mismos nombres). Sumados en la migración a `<Modal>` de la auditoría de consistencia ago-2026 (UX6-03): `EquipoForm.vue`, `LicenciaForm.vue`, `TicketInternoForm.vue` |
| ARQ-08 | Foco atrapado + Escape + click-fuera + posicionamiento de popover reimplementados 3-4 veces en `components/shared/`, **pese a que `useCerrarConEscape.js` y `useFocoAtrapado.js` existen y ninguno de los dos se usa ahí** | Importante | **Resuelto (parcial)** | Nuevo `composables/usePopoverFlotante.js` (abrir/cerrar, posicionar, click afuera, Escape con foco de vuelta al trigger, resize), consumido por `MenuAcciones.vue` y `NotificacionesCampana.vue`; cada uno conserva solo lo suyo (`alinear`, y las flechas del `role="menu"`). No alcanzaba con `useCerrarConEscape`/`useFocoAtrapado`: esos resuelven modales, no un popover anclado. **Pendiente**: `Modal.vue` sigue con su propio foco atrapado (del que se extrajo `useFocoAtrapado`, hoy sincronizados solo a mano) y `BuscadorCombo.vue` con su propio posicionamiento, que es genuinamente distinto |
| ARQ-09 | God-components: `TicketsView.vue` (1526 líneas, 2 árboles de template + 10 queries de conteo), `EquiposView.vue` (1018), `AppLayout.vue` (573, 6 responsabilidades no relacionadas) | Importante | **Pendiente** | — |
| ARQ-10 | `components/shared/AppLayout.vue` importa `modules/staff/StaffNombreForm.vue` — única violación de capas encontrada (shared conociendo un módulo de dominio) | Importante | **Aceptado, documentado** | Se evaluó mover `StaffNombreForm.vue` a `components/shared/`: sería meter un formulario de dominio (tabla `staff`, `updateStaff`) entre los componentes genéricos — cambiar un problema por otro. El shell lo necesita de verdad ("editar mi nombre" vive en el menú de usuario) y `StaffView.vue` usa el mismo. Queda como excepción explicada en el propio `AppLayout.vue`, ahora con `defineAsyncComponent`: el modal no viaja en el chunk principal |
| ARQ-11 | `modules/equipos/reporteEquipos.js` importa `aISO` de `modules/tickets/reportePeriodo.js` — acoplamiento cruzado entre módulos hermanos; ese util es de `core/` | Importante | **Resuelto** | La raíz no era la ubicación del archivo: `aISO` era un reexport de una línea de `core/formatters.js:fechaISO`. Se eliminó el alias exportado; `reporteEquipos.js`, `reporte.js`, `reporteSatisfaccion.js`, `ReporteTicketsModal.vue` y el test importan `fechaISO` de `core/` directo. Equipos ya no depende de Tickets |
| ARQ-12 | `core/dominio-empleados.js` resuelve el estado con una cadena `if/else` (`claseEstado()`) en vez del patrón objeto+función `xInfo()` que siguen los otros 6 `dominio-*.js` y que `core/badges.js` documenta como la convención | Importante | **Resuelto** | `dominio-empleados.js` pasa a `ESTADOS_EMPLEADO` + `estadoEmpleadoInfo()`, mismo patrón que los otros 6; `core/badges.js` lo despacha igual que al resto. Mismo comportamiento (las claves son los valores del enum `estado_empleado`, y el fallback conserva el valor crudo) |
| ARQ-13 | `useTicketDetalleLogica.js` es un god-composable (443 líneas, ~45 propiedades exportadas, 6 flujos de transición con sus propios refs de modal) | Importante | **Pendiente (reducido)** | Bajó de 443 a ~425 líneas y 2 exports menos al mudar el auto-crecimiento del textarea a `TicketComposer.vue` (ARQ-02). El corte real por flujo (transiciones / comentarios) sigue sin hacerse |
| ARQ-14 | Estrategia post-mutación inconsistente entre stores, sin regla documentada: push/splice local optimista vs. `await this.cargar()` completo vs. parche con `Object.assign` | Importante | **Resuelto (documentado)** | La regla ya existía escrita, pero solo dentro de `stores/empleados.js` — por eso cada store nuevo elegía distinto. Se subió al encabezado de `crearStorePaginado.js`, que es lo que ahora leen los 7: in-place para mutaciones de una fila, `cargar()` para las que cambian el conjunto, y por qué un `push` local no es una tercera opción válida en un listado paginado |
| ARQ-15 | Barrel `api/insforge.js` que ningún `domains/*.js` usa (los 18 importan `client.js` directo); solo lo usan los 3 archivos de edge functions | Opcional | **Resuelto** | Resultó ser más que cosmético: `api/invocarFuncion.js` importaba `getClient` del barrel y cerraba un ciclo real (`insforge.js` → `domains/cuentas.js` → `passwords.js` → `invocarFuncion.js` → `insforge.js`), que funcionaba solo porque `getClient()` se llama en runtime. Ahora importa de `client.js`, igual que los 18 `domains/*.js` |
| ARQ-16 | `.sb-logout` duplicado byte a byte entre `AppLayout.vue` y `AppSearch.vue` | Opcional | **Resuelto** | `.sb-logout` pasa a `main.css` (junto a `.icon-btn`, del que es una variante teñida con `--sb-text`) y sale de los dos `<style scoped>`. Sin cambio de especificidad efectiva: ningún elemento la combina con otra clase global, y `.sb-collapse` solo aporta `margin-left` |
| ARQ-17 | Getters `staffActivo`/`staffPorId` duplicados entre `stores/ticketDetalle.js` y `stores/problemaDetalle.js` | Opcional | **Resuelto** | Nuevo `stores/gettersStaff.js`, mezclado con spread en `ticketDetalle.js` y `problemaDetalle.js` |
| ARQ-18 | `core/utils.js:todayISO()` duplica `core/formatters.js:fechaLocalISO()` con otro nombre | Opcional | **Resuelto** | Era además código muerto: `todayISO()` no tenía un solo consumidor. Se borró (con una nota en `core/utils.js` de dónde vive "la fecha de hoy") en vez de mantener dos nombres |
| ARQ-19 | `stores/accesosSensibles.js` usa `eliminar` donde el resto de los stores usa `softDelete`, con la misma semántica | Opcional | **Resuelto** | `accesosSensibles.js` usa `softDelete`, igual que los otros 9 stores; actualizado su único llamador (`AccesosSensiblesView.vue`) |
| ARQ-20 | Nomenclatura BEM distinta entre `MenuAcciones` (`menu-acciones__item`) y `NotificacionesCampana` (`campana-panel__item`) para el mismo patrón de fila accionable | Opcional | **Pendiente** | — |
| ARQ-21 | `EmpresasView`/`PlataformasView`/`StaffView` tienen carpeta de módulo propia pese a ser pestañas de Configuración (`config.routes.js`) — la estructura de carpetas no refleja la de rutas | Opcional | **Pendiente** | Decidir: mover a `modules/configuracion/` o documentar por qué no |
| ARQ-22 | Los 7 stores sin paginar no tienen el guard `_peticionId` contra respuestas obsoletas que sí tienen los 7 paginados | Opcional | **Pendiente** | Condición de carrera real pero de impacto bajo hoy (listas chicas, sin llamadas superpuestas) |

**Falso positivo descartado en la revisión** (queda anotado para no volver a
levantarlo): `core/exportar.js` / `core/exportar-tickets.js` / `pdfReporte.js`
**no** duplican lógica — `pdfReporte.js` ya es la extracción compartida
correcta (se hizo cuando apareció el segundo consumidor) y los dos
`exportar*` son formatos distintos (CSV genérico vs. fila de ticket).
Igual `AppNotifications.vue` vs `NotificacionesCampana.vue`, `Modal.vue` vs
`ConfirmDialog.vue` y `BadgeEstado.vue` vs `IndicadorPrioridad.vue`:
divergencias deliberadas y ya documentadas en los propios componentes.

**Pendiente de verificación visual (ARQ-02, ARQ-07, ARQ-08, ARQ-16)**: el
repo no tiene `@vue/test-utils`, así que todo lo que toca componentes se
validó con lint + build + revisión del código (orden del DOM preservado
estado por estado, `id` de campos idénticos vía `id-prefijo`, templates sin
cambios en los 7 formularios, misma especificidad CSS para `.sb-logout`),
**no montándolo**. Conviene una pasada a ojo por: `/tickets/:id` y el
split-view de `TicketsView.vue`; abrir y cancelar con cambios sin guardar
uno de los 7 formularios; el menú "⋮" de una fila y la campana de
notificaciones (Escape, clic afuera, flechas); y el footer del sidebar.
Lo que sí tiene red de pruebas nueva es la lógica sin DOM: el invocador de
edge functions, las actas y el factory de listados paginados.

## Ciclo 16 — Deriva entre la guía de diseño y el código (2026-09-01)

Origen: pedido de "rediseño total" de MATEREN. El descubrimiento cambió la
respuesta — el sistema no necesitaba rediseño visual, necesitaba que sus
reglas dejaran de ser prosa. Los hallazgos de abajo **no se buscaron a mano**:
los encontró `scripts/tokens-vs-guia.mjs` en su primera corrida, que es
exactamente el punto del ciclo. Este es el primer ciclo cuyo mecanismo de
detección queda corriendo en CI en vez de agotarse en la pasada.

Causa raíz común, ya nombrada por el proyecto en el changelog del 2026-08-31 y
repetida en DS-01..DS-05, INV-05, DP-04, DP-05, DP-06 y Q-01: una regla o un
valor mejor se aplica a una parte del sistema y nunca se retrofitea al resto ni
queda escrito como "la forma vigente". Cada instancia se corrigió a mano; el
mecanismo, nunca.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| DR-01 | `GUIA-UX-UI.md` tenía **dos secciones con el mismo título** ("Bordes — jerarquía de 3 niveles"), una diciendo "ya portada" y otra "dirección aprobada, pendiente de portar", con tablas de valores idénticas. Verificado contra `main.css`: `--color-border-default`/`-strong` existen con esos valores, así que la segunda era falsa | Media (documentación que induce a rehacer trabajo ya hecho) | **Resuelto** | Sección caduca eliminada |
| DR-02 | "Excepciones hardcodeadas" describía el anillo de foco como `rgba(0,32,63,0.28)` "derivado del navy actual" y el azul como "pendiente de portar (commit `G3`)". `main.css` ya tenía `--ring: rgba(0,130,251,0.28)` desde la propia G3; la sección "Anillo de foco", más arriba en el mismo archivo, siempre fue la correcta | Media | **Resuelto** | Sección reescrita, con nota de qué decía antes |
| DR-03 | La guía nombraba `--color-brand-elevated`, `--color-brand-ink` y `--color-brand-ink`, los tres retirados de `main.css` **esa misma mañana** | Baja (deriva de horas, detectada el mismo día) | **Resuelto** | Región `<!-- tokens-retirados -->`, que el verificador ignora a propósito |
| DR-04 | La guía citaba `--color-focus`/`--color-focus-ring` como el mecanismo de foco del sistema. Esos tokens **nunca existieron** en `main.css` (sí existen, pero dentro del ámbito local de `StyleLabView.vue`, que no es fuente de verdad) | Media | **Resuelto** | Vivían en la sección eliminada por DR-01 |
| DR-05 | **La escala de espaciado completa no tiene consumidores**: `--space-1..12` declarados, solo `space-7` y `space-9` usados. Todo el espaciado del sistema está hardcodeado en px, componente por componente. Es la brecha más grande entre lo que el Design System dice ser y lo que es | Media (deuda de sistema, no bug) | **Declarado, no resuelto** | `DEUDA_DECLARADA` en `scripts/tokens-vs-guia.mjs` + regla vigente y Fase 3 en `docs/PLAN-MAESTRO-MATEREN.md` §6.2 |
| DR-06 | 17 tokens más sin ningún consumidor: huérfanos categóricos `-border` (teal/purple/sky/neutral) y `teal-bg-subtle` — ya diagnosticados como DP-05 y marcados "decisión pendiente" desde el 2026-08-13 —, `--radius-xl`/`--radius-xl` (agregados por DP-04, nunca adoptados), `--z-modal-stacked`, `--color-text-disabled` y 3 alias de acento | Baja | **Declarado, no resuelto** | Retirarlos toca `main.css`, con trabajo en vuelo en el árbol. Fase 4 del plan |
| DR-07 | El principio "sin bordes de acento en los costados" contradecía la práctica desde hacía meses; una nota dentro de él lo admitía y pedía decisión del JEFE. **Ese pedido tenía bloqueada la selección múltiple de Tickets** (`TK1`/`TK2`) — una función detenida por una ambigüedad documental, no técnica. Continuación directa de UX4-04 y DP-08 | **Alta** (bloqueaba producto) | **Resuelto** | Decisión de producto del 2026-09-01. Principio reescrito como "ningún acento estructural supera 2px"; pendiente cerrado en `GUIA-UX-UI.md` |
| DR-08 | `core/marca.js` era la fuente de verdad del nombre del producto y **6 sitios la esquivaban** con el literal a mano (`AppLayout` ×3, `LoginView`, `pdfReporte`, `acta-base` ×2). Mismo mecanismo de deriva, en la capa de marca: convertía un futuro rename en una cacería por el repositorio | Baja | **Resuelto** | Los 6 consumen `marca.js`. La única excepción real (`index.html`, HTML estático sin JS) quedó anotada dentro de `marca.js` |
| DR-09 | **La peor instancia del patrón, y la única con consecuencia práctica**: la sección "Sombras y radios" decía mostrar "valores reales de `main.css`" y declaraba `--shadow-sm/md/lg: none`, `--radius-lg: 14px` y `--radius-xl: 14px` — **los cinco falsos desde G4**. Su gemela "Sombras y radios (ya portadas)", más arriba en el mismo archivo, tenía los valores correctos. La premisa falsa se propagó al "Repaso de consistencia", que anotó una **limpieza pendiente en 8 archivos** (`box-shadow` supuestamente inerte) que no existía: la corrección real ya se había hecho en G4. Es el mismo par duplicado de DR-01/DR-02, no detectado por la nota del Resumen que sí había detectado los otros dos | Media (inventó trabajo pendiente) | **Resuelto** | Sección caduca eliminada; fila del Dashboard corregida; escala de radios completada en la sección correcta (los 3 radios que solo vivían en la sección borrada) |

**Mecanismo, no solo hallazgos**: `scripts/tokens-vs-guia.mjs` corre en CI
junto a `contraste.mjs` y falla el build ante FANTASMA (la guía nombra un token
inexistente) o MUERTO (token definido sin consumidor). Sigue el consumo de
forma transitiva, así que la capa de alias `--color-*` → `--*` no produce
falsos muertos. Avisa, sin fallar, de los 91 tokens vivos que la guía todavía
no menciona — bajar ese número a 0 y convertirlo en fallo es la Fase 2 del
plan.

**Qué se revisó y se dejó igual a propósito** (para que una pasada futura no
lo audite de nuevo desde cero): Dashboard (su feed de pendientes ordenado por
urgencia ya es superior a una grilla de KPIs), Tickets (diez pasadas
documentadas, es el módulo modelo), Empleados (la "Ficha de Empleado" en curso
es la respuesta correcta), la paleta y la tipografía (dirección de marca
cerrada el 2026-09-01), el sidebar y su agrupación (la taxonomía en vocabulario
de TI se difiere con disparador explícito, no se olvida) y los módulos
Problemas/KB/Encuestas (adopción casi nula: rediseñarlos sería optimizar contra
nadie). Detalle y razones en `docs/PLAN-MAESTRO-MATEREN.md` §5 y §10.

## Ciclo 17 — Cierre del ciclo de calidad (2026-09-01)

Continuación directa del Ciclo 16, con el encargo explícito de **no volver a
auditar ni rediseñar**, sino construir los mecanismos que vuelvan las
inconsistencias detectables solas. Punto de partida: analizar qué garantizaba
y qué NO garantizaba `scripts/tokens-vs-guia.mjs`.

**Lo que no garantizaba** (el análisis pedido): compara *nombres* de token
entre `main.css`, el código y la guía. No ve nada de lo que pasa dentro de los
`<style>` de los componentes, no verifica que un `var()` resuelva, y no mira
el marcado. Tres huecos, tres mecanismos nuevos.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| CC-01 | **Bug vivo, invisible para toda la verificación existente**: `--color-text-disabled` estaba definido en ambos temas pero su alias `--color-text-disabled` **nunca se creó**, y dos sitios lo consumían SIN fallback (`MenuAcciones.vue` `.menu-acciones__item:disabled` ×2 y `.celda-sep` en `main.css`). Un `var()` sin definir es inválido en tiempo de cómputo: la declaración se descarta y el elemento hereda el color del padre — **los ítems deshabilitados no se veían deshabilitados**. Build, lint, 215 tests y el check de contraste pasaban todos | **Media** (bug visual en producción) | **Resuelto** | Alias creado en `main.css`. Mecanismo: check REFERENCIA ROTA en `tokens-vs-guia.mjs`, que falla el build |
| CC-02 | El mismo valor de velo (`rgba(12,15,17,.55)`) escrito a mano en dos archivos para el mismo propósito: `.modal-bg` (`main.css`) y `.sb-overlay` del drawer móvil (`AppLayout.vue`). La guía lo documentaba como "excepción hardcodeada" en singular, sin decir que estaba duplicado | Baja | **Resuelto** | Token `--color-overlay` + alias; los dos lo consumen |
| CC-03 | Comentario de `LoginView.vue` describiendo el logo como "verde pino (#072E2A)" — el color de la marca retirada. El logo real es `#0064E0` desde la migración a azul (verificado en el propio SVG). Deriva de documentación **dentro del código**, que ningún check de tokens puede ver | Baja | **Resuelto** | Comentario corregido |
| CC-04 | Fila de alta rápida de acciones correctivas (`ProblemaDetalleView.vue`): el `<select>` de responsable, el `<input type="date">` y el `<button type="submit">` (solo un ícono, `aria-hidden`) **sin ningún nombre accesible**. Es exactamente el patrón que el Ciclo del 2026-08-31 corrigió en ese mismo archivo — arregló el `<input>` de descripción y dejó los otros tres de la misma fila | Media (accesibilidad) | **Resuelto** | 3 `aria-label` agregados (solo atributos, sin cambio visual). Mecanismo: regla `boton-icono-sin-nombre` en `patrones-ui.mjs` |
| CC-05 | 11 radios escritos a mano que coincidían **exactamente** con un paso de la escala (`6px`→`--radius-sm`, `8px`→`--radius-md`, `999px`→`--radius-pill`) en 9 archivos | Baja | **Resuelto** | Migrados. Sustitución visualmente nula por construcción |
| CC-06 | 4 radios **fuera** de la escala (10px ×2, 20px, 4px). Resolverlos cambia el render | Baja | **Decisión pendiente** | `DECISIONES_PENDIENTES` en `literales-vs-tokens.mjs`, con evidencia y la decisión a tomar |
| CC-07 | **14px es uno de los valores de espaciado más usados del árbol (~55 veces) y no tiene paso en la escala** (salta de `space-6` 12px a `space-7` 16px). O a la escala le falta un paso, o esos usos deben normalizarse: insertar rompe la numeración correlativa 1..12, normalizar cambia el render en 55 sitios | Media (propiedad del sistema) | **Decisión pendiente** | `PENDIENTES_DE_SISTEMA` en `literales-vs-tokens.mjs` + `GOBERNANZA-DISENO.md` §4 |
| CC-08 | `--color-whatsapp-text: #072E2A` es el verde petróleo de la marca RETIRADA, y su comentario lo justifica como "mismo verde petróleo de marca" — una marca que ya no existe. El color funciona (contraste verificado); lo caducado es su razón | Baja | **Decisión pendiente** | `PENDIENTES_DE_SISTEMA`. No se tocó: cambiarlo altera el render del botón |
| CC-09 | **Ninguno de los 215 tests renderizaba un componente.** `vitest.config.js` corría en `environment: 'node'`; sin Playwright, Cypress, Storybook, `@vue/test-utils`, jsdom ni happy-dom. Que la suite pasara no decía nada sobre la interfaz | Media (hueco de cobertura) | **Resuelto en parte** | Ver CC-10. La primera versión de este ciclo lo descartó entero por necesitar secrets; eso mezclaba dos problemas distintos y era un error de análisis |
| CC-10 | **Corrección del propio CC-09**: "validación visual" son dos cosas con viabilidad opuesta. La **captura en navegador** de pantallas autenticadas sí necesita servidor + backend + sesión, y sigue bloqueada por los mismos secrets que tienen a `test-integration` en rojo. El **render de componentes** no necesita nada de eso, y se descartó por arrastre | Media | **Resuelto** | `@vue/test-utils` + `happy-dom` (0 vulnerabilidades) y `frontend/tests/componentes/` — 40 tests, 3 archivos. Entorno pedido **por archivo** (`// @vitest-environment happy-dom`) para no imponer un DOM a los 215 tests de lógica pura. Suite: 215 → **255**. Verificado por mutación: quitar `aria-modal` de `Modal.vue` hace fallar su test; restaurarlo lo devuelve a verde |

**Mecanismos que quedaron corriendo** (lo que este ciclo entrega, más allá de
los hallazgos):

- `scripts/literales-vs-tokens.mjs` — valores a mano que deberían ser token.
  Dos regímenes según lo que el árbol aguanta: **estricto** (0 exigido) en
  color/radio/sombra/tipografía/marca-retirada, y **trinquete** en espaciado
  (línea base en `scripts/literales-base.json`, falla solo si SUBE). Distingue
  literal legítimo de literal-que-es-regla mediante `EXCEPCIONES` con formato
  obligatorio motivo/alcance/impacto (6 declaradas).
- `scripts/patrones-ui.mjs` — 3 invariantes de marcado, las tres en verde: son
  trinquete contra la regresión, no cazador de bugs. Protegen el hallazgo más
  caro del Ciclo del 2026-08-31 (7 archivos con modales hechos a mano).
- Check **REFERENCIA ROTA** en `tokens-vs-guia.mjs` — resuelve contra los
  tokens definidos en cualquier archivo, no solo `main.css`, porque las custom
  properties heredan por el DOM (los `--sb-*` que declara `AppLayout` y consume
  `AppNav` son legítimos y no deben reportarse).
- `docs/GOBERNANZA-DISENO.md` — matriz de fuente de verdad / implementación /
  validación, los tres regímenes, la política de excepciones y **qué NO está
  verificado y por qué**.

**Adopción de la escala de espaciado, arrancada**: `components/shared/`
migrado (61 declaraciones, 12 componentes; 541 → 480 literales). Criterio:
solo declaraciones donde TODOS los px coinciden exactamente con un paso; los
12 pasos se verificaron contra `main.css` antes de escribir, así que la
sustitución es visualmente nula por construcción.

**Preservación del trabajo en vuelo**: el árbol tenía 139 entradas sin
commitear de trabajo previo. Se separaron por mtime (lo propio ≥16:22, lo
previo ≤15:26) y se verificó la marca de tiempo antes de cada edición.
`main.css` se tocó **dos veces y de forma quirúrgica** (alias faltante de
CC-01, token de CC-02), ambas con razón técnica concreta.

## Ciclo 18 — Colapso del Frankenstein (2026-09-01)

Origen: observación del JEFE, que diseñó la plataforma. *"Llega un punto donde
ya no queda igual y se necesita mejorar la UI/UX... se creó tokens, se tiene
documentación, pero llega un momento donde esa información también se
convierte en un Frankenstein."*

No era una impresión. Los tres hallazgos de abajo son la medición de esa
frase, y el tercero lo empeoró esta misma serie de sesiones.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| FK-01 | **Dos nomenclaturas paralelas para los mismos conceptos**: 104 tokens `--mat-*` con el valor + 86 alias sin prefijo, de los cuales **76 eran puro puente** (`--color-x: var(--mat-color-x)`) — 190 tokens para 104 conceptos. Y `main.css` marcaba la capa sin prefijo como *"alias legacy, no usar en código nuevo"* mientras el código la usaba el **86% de las veces** (1258 usos contra 208). El sistema declaraba una cosa y hacía la contraria, 6 a 1 | **Alta** (todo el que toca el código elige entre dos nombres correctos) | **Resuelto** | Colapsado a **un nombre por concepto**: 76 puentes borrados, prefijo `--mat-` retirado de 532 ocurrencias en 32 archivos. **Verificado token por token**: los 114 resultantes resuelven al MISMO valor en claro y en oscuro, 0 diferencias. Efecto colateral: los tokens sin documentar en la guía cayeron de 101 a 43 — la mitad del problema era documentar dos nombres para lo mismo |
| FK-02 | **La guía era un changelog disfrazado de referencia.** 536 de sus 2 335 líneas eran ocho apartados consecutivos ("tercera pasada", "cuarta pasada"… hasta "Shell único") narrando **cómo se llegó** al estado de los filtros de Tickets. Para responder "¿cómo funcionan hoy?" había que leer los ocho y deducir, y varios se contradecían porque el posterior superaba al anterior sin decirlo. Esa narración **ya vivía completa** en `CHANGELOG.md`, que hasta apunta de vuelta a cada sección de la guía | **Alta** (es el mecanismo detrás de DR-01..DR-09 y de todo el Ciclo 16) | **Resuelto** | 536 líneas → **78**: una sola sección de estado vigente, escrita **contra `TicketsView.vue`**, no contra los relatos. La guía pasó de 2 335 a 1 877 líneas. La historia queda donde corresponde |
| FK-03 | **Vocabulario retirado, todavía en la guía**: el modo de vista se renombró de "Isla" a "Triage" en ago 2026 y el código no conserva rastro del nombre viejo, pero la guía seguía diciendo "Isla" en 15 lugares — incluida la explicación de cómo alternar entre modos | Media | **Resuelto** | Unificado a "Triage". La metáfora visual ("las tres islas", "fondo island") se conserva: describe la forma, no el modo |
| FK-04 | **La misma columna, escrita de dos formas según el módulo**: 7 tablas con la cabecera de acciones oculta (`<span class="sr-only">`) y 7 con ella visible. La regla del sistema ("Reglas de tabla", ago 2026) decía texto visible y **nombraba** los módulos a corregir; la ronda solo llegó a Empleados. Es la deriva del Ciclo 16 en su forma más visible: la guía afirmaba un arreglo que el código no tenía | Media (visible para el usuario) | **Resuelto** | Las 7 corregidas, más una que ningún repaso había mirado (`ImportarEquiposView`, columna "Migrar"). Las 14 tablas del sistema coinciden |
| FK-05 | **Autocrítica**: la migración de espaciado del Ciclo 17 usó `var(--mat-space-N)` en archivos que consumían `--color-*` en todo lo demás — metió una **tercera** forma de nombrar en vez de dos. El colapso de FK-01 lo resuelve de paso | Baja | **Resuelto** | — |

**Mecanismos nuevos** (para que ninguno de los cuatro pueda volver):

- **CAPA DUPLICADA** (`tokens-vs-guia.mjs`) — falla el build si reaparece un
  token cuyo nombre es otro más un prefijo y cuyo valor es solo `var()` del
  otro. **No** confunde esto con un alias semántico legítimo
  (`--color-accent: var(--color-brand-600)`): ahí los dos nombres dicen cosas
  distintas —un rol y un valor de escala—, y esa indirección es justamente
  para lo que sirve un design system. Solo reporta el prefijo pegado delante.
- **`th-sin-texto-visible`** (`patrones-ui.mjs`, 4.ª regla) — falla si un
  `<th>` no muestra texto al usuario. Se verificó por mutación **y la primera
  versión del check estaba mal**: quitaba las etiquetas y el texto del
  `sr-only` seguía contando como visible, así que no detectaba nada. Corregido
  y re-verificado; al hacerlo encontró el caso de `ImportarEquiposView` que el
  grep manual había perdido.

**Método, para no repetir el error de origen**: la sección nueva de Tickets se
escribió leyendo `TicketsView.vue`, no sintetizando los ocho relatos. Un relato
describe el estado del día en que se escribió; el código describe el de hoy.

## Ciclo 19 — Adopción de IBM Carbon v11 y reconciliación (2026-09-02)

Origen: decisión de producto del JEFE. El sistema nació como panel de
credenciales, creció a ITSM y la dirección es ERP; el sistema visual propio
—estética tipo shadcn, acento muestreado del logo, radios de 6-16px, sombras
de elevación, tipografía Geist, 8 pasos de escala tipográfica— se sustituyó
completo por **IBM Carbon Design System v11**, el design system de IBM para
software empresarial denso. Ver `PANORAMA-SISTEMA.md` §6 para el argumento y
`GUIA-UX-UI.md`, "IBM Carbon v11 como estándar de UI/UX", para el criterio.

Este ciclo registra **dos cosas distintas**: lo que la adopción encontró y
arregló, y lo que la adopción misma dejó roto y hubo que cerrar al día
siguiente. La segunda parte es la que importa para el método.

### Lo que la adopción encontró

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| CB-01 | **`scripts/contraste.mjs` no fallaba nunca.** Imprimía "Total fallas: N" y salía con **código 0 siempre** — no tenía `process.exit`. El paso de CI "Contraste WCAG de los tokens de UI" venía pasando en verde desde que existe, incluso con pares por debajo del umbral. El umbral estaba medido y documentado, pero **no era exigible**: exactamente el modo de fallo que `tokens-vs-guia.mjs` se creó para cerrar, en el guardrail de al lado | **Alta** (un guardrail que no falla es peor que no tenerlo: da confianza falsa) | **Resuelto** | `process.exit(total > 0 ? 1 : 0)`. Se pudo encender ahora porque las 4 tablas quedaron en verde con margen: **5.8-7.8:1** en las semánticas, contra 4.6-5.3:1 del sistema anterior — los pares de Carbon vienen verificados de origen. Encenderlo antes habría exigido arreglar el sistema viejo primero |
| CB-02 | **Márgenes de contraste al límite en el sistema anterior.** Varios pares pasaban AA por 0.1-0.3, y al menos uno (`--color-text-tertiary` en oscuro) se había tenido que recalcular *durante* su propia migración porque el valor planeado fallaba | Media | **Resuelto** | Los pares de Carbon suben el piso. Cierra **U-01** y **DP-08** (ver reconciliación abajo) |
| CB-03 | **La escala tipográfica tenía 8 pasos donde Carbon tiene 5** (11/12/13/14/15/17/20/26 contra 12/14/16/20/32). Mantener los ocho habría dejado **tres pares de tokens con el mismo valor**, o sea tres veces el problema que FK-01 acababa de cerrar | Media | **Resuelto** | Comprimida a los 5 pasos del type set productivo, con los nombres de Carbon. 557 renombres de token en 67 archivos. Igual la de íconos: 7 pasos → 3 |
| CB-04 | **Cuatro copias del patrón de revelado de credenciales**, y **ninguna de las cuatro ocultaba la credencial sola.** Una vez revelada quedaba en pantalla hasta que alguien volviera a hacer clic o recargara — en un panel que se usa compartiendo pantalla con el empleado al que se le entrega la cuenta | **Alta** (seguridad operativa, no estética) | **Resuelto** | `components/carbon/CarbonPasswordReveal.vue`: cuenta regresiva visible de 8 s, ocultado automático, se oculta también al cambiar de pestaña (`visibilitychange`) y al desmontarse, y borra el valor del estado en vez de solo dejar de mostrarlo. Copiar pide su **propio** revelado con motivo `'copiar'`, para que `accesos_log` distinga quién miró de quién se llevó |
| CB-05 | **Tuteo en un aviso de permisos** (`AccesosSensiblesView`: "No tienes permiso para ver esta credencial"), contra la regla de copy impersonal del proyecto | Baja | **Resuelto** | Reescrito a "Sin permiso para ver esta credencial". El resto de UX6-01 sigue abierto |
| CB-10 | **El botón primario tenía texto casi negro en tema oscuro.** `.btn-primary` usaba `--color-text-inverse` (que cambia con el tema) sobre `--color-accent` (que **no** cambia): en oscuro renderizaba `#161616` sobre `#0f62fe` — **3.41:1, por debajo de AA**. Mismo bug en el contador del SideNav y en el de la campana. Es anterior a Carbon (con el azul viejo daba 3.1:1) y **el proyecto ya lo había diagnosticado una vez**: los dos `#fff` literales de `.btn-danger` eran el parche puntual, con este mismo razonamiento escrito al lado, y nunca se generalizó. `contraste.mjs` no lo veía porque el par vivía en la tabla del tema claro afirmando el blanco que se **asumía**, no el que el CSS producía | **Alta** (el botón primario de toda la app, en un tema completo) | **Resuelto** | Carbon separa los dos roles y este sistema los tenía en uno: se agrega **`--color-text-on-color`** (blanco en todos los temas, para texto sobre relleno de color sólido) y `--color-text-inverse` queda con su rol real (texto sobre gris invertido — su primer consumidor será `CarbonContentSwitcher`, hasta entonces en `DEUDA_DECLARADA`). Los 2 literales `#fff` pasan al token. Corrección estructural en el guardrail: tabla propia **`TEXTO SOBRE RELLENO SÓLIDO`**, que declara que el par no depende del tema. **Verificado en navegador**: 5.00:1 en claro y en oscuro |

### Lo que la adopción rompió, y se cerró el 2026-09-02

Autocrítica. Los cuatro son del mismo tipo: **el rediseño tocó lo canónico y
dejó atrás las copias**, que es el mecanismo que este historial documenta
desde el Ciclo 16 (DR-01…DR-09) y que FK-02 ya había nombrado.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| CB-06 | **Dos componentes nuevos con 0 importadores.** `CarbonTag.vue` y `CarbonDataTable.vue` se escribieron, se documentaron y se testearon, y no se cablearon a nada. Eran código muerto con test | Media (código muerto que la documentación presenta como vigente) | **Resuelto** parcial | `CarbonTag` pasa a ser el motor de `BadgeEstado.vue` (15 importadores). `CarbonDataTable` sigue sin consumidor: se cablea en la Fase C1 del plan de convergencia, cuando absorba también el render móvil |
| CB-07 | **La sección `## Resumen` de la guía describía el sistema retirado**: "CSS custom estilo shadcn", `#0064E0`, "Geist", "sombra discreta solo en card clicable/dropdown/modal" — un día después de que nada de eso existiera. Es la **tercera** vez que esa misma sección se queda atrás (ya se había corregido el 2026-08-28) | Media | **Resuelto** | Reescrita como tabla de estado, con una advertencia explícita dentro de la sección: ningún guardrail la cubre, porque `tokens-vs-guia.mjs` compara nombres de token y el resumen habla en prosa |
| CB-08 | **Contradicción interna en la guía**: "Selección visible de fila y tarjeta" decía que el inset de 2px seguía "pendiente de confirmación del JEFE" y "no se resolvió esa tensión acá", mientras la sección de principios del **mismo documento** lo declaraba resuelto el 2026-09-01 | Media | **Resuelto** | Corregida, con el rastro de qué decía antes |
| CB-09 | **`.badge-inline`: clase emitida y no definida.** `BadgeEstado.vue` la emitía por un prop, y la clase estaba definida en **4 hojas scoped idénticas** mientras 8 archivos la aplicaban — o sea que en los otros 4 (`TicketComentarios`, `TicketDetalleView`, `TicketsView` y el propio `BadgeEstado`) **no hacía nada**. Además el prop `inline` que la disparaba no lo usaba ningún consumidor. No lo introdujo Carbon: llevaba meses así, y lo encontró el guardrail nuevo | Media (invisible por definición: el efecto de una clase inexistente es que no pasa nada) | **Resuelto** | Consolidada en `main.css`, 4 copias scoped retiradas, prop `inline` eliminado |
### Mecanismos nuevos

- **`scripts/clases-muertas.mjs`** (5.º guardrail). Los otros cuatro miran
  tokens (valores y nombres), literales y estructura del marcado; ninguno
  miraba las **clases**. Reporta dos cosas con criterios distintos a
  propósito:
  - **HUÉRFANA** — clase aplicada que ninguna hoja define. **Falla el
    build**, se exige 0. Es un bug, y de los peores de detectar: su efecto
    es que no pasa nada, indistinguible de "así se diseñó" (CB-09).
    Encontró 7 casos más de markup muerto además de `.badge-inline`.
  - **MUERTA** — clase definida que nadie aplica. **Inventario, no falla**, y
    la asimetría es deliberada: durante la convergencia a Carbon las muertas
    van a *subir*, porque cada módulo que adopta `components/carbon/` deja
    atrás su familia vieja de `main.css` hasta que la Fase D la borre. Un
    trinquete "solo puede bajar" bloquearía justo el trabajo planificado.
    Estado inicial: **93**, que es la lista de trabajo de esa fase.

  Nota de método: la primera versión del check reportaba **429** hallazgos, y
  la mayoría eran falsos positivos por tratar el valor de un `:class` como
  una lista de clases cuando es una **expresión de JavaScript**
  (`altaPendiente`, `JEFE`, `false` y los literales de comparación de
  `campoInvalido === 'codigo'` entraban como clases). Se corrigió a un
  parser consciente de las dos sintaxis, más dos reglas: exigir kebab-case en
  minúscula, y eximir las bases de BEM cuyo modificador sí existe. De paso
  apareció un bug propio: la primera regla dentro de un `@media` no se
  registraba como definida, así que todo lo que solo existe en un breakpoint
  se reportaba huérfano.

- **NO DOCUMENTADO pasa de aviso a falla** (`tokens-vs-guia.mjs`). Era la
  meta de la **Fase 2** del `PLAN-MAESTRO`: bajar a 0 los tokens vivos que la
  guía no menciona. Llegó a 0 con la reescritura de la guía (empezó en 55 el
  2026-09-02, y la Fase 2 la había medido en 101 antes del colapso de
  FK-01). Ahora se exige: mantenerlo en 0 cuesta una línea por token nuevo,
  volver a subirlo cuesta otra pasada de documentación completa.

- **`tokens-vs-guia.mjs` lee las dos capas de CSS.** La capa vendor
  (`--cds-*`) queda **fuera** de MUERTO y de CAPA DUPLICADA con el motivo
  escrito: una escala de color es completa por definición, y un rol que
  apunta a un valor de escala (`--color-accent` → `--cds-blue-60`) es la
  indirección para la que sirve un design system, no su duplicación. Dos
  nombres de **rol** para el mismo rol siguen fallando. Los pasos de la
  paleta sin mapear se reportan aparte, como inventario (PALETA VENDOR): 1.

### Reconciliación de filas obsoletas

El rediseño dejó sin objeto varias filas de este historial. Se marcan acá en
vez de editarlas en su ciclo, para no reescribir la historia:

| ID | Ciclo | Decía | Ahora |
|----|-------|-------|-------|
| **U-01** | Pendientes | `--color-text-tertiary` falla AA (2.54:1 claro) | **Cerrado.** Gray 60 en claro = **5.02:1**, Gray 40 en oscuro = **6.36:1**, los dos en `contraste.mjs` (`textoTerciario`) |
| **DP-08** | 3 | Dos arreglos en competencia para text-tertiary (`#697281` vs `#6B737E`), decisión de producto | **Cerrado sin decidir entre los dos**: gana el valor de Carbon, que no era ninguno de ellos |
| **CC-06** | 17 | 4 radios fuera de escala (10px ×2, 20px, 4px), decisión pendiente | **Cerrado.** La pregunta desapareció: hay **un** radio y vale 0. Los 4 normalizados |
| **CC-08** | 17 | `--color-whatsapp-text` justificado por una marca retirada | **Cerrado.** Reescrita la justificación (marca externa de un tercero, contraste 7.39:1 verificado). Ya no está en `PENDIENTES_DE_SISTEMA` |
| **UX5-11** | 5 | px tipográficos sueltos sin token exacto (28/22/12.5/13.5/11.5) | **Superado.** El type set de 5 pasos no tiene esos valores; el guardrail de literales exige 0 en tipografía y está en verde |
| **UX6-10** | 14 | `DashboardView` abandonó la grilla de 12 columnas sin documentarlo | **Cerrado.** Hoy usa `.grid-12` en 4 lugares y la guía tiene sección propia |
| **UX6-05** | 14 | Header "Acciones" en `sr-only` en 6 paneles | **Cerrado** por FK-04 (Ciclo 18): las 14 tablas coinciden y `patrones-ui.mjs` tiene la regla en verde |
| **UX6-06** | 14 | Falta el patrón tabla→tarjetas en los 6 paneles de Configuración | **Cerrado.** Medido: los 6 tienen `lista-tarjetas` (18-33 líneas cada uno) |
| **UX6-11** | 14 | Sombra inerte en `.panel-lista`/`.stat-card` | **Sin objeto.** La elevación es plana; queda una sola sombra y solo para capas teletransportadas. El otro punto de la fila (filtro "Situación" sin default) **sigue abierto** |
| **§4 de `GOBERNANZA`** | — | "Hoy hay 6 decisiones pendientes" | **Corregido a 1** (espaciado de 14px). Las otras 5 se resolvieron o quedaron sin objeto |

**Sigue abierto y este ciclo no lo tocó**: `CC-07` (espaciado de 14px, ~55
usos, decisión de producto reservada al JEFE por `PLAN-MAESTRO` §10),
`UX6-01`/`UX6-02` (tuteo en ~16 archivos y el string de `ConfirmDialog` en 8
formularios), `UX6-04` (botones de ícono sin `aria-label` en 7 vistas),
`UX6-07` (`CuentasPanel` sin consolidar acciones), `UX6-09` (bolsa de
hallazgos puntuales), `DR-05`/`DR-06`/`DP-05` (escala de espaciado y tokens
huérfanos), `ARQ-09`/`ARQ-13`/`ARQ-20`/`ARQ-21`, `A-03`, `U-05`, y los dos
pendientes de §18/§19. La Fase C del plan de convergencia los toca por
módulo, no en una pasada aparte.

### Límite de verificación, dicho explícitamente

El shell autenticado y los módulos **no se verificaron visualmente**. Lo que
sí se verificó en navegador, sobre el dev server: que los 197 tokens
resuelven, que no queda ni un radio distinto de 0 ni de 50%, que IBM Plex
carga, y el tema Gray 100 completo — todo sobre `/login`, la única ruta
alcanzable sin sesión de staff. La captura en navegador sigue bloqueada por
los secrets de CI (`GOBERNANZA-DISENO.md` §5, Fase 7b del `PLAN-MAESTRO`), y
`happy-dom` no calcula estilos. **Cada ola de la Fase C necesita una pasada
visual humana** mientras eso siga así.

## Ciclo — Inventario de archivos (2026-08-11)

> Fusionado desde `docs/INVENTARIO-ARCHIVOS.md` en la reorganización de
> documentación de 2026-08-29 (ver `docs/CHANGELOG.md`). Fuera de secuencia
> numérica a propósito — no se renumeraron los ciclos existentes para no
> romper las referencias cruzadas ya escritas en este documento.

Alcance: qué archivos del repo servían, cuáles eran redundantes/sin uso (y se
limpiaron) y qué faltaba por crear. Verificado contra el código real por 3
barridos de solo-lectura, no de memoria.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| INV-01 | `sistema_credenciales_ti.html.bak` — prototipo HTML monolítico pre-Vue (38 KB), sin ninguna referencia funcional en el repo | Baja | **Resuelto** | `git rm` |
| INV-02 | `.vite/deps/_metadata.json`/`package.json` — caché de Vite trackeado por error | Baja | **Resuelto** | Destrackeado (`git rm --cached`) + `.vite/` agregado a `.gitignore` |
| INV-03 | 5 reglas CSS muertas en `main.css` (`.toolbar-actions`, 4 variantes de `.stat-icon`) sin ningún uso en `frontend/src/**` | Baja | **Resuelto** | Borradas |
| INV-04 | Comentario obsoleto en `CorreosView.vue:419` apuntando a clases (`.badge-libre`/`.badge-rotar`) ya eliminadas de `main.css` | Info | **Resuelto** | Eliminado |
| INV-05 | `docs/GUIA-UX-UI.md` listaba como "definidas pero sin uso" varias clases (`.cred-card`, `.tool-tag`/`.tool-input`, `.user-cell`, `.detail-header`/`.detail-grid`/`.detail-item`, badges antiguos) que en realidad ya no existían en absoluto — y clasificaba mal `.modal-detail` como sin uso, cuando sí tiene consumidores reales | Info | **Resuelto** | Corregido en `docs/GUIA-UX-UI.md` |

**Confirmado en uso, no tocar** (verificado por grep, no por suposición): 66
componentes `.vue` con ≥1 consumidor cada uno (cero huérfanos), todos los
`.js` de `api/domains/`/`core/`/`composables/` con al menos un importador,
las 6 `dependencies` de `frontend/package.json`, los 3 scripts de `scripts/`
(todos referenciados desde `ci.yml`/`README.md`/`AGENTS.md`),
`sistema_credenciales_ti.html` (sin `.bak` — no es legado, es un redirect
intencional a `./frontend/`).

**Gaps de ingeniería/proceso detectados en este ciclo** (no eran "borrar
algo" — ya están registrados con su propio ID en este documento, sin
duplicar acá): Q-06 (sin tests para `encuestas.ts`; la parte de
`personal-registro.ts` se cerró por retiro del módulo, migración 084),
W-06 (sin changelog de producto ni plantillas de PR/issue — este segundo
punto se cerró el 2026-08-16, ver W-01/A-05 arriba).

## Ciclo — Revisión de `design.pen` (2026-08-13)

> Fusionado desde `PROPUESTA-UX-UI.md` (raíz del repo) en la reorganización
> de documentación de 2026-08-29. Ejercicio de diseño puro: cero cambios en
> `frontend/`, solo en `design.pen` y en este historial. Fuera de secuencia
> numérica, mismo motivo que el ciclo anterior.

Alcance: revisión completa de los 46 componentes reusables de `design.pen`
(heurísticas de Nielsen, Ley de Fitts/Hick, separación Foundations →
Components → Patterns). 7 cambios implementados directo en `design.pen`,
verificados con captura antes/después; regla de no-duplicación aplicada
contra lo ya diagnosticado en DS-01 a DS-05, U-01/U-02 y la propuesta de
paleta dot-notation.

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| DP-01 | `Barra lateral` (891px, mockup completo del sidebar) mezclada en la misma fila que 3 átomos de 67-332px en la sección "Navegación y marca" — rompe el escaneo visual, un átomo y una plantilla de página no son pares comparables | Bajo (solo `design.pen`) | **Resuelto** | `design.pen` — movida a su propia fila |
| DP-02 | `Fila skeleton` (520×37px, 4 columnas, sin avatar) no coincidía con `Fila de tabla` real (800×73px, 5 columnas, avatar + 2 botones) — el layout salta ~2× al cargar, viola "Visibility of system status" | Bajo (solo `design.pen`) | **Resuelto** | `design.pen` — `Fila skeleton` rehecha 1:1 contra el contenido real |
| DP-03 | `Badge estado` no compartía baseline con `Badge` (21px vs. 17px de alto) por 4px extra de padding vertical no justificados por el punto de color | Bajo (solo `design.pen`) | **Resuelto** | `design.pen` — padding igualado a `Badge` |
| DP-04 | `$radius-md` de `design.pen` (8px) no coincidía con la escala real documentada en `docs/GUIA-UX-UI.md` (`sm 6 · md 10 · lg 14 · xl 20 · pill 999`); `$radius-xl` no existía como variable | Bajo (solo `design.pen`) | **Resuelto** | `design.pen` — `radius-md` a 10px, `radius-xl` agregado (20px) |
| DP-05 | Decisión tácita e indocumentada: la propuesta de paleta dot-notation ya resolvía `categoric.indigo` como reemplazo de `teal` y `categoric.slate` de `neutral` categórico, dejando 3 huérfanos reales (`amber`/`terracotta`/`rose`) sin ningún consumidor — nadie que lea `GUIA-UX-UI.md` se entera | Bajo (documentación) | **Anotado, no ejecutado** | `context` agregado en el frame de `design.pen`; el retiro real de tokens sigue siendo decisión de producto pendiente (mismo pendiente ya marcado en `GUIA-UX-UI.md` para la migración de paleta) |
| DP-06 | Bloque completo (656px) en `design.pen` seguía describiendo la "Propuesta de reestructuración del sidebar" como pendiente, pese a que ya se aprobó y llegó a producción (`AppNav.vue`, ver changelog "Sidebar reagrupado a producción") — información caduca en el archivo de diseño vivo | Bajo (documentación) | **Resuelto** | `design.pen` — bloque eliminado |
| DP-07 | **Choque real, verificado en código** (`CuentasPanel.vue:225-231`): `.btn.btn-whatsapp` ("Enviar por WhatsApp") se renderiza al lado de `.btn.btn-primary` ("Agregar cuenta"), ambos sólidos y verdes, en el mismo `.panel-actions` — viola la regla propia del sistema ("un solo acento visible por vista"). Hallazgo adicional en el mismo lugar: el color de `.btn-whatsapp` está hardcodeado (`#25d366`/`#1ebe5d`) en el `<style>` scoped de `CuentasPanel.vue` en vez de usar `var(--color-whatsapp)`, que ya existe en `main.css` desde U-03/U-04 — dos fuentes de verdad para el mismo color | Media (código de producción) | **Resuelto** | El hardcode de color ya estaba corregido antes de esta verificación (2026-08-29): la regla local de `CuentasPanel.vue` solo ajusta `font-size`/`padding`, con un comentario explícito de no tocar background/color — usa la clase global `.btn-whatsapp` de `main.css` sin excepción. El choque de acentos se cerró en la pasada de diseño de Empleados (ago 2026, ver `docs/CHANGELOG.md`): "Agregar cuenta" bajó de `.btn-primary` a `.btn` — no por este hallazgo puntual, sino por uno más amplio (competía también con "Reactivar" del header en `EmpleadoDetalleView.vue`), pero el efecto cierra los dos a la vez: ya no hay dos botones sólidos de acento en `.panel-actions` |
| DP-08 | Tensión sin resolver entre dos valores propuestos para `text.tertiary`: U-01 (arriba) propone `#697281` (claro, ~4.53:1); la paleta dot-notation de `design.pen` usa `#6B737E` (~4.5:1 contra su propio `$bg`, justo en el límite de AA sin margen) — dos arreglos distintos para el mismo problema ya diagnosticado | Igual severidad que U-01 | **Abierto, sin resolver — decisión de producto** | Elegir uno requiere tocar `main.css`; no es una corrección de `design.pen` en solitario. Ver U-01 arriba |

**Qué no se tocó y por qué** (documentado en `design.pen`/este historial, no
ejecutado en esta pasada): escala tipográfica sin ratio consistente (token
consumido por los 46 componentes, requiere pasada dedicada); reducción de 8
familias categóricas a las 4 con uso real (decisión de producto ya abierta,
ver DP-05); los 12 tokens de Marca/Acento casi duplicados en producción
(viven en `main.css`, fuera de alcance de un ejercicio "cero cambios en
`frontend/`"); orden de tabulación entre secciones (no verificable desde un
archivo de diseño, requiere leer el DOM real); token muerto
`text.on-accent-soft` (mismo patrón ya señalado para otros 6 tokens sin
consumidor en `GUIA-UX-UI.md`, limpieza aparte).

## Cómo mantener esto al día

Cuando se cierre un hallazgo (código o config), actualizar su fila de
**Estado** aquí en el mismo cambio — no esperar a otro ciclo de auditoría
completo. Si aparece un hallazgo nuevo fuera de un ciclo formal, agregarlo a
la tabla correspondiente con su fecha de detección en la columna
Referencia. Ver la regla general de documentación en `AGENTS.md`.
