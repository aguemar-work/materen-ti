import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side (mismo patrón que empleados/tickets).
export const useCorreosStore = defineStore('correos', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '', tipo: '' },
    cargando: false,
    error: null,
  }),

  actions: {
    async cargar() {
      this.cargando = true;
      this.error = null;
      try {
        const { items, total } = await insforgeApi.listCorreosPage({
          pagina: this.pagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
        });
        this.lista = items;
        this.total = total;
      } catch (e) {
        this.error = e?.message || 'Error al cargar correos compartidos';
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
