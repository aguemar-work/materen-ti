<script setup>
// Barras horizontales de porcentaje (migración 118): el % de satisfacción de
// cada técnico. A escala de 0 a 100; sin muestra suficiente no hay barra sino
// el texto que lo dice (nunca un 0 % que no existe).
//
//   filas: [{ etiqueta, pct (null = sin dato), nota? }]
defineProps({
  titulo: { type: String, default: '' },
  filas: { type: Array, required: true },
});
</script>

<template>
  <div class="break-inside-avoid">
    <h3 v-if="titulo" class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ titulo }}</h3>
    <ul class="max-w-2xl space-y-2">
      <li v-for="f in filas" :key="f.etiqueta" class="grid grid-cols-[minmax(7rem,12rem)_1fr_7rem] items-center gap-3 text-sm">
        <span class="truncate text-gray-900" :title="f.etiqueta">{{ f.etiqueta }}</span>
        <span class="h-2.5 bg-gray-100" aria-hidden="true">
          <span v-if="f.pct != null" class="block h-full bg-gray-700" :style="{ width: `${f.pct}%` }"></span>
        </span>
        <span class="text-right tabular-nums" :class="f.pct == null ? 'text-xs text-gray-500' : 'text-gray-900'">{{ f.pct == null ? (f.nota || '—') : `${f.pct} %` }}</span>
      </li>
    </ul>
  </div>
</template>
