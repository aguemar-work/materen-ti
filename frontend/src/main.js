import { createApp } from 'vue';
import * as Sentry from '@sentry/vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import { setupGuards } from './router/guards.js';
import { useAuthStore } from './stores/auth.js';
import './styles/main.css';
import { initToast } from './core/toast.js';
import { initTema } from './core/tema.js';

initTema();

// Observabilidad (D-01): solo en build de producción y con DSN configurado
// — `npm run dev` sin la variable no inicializa nada, cero ruido ni costo
// en desarrollo. Sin Session Replay ni breadcrumbs de red: esta app maneja
// DNI, tickets y credenciales, no se justifica grabar DOM/inputs/bodies de
// request. `sendDefaultPii: false` evita que un evento adjunte datos
// personales por defecto. La captura de errores no controlados
// (window.onerror/unhandledrejection) viene incluida por el SDK, sin
// código adicional.
function initObservabilidad(app) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!import.meta.env.PROD || !dsn) return;
  Sentry.init({
    app,
    dsn,
    integrations: [],
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

async function boot() {
  const app = createApp(App);
  const pinia = createPinia();

  initObservabilidad(app);
  app.use(pinia);

  const auth = useAuthStore();
  await auth.cargarSesion();

  setupGuards(router);
  app.use(router);
  await router.isReady();

  app.mount('#app');
  initToast();
}

boot();
