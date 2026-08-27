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
    filtros: { q: '', estado: '', prioridad: '', sinAsignar: false, sinVincular: false, asignadoA: '' },
    orden: null,
    cargando: false,
    cargandoMas: false,
    error: null,
    _peticionId: 0,
  }),

  actions: {
    // _peticionId descarta respuestas obsoletas: si dos cargar() se
    // superponen (búsqueda con debounce + cambio de página/filtro rápido,
    // o el refresco realtime de AppLayout.vue disparando cargar() mientras
    // ya había uno en curso), solo se aplica el resultado más reciente.
    async cargar() {
      const peticionId = ++this._peticionId;
      this.cargando = true;
      this.error = null;
      try {
        const { items, total } = await insforgeApi.listTicketsPage({
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
        this.error = e?.message || 'Error al cargar tickets';
        throw e;
      } finally {
        if (peticionId === this._peticionId) this.cargando = false;
      }
    },

    async irAPagina(pagina) {
      this.pagina = pagina;
      await this.cargar();
    },

    // "Cargar más" (ronda de cierre): trae la página siguiente y la
    // AGREGA al final de `lista` en vez de reemplazarla — a diferencia de
    // cargar()/irAPagina(), que siempre reemplazan. cargandoMas es un
    // flag propio, no el `cargando` general: si reusara `cargando`, la
    // vista mostraría el estado "cargando lista completa" (y ocultaría
    // lo ya cargado) cada vez que se pide una página más, en vez de un
    // loading acotado al botón. No toca cargar()/aplicarFiltros()/
    // resetearFiltros()/ordenarPor() — todas siguen reseteando `pagina`
    // a 1 y reemplazando `lista` exactamente igual que antes, así que
    // cambiar de filtro o buscar sigue "olvidando" lo acumulado por
    // Cargar más, como se espera.
    async cargarMas() {
      if (this.cargando || this.cargandoMas || this.lista.length >= this.total) return;
      const peticionId = ++this._peticionId;
      this.cargandoMas = true;
      this.error = null;
      try {
        const siguientePagina = this.pagina + 1;
        const { items, total } = await insforgeApi.listTicketsPage({
          pagina: siguientePagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
          orden: this.orden,
        });
        // Mismo guard de _peticionId que cargar(): si un cambio de filtro
        // dispara cargar() mientras esta petición estaba en vuelo, esa
        // otra llamada ya incrementó _peticionId — esta respuesta llega
        // tarde y se descarta en vez de agregarse sobre una lista que ya
        // no corresponde al filtro actual.
        if (peticionId !== this._peticionId) return;
        this.lista = [...this.lista, ...items];
        this.total = total;
        this.pagina = siguientePagina;
      } catch (e) {
        if (peticionId !== this._peticionId) return;
        this.error = e?.message || 'Error al cargar más tickets';
        throw e;
      } finally {
        if (peticionId === this._peticionId) this.cargandoMas = false;
      }
    },

    async aplicarFiltros(filtros) {
      this.filtros = { ...this.filtros, ...filtros };
      this.pagina = 1;
      await this.cargar();
    },

    // Se llama al montar la vista: ver nota en stores/empleados.js.
    resetearFiltros() {
      this.filtros = { q: '', estado: '', prioridad: '', sinAsignar: false, sinVincular: false, asignadoA: '' };
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
