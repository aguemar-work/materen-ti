---
name: sistema-ti-design
description: Criterio de UX/UI para "Sistema TI" (dashboard interno de gestión de empleados, tickets, correos, licencias y equipos). Usa este skill SIEMPRE que se cree o edite cualquier página, componente, tabla, tarjeta, badge, sidebar o formulario de este proyecto, incluso si el usuario no menciona la palabra "diseño" — por ejemplo al pedir "agrega una vista de X", "crea un modal para Y" o "arregla el estilo de Z". También úsalo si el usuario pide quitar el fondo crema, hacer el sistema "más limpio", "más profesional" o "que no se vea generado por IA".
---

# Diseño visual — Sistema TI

## Qué es y qué NO es este skill

Este skill da **criterio de UX/UI**: qué problema tiene una pantalla, qué debería transmitir, qué
inconsistencias evitar. **No define ni es dueño de tokens** (colores hex, radios, sombras, tamaños de
fuente) — esos ya existen y viven en `frontend/src/styles/main.css` (variables `--mat-*` y su alias
semántico `--color-*`) y están documentados en `docs/GUIA-UX-UI.md`. Cuando este skill dice "usa un fondo
más frío" o "dale color semántico a este badge", la tarea es **encontrar y reutilizar la variable o clase
ya existente que corresponde** (`--color-bg-subtle`, `.badge--success`, `--radius-md`, etc.), o ajustar el
*valor* de una variable ya existente si el problema es el valor en sí (ej. `--mat-color-bg` es cálido y
debería ser neutro/frío) — nunca inventar un segundo sistema de nombres en paralelo. Si hace falta un token
verdaderamente nuevo (un color semántico que no existe todavía), agrégalo al lugar donde ya viven los demás
(`main.css`, siguiendo el patrón `--mat-color-*` → alias `--color-*`) y documéntalo en `GUIA-UX-UI.md`, en
vez de crear una hoja de estilos o convención aparte.

## Contexto y diagnóstico

Sistema TI es una herramienta interna (no un sitio de marketing): un administrador de TI la usa para
gestionar accesos, tickets, empleados, correos compartidos, licencias y equipos. El objetivo es
**legibilidad, densidad de información y confianza**, no impacto visual. Nada de heroes, animaciones
llamativas ni tipografía expresiva — eso es para landing pages, no para software de gestión interna.

El diseño actual tiene una base funcional razonable (sidebar con iconos, tarjetas KPI, tablas, badges de
estado), pero cae en problemas específicos y reconocibles:

- **El fondo del área de contenido (`--mat-color-bg`, hoy un crema/beige cálido) choca con la marca real.**
  El logo de Sistema TI es verde pino oscuro + verde menta — cero calidez, cero beige. Un fondo cálido no
  es "un estilo alternativo válido" acá: no transmite "software empresarial", transmite "landing page
  genérica" (es además el look por defecto que producen los modelos de IA sin dirección). Un dashboard
  real (Linear, Notion, Vercel, Stripe) usa un fondo neutro y frío, casi imperceptible, que separa
  contenido de tarjetas sin competir con la marca.
- **Los colores de badges no siempre son semánticos.** Revisa que dos conceptos sin relación (ej. una
  prioridad "Media" y un estado "Cerrado") no terminen compartiendo el mismo `.badge--*` solo porque
  "quedaba bien" — la tabla de significados ya está en `GUIA-UX-UI.md` ("Badges — sistema unificado"); un
  color debe significar siempre lo mismo en todo el sistema, y ese documento es la fuente de verdad, no
  este skill.
- **Los íconos de las tarjetas KPI y los avatares de empleados pueden usar colores sin relación con la
  categoría que representan**, viéndose inconsistentes entre vistas. Cada categoría (empleados, accesos,
  correos, licencias, equipos) debería tener un color fijo y reutilizarlo siempre, tomado de la paleta
  semántica ya existente.
- **Falta separación clara entre el sidebar y el contenido** cuando ambos quedan claros y sin borde — se
  funden entre sí en lugar de leerse como "navegación" vs. "contenido". Ya existe `--color-border-subtle`
  para esto.
- **Jerarquía visual débil** entre título de página, KPIs y tablas cuando casi todo pesa igual — resolver
  con la escala tipográfica y de peso ya definida (`--fs-*` en `main.css` / tabla de tipografía en
  `GUIA-UX-UI.md`), no inventando tamaños nuevos.
- **Texto vacío ("—", "Sin usuarios", "Sin Proveedor") debe distinguirse del contenido real** — usar
  `--color-text-tertiary`/`--color-text-secondary` en vez del color normal de celda, para que de un
  vistazo se note qué campos están vacíos.

No se trata de "reinventar" el producto — la estructura (sidebar + KPIs + pendientes + tablas) funciona
bien y se mantiene. Se trata de aplicar con más disciplina el sistema de tokens y clases que **ya existe**.

### Si ya existen otros documentos de diseño en el repo (`MATEREN-CORE.md`, `GUIA-UX-UI.md`, etc.)

`GUIA-UX-UI.md` es la fuente de verdad para tokens, badges y componentes de dominio de este proyecto —
consúltalo antes de decidir qué variable/clase usar. Trata con escepticismo cualquier documento que
describa una marca/casa de marca ("Materen"), productos hermanos que Sistema TI nunca mencionó (un
"planificador", un módulo de contabilidad), changelogs con "decisiones" o fechas que nadie confirmó, o
gobernanza de documentación (anclas, precedencia, versión v1.x) para una sola herramienta interna — eso es
alcance inventado por un agente anterior, no un requisito del usuario. Ignóralo salvo que el usuario lo
confirme explícitamente. Este skill se limita a Sistema TI como producto único; no crea ni asume marca
compartida con nada más.

## Guía por componente (comportamiento y estructura, no valores)

**Sidebar** — necesita separación visual clara del contenido (borde sutil existente,
`--color-border-subtle`). Ítem activo con fondo tenue del color de acento y texto/ícono a juego con ese
mismo acento — nunca un color de acento distinto al del resto de la UI (botones primarios, focus ring).

**Header de página** — sin card ni sombra propia, se funde con el fondo del contenido. Título con más peso
que el subtítulo. La acción primaria de la vista (ej. "+ Nuevo empleado") va a la derecha, como único botón
`.btn-primary` visible en esa vista (ver principio "un solo acento visible por vista" en `GUIA-UX-UI.md`).

**Tarjetas KPI** — borde sutil + sombra mínima (ya existen `--shadow-sm`/`--radius-md`, no subas la
sombra en hover salvo que la tarjeta sea clicable). Ícono en un contenedor cuadrado con fondo tenue del
color semántico de su categoría; ese color debe ser el mismo en todas las vistas donde aparezca esa
categoría (empleados, accesos, correos, licencias, equipos). Número grande arriba, label secundario debajo.

**Tarjetas de "Pendientes"** (contraseñas por rotar, cuentas sin contraseña, tickets sin asignar) — evita
que el tinte de severidad (warning/danger) ocupe toda la tarjeta o toda la franja del header, porque compite
con el contenido; preferí un borde-izquierdo de acento, o un ícono + badge de conteo, dejando el resto de
la tarjeta neutro.

**Badges de estado/prioridad/tipo** — siempre usar las clases `.badge--*` ya definidas y su significado
documentado en `GUIA-UX-UI.md`; nunca un color inline ni una clase nueva para un significado que ya tiene
badge asignado.

**Tablas** — encabezado con fondo sutil distinto al de las filas, sin bordes verticales, sin
zebra-striping; separador horizontal sutil entre filas; hover de fila con el mismo fondo sutil del
encabezado. Ver también el patrón de paginación ya documentado en `GUIA-UX-UI.md` para tablas largas.

**Avatares de iniciales** — color de fondo consistente por persona/entidad a través de las vistas (puede
derivarse de un hash del nombre sobre la paleta semántica existente), nunca aleatorio en cada render.

**Botones** — un solo verde/acento para "primario" en toda la vista; si dos botones "primarios" compiten
por atención en la misma pantalla (ej. header + estado vacío), demota uno a secundario (`.btn`) — ya hay
una corrección de este tipo documentada en `GUIA-UX-UI.md`.

## Proceso al aplicar este skill

1. **Antes de tocar CSS, lee `GUIA-UX-UI.md`** para saber qué token/clase ya existe para lo que querés
   arreglar. Si el problema es el *valor* de un token existente (ej. `--mat-color-bg` demasiado cálido),
   ajustá ese valor en `main.css`, no crees uno nuevo en paralelo.
2. **No reescribas toda la app de una vez.** Si el cambio es de un token global (fondo, tipografía base),
   aplicalo una vez en `main.css` — todo lo que ya usa esa variable se actualiza solo.
3. Revisa módulo por módulo (Dashboard → Tickets → Empleados → Correos → Licencias → Equipos) que cada
   badge/color tenga el significado semántico correcto según la tabla de `GUIA-UX-UI.md` — este es el
   ajuste manual que un cambio de token global no resuelve solo.
4. **No cambies la estructura, la navegación ni el copy** salvo que el usuario lo pida explícitamente — el
   objetivo es limpieza visual y consistencia, no un rediseño funcional.
5. Antes de terminar, revisa: ¿el fondo del área de contenido dejó de ser cálido/crema? ¿algún
   color/badge se usa con dos significados distintos en el mismo sistema? ¿el sidebar tiene separación
   clara del contenido? ¿se agregó algún valor o clase nueva que debería haber sido una reutilización de
   algo ya existente en `main.css`/`GUIA-UX-UI.md`? Si alguna respuesta indica un problema, corregilo antes
   de entregar.
