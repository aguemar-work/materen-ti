<script setup>
import { NOMBRE_PRODUCTO } from '../../core/marca.js';

// Cabecera de marca en páginas públicas (empleados sin sesión).
defineProps({
  subtitulo: { type: String, default: '' },
});
</script>

<template>
  <div class="brand brand--public">
    <img src="/logo_materen_sisti.svg" :alt="NOMBRE_PRODUCTO" class="brand-logo-public">
    <p v-if="subtitulo" class="brand-subtitulo-public">{{ subtitulo }}</p>
  </div>
</template>
