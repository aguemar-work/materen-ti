import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import { setupGuards } from './router/guards.js';
import { useAuthStore } from './stores/auth.js';
import './styles/main.css';
import { initToast } from './core/toast.js';
import { initTema } from './core/tema.js';

initTema();

async function boot() {
  const app = createApp(App);
  const pinia = createPinia();

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
