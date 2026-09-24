# Sistema de diseño — Materen · Sistema TI

> Vigente desde el **2026-09-22**. Reemplaza al reinicio "sin sistema de
> diseño" del 2026-09-05. Implementación de referencia: el módulo
> **Empleados** (`modules/empleados/EmpleadosView.vue`,
> `EmpleadoDetalleView.vue`, `modules/cuentas/CuentasPanel.vue`). Ante la
> duda, se hace como ahí.
>
> Base técnica: Tailwind v4 (tema en el `@theme` de `styles/main.css`) +
> PrimeVue v4 Unstyled solo a través de los wrappers de `components/ui/`.
> Reglas técnicas del wrapper: `frontend/AGENTS.md`, sección "UI/UX".

## 1. Principios

1. **Herramienta de trabajo, no vitrina.** Legibilidad, densidad y
   confianza. Nada decorativo que no ayude a decidir o actuar.
2. **La página dice qué se está viendo.** Título + subtítulo con el conteo y
   el filtro activo ("9 personas en estado activo").
3. **Filtrar no es parte del dato.** Los filtros viven en una barra propia,
   FUERA de la card de la tabla.
4. **Superficies fundidas.** Workspace `bg-gray-50`; contenido en cards
   blancas con borde de 1px (`border-gray-200`). Sin sombras: solo flota lo
   que flota (menús, popovers, modales).
5. **Un solo acento fuerte por pantalla**: la acción principal
   (`AppButton` sólido primario). Todo lo demás es `outline` o `text`.
   Las acciones destructivas en una página son `outline` + `danger`; el
   rojo sólido se reserva para el botón de confirmar dentro de un
   ConfirmDialog destructivo.
6. **Peso visual proporcional al significado** (escala del JEFE, ver
   `docs/NOTAS-DISENO-ANTERIOR.md` §2): sin fondo → solo borde → fondo tenue
   → fondo tenue + borde (selección) → sólido (una por vista). Ante la duda,
   el escalón más bajo.
7. **Hover y activo sin bordes**, solo fondos tenues. Ningún borde de más de
   1px, salvo un acento IZQUIERDO de 2px para selección o severidad.
8. **Acciones de fila en un menú ⋮** (`MenuAcciones`); la fila entera abre
   el detalle. Nada de íconos que aparecen al pasar el mouse.
9. **Vacíos y cargas con intención**: `AppVacio` dice qué falta y ofrece la
   acción que lo resuelve. Nunca un guion suelto: "Sin registrar" en gris.
10. **Móvil real**: a < 768px las tablas pasan a tarjetas o listas; nada con
    scroll horizontal accidental.

## 2. Tokens (lo único que se "elige")

| Qué | Valor |
| --- | --- |
| Acento | `primary-50…950` (500 = `#0064E0`, único color de marca) |
| Neutros | `gray-*` de Tailwind (workspace `gray-50`, bordes `gray-200`/`gray-100`) |
| Texto | primario `gray-900` · secundario `gray-600` · terciario `gray-500` · apagado `gray-400` |
| Estados | `green` (ok) · `amber` (atención) · `red` (error/vencido) — tonos 50 de fondo, 700/800 de texto |
| Categorías del dominio | `sky` · `violet` · `teal` (prioridades, tipos) — mismos tonos |
| Tipografía | Inter Variable, `tabular-nums` en códigos, DNI, cifras y fechas |
| Tamaños | página `text-2xl font-semibold tracking-tight` · sección `text-sm font-semibold` · cuerpo `text-sm` · meta `text-xs` |
| Radios | controles `rounded-md` · cards `rounded-lg` · modales `rounded-xl` · avatares/pastillas `rounded-full` |
| Íconos | Tabler webfont (`ti ti-*`), outline siempre (no hay `-filled`) |

No se agregan variables CSS ni escalas nuevas. Un color que no está acá es
una decisión para pedir, no para completar.

## 3. Componentes (`components/ui/`)

| Componente | Para qué | Props clave |
| --- | --- | --- |
| `AppEncabezado` | Encabezado de página | `titulo`, `subtitulo`, `volver-label` (+ `@volver`), slots `acciones`, `junto-titulo`, `subtitulo` |
| `AppButton` | Toda acción | `label`, `icon`, `severity` (primary/secondary/danger), `variant` (solid/outline/text), `size` (sm/md/lg), `loading` |
| `AppBuscador` | Búsqueda de la barra de filtros | `v-model`, `label` (sr-only), `placeholder` |
| `AppSegmentado` | Elegir 1 de 2–5 opciones visibles (estado, pestañas) | `v-model`, `opciones` [{valor,label,conteo?,icono?}], `label` |
| `AppSelect` | Filtro con muchas opciones | `v-model`, `label`; `<option>` en el slot |
| `AppTable` + `AppColumn` | Tablas de listados | ver `frontend/AGENTS.md`; `@ordenar`, `@row-click`, `row-class` |
| `AppPaginacion` | Paginación server-side | `pagina`, `tam-pagina`, `total`, `variante` (completa/compacta); `@update:pagina`, `@update:tam-pagina` |
| `AppSeccion` | Unidad de contenido de fichas y tableros | `titulo`, `conteo`, `descripcion`, `sin-padding`; slot `acciones` |
| `AppListaDatos` | Pares etiqueta/valor | `datos` [{label,valor,mono?}], `columnas` (1/2); slot `valor-<i>` |
| `AppKpi` | Indicador con cifra | `label`, `valor`, `detalle`, `icono`, `tono`, `to` (enlace al listado que explica la cifra) |
| `AppVacio` | Estado vacío | `titulo`, `mensaje`, `icono`, `variante` (pagina/seccion); slot = acción |
| `AppTag` | Tag suelto | `tono`, `icono`, `punto` |
| `AppAvatar` | Iniciales con tono estable | `nombre`, `tamano` (sm/md/lg/xl) |
| `AppDialog` | Modal de formulario sobre PrimeVue | ver su cabecera |
| `AppMenu` (vía `components/shared/MenuAcciones.vue`) | Menú ⋮ | `acciones` [{icono,label,onClick,danger?,disabled?,visible?,separador?}] |

Componentes compartidos que siguen vigentes: `BadgeEstado` (estados del
dominio, tono desde `core/badges.js`), `MenuAcciones`, `ConfirmDialog`,
`Modal` (formularios existentes), `SelectorVista`, `BuscadorCombo`.

### Primitivas en CSS (`styles/componentes.css`, capa `components`)
Se mantienen como **oficiales** (no se migran a componentes: ya son
consistentes y están en ~120 lugares):
- **Campos de formulario**: `.campo`, `.campo__etiqueta`, `.campo__caja`,
  `.campo__control` (`--select`, `--area`), `.campo__adorno`, `.campo__pie`,
  `.campo--invalido`, `.campo--inerte`; grilla `.form-grid` (+ `.full`).
- **Modal** (`components/shared/Modal.vue`): `.modal-*`.
- **Tags de estado**: `.tag--*` / `.cds-tag--*` (los usa `BadgeEstado`).
- **Avisos inline**: `.notif`, `.notif--{danger,success,warning,info}`.
- **Revelado de contraseñas**: `.cred*` — su marcado NO se toca (lo audita
  `useRevelado`).
- **Botón solo-ícono**: `.icon-btn` (+ `.danger`).

El resto de `componentes.css` (`.vista-modulo`, `.page`, `.card--fill`,
`.filters`, `.site-header`, tabla nativa, `.paginacion`, `.tarjeta-fila`,
`.btn`...) es **provisional**: existe para que las vistas no rediseñadas no
se vean sin estilos, y se borra cuando la última vista deja de usarlo.

## 4. Recetas de página

### 4.1 Listado (referencia: `EmpleadosView.vue`)
```
<div class="flex h-full min-h-0 flex-col">
  <AppEncabezado titulo subtitulo> #acciones: [secundarias text] [principal sólida]
  <div class="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6">   ← barra de filtros
    AppBuscador · AppSegmentado (estado) · AppSelect(s) · [SelectorVista ml-auto]
  <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
    error → .notif--danger · vacío → AppVacio (pagina)
    card: rounded-lg border bg-white flex-col overflow-hidden
      div.min-h-0.flex-1.overflow-auto > AppTable (fila clic → detalle, ⋮ en la última columna)
      AppPaginacion
```
- Columnas: pocas y ricas. La entidad (avatar/ícono + nombre + identificador
  en `text-xs`) primero; datos relacionados apilados (principal arriba,
  secundario abajo en `text-xs text-gray-500`); estado con `BadgeEstado`;
  acciones al final en ⋮ (`<div class="flex justify-end" @click.stop>`).
- Contadores compactos: ícono + número `tabular-nums`; en cero, `text-gray-300`.
- Móvil (`useEsMovil`): grilla de tarjetas (`grid gap-3 sm:grid-cols-2
  xl:grid-cols-3`), cada tarjeta `rounded-lg border bg-white p-4`, mismo ⋮.

### 4.2 Detalle / ficha (referencia: `EmpleadoDetalleView.vue`)
```
<div class="mx-auto w-full max-w-7xl px-4 pb-10 pt-5 sm:px-6">
  ← volver (texto gris)
  perfil: [avatar/ícono grande] [título + estado · línea secundaria · meta con íconos] [acciones]
  (guía/aviso contextual, si aplica)
  grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6
    principal: AppSeccion(es) con listas divide-y (fila: ícono en caja gris + título + meta + acciones)
    lateral (lg:sticky lg:top-6): AppSeccion + AppListaDatos
```

### 4.3 Tablero (Dashboard, reportes)
- Fila de `AppKpi` (`grid gap-3 sm:grid-cols-2 xl:grid-cols-4`); cada cifra
  tiene que explicarse con un clic, de una de dos formas:
  - **Enlace** (`to`): cuando lo que explica la cifra es OTRA vista (ej.
    "Empleados activos" → `/empleados?estado=Activo`).
  - **Filtro en el lugar**: cuando lo que explica la cifra ya está en la
    misma pantalla, justo debajo (ej. Dashboard, "Pendientes por área"
    filtra el feed "Requiere atención"; Equipos, Libres/Ocupados/En
    reparación filtra la tabla). El `AppKpi` va sin `to`, dentro de un
    `<button>` con `aria-pressed`; el activo se marca con
    `border-primary-300 bg-primary-50/50` y el detalle cambia a
    "Filtro aplicado · clic para quitar". No navega: navegar para ver lo
    que ya estaba en pantalla es un paso de más.
- Debajo, `AppSeccion` en grilla de 2–3 columnas con listas de pendientes
  ("qué requiere atención"), no gráficos decorativos.

### 4.4 Catálogos / configuración
- Navegación de secciones a la izquierda (lista vertical con el ítem activo
  en `bg-primary-50 text-primary-700`) o `AppSegmentado` si son ≤ 5; contenido
  a la derecha como listado compacto (4.1 sin encabezado grande).
- Cada sección abre con `modules/configuracion/EncabezadoCatalogo.vue`
  (`titulo`, `conteo`, `descripcion`, slot `acciones` con la única acción
  sólida): el título grande de página ya lo pone `ConfiguracionView`.

### 4.5 Portal público (sin sesión)
- Centrado, `max-w-lg`, logo arriba, una sola card blanca, textos cortos,
  controles grandes (`AppButton size="lg"` en la acción principal), mucho
  aire. Debe verse impecable a 360–600px.

### 4.6 Formularios
- En modal (`Modal`/`AppDialog`): título que nombra la acción ("Editar
  empleado"), `.form-grid` de 2 columnas (1 en móvil), secciones con
  `.section-label`, pie con [Cancelar outline] [Guardar sólido].
- Errores: `.campo--invalido` + `.campo__pie--error` en el campo; error
  general con `.notif--danger` arriba del pie.

## 5. Copy
- Impersonal en títulos ("Editar empleado"), imperativo de usted en
  formularios y errores ("Complete el campo"). Nunca tutear.
- Subtítulos que informan ("3 tickets sin asignar"), no que decoran.
- Vacíos: qué pasa + qué hacer ("Agregue el primer empleado…").

## 6. Accesibilidad (verificada por tests y `scripts/patrones-ui.mjs`)
- Botón solo-ícono → `aria-label`; imagen → `alt`; cabecera de tabla con
  texto; íconos decorativos `aria-hidden="true"`.
- Controles de filtro con etiqueta (visible o `sr-only`).
- Focos visibles: `focus-visible:ring-2 focus-visible:ring-primary-500`.
- Todo modal pasa por `Modal.vue`/`AppDialog.vue` (foco atrapado, Escape).

## 7. Cómo verificar un rediseño
`cd frontend && npm run dev:maqueta` (datos inventados, sin backend, JEFE
ficticio) → revisar a 1440px y a 600px. Build (`npx vite build`), tests
(`npm test`), `npm run lint` y `node scripts/patrones-ui.mjs` en verde.
