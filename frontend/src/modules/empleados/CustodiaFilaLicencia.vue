<script setup>
// Fila de una licencia directa en "En custodia" (las licencias de login
// aparecen como cuentas). Solo se marca lo problemático: una licencia vigente
// no necesita señal; la vencida o por vencer lleva su tag (mismo umbral que
// LicenciasView, core/dominio-licencias.js).
import { computed } from 'vue';
import { estadoVencimientoLicencia, CLASE_VENCIMIENTO_LICENCIA } from '../../core/dominio-licencias.js';
import { formatFecha, formatFechaLibro } from '../../core/formatters.js';
import { rolDeTag } from '../../core/tagRol.js';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  licencia: { type: Object, required: true },
  acciones: { type: Array, required: true },
});

const vencimiento = computed(() => {
  const estado = estadoVencimientoLicencia(props.licencia);
  if (estado === 'vencida') return { clase: CLASE_VENCIMIENTO_LICENCIA.vencida, texto: 'Vencida' };
  if (estado === 'por_vencer') return { clase: CLASE_VENCIMIENTO_LICENCIA.por_vencer, texto: 'Por vencer' };
  return null;
});
const detalle = computed(() => {
  if (props.licencia.tipo === 'perpetua') return 'Perpetua';
  return props.licencia.fecha_vencimiento ? `Vence ${formatFecha(props.licencia.fecha_vencimiento)}` : 'Sin vencimiento';
});
const desde = computed(() => formatFechaLibro(props.licencia.fecha_inicio).fecha);
</script>

<template>
  <tr class="border-b border-gray-100 align-top" data-custodia="licencia">
    <td class="px-3 py-2 text-xs text-gray-500">Licencia</td>

    <td class="px-3 py-2">
      <span class="font-medium text-gray-900 [overflow-wrap:anywhere]">{{ licencia.software }}</span>
      <p class="mt-1 text-xs text-gray-500 sm:hidden">{{ detalle }} · desde {{ desde }}</p>
      <AppTag v-if="vencimiento" :tono="rolDeTag(vencimiento.clase)" class="mt-1 sm:hidden">{{ vencimiento.texto }}</AppTag>
    </td>

    <td class="hidden px-3 py-2 sm:table-cell">
      <div class="text-gray-900">{{ detalle }}</div>
      <div v-if="vencimiento" class="mt-1">
        <AppTag :tono="rolDeTag(vencimiento.clase)">{{ vencimiento.texto }}</AppTag>
      </div>
    </td>

    <td class="hidden px-3 py-2 text-xs tabular-nums text-gray-500 sm:table-cell">{{ desde }}</td>

    <td class="px-3 py-2 text-right" data-no-print>
      <MenuAcciones :acciones="acciones" :label="`Acciones de la licencia ${licencia.software}`" />
    </td>
  </tr>
</template>
