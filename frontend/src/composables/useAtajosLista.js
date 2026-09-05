import { onMounted, onBeforeUnmount } from 'vue';

// Atajos de teclado para una pantalla de listado: "/" enfoca el buscador y,
// opcionalmente, "f" abre algún popover de filtros (si el módulo consumidor
// tiene uno — Tickets ya no lo usa, ver TicketsView.vue). Escape no está acá
// a propósito — cada popover/modal ya lo maneja por su cuenta
// (MenuAcciones.vue, Modal.vue), y un handler global compitiendo con ellos
// cerraría de más.
//
// Escrito como composable y no dentro de TicketsView.vue porque la tabla de
// Tickets es el patrón modelo del sistema: cualquier otro módulo con
// buscador (y, si le hace falta, un popover de filtros) puede sumarlo con
// una línea.

// Un atajo de una sola tecla no puede dispararse mientras se escribe. Además
// de los campos obvios, contempla contenteditable (el editor de KB) y
// cualquier elemento con rol de textbox.
function escribiendo(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * @param {object}   opciones
 * @param {Function} opciones.onBuscar  enfocar el buscador ("/")
 * @param {Function} [opciones.onFiltros] abrir los filtros ("f")
 */
export function useAtajosLista({ onBuscar, onFiltros } = {}) {
  function onKeydown(e) {
    // Sin modificadores: Ctrl+F es "buscar en la página" del navegador y no
    // se le pisa; Cmd/Meta y Alt tampoco se interceptan.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (escribiendo(e.target)) return;
    if (e.key === '/') {
      e.preventDefault(); // sin esto Firefox abre su "búsqueda rápida"
      onBuscar?.();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      onFiltros?.();
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
}
