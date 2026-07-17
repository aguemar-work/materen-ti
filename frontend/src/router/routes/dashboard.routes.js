// Home + dashboard del panel interno.
// Eager (no lazy): el dashboard es el landing de toda sesión de staff.
import { useAuthStore } from '../../stores/auth.js';
import DashboardView from '../../modules/dashboard/DashboardView.vue';

export default [
  {
    path: '/',
    name: 'home',
    redirect: () => {
      const auth = useAuthStore();
      return auth.esStaff ? { name: 'dashboard' } : { name: 'login' };
    },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardView,
  },
];
