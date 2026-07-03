<script setup>
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import AppLayout from './components/shared/AppLayout.vue';

const auth = useAuthStore();
const route = useRoute();
</script>

<template>
  <AppLayout v-if="auth.esStaff && !route.meta.public">
    <router-view />
  </AppLayout>
  <router-view v-else />
  <div id="toast" class="toast" style="display: none"></div>
</template>
