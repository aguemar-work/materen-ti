import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const useStaffStore = defineStore('staff', {
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
        this.lista = await insforgeApi.listStaff();
      } catch (e) {
        this.error = e?.message || 'Error al cargar staff';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async actualizar(userId, datos) {
      this.error = null;
      const miembro = await insforgeApi.updateStaff(userId, datos);
      const idx = this.lista.findIndex((s) => s.user_id === userId);
      if (idx !== -1) this.lista[idx] = miembro;
      return miembro;
    },

    // Técnico de mesa de ayuda (migración 118): solo un JEFE lo cambia (el
    // trigger check_staff_tecnico_mesa responde 42501 a cualquier otro).
    async setTecnicoMesa(userId, valor) {
      return this.actualizar(userId, { tecnico_mesa: valor });
    },

    // Toggle de "credenciales.ver" (migración 060). Sin ConfirmDialog: el
    // otorgamiento/revocación queda auditado en accesos_log por su propio
    // trigger (staff_permisos_log_evento), la fricción baja es aceptable.
    async setCredencialesVer(userId, otorgar) {
      this.error = null;
      await insforgeApi.setCredencialesVer(userId, otorgar);
      const idx = this.lista.findIndex((s) => s.user_id === userId);
      if (idx !== -1) this.lista[idx] = { ...this.lista[idx], credenciales_ver: otorgar };
    },
  },
});
