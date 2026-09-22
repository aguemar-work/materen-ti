<script setup>
// Control segmentado: elegir UNA opción de pocas (2–5) siempre visibles —
// filtros de estado, pestañas de una vista. Con más opciones, o cuando no
// caben, usar AppSelect. `opciones`: [{ valor, label, conteo?, icono? }].
defineProps({
  modelValue: { type: [String, Number, Boolean, null], default: null },
  opciones: { type: Array, required: true },
  label: { type: String, required: true },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="inline-flex max-w-full overflow-x-auto rounded-md bg-gray-100 p-0.5" role="group" :aria-label="label">
    <button
      v-for="op in opciones"
      :key="String(op.valor)"
      type="button"
      class="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      :class="modelValue === op.valor ? 'bg-white text-gray-900 ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'"
      :aria-pressed="modelValue === op.valor"
      @click="$emit('update:modelValue', op.valor)"
    >
      <i v-if="op.icono" :class="op.icono" aria-hidden="true"></i>
      {{ op.label }}
      <span
        v-if="op.conteo != null"
        class="rounded-full px-1.5 text-xs leading-5 tabular-nums"
        :class="modelValue === op.valor ? 'bg-gray-100 text-gray-700' : 'text-gray-500'"
      >{{ op.conteo }}</span>
    </button>
  </div>
</template>
