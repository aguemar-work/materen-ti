# Notas del sistema de diseño anterior (Carbon v11) — antes del reinicio

> **Qué es este documento.** El 2026-09-05 se decidió eliminar por completo
> el sistema de estilos vigente (IBM Carbon Design System v11, adoptado el
> 2026-09-02) para partir de una base visual en cero. Antes de borrar el CSS
> y los documentos de gobernanza que lo describían
> (`docs/GOBERNANZA-DISENO.md`, `docs/PLAN-MAESTRO-MATEREN.md`,
> `docs/GUIA-UX-UI.md`), este archivo rescata lo que puede servir para
> cualquier sistema que lo reemplace. No es un resumen completo de esos
> documentos — es lo que vale la pena no tener que redescubrir.
>
> Los tres documentos originales siguen disponibles en el historial de git
> aunque se borren del árbol (`git log --all --full-history -- docs/GOBERNANZA-DISENO.md`,
> etc.), por si hace falta el detalle completo de una decisión puntual.

---

## 1. Identidad de marca (decisiones de producto, no de CSS)

Estas decisiones no dependen del sistema visual que las implemente — son
sobre qué es MATEREN, no sobre cómo se ve:

- **Nombre del producto: MATEREN.** Se evaluó y se decidió conservar
  (2026-09-01) porque es neutral respecto del dominio (el producto crece
  hacia RRHH/Finanzas/Operaciones) y tiene reconocimiento externo real
  (portal público `/soporte`, actas de entrega que la gente firma). Vive en
  `frontend/src/core/marca.js`.
- **Descriptor "Sistema TI": tiene fecha de vencimiento, pero no llegó.**
  Contradice la decisión de alcance (un producto de RRHH/Finanzas no puede
  llamarse "Sistema TI"). **Disparador de retiro: el primer módulo no-TI real
  que entre al sistema.** Ese día el cambio es una línea en `marca.js` + el
  `<title>`, no una cacería por el repositorio — ya está preparado así.
- **Azul `#0064E0`**: fue la dirección de identidad confirmada como final el
  2026-09-01 ("no es una pasada más, no se evalúan otras direcciones"). Se
  registra aquí como dato histórico, **no como obligación para el próximo
  sistema** — el reinicio del 2026-09-05 reabre esa pregunta a propósito.
- **Sidebar con agrupación por nivel de Áreas** (`AppNav.vue`, constante
  `AREAS`): se evaluó cambiar a top-nav y se descartó — con 11 ítems de nivel
  superior filtrados por permisos individuales, un top-nav obligaría a un
  menú "más" que esconde justo lo que distingue a un usuario de otro. Esto es
  arquitectura de información, no estilo visual, y no se tocó en este
  reinicio.
- **Taxonomía de los grupos del sidebar** ("Activos y credenciales",
  "Conocimiento y mejora") sigue en vocabulario de TI a propósito — se
  difiere rediseñarla hasta que exista un módulo no-TI real contra el cual
  diseñar, mismo disparador que el del nombre.

## 2. Principios de diseño puestos por el JEFE (prosa humana, no del código)

`docs/GUIA-UX-UI.md` cerraba con una sección de principios de producto,
puestos por una persona (no derivables leyendo CSS ni componentes). Son gusto
y criterio, no implementación de Carbon — por eso se rescatan textuales:

- **Minimalista**: no sobresaturar la vista ni agobiar con información.
- Estados hover/activo **sin bordes** — solo fondos muy tenues.
- Preferir fusión de superficies sobre paneles/bloques delimitados.
- **Ningún acento estructural supera 2px.** Para marcar severidad o
  selección en una fila o tarjeta se acepta un borde **izquierdo** de acento
  de hasta 2px, además del color de ícono + badge. Más de 2px, o un borde de
  acento en cualquier otro costado (derecho, superior, inferior), no. Un
  borde que delimita una superficie completa (contorno de una tarjeta) es
  otra cosa y no cuenta acá.
- **Un solo acento visible por vista** — la acción principal del
  header/toolbar de cada módulo es el único acento fuerte de esa pantalla.
  Excepción: el botón de confirmar dentro de un modal puede tener el mismo
  peso, porque el modal es la superficie de foco activa y el fondo queda
  inerte tras el backdrop.
- **Peso visual proporcional al significado**: 5 escalones de discreto a
  protagonista —
  1. sin fondo ni borde (acción de baja jerarquía),
  2. solo borde (contenedor o control, nunca con color de estado),
  3. fondo tenue sin borde (estado/categoría pasiva, no clickeable),
  4. fondo tenue + borde (reservado: fila seleccionada o alerta intermedia),
  5. fondo sólido (una sola superficie por vista: la acción principal).
  Ante la duda entre dos escalones, ir siempre por el más bajo — subir de
  peso después es más fácil que bajarlo una vez que el ojo se acostumbró.

## 3. Reglas de accesibilidad que siguen vigentes (son de comportamiento, no de CSS)

Estas no dependen de qué CSS tenga el sistema — están verificadas por los 40
tests de render de `frontend/tests/componentes/`, que **no se tocaron** en
este reinicio y deberían seguir en verde con cualquier sistema visual futuro:

- **Todo diálogo modal pasa por `components/shared/Modal.vue`**, nunca a
  mano: centraliza `role="dialog"`, `aria-modal`, foco atrapado dentro del
  modal y cierre con Escape (con guard `confirmarCierre` cuando hay datos sin
  guardar). Lo usan 26 vistas.
- **Toda imagen lleva `alt`.**
- **Todo botón solo-ícono tiene nombre accesible** (`aria-label` o
  equivalente).
- **Toda cabecera de columna de tabla tiene texto visible** (no solo ícono).

## 4. La lección de fondo (para el próximo sistema, sea cual sea)

`docs/PLAN-MAESTRO-MATEREN.md` diagnosticó, con evidencia repetida en 15
ciclos de auditoría, que el problema de MATEREN nunca fue *cómo se ve* sino
que **sus reglas de diseño vivían narradas en prosa** y se degradaban solas:
la guía llegó a documentar tokens borrados el mismo día, describir un color
que ya no era el real, y contradecirse a sí misma en dos secciones con el
mismo título.

Si el próximo sistema de diseño quiere evitar el mismo destino, la lección
concreta es: **lo que pueda verificarse con un script, no dejarlo solo en un
documento.** El sistema anterior tenía 5 scripts de guardrail que hacían
justamente eso — quedan en disco, sin invocarse desde CI, por si el próximo
sistema quiere el mismo mecanismo:

| Script | Qué verificaba |
|---|---|
| `scripts/contraste.mjs` | Contraste WCAG de pares de color |
| `scripts/tokens-vs-guia.mjs` | Que el nombre de un token fuera coherente entre CSS, uso real y la guía escrita |
| `scripts/literales-vs-tokens.mjs` | Valores de color/radio/sombra/tipografía/espaciado escritos a mano en vez de vía token |
| `scripts/patrones-ui.mjs` | Estructura del marcado (modal a mano, `alt` faltante, botón sin nombre accesible) |
| `scripts/clases-muertas.mjs` | Clases CSS aplicadas sin definición, e inventario de clases definidas sin uso |

No se borraron: si el próximo sistema define sus propios tokens/CSS, estos
scripts son un punto de partida para volver a tener ese tipo de garantía en
CI, en vez de tener que reinventarlos.

## 5. Qué se borró y de dónde recuperar el detalle

**Fase 1 (2026-09-05):** se vació `main.css` y `carbon-theme.css`, se
quitaron los `<style>` de cada componente `.vue` (82 archivos), y se
quitaron de `index.html` los `<link>` de IBM Plex Sans/Mono y el webfont de
Tabler Icons.

**Fase 2 (2026-09-05):** se borraron del árbol `docs/GOBERNANZA-DISENO.md`,
`docs/PLAN-MAESTRO-MATEREN.md` y `docs/GUIA-UX-UI.md` — este documento es
ahora la única fuente escrita de lo que queda vigente de esa etapa. Para el
detalle completo de cualquier decisión anterior a esa fecha, buscar en el
historial de git (`git log --all --full-history -- docs/GUIA-UX-UI.md`, por
ejemplo).

**Fase 3 (2026-09-05):** se borró por completo `components/carbon/` (9
componentes) — ya no existe ninguna librería de componentes de diseño en el
árbol. La lógica real que tenían 4 de los 9 se rescató en archivos de lógica
pura, sin ningún componente ni marca de sistema de diseño encima:

| Lógica | Dónde vive ahora |
|---|---|
| Revelado auditado de contraseñas (temporizador, distingue "ver"/"copiar") | `composables/useRevelado.js` |
| Matemática de paginación (rango, clamp de página, total de páginas) | `core/paginacionRender.js` |
| Colspan/agrupación de columnas para tabla + tarjeta móvil | `core/tablaColumnas.js` |
| Id estable + `aria-describedby` de un campo de formulario | `composables/useCampoAccesible.js` |
| Normalización de rol de tag/badge | `core/tagRol.js` |
| Mapeo tipo→ícono/rol de una notificación | `core/notificacionInfo.js` |

Cada vista pinta ahora su propio HTML nativo (`<table>`, `<button>`,
`<span>`, `<input>`) usando estos helpers — no queda ningún componente que
imponga estructura o clase de "sistema de diseño". El test dedicado a la
librería (`frontend/tests/componentes/carbon.render.test.js`) se borró junto
con ella; los otros tests de render (Modal, estados, error de red) no la
mencionaban y siguen intactos.

**Sigue sin tocarse** (queda para una fase posterior, es decisión de
producto, no mecánica): las dos vistas de muestra del sistema anterior
(`modules/designSystem/`, `modules/styleLab/`) — ya no tienen ningún
componente Carbon que mostrar, pero siguen existiendo como páginas y rutas
(la primera es una ruta solo-dev sin enlace en el nav; la segunda ni
siquiera tiene ruta registrada).
