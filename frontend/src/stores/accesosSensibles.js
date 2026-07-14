import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Módulo restringido a JEFE (ver router guard + AppLayout). `userId` se
// guarda en el store porque listAccesosSensibles() lo necesita para
// calcular `puedeRevelar` por fila, y crear/actualizar/eliminar recargan
// la lista después de mutar.
export const useAccesosSensiblesStore = defineStore('accesos-sensibles', {
  state: () => ({
    lista: [],
    cargando: false,
    error: null,
    userId: null,
  }),

  actions: {
    async cargar(userId) {
      if (userId) this.userId = userId;
      this.cargando = true;
      this.error = null;
      try {
        this.lista = await insforgeApi.listAccesosSensibles(this.userId);
      } catch (e) {
        this.error = e?.message || 'Error al cargar accesos sensibles';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(datos, staffUserIds) {
      this.error = null;
      await insforgeApi.crearAccesoSensible(datos, staffUserIds, this.userId);
      await this.cargar();
    },

    async actualizar(id, datos, staffUserIds) {
      this.error = null;
      await insforgeApi.actualizarAccesoSensible(id, datos, staffUserIds);
      await this.cargar();
    },

    async eliminar(id) {
      this.error = null;
      await insforgeApi.eliminarAccesoSensible(id);
      this.lista = this.lista.filter((a) => a.id !== id);
    },
  },
});
