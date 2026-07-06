# Guía UX/UI del Sistema TI

> Este documento implementa, para Sistema TI, la fórmula y los patrones
> definidos en [`MATEREN-CORE.md`](MATEREN-CORE.md) (compartido entre todos
> los productos Materen). Lo de acá abajo son los **valores concretos**
> (hex, componentes ya cableados); la fundación conceptual vive allá.

**Vigencia**: actualizado 2026-07-06 (tema Cyprus/Sand + oscuro, tipografía
de sistema, grilla de 12 columnas, sidebar minimalista, badges/timeline/
capacity-bar/confirm-dialog unificados, escala de z-index). Si el código de
`main.css` contradice algo de aquí, gana el código
([Gobernanza de documentación](MATEREN-CORE.md#gobernanza)).

Documentación del sistema visual del panel: colores, tipografías, layout y
convenciones de componentes. Útil para mantener coherencia al añadir pantallas
o ajustar la identidad de marca.

### Sincronización con Materen Core

Para no mantener dos especificaciones que divergen con el tiempo, lo canónico
vive en [`MATEREN-CORE.md`](MATEREN-CORE.md); acá solo la implementación de
Sistema TI. Patrones ya **promovidos** al documento madre:

| Tema en esta guía | Especificación canónica | Qué queda acá |
|---|---|---|
| Escala z-index | [Fundaciones → Interacción](MATEREN-CORE.md#fundaciones) | Valores `--z-*` en `main.css` |
| Radios (`--radius-pill`, etc.) | [Fundaciones → Radios](MATEREN-CORE.md#fundaciones) | Tokens en `main.css` |
| Un acento por vista (+ excepción modal) | [Fundaciones → Interacción](MATEREN-CORE.md#fundaciones) | Corrección jul 2026 en 7 vistas |
| Badge base + modificadores, ajustes locales | [Patrones → Badge](MATEREN-CORE.md#patrones-de-componente) | Modificadores de dominio (`--purple`, `--sky`, etc.) |
| Capacity, timeline, confirmación, `.form-error` | [Patrones de componente](MATEREN-CORE.md#patrones-de-componente) | Markup de referencia de este repo |
| `.badge-group` | [Patrón candidato](MATEREN-CORE.md#patrones-de-componente) — **no generalizado** | Solo Equipos; no copiar hasta segunda ocurrencia |

## Arquitectura general

El frontend **no usa Tailwind ni librería de componentes**. Todo el diseño vive en:

| Archivo | Rol |
|---------|-----|
| [`frontend/src/styles/main.css`](../frontend/src/styles/main.css) | Design system completo: tokens, layout, botones, tablas, modales, badges, timeline, capacity, confirm-dialog, etc. |
| [`frontend/src/core/tema.js`](../frontend/src/core/tema.js) | Alternancia claro/oscuro (`data-theme` en `<html>`) |
| [`frontend/src/components/shared/AppLayout.vue`](../frontend/src/components/shared/AppLayout.vue) | Shell: sidebar minimalista + área principal |
| [`frontend/index.html`](../frontend/index.html) | Iconos (Tabler CDN). Sin webfonts de texto — tipografía del sistema operativo (ver §Tipografía) |

**Patrón de uso:** las vistas Vue aplican clases globales (`.card`, `.btn-primary`, `.filters`…) directamente en el template. Solo hay **un componente compartido** (`AppLayout`); el resto son vistas por módulo con `<style scoped>` para badges/chips de dominio.

```mermaid
flowchart TB
  subgraph tokens ["main.css"]
    brand["Cyprus + Sand"]
    semantic["Paleta semántica"]
    layout["Radios, sombras, espaciado"]
  end

  subgraph theme ["tema.js"]
    light[":root — claro"]
    dark["data-theme=dark"]
  end

  subgraph shell ["AppLayout"]
    sidebar["Sidebar minimalista (se funde con el fondo)"]
    main["Contenido según tema"]
  end

  subgraph views ["Vistas Vue"]
    globalClasses["Clases globales main.css"]
    scopedBadges["Badges scoped por módulo"]
  end

  tokens --> theme
  theme --> shell
  tokens --> views
```

---

## Identidad de marca

> **Paleta vigente en producción, no marca oficial.** Cyprus y Sand son los
> colores **implementados hoy** en `main.css` y en https://materen-ti.vercel.app.
> La identidad de marca Materen es Navy + Turquesa/Índigo — ver
> [Identidad de marca](MATEREN-CORE.md#identidad-de-marca) en Materen Core.
> Esta paleta verde es [deuda de migración](MATEREN-CORE.md#deuda-de-migracion),
> no una excepción de marca. Si abriste este archivo sin leer Materen Core, **no
> asumas que Cyprus es el color oficial de Materen.**

Comentado en `main.css` como implementación local (heredada):

- **Cyprus** `#004741` — acento principal vigente (botones, links, icono de marca)
- **Sand** `#f0ede4` — fondo base del tema claro (cálido, no blanco puro)

El icono de marca usa un **gradiente** Cyprus → teal:

```css
/* frontend/src/styles/main.css — .brand-icon */
background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%);
box-shadow: 0 4px 12px rgba(0, 71, 65, 0.3);
```

---

## Paleta de colores (tokens CSS)

### Fondos y texto — tema claro (`:root`)

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-bg` | `#f0ede4` | Fondo de página (sand) |
| `--color-bg-elevated` | `#fdfcf8` | Tarjetas, header |
| `--color-bg-subtle` | `#f7f4ec` | Filtros, cabeceras de tabla |
| `--color-bg-hover` | `#eceadf` | Hover en filas/elementos |
| `--color-text-primary` | `#1d2420` | Texto principal |
| `--color-text-secondary` | `#68716b` | Subtítulos, labels |
| `--color-text-tertiary` | `#98a19a` | Placeholders, iconos muted |
| `--color-border` | `#ded9cb` | Bordes estándar |

### Acento / identidad

| Token | Claro | Oscuro |
|-------|-------|--------|
| `--color-accent` | `#004741` (cyprus) | `#0d9488` (teal luminoso) |
| `--color-accent-2` | `#0d9488` | `#10b981` |
| `--color-accent-soft` | `#14b8a6` | `#2dd4bf` |
| `--color-accent-hover` | `#00332f` | `#14b8a6` |
| `--color-accent-subtle` | `#e2ece8` | `rgba(20,184,166,0.14)` |
| `--color-accent-text` | `#00594f` | `#5eead4` |

En oscuro el cyprus puro no tiene contraste suficiente, por eso el acento **sube a teal** manteniendo la familia verde.

### Colores semánticos (convención de dominio)

Cada familia comparte **una sola fórmula** de saturación/luminosidad; solo
cambia el hue (H). Esto garantiza que las 8 familias se lean como *un mismo
sistema* y no como paletas sueltas:

- **Claro**: `bg` → H, S 35-55%, L 90-93% · `text` → H, S 45-60%, L 28-35% · `border` → H, S 30-45%, L 75-80%
- **Oscuro**: `bg` → H, S 25-30%, L 20-22% · `text` → H, S 45-60%, L 75-80% · `border` → H, S 25-30%, L 35-38%

Todas las variantes `-bg`/`-text` (16 pares, 8 familias × 2 temas) están
verificadas ≥5.3:1 de contraste (WCAG AA es 4.5:1; la mayoría cae en rango
AAA). Ver [`scripts/contraste.mjs`](../scripts/contraste.mjs) — correr
`node scripts/contraste.mjs` tras tocar estos tokens.

| Familia | Hue | Significado en el panel |
|---------|-----|--------------------------|
| **danger** (rojo) | 9° | Errores, crítico, equipos perdidos/robados |
| **success** (verde) | 100° | OK, disponible, activo |
| **warning** (ámbar) | 36° | Rotar contraseña, por vencer, suspendido, en reparación |
| **info** (azul) | 205° | Asignado, entregas |
| **purple** (morado) | 265° | Ubicaciones |
| **sky** (celeste) | 190° | Tipos de cuenta |
| **teal** | 170° | Correos, garantías |
| **neutral** (gris) | 100° (S baja) | Baja, inactivo genérico |

Cada familia expone `-bg`, `-text`, `-border`; `warning` y `teal` además
tienen variantes de énfasis (`-text-strong`, `-bg-strong`, `-bg-subtle`)
para casos donde el par base no da suficiente jerarquía visual — estas
variantes también están verificadas en el script.

`--color-danger` y `--color-success` (sin sufijo) son versiones **vivas**
de alta saturación para iconos/botones sólidos — no se usan para texto
sobre su propio `-bg` (para eso están `-text`).

> Corrección de accesibilidad (jul 2026): `--color-neutral-text` pasó de
> `#68716b` (4.2:1 sobre `--color-neutral-bg`, fallaba AA) a `#474d40`
> (~7.2:1, AAA).

### Sidebar (minimalista, sigue el tema)

Definido en `AppLayout.vue`. Regla de diseño (decisión del JEFE):
**el sidebar no debe sentirse como un bloque aparte** —

- Fondo: `var(--color-bg)` — el mismo de la página (sand claro / verde-noche
  oscuro). **Sin borde derecho, sin sombra, sin líneas divisorias** internas
  (logo y footer sin `border-bottom/top`).
- Hover de ítems: fondo muy tenue `var(--color-bg-hover)`, **nunca bordes**.
- Ítem activo: tinte suave `var(--color-accent-subtle)` + texto
  `var(--color-accent-text)`, **sin border-left ni indicadores**.
- Búsqueda: input sin borde visible (fondo tenue); al enfocar sube a
  `--color-bg-elevated` con borde suave.
- Ancho: `240px`. En móvil (off-canvas) sí lleva sombra al abrirse.

### Sombras y radios

```
--radius-sm: 6px      --shadow-sm: sutil
--radius-md: 10px     --shadow-md: tarjetas hover
--radius-lg: 14px     --shadow-lg: modales
--radius-xl: 20px
--radius-pill: 999px  (badges, capacity-bar, timeline-dot)
```

Escala canónica en [Fundaciones → Radios](MATEREN-CORE.md#fundaciones).

### Escala de z-index

Especificación canónica en [Fundaciones → Interacción](MATEREN-CORE.md#fundaciones)
("capas, no números sueltos"). Valores concretos de Sistema TI:

```
--z-header: 50           site-header sticky de cada vista
--z-header-mobile: 60    topbar-mobile (encima del header normal)
--z-nav: 100             sidebar en modo drawer (≤768px) + su overlay (z-nav - 1)
--z-popover: 300         .sb-resultados (búsqueda global)
--z-modal: 400           .modal-bg
--z-modal-stacked: 410   reservado para un modal sobre otro (sin uso aún)
--z-toast: 500           .toast — siempre visible, incluso sobre un modal
```

Antes de este ajuste, `.modal-bg` estaba en `z-index: 100` y el drawer móvil
en `200` — un modal podía quedar **debajo** del sidebar en móvil. Corregido
al fijar la escala (promovida a
[Materen Core → Fundaciones](MATEREN-CORE.md#fundaciones)). Los dropdowns internos de un modal (`.combo-lista` en
Equipos/Licencias, `z-index: 20`) no participan de esta escala: compiten
solo dentro del stacking context que crea su propio `.modal-bg`, no contra
el sidebar ni el header.

### Excepciones hardcodeadas

- Botón WhatsApp: `#25d366`
- Overlay de modal: `rgba(15,23,42,0.45)` + `backdrop-filter: blur(4px)`
- Focus ring en inputs: `box-shadow: 0 0 0 3px rgba(13,148,136,0.18)`

---

## Tipografía — estilo Meta (fuente del sistema)

**Decisión del JEFE**: tipografía al estilo Facebook/Meta = **pila nativa del
sistema operativo**, sin webfonts de texto (carga instantánea, sensación
nativa, cero dependencia de Google Fonts):

| Rol | Pila | Resultado por SO |
|-----|------|------------------|
| UI general | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial` | Windows → **Segoe UI** · macOS → **San Francisco** · Android → **Roboto** |
| Códigos, contraseñas, seriales | `ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas` | Mono nativo del SO |
| Iconos | **Tabler Icons** (`ti ti-*`) | Único webfont que queda (CDN) |

Variables: `--font-sans` y `--font-mono`. El `body` lleva
`-webkit-font-smoothing: antialiased` (acabado Meta).

### Escala tipográfica (tokenizada)

Tokens en `main.css` — **usar en pantallas nuevas** en lugar de px sueltos:

| Token | Valor | Uso típico |
|-------|-------|------------|
| `--fs-xs` | 11px | Badges, headers de tabla (uppercase) |
| `--fs-sm` | 12px | Labels secundarios, metadatos |
| `--fs-base` | 13px | Botones, inputs, celdas de tabla, nav |
| `--fs-md` | 14px | `body` base |
| `--fs-lg` | 15px | Títulos de toolbar/sección |
| `--fs-xl` | 17px | Títulos de modal |
| `--fs-2xl` | 20px | Títulos de página/login |
| `--fs-stat` | 26px | Valores en stat cards |

Pesos: **500** botones/nav, **600** labels/badges/títulos (Meta favorece
semibold), **700** solo números de stats y marca. Uppercase con
letter-spacing `0.04–0.06em`.

---

## Tema claro / oscuro

[`frontend/src/core/tema.js`](../frontend/src/core/tema.js):

1. `initTema()` se llama **antes** de montar Vue (evita flash)
2. Preferencia guardada en `localStorage` → clave `sistema-ti-tema`
3. Sin preferencia: respeta `prefers-color-scheme` del sistema
4. Oscuro: atributo `data-theme="dark"` en `<html>`

El sidebar usa los tokens del tema, así que **cambia junto con el área
principal** (sand en claro, verde-noche en oscuro).

---

## Layout y estructura de página

### Grilla de 12 columnas

Las vistas componen sobre `.grid-12` (12 columnas, gap 16px) con clases de
span `.col-2 / .col-3 / .col-4 / .col-6 / .col-8 / .col-12` definidas en
`main.css`. Colapso responsive automático: ≤1200px los spans se ensanchan
(2→4, 3→6, 4→6, 8→12); ≤700px todo apila (col-2 queda en media fila).

Uso en el Dashboard: 6 stat-cards `col-2` (fila completa), pendientes
`col-4` (3 por fila), recientes `col-3` (4 por fila). **Preferir esta grilla
sobre grids ad-hoc por vista.**

### Shell autenticado

```
┌────────────┬──────────────────────────────┐
│  Sidebar   │  layout-main (scroll)        │
│  240px     │  ├ site-header sticky 64px   │
│  #05201c   │  └ .page → .card → tabla     │
└────────────┴──────────────────────────────┘
```

### Página tipo listado (empleados, equipos, etc.)

1. `site-header` → `header-inner` → `.brand` + `.header-btns`
2. `main.page` → `.card`
3. `.card-toolbar` (título + acciones)
4. `.filters` (búsqueda + selects)
5. `.table-wrap` > `table` o `.empty`

### Rutas públicas (login, entrega)

Sin sidebar: card centrada a pantalla completa, reutilizando `.card`, `.brand`, `.form-group`, `.btn-primary`.

### Breakpoints responsive

| Ancho | Comportamiento |
|-------|----------------|
| ≤900px | Stats grid a 2 columnas |
| ≤768px | Sidebar off-canvas + topbar móvil 48px |
| ≤600px | Formularios 1 columna, padding reducido |

Constantes: `--header-h: 64px`, `--max-w: 1280px`, padding de página `1.5rem` (1rem en móvil).

---

## Componentes UI reutilizables (clases CSS)

Todo en `main.css` — no hay átomos Vue separados:

**Botones:** `.btn`, `.btn-primary`, `.btn-whatsapp` (+ `.btn-danger` local en algunos modales)

**Contenedores:** `.card`, `.card-toolbar`, `.stat-card`, `.cred-card`

**Formularios:** `.form-grid`, `.form-group`, `.section-label`, `.tool-tag`, `.tool-input`

**Datos:** `.table-wrap`, `table/th/td`, `.user-cell`, `.avatar`

**Estado:** `.status`, `.s-activo`, `.s-inactivo`, `.s-suspendido`, `.pill`, `.badge-count`

**Interacción:** `.icon-btn`, `.actions`, `.filters`, `.search-wrap`

**Overlays:** `.modal-bg`, `.modal`, `.modal-lg`, `.modal-detail`, `.modal-actions`

**Feedback:** `.empty`, `.no-results`, `.toast` (vía `core/toast.js`)

**Detalle:** `.detail-header`, `.detail-grid`, `.detail-item`

### Badges — sistema unificado

**Antes**: 5 convenciones distintas para el mismo patrón visual
(`.status`+`.s-*`, `.sit-*`, `.badge-rotar`, `.pill`, `.badge-count`), cada
una con su propio padding/radio/font-size ligeramente distinto. **Ahora**:
una sola base + modificador, definida una vez en `main.css`:

```html
<span class="badge badge--success">Activo</span>
<span class="status badge--warning">Suspendido</span>  <!-- +indicador de punto -->
```

| Modificador | Familia | Uso típico |
|-------------|---------|------------|
| `.badge--success` | verde | Activo, disponible, reutilizable libre |
| `.badge--warning` | ámbar | Suspendido, rotar contraseña, en reparación, entrega abierta |
| `.badge--danger` | rojo | Perdido/robado, sin devolver |
| `.badge--info` | azul | Asignado, "vio contraseña" |
| `.badge--purple` | morado | Ubicaciones, rol JEFE |
| `.badge--sky` | celeste | Tipo de cuenta (compartida/reutilizable en la ficha) |
| `.badge--teal` | teal | (disponible, sin uso activo aún) |
| `.badge--neutral` | gris | Inactivo, de baja |
| `.badge--accent` | identidad | Contadores (`badge-count`), "copió contraseña" |

`.status` es `.badge` + un indicador de punto (`::before`) para estados
"vivos" de una entidad (Activo/Inactivo/Suspendido); se combina con el
modificador de color: `class="status badge--success"`.

**Clases antiguas**: `.s-activo`, `.s-inactivo`, `.s-suspendido`,
`.sit-disponible`, `.sit-asignado`, `.sit-ubicacion`, `.sit-reparacion`,
`.sit-baja`, `.sit-perdido`, `.badge-rotar`, `.pill` siguen definidas en
`main.css` como **alias** (agrupadas en el mismo selector que su
modificador) — si algo externo las referencia, no se rompe. Ningún
template activo las usa ya.

**Ajustes locales permitidos**: cuando un badge necesita un detalle que no
es color/estructura (ej. `margin-left` para separarlo de texto vecino,
`text-transform: uppercase` para el chip de rol), se agrega como clase
adicional con solo esa propiedad — nunca redeclarando display/padding/
radius/font-size. Ejemplos: `.badge-inline` (cuentas), `.badge-rol`
(staff, solo `text-transform`+`letter-spacing`), `.badge-sin-devolver`
(equipos, solo `margin-left`+`font-weight`).

> Nota de diseño: al consolidar se **quitaron los `border: 1px solid`**
> que tenían `.badge-rotar` y `.badge-sin-devolver` — coherente con el
> principio minimalista (sidebar) de no usar bordes para estados, solo
> fondos tenues.

---

## Componentes de dominio (jul 2026)

Cuatro patrones que no existían como componente reutilizable — vivían como
tabla genérica o texto suelto — ahora están en `main.css`:

### Timeline (historial de asignaciones)

El README llama al historial de asignaciones "el corazón del sistema"; ahora
tiene su propia UI. Reemplaza `.table-wrap` para ese bloque específico:

```html
<div class="timeline">
  <div class="timeline-item">
    <span class="timeline-dot timeline-dot--active"></span>  <!-- fecha_fin NULL -->
    <div class="timeline-content">
      <div class="timeline-title">Juan Pérez <span class="badge badge--success badge-inline">Activa</span></div>
      <div class="timeline-meta">Desde 02/07/2026</div>
    </div>
  </div>
</div>
```

En uso: modal "Historial" de una cuenta (`CuentasPanel.vue`), reemplazando
la antigua `.historial-table`. `timeline-dot--closed` cuando hay `fecha_fin`.

### Barra de capacidad (asientos de licencia)

Reemplaza el texto suelto "2/3": comunica cercanía al tope **antes** de que
el trigger `check_tope_licencia` bloquee la asignación.

```html
<div class="capacity">
  <div class="capacity-bar"><div class="capacity-fill capacity-fill--warning" style="width: 80%"></div></div>
  <span class="capacity-label">4/5 asientos</span>
</div>
```

Umbrales: `--ok` <70% ocupado, `--warning` 70-99%, `--full` =100%. En uso en
`LicenciasView.vue` (tabla y modal "Asignar asiento").

### Badge doble (`.badge-group`)

> **Patrón candidato en Materen Core** — visto una sola vez en este repo; no
> generalizar hasta que un segundo módulo lo necesite. Ver
> [Patrones de componente → candidatos](MATEREN-CORE.md#patrones-de-componente).

Para entidades con **dos estados simultáneos e independientes** — un equipo
tiene estado físico (operativo/en_reparación/de_baja/perdido) y situación
derivada (Disponible/Asignado/En ubicación) a la vez:

```html
<span class="badge-group" title="Operativo · Asignado">
  <span class="badge badge--success badge-fisico">Operativo</span>
  <span class="badge badge--info">Asignado</span>
</span>
```

Solo se duplican los badges cuando ambos datos aportan información (equipo
operativo + en uso/ubicado); si no está operativo, el estado físico solo ya
lo dice todo. Columna `.th-situacion` con `min-width: 168px`; en pantallas
≤900px el badge físico (`.badge-fisico`) se oculta y queda accesible en el
`title` del grupo — se prioriza el estado derivado.

### Confirmación destructiva

```html
<div class="modal-bg confirm-dialog--destructive">
  <div class="modal">
    <div class="modal-title">
      <span style="display:flex;align-items:center;gap:10px">
        <span class="modal-icon"><i class="ti ti-user-off"></i></span>
        Dar de baja a Juan Pérez
      </span>
    </div>
    ...
  </div>
</div>
```

Borde superior rojo (`border-top: 3px solid`) + ícono circular de alerta.
**Decisión de producto (jul 2026)**: sin paso extra de fricción — no se pide
escribir el nombre ni marcar un checkbox; el detalle de "qué va a pasar"
vive en el cuerpo del modal (ver `BajaEmpleadoModal.vue`, que ya lo hace
mostrando el resumen de accesos antes de confirmar). No aplica a "revelar
contraseña" (es de lectura, ya auditada en Actividad) ni se implementó aún
para "cerrar asignación reutilizable" (usa `confirm()` nativo del navegador,
que no admite estilos — requeriría un modal propio; pendiente).

### Errores de formulario/acción (`.form-error`)

Antes duplicado idéntico en 10 módulos; ahora global. Distinto del toast:
**persiste** hasta que el usuario actúa, para mensajes que hay que leer
completos — típicamente rechazos de trigger de BD (tope de asientos, doble
titular activo, equipo no operativo). En uso en los modales "Asignar" de
Licencias y Equipos, además de los formularios de creación/edición.

```html
<p v-if="error" class="form-error" role="alert">{{ error }}</p>
```

`.form-grid .form-error` obtiene automáticamente `grid-column: 1 / -1`.

## Animaciones y micro-interacciones

- Transiciones hover: **0.12–0.2s** en botones, tarjetas, bordes
- Stat cards: `translateY(-1px)` + sombra al hover
- Modales: `fadeIn` 0.2s + `slideUp` 0.25s
- Sidebar móvil: slide con `transform` 0.25s

---

## Cómo modificar la identidad visual

1. **Cambiar marca:** editar `--color-accent*` en `:root` y `[data-theme="dark"]` en [`main.css`](../frontend/src/styles/main.css)
2. **Cambiar tipografía:** actualizar `--font-sans`/`--font-mono` y el `<link>` en [`index.html`](../frontend/index.html)
3. **Nuevo componente visual:** preferir añadir clase global en `main.css` antes que estilos inline o duplicados por vista
4. **Nuevo estado/badge de dominio:** clase scoped en la vista usando `var(--color-*-bg)` y `var(--color-*-text)` existentes

---

## Resumen

Panel con **CSS custom + variables CSS**, paleta **Cyprus/Sand vigente en
producción** (en migración hacia Navy + Turquesa/Índigo de
[Materen Core](MATEREN-CORE.md#identidad-de-marca)), tipografía nativa del SO,
iconos **Tabler**, **tema claro/oscuro** con sidebar minimalista que se funde
con el fondo (sin bordes; hover/activo de tinte muy tenue), y **clases
utilitarias globales** consumidas directamente por las vistas Vue — sin design
tokens JSON ni framework CSS externo.

### Principios de diseño (definidos por el JEFE)

- **Minimalista**: no sobresaturar la vista ni agobiar con información.
- Estados hover/activo **sin bordes** — solo fondos muy tenues.
- Preferir fusión de superficies sobre paneles/bloques delimitados.
- **Un solo acento visible por vista**
  ([Fundaciones → Interacción](MATEREN-CORE.md#fundaciones)). El botón `.btn-primary`
  del header/toolbar de cada módulo (ej. "Nueva licencia") es el acento fijo
  de esa vista. **Corrección (jul 2026)**: en 7 vistas (Empleados, Correos,
  Empresas, Plataformas, Licencias, Equipos, Cuentas) el estado vacío
  mostraba un **segundo** `.btn-primary` idéntico ("Agregar X") al mismo
  tiempo que el del header — dos acentos simultáneos para la misma acción.
  Se demotó el CTA del estado vacío a `.btn` (secundario); el header sigue
  siendo el único lugar con el acento primario para "crear".
  **Excepción declarada**: el botón "Guardar"/"Confirmar" dentro de un
  modal SÍ puede ser `.btn-primary` aunque el header de la página detrás
  también lo sea — el modal es la superficie de foco activa, el fondo queda
  inerte tras el backdrop. No se considera doble acento.
