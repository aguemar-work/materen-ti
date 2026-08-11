import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side (mismo patrón que stores/correos.js).
export const usePersonalRegistrosStore = defineStore('personalRegistros', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '', pendientes: false },
    orden: null,
    cargando: false,
    error: null,
    _peticionId: 0,
  }),

  actions: {
    // _peticionId descarta respuestas obsoletas: si dos cargar() se
    // superponen (búsqueda con debounce + cambio de página/filtro rápido),
    // solo se aplica el resultado de la petición más reciente.
    async cargar() {
      const peticionId = ++this._peticionId;
      this.cargando = true;
      this.error = null;
      try {
        const { items, total } = await insforgeApi.listPersonalRegistrosPage({
          pagina: this.pagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
          orden: this.orden,
        });
        if (peticionId !== this._peticionId) return;
        this.lista = items;
        this.total = total;
      } catch (e) {
        if (peticionId !== this._peticionId) return;
        this.error = e?.message || 'Error al cargar los pre-registros de personal';
        throw e;
      } finally {
        if (peticionId === this._peticionId) this.cargando = false;
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
      this.filtros = { q: '', pendientes: false };
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

    async listaParaExportar() {
      return insforgeApi.listPersonalRegistrosFiltrados(this.filtros);
    },

    async marcarUsado(id, usado = true) {
      this.error = null;
      await insforgeApi.marcarUsado(id, usado);
      const fila = this.lista.find((r) => r.id === id);
      if (fila) fila.usado = usado;
    },

    // Hard delete real (migración 046): se llama solo tras migrar este
    // pre-registro a `empleados`.
    async eliminar(id) {
      this.error = null;
      await insforgeApi.eliminarRegistro(id);
      this.lista = this.lista.filter((r) => r.id !== id);
      this.total -= 1;
    },
  },
});
