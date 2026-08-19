// Orden de columnas client-side: recibe la lista (ref/computed) y devuelve
// una versión ordenada + el estado de orden para pintar el ícono del <th>.
// Uso: const { listaOrdenada, columna, direccion, ordenarPor } = useOrdenTabla(listaFiltrada);
// luego usePaginacion(listaOrdenada) en vez de listaFiltrada directamente.
// direccionInicial: solo cuando el orden por defecto natural es "desc"
// (ej. más reciente primero) — el resto de las vistas no lo necesita y
// se queda con el 'asc' de siempre.
import { ref, computed, unref } from 'vue';

export function useOrdenTabla(lista, columnaInicial = '', direccionInicial = 'asc') {
  const columna = ref(columnaInicial);
  const direccion = ref(direccionInicial);

  function ordenarPor(clave) {
    if (columna.value === clave) {
      direccion.value = direccion.value === 'asc' ? 'desc' : 'asc';
    } else {
      columna.value = clave;
      direccion.value = 'asc';
    }
  }

  const listaOrdenada = computed(() => {
    const items = unref(lista);
    if (!columna.value) return items;
    const signo = direccion.value === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = a[columna.value];
      const vb = b[columna.value];
      if (va == null || va === '') return vb == null || vb === '' ? 0 : 1;
      if (vb == null || vb === '') return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo;
      return String(va).localeCompare(String(vb), 'es', { sensitivity: 'base', numeric: true }) * signo;
    });
  });

  return { columna, direccion, ordenarPor, listaOrdenada };
}
