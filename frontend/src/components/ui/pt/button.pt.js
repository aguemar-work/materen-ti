// Preset Pass-Through de PrimeVue Button, en Tailwind.
//
// PrimeVue en modo unstyled no aplica NINGUNA clase por sí solo: cada sección
// del componente (root, label, icon...) se pinta desde acá. Esta función es
// la ÚNICA fuente de verdad visual del botón — un wrapper nuevo (AppTable,
// AppSelect...) sigue el mismo patrón: un archivo `pt/<componente>.pt.js` que
// lee las props del wrapper y devuelve clases de Tailwind por sección.
//
// No se usa el estilo "callback con (options) => {...}" de los ejemplos
// oficiales de PrimeVue: como este preset vive DENTRO del wrapper y ya tiene
// acceso directo y reactivo a sus propias props, alcanza con una función
// plana. El callback con `options.props/state` solo hace falta cuando el PT
// se define fuera del componente (config global), que no es nuestro caso.
import { twMerge } from 'tailwind-merge';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'select-none transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const TAMANOS = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

// Regla de producto: nunca más de 1px de borde, tampoco en hover/active.
// Los tres variantes comparten esa restricción; lo que cambia es si el
// borde es visible (outline) o transparente (solid/text), y si el estado
// se resuelve con fondo tenue (outline/text) o con un tono más oscuro del
// mismo acento (solid).
const VARIANTES = {
  solid: {
    primary:
      'border border-transparent bg-primary-500 text-white ' +
      'hover:bg-primary-600 active:bg-primary-700',
    danger:
      'border border-transparent bg-red-600 text-white ' +
      'hover:bg-red-700 active:bg-red-800',
    secondary:
      'border border-transparent bg-gray-100 text-gray-900 ' +
      'hover:bg-gray-200 active:bg-gray-300',
  },
  outline: {
    primary:
      'border border-primary-300 bg-transparent text-primary-600 ' +
      'hover:bg-primary-50 active:bg-primary-100',
    danger:
      'border border-red-300 bg-transparent text-red-600 ' +
      'hover:bg-red-50 active:bg-red-100',
    secondary:
      'border border-gray-300 bg-transparent text-gray-700 ' +
      'hover:bg-gray-50 active:bg-gray-100',
  },
  text: {
    primary:
      'border border-transparent bg-transparent text-primary-600 ' +
      'hover:bg-primary-50 active:bg-primary-100',
    danger:
      'border border-transparent bg-transparent text-red-600 ' +
      'hover:bg-red-50 active:bg-red-100',
    secondary:
      'border border-transparent bg-transparent text-gray-600 ' +
      'hover:bg-gray-100 active:bg-gray-200',
  },
};

/**
 * @param {object} props - props reactivas de AppButton (severity, variant,
 *   size, block, loading) más `attrClass`, la `class` que el consumidor le
 *   pasó al wrapper desde afuera (se funde con tailwind-merge para que un
 *   `class="mt-4"` no pierda contra el preset ni al revés).
 */
export function buildButtonPT(props, attrClass) {
  const variante = VARIANTES[props.variant] ?? VARIANTES.solid;
  const porSeveridad = variante[props.severity] ?? variante.primary;

  const rootClass = twMerge(
    BASE,
    TAMANOS[props.size] ?? TAMANOS.md,
    porSeveridad,
    props.block ? 'w-full' : '',
    attrClass,
  );

  return {
    root: { class: rootClass },
    label: { class: 'truncate' },
    icon: { class: props.loading ? 'animate-spin' : '' },
    loadingIcon: { class: 'animate-spin' },
  };
}
