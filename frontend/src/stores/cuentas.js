import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';
import { anotarErrorDb } from '../api/erroresDb.js';

// Las mutaciones corren por RPC de la migración 101 (crear_cuenta_asignada,
// traspasar_cuenta, cerrar_asignacion_cuenta): sus rechazos de negocio llegan
// como P0001 en español y el 42501 sin permiso. `anotarErrorDb` deja el error
// con `code` y el mensaje ya traducido, para que la vista lo muestre tal cual
// (nunca el texto crudo de PostgREST).
async function mutar(accion) {
  try {
    return await accion();
  } catch (e) {
    throw anotarErrorDb(e, { entidad: 'cuenta' });
  }
}

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
        this.error = anotarErrorDb(e, { entidad: 'cuenta', porDefecto: 'Error al cargar cuentas' }).message;
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async crear(empleadoId, datos) {
      this.error = null;
      const cuenta = await mutar(() => insforgeApi.createCuenta({ ...datos, empleado_id: empleadoId }));
      this.lista.push(cuenta);
      return cuenta;
    },

    async actualizar(id, datos) {
      this.error = null;
      const cuenta = await mutar(() => insforgeApi.updateCuenta(id, datos, this.empleadoActual));
      const idx = this.lista.findIndex((c) => c.id === id);
      if (idx !== -1) this.lista[idx] = cuenta;
      return cuenta;
    },

    async revocarAsignacion(asignacionId) {
      this.error = null;
      await mutar(() => insforgeApi.cerrarAsignacion(asignacionId));
      this.lista = this.lista.filter((c) => c.asignacion_id !== asignacionId);
    },

    // Solo para tipo_cuenta === 'personal' (ver el comentario de
    // revocarCuentaPersonal en api/domains/cuentas.js) — hallazgo 2026-08-20.
    async revocarCuentaPersonal(asignacionId) {
      this.error = null;
      await mutar(() => insforgeApi.revocarCuentaPersonal(asignacionId));
      this.lista = this.lista.filter((c) => c.asignacion_id !== asignacionId);
    },

    // Solo cuentas reutilizables (el servidor rechaza las personales y el
    // destino debe estar Activo). `nuevaPassword` es opcional: sin ella la
    // cuenta queda marcada "Rotar contraseña".
    async traspasar(asignacionId, nuevoEmpleadoId, notas, nuevaPassword = null) {
      this.error = null;
      await mutar(() => insforgeApi.traspasarCuenta(asignacionId, nuevoEmpleadoId, notas, nuevaPassword));
      this.lista = this.lista.filter((c) => c.asignacion_id !== asignacionId);
    },

    async asignarCompartida(empleadoId, cuentaId) {
      this.error = null;
      const cuenta = await mutar(() => insforgeApi.asignarCuentaExistente(cuentaId, empleadoId));
      this.lista.push(cuenta);
      return cuenta;
    },
  },
});
