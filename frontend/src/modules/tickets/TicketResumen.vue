<script setup>
// Franja de datos del encabezado de un ticket (V2, pedido del dueño
// 2026-09-25): de quién es, quién lo atiende, cuándo llegó y, si ya
// terminó, cuándo y quién lo resolvió y cuánto tardó. Compartida por la
// página completa (TicketDetalleView) y el panel de Triage
// (TicketDetallePanel) — misma información, mismo orden.
//
//   [Alta] [N2] Incidente · Solicitante X · Responsable Y · Recibido hace 3 d
//   · Resuelto hace 1 d por Z · tardó 2 d
//
// Fechas relativas con la fecha exacta en el `title` (el dato para
// decidir es "hace cuánto"; la fecha exacta se consulta).
import { computed } from 'vue';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { OPCIONES_TIPO } from '../../core/dominio-tickets.js';
import AppTag from '../../components/ui/AppTag.vue';
import PrioridadTicket from './PrioridadTicket.vue';

const props = defineProps({
  ticket: { type: Object, required: true },
  // Nombre del técnico asignado ('' = sin asignar).
  responsable: { type: String, default: '' },
  // { tipo: 'resuelto' | 'rechazado', fecha, por } o null (useTicketDetalleLogica).
  resolucion: { type: Object, default: null },
});

const tipoLabel = computed(() => OPCIONES_TIPO.find((t) => t.valor === props.ticket.tipo)?.label || '');
const solicitante = computed(() =>
  (props.ticket.vinculado && props.ticket.empleado_nombre) || props.ticket.contacto_ingresado || '');

// "tardó 2 d" / "tardó 5 h": de la llegada a la resolución.
const duracion = computed(() => {
  if (!props.resolucion?.fecha || !props.ticket.created_at) return '';
  const min = Math.max(0, Math.round((new Date(props.resolucion.fecha) - new Date(props.ticket.created_at)) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
});
</script>

<template>
  <dl class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
    <div class="flex items-center gap-1.5">
      <dt class="sr-only">Prioridad</dt>
      <dd><PrioridadTicket :valor="ticket.prioridad" /></dd>
      <template v-if="ticket.nivel_atencion">
        <dt class="sr-only">Nivel de atención</dt>
        <dd><AppTag tono="neutral" :title="`Nivel de atención ${ticket.nivel_atencion}`">{{ ticket.nivel_atencion }}</AppTag></dd>
      </template>
      <template v-if="tipoLabel">
        <dt class="sr-only">Tipo</dt>
        <dd class="text-gray-600">{{ tipoLabel }}</dd>
      </template>
    </div>

    <div class="flex min-w-0 items-center gap-1.5">
      <dt class="text-gray-500">Solicitante</dt>
      <dd v-if="solicitante" class="truncate font-medium text-gray-900">{{ solicitante }}</dd>
      <dd v-if="!ticket.vinculado" class="font-medium text-red-700">{{ solicitante ? '(sin vincular)' : 'Sin vincular' }}</dd>
    </div>

    <div class="flex min-w-0 items-center gap-1.5">
      <dt class="text-gray-500">Responsable</dt>
      <dd v-if="responsable" class="truncate font-medium text-gray-900">{{ responsable }}</dd>
      <dd v-else class="font-medium" :class="resolucion ? 'text-gray-500' : 'text-amber-700'">Sin asignar</dd>
    </div>

    <div v-if="ticket.created_at" class="flex items-center gap-1.5">
      <dt class="text-gray-500">Recibido</dt>
      <dd class="tabular-nums text-gray-900" :title="formatFechaHora(ticket.created_at)">{{ formatAntiguedad(ticket.created_at) }}</dd>
    </div>

    <div v-if="resolucion" class="flex min-w-0 items-center gap-1.5">
      <dt class="text-gray-500">{{ resolucion.tipo === 'rechazado' ? 'Rechazado' : 'Resuelto' }}</dt>
      <dd class="tabular-nums text-gray-900" :title="formatFechaHora(resolucion.fecha)">
        {{ formatAntiguedad(resolucion.fecha) }}<template v-if="resolucion.por"> por <span class="font-medium">{{ resolucion.por }}</span></template><template v-if="duracion && resolucion.tipo === 'resuelto'"> · <span class="text-gray-500">tardó {{ duracion }}</span></template>
      </dd>
    </div>
  </dl>
</template>
