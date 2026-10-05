import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Entregar, devolver, mover, cambiar el estado y verificar ya no pasan por el
// store: son RPC de una sola llamada (migración 101) que ejecuta
// modules/equipos/useEquiposAcciones.js, igual en el listado y en la hoja de
// vida; el listado recarga su página con `cargar()` tras cada una.
//
// Paginación server-side en la lista (esqueleto común en
// crearStorePaginado.js); tipos y ubicaciones se cachean en el propio store
// (catálogos pequeños, no cambian con cada página) y se piden en la MISMA
// tanda que la página, no en un viaje aparte.
export const useEquiposStore = crearStorePaginado('equipos', {
  async listarPagina(params, store) {
    const [pageRes, tipos, ubicaciones] = await Promise.all([
      insforgeApi.listEquiposPage(params),
      store.tipos.length ? store.tipos : insforgeApi.listTiposEquipo(),
      store.ubicaciones.length ? store.ubicaciones : insforgeApi.listUbicaciones(),
    ]);
    return { ...pageRes, extra: { tipos, ubicaciones } };
  },
  // Dimensiones como listas (V2): varios tipos / empresas a la vez.
  filtrosIniciales: () => ({ q: '', tipoIds: [], empresaIds: [], situacion: '' }),
  mensajeError: 'Error al cargar equipos',
  entidad: 'equipo',
  state: () => ({ tipos: [], ubicaciones: [] }),

  actions: {
    async crear(datos) {
      this.error = null;
      await insforgeApi.createEquipo(datos);
      await this.cargar();
    },

    async actualizar(id, datos) {
      this.error = null;
      await insforgeApi.updateEquipo(id, datos);
      await this.cargar();
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEquipo(id);
      await this.cargar();
    },
  },
});
