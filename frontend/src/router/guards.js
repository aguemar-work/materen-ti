import { useAuthStore } from '../stores/auth.js';

export function setupGuards(router) {
  router.beforeEach(async (to) => {
    // Rutas públicas (ej: /entrega/:token) no requieren sesión ni cargarla
    if (to.meta.public) return;

    const auth = useAuthStore();

    if (!auth.sesionCargada) {
      await auth.cargarSesion();
    }

    if (to.path !== '/login' && !auth.esStaff) {
      return { path: '/login' };
    }

    if ((to.path === '/staff' || to.path === '/actividad') && !auth.esJefe) {
      return { path: '/empleados' };
    }
  });
}
