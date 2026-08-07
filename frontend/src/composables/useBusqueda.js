// Búsqueda con debounce configurable + umbral mínimo + estado de carga,
// que reemplaza el patrón (debounce manual + setTimeout) copiado en las
// vistas server-side y las variantes ad hoc de los combos client-side.
//
// Modo servidor (default): sanea el término (api/sanitizar.js), espera
// `debounceMs` y solo llama a `onBuscar` si alcanza `umbralMinimo`; por
// debajo del umbral llama a `onBuscar('')` una vez, sin red extra, para
// limpiar/mostrar todo (mismo resultado visible, sin el round-trip).
//
// Modo cliente (sanitizar:false, debounceMs:0, umbralMinimo:0): no hay
// red que ahorrar, así que no hay gate ni retraso — el `termino` queda
// disponible para que el propio componente arme su `computed` de filtro.
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { sanitizarTermino } from '../api/sanitizar.js';

export function useBusqueda({
  onBuscar = () => {},
  debounceMs = 300,
  umbralMinimo = 2,
  sanitizar = true,
  resultados = null,
} = {}) {
  const termino = ref('');
  const cargando = ref(false);
  let timer = null;

  function procesar(valor) {
    const q = valor.trim();
    return sanitizar ? sanitizarTermino(q) : q.toLowerCase();
  }

  watch(termino, (valor) => {
    clearTimeout(timer);
    const qProcesado = procesar(valor);
    if (qProcesado.length < umbralMinimo) {
      cargando.value = false;
      onBuscar(qProcesado);
      return;
    }
    if (debounceMs <= 0) {
      onBuscar(qProcesado);
      return;
    }
    cargando.value = true;
    timer = setTimeout(async () => {
      try {
        await onBuscar(qProcesado);
      } finally {
        cargando.value = false;
      }
    }, debounceMs);
  });

  // Si el componente se desmonta con el debounce pendiente, el timeout no
  // debe disparar onBuscar contra un callback que ya no debería actuar.
  onBeforeUnmount(() => clearTimeout(timer));

  const sinResultados = computed(() => {
    if (!resultados) return false;
    if (cargando.value) return false;
    if (procesar(termino.value).length < umbralMinimo) return false;
    const lista = 'value' in resultados ? resultados.value : resultados;
    return Array.isArray(lista) && lista.length === 0;
  });

  return { termino, cargando, sinResultados };
}
