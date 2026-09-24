# frontend/AGENTS.md — reglas de UI

> Invariantes, dominio, backend y verificación: `AGENTS.md` de la raíz (no se
> repiten acá). Guía visual completa (tokens, componentes, recetas de página,
> copy, accesibilidad): `docs/SISTEMA-DISENO.md`. Historia fechada de cada
> migración de UI: `docs/archivo/frontend-AGENTS-hasta-v1.md`.

## Base

- **PrimeVue v4 en modo Unstyled + Tailwind v4.** PrimeVue no inyecta CSS
  propio: todo el look sale de Tailwind vía Pass-Through.
- **Wrapper estricto**: ninguna vista importa `primevue/*`. Todo pasa por
  `components/ui/*`, que arma el `pt` desde `components/ui/pt/<x>.pt.js`. Un
  componente de PrimeVue nuevo sigue el mismo patrón (wrapper + preset).
  - Única excepción técnica: `AppColumn.js` es un re-export de `Column` (el
    DataTable identifica columnas por la referencia exacta del componente; un
    wrapper se ignora en silencio). Su estilo sale de `pt.column.*` de
    `AppTable`.
  - `AppTable` no trae paginador: la paginación es `AppPaginacion` como
    hermano, conectada a `irAPagina`/`cambiarTamPagina` del store.
- **Tokens solo en el `@theme` de `styles/main.css`** (rampa `primary-*`
  `#0064E0` y `--font-sans`). Un solo acento de marca; no sumar escalas.
- **Ningún `.vue` tiene bloque `<style>`.** Lo que queda en
  `styles/componentes.css` son primitivas oficiales (ver SISTEMA-DISENO §3).
- Inter Variable y Tabler (`ti ti-*`) salen del bundle (sin CDN; la CSP no se
  abre). La hoja de Tabler no trae `-filled`: usar siempre outline.
- **Sin tema oscuro** (retirado el 2026-09-24: no tenía estilos). Diseñarlo
  exige antes tokens semánticos (superficie/texto/borde) en el `@theme`.

## Reglas de componentes

- **Confirmaciones**: `components/shared/ConfirmDialog.vue`. Desmontar SIEMPRE
  con `@cerrado="pendiente = null"` (se emite en todo cierre); `@cancel` solo
  significa "el usuario desistió". Tras un éxito, el padre llama `cerrar()`.
  Escuchar solo `cancel` deja el estado asignado y la siguiente confirmación
  de la pantalla nunca aparece (bug real, test en `ConfirmDialog.render.test.js`).
- **Modales de formulario**: `components/shared/Modal.vue` (26 consumidores) +
  `useFormularioModal`. `AppDialog.vue` (PrimeVue) tiene un solo consumidor
  (`TicketInternoForm`); unificar en uno de los dos es decisión pendiente —
  no crear un tercero.
- **Menú ⋮**: `MenuAcciones.vue` (sobre `AppMenu`). `aria-expanded` se
  actualiza en `alternar()`, no en `@show/@hide` (en happy-dom la transición
  no completa).
- **Botón que navega**: `AppButton` con `to` (RouterLink) o `href` (`<a>`).
- **Portal público y errores**: `components/ui/AppPortal.vue` (receta 4.5);
  cada página con un `<h1>`.
- **Actas imprimibles**: `reservarVentanaActa()` en el clic, antes de
  cualquier `await` (si no, el navegador bloquea la ventana).
- **Shell** (`AppLayout`/`AppNav`/`AppSearch`/`NotificacionesCampana`): HTML
  nativo con Tailwind; clases repetidas en `components/shared/shellClases.js`.
  El SideNav refleja los guards del router y la RLS, nunca es la barrera.

## Accesibilidad y copy

- Texto que informa: mínimo `text-gray-500` sobre blanco (4,5:1).
  `gray-400`/`gray-300` solo en íconos decorativos, `disabled:` y `placeholder:`.
- Botón solo-ícono con `aria-label`; imagen con `alt`; íconos decorativos
  `aria-hidden="true"`; todo control con etiqueta (visible o `sr-only`).
  Lo verifica `scripts/patrones-ui.mjs` en CI.
- Nunca tutear: impersonal en títulos, imperativo de usted en formularios,
  errores, toasts y mensajes al empleado.

## Revisar un cambio de UI

- `npm run dev:maqueta` (o la config `frontend-maqueta` de
  `.claude/launch.json`, puerto 5174): datos inventados y JEFE ficticio, sin
  backend. Revisar a 1440px y 375px.
- Tests de render (`tests/componentes/`): `@vue/test-utils` sobre `happy-dom`,
  pedido **por archivo** con `// @vitest-environment happy-dom` (no cambiar el
  `environment: 'node'` global). Verifican estructura y comportamiento, no
  apariencia. Al migrar una vista, actualizar solo selectores de presentación;
  nunca quitar un `expect` de comportamiento.
- Antes de corregir un hallazgo de diseño, preguntar por qué el sistema lo
  permitió: si nada lo impedía, el arreglo no está completo hasta que algo lo
  impida.
