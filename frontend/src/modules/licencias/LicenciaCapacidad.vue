<script setup>
// Asientos usados/totales de una licencia y su barra de capacidad (verde,
// ámbar desde 70 %, rojo al tope). Compartido por la tabla y las tarjetas.
import { computed } from 'vue';
import { capacidadInfo } from './useLicenciaCupos.js';

const props = defineProps({
  licencia: { type: Object, required: true },
});

const info = computed(() => capacidadInfo(props.licencia));
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between gap-2 text-xs tabular-nums">
      <span class="whitespace-nowrap text-gray-700">{{ licencia.usados }}/{{ licencia.cantidad }} asientos</span>
      <span v-if="info.libres === 0" class="font-medium text-red-700">Sin cupo</span>
      <span v-else class="whitespace-nowrap text-gray-500">{{ info.libres }} {{ info.libres === 1 ? 'libre' : 'libres' }}</span>
    </div>
    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
      <div class="h-full rounded-full" :class="info.clase" :style="{ width: info.pct + '%' }"></div>
    </div>
  </div>
</template>
