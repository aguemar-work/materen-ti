<script setup>
// Ruta de un reporte centralizado (/reportes/<id>, migración 117). Todas las
// rutas usan este mismo componente; la hoja va con `key` para que pasar de un
// reporte a otro la monte de nuevo (sus filtros de URL son de su ruta).
import ReporteGenerico from './ReporteGenerico.vue';

defineProps({ reporteId: { type: String, required: true } });
</script>

<template>
  <ReporteGenerico :key="reporteId" :reporte-id="reporteId" />
</template>
