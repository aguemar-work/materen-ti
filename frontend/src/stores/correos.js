import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const useCorreosStore = defineStore('correos', {
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
        this.lista = await insforgeApi.listCorreosCompartidos();
      } catch (e) {
        this.error = e?.message || 'Error al cargar correos compartidos';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(datos) {
      this.error = null;
      const correo = await insforgeApi.createCorreo(datos);
      this.lista.push(correo);
      return correo;
    },

    async actualizar(id, datos) {
      this.error = null;
      const correo = await insforgeApi.updateCorreo(id, datos);
      const idx = this.lista.findIndex((c) => c.id === id);
      if (idx !== -1) {
        // update no trae las asignaciones anidadas: conservar las que ya teníamos
        this.lista[idx] = { ...correo, asignados: correo.asignados ?? this.lista[idx].asignados };
      }
      return correo;
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteCorreo(id);
      this.lista = this.lista.filter((c) => c.id !== id);
    },
  },
});
