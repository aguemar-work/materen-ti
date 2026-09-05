// Paginación client-side sobre una lista reactiva (normalmente la lista
// filtrada). Replica el patrón que vivía copiado en 12 vistas:
// página actual + reset al cambiar la lista + slice de la página.
// El control visual es components/carbon/CarbonPagination.vue.
import { ref, computed, watch, unref } from 'vue';
import { TAM_PAGINA_DEFECTO } from '../constants/paginacion.js';

export function usePaginacion(lista, tamPaginaInicial = TAM_PAGINA_DEFECTO) {
  const paginaActual = ref(1);
  // Reactivo (antes un número fijo) para que CarbonPagination pueda ofrecer
  // el selector "Filas por página" — sin esto, cambiar de 20 a 100 filas no
  // tenía dónde guardarse.
  const tamPagina = ref(tamPaginaInicial);

  // Al filtrar/buscar cambia la lista → volver a la página 1
  watch(() => unref(lista), () => { paginaActual.value = 1; });

  const listaPaginada = computed(() => {
    const inicio = (paginaActual.value - 1) * tamPagina.value;
    return unref(lista).slice(inicio, inicio + tamPagina.value);
  });

  const totalItems = computed(() => unref(lista).length);

  // Cambiar el tamaño de página vuelve a la 1: quedarse en una página que ya
  // no existe con el nuevo tamaño deja la vista vacía sin explicar por qué.
  // El reset vive acá (y en el store), no en CarbonPagination — ver el
  // comentario de `cambiarTam()` en ese componente.
  function cambiarTamPagina(nuevoTam) {
    tamPagina.value = nuevoTam;
    paginaActual.value = 1;
  }

  return { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina };
}
