import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side (mismo patrón que stores/kb.js).
export const useProblemasStore = defineStore('problemas', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '', estado: '', severidad: '' },
    orden: null,
    cargando: false,
    error: null,
  }),

  actions: {
    async cargar() {
      this.cargando = true;
      this.error = null;
      try {
        const { items, total } = await insforgeApi.listProblemasPage({
          pagina: this.pagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
          orden: this.orden,
        });
        this.lista = items;
        this.total = total;
      } catch (e) {
        this.error = e?.message || 'Error al cargar los problemas';
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

    resetearFiltros() {
      this.filtros = { q: '', estado: '', severidad: '' };
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

    async crear(datos) {
      this.error = null;
      const problema = await insforgeApi.crearProblema(datos);
      await this.cargar();
      return problema;
    },
  },
});
