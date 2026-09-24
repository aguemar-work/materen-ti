<script setup>
// Prioridad de un ticket con peso visual proporcional al significado
// (docs/SISTEMA-DISENO.md §1.6), sobre el sistema nuevo (rediseño
// 2026-09-23). El color sale del dominio (prioridadInfo → core/dominio-
// tickets.js), no de un mapa propio:
//   baja / media    → punto + texto, sin fondo (informativo)
//   alta / urgente  → AppTag con fondo tenue (accionable)
// Reemplaza a components/shared/IndicadorPrioridad.vue dentro del módulo
// Tickets — ese componente sigue pintando con las clases provisionales
// `.badge`/`.prio`. Candidato a components/ui/ si otro módulo lo necesita.
import { computed } from 'vue';
import { prioridadInfo } from '../../core/dominio-tickets.js';
import { rolDeTag } from '../../core/tagRol.js';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  valor: { type: String, default: '' },
});

const info = computed(() => prioridadInfo(props.valor));
const tono = computed(() => rolDeTag(info.value.clase));
const conFondo = computed(() => props.valor === 'alta' || props.valor === 'urgente');

const TEXTO_PUNTO = {
  neutral: 'text-gray-600',
  teal: 'text-teal-700',
  sky: 'text-sky-700',
  purple: 'text-violet-700',
  danger: 'text-red-700',
};
</script>

<template>
  <span v-if="!valor" class="text-xs text-gray-500">Sin prioridad</span>
  <AppTag v-else-if="conFondo" :tono="tono" :icono="valor === 'urgente' ? 'ti ti-alert-triangle' : ''">{{ info.label }}</AppTag>
  <span
    v-else
    class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium"
    :class="TEXTO_PUNTO[tono] || 'text-gray-600'"
  >
    <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
    {{ info.label }}
  </span>
</template>
