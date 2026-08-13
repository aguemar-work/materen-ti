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
| H-06 | UPDATE sin `WITH CHECK` (columnas editables sin control) | Baja/Media | **Corregido (solo tickets)** | Migración 019 congela `token`/`codigo`/`origen`/`creado_por`. Control general por columna en el resto de tablas: no implementado (ver S-03 del ciclo 2) |
| H-07 | Interpolación del término de búsqueda en filtro PostgREST | Baja | **Corregido** | `api/sanitizar.js` |
| H-08 | DNI (8 dígitos) expone tokens de seguimiento de tickets activos | Baja/Media | **Aceptado** | Decisión de producto (2026-07-07): se mantiene el comportamiento |
| H-09 | `@insforge/sdk` en `"latest"` sin fijar | Baja | **Corregido** | `package.json`: fijado a `^1.4.0` |
| H-10 | Passthrough de texto plano histórico en contraseñas | Baja | **Cerrado sin acción** | Verificado 2026-07-07: 0 filas en claro fuera de `enc2:`/`enc:` |
| H-11 | `.env.local` residual (plantilla Next.js sin uso) | Info | **Corregido** | Archivo eliminado |

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
| Q-01 | Tests de integración/BD dan check verde sin ejecutarse | QA | **Mitigado** | `ci.yml` ya no hace `exit 0` silencioso: emite `::warning::` visible. Los 4 secrets (`INSFORGE_TEST_STAFF_EMAIL/PASSWORD`, `INSFORGE_ACCESS_TOKEN`, `INSFORGE_PROJECT_ID`) **siguen sin existir** en el repo — los jobs siguen sin verificar nada, ya no lo esconden |
| A-01 | Bajas de empleado sin atomicidad (4 escrituras secuenciales) | Arquitectura | **Resuelto** | Migración 038: RPC `dar_baja_empleado()` `SECURITY DEFINER`, una sola transacción |
| D-01 | Cero observabilidad de producción (sin Sentry/errores) | DevOps | **Resuelto** (2026-08-13) — `@sentry/vue` instalado e inicializado en `main.js` (solo `PROD` + `VITE_SENTRY_DSN`; `window.onerror`/`unhandledrejection` los captura el SDK por defecto — confirmado `defaultIntegrations` no se desactiva con `integrations: []`, solo se le agregan cero integraciones extra, ver `node_modules/@sentry/core/build/types/types/options.d.ts`). Sin Session Replay/`browserTracingIntegration`/`enableLogs` (no estaban en el plan aprobado — la app maneja DNI/credenciales). DSN real configurado por el usuario en `frontend/.env` (gitignorado) y host de ingesta agregado al `connect-src` de ambos `vercel.json`. Verificado de punta a punta con `npm run build` + `npm run preview` + Playwright: 0 violaciones de CSP, el evento de error de prueba llegó a Sentry (`200`, con event ID real) | `main.js`, `frontend/.env`, `vercel.json` (×2), `docs/CHANGELOG.md` |
| U-01 | Texto terciario a 2,54:1 (falla WCAG AA), prescrito por la guía de diseño | UX | **Abierto** — ampliado 2026-08-12: en oscuro tampoco alcanza AA para texto normal (3,68:1–3,91:1, solo cumple el umbral de texto grande 3:1). Fix (a) propuesto, mismo nombre de token, mismo tono neutro (no el gris con tinte verde de la propuesta de paleta de `design.pen`, que es un cambio aparte): `--mat-color-text-tertiary: #697281` en claro (4,53:1/4,86:1) y `#747C8B` en oscuro (4,50:1/4,23:1 — bg-elevated queda justo debajo de 4.5, aceptable por ser 0,27 el margen y no texto de cuerpo largo, pero anotarlo) | `--mat-color-text-tertiary: #9CA3AF` sin cambios, `main.css:48` (claro) y `main.css:212` (oscuro) |
| S-03 / T-02 | Sin `CHECK` de prefijo de cifrado en columnas de contraseña | Seguridad/Datos | **Abierto** | Revisadas migraciones 001–053: ningún `CHECK` sobre columnas de contraseña/clave |
| P-01 | Dashboard cuenta filas descargando todas | Performance | **Resuelto** (2026-08-13) | `api/domains/dashboard.js` `getEstadisticas()` — 6 de 7 queries pasan a `.select('id', { count: 'exact', head: true })` (patrón ya usado en `licencias.js`/`correos.js`/`tickets.js`/`equipos.js`/`kb.js`/`problemas.js`/`personalRegistros.js`/`empleados.js`, sin `head` porque ahí también necesitan las filas); leen `res.count` en vez de `res.data.length`. La 7ª (`empleados`) sigue trayendo filas porque necesita `estado` por fila para separar activos/total — ya era una consulta angosta (2 columnas, sin joins) |
| Q-04 | `functions/*.ts` nunca se compilan; sin linter/tsconfig | QA | **Abierto** | Confirmado: no existe `eslint.config.*` ni `tsconfig*.json` en el repo |
| S-04 | Sin CSP/HSTS/anti-framing en Vercel | Seguridad | **Resuelto (2026-08-12, corregido el mismo día)** — `frontend/vercel.json` (y su copia `frontend/public/vercel.json`) agregan CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. **Incidente**: la primera versión de la CSP solo incluía `https://kjyj8t5t.us-east.insforge.app` en `connect-src`, y bloqueó el WebSocket del realtime (`wss://...`, socket.io) en cuanto se desplegó — justo el riesgo que ya se había anotado como "pendiente de validar en preview". Corregido agregando el esquema `wss://` explícito al mismo host en `connect-src`. Lección: `https://` en `connect-src` no cubre `wss://` de forma confiable en la práctica, aunque el spec de CSP3 diga que debería |
| W-01 / W-02 | `AGENTS.md` decía "sin tests"; README omitía 10 migraciones | Documentación | **Resuelto** | Corregido en el propio ciclo 2026-08-05, reconfirmado hoy |
| T-05 | **Bug en producción (detectado y resuelto 2026-08-12)**: crear un ticket, una cuenta, o dar de alta/baja a un empleado fallaba con 500 (`function crear_notificacion(...) is not unique`) | Datos | **Resuelto** | La migración 048 agregó un 6º parámetro opcional a `crear_notificacion()` vía `create or replace function` esperando que reemplazara la versión de 5 argumentos de la 045 — pero un cambio de firma crea una sobrecarga nueva en Postgres, no reemplaza la vieja. Las 4 llamadas de 5 argumentos (045) quedaron ambiguas entre ambas desde que se aplicó la 048. Migración 054 elimina la sobrecarga vieja; reproducido y verificado el fix directo contra producción (insert de prueba, limpiado después) |

### Medio / Bajo

| ID | Hallazgo | Rol | Estado (2026-08-11) |
|----|----------|-----|----------------------|
| T-04 | Reporte de tickets sin cota de filas | Datos | **Abierto**, confirmado — `api/domains/reportesTickets.js:60-64,190-196,217-221` sin `.limit()`; `obtenerSatisfaccionConsolidado` trae todo el histórico |
| P-02 | Realtime recarga la bandeja completa en cada cambio | Performance | **Abierto**, confirmado — `AppLayout.vue:59-63` → `stores/tickets.js:24-34` (`cargar()`) repite la página completa en cada evento |
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
| A-05 / W-04 / Q-05 | Sin ADRs formales, sin CONTRIBUTING, sin registro de bugs | Varios | **Parcial** — este documento y `docs/CHANGELOG.md` cubren el registro de hallazgos/documentación; sigue sin existir `CONTRIBUTING.md` ni `docs/adr/` |
| T-03 | Sin backup verificado ni RPO declarado | Datos | No verificable desde el repo (requiere plan InsForge) |
| U-06 | Tablas móviles solo con scroll horizontal | UX | **Resuelto** — patrón `.lista-tarjetas` (`main.css:1348-1421`) ya implementado en 6 vistas |
| Q-06 | `functions/encuestas.ts` y `functions/personal-registro.ts` sin ningún test | QA | **Abierto** — a diferencia de `credenciales.ts`/`tickets.ts`, que sí tienen `.test.js` en `frontend/tests/` |
| W-06 | Sin changelog de producto (para soporte/usuarios) ni plantillas de PR/issue en `.github/` | Documentación/DevOps | **Abierto** (detectado 2026-08-11) — `docs/CHANGELOG.md` es explícitamente de documentación, no de producto; `.github/` solo tiene `ci.yml` |
| A-06 | `AppLayout.vue` es un god-component (1161 líneas): layout global, navegación, buscador y notificaciones realtime en un solo archivo, con hasta 4 niveles de anidamiento en el buscador (`AppLayout.vue:345-419`) y 3 en la navegación (`AppLayout.vue:425-442`) | Arquitectura | **Resuelto (2026-08-12)** — dividido en `AppSearch.vue`, `AppNav.vue` y `AppNotifications.vue`; `AppLayout.vue` baja a 517 líneas y queda solo como orquestador (socket realtime, drawer/colapso, tema, logout). Icono de aviso centralizado en `core/notificacionIconos.js` (antes duplicado con `NotificacionesCampana.vue`). Ojo con `:global()` en `<style scoped>`: en este proyecto pierde el selector descendiente al compilar (verificado en el CSS de `dist/`); las reglas `.sidebar--colapsado .sb-nav-item` etc. quedaron en un segundo `<style>` sin scope en cada componente hijo |
| A-07 | Duplicación conceptual de "encuesta": `modules/encuestas/*` (feature 043) y la lógica ad-hoc de `ticket_satisfaccion` (`api/domains/tickets.js:185-188`, `stores/ticketDetalle.js`, `ReporteSatisfaccionView.vue`) no comparten código ni modelo | Arquitectura | **Abierto** (detectado 2026-08-11) — no urgente, pero cada feature nueva de encuestas obliga a elegir entre los dos sistemas |
| D-07 | Alias CSS legacy marcados "no usar en código nuevo" (`main.css:127`, bloque `--color-*`/`--fs-*`) | DevOps | **Descartado (2026-08-12)** — no es código muerto: 677 usos en 53 archivos de `frontend/src` (verificado por grep). El comentario es una guía para código nuevo, no un candidato a eliminación; eliminarlos rompería la mayoría de las vistas |

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

### Deuda abierta — patrones sistémicos (afectan varios archivos)

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| UX4-07 | Sin patrón de tarjetas móviles (`.lista-tarjetas`) — solo scroll horizontal | Alto/Medio | Abierto | `LicenciasView.vue`, `AccesosSensiblesView.vue`, `PersonalRegistrosView.vue`, `StaffView.vue`, `KbView.vue`, `EncuestasView.vue`, `EncuestaDetalleView.vue` |
| UX4-08 | Botón mostrar/ocultar contraseña sin `aria-label` (solo `title`), inconsistente con "Generar contraseña" en el mismo formulario | Medio | Abierto | `CorreoForm.vue`, `LicenciaForm.vue` (×3), `AccesoSensibleForm.vue` |
| UX4-09 | Objetivos táctiles bajo 44px (varios por debajo incluso de 24px) | Medio | Abierto | `EquipoForm.vue` (quitar foto, 22px), `LicenciasView.vue` (liberar asiento), `AppNav.vue` `.sb-nav-titulo` (~22px), `AppLayout.vue`/`AppSearch.vue` `.sb-logout` (~39-41px), `PersonalRegistrosView.vue` `.btn-usado` (24px), `StaffView.vue` `.rol-select`, `ConfiguracionView.vue` tabs (gap&lt;8px), `TicketsView.vue` chips (36px), `PreguntaCampo.vue` escala (40px), `ResponderEncuestaView.vue` (gap 6px) |
| UX4-10 | Radios ocultos sin `:focus-visible` en tarjetas de tipo — navegar con teclado no muestra qué tarjeta está seleccionada | Alto (teclado) | Abierto | `CorreoForm.vue` (`.tipo-option`), `LicenciaForm.vue` (`.acceso-option`) |
| UX4-11 | Confirmación nativa del navegador (`confirm()`) en vez de `ConfirmDialog` para una acción sensible | Alto | Abierto | `StaffView.vue` (`toggleActivo`, desactivar staff) |
| UX4-12 | Formularios públicos sin `aria-live`/foco en el campo con error tras enviar | Alto | Abierto | `EncuestaPublicaView.vue`, `ResponderEncuestaView.vue`, `PersonalRegistroView.vue` |
| UX4-13 | Sin feedback de carga en acciones async — riesgo de doble envío | Medio | Abierto | `StaffView.vue` (`toggleActivo`/`cambiarRol`), `PersonalRegistrosView.vue` (`toggleUsado`), `LoginView.vue` (reenviar código sin confirmación visible) |
| UX4-14 | `aria-pressed`/`role="radiogroup"` ausente en toggles de selección única basados en `<button>` con solo cambio de color | Medio | Abierto | `PreguntaCampo.vue` (escala 1-5, sí/no), `PersonalRegistrosView.vue` (filtros toggle) |

### Deuda abierta — hallazgos puntuales

| ID | Hallazgo | Severidad | Estado | Referencia |
|----|----------|-----------|--------|------------|
| UX4-15 | Estado de error sin ninguna ruta de salida (ni enlace ni botón) — callejón sin salida en una página pública sin soporte | Alto | Abierto | `ResponderEncuestaView.vue:69-73` |
| UX4-16 | `.alta-banner` con `color-mix(..., #fff)` crudo en vez de un token theme-aware — casi blanco también en tema oscuro, bajo contraste con el texto secundario que trae | Alto | Abierto | `EmpleadoDetalleView.vue:495-500` |
| UX4-17 | Campana de notificaciones sin manejo de `Escape` (sí lo tiene el patrón equivalente `MenuAcciones.vue`) | Alto | Abierto | `NotificacionesCampana.vue:40-53` |
| UX4-18 | `.password-locked` (candado de contraseña solo-JEFE) sin nombre accesible propio, depende de `title` | Medio | Abierto | `CuentasPanel.vue:299` |
| UX4-19 | `role="status"` ausente en estado de carga de página pública con credenciales | Medio | Abierto | `EntregaView.vue:61-63` |
| UX4-20 | Sin botón "Reintentar" cuando falla la carga del catálogo (usuario público) | Medio | Abierto | `TicketNuevoView.vue:133-137` |
| UX4-21 | Error de campo sin `aria-describedby` hacia el `role="alert"` | Bajo | Abierto | `TicketNuevoView.vue:145-157`, `TicketBuscarView.vue:72-85` |
| UX4-22 | Asterisco de obligatorio inconsistente entre dos formularios equivalentes ("DNI" vs "DNI *") | Bajo | Abierto | `TicketBuscarView.vue:71-72` |
| UX4-23 | Indicadores de "Vínculos" (cuentas/equipos/licencias) sin `aria-label`, solo número + `title` | Medio | Abierto | `EmpleadosView.vue:251-273,339-349` |
| UX4-24 | Input de búsqueda sin `<label>`/`aria-label` propio | Medio | Abierto | `EmpleadosView.vue:195-199` |
| UX4-25 | Botón "Dar de baja" con clase custom `.btn-baja` en vez de `.btn-danger` (pierde el anillo de foco de peligro) | Bajo | Abierto | `EmpleadoDetalleView.vue:480-488` |
| UX4-26 | Campo "Notas" visible en la ficha sin ningún control de edición en el formulario | Bajo | Abierto | `EmpleadoDetalleView.vue:275-278` / `EmpleadoForm.vue` |
| UX4-27 | Texto truncado sin `white-space:nowrap` (el ellipsis nunca se activa, el texto largo envuelve en el modal angosto) | Medio | Abierto | `BajaEmpleadoModal.vue:296-301` |
| UX4-28 | Formulario público sin `autocomplete` (`given-name`/`family-name`/`tel`/`email`) | Bajo | Abierto | `PersonalRegistroView.vue:148,153,158,163` |
| UX4-29 | Mensajes de estado async sin `role="status"`/`aria-live` | Medio | Abierto | `PersonalRegistroView.vue:140-143` |
| UX4-30 | Login sin foco inicial en el primer campo | Medio | Abierto | `LoginView.vue:127-135` |
| UX4-31 | Error "las contraseñas no coinciden" no asociado al campo que lo causó | Medio | Abierto | `LoginView.vue:96-101,280` |
| UX4-32 | `aria-describedby` ausente entre el `<textarea>` de motivo y su error | Medio | Abierto | `ConfirmDialog.vue:71-75` |
| UX4-33 | `.aviso-card` con `role="button"` no maneja la tecla Space (solo Enter) | Medio | Abierto | `AppNotifications.vue:79-84` |
| UX4-34 | Paginación sin `aria-live` — cambio de página no se anuncia | Medio | Abierto | `Pagination.vue:27-38` |
| UX4-35 | Borrador de KB vacío (creado al cerrar un ticket, U-05) sin ninguna señal visual distinta de "sin datos" neutro | Medio | Abierto | `KbArticuloDetalleView.vue:191,259` |
| UX4-36 | Grid de alta de acción correctiva sin breakpoint móvil (3 columnas `auto` en ancho de teléfono) | Alto | Abierto | `ProblemaDetalleView.vue:519-524` |
| UX4-37 | `<label for>` sin contraparte real (`id` inexistente) en 2 campos | Bajo | Abierto | `EncuestaForm.vue:150-152,131` |
| UX4-38 | Cierre de ronda de encuesta sin `ConfirmDialog` (acción sin "reabrir") | Alto | Abierto | `EncuestaDetalleView.vue:61-72,179-189` |
| UX4-39 | `<label for>` roto en 3 de 5 tipos de pregunta (`opcion_unica`/`escala_1_5`/`si_no` no generan el `id` que el `for` referencia) | Medio | Abierto | `PreguntaCampo.vue:18,42-83` |
| UX4-40 | Escala 1-5 sin indicar el significado de los extremos (ni visual ni accesible) | Medio | Abierto | `PreguntaCampo.vue:56-66` |
| UX4-41 | Encuesta pública sin indicador de progreso ("Pregunta X de N") | Medio | Abierto | `EncuestaPublicaView.vue:85-101` |
| UX4-42 | Estado de carga inicial sin esqueleto que reserve el espacio real (CLS) | Medio | Abierto | `DashboardView.vue:61` |
| UX4-43 | Tarjeta "Cuentas asignadas" no interactiva con el mismo aspecto que las 6 sí clicables | Bajo | Abierto | `DashboardView.vue:139-190` |
| UX4-44 | Color `danger` (rojo) usado para un conteo neutro ("Tickets abiertos"), no una alerta real | Bajo | Abierto | `DashboardView.vue:184-190,241` |
| UX4-45 | Texto truncado accesible solo vía `title` (tooltip nativo), sin alternativa por teclado/táctil | Medio | Abierto | `ActividadView.vue:131-134` |
| UX4-46 | Alta rápida de subcategoría sin `<label>`/`aria-label` (único form de los 4 paneles de configuración sin uno) | Medio | Abierto | `CategoriasTicketPanel.vue:223-234` |
| UX4-47 | Widget interactivo (`role="button"`) anidando otros `<button>` reales dentro — patrón ARIA no recomendado | Medio | Abierto | `CategoriasTicketPanel.vue:194-214` |
| UX4-48 | Imágenes de la sección "Marca" sin `loading="lazy"` en una página documentada como muy larga | Bajo | Abierto | `DesignSystemView.vue:529,533,537` |
| UX4-49 | Emoji (⚠️) en vez de ícono Tabler, inconsistente con el resto del mismo archivo | Alto | Abierto | `EntregaView.vue:126` |
| UX4-50 | Transiciones sin cobertura de `prefers-reduced-motion` (sí la tiene `.modal-anim*`) | Bajo | Abierto | `AppLayout.vue` (drawer), `AppNotifications.vue` (toast) |
| UX4-51 | Tokens muertos o valores crudos que duplican un token ya existente | Bajo | Abierto | `EncuestaForm.vue`, `PlataformasView.vue:320-324`, `CuentaForm.vue`, `AppLayout.vue` (rgba de overlays), `EncuestaDetalleView.vue:271-278` |
| UX4-52 | Tuteo aislado ("tienes", "deseas") en un mensaje de confirmación, viola el tono impersonal fijado para el proyecto (mismo string en otros 9 formularios fuera de este alcance) | Bajo | Abierto | `TicketInternoForm.vue:239` |
| UX4-53 | Chips de filtro y botones de nivel sin `:focus-visible` propio (caen al outline nativo) | Bajo | Abierto | `TicketsView.vue` `.chip-filtro`, `ResponderEncuestaView.vue` `.nivel-btn` |

## Cómo mantener esto al día

Cuando se cierre un hallazgo (código o config), actualizar su fila de
**Estado** aquí en el mismo cambio — no esperar a otro ciclo de auditoría
completo. Si aparece un hallazgo nuevo fuera de un ciclo formal, agregarlo a
la tabla correspondiente con su fecha de detección en la columna
Referencia. Ver la regla general de documentación en `AGENTS.md`.
