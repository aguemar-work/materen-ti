---
name: sistema-ti-design
description: Criterio de UX/UI para "Materen — Sistema TI" (panel interno de gestión de empleados, tickets, correos, licencias y equipos), cuyo estándar es IBM Carbon Design System v11. Usa este skill SIEMPRE que se cree o edite cualquier página, componente, tabla, tarjeta, tag, shell o formulario de este proyecto, incluso si el usuario no menciona la palabra "diseño" — por ejemplo al pedir "agrega una vista de X", "crea un modal para Y" o "arregla el estilo de Z". También úsalo si el usuario pide hacer el sistema "más limpio", "más profesional", "más denso" o "que no se vea generado por IA".
---

# Diseño visual — Materen · Sistema TI

## Lo primero: el estándar es IBM Carbon v11

Desde el **2026-09-02** el estándar oficial de UI/UX del proyecto es el **IBM
Carbon Design System, versión 11** (decisión de producto, ver
`docs/PANORAMA-SISTEMA.md` §6). Antes de eso el sistema visual era propio —una
estética tipo shadcn, acento derivado del logo, radios de 6-16px, sombras de
elevación, tipografía Geist—; **eso ya no existe** y no se debe reintroducir.

Ante una pregunta de diseño nueva, el orden es:

1. **¿Qué dice Carbon?** Es la respuesta por defecto.
2. **¿Ya lo decidió la casa distinto?** Las desviaciones vigentes están
   listadas con su motivo en `docs/GUIA-UX-UI.md`, "Qué se adopta y qué no".
   Hoy son tres: radio 0 en el Tag (Carbon lo hace píldora), barra de 2px en
   el ítem de nav activo (Carbon usa 3px) e íconos Tabler en vez de
   `@carbon/icons`. **Una desviación nueva sin entrada ahí es un descuido, no
   una decisión** — si hace falta una, se agrega a esa tabla con su motivo.
3. Lo que Carbon no cubre se resuelve por analogía con lo que sí cubre, y
   queda documentado.

Las tres reglas que más se rompen por descuido, y que no se negocian sin leer
el motivo en la guía:

- **Radio 0.** `var(--radius-base)` en todo. El único radio distinto es el
  `50%` de un círculo (avatar, punto de no-leído, radio button), que es
  geometría, no un paso de escala.
- **Elevación plana.** Tarjetas, tablas, campos y **modales** no llevan
  sombra. `var(--shadow-overlay)` solo para lo que flota de verdad: menú,
  popover, toast, drawer. "Cero sombras difusas" es literal.
- **Cinco pasos tipográficos**, los del type set productivo:
  `--fs-label-01` (12), `--fs-body-01` (14, default), `--fs-heading-02` (16),
  `--fs-heading-03` (20), `--fs-heading-05` (32). No hay 11, 13, 15 ni 17px.

## Qué es y qué NO es este skill

Este skill da **criterio de UX/UI**: qué problema tiene una pantalla, qué
debería transmitir, qué inconsistencias evitar. **No define ni es dueño de
tokens.** Los tokens viven en dos capas y la frontera importa:

| Archivo | Qué tiene | Cuándo se toca |
|---|---|---|
| `frontend/src/styles/carbon-theme.css` | Los **valores** de Carbon (`--cds-*`): escalas de color, type set, geometría, métricas del shell | Solo si Carbon publica una versión nueva de su paleta |
| `frontend/src/styles/main.css` | Los **roles** del producto (`--color-*`, `--fs-*`, `--radius-base`…), mapeados sobre `--cds-*` | Cuando cambia de opinión el producto sobre qué significa algo |

Cuando este skill dice "dale color semántico a este tag", la tarea es
**encontrar y reutilizar el rol que ya existe** (`--color-warning-text`,
`.badge--success`), nunca inventar un segundo juego de nombres. Un `<style>`
de componente consume el ROL (`var(--color-danger-text)`), **jamás** el valor
de la escala (`var(--cds-red-70)`) — la única excepción son los
`--cds-shell-*`, que consumen los cuatro componentes del shell porque el
shell es oscuro en los dos temas.

Si de verdad hace falta un rol nuevo, se agrega a `main.css` apuntando a un
`--cds-*`, se documenta en `GUIA-UX-UI.md` y se le da un consumidor real —
si no, `scripts/tokens-vs-guia.mjs` lo reporta como MUERTO y rompe CI.

### Documentación de diseño

- `docs/GUIA-UX-UI.md` — **fuente de verdad** de tokens, tags, componentes y
  anatomía del shell. Consultarlo antes de decidir qué usar.
- `docs/GOBERNANZA-DISENO.md` — quién manda sobre qué y qué lo verifica.
- `docs/CHANGELOG.md` — historia. No leerlo para saber el estado actual.

Nombre del producto en UI: **Materen — Sistema TI** (`frontend/src/core/marca.js`).

## Contexto

Sistema TI es una herramienta **interna** (no un sitio de marketing): un
administrador de TI la usa para gestionar accesos, tickets, empleados,
correos compartidos, licencias y equipos. El objetivo es **legibilidad,
densidad de información y confianza**, no impacto visual. Nada de heroes,
animaciones llamativas ni tipografía expresiva. Es justamente por esto que
Carbon encaja: es el design system de IBM para software empresarial denso.

El producto nació como panel de credenciales, creció a ITSM y la dirección de
crecimiento es ERP. Al diseñar algo nuevo, asumir que va a convivir con
módulos de otros dominios (RRHH, Finanzas), no solo de TI.

## Guía por componente (comportamiento y estructura, no valores)

**Shell** — header de 48px en Gray 100 + SideNav de 256/48px en Gray 90 +
workspace en Gray 10. **El shell es oscuro en los dos temas**; el tema
claro/oscuro solo gobierna el workspace. Todo lo que no es navegación de
módulo va al header (búsqueda, campana, usuario); el SideNav es solo
navegación. Ítem activo: capa de gris (Gray 80) + barra de acento a la
izquierda, **nunca** texto azul (sobre Gray 80 el Blue 60 da 2.4:1).

**Header de página** (`.site-header`, dentro del workspace) — sin card ni
sombra propia. Título con más peso que el subtítulo. La acción primaria de la
vista va a la derecha, como único `.btn-primary` visible en esa vista
(principio "un solo acento visible por vista").

**Tarjetas KPI** — borde sutil, **sin sombra**. Ícono en `.icon-box` (32px,
ícono de 20px) con el fondo tenue del color semántico de su categoría; ese
color debe ser el mismo en todas las vistas donde aparezca esa categoría.
Cifra grande arriba (`--fs-heading-05`), label secundario debajo.

**Tarjetas de "Pendientes"** (contraseñas por rotar, cuentas sin contraseña,
tickets sin asignar) — que el tinte de severidad no ocupe la tarjeta entera:
preferir un borde-izquierdo de acento (hasta 2px) o un ícono + tag de conteo,
dejando el resto neutro.

**Tags de estado/prioridad/tipo** — usar `.badge .badge--*` (main.css) o
`CarbonTag` cuando haga falta `codigo` (Plex Mono, para códigos/DNI/seriales)
o `punto` (indicador sólido en color `support-*`). El significado de cada
color está en `GUIA-UX-UI.md`, "Colores semánticos", y es la fuente de
verdad: **un color significa siempre lo mismo en todo el sistema**. Nunca un
color inline ni una clase nueva para un significado que ya tiene tag.
Revisar que dos conceptos sin relación (una prioridad "Media" y un estado
"Cerrado") no terminen compartiendo el mismo modificador solo porque "quedaba
bien".

**Tablas** — `CarbonDataTable` para una vista nueva: declara las columnas una
vez y de ahí salen el `colspan` del estado vacío, el skeleton, el
ordenamiento y las alineaciones. Densidad `sm` (32px) para consulta larga,
`md` (40px) si la fila lleva controles. Encabezado en Gray 20
(`--color-bg-accent`), separador horizontal de 1px, hover de fila en
`--color-bg-hover`. **Sin bordes verticales y sin zebra**: en Carbon la
lectura la sostienen la línea y la capa de gris; con zebra el ojo sigue la
reja en vez de la fila.

**Credenciales** — `CarbonPasswordReveal`, siempre. Nunca volver a escribir a
mano el patrón `•••••••• [ojo] [copiar]`: ese componente hace el revelado
auditado, distingue el motivo `'ver'` de `'copiar'` (que es lo que queda en
`accesos_log`) y oculta a los 8 segundos.

**Avatares de iniciales** — el tono sale de `tonoAvatar(nombre)`
(`core/avatar.js`), determinístico, **nunca** elegido en la vista. Sin borde.
Ninguno reutiliza un color semántico: un avatar teñido de "danger" leería
como una alerta sobre esa persona.

**Botones** — un solo acento primario visible por vista. Si dos "primarios"
compiten en la misma pantalla (header + estado vacío), demotar uno a `.btn`.

**Texto vacío** — `TextoVacio` ("—" con `--color-text-tertiary`), para que de
un vistazo se note qué campos están vacíos.

## Proceso al aplicar este skill

1. **Antes de tocar CSS, leé `GUIA-UX-UI.md`** para saber qué rol ya existe
   para lo que querés arreglar. Si el problema es el *valor* de un rol,
   ajustá a qué `--cds-*` apunta en `main.css`; no crees uno nuevo en
   paralelo.
2. **No reescribas toda la app de una vez.** Si el cambio es de un token
   global, aplicalo una vez en `main.css` — el árbol está tokenizado al 99%
   (solo el Style Lab y el Design System tienen hex crudos, y ahí son
   contenido), así que todo lo que usa esa variable se actualiza solo.
3. Revisá módulo por módulo (Dashboard → Tickets → Empleados → Correos →
   Licencias → Equipos) que cada tag/color tenga el significado semántico
   correcto según la tabla de `GUIA-UX-UI.md` — ese es el ajuste que un
   cambio de token global no resuelve solo.
4. **No cambies la estructura, la navegación ni el copy** salvo que el
   usuario lo pida explícitamente.
5. **Permisos no son estética.** El SideNav nunca es la barrera: es el
   reflejo del guard de `router/guards.js` y de RLS. Mostrar un ítem que el
   guard bloquea produce un enlace que rebota al dashboard y escribe una fila
   de acceso denegado en cada clic. Antes de "abrir" o "cerrar" una entrada
   del nav, leer qué declara realmente la ruta (`meta.roles`, `meta.modulo`).
6. **Copy impersonal, nunca tuteo.** Títulos sustantivados ("Editar
   empleado"), imperativo de usted en formularios y errores ("Complete el
   campo", "Vuelva a iniciar sesión"). Un "No tienes permiso" es un bug de
   copy.
7. **Antes de terminar, corré los cuatro guardrails desde la raíz** — no son
   opcionales, corren en CI y los cuatro fallan el build:

   ```bash
   node scripts/contraste.mjs && node scripts/tokens-vs-guia.mjs && node scripts/literales-vs-tokens.mjs && node scripts/patrones-ui.mjs
   ```

   Y revisá: ¿algún color/tag se usa con dos significados distintos? ¿quedó
   un radio, una sombra, un color o un tamaño de fuente escrito a mano en un
   `<style>`? ¿la guía quedó diciendo algo que el código ya no hace? Si
   alguna respuesta indica un problema, corregilo antes de entregar.
