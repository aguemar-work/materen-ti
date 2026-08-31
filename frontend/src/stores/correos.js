import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js).
export const useCorreosStore = crearStorePaginado('correos', {
  listarPagina: (params) => insforgeApi.listCorreosPage(params),
  filtrosIniciales: () => ({ q: '', tipo: '' }),
  mensajeError: 'Error al cargar correos compartidos',

  actions: {
    async listaParaExportar() {
      return insforgeApi.listCorreosFiltrados(this.filtros);
    },

    async crear(datos) {
      this.error = null;
      const correo = await insforgeApi.createCorreo(datos);
      await this.cargar();
      return correo;
    },

    async actualizar(id, datos) {
      this.error = null;
      await insforgeApi.updateCorreo(id, datos);
      await this.cargar();
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteCorreo(id);
      await this.cargar();
    },
  },
});
