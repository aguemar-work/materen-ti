import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

const FILTROS_INICIALES = () => ({
  q: '', estado: '', sinAsignar: false, sinVincular: false, asignadoA: '',
  fechaDesde: '', fechaHasta: '',
  // Solo por deep-link (?categoria=, ver TicketsView.vue); sin selector propio.
  categoriaId: '',
});

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js):
// `lista` es SOLO la página actual; búsqueda y filtros viajan al servidor.
//
// fechaDesde/fechaHasta: único filtro secundario que queda (ago 2026, cuarta
// pasada retiró Prioridad/Nivel/Tipo/Categoría del listado — el dato sigue
// viéndose en tabla/detalle, solo se quitó la capacidad de FILTRAR el
// listado por ellos). Es un eje INDEPENDIENTE de la Vista activa (ver
// vistaActiva abajo): cambiar de Vista nunca lo pisa ni viceversa,
// aplicarFiltros() solo mergea. Deliberadamente NO hay un campo "estado"
// filtrable acá aparte del que ya trae la Vista — sumar uno sería la MISMA
// duplicación (2 fuentes de verdad para el mismo dato) que el modelo de
// Vistas se creó para cerrar en ago 2026.
export const useTicketsStore = crearStorePaginado('tickets', {
  listarPagina: (params) => insforgeApi.listTicketsPage(params),
  filtrosIniciales: FILTROS_INICIALES,
  mensajeError: 'Error al cargar tickets',

  state: () => ({
    // Vista activa del nav de Bandejas. Vive en el store — no en un ref
    // local de TicketsView.vue — por la misma razón que ultimoAbierto de
    // acá abajo: en modo Tabla, abrir un ticket navega a /tickets/:id y
    // DESMONTA TicketsView.vue; un ref local volvería siempre a
    // 'sin_asignar' al volver, perdiendo justo la Bandeja en la que el
    // usuario estaba trabajando. El store persiste mientras dura la sesión
    // de la SPA (se recrea recién en una recarga completa), así que
    // sobrevive esa navegación de ida y vuelta sin necesitar localStorage.
    // Valores: 'sin_asignar' | 'sin_vincular' | 'mis_tickets' | 'equipo'.
    vistaActiva: 'sin_asignar',
    // Sub-filtro de estado DENTRO de "Mis tickets" / "Equipo" (ago 2026,
    // sexta pasada — "Equipo" se sumó como bandeja hermana de "Mis
    // tickets" para poder ver el estado de TODOS los técnicos, no solo el
    // propio; antes no existía ninguna vista sin restricción de técnico).
    // Cada bandeja tiene su PROPIO sub-filtro ('todos' | 'en_progreso' |
    // 'resuelto' | 'rechazado') — no comparten uno solo: cambiar a "Equipo"
    // no debe pisar en qué sub-estado estabas mirando "Mis tickets", y
    // viceversa. Cada uno solo tiene efecto cuando su bandeja padre está
    // activa (ver misTicketsActivo/equipoActivo en TicketsView.vue) — en
    // sin_asignar/sin_vincular ambos quedan deshabilitados en el template
    // (no tiene sentido "sin asignar" con sub-estado ni técnico). Viven en
    // el store por la misma razón que vistaActiva: sobreviven a navegar a
    // /tickets/:id y volver. Arrancan en 'todos' cada sesión, sin
    // localStorage, mismo criterio que vistaActiva.
    estadoMisTickets: 'todos',
    estadoEquipo: 'todos',
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

    // Se llama en CADA montaje de TicketsView.vue — reemplaza el uso previo
    // de resetearFiltros() acá (ago 2026, segunda pasada del rediseño).
    // Por qué solo `q` y no todo: Vista/fecha ahora viven en controles con
    // v-model atado directo a este store (ListaVistas/inputs — ver
    // TicketsView.vue), así que al remontar la vista se VEN exactamente
    // como quedaron, sin mismatch que corregir — persisten a propósito
    // (arreglo del bug "se pierden los filtros al volver del detalle"). El
    // buscador es la única excepción: sigue siendo un <input> con estado
    // LOCAL propio (useBusqueda.js, fresco en cada montaje), así que sin
    // este reset puntual la caja se vería vacía mientras el filtro de texto
    // anterior seguiría aplicado en el servidor — el mismo mismatch que
    // resetearFiltros() ya prevenía acá (y sigue previniendo en
    // Empleados/Correos/Equipos/KB/Licencias/Problemas, que no tocan este
    // cambio) desde que se reportó en jul 2026 (ver la nota en
    // stores/empleados.js).
    // `resetearFiltros()` (reset completo) sigue existiendo, heredado del
    // factory, por si algún flujo futuro necesita volver la bandeja
    // realmente a cero (ej. un botón "restablecer todo" explícito).
    resetearBusqueda() {
      this.filtros = { ...this.filtros, q: '' };
      this.pagina = 1;
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
