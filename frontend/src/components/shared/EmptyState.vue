<script setup>
defineProps({
  icono: { type: String, default: 'ti ti-inbox' },
  titulo: { type: String, required: true },
  mensaje: { type: String, default: '' },
});
</script>

<template>
  <div class="empty">
    <div class="empty-icon"><i :class="icono" aria-hidden="true"></i></div>
    <h3>{{ titulo }}</h3>
    <p v-if="mensaje">{{ mensaje }}</p>
    <slot />
  </div>
</template>
