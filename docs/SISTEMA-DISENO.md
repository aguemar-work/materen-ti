# Sistema de diseño — Materen · Sistema TI

> **V2 "marco + hoja"**, vigente desde el **2026-09-25** (reemplaza al shell
> y las recetas del 2026-09-22). Implementación de referencia: el módulo
> **Empleados** (`modules/empleados/EmpleadosView.vue`,
> `EmpleadoDetalleView.vue`, `modules/cuentas/CuentasPanel.vue`) y el shell
> (`components/shared/AppLayout.vue` + `AppNav.vue`). Ante la duda, se hace
> como ahí.
>
> Base técnica: Tailwind v4 (tema en el `@theme` de `styles/main.css`) +
> PrimeVue v4 Unstyled solo a través de los wrappers de `components/ui/`.
> Reglas técnicas del wrapper: `frontend/AGENTS.md`, sección "UI/UX".
>
> **Qué NO se toca en un rediseño** (decisión de producto): la paleta (rampa
> `primary-*` + grises de Tailwind), la tipografía (Inter Variable) y la
> regla de **cero bordes laterales** (ni acentos a la izquierda ni líneas
> verticales decorativas).

## 1. Principios

1. **Herramienta de trabajo, no vitrina.** Legibilidad, densidad y
   confianza. Nada decorativo que no ayude a decidir o actuar.
2. **Marco + hoja.** Todo lo que es "el sistema" (marca, menú, usuario) vive
   en el marco gris; todo lo que es "esta página" vive en UNA hoja blanca.
   La página no se arma con islas sueltas sobre un fondo: encabezado, barra
   de filtros y tabla son partes continuas de la misma hoja.
3. **La barra dice dónde estoy; la página dice qué estoy viendo.** Las migas
   de la barra de la hoja (grupo › módulo › sub-página) ubican; el título +
   subtítulo con el conteo y el filtro activo ("9 personas en estado
   activo") describen. Por eso las fichas NO llevan enlace "← Volver": sería
   la misma miga repetida una línea más abajo.
4. **El filtro va pegado a lo que filtra.** La barra de filtros
   (`AppBarraFiltros`) está entre el encabezado y la tabla, y la tabla va a
   sangre en la hoja (`AppMarcoTabla`), no en una card aparte.
5. **Un solo acento fuerte por pantalla**: la acción principal
   (`AppButton` sólido primario). Todo lo demás es `outline` o `text`. Las
   acciones destructivas en una página son `outline` + `danger`; el rojo
   sólido se reserva para el botón de confirmar de un ConfirmDialog
   destructivo.
6. **Peso visual proporcional al significado**: sin fondo → solo borde →
   fondo tenue (estado/categoría, selección) → sólido (una por vista). Ante
   la duda, el escalón más bajo.
7. **Hover, activo y selección sin bordes — "pedazo de hoja".** Hover:
   solo fondos tenues. Selección dentro de un control de opciones (ítem
   activo del menú, opción de `AppSegmentado`, `SelectorVista`): una
   pastilla blanca con sombra mínima, el mismo material que la hoja. Ningún
   borde de más de 1px y **ningún borde lateral** (el acento izquierdo se
   retiró el 2026-09-24; tampoco líneas verticales como separador).
8. **Una sola escala de alturas.** 32px para todo control compacto (barra de
   filtros, botones `sm`, paginación, barra de la hoja), 36px para campos de
   formulario y botones `md`, 44px en el portal público (táctil). Nunca dos
   alturas distintas en la misma fila.
9. **Profundidad mínima, no plana ni flotante.** Botones sólidos/outline,
   campos, cards (`AppSeccion`, `AppKpi`) y la hoja llevan `shadow-xs` (1px):
   se leen como piezas presionables o apoyadas. Sombras grandes solo en lo
   que flota (menús, popovers, modales, panel móvil).
10. **Mostrar lo que informa, esconder lo que se repite.** La flecha de
    orden solo aparece en la columna ordenada (o al pasar el mouse por una
    ordenable); una fila de flechas idénticas es ruido.
11. **Acciones de fila en un menú ⋮** (`MenuAcciones`); la fila entera abre
    el detalle. Nada de íconos que aparecen al pasar el mouse.
12. **Vacíos y cargas con intención**: `AppVacio` dice qué falta y ofrece la
    acción que lo resuelve. Nunca un guion suelto: "Sin registrar" en gris.
13. **Móvil real**: a < 768px la hoja ocupa toda la pantalla, el menú es un
    panel deslizante y las tablas pasan a tarjetas o listas; nada con scroll
    horizontal accidental.

## 2. Tokens (lo único que se "elige")

| Qué | Valor |
| --- | --- |
| Acento | `primary-50…950` (500 = `#0064E0`, único color de marca) |
| Neutros | `gray-*` de Tailwind (marco `gray-50`, hoja `white`, bordes `gray-200`/`gray-100`, banda de cabecera de tabla `gray-50/80`) |
| Texto | primario `gray-900` · secundario `gray-600` · terciario `gray-500` (mínimo para cualquier texto que informe: 4,5:1 sobre blanco). `gray-400`/`gray-300` solo en íconos decorativos, estados `disabled:` y `placeholder:` |
| Estados | `green` (ok) · `amber` (atención) · `red` (error/vencido) — tonos 50 de fondo, 700/800 de texto |
| Categorías del dominio | `sky` · `violet` · `teal` (prioridades, tipos) — mismos tonos |
| Tipografía | Inter Variable, `tabular-nums` en códigos, DNI, cifras y fechas |
| Tamaños de texto | página `text-2xl font-semibold tracking-tight` · sección `text-sm font-semibold` · cuerpo `text-sm` · meta `text-xs` · cabecera de tabla `text-xs font-medium text-gray-500` · rótulo de grupo del menú `text-[11px] font-semibold uppercase tracking-wider` |
| Alturas | 32px (`h-8`) controles compactos · 36px (`h-9`) campos y botón `md` · 44px (`h-11`) portal |
| Radios | controles `rounded-md` · cards `rounded-lg` · hoja y modales `rounded-xl` · avatares/pastillas `rounded-full` |
| Sombras | `shadow-xs` en controles, cards y la hoja · `shadow-lg`/`shadow-xl` solo en lo que flota |
| Íconos | Tabler webfont (`ti ti-*`), outline siempre (no hay `-filled`) |

No se agregan variables CSS ni escalas nuevas. Un color que no está acá es
una decisión para pedir, no para completar.

## 3. Shell y componentes

### 3.1 Shell (`components/shared/`)

```
┌ marco gray-50 ──────────────────────────────────────────────────────┐
│ [logo] Materen      │┌ hoja (white, rounded-xl, ring 1px, shadow-xs)┐│
│        Sistema TI   ││ [≡] Grupo › Módulo            [Buscar… ⌘K][🔔]││ ← barra 48px
│                     │├──────────────────────────────────────────────┤│
│ Inicio              ││ <main> (scroll propio)                       ││
│ MESA DE AYUDA       ││                                              ││
│  Tickets        (3) ││                                              ││
│  ...                ││                                              ││
│ [AG] Alejandro  ⇕   │└──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

- **Sidebar** (`AppLayout.vue` + `AppNav.vue`): 240px (64px en riel), sin
  fondo ni borde propio sobre el marco. Arriba la marca (enlaza a Inicio),
  abajo el bloque de usuario (avatar + nombre + rol; abre el menú de
  cuenta). El ítem activo lleva la marca `nav-activo` (pastilla blanca) y el
  ícono en `primary-600`. En el riel, una línea fina separa los grupos.
- **Estructura del menú**: `components/shared/navegacion.js` (`AREAS_NAV`),
  única fuente para el sidebar y para las migas (`migasDeRuta`). Un ítem
  nuevo se agrega ahí, nunca en dos lados.
- **Barra de la hoja** (48px): botón de menú (en desktop alterna el riel, en
  móvil abre el panel), migas, búsqueda global (`AppSearch`: un campo a la
  vista con el atajo Ctrl/⌘K desde `sm`, lupa en móvil) y campana.
- **Móvil**: la hoja ocupa toda la pantalla sin margen ni radio; el sidebar
  es un panel blanco deslizante con sombra y velo detrás.
- Clases compartidas del shell: `components/shared/shellClases.js`.

### 3.2 Componentes (`components/ui/`)

| Componente | Para qué | Props clave |
| --- | --- | --- |
| `AppEncabezado` | Encabezado de página | `titulo`, `subtitulo`, slots `acciones`, `junto-titulo`, `subtitulo` |
| `AppBarraFiltros` | Fila de controles de 32px entre el encabezado y la tabla de un listado | slot (el selector de vista lleva `ml-auto`); con `AppVistas` arriba, `class="pt-3"` |
| `AppVistas` | Pestañas de vista de un listado, con conteo (§3.2.1) | `v-model`, `opciones` [{valor,label,conteo?,icono?,titulo?}], `label` |
| `AppFiltros` | Chips de filtro bajo demanda con selección múltiple (§3.2.1) | `v-model` ({[id]: valores[]}), `dimensiones` [{id,label,icono,opciones:[{valor,label}]}] o [{id,label,icono,tipo:'rango'}] (valor `[desde,hasta]`) |
| `AppMarcoTabla` | Tabla a sangre dentro de la hoja (sin card), no se estira: con pocas filas la paginación queda pegada a la última | slot (tabla con scroll + `AppPaginacion`) |
| `AppButton` | Toda acción | `label`, `icon`, `severity` (primary/secondary/danger), `variant` (solid/outline/text), `size` (sm 32 / md 36 / lg 44), `loading`; `to` (renderiza `RouterLink`) o `href` (renderiza `<a>`) para un botón que navega |
| `AppPortal` | Layout del portal público y de las páginas de error (4.5) | `titulo` (el `<h1>`), `descripcion`, `seccion`, `icono` + `tono`, `centrado`, `superpuesto`; slots `antetitulo`, `pie` |
| `AppBuscador` | Búsqueda de la barra de filtros (32px, hasta `max-w-sm`) | `v-model`, `label` (sr-only), `placeholder` |
| `AppSegmentado` | Elegir 1 de 2–5 opciones visibles (estado, pestañas) | `v-model`, `opciones` [{valor,label,conteo?,icono?}], `label` |
| `AppSelect` | Filtro con muchas opciones (32px) | `v-model`, `label`; `<option>` en el slot |
| `AppTable` + `AppColumn` | Tablas de listados | `orden` (el `{columna, direccion}` del store o de `useOrdenTabla`), `@ordenar`, `@row-click` (la fila entra en el orden de Tab y Enter la abre), `row-class` |
| `AppPaginacion` | Paginación server-side | `pagina`, `tam-pagina`, `total`, `variante` (completa/compacta); `@update:pagina`, `@update:tam-pagina` |
| `AppSeccion` | Unidad de contenido de fichas y tableros | `titulo`, `conteo`, `descripcion`, `sin-padding`; slot `acciones` |
| `AppListaDatos` | Pares etiqueta/valor | `datos` [{label,valor,mono?}], `columnas` (1/2); slot `valor-<i>` |
| `AppKpi` | Indicador con cifra | `label`, `valor`, `detalle`, `icono`, `tono`, `to` (enlace al listado que explica la cifra) |
| `AppVacio` | Estado vacío | `titulo`, `mensaje`, `icono`, `variante` (pagina/seccion); slot = acción |
| `AppTag` | Todo tag/pastilla, 20px (único render de tag del sistema) | `tono` (neutral/success/warning/danger/info/purple/sky/teal), `icono`, `punto` |
| `AppAvatar` | Iniciales con tono estable | `nombre`, `tamano` (sm/md/lg/xl) |
| `AppDialog` | Modal de formulario sobre PrimeVue | ver su cabecera |
| `AppMenu` (vía `components/shared/MenuAcciones.vue`) | Menú ⋮ | `acciones` [{icono,label,onClick,danger?,disabled?,visible?,separador?}] |

Componentes compartidos que siguen vigentes: `BadgeEstado` (estados del
dominio: el tono sale de `core/badges.js` → `core/tagRol.js` y el render es
`AppTag` por dentro — un solo look de tag en todo el sistema),
`MenuAcciones`, `ConfirmDialog`, `Modal` (formularios existentes),
`SelectorVista`, `BuscadorCombo`.

Tags: un estado del dominio va con `BadgeEstado`; cualquier otro tag, con
`AppTag` (si el tono viene de un `core/dominio-*.js`, pasarlo por
`rolDeTag()`). No se escriben tags a mano con clases.

### 3.2.1 Filtros V2: vistas + chips + URL (2026-09-25)
Modelo de filtrado de **todos** los listados (cerrado el 2026-09-25: no
queda ningún listado con segmentados o selects de filtro). Excepciones
deliberadas, que no son listados: el paso de revisión de
`ImportarEquiposView` y la tabla de respuestas de `ReporteSatisfaccionView`
(un solo interruptor dentro de un reporte). Configuración (Empresas,
Plataformas) solo tiene buscador: no hay nada que filtrar.

```
 Activos 9   Inactivos 3   Suspendidos 0   Todos 12          ← AppVistas
──────────────────────────────────────────────────────────
[🔍 Buscar…] [🏢 Empresa: Materen, Andes ⌄ ×] [⧩ Filtro] ✕ Limpiar   ← AppBarraFiltros
```
- **Vistas** (`AppVistas`): las 3–6 preguntas diarias de esa lista, a un
  clic y con su conteo (el conteo respeta búsqueda y chips, no la vista
  elegida: dice cuántas filas va a mostrar esa pestaña). Reemplazan al
  segmentado de estado y a los KPI que filtraban. Indicador de la activa:
  marca horizontal de 2px debajo del texto (no es un borde, nunca lateral).
  **Coherencia (regla del dueño):** una fila de vistas responde UNA sola
  pregunta (casi siempre el estado del registro), nunca mezcla criterios
  (estado + responsable), y **"Todos" va siempre primero**. La vista por
  defecto puede ser otra (Empleados: Activos; Tickets: Pendientes;
  Problemas: Abiertos). Lo que no es estado — responsable, empresa… — es
  un chip.
- **Chips bajo demanda** (`AppFiltros`): "+ Filtro" abre las dimensiones
  del listado; cada dimensión elegida queda como chip con **selección
  múltiple**. O dentro de una dimensión, Y entre dimensiones. Chip
  aplicado = tinte `primary-50`; click lo edita, × lo quita entero. Nada
  ocupa espacio hasta que se usa.
- **"Limpiar"** vuelve búsqueda y chips a cero; la vista NO (una vista no
  es un filtro).
- **La URL es la fuente de verdad** (`useFiltrosUrl`):
  `?estado=Inactivo&empresa=a,b&q=juan`. Recargar, atrás/adelante o
  compartir el enlace reproduce la vista exacta; los enlaces de Inicio usan
  el mismo parámetro. Cambiar un filtro reemplaza la entrada de historial
  (no la apila).
- **La columna que la vista ya fija no se repite** (Empleados: "Estado" solo
  se ve en la vista "Todos").
- **Una vista nunca cambia la forma de la barra.** Prohibido el patrón
  "según la pestaña aparece otro segmentado o un select" (lo que tenía
  Tickets: bandeja → sub-estado → técnico). Si una vista ya decide una
  dimensión, esa dimensión sale del menú "+ Filtro" y su chip se poda al
  cambiar de vista — nunca queda una combinación imposible.
- **Rangos de fecha**: dimensión `tipo: 'rango'` de `AppFiltros` (atajos Hoy
  / 7 / 30 días + desde/hasta), chip "Creado: 27/08 – 25/09". En la URL
  viaja como `desde`/`hasta`. No se usan cajas de fecha fijas en la barra.
- **Recordar** (`useFiltrosUrl(esquema, { recordar: 'clave' })`): al volver
  al listado sin filtros en la URL (menú, migas, atrás desde el detalle) se
  restaura la última combinación de la sesión (sessionStorage). Hoy solo
  Tickets, donde se entra y sale del detalle todo el día.

Vistas y chips de cada módulo:

| Módulo | Vistas (con conteo) | Chips |
| --- | --- | --- |
| Empleados | Todos · Activos (defecto) · Inactivos · Suspendidos | Empresa, Área/Obra, Ubicación |
| Equipos | Todos · Libres · Con personas · En ubicaciones · En reparación · Fuera de servicio | Tipo, Empresa |
| Tickets | Todos · Pendientes (defecto) · Resueltos · Rechazados | Estado (dentro de Pendientes/Todos), Asignado a (Usted · Sin asignar · técnicos), Prioridad, Categoría, Tipo, Nivel, Solicitante, Creado |
| Licencias | Todas · Por vencer · Vencidas · Perpetuas | Empresa, Acceso (correo / clave / sin credencial) |
| Correos | Todos · Compartidos · Reutilizables · Por rotar | Plataforma |
| Base de conocimiento | Todos · Publicados · En revisión · Borradores · Obsoletos | Categoría, Autor |
| Problemas | Todos · Abiertos (defecto) · Cerrados | Etapa (no en Cerrados), Severidad, Responsable |
| Actividad | Todo · Contraseñas · Entregas · Denegados | Quién, Plataforma, Fecha (rango) |
| Accesos sensibles | Todas · Equipos · Correos · Otros | Permiso |

Actividad y Accesos sensibles filtran en el cliente (lista completa ya
cargada); el resto, en el servidor, con un `conteos…` por módulo en su
`api/domains/*`.

**Tickets** (`modules/tickets/filtrosTickets.js`): "Usted" viaja como
`?asignado=yo` (el mismo enlace sirve a cualquier técnico: Inicio → "Ver mis
tickets" = `?asignado=yo`). El subtítulo ofrece dos atajos a Pendientes con
su chip puesto: "N sin asignar" y "N sin vincular". Los enlaces de la
primera versión (`?vista=nuevos|mios`) se traducen a Pendientes + chip.

**Selección múltiple** (Tickets, en Tabla y en Triage): con filas marcadas,
la barra de acciones en lote **se sobrepone a la fila de búsqueda** (misma
altura, `absolute`), que queda `inert`. Nunca se inserta encima de la
tabla: empujarla hace perder de vista la fila que se estaba marcando.

### 3.3 Tablas (preset `pt/table.pt.js`)
- Cabecera: banda `gray-50/80`, texto `text-xs font-medium text-gray-500`,
  36px. La columna ordenada se marca en `gray-900` con la flecha en
  `primary-600`; en las demás ordenables la flecha aparece solo al pasar el
  mouse (`data-p-sorted` / `data-p-sortable-column`, atributos de PrimeVue).
- Celdas: `px-4 py-3`, separadores `gray-100` entre filas (nunca
  verticales), hover `gray-50`.
- Dentro de `AppMarcoTabla`, la primera y la última columna recuperan el
  padding de la página (`pl-4 sm:pl-6`) para alinearse con el título.
- Una tabla nunca desborda la hoja: si una columna de texto libre (título,
  nombre) puede crecer, la tabla va con `table-layout: fixed` (vía
  `table-props`), todas las columnas menos una con ancho, y la de texto
  libre toma el resto y recorta con `truncate` + `title`.
- **Fechas en columnas**: fecha concreta (`25/09`, con año solo si no es el
  actual) y su significado en gris delante ("Recibido", "Resuelto"), nunca
  una antigüedad relativa ("hace 3 d") como único dato. La antigüedad
  relativa queda para alertas (rojo + `ti-clock-exclamation`).

**Tickets (2026-09-25)** — Tabla: Prioridad · Estado · Ticket (número +
título, nada más) · Solicitante · Responsable · Fecha ("Recibido" mientras
está vigente, "Resuelto" con `resuelto_at`, migración 089). Prioridad y
Estado son siempre tag con fondo (`PrioridadTicket` ya no usa punto + texto
para baja/media). Doble columna y móvil comparten `TarjetaTicket.vue`, tres
filas: número · prioridad · nivel · estado / título / solicitante ···
avatar del responsable (círculo punteado si no hay, ámbar si sigue vigente).

**Detalle del ticket (página y panel de Triage, 2026-09-25)** — En escritorio
ocupa exactamente la hoja, **sin scroll de página**: encabezado fijo, la
conversación scrollea sola (arranca abajo, con el composer siempre visible
al pie) y la columna de gestión scrollea por su cuenta. En móvil vuelve al
scroll normal de página. Encabezado: `TicketResumen.vue` — **con íconos, no
rótulos** (cada dato con su nombre en `title` y en `sr-only`) y **solo lo que
no está en Gestión**: solicitante · recibido hace… · resuelto/rechazado hace…
· por quién · tiempo de resolución · satisfacción (★ n/5 y comentario, o
"Encuesta sin responder" con el recordatorio de WhatsApp). Prioridad, nivel,
tipo y responsable se editan en Gestión y no se repiten arriba. Toda acción
del detalle lleva `title` con qué hace y su consecuencia (`AppSegmentado`
acepta `titulo` por opción).
Actividad y conversación van **juntas** (una sola historia cronológica) con
"Todo · Mensajes" para leer solo lo escrito. Un comentario sin `autor_id` es
del solicitante y lleva su nombre, nunca "Sistema". `AppSeccion llenar`:
sección que ocupa el alto disponible con el cuerpo en columna flex.

### 3.4 Primitivas en CSS (`styles/componentes.css`, capa `components`)
Todo lo que queda en `componentes.css` es oficial, y cada selector tiene
consumidores reales. Son primitivas que no ganan nada convirtiéndose en
componente (marcado repetido en decenas de formularios) o cuyo marcado está
atado a otra pieza:
- **Campos de formulario** (36px): `.campo`, `.campo__etiqueta`,
  `.campo__caja`, `.campo__control` (`--select`, `--area`),
  `.campo__adorno`, `.campo__pie`, `.campo--invalido`, `.campo--inerte`;
  grilla `.form-grid` (+ `.full`) y rótulo de sección `.section-label`.
- **Avisos inline**: `.notif`, `.notif--{danger,success,warning,info}`,
  `.notif--inline`, `.notif__texto`/`__titulo`/`__detalle`/`__cerrar`.
- **Botón solo-ícono**: `.icon-btn` (+ `.danger`).
- **Atadas a un componente** (se tocan solo junto con él): `.modal-*` y las
  transiciones `modal-anim*` (`Modal.vue`), `.combo-*` (`BuscadorCombo`),
  `.selector-vista*` (`SelectorVista`), `.solo-escritorio`.
- **Revelado de contraseñas**: `.cred*` — su marcado NO se toca (lo audita
  `useRevelado`).

Los estilos de **elementos nativos** (`select`, inputs de fecha, checkbox,
`label`, `a` sin clase, tabla nativa como la de `ImportarEquiposView`)
viven en la capa `base` de `styles/main.css`, no acá (select y fechas
sueltos: 32px, misma línea que la barra de filtros).

Una clase nueva en `componentes.css` es una decisión de sistema, no un
atajo: lo propio de una vista va con utilidades de Tailwind en su
plantilla. El vocabulario heredado de Carbon (`.btn*`, `.card*`,
`.tag*`/`.cds-tag*`, `.page`, `.filters`, `.paginacion__*`,
`.tarjeta-fila*`, `.timeline*`, `.avatar*`, `.form-group`...) está borrado:
no reintroducirlo.

## 4. Recetas de página

### 4.1 Listado (referencia: `EmpleadosView.vue`)
```
<div class="flex h-full min-h-0 flex-col">
  <AppEncabezado titulo subtitulo> #acciones: [secundarias text] [principal sólida]
  <AppVistas v-model="filtros.estado" :opciones="VISTAS">          ← V2 (§3.2.1)
  <AppBarraFiltros class="pt-3">
    AppBuscador · AppFiltros (chips) · [Limpiar] · [SelectorVista ml-auto]
  </AppBarraFiltros>
  <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">   ← contenedor de contenido
    error → .notif--danger · vacío → AppVacio (pagina)
    <AppMarcoTabla>
      div.min-h-0.flex-1.overflow-auto > AppTable (fila clic → detalle, ⋮ en la última columna)
      AppPaginacion
    </AppMarcoTabla>
```
- Columnas: pocas y ricas. La entidad (avatar/ícono + nombre + identificador
  en `text-xs`) primero; datos relacionados apilados (principal arriba,
  secundario abajo en `text-xs text-gray-500`); estado con `BadgeEstado`;
  acciones al final en ⋮ (`<div class="flex justify-end" @click.stop>`).
- Contadores compactos: ícono + número `tabular-nums`; en cero,
  `text-gray-400` (el valor real viaja en `aria-label`).
- Móvil (`useEsMovil`): grilla de tarjetas (`grid gap-3 sm:grid-cols-2
  xl:grid-cols-3`), cada tarjeta `rounded-lg border bg-white p-4`, mismo ⋮.

### 4.2 Detalle / ficha (referencia: `EmpleadoDetalleView.vue`)
```
<div class="w-full px-4 pb-10 pt-6 sm:px-6">
  perfil: [avatar/ícono grande] [título + estado · línea secundaria · meta con íconos] [acciones]
  (guía/aviso contextual, si aplica)
  grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6
    principal: AppSeccion(es) con listas divide-y (fila: ícono en caja gris + título + meta + acciones)
    lateral (lg:sticky lg:top-6): AppSeccion + AppListaDatos
```
Sin enlace "← Volver" (las migas ya llevan al módulo) y sin tope de ancho: la
hoja es tan ancha como la ventana, igual que el Listado. El texto largo
(descripción, comentarios) conserva su propio tope de medida de lectura
(`max-w-prose`/`max-w-[70ch]`).

### 4.3 Tablero (Inicio, reportes)
- Inicio abre con un saludo ("Buenos días, Alejandro") y la fecha con el
  total de pendientes: es la portada de quien entra, no un "Dashboard".
- Fila de `AppKpi` (`grid gap-3 sm:grid-cols-2 xl:grid-cols-4`); cada cifra
  tiene que explicarse con un clic, de una de dos formas:
  - **Enlace** (`to`): cuando lo que explica la cifra es OTRA vista.
  - **Filtro en el lugar**: cuando lo que la explica ya está debajo (Inicio,
    "Pendientes por área"; Equipos, Libres/Ocupados/En reparación). El
    `AppKpi` va sin `to`, dentro de un `<button>` con `aria-pressed`; el
    activo se marca con `border-primary-300 bg-primary-50/50` y el detalle
    cambia a "Filtro aplicado · clic para quitar".
- Debajo, `AppSeccion` en grilla de 2–3 columnas con listas de pendientes,
  no gráficos decorativos.

### 4.4 Catálogos / configuración
- Navegación de secciones a la izquierda (lista vertical con el ítem activo
  en `bg-primary-50 text-primary-700`); contenido a la derecha como listado
  compacto dentro de una card (4.1 sin encabezado grande).
- Cada sección abre con `modules/configuracion/EncabezadoCatalogo.vue`
  (`titulo`, `conteo`, `descripcion`, slot `acciones` con la única acción
  sólida): el título grande de página ya lo pone `ConfiguracionView`.

### 4.5 Portal público (sin sesión)
- Centrado, `max-w-lg`, logo arriba, una sola card blanca, textos cortos,
  controles grandes (`AppButton size="lg"` en la acción principal), mucho
  aire. Debe verse impecable a 360–600px.
- Siempre sobre `components/ui/AppPortal.vue` (referencia:
  `modules/soporte/SoporteView.vue`, `modules/entregas/EntregaView.vue`).
  Cada página tiene su `<h1>` (prop `titulo`); las pantallas de resultado
  (éxito, enlace vencido, 404) llevan `icono` y se centran solas.
- Campos: primitivas `.campo*` con el control a `h-11 text-base sm:text-sm`
  (44px táctiles; 16px en móvil para que iOS no haga zoom al enfocar).
- "Volver a soporte" y similares: `AppButton variant="text"
  severity="secondary" to="..."` en el slot `pie`, fuera de la card.
- Un enlace que saca al usuario de una página con datos que no se pueden
  recuperar (credenciales ya reveladas en la entrega) abre en pestaña nueva
  (`target="_blank" rel="noopener noreferrer"`).

### 4.6 Formularios
- En modal (`Modal`/`AppDialog`): título que nombra la acción ("Editar
  empleado"), `.form-grid` de 2 columnas (1 en móvil), secciones con
  `.section-label`, pie con [Cancelar outline] [Guardar sólido] — botones y
  campos a 36px, la misma escala.
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
- El botón de menú de la barra dice la verdad en cada ancho: "Abrir/Cerrar
  menú" en móvil, "Expandir/Contraer navegación" en desktop, con
  `aria-expanded` acorde. Las migas son un `<nav aria-label="Ubicación">`
  con `aria-current="page"` en la última.

## 7. Cómo verificar un rediseño
`cd frontend && npm run dev:maqueta` (datos inventados, sin backend, JEFE
ficticio) → revisar a 1440px y a 390px, incluidos los estados que requieren
interacción (menú móvil abierto, riel, menú de usuario, búsqueda con
resultados). Build (`npx vite build`), tests (`npm test`), `npm run lint` y
`node scripts/patrones-ui.mjs` en verde.
