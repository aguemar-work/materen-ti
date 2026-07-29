import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Detalle de un problema: título/descripción/causa raíz, tickets vinculados
// y acciones correctivas. Mismo patrón que stores/ticketDetalle.js: state
// plano, actions async que lanzan (la vista captura y muestra el toast) —
// el bloqueo de cierre con acciones pendientes lo aplica el trigger de la
// BD (migración 033), no este store.
export const useProblemaDetalleStore = defineStore('problemaDetalle', {
  state: () => ({
    problema: null,
    ticketsVinculados: [],
    accionesCorrectivas: [],
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
        const [problema, staff] = await Promise.all([
          insforgeApi.getProblema(id),
          insforgeApi.listStaff(),
        ]);
        this.problema = problema;
        this.staffLista = staff;
        if (problema) {
          const [tickets, acciones] = await Promise.all([
            insforgeApi.listTicketsVinculados(id),
            insforgeApi.listAccionesCorrectivas(id),
          ]);
          this.ticketsVinculados = tickets;
          this.accionesCorrectivas = acciones;
        }
      } catch (e) {
        this.error = e?.message || 'Error al cargar el problema';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async actualizarCampos(datos) {
      this.problema = await insforgeApi.actualizarProblema(this.problema.id, datos);
    },

    async vincularTicket(ticketId) {
      await insforgeApi.vincularTicket(this.problema.id, ticketId);
      this.ticketsVinculados = await insforgeApi.listTicketsVinculados(this.problema.id);
    },

    async desvincularTicket(vinculoId) {
      await insforgeApi.desvincularTicket(vinculoId);
      this.ticketsVinculados = await insforgeApi.listTicketsVinculados(this.problema.id);
    },

    async crearAccion(datos) {
      await insforgeApi.crearAccionCorrectiva(this.problema.id, datos);
      this.accionesCorrectivas = await insforgeApi.listAccionesCorrectivas(this.problema.id);
    },

    async actualizarAccion(id, datos) {
      await insforgeApi.actualizarAccionCorrectiva(id, datos);
      this.accionesCorrectivas = await insforgeApi.listAccionesCorrectivas(this.problema.id);
    },

    async eliminarAccion(id) {
      await insforgeApi.softDeleteAccionCorrectiva(id);
      this.accionesCorrectivas = await insforgeApi.listAccionesCorrectivas(this.problema.id);
    },

    async eliminarProblema() {
      await insforgeApi.softDeleteProblema(this.problema.id);
    },

    limpiar() {
      this.$reset();
    },
  },
});
