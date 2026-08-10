import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Lista de plantillas de encuesta — pocas filas esperadas (catálogo chico,
// no paginado). Rondas y respuestas de una encuesta viven como estado
// local de EncuestaDetalleView.vue (no se comparten entre vistas, no
// necesitan pasar por Pinia).
export const useEncuestasStore = defineStore('encuestas', {
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
        this.lista = await insforgeApi.listEncuestas();
      } catch (e) {
        this.error = e?.message || 'Error al cargar las encuestas';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(datos) {
      this.error = null;
      const encuesta = await insforgeApi.createEncuesta(datos);
      this.lista.unshift(encuesta);
      return encuesta;
    },

    async actualizar(id, datos) {
      this.error = null;
      const encuesta = await insforgeApi.updateEncuesta(id, datos);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = encuesta;
      return encuesta;
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEncuesta(id);
      this.lista = this.lista.filter((e) => e.id !== id);
    },
  },
});
