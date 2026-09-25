<script setup>
// Control segmentado: elegir UNA opción de pocas (2–5) siempre visibles —
// filtros de estado, pestañas de una vista. Con más opciones, o cuando no
// caben, usar AppSelect. `opciones`: [{ valor, label, conteo?, icono? }].
// V2: 32px de alto en total (misma línea que el buscador); la opción activa
// es una pastilla blanca con sombra mínima — el mismo lenguaje que el ítem
// activo del menú lateral, "un pedazo de hoja".
defineProps({
  modelValue: { type: [String, Number, Boolean, null], default: null },
  opciones: { type: Array, required: true },
  label: { type: String, required: true },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="inline-flex h-8 max-w-full shrink-0 items-center overflow-x-auto rounded-md bg-gray-100 p-0.5" role="group" :aria-label="label">
    <button
      v-for="op in opciones"
      :key="String(op.valor)"
      type="button"
      class="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      :class="modelValue === op.valor ? 'bg-white text-gray-900 shadow-xs ring-1 ring-gray-900/5' : 'text-gray-500 hover:text-gray-900'"
      :aria-pressed="modelValue === op.valor"
      @click="$emit('update:modelValue', op.valor)"
    >
      <i v-if="op.icono" :class="op.icono" aria-hidden="true"></i>
      {{ op.label }}
      <span
        v-if="op.conteo != null"
        class="rounded px-1 text-xs leading-4 tabular-nums"
        :class="modelValue === op.valor ? 'bg-gray-100 text-gray-700' : 'text-gray-500'"
      >{{ op.conteo }}</span>
    </button>
  </div>
</template>
