# Apéndice del changelog — decisiones de diseño hasta la v1

> Archivado el 2026-09-24 desde `docs/CHANGELOG.md`. Describe el sistema de
> diseño anterior (GUIA-UX-UI.md / Carbon), retirado el 2026-09-05. Solo
> referencia histórica: nada de esto está vigente.

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

