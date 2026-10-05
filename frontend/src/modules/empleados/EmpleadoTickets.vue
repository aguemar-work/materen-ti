<script setup>
// "Tickets": los últimos tickets del empleado (módulo `tickets`,
// lectura limitada a 20). El código abre el ticket; el listado completo vive en
// Tickets (las solicitudes de servicio tienen su propia sección). Es un resumen:
// nunca se imprime con el expediente.
import { computed } from 'vue';
import { formatFechaLibro } from '../../core/formatters.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';

const props = defineProps({
  tickets: { type: Array, default: () => [] },
});

const filas = computed(() => props.tickets.map((t) => ({ ...t, fechaTexto: formatFechaLibro(t.created_at).fecha })));
</script>

<template>
  <AppSeccion data-no-print titulo="Tickets" :conteo="tickets.length" sin-padding>
    <div class="overflow-x-auto">
      <table class="w-full table-fixed border-collapse text-sm" aria-label="Tickets del empleado">
        <colgroup>
          <col class="w-[104px]">
          <col>
          <col class="w-[110px] sm:w-[130px]">
          <col class="hidden w-[84px] sm:table-column">
        </colgroup>
        <thead>
          <tr class="h-8 border-b border-gray-200">
            <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Código</th>
            <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Asunto</th>
            <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
            <th scope="col" class="hidden px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filas.length" class="h-10 border-b border-gray-100">
            <td colspan="4" class="px-3 py-2 text-gray-500">— Sin tickets registrados.</td>
          </tr>
          <tr v-for="t in filas" :key="t.id" class="border-b border-gray-100 align-top">
            <td class="px-3 py-2">
              <RouterLink
                :to="`/tickets/${t.id}`"
                class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              ><AppCodigo :valor="t.codigo" titulo="Número de ticket" /></RouterLink>
            </td>
            <td class="px-3 py-2 text-gray-900 [overflow-wrap:anywhere]">
              {{ t.titulo }}
              <span class="mt-0.5 block text-xs tabular-nums text-gray-500 sm:hidden">{{ t.fechaTexto }}</span>
            </td>
            <td class="px-3 py-2"><BadgeEstado tipo="ticket" :valor="t.estado" /></td>
            <td class="hidden px-3 py-2 text-xs tabular-nums text-gray-500 sm:table-cell">{{ t.fechaTexto }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </AppSeccion>
</template>
