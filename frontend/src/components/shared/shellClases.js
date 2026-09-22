// Clases de Tailwind compartidas por las piezas del shell (AppLayout,
// AppSearch, NotificacionesCampana): los botones solo-ícono del header y la
// superficie de los paneles flotantes (búsqueda, notificaciones) tienen que
// verse iguales entre sí, y viven en tres componentes distintos. Un solo
// lugar para que no diverjan — mismo motivo que los presets de
// components/ui/pt/, pero para HTML nativo que no pasa por PrimeVue.

// Botón solo-ícono del header: sin borde, hover con fondo tenue (principio
// del JEFE: "estados hover/activo sin bordes, solo fondos muy tenues").
export const ACCION_HEADER =
  'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-gray-600 ' +
  'transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

// Panel flotante teletransportado a <body>, posicionado por
// usePopoverFlotante (top/left inline). Borde de 1px + sombra suave: es la
// única superficie que flota sobre el contenido, necesita despegarse de él.
export const PANEL_FLOTANTE =
  'fixed z-50 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg';

// Fila clickeable dentro de un panel flotante.
export const ITEM_PANEL =
  'flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-800 ' +
  'transition-colors duration-100 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none';

// Rótulo de grupo dentro de un panel (y del SideNav).
export const ROTULO_GRUPO = 'px-3 pb-1 pt-3 text-xs font-medium text-gray-500';
