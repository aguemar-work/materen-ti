# Propuesta UX/UI — Design System "Materen — Sistema TI"

**Alcance**: revisión de todo el sistema (46 componentes reusables + 3 pantallas de
`design.pen`), no de un componente aislado. **Ejercicio de diseño puro**: cero cambios en
`frontend/` (ningún `.vue`/`.js`/`.css` de producción). Los únicos artefactos tocados son
`design.pen` y este documento.

**Método**: heurísticas de Nielsen (visibilidad del estado del sistema, coincidencia con el
mundo real, consistencia, diseño minimalista), Ley de Fitts (área de objetivos), Ley de Hick
(carga de decisión cuando hay demasiadas opciones), jerarquía visual/ritmo, y el criterio de
separación **Foundations → Components → Patterns** que usan Material, Carbon y Polaris (no se
mezclan átomos con composiciones de página en el mismo nivel de la librería).

**Evidencia usada**: la página real `/design-system` (captura completa, logueado, en
producción — lee `main.css` en vivo) como "la vista más honesta de hoy"; el tablero interno
`Librería de componentes` de `design.pen` (1720×8682px originales, 9 secciones) como fuente de
verdad editable; y una lectura completa de `docs/GUIA-UX-UI.md` y `docs/HISTORIAL-AUDITORIAS.md`
para no reportar como "nuevo" nada que ya estuviera diagnosticado.

**Regla de no-duplicación aplicada**: cada hallazgo de abajo indica explícitamente si es nuevo,
si es evidencia adicional para una decisión ya pendiente, o si ya está resuelto — citando la
ficha/línea exacta cuando corresponde. No se repite DS-01 a DS-05, U-01/U-02 ni la "propuesta de
paleta en notación de puntos" como si fueran hallazgos de esta pasada; se los usa como contexto.

---

## Resumen — qué se implementó directamente en `design.pen`

7 cambios (dentro del rango de 5-8 pedido), todos verificados con captura antes/después dentro
de esta misma sesión de trabajo en el archivo:

| # | Cambio | Tipo | Nodo(s) en `design.pen` |
|---|---|---|---|
| 1 | `radius-md` 8→10px + `radius-xl` (faltaba, 20px) | Quick win | variables globales |
| 2 | `Badge estado`: padding vertical 4px→2px (igual que `Badge`) | Quick win | `tF9cB` |
| 3 | Eliminada la "Propuesta de reestructuración del sidebar" (ya shippeada) | Quick win | `y5b6y` (borrado) |
| 4 | `Fila skeleton`: redimensionada y recompuesta 1:1 contra `Fila de tabla` | Quick win | `gASO2`→`lC4hO` |
| 5 | `Barra lateral` movida a su propia fila (fuera de la fila de átomos) | Estructural | `e9FJmb` |
| 6 | Anotada la decisión tácita de la paleta categórica (indigo=ex-teal, slate=ex-neutral) + huérfanos reales | Estructural | `nH538.context` |
| 7 | Anotada la regla "un solo acento" vs. el choque real WhatsApp/primario | Estructural | `hrkaS.context` |

---

## Eje 1 — Jerarquía visual y ritmo

### ✅ Positivo (confirmado, no requiere acción)
El espaciado entre las 8 secciones principales de `Librería de componentes` (Portada, Tokens,
Primitivas, Formularios, Datos y tablas, Contenedores, Superposiciones, Navegación y marca,
Fundación de escalamiento) es **exactamente 48px en las 8 transiciones**, medido con `Get`/
`ctx.bounds`, no estimado. Es el token `$space-12`. Cumple "Consistency and standards" de
Nielsen con margen — vale la pena decirlo, porque una auditoría que solo lista problemas pierde
crédito frente a alguien que también puede confirmar qué SÍ funciona.

### 🔧 Estructural — implementado — "Barra lateral" mezclada con átomos
**Hallazgo**: dentro de la sección "Navegación y marca", una fila horizontal agrupaba 4 "cards"
de documentación: `Barra lateral` (240×**891px**, el mockup completo del sidebar armado) junto a
`Ítem de navegación` (332px), `Marca` (309px) y `Símbolo y campana` (**67px**). Diferencia de
**13× entre el más alto y el más corto** en la misma fila.

**Por qué importa**: Material ("Foundations/Components/Patterns"), Carbon
("Components/Patterns") y Polaris usan el mismo principio — un átomo (ícono, badge) y una
plantilla de página completa (un sidebar armado) no son pares comparables y no deben
presentarse como si lo fueran. Mezclarlos rompe el escaneo visual de la sección (el ojo no
puede comparar 4 cards a simple vista si uno es 13× más alto) y es, en sí mismo, la clase de
detalle que hace que un sistema se sienta "colección suelta" en vez de "sistema" (eje 4).

**Antes / después** (medido, no aproximado):
```
ANTES — 1 sola fila, escala incomparable:
┌────────────┬───────────┬──────────┬────────┐
│            │ Ítem nav  │  Marca   │Símbolo │
│  Barra     │  332px    │  309px   │ 67px   │
│  lateral   ├───────────┴──────────┴────────┘
│  891px     │  (aire vacío bajo los 3 cards cortos)
│            │
└────────────┘

DESPUÉS — 3 cards de escala comparable en su fila; Barra lateral en la suya:
┌───────────┬──────────┬────────┐
│ Ítem nav  │  Marca   │Símbolo │   332 / 309 / 67px
│  332px    │  309px   │ 67px   │
└───────────┴──────────┴────────┘
┌────────────────────────────────┐
│         Barra lateral          │   891px — es un patrón/plantilla,
│         (240×891)              │   no un átomo; va en su propia fila
└────────────────────────────────┘
```

**Implementado**: `Move("e9FJmb", "oNXu7")` — se sacó la card de la fila horizontal (`FQpRm`,
que por `layout` es un flex horizontal con `gap:32`) y se reubicó como hermano directo de
`oNXu7` (flex vertical, `gap:22`). Ambos contenedores son flex reales, así que todo el reflow
(la fila se achica a 332px, el sidebar cae a su propia fila, la sección crece de 1073→1427px, y
el resto del tablero se desplaza automáticamente respetando el gap de 48px) ocurrió sin tocar
una sola coordenada `x`/`y` a mano. Verificado con `Get`/bounds y con captura — sin overlap, sin
huecos raros.

### 🔧 Estructural — documentado, NO implementado — escala tipográfica poco diferenciada
`$fs-xs`(11) · `$fs-sm`(12) · `$fs-base`(13) · `$fs-md`(14) · `$fs-lg`(15) usan **5 pasos en un
rango de 4px**, con incrementos de 1px — perceptualmente casi indistinguibles entre pasos
adyacentes a este tamaño, sobre todo con render fraccional. Después de `$fs-lg`(15) salta a
`$fs-xl`(17, +2) → `$fs-2xl`(20, +3) → `$fs-stat`(26, +6): la razón entre pasos no es constante
(no es una escala modular tipo Material/Radix, que crecen por ratio, no por delta absoluto). Es
un hallazgo real de jerarquía (eje 1), pero **no lo toqué**: es un token consumido por los 46
componentes, así que cambiar cualquier valor se propaga a todo el sistema — exactamente la
"reforma completa" que el encargo pidió evitar mezclar con esta pasada puntual. Ver "Qué NO se
tocó y por qué".

---

## Eje 2 — Densidad de información: ¿la página, o el sistema de tokens?

**Respuesta a la pregunta del brief**: es un síntoma del sistema de tokens, no (solo) de la
página. La sección "Tokens" del propio tablero `Librería de componentes` (no la página
codeada) pesa 1458 de 8682px originales — **~17%**, muy por debajo del ~33% que estimó la
auditoría anterior sobre `DesignSystemView.vue`. Es decir: la página codeada es más pesada de
lo que su propia fuente de diseño necesita ser — pero dentro de `design.pen`, la sección Tokens
ya es la más pesada de las 9 igual, y la razón es real:

### 🔧 Estructural — implementado — decisión de paleta categórica, tácita e indocumentada
Indagando el mapa de uso real (la fila de badges bajo la fila de swatches en "Categóricas de
dominio"), encontré algo que **no está en `GUIA-UX-UI.md`**: la propuesta de paleta en notación
de puntos ya decidió que `categoric.indigo` **reemplaza** a la familia `teal` de producción
(el badge dice literalmente `indigo (ex-teal)`) y `categoric.slate` reemplaza a `neutral`
categórico (`slate (ex-neutral)`). `purple` y `sky` se mantienen igual que en producción
(Ubicaciones / Tipos de cuenta). Esta decisión solo existe como dos etiquetas de dos palabras
dentro del propio archivo — nadie que lea `GUIA-UX-UI.md` (que documenta la propuesta en
líneas 220-289) se entera de que ya se resolvió el reemplazo de `teal`.

Eso deja **3 huérfanos reales, sin ningún mapeo de uso en ningún lugar**: `categoric.amber`,
`categoric.terracotta`, `categoric.rose`. Son distintos de `categoric.blue`, que **ya está**
señalado en `GUIA-UX-UI.md` (línea ~281-282) como redundante con `info.solid` — no lo dupliqué
como hallazgo nuevo.

**Por qué importa (Ley de Hick)**: cada color categórico sin consumidor real es una opción más
que alguien tiene que descartar mentalmente al elegir qué usar para una categoría nueva. 8
familias categóricas cuando 4 tienen destino real casi duplica la carga de decisión sin
necesidad.

**Implementado**: `context` en el frame `nH538` ("Categóricas de dominio") documentando
exactamente esto — la decisión indigo/slate, y que amber/terracotta/rose son los candidatos
reales a retiro (a diferencia de `categoric.blue`, ya señalado aparte). Es una anotación, no un
borrado: retirar tokens es una decisión de producto que ya está marcada como pendiente en
`GUIA-UX-UI.md` para toda la migración de la paleta de puntos — esto la deja con información
completa en vez de a medias.

### Evidencia nueva para una decisión ya pendiente (no se implementó — vive en `main.css`)
La captura de la página real `/design-system` (que lee `main.css` en producción, no
`design.pen`) muestra **12 variantes de Marca/Acento** casi una junto a otra: `brand`,
`brand-elevated`, `brand-ink`, `accent-alt`, `accent`, `accent-hover`, `accent-soft`,
`accent-subtle`, `accent-subtle-bg`, `accent-subtle-text`, `accent-text`, `accent-2`. A simple
vista, `accent-subtle` y `accent-subtle-bg` se ven como el mismo verde menta pálido; `accent`
y `accent-2` también son casi indistinguibles. Esto **no es un hallazgo nuevo** — es evidencia
concreta y visual para la migración de la paleta de puntos que `GUIA-UX-UI.md` ya tiene como
pendiente (líneas 11, 35-36, 495-496: "sigue sin portar a `main.css`"); la sumo como argumento a
favor de priorizarla, no la implemento (toca `main.css`, fuera de alcance de este pase).

---

## Eje 3 — Consistencia de patrones de interacción (hover, carga, error, vacío)

### 🔧 Quick win — implementado — el skeleton de carga no coincide con el contenido real
**Hallazgo**: `Fila skeleton` (el placeholder de carga de una fila de tabla) medía 520×37px, 4
columnas planas de 130px sin ningún círculo de avatar. `Fila de tabla` (el contenido real que
reemplaza) mide 800×73px, **5** columnas de 160px, con un avatar circular en la primera y dos
botones de ícono de 49×49 en la última (son ellos los que empujan la fila real a 73px).

**Por qué importa**: un skeleton loader existe para UNA cosa — que el contenido no "salte" al
llegar. Si el placeholder mide 37px y el contenido real mide 73px, el layout se corre ~2× al
cargar. Viola directamente "Visibility of system status" de Nielsen (el sistema promete una
forma y entrega otra) y es exactamente el tipo de detalle que separa un SaaS pagado de un MVP:
Material, Carbon y Ant Design dimensionan sus skeletons 1:1 contra el contenido real por esta
razón, no por estética.

```
ANTES (520×37, 4 columnas, sin avatar)
┌────────┬────────┬────────┬────────┐
│▬▬▬▬▬▬▬▬│▬▬▬▬▬   │▬▬▬▬▬▬  │▬▬▬     │  37px   ← salta a 73px al cargar
└────────┴────────┴────────┴────────┘
   130      130      130      130

DESPUÉS (800×73, 5 columnas, avatar + pill + 2 botones — igual que el real)
┌────────┬────────┬────────┬────────┬────────┐
│●▬▬▬▬▬▬ │▬▬▬▬▬   │▬▬▬▬▬▬  │ (▬▬▬)  │  ○○    │  73px  ← mismo alto que el real
└────────┴────────┴────────┴────────┴────────┘
   160      160      160      160      160
```

**Implementado**: `Replace` completo de `gASO2` → nuevo nodo `lC4hO`, 800×73px, 5 celdas
`fill_container` (160px c/u): celda 1 con círculo `$radius-pill` 32×32 + barra 90×13 (mismo
`gap:$space-4` que la celda real); celdas 2-3 con una barra sola (70×13 y 100×13); celda 4 con
una barra en forma de píldora 58×17 (anticipa que ahí va un badge); celda 5 con 2 círculos
24×24 alineados a la derecha (anticipa los 2 botones de ícono). Verificado: no había ninguna
instancia (`ref`) apuntando al id viejo `gASO2` en todo el documento, así que el cambio de id no
rompió nada.

### 🔧 Quick win — implementado — `Badge estado` no comparte baseline con `Badge`
**Hallazgo**: `Badge` (plano) usa `padding: [$space-1, $space-5]` → 17px de alto. `Badge
estado` (con punto de color) usaba `padding: [$space-2, $space-5]` → **21px**. La única
diferencia real de contenido es un punto de 6×6 — no justifica 4px extra de padding vertical.
Si ambos aparecieran en la misma fila o columna de una tabla (perfectamente posible: distintas
columnas "Tipo" y "Estado" en la misma fila), no comparten línea base.

```
Badge (plano)         Badge estado (ANTES)      Badge estado (DESPUÉS)
┌──────────┐ 17px      ┌───────────┐ 21px         ┌───────────┐ 17px
│  Neutral │            │ • Activo  │               │ • Activo  │
└──────────┘            └───────────┘               └───────────┘
padding-v: 2px          padding-v: 4px ← distinto   padding-v: 2px ← igual
```

**Implementado**: `Update("tF9cB", { padding: ["$space-1","$space-5"] })` — mismo padding
vertical que `Badge`. Resultado medido: 66×**17px**, exactamente igual altura que `Badge`. El
punto de 6px sigue con espacio de sobra dentro de esos 17px.

### Ya diagnosticado — no se repite
Foco visible inconsistente entre `Ítem de combo`/`Ítem de menú`/`Ítem de navegación` (DS-04) —
confirmado que ya está diagnosticado con el detalle exacto de qué se corrigió solo en
`design.pen` (quinta pasada) contra qué sigue sin `:focus-visible` real en código. Estados de
error/campo (DS-03) y de `:disabled` (DS-02) también ya diagnosticados. No encontré, dentro del
tiempo de esta revisión, ninguna inconsistencia nueva de hover/carga/error más allá de las dos
de arriba — lo digo explícitamente para que quede claro que es un resultado de la búsqueda, no
un hueco de la auditoría.

---

## Eje 4 — ¿Producto profesional o colección de componentes sueltos?

### 🔧 Quick win — implementado — token del propio sistema no coincidía con su documentación
`design.pen` define `$radius-md = 8px`. `GUIA-UX-UI.md` documenta la escala real de producción
como `sm 6 · md 10 · lg 14 · xl 20 · pill 999`. El archivo de diseño no era fiel a su propia
fuente de verdad — cualquier componente construido en `design.pen` usando `$radius-md` tenía un
radio silenciosamente distinto (8 vs 10) del que va a producción. Además, `$radius-xl` (20px)
**no existía en absoluto** como variable, pese a estar documentado. Un sistema que no puede
citarse a sí mismo correctamente es exactamente la señal de "hecho a las apuradas" que un
Principal Designer de Stripe/Linear/Notion nunca dejaría pasar.

**Implementado**: `SetVariables({ 'radius-md': 10, 'radius-xl': 20 })`. Verificado con
captura de un contenedor real (`Contenedores/Tarjeta`) — el cambio de 8→10px es sutil pero
correcto, sin overflow ni ruptura visual.

### 🔧 Estructural — implementado — el propio brief acertó: WhatsApp-verde vs. marca-verde
El brief preguntaba si esto era un problema real o solo una posibilidad hipotética. **Es
real, verificado en código**: `frontend/src/modules/cuentas/CuentasPanel.vue:225-231` renderiza
`.btn.btn-whatsapp` ("Enviar por WhatsApp") **al lado de** `.btn.btn-primary` ("Agregar
cuenta"), ambos botones sólidos, ambos verdes, en el mismo `.panel-actions`. Esto viola
literalmente la regla que el propio sistema ya tiene escrita ("un solo acento visible por
vista", `GUIA-UX-UI.md`) — dos verdes sólidos compitiendo diluyen la señal de "este es el botón
importante" (Nielsen: "Aesthetic and minimalist design"; también reduce lo que el color
"verde = acción principal" comunica en el resto del sistema).

Hallazgo adicional en el mismo lugar: el color de `.btn-whatsapp` está **hardcodeado**
(`#25d366`/`#1ebe5d`) en el `<style>` scoped de `CuentasPanel.vue` en vez de usar
`var(--mat-color-whatsapp)`, que ya existe en `main.css` — dos fuentes de verdad para el mismo
color, riesgo de que diverjan con el tiempo.

**No puedo corregir el `.vue`** (fuera de alcance). Lo que sí implementé: un `context` en
`Primitivas/Botón` (`hrkaS`) documentando el choque real (con archivo y líneas exactas) y la
corrección propuesta — que WhatsApp pase a tratamiento secundario (`.btn`, ícono con el acento
de WhatsApp, sin relleno verde) cuando coexiste con un botón primario — para que quien tome este
documento y toque el código tenga la regla y el ejemplo real a la mano, sin tener que
redescubrirlo.

### 🔧 Quick win — implementado — documentación de una decisión ya caduca
Dentro de "Fundación de escalamiento" seguía viviendo un bloque completo (656px) titulado
"Propuesta de reestructuración del sidebar — misma ruta/path que hoy, solo cambia [...]"
comparando "Actual: 8 ítems planos en GESTIÓN" vs. "Propuesta: 3 subgrupos semánticos". **Esa
propuesta ya fue aprobada y llevada a producción hoy mismo** (`AppNav.vue`, ver
`GUIA-UX-UI.md`, changelog "Sidebar reagrupado a producción", séptima pasada). Dejarla como
"propuesta" en el archivo vivo es información caduca: cualquiera que abra `design.pen` sin
haber leído el changelog de hoy creería que la decisión sigue abierta.

**Implementado**: `Delete("y5b6y")`. La sección bajó de 2008 a 1330px; el resto del tablero
se recompuso solo (layout vertical con gap fijo), sin overlaps.

### Botón / Tabla / Formularios — ya tienen la pulidez esperada
No los vuelvo a auditar como pendientes: Fase B (2026-08-13) ya resolvió el anillo de foco por
`box-shadow` en las 5 variantes de botón y unificó `:disabled` a `opacity:.5`; Fases A-E ya
portaron una parte real de `design.pen` a producción. Es, hoy, el componente más maduro del
sistema — vale la pena decirlo con la misma claridad con la que se señalan los problemas.

---

## Eje 5 — Accesibilidad: hallazgos NUEVOS (no repito DS-01 a DS-05, foco, aria-label)

### Tensión sin resolver entre dos documentos (no implementado — decisión de producto)
`HISTORIAL-AUDITORIAS.md` (U-01) propone `--mat-color-text-tertiary: #697281` (claro) como fix
del contraste insuficiente de texto terciario (~2.54:1 hoy). La propuesta de paleta de puntos
de `design.pen` usa, para el mismo rol (`text.tertiary`), **otro valor distinto**: `#6B737E`.
Calculé el contraste de ESE valor contra el `$bg` claro de `design.pen` (`#F7F8F9`): **≈4.5:1**
— justo en el límite de AA, mejor que el 2.54:1 de producción pero sin margen. Son dos
propuestas de arreglo distintas para el mismo problema ya diagnosticado — señalo la tensión
explícitamente (como pidió el encargo) sin resolverla, porque elegir una requiere decisión de
producto y tocar `main.css`.

### Touch targets fuera de botones — revisado, sin hallazgo nuevo
Revisé `Ítem de combo` (32px de alto), `Ítem de menú` (~38px) e `Ítem de navegación` (38px) —
son listas de escritorio controladas por mouse/teclado, no objetivos táctiles móviles; están
dentro de rango aceptable para ese contexto (Material usa filas densas de 32-40px en el mismo
caso). Lo dejo registrado como "revisado" para que no parezca un hueco de la auditoría.

### Orden de tabulación entre secciones — no verificable desde `design.pen`
`design.pen` no codifica el DOM ni el orden real de tabulación entre secciones de una página
Vue montada — verificarlo requiere leer el código (`<template>` real, orden de render), que
está fuera del alcance de un ejercicio de solo-diseño. Queda en "Qué NO se tocó" como un pase
de accesibilidad aparte, sobre código, no sobre el archivo de diseño.

### Token muerto adicional (mismo patrón ya conocido, no es hallazgo independiente)
`text.on-accent-soft` no tiene ningún consumidor real en todo el documento (confirmado por
búsqueda exhaustiva de todas las referencias `fill`/`stroke`). Es el mismo patrón ya señalado en
`GUIA-UX-UI.md` para `brand-elevated`/`brand-ink`/`purple-border`/`sky-border`/`teal-border`
— lo sumo a esa lista existente, no lo cuento aparte ni lo borro (borrar variables sin usar
excede el alcance quirúrgico de esta pasada).

---

## Qué NO se tocó y por qué

| Hallazgo | Por qué no se tocó ahora |
|---|---|
| Escala tipográfica (`fs-xs`…`fs-lg` muy juntos, sin ratio consistente arriba) | Es un token consumido por los 46 componentes — cambiar cualquier valor se propaga a todo el sistema. Es "cambiar la tipografía base", el ejemplo textual que el encargo pidió no mezclar con una pasada puntual. Requiere decisión de producto + una pasada dedicada, no 1 de 7 cambios contenidos. |
| Reducir familias de color (8 categóricas → las 4 con uso real) | Ya es una decisión pendiente y explícita en `GUIA-UX-UI.md` (migración de la paleta de puntos). Lo que aporté es evidencia nueva (qué reemplaza a qué, cuáles son huérfanos reales) vía anotación — no ejecuté el retiro de tokens porque esa decisión de producto ya está marcada como abierta y no me corresponde cerrarla unilateralmente en esta pasada. |
| Los 12 tokens de Marca/Acento casi duplicados en producción | Viven en `main.css`, no en `design.pen` — fuera de alcance de un ejercicio "cero cambios en `frontend/`". Documentado como evidencia a favor de priorizar la migración de paleta ya pendiente. |
| `text.tertiary`: dos valores propuestos en competencia (U-01 vs. paleta de puntos) | Elegir uno requiere decisión de producto y tocar `main.css` para que aplique — no es una corrección de `design.pen` en solitario. |
| WhatsApp-verde vs. primario-verde (el choque en sí) | La corrección real vive en `CuentasPanel.vue` (demover el botón a variante secundaria) — fuera de alcance de "cero cambios en `frontend/`". Sí quedó documentada la regla y el ejemplo exacto en `design.pen` (`context` de `Primitivas/Botón`) para que el próximo pase de código no tenga que redescubrirlo. |
| Orden de tabulación entre secciones | No verificable desde un archivo de diseño — requiere leer el DOM/`<template>` real. Es un pase de accesibilidad sobre código, no sobre `design.pen`. |
| Token muerto `text.on-accent-soft` | Mismo patrón ya señalado para otros 6 tokens sin consumidor en `GUIA-UX-UI.md`; retirar variables sin uso es una limpieza aparte, no parte de las 5-8 mejoras puntuales de esta pasada. |

---

## Siguiente paso

Todo lo de arriba vive hoy solo en `design.pen` + este documento — nada tocó código, nada se
commiteó todavía por fuera de este cambio. Para que cualquiera de los 7 cambios llegue a
producción hace falta un pase de implementación aparte (como los que ya se hicieron con el
sidebar y el footer en esta misma sesión), revisando cada uno contra el componente Vue real
correspondiente.
