<script setup>
// Fila de libro con un aviso de sección y su reintento (regla 21: el vacío o
// el fallo se escribe, no se ilustra). El reintento es un enlace de texto en
// la misma fila.
defineProps({
  texto: { type: String, required: true },
  /** Sin botón (el aviso es informativo). */
  sinReintento: { type: Boolean, default: false },
});
defineEmits(['reintentar']);
</script>

<template>
  <p class="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 px-3 py-2 text-sm text-gray-600" role="alert">
    <span class="min-w-0">— {{ texto }}</span>
    <button
      v-if="!sinReintento"
      type="button"
      class="rounded text-sm font-medium text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      @click="$emit('reintentar')"
    >Reintentar</button>
  </p>
</template>
