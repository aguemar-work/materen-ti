<script setup>
// Cifras del tablero de un reporte (migración 118): la fila de números que
// gerencia lee primero. Una cifra grande solo existe en un reporte (regla 16);
// sin tarjetas, íconos ni color: rótulo de expediente, número y una línea que
// dice de dónde sale. Las cifras llegan calculadas por el servidor (hoja.js
// solo les da formato).
//
//   cifras: [{ rotulo, valor, unidad?, detalle? }]
defineProps({
  cifras: { type: Array, required: true },
});
</script>

<template>
  <dl class="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-gray-200 py-4 sm:grid-cols-3 lg:grid-cols-6">
    <div v-for="c in cifras" :key="c.rotulo" class="min-w-0 break-inside-avoid">
      <dt class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ c.rotulo }}</dt>
      <dd class="mt-1 text-3xl font-semibold leading-none text-gray-900 tabular-nums">
        {{ c.valor }}<span v-if="c.unidad" class="ml-0.5 text-base font-medium text-gray-500">{{ c.unidad }}</span>
      </dd>
      <dd v-if="c.detalle" class="mt-1.5 text-xs text-gray-500">{{ c.detalle }}</dd>
    </div>
  </dl>
</template>
