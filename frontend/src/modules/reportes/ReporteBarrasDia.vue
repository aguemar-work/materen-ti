<script setup>
// Gráfico de barras por día del reporte de Tickets (migración 118): ingresaron
// y resueltos de cada día, a escala (eje desde 0, marcas en 0, la mitad y el
// máximo). Grises, no azul: el azul es tinta (regla 17) y el papel puede ser
// en blanco y negro. Las cifras exactas van en la tabla que lo acompaña.
//
//   dias: [{ etiqueta, ingresaron, resueltos }]
import { computed } from 'vue';

const props = defineProps({
  dias: { type: Array, required: true },
  titulo: { type: String, default: 'Ingresaron y resueltos por día' },
});

const ANCHO = 640;
const ALTO = 190;
const IZQ = 30;
const DER = 8;
const ARRIBA = 16;
const ABAJO = 26;

// Máximo "redondo" (múltiplo de 2 hasta 10, de 5 hasta 50, de 10 después): las marcas quedan enteras.
const maximo = computed(() => {
  const m = Math.max(1, ...props.dias.flatMap((d) => [d.ingresaron || 0, d.resueltos || 0]));
  const paso = m <= 10 ? 2 : m <= 50 ? 5 : 10;
  return Math.ceil(m / paso) * paso;
});
const y = (v) => ARRIBA + (ALTO - ARRIBA - ABAJO) * (1 - (v || 0) / maximo.value);
const marcas = computed(() => [0, maximo.value / 2, maximo.value]);
const grupo = computed(() => (ANCHO - IZQ - DER) / Math.max(1, props.dias.length));
const barra = computed(() => Math.max(3, Math.min(18, grupo.value * 0.32)));
const centro = (i) => IZQ + grupo.value * i + grupo.value / 2;
const conValores = computed(() => props.dias.length <= 14);
const resumen = computed(() => props.dias.map((d) => `${d.etiqueta}: ${d.ingresaron} ingresaron, ${d.resueltos} resueltos`).join('; '));
</script>

<template>
  <figure class="break-inside-avoid">
    <figcaption class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ titulo }}</figcaption>
    <svg :viewBox="`0 0 ${ANCHO} ${ALTO}`" class="h-auto w-full max-w-3xl" role="img" :aria-label="resumen">
      <g v-for="m in marcas" :key="m">
        <line :x1="IZQ" :x2="ANCHO - DER" :y1="y(m)" :y2="y(m)" class="stroke-gray-200" stroke-width="1" />
        <text :x="IZQ - 6" :y="y(m) + 4" text-anchor="end" class="fill-gray-500 text-[11px] tabular-nums">{{ m }}</text>
      </g>
      <g v-for="(d, i) in dias" :key="d.etiqueta">
        <rect :x="centro(i) - barra - 1" :y="y(d.ingresaron)" :width="barra" :height="y(0) - y(d.ingresaron)" class="fill-gray-300" />
        <rect :x="centro(i) + 1" :y="y(d.resueltos)" :width="barra" :height="y(0) - y(d.resueltos)" class="fill-gray-700" />
        <template v-if="conValores">
          <text v-if="d.ingresaron" :x="centro(i) - barra / 2 - 1" :y="y(d.ingresaron) - 3" text-anchor="middle" class="fill-gray-500 text-[10px] tabular-nums">{{ d.ingresaron }}</text>
          <text v-if="d.resueltos" :x="centro(i) + barra / 2 + 1" :y="y(d.resueltos) - 3" text-anchor="middle" class="fill-gray-900 text-[10px] tabular-nums">{{ d.resueltos }}</text>
        </template>
        <text :x="centro(i)" :y="ALTO - 8" text-anchor="middle" class="fill-gray-500 text-[11px]">{{ d.etiqueta }}</text>
      </g>
    </svg>
    <div class="mt-1 flex gap-4 text-xs text-gray-700" aria-hidden="true">
      <span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 bg-gray-300"></span>Ingresaron</span>
      <span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 bg-gray-700"></span>Resueltos</span>
    </div>
  </figure>
</template>
