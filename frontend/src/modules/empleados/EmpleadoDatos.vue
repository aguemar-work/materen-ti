<script setup>
// Datos del empleado que no caben en la carátula: ubicación, teléfono, el
// último control de accesos y las notas. Columna lateral del expediente; no se
// imprime (la carátula lleva lo que va al papel).
import { computed } from 'vue';
import { formatFechaLibro, formatTelefono } from '../../core/formatters.js';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';

const props = defineProps({
  empleado: { type: Object, required: true },
  // Última fila de v_empleado_ultima_revision_acceso, o null si nunca se revisó.
  revision: { type: Object, default: null },
  // Nombre del staff que revisó (si se conoce).
  revisor: { type: String, default: '' },
});

const datos = computed(() => {
  const e = props.empleado;
  const r = props.revision;
  const control = r ? `${formatFechaLibro(r.revisado_at).fecha}${props.revisor ? ` · ${props.revisor}` : ''}` : '';
  return [
    { label: 'Ubicación', valor: e.ubicacion_nombre },
    { label: 'Teléfono', valor: e.telefono ? formatTelefono(e.telefono) : '', mono: true },
    { label: 'Último control de accesos', valor: control, mono: true },
  ];
});
</script>

<template>
  <AppSeccion data-no-print titulo="Datos">
    <AppListaDatos :datos="datos" />
    <p v-if="empleado.notas" class="mt-4 whitespace-pre-line border-t border-gray-100 pt-3 text-sm text-gray-700">{{ empleado.notas }}</p>
  </AppSeccion>
</template>
