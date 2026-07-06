import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const useTicketsStore = defineStore('tickets', {
  state: () => ({
    lista: [],
    cargando: false,
    error: null,
  }),

  actions: {
    async cargar() {
      this.cargando = true;
      this.error = null;
      try {
        this.lista = await insforgeApi.listTickets();
      } catch (e) {
        this.error = e?.message || 'Error al cargar tickets';
        throw e;
      } finally {
        this.cargando = false;
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
