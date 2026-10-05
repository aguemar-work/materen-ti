import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js).
export const useCorreosStore = crearStorePaginado('correos', {
  listarPagina: (params) => insforgeApi.listCorreosPage(params),
  // soloRotacion: segmento "Requieren rotación" de CorreosView. Se resetea en
  // cada montaje de la vista junto con el resto (gotcha de resetearFiltros()).
  filtrosIniciales: () => ({ q: '', tipo: '', soloRotacion: false }),
  mensajeError: 'Error al cargar correos compartidos',
  entidad: 'correo',

  actions: {
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
