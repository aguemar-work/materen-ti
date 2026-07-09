// Paginación client-side sobre una lista reactiva (normalmente la lista
// filtrada). Replica el patrón que vivía copiado en 12 vistas:
// página actual + reset al cambiar la lista + slice de la página.
// El control visual sigue siendo components/shared/Pagination.vue.
import { ref, computed, watch, unref } from 'vue';

export function usePaginacion(lista, tamPagina = 20) {
  const paginaActual = ref(1);

  // Al filtrar/buscar cambia la lista → volver a la página 1
  watch(() => unref(lista), () => { paginaActual.value = 1; });

  const listaPaginada = computed(() => {
    const inicio = (paginaActual.value - 1) * tamPagina;
    return unref(lista).slice(inicio, inicio + tamPagina);
  });

  const totalItems = computed(() => unref(lista).length);

  return { paginaActual, listaPaginada, totalItems, tamPagina };
}
