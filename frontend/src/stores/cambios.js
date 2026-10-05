import { insforgeApi } from '../api/insforge.js';
import { anotarErrorDb } from '../api/erroresDb.js';
import { crearStorePaginado } from './crearStorePaginado.js';
import { estadosDeVista, VISTA_CAMBIO_DEFECTO } from '../core/dominio-cambios.js';

// Cambios (migración 107). Dos cosas viven acá:
//   · el LISTADO paginado en servidor (el esqueleto común es
//     crearStorePaginado.js: `lista` es solo la página actual);
//   · el cambio ABIERTO en pantalla (`detalle`) con su libro de movimientos
//     (`eventos`) y los tickets enlazados (`tickets`).
//
// Regla de coherencia de crearStorePaginado: lo que CAMBIA EL CONJUNTO de una
// vista (aprobar, ejecutar o cerrar un cambio lo mueve de "Por aprobar" a "En
// curso", etc.) recarga la página; como el detalle se abre casi siempre sin
// lista cargada (enlace directo), la recarga solo ocurre si la lista ya tenía
// filas. Si falla, la operación ya ocurrió: no se presenta como error.

async function recargarListaSiHay(store) {
  if (!store.lista.length) return;
  try {
    await store.cargar();
  } catch {
    // La lista se reintenta sola al volver a montarla.
  }
}

export const useCambiosStore = crearStorePaginado('cambios', {
  listarPagina: (params) => insforgeApi.listCambiosPage(params),
  // La vista de trabajo por defecto es «En curso»; tipo y servicio son chips (listas).
  filtrosIniciales: () => ({ q: '', estados: estadosDeVista(VISTA_CAMBIO_DEFECTO), tipos: [], servicios: [] }),
  mensajeError: 'Error al cargar cambios',
  entidad: 'cambio',

  state: () => ({
    detalle: null,
    cargandoDetalle: false,
    errorDetalle: '',
    eventos: [],
    tickets: [],
    _peticionDetalle: 0,
  }),

  actions: {
    // Registra un cambio (borrador, o enviado). Devuelve la fila creada; el
    // llamador navega a su detalle, así que no se recarga la lista (misma
    // decisión que stores/solicitudes.js → crear).
    async crear(datos) {
      this.error = null;
      return insforgeApi.crearCambio(datos);
    },

    async actualizarBorrador(id, datos) {
      this.error = null;
      try {
        return await insforgeApi.actualizarCambio(id, datos);
      } catch (e) {
        throw anotarErrorDb(e, { entidad: 'cambio' });
      }
    },

    // ── Detalle ────────────────────────────────────────────────
    // Una respuesta tardía de otro cambio no pisa el actual (_peticionDetalle).
    // El libro y los tickets son secundarios: si fallan, el cambio se muestra igual.
    async cargarDetalle(id, { silencioso = false } = {}) {
      const peticion = ++this._peticionDetalle;
      if (!silencioso) this.cargandoDetalle = true;
      this.errorDetalle = '';
      try {
        const [cambio, eventos, tickets] = await Promise.all([
          insforgeApi.getCambio(id),
          insforgeApi.listEventosCambio(id).catch(() => null),
          insforgeApi.ticketsDeCambio(id).catch(() => null),
        ]);
        if (peticion !== this._peticionDetalle) return null;
        this.detalle = cambio;
        this.eventos = eventos || (silencioso ? this.eventos : []);
        this.tickets = tickets || (silencioso ? this.tickets : []);
        return cambio;
      } catch (e) {
        if (peticion !== this._peticionDetalle) return null;
        this.detalle = null;
        this.errorDetalle = anotarErrorDb(e, { entidad: 'cambio', porDefecto: 'No se pudo cargar el cambio.' }).message;
        return null;
      } finally {
        if (peticion === this._peticionDetalle) this.cargandoDetalle = false;
      }
    },

    limpiarDetalle() {
      this._peticionDetalle += 1;
      this.detalle = null;
      this.eventos = [];
      this.tickets = [];
      this.errorDetalle = '';
      this.cargandoDetalle = false;
    },

    // Las mutaciones relanzan el error ya traducido y, si salen bien, vuelven a
    // leer el detalle (el estado, el aprobador y el libro cambiaron en el servidor).
    async _mutar(id, accion, { cambiaConjunto = true } = {}) {
      let resultado;
      try {
        resultado = await accion();
      } catch (e) {
        throw anotarErrorDb(e, { entidad: 'cambio' });
      }
      await this.cargarDetalle(id, { silencioso: true });
      if (cambiaConjunto) await recargarListaSiHay(this);
      return resultado;
    },

    transicionar(id, destino, nota = null) {
      return this._mutar(id, () => insforgeApi.transicionarCambio(id, destino, nota));
    },

    aprobar(id, nota = null) {
      return this._mutar(id, () => insforgeApi.aprobarCambio(id, nota));
    },

    rechazar(id, motivo) {
      return this._mutar(id, () => insforgeApi.rechazarCambio(id, motivo));
    },

    // Enlazar o quitar un ticket no cambia el conjunto del listado.
    vincularTicket(id, ticketId) {
      return this._mutar(id, () => insforgeApi.vincularCambioTicket(id, ticketId), { cambiaConjunto: false });
    },

    desvincularTicket(id, ticketId) {
      return this._mutar(id, () => insforgeApi.desvincularCambioTicket(id, ticketId), { cambiaConjunto: false });
    },
  },
});
