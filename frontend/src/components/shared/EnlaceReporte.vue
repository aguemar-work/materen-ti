<script setup>
// Enlace discreto «Ver reporte» que deja cada módulo donde antes tenía su
// propio botón de exportar o de reporte (encargo del dueño, 2026-10-05: todos
// los reportes viven en Reportes). Solo se muestra si el usuario puede ver ese
// reporte, con la misma regla que el índice y el router (core/reportes.js).
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { REPORTE_POR_ID, puedeVerReporte, rutaReporte } from '../../core/reportes.js';
import AppButton from '../ui/AppButton.vue';

const props = defineProps({
  reporte: { type: String, required: true },
  // Filtros de la hoja (p. ej. la ronda de una encuesta).
  query: { type: Object, default: null },
  size: { type: String, default: 'md' },
});

const auth = useAuthStore();
const def = computed(() => REPORTE_POR_ID[props.reporte]);
const visible = computed(() => puedeVerReporte(auth, def.value));
const destino = computed(() => (props.query ? { path: rutaReporte(props.reporte), query: props.query } : rutaReporte(props.reporte)));
</script>

<template>
  <AppButton
    v-if="visible"
    :to="destino"
    variant="text"
    severity="secondary"
    icon="ti ti-report"
    label="Ver reporte"
    :size="size"
    :title="`Abrir el reporte «${def.titulo}» en Reportes`"
  />
</template>
