import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import LoginView from '../modules/auth/LoginView.vue';
import DashboardView from '../modules/dashboard/DashboardView.vue';
import EmpleadosView from '../modules/empleados/EmpleadosView.vue';
import EmpleadoDetalleView from '../modules/empleados/EmpleadoDetalleView.vue';
import ConfiguracionView from '../modules/configuracion/ConfiguracionView.vue';
import CorreosView from '../modules/correos/CorreosView.vue';
import LicenciasView from '../modules/licencias/LicenciasView.vue';
import EquiposView from '../modules/equipos/EquiposView.vue';
import ActividadView from '../modules/actividad/ActividadView.vue';
import EntregaView from '../modules/entregas/EntregaView.vue';
import TicketsView from '../modules/tickets/TicketsView.vue';
import TicketDetalleView from '../modules/tickets/TicketDetalleView.vue';
import TicketNuevoView from '../modules/tickets/TicketNuevoView.vue';
import TicketSeguimientoView from '../modules/tickets/TicketSeguimientoView.vue';
import TicketSatisfaccionView from '../modules/tickets/TicketSatisfaccionView.vue';
import TicketBuscarView from '../modules/tickets/TicketBuscarView.vue';

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
    component: EmpleadosView,
  },
  {
    path: '/empleados/:id',
    name: 'empleado-detalle',
    component: EmpleadoDetalleView,
  },
  {
    path: '/configuracion',
    name: 'configuracion',
    component: ConfiguracionView,
  },
  // Rutas antiguas → sus pestañas dentro de Configuración
  { path: '/empresas', redirect: { path: '/configuracion', query: { tab: 'empresas' } } },
  { path: '/plataformas', redirect: { path: '/configuracion', query: { tab: 'plataformas' } } },
  { path: '/staff', redirect: { path: '/configuracion', query: { tab: 'staff' } } },
  {
    path: '/correos',
    name: 'correos',
    component: CorreosView,
  },
  {
    path: '/licencias',
    name: 'licencias',
    component: LicenciasView,
  },
  {
    path: '/equipos',
    name: 'equipos',
    component: EquiposView,
  },
  {
    path: '/actividad',
    name: 'actividad',
    component: ActividadView,
  },
  {
    path: '/tickets',
    name: 'tickets',
    component: TicketsView,
  },
  {
    path: '/tickets/:id',
    name: 'ticket-detalle',
    component: TicketDetalleView,
  },
  {
    // Página pública: el empleado abre su entrega de un solo uso sin sesión
    path: '/entrega/:token',
    name: 'entrega',
    component: EntregaView,
    meta: { public: true },
  },
  {
    // Página pública: formulario de creación de ticket (?entrega=<token> opcional)
    path: '/ticket/nuevo',
    name: 'ticket-nuevo',
    component: TicketNuevoView,
    meta: { public: true },
  },
  {
    // Página pública: buscar tickets ACTIVOS por DNI (sin enlace guardado)
    path: '/ticket/buscar',
    name: 'ticket-buscar',
    component: TicketBuscarView,
    meta: { public: true },
  },
  {
    // Página pública: seguimiento de UN ticket por su propio token
    path: '/ticket/:token',
    name: 'ticket-seguimiento',
    component: TicketSeguimientoView,
    meta: { public: true },
  },
  {
    // Página pública: encuesta de satisfacción, enlace enviado al cerrar
    path: '/ticket/:token/satisfaccion',
    name: 'ticket-satisfaccion',
    component: TicketSatisfaccionView,
    meta: { public: true },
  },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
