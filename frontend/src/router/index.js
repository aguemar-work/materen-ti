import { createRouter, createWebHistory } from 'vue-router';
// Rutas separadas por dominio en ./routes/. Convención de carga:
// eager solo lo que ve toda sesión al entrar (login y dashboard);
// el resto es lazy (() => import): cada vista va a su propio chunk y
// las rutas públicas de soporte/entrega no descargan el panel completo.
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import staffRoutes from './routes/staff.routes.js';
import configRoutes from './routes/config.routes.js';
import inventarioRoutes from './routes/inventario.routes.js';
import ticketsRoutes from './routes/tickets.routes.js';
import soporteRoutes from './routes/soporte.routes.js';
import actividadRoutes from './routes/actividad.routes.js';

const routes = [
  ...authRoutes,
  ...dashboardRoutes,
  ...staffRoutes,
  ...configRoutes,
  ...inventarioRoutes,
  ...ticketsRoutes,
  ...actividadRoutes,
  ...soporteRoutes,
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Tras un deploy los chunks viejos desaparecen (hashes nuevos): si un
// import() de vista falla, recarga dura para traer el index.html nuevo.
router.onError((err, to) => {
  if (/Failed to fetch dynamically imported module|error loading dynamically imported/i.test(err?.message)) {
    window.location.assign(to.fullPath);
  }
});

export default router;
