<script setup>
import { formatFechaHora } from '../../core/formatters.js';
import CarbonTag from '../../components/carbon/CarbonTag.vue';

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
              <CarbonTag class="badge-inline" :variante="f.interno ? 'neutral' : 'success'">
                {{ f.interno ? 'Nota interna' : 'Visible para el empleado' }}
              </CarbonTag>
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

<style scoped>
.tk-descripcion {
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-base);
  padding: 10px 12px;
  margin-bottom: 16px;
  white-space: pre-wrap;
}

.tk-timeline {
  margin-bottom: 16px;
}

.tk-timeline--acotado {
  max-height: 280px;
  overflow-y: auto;
}

/* Mismo par de colores que sus badges (--success = visible, --neutral =
   interna): un vistazo a la burbuja ya dice qué vio el empleado, sin
   depender de leer el badge de texto. */
.tk-comentario-bubble {
  border-radius: var(--radius-base);
  padding: 8px 10px;
}

.tk-comentario-bubble--interno { background: var(--color-neutral-bg); }
.tk-comentario-bubble--visible { background: var(--color-success-bg); }

/* Fecha inline dentro de .timeline-title — sin esto hereda
   font-weight:600/color primario de .timeline-title (main.css), que la
   haría ver como si fuera parte del nombre. Mismo tono/tamaño que
   .timeline-meta cuando va abajo aparte. */
.tk-comentario-fecha {
  font-weight: 400;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.tk-mensaje {
  margin: 4px 0 0;
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
  white-space: pre-wrap;
}
</style>
