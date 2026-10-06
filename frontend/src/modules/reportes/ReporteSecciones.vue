<script setup>
// Secciones numeradas de una hoja de reporte: título h2, nota en una línea y
// sus tablas (ReporteTabla). Recibe las secciones YA en la forma de la hoja
// (hoja.js para Tickets, hoja-satisfaccion.js para Satisfacción y
// celdas.js#seccionesParaHoja para los reportes de la 117): acá no se calcula
// nada. Desde la 118 una sección puede abrir con las cifras del tablero
// (`cifras`), el gráfico por día (`dias`), el reparto de respuestas
// (`distribucion`) o barras de % (`barras`), siempre antes de sus tablas.
import ReporteTabla from './ReporteTabla.vue';
import ReporteCifras from './ReporteCifras.vue';
import ReporteBarrasDia from './ReporteBarrasDia.vue';
import ReporteBarrasPct from './ReporteBarrasPct.vue';
import ReporteDistribucion from './ReporteDistribucion.vue';

defineProps({
  secciones: { type: Array, default: () => [] },
  vacio: { type: String, default: 'Sin datos en el período' },
});
</script>

<template>
  <section v-for="s in secciones" :id="`reporte-${s.id}`" :key="s.id" class="space-y-4" :aria-labelledby="`reporte-${s.id}-titulo`">
    <div>
      <h2 :id="`reporte-${s.id}-titulo`" class="text-base font-semibold text-gray-900">{{ s.titulo }}</h2>
      <p v-if="s.nota" class="mt-1 max-w-prose text-xs text-gray-500">{{ s.nota }}</p>
    </div>
    <ReporteCifras v-if="s.cifras?.length" :cifras="s.cifras" />
    <ReporteBarrasDia v-if="s.dias?.length" :dias="s.dias" />
    <ReporteDistribucion v-if="s.distribucion" :titulo="s.distribucion.titulo" :segmentos="s.distribucion.segmentos" />
    <ReporteBarrasPct v-if="s.barras" :titulo="s.barras.titulo" :filas="s.barras.filas" />
    <ReporteTabla
      v-for="(t, i) in s.tablas || []"
      :key="i"
      :titulo="t.titulo"
      :nota="t.nota"
      :columnas="t.columnas"
      :filas="t.filas"
      :vacio="t.vacio || vacio"
    />
  </section>
</template>
