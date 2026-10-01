import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js).
// La visibilidad de borrador/en_revision ya la resuelve RLS — este store no
// filtra nada por autoría, solo pasa los filtros de UI al servidor.
export const useKbStore = crearStorePaginado('kb', {
  listarPagina: (params) => insforgeApi.listKbPage(params),
  filtrosIniciales: () => ({ q: '', categoriaId: '', estado: '' }),
  mensajeError: 'Error al cargar la base de conocimiento',
  entidad: 'artículo',

  actions: {
    async crear(datos) {
      this.error = null;
      const articulo = await insforgeApi.crearKbArticulo(datos);
      await this.cargar();
      return articulo;
    },
  },
});
