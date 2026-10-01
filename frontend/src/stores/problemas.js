import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js).
export const useProblemasStore = crearStorePaginado('problemas', {
  listarPagina: (params) => insforgeApi.listProblemasPage(params),
  filtrosIniciales: () => ({ q: '', estado: '', severidad: '' }),
  mensajeError: 'Error al cargar los problemas',
  entidad: 'problema',

  actions: {
    async crear(datos) {
      this.error = null;
      const problema = await insforgeApi.crearProblema(datos);
      await this.cargar();
      return problema;
    },
  },
});
