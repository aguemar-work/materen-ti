# Changelog de documentación

> **Nota de normalización de nombres (2026-09-01).** El sistema tenía dos
> nombres para cada token (`--mat-color-x` con el valor, `--color-x` como
> puente). Al colapsarlo a uno solo, el renombrado barrió también las entradas
> de este archivo: donde una entrada antigua dice `--color-x` puede haber
> dicho `--mat-color-x` cuando se escribió. **El token del que habla es el
> mismo**; solo se muestra con el nombre vigente. No se revirtió entrada por
> entrada a propósito — un lector futuro solo conocerá los nombres actuales, y
> dejar los viejos lo obligaría a traducir cada vez.

> Registro discreto de cambios a la documentación del proyecto (no del
> producto — para eso están los commits y `migrations/`). Una línea por
> actualización; el detalle vive en el propio documento tocado. No forma
> parte de la lectura principal de README/AGENTS/PANORAMA/GUIA-UX-UI: es
> solo un rastro de cuándo y por qué se actualizó cada uno.
>
> Regla asociada (`AGENTS.md`, "Reglas del proyecto"): toda modificación de
> código/esquema que cambie dominio, seguridad o UI debe actualizar la
> documentación correspondiente en el mismo cambio, y dejar una línea acá.
>
> **Historial detallado de diseño**: el detalle completo (archivos exactos,
> riesgo, pendiente) de cada pasada de diseño sobre `design.pen`/
> `docs/GUIA-UX-UI.md` vive en el apéndice al final de este archivo — se
> migró desde dentro de `GUIA-UX-UI.md` en la reorganización de
> documentación de 2026-08-29 (esa guía quedó como referencia pura del
> estado actual, sin historia mezclada). Las entradas de abajo son la
> versión condensada de los mismos eventos.

- **2026-09-24** (**Portal público y páginas de error**) — migrados a la
  receta 4.5 con el componente nuevo `components/ui/AppPortal.vue`
  (reemplaza a `PublicBrand.vue`, retirado): Login, Entrega, Soporte, las 4
  páginas públicas de tickets (nuevo/buscar/seguimiento/encuesta de
  satisfacción), Encuesta pública (+ `PreguntaCampo`), 404 y Sin conexión.
  `AppButton` suma modo enlace (`to` → `RouterLink`, `href` → `<a>`). Cada
  página con `<h1>`; copy sin tuteo. Entrega: credenciales en `font-mono`
  con copiar accesible por dato, y "Crear ticket" abre en pestaña nueva para
  no perder lo revelado. Arregla la 404 sin botón (`<CarbonButton>`
  inexistente). `docs/SISTEMA-DISENO.md` §3 y §4.5 actualizados.
- **2026-09-23** (**Rediseño del resto de módulos**) — con el sistema de
  `docs/SISTEMA-DISENO.md`: Configuración (4 catálogos + Empresas +
  Plataformas, con `EncabezadoCatalogo.vue` nuevo), Correos, Cuentas,
  Accesos sensibles, Staff, formularios de Empleados, Dashboard, Actividad,
  Encuestas, KB y Problemas (`SeveridadProblema.vue` nuevo). Solo quedan sin
  migrar Login, Entrega pública, Soporte y páginas de error. Ajustes de
  comportamiento conscientes, detallados en `frontend/AGENTS.md`: columna
  "Módulos" en Staff, KPIs del Dashboard como filtro en el lugar (receta
  4.3 ampliada), Encuestas abre con la última ronda con respuestas, URL de
  Correos plegada en Acciones, y fix del ícono de Plataformas (faltaba el
  prefijo `ti`, no dibujaba). Dos botones hechos a mano → `AppButton`.
  Copy sin tuteo ("¿Le sirvió?", "Selecciónelo"). Revelado `.cred*` y
  permisos sin cambios. 3 tests de PDF fallan desde antes de este cambio
  (verificado con `git stash`), registrados en `HISTORIAL-AUDITORIAS.md`
  (pendiente 25).
- **2026-09-23** (**Rediseño de Tickets**) — el módulo central, con el
  sistema de `docs/SISTEMA-DISENO.md`. Bandejas como segmentado con
  contadores (se retira el riel lateral: le quitaba ~220px a la conversación
  en Triage), subtítulo con atajo "N sin asignar", tabla con prioridad
  proporcional, solicitante con avatar y edad en riesgo en rojo; barra de
  acciones masivas `role="toolbar"`; tarjetas en móvil. Detalle (panel y
  página) con conversación como columna principal y gestión/solicitante/
  contexto en lateral; una sola acción sólida por estado, Rechazar en
  outline de peligro. Timeline como conversación (nota interna: fondo
  ámbar + candado + rótulo). Reporte de satisfacción como tablero con
  distribución 1–5. Componentes nuevos del módulo: `PrioridadTicket`,
  `DistribucionNiveles`, `TicketSolicitante`, `TicketContexto` (compartidos
  entre panel y página). Copy sin tuteo. Tests de render: selectores de
  presentación actualizados (`[role="toolbar"]`, `data-tipo`/
  `data-visibilidad`, outline en KB/Rechazar); ningún `expect` retirado.
- **2026-09-23** (**Rediseño de Inventario: Equipos y Licencias**) — con el
  sistema de `docs/SISTEMA-DISENO.md`. Equipos: KPIs que filtran (Libres/
  Ocupados/En reparación), tabla de 8 → 5 columnas (equipo con código/almacén
  apilados, asignación con avatar o ubicación editable, acción de la situación
  + ⋮), hoja de vida con pie de acciones, tarjetas en móvil; EquipoForm por
  secciones con grilla de fotos (subida por `equipos-fotos` sin cambios);
  Importar con pasos y filtro segmentado. Licencias: subtítulo con vencidas/
  por vencer, tabla de 7 → 6 columnas, barra de asientos con libres/sin cupo,
  chips de usuarios con "+N", vencimiento con plazo; LicenciaForm por
  secciones con modo de acceso en tarjetas. Revelado `.cred*` solo
  reubicado. Copy sin tuteo. Tests de render: solo selectores de
  presentación (columnas, enlace por `href` en vez de `.empleado-link`).
- **2026-09-22** (**Rediseño de Empleados + modo maqueta + capa provisional**)
  — con carta blanca del usuario para reimaginar el sistema (no replicar el
  diseño anterior): Empleados (listado + ficha) y el panel de Accesos
  (`CuentasPanel.vue`) se reestructuran con Tailwind + `components/ui/*`:
  filtros fuera de la tabla, estado como segmentado, acciones de fila en menú
  ⋮, ficha con perfil arriba, vínculos como secciones de lista y columna
  lateral de contacto/organización. `AppAvatar.vue` nuevo. Revelado de
  contraseñas, permisos y lógica sin cambios. `npm run dev:maqueta`
  (`src/maqueta/`, plugin de `vite.config.js` solo en ese modo): la app con
  datos inventados y un JEFE ficticio, sin backend — herramienta de revisión
  de diseño; verificado que no entra al bundle de producción.
  `styles/componentes.css`: capa PROVISIONAL para que las vistas todavía no
  rediseñadas no se vean sin estilos; se retira a medida que cada módulo pasa
  al sistema nuevo.
- **2026-09-22** (**Shell migrado a la base PrimeVue/Tailwind + tipografía e
  íconos**) — a pedido explícito: shell claro y fundido, Inter Variable y
  Tabler Icons servidos desde el bundle (`@fontsource-variable/inter`,
  `@tabler/icons-webfont@3.48.0`, importados en `main.js`; sin CDN, la CSP
  no se tocó). Desde el 2026-09-05 no se veía ningún ícono en toda la app:
  el reinicio quitó el `<link>` de Tabler y nada lo reemplazó. La 3.48.0
  (la 3.35.0 arrastraba `sharp` con CVEs altas) ya no trae clases
  `-filled` en la hoja combinada: los 11 usos (avisos y adornos de error
  de formularios) pasan a su versión outline.
  `AppLayout`/`AppNav`/`AppSearch`/`NotificacionesCampana`/
  `AppNotifications` pasan a Tailwind (clases compartidas en
  `components/shared/shellClases.js`); estructura, navegación, copy y
  permisos sin cambios. Fix de paso: el badge de tickets sin asignar del
  SideNav se evaluaba una sola vez al montar y nunca se actualizaba.
  Breakpoint móvil `<= 768px` → `< 768px` (coincide con `md`). Tema oscuro
  sin estilos todavía (el toggle no tiene efecto visible). 6 tests nuevos
  (`AppNav.render.test.js`); verificado además con capturas headless a
  1440/1200/600 px.
- **2026-09-22** (**`AGENTS.md` al día con la base PrimeVue/Tailwind**) —
  el encabezado, la precedencia documental y la regla de UI seguían diciendo
  "sin sistema de diseño, `main.css` vacío" dos semanas después de que el
  2026-09-07 se definiera la base nueva; ahora remiten a `frontend/AGENTS.md`
  (sección "UI/UX"). Se retira el gotcha del padding de tabla (`th`/`td` en
  `main.css` + `ThOrdenable.vue`): ninguno de los dos lugares tiene ya ese CSS.
- **2026-09-08** (**Tickets Fase 3: `TicketInternoForm.vue` — cierre del
  módulo**) — 2 botones → `AppButton`. Su `<Modal>` pasó a
  `components/ui/AppDialog.vue`, wrapper nuevo sobre `primevue/dialog` +
  el MISMO `pt/dialog.pt.js` que `ConfirmDialog.vue` (`buildDialogPT` gana
  un parámetro `{size}`: `'sm'` sin cambio para confirmaciones, `'md'`
  nuevo para formularios). `Modal.vue` no se tocó — sigue siendo lo
  correcto para sus otros ~21 consumidores, migrarlos es aparte.
  `AppDialog.vue` quedó drop-in con `useFormularioModal.js`: `cerrar()`
  incondicional (flujo de éxito) vs. `confirmarCierre` como veto de
  X/Escape/backdrop, mismo reparto que `Modal.vue` — verificado con el
  flujo real de "cambios sin guardar", no solo supuesto. Verificado
  también (no asumido): un `AppButton type="submit" form="ti-form"` en el
  footer del Dialog sigue disparando el submit del `<form>` de afuera.
  5 tests nuevos (`TicketInternoForm.render.test.js`). **397/397 en la
  suite completa — módulo Tickets cerrado** (Fases 1+2+3, 3 PRs
  autocontenidos, la app compiló en verde después de cada uno).
- **2026-09-08** (**Tickets Fase 2: detalle + timeline → `AppButton`**) —
  19 botones legacy migrados en `TicketDetalleView.vue`,
  `TicketDetallePanel.vue` y `TicketComposer.vue` — cero cambios en
  `useTicketDetalleLogica.js`/`stores/ticketDetalle.js` (la máquina de
  estados). Verificado con tests que disparan cada transición real
  (iniciar → `actualizarTicket(en_progreso)`, rechazar →
  `crearComentarioTicket`+`actualizarTicket(rechazado)`, resolver vía
  `ConfirmDialog` → `cerrarTicket`, reabrir con motivo, solo JEFE), no solo
  que el botón se vea bien. Toggle "KB" resuelve su estado "activo"
  reusando `variant`/`severity` existentes de `AppButton` (sin agregar una
  prop `pressed` nueva). `TicketCamposGestion.vue` sin cambios (0 botones/
  tablas/modales, estaba en alcance pero no había nada que tocar).
  `TicketTimelineUnificado.vue` sin cambios — hallazgo real: no usa ninguna
  clase de Tailwind (100% clases sin respaldo en `main.css` desde el
  2026-09-05), no había nada que "heredar". Botones icon-only de layout
  (volver, cerrar panel, colapsar contexto) y el "Problema" ya vinculado
  (RouterLink real) quedaron fuera, mismo criterio que fases anteriores.
  15 tests nuevos (`TicketComposer`/`TicketDetalleView`/
  `TicketDetallePanel`/`TicketTimelineUnificado.render.test.js`). 392/392
  en la suite completa.
- **2026-09-08** (**Tickets Fase 1: listado principal + selección múltiple
  en `AppTable`**) — extensión real de `AppTable.vue`/`pt/table.pt.js`:
  `selection`/`update:selection` (v-model), `rowClass` (nativa de
  DataTable) y `rowAttrs` (resuelta por PT, DataTable no tiene equivalente
  nativo). Preset nuevo para `column.pcHeaderCheckbox`/`pcRowCheckbox`
  (mismo `primevue/checkbox` por dentro para header y fila, verificado en
  su fuente) — acento primario al marcar, borde ≤1px, transición suave.
  `TicketsView.vue`: `<table>` → `AppTable`+`AppColumn` (7 columnas, 4
  ordenables), columna de selección real de PrimeVue (`AppColumn` no
  necesitó cambios, `selection-mode="multiple"` ya es nativa). La lógica de
  acciones masivas existente (`seleccionados` Set<id>) no se tocó — un
  computed puente (`seleccionParaTabla`) traduce hacia el array de filas
  que espera `v-model:selection`. `claseFilaTicket`/`filaAtributosTicket`
  preservan clase de fila y `aria-current` de la fila activa vía
  `row-class`/`row-attrs`. Botones del header/barra de acciones masivas/
  "Cargar más" de Triage → `AppButton`. Verificado (no supuesto): ni
  `TicketsView.vue` ni `stores/tickets.js` usan InsForge Realtime — nada
  que proteger en esta fase. Fuera de alcance a propósito: modo Triage
  (salvo su botón "Cargar más"), `TicketDetalleView`/`TicketDetallePanel`
  (Fase 2), `TicketInternoForm` (Fase 3), chips de filtro y flechas de
  paginación (mismo criterio que Licencias/Equipos). 8 tests nuevos
  (`TicketsView.render.test.js`), incluye la selección de fila actualizando
  el modelo reactivo y habilitando la barra — 373/373 en la suite completa.
- **2026-09-07** (**Segundo módulo de negocio migrado: `EquiposView.vue`**)
  — mismo patrón que Licencias: `<table>` → `AppTable`+`AppColumn` (8
  columnas, 3 ordenables), `@ordenar` → `store.ordenarPor`, paginación
  deliberadamente fuera de `AppTable` (su propio `<nav>` ya llamaba al
  store directo). `MenuAcciones`/`ConfirmDialog` no necesitaron NINGÚN
  cambio acá — ya venían migrados con API pública intacta. Vista
  "Tarjetas" y KPIs sin tocar (no son tabla). `ImportarEquiposView.vue`:
  6 botones de flujo → `AppButton`, su propia grilla de corrección
  (in-memory, edición inline) sin migrar a AppTable — caso de uso
  distinto, no un listado server-side. Verificado (no supuesto): el
  hotfix HTTP 414 (migración 085) vive en `api/domains/equipos.js`, no
  tocado. Dato real de bundle: con un segundo consumidor de `AppTable`,
  Rollup extrajo el código común de PrimeVue a un chunk compartido — el
  chunk de `LicenciasView` bajó de ~120 kB a ~11 kB gzip, `EquiposView`
  entra con ~18 kB gzip (no ~120 kB de nuevo) — el costo se amortiza, no
  se multiplica. 8 tests nuevos (`EquiposView.render.test.js`, incluye un
  guardrail explícito contra la regresión HTTP 414). 365/365 en la suite
  completa.
- **2026-09-07** (**Capa interactiva global migrada: `MenuAcciones`/
  `ConfirmDialog`**) — antes de tocar Tickets (el core del ITSM), se
  estandarizó la interacción global. `MenuAcciones.vue` (5 vistas) pasó a
  `components/ui/AppMenu.vue` (`primevue/menu`, popup) + `pt/menu.pt.js` —
  posicionamiento/foco por teclado/cierre por click-afuera ahora los
  resuelve PrimeVue en vez de `usePopoverFlotante` (que sigue viva en
  `NotificacionesCampana.vue`). `ConfirmDialog.vue` (~31 vistas) pasó a
  `primevue/dialog` + `pt/dialog.pt.js` + `AppButton`, **no** a
  `primevue/confirmdialog` + `ConfirmationService` — el servicio imperativo
  de PrimeVue no calza con el contrato reactivo actual (`cargando` cambia
  con el diálogo ya abierto, motivo con validación propia); se documentó la
  decisión en vez de forzarlo o de construir un servicio global en paralelo
  sin ningún consumidor real. **API pública de ambos componentes sin
  cambios** — ninguna de las ~36 vistas que los usan necesitó tocarse. 16
  tests de render nuevos (`MenuAcciones.render.test.js` +
  `ConfirmDialog.render.test.js`), incluye el hallazgo real de que
  `aria-expanded`/`@show`/`@hide` de Menu no se pueden probar vía la
  transición (no completa en happy-dom) — se resolvió actualizando
  `abierto` en el momento de la acción, no como eco de la animación.
  357/357 en la suite completa, `npx vite build` limpio (aviso nuevo: el
  bundle principal, no uno de ruta, creció ~22 kB gzip porque estos dos
  componentes se cargan desde casi toda la app — aceptado, ver AGENTS.md).
- **2026-09-07** (**Primer módulo de negocio migrado: `LicenciasView.vue`**)
  — PoC deliberado de bajo riesgo (Licencias, no Tickets, antes de tocar el
  core del ITSM). `<table>` nativa → `AppTable`+`AppColumn`, preservando
  cada celda custom (credenciales reveladas, capacidad, chips de usuario,
  tag de vencimiento) vía `#body`; `@ordenar` → `store.ordenarPor`.
  Paginación deliberadamente **fuera** de `AppTable` — el `<nav>` propio de
  esta vista (filas por página + salto a página + flechas) ya era más
  completo que el paginador nativo de PrimeVue y ya llamaba al store
  directo. Botones de header/EmptyState/modal "asignar asiento" →
  `AppButton`; `MenuAcciones` y `ConfirmDialog` (compartidos) sin tocar,
  fuera de alcance. Código muerto retirado:
  `columnasLicencias`/`columnasVisibles`/`estiloColumna`/`ThOrdenable`/
  `SkeletonTabla` ya no se usaban en esta vista. `npm run build` limpio
  (aviso nuevo, real: el chunk de esta vista pasó a ~120 kB gzip — DataTable
  no se tree-shakea bien dentro de un `<script>`, conocido y aceptado, no
  bloquea nada por ser lazy-loaded). `LicenciasView.render.test.js` (7
  tests) es el primer test de render de una vista completa con store+router
  real en el proyecto (solo `api/insforge.js` mockeado) — 341/341 en la
  suite completa.
- **2026-09-07** (**Segundo wrapper: `AppTable`/`AppColumn` + catálogo en
  Style Lab**) — sobre la base del punto anterior: `AppTable.vue` envuelve
  `primevue/datatable`, con su preset `pt/table.pt.js` (fila blanca, borde
  inferior de 1px como único separador, sin bordes laterales, hover
  `bg-slate-50`, encabezado `font-medium`). Hallazgo de arquitectura real
  (no supuesto — verificado con test descartable): DataTable reconoce
  columnas por la referencia exacta del componente `Column`, así que
  `Column` no se envuelve como a Button — `AppColumn.js` lo re-exporta
  directo, documentado como excepción al patrón wrapper. Paginación
  deliberadamente fuera de `AppTable` (se reusa `Pagination.vue`, ya
  conectado a los 7 listados reales); `@sort`/`@page` se traducen a eventos
  con la forma exacta de `crearStorePaginado.js`
  (`ordenarPor`/`irAPagina`/`cambiarTamPagina`). Catálogo completo de
  `AppButton` (severidad × variante × tamaño × estados) y de
  `AppTable`+`AppColumn` (orden y paginación simulando latencia real) en
  `modules/styleLab/StyleLabView.vue`. De paso: `/style-lab` no tenía ruta
  registrada pese a que el router ya lo daba por hecho en dos comentarios —
  se restauró `style-lab.routes.js` (dev-only, mismo criterio que
  `/design-system`). 18 tests de render nuevos (`AppButton.render.test.js` +
  `AppTable.render.test.js`), 334/334 pasan en la suite completa.
- **2026-09-07** (**Base de UI nueva: PrimeVue v4 Unstyled + Tailwind v4**) —
  a pedido explícito (no iniciativa del asistente), se define la base que
  reemplaza a Carbon (retirado el 2026-09-05): PrimeVue instalado con
  `unstyled: true` (`main.js`, sin tema Aura/Lara ni clases `p-*`) + Tailwind
  v4 vía el plugin de Vite (`@tailwindcss/vite`, sin `tailwind.config.js` —
  el tema vive en `@theme` dentro de `frontend/src/styles/main.css`). Rampa
  de color primario `--color-primary-50..950` generada en HSL a partir del
  azul de marca exacto `#0064E0` (pinned en 500). Se fija el patrón wrapper
  estricto (ningún `primevue/*` directo en vistas, todo pasa por
  `components/ui/*` + preset `pt/` propio) con el primer caso real,
  `AppButton.vue` + `components/ui/pt/button.pt.js`. `frontend/AGENTS.md`
  actualizado (sección "UI/UX").
- **2026-09-05** (**Retiro de IBM Carbon v11 — reinicio del sistema de
  estilos a cero**) — `styles/carbon-theme.css` y `styles/main.css`
  vaciados a propósito, bloques `<style>` eliminados de todos los
  componentes `.vue`, `frontend/src/components/carbon/` (9 componentes)
  borrada junto con `tests/componentes/carbon.render.test.js`, y retiradas
  `docs/GUIA-UX-UI.md`, `docs/GOBERNANZA-DISENO.md` y
  `docs/PLAN-MAESTRO-MATEREN.md`. `index.html` deja de cargar IBM Plex y
  Tabler Icons. La lógica real de 4 de esos componentes se rescató en
  `composables/useRevelado.js`, `core/paginacionRender.js`,
  `core/tablaColumnas.js` y `composables/useCampoAccesible.js`; lo que sigue
  vigente (marca, principios del JEFE, accesibilidad) quedó en
  `docs/NOTAS-DISENO-ANTERIOR.md`. CI deja de correr 4 de los 5 guardrails
  de diseño (solo sigue `patrones-ui.mjs`, ver `.github/workflows/ci.yml`).
  Entrada agregada el 2026-09-22 al commitear: el cambio se había hecho sin
  registrarlo acá.
- **2026-09-05** (**Fix HTTP 414 en el filtro "disponible" de Equipos**) —
  `equiposApi.queryEquipos()` resolvía la situación "disponible" trayendo a
  JS el `equipo_id` de TODA asignación activa del inventario y armando un
  filtro `not.in.(uuid,uuid,...)` — verificado en producción: 197 equipos
  con asignación activa, URL al borde/por encima del límite de PostgREST
  (HTTP 414 URI Too Long). Migración 085
  (`migrations/085_equipos_disponibilidad_derivada.sql`, aplicada):
  `equipos.tiene_asignacion_activa` (boolean), mantenida SOLO por trigger
  (`set_equipo_tiene_asignacion_activa()` en `equipos`,
  `sync_equipo_tiene_asignacion_activa()` en `asignaciones_equipo`) —
  nunca por el cliente, mismo patrón que `set_created_updated_by`. Backfill
  verificado contra un conteo independiente (197 = 197) antes de tocar el
  frontend. **No contradice** el principio de la migración 013
  ("Disponible/Asignado no se guarda: se deriva de la asignación activa"):
  ver la nota extensa al inicio del archivo de la migración sobre la
  diferencia entre "no guardado, recalculado en cada consulta con una
  lista de IDs" (lo que rompía) y "guardado por un trigger, nunca por el
  cliente" (lo que reemplaza). `equipos.js` (frontend) pasa de la lista de
  IDs a `.eq('estado', 'operativo').eq('tiene_asignacion_activa', false)`;
  se retira `idsEquiposConAsignacionActiva()` (helper que quedó sin uso).
  Sin cambios en `aplicarFiltroSituacion()` (asignado/en_ubicación no
  tenían este problema). Suite completa 380/380 en verde, guardrails de
  diseño en 0 fallas (cambio de solo backend/API, sin CSS ni markup).
  `docs/PANORAMA-SISTEMA.md` actualizado (fila de `equipos` y sus
  triggers).
- **2026-09-04** (**Plan Maestro v2 — Frente 2: Helpdesk 3 columnas**) —
  último de los 4 frentes. Auditoría previa (Paso 1): el working tree tenía
  177 archivos modificados (la gran mayoría preexistente, no de esta
  sesión) — no se revisó línea por línea, pero `npx vitest run` (380/380)
  y `npm run build` confirmaron el estado estable antes de seguir
  construyendo encima. Sin commit como parte de este cambio: dado el
  tamaño y que la mayor parte del diff no es de esta sesión, esa decisión
  queda aparte, a confirmar explícitamente.
  1. **Triage como modo por defecto** (`useVistaModulo.js` gana un 3er
     parámetro opcional `defecto`, sigue siendo `'tabla'` para
     Empleados/Equipos; Tickets pasa `'triage'`): el workspace de 3
     columnas (nav de Bandejas + lista + `TicketDetallePanel.vue`, que ya
     existía como CSS grid real) pasa a ser lo que ve alguien sin
     preferencia guardada. Quien ya tenía una preferencia en `localStorage`
     la conserva. El modo Tabla no se retira: sigue siendo la única
     superficie con selección múltiple/reasignación en lote, que no tiene
     equivalente en Triage (por diseño — un ticket a la vez).
  2. **Columna de contexto en `TicketDetallePanel.vue`**: equipos
     asignados al solicitante, artículos de KB relacionados y problema
     vinculado tenían solo un chip de conteo en la banda de solicitante
     ("empecemos simple", ronda anterior) — ganan una 3ra columna del
     mismo `.tdp-grid` (`.tdp-grid--con-contexto`, 300px/1fr/280px), con
     lista expandida, sin ninguna consulta nueva (mismos refs del
     composable `useTicketDetalleLogica.js`, ya reactivos). Colapsable
     (botón en el header, no persistido) y responsive vía un tier nuevo de
     `@container tdp` a 1100px (la columna cae a fila propia de ancho
     completo antes del colapso total a 800px, que sigue igual). Sin dato
     de contexto, no se agrega ninguna columna vacía.
  3. **2 macros de WhatsApp** en la nueva sección "Acciones rápidas" de esa
     columna: `copiarMensajeSolicitarInfo()` (nueva) y
     `copiarMensajeSatisfaccion()` (ya existía, huérfana desde que se
     retiró de este panel en una ronda anterior por romper el ritmo
     visual — vuelve acá, en su propio lugar, no en la banda de
     solicitante). Mismo patrón exacto: clipboard + toast, sin abrir
     `wa.me` — el staff decide por qué canal reenviarlo.
  `npm run build` sin errores; suite completa 380/380 en verde; guardrails
  de contraste/clases-muertas/tokens-vs-guia/patrones-ui en 0 fallas.
  README actualizado ("Ticket", en Conceptos del dominio). Cierra los 4
  frentes del Plan Maestro v2 (navegación, onboarding/offboarding,
  inventario y helpdesk).
- **2026-09-04** (**Plan Maestro v2 — Frente 4: Drawer de Inventario**) —
  tres piezas:
  1. **`Modal.vue` gana un modo `lateral`** (prop booleana): el panel se
     acopla al borde derecho a todo el alto en vez de centrarse, con su
     propia transición (`modal-anim-lateral`, desliza en vez de escalar,
     `main.css`). Se extendió el componente compartido en vez de crear
     `Drawer.vue`/`CarbonDrawer.vue` aparte — mismo criterio que ya sostiene
     Modal.vue (reemplazó ~21 modales hand-rolled): un componente central
     con TODO el contrato de accesibilidad (foco, Escape, Teleport,
     `confirmarCierre`, bloqueo de scroll) que ya estaba resuelto y probado,
     en vez de duplicarlo en un archivo nuevo. `size` sigue controlando el
     ancho (`detail`/620px). `frontend/tests/componentes/Modal.render.test.js`
     gana 4 casos para el modo lateral (18/18 en verde).
  2. **Hoja de vida de Equipos migrada al drawer** (`EquiposView.vue`):
     antes era un `Modal` centrado tamaño `detail`; ahora es el mismo
     componente con `lateral`. De paso gana 3 secciones que no existían —
     galería de fotos, especificaciones técnicas (`equipos.specs`, jsonb) y
     accesorios (`equipos_accesorios`) — sin ninguna consulta nueva: esos
     datos ya viajaban en cada fila de la lista (`SELECT_EQUIPO`), solo no
     se mostraban en la hoja de vida. El historial de eventos (única
     sección que ya existía) queda al final, sin cambios de contenido.
  3. **Tarjetas KPI de disponibilidad** (`EquiposView.vue`, arriba de la
     tabla): Libres para entregar / Ocupados / En reparación, sobre TODO el
     inventario (no solo la página o el filtro activo del toolbar) —
     `equiposApi.conteosDisponibilidad()` (`api/domains/equipos.js`) reusa
     la misma `queryEquipos()`/filtro por situación que ya arma el
     `<select>` del toolbar, con `.range(0, 0)` para pedir solo el `count`
     exacto de PostgREST, sin traer filas. Reusa las clases globales
     `.stat-card`/`.stat-icon`/`.stat-info` (`main.css`, ya las usa
     Dashboard) — solo se agregaron los 3 colores de ícono propios de esta
     vista y el estado `--activo`. Clic en una tarjeta = mismo filtro de
     Situación de abajo (in-place, no navega a otra ruta).
  `npm run build` sin errores; suite completa 380/380 en verde; guardrails
  de contraste/clases-muertas/tokens-vs-guia/patrones-ui en 0 fallas.
  README actualizado ("Equipo", en Conceptos del dominio). Tercero de los 4
  frentes del Plan Maestro v2 en quedar cerrado (navegación, onboarding/
  offboarding e inventario) — queda pendiente el helpdesk de 3 columnas.
- **2026-09-04** (**Plan Maestro v2 — Frente 3: Onboarding/Offboarding
  guiados**) — dos piezas, ninguna toca el backend:
  1. **Offboarding**: `BajaEmpleadoModal.vue` reemplaza el clic único
     "Confirmar baja" → cierra por un checklist progresivo animado (retardo
     fijo de 300ms por ítem, derivado del mismo `resumenBaja()` que ya
     alimentaba el resumen de impacto) mientras corre en paralelo el RPC
     atómico real `dar_baja_empleado()` (sin cambios). El último ítem del
     checklist solo se marca listo cuando el RPC también resolvió — nunca
     antes, así la animación no puede mentir sobre si la baja ya ocurrió en
     el servidor. Equipos se muestra como ítem "pendiente" (ícono de reloj),
     no "hecho": la baja nunca los toca (ver README, "Modelo de
     seguridad"). El modal se bloquea (sin X, sin cierre por backdrop/Escape)
     mientras corre esta fase.
  2. **Onboarding**: la guía de alta (`EmpleadoDetalleView.vue`, banner
     `.alta-guia`) gana un paso nuevo, "Credenciales entregadas"
     (`core/dominio-empleados.js`, `pasosAlta()`) — **requisito, no
     opcional**, igual que "Cuenta de correo". Cierra una brecha real: desde
     el 2026-09-01 la guía pasó de texto informativo a pasos accionables,
     pero el paso "cuenta" se marcaba listo con solo CREAR la cuenta, sin
     que el empleado la hubiera recibido — el README ya documentaba el alta
     guiada terminando en "enviar por WhatsApp" (`docs/README.md`, "Flujos
     principales"), pero el código nunca lo verificaba. Ahora el paso solo
     se marca hecho cuando ya se generó una entrega (`entregas`, RLS "staff
     ve" desde la migración 010 — sin política nueva) para ese empleado;
     `empleadosApi.tieneEntrega()` (`api/domains/empleados.js`) es la
     consulta nueva, de solo lectura. `CuentasPanel.vue` expone su
     `enviarWhatsApp()` existente (mismo patrón que ya usaba `abrirNueva()`)
     y emite `entrega-enviada` para que el banner se actualice sin recargar
     la página. `frontend/tests/alta-incompleta.test.js` actualizado (22/22
     en verde) y `frontend/tests/insforge-api-shape.test.js` con el método
     163 agregado a la lista (376/376 en verde, suite completa).
  README actualizado ("Flujos principales", puntos 1 y 2). Segundo frente de
  un plan de 4 — quedan Helpdesk de 3 columnas y drawer de hoja de vida de
  Equipos, sin ejecutar todavía.
- **2026-09-04** (**Plan Maestro v2 — Frente 1: reagrupación del SideNav por
  intención de uso**) — `AppNav.vue` pasó de agrupar por dominio de datos
  ("Día a día", "Activos y credenciales", "Conocimiento y mejora") a agrupar
  por intención de uso: Dashboard suelto → "Mesa de Ayuda" (Tickets, Base de
  Conocimiento, Problemas, Encuestas) → "Gestión de Personal" (Empleados,
  hoy con un solo ítem a propósito, reservado para Onboarding/Offboarding
  si se separan de la ficha del empleado) → "Inventario Global" (Correos,
  Licencias, Equipos) → "Administración" (sin cambios). Es una
  reagrupación de **grupos**, no de **Áreas** — el nivel de Áreas sigue
  reservado para cuando el sistema sume un dominio no-TI real (ver
  `docs/PANORAMA-SISTEMA.md` §6, "Alcance de crecimiento", actualizada en
  el mismo cambio). No toca `constants/modulos.js` ni el guard de rutas:
  `item.modulo` sigue apuntando al mismo id de permiso de siempre, así que
  RLS y `staff_modulos_permisos` quedan intactos. Detalle en
  `docs/GUIA-UX-UI.md`, "SideNav — ítems y estados". Primer frente de un
  plan de 4 (Helpdesk de 3 columnas, Onboarding/Offboarding, drawer de
  hoja de vida de Equipos quedan como hoja de ruta, sin ejecutar todavía).
  `frontend/tests/componentes/carbon.render.test.js` actualizado (64/64
  en verde) para los labels nuevos.
- **2026-09-03** (**Migración de badges/tags a `BadgeEstado`/`CarbonTag`, y
  cierre del rediseño Modern Clean Enterprise**) — última pieza del día: las
  vistas que escribían `<span class="badge badge--X">` a mano migraron a
  `BadgeEstado` (13 archivos de `modules/` hoy, `grep -rl "BadgeEstado"
  modules`) cuando el valor es un tipo de dominio que `core/badges.js` ya
  resuelve, o a `CarbonTag` directo cuando es decorativo/local a una vista
  (contadores, "Código duplicado", "Vencida", "Sin devolver", el
  interno/externo de `TicketComentarios`) — sin inventarles un `tipo` nuevo
  de un solo uso en `core/badges.js`. `.badge`/`.badge--X` (`main.css`) no
  se retiró: queda como vitrina histórica solo en `DesignSystemView`/
  `StyleLabView`, mismo criterio que ya se aplicó al `.form-group` viejo y
  al `<table>` a mano en las migraciones anteriores. Lo que sigue con
  nombre `.badge-*` en el resto del código (`.badge-count`, `.badge-inline`,
  `.badge-sin-devolver`) es una utilidad de layout, no una clase de color
  alternativa. **No** cambia la arquitectura dominio/presentación de
  `BadgeEstado.vue`/`CarbonTag.vue` documentada desde el 2026-09-02. Detalle
  completo en `docs/GUIA-UX-UI.md`, "Migración de badges/tags a
  `BadgeEstado`/`CarbonTag` (2026-09-03)"; `node scripts/tokens-vs-guia.mjs`
  en 0 fallas. Con esta pieza, el rediseño Modern Clean Enterprise +
  componentización queda completo: las 6 piezas (botones, avisos,
  paginación, tablas, formularios, badges/tags) fechadas el mismo día en
  este archivo y resumidas en `docs/GUIA-UX-UI.md`, "Rediseño Modern Clean
  Enterprise — cierre (2026-09-03)".
- **2026-09-03** (**Cierre de la migración de formularios a
  `CarbonCampo`**) — en cuatro tandas se migraron todos los formularios de
  `.form-group` a `CarbonCampo`; 30 archivos de `modules/` lo usan hoy
  (`grep -rl "CarbonCampo" modules`). Lo que quedó en `.form-group` es
  deliberado, no deuda: envoltorio de un `BuscadorCombo`
  (`AsignarLicenciaModal`, `LicenciasView`), un checklist/radio-group
  (`StaffModulosForm`) o una fila densa sin label visible (barras de
  filtro, la grilla de `ImportarEquiposView`, altas rápidas inline);
  las únicas excepciones sin criterio de densidad son las vitrinas
  `DesignSystemView`/`StyleLabView`, intencional. La migración expuso dos
  huecos reales en `CarbonCampo` que se cerraron en el propio componente:
  **(1)** sin `inheritAttrs: false` + `v-bind="$attrs"` en el control
  interno, atributos nativos como `autocomplete`/`pattern`/`inputmode`/
  `maxlength` caían en el `<div>` raíz en vez de en el
  `<input>`/`<select>`/`<textarea>` real — se detectó porque `LoginView`
  perdía `autocomplete="current-password"` (rompe el ofrecimiento de
  credenciales del navegador) y `PlataformasView` perdía el `pattern` del
  slug; **(2)** un template ref sobre `<CarbonCampo>` entregaba la
  instancia del componente, no el control DOM, así que `.focus()` no
  existía — se agregó `useTemplateRef('control')` +
  `defineExpose({ focus })`, que ahora usan `LicenciaForm`, `EquipoForm` y
  `EmpleadoForm` para llevar el foco al campo que falló la última
  validación. **No** cambia la arquitectura del componente (un archivo con
  prop `tipo`, campo outlined, error por campo con `aria-describedby`).
  Detalle completo en `docs/GUIA-UX-UI.md`, "Migración de formularios a
  `CarbonCampo` (2026-09-03)"; `node scripts/tokens-vs-guia.mjs` en 0
  fallas.
- **2026-09-03** (**Revisión "Filas con foco": rediseño de tablas y cierre de
  la Fase C**) — con las 22 vistas de listado que quedaban migradas a
  `CarbonDataTable` en la misma pasada (más el piloto `EmpresasView` del día
  anterior), ya no queda ningún `<table>` a mano operativo en el sistema. Se
  aprovechó para revisar la tabla con el mismo criterio que "Modern Clean
  Enterprise" (más abajo en este mismo día) había aplicado a botones y
  campos. Cambia: el `th` deja el fondo de `--color-bg-accent` (cabecera-
  bandeja de Carbon estricto) y pasa a transparente con una línea inferior
  más fuerte (`--color-border-strong`) — el lenguaje de lista de
  Linear/GitHub; la densidad única de `9px` de padding pasa a un prop
  `densidad` de tres pasos en `CarbonDataTable` (`sm` 32px, `md` 40px
  **default**, `lg` 48px — insignia: Empleados, Tickets, Equipos, Staff);
  nuevo prop `filaAtributos` (atributos ARIA por fila, ej. `aria-current`,
  agregado para preservar el que `TicketsView` tenía a mano en su `<tr>`);
  nuevo slot `#encabezado-<clave>` para una columna no ordenable con
  contenido propio (el checkbox "seleccionar todos" de Tickets); nueva clase
  `.fila-accion` (`main.css`) para un botón de icono de fila visible solo en
  hover/foco de teclado, siempre visible en táctil. **Excepciones
  deliberadas, sin migrar**: `DesignSystemView`/`StyleLabView` (vitrinas de
  diseño, conservan el `<table>` viejo como muestra histórica) y 3 de las 7
  tablas de `ReporteTicketsModal` (Categoría/Prioridad/Tipo — matrices fijas
  de 2 columnas que no ganan nada con la migración). **No** cambia la
  arquitectura de columnas declarativas de `CarbonDataTable` ni el criterio
  sin zebra/sin bordes verticales. Detalle completo en `docs/GUIA-UX-UI.md`,
  "Revisión 'Filas con foco' (tablas, 2026-09-03)"; `node
  scripts/tokens-vs-guia.mjs` en 0 fallas.
- **2026-09-03** (**Selector "Filas por página": una sola lista de opciones
  y una sola consulta**) — el selector de `CarbonPagination` ya estaba
  cableado en 16 vistas (las 7 con store server-side vía
  `store.cambiarTamPagina`, las 9 client-side vía
  `usePaginacion.cambiarTamPagina`), pero con tres problemas: **(1)** las
  opciones `[10, 15, 50, 100]` estaban escritas a mano en cada template y
  **no incluían el tamaño inicial** (20 en los listados, 25 en la bandeja de
  importación de equipos), así que al entrar el `<select>` mostraba "10" —o
  quedaba en blanco, según el navegador— mientras la tabla traía 20 filas;
  **(2)** `EmpresasView` pasaba `:tam-pagina` pero no las opciones ni el
  handler, así que era el único listado migrado a Carbon **sin** el selector;
  **(3)** en los 7 listados con store, un cambio de tamaño disparaba **dos**
  consultas (el componente emitía `update:tamPagina` *y*
  `update:modelValue = 1`, y el store recargaba en las dos) — el guard
  `_peticionId` tapaba el efecto, no el pedido. Cambia: nuevo
  `frontend/src/constants/paginacion.js` como fuente única
  (`TAMANOS_PAGINA` = 10/**15**/**20**/50/100 y `TAM_PAGINA_DEFECTO` = 20,
  que ahora sí está entre las opciones), consumido por las 17 vistas, por
  `usePaginacion` y por `crearStorePaginado`; `CarbonPagination.cambiarTam()`
  deja de emitir el reset de página (lo hacen ya el store y el composable, y
  es ahí donde tiene que seguir viviendo). La bandeja de importación de
  equipos arranca en 20 en vez de 25. 3 tests nuevos/actualizados en
  `tests/componentes/carbon.render.test.js` (uno fija que el tamaño inicial
  esté entre las opciones, otro que un cambio de tamaño pida la página una
  sola vez); 371 tests en verde y build sin tocar guardrails.
- **2026-09-03** (**Revisión "Modern Clean Enterprise": geometría y
  elevación**) — un día después de adoptar Carbon v11 estricto se revisó
  **solo** la geometría y la elevación: radio 0 en todo + campo *filled*
  (fondo gris + línea inferior) + botón secundario en bloque gris sólido se
  leían como industrial-brutalista para una V2 del producto. Cambia:
  escala de radios `--radius-sm/md/lg/xl/pill` (4/6/8/12px + píldora,
  `--radius-base` = `--radius-md`), escala de sombras
  `--shadow-sm/md/lg/overlay` (micro-sombras sutiles en vez de superficies
  planas), campo **outlined** en `CarbonCampo` (borde perimetral + radio +
  sombra + halo de foco, en vez de *filled*) y botón **secondary** con
  superficie clara + borde sutil en vez de bloque gris sólido. **No**
  cambia: paleta de color de Carbon, type set IBM Plex Sans/Mono, shell de
  48px/256px, contraste WCAG (`scripts/contraste.mjs` sigue en verde) ni la
  arquitectura de dos capas de tokens (`carbon-theme.css` vendor →
  `main.css` roles). Los valores de radio/sombra no son un regreso al
  sistema pre-Carbon retirado el 2026-09-02 (esa escala era 6/8/12/16px);
  la de acá es una calibración nueva de 4/6/8/12px. Se agregaron 8 tokens
  nuevos al guardrail `scripts/tokens-vs-guia.mjs` (`--radius-sm/md/lg/xl/
  pill`, `--shadow-sm/md/lg`). Detalle completo en `docs/GUIA-UX-UI.md`,
  "Geometría y elevación" → "Revisión Modern Clean Enterprise
  (2026-09-03)".
- **2026-09-03** (**Fase C1 de la convergencia a Carbon: piloto —
  `EmpresasView`**) — primer módulo migrado de los ~20 de la Fase C. Ensambla
  8 de los 9 componentes de `frontend/src/components/carbon/` (todos salvo
  `CarbonPasswordReveal`, sin objeto acá): `CarbonButton` (toolbar, footer de
  modal y estado vacío), `CarbonCampo` (los 2 campos del formulario),
  `CarbonDataTable` (tabla + tarjeta móvil desde una sola definición de
  columnas), `CarbonPagination`, `CarbonNotification` (error de carga y
  error de guardado) y `CarbonTag` (el contador `N empresas` del toolbar).
  Build, 368 tests y los 5 guardrails en verde sin tocar ninguno.
  - **Decisiones de mapeo que valen para las próximas ~20 vistas**: `.btn`
    sin modificador (el "Cancelar" de un modal, el botón del estado vacío)
    → `CarbonButton variante="secondary"`, no `tertiary` — ya lo decía el
    comentario de cabecera de `CarbonButton.vue` y acá se confirma en un
    consumidor real. `.badge-count`/`.badge--accent` (contador de toolbar)
    → `CarbonTag variante="accent"`: son el mismo par de tokens
    (`--color-accent-subtle`/`-text`), así que el cambio es 1:1 sin ajuste
    visual. `.icon-btn`/`.icon-btn.danger` de las acciones de fila **no**
    pasan a `CarbonButton`: son una clase global ya tokenizada (como
    `table`/`th`/`td`, que `CarbonDataTable` explícitamente no reimplementa)
    y ningún variante de botón de Carbon reproduce su "ghost + hover de
    color" sin agregar una variante nueva sin pedido.
  - **Gap encontrado en `CarbonDataTable`**: no anuncia el estado de carga a
    lectores de pantalla (`SkeletonTabla` es `aria-hidden`). Es un hueco del
    propio componente, no de esta vista — lo tapan hoy 20 `<p class="sr-only"
    role="status">` de las vistas sin migrar, uno por módulo. Se resolvió acá
    dejando ese mismo `<p>` como hermano de la tabla en vez de generalizarlo
    dentro del componente (que exigiría una prop nueva y tocar el componente
    recién verificado en Fase B); si el patrón se repite igual en C2, vale la
    pena esa prop.
  - **Footer de modal, todavía sin el estilo "al ras" de Carbon**: el pendiente
    de Fase B decía que iba "con el cambio a `CarbonButton` en cada modal" —
    esta es esa migración, y aun así no se tocó `.modal-actions`. Motivo:
    esa clase la comparten **39** consumidores del slot `#acciones`, la
    mayoría todavía con `.btn`; re-estilarla ahora rompería esos 38 footers
    para beneficiar a 1. Sigue pendiente, ahora con condición explícita:
    se aplica cuando una masa crítica de modales haya migrado, o antes si se
    agrega un modificador de opt-in a `Modal.vue`.
  - **Sin verificación visual**: `EmpresasView` vive detrás de
    `/configuracion`, que exige sesión de staff — mismo límite conocido que
    el resto del shell autenticado (`GOBERNANZA-DISENO.md` §5).
- **2026-09-02** (**Fase B de la convergencia a Carbon: biblioteca de
  componentes**) — seis componentes nuevos en
  `frontend/src/components/carbon/`, con 62 casos de render. **Ningún módulo
  cambia todavía**: la biblioteca convive con las clases de `main.css`, que
  se retiran recién cuando las vistas la adopten (Fase C).
  - **`CarbonButton`** — 5 variantes × 3 tamaños. Trae la jerarquía que
    faltaba (primary > secondary > tertiary > ghost > danger); `.btn` tenía
    4 variantes sin orden entre sí y **un solo alto de 36px**, que no es un
    paso de Carbon. El secundario de Carbon es un **gris sólido**, no un
    contorno — dos tokens nuevos (`--color-btn-secondary`/`-hover`). Los
    tamaños `xl`/`2xl` no se transcriben: sin consumidor en este panel.
  - **`CarbonCampo`** — el campo **filled**: fondo gris y una sola línea
    abajo, la firma visual más reconocible de Carbon y la que faltaba. Un
    componente en vez de los tres de Carbon porque el 90% es el mismo
    armazón, y tres archivos habrían sido tres copias de él. Agrega **error
    por campo** con `aria-describedby`, que el sistema no tenía: solo había
    un bloque al pie que dice qué falló, no dónde.
  - **`CarbonNotification`** — inline y toast. Unifica las **tres** formas
    que convivían de decir "pasó algo": `.toast` abajo a la derecha,
    `.aviso-card` arriba a la derecha y `.form-error` como único aviso
    inline. `role="alert"` solo para error; el resto `status`.
  - **`CarbonContentSwitcher` + `CarbonTabs`** — absorben los **tres**
    lenguajes de "seleccionado" que existían en tres archivos distintos.
    Tabs con `to` renderiza **enlaces**: hoy Configuración navega entre URLs
    con `<button>`, así que no se puede abrir una pestaña en ventana nueva
    ni copiar su dirección.
  - **`CarbonPagination`** — agrega filas por página y salto directo de
    página. Es superconjunto de props del anterior.
  - **`CarbonDataTable` extendido** — la **tarjeta móvil sale de la misma
    definición de columnas y de los mismos slots**. Es lo que vuelve rentable
    migrar un listado: las 17 vistas renderizan hoy cada fila dos veces, 609
    líneas de template duplicado (17% del template de módulos), y esa
    duplicación se desincroniza sola cada vez que se agrega una columna.
  - **Bug de contraste encontrado y corregido (CB-10)**: `.btn-primary`
    usaba `--color-text-inverse` — que cambia con el tema — sobre Blue 60,
    que no cambia. **En tema oscuro renderizaba texto casi negro sobre azul:
    3.41:1, por debajo de AA**, y lo mismo el contador del SideNav y el de la
    campana. Es anterior a Carbon y el proyecto ya lo había diagnosticado
    UNA vez (los `#fff` literales de `.btn-danger`, con el razonamiento
    escrito al lado) sin generalizarlo. Carbon separa los dos roles: se
    agrega `--color-text-on-color` (blanco en todos los temas) y
    `--color-text-inverse` queda con el suyo (texto sobre gris invertido,
    que ahora consume el ContentSwitcher). Corrección estructural del
    guardrail: tabla propia `TEXTO SOBRE RELLENO SÓLIDO` en `contraste.mjs`,
    que declara que el par no depende del tema — antes vivía en la tabla
    del tema claro afirmando el blanco que se **asumía**. Verificado en
    navegador: 5.00:1 en los dos temas.
  - **Pendiente declarado**: el footer de modal al ras (botones a ancho
    completo, sin gap) NO se aplicó. Con los `.btn` actuales de 36px
    estirados adentro quedaría medio migrado, que se ve peor que sin migrar;
    va con el cambio a `CarbonButton` en cada modal.
  - Suite: 333 → **368 pasan**, 0 en rojo. Tokens: 197 → 203, **0 sin
    documentar**. Los 5 guardrails en verde.
- **2026-09-02** (**Fase A de la convergencia a Carbon: base limpia**) — cierra
  la deuda que dejó el rediseno del día anterior, antes de construir encima.
  Ver el Ciclo 19 de `docs/HISTORIAL-AUDITORIAS.md` (CB-06..CB-09) para el
  detalle y la autocrítica.
  - **`BadgeEstado.vue` delega en `CarbonTag`.** El componente tenía 0
    importadores desde que se escribió: era código muerto con test. Ahora
    resuelve el dominio y delega la presentación. Dos efectos: `status` pasa a
    ser el punto de color de soporte de Carbon, y un valor que su dominio no
    conoce (los fallbacks `clase: ''`) cae a `neutral` en vez de renderizar un
    badge sin fondo — el estado desconocido era el único que no se veía como
    un estado. `CarbonTag` sube de 20 a 24px, el Tag `md` de Carbon, que es lo
    que `.badge` ya medía.
  - **Bug `.badge-inline`.** Se aplicaba en 8 archivos y estaba definida en 4
    hojas scoped idénticas: en los otros 4 no hacía nada. Consolidada en
    `main.css`; las 4 copias retiradas; el prop `inline` de `BadgeEstado`
    eliminado (no lo usaba ningún consumidor).
  - **Guardrail nuevo: `scripts/clases-muertas.mjs`** (el quinto). Falla ante
    una clase HUÉRFANA — aplicada sin definir — y reporta las MUERTAS como
    inventario sin fallar, porque durante la Fase C suben a propósito.
    Encontró 7 casos más de markup muerto además de `.badge-inline`, todos
    retirados. Huerfanas: **0**. Muertas: **93**, que es la lista de trabajo
    de la Fase D.
  - **NO DOCUMENTADO pasa de aviso a falla** en `tokens-vs-guia.mjs`. Era la
    meta de la Fase 2 del Plan Maestro; llegó a 0 con la reescritura de la
    guía y no se había registrado.
  - **Documentación reconciliada**: la sección `## Resumen` de
    `GUIA-UX-UI.md` describía el sistema retirado (shadcn/Geist/sombras) un
    día después de retirarlo — tercera vez que esa misma sección se queda
    atrás, ahora con una advertencia dentro; la contradicción interna sobre
    el inset de 2px, resuelta; el Ciclo 19 escrito con 10 filas obsoletas
    reconciliadas (U-01, DP-08, CC-06, CC-08, UX5-11, UX6-05, UX6-06, UX6-10,
    UX6-11 y el conteo de §4 de `GOBERNANZA`, que decía 6 decisiones
    pendientes cuando el script imprime 1); `PLAN-MAESTRO` §9 con Carbon
    insertado y las fases 8 y 9 (biblioteca de componentes y convergencia por
    módulo).
  - Suite: 332 → **333 pasan**, 0 en rojo. Espaciado: 460 → **453** literales.
    Los 5 guardrails en verde.
- **2026-09-02** (**IBM Carbon Design System v11 como estándar de UI/UX —
  rediseño total**) — decisión de producto: el sistema visual propio se
  sustituye completo por Carbon v11. Ver `docs/PANORAMA-SISTEMA.md` §6 para el
  argumento y `docs/GUIA-UX-UI.md` ("IBM Carbon v11 como estándar de UI/UX")
  para el criterio. Lo ejecutado, en orden:
  - **Capa de tokens en dos niveles.** Archivo nuevo
    `frontend/src/styles/carbon-theme.css`: los VALORES de Carbon (`--cds-*`,
    92 tokens — escalas de color, type set productivo, geometría, métricas y
    roles del UI Shell). `main.css` conserva los nombres de ROL y su bloque de
    tokens deja de tener un solo hex: cada rol apunta a un `--cds-*`. **No es
    la capa que se colapsó el 2026-09-01**: aquella eran dos nombres de rol
    para el mismo rol; esta es un rol apuntando a un valor de escala.
  - **Geometría y elevación.** `--radius-sm/md/lg/xl/pill` → `--radius-base`,
    que vale `0` (106 sustituciones). `--shadow-sm/md/lg/modal` →
    `--shadow-overlay`, una sola, y solo para capas teletransportadas: las
    tarjetas, tablas, campos y **modales** quedan planos. El foco pasa de un
    halo semitransparente de 3px a la línea sólida de 2px de Carbon (24
    reglas), blanca en oscuro y en el shell.
  - **Tipografía.** IBM Plex Sans + IBM Plex Mono reemplazan a Geist/Geist
    Mono en `index.html`. La escala se comprime de 8 pasos a los 5 del type
    set productivo (`--fs-label-01`, `--fs-body-01`, `--fs-heading-02/03/05`)
    y los iconos de 7 a 3 — 557 renombres de token en 67 archivos, mecánicos.
    Los interlineados y trackings de cada paso ahora se consumen de verdad
    (antes `body` tenía `line-height: 1.5` y los títulos un tracking negativo
    heredado de Geist).
  - **Shell.** `AppLayout.vue` reescrito como el UI Shell de Carbon: header
    fijo de 48px en Gray 100 + SideNav de 256/48px en Gray 90 + workspace en
    Gray 10. Aparece un header en desktop (antes solo existia en móvil) y
    suben a el la busqueda global, la campana y la identidad del usuario, asi
    que el SideNav queda solo para navegar. `AppNav.vue`, `AppSearch.vue`
    (ahora HeaderSearch expandible, con su panel teletransportado vía
    `usePopoverFlotante` en vez de su propia lógica de blur) y
    `NotificacionesCampana.vue` (ahora acción global, panel hacia abajo)
    reescritos para Gray 90/100. Configuración recupera ítem de nav propio.
    `MenuAcciones.vue` gana un slot `#trigger` para que el menú de usuario
    pueda ser un avatar sin heredar el hover claro de `.icon-btn`.
  - **Primitivas nuevas** en `frontend/src/components/carbon/`: `CarbonTag`
    (tag rectangular, 9 variantes semánticas, `código` en Plex Mono, `punto`
    en color `support-*`), `CarbonDataTable` (tabla de alta densidad
    declarativa: 32/40px, encabezado en Gray 20, hover `#e8e8e8`; el `colspan`
    del estado vacío y el skeleton salen de la definición de columnas, así que
    no pueden desincronizarse) y `CarbonPasswordReveal` (revelado auditado con
    cuenta regresiva visible de 8 segundos). El tercero **reemplaza cuatro
    copias** del patrón `•••••••• [ojo] [copiar]` (`CuentasPanel` en tabla y
    tarjeta, `CorreosView`, `LicenciasView`, `AccesosSensiblesView`), ninguna
    de las cuales ocultaba la credencial sola — en un panel que se usa
    compartiendo pantalla con el empleado al que se le entrega la cuenta.
  - **Guardrails.** `contraste.mjs` reescrito con los 69 pares de Carbon
    (nueva tabla `UI SHELL`, porque el shell es Gray 100/90 en ambos temas y
    no entra en claro/oscuro) y **ahora falla de verdad**: hasta este cambio
    imprimía "Total fallas: N" y salía con código 0 SIEMPRE, así que el paso
    de CI pasaba en verde con pares en rojo — el umbral estaba medido pero no
    era exigible. Se enciende ahora porque las cuatro tablas están en verde
    con margen (5.8-7.8:1 en las semánticas, contra 4.6-5.3:1 del sistema
    anterior). `tokens-vs-guia.mjs` aprende a leer las dos capas: exime la
    vendor de MUERTO y de CAPA DUPLICADA, con el motivo escrito, y reporta sus
    pasos sin mapear aparte (PALETA VENDOR). `literales-vs-tokens.mjs`
    actualiza su excepcion de sombra direccional y **vacia**
    DECISIONES_PENDIENTES: sus cuatro casos eran radios fuera de escala, y con
    un solo radio la pregunta desapareció. Los cuatro quedan en verde, y la
    deriva tokens/código/guia en **0 fantasma, 0 muerto, 0 sin documentar**
    (empezó en 55 sin documentar).
  - **Tests**: `frontend/tests/componentes/carbon.render.test.js`, 27 casos
    sobre las tres primitivas y el filtrado de permisos de `AppNav` (que un
    ítem visible que el guard bloquea no es un detalle estético: es un enlace
    que rebota al dashboard y escribe una fila de acceso denegado en cada
    clic). Suite: 305 → 332 pasan, 0 en rojo.
  - **Dos partes del pedido NO se ejecutaron como se pidieron, a propósito**:
    (1) "Configuración como pestaña exclusiva de JEFE" — de sus 7 pestañas, 6
    están abiertas a cualquier staff activo y solo `staff` declara
    `meta.roles`, así que esconderla le habría quitado 6 secciones que sí
    puede usar; (2) "preservando `empleados` abierto" — se dejó filtrado por
    `puedeVerModulo` como el resto: está habilitado por defecto para todo
    staff nuevo (la migración 056 siembra los 8), pero mostrarlo
    incondicionalmente sería pasarle por encima a `staff_modulos_permisos`.
    Además se corrigió un valor del pedido que no era de Carbon: Yellow 30 se
    dio como `#8a6d3b`/`#fcf8e3`, que son los del `.alert-warning` de
    Bootstrap 3; el de Carbon v11 es `#f1c21b`.
  - Documentación actualizada en el mismo cambio: `docs/GUIA-UX-UI.md`
    (sección nueva del estándar + palette/geometría/shell/tipografía
    reescritas + tabla de primitivas), `docs/GOBERNANZA-DISENO.md` (§1 matriz
    y jerarquía), `docs/PANORAMA-SISTEMA.md` (§6 decisión de producto),
    `AGENTS.md`, `README.md`.
- **2026-09-02** (Rediseño Materen, Fase 1 — Modal destructivo: el contenedor
  deja de teñirse)
  — Tercera entrega del kit. `.confirm-dialog--destructive` **se elimina por
  completo**: el modal destructivo pasa a usar el mismo shell neutro que
  cualquier otro (mismo borde, misma sombra, mismo overlay). Toda la señal de
  peligro queda en el ícono y el botón de la acción, como resuelven Material
  Design, Apple HIG y GitHub — ninguno tiñe el contenedor.
  **Razonamiento que queda escrito para no reabrirlo**: se evaluó subir el
  `border-top: 2px` rojo a borde completo y se descartó — un borde de color
  rodeando el modal entero se lee como "esto se rompió" (mismo lenguaje visual
  que un campo en error) y no como "prestá atención a esta decisión"; además
  contradecía la regla ya escrita para las cards, donde el contenedor nunca se
  tiñe por estado. Se revirtió el borde entero, no solo la excepción.
  El `.modal-icon` propio (círculo de 40px, `--icon-xl`) se retiró con él: el
  ícono reusa `.icon-box` + `.icon-box--danger` de la primera entrega — 32px y
  esquinas redondeadas en vez de un círculo de 40, un componente de ícono menos
  que mantener.
  **Lo que la revisión sumó**: (a) al quedar sin la única clase que alguna vez
  transportó, el prop `overlayClass` de `Modal.vue` se retiró — dejarlo era
  dejar abierto el gancho para justo el patrón que se acaba de descartar;
  (b) el ícono va en un `<span>`, no en un `<div>` como decía la propuesta: el
  slot `#titulo` se renderiza dentro de un `<span>` en `Modal.vue` y un `div`
  ahí es HTML inválido (flow content dentro de phrasing content) —
  `.icon-box` aplica `display:flex` igual sobre un span; (c) la vitrina de
  `DesignSystemView.vue` tenía su propia copia de la regla
  (`.confirm-dialog--destructive-demo`) y mostraba el patrón viejo: se
  actualizó, si no la página del design system documentaba algo que ya no
  existe.
  **Correcciones de deriva en `GUIA-UX-UI.md`**: la guía decía `border-top: 3px`
  cuando el código tenía 2px, y afirmaba que "cerrar asignación reutilizable"
  seguía usando `confirm()` nativo — está implementado con `ConfirmDialog`
  desde entonces y ya no queda ningún `confirm()` nativo en el código.
  **Sin cambios**, revisados y confirmados: ancho del modal (escala
  sm/base/detail/lg), overlay, animaciones, foco atrapado, y el patrón de X
  arriba + Cancelar abajo (la X es el escape por hábito; Cancelar le da a "no
  hacerlo" el mismo peso visual que a la acción destructiva en el punto de la
  decisión).

- **2026-09-02** (Rediseño Materen, Fase 1 — Avatar: 5 tonos determinísticos,
  una sola familia, tres implementaciones a una)
  — Segunda entrega del kit. **El avatar pasa de un tono único (azul de acento
  + borde de 1px) a 5 tonos categóricos + neutro**, asignados por hash del
  nombre completo (`tonoAvatar` en el nuevo `frontend/src/core/avatar.js`):
  determinístico, la misma persona cae siempre en el mismo tono en toda la app.
  Sin gradiente, sin borde, y sin distinguir "responsable" de "cualquiera" —
  esa distinción trataba el color como si comunicara peso de acción, y acá es
  identidad. Portado tal cual desde el Style Lab, que ya lo tenía validado.
  **Lo que la revisión encontró y el documento de diseño no cubría**: no había
  una implementación de avatar sino **tres**. Además de `.avatar`, el usuario
  del sidebar (`.sb-user-avatar`, 30px) y la ficha de empleado (`.emp-avatar`,
  40px) tenían la suya, **las dos con gradiente de marca**
  (`--color-accent` → `--color-accent-2`) y texto inverso — o sea, tratamiento
  privilegiado para el usuario propio y color de marca metido en una superficie
  de UI. Las dos migraron a `.avatar sm`/`.avatar lg`. Con eso
  `--color-accent-2` se quedó sin consumidores; como valía lo mismo que
  `--color-accent-hover` (dos nombres para un concepto, la "capa duplicada"
  que este archivo dice haber colapsado), se retiró en vez de dejarlo declarado
  sin razón.
  **Bug de estilos encontrado de paso**: `TicketDetallePanel.vue` pintaba el
  avatar "Sin vincular" con `class="avatar sm tfs-avatar-vacio"`, pero
  `.tfs-avatar-vacio` vive en el `<style scoped>` de `TicketsView.vue` y un
  scoped de padre no alcanza el interior de un componente hijo — ese avatar caía
  al `.avatar` base y se veía con el azul de acento, no neutro, mientras un
  comentario a 400 líneas afirmaba lo contrario. Resuelto al hacer global
  `.avatar--neutro`; `.tfs-avatar-vacio` se retiró.
  **También se consolidaron las iniciales**: había cuatro funciones,
  `TicketsView.vue` y `TicketDetallePanel.vue` idénticas carácter por carácter,
  y la de `EmpleadoDetalleView.vue` **no** pasaba a mayúsculas — dependía del
  `text-transform` que traía el CSS de `.emp-avatar`, así que al migrar a
  `.avatar` (que no lo trae) habría renderizado minúsculas. `inicialesDe` vive
  ahora en `core/avatar.js` con las mayúsculas en JS.
  **El Style Lab dejó de ser una copia**: consume `core/avatar.js` y las clases
  reales; sus `.sl-avatar--*` se borraron, así que lo que muestra ES lo que se
  ve en producción.
  Los 10 valores viven en tokens `--color-avatar-*` (no hex crudo en reglas:
  `literales-vs-tokens` es estricto en color) y sus 10 pares se verifican en
  `scripts/contraste.mjs`: **5.22:1 a 5.99:1 en claro, 6.64:1 a 7.34:1 en
  oscuro**. Test nuevo `frontend/tests/avatar.test.js` (13 casos) sobre lo que
  el CSS no puede garantizar: determinismo, que el vacío caiga en neutro, que
  nunca salga un color semántico y que la escala de 5 se use de verdad.
  Verificado: 4 guardarraíles en verde, build OK, 305 tests pasan / 34 se
  saltan / 0 en rojo.

- **2026-09-02** (Rediseño Materen, Fase 1 — kit de componentes: prioridad de
  4 niveles, `.btn-ghost`, `.icon-box`, principio de peso visual)
  — Bajada a código de las decisiones cerradas en la sesión de rediseño.
  **Prioridad de ticket pasa de 2 a 4 niveles de color** (`IndicadorPrioridad.vue`):
  `baja` y `media` compartían el gris neutro y eran indistinguibles entre sí
  —dos de los cuatro niveles de la escala no se leían—, ahora llevan
  `sky`/`teal`; `alta` y `urgente` suben de "punto + texto" a badge completo
  (`purple`/`danger`). Cero colores nuevos: los 4 pares ya existían en
  `main.css`. Los dos niveles altos **reusan la clase `.badge`** para el box en
  vez de copiar su `padding`/radio/tipografía, así que "mismo peso visual que un
  badge de Estado" es estructural y no una copia que se despega.
  **Efecto colateral corregido en `TicketsView.vue`**: la regla de fila activa
  subía los grises un escalón e incluía `.prio:not(.prio--urgente)` — con los
  colores nuevos habría pisado `baja`/`media`/`alta` y devuelto a gris el texto
  sobre el fondo purple del badge. Se retiró `.prio` de esa regla; los 4
  niveles pasan solos, verificado en `scripts/contraste.mjs` con 4 pares nuevos
  (`prioridadBaja`/`prioridadMedia` × `bg-elevated`/fila activa, el más
  ajustado 5.34:1), que reemplazan al par `prioridadUrgente` — dejó de existir
  cuando "Urgente" volvió a tener fondo propio.
  **`.btn-ghost`** se oficializa como cuarta variante de botón, y **`.icon-box`**
  como la única implementación del ícono en caja de color: las dos estaban
  prototipadas en el Style Lab (`.sl-btn-ghost`, `.sl-icon-box`) y nunca se
  habían portado. `.icon-box` usa `--space-10` en vez de un `32px` crudo —
  primer consumidor real de la escala de espaciado, que hasta acá era deuda
  declarada en `scripts/tokens-vs-guia.mjs`.
  **La consolidación se ejecutó, no quedó declarada**: `.feed-icon` (Dashboard,
  30px/`--icon-sm`) y `.soporte-accion-icono` (Soporte, 38px/`--icon-lg`) se
  borraron y sus dos vistas usan `.icon-box` — de 3 implementaciones del patrón
  a 1. En el Dashboard el modificador sale de `item.colorFamilia`, el mismo
  valor que ya alimentaba el `.badge` de la fila, y con eso la clase
  `feed-item--X` del `RouterLink` se quedó sin consumidores y también salió. En
  Soporte la variante sin color propio pasa de `neutral-bg` + `text-secondary`
  a `.icon-box--neutral` (`neutral-bg` + `neutral-text`): mismo fondo, el texto
  baja medio tono al par que ya usa `.badge--neutral`. **Cambio visual real y
  aceptado**: el ícono del feed crece 2px y el de Soporte se encoge 6px.
  `.btn-ghost`, en cambio, queda declarado sin consumidores todavía — su
  adopción es parte de la pantalla completa de Tickets, el siguiente paso.
  **Separación ícono↔texto del buscador**: `.search-wrap` pasa de 11/34 a 14/38
  (el placeholder quedaba pegado al ícono; hallazgo del Style Lab,
  `--sl-input-icon-*`, tampoco portado).
  **Principio nuevo en `GUIA-UX-UI.md`**: "peso visual proporcional al
  significado", 5 escalones de superficie con la regla de desempate "ante la
  duda, el más bajo". Es lo que justifica que Prioridad `alta`/`urgente` vuelva
  a tener forma de píldora, así que se corrigió también la afirmación "Estado es
  la única píldora de color de la fila", que dejó de ser literal.
  **Sin cambios**: tabla (`ThOrdenable.vue` ya atenuaba el ícono de orden a
  `opacity: 0.5` en columnas inactivas — verificado, era lo que se buscaba),
  paginación, `EmptyState.vue`, densidad de fila, `.card`/`.stat-card`, y el
  azul de marca. Modal y Avatar quedan pendientes del kit.
  Verificado: 4 guardarraíles en verde (`tokens-vs-guia`, `contraste`,
  `literales-vs-tokens`, `patrones-ui`), build OK, 292 tests pasan / 34 se
  saltan / 0 en rojo.

- **2026-09-02** (Dashboard: "Mi trabajo" entra, dos cifras redundantes salen)
  — Primer módulo de la pasada módulo por módulo, con libre criterio y la
  restricción de no tocar colores ni tipografía.
  **Lo que faltaba, medido**: el feed de pendientes cubre lo que NADIE tomó
  (sin asignar, sin vincular) o lo que se pasa de tiempo (+3 días). Un ticket
  **asignado a mí, en curso y de ayer no aparecía en ninguna parte del
  Dashboard** — que es justamente lo que un técnico abre la app para ver.
  `asignado_a` existe desde siempre y esta pantalla no lo usaba.
  **Nueva columna "Mi trabajo"**, en el sitio que ocupaba "Últimos empleados":
  mis tickets vigentes por urgencia, tope 5, con "ver mis N tickets" que dice
  el total real y no el de los mostrados. Vacío se trata como buena noticia
  ("Sin tickets asignados", tratamiento discreto de `.todo-ok`), no como un
  `EmptyState` con ilustración — no hay nada que ir a crear.
  **Retirado "Últimos empleados"**: respondía "quién entró hace poco", una
  pregunta sin decisión asociada, y desde que existe el pendiente "Alta sin
  completar" el feed ya muestra el subconjunto que sí pide acción. Con él
  quedó sin consumidor `listEmpleadosRecientes()`, retirada del API.
  **Retiradas 2 stat-cards del Resumen**: "Contraseñas por rotar" y "Licencias
  por vencer" duplicaban filas del feed de arriba con MENOS información — el
  feed dice cuáles, desde cuándo y lleva a cada una; la tarjeta decía un
  número. La de rotación era el caso extremo: **su única acción era hacer
  scroll hacia el feed que tenía justo encima** (lo decía su propio
  comentario). Con ellas se fueron `irAFeedPendientes()` y el ancla
  `id="pendientes-feed"`, que era su destino — y con el ancla, una advertencia
  de lint preexistente. El Resumen queda con 7 tarjetas, todas de inventario:
  responden "cuánto hay" y sirven de entrada al módulo.
  **Nueva `ordenarPorUrgencia()`** en `core/dominio-tickets.js`: prioridad
  descendente y, dentro de la misma, el más antiguo primero. El ranking se
  **deriva del orden de `PRIORIDADES_TICKET`** en vez de escribir una segunda
  lista — la deriva entre dos listas paralelas es el problema que costó varios
  ciclos. Una prioridad desconocida va al final, no arriba. 8 tests.
  **Nueva `dashboardApi.misTickets()`**: trae todos los asignados vigentes y
  recorta en memoria a propósito — PostgREST no puede ordenar por la escala de
  prioridad (es `text+check`, no un enum ordenado), así que un `.limit()` del
  servidor recortaría por el orden equivocado. El límite del enfoque quedó
  anotado en el código: si un técnico llega a acumular cientos, la salida es un
  RPC con `ORDER BY CASE`, no ordenar en el cliente.
  El CSS nuevo usa la escala de espaciado: el trinquete bajó de 475 a 472.
  Sin esquema, sin migración, sin color ni tipografía nuevos.
  Verificación: build OK, lint 0 errores (7 warnings preexistentes, una menos
  que antes), **292 tests pasan** / 34 se saltan / 0 fallan, los 4 guardrails
  en 0 fallas.
  **Sin verificar**: el render en navegador. Y "Mi trabajo" aparecerá vacío
  para cualquiera que no tenga tickets asignados, que con 3 usuarios de staff
  activos puede ser el caso más común — es el comportamiento correcto, pero
  conviene saberlo antes de mirarlo.
- **2026-09-01** (la guía de alta ejecuta: de texto informativo a acciones) —
  Continuación del cambio anterior, con libre criterio y una sola restricción
  del JEFE: no tocar colores ni tipografía.
  Iba a construirse el asistente de 4 pasos en modal del prototipo. Al abrir el
  código la conclusión fue otra: **la ficha del empleado YA era la superficie
  donde ocurren los cuatro pasos** — `CuentasPanel`, `AsignarEquipoModal` y
  `AsignarLicenciaModal` viven ahí desde antes. Un asistente aparte habría
  duplicado el mecanismo, el patrón que este proyecto viene combatiendo. Lo
  que faltaba era que la guía **conectara** con ellos.
  **Los pasos pasan de describir a ejecutar.** Cada paso pendiente trae su
  botón y abre el formulario que corresponde, en el sitio. Antes la guía decía
  qué faltaba y dejaba al usuario buscando el botón correcto más abajo en la
  página — precisamente por lo que las altas se completaban a medias.
  `CuentasPanel` expone `abrirNueva()` (mismo patrón de `defineExpose` que
  `Modal.vue`) para que el paso "Cuenta" dispare su formulario sin cacería.
  **`pasosAlta()` y `altaLista()` se extrajeron a `core/dominio-empleados.js`**:
  *qué hace falta para que alguien pueda empezar a trabajar* es una regla de
  negocio, no de presentación — y dentro de la vista no era probable. La vista
  solo engancha qué botón abre qué modal. 8 tests nuevos.
  **El listado de Empleados también lo muestra.** El chip de cuentas de la fila
  ya distinguía "0 cuentas" con un tono apagado; ahora, cuando además es un
  alta reciente, toma el tono de atención. Cero cuentas no significa lo mismo
  en alguien que entró la semana pasada que en alguien de hace dos años. **Sin
  elementos nuevos en la fila y sin consultas nuevas**: el listado ya traía los
  conteos (`enriquecer()` del store).
  **Par de contraste nuevo, detectado y verificado**: `.vinculo--pendiente` usa
  `--color-warning-text` como texto suelto sobre la superficie de la tabla, no
  dentro de una píldora `--warning-bg`. Es un par que `contraste.mjs` no
  cubría — mismo caso que ya motivó `prioridadUrgente`. Agregado en ambos
  temas: 6.09:1 en claro, 10.16:1 en oscuro.
  El CSS nuevo del banner usa la escala de espaciado (`--space-*`), así que el
  trinquete bajó de 480 a 475 literales y se consolidó con `--fijar-base`.
  Sin esquema, sin migración, sin endpoint, sin color ni tipografía nuevos.
  Verificación: build OK, lint 0 errores, **284 tests pasan** / 34 se saltan /
  0 fallan, los 4 guardrails en 0 fallas.
  **Sin verificar**: el render en navegador de la guía rediseñada y del chip de
  la lista.
- **2026-09-01** (alta de personal: la asimetría con la baja, y el estado
  "alta incompleta" en producción) — Pedido de un rediseño funcional. El
  diagnóstico salió del propio código: la **baja** es una tarea atómica desde
  la migración 038 (`dar_baja_empleado`, 4 escrituras en una transacción, un
  botón) mientras que el **alta** son cuatro visitas a cuatro módulos
  (Empleados → Correos → Licencias → Equipos) sin nada que garantice que se
  completen. Media alta quedaba como una persona Activa sin correo ni equipo,
  **sin dejar rastro**.
  Antes de construir se encontró que la "alta guiada" **ya existía a medias**:
  un banner de 3 pasos en `EmpleadoDetalleView.vue`. Construir un asistente
  aparte habría duplicado el mecanismo — el mismo patrón que se viene
  combatiendo—, así que se extendió lo existente en vez de reemplazarlo.
  **Nuevo `altaIncompleta()`** (`core/dominio-empleados.js`): regla pura —
  persona Activa, alta hace ≤30 días, 0 cuentas activas. No exige equipo ni
  licencia a propósito: dependen del cargo, y exigirlos marcaría media planilla
  de campo hasta volver el aviso ruido (mismo motivo por el que se retiró el
  backlog por antigüedad de Tickets). 12 tests, incluidos los bordes de la
  ventana, fecha futura, fecha ilegible y ausencia de conteos.
  **Nuevo `empleadosApi.altasIncompletas()`**: una consulta con embed dentro de
  la ventana. **Riesgo real detectado y cerrado**: `asignaciones_cuenta` está
  gateada por el módulo `correos` en RLS (migración 068) — un ASISTENTE sin ese
  módulo recibe el embed vacío y **todos** los empleados recientes parecerían
  sin cuenta. El gate vive en `DashboardView.vue` (`puedeVerModulo('correos')`),
  igual que el de las stat-cards, porque la capa de API no conoce la sesión.
  **Categoría "Alta sin completar"** en `pendientesFeed.js`: tier 2 los primeros
  días —un alta en curso no es un olvido— y tier 1 pasados 3, con el mismo
  criterio de "Ticket abierto +3 días" que ya usaba ese archivo. 9 tests de
  orden y tier, verificados por mutación (mover el umbral de 3 a 30 los pone en
  rojo).
  **El banner de la ficha deja de depender del query param.** Antes vivía solo
  en `?nuevo=1`: cerrar la pestaña o llegar desde el buscador lo perdía y nada
  volvía a avisar de que el alta quedó a medias. Ahora deriva del estado real;
  la X silencia el caso "recién creado" pero no un pendiente de verdad, del
  mismo modo que ningún otro pendiente del sistema se marca como visto.
  `insforge-api-shape.test.js` obligó a registrar el método nuevo — hizo
  exactamente su trabajo, la superficie del API no puede crecer en silencio.
  Sin esquema nuevo, sin migración, sin endpoint nuevo. Ver
  `docs/PLAN-MAESTRO-MATEREN.md` §6.4 y `PANORAMA-SISTEMA.md` §7.
  Verificación: build OK, lint 0 errores, **267 tests pasan** / 34 se saltan /
  0 fallan, los 4 guardrails en 0 fallas.
  **Sin verificar**: el render en navegador del banner y de la fila nueva del
  feed. Y el conteo real de altas incompletas en producción es desconocido: la
  categoría puede aparecer vacía (bueno) o con más filas de las esperadas.
- **2026-09-01** (colapso del Frankenstein: un nombre por concepto, la guía
  deja de ser un changelog) — Observación del JEFE, que diseñó la plataforma:
  *"se creó tokens, se tiene documentación, pero llega un momento donde esa
  información también se convierte en un Frankenstein"*. Medido, era exacto.
  **Tokens: 190 → 114.** Había dos nomenclaturas paralelas para los mismos
  conceptos —104 `--mat-*` con el valor y 86 alias sin prefijo, de los cuales
  **76 eran puro puente**— y `main.css` marcaba la capa sin prefijo como "no
  usar en código nuevo" mientras el código la usaba el **86% de las veces**
  (1258 usos contra 208). Se colapsó a un nombre por concepto: 76 puentes
  borrados, prefijo `--mat-` retirado de 532 ocurrencias en 32 archivos.
  **Verificado token por token** antes y después: los 114 resultantes resuelven
  al MISMO valor en claro y en oscuro, 0 diferencias. Los alias que quedan son
  **semánticos** (`--color-accent: var(--color-brand-600)`): nombran un rol
  distinto, no el mismo valor dos veces. Efecto colateral notable: los tokens
  sin documentar en la guía cayeron de 101 a 43 — la mitad del problema de
  documentación era documentar dos nombres para lo mismo.
  **La guía: 2 335 → 1 877 líneas.** 536 de ellas eran ocho apartados
  consecutivos ("tercera pasada", "cuarta"… hasta "Shell único") narrando cómo
  se llegó al estado de los filtros de Tickets, dentro de un documento que dice
  ser referencia del estado actual. Para saber cómo funcionan hoy había que
  leer los ocho y deducir, y varios se contradecían porque el posterior
  superaba al anterior sin decirlo — esa es la causa raíz de todo el Ciclo 16.
  Esa narración ya vivía completa en este mismo changelog, que hasta apunta de
  vuelta a cada sección. Reemplazadas por **una** sección de estado vigente (78
  líneas), escrita **contra `TicketsView.vue`**, no sintetizando los relatos:
  un relato describe el día en que se escribió, el código describe hoy.
  **Vocabulario**: "Isla" (nombre de modo retirado en ago 2026, sin rastro en
  el código) seguía en la guía en 15 lugares, incluida la explicación de cómo
  alternar entre modos. Unificado a "Triage"; la metáfora visual ("las tres
  islas") se conserva porque describe la forma, no el modo.
  **UI, visible para el usuario**: 7 tablas tenían la cabecera de acciones
  oculta (`sr-only`) y 7 la tenían visible — la misma columna escrita de dos
  formas según el módulo. La regla del sistema decía texto visible desde ago
  2026 y **nombraba** los módulos a corregir; la ronda solo llegó a Empleados.
  Corregidas las 7, más una que ningún repaso había mirado
  (`ImportarEquiposView`, columna "Migrar"): las 14 tablas coinciden.
  **Dos guardrails nuevos**: CAPA DUPLICADA (`tokens-vs-guia.mjs`) impide que
  vuelva a crecer una capa de nombres duplicados, distinguiéndola de un alias
  semántico legítimo; `th-sin-texto-visible` (`patrones-ui.mjs`, 4.ª regla)
  impide que una cabecera vuelva a quedarse sin texto. **La primera versión de
  este segundo check estaba mal** —quitaba las etiquetas y el texto del
  `sr-only` seguía contando como visible, así que no detectaba nada—; se
  corrigió tras verificarlo por mutación, y al hacerlo encontró el caso de
  `ImportarEquiposView`.
  **Autocrítica**: la migración de espaciado del cambio anterior usó
  `var(--mat-space-N)` en archivos que consumían `--color-*` en todo lo demás,
  metiendo una tercera forma de nombrar. El colapso lo resuelve de paso.
  Verificación: build OK, lint 0 errores, 255 tests pasan / 34 se saltan / 0
  fallan, los 4 guardrails en 0 fallas.
  **Sin verificar**: el render en navegador de las 8 cabeceras que pasaron a
  texto visible — es el único cambio de esta tanda con efecto visual, y puede
  ensanchar levemente esa columna.
- **2026-09-01** (tests de render: se corrige una conclusión propia y se cierra
  el hueco que sí era cerrable) — La entrada anterior descartó la "validación
  visual" entera por depender de secrets de CI. Eso mezclaba **dos problemas
  con viabilidad opuesta**, y la mitad del descarte estaba mal:
  la **captura en navegador** de pantallas autenticadas sí necesita servidor +
  backend + sesión de staff, y sigue bloqueada; el **render de componentes** no
  necesita nada de eso, y se descartó por arrastre.
  Incorporado: `@vue/test-utils` + `happy-dom` como devDependencies (0
  vulnerabilidades) y `frontend/tests/componentes/` — **40 tests en 3
  archivos**, suite total 215 → **255**. El entorno DOM se pide **por archivo**
  con `// @vitest-environment happy-dom`; `vitest.config.js` conserva
  `environment: 'node'` por defecto a propósito, para que los tests de lógica
  pura no paguen el costo de un DOM que no usan. Se agregó `plugins: [vue()]`
  (necesario para transformar `.vue`) y un alias de assets de `public/`
  referenciados con ruta absoluta → `tests/stubs/asset-publico.js`, mismo
  patrón que el stub ya existente del SDK.
  Qué cubren y por qué esos tres: **`Modal.render.test.js`** — el contrato de
  accesibilidad del modal compartido (`role=dialog`, `aria-modal`, que
  `aria-labelledby` **resuelva** a un elemento real, el guard `confirmarCierre`
  que evita perder datos con una tecla, bloqueo/restauración del scroll,
  Teleport). `patrones-ui.mjs` verifica que nadie evite el modal compartido;
  esto verifica que él cumpla — si se rompe, los 26 consumidores se rompen a la
  vez y en silencio. **`estados.render.test.js`** — vacío, sin dato, paginación
  y badge de dominio, que consume casi toda vista; incluye el repliegue de
  página cuando un filtro encoge el resultado, y que `TextoVacio` **no** trate
  el `0` como vacío. **`ErrorRedView.render.test.js`** — la pantalla de sin
  conexión, que no tiene ruta propia y solo aparece cuando nada más funciona,
  más el discriminante `esErrorRed`, que si fallara mostraría "sin conexión"
  ante un 403 de RLS.
  **Verificado por mutación, no por confianza**: quitar `aria-modal="true"` de
  `Modal.vue` hace fallar su test; restaurarlo lo devuelve a verde.
  **Lo que sigue sin cubrirse, dicho con precisión**: estos tests prueban
  estructura y comportamiento, **no apariencia** — `happy-dom` no calcula
  estilos. El layout, el espaciado compuesto y el contraste en situ siguen sin
  verificación automática, y la captura en navegador sigue con su disparador
  escrito (los secrets de CI). Ver `docs/GOBERNANZA-DISENO.md` §5 y §6.
  Verificación: build OK, lint 0 errores, **255 tests pasan** / 34 se saltan /
  0 fallan, los 4 guardrails en 0 fallas.
- **2026-09-01** (cierre del ciclo de calidad: 4 guardrails, gobernanza y
  adopción del espaciado) — Continuación con encargo explícito de no volver a
  auditar ni rediseñar, sino construir mecanismos. Partió de analizar qué NO
  garantizaba `tokens-vs-guia.mjs`: compara *nombres* de token, pero no ve los
  valores dentro de los `<style>`, no verifica que un `var()` resuelva y no
  mira el marcado. Tres huecos, tres mecanismos.
  **Bug vivo encontrado por el mecanismo nuevo**: `--color-text-disabled`
  existía en ambos temas pero su alias `--color-text-disabled` **nunca se
  creó**, y `MenuAcciones.vue` (×2) y `.celda-sep` lo consumían sin fallback —
  un `var()` sin definir es inválido en tiempo de cómputo, así que la
  declaración se descartaba y **los ítems deshabilitados no se veían
  deshabilitados**. Build, lint, 215 tests y contraste pasaban todos. Alias
  creado; check REFERENCIA ROTA agregado para que no vuelva a pasar
  inadvertido.
  **Nuevo `scripts/literales-vs-tokens.mjs`**: detecta valores a mano que
  deberían ser token, distinguiendo literal legítimo (scrim sobre una foto del
  usuario, 50% de círculo, la vitrina del Design System) de literal que
  codifica una regla. Dos regímenes según lo que el árbol aguanta: **estricto**
  (0 exigido) en color/radio/sombra/tipografía —medidos y casi limpios, así que
  el check impide que se ensucien— y **trinquete** en espaciado, con línea base
  en `scripts/literales-base.json`: falla solo si el número SUBE, de modo que
  la deuda solo puede encoger. 6 excepciones declaradas con formato obligatorio
  motivo/alcance/impacto.
  **Nuevo `scripts/patrones-ui.mjs`**: 3 invariantes de marcado (modal hecho a
  mano en vez del `<Modal>` compartido, `<img>` sin `alt`, botón solo-ícono sin
  nombre accesible). Las 3 en verde: es trinquete contra la regresión, no
  cazador de bugs — protege el hallazgo más caro del 2026-08-31, que corrigió 8
  modales a mano sin que nada impidiera su vuelta. Encontró igualmente un caso
  real: la fila de alta rápida de `ProblemaDetalleView.vue` tenía el `<select>`,
  el `<input type=date>` y el `<button>` de envío sin nombre accesible — el
  mismo patrón que ese ciclo corrigió en ese archivo, dejando los otros tres de
  la misma fila.
  **Adopción del espaciado, arrancada**: `components/shared/` migrado (61
  declaraciones, 12 componentes; 541 → 480 literales), solo donde TODOS los px
  de la declaración coinciden exactamente con un paso; los 12 pasos se
  verificaron contra `main.css` antes de escribir, así que la sustitución es
  visualmente nula por construcción. También 11 radios de coincidencia exacta
  migrados a `--radius-*` en 9 archivos, y el velo `rgba(12,15,17,.55)` —el
  mismo valor escrito a mano en `.modal-bg` y en `.sb-overlay`— tokenizado como
  `--color-overlay`.
  **Nuevo `docs/GOBERNANZA-DISENO.md`**: matriz de fuente de verdad /
  implementación / validación para 16 elementos, los tres regímenes, la
  política de excepciones y —tan importante como el resto— **qué NO está
  verificado y por qué**.
  **Validación visual: conclusión técnica, no incorporada.** No existe ninguna
  infraestructura (sin Playwright/Cypress/Storybook/`@vue/test-utils`/jsdom;
  `vitest` corre en `environment: node`) y **ninguno de los 215 tests renderiza
  un componente**. No se incorpora hoy porque un smoke de las pantallas que
  importan necesita los mismos secrets que ya tienen a `test-integration` en
  rojo y a `tests-db` omitiéndose: sería un tercer check que no corre, el
  antipatrón de Q-01. Disparador y paso mínimo escritos en `GOBERNANZA-DISENO`
  §5, y Fase 7 del Plan Maestro.
  **3 decisiones pendientes registradas, no resueltas** (todas cambian el
  render): 14px es uno de los valores de espaciado más usados (~55) y no tiene
  paso en la escala; 4 radios fuera de escala; `--color-whatsapp-text` es
  el verde petróleo de la marca retirada, con una justificación que cita una
  marca que ya no existe.
  Verificación: build OK, lint 0 errores (8 warnings preexistentes, ninguno en
  archivos tocados), 215 tests pasan / 34 se saltan / 0 fallan, y los 4
  guardrails en 0 fallas. Los dos trinquetes se probaron inyectando una
  regresión (exit 1) y revirtiéndola (exit 0).
  **Sin verificar**: nada en navegador — ver arriba, es justamente el hueco
  que queda con conclusión escrita.
- **2026-09-01** (Plan Maestro: se escribe el blueprint que faltaba y se hace
  ejecutable la guía) — Pedido de "rediseño total" de MATEREN. El
  descubrimiento cambió la respuesta: el sistema no necesitaba rediseño
  visual (tokens en dos temas con contraste verificado en CI, jerarquía de
  bordes medida contra WCAG, shell unificado, Dashboard ya construido sobre
  un feed de pendientes ordenado por urgencia, 15 ciclos de auditoría con
  cada hallazgo cerrado). Lo que sí faltaba eran dos cosas concretas.
  **(1) El Plan Maestro no existía por escrito**: se venía ejecutando desde
  esa misma mañana como tres viñetas en `PANORAMA-SISTEMA.md` §6 y
  comentarios sueltos en `AppNav.vue`/`TicketsView.vue`/
  `EmpleadoDetalleView.vue`/`AsignarEquipoModal.vue`/`AsignarLicenciaModal.vue`.
  Nuevo `docs/PLAN-MAESTRO-MATEREN.md` con diagnóstico, tesis, recomendación
  de nombre/marca, veredicto módulo por módulo, límites reales de datos/API,
  6 fases y una lista de "qué NO hacer".
  **(2) Las reglas de diseño estaban narradas, no ejecutadas** — la causa
  raíz detrás de DS-01..05, INV-05, DP-04, DP-05, DP-06 y Q-01, corregida a
  mano un caso por ciclo durante quince ciclos. Nuevo
  `scripts/tokens-vs-guia.mjs` (en CI junto a `contraste.mjs`): compara los
  tokens que `main.css` define, los que el código consume — con
  alcanzabilidad transitiva, para que la capa de alias `--color-*` no
  produzca falsos muertos — y los que documenta `GUIA-UX-UI.md`. En su
  primera corrida encontró **5 derivas reales** (dos secciones de la guía con
  el mismo título afirmando lo contrario entre sí; el anillo de foco descrito
  con el valor navy que el código no tenía desde G3; 3 tokens de marca
  borrados esa misma mañana y todavía nombrados; `--color-focus`/
  `--color-focus-ring` citados sin haber existido nunca). Tirando de ese hilo
  apareció una sexta, la de peor consecuencia: la sección "Sombras y radios"
  decía mostrar "valores reales de `main.css`" con `--shadow-*: none` y
  `--radius-lg/xl: 14px`, los cinco falsos desde G4 — y esa premisa falsa
  había hecho que el "Repaso de consistencia" anotara una **limpieza pendiente
  en 8 archivos que no existía**. Además, **27 tokens sin
  ningún consumidor**, entre ellos la escala de espaciado completa: 10 de sus
  12 pasos muertos, todo el espaciado del sistema hardcodeado en px.
  Las 5 derivas quedaron corregidas (2 secciones caducas borradas/reescritas
  + región `<!-- tokens-retirados -->` para que documentar un retiro no cuente
  como deriva); los 27 tokens quedaron en `DEUDA_DECLARADA` con su motivo
  escrito en el propio script, no borrados: la escala de espaciado hay que
  adoptarla, no eliminarla (Fase 3 del plan).
  **Contradicción constitucional cerrada**: el principio "sin bordes de acento
  en los costados" contradecía la práctica desde hacía meses y una nota dentro
  de él pedía que el JEFE decidiera — ese pedido tenía bloqueada la selección
  múltiple de Tickets (`TK1`/`TK2`). La decisión de producto de esta misma
  fecha lo resolvió; el principio quedó reescrito como "ningún acento
  estructural supera 2px" y el pendiente, cerrado.
  **Marca**: los 6 sitios que escribían "Materen — Sistema TI" a mano
  (`AppLayout` ×3, `LoginView`, `pdfReporte`, `acta-base` ×2) pasan a consumir
  `core/marca.js`, que ya era la fuente de verdad y nadie usaba ahí; la única
  excepción real (`index.html`, HTML estático sin acceso a JS) quedó anotada
  dentro de ese archivo. Sin cambio visible: prepara el retiro del descriptor
  "Sistema TI" para cuando llegue su disparador (el primer módulo no-TI), sin
  ejecutarlo hoy.
  Verificación: build OK, `npm run lint` 0 errores (8 warnings preexistentes,
  ninguno en archivos tocados), 215 tests pasan / 34 se saltan / 0 fallan,
  `contraste.mjs` 0 fallas, `tokens-vs-guia.mjs` 0 fallas.
  **Sin verificar**: nada visual en navegador — no hubo canal de captura
  disponible en esta sesión. Los cambios de UI son sustitución de literales
  por la constante equivalente, sin efecto de render esperado.
- **2026-09-01** (decisión de producto: azul confirmado como dirección final
  de marca) — Cerrada una contradicción real dentro de `GUIA-UX-UI.md`: la
  sección "Identidad de marca" decía correctamente que el azul estaba en
  producción desde el 2026-08-27, pero la sección "Paleta de colores", más
  abajo en el mismo archivo, seguía describiendo el navy/mint (nunca portado)
  como vigente y el azul como "pendiente de portar" — justo lo opuesto.
  Corregidas ambas tablas ("Fondos y texto", "Acento/identidad") para
  reflejar los valores reales de `main.css`, sin tabla "pendiente" duplicada.
  De paso, `main.css` pierde `--color-brand-elevated`/`-ink` (verde
  petróleo del logo anterior, cero consumidores reales, sin rol declarado) y
  su alias `--color-brand-ink` — `--color-brand` se conserva (`#0082FB`,
  también sin consumidores, pero reservado a piezas de marca). Ver
  `docs/GUIA-UX-UI.md`, "Identidad de marca" y "Paleta de colores".
- **2026-08-31** (auditoría profunda de consistencia de diseño — 3 patrones sin
  unificar) — Pedido directo: "hay algo que no cuadra los diseños... no habría
  guía" — label vs. placeholder inconsistente y paginación fija vs. scrolleable
  citadas como síntomas, más un pedido explícito de algo "más profundo" que un
  parche puntual. 3 agentes de exploración en paralelo (verificando contra
  código real, no reportando sospechas) confirmaron **3 patrones concretos**,
  los 3 con la misma causa raíz: un componente/patrón mejor se aplicó a una
  parte del sistema y nunca se retrofiteó al resto ni quedó escrito en
  `GUIA-UX-UI.md` como "la forma vigente" — mismo mecanismo que ya causó
  UX6-03. Se descartaron 4 candidatos ya consistentes (toolbar, filtros,
  botones de footer de modal, confirmaciones destructivas) sin tocarlos.
  **Hallazgo 1 — Paginación fija vs. scrolleable**: `<Pagination>` migrado de
  dentro de `.table-wrap` (scrollea con las filas) a afuera, como hermana, en
  las 7 vistas que no habían pasado por el cambio: `ReporteSatisfaccionView`,
  `TiposEquipoPanel`, `UbicacionesPanel`, `AreasObrasPanel`, `PlataformasView`,
  `ActividadView`, `EmpresasView`. `equipos/ImportarEquiposView.vue` se dejó
  igual a propósito (sin evidencia de que esté mal). Snippet desactualizado en
  `GUIA-UX-UI.md` corregido (documentaba el patrón viejo como si fuera el
  vigente) y el conteo real pasó de "10 vistas" a las 17 reales.
  **Hallazgo 2 — `Modal.vue` compartido vs. `modal-bg` hecho a mano**: el más
  serio, mismo hueco de accesibilidad de UX6-03. Migrados los 7 archivos
  restantes (8 modales): `EmpresasView.vue` (el más urgente — no tenía NINGÚN
  manejo de teclado/foco, ni siquiera `useCerrarConEscape`), `EquipoForm.vue`,
  `EquiposView.vue` (modales "Entregar", "Devolución" y "Hoja de vida"),
  `LicenciaForm.vue`, `LicenciasView.vue` ("Asignar asiento"),
  `TicketInternoForm.vue` y `ReporteTicketsModal.vue`. `EquipoForm.vue`,
  `LicenciaForm.vue` y `TicketInternoForm.vue` pasaron a usar
  `useFormularioModal.js` (el mismo andamiaje ya compartido por los otros 7
  formularios sobre `<Modal>`). Con esto los composables hand-rolled
  `useCerrarConEscape.js` y `useFocoAtrapado.js` quedaron sin ningún uso real
  en todo el código — **eliminados**.
  **Hallazgo 3 — Label vs. placeholder**: acotado a 4 campos reales (no un
  problema generalizado — 23 de ~27 formularios ya seguían el estándar sin
  excepción): "texto de la pregunta" en `EncuestaForm.vue`, "nueva acción
  correctiva" y "código de ticket a vincular" en `ProblemaDetalleView.vue`, y
  "nombre de la ubicación nueva" (×2, desktop/mobile) en `EquiposView.vue` —
  los 4 son widgets de alta rápida embebidos en una fila, sin label visible NI
  `aria-label`. Se agregó `aria-label` explícito a los 4 (criterio ya usado por
  `CategoriasTicketPanel.vue`) y placeholders de ejemplo de formato en vez de
  vacíos. Regla documentada en `GUIA-UX-UI.md` (no existía escrita, aunque el
  95% del código ya la seguía).
  Verificación: build + test **después de cada archivo**, no todo junto al
  final — 215 pasan / 34 se saltan / 0 fallan en cada corrida.
  `node scripts/contraste.mjs`: 0 fallas (no se tocó color). Smoke test con
  Playwright (Chromium headless) sin sesión: la app carga sin errores de JS.
  **Sin verificar**: el comportamiento real de teclado/foco/Escape de los 8
  modales migrados — no hay credenciales de staff de prueba disponibles
  localmente (`INSFORGE_TEST_STAFF_*` son secretos de CI, no están en el
  repo). Vale la pena que alguien con sesión abra "Nueva empresa", "Nuevo
  equipo", "Entregar", "Devolución", "Asignar asiento" y "Nuevo ticket
  interno" y confirme Tab/Shift+Tab/Escape — mismo límite ya declarado para
  `EmpleadoForm.vue` en la pasada anterior. Fichado en
  `docs/HISTORIAL-AUDITORIAS.md` (UX6-03).
- **2026-08-31** (revisión de `AGENTS.md` como documento para agentes + cierre
  de dos deudas que la revisión destapó) — Pedido directo: auditar `AGENTS.md`
  a partir de una crítica externa. De esa crítica, **verificado contra el
  código**: 6 puntos ciertos, 3 falsos por estar desactualizados (el peor: daba
  por abierto el hallazgo **P0-05**, cerrado por la migración 073 desde el
  2026-08-18, y proponía asignarle dueño y sacar su "test rojo" a un job de CI
  aparte — ese test está en verde; también proponía pinnear `@insforge/sdk`, ya
  exacto en `1.5.2` sin `^`). Cambios aplicados:
  **(1) Bloque de 11 invariantes** al principio de `AGENTS.md`, en imperativo y
  sin narrativa, para que las reglas no-negociables no compitan por atención
  con el contexto (`disable_signup` + los 3 `insert` del trigger, contraseñas,
  softdelete, los dos lugares de `credenciales.ver`, `tienePermisoModulo()`,
  `db migrations up`, `functionsUrl`, conteo de tests, doc por cambio,
  precedencia código>docs, español/no tutear).
  **(2) El campo `Vigencia` se eliminó en vez de actualizarse**: llevaba una
  fecha y una lista de migraciones a mano y había quedado 14 días y 16
  migraciones atrás de su propio cuerpo. Lo reemplaza una tabla que apunta a la
  fuente real de cada dato (`schema_migrations`, este changelog,
  `HISTORIAL-AUDITORIAS.md`, correr la suite) — sin dato escrito a mano no hay
  nada que se pueda podrir, así que no hizo falta un script de CI que lo
  vigile.
  **(3) Eliminado el conteo de tests y el párrafo del "1 falla esperada"**, que
  era el daño activo: `AGENTS.md` le decía a cada agente que una falla era
  normal 13 días después de que dejara de fallar — exactamente el
  entrenamiento a ignorar rojos que causó el incidente `030cc89`. Ahora dice
  que la suite cierra en 0 fallas y que cualquier rojo es una regresión.
  **(4) Separación parcial del archivo**: los 43 renglones de gotchas del CLI
  salieron a `docs/GOTCHAS-CLI.md` (nuevo, con una tabla de "qué gotcha aplica
  a tu caso" que antes había que deducir leyendo los tres), indexado en el
  árbol de docs del `README.md`. En `AGENTS.md` quedaron las reglas duras
  inline (`NO db migrations up`, verificar con `select` después) más el puntero
  marcado como obligatorio. **No se movió nada de seguridad ni de dominio**: una
  regla de seguridad detrás de un puntero es una regla que el agente puede
  decidir no leer.
  **(5) P0-05 cerrado de verdad**: tenía pendiente la verificación end-to-end
  ("el rojo debería pasar a verde, no reconfirmado todavía"). Corrida contra
  producción: 26/26 en verde. El test se conserva como **no-regresión** y se
  renombró (ya no dice "hoy no lo hace"), con el comentario explicando que un
  `CREATE OR REPLACE` que recree la función le devolvería el `EXECUTE` a
  `PUBLIC` por default de Postgres.
  **(6) EQ-FOTOS-02 mitigado**: el tope de 4 fotos por equipo, que solo existía
  en `EquipoForm.vue`, ahora también se aplica en `functions/equipos-fotos.ts`.
  Esquema verificado antes de escribirlo, no asumido: las fotos son la columna
  `equipos.fotos jsonb` (migración 015), no hay tabla `equipos_fotos` y las keys
  del bucket son planas, así que contar por storage era imposible. De paso
  `api/domains/equipos.js` pasó de `functions.invoke()` a mano a
  `crearInvocador()` — era el último consumidor que lo hacía a mano (ARQ-01).
  Queda **abierto a propósito**: el `check (jsonb_array_length(fotos) <= 4)` en
  BD y el **deploy manual** de la function, sin el cual el tope sigue siendo
  solo de cliente.
  **(7) Red de seguridad para la regla duplicada de `credenciales.ver`**: nuevo
  `tests/integration/permisos-credenciales-sincronizados.smoke.test.js`, que
  compara cuenta por cuenta la RPC SQL contra lo que la edge function realmente
  permite. **Se salta mientras no existan las cuentas de prueba de P0-04**: es
  una red instalada, no activa, y así queda documentado para no dar una falsa
  sensación de cobertura. El test dejó a la vista un tercer lugar donde vive la
  regla: `credenciales.ts` corta por `rol === 'JEFE'` y la función SQL no tiene
  ese atajo.
  Verificación: suite completa **215 pasan / 34 se saltan / 0 fallan** (249),
  `npm run typecheck:functions` (Deno 2.9.5, 4 functions) y `npm run lint` en
  verde. Fichado en `docs/HISTORIAL-AUDITORIAS.md` (P0-05, EQ-FOTOS-02), no en
  un informe suelto.
- **2026-08-31** (auditoría de arquitectura/clean code de `frontend/src` —
  Ciclo 15) — Pedido directo: revisión de arquitectura, no de UI/UX (capas,
  acoplamiento, duplicación, mantenibilidad) sobre todo `frontend/src`, con 6
  agentes en paralelo por capa leyendo los archivos completos. 22 hallazgos,
  fichados con estado en `docs/HISTORIAL-AUDITORIAS.md` (ARQ-01 a ARQ-22),
  no en un informe suelto. Los 3 críticos quedaron corregidos en el mismo
  cambio: `invoke()` triplicado en las 3 vías a edge functions → nuevo
  `api/invocarFuncion.js`; duplicación de contenido entre
  `TicketDetalleView.vue` y `TicketDetallePanel.vue` → 4 componentes
  compartidos (`TicketCamposGestion`/`TicketComentarios`/`TicketComposer`/
  `TicketHistorial`), con las diferencias reales como props en vez de
  copias divergentes; `acta.js`/`acta-devolucion.js` idénticas → nuevo
  `equipos/acta-base.js`. Dos suites de test nuevas (`invocarFuncion`,
  `acta-equipos`; esta última no existía pese a que las actas son un
  documento que se firma). Continuando en la misma pasada se cerraron 13
  más (16 de 22 en total): factory `crearStorePaginado.js` para los 7
  listados paginados (mismo criterio que el `crearCatalogoStore()` que ya
  existía), `useFormularioModal.js` para los 7 formularios sobre `<Modal>`,
  `usePopoverFlotante.js` para los 2 popovers del shell, y un barrido de
  duplicados menores (alias `aISO`, `todayISO` muerto, getters de staff,
  `.sb-logout`, `dominio-empleados` fuera de patrón). Dos hallazgos
  resultaron ser más que cosméticos al tocarlos: el barrel `insforge.js`
  cerraba un ciclo real de imports, y `todayISO()` era código muerto.
  `AGENTS.md` suma la convención de los helpers compartidos. En la misma
  pasada se cerraron además ARQ-05 (`useCrudCatalogo.js` para 3 de las
  pantallas de catálogo; los templates NO se unificaron a propósito) y
  ARQ-06: las 4 clases del vocabulario de ficha (`.datos-title`,
  `.tk-seccion`, `.tk-detalle`, `.tk-nota`) pasan a `main.css` — eran 23
  copias en 8 archivos, y su ausencia dejaba sin estilo a
  `ReporteTicketsModal.vue`, hueco que este cambio cierra sin tocar ese
  archivo (ver `docs/GUIA-UX-UI.md`, "Vocabulario de ficha"). **18 de 22
  cerrados**; quedan ARQ-09/ARQ-13 (god-components y god-composable, que
  requieren verificación visual y conviene hacer de a uno) y dos de
  nomenclatura/organización.

- **2026-08-29** (diseño de tabla de Tickets replicado a 13 módulos más) —
  Pedido directo: "el mismo diseño de las tablas que se replique a todos
  los módulos". Tickets ya era "el módulo modelo" documentado (`docs/
  GUIA-UX-UI.md`, "Tabla de Tickets"), pero su rediseño tenía dos capas: lo
  ya global en `main.css` (densidad, `tabular-nums`, `thead` sticky —
  confirmado que TODAS las demás tablas ya lo heredaban sin tocar nada) y
  lo opt-in por módulo (`.celda-apilada`, `col-elastica`, `col-num`, "una
  sola píldora de color por fila", el patrón "Edad") que **ningún otro
  módulo usaba todavía**. Se auditaron con 3 agentes en paralelo las 17
  vistas reales del sistema con `<table>` antes de tocar código.
  - **`.celda-apilada`** (identificador arriba en gris chico, dato
    principal abajo) en 9 archivos: `CorreosView.vue` (Plataforma+Tipo →
    "Cuenta"), `UbicacionesPanel.vue` (Tipo → "Nombre"),
    `ActividadView.vue` (Plataforma → "Cuenta"), `EmpleadosView.vue`
    tabla (DNI → "Nombre"), `CuentasPanel.vue` (Usuario → "Plataforma"),
    `KbView.vue` (Categoría+Síntoma → "Título"), `LicenciasView.vue`
    (Proveedor → "Software"), `AccesosSensiblesView.vue` (Categoría →
    "Nombre"), `EquiposView.vue` (migra `.eq-info` ya armado a mano a las
    clases oficiales — corrige de paso que `.eq-modelo` no tenía el gris
    terciario que exige `__meta`, heredaba el color de texto normal).
  - **Una sola píldora de color por fila** — mismo argumento que Tickets
    (Estado real se queda, clasificación fija baja a texto): Tipo en
    Correos/Cuentas, Tipo en Ubicaciones, Categoría en KB — los tres
    resueltos como parte de la celda apilada de arriba. `ProblemasView.vue`
    sumó un indicador punto+texto **local al archivo** para Severidad
    (mismo mecanismo visual que `IndicadorPrioridad.vue` de Tickets, sin
    generalizar ese componente — Severidad es dominio propio de Problemas,
    `severidadProblemaInfo()`; alta conserva el púrpura y crítica el rojo
    que ya tenía el badge, baja/media sin color). `StaffView.vue`: Rol baja
    a texto con versalitas cuando el viewer no es JEFE (antes badge,
    competía con el badge de Estado) — el badge del JEFE se queda intacto
    en la tarjeta móvil, no se tocó.
  - **`col-elastica`** en la columna de lectura real de cada tabla (Nombre,
    Título, Software, Equipo, etc.) y **`col-num`** en columnas
    numéricas/fecha (Actividad, KB, Licencias, Problemas, las 2 tablas de
    Encuestas) — ninguna de las 13 lo tenía antes.
  - **Patrón "Edad"** (`formatAntiguedad`/`formatFechaHora`, ya en
    `core/formatters.js` — nada nuevo que escribir) en 5 archivos:
    Actividad, KB, Problemas, y las 2 tablas de Encuestas.
  - **2 bugs reales corregidos de paso, fuera del alcance de "replicar"**:
    `.kb-titulo-link`/`.problema-titulo-link` forzaban `font-weight:600`
    en el link de título, pisando la regla global "ningún dato de tabla en
    negrita" — no eran una excepción a propósito.
  - **Fuera de alcance, explícito**: `ImportarEquiposView.vue` (grilla de
    staging con inputs, no un listado), las tablas de reporte agregado de
    Tickets (otra naturaleza), `AreasObrasPanel.vue`/`TiposEquipoPanel.vue`/
    `EmpresasView.vue`/`PlataformasView.vue` (sin badges que reducir ni
    celda apilada que aporte valor real), `LicenciasView.vue` Vencimiento
    (ya resuelve el mismo problema de urgencia con un mecanismo propio más
    específico — forzar el patrón formal ahí sería peor, no mejor). Solo
    se tocaron las tablas de escritorio — las tarjetas móviles (`.lista-
    tarjetas`/`.tarjeta-fila`) quedaron sin tocar a propósito, el pedido
    era "solamente el diseño de tablas".
  - Ver "Tabla de Tickets — el módulo modelo" en `docs/GUIA-UX-UI.md` para
    el patrón original; sin sección nueva en la guía (es una aplicación
    repetida de un patrón ya documentado, no un patrón nuevo).
- **2026-08-29** (sidebar: fusión de "Personas" en "Día a día") — El
  retiro del módulo de Pre-registro (migración 084) dejó el grupo
  "Personas" con un solo ítem (Empleados) — un encabezado de sección para
  una sola fila no agrupa nada, solo agrega peso visual. Se evaluaron 3
  propuestas (mínima: solo mover Encuestas a Personas; moderada: fusionar
  Personas en Día a día; ambigua: renombrar grupos por frecuencia de uso +
  badges de conteo) y se eligió la moderada. El sidebar pasa de 5 a 4
  grupos: "Día a día" ahora es Dashboard + Tickets + Empleados. El resto
  (Activos y credenciales, Conocimiento y mejora, Administración) no
  cambia. De paso, corregidas 2 referencias internas rotas en
  `docs/GUIA-UX-UI.md` que apuntaban a una sección "Rediseño de sidebar"
  que ya no existe ahí desde que el changelog se extrajo al apéndice de
  este archivo (2026-08-29, reorganización de documentación) — quedaron
  apuntando al apéndice correcto.
- **2026-08-29** (tipografía: Inter + Sora → Geist, una sola familia) —
  Decisión del JEFE tras consulta directa: Inter se sentía "muy común"; Sora
  se había elegido para acompañar el logotipo viejo (verde), motivo que dejó
  de aplicar con el rebranding a azul del 2026-08-27 — cierra también la
  nota "Axiforma pendiente" que quedaba abierta en el comentario de
  `main.css` desde la primera versión de ese token. Se consolida a **una
  sola familia** (Geist) para cuerpo y títulos, en vez de buscar OTRO par
  cuerpo+título — la jerarquía la sigue dando el peso (600–700 en títulos)
  y el tamaño, mismo criterio que "ningún dato en negrita en celdas de
  tabla". `--font-mono` pasa de la pila del sistema operativo (Cascadia
  en Windows, SF Mono en Mac — variaba entre usuarios) a **Geist Mono**.
  Verificado ANTES de tocar código, no asumido: se consultó la
  disponibilidad real de Geist en Google Fonts (entró al catálogo el
  2026-10-02) y se confirmó contra el endpoint `css2` real
  (`family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700`)
  que las 8 combinaciones familia+peso necesarias resuelven — mismo
  mecanismo de carga que ya usaba Inter/Sora, sin hosting nuevo que
  resolver. Los 4 pesos (400/500/600/700) son exactamente los que usa el
  CSS real hoy (grep de `font-weight:` en todo `main.css`+`modules`+
  `components`), ninguno de más. La escala de tamaños (`--fs-*`,
  11–26px) **no cambia** — Geist se diseñó explícitamente para legibilidad
  en tamaños chicos de interfaz, el mismo rango donde vive casi todo el
  texto de este panel; único punto señalado para revisar visualmente más
  adelante (no verificable sin navegador en esta sesión): el x-height más
  alto de Geist puede leerse un poco más grande/pesado que Inter en el
  escalón más chico (`--fs-xs`, 11px, badges y headers de tabla
  uppercase). De paso se retira **Montserrat** del `<link>` de Google Fonts
  en `index.html`: se cargaba sin que nada del código la usara (confirmado
  por grep) — no era una tercera fuente del sistema, era peso muerto.
  Archivos: `frontend/index.html`, `frontend/src/styles/main.css`,
  `docs/GUIA-UX-UI.md` ("Tipografía").
- **2026-08-29** (retiro del módulo "Pre-registro de personal", migración
  084) — El módulo fue un experimento puntual para recolectar datos de
  candidatos/nuevos ingresos antes del alta en Empleados; después sirvió de
  piloto para lo que maduró en el módulo de Encuestas (043). Ya cumplió su
  propósito y sus datos ya estaban exportados y en uso (0 filas verificadas
  en producción antes de aplicar) — se retiró por completo en vez de
  dejarlo vivo sin consumidor: tablas `personal_registros`/
  `personal_registro_intentos` (dropeadas), edge function
  `personal-registro` (des-desplegada de InsForge), módulo frontend
  `modules/personal/` + store + dominios de API (`personalRegistros.js`,
  `personalRegistro.js`), rutas `/personal-registro`/`/personal-registros`
  e ítem de sidebar. Documentación actualizada en el mismo cambio:
  `README.md` (stack, conceptos, estructura del repo, historial de
  migraciones — 042/046/047/065 anotadas como revertidas, fila nueva 084),
  `AGENTS.md`, `docs/PANORAMA-SISTEMA.md` (esquema, rutas, sidebar, capa de
  datos, decisiones §6) y `docs/HISTORIAL-AUDITORIAS.md` (Q-06 parcial,
  PERSONAL-REGISTRO-DNI-EXOFFBOARD cerrado por retiro,
  EMPLEADOS-REINGRESO-DNI-SIN-MANEJO anotado). **Pendiente aparte, fuera de
  este cambio**: `design.pen` probablemente todavía tiene el mockup de este
  módulo — requiere una pasada separada con la herramienta Pencil, no se
  tocó acá.

- **2026-08-29** (Empleados: "Tarjetas" pasa a ser una grilla real, no una
  lista de filas) — Feedback directo de uso: "tarjetas se ven filas y no
  cards". Diagnóstico: `EmpleadosView.vue` reusaba `.tarjeta-fila` (la fila
  compacta de una sola columna, pensada como fallback móvil de tablas) para
  su modo de escritorio "Tarjetas" — en pantalla ancha se veía como una
  lista angosta de filas, no como una grilla de tarjetas. `.lista-tarjetas`
  se mantiene en el `<ul>` (le da el scroll-container ya resuelto dentro de
  `.card--fill`); se suma `.emp-tarjetas` (`display:grid;
  grid-template-columns: repeat(auto-fill, minmax(260px,1fr))`, responsive
  sin media query — con un viewport angosto ya entra 1 sola columna) y cada
  `<li>` pasa de `.tarjeta-fila` a `.card.card--clicable` (la variante de
  card con elevación en hover/focus ya definida en `main.css` desde G4, sin
  ningún consumidor real en producción hasta ahora). Contenido reorganizado
  en cabecera (avatar de iniciales nuevo, mismo criterio que
  `TicketsView.vue`: dos letras en mayúscula vía JS + nombre/DNI + el
  disparador de `MenuAcciones`, reubicado de pie a cabecera — más natural
  en una card real), línea secundaria (cargo · empresa) y pie (badge de
  estado + conteos de cuentas/equipos/licencias, ahora con `flex-wrap` para
  no romper en una tarjeta angosta). Mismos datos que antes, ningún campo
  nuevo. Ver "`TicketDetallePanel.vue`..." y la pasada de Tickets para el
  precedente de `.card--clicable`/avatares de iniciales que se reutiliza
  acá.
- **2026-08-29** (Empleados: misma pasada de diseño que Tickets) — Auditoría
  con 3 agentes de exploración de los 4 archivos del módulo + `CuentasPanel.vue`
  (vive en `modules/cuentas/` pero solo lo consume Empleados), contrastando
  contra los patrones ya corregidos en Tickets. Buena noticia: tipografía,
  íconos, el selector Tabla/Tarjetas y `input[type="date"]` ya estaban
  limpios — no repiten los problemas de Tickets. Se encontraron y corrigieron
  4 hallazgos concretos: **(1)** `CuentasPanel.vue`: "Agregar cuenta" de la
  toolbar era `.btn-primary` incondicional — con un empleado Inactivo
  convivía con "Reactivar" del header, dos acentos compitiendo en la misma
  vista (viola "un solo acento por vista", ya corregido antes en otras 7
  vistas); baja a `.btn`, mismo peso que "Asignar" en Equipos/Licencias.
  **(2)** `.panel-toolbar`/`.panel-title`, duplicados byte a byte en
  `EmpleadoDetalleView.vue` y `CuentasPanel.vue`, se retiran — el template
  pasa a usar `.card-toolbar`/`.toolbar-title` (ya global en `main.css`,
  misma toolbar que usa Tickets). **(3)** `BajaEmpleadoModal.vue`: un ícono
  usaba `--fs-md` (token de texto) en vez de `--icon-sm` (mismo valor, 14px,
  token correcto) — deuda suelta del barrido de íconos de Tickets. **(4)**
  `EmpleadoForm.vue` migra de modal hand-rolled a `Modal.vue` compartido
  (bug real, UX6-03: no bloqueaba el scroll del body, sin Teleport) — sigue
  al pie de la letra el patrón ya probado en `AccesoSensibleForm.vue` (y 8
  formularios más): `<Modal :confirmar-cierre @close>` + `<form id>` en el
  slot por defecto + `<button type="submit" form="...">` en `#acciones`
  (los slots de Modal.vue son DOM separado, no admite un único `<form>`
  continuo como el hand-rolled). Revisado y dejado sin tocar: el grid fijo
  300px+1fr de `.detalle-grid` (mismo patrón que `.tdp-grid` en
  `TicketDetallePanel.vue`, no una desviación) y el empty-state de texto
  plano en Equipos/Licencias (paneles a mitad de ancho, el `EmptyState`
  completo se vería sobredimensionado — ya documentado en su propio
  comentario de código). Fuera de alcance a propósito: tuteo en
  `ConfirmDialog` (UX6-02) y la migración de Modal.vue en los otros 7
  formularios pendientes — hallazgos reales pero transversales a todo el
  sistema, no específicos de Empleados.
- **2026-08-29** (base global para `input[type="date"]`, disparado desde
  Tickets) — Pedido puntual: "mejorar el componente DATE que siga el mismo
  estilo de Materen". El filtro "Fecha de creación" de Tickets
  (`FiltroFechaCreacion.vue`) no vivía dentro de `.form-group`, así que no
  heredaba NADA del sistema — un input nativo pelado (sin borde, sin radio,
  glifo de calendario del sistema operativo) al lado de bandejas y botones
  con tratamiento Materen completo. En vez de un fix local a ese componente,
  se agregó una base global `input[type="date"] { ... }` en `main.css`,
  mismo criterio que ya existía para `<select>` ("Rediseño de dropdowns"):
  un solo lugar da borde/radio/alto/tipografía a CUALQUIER date input del
  sistema, esté envuelto o suelto. El glifo nativo (inconsistente entre
  SO/navegador, la misma razón por la que `<select>` perdió su flecha
  nativa) se reemplaza por un trazo propio vía
  `::-webkit-calendar-picker-indicator`, mismo stroke/grosor que el chevron
  del select y mismo par de grises claro/oscuro (`#9CA3AF`/`#6B7280`) — solo
  Chromium/Edge; Firefox no expone ese pseudo-elemento y sigue con su ícono
  nativo sin estilar, límite del navegador. Efecto lateral (no scope creep:
  una sola regla global, cero archivos tocados) — los 6 date-input de
  Empleados/Equipos/Licencias/Problemas, que ya tenían borde vía
  `.form-group input`, ganan el mismo ícono de calendario gratis. Sin
  navegador disponible para confirmar el render final; se validó que los 2
  SVG data-URI son XML bien formado y la geometría del ícono coincide con el
  calendario estándar de Tabler (rect + 2 "anillos" + divisor horizontal).
- **2026-08-29** (décima pasada — Tickets: "Reporte" se consolida en "Más") —
  Feedback directo de uso: "me gustó el menú de Más [...] así debemos incluir
  Reporte también, el orden sería Enlace + Reporte + Satisfacción + Exportar
  datos". El header de Tickets baja de 4 controles a 3 (selector de vista,
  "Más", el único `.btn-primary`) — "Reporte" deja de ser un botón propio
  del header (lo era desde la séptima pasada) y se suma a "Más" con el mismo
  criterio que ya aplicaba a Satisfacción/Enlace soporte/Exportar: ninguna
  de las cuatro se usa varias veces por turno. `accionesMas` fija el orden
  Enlace soporte → Reporte → Satisfacción → Exportar datos (antes sin orden
  explícito, y "Reporte" solo aparecía ahí en móvil vía un `visible:
  esMovil.value` que se retira); "Exportar" pasa a "Exportar datos" como
  label, más descriptivo dentro del menú. Ver "Header de Tickets: 'Reporte'
  se consolida en 'Más'" en `GUIA-UX-UI.md`.
- **2026-08-28** (novena pasada — `TicketDetallePanel.vue`: una tarjeta, no
  tarjetas dentro de tarjetas) — Feedback directo de uso, misma sesión que
  la octava pasada: el panel de detalle (tercera columna del shell en modo
  Triage) tenía **5 `.card` propias** flotando dentro de sí mismo (header,
  solicitante, datos del ticket, historial, conversación) sobre su propio
  telón gris — el mismo problema de "tarjeta dentro de tarjeta" que la
  octava pasada ya había corregido un nivel más arriba, sin detectarlo acá
  adentro. El panel completo pasa a ser LA tarjeta (`class="... card"`,
  reusando la clase global en vez de redeclarar fondo/borde/radio); las 5
  secciones se separan con `.tk-seccion` (título + divisor horizontal), la
  misma herramienta que `TicketDetalleView.vue` ya usaba para esto y que
  llevaba copiada en este archivo sin consumidor real desde antes. Nuevo
  divisor vertical (`border-right` en `.tdp-col-izq`) reemplaza el límite
  que antes daban 2 cards con borde propio lado a lado; se invierte a
  horizontal cuando el panel angosto colapsa a 1 columna. Un detalle que
  dependía implícitamente de `.card{overflow:hidden}` (`.tdp-conversacion`,
  contención del scroll interno) quedó sin esa propiedad al retirar la
  clase — se hizo explícita en la propia regla. Ver "`TicketDetallePanel.vue`:
  una tarjeta, no una tarjeta llena de tarjetas" en `GUIA-UX-UI.md`.
- **2026-08-28** (octava pasada — Tickets: chrome unificado + "Isla" se
  renombra a Triage) — Feedback directo de uso: alternar entre Tabla e Isla se
  sentía "mal hecho" porque los dos modos NO compartían tratamiento visual
  (Tabla full-bleed sin marco, Isla flotando con gap/padding) — una decisión
  que la propia guía documentaba como deliberada. `.tickets-shell` gana
  `gap`/`padding` incondicional, se retira el override que reducía el nav de
  Tabla a un riel sin radio, y el override de tarjeta del contenido pasa de
  `.tickets-lista .card--fill` (solo Isla) a `.tickets-shell .card--fill`
  (las dos). **Bug real atrapado sin poder renderizar** (sin navegador
  disponible en la sesión): el override ampliado no tenía guarda de mobile,
  así que en ≤768px la tarjeta de Tabla —que sí se monta en mobile, a
  diferencia de Isla— habría quedado con borde+radio pegada a los 4 bordes de
  la pantalla; se corrigió con un reset en `@media (max-width: 768px)`
  colocado DESPUÉS de la regla de escritorio (empate de especificidad se
  resuelve por orden de aparición en el archivo), verificado leyendo
  directamente el CSS ya compilado. Además, **"Isla" se renombra a "Triage"**
  en vez de al "Panel" evaluado primero: "Panel" colisionaba con el
  vocabulario ya existente para la columna de detalle
  (`TicketDetallePanel.vue`, 16+ referencias a "panel de detalle"); "Triage"
  ya era el término orgánico del propio proyecto para esta interacción (6+
  usos previos en comentarios/docs). Cambia el valor persistido
  (`'isla'` → `'triage'`, cae solo al default si quedó guardado el viejo) y
  las clases `--isla` → `--triage`. El shell queda pensado para que un futuro
  modo Kanban entre en el mismo hueco sin cambios de shell. Ver "Bandejas y
  filtros de Tickets — octava pasada" en `GUIA-UX-UI.md`.
- **2026-08-28** (escala de íconos + barrido tipográfico, todo el frontend) —
  El proyecto tenía disciplina de color casi perfecta (cero hex hardcodeados
  fuera de las vistas de laboratorio) y **ninguna** en tamaños: **131
  declaraciones `font-size` en px sueltos** repartidas en 20+ archivos,
  incluidos medios píxeles que no existen en ninguna escala (`10.5`, `11.5`,
  `12.5`, `13.5px`), y **11 tamaños distintos de ícono**
  (13/14/16/17/18/19/20/22/24/28/40px) sin criterio que dijera cuál usar. Se
  agrega una **escala de íconos propia** (`--icon-xs` … `--icon-hero`,
  7 pasos, alias `--icon-*`) separada de la tipográfica —los íconos se
  dimensionan con `font-size` pero no son texto— y se migran las 131
  declaraciones a `--fs-*` o `--icon-*`. Quedan **2 excepciones declaradas y
  anotadas en su archivo** (`.ds-swatch span` 9px, `.nivel-btn` 24px).
  Efecto lateral bueno: `.icon-btn` pasa de 17px a `--icon-lg` (18px), con lo
  que el target táctil de WCAG 2.5.5 cierra en `padding: 13px` entero en vez
  del `13.5px` que el propio comentario del código señalaba como valor feo.
  Ver "Escala de íconos (tokenizada)" en `GUIA-UX-UI.md`.
- **2026-08-28** (séptima pasada — Bandejas de Tickets: se va la duplicación
  y el estado deshabilitado) — Las seis pasadas anteriores fueron sumando
  ejes al riel de 200px sin volver a mirarlo entero: quedó con **12 ítems, 8
  de ellos los mismos 4 sub-estados repetidos dos veces** (bajo "Mis tickets"
  y bajo "Equipo") **y 4 siempre deshabilitados**, mientras las 2 bandejas más
  miradas eran las únicas 2 sin contador. Ahora: 4 bandejas al mismo nivel,
  las 4 con contador, y **una** lista de sub-estados contextual (la de la
  bandeja activa) que desaparece en `sin_asignar`/`sin_vincular` — cero
  controles apagados en pantalla. El modelo de datos no cambia (siguen los
  dos campos separados del store). Además: **Nivel de atención** pierde su
  columna (tabla 7 → 6) y se funde en la línea de metadatos de "Ticket";
  header de 5 controles a 4 ("Satisfacción" y "Enlace soporte" al menú "Más",
  que ahora existe también en escritorio); **"Exportar" se muda al header y
  con eso queda disponible en Isla, donde no existía**; `ticketSeleccionado`
  arranca en `store.ultimoAbierto` para que cambiar de Tabla a Isla no pierda
  el ticket en curso; `FiltroFechaCreacion.vue` deduplica el bloque de fechas
  que estaba copiado entre nav y barra móvil; el panel vacío de Isla usa
  `EmptyState`. `ListaVistas.vue` gana la variante `segmento`, cuyo par de
  contraste **con texto** (no solo-ícono como `SelectorVista`) destapó un
  fallo AA real: `.tnav-contador` en terciario cae a 4.33:1 sobre
  `--color-bg-subtle`; se sube a secundario solo en esa variante y los 3
  pares quedan verificados en `scripts/contraste.mjs`. Ver "Bandejas y
  filtros de Tickets — séptima pasada" en `GUIA-UX-UI.md`.
- **2026-08-28** (corrección de deriva documental en `GUIA-UX-UI.md`) — El
  "Resumen" seguía afirmando que producción estaba en navy/mint
  (`#00203F`/`#36ECDE`) con el azul "pendiente de portar" y sin sombras en
  ningún contenedor: las dos cosas eran falsas desde las fases G1–G4 del
  2026-08-27, que la sección "Identidad de marca" ya documentaba bien. Mismo
  patrón Q-01 de `HISTORIAL-AUDITORIAS.md`. Quedan **señaladas y sin tocar**
  otras dos secciones con la misma deriva ("Bordes — jerarquía de 3 niveles
  (dirección aprobada, pendiente de portar)" y "Excepciones hardcodeadas"),
  porque son duplicados de secciones que sí están al día y fusionarlas es
  decisión del JEFE.
- **2026-08-28** (sexta pasada — suma "Equipo" a las Bandejas de Tickets) —
  Tras la quinta pasada ("Mis tickets" como requisito) dejó de existir
  cualquier vista sin restricción de técnico: no había forma de ver todos
  los tickets de todos los técnicos. Se agregó **"Equipo"**, bandeja
  hermana de "Mis tickets" con los mismos 4 sub-estados
  (`ESTADOS_SUBFILTRO`: Todos/En progreso/Resuelto/Rechazados) pero
  `asignadoA: ''` (sin acotar a nadie) en vez de `auth.user.id`.
  `vistaActiva` pasa a 4 valores (`sin_asignar`/`sin_vincular`/
  `mis_tickets`/`equipo`); cada bandeja tiene su propio campo de sub-estado
  en el store (`estadoMisTickets`/`estadoEquipo`, no comparten uno) para
  que cambiar de una a otra no pise en qué sub-estado estaba la otra.
  `conteosVistas` pasa de objeto plano a `{ sin_asignar, sin_vincular,
  misTickets: {...}, equipo: {...} }` — evita que ambas bandejas (mismos
  `id` de sub-estado) lean el mismo número de un objeto compartido;
  `cargarConteos()` pasa de 6 a 10 queries de conteo en paralelo. Ver
  "Bandejas y filtros de Tickets — sexta pasada" en `GUIA-UX-UI.md`.
- **2026-08-28** (pasada de contención de la vista Isla, sobre la quinta) —
  **el shell de 3 columnas no estaba acotado en vertical y las islas se
  derramaban fuera de su contenedor**. `.tickets-shell` pasa a declarar
  `grid-template-rows: minmax(0, 1fr)` (antes usaba la fila implícita `auto`,
  dimensionada por el hijo más alto): ese era además el motivo por el que
  `overflow-y: auto` del nav y de la lista no hacía nada — sin alto acotado
  no hay nada de qué desbordar, y el scroll terminaba siendo el de la página.
  Se suman `overflow-x: hidden` en `.tickets-nav` (con `overflow-y:auto` el
  eje X computa a `auto` y el riel de 200px se scrolleaba de costado) y
  `overflow: hidden` en `.tickets-lista .card--fill` (scrolleaba la card
  entera, llevándose fuera de vista el buscador y los chips, y pasaba por
  encima de las esquinas redondeadas). En la tarjeta angosta, `.tk-antiguedad`
  deja de partirse en dos renglones (`flex-shrink: 0`) y el título se corta en
  2 líneas con `title` completo. **`TicketDetallePanel.vue`: el colapso del
  split interno pasa de `@media (max-width: 1100px)` a
  `@container tdp (max-width: 800px)`** — el umbral medía la ventana y no el
  panel, que como tercera isla mide ~650px en una pantalla de 1440px, así que
  nunca disparaba y Conversación quedaba en ~334px. Solo CSS + un `:title`;
  sin cambios de estructura, navegación ni copy. Ver "Contención de las tres
  islas" en `GUIA-UX-UI.md`.
- **2026-08-28** (quinta pasada, corrección de la cuarta tras revisarla en
  uso real) — **"Todos" pasó de significar "vigentes" a significar
  literalmente todos los estados** (`ESTADOS_MIS_TICKETS` en
  `TicketsView.vue`: `{ id: 'todos', estado: '' }`, no
  `ESTADO_FILTRO_VIGENTES`) — el label prometía "todos" y entregaba "no
  resuelto/rechazado", bug real detectado en uso;
  `ESTADO_FILTRO_VIGENTES` sigue vigente para `sin_asignar`/`sin_vincular`,
  donde sí corresponde. **"Mis tickets" pasó de toggle opcional a
  bandeja-requisito**: ya no se puede navegar "En progreso"/"Resuelto"/
  "Rechazados" global (todos los técnicos) sin activar antes "Mis
  tickets" — `vistaActiva` es ahora `'sin_asignar' | 'sin_vincular' |
  'mis_tickets'` (3 valores exclusivos, `stores/tickets.js`), y los 4
  sub-estados se deshabilitan enteros fuera de `mis_tickets` (prop
  `disabled` nueva en `ListaVistas.vue`). Contrapartida aceptada: se pierde
  la vista global de un estado por todos los técnicos a la vez; no era el
  pedido de esta pasada. **"Sin vincular" se agrupó con "Sin asignar"** en
  la misma sección del nav (antes bandeja suelta al final). **Prioridad,
  Nivel de atención, Tipo y Categoría se ELIMINARON como filtros del
  listado** (no solo se reubicaron, como en la cuarta pasada) — el dato
  sigue en la tabla/detalle, se quitó la capacidad de filtrar por ellos;
  `queryTickets()`/`contarTickets()` (`api/domains/tickets.js`) ya no
  reciben esos 4 parámetros. `ChipsFiltro.vue` quedó sin consumidores y se
  eliminó — sus clases globales se movieron a `main.css` (la fila de
  "chips de filtros activos" seguía necesitándolas). **Fecha de creación**
  (único filtro secundario que queda) se rediseñó: Desde/Hasta pasaron de
  lado a lado sin etiqueta visible a apilados verticalmente con
  mini-etiqueta propia. Ver "Bandejas y filtros de Tickets — quinta
  pasada" en `GUIA-UX-UI.md`.
- **2026-08-28** (cuarta pasada, correcciones de flujo de trabajo sobre la
  tercera) — **"Mis tickets" pasó de Vista plana a toggle independiente**
  (`store.misTicketsActivo`) que se combina con las 4 Vistas de estado
  (`todos`/`en_progreso`/`resuelto`/`rechazado` — `VISTAS_CON_MIS_TICKETS`
  en `TicketsView.vue`), en vez de ser un combo cerrado propio: ahora se
  puede ver "mis tickets en progreso" o "mis tickets rechazados", cosa que
  antes obligaba a salir de la Vista "Mis tickets". Deshabilitado en
  `sin_asignar`/`sin_vincular` (no aplica: un ticket sin asignar no es de
  nadie, y "sin vincular" no depende del técnico). `VISTAS_TICKETS` vuelve
  a 6 ítems; los contadores por Vista ahora recalculan también con el
  toggle. **Se retiró `MasFiltros.vue`** (componente eliminado, sin
  consumidores) — sus filtros (Nivel, Tipo, Categoría, Fecha, y Prioridad en
  mobile) dejaron de vivir detrás de un popover oculto y pasaron a un bloque
  siempre visible (`.tk-filtros-secundarios`) bajo las Bandejas en el nav de
  escritorio y en su propia fila en mobile — Tickets es la plantilla de
  diseño para los demás módulos, y el patrón "oculto hasta que alguien lo
  busque" no es el que se quiere replicar. Se retiró el atajo `f` de
  Tickets (`useAtajosLista.js` sigue existiendo, genérico, por si otro
  módulo usa un popover). Ver "Bandejas y filtros de Tickets — cuarta
  pasada" en `GUIA-UX-UI.md`.
- **2026-08-28** (tercera pasada, checklist de revisión externa sobre la
  segunda) — Cada punto se verificó contra el código antes de aplicarlo; el
  checklist tenía varios que ya estaban resueltos y dos que contradecían
  decisiones de producto ya tomadas. **Aplicado**: bandeja "Sin vincular"
  (antes checkbox suelto en `MasFiltros`, ahora una Vista más — combo
  `estado: vigentes, sinVincular: true` — al final del orden de flujo de
  trabajo); filtros nuevos **Nivel, Tipo, Categoría y Fecha de creación**
  (`queryTickets()`/`contarTickets()` en `api/domains/tickets.js` suman
  `nivelAtencion`/`tipo`/`categoriaId`/`fechaDesde`/`fechaHasta`; **no** se
  sumó un filtro de "Estado" — habría sido la misma duplicación de 2
  fuentes de verdad para el mismo dato que el modelo de Vistas cerró en la
  primera pasada); chips removibles de filtros activos + botón "Limpiar
  filtros" + contador en el badge de `MasFiltros.vue` (prop `contador`
  nueva); "N resultados" en Isla; indicador "sin vincular" en la tarjeta
  angosta de Isla (faltaba, la tarjeta móvil ya lo tenía). **Persistencia
  de filtros al navegar al detalle y volver** (bug real: en modo Tabla,
  abrir un ticket navega a `/tickets/:id` y desmonta `TicketsView.vue`) —
  `vistaActiva` y los 6 filtros secundarios se movieron de refs locales a
  `stores/tickets.js` (`vistaActiva` en el state; los filtros ya vivían ahí,
  ahora los controles leen/escriben directo con `computed({get,set})` en
  vez de un ref+watcher aparte); `resetearFiltros()` ya NO se llama en cada
  montaje — se agregó `resetearBusqueda()`, más angosto (solo `filtros.q`),
  para seguir evitando el mismatch buscador-vacío-pero-filtro-vivo
  reportado en jul 2026 (ver `stores/empleados.js`) sin volver a pisar Vista/
  Prioridad/Nivel/Tipo/Categoría/Fecha en cada remontaje. **No aplicado,
  contradice una decisión de producto ya tomada**: "Todos (vigentes)" sin
  filtro de estado (repurposearía el mismo recorte que ya comparten
  `dashboard.js` y el RPC de reportes 053) y una bandeja "Cerrados" separada
  de "Resuelto" (deshace la fusión resuelto+cerrado del 2026-08-21 —
  `cerrar_ticket()` encadena ambos en un clic a propósito). **No aplicado,
  requiere una operación de backend que no existe**: vincular/desvincular un
  ticket a un empleado desde el detalle — el único "vincular" de tickets que
  existe hoy es ticket↔problema (`api/domains/problemas.js`), no
  ticket↔empleado; hace falta una RPC nueva, no es solo UI. **Ya estaba
  implementado, solo se verificó** (sin cambios): las 3 bandejas por estado
  ya mostraban todos los técnicos, no solo el usuario actual; el resaltado
  de fila/tarjeta seleccionada (segunda pasada); el scroll horizontal de
  `.table-wrap`; prioridad+asignado+vinculado en la tarjeta angosta de
  Isla (salvo vinculado, sumado ahora); el badge "Sin vincular" en el panel
  de detalle; la diferenciación nota interna/visible en la conversación;
  las 4 acciones guiadas por estado (Iniciar atención exige
  prioridad+nivel+asignado+tipo, Rechazar y Reabrir exigen motivo vía
  `ConfirmDialog`, Marcar resuelto pide confirmación); el contraste de la
  fila activa (`filaActivaTexto`); Nivel en texto plano; la paginación
  server-side (ya existía, no carga todo el listado). Verificado con
  `npm run build`, `npm test` (184/30/0) y `node scripts/contraste.mjs`
  (0 fallas). Pendientes que quedan fuera — filtro por "Asignado a" (choca
  con el eje asignado de las Vistas, necesita diseño propio antes de
  sumarse), columna de Acciones por fila, drawer <1200px, filtros en la
  URL y contadores en tiempo real — ver `docs/GUIA-UX-UI.md`.
- **2026-08-28** (segunda pasada, contra una guía de diseño externa) —
  Se aplicó lo viable de esa guía y se documentó lo que no. **Aplicado**:
  Bandejas como panel lateral en las DOS vistas (`.tickets-shell`, un solo
  esqueleto `nav + contenido` — antes el nav existía solo en Isla y alternar
  de vista movía las bandejas de arriba a la izquierda); columna **Nivel**
  (exigió sumar `nivel_atencion` a `SELECT_RESUMEN`/`mapTicketResumen` y al
  export por periodo — solo viajaba en `getTicket()`), en texto plano y no
  como badge de color; **selección visible** de fila y de tarjeta
  (`.fila-ticket--activa`/`.tarjeta-fila--activa`, con `ultimoAbierto` en el
  store para sobrevivir a la navegación al detalle); **atajos de teclado**
  `/` y `f` (`composables/useAtajosLista.js`, `defineExpose` en
  `MasFiltros.vue` porque es multi-root); botón **Exportar** en la toolbar,
  extrayendo la forma del CSV a `core/exportar-tickets.js` compartida por los
  3 consumidores (antes vivía solo dentro de `ReporteTicketsModal.vue`).
  **No aplicado, con motivo**: columna de Acciones por fila (obligaría a
  inventar operaciones que hoy no existen fuera del panel de detalle),
  detalle de 420px con tabs (revertiría el layout de 2 columnas documentado
  en ago 2026, que le da a Conversación el ancho que las tabs le quitarían) y
  drawer <1200px (necesita decidir overlay vs. push, no es una traducción
  mecánica). **Errores de la guía detectados y no propagados**: sus 6 tokens
  CSS (`--color-surface`, `--border-subtle`, `--bg-tertiary`, `--brand-50`,
  `--space-3`, `--z-dropdown`) no existen en `main.css`; sus 6 métodos de API
  (`listar`/`obtener`/`rechazar`/`iniciarAtencion`/`marcarResuelto`/`reabrir`)
  tampoco; separaba `cerrado` de `resuelto`, contra la fusión decidida el
  2026-08-21; y proponía `<th></th>` vacío y `@click` en el `<th>`, ambos
  contra las reglas de tabla vigentes. Nuevo par verificado en
  `scripts/contraste.mjs` (`filaActivaTexto`): sobre `--accent-subtle`,
  `text-tertiary` da 4.27:1 claro / 3.87:1 oscuro y **no pasa** — la fila
  activa sube esos tonos a `text-secondary` (5.49:1 / 6.05:1). Verificado con
  `npm run build`, `npm test` (184/30/0), `npx eslint` (0 errores) y
  `node scripts/contraste.mjs` (0 fallas).
- **2026-08-28** — Rediseño de la tabla y la vista Isla de Tickets, con la
  parte reutilizable bajada a `main.css` como capa global de tabla. Global
  (llega solo a las ~20 tablas del sistema, sin tocar ninguna vista):
  densidad `12px`→`9px` de padding vertical en `td`/`th` (fila de ~38px a
  ~32px), `tbody tr:focus-within` para dar a la fila enfocada por teclado el
  mismo realce que el hover, y tres utilidades nuevas — `col-elastica`
  (la columna que absorbe el ancho sobrante), `col-num` y `.celda-apilada`
  (celda de dos líneas, la forma de dar jerarquía sin negrita). `col-elastica`
  queda portada **solo en Tickets**: es opt-in de un atributo por módulo.
  Tickets: de 8 columnas a 6 y de hasta 3 píldoras de color por fila a 1
  (Estado); Prioridad pasa a punto+texto en `IndicadorPrioridad.vue` (nuevo,
  `components/shared/`) y a primera columna; Código+Categoría+Título colapsan
  en una celda, Fecha+Antigüedad en la columna "Edad" de una línea; la barra
  de filtros baja de 3 filas a 1 (Prioridad se muda al popover de
  `MasFiltros` en modo Tabla). Isla: contadores en las 6 Vistas y no solo en
  la activa (`insforgeApi.contarTickets()`, nuevo — `queryTickets()` acepta
  `soloConteo`), se retira el ítem muerto "Vencidos · Próximamente" (la
  función sigue pendiente, anotada en la guía), y la tarjeta angosta suma
  Prioridad y Solicitante en lugar de la píldora de Tipo. Corrige además la
  única cadena con voseo de la app ("Seleccioná un ticket…", estado vacío del
  panel). `scripts/contraste.mjs` suma el par `prioridadUrgente`
  (`danger-text` sobre `bg-elevated`, 7.01:1 claro / 6.42:1 oscuro): hasta
  acá ese token solo se había verificado dentro de `danger-bg`. Verificado
  con `npm run build`, `npm test` (184 pasan, 30 se saltan, 0 en rojo),
  `npx eslint` (0 errores) y `node scripts/contraste.mjs` (0 fallas).
  Detalle en `docs/GUIA-UX-UI.md`, "Rediseño de tabla (ago 2026) — capa
  global" y "Tabla de Tickets (ago 2026) — el módulo modelo".
- **2026-08-27** — Rediseño de arquitectura de filtros en
  `TicketsView.vue`: reemplaza el modelo de 2 superficies separadas
  manteniendo el mismo estado (Tabla: dropdown Estado + chips sueltos;
  Isla: nav-list Estado + toggles) por una sola lista de Vistas
  (`VISTAS_TICKETS`, combos cerrados de estado+asignación) compartida
  entre ambos modos — origen directo de 2 bugs de sincronización
  consecutivos ya corregidos puntualmente antes de este cambio de fondo.
  3 componentes compartidos nuevos (`ListaVistas.vue`, `ChipsFiltro.vue`,
  `MasFiltros.vue`); Prioridad pasa de `<select>` único a chips de
  selección múltiple (cambio de contrato real en `stores/tickets.js` y
  `api/domains/tickets.js`, `prioridad` de `string` a `array`); "Sin
  vincular" degrada a filtro secundario en popover. "Mis tickets" arranca
  siempre sin marcar, sin `localStorage`, a propósito. Seis commits
  verificados (`npm run build` + `npm test` +
  `node scripts/contraste.mjs` después de cada uno). Detalle completo en
  `docs/GUIA-UX-UI.md`, "Filtros de Tickets: modelo de Vistas".
- **2026-08-27** — Migración de marca al azul (`#0064E0`/`#0082FB`),
  reemplazando la paleta teal-green real de producción — no navy/mint como
  esta documentación afirmaba erróneamente desde el 2026-08-22 (corregido
  en el mismo cambio, ver `docs/GUIA-UX-UI.md`, "Identidad de marca"). Seis
  pasadas verificadas (G0-G5): `StyleLabView.vue` corregido antes de usarse
  como referencia (cierra UX6-12), tokens de acento/fondo/texto/borde/
  sombra/radio portados a `main.css`, `--color-primary` redirigido a
  `accent-text` en vez de `accent` directo (evita una falla de AA en
  oscuro), y 3 sombras que habrían aparecido no deseadas o de nivel modal
  al activarse el token real (antes `none`) corregidas en el mismo pase.
  Nuevos checks permanentes en `scripts/contraste.mjs` para `text-tertiary`
  y `border-default/-strong`. `docs/GUIA-UX-UI.md` y `docs/HISTORIAL-AUDITORIAS.md`
  (UX6-12) actualizados en el mismo cambio. **Pendiente**: QA visual real
  (sin navegador en esta sesión) y decidir el destino de un diff ajeno sin
  commitear que quedó en `git stash` durante esta migración.
- **2026-08-21** — Fusión visual "Resuelto"/"Cerrado" en Tickets (decisión
  de producto): el staff ya no distingue los dos estados en badges,
  filtro y notificaciones — la columna `estado` sigue guardando los 2
  valores reales sin cambios (`crear_encuesta_al_cerrar()` depende del
  literal `'cerrado'`). `ESTADOS_TICKET`/`OPCIONES_FILTRO_ESTADO`
  (`dominio-tickets.js`), filtro "Vigentes" corregido para excluir los 3
  valores reales — antes excluía solo 2, dejando pasar `resuelto` como si
  siguiera necesitando atención (`api/domains/tickets.js`, bug real, no
  solo de UI) —, `<select>` de estado sin opción duplicada
  (`TicketsView.vue`), y `notify_ticket_personal()` ya no manda las dos
  notificaciones consecutivas del cierre atómico (migración 078, probada
  antes en un branch de InsForge). Timeline de `TicketDetalleView.vue` sin
  cambios a propósito — sigue siendo el registro histórico real. Hallazgo
  colateral anotado en Pendientes (búsqueda pública por DNI, severidad
  baja, sin tocar).
- **2026-08-21** — "Revocar" en `CuentasPanel.vue` para cuentas
  `tipo_cuenta='personal'` ahora hace soft-delete real (RPC
  `revocar_cuenta_personal`, migración 077): antes solo cerraba la
  asignación y la cuenta quedaba viva para siempre, bloqueando
  `uq_cuentas_usuario_plataforma` sin ningún camino de UI para liberarlo
  (reportado por un usuario real con `almacen.nufago.06@gmail.com`/VPN).
  Backfill por ID explícito de las 4 filas huérfanas ya existentes, mismo
  hallazgo. `compartida`/`reutilizable` sin cambios — deben poder quedar
  sin asignar. `docs/PANORAMA-SISTEMA.md` (tabla de Credenciales) y la fila
  del hallazgo en Ciclo 13 de `docs/HISTORIAL-AUDITORIAS.md` actualizados
  en el mismo cambio.
- **2026-08-20** — `functions/equipos-fotos.ts` gana `tienePermisoModulo('equipos')`
  en `subirFoto`/`eliminarFoto` (hallazgo de auditoría externa: la función
  solo exigía staff activo, sin mirar el módulo — mismo patrón que
  `credenciales.ts`). `AGENTS.md` (línea de esta función), `README.md`
  (cuenta `INSFORGE_TEST_ASISTENTE_SIN_MODULO_*` también necesita revocado
  "equipos") y `frontend/tests/integration/autorizacion-roles.smoke.test.js`
  (2 casos nuevos) actualizados en el mismo cambio. Ver Ciclo 13 de
  `docs/HISTORIAL-AUDITORIAS.md`. Pendiente aparte, no cerrado acá:
  `MAX_FOTOS=4` sin tope server-side.
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
  (`README.md`, `AGENTS.md`, `docs/PANORAMA-SISTEMA.md`,
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
- **2026-08-17** — Migración 062 (`README.md`, `docs/PANORAMA-SISTEMA.md`,
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
- **2026-08-17** — Migración 061 (`README.md`, `docs/PANORAMA-SISTEMA.md`,
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
  como fija `docs/PANORAMA-SISTEMA.md` §5). Línea base real verificada:
  **95 tests pasan + 1 se salta (96 total, 0 en rojo)** — ni el "88/97" ni
  el "96/97" que se habían documentado antes eran correctos; `AGENTS.md`
  corregido con la cifra real. Detalle completo en
  `docs/PANORAMA-SISTEMA.md` §6.
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
  gana el select de tipo. Cierra el pendiente de `docs/PANORAMA-SISTEMA.md`
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
  `docs/PANORAMA-SISTEMA.md` §5 y `docs/HISTORIAL-AUDITORIAS.md`.
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
  canal de entrega. Actualizados README.md, `docs/PANORAMA-SISTEMA.md` y
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
  solo para tablas de prueba nuevas, `docs/PANORAMA-SISTEMA.md` §7) a
  cualquier INSERT/UPDATE/DELETE de diagnóstico contra datos reales —
  limpieza en la misma sesión + registro explícito obligatorio. Agregada
  nota junto a `siguiente_codigo_ticket()` en `docs/PANORAMA-SISTEMA.md`
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
  de `crear_notificacion()` en `docs/PANORAMA-SISTEMA.md`.
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
  `docs/PANORAMA-SISTEMA.md` (esquema hasta 047, decisiones revisadas),
  `docs/GUIA-UX-UI.md` (vigencia, componente `NotificacionesCampana`). Se
  fusionaron los dos informes de auditoría sueltos en la raíz en
  `docs/HISTORIAL-AUDITORIAS.md` (con estado reconciliado hallazgo por
  hallazgo) y se crea este changelog.

---

## Apéndice — Historial detallado de decisiones de diseño (migrado desde `docs/GUIA-UX-UI.md`)

> Bloque movido tal cual desde el interior de `docs/GUIA-UX-UI.md` (vivía ahí
> bajo "Componentes compartidos", mezclado con la referencia del design
> system) en la reorganización de documentación de 2026-08-29. Orden
> original preservado (más antiguo primero, según se fue escribiendo cada
> pasada) — no resecuenciado contra las entradas de arriba, que están en
> orden inverso. Contenido sin editar más allá de esta nota.

#### Changelog — auditoría y estandarización (2026-08-12)

- **Bug de renderizado (sesión anterior)**: se auditaron los 46 componentes
  y los 3 tableros nodo por nodo (bounds + captura). No se encontraron
  nodos fantasma persistentes — el problema de la sesión anterior era caché
  de render del cliente en nodos creados con `Insert` dentro de la misma
  sesión en vivo (no repintaban hasta recargar), no corrupción de datos.
  **El mismo bug reapareció dos veces durante esta auditoría** al insertar
  el componente `Logotipo compacto` desde cero: los nodos quedaban con
  datos correctos (confirmado con `bounds`) pero invisibles hasta recargar.
  Patrón de corrección usado: `Copy` de un nodo recién insertado fuerza el
  repintado inmediato, mientras que el `Insert` original se queda en blanco
  en la misma sesión — por eso el componente final se promovió desde una
  copia verificada en vez de dejar el `Insert` original.
- **Nomenclatura**: se renombraron los 46 componentes raíz con el prefijo
  de familia (ver arriba) y se corrigieron 7 capas internas con nombres
  genéricos ambiguos (`Texto` usado a la vez para un texto suelto y para un
  frame contenedor en `Modal`, `Tarjeta`, `Diálogo de confirmación`,
  `Cabecera de módulo` e `Ítem de notificación`; ahora `Título`/`Textos`
  según corresponda). El texto "sistema ti" del logotipo pasó de estar
  nombrado por su contenido a `Texto de marca`.
- **Tokens**: se compararon los 71 `--*` declarados en `main.css`
  contra las variables de `design.pen`. Se agregaron 13 tokens reales que
  faltaban y estaban en uso activo en el código: `font-mono`, `ring`
  (`--ring`, el anillo de foco), `accent-2`, `success` (color base,
  distinto de `success-text` en oscuro), `warning-text-strong`,
  `warning-bg-strong`, `teal-bg-subtle`, `brand-elevated`, `brand-ink`,
  `purple-border`, `sky-border`, `teal-border`, `scroll-shadow`. Se
  corrigió un bug de fidelidad ya presente en la primera versión: el
  overlay de `Modal` tenía un valor de tema oscuro inventado (`main.css` no
  define uno — el `.modal-bg` no tiene override por tema) y `Barra de
  capacidad` usaba `$success-text` en vez de `$success` (diverge en oscuro:
  `#6EE7B7` vs `#34D399`), igual que `.capacity-fill--ok` en `main.css`.
  `brand-elevated`, `brand-ink`, `purple-border`, `sky-border`,
  `teal-border` y `radius-xl` están declarados en `main.css` pero **ninguna
  regla los consume actualmente** — deuda del código fuente, migrados de
  todos modos para paridad 1:1, y señalados como no usados. `scroll-shadow`
  tampoco es replicable 1:1: `main.css` lo usa dentro de 4 gradientes en
  capas con `background-position`, que el modelo de `Fill` de Pencil no
  soporta — se migró el color plano, no el efecto compuesto.
  `accent-alt`/`accent-subtle-bg`/`accent-subtle-text` no generaron tokens
  nuevos a propósito: son duplicados exactos (mismo valor, mismos temas) de
  `accent-2`/`accent-subtle`/`accent-text` ya existentes en el propio
  `main.css`, y crear una segunda variable idéntica habría violado la regla
  de "sin duplicados". `shadow-sm/md/lg` valen `none` en las tres — no son
  representables como variable de color/número; se honran por ausencia de
  efecto de sombra en todos los componentes (ningún componente de la
  librería usa `effect: shadow`), consistente con la decisión de producto
  "sin sombras en contenedores" (DS v0.3 §3.4).
- **Estados y variantes**: se agregaron filas "Estados" con casos reales
  del código (no inventados) a `Primitivas/Botón` (hover, focus con anillo
  visible, cargando con `spinner-icon` — patrón usado en 35+ archivos —, y
  un "deshabilitado" anotado como inferido porque `.btn` no define
  `:disabled` en `main.css`), `Formularios/Campo de texto` (focus con
  `$ring`, "con error" mostrando el patrón real: sin borde rojo, solo
  `.form-error` + `aria-invalid` para lectores de pantalla, y
  "deshabilitado" con la misma salvedad que `.btn`) y
  `Navegación y marca/Ítem de navegación` (hover; sin `:focus-visible`
  propio, anotado). `Badge estado` se dejó explícitamente sin estados de
  interacción con una nota: no es interactivo en el código (`<span>` de
  solo lectura). Se agregó una variante "alerta" a `Tarjeta de métrica`
  usando `warning-bg-strong`/`warning-text`, el único uso real de esos
  tokens (`.stat-icon--alerta` en `DashboardView.vue`).
- **Logo (posicionamiento absoluto)**: se evaluó convertir el logotipo a
  auto layout escalable. **Confirmado empíricamente que no es posible con
  las primitivas actuales de Pencil**: sobreescribir `width`/`height` en
  una instancia no reescala sus hijos con `layout: "none"` (quedan con las
  coordenadas absolutas originales y se desbordan o se ven diminutos según
  el caso) — verificado con `bounds` reales, no con capturas (una captura
  de un nodo aislado no sirve para juzgar escala real: la herramienta
  ajusta la imagen a un tamaño de miniatura consistente sin importar el
  tamaño real del nodo, lo que produjo un falso positivo inicial). Por eso
  el logotipo se mantiene como dos componentes independientes con
  geometría propia (`Logotipo Materen — Sistema TI` 394×100 y
  `Logotipo compacto` 110×28), no como variantes de tamaño de un mismo
  componente. Es la única forma de que ambos tamaños rendericen fielmente
  hoy; queda anotado en el tablero (ficha `Marca`) para que no se intente
  "simplificar" de nuevo sin volver a probar. `Símbolo Sistema TI` (28×28,
  icono solo) se mantiene aparte porque corresponde a un archivo fuente
  distinto (`icon_sisti.svg`), no es una variante de tamaño del lockup.
- **Accesibilidad (WCAG AA)**: se midió contraste real (fórmula de
  luminancia relativa, no aproximado) de los 9 pares badge fondo/texto en
  ambos temas — todos pasan AA (mínimo 4.86:1 en claro, 5.84:1 en oscuro
  compuesto sobre `bg-elevated`), botón primario en ambos temas (5.39:1 /
  9.84:1) y los 13 tokens nuevos. Dos hallazgos reales, ambos del código
  fuente (no de la migración): la deuda ya conocida de `text-muted`
  terciario, ampliada con la medición en oscuro (ver arriba), y un bug
  nuevo no registrado antes en `.btn-danger:hover` (ver arriba). Ninguno
  se "corrigió" en Figma — se documentan y, en el caso del botón de
  peligro, se reproducen visiblemente en el propio tablero para que no
  pasen desapercibidos.

**Pendiente / requiere decisión de diseño** (no resuelto en esta pasada):

- El patrón "aviso de advertencia" (`warning-bg` + `warning-text-strong`,
  fondo suave con texto reforzado) se usa en 3 vistas
  (`BajaEmpleadoModal.vue`, `EntregaView.vue` ×2) pero no tiene componente
  propio en la librería — no se agregó por estar fuera del alcance de "los
  46 componentes existentes"; queda como candidato a incorporar.
  `--color-brand-elevated`/`brand-ink`/`purple-border`/`sky-border`/
  `teal-border`/`radius-xl` migrados pero sin ningún consumidor en el
  código actual — decidir si se eliminan de `main.css` o se usan.
- El bug de `.btn-danger:hover` en oscuro y la extensión de la deuda U-01
  a tema oscuro no están todavía en `docs/HISTORIAL-AUDITORIAS.md` — se
  señalan aquí porque surgieron de esta auditoría de `design.pen`, no se
  registró un hallazgo formal nuevo ahí para no invadir ese documento sin
  pedido explícito.

#### Changelog — propuesta de rediseño de paleta (2026-08-12, tercera pasada)

> **Archivada (2026-08-27)**: esta propuesta (verde/teal, notación de
> puntos) nunca se portó a producción. La dirección real de marca terminó
> siendo la azul validada en el Style Lab — ver "Identidad de marca" y su
> changelog "migración de marca al azul, Fases G0-G5". Se deja el registro
> completo abajo por valor histórico, no como propuesta vigente.

Reemplazo completo de los tokens de color de `design.pen` (no de
`main.css`) por una propuesta nueva, anclada en los dos colores del logo
(`#34D399`/`#072E2A`, sin modificar) y en notación de puntos
(`brand.400`, `text.primary`, `success.bg`...) en vez del `kebab-case`
anterior. Iniciativa del usuario con cálculos de contraste propios; yo
verifiqué cada valor, encontré y resolví un problema real antes de aplicar
nada, derivé los tokens que faltaban con la misma metodología, y reescribí
las 383 referencias de color de los 46 componentes (290 propiedades
directas + 93 overrides de instancia).

- **Bug encontrado en el brief antes de implementarlo**: `brand.600`
  (candidato obvio para "acento sólido", ya que su valor en oscuro
  coincidía con el patrón del `accent-hover` anterior) fallaba contraste
  con texto blanco en **ambos** temas — 3.77:1 en claro, **1.92:1 en
  oscuro** (porque `brand.600` oscuro = `brand.400` = el verde crudo del
  logo). Es el mismo número exacto que el bug de `accent-soft` que esta
  paleta buscaba eliminar (punto 3 del brief), reaparecido un paso más
  arriba en la escala. Consultado con el usuario; resuelto usando
  `brand.700` como acento (5.48:1 claro) y tematizando `text.on-brand`
  (blanco en claro, `#072E2A` en oscuro, 8.91:1) en vez de dejarlo fijo en
  blanco como pedía el brief original — necesario porque ningún verde de
  la mitad superior de la escala en modo oscuro despeja 4.5:1 con blanco.
- **Segundo hallazgo, encontrado ya en producción de las muestras**: el
  brief no incluye un hue "teal/cian" (evita a propósito la zona
  verde-teal para no competir con la marca), pero el sistema anterior
  usaba teal para la prioridad "Media" de tickets. Mi primer intento
  reasignó esa prioridad a `categoric.blue` — que resultó ser el mismo hex
  exacto que `info.solid` (#2563EB), recreando la colisión semántica que
  el punto 2 del brief buscaba eliminar (esta vez entre "Abierto" y
  "Media"). Corregido reasignando a `categoric.indigo`, con su propio par
  bg/text/border derivado y verificado.
- **Tokens sin equivalente en el brief, derivados con la misma
  metodología** (tinte ~90% hacia blanco/superficie para `.bg`,
  oscurecido/aclarado por tema para `.text`, verificados ≥4.5:1; bordes
  decorativos verificados ≥3:1 donde fue posible):
  `border.subtle`, `ring` (basado en `brand.700` al 28% alfa, mismo patrón
  que el sistema anterior), `success/warning/danger/info.border`,
  `warning.text-strong`/`warning.bg-strong` (mismos roles que ya existían:
  avisos reforzados y `.stat-icon--alerta`), `neutral.bg/text/border`
  (sobre `categoric.slate`, reemplaza al `neutral` que el brief no
  contemplaba pero que sigue en uso real para Inactivo/Cerrado/De baja) y
  `categoric.*.bg/.text/.border` para los 8 hues (el brief solo daba
  sólidos). Todos marcados como "derivado" en el tablero (sección
  `Tokens`), no como parte del brief original.
- **50 tokens del sistema anterior eliminados** de `design.pen` tras
  confirmar cero referencias rotas (`bg-elevated`, `accent*`,
  `success/warning/danger-bg/text/border`, `info-*`, `neutral-*`,
  `purple/sky/teal-*`, `logo-acento`/`logo-tinta` — consolidados en
  `brand.400`/`brand.900` porque son el mismo valor —, `brand`,
  `brand-elevated`, `brand-ink`). `ring`, `overlay`, `font-mono` y la
  escala de radios/tipografía no cambiaron (fuera del alcance de esta
  paleta).
- **No se tocó**: `main.css`, ningún archivo `.vue`, ni
  `core/dominio-*.js` (que sigue mapeando a las clases `.badge--*`
  antiguas). Portar esta paleta a producción es un trabajo aparte, no
  incluido en esta pasada.

**Pendiente de esta pasada:**

- Decidir si `categoric.blue` (idéntico a `info.solid`, sin uso hoy) se
  conserva para uso futuro o se retira del brief por ser redundante.
- Portar la paleta a `main.css`/Vue queda pendiente de aprobación
  explícita — no se tocó ningún archivo de producción en esta pasada.
- Los derivados (`border.subtle`, `ring`, bordes semánticos, pares
  categóricos completos) están verificados por mí pero no vienen
  aprobados por el autor del brief — revisar antes de dar por definitiva
  la paleta.

#### Changelog — plan de migración a producción en 4 fases (2026-08-12, cuarta pasada)

`design.pen` lleva tres pasadas de trabajo puramente de diseño. Esta cuarta
pasada arma el **plan para llevarlo a producción sin romperla**: audita qué
tan alejado está el archivo del código real, aplica lo de bajo riesgo,
redacta specs para lo que sí requiere tocar `main.css`/`.vue`, y construye
la base para que Correos, Licencias, Equipos, Base de Conocimiento,
Problemas y Encuestas (ya tienen ruta y vista en el código, no tienen
tablero propio en `design.pen`) hereden un sistema consistente en vez de
reinventar cada uno el suyo.

**Fase 0 — Auditoría de estado real.** Releída completa de `main.css`
(1461 líneas, ya con los fixes de U-02/U-03/U-04/S-04/A-02/A-06 aplicados
desde la última vez que este documento se actualizó) y de
`components/shared/*.vue`. Confirmadas las 3 divergencias conocidas
(`:disabled`, borde de error, uso real de `$ring`) y encontradas 3 más,
todas nuevas — ver DS-01 a DS-05 en `docs/HISTORIAL-AUDITORIAS.md` para el
detalle y las fichas de desarrollo. Resumen de riesgo: DS-01 (a), DS-02
(b), DS-03 (b), DS-04 (b), DS-05 (c) — DS-05 es el único que toca 10
archivos de markup a la vez, el resto es CSS aislado.

**Fase 1 — Fixes de bajo riesgo, aplicados en `design.pen`:**
- `text.tertiary` (claro): mismo nombre de token, valor corregido de
  `#7D8590` (3,51:1) a `#6B737E` (4,51:1 contra `bg`, 4,80:1 contra
  `bg.elevated`) — **solo valor de token**, cero cambio de código si se
  porta a `main.css` (ver propuesta de valor para el token real,
  `#697281`/`#747C8B`, en el hallazgo U-01 ampliado).
- `danger.hover` (nuevo token, invariante `#DC2626`, 4,83:1 con blanco en
  ambos temas): reemplaza el hex hardcodeado `#E88870` del hallazgo de
  accesibilidad de la auditoría anterior. **Requiere código** — no es solo
  valor, hay que introducir la variable nueva y cambiar el selector
  `.btn-danger:hover` (ficha DS-01). El tablero (`Primitivas/Botón` → fila
  "⚠ Hallazgo de accesibilidad") ahora muestra el antes (bug reproducido
  tal cual) y el después (con `$danger.hover`) lado a lado.
- Labels de los selects de filtro: reactivados en
  `Contenedores/Barra de filtros` (estaban con `enabled:false` a propósito,
  reproduciendo el bug real). **Requiere código** — no había nada que
  reactivar en el markup real (no existe un label oculto, nunca hubo
  ninguno); es agregar `<label>` nuevo en 10 vistas (ficha DS-05).

**Fase 2 — Fichas para desarrollo.** DS-02 (`:disabled` unificado), DS-03
(estado de error visual) y DS-04 (cobertura de `:focus-visible`/`$ring` en
`.sb-nav-item`, `ThOrdenable`, `BuscadorCombo` y `AppSearch` — ninguno de
los 4 tiene hoy tratamiento de foco propio) quedaron documentados como
fichas completas (qué cambia / selector / cómo verificar en QA) en
`docs/HISTORIAL-AUDITORIAS.md`, no en este archivo, siguiendo la regla de
`AGENTS.md` de que los hallazgos de auditoría viven ahí. Ninguno de los 3
se implementó en `design.pen` más allá de lo que ya existía (los variant
sets de Fase 3 ya modelan visualmente DS-02/DS-03).

**Fase 3 — Fundación de escalamiento**, nueva sección en el tablero
(`Librería de componentes` → "Fundación de escalamiento"):
- Escala `space-1` a `space-12` (2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40,
  48px) — cubre el 90%+ de los valores crudos ya en uso en `main.css`
  (medido por frecuencia: 2/3/4/5/6/8/10/12/16px y sus equivalentes en
  `rem`). Migración progresiva, no total: los componentes nuevos
  (Correos, Licencias, etc.) la usan desde ya; los 1461 líneas de
  `main.css` existentes se migran en su próximo ciclo de cambio cada uno,
  no de una vez — no se tocó ningún `padding`/`gap` crudo de `main.css` en
  esta pasada.
- Variant sets completos (variante × estado) de `Primitivas/Botón` (4
  variantes × 5 estados = 20 combinaciones), `Formularios/Campo de texto`
  y `Formularios/Campo select` (4 estados cada uno, con nota de qué es real
  del código y qué es inferido). Reemplazan las filas de "Estados"
  sueltas de la auditoría anterior como referencia canónica para módulos
  nuevos — esas filas sueltas se dejaron intactas (documentan detalle de
  foco con más precisión que la celda compacta de la matriz), la matriz
  es la vista de conjunto.
- Propuesta de reagrupación del sidebar: los mismos 8 ítems planos de hoy
  bajo "GESTIÓN" reorganizados en 3 subgrupos semánticos (Personas;
  Activos y credenciales; Conocimiento y mejora) — **mismos `path` e
  íconos, verificados contra `router/routes/*.js`**, solo cambia el
  encabezado de grupo en `AppNav.vue` (`navGrupos`). No se aplicó en esta
  pasada: era un cambio de arquitectura de información que requería
  validación de producto antes de tocar código, no solo de diseño —
  **validado y portado a producción el 2026-08-13**, ver sección "Sidebar
  (minimalista, sigue el tema)" y el changelog al final de este documento.

**Qué requiere coordinación con desarrollo antes de aplicarse**: DS-01,
DS-02, DS-03, DS-04 (las 4 fichas de `docs/HISTORIAL-AUDITORIAS.md`) y
DS-05 (la de mayor alcance, 10 archivos). Ninguna se tocó en el código en
esta pasada.

**Qué se puede aplicar de inmediato sin dependencias**: el valor de
`text.tertiary`/`--color-text-tertiary` (fix (a) puro, un solo número
en `:root` y otro en `[data-theme="dark"]`, cero riesgo de romper nada);
todo lo de Fase 3 en `design.pen` ya está aplicado y no depende de nada
del código.

#### Changelog — cierre de la migración, ronda 2 (2026-08-12, quinta pasada)

Los 5 puntos que quedaban abiertos de la Fase 3 anterior, resueltos en
`design.pen` (ninguno toca `main.css`/`.vue` — son cambios de diseño puro):

1. **Adopción real de `space-1..12`**: se auditaron los valores crudos de
   `gap`/`padding` de los 46 componentes + las 2 pantallas de ejemplo (el
   tablero de documentación, `Librería de componentes`, se excluyó a
   propósito del barrido — sus filas "Fila" y paddings de ficha son
   maquetación de la documentación, no parte del sistema que se envía a
   producción; los valores 22/32/36/48 que parecían "sin mapear" solo
   existían ahí). De 17 valores crudos reales: 9 coincidían exacto con un
   token (2/4/6/8/10/12/16/20/24), 7 quedaron a mitad de camino entre dos
   tokens (3, 5, 9, 11, 13, 14, 18) y se resolvieron con una regla
   consistente — empate exacto → redondear hacia el token mayor — excepto
   dos excepciones documentadas que se dejaron en valor crudo: `Eje` en
   `Ítem de timeline` (`padding-top: 3px`, alinea ópticamente el punto con
   la primera línea de texto) y `Estado vacío` (`padding: 56px` vertical,
   aire intencional alrededor del ilustrativo, por encima del tope de la
   escala). Resultado: **83 propiedades migradas, 0 valores crudos
   mapeables restantes, 2 excepciones documentadas**.
2. **Sidebar real reagrupado**: `Navegación y marca/Barra lateral` ya no
   tiene el grupo plano "GESTIÓN" — sus 8 ítems se movieron (no se
   recrearon, mismas instancias) a 3 subgrupos nuevos (PERSONAS; ACTIVOS Y
   CREDENCIALES; CONOCIMIENTO Y MEJORA). "Empleados" conserva su estado
   activo (`fill: $brand.50`, texto `$brand.700`, `fontWeight: 600`) sin
   cambios — se movió el nodo, no se recreó. Ambas pantallas de ejemplo
   (`Empleados — listado`, claro y oscuro) lo heredan automáticamente por
   ser instancias de `Barra lateral`, no copias independientes.
3. **`$social.whatsapp`/`$social.whatsapp.hover`** (`#25D366`/`#1EBE57`,
   mismo valor en ambos temas — coincide con `--color-whatsapp(-hover)`
   real, que tampoco varía por tema): reemplazan el hex hardcodeado en las
   5 celdas de la variante WhatsApp del variant set de Botón, más la
   muestra suelta de `Primitivas/Botón`.
4. **`Primitivas/Botón icono`**: padding subido de `$space-3`(6) a
   `$space-7`(16) — área táctil 49×49px (antes ~29×29), sin tocar el
   ícono (sigue en 17×17). Se agregó `context` en el componente base
   documentando la obligación de `aria-label` por instancia, más una capa
   de texto oculta (`enabled:false`) como refuerzo visual en el árbol de
   capas, y se anotó el `context` de las 10 instancias reales
   (Anterior/Siguiente de Paginación, Menú de Fila de tarjeta y de Fila de
   tabla, Editar de Fila de tabla, Cerrar de Modal, Descartar de Aviso
   emergente, Colapsar/Tema/Salir del sidebar) con el texto exacto — 4 ya
   confirmados contra el código real (`Pagination.vue`, `Modal.vue`,
   `AppNotifications.vue`), 6 propuestos y marcados como pendientes de
   confirmar con desarrollo. Extendido también a `Campana de
   notificaciones` (32×30→44×44): no es una instancia de `Botón icono`
   pero en el código real comparte la clase `.icon-btn` — mismo problema,
   mismo fix; queda anotado como candidato a refactor (componer sobre
   `Botón icono` en vez de duplicar su estructura).
5. **Foco visible extendido**: `Ítem de navegación` (nueva fila "Focus",
   con nota actualizada — ya no dice solo "no tiene foco", ahora aclara que
   esa fila es la propuesta del hallazgo DS-04), `Paginación` (fila
   "Estados — foco en controles" sobre el botón "Anterior") e `Ítem de
   menú` (fila "Estados" aislada, Default vs. Hover=Focus — se muestran
   **idénticos a propósito**: `.menu-acciones__item:hover` y
   `:focus-visible` comparten literalmente la misma regla en `main.css`,
   no es una omisión). `Ítem de combo` se dejó **sin** anillo de foco, con
   nota explícita: usa el patrón `aria-activedescendant` (el `<input>`
   conserva el foco de DOM, `@mousedown.prevent` evita que el `<li>` se
   enfoque) — agregar un `:focus-visible` ahí sería modelar una interacción
   que el componente no tiene.

**Bug de renderizado, tercera aparición**: volvió a pasar exactamente lo
mismo que en la auditoría original — un frame nuevo creado con `Insert`
("Anillo de foco" de `Ítem de navegación`) quedó con datos correctos
(confirmado con `bounds`) pero invisible hasta que se promovió vía `Copy`.
Mismo patrón, misma corrección; se sigue sin poder prevenir, solo detectar
y corregir con el mismo truco.

**(a) Qué cambió**: los 5 puntos, todos en `design.pen`. **(b) Riesgo**:
ninguno toca `main.css`/`.vue` — son cambios de diseño puro, sin
coordinación de desarrollo necesaria para *este* archivo (el sidebar real y
`aria-label` sí la necesitan para pasar a producción, pero eso ya estaba
señalado y sigue igual). **(c) Pendiente**: los 6 `aria-label` propuestos
(no confirmados contra código) para `Botón icono`; decidir si `Campana de
notificaciones` se refactoriza para componer `Botón icono`; los 5
hallazgos DS-01 a DS-05 de la pasada anterior siguen abiertos, no se
tocaron acá.

#### Changelog — primer porteo a producción, Fases A-E (2026-08-13, sexta pasada)

Primera vez que algo de `design.pen` sale del propio archivo y toca
`main.css`/`.vue` en producción. Cinco commits separados:

- **Fase A (tokens)**: `--space-1..12` (base 4px), `--color-whatsapp-text`,
  y los invariantes `--color-danger-hover`/`-solid` (#DC2626 en ambos
  temas). **Deliberadamente aditivo**: no se tocó ningún nombre `--color-*`
  ni `--color-*` existente — la propuesta de paleta en notación de puntos
  (tercera pasada) sigue sin aprobación explícita para portarse.
- **Fase B (botón)**: `.btn-danger-solid` nuevo (confirmaciones destructivas
  irreversibles, sólido desde el default — distinto de `.btn-danger`, que es
  el tratamiento "soft" existente). Foco de las 5 variantes migrado de
  `outline` a anillo externo (`box-shadow`), color de anillo propio por
  variante (verde de marca / rojo / verde WhatsApp). Efecto colateral:
  **DS-01 resuelto** (`.btn-danger:hover` ya no hereda el salmón de
  `--color-danger` en oscuro). Decisión de producto confirmada con el
  usuario: `:disabled` unificado a `opacity:.5` en las 5 variantes +
  `.icon-btn` (antes `.4`, único con regla propia) — **DS-02 solo
  parcialmente resuelto**, `input`/`select` de formulario siguen sin regla
  propia (fuera de alcance, no se preguntó por eso).
- **Fase C (toast)**: 4 variantes semánticas (`.toast-success/-error/-warning/-info`)
  con fondo de color real (antes: fondo neutro con solo el ícono verde,
  sin distinguir tipo). `toast.js` gana un mapa de íconos por tipo
  (warning/info sin uso real todavía, listos para cuando se necesiten).
- **Fase D (hover)**: de los 5 componentes pedidos, 4 ya tenían hover propio
  (combo, menú de acciones, ítem de sidebar, ítem de notificación) — solo
  `ThOrdenable` lo tenía a medias (cambiaba color, no fondo). Único cambio
  real de esta fase.
- **Fase E (logo)**: ya estaba resuelta al empezar esta pasada (trabajo de
  una sesión anterior, sin commitear) — se verificó contra el nodo
  `Símbolo Sistema TI` de `design.pen` y se commiteó tal cual.

**Qué sigue sin portar, a propósito**: DS-03 (borde de error de formulario)
y DS-04 (cobertura de `:focus-visible` en navegación/`ThOrdenable`/buscadores)
— ambos requieren la misma decisión de producto que `:disabled`, no se
tocaron. DS-05 (labels de filtro) tampoco. La propuesta de paleta de puntos
sigue solo en `design.pen`.

#### Changelog — sidebar reagrupado a producción (2026-08-13, séptima pasada)

Se portó a `AppNav.vue` la propuesta de reagrupación semántica del sidebar
que hasta ahora solo vivía en `design.pen` (ver "Propuesta de reagrupación
del sidebar" más arriba, en el changelog de la quinta pasada). Validado con
el usuario antes de tocar código (mismo grupo elegido que ya estaba diseñado,
más el título "Día a día" agregado al bloque superior por consistencia
visual con el resto de los grupos).

- El grupo plano "Gestión" (8 ítems sin subdivisión) se dividió en 3
  subgrupos: **Personas** (Empleados, Pre-registro de personal solo JEFE),
  **Activos y credenciales** (Correos, Licencias, Equipos), **Conocimiento y
  mejora** (Base de Conocimiento, Problemas, Encuestas). Mismos `path` e
  íconos que antes — solo cambió el array `navGrupos` en `AppNav.vue`, cero
  CSS nuevo.
- El bloque superior (Dashboard, Tickets), antes sin título de grupo, ahora
  lleva el título "Día a día" — mismo tratamiento visual que los demás
  grupos (uppercase 10.5px, oculto en modo colapsado).
- "Administración" no cambió.

**(a) Qué cambió**: `frontend/src/components/shared/AppNav.vue` (`navGrupos`
y su comentario) + esta guía (sección "Sidebar" y la nota de la propuesta
original). **(b) Riesgo**: ninguno — mismas rutas, mismos íconos, sin tocar
`main.css`. **(c) Pendiente**: nada abierto por este cambio puntual; sigue
sin decidir todo lo de DS-03/DS-04/DS-05 y la paleta de puntos, sin relación
con el sidebar.

#### Changelog — acordeón por grupo en el sidebar (2026-08-13, octava pasada)

Pedido explícito del usuario, distinto del colapso general del sidebar (rail
de 64px): cada grupo de `navGrupos` ahora se pliega/despliega individualmente
al hacer click en su título.

- Cada grupo ganó un `id` fijo (`dia-a-dia`, `personas`,
  `activos-credenciales`, `conocimiento-mejora`, `administracion`),
  desacoplado del `label` visible, usado como clave de persistencia.
- `.sb-nav-titulo` pasó de `<div>` a `<button>` con chevron
  (`ti-chevron-right`/`ti-chevron-down`, cambio de ícono — mismo criterio que
  `CategoriasTicketPanel.vue`, sin `transform: rotate` porque no existe esa
  clase en `main.css`) y `aria-expanded`/`aria-controls`.
- Persistencia en `localStorage`, clave nueva `sistema-ti-sidebar-grupos`
  (ids separados por coma, string plano — separada de `sistema-ti-sidebar`,
  que sigue siendo el colapso general/rail).
- Tres reglas de interacción (detalladas en la sección "Sidebar" arriba):
  el modo rail ignora el colapso por grupo; la ruta activa revela su grupo
  sin persistir ese cambio; el badge de "Tickets sin asignar" se reubica en
  el título de "Día a día" mientras ese grupo está colapsado.

**(a) Qué cambió**: solo `frontend/src/components/shared/AppNav.vue` (estado,
`toggleGrupo`, `grupoVisible`, `badgeDeGrupo`, template, estilos nuevos) +
esta guía. **(b) Riesgo**: bajo — cambio autocontenido, no tocó
`AppLayout.vue` ni ninguna ruta; el `<button>` nuevo suma un
`:focus-visible` que antes no existía (mejora, no regresión) sobre un
elemento que antes ni siquiera era interactivo. **(c) Pendiente**: nada
abierto por este cambio; DS-03/DS-04/DS-05 y la paleta de puntos siguen
igual de pendientes que antes, sin relación con esto.

#### Changelog — footer de usuario condensado (2026-08-13, novena pasada)

Hallazgo del usuario: a 240px de ancho, avatar + nombre + 3 botones de ícono
(campana, tema, logout) en una sola fila dejaban al nombre solo ~66px antes
de truncarse (verificado con captura real: "a.gueva…").

- "Cambiar tema" y "Cerrar sesión" se movieron a un menú `⋮` en
  `AppLayout.vue`, reusando `MenuAcciones.vue` (mismo componente ya usado en
  menús de fila de tabla en `EmpleadosView.vue`/`CorreosView.vue`/etc.) —
  cero componente nuevo. Array `accionesUsuario` (computed) con las dos
  acciones + un separador.
- La campana de notificaciones (`NotificacionesCampana`) queda fuera del
  menú, visible directo — es información urgente/frecuente, no una acción
  de cuenta.
- Se eliminó `.sb-logout--salir` (clase que solo usaba el botón de logout
  quitado); `.sb-logout` se mantiene porque el toggle de colapso del
  sidebar (`.sb-collapse`) sigue usándola.

**(a) Qué cambió**: `frontend/src/components/shared/AppLayout.vue` (script:
`accionesUsuario` + import de `MenuAcciones`; template: footer; estilos:
comentario actualizado, clase muerta eliminada) + esta guía. **(b) Riesgo**:
bajo — tema y logout pasan de 1 click a 2 (abrir menú → elegir), aceptado
como costo del arreglo; verificado con capturas reales en modo expandido,
menú abierto, y rail. **(c) Pendiente**: nada abierto por este cambio.

#### Changelog — cierre de DS-04/DS-05, cumplimiento contra `design.pen` (2026-08-13, décima pasada)

Pedido explícito del usuario: que todo el sistema quede bajo las reglas del
design system y `design.pen`, corrigiendo cualquier inconveniente. Se
reauditaron directamente los nodos de `design.pen` vía Pencil MCP (no solo
`docs/HISTORIAL-AUDITORIAS.md`, que tenía algunas fichas desactualizadas)
antes de tocar código.

- **DS-04 (foco visible) resuelto**: `.sb-nav-item` (`AppNav.vue`) y
  `.th-ordenable-btn` (`ThOrdenable.vue`) ganaron `outline: 2px solid
  var(--color-accent); outline-offset: -2px` — mismo criterio ya usado en
  `.sb-nav-titulo`, para que el anillo no se recorte contra el `gap` de 2px
  entre ítems. `.sb-busqueda input` (`AppSearch.vue`) ganó
  `box-shadow: 0 0 0 3px var(--ring)`. `.combo-wrap input`
  (`BuscadorCombo.vue`) **ya estaba resuelto de hecho**: siempre vive dentro
  de `.form-group`, que ya trae anillo — la ficha original no lo había
  reverificado.
- **Dos gaps reales adicionales, no listados en DS-04, encontrados al
  comparar contra `design.pen` nodo por nodo**: `MenuAcciones.vue`
  (`.menu-acciones__item:focus-visible`) y `BuscadorCombo.vue`
  (`.combo-lista li.is-activo`) solo cambiaban el fondo en su estado de
  foco/activo; `design.pen` (`rowY1dDW`/`rowlEgjG`) modela además un anillo
  `$brand.700`. Ambos ganaron `box-shadow: 0 0 0 3px var(--ring)`,
  separado del `:hover` puro (que sigue sin anillo, solo fondo).
- **DS-05 (nombre accesible en selects de filtro) resuelto**: cada
  `<select>` de filtro se envolvió en `.filter-field` (clase nueva en
  `main.css`, reemplaza el `flex`/`min-width` que tenía `.filters select`
  directamente) con un `<label>` visible arriba. Corrección al conteo de la
  ficha original: son **7 archivos con 11 selects**, no 10 archivos —
  `ActividadView`, `CorreosView`, `EmpleadosView`, `EquiposView` (×2),
  `KbView` (×2), `ProblemasView` (×2), `TicketsView` (×2);
  `LicenciasView.vue` no tiene ningún select de filtro, la ficha original
  la listó por error.
- La página `/design-system` se actualizó en el mismo cambio para reflejar
  los fixes (ver `docs/HISTORIAL-AUDITORIAS.md`, Ciclo 3): las notas
  "pendiente" de sidebar/menú/combo/ordenable pasaron a notas "resuelto", y
  sus demos ahora muestran el anillo real en vez de simularlo igual que
  `Hover`.
- El reporte suelto `AUDITORIA-DESIGN-SYSTEM-PAGINA.md` (auditoría de la
  propia página `/design-system`, sin código) tenía varios hallazgos ya
  desactualizados contra el código real (el punto de "no leída" y el
  `.ds-toc` sticky que reportaba como faltantes ya estaban en el código) —
  se descartó en vez de aplicarlo a ciegas; lo verificable se reconcilió acá
  y en `docs/HISTORIAL-AUDITORIAS.md`.

**(a) Qué cambió**: `AppNav.vue`, `ThOrdenable.vue`, `AppSearch.vue`,
`MenuAcciones.vue`, `BuscadorCombo.vue`, `main.css` (`.filter-field`), 7
vistas con filtros, `DesignSystemView.vue` + esta guía +
`docs/HISTORIAL-AUDITORIAS.md`. **(b) Riesgo**: bajo — solo CSS de foco
(nuevo, no reemplaza nada visible en reposo) y markup de label/wrapper sin
tocar lógica; verificado con `npm run build`. **(c) Pendiente**: DS-02
(`input`/`select` sin regla de `:disabled` propia) y DS-03 (borde de error)
siguen abiertos — pendientes de decisión de producto, sin relación con este
cambio.

#### Changelog — 6 bugs del Ciclo 4 corregidos (2026-08-13, undécima pasada)

Auditoría de superficie UI/UX completa (skill `ui-ux-pro-max`, 65 archivos,
ver `docs/HISTORIAL-AUDITORIAS.md` Ciclo 4). De ~50 hallazgos, se corrigieron
en el momento los 6 de impacto real (bug funcional o violación directa de
una regla de producto ya fijada); el resto queda documentado como deuda
abierta (UX4-07 a UX4-53) para priorizar después.

- **Historial de ticket sin color**: `main.css` gana 5 reglas
  `.timeline-dot--info/warning/success/neutral/danger` (mismos tokens que
  usan los badges de estado) — antes no existían y el punto quedaba sin
  `background`.
- **Buscador global inoperable por teclado**: `AppSearch.vue` — los 5
  botones de resultado ganan `@click` (el `@mousedown.prevent` se deja vacío,
  solo para no perder el foco del input); `cerrarBusqueda()` ya no cierra la
  lista si el foco quedó dentro de ella (Tab desde el input hacia un
  resultado).
- **Regresión de contraste en WhatsApp**: `CuentasPanel.vue` tenía un
  `<style scoped>` que reintroducía `color:#fff` sobre `#25d366` (~2:1) —
  el mismo bug que `.btn-whatsapp` global ya evita a propósito. Se quitó el
  override, solo queda el ajuste de tamaño del botón.
- **Avatar de usuario**: `.sb-user-avatar` (`AppLayout.vue`) fijaba
  `color:#fff` sobre un gradiente que en tema oscuro es monocromo
  `--color-accent-2` (#34D399, ~1.9:1) — pasa a `var(--color-text-inverse)`,
  mismo token que ya usa `.btn-primary` para este caso exacto.
- **Borde de severidad a 3px**: `.accion-item--vencida`
  (`ProblemaDetalleView.vue`) bajó a 2px — ninguna otra excepción a la regla
  de "sin bordes &gt;2px" se agregó en esta pasada.
- **2 modales sin Escape/scroll-lock**: `TiposEquipoPanel.vue` y
  `CategoriasTicketPanel.vue` usaban un modal hand-rolled con
  `useFocoAtrapado` (solo atrapa Tab, no maneja Escape ni bloquea el scroll
  del body) en vez del `<Modal>` compartido que ya usan sus 2 pares
  equivalentes (`AreasObrasPanel.vue`/`UbicacionesPanel.vue`). Migrados al
  mismo patrón — mismo markup de formulario, sin cambios de comportamiento
  de guardado.

**(a) Qué cambió**: `main.css`, `AppSearch.vue`, `CuentasPanel.vue`,
`AppLayout.vue`, `ProblemaDetalleView.vue`, `TiposEquipoPanel.vue`,
`CategoriasTicketPanel.vue` + esta guía + `docs/HISTORIAL-AUDITORIAS.md`.
**(b) Riesgo**: bajo — todos son fixes puntuales verificados contra el
código real (`npm run build`, `npm test`, `node scripts/contraste.mjs`, los
tres en verde); ninguno cambia markup de formularios salvo la migración a
`<Modal>`, que reutiliza el mismo patrón ya probado en 2 paneles hermanos.
**(c) Pendiente**: los ~47 hallazgos restantes del Ciclo 4 (patrones
sistémicos como tarjetas móviles faltantes en 7 vistas, botones de
contraseña sin `aria-label`, objetivos táctiles bajo 44px, y hallazgos
puntuales por archivo) quedan abiertos en `docs/HISTORIAL-AUDITORIAS.md`
para una pasada futura.

#### Changelog — alineación de la barra de filtros (2026-08-13, duodécima pasada)

Pedido explícito del usuario ("arreglar y alinear los filtros en cada
módulo"). `.filters` (`main.css`) no fijaba `align-items`, así que heredaba
`stretch`: `.search-wrap` (sin label, 36px) quedaba top-aligned dentro de una
fila estirada a la altura de `.filter-field` (label + select, ~54px),
mientras el `<select>` se dibuja al fondo de su propia columna — resultado:
el buscador flotaba visiblemente ~18px más arriba que los selects en las 6
vistas que combinan ambos (Tickets, Problemas, KB, Equipos, Empleados,
Correos).

- **Fix de un solo token**: `.filters { align-items: flex-end; }` — todos
  los hijos directos (`.search-wrap`, `.filter-field`, `.chips-filtro` en
  Tickets, el `.btn` de "Solo pendientes" en Pre-registros) miden 36px de
  alto en su fila de control real, así que alinear por el borde inferior los
  deja en la misma línea de base sin tocar ningún archivo `.vue`.
  `LicenciasView`/`EmpresasView`/`PlataformasView` (solo buscador, sin
  selects) no cambian visualmente — ya estaban alineados al no tener un
  segundo elemento con el que desalinearse.
- **Verificado con captura real** (no solo lectura de CSS): página estática
  de prueba servida por el dev server de Vite, cargando el `main.css` real
  del proyecto, capturada con Playwright en desktop (960px, filas de
  Tickets/Equipos) y en móvil (375px, filtros apilados) — confirmado el
  borde inferior común en ambos casos antes de aplicar el fix a producción.
  El archivo de prueba se borró al terminar, no quedó en el repo.

**(a) Qué cambió**: `main.css` (`.filters`) + esta guía +
`docs/HISTORIAL-AUDITORIAS.md` (UX4-54). **(b) Riesgo**: bajo — un solo
token de layout, sin cambios de markup; verificado con `npm run build`,
`npm test` y captura visual real antes y después. **(c) Pendiente**: nada
abierto por este cambio puntual; los ~47 hallazgos restantes del Ciclo 4
siguen igual de pendientes, sin relación con esto.

#### Changelog — rediseño de sidebar y dropdowns (2026-08-13, décimotercera pasada)

Pedido explícito del usuario: sidebar "profesional y usable, que no
confunda", Configuración movida al menú donde están tema/salir, y rediseño
de "todos los dropdowns del sistema". Dirección del sidebar confirmada con
el usuario antes de tocar código (retirar el acordeón, no solo pulirlo).

- **Acordeón por grupo retirado**: con ~12 ítems en 5 grupos, plegar/
  desplegar cada sección agregaba más reglas de comportamiento (rail que lo
  ignora, ruta activa que revela sin persistir, badge que se reubicaba en
  el título de "Día a día" al colapsar) que valor real — patrón más cercano
  a un sidebar de 40+ ítems que a este. `AppNav.vue` pierde `toggleGrupo`,
  `grupoVisible`, `grupoContieneRutaActiva`, `badgeDeGrupo` y la clave de
  `localStorage` `sistema-ti-sidebar-grupos`; `.sb-nav-titulo` pasa de
  `<button>` con chevron a un `<div>` estático, siempre expandido. El
  colapso general del sidebar a rail (64px, `sistema-ti-sidebar`) no
  cambia — sigue siendo el único eje de colapso.
- **Grupos vacíos no se renderizan**: al sacar Configuración de
  "Administración", ese grupo queda sin ítems para ASISTENTE (Actividad/
  Accesos sensibles son solo JEFE) — `navGrupos` filtra grupos con
  `items.length === 0` antes de pintarlos, para no mostrar un encabezado
  "Administración" sin filas debajo.
- **Configuración se mueve al menú `⋮`** (`AppLayout.vue`,
  `accionesUsuario`): primer ítem, antes de tema/logout — no es una
  sección de uso diario. El `label` accesible del trigger pasa de "Más
  acciones de la cuenta" a "Configuración y cuenta".
- **Jerarquía visual pulida**: `gap` entre grupos de 14px a 18px (más aire
  entre secciones sin agregar líneas divisorias, regla ya fijada del
  proyecto); `.sb-nav-titulo` de 10.5px a 11px con algo más de padding
  vertical, ahora que es una etiqueta y no un control que necesitaba caber
  en una fila angosta; `.sb-nav-item` de `9px 12px` a `10px 12px` de
  padding (objetivo de toque un poco más generoso).
- **Rediseño de dropdowns nativos, base global**: el primer intento estiló
  solo `.filters select`/`.form-group select` — pero varios `<select>` viven
  sueltos, sin ninguno de los dos wrappers (`StaffView.vue` `.rol-select`,
  `CategoriasTicketPanel.vue` dentro de `.cat-sub-nueva`, `ProblemaDetalleView.vue`
  en `.accion-item`/`.accion-form-nueva`, `ReporteTicketsModal.vue` el
  selector de mes/año), y esos se quedaban con el look nativo del
  navegador — justo "fuera del sistema" (hallazgo del usuario tras ver el
  primer intento). Corregido moviendo la base completa (altura, padding,
  borde, radio, fondo, chevron, foco) a un selector `select` global, sin
  atarla a ningún contenedor; `.filters select` y `.form-group select`
  quedan solo con sus ajustes de contexto (ancho 100%, padding-right del
  formulario). El chevron pierde la flecha nativa del navegador
  (`appearance: none`) por una de línea propia (mismo trazo que Tabler) en
  `--color-text-tertiary`, con su valor por tema (`#9CA3AF` claro / `#6B7280`
  oscuro, mismos hex que ya usa ese token). Los popovers custom
  (`MenuAcciones.vue`, `BuscadorCombo.vue`, `NotificacionesCampana.vue`) ya
  compartían borde/radio/sombra (`--color-border-strong`, `--radius-md`,
  `--shadow-lg`) — no necesitaron cambios, son el sistema al que los
  `<select>` nativos se suman ahora, envueltos o no.
- **Verificado con captura real**: reconstrucción estática del sidebar
  completo (mismo CSS de `AppNav.vue`/`AppLayout.vue` pegado literal, sin
  el hash de scope de Vue) servida por el dev server y capturada con
  Playwright — confirmado visualmente el estado activo, hover, el menú `⋮`
  con Configuración arriba de tema/logout, y el chevron de los `<select>`
  en ambos temas (`<html data-theme="dark">`, no un `<div>` anidado — los
  tokens de tema cuelgan de `:root`). Repetido después del fix a base
  global: 4 `<select>` lado a lado (envuelto en `.form-group`, suelto tipo
  `.rol-select`, suelto dentro de un toolbar mixto con input+botón, y
  `disabled`) — los 4 con el mismo borde/radio/chevron. Los archivos de
  prueba se borraron
  al terminar, no quedaron en el repo.

**(a) Qué cambió**: `AppNav.vue`, `AppLayout.vue`, `main.css` (`.filters
select`, `.form-group select`) + esta guía. **(b) Riesgo**: medio — a
diferencia de los cambios anteriores de este documento, este sí quita una
función que el propio usuario había pedido antes (el acordeón); confirmado
explícitamente con él antes de implementar. Verificado con `npm run build`,
`npm test` y captura visual real en ambos temas. **(c) Pendiente**: nada
abierto por este cambio; los ~47 hallazgos del Ciclo 4 y la propuesta de
paleta de puntos siguen sin relación con esto.

#### Changelog — atajo de teclado para el buscador global (2026-08-13, décimocuarta pasada)

Parte del roadmap de mejoras para el público de TI (junto con
observabilidad y rendimiento del dashboard, ver `docs/CHANGELOG.md` y
`docs/HISTORIAL-AUDITORIAS.md`). El buscador global (`AppSearch.vue`) ya
existe y ya tiene navegación por teclado dentro de sus resultados (pasada
anterior), pero solo se abría con clic/tap — Ctrl/Cmd+K (mismo atajo que
Linear/Notion/Vercel/GitHub) ahorra el viaje del mouse en el flujo más
repetido del día: buscar un ticket/empleado/cuenta.

- **`AppSearch.vue`** expone el método que ya usaba el botón de lupa del
  sidebar colapsado (`expandirYBuscar`) vía
  `defineExpose({ enfocar: expandirYBuscar })` — mismo patrón que
  `Modal.vue` (`defineExpose({ cerrar })`).
- **`AppLayout.vue`** agrega `ref="appSearchRef"` al `<AppSearch>` ya
  montado y un listener `keydown` en el mismo ciclo `onMounted`/
  `onUnmounted` que ya usa para el socket realtime. Guard: si el foco está
  dentro de un `[role="dialog"]` (`Modal.vue`/`ConfirmDialog.vue`), el
  atajo no hace nada — saltar al buscador del sidebar detrás de un overlay
  con foco atrapado sería confuso.
- **Verificado con la app real, no una reconstrucción**: a diferencia de
  las capturas estáticas de pasadas anteriores (que no pueden probar
  interacción JS), se montó `AppSearch.vue` de verdad en un componente
  `.vue` de prueba servido por Vite, y se usó Playwright para presionar
  Ctrl+K y confirmar por código (`document.activeElement`) que el foco
  cae en el input — y que con un `role="dialog"` enfocado, Ctrl+K no lo
  mueve. El primer intento de esta verificación usó un `h()` manual sin
  compilador de templates y el `ref` nunca se resolvía (warning de Vue
  "Missing ref owner context") — no era un bug del código real, era el
  arnés de prueba; se corrigió escribiéndolo como un `.vue` de verdad. Los
  4 archivos de prueba (`.vue`, `.js`, `.html`, script de Playwright) se
  borraron al terminar, no quedaron en el repo ni en `package.json`
  (Playwright se instaló solo temporalmente con `--no-save` para poder
  ejecutar el script, y se dejó fuera del lockfile).

**(a) Qué cambió**: `AppSearch.vue`, `AppLayout.vue` + esta guía. **(b)
Riesgo**: bajo — no reemplaza ninguna interacción existente, solo agrega
una nueva vía de entrada al mismo buscador ya probado. Verificado con
`npm run build`, `npm test` y la app real montada con Playwright. **(c)
Pendiente**: nada abierto por este cambio; sin hint visual del atajo (ej.
"⌘K" en el placeholder) — no estaba en el plan aprobado, se puede agregar
si se pide.

#### Changelog — cierre del backlog Ciclo 4, 47 hallazgos (2026-08-13, décimoquinta pasada)

Pedido explícito del usuario: seguir con el backlog de UX/UI ya documentado
(UX4-07 a UX4-53, `docs/HISTORIAL-AUDITORIAS.md`) en vez de seguir
agregando mejoras nuevas. 6 agentes en paralelo, cada uno sobre un conjunto
de archivos sin superposición entre sí (sin riesgo de choque de ediciones
concurrentes) — detalle completo hallazgo por hallazgo en
`docs/HISTORIAL-AUDITORIAS.md`, acá solo el resumen de patrones que tocan
el sistema de diseño:

- **Patrón `.lista-tarjetas` extendido a 7 vistas más** (`LicenciasView`,
  `AccesosSensiblesView`, `PersonalRegistrosView`, `StaffView`, `KbView`,
  `EncuestasView`, `EncuestaDetalleView`), replicado desde
  `ProblemasView.vue`/`EquiposView.vue` — mismas clases ya existentes en
  `main.css`, sin tokens nuevos.
- **`ConfirmDialog` reemplaza 2 patrones fuera del sistema**: `confirm()`
  nativo del navegador en `StaffView.vue` (desactivar staff) y un clic
  directo sin confirmación en `EncuestaDetalleView.vue` (cerrar ronda) —
  ambos ahora usan el componente compartido, mismo patrón que
  `TiposEquipoPanel.vue`/`AreasObrasPanel.vue`.
- **Un widget interactivo mal anidado, corregido**: `CategoriasTicketPanel.vue`
  tenía botones reales (editar/eliminar) dentro de un `role="button"` — se
  separó en un `<button>` real para expandir/colapsar (`.cat-fila-toggle`)
  y `.actions` como hermano, no hijo.
- **Foco visible añadido** a radios ocultos (`CorreoForm.vue`/`LicenciaForm.vue`)
  y a chips/botones que caían al outline nativo (`TicketsView.vue`,
  `ResponderEncuestaView.vue`) — mismo criterio de anillo ya establecido.
- **Campo "Notas" reactivado** en `EmpleadoForm.vue` (se mostraba en la
  ficha sin forma de editarlo) — se verificó que su remoción del
  formulario, años atrás, no tenía ninguna decisión de producto documentada
  en contra antes de reactivarlo.

**(a) Qué cambió**: 43 archivos (ver `docs/HISTORIAL-AUDITORIAS.md` para el
detalle completo por ítem) + esta guía + `docs/CHANGELOG.md`. **(b)
Riesgo**: bajo-medio — la mayoría son adiciones de accesibilidad/CSS
aisladas; los 2 cambios de mayor superficie (`StaffView.vue`,
`CategoriasTicketPanel.vue`) se revisaron manualmente además de la
verificación automática. `npm run build` + `npm test` (96/97) en verde
tras consolidar los 6 lotes. **(c) Pendiente**: el tuteo de UX4-52 se
repite en otros 9 `ConfirmDialog` fuera de este alcance (ver
`docs/HISTORIAL-AUDITORIAS.md`); nada más queda abierto del Ciclo 4.

#### Changelog — compactación del sidebar y colapso inteligente (2026-08-14, décimosexta pasada)

Pedido explícito del usuario: el sidebar "ocupa mucho espacio" — al aclarar,
el problema es la **densidad/alto vertical** (títulos de grupo, gaps entre
secciones, padding de ítems), no el ancho. Esto revierte parcialmente la
pasada del 13-ago-2026 ("rediseño de sidebar y dropdowns", ver arriba), que
había aumentado a propósito ese mismo padding/gap — confirmado con el
usuario que ahora se quiere ir en la dirección contraria. Revertir solo esos
dos valores puntuales recuperaba ~40px en total, poco perceptible dado que
la queja es sobre el peso general del bloque, así que se aplicó un paso de
compactación coordinado sobre todo el espaciado vertical, sin tocar
estructura, grupos, ítems ni copy (fuera de alcance sin pedido explícito).

- **Espaciado vertical reducido** en `AppLayout.vue` (`.sb-logo` de
  `20px 18px 14px` a `16px 16px 12px`; `.sb-footer` de `12px 14px` a
  `10px 14px`, mismo ajuste en su variante colapsada), `AppSearch.vue`
  (`.sb-busqueda` de `12px 14px 4px` a `10px 14px 4px`) y `AppNav.vue`
  (`.sb-nav` padding de `10px 10px` a `8px 10px`; gap entre grupos de
  `18px` a `12px` — revierte el `18px` de ayer; `.sb-nav-titulo` padding de
  `6px 12px 4px` a `4px 12px 2px`; `.sb-nav-item` padding de `10px 12px` a
  `8px 12px` — revierte el `10px` de ayer; los mismos valores se replican en
  los overrides de `.sidebar--colapsado`).
- **Colapso a rail inteligente por defecto**: `AppLayout.vue`, valor inicial
  de `sidebarColapsado` — si el usuario ya usó el toggle alguna vez, su
  preferencia guardada en `localStorage` (`sistema-ti-sidebar`) sigue
  mandando igual que antes; sin preferencia guardada, arranca colapsado
  (rail de 64px) en ventanas `≤1200px` — mismo breakpoint que ya usa
  `main.css`/`DashboardView.vue` para el reflow de columnas, no uno nuevo.
  Así el ancho del sidebar deja de competirle al contenido en laptops
  comunes sin que el usuario tenga que descubrir el botón de colapso. Sin
  listener de `resize`: es solo el valor inicial al montar.

**(a) Qué cambió**: `AppNav.vue`, `AppLayout.vue`, `AppSearch.vue` + esta
guía. **(b) Riesgo**: bajo-medio — revierte parte de una decisión de ayer
(el aumento de padding/gap) más allá de lo literal, confirmado con el
usuario antes de implementar; el nuevo default de colapso no tiene listener
de `resize`, por lo que redimensionar la ventana en caliente no recalcula el
estado (solo el valor inicial al montar/recargar). **(c) Pendiente**: nada
abierto por este cambio.

#### Changelog — reconciliación de design system, 13 hallazgos corregidos (2026-08-14, décimoctava pasada)

Pedido explícito del usuario: revisar todas las páginas contra el design
system y la implementación de componentes, y aplicar la lista de mejoras
resultante. Mismo método que la pasada anterior (6 agentes en paralelo,
uno por grupo de módulos, briefeados con la deuda ya documentada acá y en
`docs/HISTORIAL-AUDITORIAS.md` para no repetir hallazgos), esta vez con eje
en tipografía cruda, fallbacks CSS muertos y tono, dimensiones que la
pasada anterior (auditoría de consistencia global) no cubrió. Detalle
completo hallazgo por hallazgo en `docs/HISTORIAL-AUDITORIAS.md`, Ciclo 5
(UX5-01 a UX5-13); acá solo el resumen de lo que toca el sistema de diseño.

- **Regresión real de la pasada anterior, encontrada y corregida**: el
  `core/dominio-licencias.js` nuevo (centralización del umbral de
  vencimiento) dejó `LicenciasView.vue` con una referencia a `HOY`, variable
  que el propio refactor eliminó del scope — `ReferenceError` al usar
  "Renovar" en una licencia por suscripción. No es un hallazgo de diseño,
  pero se corrigió en el mismo pase por aparecer en la misma auditoría.
- **Gap real en `Modal.vue` compartido**: Escape, clic en el backdrop y la
  "X" cerraban el modal sin pasar por el chequeo de "cambios sin guardar"
  (`estaSucio`) que sí respetaba el botón "Cancelar" — la migración de
  `KbArticuloForm.vue`/`ProblemaForm.vue` a `Modal.vue` en la pasada
  anterior heredó este gap del propio componente, no lo introdujo. Fix:
  nuevo prop opcional `confirmarCierre` (función guard) en `Modal.vue`,
  default `null` — sin cambio de comportamiento para los ~10 consumidores
  que no lo pasan. Los 4 formularios afectados (`KbArticuloForm.vue`,
  `ProblemaForm.vue`, `EncuestaForm.vue`, `AccesoSensibleForm.vue`, este
  último migrado a `Modal.vue` en este mismo pase) ahora lo usan.
- **`AccesoSensibleForm.vue` migrado a `Modal.vue`**: quedó como el único
  formulario grande con modal hand-rolled tras la migración de
  `ProblemaForm.vue`/`KbArticuloForm.vue` — mismo patrón (`form="..."` +
  slot `#acciones`), sin cambiar campos ni comportamiento de guardado.
- **`BajaEmpleadoModal.vue` migrado a `Modal.vue`**: mismo patrón que
  `TiposEquipoPanel.vue`/`CategoriasTicketPanel.vue` en Ciclo 4 — ganó
  scroll-lock y Escape reales; sin `useDetectorDeCambios` (es una
  confirmación de solo lectura), así que no recibe `confirmarCierre`.
- **Tono**: cluster de tuteo nuevo, distinto del ya documentado en
  `ConfirmDialog` (UX4-52) — mensajes de `EmptyState`, validaciones de
  formulario ("Escribe" → "Escriba", "Describe" → "Describa", "Revisa" →
  "Revise") y copy público, en Encuestas, Empleados, Problemas, KB y el
  toast nuevo de `router/guards.js`.
- **Tipografía cruda → tokens** en 8 archivos que no habían pasado por
  ninguna auditoría anterior de este tipo (`DashboardView.vue`,
  `LoginView.vue`, `EntregaView.vue`, `EmpleadoDetalleView.vue` y otros 4)
  — valores sin token exacto se dejaron sin tocar y quedan anotados como
  pendiente de decisión de diseño en `docs/HISTORIAL-AUDITORIAS.md`.
- **Fallbacks CSS muertos** (`var(--x, var(--x))`, o fallback a un token
  que siempre está definido): completa lo que UX4-51 había dejado parcial
  en `CuentaForm.vue`, más `EquipoForm.vue` (incluía además un rojo
  inventado en vez de `--color-danger-hover`) y `LoginView.vue` — este
  último con un bug real de contraste de paso: `.login-aviso` usaba
  `--color-success` (alta saturación, pensado para íconos/botones sólidos)
  como color de texto sobre su propio `-bg` en vez de `--color-success-text`.

**(a) Qué cambió**: `Modal.vue`, `AccesoSensibleForm.vue`,
`BajaEmpleadoModal.vue`, `LicenciasView.vue`, `DesignSystemView.vue`,
`TicketsView.vue`, `DashboardView.vue`, `EmpleadoDetalleView.vue`,
`EmpleadosView.vue`, `EncuestasView.vue`, `EncuestaDetalleView.vue`,
`EncuestaForm.vue`, `EncuestaPublicaView.vue`, `KbArticuloForm.vue`,
`ProblemaForm.vue`, `ProblemaDetalleView.vue`, `router/guards.js`,
`LoginView.vue`, `EntregaView.vue`, `LicenciaForm.vue`, `CorreoForm.vue`,
`PersonalRegistrosView.vue`, `EquipoForm.vue`, `CuentaForm.vue` +
esta guía + `docs/HISTORIAL-AUDITORIAS.md` (Ciclo 5). **(b) Riesgo**: bajo
en general (fixes puntuales, `confirmarCierre` es aditivo); medio en las 2
migraciones a `Modal.vue` (mismo tipo de cambio de markup ya validado 2
veces en pasadas anteriores) — verificado con `npm run build` y
`npm test` (96/97 en verde, misma línea base) tras consolidar los 8 lotes.
**(c) Pendiente**: los valores de tipografía sin token exacto anotados en
`docs/HISTORIAL-AUDITORIAS.md`; nada más abierto por este cambio.

#### Changelog — auditoría de consistencia global, 11 hallazgos corregidos (2026-08-14, décimoséptima pasada)

Pedido explícito del usuario: revisar todas las páginas del sistema (~55
vistas) contra los patrones ya documentados acá (`PageHeader`, `EmptyState`,
`BadgeEstado`, `Modal`, "un solo `.btn-primary` visible por vista", colores
por dominio). 6 agentes en paralelo, uno por grupo de módulos; Correos,
Licencias, Equipos, Cuentas, Encuestas, Accesos sensibles, Actividad,
Empresas, Plataformas, Personal y Configuración salieron sin hallazgos
reales. Se corrigieron los 11 hallazgos reales encontrados, priorizando el
módulo nuevo de Staff/permisos (migración 056, todavía sin commitear al
momento de la auditoría).

- **`StaffModulosForm.vue` (módulo nuevo)**: modal hand-rolled migrado a
  `Modal.vue` compartido (mismo patrón que `EncuestaForm.vue`: `modal.value?.cerrar()`
  + `form="..."` en el botón de submit) — antes sin scroll-lock real. Los
  checkboxes de permisos ganaron `:focus-visible` propio
  (`outline: 2px solid var(--color-accent)`): viven fuera de `.form-group`,
  así que no heredaban el anillo de foco que sí tienen los checkboxes de
  formularios normales.
- **`StaffView.vue` (`.rol-select`, preexistente)**: quitados los overrides
  de borde/radio/fondo que pisaban el `select` global y le borraban el
  chevron (el propio comentario de `main.css` línea ~808 ya citaba este
  archivo como el caso que motivó unificar todo `<select>` bajo un solo
  estilo) — queda solo el `margin-right` de contexto.
- **Un solo `.btn-primary` por vista** (regla de "Principios de diseño",
  más abajo en este documento) — 3 hallazgos:
  - `TicketDetalleView.vue`: "Comentar" competía con la acción de estado
    (Iniciar atención/Marcar resuelto); bajado a `.btn` secundario.
  - `ReporteTicketsModal.vue`: el selector de granularidad (diario/semanal/
    mensual) usaba `.btn-primary` como estado "seleccionado", compitiendo
    con "Descargar PDF" — pasa a una clase `.is-activo` propia
    (`background: var(--color-accent-subtle)`, mismo par tenue-acento que
    `.chip-filtro--activo` de `TicketsView.vue`, sin ser la misma clase
    porque el control es un grupo `.btn` rectangular, no chips-pill).
  - `ProblemaDetalleView.vue`: el botón de cambio de estado seguía visible
    en modo edición junto al "Guardar" del formulario inline; se envolvió
    en `v-if="!editando"` (mismo patrón que ya usa `KbArticuloDetalleView.vue`
    con su botón "Publicar").
- **Borde de acento lateral + color inline** (`ProblemaDetalleView.vue`,
  tag "VENCIDA" de acciones correctivas): iba contra el principio ya fijado
  "sin bordes de acento en los costados, severidad por color de ícono +
  badge" (sección "Principios de diseño"). `.accion-item--vencida`
  (`border-left-color`) y `.accion-vencida-tag` (color inline) se
  eliminaron; la etiqueta pasa a un badge real (`badge badge--danger
  badge-inline`, texto "Vencida").
- **`BadgeEstado` no reutilizado** — 2 hallazgos, ambos en vistas públicas
  de tickets que reimplementaban `estadoInfo(ticket.estado)` a mano en vez
  de importar el componente (no dependen de sesión, podían usarlo igual):
  `TicketSeguimientoView.vue` y `TicketBuscarView.vue` pasan a
  `<BadgeEstado tipo="ticket" :valor="..." />`.
- **Modales hand-rolled sin `Modal.vue`** — 2 hallazgos: `KbArticuloForm.vue`
  y `ProblemaForm.vue` (ambos con el patrón de "cambios sin guardar" +
  `ConfirmDialog`) migrados al mismo patrón ya usado por `EncuestaForm.vue`
  — sin Escape/scroll-lock reales antes del cambio.
- **Badge "Sin vincular" de tickets duplicado 3 veces a mano**
  (`TicketsView.vue` ×2, `TicketDetalleView.vue` ×1): centralizado como
  `case 'ticket_sin_vincular'` en `core/badges.js` (label + clase); el
  ícono `ti-alert-triangle` se mantiene en el markup de cada sitio porque
  `BadgeEstado` no soporta contenido con ícono, solo texto.
- **Badge de vencimiento de licencia duplicado**: `EmpleadoDetalleView.vue`
  resolvía el vencimiento de licencia con una función local
  (`vencimientoLicencia()`) mientras su propio panel de Equipos sí usaba
  `BadgeEstado`/`core/badges.js` — inconsistencia dentro del mismo archivo,
  y la misma lógica de umbral (30 días) estaba duplicada en
  `LicenciasView.vue` (`estadoVencimiento()`). Nuevo módulo
  `core/dominio-licencias.js` (`estadoVencimientoLicencia()` +
  `CLASE_VENCIMIENTO_LICENCIA`) centraliza el umbral y la clase de badge;
  cada vista sigue formateando su propio texto (`LicenciasView` siempre
  muestra la fecha; `EmpleadoDetalleView` omite a propósito las licencias
  sanas, ver su comentario) porque son presentaciones legítimamente
  distintas, no la misma duplicación que sí se resolvió.

**(a) Qué cambió**: `StaffModulosForm.vue`, `StaffView.vue`,
`TicketDetalleView.vue`, `ReporteTicketsModal.vue`, `ProblemaDetalleView.vue`,
`TicketSeguimientoView.vue`, `TicketBuscarView.vue`, `KbArticuloForm.vue`,
`ProblemaForm.vue`, `TicketsView.vue`, `EmpleadoDetalleView.vue`,
`LicenciasView.vue`, `core/badges.js` (nuevo caso `ticket_sin_vincular`),
`core/dominio-licencias.js` (nuevo) + esta guía. **(b) Riesgo**: bajo — todos
son fixes puntuales que reutilizan patrones ya existentes en el propio
código (no hay componente ni convención nueva); verificado con
`npm run build` y `npm test` (96 tests, verde) tras cada tanda de cambios.
**(c) Pendiente**: sin commitear a pedido explícito del usuario — falta el
commit real de estos 13 archivos + el módulo nuevo.

**Hallazgo adicional, encontrado por el usuario después de esta pasada**:
`/tickets/satisfaccion` (`ReporteSatisfaccionView.vue`) no tenía el mismo
aspecto que otras vistas multi-tarjeta — los 9 criterios de reutilización de
componentes de arriba no lo detectan porque el problema es de **layout**, no
de componentes: (1) `<main class="page">` sin `page--padded` (el comentario
de `main.css` línea ~452 ya documenta que las vistas multi-tarjeta tipo
Dashboard/detalle necesitan `page--padded`; esta vista tiene 2 tarjetas de
resumen + una tabla, es multi-tarjeta, pero le faltaba la clase) — sin eso,
todo queda pegado a los bordes de la ventana; (2) la tarjeta de "Todas las
respuestas" usaba `.card--fill` (pensada para una sola tarjeta de listado a
sangre, sin borde/radio) mientras las 2 tarjetas de resumen usan `.card`
normal — la de abajo se veía sin caja mientras las de arriba sí. Fix: quitar
`card--fill` (queda `.card` normal, igual que sus vecinas) y agregar
`page--padded` al `<main>`. Verificado montando el componente real (no una
reconstrucción) en un arnés temporal servido por el propio dev server de
Vite (`insforgeApi` con datos mock, router en memoria para que `RouterLink`
resuelva sus inyecciones — el compilador de `<script setup>` importa
`RouterLink` real de `vue-router` en vez de resolverlo en runtime, así que
un componente stub registrado por `app.component()` no alcanza) y capturado
con Playwright; archivos del arnés borrados al terminar, no quedaron en el
repo. **(a) Qué cambió**: `ReporteSatisfaccionView.vue` + esta guía. **(b)
Riesgo**: bajo — dos clases CSS, sin cambios de markup más allá de eso.
**(c) Pendiente**: revisar si alguna otra vista multi-tarjeta tiene el mismo
problema (`page--padded` faltante o `card--fill` mal aplicada) — esta vez se
corrigió puntualmente la reportada, no se re-auditó el resto del sistema
contra este criterio de layout.

**Segundo hallazgo (2026-08-18), en la misma vista**: `.datos-title` y
`.tk-nota` — la clase que da tamaño/peso al título de cada tarjeta y el
tratamiento itálico/terciario a las notas — están duplicadas como estilo
`scoped` en cada vista que las usa (`TicketDetalleView`, `ProblemaDetalleView`,
`KbArticuloDetalleView`, `EmpleadoDetalleView`); a `ReporteSatisfaccionView.vue`
le faltaba esa duplicación por completo, así que "Por solicitante", "Por
técnico" y "Todas las respuestas" renderizaban como párrafo suelto sin
tratar, y las notas grises tampoco tenían tratamiento — pegados además
contra el borde de la tarjeta (sin padding: ninguna de sus 3 `.card`
tenía la clase de padding por-vista que sí tienen sus análogas, ej.
`.kb-meta`/`.problema-meta`/`.tk-historial`). Fix: se agregó la misma
regla de `.datos-title`/`.tk-nota` (ver comentario en el propio archivo),
pero con el padding puesto en el título/nota en vez de en la tarjeta
completa — a diferencia de esas vistas de detalle, acá cada tarjeta sigue
con su tabla a sangre (mismo criterio que `.card--fill`, aunque estas
tarjetas son `.card` con borde) porque ningún otro `.card` con tabla en
todo el sistema mete padding alrededor de la tabla. De paso, la tabla
"Todas las respuestas" — la única lista de todo el sistema sin buscador,
pese a ser un histórico sin recorte de periodo que solo crece — pasó a
usar `useBusqueda`/`useOrdenTabla`/`usePaginacion` (los mismos 3
composables que ya comparten 12+ vistas) en vez de reimplementar
orden/paginación a mano; `useOrdenTabla` ganó un tercer parámetro opcional
`direccionInicial` (por defecto `'asc'`, sin tocar a nadie más) para poder
seguir arrancando en "más reciente primero". **(a) Qué cambió**:
`ReporteSatisfaccionView.vue`, `composables/useOrdenTabla.js` + esta guía.
**(b) Riesgo**: bajo — mismo patrón de las otras 12 vistas, verificado con
`npm run build` y `npm test` (149 tests, verde). **(c) Pendiente**: el
mismo hueco de `.datos-title`/`.tk-nota` sin definir existe también en
`ReporteTicketsModal.vue` (el modal "Reporte" de Tickets) — no se tocó
porque no fue lo reportado esta vez.

**Tercer cambio (2026-08-18), en la misma vista — completar la exportación**:
la vista no tenía ninguna forma de exportar, a diferencia del modal
"Reporte" de Tickets (que sí tiene CSV + PDF). Se agregó un botón
"Descargar PDF" en el header (`.btn`, junto a "Volver") que arma un PDF de
una página con el mismo lenguaje visual del reporte de tickets: KPIs
(encuestas generadas/respondidas, tasa de respuesta, promedio general),
"Por solicitante", "Por técnico" y "Todas las respuestas" (recortada a las
40 más recientes, con nota de cuántas quedaron afuera — mismo criterio que
`MAX_COMENTARIOS` en `reportesTickets.js`). Ver `docs/CHANGELOG.md` para el
detalle de qué archivos cambiaron.

**Cuarto cambio (2026-08-19), en la misma vista — desglose por nivel y baja
satisfacción**: a pedido del usuario, "Por solicitante" separó su columna
"Encuestas" (antes "3/5") en Respondidas/Pendientes, "Por técnico" en
Total/Respondidas, y ambas ganaron 5 columnas más con el conteo de
respuestas por nivel (1 a 5) — 9 columnas por tabla en total. Como la RPC
`reporte_satisfaccion_consolidado()` ya trae CADA respuesta individual
(`respuestas`, histórico completo, ya en memoria — ver el comentario de
cabecera del archivo), el desglose se calcula agrupando ese mismo array en
el cliente en vez de pedirle un campo nuevo a la RPC: **cero migraciones**
para todo este cambio. `.resumenes-grid` pasó de 2 columnas lado a lado a
apiladas a ancho completo — con 9 columnas, a la mitad del viewport
scrolleaban casi todo el tiempo. Nuevo chip "Solo insatisfechos" (nivel ≤ 3,
incluye "Neutral" — decisión explícita del usuario, no una lectura mía del
umbral) sobre "Todas las respuestas", combinado con el buscador existente
(mismo patrón AND que los chips de `TicketsView`). Nueva sección en el PDF,
"Respuestas con baja satisfacción", con la misma forma de fila que "Todas
las respuestas" pero ordenada peor-nivel-primero (el objetivo es entender
el motivo, no leer en orden cronológico).

Hallazgo de paso, verificado generando el PDF real y decodificando su
contenido (no asumido): el glifo **"≤" rompe la fuente `helvetica` estándar
de jsPDF** (solo trae WinAnsi/Latin-1, sin ese símbolo) — el texto sale con
un espacio entre cada letra en vez de una palabra normal. Se evitó en el
título de la sección nueva (texto plano: "nivel 3 o menos") y, por el mismo
motivo, las 5 columnas de nivel usan encabezados "1".."5" en el PDF en vez
de "★" (que sí se usa en pantalla, donde el navegador no tiene ese
problema). **(a) Qué cambió**: `ReporteSatisfaccionView.vue`,
`reporteSatisfaccion.js` + esta guía. **(b) Riesgo**: bajo — sin
migraciones, verificado con `npm run build` y `npm test` (132 tests,
verde). **(c) Pendiente**: ninguno señalado por el usuario; queda abierto
si en algún momento se quiere el mismo desglose/filtro en el modal
"Reporte" de Tickets (`ReporteTicketsModal.vue`), que hoy no lo tiene.

#### Changelog — auditoría UI/UX completa desde cero, 57 hallazgos (2026-08-26, décimonovena pasada)

Pedido explícito del usuario: auditoría completa del sistema desde cero
(no una reconciliación contra el "Repaso de consistencia — módulo por
módulo" de ago-2026 de más abajo), ignorando deliberadamente lo ya
revisado por si el criterio hubiera cambiado desde entonces. 15 agentes en
paralelo (uno por grupo de módulos + uno para
`frontend/src/components/shared/`), cada uno con verificación cruzada de
sus propios hallazgos (segundo agente que reabre archivo y guía antes de
confirmar) — 57 hallazgos confirmados, 0 descartados en verificación. El
grupo `shared-components` no llegó a verificarse (límite de gasto de la
cuenta a mitad del run); su resultado de 0 hallazgos queda sin confirmar,
no leer como "componentes compartidos limpios". Detalle completo hallazgo
por hallazgo en `docs/HISTORIAL-AUDITORIAS.md`, Ciclo 14 (UX6-01 a UX6-12);
acá el resumen agrupado por patrón — la mayoría no son 57 problemas
distintos sino ~9 patrones sistémicos repetidos en muchos archivos.

Se corrigieron los 9 hallazgos de severidad alta que son de producción (4
aplicados directo por ser solo texto; 5 estructurales mediante agentes en
paralelo con verificación posterior); el resto (medio/bajo) queda
documentado para priorizar después:

- **Tuteo nuevo, no cubierto por UX4-52/UX5-08/UX5-09**: corregido en los
  4 paneles de Configuración, `LoginView.vue` (la puerta de entrada al
  sistema) y `PersonalRegistroView.vue` (formulario público) — ambos en
  segunda persona informal de punta a punta pese a ser las superficies
  más expuestas del sistema — y `AccesosSensiblesView.vue` (10 ocurrencias
  de "No tienes permiso..." → "No tiene permiso..."). El mismo patrón
  sigue pendiente en Tickets, Equipos, Encuestas y Correos/KB — ver UX6-01
  en `docs/HISTORIAL-AUDITORIAS.md`.
- **Modales hand-rolled sin `Modal.vue`** (sin Escape ni bloqueo de scroll
  del body): migrados `TicketInternoForm.vue`, `ReporteTicketsModal.vue`,
  los 2 modales de `CuentasPanel.vue` (Traspasar/Historial), `CuentaForm.vue`,
  `EmpresasView.vue` y `PlataformasView.vue` — mismo patrón que las
  migraciones de Ciclo 4/5 (`form="..."` + slot `#acciones`), sin cambiar
  contenido ni comportamiento de guardado; donde ya existía un guard de
  "cambios sin guardar" se conectó al prop `confirmarCierre` de `Modal.vue`
  en vez de reimplementarlo. `EmpleadoForm.vue` y `LicenciaForm.vue`
  quedan con el mismo bug (UX6-03).
- **`LicenciasView.vue`, tarjeta móvil sin paridad con escritorio**: le
  faltaban el bloque de credenciales (mostrar/copiar clave, respetando
  `auth.puedeVerCredenciales`) y la lista de usuarios con "Liberar
  asiento" — agregados reutilizando las mismas funciones que ya usa la
  tabla de escritorio, sin reimplementar lógica.
- **`StaffView.vue`**: los 4 botones sueltos por fila (Editar nombre,
  Módulos visibles, Permiso de ver contraseñas, Activar/Desactivar) tenían
  markup duplicado e independiente entre escritorio y móvil (con una clase
  `.icon-btn.activo` muerta, solo en la copia móvil). Consolidados en una
  única `accionesDe(miembro)` + `<MenuAcciones>` compartida entre ambas
  superficies (mismo patrón que `EquiposView.vue`); el header de esa
  columna pasa de `sr-only` a texto visible.
- **Nota de alcance**: al corregir la tarjeta móvil de `LicenciasView.vue`,
  el agente encontró que la tabla de escritorio tenía el mismo problema de
  `StaffView.vue`/`CuentasPanel.vue` (4 acciones sueltas, header `sr-only`)
  y, como el archivo ya usaba `accionesDe(lic)`/`MenuAcciones` en la
  tarjeta móvil, reusó la misma función en la fila de escritorio en vez de
  duplicar markup — pese a que la instrucción decía explícitamente no
  tocar esa tabla. Se decidió conservar el cambio (correcto, consistente
  con el resto de este mismo ciclo, verificado con `npm test`) en vez de
  revertirlo; queda trazado acá y en UX6-07 para que no sea un desvío
  silencioso.

**(a) Qué cambió**: `AreasObrasPanel.vue`, `UbicacionesPanel.vue`,
`TiposEquipoPanel.vue`, `CategoriasTicketPanel.vue`, `LoginView.vue`,
`PersonalRegistroView.vue`, `AccesosSensiblesView.vue`,
`TicketInternoForm.vue`, `ReporteTicketsModal.vue`, `CuentasPanel.vue`,
`CuentaForm.vue`, `StaffView.vue`, `EmpresasView.vue`, `PlataformasView.vue`,
`LicenciasView.vue` + esta guía + `docs/HISTORIAL-AUDITORIAS.md` (Ciclo 14).
**(b) Riesgo**: bajo en los fixes de texto; medio en las 6 migraciones a
`Modal.vue` y en la consolidación de `StaffView.vue`/`LicenciasView.vue`
(mismo tipo de cambio de markup ya validado en ciclos anteriores) —
verificado con `npm test` (184/214, 30 skip, misma línea base) tras
consolidar todos los lotes. **(c) Pendiente**: 48 hallazgos de severidad
media/baja quedan documentados sin corregir en `docs/HISTORIAL-AUDITORIAS.md`
(Ciclo 14) para priorizar después; `frontend/src/components/shared/` no
llegó a verificarse por límite de gasto — repetir esa verificación cuando
se libere; el hueco de `styleLab`/`designSystem` (dirección azul, WIP) no
cuenta como incumplimiento de producción pero queda igual documentado
(UX6-12), a corregir antes de portar esa dirección a `main.css`.

#### Changelog — migración de marca al azul, Fases G0-G5 (2026-08-27, vigésima pasada)

Pedido explícito del usuario, confirmando la dirección azul del Style Lab como
la identidad definitiva (cierra la fractura de dos direcciones de marca en
competencia señalada en la auditoría de coherencia previa). Seis pasadas
secuenciales, cada una en su propio commit verificado (`npm run build` +
`npm test` + `node scripts/contraste.mjs`):

- **G0** (`feaa226`) — corrige `StyleLabView.vue` ANTES de usarlo como
  referencia (cierra UX6-12 de `docs/HISTORIAL-AUDITORIAS.md`, Ciclo 14):
  tuteo→usted en 6 strings, los 3 colores semánticos (warning/danger/info)
  revertidos a los valores EXACTOS de `main.css` (el lab los tenía
  divergentes, violando su propia promesa de "los semánticos no se tocan"),
  redirección de `--color-primary` a `--color-accent-text` que el resto del
  plan ya daba por cerrada, ejemplo de Toast agregado a la sección
  "Elevación" (antes no la cubría), `:focus-visible` en el ítem de nav de
  ejemplo.
- **G1** (`cd21c9a`) — tokens `brand-500/600/700` nuevos; `accent`/
  `accent-hover`/`accent-alt`/`accent-soft`/`accent-subtle`/`accent-text`/
  `accent-2` repuntados a alias de la escala nueva; `--color-primary`
  redirigido a `accent-text` en vez de `accent` directo, en el mismo commit
  (sin ventana intermedia). **Hallazgo de esta pasada, no planeado**: el
  valor real de `main.css` antes de este commit era teal-green
  (`--color-accent: #157955`), no navy/mint como decía este documento
  — ver corrección en "Identidad de marca" arriba.
- **G2** (`f69ad79`) — fondos/texto (`bg`, `bg-elevated`, `text-primary/
  -secondary/-tertiary`). Cierra la tensión de dos valores en competencia
  para `text-tertiary` (U-01 vs. `design.pen`) tomando el de U-01 como base
  y **recalculando el lado oscuro en vivo**: el valor planeado fallaba AA
  contra el `bg-elevated` nuevo (más claro que el viejo), se ajustó a
  `#818A96` (4.71:1) sin tocar el resto del commit. `scripts/contraste.mjs`
  gana un chequeo permanente para este par (antes no existía).
- **G3** (`6fbf11a`) — anillo de foco a `brand-500`, sin tocar ningún `.vue`
  (11 reglas `:focus` existentes ya consumían `--ring`).
- **G4** (`5bf42bd`) — radios (`lg`/`xl` dejan de ser idénticos), sombras
  reales (antes `none`), política de elevación por componente aplicada
  (no una sombra genérica). Efecto colateral encontrado y corregido en el
  mismo commit: 3 sombras que habían quedado inertes bajo el token viejo
  (`.panel-lista` y `.stat-card` del Dashboard, y `.aviso-card` de
  `AppNotifications.vue`, además del ejemplo `.ds-aviso-demo` de
  `DesignSystemView.vue`) habrían aparecido con sombra no deseada o de
  nivel modal al activarse el token real — corregidas antes de mergear, no
  después.
- **G5** (`9c60e8d`) — jerarquía de bordes de 3 niveles, `--color-border-
  default` nuevo. `.card--clicable:hover` bajado de `--color-border-strong`
  a `-default` en el mismo commit (decisión ya anotada en el comentario de
  G4, ejecutada acá). `scripts/contraste.mjs` gana verificación permanente
  del umbral WCAG 1.4.11 (3:1) para `border-default`/`-strong`.

**Trabajo ajeno sin commitear, no tocado**: el repo tenía un diff sin
commitear en `main.css` que mezclaba varias de estas pasadas con valores
distintos a los de este plan (radios equivocados, sin tokens `brand-500/
600/700`, más un cambio de escala tipográfica y `--header-h` 64→56 sin
relación con esta migración) — se guardó con `git stash` en vez de
descartarse o mezclarse (recuperable con `git stash pop`). Varios archivos
tocados en G4/G5 (`AppSearch.vue`, `NotificacionesCampana.vue`,
`AppNotifications.vue`, `contraste.mjs`, y sobre todo `DashboardView.vue`)
tenían además otro trabajo pendiente sin commitear (rediseño de panel de
tickets/dashboard) — aislado quirúrgicamente vía git plumbing para que cada
commit de esta migración contenga solo su diff intencional, sin perder ni
mezclar ese otro trabajo.

**(a) Qué cambió**: `main.css`, `StyleLabView.vue`, `scripts/contraste.mjs`
(2 checks nuevos), `MenuAcciones.vue`, `BuscadorCombo.vue`, `AppSearch.vue`,
`NotificacionesCampana.vue`, `AppNotifications.vue`, `DesignSystemView.vue`,
`DashboardView.vue` (quitadas 2 sombras no deseadas) + esta guía +
`docs/CHANGELOG.md` + `docs/HISTORIAL-AUDITORIAS.md` (cierra UX6-12).
**(b) Riesgo**: bajo-medio — 6 commits verificados individualmente, pero
**sin QA visual real**: no hubo navegador/capturas en esta sesión, la
verificación fue build+test+contraste+auditoría de valores de token. Falta
confirmar visualmente en ambos temas: popovers, toast, modal, degradé de
avatar (accent→accent-2 ahora es un salto de tono menos dramático que
antes — puede necesitar ajuste de opinión de diseño, no es un bug) y
navegación por Tab del sidebar completo. **(c) Pendiente**: QA visual de
arriba; decidir el destino del diff guardado en `git stash` (recuperar como
rama propia o descartar, coordinar con quien lo dejó); TK1/TK2 (selección
múltiple en Tickets) sigue bloqueada, sin relación con esta migración;
propuesta de paleta dot-notation de `design.pen` queda archivada, no
retomada.

