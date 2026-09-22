// Preset Pass-Through de primevue/dialog, en Tailwind. Usado por
// ConfirmDialog.vue (components/shared/, 31 vistas) y por AppDialog.vue
// (components/ui/, formularios en modal — hoy solo TicketInternoForm.vue)
// — mismo preset, dos anchos distintos vía `size` (ConfirmDialog no pasa
// nada, se queda en 'sm' por defecto, cero cambio de comportamiento).
//
// Reglas de diseño pedidas: estética minimalista, backdrop semitransparente,
// sin bordes gruesos (1px, igual que el resto del sistema).
const ROOT_BASE = 'rounded-lg border border-gray-200 bg-white shadow-xl';
const ANCHO = {
  sm: 'w-[90vw] max-w-sm', // confirmaciones — ConfirmDialog.vue
  md: 'w-[90vw] max-w-xl', // formularios cortos — AppDialog.vue
};

const MASK = 'bg-black/40';

const HEADER = 'flex items-start justify-between gap-3 px-5 pt-5 pb-3';
const TITLE = 'text-base font-semibold text-gray-900';
const CONTENT = 'px-5 pb-2 text-sm text-gray-600';
const FOOTER = 'flex justify-end gap-2 px-5 pb-5 pt-4';

// El botón "cerrar" (X) del header es un Button real de PrimeVue por
// dentro (ver dialog/Dialog.vue) — su `pt` es la MISMA forma que
// button.pt.js (root/icon/...), no una sección más de Dialog.
const CLOSE_BUTTON = {
  root: {
    class:
      'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 ' +
      'hover:bg-slate-50 hover:text-gray-600 focus-visible:outline-none ' +
      'focus-visible:ring-2 focus-visible:ring-primary-500',
  },
};

export function buildDialogPT({ size = 'sm' } = {}) {
  return {
    root: { class: `${ROOT_BASE} ${ANCHO[size] || ANCHO.sm}` },
    mask: { class: MASK },
    header: { class: HEADER },
    title: { class: TITLE },
    pcCloseButton: CLOSE_BUTTON,
    content: { class: CONTENT },
    footer: { class: FOOTER },
  };
}
