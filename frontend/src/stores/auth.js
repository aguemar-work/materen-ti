import { defineStore } from 'pinia';
import { getClient } from '../api/insforge.js';
import { staffModulosApi } from '../api/domains/staffModulos.js';
import { staffPermisosApi } from '../api/domains/staffPermisos.js';

async function cargarStaff(userId) {
  const { data, error } = await getClient().database
    .from('staff')
    .select('rol, activo, nombre')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data; // null si el usuario no tiene fila de staff
}

// Módulos habilitados para el sidebar. Solo importa para ASISTENTE (JEFE ve
// todos vía el getter puedeVerModulo) pero se consulta igual: es una sola
// fila de más y evita un camino especial por rol acá.
async function cargarModulos(userId) {
  try {
    return await staffModulosApi.misModulos(userId);
  } catch {
    return [];
  }
}

// Permisos individuales (migración 060). Solo importa para ASISTENTE (JEFE
// ve credenciales siempre vía el getter puedeVerCredenciales) pero se
// consulta igual, mismo criterio que cargarModulos.
async function cargarPermisos(userId) {
  try {
    return await staffPermisosApi.misPermisos(userId);
  } catch {
    return [];
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    rol: null,
    nombre: null,
    modulosVisibles: [],
    permisos: [],
    cargando: false,
    sesionCargada: false,
  }),

  getters: {
    esJefe: (state) => state.rol === 'JEFE',
    esStaff: (state) => state.user !== null,
    // JEFE siempre ve todos los módulos (migración 056), sin consultar
    // modulosVisibles.
    puedeVerModulo: (state) => (id) => state.rol === 'JEFE' || state.modulosVisibles.includes(id),
    // JEFE siempre puede revelar/enviar credenciales (migración 060), sin
    // consultar `permisos`. Gate cosmético: la barrera real está en
    // functions/credenciales.ts, esto solo oculta/deshabilita botones.
    puedeVerCredenciales: (state) => state.rol === 'JEFE' || state.permisos.includes('credenciales.ver'),
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
        this.nombre = staff.nombre;
        this.modulosVisibles = await cargarModulos(data.user.id);
        this.permisos = await cargarPermisos(data.user.id);
      } finally {
        this.cargando = false;
      }
    },

    async logout() {
      await getClient().auth.signOut();
      this.user = null;
      this.rol = null;
      this.nombre = null;
      this.modulosVisibles = [];
      this.permisos = [];
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

    // Sincroniza el nombre en sesión tras editarlo (migración 061, ver
    // StaffNombreForm.vue — ese componente hace el UPDATE real, este método
    // solo refleja el resultado en el estado de sesión que lee el sidebar).
    actualizarNombre(nombre) {
      this.nombre = nombre;
    },

    async cargarSesion() {
      this.cargando = true;
      try {
        const { data, error } = await getClient().auth.getCurrentUser();
        if (error || !data?.user) {
          this.user = null;
          this.rol = null;
          this.nombre = null;
          this.modulosVisibles = [];
          this.permisos = [];
          return;
        }

        // Sesión válida pero staff inactivo/eliminado, o la consulta falla
        // porque el token venció y no hubo refresh posible → cerrar sesión.
        let staff;
        try {
          staff = await cargarStaff(data.user.id);
        } catch {
          staff = null;
        }
        if (!staff || staff.activo === false) {
          await getClient().auth.signOut().catch(() => {});
          this.user = null;
          this.rol = null;
          this.nombre = null;
          this.modulosVisibles = [];
          this.permisos = [];
          return;
        }

        this.user = data.user;
        this.rol = staff.rol;
        this.nombre = staff.nombre;
        this.modulosVisibles = await cargarModulos(data.user.id);
        this.permisos = await cargarPermisos(data.user.id);
      } finally {
        this.cargando = false;
        this.sesionCargada = true;
      }
    },
  },
});
