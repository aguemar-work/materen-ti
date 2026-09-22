<script setup>
// Indicador (KPI): etiqueta, cifra y un detalle opcional. Si trae `to`, es
// un enlace al listado filtrado que explica la cifra (el número invita a
// actuar). `tono` colorea SOLO el ícono y el detalle — nunca el fondo de la
// tarjeta (peso visual proporcional al significado).
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps({
  label: { type: String, required: true },
  valor: { type: [Number, String], required: true },
  detalle: { type: String, default: '' },
  icono: { type: String, default: '' },
  tono: { type: String, default: 'neutral', validator: (v) => ['neutral', 'primary', 'success', 'warning', 'danger'].includes(v) },
  to: { type: [String, Object], default: null },
});

const TONO_ICONO = {
  neutral: 'bg-gray-100 text-gray-500',
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-green-50 text-green-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
};
const TONO_DETALLE = {
  neutral: 'text-gray-500',
  primary: 'text-primary-700',
  success: 'text-green-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
};

const clasesRaiz = computed(() => [
  'flex min-w-0 items-start gap-3 rounded-lg border border-gray-200 bg-white p-4',
  props.to ? 'transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500' : '',
]);
</script>

<template>
  <component :is="to ? RouterLink : 'div'" :to="to || undefined" :class="clasesRaiz">
    <span v-if="icono" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg" :class="TONO_ICONO[tono]">
      <i :class="icono" aria-hidden="true"></i>
    </span>
    <div class="min-w-0">
      <div class="text-xs font-medium text-gray-500">{{ label }}</div>
      <div class="mt-0.5 text-2xl font-semibold leading-tight tracking-tight text-gray-900 tabular-nums">{{ valor }}</div>
      <div v-if="detalle" class="mt-0.5 truncate text-xs" :class="TONO_DETALLE[tono]">{{ detalle }}</div>
    </div>
  </component>
</template>
