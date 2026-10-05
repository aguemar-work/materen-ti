// El factory de listados paginados es la base de 7 stores (tickets,
// empleados, correos, equipos, licencias, kb, problemas): lo que se rompa
// acá se rompe en los 7 a la vez.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { crearStorePaginado } from '../src/stores/crearStorePaginado.js';

function pagina(items = [], total = items.length) {
  return { items, total };
}

// Promesa que se resuelve a mano, para simular dos cargas superpuestas.
function diferida() {
  let resolver;
  const promesa = new Promise((r) => (resolver = r));
  return { promesa, resolver };
}

beforeEach(() => setActivePinia(createPinia()));

describe('crearStorePaginado', () => {
  it('cargar() manda página, tamaño, filtros y orden, y llena lista/total', async () => {
    const listarPagina = vi.fn().mockResolvedValue(pagina([{ id: 'a' }], 7));
    const useStore = crearStorePaginado('t1', {
      listarPagina,
      filtrosIniciales: () => ({ q: '', estado: '' }),
    });
    const store = useStore();

    await store.aplicarFiltros({ q: 'impresora' });

    expect(listarPagina.mock.calls[0][0]).toEqual({
      pagina: 1,
      tamPagina: 20,
      q: 'impresora',
      estado: '',
      orden: null,
    });
    expect(store.lista).toEqual([{ id: 'a' }]);
    expect(store.total).toBe(7);
    expect(store.cargando).toBe(false);
  });

  // El guard _peticionId: sin él, una búsqueda lenta que responde tarde
  // pisa el resultado de la búsqueda siguiente.
  it('descarta la respuesta de una carga que quedó obsoleta', async () => {
    const lenta = diferida();
    const listarPagina = vi
      .fn()
      .mockReturnValueOnce(lenta.promesa)
      .mockResolvedValueOnce(pagina([{ id: 'nuevo' }], 1));

    const useStore = crearStorePaginado('t2', { listarPagina, filtrosIniciales: () => ({ q: '' }) });
    const store = useStore();

    const primera = store.cargar();
    await store.cargar(); // la segunda gana
    lenta.resolver(pagina([{ id: 'viejo' }], 99)); // la primera llega tarde
    await primera;

    expect(store.lista).toEqual([{ id: 'nuevo' }]);
    expect(store.total).toBe(1);
    expect(store.cargando).toBe(false);
  });

  it('si enriquecer() falla, la página se muestra igual sin los datos extra', async () => {
    const useStore = crearStorePaginado('t3', {
      listarPagina: () => Promise.resolve(pagina([{ id: 'a' }])),
      filtrosIniciales: () => ({}),
      enriquecer: () => Promise.reject(new Error('conteos caídos')),
    });
    const store = useStore();

    await expect(store.cargar()).resolves.toBeUndefined();
    expect(store.lista).toEqual([{ id: 'a' }]);
    expect(store.error).toBeNull();
  });

  it('enriquecer() reemplaza la lista cuando funciona', async () => {
    const useStore = crearStorePaginado('t4', {
      listarPagina: () => Promise.resolve(pagina([{ id: 'a' }])),
      filtrosIniciales: () => ({}),
      enriquecer: (items) => Promise.resolve(items.map((i) => ({ ...i, n: 3 }))),
    });
    const store = useStore();

    await store.cargar();
    expect(store.lista).toEqual([{ id: 'a', n: 3 }]);
  });

  it('`extra` se mezcla en el state (catálogos cacheados de Equipos)', async () => {
    const useStore = crearStorePaginado('t5', {
      listarPagina: (params, store) => {
        expect(store.tipos).toEqual([]); // el store llega para lectura
        return Promise.resolve({ ...pagina([]), extra: { tipos: [{ id: 'pc' }] } });
      },
      filtrosIniciales: () => ({}),
      state: () => ({ tipos: [] }),
    });
    const store = useStore();

    await store.cargar();
    expect(store.tipos).toEqual([{ id: 'pc' }]);
  });

  it('el error de carga queda en state y se propaga', async () => {
    const useStore = crearStorePaginado('t6', {
      listarPagina: () => Promise.reject(new Error('sin red')),
      filtrosIniciales: () => ({}),
      mensajeError: 'Error al cargar equipos',
    });
    const store = useStore();

    await expect(store.cargar()).rejects.toThrow('sin red');
    expect(store.error).toBe('sin red');
    expect(store.cargando).toBe(false);
  });

  it('resetearFiltros() vuelve a los iniciales y limpia orden y página', async () => {
    const useStore = crearStorePaginado('t7', {
      listarPagina: () => Promise.resolve(pagina([])),
      filtrosIniciales: () => ({ q: '', estado: 'Activo' }),
    });
    const store = useStore();

    await store.aplicarFiltros({ q: 'x', estado: 'Inactivo' });
    await store.irAPagina(3);
    await store.ordenarPor('nombre');
    store.resetearFiltros();

    expect(store.filtros).toEqual({ q: '', estado: 'Activo' });
    expect(store.orden).toBeNull();
    expect(store.pagina).toBe(1);
  });

  it('ordenarPor() alterna asc/desc en la misma columna y vuelve a página 1', async () => {
    const useStore = crearStorePaginado('t8', {
      listarPagina: () => Promise.resolve(pagina([])),
      filtrosIniciales: () => ({}),
    });
    const store = useStore();

    await store.irAPagina(4);
    await store.ordenarPor('codigo');
    expect(store.orden).toEqual({ columna: 'codigo', direccion: 'asc' });
    expect(store.pagina).toBe(1);

    await store.ordenarPor('codigo');
    expect(store.orden).toEqual({ columna: 'codigo', direccion: 'desc' });

    await store.ordenarPor('titulo');
    expect(store.orden).toEqual({ columna: 'titulo', direccion: 'asc' });
  });

  it('las actions propias se suman a las comunes', async () => {
    const useStore = crearStorePaginado('t9', {
      listarPagina: () => Promise.resolve(pagina([])),
      filtrosIniciales: () => ({}),
      actions: {
        async miAccion() {
          return 'propia';
        },
      },
    });
    const store = useStore();

    await expect(store.miAccion()).resolves.toBe('propia');
    expect(typeof store.resetearFiltros).toBe('function');
  });
});
