import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Forma de los filtros V2 (2026-09-25): la arma TicketsView desde la URL
// con paramsServidor() (modules/tickets/filtrosTickets.js) y la aplica con
// aplicarFiltros(). El store ya no guarda bandeja/sub-estado/técnico: la
// URL es la fuente de verdad (y useFiltrosUrl recuerda la última al volver
// del detalle), así que Tickets dejó de ser la excepción del gotcha de
// resetearFiltros() — ver AGENTS.md.
const FILTROS_INICIALES = () => ({
  q: '', estados: [], asignados: [], prioridades: [], categoriaIds: [], tipos: [], niveles: [],
  vinculado: '', fechaDesde: '', fechaHasta: '',
});

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js):
// `lista` es SOLO la página actual; búsqueda y filtros viajan al servidor.
export const useTicketsStore = crearStorePaginado('tickets', {
  listarPagina: (params) => insforgeApi.listTicketsPage(params),
  filtrosIniciales: FILTROS_INICIALES,
  mensajeError: 'Error al cargar tickets',
  entidad: 'ticket',

  state: () => ({
    // Último ticket abierto desde el listado — la fila correspondiente se
    // resalta al volver (`.fila-ticket--activa`). Vive en el store y no en
    // TicketsView.vue a propósito: navegar a /tickets/:id desmonta la vista
    // y un ref local se perdería justo cuando hace falta, que es al volver.
    ultimoAbierto: null,
    cargandoMas: false,
  }),

  actions: {
    // "Cargar más" (ronda de cierre): trae la página siguiente y la AGREGA
    // al final de `lista` en vez de reemplazarla — a diferencia de
    // cargar()/irAPagina(), que siempre reemplazan. cargandoMas es un flag
    // propio, no el `cargando` general: si reusara `cargando`, la vista
    // mostraría el estado "cargando lista completa" (y ocultaría lo ya
    // cargado) cada vez que se pide una página más, en vez de un loading
    // acotado al botón. No toca cargar()/aplicarFiltros()/
    // resetearFiltros()/ordenarPor() — todas siguen reseteando `pagina` a 1
    // y reemplazando `lista` exactamente igual que antes, así que cambiar
    // de filtro o buscar sigue "olvidando" lo acumulado por Cargar más,
    // como se espera. Es la única action que no puede salir del factory:
    // acumula en vez de reemplazar.
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
        // dispara cargar() mientras esta petición estaba en vuelo, esa otra
        // llamada ya incrementó _peticionId — esta respuesta llega tarde y
        // se descarta en vez de agregarse sobre una lista que ya no
        // corresponde al filtro actual.
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

    async actualizar(id, datos) {
      this.error = null;
      await insforgeApi.actualizarTicket(id, datos);
      const idx = this.lista.findIndex((t) => t.id === id);
      if (idx !== -1) Object.assign(this.lista[idx], datos);
    },
  },
});
