import { createApp } from 'vue';
import * as Sentry from '@sentry/vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import router from './router/index.js';
import { setupGuards } from './router/guards.js';
import { useAuthStore } from './stores/auth.js';
// Capa vendor de Carbon (valores `--cds-*`) antes que la capa de roles que la
// consume. El orden NO es un requisito tecnico (la sustitucion de var() ocurre
// despues de la cascada, asi que main.css resolveria igual si fuera primero) pero
// si lo es de lectura: refleja la direccion de la dependencia y deja claro cual de
// los dos archivos gana si algun dia declaran la MISMA propiedad (gana main.css,
// el de abajo). Ver la cabecera de styles/carbon-theme.css.
import './styles/carbon-theme.css';
import './styles/main.css';
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
  // Unstyled (headless): PrimeVue no inyecta NINGÚN CSS propio — cero clases
  // `p-*`, cero tema (Aura/Lara u otro). El 100% del look sale de Tailwind vía
  // Pass-Through, siempre desde nuestros wrappers en components/ui/ (ver
  // AppButton.vue). Nunca importar un componente de PrimeVue directo en una
  // vista o módulo — eso reabre la puerta a estilos inconsistentes que el
  // wrapper existe justamente para cerrar.
  app.use(PrimeVue, { unstyled: true, ripple: false });

  const auth = useAuthStore();
  await auth.cargarSesion();

  setupGuards(router);
  app.use(router);
  await router.isReady();

  app.mount('#app');
}

boot();
