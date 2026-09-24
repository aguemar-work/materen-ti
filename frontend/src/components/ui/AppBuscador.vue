<script setup>
import { ref } from 'vue';
// Campo de búsqueda de las barras de filtros. v-model = término (la vista
// decide si lo pasa por useBusqueda con debounce). La etiqueta es solo para
// lectores de pantalla; el placeholder dice qué se busca.
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Buscar' },
  label: { type: String, required: true },
});
defineEmits(['update:modelValue']);

// Para atajos de teclado de la vista (ej. "/" en Tickets).
const input = ref(null);
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <label class="relative block min-w-60 flex-1 sm:max-w-sm">
    <span class="sr-only">{{ label }}</span>
    <i class="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
    <input
      ref="input"
      :value="modelValue"
      type="search"
      :placeholder="placeholder"
      class="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      @input="$emit('update:modelValue', $event.target.value)"
    >
  </label>
</template>
