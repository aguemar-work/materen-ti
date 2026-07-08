# Auditoría de UX / UI / Design System — Sistema TI

**Fecha:** 2026-07-07
**Alcance:** análisis estático de código (Vue 3 + CSS custom), sin modificar archivos. Medición de consistencia entre la documentación de diseño propia (`MATEREN-CORE.md`, `MATEREN-DESIGN-SYSTEM.md`, `GUIA-UX-UI.md`) y la implementación (`frontend/src/`).
**Equipo:** Auditor UX/UI · Especialista en Design Systems · Ingeniero Frontend senior (Vue) · Auditor de Accesibilidad (WCAG 2.1 AA).
**Nota de herramienta:** no se dispuso de render en navegador; el análisis visual se basa en código (clases CSS, estructura de template, tokens), no en captura de pantalla.

---

## 1. Resumen ejecutivo

La base de diseño está pensada con criterio: paginación y filtros consistentes en las 11 vistas de listado, un sistema de badges semánticos con contraste verificado por script, un empty-state reutilizado, y flujos públicos (entrega, encuesta, seguimiento) bien resueltos en usabilidad. Pero hay **un problema arquitectónico de fondo** que explica la mayoría de los hallazgos: **casi no existe capa de componentes Vue compartidos** (solo `AppLayout` y `Pagination`); modales, confirmaciones, badges de estado y estados de carga viven como **clases CSS + markup duplicado por módulo**. Esa deuda produce, en cascada, la inconsistencia entre módulos y —lo más grave— un hueco de accesibilidad que bloquea tareas.

**Titular (Bloqueante):** los **~21 modales hand-rolled** (en 17 archivos) no implementan `aria-modal`, cierre con Escape ni atrapamiento de foco (**0/21** en los tres), y solo **1/21** fija el foco inicial. Ningún flujo con modal —Nuevo empleado, Asignar equipo, Dar de baja— se puede completar con teclado o lector de pantalla. La misma pieza de trabajo que resolvería la duplicación (un componente `<Modal>` compartido) cierra este hueco de a11y: es **la remediación #1 del informe**, con doble beneficio.

**Otros focos:** (a) **deriva documental** — los tres documentos de diseño describen paletas distintas y ninguno coincide con el código (Mayor); (b) **sin fuente única de metadata de estado por dominio** — `claseEstado()` y el mapa `ESTADOS` duplicados, con color semántico incoherente (Mayor, estructural, 3 síntomas); (c) **confirmación destructiva inconsistente** — 16 `confirm()` nativos vs. 1 modal documentado (Mayor); (d) accesibilidad: toast sin `aria-live`, jerarquía de encabezados rota, `text-tertiary` usado como texto informativo en rutas públicas, y el tap target de "copiar contraseña" en `/entrega` por debajo del mínimo móvil (todos Mayor).

Nada de esto exige rediseño: la estructura y la identidad neutra funcionan. Es consolidar en componentes lo que hoy está disperso en CSS, y sincronizar la documentación.

---

## 2. Checklist de verdad (Fase 0) y deriva documental

### 2.1 Hallazgo DOC-1 — Deriva documental (Mayor)

Las tres "fuentes de verdad" no coinciden entre sí ni con el código:

| Fuente | Marca | Acento | Fondo | Títulos |
|---|---|---|---|---|
| `MATEREN-CORE.md` v1.3 | Navy `#11133C` | Índigo `#4F46E5` | gris (fórmula) | **Poppins** |
| `MATEREN-DESIGN-SYSTEM.md` v0.3 | Petróleo `#072E2A` | `#157955` | **cálido `#F8F6F1`** | Sora |
| `GUIA-UX-UI.md` (actual) | petróleo solo logo | `#157955`/`#34D399` | gris `#F6F7F8` | Sora |
| **`main.css` (código, autoritativo)** | `#072E2A` solo logo | `#157955`/`#34D399` | **gris `#F6F7F8`** | Sora; títulos = `--color-text-primary` |

Por la regla de precedencia del propio `MATEREN-CORE §Gobernanza` (en valores literales de tokens gana el código), la verdad operativa es `main.css` + `GUIA-UX-UI.md`. **`MATEREN-DESIGN-SYSTEM.md` y `MATEREN-CORE.md` están desactualizados** en color (Navy/Índigo y fondo cálido ya no existen) y tipografía (CORE dice Poppins; el código usa Sora). **Recomendación:** designar `GUIA-UX-UI.md` como implementación autoritativa, sincronizar los otros dos y versionar los tres con la misma nota de vigencia (fecha + commit). No dejarlo como nota al margen: es la raíz de que "el design system" signifique tres cosas distintas.

> *Nota de alcance (confirmada con el solicitante):* la parte de `MATEREN-CORE` sobre casa-de-marca multi-producto, multi-tenant y Navy/Índigo se trata como **aspiracional / no aplicable** a Sistema TI y no se reporta como defecto.

### 2.2 Checklist reconciliado (contra el código)

- **Color:** marca `#072E2A` solo en logo; acento único `#157955`/`#34D399`; superficies neutras (`bg #F6F7F8`, subtle `#F0F2F4`, hover `#EAEDF0`); texto `#23282D`/`#6B7280`/`#9CA3AF`; bordes `#E4E7EB`; **sin sombra** (`--mat-shadow-*: none`); 8 familias semánticas verificadas ≥4.5:1 vía `scripts/contraste.mjs`.
- **Tipografía:** Inter + Sora; escala 11·12·13·14·15·17·20·26 (`--mat-fs-*`); body 14; peso tope 600 UI, 700 solo stats/wordmark; line-height 1.4/1.2.
- **Forma:** radios sm6·md8·lg14·xl14·pill999; **espaciado 4px documentado pero NO tokenizado** (ver SPACE-1); z-index en escala `--z-*`.
- **Componentes documentados:** badge base+modificador, botón (primary/secondary/ghost/danger, un primary por vista), inputs/select/textarea/checkbox/radio, card/tabla/modal/toast, timeline, capacity-bar, empty-state (ícono+porqué+acción), form-error inline, confirmación por nivel de riesgo, loading (skeleton forma conocida / spinner acción). Pendientes de portar (DESIGN-SYSTEM §4): tabs, toggle, alert, tooltip, **skeleton, stepper**.
- **Interacción/a11y:** foco siempre visible; disabled único; transiciones 120–280ms; Tabler Icons outline (14/16-18/26-32); `prefers-reduced-motion`; área de click ≥24px.
- **Copy:** serio + amigable, sin urgencia falsa; errores de trigger de BD persistentes (form-error), no solo toast.

---

## 3. Tabla de hallazgos (calibrada)

Severidad por impacto (rúbrica): **Bloqueante** = impide la tarea a algún grupo; **Mayor** = rompe patrón documentado ampliamente / dificulta tarea / afecta rutas públicas; **Menor** = patrón documentado no implementado o inconsistencia localizada con workaround; **Cosmético** = no afecta uso.

| ID | Fase | Hallazgo | Tipo | Severidad | Archivo(s) / Evidencia | Recomendación |
|---|---|---|---|---|---|---|
| **MOD-1** | 1+4 | ~21 modales hand-rolled sin `aria-modal` (0/21), sin Escape (0/21), sin focus-trap (0/21); foco inicial solo 1/21; `aria-labelledby` ~5/21. Ningún flujo con modal se completa por teclado/lector | Accesibilidad + Deuda de componentes | **Bloqueante** | `modal-bg` en 17 archivos; `focus()` solo en `BajaEmpleadoModal.vue:37` | **Componente `<Modal>` compartido** (Reka UI o propio) con foco atrapado, Escape, `role=dialog`+`aria-modal`, foco inicial y restauración. Resuelve a11y **y** la duplicación de una vez |
| **DOC-1** | 0 | Deriva documental: 3 docs con paletas distintas, ninguno = código | Desviación del DS | **Mayor** | ver §2.1 | GUIA como autoritativa; sincronizar y versionar los 3 |
| **EST-1** | 1+3 | Sin fuente única de metadata de estado por dominio: `claseEstado()` duplicada ×3, mapa `ESTADOS` de tickets duplicado verbatim, color semántico incoherente | Deuda de componentes / Inconsistencia | **Mayor** | `EmpleadosView:58`, `EmpleadoDetalleView:45`, `DashboardView:28`; `TicketsView:30` = `TicketDetalleView:30` | **1 arreglo estructural (3 síntomas):** módulo/composable `estados/*.js` `{valor:{label,clase,icono}}` consumido por lista, detalle y dashboard |
| **CNF-1** | 1+3 | Confirmación destructiva inconsistente: 16 `confirm()` nativos + 1 modal documentado (`BajaEmpleadoModal`) + 1 form inline (rechazar ticket). Viola `CORE §Confirmación por nivel de riesgo`. **Desglose en §3.1** | Inconsistencia + Desviación DS | **Mayor** | 16 `confirm()` (ver §3.1) vs `BajaEmpleadoModal.vue` vs `TicketDetalleView` (motivo) | **`<ConfirmDialog>` de dos tiers** (sobre `<Modal>`): tier **base** (nombre de entidad + foco en Cancelar) reemplaza los 16 `confirm()`; tier **auditable** (motivo obligatorio) formaliza "rechazar". Ver veredicto §3.1 |
| **A11-TOAST** | 4 | Toast sin `role="status"`/`aria-live`: éxitos/errores no se anuncian | Accesibilidad (WCAG 4.1.3) | **Mayor** | `App.vue:15` `<div id="toast" … style="display:none">` | `role="status" aria-live="polite"` (y `assertive` para errores) en el contenedor |
| **A11-HEAD** | 4 | Jerarquía de encabezados: `<h1>` = marca "Sistema TI" repetida; 2 `<h1>` en EmpleadoDetalle; saltos h1→h3 | Accesibilidad (WCAG 1.3.1 / 2.4.6) | **Mayor** | `<h1>Sistema TI</h1>` en actividad/correos/config/equipos/empleados/…; `EmpleadoDetalleView:134,144` | **Replicar `DashboardView.vue`**: `<h1>` = título de la vista, `<h2>` de sección, la marca del header sale del árbol de headings; `.toolbar-title` → `<h1>` real |
| **A11-CONTR** | 4 | `--color-text-tertiary #9CA3AF` (~2.5:1) usado como texto informativo en 7 lugares, 3 en rutas públicas | Accesibilidad (WCAG 1.4.3) | **Mayor** | `main.css:1070` `.section-label`; `TicketDetalleView:664`; **`TicketSeguimientoView:197/206/244`, `TicketSatisfaccionView:182`, `TicketBuscarView:207`** (públicas); `PlataformasView:288` `#888` | Usar `--color-text-secondary` (≈4.6:1) en texto; dejar tertiary solo para íconos/placeholder |
| **A11-COPYTAP** | 5 | Tap target de "copiar" (~28px, `padding:6px`) bajo el mínimo móvil, en la **acción principal** de la pantalla más crítica (contraseñas reales, ruta pública) | Accesibilidad / Usabilidad móvil | **Mayor** | `EntregaView.vue:84,91` | ≥44px de área de toque en los botones de copiar |
| **MIC-1** | 7 | Mismo softdelete nombrado "Eliminar" / "Dar de baja" / "Desactivar"; "Eliminar" sobredimensiona (roza *Integridad*); incoherencia intra-módulo en Equipos | Microcopy / Inconsistencia | **Mayor** | Config/Correos/Licencias/Equipos="Eliminar"; Empresas/Plataformas/Empleados="Dar de baja"; Staff="Desactivar"; `EquiposView:490` title vs `:293` confirm | Unificar verbo para softdelete ("dar de baja"/"desactivar"); "Eliminar" solo para borrado físico |
| **CMP-1** | 1 | Capa de componentes compartidos casi ausente (solo `AppLayout`, `Pagination`); todo es CSS+markup por módulo | Deuda de componentes | **Mayor** | `components/shared/` = 2 archivos | Graduar `Modal`, `ConfirmDialog`, `StatusBadge`, `EmptyState`, `Skeleton` a `components/shared/` |
| **GOD-1** | 1 | God components: `EquiposView` 843 (4 modales), `TicketDetalleView` 729, `LicenciasView` 578, `EmpleadoDetalleView` 538 | Deuda de componentes | **Menor** | `wc -l` | Extraer modales/filas a subcomponentes tras crear `<Modal>` |
| **TOK-1** | 2 | `box-shadow` hardcodeado reintroduce sombra (viola "separación por borde") | Desviación DS | **Menor** | `LicenciaForm:476`, `EquiposView:803`, `AppLayout:585` | Usar borde; si se necesita elevación, tokenizarla explícitamente |
| **TOK-2** | 2 | Fallbacks a tokens inexistentes → grises fuera de paleta | Desviación DS | **Menor** | `PlataformasView:256/288` `--color-text-muted,#666/#888`; `StaffView:156/158` `--color-surface,#fff` | Usar tokens reales (`--color-text-secondary`, `--color-bg-elevated`) |
| **TOK-3** | 2 | Radios en px literal y fuera del set canónico (10/20/4px) | Desviación DS | **Menor** | `AppLayout:334`, `Dashboard:361/422`, `TiposEquipoPanel:216`, `EquipoForm:392`, `Licencias:510/532`, `Plataformas:255` | Usar `--radius-*`; `20px` chips → `--radius-pill` |
| **TOK-4** | 2 | `font-size` en px literal (en vez de `--fs-*`) de forma generalizada | Desviación DS | **Menor** | Dashboard, BajaEmpleadoModal, EmpleadoForm, EntregaView (`13.5/12.5px`), etc. | Migrar a tokens `--fs-*` |
| **TOK-5** | 2 | Overlays/scrims con 5 negros `rgba` distintos | Inconsistencia | **Menor** | `AppLayout:585/592`, `Dashboard:421`, `EquipoForm:462`, `TicketNuevoView:340` vs scrim modal `rgba(12,15,17,.55)` | Tokenizar `--color-overlay` |
| **TOK-6** | 2 | Color WhatsApp re-hardcodeado en scoped en vez de `.btn-whatsapp` global | Desviación DS | **Cosmético** | `CuentasPanel:443` | Reusar `.btn-whatsapp` |
| **TOK-7** | 2 | `.badge-count` a `font-weight:700` (CORE: 700 solo stats/wordmark) | Desviación DS | **Cosmético** | `DashboardView:490` | Bajar a 600 |
| **TOK-8** | 2 | Plantilla de correo hardcodea `#3A372E` (color de texto ya retirado) | Desviación DS | **Menor** | `functions/tickets.ts` `plantillaCorreo` | Actualizar a `#23282D` |
| **SPACE-1** | 2 | Escala de espaciado 4px documentada (CORE) pero **no tokenizada**: todo padding/margin en px literal, adherencia no verificable | Desviación DS / zona sin token | **Menor** | `main.css` sin `--space-*` | Tokenizar `--space-*` o declarar en GUIA que es convención sin token |
| **LOAD-1** | 1+3 | Sin skeleton: todo loading es `<div class="no-results">Cargando…</div>`. Patrón documentado (CORE §Loading) no implementado | Desviación DS | **Menor** | `.no-results` en todos los listados | `<Skeleton>` para listas/tablas en primera carga |
| **STEP-1** | 6 | "Alta guiada" sin stepper visible (paso X de 3). Patrón documentado (DESIGN-SYSTEM §4 "pendiente de portar") no implementado | Desviación DS / Usabilidad | **Menor** | flujo alta = modal → ficha → WhatsApp, sin indicador | `<Stepper>` compartido con estado del flujo |
| **EMPTY-1** | 1+3 | Doble estándar de vacío (`.empty` con ícono vs `.no-results` texto plano) sin regla; nombre de clase diverge de CORE (`.empty-state__*`) | Inconsistencia + Desviación DS | **Menor** | `.empty` en 10 vistas / `.no-results` en sublistas | `<EmptyState>` único; documentar cuándo full vs inline |
| **A11-CLICK** | 4 | 24 `@click` en `<div>/<span>/<tr>/<li>` sin equivalente de teclado | Accesibilidad (WCAG 2.1.1) | **Menor** | 18 archivos; combos `<li @click>` (TicketInternoForm, EquiposView) son los de mayor riesgo | Filas: el botón "Ver" ya da acceso; combos → `role=listbox`/teclado |
| **A11-ICONBTN** | 4+6 | Botones-ícono con `title` pero sin `aria-label`; `<i>` sin `aria-hidden`. Incluye el rating de encuesta (además sin `radiogroup`/`aria-pressed`) | Accesibilidad | **Menor** | acciones de tabla (Ver/Editar/Baja); `TicketSatisfaccionView:87-98` | `aria-label` en icon-buttons; rating como `radiogroup` con `aria-checked` |
| **A11-ALT** | 4 | `alt` inconsistente en fotos de equipo (vacío en lista, presente en form) | Accesibilidad | **Menor** | `EquiposView:385` `alt=""` vs `EquipoForm:317` `alt="Foto del equipo"` | `alt` descriptivo (`Foto de {código}`) en fotos informativas |
| **ORD-1** | 3 | Sin ordenamiento por columna en ningún listado | Usabilidad | **Menor** | ninguna tabla con sort | Encabezados clicables donde aporte (equipos, licencias) |
| **MIC-2** | 7 | Fallback de error expone el code (`Error de tickets (${code})`) | Microcopy | **Cosmético** | `ticketsPublicos.js:29`, `passwords.js:21` | Mensaje genérico sin code en público |
| **MIC-3** | 4+7 | Errores inesperados de staff caen en `showToast(e.message)` con texto crudo del backend **y** sin anunciarse (ver A11-TOAST) | Microcopy / Accesibilidad | **Menor** | catches con `e?.message` | Mapear a mensaje amable; los rechazos de trigger ya usan form-error ✓ |

**Preguntas de diseño abiertas (no son hallazgos — decisión de quien corresponda):**
- **ODQ-1:** `.stat-value` usa `28px` y `.detail-name` `18px`, fuera de la escala (26/17). ¿Enforcement flojo (corregir a 26/17) o a la escala le falta un paso que el diseño real necesita (actualizar el DS)? Remediaciones distintas — se deja marcado, no se corrige por defecto. (`DashboardView:375`, `EmpleadoDetalleView:351`.)

**Observaciones (sin regla documentada que romper):**
- **OBS-1:** las tablas de staff degradan a scroll horizontal en móvil (`.table-wrap{overflow-x:auto}`). El README no exige tablas móviles → decisión válida, no defecto.
- **OBS-ARQ-1:** no se detectó estructura que facilite un futuro selector multi-empresa/espacio (CORE aspiracional); el layout es de producto único. Observación de arquitectura, no de UX.

### 3.1 Desglose de CNF-1 — las 18 confirmaciones, por riesgo y copy

Clasificación de las 16 llamadas a `confirm()` nativo + las 2 confirmaciones custom, contra los dos tiers de `CORE §Confirmación por nivel de riesgo` (base = nombre de la entidad + foco en Cancelar; auditable = justificación obligatoria en log):

| # | Módulo / archivo | Acción | Riesgo real | ¿Copy menciona la entidad? | Mecanismo |
|---|---|---|---|---|---|
| 1 | Correos:78 | Eliminar correo compartido | Reversible (softdelete) | Sí (`usuario`) | `confirm()` |
| 2 | EmpleadoDetalle:74 | Liberar asiento de licencia | Reversible (reasignable) | Sí (`software`) | `confirm()` |
| 3 | EmpleadoDetalle:107 | **Reactivar empleado** | **No destructiva** | Sí (`nombre`) | `confirm()` |
| 4 | CategoríasTicket:83 | Eliminar categoría | Reversible (softdelete) | Sí (`nombre`) | `confirm()` |
| 5 | CategoríasTicket:106 | Eliminar subcategoría | Reversible (softdelete) | Sí (`nombre`) | `confirm()` |
| 6 | Ubicaciones:56 | Eliminar ubicación | Reversible (softdelete) | Sí (`nombre`) | `confirm()` |
| 7 | TiposEquipo:96 | Eliminar tipo | Reversible (softdelete) | Sí (`nombre`) | `confirm()` |
| 8 | Staff:25 | Desactivar miembro | Reversible | Sí (`nombre`) | `confirm()` |
| 9 | Empresas:77 | Dar de baja empresa | Reversible (softdelete) | Sí (`nombre`) | `confirm()` |
| 10 | Plataformas:77 | Dar de baja plataforma | Reversible (softdelete) | Sí (`nombre`) | `confirm()` |
| 11 | Cuentas:85 | Revocar asignación | Reversible (reasignable) | Sí (`plataforma`) | `confirm()` |
| 12 | Licencias:92 | **Renovar** | **No destructiva** | Sí (`software`) | `confirm()` |
| 13 | Licencias:186 | Liberar asiento | Reversible | Sí (`usuario`+`software`) | `confirm()` |
| 14 | Licencias:196 | Eliminar licencia | Reversible (softdelete) | Sí (`software`) | `confirm()` |
| 15 | Equipos:238 | Cambiar estado físico | Reversible | Sí (`código`) | `confirm()` |
| 16 | Equipos:293 | Eliminar equipo | Reversible (softdelete) | Sí (`código`) | `confirm()` |
| 17 | BajaEmpleadoModal | Dar de baja empleado | Reversible (reactivable) | Sí + resumen de impacto | **Modal documentado** (`confirm-dialog--destructive`, foco en Cancelar) |
| 18 | TicketDetalleView | **Rechazar ticket** | Terminal (reabrible solo JEFE) | Sí + **motivo obligatorio** | **Form inline custom** |

**Lo que revela el desglose (más matizado que "3 patrones sueltos"):**

1. **El copy ya está bien: 18/18 nombran la entidad.** El contenido cumple el requisito del **tier base** de CORE ("nombre específico, no '¿Confirmar?'"). El problema de las 16 filas de `confirm()` **no es el texto** — es el **mecanismo**: el `confirm()` nativo no se puede estilar, muestra botones genéricos "Aceptar/Cancelar" del navegador, no garantiza foco en Cancelar y rompe el tono "serio + amigable". Es decir, CNF-1 es más un problema de **interacción/tier base** que de microcopy.
2. **Riesgo uniformemente reversible.** Ninguna de las 16 es irreversible (softdelete recuperable, asignación reasignable, cambio de estado). Por CORE, a todas les basta el **tier base** — ninguna necesita el tier auditable. → El `<ConfirmDialog>` base cubre las 16 sin fricción extra.
3. **2/16 no son destructivas** (#3 Reactivar, #12 Renovar): confirmar con fricción una acción positiva/neutra es **sobre-confirmación**. Deberían ser acción directa + toast (o confirm ligero), no el mismo diálogo destructivo.

**Veredicto explícito sobre "Rechazar ticket" (#18):** es un **patrón válido, no un defecto** — exige **motivo obligatorio** visible al empleado y queda en el historial del ticket, que es exactamente el **tier "auditable"** de `CORE §Confirmación por nivel de riesgo` (justificación obligatoria en log). El problema es solo que está implementado **ad-hoc inline**, no documentado y fuera del sistema de componentes. **Recomendación: formalizarlo como el tier auditable del `<ConfirmDialog>` compartido — NO unificarlo hacia el tier base** (perder el motivo obligatorio sería un retroceso). Así el componente compartido queda con los dos tiers que CORE ya documenta: base (16 casos) + auditable (rechazar, y cualquier acción futura con peso de compliance).

---

## 4. Inventario de componentes y duplicaciones

**Compartidos reales:** `AppLayout.vue` (644, también God component: shell + búsqueda global), `Pagination.vue` (39). **No hay `components/` por módulo** — cada vista es `.vue` plano sobre clases globales de `main.css`.

**Duplicaciones (todas resolubles con la capa compartida):**
- **Modal** — 21 instancias / 17 archivos (MOD-1, CMP-1).
- **Confirmación** — 16 `confirm()` nativos + 1 modal + 1 form inline (CNF-1).
- **Metadata de estado** — `claseEstado()` ×3 + `ESTADOS` ×2 (EST-1).
- **Loading** — `.no-results`+texto en todos (LOAD-1).
- **Empty** — `.empty` reutilizado (bien) + `.no-results` (doble estándar, EMPTY-1).

**God components (GOD-1):** EquiposView 843, TicketDetalleView 729, AppLayout 644, LicenciasView 578, EmpleadoDetalleView 538, LicenciaForm 539, EquipoForm 506, DashboardView 498, CuentasPanel 475.

---

## 5. Mapa de consistencia (patrón × implementación)

| Patrón | Estado | Nota |
|---|---|---|
| Paginación | ✅ consistente | `<Pagination>` en 11 vistas |
| Filtros / búsqueda | ✅ consistente | `.filters` + input + selects |
| Empty state | ⚠️ | `.empty` consistente; `.no-results` en sublistas (doble estándar) |
| Badges semánticos | ⚠️ | Coherente salvo `reabierto→danger`, `en_progreso→warning`, `cerrado`=`rechazado`=neutral |
| Metadata de estado (label/color) | ❌ | Duplicada, sin fuente única (EST-1) |
| Loading | ❌ | Ad-hoc "Cargando…", sin skeleton |
| Confirmación destructiva | ❌ | 3 mecanismos (16 `confirm()` nativo / 1 modal / 1 form inline). Desglose y veredicto de "rechazar" en §3.1 |
| Modales (estructura + a11y) | ❌ | Hand-rolled, sin foco/Escape/aria-modal |
| Terminología de acciones | ❌ | Eliminar/Dar de baja/Desactivar mezclados |
| Ordenamiento | ⚠️ | Ausente uniforme |
| Tono público (tuteo) | ✅ | Amigable y consistente |
| Rutas públicas responsive | ✅ | Card fluida, form colapsa ≤600px |

---

## 6. Accesibilidad (resumen WCAG)

| Criterio WCAG | Estado | Hallazgo |
|---|---|---|
| 2.1.1 Teclado | ❌ | MOD-1 (modales), A11-CLICK |
| 2.4.3 Orden de foco / 2.4.7 Foco visible | ⚠️/✅ | Foco visible OK (ring); orden roto en modales (MOD-1) |
| 4.1.3 Mensajes de estado | ❌ | A11-TOAST |
| 1.3.1 / 2.4.6 Encabezados y etiquetas | ❌ | A11-HEAD |
| 1.4.3 Contraste de texto | ❌ | A11-CONTR (tertiary en texto, rutas públicas) |
| 1.1.1 Contenido no textual | ⚠️ | A11-ALT, A11-ICONBTN |
| 2.5.5 Tamaño del objetivo | ❌ | A11-COPYTAP |
| 1.4.11 Contraste no textual | ⚠️ | rating/dot en tertiary (borderline) |

**Positivos:** `<html lang="es">`, focus ring en inputs, `role="alert"` en form-error/login, `aria-label` en búsqueda/nav/paginación/Cerrar, 16 pares semánticos ≥4.5:1 verificados por script.

---

## 7. Quick wins (bajo esfuerzo, alta percepción de calidad)

1. **Toast:** añadir `role="status" aria-live="polite"` en `App.vue` — 1 línea, cierra A11-TOAST.
2. **`text-tertiary` en texto público:** cambiar a `--color-text-secondary` en los 3 usos de rutas públicas + `.section-label` — cierra la peor parte de A11-CONTR.
3. **Tap target copiar en `/entrega`:** subir el área a ≥44px — cierra A11-COPYTAP.
4. **`--color-text-muted`/`--color-surface` inexistentes** → tokens reales (TOK-2), quita grises fuera de paleta.
5. **`box-shadow` hardcodeado** → borde (TOK-1).
6. **Unificar verbo de softdelete** en confirms/titles (MIC-1) — solo copy.
7. **`alt` en fotos de equipo de la lista** (A11-ALT).

---

## 8. Roadmap de remediación priorizado

**P0 — Desbloquea tareas (a11y crítica). Máxima prioridad del informe.**
- **`<Modal>` compartido** (MOD-1 + CMP-1): foco atrapado, Escape, `role=dialog`+`aria-modal`, foco inicial/restauración. **Una sola pieza que resuelve el Bloqueante de a11y y elimina la duplicación de 17 modales.** Encima de él, **`<ConfirmDialog>`** para reemplazar los 16 `confirm()` (CNF-1).
- Quick wins 1–3 (toast, contraste público, tap target) — horas, no bloquean el `<Modal>`.

**P1 — Consistencia estructural.**
- **Composable/módulo de metadata de estado** por dominio (EST-1) — 1 arreglo, 3 síntomas.
- **Encabezados** replicando `DashboardView` (A11-HEAD).
- **Sincronizar la documentación** (DOC-1): GUIA autoritativa, versionar los 3.
- **`<EmptyState>` + `<Skeleton>`** (EMPTY-1, LOAD-1).

**P2 — Higiene de tokens y deuda.**
- TOK-1…8, SPACE-1 (tokenizar sombra/overlay/espaciado, migrar px→`--fs`/`--radius`).
- Dividir God components (GOD-1) apoyándose en los nuevos componentes.
- `<Stepper>` para alta guiada (STEP-1); `radiogroup` en rating (A11-ICONBTN); ordenamiento (ORD-1).

**P3 — Decisiones de diseño (no código directo).**
- Resolver ODQ-1 (28/18px: corregir vs. ampliar escala).
- Revisar color semántico de `reabierto`/`en_progreso` al construir la metadata de estado (EST-1).

---

## 9. Nota de método
Análisis 100% estático (código + docs), sin render en navegador ni modificación de archivos. Severidades calibradas por impacto con rúbrica única (§3) en una pasada final de coherencia entre filas, no fase por fase. Los ítems marcados "pregunta de diseño abierta" y "observación" se distinguen deliberadamente de los hallazgos: los primeros requieren una decisión; los segundos no rompen ninguna regla documentada.
