<script setup>
// «Solicitudes» del expediente (migración 108): los trámites de esta persona —
// su alta, un cambio de puesto, un acceso o equipo pedido, su baja — con el
// avance de cada uno. El código abre la solicitud. Es un resumen (las últimas
// 20): la cola completa vive en Solicitudes. Nunca se imprime con el expediente.
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { formatFecha } from '../../core/formatters.js';
import { avanceSolicitud, textoAvance } from '../../core/dominio-solicitudes.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';

const props = defineProps({
  solicitudes: { type: Array, default: () => [] },
  // Abrir una solicitud nueva para esta persona (solo si está Activa).
  puedeCrear: { type: Boolean, default: false },
});
defineEmits(['nueva']);

const filas = computed(() => props.solicitudes.map((s) => ({
  ...s,
  avanceTexto: textoAvance(avanceSolicitud(s.pasos)),
  fechaTexto: formatFecha(s.created_at),
})));
</script>

<template>
  <AppSeccion data-no-print titulo="Solicitudes" :conteo="solicitudes.length" sin-padding>
    <template v-if="puedeCrear" #acciones>
      <AppButton size="sm" variant="text" icon="ti ti-plus" label="Nueva solicitud" @click="$emit('nueva')" />
    </template>

    <div class="overflow-x-auto">
      <table class="w-full table-fixed border-collapse text-sm" aria-label="Solicitudes del empleado">
        <colgroup>
          <col class="w-[104px]">
          <col>
          <col class="hidden w-[130px] sm:table-column">
          <col class="w-[110px] sm:w-[130px]">
          <col class="hidden w-[84px] sm:table-column">
        </colgroup>
        <thead>
          <tr class="h-8 border-b border-gray-200">
            <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Código</th>
            <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Solicitud</th>
            <th scope="col" class="hidden px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Avance</th>
            <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
            <th scope="col" class="hidden px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Abierta</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filas.length" class="h-10 border-b border-gray-100">
            <td colspan="5" class="px-3 py-2 text-gray-500">— Sin solicitudes registradas.</td>
          </tr>
          <tr v-for="s in filas" :key="s.id" class="border-b border-gray-100 align-top" data-solicitud>
            <td class="px-3 py-2">
              <RouterLink
                :to="`/solicitudes/${s.id}`"
                class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              ><AppCodigo :valor="s.codigo" titulo="Número de solicitud" /></RouterLink>
            </td>
            <td class="px-3 py-2 text-gray-900 [overflow-wrap:anywhere]">
              {{ s.tipo_nombre }}
              <span class="mt-0.5 block text-xs tabular-nums text-gray-500 sm:hidden">{{ s.avanceTexto }} · {{ s.fechaTexto }}</span>
            </td>
            <td class="hidden px-3 py-2 text-xs tabular-nums text-gray-600 sm:table-cell">{{ s.avanceTexto }}</td>
            <td class="px-3 py-2"><BadgeEstado tipo="solicitud" :valor="s.estado" /></td>
            <td class="hidden px-3 py-2 text-xs tabular-nums text-gray-500 sm:table-cell">{{ s.fechaTexto }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </AppSeccion>
</template>
