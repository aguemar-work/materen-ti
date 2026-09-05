# Plan Maestro de Evolución de MATEREN

> **Qué es este documento.** El "Plan Maestro" se viene ejecutando desde el
> 2026-09-01 sin existir por escrito: vivía como tres viñetas dentro de
> `docs/PANORAMA-SISTEMA.md` §6 ("Tres decisiones de producto") y como
> comentarios sueltos en el código (`AppNav.vue`, `TicketsView.vue`,
> `EmpleadoDetalleView.vue`, `AsignarEquipoModal.vue`,
> `AsignarLicenciaModal.vue`). Cualquiera que abriera el repositorio veía el
> plan ejecutándose sin poder leer qué era. Esto lo cierra.
>
> **Alcance:** producto, arquitectura de información, UX, UI, Design System y
> marca. No toca modelo de datos, RLS, permisos ni reglas de negocio — para
> eso manda `docs/PANORAMA-SISTEMA.md`, que sigue siendo la fuente de verdad
> del sistema.

---

## 1. Diagnóstico

Se revisó el sistema completo antes de proponer nada: 187 tokens de
`main.css`, ~66 componentes `.vue`, 19 módulos, 16 dominios de API, el
router, los stores, las 39 tablas documentadas, los 15 ciclos de
`docs/HISTORIAL-AUDITORIAS.md` y las 2 341 líneas de `docs/GUIA-UX-UI.md`.

**La conclusión no es la esperable: MATEREN no necesita un rediseño visual.**

El sistema ya tiene lo que la mayoría de los productos empresariales no
consigue nunca:

- Tokens semánticos en dos temas, con contraste **verificado por script** en
  CI (`scripts/contraste.mjs`), no por criterio.
- Una jerarquía de bordes de 3 niveles medida contra WCAG 1.4.11.
- Una sola familia tipográfica con escalas tokenizadas de texto e íconos.
- Un shell autenticado unificado, un modelo de Vistas para filtros, un patrón
  tabla→tarjetas para móvil y `Modal.vue` compartido con foco atrapado en los
  17 modales del sistema.
- Un Dashboard construido sobre la pregunta correcta: su núcleo no son KPIs
  decorativos sino un **feed único de pendientes ordenado por urgencia real**
  que fusiona 10 categorías (`pendientesFeed.js`).
- Un historial de auditorías que rastrea cada hallazgo hasta su cierre.

Rediseñar eso "desde cero" no sería ambición: sería destruir valor real y
reintroducir la inconsistencia que costó quince ciclos eliminar.

### El defecto real

El problema de MATEREN no es cómo se ve. Es que **sus reglas de diseño están
narradas, no ejecutadas** — y por eso se degradan solas.

La evidencia estaba en el propio repositorio, repetida con distinto nombre en
casi todos los ciclos de auditoría: DS-01 a DS-05, INV-05, DP-04, DP-05,
DP-06, Q-01. El proyecto ya había nombrado el mecanismo con precisión en el
changelog del 2026-08-31:

> "un componente/patrón mejor se aplicó a una parte del sistema y nunca se
> retrofiteó al resto ni quedó escrito en `GUIA-UX-UI.md` como *la forma
> vigente*"

Cada instancia se corrigió a mano. El mecanismo nunca. El resultado es
medible, y se midió en esta pasada:

| Deriva encontrada | Evidencia |
|---|---|
| La guía tenía **dos secciones con el mismo título** ("Bordes — jerarquía de 3 niveles"), una diciendo "ya portada" y otra "pendiente de portar", con valores idénticos | Verificado contra `main.css`: `--color-border-default`/`-strong` existen. La segunda sección era falsa |
| La guía describía el anillo de foco como `rgba(0,32,63,0.28)` "derivado del navy", con el azul "pendiente de portar" | `main.css` ya tenía `rgba(0,130,251,0.28)` desde la migración G3 |
| La guía nombraba 3 tokens (`--color-brand-elevated`, `--color-brand-ink`, `--color-brand-ink`) borrados **ese mismo día** | Deriva creada en horas |
| La guía citaba `--color-focus`/`--color-focus-ring` como el mecanismo de foco | Esos tokens **nunca existieron** en `main.css` |
| La escala de espaciado completa (`--space-*`) está declarada y casi no tiene consumidores | 10 de 12 pasos muertos; todo el espaciado del sistema está hardcodeado en px |
| 17 tokens más definidos sin ningún consumidor (huérfanos categóricos `-border`, `--radius-xl`, `--z-modal-stacked`, alias de acento) | Ya diagnosticado como DP-05 y marcado "decisión pendiente" desde entonces |

Y el caso más caro de todos: el principio "sin bordes de acento en los
costados" contradecía la práctica desde hacía meses. Una nota dentro del
propio principio lo admitía y pedía que el JEFE decidiera. **Ese pedido
bloqueó la selección múltiple de Tickets durante toda la migración
`TK1`/`TK2`** — una función de producto detenida por una ambigüedad
documental, no por una dificultad técnica.

---

## 2. La tesis: qué es MATEREN 2.0

> **MATEREN 2.0 no es una piel nueva. Es el mismo producto con sus reglas
> hechas ejecutables.**

Tres pilares, en orden de impacto:

1. **Toda regla de diseño que pueda verificarse, se verifica en CI.** Si una
   regla solo vive en prosa, se degrada; el proyecto ya lo demostró quince
   veces. `scripts/contraste.mjs` fue el primer caso y funcionó: desde que
   existe, ningún par de color bajo AA volvió a entrar.
2. **Toda decisión de producto se escribe donde se ejecuta.** Una decisión
   tomada y no escrita bloquea trabajo (el caso `TK1`/`TK2`). Una decisión
   escrita solo en prosa termina contradiciéndose sola.
3. **La deuda se declara con nombre y disparador, no se olvida.** Un token
   sin consumidor es una mentira o una intención; ambas cosas deben poder
   distinguirse leyendo el código.

Lo que **no** cambia, y se conserva deliberadamente porque es la mejor
solución disponible y no por inercia: la paleta, la tipografía, el shell, el
modelo de Vistas de Tickets, el split-view, el feed de pendientes del
Dashboard, el patrón tabla→tarjetas y la arquitectura de componentes.

---

## 3. Nombre y marca

### Recomendación: conservar MATEREN. Retirar "Sistema TI" cuando llegue su disparador.

**El nombre se conserva**, y no por inercia:

- Es **neutral respecto del dominio**. La decisión de alcance del 2026-09-01
  establece que el producto crece hacia RRHH, Finanzas y Operaciones.
  "Materen" sobrevive intacto a esa expansión.
- Tiene **reconocimiento externo real, no solo interno**: aparece en el
  portal público `/soporte`, que usan empleados ajenos al staff de TI, y en
  las actas de entrega de equipos que la gente firma.
- No hay ningún problema estratégico que un cambio de nombre resolvería. Un
  nombre distinto costaría reconocimiento a cambio de nada.

**El azul `#0064E0` se conserva** — y corresponde una aclaración: esto no es
una recomendación nueva, es una decisión de producto ya cerrada el 2026-09-01
("azul confirmado como dirección final de identidad — no es una pasada más,
no se evalúan otras direcciones"). Reabrirla habría sido ignorar una decisión
tomada, no ejercer criterio. Se confirma y se respeta.

**El descriptor "Sistema TI" sí tiene fecha de vencimiento.** Es la única
pieza de la marca que contradice de frente la decisión de alcance: un
producto que se llama literalmente "Sistema TI" no puede alojar un módulo de
Finanzas sin mentir, o sin renombrarse más tarde y más caro.

**Decisión: no se retira todavía.** Hacerlo hoy cambiaría lo que ve el
usuario por un futuro que aún no llegó — exactamente el tipo de cambio
"porque se ve mejor" que corresponde resistir. Lo que sí se hizo en esta
pasada es **dejar el rename listo**: los 6 sitios que escribían el nombre a
mano ahora consumen `core/marca.js`, y la única excepción real
(`index.html`, HTML estático que no puede importar JS) quedó anotada dentro
de ese archivo.

> **Disparador explícito:** el primer módulo no-TI real que entre al sistema.
> Ese día el cambio de nombre es una línea en `core/marca.js` más el
> `<title>`, no una cacería por el repositorio.

---

## 4. Arquitectura de información y navegación

### Se conserva el sidebar. Se conserva la agrupación.

Se evaluó cambiar a top-nav, workspace y navegación contextual. **El sidebar
gana** por razones concretas, no por convención: 11 ítems de nivel superior
filtrados por permisos individuales (`staff_modulos_permisos`), donde la
visibilidad de un ítem *es* información — un ASISTENTE sin el módulo no lo
ve. Un top-nav con 11 ítems variables obliga a un menú "más" que esconde
justamente lo que distingue a un usuario de otro. El sidebar ya resuelve eso
y además soporta el rail colapsado.

### El nivel de Áreas: correcto, y ya implementado

`AppNav.vue` incorporó el 2026-09-01 un nivel de **Áreas** por encima de los
grupos, que no renderiza nada mientras exista una sola. Es la decisión
correcta y se ratifica: prepara la estructura para el crecimiento fuera de TI
sin cambiar hoy ni un píxel de lo que el usuario ve.

### La taxonomía de grupos: se difiere, con criterio

Los grupos "Activos y credenciales" y "Conocimiento y mejora" están
redactados en vocabulario de TI. `PANORAMA` §6 ya lo anotó y decidió
diferirlo. **Se ratifica la deferencia**, y conviene dejar escrito por qué es
la decisión correcta y no una postergación: no existe todavía ningún módulo
no-TI real, así que cualquier taxonomía nueva se diseñaría contra módulos
imaginarios. Renombrar grupos para un catálogo que aún no existe produce
nombres que habrá que volver a cambiar cuando el catálogo llegue.

> **Disparador:** el mismo que el del nombre — el primer módulo no-TI real.
> Ese día se rediseña la taxonomía **contra módulos que existen**.

---

## 5. Módulos: qué se conserva y por qué

La instrucción de evaluar cada módulo desde cero se cumplió. El resultado es
que la mayoría se conserva — y en cada caso la razón es que es la mejor
solución, no que ya estuviera ahí.

| Módulo | Veredicto | Razón |
|---|---|---|
| **Dashboard** | **Conservar** | Ya responde a la pregunta correcta. El feed único ordenado por urgencia real (10 categorías fusionadas en `pendientesFeed.js`) es superior a una grilla de KPIs: cada fila es una acción pendiente con destino, no una cifra. Rediseñarlo sería empeorarlo |
| **Tickets** | **Conservar el patrón** | Diez pasadas de diseño documentadas, split-view, modelo de Vistas, bandejas laterales, Triage. Es el módulo modelo del sistema; el resto debería parecerse a él, no al revés |
| **Empleados** | **Conservar la dirección en curso** | La "Ficha de Empleado" (asignar equipo y licencia desde el propio empleado, sin salir a otro módulo) es exactamente la respuesta correcta a "¿qué necesita hacer alguien que consulta un empleado?". Ya implementada el 2026-09-01 |
| **Equipos / Licencias / Correos** | **Conservar** | Comparten el patrón de listado + `MenuAcciones` + tabla→tarjetas, ya unificado en el repaso módulo por módulo de ago 2026 |
| **Problemas / KB / Encuestas** | **Conservar, sin invertir** | Adopción real muy baja (0 problemas, 1 artículo KB al último conteo). Rediseñar la UI de módulos sin uso es optimizar contra nadie. La prioridad ahí es adopción, no diseño |
| **Configuración / Actividad / Accesos sensibles** | **Conservar** | Superficies de administración de uso esporádico; ya fuera del sidebar principal por una decisión previa correcta |

### Relaciones entre entidades

El sistema ya navega de entidad a entidad sin perder contexto
(`useVolverContextual.js`; empleado→equipos/licencias/cuentas,
ticket→problema, ticket→satisfacción). No se encontró ningún caso donde el
usuario quede varado. **Sin cambios.**

---

## 6. Design System: qué cambia de verdad

### 6.1 Los guardrails de Design System

Es el cambio de mayor impacto del plan. Son **cuatro**, todos en CI, todos
deterministas. El mapa completo (qué manda, dónde se implementa, qué lo
verifica) vive en **`docs/GOBERNANZA-DISENO.md`**; acá va lo esencial.

| Script | Qué vigila |
|---|---|
| `contraste.mjs` | El **valor** de un par de color cumple WCAG |
| `tokens-vs-guia.mjs` | El **nombre** de un token es coherente entre código, uso y guía; y todo `var()` resuelve |
| `literales-vs-tokens.mjs` | Un **valor a mano** que debería ser token (color/radio/sombra/tipografía/espaciado/marca retirada) |
| `patrones-ui.mjs` | La **estructura** del marcado (modal compartido, `alt`, nombre accesible) |

`tokens-vs-guia.mjs` verifica que **tres conjuntos coincidan**: los tokens que
`main.css` define, los que el código realmente consume y los que
`GUIA-UX-UI.md` documenta. Reporta cinco clases:

- **FANTASMA** — la guía nombra un token que no existe. *Falla el build.*
- **MUERTO** — token definido sin ningún consumidor. *Falla el build.*
- **DEUDA DECLARADA** — sin consumidor **a propósito**, con el motivo escrito
  en el propio script. No falla; queda a la vista en el código.
- **REFERENCIA ROTA** — un `var(--x)` sin fallback cuyo token no existe en
  ninguna parte. *Falla el build.* Es un bug **visual** invisible para build,
  lint y tests: el navegador descarta la declaración y el elemento hereda del
  padre.
- **NO DOCUMENTADO** — token vivo que la guía nunca menciona. Aviso: es la
  lista de trabajo para que la documentación alcance al código (hoy: 101).

Sigue el consumo de forma **transitiva**, así que la capa de alias
`--color-*` → `--*` no produce falsos muertos. La región
`<!-- tokens-retirados -->` de la guía se ignora a propósito, para que
documentar bien un retiro no cuente como deriva.

En su primera corrida encontró 5 derivas reales de documentación y 27 tokens
sin consumidor. Las 5 están corregidas; 26 quedaron declarados con su motivo.
El 27.º no era deuda sino un **bug vivo**: `--color-text-disabled` figuraba
sin consumidor porque su alias `--color-text-disabled` **nunca se creó**, y
`MenuAcciones.vue` y `.celda-sep` lo consumían sin fallback — los ítems
deshabilitados no se veían deshabilitados. Alias creado, check de REFERENCIA
ROTA agregado para que esa clase de bug no vuelva a pasar inadvertida.

### 6.2 La escala de espaciado — la deuda real del sistema

`--space-1` a `--space-12` están declarados desde el inicio. **Solo
dos tienen consumidor.** Todo el espaciado de MATEREN está hardcodeado en px,
componente por componente.

Es la brecha más grande entre lo que el Design System dice ser y lo que es.
Borrarla sería peor que dejarla — equivaldría a aceptar que el sistema no
tiene escala de espaciado.

**Decisión: adoptarla por fases, con un mecanismo que impide el retroceso.**

**Ya ejecutado (2026-09-01):** `components/shared/` migrado — 61 declaraciones
en 12 componentes compartidos, el punto de mayor apalancamiento porque los
consume todo módulo. Criterio: solo declaraciones donde **todos** los valores
en px coinciden exactamente con un paso de la escala; una declaración a medias
no reduce deuda y ensucia la lectura. La sustitución está **probada como
visualmente nula**: los 12 pasos usados se verificaron contra los valores
reales de `main.css` antes de escribir. Total de literales de espaciado:
541 → 480.

**El mecanismo:** `literales-vs-tokens.mjs` fija una línea base
(`scripts/literales-base.json`) y falla el build solo si el número **sube**.
La deuda solo puede encoger. Tras una migración se consolida con
`--fijar-base`, que únicamente acepta bajar. Esto convierte "adoptar
progresivamente" de una intención en una garantía.

**Siguiente tanda, por apalancamiento:** los módulos con más literales, uno por
cambio, verificando build + tests después de cada uno.

> **Regla vigente:** ningún componente nuevo, ni ninguno que se toque, escribe
> espaciado en px. Se usa `var(--space-N)`. La escala existente (2·4·6·8·10·12·16·20·24·32·40·48) no se
> rediseña: ya cubre los valores reales en uso, con **una excepción medida**:
> 14px se usa ~55 veces y no tiene paso (la escala salta de 12 a 16). Es una
> decisión de producto abierta — ver `docs/GOBERNANZA-DISENO.md` §4.

### 6.3 El principio de bordes — resuelto

La contradicción constitucional quedó cerrada en `GUIA-UX-UI.md` con la
decisión del 2026-09-01, reescrita para decir lo que el sistema hace:

> **Ningún acento estructural supera 2px.** Se permite borde **izquierdo** de
> acento de hasta 2px para severidad y para selección. Otros costados, no.

---

## 6.4 El trabajo de personal: una tarea, no cuatro módulos

Propuesta de diseño del 2026-09-01, con la primera parte ya en producción.

**El diagnóstico está en el propio código.** Materen ya resolvió una de las dos
caras de la misma tarea y dejó la otra sin resolver:

| | Cómo se hace hoy |
|---|---|
| **Dar de baja** | Un botón. `dar_baja_empleado` (migración 038) cierra asignaciones de cuenta y licencia, da de baja las cuentas personales y marca a la persona inactiva — las cuatro escrituras en una transacción |
| **Dar de alta** | Empleados → Correos → Licencias → Equipos. Cuatro módulos, cuatro contextos, sin nada que garantice que se completen los cuatro |

La misma persona, el mismo día, dos experiencias opuestas. Y media alta no
dejaba rastro: quedaba una persona Activa sin correo ni equipo, sin ninguna
señal de que la operación no había terminado.

**Ejecutado (2026-09-01):** el estado derivado *alta incompleta*.

- `altaIncompleta()` en `core/dominio-empleados.js` — regla pura y probada:
  persona **Activa**, dada de alta hace **≤30 días**, con **0 cuentas**
  activas. No exige equipo ni licencia a propósito: dependen del cargo, y
  exigirlos marcaría media planilla de campo hasta volver el aviso ruido.
- `empleadosApi.altasIncompletas()` — una consulta con embed, dentro de la
  ventana de fecha. **Solo puede llamarla quien tenga el módulo `correos`**:
  `asignaciones_cuenta` está gateada por RLS (migración 068) y sin él el embed
  vuelve vacío, así que todos los empleados recientes parecerían sin cuenta.
  El gate vive en `DashboardView.vue`, igual que el de las stat-cards.
- Categoría **"Alta sin completar"** en el feed de pendientes. Tier 2 los
  primeros días —un alta en curso no es un olvido— y tier 1 pasados 3, con el
  mismo criterio que "Ticket abierto +3 días" ya usaba.
- El banner de alta guiada de la ficha **deja de depender del query param**.
  Antes vivía solo en `?nuevo=1`: cerrar la pestaña o entrar desde el buscador
  lo perdía y nada volvía a avisar. Ahora deriva del estado real, y la X
  silencia el caso "recién creado" pero no un pendiente de verdad — ningún
  otro pendiente del sistema se marca como visto con un clic.

**Ejecutado (2026-09-01, segunda tanda): la guía de alta ejecuta.**

La conclusión al abrir el código fue que **no hacía falta un asistente
aparte**: la ficha del empleado ya era la superficie donde ocurren los cuatro
pasos (`CuentasPanel`, `AsignarEquipoModal`, `AsignarLicenciaModal` ya vivían
ahí). Lo que faltaba era que la guía conectara con ellos. Un asistente en
modal habría duplicado el mecanismo — el patrón que este plan existe para
evitar.

- Los pasos pasaron de **texto informativo a acciones**. Cada paso pendiente
  trae su botón y abre el formulario que corresponde, en el sitio. Antes la
  guía decía qué faltaba y dejaba al usuario buscando el botón correcto más
  abajo en la página, que es precisamente por lo que las altas se completaban
  a medias.
- `pasosAlta()` y `altaLista()` viven en `core/dominio-empleados.js`, no en la
  vista: *qué hace falta para que alguien pueda empezar a trabajar* es una
  regla de negocio. La vista solo engancha qué botón abre qué modal.
- `CuentasPanel` expone `abrirNueva()` (mismo patrón que `Modal.vue`) para que
  el paso "Cuenta" dispare su formulario sin que el usuario lo busque.
- **El listado de Empleados también lo muestra**: el chip de cuentas de la
  fila ya distinguía "0 cuentas" con un tono apagado; ahora, cuando además es
  un alta reciente, toma el tono de atención. Cero cuentas no significa lo
  mismo en alguien que entró la semana pasada que en alguien de hace dos años.
  Sin elementos nuevos en la fila, sin consultas nuevas — el listado ya traía
  los conteos.

**Pendiente:** nada del flujo. Las cuatro APIs se orquestan desde la ficha sin
salir de ella.

**Decisión pendiente, de producto y no técnica:** renombrar "Empleados" a
**"Personas"**. Sobrevive mejor al crecimiento fuera de TI ya decidido e
incluye a quien no está en planilla. No se ejecutó: es un cambio visible que
no puede inferirse técnicamente.

---

## 7. Responsive

Sin cambios de dirección. El sistema ya distingue experiencias en vez de
encoger la de escritorio: patrón tabla→tarjetas en los módulos operativos,
drawer en lugar de sidebar, `MenuAcciones` consolidando acciones de fila, y
excepciones documentadas donde la tarjeta no aplica (Actividad, log de solo
lectura). La regla de espaciado de §6.2 rige igual en móvil.

---

## 8. Límites reales: qué pide datos o API que no existen

Ninguna propuesta de este plan requiere datos ni endpoints nuevos — a
propósito. Lo que sí conviene registrar, porque son experiencias que valdrían
la pena y **hoy no se pueden construir**:

| Experiencia | Qué falta | Estado |
|---|---|---|
| Cerrar un ticket capturando cómo se resolvió, y que eso alimente la KB | No existe campo de "resumen de resolución"; `guardarComoBorradorKb()` crea el artículo con `sintoma`/`solucion` vacíos | Pendiente ya registrado en `PANORAMA` §7 |
| Métricas de tiempo de atención / vencimiento | No hay ninguna columna de SLA. **Decisión de negocio, no deuda técnica** | `PANORAMA` §6 — no implementar sin un caso real |
| Editar la clasificación de subcategorías desde la UI | La API ya lo soporta (`updateSubcategoriaTicket`, 3.er argumento); no hay formulario | `PANORAMA` §7 |

No se diseñó ninguna de las tres en esta pasada: hacerlo habría sido diseñar
contra capacidades inexistentes.

---

## 9. Fases

Ordenadas por impacto real, no por comodidad.

> **Actualizado 2026-09-02 — IBM Carbon v11.** Este plan se escribió el
> 2026-09-01, un día antes de que se adoptara Carbon como estándar de UI/UX
> (decisión de producto, `PANORAMA-SISTEMA.md` §6). La adopción **no
> reemplaza** estas fases — la tesis de §2 sigue siendo la misma, y el
> mecanismo de §6.1/§6.2 es justamente lo que permitió re-basar 85 vistas
> con una edición de tokens. Lo que cambia es esto:
>
> - La **Fase 2 está hecha** y no se había registrado: NO DOCUMENTADO llegó
>   a 0 con la reescritura de la guía y ya falla el build.
> - Se agregan las fases **8** y **9**, que son la convergencia de la capa de
>   COMPONENTES (Carbon re-basó la de tokens; los componentes siguen teniendo
>   forma del sistema anterior).
> - La Fase **3** (espaciado) y la **4** (huérfanos) se absorben dentro del
>   barrido por módulo de la Fase 9: tocar un módulo para migrarlo y después
>   volver a tocarlo para su espaciado es abrirlo dos veces.
> - La Fase **5** ("adopción, no diseño" en Problemas/KB/Encuestas) sigue
>   vigente y **acota** la Fase 9: esos tres reciben el cambio mecánico de
>   componentes, ningún rediseño.

| Fase | Contenido | Estado |
|---|---|---|
| **0 — Decisiones** | Azul final; borde de acento ≤2px válido; alcance más allá de TI | ✅ 2026-09-01 |
| **1 — Reglas ejecutables** | `tokens-vs-guia.mjs` en CI; 5 derivas corregidas; principio de bordes reescrito; `marca.js` consolidado | ✅ 2026-09-01 |
| **1b — Cierre del ciclo de calidad** | 4 guardrails en CI (+ `literales-vs-tokens.mjs`, `patrones-ui.mjs`, check de referencias rotas); `docs/GOBERNANZA-DISENO.md`; bug de `--color-text-disabled` corregido; overlay tokenizado; 11 radios migrados; 3 nombres accesibles agregados | ✅ 2026-09-01 |
| **2 — La guía alcanza al código** | Documentar los tokens vivos sin mención. Meta: el aviso NO DOCUMENTADO baja a 0 y pasa a fallar el build como los otros dos | ✅ 2026-09-02 — llegó a 0 con la reescritura de la guía para Carbon, y ya falla el build |
| **3 — Escala de espaciado** | `components/shared/` ✅ (61 declaraciones, 541→480; hoy 453). Siguen los módulos por frecuencia de uso, uno por cambio. El trinquete impide el retroceso | En curso — **absorbida por la Fase 9**: cada módulo migra su espaciado en el mismo cambio en que adopta los componentes |
| **4 — Retiro de huérfanos** | Borrar los tokens sin consumidor que no son escala de espaciado (DP-05), más las clases de `main.css` que queden muertas al migrar los módulos | Cuando el árbol esté limpio — **es la Fase 9d** |
| **5 — Adopción, no diseño** | Problemas, KB y Encuestas necesitan uso real antes que rediseño | Depende de negocio |
| **6 — Taxonomía y nombre** | Retirar "Sistema TI"; rediseñar los grupos del sidebar contra módulos reales | Disparador: primer módulo no-TI |
| **7a — Render de componentes** | `@vue/test-utils` + `happy-dom`; `frontend/tests/componentes/` cubre el contrato ARIA del modal compartido, los estados (vacío, sin dato, paginación, badge) y la pantalla de error de red. Suite 215 → 255 | ✅ 2026-09-01 |
| **7b — Captura en navegador** | Smoke de Playwright sobre `/login`, `/dashboard`, `/tickets`, `/empleados` verificando render sin error de consola (no comparación de píxeles). **No incorporable hoy**: necesita los mismos secrets que ya tienen a `test-integration` en rojo, y sería un tercer check que no corre. Razonamiento en `docs/GOBERNANZA-DISENO.md` §5 | Disparador: secrets de CI cargados. **Sube de prioridad con Carbon**: la Fase 9 toca las 21 vistas de listado y hoy la única verificación visual posible es humana |
| **8 — Biblioteca de componentes Carbon** | `components/carbon/`: `CarbonButton` (5 variantes × 4 tamaños — hoy hay un solo alto de 36px), campo **filled** (`CarbonTextInput`/`Select`/`TextArea` — hoy son cajas con borde en los 4 lados), `CarbonNotification` (unifica las **dos** familias de aviso que conviven), `CarbonTabs`/`CarbonContentSwitcher` (absorben los **tres** lenguajes de "seleccionado" que existen hoy), `CarbonPagination`, footer de modal al ras, y extender `CarbonDataTable` para que el render móvil salga de la misma definición de columnas. Un test de render por componente; los módulos no cambian todavía | ✅ 2026-09-02 — con 2 desvíos declarados: `CarbonCampo` es un solo componente para los tres tipos (no tres archivos separados, ver su comentario de cabecera) y son 3 tamaños, no 4 (`xl`/`2xl` sin consumidor). El footer de modal al ras queda pendiente, ahora atado a la Fase 9 (ver su nota) |
| **9 — Convergencia por módulo** | Migrar cada módulo a la biblioteca, uno por cambio, con build + tests + los 5 guardrails después de cada uno. El trabajo real es **borrar**: 5 449 líneas de `<style>` local (25% del código de módulos) y 609 de template duplicado (17 listados renderizan cada fila dos veces, `<tr>` y tarjeta). Olas C1..C8 y el checklist de "migrado" en el plan de convergencia | En curso — **C1 completo** (2026-09-03, `EmpresasView`, piloto). El footer de modal al ras de la Fase 8 sigue sin aplicarse: `.modal-actions` la comparten 39 consumidores del slot `#acciones`, casi todos aún con `.btn`; se aplica con masa crítica migrada o con un modificador de opt-in en `Modal.vue` |

---

## 10. Qué NO hacer

Registrado para que una pasada futura no lo redescubra como si fuera idea
nueva:

- **No rediseñar el Dashboard** para llenarlo de KPIs. Su feed de pendientes
  ya es superior a una grilla de cifras.
- **No reabrir la dirección de marca.** Cerrada el 2026-09-01.
- **No renombrar los grupos del sidebar** antes de que exista un módulo
  no-TI: se diseñaría contra módulos imaginarios.
- **No borrar la escala de espaciado** para que el verificador quede en
  verde. El objetivo es adoptarla.
- **No invertir diseño en Problemas / KB / Encuestas** hasta que tengan uso
  real.
- **No introducir acciones masivas** en un módulo sin verificar antes que la
  API y RLS las soporten de verdad.
- **No resolver por cuenta propia las decisiones pendientes** que imprime
  `literales-vs-tokens.mjs` (14px sin token, radios fuera de escala,
  `--color-whatsapp-text`). Todas cambian lo que se ve; son decisión de
  producto, no criterio técnico.
- **No subir a mano la línea base del trinquete** de espaciado. Existe para
  que la deuda solo baje; subirla la vacía de sentido.
- **No agregar un check que no pueda correr.** Un check en verde que no
  verificó nada es peor que no tenerlo — es el hallazgo Q-01. Ver
  `docs/GOBERNANZA-DISENO.md` §5.
