<script setup>
// Franja de datos del encabezado de un ticket (V2, 2026-09-25). Compartida
// por la página completa (TicketDetalleView) y el panel de Triage
// (TicketDetallePanel).
//
// Solo lo que NO está en la columna de Gestión (prioridad, nivel, tipo y
// responsable viven ahí, editables — repetirlos arriba era ruido): de quién
// es, cuándo llegó, cuándo y quién lo resolvió, cuánto tardó y cómo lo
// calificó el solicitante. Con íconos, no con rótulos: cada dato lleva su
// nombre en `title` (al pasar el mouse) y en texto para lector de pantalla.
//
//   👤 Julio Vargas   🕒 hace 4 d   ✓ hace 3 d · Diego H.   ⏳ 1 d   ★ 4/5
import { computed } from 'vue';
import { formatFechaHora, formatAntiguedad, formatFecha } from '../../core/formatters.js';

const props = defineProps({
  ticket: { type: Object, required: true },
  // { tipo: 'resuelto' | 'rechazado', fecha, por } o null (useTicketDetalleLogica).
  resolucion: { type: Object, default: null },
  // Fila de ticket_satisfaccion ({ nivel, comentario, fecha_envio }) o null.
  satisfaccion: { type: Object, default: null },
});
defineEmits(['copiar-encuesta']);

const solicitante = computed(() =>
  (props.ticket.vinculado && props.ticket.empleado_nombre) || props.ticket.contacto_ingresado || '');

// "1 d" / "5 h": de la llegada a la resolución.
const duracion = computed(() => {
  if (props.resolucion?.tipo !== 'resuelto' || !props.ticket.created_at) return '';
  const min = Math.max(0, Math.round((new Date(props.resolucion.fecha) - new Date(props.ticket.created_at)) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
});

// Satisfacción: la calificación si ya respondió; si la encuesta salió y no
// hay respuesta, un aviso con el atajo para reenviarla por WhatsApp.
const respondida = computed(() => !!props.satisfaccion?.fecha_envio);
const tituloSatisfaccion = computed(() => {
  const s = props.satisfaccion;
  if (!s?.fecha_envio) return '';
  const base = `Satisfacción: ${s.nivel} de 5 · ${formatFecha(s.fecha_envio)}`;
  return s.comentario ? `${base} · “${s.comentario}”` : base;
});

const DATO = 'inline-flex min-w-0 items-center gap-1.5';
const ICONO = 'shrink-0 text-base text-gray-400';
</script>

<template>
  <ul class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-700" aria-label="Resumen del ticket">
    <li :class="DATO" title="Solicitante">
      <i class="ti ti-user" :class="ICONO" aria-hidden="true"></i>
      <span class="sr-only">Solicitante:</span>
      <span v-if="solicitante" class="truncate font-medium text-gray-900">{{ solicitante }}</span>
      <span v-if="!ticket.vinculado" class="font-medium text-red-700">{{ solicitante ? '(sin vincular)' : 'Sin vincular' }}</span>
    </li>

    <li v-if="ticket.created_at" :class="DATO" :title="`Recibido el ${formatFechaHora(ticket.created_at)}`">
      <i class="ti ti-inbox" :class="ICONO" aria-hidden="true"></i>
      <span class="sr-only">Recibido</span>
      <span class="tabular-nums">{{ formatAntiguedad(ticket.created_at) }}</span>
    </li>

    <li
      v-if="resolucion"
      :class="DATO"
      :title="`${resolucion.tipo === 'rechazado' ? 'Rechazado' : 'Resuelto'} el ${formatFechaHora(resolucion.fecha)}${resolucion.por ? ` por ${resolucion.por}` : ''}`"
    >
      <i
        :class="[ICONO, resolucion.tipo === 'rechazado' ? 'ti ti-circle-x text-red-500' : 'ti ti-circle-check text-green-600']"
        aria-hidden="true"
      ></i>
      <span class="sr-only">{{ resolucion.tipo === 'rechazado' ? 'Rechazado' : 'Resuelto' }}</span>
      <span class="tabular-nums">{{ formatAntiguedad(resolucion.fecha) }}</span>
      <template v-if="resolucion.por">
        <span class="text-gray-400" aria-hidden="true">·</span>
        <span class="sr-only">por</span>
        <span class="truncate font-medium text-gray-900">{{ resolucion.por }}</span>
      </template>
    </li>

    <li v-if="duracion" :class="DATO" title="Tiempo de resolución: de la llegada a la resolución">
      <i class="ti ti-hourglass" :class="ICONO" aria-hidden="true"></i>
      <span class="sr-only">Tiempo de resolución:</span>
      <span class="tabular-nums">{{ duracion }}</span>
    </li>

    <li v-if="respondida" :class="DATO" :title="tituloSatisfaccion">
      <i class="ti ti-star" :class="[ICONO, satisfaccion.nivel >= 4 ? 'text-amber-500' : satisfaccion.nivel <= 2 ? 'text-red-500' : 'text-gray-500']" aria-hidden="true"></i>
      <span class="sr-only">Satisfacción:</span>
      <span class="font-medium tabular-nums text-gray-900">{{ satisfaccion.nivel }}/5</span>
      <span v-if="satisfaccion.comentario" class="max-w-56 truncate text-gray-500">“{{ satisfaccion.comentario }}”</span>
    </li>
    <li v-else-if="satisfaccion" :class="DATO">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        title="Encuesta enviada, sin respuesta. Clic para copiar el recordatorio de WhatsApp"
        @click="$emit('copiar-encuesta')"
      >
        <i class="ti ti-star" :class="ICONO" aria-hidden="true"></i>
        Encuesta sin responder
        <i class="ti ti-brand-whatsapp text-green-600" aria-hidden="true"></i>
      </button>
    </li>
  </ul>
</template>
