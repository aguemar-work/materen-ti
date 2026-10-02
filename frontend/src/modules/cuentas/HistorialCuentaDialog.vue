<script setup>
// Historial de titulares de una cuenta: el libro de movimientos (AppLibro,
// regla 19) con una fila por cada vez que se asignó y se cerró. Reemplaza a la
// línea de tiempo con puntos de color y riel vertical que tenía CuentasPanel.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppLibro from '../../components/ui/AppLibro.vue';

const props = defineProps({
  cuenta: { type: Object, required: true },
});
const emit = defineEmits(['cerrado']);

const dialogo = ref(null);
const items = ref([]);
const cargando = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    items.value = await insforgeApi.historialCuenta(props.cuenta.cuenta_id);
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar el historial.' }).mensaje;
  } finally {
    cargando.value = false;
  }
});

// Cada asignación aporta su apertura y, si ya cerró, su cierre. Más reciente
// arriba; a igual fecha la apertura va sobre el cierre: en un traspaso el titular
// nuevo empieza el mismo día que el anterior termina, y lo último que pasó es
// la apertura.
const filas = computed(() => {
  const salida = [];
  for (const h of items.value) {
    const enlace = h.empleado_id ? { texto: 'Expediente', to: `/empleados/${h.empleado_id}` } : null;
    salida.push({
      id: `${h.id}-inicio`,
      fecha: h.fecha_inicio,
      movimiento: 'Asignada',
      detalle: h.empleado_nombre,
      por: null,
      ref: enlace,
      orden: 1,
    });
    if (h.fecha_fin) {
      salida.push({
        id: `${h.id}-fin`,
        fecha: h.fecha_fin,
        movimiento: /traspaso/i.test(h.notas) ? 'Traspasada' : 'Cerrada',
        detalle: [h.empleado_nombre, h.notas].filter(Boolean).join(' · '),
        por: null,
        ref: enlace,
        orden: 2,
      });
    }
  }
  return salida.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.orden - b.orden));
});
</script>

<template>
  <AppDialog ref="dialogo" size="detail" @cerrado="emit('cerrado')">
    <template #titulo>Historial de {{ cuenta.plataforma_nombre }}</template>

    <div class="space-y-3">
      <p class="text-sm text-gray-600">{{ cuenta.usuario }}</p>
      <p v-if="cargando" class="py-6 text-center text-sm text-gray-500" role="status">Cargando historial...</p>
      <p v-else-if="error" class="py-6 text-center text-sm text-red-700" role="alert">{{ error }}</p>
      <AppLibro
        v-else
        :filas="filas"
        etiqueta="Historial de titulares de la cuenta"
        vacio="Sin titulares registrados"
      />
    </div>
  </AppDialog>
</template>
