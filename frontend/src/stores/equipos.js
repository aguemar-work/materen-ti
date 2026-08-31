import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

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
  filtrosIniciales: () => ({ q: '', tipoId: '', situacion: '' }),
  mensajeError: 'Error al cargar equipos',
  state: () => ({ tipos: [], ubicaciones: [] }),

  actions: {
    async listaParaExportar() {
      return insforgeApi.listEquiposFiltrados(this.filtros);
    },

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

    async cambiarEstado(id, estado) {
      this.error = null;
      await insforgeApi.cambiarEstadoEquipo(id, estado);
      await this.cargar();
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEquipo(id);
      await this.cargar();
    },

    async asignar(equipoId, empleadoId, condicionEntrega) {
      this.error = null;
      await insforgeApi.asignarEquipo(equipoId, empleadoId, condicionEntrega);
      await this.cargar();
    },

    async devolver(asignacionId, equipoId, datos) {
      this.error = null;
      await insforgeApi.devolverEquipo(asignacionId, equipoId, datos);
      await this.cargar();
    },

    async mover(equipoId, ubicacionId) {
      this.error = null;
      await insforgeApi.moverEquipo(equipoId, ubicacionId);
      await this.cargar();
    },

    async crearUbicacion(nombre) {
      this.error = null;
      const ubicacion = await insforgeApi.createUbicacion(nombre);
      this.ubicaciones.push(ubicacion);
      this.ubicaciones.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return ubicacion;
    },
  },
});
