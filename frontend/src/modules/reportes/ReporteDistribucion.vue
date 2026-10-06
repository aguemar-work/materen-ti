<script setup>
// Reparto de las respuestas de satisfacción (migración 118): satisfechos (4 o
// 5), regulares (3) e insatisfechos (1 o 2) en una sola barra a escala, con la
// cantidad y el % escritos (el color nunca es el único portador del dato).
//
//   segmentos: [{ etiqueta, cantidad, tono: 'ok' | 'neutro' | 'critico' }]
import { computed } from 'vue';

const props = defineProps({
  titulo: { type: String, default: '' },
  segmentos: { type: Array, required: true },
});

const FONDO = { ok: 'bg-green-600', neutro: 'bg-gray-300', critico: 'bg-red-600' };
const total = computed(() => props.segmentos.reduce((a, s) => a + (s.cantidad || 0), 0));
const pct = (n) => (total.value ? Math.round((100 * n) / total.value) : 0);
</script>

<template>
  <div class="break-inside-avoid">
    <h3 v-if="titulo" class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ titulo }}</h3>
    <div v-if="total" class="flex h-3 max-w-2xl overflow-hidden rounded-sm bg-gray-100" aria-hidden="true">
      <span v-for="s in segmentos" :key="s.etiqueta" :class="FONDO[s.tono]" :style="{ flexGrow: s.cantidad || 0 }"></span>
    </div>
    <ul class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-700">
      <li v-for="s in segmentos" :key="s.etiqueta" class="inline-flex items-center gap-1.5 tabular-nums">
        <span class="inline-block h-2.5 w-2.5" :class="FONDO[s.tono]" aria-hidden="true"></span>
        {{ s.etiqueta }}: {{ s.cantidad }}<template v-if="total"> ({{ pct(s.cantidad) }} %)</template>
      </li>
    </ul>
  </div>
</template>
