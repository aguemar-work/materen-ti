// Clases de Tailwind compartidas por las piezas del shell (AppLayout,
// AppNav, AppSearch, NotificacionesCampana): los botones solo-ícono de la
// barra de la hoja y la superficie de los paneles flotantes (búsqueda,
// notificaciones) tienen que verse iguales entre sí, y viven en componentes
// distintos. Un solo lugar para que no diverjan — mismo motivo que los
// presets de components/ui/pt/, pero para HTML nativo que no pasa por
// PrimeVue.

// Botón solo-ícono de la barra superior de la hoja (y del marco): sin borde,
// hover con fondo tenue. Mismo alto (32px) que el resto de controles
// compactos del sistema V2.
export const ACCION_HEADER =
  'relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg text-gray-500 ' +
  'transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

// Panel flotante teletransportado a <body>, posicionado por
// usePopoverFlotante (top/left inline). Borde de 1px + sombra: es la única
// superficie que flota sobre el contenido, necesita despegarse de él.
export const PANEL_FLOTANTE =
  'fixed z-50 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg';

// Fila clickeable dentro de un panel flotante.
export const ITEM_PANEL =
  'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-gray-800 ' +
  'transition-colors duration-100 hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none';

// Rótulo de grupo dentro de un panel flotante y del SideNav: versalita chica
// y espaciada, para que se lea como etiqueta de sección y no como un ítem.
export const ROTULO_GRUPO = 'px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500';
