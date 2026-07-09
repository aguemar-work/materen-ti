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

    if (to.path === '/actividad' && !auth.esJefe) {
      return { path: '/dashboard' };
    }

    // La pestaña Staff de Configuración es solo para el JEFE
    if (to.path === '/configuracion' && to.query.tab === 'staff' && !auth.esJefe) {
      return { path: '/configuracion' };
    }
  });
}
