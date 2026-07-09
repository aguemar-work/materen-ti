import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side (patrón de referencia para migrar otros módulos):
// `lista` es SOLO la página actual; búsqueda y filtros viajan al servidor.
// Regla de coherencia: mutaciones in-place (editar, baja) actualizan la fila
// si está en la página; las que cambian el conjunto (crear, borrar,
// reactivar) recargan la página para corregir total y huecos.
export const useEmpleadosStore = defineStore('empleados', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '', estado: '' },
    cargando: false,
    error: null,
  }),

  actions: {
    async cargar() {
      this.cargando = true;
      this.error = null;
      try {
        const { items, total } = await insforgeApi.listEmpleadosPage({
          pagina: this.pagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
        });
        this.lista = items;
        this.total = total;
      } catch (e) {
        this.error = e?.message || 'Error al cargar empleados';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async irAPagina(pagina) {
      this.pagina = pagina;
      await this.cargar();
    },

    async aplicarFiltros(filtros) {
      this.filtros = { ...this.filtros, ...filtros };
      this.pagina = 1;
      await this.cargar();
    },

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
