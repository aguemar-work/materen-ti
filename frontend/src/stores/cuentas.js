import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const useCuentasStore = defineStore('cuentas', {
  state: () => ({
    lista: [],
    empleadoActual: null,
    cargando: false,
    error: null,
  }),

  actions: {
    async cargarPorEmpleado(empleadoId) {
      this.cargando = true;
      this.error = null;
      this.empleadoActual = empleadoId;
      try {
        this.lista = await insforgeApi.listCuentasPorEmpleado(empleadoId);
      } catch (e) {
        this.error = e?.message || 'Error al cargar cuentas';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(empleadoId, datos) {
      this.error = null;
      const cuenta = await insforgeApi.createCuenta({ ...datos, empleado_id: empleadoId });
      this.lista.push(cuenta);
      return cuenta;
    },

    async actualizar(id, datos) {
      this.error = null;
      const cuenta = await insforgeApi.updateCuenta(id, datos, this.empleadoActual);
      const idx = this.lista.findIndex((c) => c.id === id);
      if (idx !== -1) this.lista[idx] = cuenta;
      return cuenta;
    },

    async revocarAsignacion(asignacionId) {
      this.error = null;
      await insforgeApi.cerrarAsignacion(asignacionId);
      this.lista = this.lista.filter((c) => c.asignacion_id !== asignacionId);
    },

    // Solo para tipo_cuenta === 'personal' (ver el comentario de
    // revocarCuentaPersonal en api/domains/cuentas.js) — hallazgo 2026-08-20.
    async revocarCuentaPersonal(asignacionId) {
      this.error = null;
      await insforgeApi.revocarCuentaPersonal(asignacionId);
      this.lista = this.lista.filter((c) => c.asignacion_id !== asignacionId);
    },

    async traspasar(asignacionId, nuevoEmpleadoId, notas) {
      this.error = null;
      await insforgeApi.traspasarCuenta(asignacionId, nuevoEmpleadoId, notas);
      this.lista = this.lista.filter((c) => c.asignacion_id !== asignacionId);
    },

    async asignarCompartida(empleadoId, cuentaId) {
      this.error = null;
      const cuenta = await insforgeApi.asignarCuentaExistente(cuentaId, empleadoId);
      this.lista.push(cuenta);
      return cuenta;
    },
  },
});
