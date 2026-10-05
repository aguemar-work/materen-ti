// Preset Pass-Through de primevue/menu (modo popup), en Tailwind. Mismo
// patrón que button.pt.js/table.pt.js.
//
// A diferencia de Button/DataTable, acá SÍ usamos la forma "callback"
// `(options) => ({...})` para un par de secciones (`item`, `itemLink`) —
// necesitamos leer `options.context.item` (el objeto de ítem de ESE `<li>`
// puntual, con nuestro campo custom `danger`) para decidir su color. Menu
// pasa ese contexto automáticamente a cada sección por ítem (ver
// Menuitem.vue: `getPTOptions(key)` incluye `{item, index, focused,
// disabled}`); no es algo que armamos nosotros.
//
// Reglas de diseño de este preset (pedidas explícitamente): fondo blanco,
// sombra sutil (shadow-md), borde ≤1px, hover de ítem en bg-slate-50.
const ROOT =
  'min-w-48 rounded-md border border-gray-200 bg-white py-1 shadow-md ' +
  'focus:outline-none';

const LIST = 'flex flex-col focus:outline-none';

// El resaltado por teclado (roving focus, `aria-activedescendant`) marca
// `data-p-focused` en el <li> (sección `item`), NUNCA en el <a> de adentro
// — por eso el fondo de foco va acá y el de mouse (:hover real) va en
// itemLink; ambos pintan el mismo bg-slate-50, solo cambia qué gatilla cuál.
const ITEM_FOCUSED = 'data-[p-focused=true]:bg-slate-50';
const ITEM_DISABLED = 'data-[p-disabled=true]:opacity-50 data-[p-disabled=true]:pointer-events-none';

const ITEM_LINK_BASE =
  'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none no-underline';
const ITEM_LINK_NORMAL = 'text-gray-700 hover:bg-slate-50';
const ITEM_LINK_DANGER = 'text-red-600 hover:bg-red-50';

export function buildMenuPT() {
  return {
    root: { class: ROOT },
    list: { class: LIST },
    item: { class: `${ITEM_FOCUSED} ${ITEM_DISABLED}` },
    itemLink: ({ context }) => ({
      class: `${ITEM_LINK_BASE} ${context.item?.danger ? ITEM_LINK_DANGER : ITEM_LINK_NORMAL}`,
    }),
    itemIcon: ({ context }) => ({
      class: `w-4 shrink-0 text-base ${context.item?.danger ? 'text-red-500' : 'text-gray-500'}`,
    }),
    itemLabel: { class: 'truncate' },
    separator: { class: 'my-1 border-t border-gray-100' },
  };
}
