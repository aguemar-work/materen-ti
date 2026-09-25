<script setup>
// Select nativo de las barras de filtros (compacto, 32px — misma línea que
// el buscador y los segmentados). Las <option> van en el slot. Para selects
// DENTRO de formularios se usa la primitiva `.campo` (ver
// docs/SISTEMA-DISENO.md), no este componente.
defineProps({
  modelValue: { type: [String, Number, null], default: '' },
  label: { type: String, required: true },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <label class="relative inline-block">
    <span class="sr-only">{{ label }}</span>
    <select
      :value="modelValue"
      class="h-8 max-w-64 cursor-pointer appearance-none truncate rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-900 shadow-xs transition-colors duration-150 hover:border-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      data-ui
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <slot />
    </select>
    <i class="ti ti-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500" aria-hidden="true"></i>
  </label>
</template>
