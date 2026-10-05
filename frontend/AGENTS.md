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
  - `AppTable` recibe el orden con `:orden` (sin puentes `sortField`/`sortOrder`
    en la vista) y, si la vista escucha `@row-click`, sus filas son operables
    con teclado. Las tarjetas móviles clicables llevan `tabindex="0"` y
    `@keydown.enter.self`.
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
- **Diálogos de formulario**: `components/ui/AppDialog.vue` (PrimeVue) es el
  diálogo único (decisión del dueño, 2026-10-01): superconjunto de la API del
  antiguo `Modal` (`lateral`, `confirmarCierre`, `size`, slots `titulo`/`acciones`)
  y emite `cerrado` en todo cierre. Migrar es cambiar `<Modal>` por `<AppDialog>` y
  `@close` por `@cerrado`. Todos los módulos migraron (2026-10-02) y `Modal.vue`
  se eliminó: no se reintroduce ni se crea un tercer diálogo.
- **Reportes**: una hoja nueva usa `ReporteHoja` (carátula, sello, CSV, Imprimir, glosario) + `ReporteSecciones`;
  los reportes de la 117 son `ReporteGenerico` (ruta `/reportes/<id>`). En un módulo, el acceso a su reporte es
  `<EnlaceReporte reporte="…">`, nunca un botón Exportar ni `exportarCSV`.
- **Tonos de estado**: salen de `core/tonos.js`; un estado nuevo se agrega ahí y
  en su `core/dominio-*.js` (`tests/tonos.test.js` lo exige).
- **Errores de base**: `api/erroresDb.js` (`traducirErrorDb`) traduce 42501, P0001,
  23505/23503/23514 y red; los stores paginados y `useFormularioModal` ya lo usan.
  No mostrar `e.message` crudo en vistas nuevas (regla `error-crudo`).
- **Menú ⋮**: `MenuAcciones.vue` (sobre `AppMenu`). `aria-expanded` se
  actualiza en `alternar()`, no en `@show/@hide` (en happy-dom la transición
  no completa).
- **Botón que navega**: `AppButton` con `to` (RouterLink) o `href` (`<a>`).
- **Portal público y errores**: `components/ui/AppPortal.vue` (receta 4.5);
  cada página con un `<h1>`.
- **Actas, QR y etiquetas**: las actas son la ruta `/equipos/:id/acta/:asignacionId`
  (DNI completo: es documento legal) y se suben firmadas con `subirActa`;
  `/e/:codigo` es pública y NO consulta nada sin sesión; las etiquetas de
  50×25 mm salen de `EtiquetaEquipo` (`qrcode` solo dibuja la matriz).
- **Inicio**: una sola llamada, `stores/dashboard.js` (`cargar` / `cargarSiHaceFalta`),
  compartida con el contador del menú; un lector nuevo del resumen no llama a
  `getResumen()` directo. Escenarios de la maqueta: `/dashboard?maqueta=aldia|
  errorseccion|errorseccion-fijo|errortotal|sinrpc|asistente`.
- **Acciones que el servidor rechazaría no se ofrecen** (rol, módulo o estado);
  cada sección del expediente depende de su módulo y, sin él, no se consulta.
- **Shell V2 "marco + hoja"** (`AppLayout`/`AppNav`/`AppSearch`/
  `NotificacionesCampana`, SISTEMA-DISENO §3.1): marco `gray-50` con el
  sidebar (marca · menú · usuario) y una hoja blanca con barra de migas.
  HTML nativo con Tailwind; clases repetidas en
  `components/shared/shellClases.js`. La estructura del menú vive SOLO en
  `components/shared/navegacion.js` (la leen el SideNav y las migas). El
  SideNav refleja los guards del router y la RLS, nunca es la barrera.
- **Listados**: `AppBarraFiltros` + `AppMarcoTabla` (receta 4.1), nunca el
  `<div>` de filtros ni la card de la tabla escritos a mano. Las fichas no
  llevan enlace "← Volver" (las migas ya llevan al módulo).

## Deep-links y filtros

- Todos los listados filtran por URL (`useFiltrosUrl`, SISTEMA-DISENO
  §3.2.1): cualquier enlace puede abrir una vista filtrada, p. ej.
  `/tickets?vista=todos&categoria=<id>` (pendiente del Dashboard),
  `/tickets?asignado=yo` (mis tickets), `/empleados?estado=Inactivo`,
  `/correos?vista=compartida`, `/licencias?q=<software>` (búsqueda global).
  Un filtro nuevo es una clave del esquema, no un `route.query` leído a mano.
- `?nuevo=1` abre el alta en Equipos y Licencias (y se quita de la URL).

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
  backend. Revisar a 1440px y 390px, incluidos el menú móvil abierto, el riel
  y el menú de usuario.
- Tests de render (`tests/componentes/`): `@vue/test-utils` sobre `happy-dom`,
  pedido **por archivo** con `// @vitest-environment happy-dom` (no cambiar el
  `environment: 'node'` global). Verifican estructura y comportamiento, no
  apariencia. Al migrar una vista, actualizar solo selectores de presentación;
  nunca quitar un `expect` de comportamiento.
- Antes de corregir un hallazgo de diseño, preguntar por qué el sistema lo
  permitió: si nada lo impedía, el arreglo no está completo hasta que algo lo
  impida.
