<script setup>
// Vistas de un listado (V2, 2026-09-25): las 3–6 preguntas que la gente le
// hace a esa lista todos los días ("¿quiénes están activos?", "¿qué equipos
// tengo libres?"), cada una a un clic y con su conteo a la vista. Reemplazan
// al segmentado de estado y a los KPI-que-filtran: una sola forma de cambiar
// de vista.
//
// Dos formas:
//   - Pestañas (por defecto): a lo ancho de la hoja, con una marca horizontal
//     de 2px debajo de la activa (nunca lateral). Hoy solo Inicio.
//   - `en-barra` (2026-10-21, pedido del dueño): un segmentado de 32px que va
//     DENTRO de AppBarraFiltros, en la misma línea, a la derecha del buscador
//     y de Filtros (`class="ml-auto"`). La activa es una pastilla blanca
//     ("pedazo de hoja", principio 7), igual que AppSegmentado. Es la forma
//     de todos los listados; si no entra, se desliza.
//
// Semántica: grupo de botones con `aria-pressed` (igual que AppSegmentado),
// no `role="tablist"` — lo de abajo es la MISMA lista filtrada, no paneles
// distintos.
//
// opciones: [{ valor, label, conteo?, icono?, titulo? }] — `titulo` explica
// la vista al pasar el mouse ("Operativos sin asignación activa").
defineProps({
  modelValue: { type: [String, Number, null], default: null },
  opciones: { type: Array, required: true },
  label: { type: String, required: true },
  enBarra: { type: Boolean, default: false },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <!-- En la barra: segmentado compacto; en móvil ocupa su fila y se desliza. -->
  <div
    v-if="enBarra"
    class="inline-flex h-8 min-w-0 items-center gap-0.5 overflow-x-auto rounded-md bg-gray-100 p-0.5 [scrollbar-width:none] max-sm:w-full"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="op in opciones"
      :key="String(op.valor)"
      type="button"
      class="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      :class="modelValue === op.valor ? 'bg-white text-gray-900 shadow-xs ring-1 ring-gray-900/5' : 'text-gray-600 hover:text-gray-900'"
      :aria-pressed="modelValue === op.valor"
      :title="op.titulo || undefined"
      @click="$emit('update:modelValue', op.valor)"
    >
      <i v-if="op.icono" :class="op.icono" aria-hidden="true"></i>
      {{ op.label }}
      <span v-if="op.conteo != null" class="text-xs tabular-nums" :class="modelValue === op.valor ? 'text-gray-600' : 'text-gray-500'">{{ op.conteo }}</span>
    </button>
  </div>

  <div v-else class="flex items-center gap-6 overflow-x-auto border-b border-gray-200 px-4 sm:px-6" role="group" :aria-label="label">
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
