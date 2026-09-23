<script setup>
import { formatFechaHora } from '../../core/formatters.js';
import AppAvatar from '../../components/ui/AppAvatar.vue';

// Feed cronológico único de un ticket — reemplaza a TicketHistorial.vue +
// TicketComentarios.vue (revisión "Filas con foco", 2026-09-04): un solo
// `v-for` sobre `filas` (la salida de `timelineUnificado`,
// useTicketDetalleLogica.js), que ya vienen ordenadas e intercaladas.
// Compartido por TicketDetallePanel.vue (Triage) y TicketDetalleView.vue.
//
// Rediseño 2026-09-23 — se lee como una conversación: la solicitud
// original arriba, los mensajes como bloques con autor, y los hitos del
// sistema como líneas finas entre mensajes (no compiten con lo que la
// gente escribió). La distinción nota interna / visible para el empleado
// NO es solo estética — el comentario interno nunca lo ve el empleado — así
// que va por tres canales a la vez: fondo ámbar tenue, ícono de candado y
// el rótulo de texto. `data-tipo`/`data-visibilidad` exponen lo mismo para
// los tests sin atarlos a una clase de estilo.
defineProps({
  descripcion: { type: String, default: '' },
  filas: { type: Array, required: true },
  autorDe: { type: Function, required: true },
  // El contenedor que lo quiera acotado con scroll propio (sin uso hoy:
  // el panel pone el scroll en su columna).
  acotado: { type: Boolean, default: false },
  // Divergencia real entre las dos vistas: el panel pone la fecha del
  // comentario en la misma línea del autor (banda angosta); la página
  // completa, en una línea aparte debajo.
  fechaInline: { type: Boolean, default: false },
});

// Color del punto de cada hito: el MISMO rol que pinta el badge de estado
// (colorDeEstado en el composable) — un estado siempre significa el mismo color.
const PUNTO = {
  info: 'bg-primary-500',
  warning: 'bg-amber-500',
  success: 'bg-green-500',
  danger: 'bg-red-500',
  neutral: 'bg-gray-400',
};
</script>

<template>
  <div :class="acotado ? 'max-h-96 overflow-y-auto' : ''">
    <div v-if="descripcion" class="rounded-lg bg-gray-50 px-4 py-3">
      <p class="text-xs font-medium text-gray-500">Solicitud original</p>
      <p class="mt-1 whitespace-pre-line break-words text-sm text-gray-900">{{ descripcion }}</p>
    </div>

    <ol v-if="filas.length" class="mt-4 space-y-3">
      <li v-for="f in filas" :key="f.id" :data-tipo="f.tipo" :data-visibilidad="f.tipo === 'comentario' ? (f.interno ? 'interno' : 'visible') : undefined">
        <!-- Hito del sistema: una línea fina, sin tarjeta -->
        <div v-if="f.tipo === 'evento'" class="flex items-start gap-2.5 px-1 text-xs text-gray-500">
          <span class="mt-1 h-2 w-2 shrink-0 rounded-full" :class="PUNTO[f.color] || PUNTO.neutral" aria-hidden="true"></span>
          <div class="min-w-0">
            <span class="font-medium text-gray-700">{{ f.label }}</span>
            <span class="tabular-nums"> · {{ formatFechaHora(f.fecha) }}</span>
            <p v-if="f.detalle" class="mt-0.5 text-gray-500">{{ f.detalle }}</p>
          </div>
        </div>

        <!-- Mensaje: autor + visibilidad + texto -->
        <div v-else class="flex items-start gap-3">
          <AppAvatar :nombre="autorDe(f.autor_id)" />
          <div
            class="min-w-0 flex-1 rounded-lg px-3.5 py-2.5"
            :class="f.interno ? 'bg-amber-50 ring-1 ring-amber-100' : 'bg-white ring-1 ring-gray-200'"
          >
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span class="text-sm font-medium text-gray-900">{{ autorDe(f.autor_id) }}</span>
              <span v-if="fechaInline" class="text-xs tabular-nums text-gray-500">{{ formatFechaHora(f.fecha) }}</span>
              <span
                class="ml-auto inline-flex items-center gap-1 text-xs font-medium"
                :class="f.interno ? 'text-amber-800' : 'text-green-700'"
              >
                <i :class="f.interno ? 'ti ti-lock' : 'ti ti-eye'" aria-hidden="true"></i>
                {{ f.interno ? 'Nota interna' : 'Visible para el empleado' }}
              </span>
            </div>
            <p v-if="!fechaInline" class="text-xs tabular-nums text-gray-500">{{ formatFechaHora(f.fecha) }}</p>
            <p class="mt-1.5 whitespace-pre-line break-words text-sm text-gray-800">{{ f.mensaje }}</p>
          </div>
        </div>
      </li>
    </ol>
    <p v-else class="mt-4 text-center text-sm text-gray-400">Sin actividad todavía.</p>
  </div>
</template>
