<script setup>
// Vistas de un listado (V2, 2026-09-25): las 3–6 preguntas que la gente le
// hace a esa lista todos los días ("¿quiénes están activos?", "¿qué equipos
// tengo libres?"), cada una a un clic y con su conteo a la vista. Van arriba
// de la barra de filtros, a lo ancho de la hoja, y reemplazan al segmentado
// de estado y a los KPI-que-filtran: una sola forma de cambiar de vista.
//
// Semántica: grupo de botones con `aria-pressed` (igual que AppSegmentado),
// no `role="tablist"` — lo de abajo es la MISMA lista filtrada, no paneles
// distintos. El indicador de la vista activa es una marca horizontal de 2px
// debajo del texto (no un borde, y nunca lateral).
//
// opciones: [{ valor, label, conteo?, icono?, titulo? }] — `titulo` explica
// la vista al pasar el mouse ("Operativos sin asignación activa").
defineProps({
  modelValue: { type: [String, Number, null], default: null },
  opciones: { type: Array, required: true },
  label: { type: String, required: true },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="flex items-center gap-6 overflow-x-auto border-b border-gray-200 px-4 sm:px-6" role="group" :aria-label="label">
    <button
      v-for="op in opciones"
      :key="String(op.valor)"
      type="button"
      class="relative inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      :class="modelValue === op.valor ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'"
      :aria-pressed="modelValue === op.valor"
      :title="op.titulo || undefined"
      @click="$emit('update:modelValue', op.valor)"
    >
      <i v-if="op.icono" :class="op.icono" aria-hidden="true"></i>
      {{ op.label }}
      <span
        v-if="op.conteo != null"
        class="rounded-full px-1.5 text-xs leading-5 tabular-nums"
        :class="modelValue === op.valor ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600'"
      >{{ op.conteo }}</span>
      <span v-if="modelValue === op.valor" class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary-500" aria-hidden="true"></span>
    </button>
  </div>
</template>
