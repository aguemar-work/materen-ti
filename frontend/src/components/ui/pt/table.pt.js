// Preset Pass-Through de DataTable, en Tailwind. Mismo patrón que
// button.pt.js: única fuente de verdad visual, sin callback (options),
// porque vive dentro de AppTable.vue con acceso directo a sus props.
//
// Dato de arquitectura importante (verificado, no supuesto): DataTable
// identifica las columnas de su slot por defecto por la referencia REAL del
// componente `Column` — un wrapper .vue propio alrededor de `<Column>` se
// ignora en silencio y la tabla queda sin columnas (0 `<th>`, comprobado con
// un test descartable antes de escribir esto). Por eso `Column` no se envuelve
// como AppButton envuelve a Button: `components/ui/AppColumn.js` RE-EXPORTA
// el componente real bajo nuestro namespace, en vez de crear un componente
// nuevo alrededor. Column pasa a ser un elemento de configuración (qué campo,
// qué encabezado, si ordena), no una unidad visual — el 100% de su estilo
// (headerCell, bodyCell, tipografía, bordes, hover) sale de acá, aplicado a
// TODAS las columnas por igual vía la clave anidada `column.*` que DataTable
// expone justamente para esto.
import { twMerge } from 'tailwind-merge';

// Checkbox de selección (columna <AppColumn selection-mode="multiple">) —
// por dentro, tanto el checkbox del header como el de cada fila son el
// MISMO primevue/checkbox (ver HeaderCheckbox.vue/RowCheckbox.vue: los dos
// renderizan <Checkbox> y piden su pt como `column.pcHeaderCheckbox`/
// `column.pcRowCheckbox`, con la forma nativa de Checkbox — root/input/box/
// icon, no una sección más de columna). Mismo checkbox para ambos, un solo
// preset.
//
// El estado (marcado/indeterminado) llega como atributos `data-p-checked`/
// `data-p-indeterminate` en el `root` — NO en `box`, que es el cuadrito
// visible — por eso `root` lleva `group` y `box` lee esos atributos del
// padre vía `group-data-[...]`. Regla de diseño pedida: acento primario
// #0064E0 al marcar, borde ≤1px siempre, transición suave.
const CHECKBOX_PT = {
  root: { class: 'group relative inline-flex h-4 w-4 shrink-0 items-center justify-center' },
  input: { class: 'peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0' },
  box: {
    class:
      'flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white ' +
      'transition-colors duration-150 ' +
      'group-data-[p-checked=true]:border-primary-500 group-data-[p-checked=true]:bg-primary-500 ' +
      'group-data-[p-indeterminate=true]:border-primary-500 group-data-[p-indeterminate=true]:bg-primary-500 ' +
      'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-1',
  },
  icon: { class: 'h-3 w-3 text-white' },
};

/**
 * @param {object} props - props reactivas de AppTable. `rowAttrs` (función
 *   opcional) se lee acá para fundirse en `bodyRow`; el resto hoy solo se
 *   usa para fundir la `class` externa.
 * @param {unknown} attrClass - `class` que el consumidor pasó a <AppTable>.
 */
export function buildTablePT(props, attrClass) {
  return {
    root: { class: twMerge('w-full text-sm', attrClass) },
    tableContainer: { class: 'w-full overflow-x-auto' },
    table: { class: 'w-full border-collapse' },
    // Sin borde lateral en ningún nivel — los separadores son SOLO el borde
    // inferior de cada celda (headerCell/bodyCell más abajo).
    thead: { class: '' },
    headerRow: { class: '' },
    tbody: {
      // Quita el borde inferior de la última fila: sin esto, la última fila
      // de datos queda con una línea sobrando contra lo que venga debajo
      // (paginación, borde de card) — los separadores son ENTRE filas, no
      // un remate final.
      class: 'bg-white [&>tr:last-child>td]:border-b-0',
    },
    // `rowAttrs(fila) => object` (prop opcional de AppTable): atributos EXTRA
    // por fila que no son clase/estilo — hoy, el único caso real es
    // `aria-current` en la fila actualmente abierta (TicketsView.vue). PT
    // por fila recibe `context.index`, no la fila entera — se resuelve
    // acá con `props.value[index]`, el mismo array que ya tiene AppTable.
    bodyRow: props.rowAttrs
      ? ({ context }) => ({
        class: 'bg-white hover:bg-slate-50 transition-colors duration-100',
        ...(props.value?.[context.index] ? props.rowAttrs(props.value[context.index]) : null),
      })
      : { class: 'bg-white hover:bg-slate-50 transition-colors duration-100' },
    column: {
      headerCell: {
        class:
          'border-b border-gray-200 px-4 py-2.5 text-left text-sm font-medium text-gray-600 ' +
          'whitespace-nowrap',
      },
      columnHeaderContent: { class: 'inline-flex items-center gap-1.5' },
      columnTitle: { class: 'font-medium' },
      sort: { class: 'inline-flex shrink-0' },
      sorticon: { class: 'w-3.5 h-3.5 text-gray-400' },
      bodyCell: {
        class: 'border-b border-gray-100 px-4 py-2.5 align-middle text-gray-800',
      },
      // Checkbox de selección — ver CHECKBOX_PT arriba.
      pcHeaderCheckbox: CHECKBOX_PT,
      pcRowCheckbox: CHECKBOX_PT,
    },
    loadingIcon: { class: 'w-5 h-5 animate-spin text-primary-500' },
    mask: { class: 'absolute inset-0 flex items-center justify-center bg-white/60' },
  };
}
