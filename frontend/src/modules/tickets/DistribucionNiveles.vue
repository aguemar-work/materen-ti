<script setup>
// Distribución de respuestas 1–5 como una barra apilada angosta (rediseño
// 2026-09-23, Satisfacción de tickets). Cinco números sueltos por fila no
// se comparan de un vistazo; la barra sí ("¿este técnico tiene rojo?"). El
// detalle exacto va en el `title` y en texto para lectores de pantalla.
// Colores de estado de la paleta estándar: 1-2 rojo, 3 ámbar (cuenta como
// insatisfecho, ver esBaja en ReporteSatisfaccionView), 4-5 verde.
import { computed } from 'vue';

const props = defineProps({
  // { 1: n, 2: n, 3: n, 4: n, 5: n }
  conteos: { type: Object, required: true },
});

const COLOR = { 1: 'bg-red-500', 2: 'bg-red-300', 3: 'bg-amber-400', 4: 'bg-green-300', 5: 'bg-green-500' };

const total = computed(() => [1, 2, 3, 4, 5].reduce((acc, n) => acc + (props.conteos[n] || 0), 0));
const detalle = computed(() => [1, 2, 3, 4, 5].map((n) => `nivel ${n}: ${props.conteos[n] || 0}`).join(', '));
</script>

<template>
  <div class="flex items-center gap-2" :title="detalle">
    <span class="flex h-2 w-24 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
      <template v-for="n in 5" :key="n">
        <span v-if="conteos[n]" :class="COLOR[n]" :style="{ width: `${(conteos[n] / total) * 100}%` }"></span>
      </template>
    </span>
    <span class="text-xs tabular-nums text-gray-500" aria-hidden="true">{{ total }}</span>
    <span class="sr-only">Respuestas por {{ detalle }}</span>
  </div>
</template>
