import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const useEmpresasStore = defineStore('empresas', {
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
        this.lista = await insforgeApi.listEmpresas();
      } catch (e) {
        this.error = e?.message || 'Error al cargar empresas';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(datos) {
      this.error = null;
      const empresa = await insforgeApi.createEmpresa(datos);
      this.lista.push(empresa);
      this.lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return empresa;
    },

    async actualizar(id, datos) {
      this.error = null;
      const empresa = await insforgeApi.updateEmpresa(id, datos);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empresa;
      return empresa;
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEmpresa(id);
      this.lista = this.lista.filter((e) => e.id !== id);
    },
  },
});
