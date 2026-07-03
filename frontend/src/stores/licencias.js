import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const useLicenciasStore = defineStore('licencias', {
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
        this.lista = await insforgeApi.listLicencias();
      } catch (e) {
        this.error = e?.message || 'Error al cargar licencias';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(datos) {
      this.error = null;
      await insforgeApi.createLicencia(datos);
      await this.cargar();
    },

    async actualizar(id, datos) {
      this.error = null;
      await insforgeApi.updateLicencia(id, datos);
      await this.cargar();
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteLicencia(id);
      this.lista = this.lista.filter((l) => l.id !== id);
    },

    async asignar(licenciaId, empleadoId) {
      this.error = null;
      await insforgeApi.asignarLicencia(licenciaId, empleadoId);
      await this.cargar();
    },

    async liberar(asignacionId, notas = null) {
      this.error = null;
      await insforgeApi.cerrarAsignacionLicencia(asignacionId, notas);
      await this.cargar();
    },

    async renovar(id, nuevaFecha) {
      this.error = null;
      await insforgeApi.renovarLicencia(id, nuevaFecha);
      const idx = this.lista.findIndex((l) => l.id === id);
      if (idx !== -1) this.lista[idx] = { ...this.lista[idx], fecha_vencimiento: nuevaFecha };
    },
  },
});
