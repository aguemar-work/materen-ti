<script setup>
// Prioridad de un ticket: SIEMPRE un tag con fondo, igual que el de Estado
// (pedido del dueño, 2026-09-25 — antes baja/media eran punto + texto sin
// fondo y la columna se leía despareja junto a los tags de Estado). El peso
// proporcional al significado (SISTEMA-DISENO §1.6) lo dan el tono y el
// ícono de la máxima («Crítica», valor `urgente`), no la presencia del fondo. El color sale del dominio
// (prioridadInfo → core/dominio-tickets.js), no de un mapa propio.
import { computed } from 'vue';
import { prioridadInfo } from '../../core/dominio-tickets.js';
import { rolDeTag } from '../../core/tagRol.js';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  valor: { type: String, default: '' },
});

const info = computed(() => prioridadInfo(props.valor));
const tono = computed(() => rolDeTag(info.value.clase));
</script>

<template>
  <span v-if="!valor" class="text-xs text-gray-500">Sin prioridad</span>
  <AppTag v-else :tono="tono" :icono="valor === 'urgente' ? 'ti ti-alert-triangle' : ''">{{ info.label }}</AppTag>
</template>
