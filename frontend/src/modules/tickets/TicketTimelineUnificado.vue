<script setup>
import { formatFechaHora } from '../../core/formatters.js';
import { rolDeTag } from '../../core/tagRol.js';

// Feed cronológico único de un ticket — reemplaza a TicketHistorial.vue +
// TicketComentarios.vue (revisión "Filas con foco", 2026-09-04). Antes eran
// dos bloques separados ("Historial" de hitos del sistema y "Conversación"
// de comentarios): reconstruir "qué pasó y qué se dijo, en orden" exigía
// mirar dos áreas de scroll distintas. Acá es un solo `v-for` sobre
// `filas` (la salida de `timelineUnificado`, useTicketDetalleLogica.js),
// que ya vienen ordenadas por fecha e intercaladas.
//
// La distinción visual entre evento/comentario público/comentario interno
// NO es solo estética — el comentario interno es una señal adyacente a
// control de acceso (nunca lo ve el empleado) — así que se preserva
// EXACTAMENTE el markup/clases que ya tenían los dos componentes viejos:
// las filas de evento no llevan `.tk-comentario-bubble` (sin fondo de
// tarjeta, sin badge); las de comentario sí, con el par color+badge que
// ya usaban (--success/"Visible para el empleado" vs. --neutral/"Nota
// interna"). Compartido por TicketDetallePanel.vue (Triage) y
// TicketDetalleView.vue (página completa).
defineProps({
  descripcion: { type: String, default: '' },
  filas: { type: Array, required: true },
  autorDe: { type: Function, required: true },
  // El panel lo acota con scroll propio (columna angosta hasta esta
  // ronda, ahora comparte la columna con el composer fijo abajo); la
  // página completa lo deja crecer en su columna. Mismo mecanismo que
  // ya tenía TicketHistorial.vue.
  acotado: { type: Boolean, default: false },
  // Divergencia real entre las dos vistas: el panel pone la fecha del
  // comentario en la misma línea del autor (banda angosta); la página
  // completa, en una línea aparte debajo. Ya existía en TicketComentarios.vue.
  fechaInline: { type: Boolean, default: false },
});
</script>

<template>
  <div>
    <p v-if="descripcion" class="tk-descripcion">{{ descripcion }}</p>

    <div v-if="filas.length" class="timeline tk-timeline" :class="{ 'tk-timeline--acotado': acotado }">
      <div v-for="f in filas" :key="f.id" class="timeline-item">
        <template v-if="f.tipo === 'evento'">
          <span class="timeline-dot" :class="`timeline-dot--${f.color}`"></span>
          <div class="timeline-content">
            <div class="timeline-title">{{ f.label }}</div>
            <div class="timeline-meta">{{ formatFechaHora(f.fecha) }}</div>
            <div v-if="f.detalle" class="timeline-detalle">{{ f.detalle }}</div>
          </div>
        </template>

        <template v-else>
          <span class="timeline-dot" :class="f.interno ? 'timeline-dot--closed' : 'timeline-dot--active'"></span>
          <div
            class="timeline-content tk-comentario-bubble"
            :class="f.interno ? 'tk-comentario-bubble--interno' : 'tk-comentario-bubble--visible'"
          >
            <div class="timeline-title">
              {{ autorDe(f.autor_id) }}
              <span v-if="fechaInline" class="tk-comentario-fecha">{{ formatFechaHora(f.fecha) }}</span>
              <span class="tag badge-inline" :class="`tag--${rolDeTag(f.interno ? 'neutral' : 'success')}`">
                {{ f.interno ? 'Nota interna' : 'Visible para el empleado' }}
              </span>
            </div>
            <div v-if="!fechaInline" class="timeline-meta">{{ formatFechaHora(f.fecha) }}</div>
            <p class="tk-mensaje">{{ f.mensaje }}</p>
          </div>
        </template>
      </div>
    </div>
    <p v-else class="tk-nota">Sin actividad todavía.</p>
  </div>
</template>


