// Tests del composable de paginación client-side.
import { describe, it, expect } from 'vitest';
import { ref, computed, nextTick } from 'vue';
import { usePaginacion } from '../src/composables/usePaginacion.js';

const filas = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe('usePaginacion', () => {
  it('pagina de a 20 por defecto', () => {
    const lista = ref(filas(45));
    const { listaPaginada, totalItems, tamPagina } = usePaginacion(lista);
    expect(tamPagina).toBe(20);
    expect(totalItems.value).toBe(45);
    expect(listaPaginada.value).toHaveLength(20);
    expect(listaPaginada.value[0].id).toBe(1);
  });

  it('navega de página y corta la última incompleta', () => {
    const lista = ref(filas(45));
    const { paginaActual, listaPaginada } = usePaginacion(lista);
    paginaActual.value = 3;
    expect(listaPaginada.value).toHaveLength(5);
    expect(listaPaginada.value[0].id).toBe(41);
  });

  it('vuelve a página 1 cuando la lista cambia (filtro/búsqueda)', async () => {
    const fuente = ref(filas(45));
    const filtrada = computed(() => fuente.value);
    const { paginaActual } = usePaginacion(filtrada);
    paginaActual.value = 3;
    fuente.value = filas(10); // nueva referencia = nuevo filtro
    await nextTick();
    expect(paginaActual.value).toBe(1);
  });

  it('acepta tamaño de página custom', () => {
    const lista = ref(filas(7));
    const { listaPaginada } = usePaginacion(lista, 5);
    expect(listaPaginada.value).toHaveLength(5);
  });
});
