import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
// Eager solo lo que ve toda sesión al entrar: login y el landing.
// El resto es lazy (() => import): cada vista va a su propio chunk y las
// rutas públicas de tickets/entrega no descargan el panel completo.
import LoginView from '../modules/auth/LoginView.vue';
import DashboardView from '../modules/dashboard/DashboardView.vue';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
  },
  {
    path: '/',
    redirect: () => {
      const auth = useAuthStore();
      return auth.esStaff ? '/dashboard' : '/login';
    },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardView,
  },
  {
    path: '/empleados',
    name: 'empleados',
    component: () => import('../modules/empleados/EmpleadosView.vue'),
  },
  {
    path: '/empleados/:id',
    name: 'empleado-detalle',
    component: () => import('../modules/empleados/EmpleadoDetalleView.vue'),
  },
  {
    path: '/configuracion',
    name: 'configuracion',
    component: () => import('../modules/configuracion/ConfiguracionView.vue'),
  },
  // Rutas antiguas → sus pestañas dentro de Configuración
  { path: '/empresas', redirect: { path: '/configuracion', query: { tab: 'empresas' } } },
  { path: '/plataformas', redirect: { path: '/configuracion', query: { tab: 'plataformas' } } },
  { path: '/staff', redirect: { path: '/configuracion', query: { tab: 'staff' } } },
  {
    path: '/correos',
    name: 'correos',
    component: () => import('../modules/correos/CorreosView.vue'),
  },
  {
    path: '/licencias',
    name: 'licencias',
    component: () => import('../modules/licencias/LicenciasView.vue'),
  },
  {
    path: '/equipos',
    name: 'equipos',
    component: () => import('../modules/equipos/EquiposView.vue'),
  },
  {
    path: '/actividad',
    name: 'actividad',
    component: () => import('../modules/actividad/ActividadView.vue'),
  },
  {
    // Solo JEFE — ver guard en router/guards.js
    path: '/accesos-sensibles',
    name: 'accesos-sensibles',
    component: () => import('../modules/accesosSensibles/AccesosSensiblesView.vue'),
  },
  {
    path: '/tickets',
    name: 'tickets',
    component: () => import('../modules/tickets/TicketsView.vue'),
  },
  {
    path: '/tickets/:id',
    name: 'ticket-detalle',
    component: () => import('../modules/tickets/TicketDetalleView.vue'),
  },
  {
    // Página pública: el empleado abre su entrega de un solo uso sin sesión
    path: '/entrega/:token',
    name: 'entrega',
    component: () => import('../modules/entregas/EntregaView.vue'),
    meta: { public: true },
  },
  {
    // Página pública: landing de soporte (punto de entrada memorable
    // hacia reportar/buscar tickets; apta para QR o comunicado interno)
    path: '/soporte',
    name: 'soporte',
    component: () => import('../modules/soporte/SoporteView.vue'),
    meta: { public: true },
  },
  // Para quien escribe la ruta a medias
  { path: '/ticket', redirect: '/soporte' },
  {
    // Página pública: formulario de creación de ticket (?entrega=<token> opcional)
    path: '/ticket/nuevo',
    name: 'ticket-nuevo',
    component: () => import('../modules/tickets/TicketNuevoView.vue'),
    meta: { public: true },
  },
  {
    // Página pública: buscar tickets ACTIVOS por DNI (sin enlace guardado)
    path: '/ticket/buscar',
    name: 'ticket-buscar',
    component: () => import('../modules/tickets/TicketBuscarView.vue'),
    meta: { public: true },
  },
  {
    // Página pública: seguimiento de UN ticket por su propio token
    path: '/ticket/:token',
    name: 'ticket-seguimiento',
    component: () => import('../modules/tickets/TicketSeguimientoView.vue'),
    meta: { public: true },
  },
  {
    // Página pública: encuesta de satisfacción, enlace enviado al cerrar
    path: '/ticket/:token/satisfaccion',
    name: 'ticket-satisfaccion',
    component: () => import('../modules/tickets/TicketSatisfaccionView.vue'),
    meta: { public: true },
  },
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
