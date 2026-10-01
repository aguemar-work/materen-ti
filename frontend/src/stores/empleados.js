import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js):
// `lista` es SOLO la página actual; búsqueda y filtros viajan al servidor.
// Regla de coherencia: mutaciones in-place (editar, baja) actualizan la fila
// si está en la página; las que cambian el conjunto (crear, borrar,
// reactivar) recargan la página para corregir total y huecos.
export const useEmpleadosStore = crearStorePaginado('empleados', {
  listarPagina: (params) => insforgeApi.listEmpleadosPage(params),
  // estado: 'Activo' por defecto (ago 2026) — activos e inactivos mezclados
  // en la lista era el problema reportado; la vista "Todos" sigue a un clic.
  // Las dimensiones (V2) son listas: varios valores por dimensión.
  filtrosIniciales: () => ({ q: '', estado: 'Activo', empresaIds: [], ubicacionIds: [], areaIds: [] }),
  mensajeError: 'Error al cargar empleados',
  entidad: 'empleado',

  // Conteos de cuentas/equipos/licencias vinculados de la página; si fallan,
  // la columna "Vínculos" queda vacía pero el listado no se cae.
  async enriquecer(items) {
    const conteos = await insforgeApi.conteosVinculos(items.map((e) => e.id));
    return items.map((e) => ({
      ...e,
      n_cuentas: conteos[e.id]?.cuentas ?? 0,
      n_equipos: conteos[e.id]?.equipos ?? 0,
      n_licencias: conteos[e.id]?.licencias ?? 0,
    }));
  },

  actions: {
    // Dataset filtrado completo (sin página) — para exportar CSV
    async listaParaExportar() {
      return insforgeApi.listEmpleadosFiltrados(this.filtros);
    },

    async crear(datos) {
      this.error = null;
      // Sin push local: el alta navega a la ficha del nuevo empleado y la
      // lista se recarga al volver a montarse.
      return insforgeApi.createEmpleado(datos);
    },

    async actualizar(id, datos) {
      this.error = null;
      const empleado = await insforgeApi.updateEmpleado(id, datos);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empleado;
      return empleado;
    },

    async darDeBaja(id) {
      this.error = null;
      const { empleado, resumen } = await insforgeApi.bajaEmpleado(id);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empleado;
      return { empleado, resumen };
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEmpleado(id);
      await this.cargar(); // rellena el hueco de la página y corrige total
    },

    async reactivar(id) {
      this.error = null;
      const empleado = await insforgeApi.reactivarEmpleado(id);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empleado;
      return empleado;
    },
  },
});
