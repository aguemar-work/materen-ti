// Presets Pass-Through de primevue/dialog, en Tailwind.
//   - buildDialogPT():     ConfirmDialog.vue (components/shared/, 31 vistas).
//                          Confirmaciones cortas; no cambió con la
//                          unificación Modal -> AppDialog.
//   - buildFormDialogPT(): AppDialog.vue (formularios y paneles en modal,
//                          centrado o lateral). Reproduce el aspecto de las
//                          antiguas clases `.modal-*` (retiradas junto con
//                          Modal.vue el 2026-10-02): mismos anchos, radios,
//                          rellenos y animaciones.
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
      'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 ' +
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

// ── AppDialog (formularios / paneles) ───────────────────────────────────────
// Equivalencia con las clases `.modal-*` que reemplaza:
//   .modal-bg            -> mask    (z-50 propio: el z-index automático de
//                                    PrimeVue, 1100, dejaba por debajo a las
//                                    listas flotantes de BuscadorCombo, z-60)
//   .modal / .modal-<s>  -> root    (anchos de FORM_ANCHO)
//   .modal-title         -> header / title
//   .modal-body          -> content (único bloque que desplaza)
//   .modal-actions       -> footer  (filete superior con margen lateral)
//   .modal--lateral      -> root con `lateral` (alto completo, filete izquierdo)
//   modal-anim*          -> transition (Tailwind; sin movimiento si el sistema
//                                       pide reducirlo)
const FORM_ANCHO = {
  '': 'max-w-[540px]',
  sm: 'max-w-[440px]',
  md: 'max-w-[540px]',
  detail: 'max-w-[620px]',
  lg: 'max-w-[680px]',
};

// Clases completas (no armadas por pedazos): Tailwind solo genera las que
// lee escritas literalmente en el código fuente.
const FORM_ROOT_CENTRADO = 'max-h-[90dvh] rounded-xl border border-gray-200';
const FORM_ROOT_LATERAL = 'h-full max-h-full rounded-none border-l border-gray-200 max-[480px]:max-w-full';
const FORM_ROOT_BASE = 'flex w-full flex-col overflow-hidden bg-white shadow-xl focus:outline-none';

const FORM_MASK_VISIBLE = 'z-50 bg-gray-900/40';
// Al cerrar, el fondo se desvanece con el panel (la máscara de PrimeVue no
// pasa por <transition>, así que se anima por clase).
const FORM_MASK_SALIENDO = 'z-50 bg-transparent transition-colors duration-150 motion-reduce:transition-none';

const FORM_TITLE = 'text-base font-semibold text-gray-900';

// Entrada/salida del panel. `rapida` = diálogos sobre otro diálogo.
const FORM_TRANSICION = {
  centrado: {
    desde: 'opacity-0 scale-[0.97]',
    entra: 'transition duration-200 ease-out motion-reduce:transition-none',
    sale: 'transition duration-150 ease-in motion-reduce:transition-none',
    rapidaEntra: 'transition duration-100 ease-out motion-reduce:transition-none',
    rapidaSale: 'transition duration-100 ease-in motion-reduce:transition-none',
  },
  lateral: {
    desde: 'translate-x-full',
    entra: 'transition duration-200 ease-out motion-reduce:transition-none',
    sale: 'transition duration-150 ease-in motion-reduce:transition-none',
  },
};

export function buildFormDialogPT({
  size = '',
  lateral = false,
  conCabecera = true,
  conPie = false,
  saliendo = false,
  rapida = false,
} = {}) {
  const t = lateral ? FORM_TRANSICION.lateral : FORM_TRANSICION.centrado;
  const entra = !lateral && rapida ? t.rapidaEntra : t.entra;
  const sale = !lateral && rapida ? t.rapidaSale : t.sale;
  return {
    root: {
      class: [FORM_ROOT_BASE, FORM_ANCHO[size] ?? FORM_ANCHO[''], lateral ? FORM_ROOT_LATERAL : FORM_ROOT_CENTRADO].join(' '),
      // Sin título visible el panel igual necesita poder recibir el foco
      // (AppDialog lo usa como foco de reserva).
      tabindex: -1,
    },
    mask: {
      class: [lateral ? 'p-0' : 'p-4', saliendo ? FORM_MASK_SALIENDO : FORM_MASK_VISIBLE].join(' '),
    },
    transition: {
      enterFromClass: t.desde,
      enterActiveClass: entra,
      leaveActiveClass: sale,
      leaveToClass: t.desde,
    },
    header: { class: 'flex shrink-0 items-center justify-between gap-3 px-6 pt-6 pb-5' },
    title: { class: FORM_TITLE },
    headerActions: { class: 'flex shrink-0 items-center gap-1' },
    content: {
      class: [
        'min-h-0 flex-auto overflow-y-auto overscroll-contain px-6',
        conCabecera ? '' : 'pt-6',
        conPie ? '' : 'pb-6',
      ].join(' ').replace(/\s+/g, ' ').trim(),
    },
    footer: { class: 'mx-6 mt-5 mb-6 flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-100 pt-4' },
  };
}
