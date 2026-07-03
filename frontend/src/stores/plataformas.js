import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const usePlataformasStore = defineStore('plataformas', {
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
        this.lista = await insforgeApi.listPlataformas();
      } catch (e) {
        this.error = e?.message || 'Error al cargar plataformas';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(datos) {
      this.error = null;
      const plataforma = await insforgeApi.createPlataforma(datos);
      this.lista.push(plataforma);
      this.lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return plataforma;
    },

    async actualizar(id, datos) {
      this.error = null;
      const plataforma = await insforgeApi.updatePlataforma(id, datos);
      const idx = this.lista.findIndex((p) => p.id === id);
      if (idx !== -1) this.lista[idx] = plataforma;
      return plataforma;
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeletePlataforma(id);
      this.lista = this.lista.filter((p) => p.id !== id);
    },
  },
});
