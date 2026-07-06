# Materen — Sistema de Diseño

> Fundación de diseño y producto compartida por **todos** los sistemas Materen (Sistema TI, el planificador Materen, Materen Conta, y cualquier módulo que siga). No es una capa "por debajo" de identidades distintas — es la única identidad. Cada módulo puede tener nombre propio; ninguno tiene marca propia.

**Cómo usar este archivo:**
- **Humano nuevo en un producto Materen:** leelo entero una vez, 15 minutos.
- **Agente de IA (Claude Code u otro):** este archivo se referencia desde el `CLAUDE.md`/`AGENTS.md`/`.cursor/rules` de cada módulo. No reemplaza la documentación específica del módulo (arquitectura de datos, features) — la complementa. Ver [Gobernanza de Documentación](#gobernanza).
- **Regla de precedencia:** este documento gana siempre en identidad de marca (color, logo, tipografía, tono). Un módulo puede documentar una excepción **técnica** temporal (ver [Deuda de Migración](#deuda-de-migracion)) — nunca una excepción de marca. La diferencia importa: una excepción técnica es "todavía no migramos el prefijo de variables"; una excepción de marca sería "este módulo usa otro color", y eso ya no es una categoría válida.

**Changelog** *(nota de vigencia — ver [Gobernanza de Documentación](#gobernanza), esta regla aplica también a este mismo documento)*
- **v1.2 — 2026-07-06:** Sistema TI implementa la migración de [Deuda de Migración](#deuda-de-migracion): paleta Navy/Índigo en `frontend/src/styles/main.css`, tokens `--mat-*` canónicos con alias `--color-*`, tipografía Inter + Poppins.
- **v1.1 — 2026-07-06:** incorporados cinco hallazgos reales de la guía de Sistema TI, la implementación más madura de este documento hasta ahora: (1) escala canónica de z-index — este documento tenía el principio pero ningún valor concreto; (2) excepción declarada a "un acento por vista" para botones de confirmación dentro de un modal; (3) regla explícita de "ajustes locales permitidos" en componentes (una clase adicional para un detalle no estructural, sin redeclarar la base); (4) `.badge-group` (doble estado independiente) anotado como patrón candidato, visto una sola vez — no se generaliza todavía, por la propia metodología de [Filosofía](#filosofia); (5) fila de [Deuda de Migración](#deuda-de-migracion) de Sistema TI actualizada con datos exactos (hex, hues, script de verificación) en vez de la descripción genérica anterior. Además, **se corrige la fragilidad de citación** que esta misma actualización expuso: la guía de Sistema TI cita "Materen Core §2" y "§6" con la numeración de la v0.5, ya desactualizada tras la fusión de v1.0 — todas las referencias internas de este documento pasan de números a anclas estables (`[Fundaciones](#fundaciones)`, no "§4"), y [Gobernanza de Documentación](#gobernanza) ahora exige lo mismo a cualquier producto que cite este archivo.
- **v1.0 — 2026-07-06:** corrección de fondo en la filosofía de marca ([Filosofía](#filosofia)). La v0.5 de este documento (entonces `Materen Core`) describía un modelo de **federación** — "un color de marca, una identidad por sistema" — tratando a Sistema TI y a Nexora (nombre de trabajo anterior del planificador Materen) como productos hermanos con paletas propias. Ese modelo queda descartado: Materen es una sola marca — casa de marca, no federación — y todo sistema que se construya bajo ese nombre hereda su identidad visual completa, sin excepción. Con esto: (1) se retira la "fórmula de color por producto" de [Identidad de Marca](#identidad-de-marca) y se reemplaza por los valores fijos de marca (Navy + Turquesa, ya definidos y documentados en el Manual de Identidad Visual); (2) las excepciones que la v0.5 declaraba como "permanentes" (radios de 5 pasos y techo tipográfico de 28px de Nexora, prefijo `--color-*` de Sistema TI) pasan a [Deuda de Migración](#deuda-de-migracion), con dueño y fecha, en vez de quedar como excepciones de diseño aceptadas para siempre; (3) se fusiona el documento de arquitectura de producto (valores de marca, arquitectura de información, stack técnico) que vivía aparte — ya no tiene sentido mantenerlos separados cuando ambos gobiernan la misma marca única.
- **v0.5 — 2026-07-06:** cambio de método explícito en [Filosofía](#filosofia) (dos caminos válidos a canónico). Cerrados escala de radios, techo tipográfico y prefijo de variables CSS. Resueltos vía estándar externo breakpoints, select/checkbox/radio/textarea, y tokens de iconografía.
- **v0.4 y anteriores:** ver historial — fundaciones, fórmula de color semántico, primeros patrones de componente, gobernanza de documentación.

---

<a id="filosofia"></a>

## 1. Filosofía

**Una marca, un sistema de color, aplicado a todo lo que Materen construya.** No existe "el color de Sistema TI" ni "el color de Materen Conta" — existe el color de Materen, y cada módulo lo hereda. Lo único que distingue a un módulo de otro es su nombre funcional (Materen Conta, Materen TI, Materen Agenda) y, cuando corresponde, un ícono propio dentro del set de iconografía ya definido ([Patrones de Componente](#patrones-de-componente)) — nunca una paleta, una tipografía o un logo distintos.

Esto es deliberado y tiene un precedente real: Google no le da a Gmail, Drive y Calendar sistemas de color independientes — los tres corren sobre Material Design y la paleta base de Google; lo que cambia entre ellos es el ícono de la app, no el lenguaje visual completo. Materen sigue ese mismo modelo, no el modelo opuesto (una identidad nueva por producto, como haría un holding con marcas independientes).

**Lo que es una sola cosa en todo Materen, sin excepción:**
- El logo, la paleta de marca y la tipografía ([Marca: valores y la tensión](#marca-valores-y-tension), [Identidad de Marca](#identidad-de-marca) y Manual de Identidad Visual).
- La escala de espaciado, radios, tipografía técnica y breakpoints ([Fundaciones](#fundaciones)).
- Cómo se derivan las familias semánticas de color a partir del hue único de marca ([Fórmula de Color](#formula-de-color)).
- Los patrones de componente ya peleados y resueltos: badge, indicador de capacidad, timeline de historial, confirmación por nivel de riesgo, y los controles de formulario base ([Patrones de Componente](#patrones-de-componente)).
- Los principios de seguridad y de datos que no son negociables por módulo ([Seguridad y Datos](#seguridad-y-datos)).

**Principio rector:** *"Ocultar en UI no sustituye autorización real."* Si algo importa que un rol no pueda hacer, el enforcement vive en el backend (RLS o equivalente), nunca solo en si el botón se ve o no.

**Personalización de tenant — no confundir con identidad de módulo.** Una empresa cliente (tenant) puede tener su propio logo dentro de su instancia de Materen, como cortesía de marca blanca ligera — eso es distinto de que un *módulo* tenga su propia identidad. El chrome del producto (navegación, componentes, tipografía, color de sistema) sigue siendo Materen siempre; el logo del tenant, cuando exista, vive únicamente en los espacios explícitamente de marca del tenant (ej. encabezado de un reporte exportado a su nombre), nunca reemplaza el sistema de color de la interfaz.

**Dos caminos válidos a canónico.** Un valor técnico (no de marca — ver arriba) se fija como canónico por uno de dos caminos, y **todo valor canónico declara su origen**:

1. **Dato interno `[desempate]`:** dos o más implementaciones Materen coinciden, o el desacuerdo entre ellas no tiene argumento de fondo (es gusto, no hallazgo), y se elige una de forma definitiva.
2. **Estándar externo `[externo: fuente]`:** ningún sistema Materen aportó dato porque nadie lo peleó todavía, y en vez de esperar sin necesidad se adopta una referencia ya establecida fuera de Materen (WAI-ARIA, la escala default de Tailwind, convenciones de namespacing de design tokens, etc.).

Nunca se presenta un desempate o una adopción externa como si fuera un hallazgo verificado en producción. Lo que sigue sin resolver por falta de dato real se queda abierto ([Cómo Adoptarlo](#como-adoptarlo)) — no hay una tercera categoría de "abierto por comodidad".

---

<a id="marca-valores-y-tension"></a>

## 2. Marca: valores y la tensión que todo diseño debe resolver

Materen se sostiene en cuatro valores, ya fijados en el Documento Maestro de Marca:

| Valor | Definición operativa |
|---|---|
| Simplicidad | Cada función nueva se mide contra: ¿esto complica el uso diario? Si la respuesta es sí, no entra al producto tal como está planteada. Es el valor que evita que Materen termine pareciéndose a la competencia compleja que hoy reemplaza. |
| Confianza | El sistema funciona siempre, sin caídas ni sorpresas. Para un freelance o microempresa sin equipo de soporte, la operación del negocio depende de esto directamente. |
| Integridad | Materen comunica exactamente lo que el sistema hace, sin promesas infladas ni lenguaje de gurú. Lo que se anuncia en un post es lo que el usuario encuentra al entrar. |
| Innovación | Se mejora de forma continua, pero nunca a costa de la simplicidad. Toda mejora entra solo cuando el usuario ya la necesita, no antes. |

**La tensión que todo diseño debe resolver:** *seriedad y amigabilidad al mismo tiempo* — no un punto medio tibio, sino sostener ambas cosas a la vez. Formal como para que una empresa confíe su operación diaria; cercano como para que una persona sin equipo de soporte no se sienta intimidada al abrirlo por primera vez.

Cualquier decisión visual o de producto que no se pueda justificar con al menos uno de estos cinco puntos (los 4 valores + la tensión) no debería entrar al sistema todavía.

### Traducción de valores a reglas de diseño

| Valor | Regla de diseño concreta |
|---|---|
| Simplicidad | Un acento de acción por vista (Índigo/Turquesa, ver [Identidad de Marca](#identidad-de-marca)), no una paleta. Cero decoración sin función. |
| Confianza | Los mismos patrones se ven siempre igual entre módulos. Los estados de carga y error están tan cuidados como el estado ideal. |
| Integridad | Ningún texto de interfaz promete algo que el sistema no hace. Nada de urgencia falsa (badges de "solo hoy" inventados, contadores que no son reales). |
| Innovación | Un solo elemento distintivo de marca (el patrón de módulos, ver Manual de Identidad Visual), aplicado con disciplina en momentos concretos — no innovación dispersa por todo el producto. |
| La tensión (serio + amigable) | Formalidad viene de la estructura (alineación, espaciado, tipografía consistente); calidez viene del tono de los textos y del ritmo del espacio — nunca de un segundo color decorativo ni de una mascota o ilustración juguetona. |

### Referencias combinadas conscientemente

Materen no inventa su lenguaje de forma aislada ni copia un solo sistema completo — combina piezas específicas, cada una resolviendo un problema distinto:

| Fuente | Qué se toma | Qué NO se toma |
|---|---|---|
| **Carbon (IBM)** | Vocabulario de forma: radios de esquina bajos, controles rectos, alta densidad de datos bien resuelta | Su frialdad absoluta y su tipografía técnica al 100% |
| **Atlassian** | Forma de documentar el sistema — Fundamentos → Tokens → Componentes → Patrones, cada cosa explicada por sí misma | Su estética — esto es solo gobernanza y presentación |
| **Apple (HIG)** | Filosofía de claridad y deferencia — el contenido manda, el "chrome" desaparece | Su sistema visual completo — cero vidrio, cero translucidez |
| **Fluent (Microsoft) + Astryx (Meta)** | La idea de "un tema, muchos tokens" y su nivel de contención visual | El material Mica de Fluent y los temas juguetones de Astryx |

**Explícitamente fuera del sistema:** Material Design de Google (demasiado juvenil y de color muy vivo para lo que Materen transmite) y cualquier paleta arcoíris por dominio — un módulo de TI y uno de Contabilidad no necesitan colores distintos para sentirse organizados; necesitan la misma disciplina visual.

---

<a id="identidad-de-marca"></a>

## 3. Identidad de marca — valores fijos, no fórmula por sistema

Navy y Turquesa (documentados en el Manual de Identidad Visual) son los únicos colores de marca de Materen. Ningún módulo nuevo elige su propio hue — hereda estos valores y, cuando necesita familias semánticas (éxito, alerta, peligro, información), las deriva de ellos con la fórmula de [Fórmula de Color](#formula-de-color), no con un hue propio.

| Token | Hex | Rol |
|---|---|---|
| `--mat-color-brand` | `#11133C` (Navy) | Identidad de marca, superficie dominante |
| `--mat-color-accent` | `#4F46E5` (Índigo) | Acento único de acción — un botón primario visible por vista ([Fundaciones](#fundaciones)) |
| `--mat-color-accent-alt` | `#51EDC8` (Turquesa) | Acento de marca en piezas de comunicación (logo, redes, papelería) — ver nota |
| `--mat-color-brand-elevated` | `#1C2050` | Superficies secundarias sobre fondo Navy |

**Nota de reconciliación — pendiente de una decisión, no un error de este documento.** El Manual de Identidad Visual fija Navy + Turquesa como los colores de **marca** (logo, papelería, redes) y explícitamente dice que el color del **sistema web** todavía está en evaluación aparte. Este documento técnico necesita un acento de interacción funcional (botones, foco, estados activos) hoy mismo para poder especificar componentes — se usa Índigo (`#4F46E5`) como placeholder de trabajo por continuidad con la fase anterior de la marca, **no como una decisión ya tomada**. Cuando el proceso de color del sistema web cierre, este token es el que se actualiza — todo lo demás en este documento (escalas, patrones, fórmula semántica) sigue siendo válido sin cambios, porque no depende de qué hue exacto termine siendo el acento.

---

<a id="fundaciones"></a>

## 4. Fundaciones (agnósticas de stack)

Estos valores salieron casi idénticos en Sistema TI (CSS plano) y el planificador Materen (CSS plano + Tailwind congelado) sin que un equipo mirara al otro — señal de un gusto ya consistente. Se fijan acá para que el módulo #3 no las redescubra desde cero.

### Radios
```
sm: 6px   md: 10px   lg: 14px   xl: 20px   pill: 999px
```
Canónico `[desempate]`. El planificador Materen conserva hoy una escala de 5 pasos distinta (con 8/12/16 en el medio) por herencia de una fase anterior — queda como **deuda de migración** en [Deuda de Migración](#deuda-de-migracion), no como excepción permanente.

### Espaciado
Escala de 4px: `4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 36 · 40`.

### Breakpoints `[externo: Tailwind]`
```
sm: 640px   md: 768px   lg: 1024px   xl: 1280px   2xl: 1536px
```
Se documenta en px planos para que un módulo en CSS puro (como Sistema TI) la use igual, sin necesitar Tailwind.

### Tipografía
- **Piso de tamaño: 11px.** Nunca menos, en ningún módulo.
- **Techo de peso: 600 para texto de UI.** El 700 se reserva exclusivamente para valores numéricos destacados (stat cards, KPIs) y el wordmark de marca. Nunca para labels, botones ni badges.
- **Familias de marca: Poppins (encabezados) + Inter (cuerpo)**, ya fijadas en el Manual de Identidad Visual — no libres por módulo. Esto corrige la fórmula anterior de este documento, que dejaba la familia a elección de cada producto; bajo una sola marca, la tipografía tampoco se elige por módulo.

**Escala de tamaño**
```
11 · 12 · 13 · 14 · 15 · 17 · 20 · 26
```
Canónica `[desempate]` — los 8 pasos reales y verificados de Sistema TI. El planificador Materen documenta un techo de 28px sin pasos intermedios — insuficiente para preferirlo sobre el de Sistema TI. Se fija 26px como techo canónico; migrar el 28px queda en [Deuda de Migración](#deuda-de-migracion).

**Nombre de token por paso:**
```
--mat-fs-xs 11 · --mat-fs-sm 12 · --mat-fs-base 13 · --mat-fs-md 14
--mat-fs-lg 15 · --mat-fs-xl 17 · --mat-fs-2xl 20 · --mat-fs-stat 26
```
`--mat-fs-md` es el tamaño base de `body`; `--mat-fs-stat` se reserva para valores numéricos destacados.

**Line-height**
- 1.4 mínimo para párrafo o texto largo.
- 1.2 para UI compacta (tabla densa, badge, label de formulario) — nunca menos, en ningún contexto.

### Interacción
- **Un solo acento de acción visible por vista.** Máximo un botón `--primary` por vista — todo lo demás baja a `--secondary` o `--ghost`, aunque "se sienta" igual de importante.
  **Excepción declarada `[desempate: Sistema TI]`:** el botón de confirmar/guardar dentro de un modal sí puede ser `--primary` aunque el header de la vista de fondo también lo sea — el modal es su propia superficie de foco activa, el fondo queda inerte tras el backdrop. No cuenta como un segundo acento. Fuera de ese caso, dos `--primary` visibles a la vez en la misma vista es siempre un error — Sistema TI encontró y corrigió este patrón en 7 vistas (header + estado vacío mostrando el mismo CTA dos veces).
- Transiciones: 120–280ms, easing suave (no lineal).
- **Z-index en capas, con escala canónica fijada `[desempate: Sistema TI]`** — antes este documento solo tenía el principio ("capas, no números sueltos") sin valores. Primer dato real que lo cierra:
```
--z-header: 50           header sticky de vista
--z-header-mobile: 60    topbar móvil (encima del header normal)
--z-nav: 100             sidebar en modo drawer + su overlay (z-nav − 1)
--z-popover: 300         resultados de búsqueda global, dropdowns flotantes
--z-modal: 400           fondo/overlay de modal
--z-modal-stacked: 410   reservado para un modal sobre otro
--z-toast: 500           toast — siempre visible, incluso sobre un modal
```
Fijar este orden una vez por módulo, en un solo lugar, nunca hardcodear un z-index nuevo sin mirar la escala existente. Un dropdown que vive *dentro* de un modal (ej. un combo dentro de un formulario) no compite en esta escala — su stacking context ya lo resuelve el propio modal.

### Estados de interacción
*(No confundir con "Estado persistido vs. situación derivada" de [Patrones de Componente](#patrones-de-componente) — eso es modelado de datos del backend. Esto es el estado de la UI misma.)*

- **Focus siempre visible** — indicador geométrico (ring, borde, offset) que sobreviva incluso con daltonismo. No "se ve bien": se verifica.
- **Disabled:** un solo tratamiento visual en todo el producto (opacity fija + `cursor: not-allowed`), nunca un gris ad-hoc por componente.
- **Loading:** skeleton cuando ya se conoce la forma del contenido (lista, card, tabla); spinner cuando es una acción puntual sin forma previa conocida. Nunca los dos a la vez para el mismo dato.
- **Hover/active:** perceptibles pero sin mover el layout.

---

<a id="formula-de-color"></a>

## 5. Color: fórmula de derivación semántica

Navy y Turquesa/Índigo ([Identidad de Marca](#identidad-de-marca)) son el único hue de marca. Esta fórmula se usa **una vez**, sobre ese hue, para derivar las familias semánticas — no se repite por módulo, porque no hay un hue distinto por módulo.

### Dos niveles de saturación, un solo significado por rol
- **Vivo (saturado):** botones sólidos, íconos, focus ring — lo que se puede *accionar*.
- **Pastel (tenue):** fondo de badge, banner, chip de estado, siempre con texto en la versión oscura de la misma familia — lo que se *informa*.

Nunca se usan de forma intercambiable para el mismo rol.

### Fórmula de derivación (familias semánticas: éxito, alerta, peligro, información)
```
Claro:   bg    → H, S 35–55%, L 90–93%
         texto → H, S 45–60%, L 28–35%
         borde → H, S 30–45%, L 75–80%

Oscuro:  bg    → H, S 25–30%, L 20–22%
         texto → H, S 45–60%, L 75–80%
         borde → H, S 25–30%, L 35–38%
```
Solo cambia el hue (H) entre familias — todas comparten el mismo par S/L. Esto es lo que hace que varios colores semánticos se lean como un sistema y no como decisiones sueltas. La fórmula no limita cuántas familias puede tener un módulo: Sistema TI ya opera con 8 (éxito, alerta, peligro, información, y cuatro categóricas de dominio — ubicaciones, tipo de cuenta, correos/garantías, inactivo), todas verificadas con el mismo script de contraste. Cuatro es el mínimo común, no un techo.

### Nivel vivo — fórmula
```
Vivo (mismo en claro y oscuro): H, S 55–70%, L 42–48%
```
Mismo hue que su familia pastel — un botón "Eliminar" y un badge "Vencido" comparten el H, solo cambia cuánto se satura. Token: `--mat-color-danger-solid`, `--mat-color-success-solid`, `--mat-color-warning-solid`. Texto encima: blanco fijo, **excepto warning**, donde el ámbar sigue siendo demasiado luminoso incluso saturado y necesita texto oscuro.

*(Abierto en [Decisiones Abiertas](#decisiones-abiertas): sin verificar aún contra hex reales de producción — a diferencia de radios/tipografía/prefijo, acá no hay estándar externo que sustituya el dato, es específico de la marca.)*

### Neutros — escala aparte, con jerarquía de superficie
```
text-primary    → S 5–10%,  L 12–18% (claro) / L 90–95% (oscuro)
text-secondary  → S 5–10%,  L 40–45% (claro) / L 65–70% (oscuro)
text-tertiary   → S 5–10%,  L 58–64% (claro) / L 50–55% (oscuro)
border          → S 5–10%,  L 82–86% (claro) / L 25–28% (oscuro)

bg              → S 5–10%,  L 90–93% (claro) / L 8–10%  (oscuro)
bg-subtle       → S 5–8%,   L 94–96% (claro) / L 11–13% (oscuro)
bg-elevated     → S 5–8%,   L 97–99% (claro) / L 14–16% (oscuro)
bg-hover        → nivel base ± 2–3 pts de L según superficie
```
Usar el hue de marca (Navy) con saturación mínima —no gris puro— en los neutros es lo que hace que se sientan parte del mismo sistema en vez de genéricos de framework.

### Convención de nombres
**`--mat-*`** es el prefijo canónico único (corrige `--mc-*`, que asumía una capa "Core" separada de identidades de producto que ya no existe). Estructura: `--mat-{categoría}-{rol}`. Categorías: `color`, `fs`, `radius`, `space`.

### Distancia mínima entre categóricas
Si un módulo necesita más familias de color que éxito/alerta/peligro/información (tipos de recurso, categorías de negocio), cada hue nuevo debe estar a una distancia perceptualmente segura de cualquier otra ya en uso. 40° en el círculo de hue es un punto de partida, no una garantía — verificar con un simulador de daltonismo antes de fijar, no solo medir grados.

### Dark mode: recomendado, no obligatorio
La fórmula ya trae claro y oscuro resueltos en paralelo — implementarlo desde el primer componente sale más barato que agregarlo después. No es un requisito duro; queda a criterio de cada módulo según su usuario.

### Verificación, no estimación
Todo par bg/texto se valida con una razón de contraste real (mínimo 4.5:1, apuntar a 7:1) antes de mergear — no "se ve bien". El chequeo automatizado (`scripts/contraste.mjs`, ya usado en Sistema TI) es portable a cualquier módulo nuevo.

---

<a id="patrones-de-componente"></a>

## 6. Patrones de componente resueltos

Estos ya se pelearon en un módulo Materen, o se resolvieron contra un estándar externo declarado. Un módulo nuevo los adapta a su framework — no los reinventa.

*(Tokens con el prefijo `--mat-*` fijado en [Fórmula de Color](#formula-de-color). Sistema TI necesita un alias de su `--color-*` actual hacia `--mat-*` — ver [Deuda de Migración](#deuda-de-migracion).)*

**Ajustes locales permitidos `[desempate: Sistema TI]`:** cuando un componente necesita un detalle que no es color ni estructura (ej. `margin-left` para separarlo de texto vecino, `text-transform: uppercase` para un chip de rol), se agrega como clase adicional con solo esa propiedad — nunca redeclarando `display`/`padding`/`border-radius`/`font-size` del primitivo base. Esto es lo que evita que "necesito un pequeño ajuste" se convierta en la excusa para reinventar el componente entero.

### Badge — base + modificador
Un solo primitivo con variantes semánticas (`success/warning/danger/info/neutral/accent`), nunca una clase nueva por módulo. El síntoma a evitar ya apareció dos veces en dos codebases distintas. Si un módulo nuevo está por crear su segunda clase de badge, es la señal de pausar y generalizar.

```css
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 9px; border-radius: var(--mat-radius-pill);
  font-size: var(--mat-fs-xs); font-weight: 600; white-space: nowrap;
}
.badge--success { background: var(--mat-color-success-bg); color: var(--mat-color-success-text); }
.badge--warning { background: var(--mat-color-warning-bg); color: var(--mat-color-warning-text); }
.badge--danger  { background: var(--mat-color-danger-bg);  color: var(--mat-color-danger-text); }
.badge--info    { background: var(--mat-color-info-bg);    color: var(--mat-color-info-text); }
.badge--neutral { background: var(--mat-color-bg-subtle);  color: var(--mat-color-text-secondary); }
.badge--accent  { background: var(--mat-color-accent-subtle-bg); color: var(--mat-color-accent-subtle-text); }
```

### Botón — primitivo + variantes
Una sola escala de énfasis, no un botón nuevo por pantalla. Máximo un `--primary` visible por vista ([Fundaciones](#fundaciones)).

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 36px; padding: 0 18px; border: 1px solid transparent;
  border-radius: var(--mat-radius-md); font-size: var(--mat-fs-base);
  font-weight: 600; cursor: pointer;
}
.btn--primary   { background: var(--mat-color-accent); color: #fff; }
.btn--secondary { background: transparent; border-color: var(--mat-color-border); color: var(--mat-color-text-primary); }
.btn--ghost     { background: transparent; color: var(--mat-color-text-secondary); }
.btn--danger    { background: var(--mat-color-danger-solid); color: #fff; }
.btn:disabled   { opacity: .45; cursor: not-allowed; }
```

### Input, select, textarea, checkbox, radio — estados
Los tres estados (normal, foco, deshabilitado) resueltos una sola vez; ninguna vista redefine su propio input.

```css
.input, .select, .textarea {
  border: 1px solid var(--mat-color-border);
  border-radius: var(--mat-radius-md);
  font-size: var(--mat-fs-base); background: var(--mat-color-bg-elevated);
  color: var(--mat-color-text-primary);
}
.input, .select { height: 36px; width: 100%; padding: 0 12px; }
.select { appearance: none; }
.textarea { width: 100%; min-height: 88px; padding: 8px 12px; resize: vertical; }

.input:focus-visible, .select:focus-visible, .textarea:focus-visible {
  outline: none; border-color: var(--mat-color-accent);
  box-shadow: 0 0 0 3px var(--mat-color-accent-subtle-bg);
}
.input:disabled, .select:disabled, .textarea:disabled {
  opacity: .45; cursor: not-allowed;
}

.checkbox, .radio {
  width: 18px; height: 18px; flex-shrink: 0;
  border: 1px solid var(--mat-color-border); background: var(--mat-color-bg-elevated);
}
.checkbox { border-radius: var(--mat-radius-sm); }
.radio    { border-radius: 999px; }
.checkbox:checked, .radio:checked {
  border-color: var(--mat-color-accent); background: var(--mat-color-accent);
}
.checkbox:focus-visible, .radio:focus-visible {
  outline: none; box-shadow: 0 0 0 3px var(--mat-color-accent-subtle-bg);
}
```

`select`/`checkbox`/`radio`/`textarea` `[externo: WAI-ARIA]`: comportamiento de teclado/foco/rol anclado a los WAI-ARIA Authoring Practices. Área de click de checkbox/radio ≥24px aunque el cuadro visual sea 18px — se logra con el `<label>` que envuelve el control.

Mismo tratamiento de disabled en los cinco: opacity fija, sin cambiar `background` ni `color`.

### Login — composición, no componente nuevo
Un login es `.card` + `.input` × N + `.btn--primary` de ancho completo + un `.btn--ghost` para "olvidé mi contraseña". Si algún módulo necesita algo que estos cuatro primitivos no cubren, esa es la señal real de que hace falta un componente nuevo — no antes.

### Indicador de capacidad
Para cualquier recurso con tope (asientos de licencia, cupo, cuota): barra o fracción con tres umbrales de color, nunca solo un número plano.

```css
.capacity-bar  { height: 6px; border-radius: var(--mat-radius-pill); background: var(--mat-color-bg-subtle); overflow: hidden; }
.capacity-fill { height: 100%; border-radius: var(--mat-radius-pill); }
.capacity-fill--ok      { background: var(--mat-color-success-solid); } /* <70% */
.capacity-fill--warning { background: var(--mat-color-warning-solid); } /* 70–99% */
.capacity-fill--full    { background: var(--mat-color-danger-solid); }  /* =100% */
```

### Timeline de historial
Para cualquier entidad con historial de asignación/estado a través del tiempo: representación vertical con distinción clara entre "activo" y "cerrado", no una tabla plana genérica.

```css
.timeline             { display: flex; flex-direction: column; }
.timeline-item         { display: flex; gap: 12px; padding-bottom: 16px; position: relative; }
.timeline-item::before {
  content: ''; position: absolute; left: 5px; top: 20px; bottom: 0;
  width: 1px; background: var(--mat-color-border);
}
.timeline-item:last-child::before { display: none; }
.timeline-dot          { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
.timeline-dot--active  { background: var(--mat-color-success-text); }
.timeline-dot--closed  { background: var(--mat-color-text-tertiary); }
.timeline-content      { font-size: var(--mat-fs-base); }
```

### Confirmación por nivel de riesgo (no todo-o-nada)

| Nivel | Cuándo | Tratamiento mínimo |
|---|---|---|
| **Base** — toda acción irreversible | Dar de baja, revocar, eliminar | Copy con el nombre específico de la entidad afectada ("¿Dar de baja a Marco Salas?", no "¿Confirmar?"); foco por defecto en Cancelar. |
| **Auditable** — acción con peso de compliance o que afecta a terceros | Aprobar/rechazar OT, purgar datos, cambiar rol | Justificación obligatoria de texto libre (≥10 caracteres), guardada en log inmutable. |

Un mismo módulo no debería tener tres acciones de riesgo comparable con tres niveles de fricción distintos — se elige el nivel por el tipo de acción, no por qué modal se armó primero.

### Estado persistido vs. situación derivada
Para cualquier módulo con estados que dependen del tiempo (vencimientos, atrasos, expiración): lo que se persiste es el hecho (fecha, estado explícito); lo que se deriva del tiempo actual se calcula en una vista o función, nunca se escribe a mano ni se recalcula distinto en cada pantalla.

### Estado vacío (empty state)
Tres piezas siempre juntas:
1. Ícono o ilustración simple.
2. Mensaje corto que explica el *por qué* está vacío, no solo "no hay resultados".
3. Acción primaria si existe una. Si no hay acción posible, se omite el botón.

```css
.empty-state        { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 32px 16px; }
.empty-state__icon  { font-size: 26px; color: var(--mat-color-text-tertiary); }
.empty-state__title { font-size: var(--mat-fs-base); font-weight: 600; color: var(--mat-color-text-primary); }
.empty-state__body  { font-size: var(--mat-fs-sm); color: var(--mat-color-text-tertiary); max-width: 220px; }
```

### Error de validación de formulario
Inline, junto al campo — nunca solo toast. Mensaje específico al problema ("Mínimo 10 caracteres", no "Campo inválido"), foco automático al primer campo con error.

### Loading de vista completa vs. loading parcial
- Skeleton de página completa solo en la primera carga de una vista nueva.
- Loading parcial (spinner acotado) para refetch, paginación o filtro — el resto de la UI ya cargada no vuelve a mostrar skeleton.

```css
.skeleton { border-radius: var(--mat-radius-sm); background: var(--mat-color-bg-subtle); animation: mat-pulse 1.4s ease-in-out infinite; }
@keyframes mat-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
```

### Iconografía
Dos reglas, no una paleta de tamaños libre:
1. **Una sola librería para todo Materen: Tabler Icons, outline.** Esto corrige la versión anterior de este documento, que dejaba la librería a elección de cada producto — bajo una sola marca, tampoco se elige por módulo.
2. **Grilla de tamaño atada al componente que lo usa:**
```
14px    → badge, chip inline
16–18px → botón, input, fila de tabla
26–32px → empty state, header de sección vacía
```

### Patrones candidatos (vistos una sola vez — no generalizados todavía)

**`.badge-group`** — para entidades con dos estados **independientes y simultáneos** (ej. un equipo con estado físico — operativo/en reparación/de baja — y a la vez una situación derivada — disponible/asignado/en ubicación). Sistema TI ya lo resolvió con dos badges agrupados, priorizando el estado derivado en pantallas angostas y dejando el físico accesible en un `title`. Por el mismo criterio que ya aplica a Badge y a los controles de formulario (ver [Filosofía](#filosofia)): un patrón se generaliza cuando dos módulos lo pelean de forma independiente, no la primera vez que aparece. Se anota acá para que el segundo módulo que lo necesite lo encuentre, no para que lo adopte todavía como estándar.

### Fuera de alcance
Modal/diálogo, tabs, tooltip, menú desplegable, tabla/data-grid con paginación, notificación/toast como componente, avatar, upload de archivo. Se resuelven cuando aparecen peleados dos veces de forma independiente, o cuando hay un estándar externo lo bastante claro — no antes.

---

<a id="arquitectura-de-la-informacion"></a>

## 7. Arquitectura de la información

Válida para cualquier módulo Materen, sin importar el dominio (TI, Contabilidad, Marketing, Desarrollo).

### 7.1 Jerarquía

```
Empresa (tenant)
 └─ Espacio (workspace: "Equipo de Producto", "Marketing LatAm")
     └─ Módulo (Agenda, Tickets IT, Contabilidad, Sprints Dev...)
         └─ Vista (Lista · Kanban · Calendario · Timeline · Detalle)
             └─ Ítem (tarea, ticket, evento, asiento contable...)
```

Cada nivel necesita su propio selector siempre accesible, nunca enterrado en un menú de tres niveles:
- **Selector de empresa:** fijo, esquina superior.
- **Selector de espacio:** justo debajo, específico a la empresa activa.
- **Sidebar de módulos:** cambia según qué módulos tiene activos ese espacio — nunca muestra módulos que la empresa no contrató.
- **Migas de pan:** Empresa › Espacio › Módulo › Vista, siempre visibles.

### 7.2 Capas de componentes

| Capa | Qué contiene | Quién la toca |
|---|---|---|
| **Núcleo** | Tokens, navegación, primitivos (`Button`, `Input`, `Modal`, `Avatar`, `Badge`) | Solo el equipo de plataforma |
| **Compartido** | Patrones usados por 2+ módulos (tarjeta de ítem, tablero Kanban, calendario, hilo de comentarios, buscador global) | Cualquier equipo, con revisión |
| **Módulo** | Piezas específicas de un dominio (badge de prioridad de ticket, historial de versiones, asiento contable) | El equipo dueño del módulo |

**Regla de graduación:** si dos módulos distintos necesitan el mismo componente que hoy vive solo en uno de ellos, ese componente gradúa de Módulo → Compartido.

### 7.3 Multi-empresa sin fragmentarse

- Cada empresa (tenant) puede tener su propio logo dentro de su instancia, como cortesía de marca blanca ligera — nunca una paleta completa, y nunca en el chrome del producto (ver [Filosofía](#filosofia), nota de personalización de tenant).
- Ningún módulo asume que otro módulo específico existe.
- Un espacio nuevo nace **vacío de módulos** por defecto — se activan a propósito. Esto es lo que hace que una empresa con dos módulos no sienta que usa el 10% de un sistema gigante.

---

<a id="stack-tecnico"></a>

## 8. Stack técnico recomendado

El frontend de Materen va a Vue — la base técnica se elige en función de eso, y de dejar el 100% del control visual sobre la marca ya definida:

- **Reka UI** (antes Radix Vue) como capa de lógica de interacción: componentes sin estilo, accesibilidad (ARIA, foco, teclado) resuelta de fábrica. El look de Materen se construye encima, sin pelear contra estilos ajenos.
- **Alternativa con más piezas listas: PrimeVue en modo Unstyled**, si conviene no construir cada tabla y formulario desde cero — mismo nivel de control visual, catálogo de componentes más grande (útil para módulos como TI o Contabilidad, que necesitan tablas de datos pesadas).
- **Referencia de arquitectura real en Vue a esta escala: GitLab.** Su design system (Pajamas) y su librería de componentes (`@gitlab/ui`) están en Vue.js y resuelven un problema de tamaño parecido — un solo producto con dominios muy distintos que crecieron con el tiempo. No se copia su estética; sí vale la pena mirar cómo organizan repositorio y tokens.

---

<a id="seguridad-y-datos"></a>

## 9. Seguridad y datos (no negociable por módulo)

- Autorización real vive en el backend (RLS o equivalente). La UI oculta para claridad, no para seguridad.
- Acciones irreversibles ejecutadas por un proceso automático (cron, job batch) sin intervención humana — purgas, desactivaciones masivas — requieren aviso previo verificable, no solo "está en el changelog". No-prescriptivo (puede ser log inmutable + alerta a admins, correo, o banner previo) no es lo mismo que opcional.
- Todo trigger o constraint de base de datos que puede rechazar una operación de negocio debe tener un mensaje de error persistente en la UI en el momento del rechazo, no solo un toast que desaparece.

---

<a id="gobernanza"></a>

## 10. Gobernanza de documentación

Con documentación pensada para que la lea una IA, la regla de precedencia tiene que ser explícita y sin excepciones implícitas.

**Regla:** la documentación de intención (`.md`, `CONTEXT`, specs de diseño) gana en caso de conflicto — **excepto** para dos categorías, que siempre las gana el código:
1. **Valores literales de tokens** (hex, spacing, tamaños) — el código vigente es más reciente que cualquier inventario de diseño.
2. **Estructura de datos ya migrada** (columnas/tablas eliminadas o renombradas) — verificar contra el historial de migraciones.

Cada módulo debe declarar estas excepciones **como lista explícita** en su propio `CONTEXT.md`/`README`, no como nota suelta. Todo documento de contexto lleva una **nota de vigencia** (fecha, y qué tan desactualizado puede estar respecto al código).

**Citar este documento por ancla, nunca por número de sección.** La guía de Sistema TI cita "Materen Core §2" y "§6" — correcto en la v0.5, incorrecto desde que este documento se reorganizó en v1.0. Un número de sección se desincroniza en silencio cada vez que el documento madre crece; una ancla con nombre (`#fundaciones`, `#gobernanza`) no cambia aunque el número sí. Todo documento de producto que referencie este archivo debe enlazar así: `[Fundaciones](MATEREN-CORE.md#fundaciones)`, nunca `Materen Core §4`.

---

<a id="como-adoptarlo"></a>

## 11. Cómo adoptarlo en un módulo nuevo

1. Copiar este archivo a `docs/MATEREN-CORE.md` (o equivalente) en el repo del módulo nuevo.
2. En el `CLAUDE.md`/`AGENTS.md`/`.cursor/rules` del módulo, agregar:
   > Este proyecto sigue `docs/MATEREN-CORE.md` para principios, marca y patrones compartidos de Materen. No define paleta ni tipografía propia — hereda las de marca.
3. Elegir el nombre del módulo (ej. "Materen Conta") y, si aplica, su ícono distintivo dentro del set de Tabler Icons ya definido ([Patrones de Componente](#patrones-de-componente)) — nunca un hue ni una tipografía propios.
4. Antes de crear un componente nuevo de badge/confirmación/capacidad/select/etc., revisar si ya está resuelto en [Patrones de Componente](#patrones-de-componente) y adaptarlo al stack, en vez de diseñarlo de cero.
5. Declarar las excepciones de precedencia documental ([Gobernanza de Documentación](#gobernanza)) en el propio `CONTEXT.md`/`README` desde el día uno.

---

<a id="deuda-de-migracion"></a>

## 12. Deuda de migración (no son decisiones de diseño pendientes — son trabajo pendiente sobre decisiones ya tomadas)

Estas diferencias existen por herencia de cuando cada sistema se pensaba con identidad propia (modelo descartado en v1.0, ver changelog). Ninguna es una excepción de marca aceptada — todas tienen que resolverse, la pregunta es solo cuándo.

| Sistema | Qué falta migrar | Impacto de no migrarlo aún |
|---|---|---|
| Sistema TI | ~~Paleta Cyprus + Sand~~ **Hecho (2026-07-06):** Navy/Índigo en `main.css`, tokens `--mat-*` canónicos con alias `--color-*`. Pendiente menor: migrar referencias en vistas de `--color-*` a `--mat-*` de forma gradual. | — |
| Planificador Materen | Escala de radios de 5 pasos → 4 pasos canónicos. Techo tipográfico 28px → 26px. Categorías de token propias (`--mat-text-xs` para tamaño) → estructura `--mat-{categoría}-{rol}` (`fs` para tamaño, `color` para rol de texto). | Bajo impacto visual inmediato, pero bloquea que un agente de IA infiera la convención correctamente en código nuevo. |

No bloquea trabajo nuevo mientras tanto — la regla de precedencia de código vigente ([Gobernanza de Documentación](#gobernanza)) cubre el interín — pero cada fila necesita un dueño y una fecha estimada, no quedar como nota permanente.

---

<a id="decisiones-abiertas"></a>

## 13. Decisiones abiertas (marcadas, no resueltas por este documento)

- **Acento de interacción final del sistema web** ([Identidad de Marca](#identidad-de-marca)): hoy se usa Índigo (`#4F46E5`) como placeholder de trabajo. El Manual de Identidad Visual todavía no cierra el color del sistema web de forma independiente del logo — cuando cierre, este documento actualiza un solo token (`--mat-color-accent`), nada más.
- **Nivel vivo de color** ([Fórmula de Color](#formula-de-color)): fórmula propuesta por generalización, sin verificar aún contra hex reales de producción. No hay estándar externo aplicable — es dato de marca, no de industria.