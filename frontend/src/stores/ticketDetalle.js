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
    equiposEmpleado: [],
    articulosRelacionados: [],
    problemaVinculado: null,
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
        const [t, coms, staff, eventos] = await Promise.all([
          insforgeApi.getTicket(id),
          insforgeApi.listComentariosTicket(id),
          insforgeApi.listStaff(),
          insforgeApi.listEventosTicket(id),
        ]);
        // Si el ticket no existe, ticket queda en null (la vista decide el redirect).
        this.ticket = t || null;
        this.comentarios = coms;
        this.staffLista = staff;
        this.eventos = eventos;
        if (t && t.estado !== 'abierto') {
          this.satisfaccion = await insforgeApi.getSatisfaccionTicket(id);
        }
        // Equipos que tiene ASIGNADOS el solicitante (contexto para el
        // técnico), no el equipo/cuenta/licencia que el ticket referencia
        // (eso es "Enlazado a", un dato distinto).
        this.equiposEmpleado = t?.empleado_id ? await insforgeApi.equiposPorEmpleado(t.empleado_id) : [];
        // Base de Conocimiento: sugerencias por categoría del ticket, para
        // que el técnico resuelva más rápido sin salir de la ficha.
        this.articulosRelacionados = t?.categoria_id
          ? await insforgeApi.listArticulosRelacionados({ categoriaId: t.categoria_id })
          : [];
        // Gestión de Problemas: badge si este ticket ya está vinculado a un
        // problema todavía abierto (migración 033).
        this.problemaVinculado = t ? await insforgeApi.getProblemaAbiertoDeTicket(t.id) : null;
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

    // El historial (hoja de vida) se muestra siempre visible en la vista, así
    // que se refresca cada vez que un cambio de campo pudo generar un evento.
    async recargarEventos() {
      this.eventos = await insforgeApi.listEventosTicket(this.ticket.id);
    },

    async actualizarCampos(datos) {
      await insforgeApi.actualizarTicket(this.ticket.id, datos);
      Object.assign(this.ticket, datos);
      await this.recargarEventos();
    },

    // Resuelto -> cerrado en una sola transacción de servidor (migración
    // 051), en vez de 2 llamadas separadas a actualizarCampos(). Reemplaza
    // this.ticket completo: cerrarTicket() ya devuelve el shape mapeado
    // (con joins), igual que cargar().
    async marcarResueltoYCerrado() {
      this.ticket = await insforgeApi.cerrarTicket(this.ticket.id);
      await this.recargarEventos();
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

    async recargarProblemaVinculado() {
      this.problemaVinculado = await insforgeApi.getProblemaAbiertoDeTicket(this.ticket.id);
    },

    // Al cerrar el ticket, guarda la solución como borrador de KB (queda
    // pendiente de completar/revisar — ver migración 031).
    async guardarComoBorradorKb() {
      return insforgeApi.crearKbArticulo({
        titulo: this.ticket.titulo,
        categoria_id: this.ticket.categoria_id,
        ticket_origen_id: this.ticket.id,
        estado: 'borrador',
      });
    },

    limpiar() {
      this.$reset();
    },
  },
});
