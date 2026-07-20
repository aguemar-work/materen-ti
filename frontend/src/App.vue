<script setup>
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { errorRedActivo, cancelarErrorRed } from './core/error-red.js';
import AppLayout from './components/shared/AppLayout.vue';
import ErrorRedView from './modules/errores/ErrorRedView.vue';

const auth = useAuthStore();
const route = useRoute();

// Si el usuario navega (ej. botón atrás) con el fallback de red visible,
// ya no tiene sentido reintentar esa petición: se cancela y se oculta.
watch(() => route.fullPath, () => cancelarErrorRed());
</script>

<template>
  <AppLayout v-if="auth.esStaff && !route.meta.public">
    <router-view />
  </AppLayout>
  <router-view v-else />
  <ErrorRedView v-if="errorRedActivo" />
  <div id="toast" class="toast" style="display: none"></div>
</template>
