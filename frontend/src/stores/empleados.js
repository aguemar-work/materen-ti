import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const useEmpleadosStore = defineStore('empleados', {
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
        this.lista = await insforgeApi.listEmpleados();
      } catch (e) {
        this.error = e?.message || 'Error al cargar empleados';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(datos) {
      this.error = null;
      const empleado = await insforgeApi.createEmpleado(datos);
      this.lista.push(empleado);
      this.lista.sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
      return empleado;
    },

    async actualizar(id, datos) {
      this.error = null;
      const empleado = await insforgeApi.updateEmpleado(id, datos);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empleado;
      return empleado;
    },

    async darDeBaja(id) {
      this.error = null;
      const { empleado, resumen } = await insforgeApi.bajaEmpleado(id);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empleado;
      return { empleado, resumen };
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEmpleado(id);
      this.lista = this.lista.filter((e) => e.id !== id);
    },

    async reactivar(id) {
      this.error = null;
      const empleado = await insforgeApi.reactivarEmpleado(id);
      this.lista.push(empleado);
      this.lista.sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
      return empleado;
    },
  },
});
