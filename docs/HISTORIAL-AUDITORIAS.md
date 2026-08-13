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

## Cómo mantener esto al día

Cuando se cierre un hallazgo (código o config), actualizar su fila de
**Estado** aquí en el mismo cambio — no esperar a otro ciclo de auditoría
completo. Si aparece un hallazgo nuevo fuera de un ciclo formal, agregarlo a
la tabla correspondiente con su fecha de detección en la columna
Referencia. Ver la regla general de documentación en `AGENTS.md`.
