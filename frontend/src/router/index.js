import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import LoginView from '../modules/auth/LoginView.vue';
import DashboardView from '../modules/dashboard/DashboardView.vue';
import EmpleadosView from '../modules/empleados/EmpleadosView.vue';
import EmpleadoDetalleView from '../modules/empleados/EmpleadoDetalleView.vue';
import EmpresasView from '../modules/empresas/EmpresasView.vue';
import PlataformasView from '../modules/plataformas/PlataformasView.vue';
import CorreosView from '../modules/correos/CorreosView.vue';
import LicenciasView from '../modules/licencias/LicenciasView.vue';
import EquiposView from '../modules/equipos/EquiposView.vue';
import StaffView from '../modules/staff/StaffView.vue';
import ActividadView from '../modules/actividad/ActividadView.vue';
import EntregaView from '../modules/entregas/EntregaView.vue';

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
    path: '/empresas',
    name: 'empresas',
    component: EmpresasView,
  },
  {
    path: '/plataformas',
    name: 'plataformas',
    component: PlataformasView,
  },
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
    path: '/staff',
    name: 'staff',
    component: StaffView,
  },
  {
    path: '/actividad',
    name: 'actividad',
    component: ActividadView,
  },
  {
    // Página pública: el empleado abre su entrega de un solo uso sin sesión
    path: '/entrega/:token',
    name: 'entrega',
    component: EntregaView,
    meta: { public: true },
  },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
