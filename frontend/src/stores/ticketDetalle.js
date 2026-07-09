import { defineStore } from 'pinia';
import { insforgeApi, getClient } from '../api/insforge.js';

// Detalle de un ticket: toda la data de TicketDetalleView pasa por acá.
// Mismo patrón que stores/tickets.js: state plano, actions async que lanzan
// (la vista captura y muestra el toast).
export const useTicketDetalleStore = defineStore('ticketDetalle', {
  state: () => ({
    ticket: null,
    comentarios: [],
    eventos: [],
    satisfaccion: null,
    staffLista: [],
    cargando: false,
    error: null,
  }),

  getters: {
    staffActivo: (state) => state.staffLista.filter((s) => s.activo),
    staffPorId() {
      const mapa = {};
      for (const s of this.staffActivo) mapa[s.user_id] = s.nombre;
      return mapa;
    },
  },

  actions: {
    async cargar(id) {
      this.cargando = true;
      this.error = null;
      try {
        const [t, coms, staff] = await Promise.all([
          insforgeApi.getTicket(id),
          insforgeApi.listComentariosTicket(id),
          insforgeApi.listStaff(),
        ]);
        // Si el ticket no existe, ticket queda en null (la vista decide el redirect).
        this.ticket = t || null;
        this.comentarios = coms;
        this.staffLista = staff;
        if (t && t.estado !== 'abierto') {
          this.satisfaccion = await insforgeApi.getSatisfaccionTicket(id);
        }
      } catch (e) {
        this.error = e?.message || 'Error al cargar el ticket';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async recargarComentarios() {
      this.comentarios = await insforgeApi.listComentariosTicket(this.ticket.id);
    },

    // Lazy: la vista lo llama al abrir la hoja de vida
    async cargarEventos() {
      this.eventos = await insforgeApi.listEventosTicket(this.ticket.id);
    },

    async actualizarCampos(datos) {
      await insforgeApi.actualizarTicket(this.ticket.id, datos);
      Object.assign(this.ticket, datos);
    },

    async comentar(mensaje, interno) {
      await insforgeApi.crearComentarioTicket(this.ticket.id, mensaje, interno);
      await this.recargarComentarios();
    },

    async enviarEncuesta() {
      const { data } = await getClient().functions.invoke('tickets', {
        body: { action: 'enviarEncuesta', ticketId: this.ticket.id },
      });
      return data;
    },

    async recargarSatisfaccion() {
      this.satisfaccion = await insforgeApi.getSatisfaccionTicket(this.ticket.id);
    },

    limpiar() {
      this.$reset();
    },
  },
});
