<script setup>
// "Libro de movimientos" del expediente: el único render de historial
// (AppLibro, regla 19) alimentado con eventos REALES (empleado_eventos, hoja de
// vida de cada equipo, entregas, asignaciones de cuenta y licencia, actas,
// tickets) mezclados y ordenados en el cliente (libroEmpleado.js). Filtros:
// Todo · Accesos · Equipos · Licencias. Sin movimientos: una fila del libro en
// gris (regla 21).
import { ref, computed } from 'vue';
import { FILTROS_LIBRO, filtrarLibro } from './libroEmpleado.js';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppLibro from '../../components/ui/AppLibro.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';

const props = defineProps({
  filas: { type: Array, default: () => [] },
  cargando: { type: Boolean, default: false },
});

const filtro = ref('');
const visibles = computed(() => filtrarLibro(props.filas, filtro.value));
</script>

<template>
  <AppSeccion titulo="Libro de movimientos" :conteo="visibles.length" sin-padding>
    <template #acciones>
      <AppSegmentado v-model="filtro" label="Filtrar el libro de movimientos" :opciones="FILTROS_LIBRO" data-no-print />
    </template>
    <p v-if="cargando && !filas.length" class="px-4 py-3 text-sm text-gray-500" role="status">— Cargando movimientos...</p>
    <div v-else class="overflow-x-auto">
      <AppLibro :filas="visibles" etiqueta="Libro de movimientos del empleado" vacio="Sin movimientos registrados" />
    </div>
  </AppSeccion>
</template>
