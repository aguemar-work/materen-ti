<script setup>
// Severidad de un problema con peso visual proporcional al significado
// (docs/SISTEMA-DISENO.md §1.6), sobre el sistema nuevo (rediseño
// 2026-09-23). El color sale del dominio (severidadProblemaInfo →
// core/dominio-problemas.js), no de un mapa propio:
//   baja / media   → punto + texto, sin fondo (informativo)
//   alta / crítica → AppTag con fondo tenue (pide atención)
// Mismo criterio que PrioridadTicket.vue en Tickets. Candidato a
// components/ui/ junto con ese (un "IndicadorNivel" genérico que reciba el
// info del dominio).
import { computed } from 'vue';
import { severidadProblemaInfo } from '../../core/dominio-problemas.js';
import { rolDeTag } from '../../core/tagRol.js';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  valor: { type: String, default: '' },
});

const info = computed(() => severidadProblemaInfo(props.valor));
const tono = computed(() => rolDeTag(info.value.clase));
const conFondo = computed(() => props.valor === 'alta' || props.valor === 'critica');

const TEXTO_PUNTO = {
  neutral: 'text-gray-600',
  teal: 'text-teal-700',
};
</script>

<template>
  <span v-if="!valor" class="text-xs text-gray-400">Sin severidad</span>
  <AppTag v-else-if="conFondo" :tono="tono" :icono="valor === 'critica' ? 'ti ti-alert-triangle' : ''">{{ info.label }}</AppTag>
  <span
    v-else
    class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium"
    :class="TEXTO_PUNTO[tono] || 'text-gray-600'"
  >
    <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
    {{ info.label }}
  </span>
</template>
