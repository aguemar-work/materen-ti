import { useAuthStore } from '../stores/auth.js';
import { registrarAccesoDenegado } from '../api/passwords.js';

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

    // Cada bloqueo por rol queda auditado en accesos_log (migración 030).
    // Sin await: el registro no debe demorar el redirect.
    if (to.path === '/actividad' && !auth.esJefe) {
      registrarAccesoDenegado(to.path);
      return { path: '/dashboard' };
    }

    if (to.path === '/accesos-sensibles' && !auth.esJefe) {
      registrarAccesoDenegado(to.path);
      return { path: '/dashboard' };
    }

    // La pestaña Staff de Configuración es solo para el JEFE
    if (to.name === 'configuracion-staff' && !auth.esJefe) {
      registrarAccesoDenegado(to.path);
      return { name: 'configuracion-empresas' };
    }
  });
}
