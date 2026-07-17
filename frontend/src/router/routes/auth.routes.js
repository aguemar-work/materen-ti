// Autenticación del panel de staff.
// Eager (no lazy): login es lo primero que ve toda sesión al entrar.
import LoginView from '../../modules/auth/LoginView.vue';

export default [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
  },
];
