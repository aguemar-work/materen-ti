# Gobernanza de diseño — MATEREN

> **Para qué sirve este documento.** Responde una sola pregunta, para cada
> pieza del sistema: *¿quién manda, dónde se implementa y qué lo verifica?*
>
> Existe porque el diagnóstico del `docs/PLAN-MAESTRO-MATEREN.md` §1 encontró
> que MATEREN tenía reglas de diseño buenas y **narradas**: vivían en prosa,
> se contradecían entre secciones y se degradaban sin que nadie lo notara. La
> respuesta no fue reescribir la prosa, fue hacerla verificable. Este archivo
> es el mapa de esa arquitectura.
>
> **No es aspiracional.** Cada fila describe lo que el repositorio tiene hoy.
> Donde no hay validación automática, la celda dice "sin validación" — no se
> rellena con buenas intenciones.

---

## 1. Matriz de gobernanza

| Elemento | Fuente de verdad | Implementación | Validación automática |
|---|---|---|---|
| **Estándar de UI/UX** | **IBM Carbon Design System v11** (desde 2026-09-02, decisión de producto). Especificación transcrita en `frontend/src/styles/carbon-theme.css` (`--cds-*`) | `main.css` mapea los roles del producto sobre esa capa; ningún componente lee `--cds-*` salvo los cuatro del shell (`--cds-shell-*`) | `contraste.mjs` re-verifica los 69 pares de Carbon en CI · `tokens-vs-guia.mjs` lee las dos capas |
| **Marca — nombre** | `frontend/src/core/marca.js` | 7 consumidores (`AppLayout`, `LoginView`, `PublicBrand`, `pdfReporte`, `acta-base`, `DesignSystem`, `StyleLab`) | Sin validación — ver §5 |
| **Marca — identidad** | Decisión de producto: `PANORAMA` §6 + `PLAN-MAESTRO` §3. `--color-brand` en `main.css` — **ya no alimenta el acento**: con Carbon el acento es Blue 60, un valor del design system, no de la identidad | `main.css` | `literales-vs-tokens.mjs` → check `marca-retirada` (3 valores vigilados) |
| **Color** | Valores: `carbon-theme.css` (escalas de Carbon). Roles: `main.css`, bloques `:root` (tema Gray 10) y `[data-theme="dark"]` (Gray 100) | Rol `--color-*` → consumo en componentes | `contraste.mjs` (WCAG) · `tokens-vs-guia.mjs` (nombres + referencias rotas + capa duplicada) · `literales-vs-tokens.mjs` (estricto, 0 literales) |
| **Spacing** | `main.css` `--space-1..12` (2·4·6·8·10·12·16·20·24·32·40·48). **No re-basado a la escala de Carbon** a propósito: estos tokens se consumen también como tamaño (`.avatar.sm` usa `--space-10` como ancho), así que desplazar los pasos habría cambiado tamaños, no márgenes | Adoptado en `components/shared/` y en `components/carbon/`; el resto sigue en px | `literales-vs-tokens.mjs` → **trinquete**, línea base en `scripts/literales-base.json` |
| **Typography** | Type set productivo de Carbon: 5 pasos (`--fs-label-01`, `--fs-body-01`, `--fs-heading-02/03/05`) con su interlineado y tracking en `carbon-theme.css`. IBM Plex Sans + Mono, cargadas en `index.html` | Rol `--fs-*` | `literales-vs-tokens.mjs` (estricto, 0 literales) |
| **Radius** | `main.css` `--radius-base` — **uno, y vale 0**. Carbon no tiene escala de radios: tiene la decisión de no tener esquinas | `--radius-base` en todo el sistema; `50%` literal solo para círculos (avatar, punto, radio) | `literales-vs-tokens.mjs` (estricto, 0 literales) |
| **Shadow** | `main.css` `--shadow-overlay` — **una**, y solo para capas teletransportadas (menú, popover, toast, drawer). Tarjetas, tablas, campos y **modales** son planos | `--shadow-overlay` | `literales-vs-tokens.mjs` (estricto, 0 literales) |
| **Shell** | Especificación del UI Shell de Carbon: header 48px Gray 100, SideNav 256/48px Gray 90, workspace Gray 10. Métricas y roles en `carbon-theme.css` (`--cds-shell-*`) | `AppLayout.vue` + `AppNav.vue` + `AppSearch.vue` + `NotificacionesCampana.vue` | `contraste.mjs` → tabla `UI SHELL` (9 pares; el shell es oscuro en ambos temas, no entra en las tablas claro/oscuro) |
| **Primitivas de Carbon** | `components/carbon/` — `CarbonTag`, `CarbonDataTable`, `CarbonPasswordReveal` | Consumidas por las vistas de módulo | `tests/componentes/carbon.render.test.js` (27 casos) |
| **Focus** | `main.css` `--ring` / `--ring-danger` / `--ring-whatsapp` | 11 reglas `:focus-visible` en `main.css` | `contraste.mjs` (bordes de control, umbral 3:1 de WCAG 1.4.11) |
| **Overlay** | `main.css` `--color-overlay` | `.modal-bg` (main.css) + `.sb-overlay` (`AppLayout.vue`) | `literales-vs-tokens.mjs` (categoría color) |
| **Modal** | `components/shared/Modal.vue` — centraliza `role=dialog`, `aria-modal`, foco atrapado y cierre con Escape | 26 vistas lo importan | `patrones-ui.mjs` → regla `modal-a-mano` (que nadie lo evite) + `tests/componentes/Modal.render.test.js` (que él cumpla) |
| **Navegación** | `components/shared/AppNav.vue` (constante `AREAS`) + `constants/modulos.js` + `router/routes/*.routes.js` | Guard en `router/guards.js`, reforzado por RLS (`tiene_permiso_modulo`) | Smoke de integración — **hoy no corre**, faltan los secrets (ver §5) |
| **Terminología de dominio** | `core/dominio-*.js` (7 archivos: estados, severidades, opciones y sus labels) | `BadgeEstado`, filtros, formularios | Sin validación — ver §5 |
| **Reglas de accesibilidad** | `docs/GUIA-UX-UI.md` | Componentes compartidos | `contraste.mjs` + `patrones-ui.mjs` (3 invariantes de marcado) |
| **Patrones de UX** | `docs/GUIA-UX-UI.md` | Componentes compartidos | Parcial: solo lo determinista (`patrones-ui.mjs`) |
| **Decisiones de producto** | `docs/PANORAMA-SISTEMA.md` §6 (qué se decidió y por qué) + `docs/PLAN-MAESTRO-MATEREN.md` (hacia dónde) | — | — |
| **Estado verificado del sistema** | `docs/PANORAMA-SISTEMA.md` (esquema, RLS, triggers) | — | `scripts/test-db.mjs` — **hoy se omite**, falta el secret |

### Jerarquía cuando dos fuentes se contradicen

1. **El código gana sobre la documentación.** Si `main.css` y `GUIA-UX-UI.md`
   dicen cosas distintas, el que está mal es el documento — y hay un script
   que lo detecta. La excepción es una decisión de producto registrada en
   `PANORAMA` §6 que el código todavía no implementa: ahí el pendiente es el
   código, y debe estar dicho explícitamente.
2. **Un nombre por concepto — dentro de cada capa.** No hay dos nombres de
   ROL para el mismo rol: `--color-x` es el token, no el puente hacia otro
   `--prefijo-color-x`. Los únicos alias que quedan son semánticos
   (`--color-primary` → `--color-accent-text`), y existen porque nombran un
   rol distinto.
   La indirección **rol → valor de escala** (`--color-accent` →
   `--cds-blue-60`) **no** es esto, y es la que hace un design system: dos
   cosas distintas, un rol y un valor. `--color-accent` puede dejar de ser
   Blue 60 sin que Blue 60 deje de ser `#0f62fe`. `tokens-vs-guia.mjs`
   distingue los dos casos.
3. **La especificación de Carbon gana sobre el gusto, y la casa gana sobre
   la especificación cuando ya decidió.** Ante una pregunta de diseño nueva,
   la respuesta se busca primero en Carbon. Las tres desviaciones vigentes
   (radio 0 en el Tag, barra de 2px en el ítem de nav activo, íconos Tabler)
   están listadas con su motivo en `GUIA-UX-UI.md`, "Qué se adopta y qué
   no" — una desviación sin entrada ahí es un descuido, no una decisión.
3. **`docs/PANORAMA-SISTEMA.md` gana sobre todo lo demás en dominio,
   seguridad y datos.** Este documento no compite con él: gobierna
   presentación.

---

## 2. Los cinco guardrails

Corren en CI en cada push (`.github/workflows/ci.yml`, job `build-y-tests`)
y se pueden correr a mano desde la raíz.

| Script | Qué garantiza | Falla el build si… |
|---|---|---|
| `contraste.mjs` | El **valor** de un par de color cumple WCAG (4.5:1 texto, 3:1 bordes de control y foco) | Un par baja del umbral. **Desde el 2026-09-02 falla de verdad**: hasta entonces imprimía "Total fallas: N" y salía con código 0 siempre, así que el paso de CI pasaba en verde con pares en rojo — el umbral estaba medido pero no era exigible |
| `tokens-vs-guia.mjs` | El **nombre** de un token es coherente entre las dos capas de CSS, su uso real y `GUIA-UX-UI.md`; todo `var()` resuelve; y hay **un nombre por concepto** | La guía nombra un token inexistente (FANTASMA); un token no tiene consumidor (MUERTO); un `var()` sin fallback apunta a nada (REFERENCIA ROTA); vuelve a aparecer una capa de nombres duplicados (CAPA DUPLICADA) |
| `literales-vs-tokens.mjs` | Un **valor escrito a mano** que debería ser token | Aparece un literal de color/radio/sombra/tipografía; el espaciado sube por encima de su línea base; reaparece un valor de marca retirada |
| `patrones-ui.mjs` | La **estructura** del marcado respeta los patrones del sistema | Un modal hecho a mano; un `<img>` sin `alt`; una cabecera de columna sin texto visible; un botón solo-ícono sin nombre accesible |
| `clases-muertas.mjs` | Que toda clase **aplicada** exista, y que se sepa cuáles **definidas** ya no se usan | Aparece una clase HUÉRFANA — aplicada en el marcado y sin regla en ninguna hoja. No hace nada, y "no hace nada" es indistinguible de "así se diseñó": le pasó a `.badge-inline` durante meses, en 4 de sus 8 consumidores. Las **muertas** se reportan como inventario y **no** fallan — durante la convergencia a Carbon suben a propósito, y son la lista de trabajo de la Fase 9d |

Los cinco son **deterministas**: leen archivos y comparan. Ninguno interpreta
intención ni necesita un modelo. Lo que no puede verificarse así, no se
automatiza — se dice que no está verificado.

**Quinta pieza, de otra naturaleza**: `frontend/tests/componentes/` (40 tests)
monta componentes de verdad en un DOM en memoria. No es análisis estático:
verifica comportamiento. Corre con `npm test`, junto al resto de la suite. Ver
§5.

---

## 3. Los tres regímenes

Una regla no vale lo mismo en una categoría limpia que en una con seiscientas
infracciones. Exigir cero en las dos sería pedir una sustitución masiva ciega
en la segunda.

**ESTRICTO** — se exige 0 y falla el build.
Se usa donde la categoría ya está limpia: el check no arregla nada, impide que
se ensucie. Hoy: color, radio, sombra, tipografía, marca retirada, referencias
rotas y las 3 invariantes de marcado.

**TRINQUETE** — se fija una línea base y falla solo si el número **sube**.
Se usa donde la deuda es real y grande. La deuda solo puede encoger. Hoy:
espaciado (línea base en `scripts/literales-base.json`; tras una migración se
consolida con `node scripts/literales-vs-tokens.mjs --fijar-base`, que solo
acepta bajar).

**DECLARADO** — no falla, pero se imprime en cada corrida.
Se usa para lo que es una decisión pendiente, no un descuido. Vive **en el
código**, no en un documento: `DEUDA_DECLARADA` en `tokens-vs-guia.mjs`,
`DECISIONES_PENDIENTES` y `PENDIENTES_DE_SISTEMA` en `literales-vs-tokens.mjs`.

---

## 4. Reglas, excepciones y decisiones pendientes

Una buena arquitectura no tiene cero excepciones: tiene cero excepciones **sin
registrar**. Las tres categorías no se mezclan.

**Regla global** — aplica en todo MATEREN. Vive en `main.css` o en un
componente compartido, y la vigila un guardrail.

**Excepción justificada** — hay una razón técnica concreta para apartarse.
Formato obligatorio, dentro del script que la exceptúa:

```
Excepción: qué archivo y qué valor
Motivo:    por qué el token no sirve acá
Alcance:   hasta dónde llega la excepción
Impacto:   qué pasa si se replica
```

Una entrada sin las cuatro líneas no es una excepción, es un descuido sin
documentar. Hoy hay **6** en `literales-vs-tokens.mjs`, **3** en
`patrones-ui.mjs` y **3** en `clases-muertas.mjs` — las vitrinas del Design
System, los scrims sobre fotos subidas por el usuario, la sombra direccional
del drawer, el control de estrellas, las clases de `<transition>` y la
convención de clase raíz de vista (`.empleados-page`).

**Decisión pendiente** — el valor está fuera del sistema y resolverlo **cambia
lo que se ve**, así que no es un criterio técnico. Se registra con evidencia y
con la decisión que hay que tomar; no se resuelve por cuenta propia. Hoy hay
**1**, imprimida en cada corrida del detector de literales:

- **Espaciado de 14px sin token.** La escala salta de `space-6` (12px) a
  `space-7` (16px), y 14px es uno de los valores más usados del árbol (~55
  veces). O a la escala le falta un paso, o esos usos deben normalizarse:
  insertar un paso rompe la numeración correlativa 1..12, normalizar cambia el
  render en 55 sitios. Carbon **tampoco** tiene 14 en su escala (2·4·8·12·16…),
  así que la respuesta consistente con el estándar es normalizar — pero sigue
  siendo decisión de producto, reservada por `PLAN-MAESTRO` §10.

> **Este conteo decía 6 hasta el 2026-09-02**, y estaba desactualizado: el
> script imprimía 1. Las otras cinco se resolvieron o quedaron sin objeto —
> los cuatro radios fuera de escala (CC-06) porque con Carbon hay **un** radio
> y vale 0, y `--color-whatsapp-text` (CC-08) porque se reescribió su
> justificación: es color de marca de un tercero, no un resto de la marca
> retirada, y su contraste (7.39:1) está verificado. Ver Ciclo 19 en
> `HISTORIAL-AUDITORIAS.md`.

---

## 5. Qué NO está verificado, y por qué

Esta sección es tan importante como la matriz. Un check que no corre es peor
que no tenerlo: da luz verde sin haber mirado nada — el proyecto ya lo vivió
como hallazgo Q-01.

### Dos cosas distintas que conviene no confundir

"Validación visual" mezcla dos problemas con viabilidad muy distinta. La
primera versión de este documento los descartó juntos; eso era un error, y la
distinción es la que sigue.

#### Render de componentes — **incorporado** (2026-09-01)

No necesita servidor, ni backend, ni secrets: monta el componente en un DOM en
memoria y verifica lo que produce.

- `@vue/test-utils` + `happy-dom` como devDependencies (0 vulnerabilidades).
- El entorno se pide **por archivo** con el docblock
  `// @vitest-environment happy-dom`. `vitest.config.js` mantiene
  `environment: 'node'` por defecto a propósito: los tests de lógica pura no
  deben pagar el costo de levantar un DOM que no usan.
- Vive en `frontend/tests/componentes/`. Hoy: **40 tests**, 3 archivos.

Qué cubre y por qué esos:

| Archivo | Qué protege |
|---|---|
| `Modal.render.test.js` | El contrato de accesibilidad del modal compartido: `role=dialog`, `aria-modal`, que `aria-labelledby` **resuelva** a un elemento real, el nombre del botón de cerrar, el guard `confirmarCierre` (si se rompe, el usuario pierde datos con una tecla), el bloqueo/restauración del scroll y el Teleport. `patrones-ui.mjs` verifica que nadie haga un modal a mano; esto verifica que EL modal siga cumpliendo su parte — si se rompe, los 26 consumidores se rompen a la vez y en silencio |
| `estados.render.test.js` | Vacío, sin dato, paginación y badge de dominio. Los consume casi toda vista: un fallo no se ve en un módulo, se ve en todos. Incluye el repliegue de página cuando un filtro encoge el resultado, y que `TextoVacio` **no** trate el `0` como vacío |
| `ErrorRedView.render.test.js` | La pantalla de sin conexión — la que se muestra justo cuando nada más funciona, no tiene ruta propia y no hay otra forma de enterarse de que se rompió. Más el discriminante `esErrorRed`, que si fallara mostraría "sin conexión" ante un 403 de RLS |

**Verificado por mutación, no por confianza**: quitar `aria-modal="true"` de
`Modal.vue` hace fallar el test correspondiente; restaurarlo lo devuelve a
verde. Un test que no falla cuando debería no es cobertura.

#### Captura de pantalla en navegador — **sigue sin ser incorporable**

Un smoke de las pantallas autenticadas (Dashboard, Tickets, Empleados)
necesita servidor + backend real + sesión de staff, es decir **los mismos
secrets que ya tienen a `test-integration` fallando y a `tests-db`
omitiéndose**. Agregarlo hoy crearía un tercer check que no corre —
exactamente el antipatrón que este documento existe para evitar. Y los
baselines de captura entre Windows (desarrollo) y Ubuntu (CI) difieren por
render de fuentes, así que serían inestables desde el primer día.

**Disparador:** el día que existan los secrets de CI (ver README, "CI: secrets
del smoke de integración"), el paso mínimo razonable es un smoke de Playwright
sobre 4 rutas —`/login`, `/dashboard`, `/tickets`, `/empleados`— verificando
que renderizan sin error de consola, **no** comparando píxeles. La comparación
de capturas es un segundo paso, y solo con baselines generados en el mismo
runner de CI.

**Lo que sigue sin cubrirse**, y conviene decirlo: el layout real, el
espaciado compuesto, el contraste en situ y cualquier cosa que dependa de CSS
aplicado. `happy-dom` no calcula estilos. Los tests de render verifican
estructura y comportamiento, no apariencia.

### Otras celdas sin validación

| Qué | Por qué no |
|---|---|
| Nombre de marca | Verificable (buscar el literal fuera de `marca.js`), pero hoy hay 0 casos y el retiro de "Sistema TI" tiene disparador propio. Se hará junto con ese retiro |
| Terminología de dominio | Los labels viven en `core/dominio-*.js` y ya son fuente única; lo que no es determinista es si el label **dice lo correcto** |
| Patrones de UX | Solo se automatiza lo estructural. "La jerarquía es correcta" no es verificable por script y no se va a fingir que sí |
| Navegación / permisos | Cubierto por el smoke de integración, que no corre por falta de secrets |

---

## 6. Las seis dimensiones de calidad

El build puede pasar, lint puede pasar, los tests pueden pasar y el contraste
puede pasar — y la interfaz verse mal. Estas son las dimensiones y su
cobertura real hoy:

| Dimensión | Qué verifica | Cobertura hoy |
|---|---|---|
| **Técnica** | Compila, sin errores de lint, lógica correcta | ✅ build + `npm run lint` + 255 tests |
| **Design System** | Tokens, componentes, consistencia | ✅ los 5 guardrails |
| **Accesibilidad** | Contraste, foco, semántica, nombres accesibles | 🟡 contraste + 3 invariantes de marcado + el contrato ARIA del modal y de la paginación verificado en render; el resto sigue siendo manual |
| **Visual** | Que el componente produzca la estructura correcta / que se vea bien | 🟡 **estructura y comportamiento**: 40 tests de render sobre DOM en memoria. **Apariencia**: sin cobertura — `happy-dom` no calcula estilos y la captura en navegador sigue bloqueada por los secrets. Ver §5 |
| **UX** | Jerarquía, densidad, flujo, estados | ❌ no automatizable; revisión humana contra `GUIA-UX-UI.md` |
| **Producto** | Que la interfaz represente las capacidades reales | 🟡 smoke de integración, hoy sin correr |

No se inventa cobertura donde no la hay. La ❌ que queda es honesta y tiene
disparador escrito.

Y conviene ser preciso con la 🟡 de **Visual**: los tests de render prueban
que el componente produce la estructura y el comportamiento correctos. No
prueban que se vea bien. Son cosas distintas y la segunda sigue descubierta.

---

## 7. El principio

> **No corregir a mano diez veces el mismo tipo de problema. Corregir el
> mecanismo que permite que exista.**

Aplicado, con los casos reales que lo originaron:

| Síntoma | Corrección puntual (insuficiente) | Mecanismo |
|---|---|---|
| La guía nombraba 3 tokens borrados esa misma mañana | Editar la guía | `tokens-vs-guia.mjs` → FANTASMA |
| Un token definido sin consumidor | Borrar el token | `tokens-vs-guia.mjs` → MUERTO / DEUDA_DECLARADA |
| `--color-text-disabled` no existía y dos sitios lo usaban | Crear el alias | `tokens-vs-guia.mjs` → REFERENCIA ROTA |
| Un radio de 8px escrito a mano | Cambiarlo por el token | `literales-vs-tokens.mjs` → régimen estricto |
| 8 modales hechos a mano sin foco atrapado | Migrarlos | `patrones-ui.mjs` → `modal-a-mano` |
| 4 campos de alta rápida sin nombre accesible | Agregar `aria-label` | `patrones-ui.mjs` → `boton-icono-sin-nombre` |
| Un principio que contradecía la práctica | Reescribir el texto | Fuente única + disparador escrito (`PLAN-MAESTRO` §3, §4) |

Antes de corregir un hallazgo, la pregunta es siempre la misma: **¿por qué el
sistema permitió que esto existiera?** Si la respuesta es "nada lo impedía",
el arreglo no está completo hasta que algo lo impida.
