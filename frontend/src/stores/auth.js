import { defineStore } from 'pinia';
import { getClient } from '../api/insforge.js';

async function cargarStaff(userId) {
  const { data, error } = await getClient().database
    .from('staff')
    .select('rol, activo')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data; // null si el usuario no tiene fila de staff
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    rol: null,
    cargando: false,
    sesionCargada: false,
  }),

  getters: {
    esJefe: (state) => state.rol === 'JEFE',
    esStaff: (state) => state.user !== null,
  },

  actions: {
    async login(email, password) {
      this.cargando = true;
      try {
        const { data, error } = await getClient().auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Autenticarse no basta: la fila de staff debe existir y estar
        // activa (el trigger de alta crea staff con activo = false hasta
        // que el JEFE lo apruebe — auditoría H-CRIT).
        const staff = await cargarStaff(data.user.id);
        if (!staff || staff.activo === false) {
          await getClient().auth.signOut();
          throw new Error('Tu cuenta está pendiente de activación. Contacta al administrador.');
        }

        this.user = data.user;
        this.rol = staff.rol;
      } finally {
        this.cargando = false;
      }
    },

    async logout() {
      await getClient().auth.signOut();
      this.user = null;
      this.rol = null;
    },

    // Flujo de reestablecer contraseña (método "code"):
    // 1. solicitarCodigoReset → envía código de 6 dígitos al correo
    // 2. verificarCodigoReset → intercambia el código por un token
    // 3. cambiarPassword      → guarda la nueva contraseña con el token
    async solicitarCodigoReset(email) {
      const { error } = await getClient().auth.sendResetPasswordEmail({ email });
      if (error) throw error;
    },

    async verificarCodigoReset(email, code) {
      const { data, error } = await getClient().auth.exchangeResetPasswordToken({ email, code });
      if (error) throw error;
      return data.token;
    },

    async cambiarPassword(token, newPassword) {
      const { error } = await getClient().auth.resetPassword({ newPassword, otp: token });
      if (error) throw error;
    },

    async cargarSesion() {
      this.cargando = true;
      try {
        const { data, error } = await getClient().auth.getCurrentUser();
        if (error || !data?.user) {
          this.user = null;
          this.rol = null;
          return;
        }

        // Sesión válida pero staff inactivo/eliminado → cerrar sesión
        const staff = await cargarStaff(data.user.id);
        if (!staff || staff.activo === false) {
          await getClient().auth.signOut();
          this.user = null;
          this.rol = null;
          return;
        }

        this.user = data.user;
        this.rol = staff.rol;
      } finally {
        this.cargando = false;
        this.sesionCargada = true;
      }
    },
  },
});
