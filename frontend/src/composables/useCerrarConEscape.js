// Cierre con Escape para modales hand-rolled (los que no usan el <Modal>
// compartido, que ya lo trae incorporado). El callback decide si procede
// cerrar (ej. ignorar mientras se está guardando o si el modal no está
// abierto), así cada consumidor aplica sus propias condiciones.
import { onMounted, onBeforeUnmount } from 'vue';

export function useCerrarConEscape(cerrar) {
  function onKeydown(e) {
    if (e.key === 'Escape') cerrar();
  }
  onMounted(() => document.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
}
