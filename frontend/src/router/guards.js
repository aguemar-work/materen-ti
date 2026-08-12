import { useAuthStore } from '../stores/auth.js';
import { registrarAccesoDenegado } from '../api/passwords.js';

// Roles declarados en meta.roles de routes/*.routes.js — agregar aquí al
// sumar un rol nuevo.
const CUMPLE_ROL = {
  jefe: (auth) => auth.esJefe,
};

export function setupGuards(router) {
  router.beforeEach(async (to) => {
    // Rutas públicas (ej: /entrega/:token) no requieren sesión ni cargarla
    if (to.meta.public) return;

    const auth = useAuthStore();

    // Se revalida en cada navegación, no solo la primera vez: el token
    // puede vencer con la pestaña abierta y nada más se entera (el SDK
    // guarda la sesión en memoria, sin evento que avise al store).
    await auth.cargarSesion();

    if (to.path === '/login') {
      // Ya autenticado y yendo a /login (pestaña vieja, botón atrás):
      // al panel, no tiene sentido mostrar el login con el sidebar detrás.
      if (auth.esStaff) return { path: '/dashboard' };
      return;
    }

    if (!auth.esStaff) {
      return { path: '/login' };
    }

    // Roles restringidos declarados en meta.roles (ver routes/*.routes.js).
    // Cada bloqueo queda auditado en accesos_log (migración 030); sin
    // await porque el registro no debe demorar el redirect.
    const roles = to.meta.roles;
    if (roles && !roles.some((rol) => CUMPLE_ROL[rol]?.(auth))) {
      registrarAccesoDenegado(to.path);
      return to.meta.redirigirDenegado ?? { path: '/dashboard' };
    }
  });
}
