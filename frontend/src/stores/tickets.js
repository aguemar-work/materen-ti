import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side: `lista` es SOLO la página actual; búsqueda y
// filtros viajan al servidor (mismo patrón que stores/empleados.js).
export const useTicketsStore = defineStore('tickets', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '', estado: '', prioridad: '', sinAsignar: false, sinVincular: false },
    orden: null,
    cargando: false,
    error: null,
  }),

  actions: {
    async cargar() {
      this.cargando = true;
      this.error = null;
      try {
        const { items, total } = await insforgeApi.listTicketsPage({
          pagina: this.pagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
          orden: this.orden,
        });
        this.lista = items;
        this.total = total;
      } catch (e) {
        this.error = e?.message || 'Error al cargar tickets';
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

    // Se llama al montar la vista: ver nota en stores/empleados.js.
    resetearFiltros() {
      this.filtros = { q: '', estado: '', prioridad: '', sinAsignar: false, sinVincular: false };
      this.orden = null;
      this.pagina = 1;
    },

    async ordenarPor(columna) {
      if (this.orden?.columna === columna) {
        this.orden = { columna, direccion: this.orden.direccion === 'asc' ? 'desc' : 'asc' };
      } else {
        this.orden = { columna, direccion: 'asc' };
      }
      this.pagina = 1;
      await this.cargar();
    },

    // Dataset filtrado completo (sin página) — para exportar CSV
    async listaParaExportar() {
      return insforgeApi.listTicketsFiltrados(this.filtros);
    },

    async actualizar(id, datos) {
      this.error = null;
      await insforgeApi.actualizarTicket(id, datos);
      const idx = this.lista.findIndex((t) => t.id === id);
      if (idx !== -1) Object.assign(this.lista[idx], datos);
    },
  },
});
