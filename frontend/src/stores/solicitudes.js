import { insforgeApi } from '../api/insforge.js';
import { anotarErrorDb } from '../api/erroresDb.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Solicitudes de servicio (migración 108). Dos cosas viven acá:
//   · el LISTADO paginado en servidor (el esqueleto común es
//     crearStorePaginado.js: `lista` es solo la página actual);
//   · la solicitud ABIERTA en pantalla (`detalle`) con sus pasos y lo que
//     cada paso apunta (`objetivos`: la cuenta a rotar, el equipo a recuperar).
//
// Regla de coherencia de crearStorePaginado: lo que CAMBIA EL CONJUNTO de una
// vista (completar o cancelar una solicitud la saca de "Abiertas") recarga la
// página; lo que solo cambia una fila (completar un paso) no. Como el detalle
// se abre casi siempre sin lista cargada (enlace directo, expediente, Inicio),
// la recarga solo ocurre si la lista ya tenía filas. Si falla, la operación
// ya ocurrió: no se presenta como error de la mutación.

async function recargarListaSiHay(store) {
  if (!store.lista.length) return;
  try {
    await store.cargar();
  } catch {
    // La lista se reintenta sola al volver a montarla.
  }
}

export const useSolicitudesStore = crearStorePaginado('solicitudes', {
  listarPagina: (params) => insforgeApi.listSolicitudesPage(params),
  // 'abierta' por defecto: la vista de trabajo. Los tipos son una lista (chip).
  filtrosIniciales: () => ({ q: '', estado: 'abierta', tipos: [] }),
  mensajeError: 'Error al cargar solicitudes',
  entidad: 'solicitud',

  state: () => ({
    detalle: null,
    cargandoDetalle: false,
    errorDetalle: '',
    objetivos: {},
    _peticionDetalle: 0,
  }),

  actions: {
    // Abre una solicitud (o convierte un ticket). Devuelve la fila creada; el
    // llamador navega a su detalle, así que no se recarga la lista (misma
    // decisión que stores/empleados.js → crear).
    async crear(datos) {
      this.error = null;
      return insforgeApi.crearSolicitud(datos);
    },

    async convertirTicket(ticketId, tipo, nota = null) {
      this.error = null;
      try {
        return await insforgeApi.convertirTicketEnSolicitud(ticketId, tipo, nota);
      } catch (e) {
        throw anotarErrorDb(e, { entidad: 'solicitud' });
      }
    },

    // ── Detalle ────────────────────────────────────────────────
    // Una respuesta tardía de otra solicitud no pisa la actual (_peticionDetalle).
    async cargarDetalle(id, { silencioso = false } = {}) {
      const peticion = ++this._peticionDetalle;
      if (!silencioso) this.cargandoDetalle = true;
      this.errorDetalle = '';
      try {
        const solicitud = await insforgeApi.getSolicitud(id);
        if (peticion !== this._peticionDetalle) return null;
        this.detalle = solicitud;
        // Lo que apuntan los pasos es opcional: sin permiso sobre cuentas o
        // equipos solo falta el enlace preciso.
        let objetivos = {};
        if (solicitud?.pasos?.length) {
          try {
            objetivos = await insforgeApi.objetivosDePasosSolicitud(solicitud.pasos);
          } catch {
            objetivos = {};
          }
        }
        if (peticion !== this._peticionDetalle) return null;
        this.objetivos = objetivos;
        return solicitud;
      } catch (e) {
        if (peticion !== this._peticionDetalle) return null;
        this.detalle = null;
        this.errorDetalle = anotarErrorDb(e, { entidad: 'solicitud', porDefecto: 'No se pudo cargar la solicitud.' }).message;
        return null;
      } finally {
        if (peticion === this._peticionDetalle) this.cargandoDetalle = false;
      }
    },

    limpiarDetalle() {
      this._peticionDetalle += 1;
      this.detalle = null;
      this.objetivos = {};
      this.errorDetalle = '';
      this.cargandoDetalle = false;
    },

    // Las mutaciones de un paso o de la solicitud relanzan el error ya
    // traducido y, si salen bien, vuelven a leer el detalle (la solicitud puede
    // haberse completado sola con el último paso).
    async _mutar(id, accion) {
      let resultado;
      try {
        resultado = await accion();
      } catch (e) {
        throw anotarErrorDb(e, { entidad: 'solicitud' });
      }
      await this.cargarDetalle(id, { silencioso: true });
      return resultado;
    },

    async completarPaso(solicitudId, pasoId, opciones = {}) {
      const resultado = await this._mutar(solicitudId, () => insforgeApi.completarPasoSolicitud(pasoId, opciones));
      // El último paso la completa: sale de "Abiertas".
      if (this.detalle?.estado !== 'abierta') await recargarListaSiHay(this);
      return resultado;
    },

    async omitirPaso(solicitudId, pasoId, motivo) {
      const resultado = await this._mutar(solicitudId, () => insforgeApi.omitirPasoSolicitud(pasoId, motivo));
      if (this.detalle?.estado !== 'abierta') await recargarListaSiHay(this);
      return resultado;
    },

    async cancelar(solicitudId, motivo) {
      const resultado = await this._mutar(solicitudId, () => insforgeApi.cancelarSolicitud(solicitudId, motivo));
      await recargarListaSiHay(this);
      return resultado;
    },
  },
});
