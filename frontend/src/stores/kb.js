import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side (mismo patrón que stores/correos.js). La
// visibilidad de borrador/en_revision ya la resuelve RLS — este store no
// filtra nada por autoría, solo pasa los filtros de UI al servidor.
export const useKbStore = defineStore('kb', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '', categoriaId: '', estado: '' },
    orden: null,
    cargando: false,
    error: null,
  }),

  actions: {
    async cargar() {
      this.cargando = true;
      this.error = null;
      try {
        const { items, total } = await insforgeApi.listKbPage({
          pagina: this.pagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
          orden: this.orden,
        });
        this.lista = items;
        this.total = total;
      } catch (e) {
        this.error = e?.message || 'Error al cargar la base de conocimiento';
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
      this.filtros = { q: '', categoriaId: '', estado: '' };
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
      const articulo = await insforgeApi.crearKbArticulo(datos);
      await this.cargar();
      return articulo;
    },
  },
});
