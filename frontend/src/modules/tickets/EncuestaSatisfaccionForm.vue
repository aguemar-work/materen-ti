<script setup>
// Formulario de calificación del servicio (ticket_satisfaccion), compartido
// por dos contextos: standalone (ResponderEncuestaView, enlace directo
// /soporte/:token/satisfaccion) y embebido (TicketSeguimientoView, cuando el
// ticket ya está cerrado — evita que el empleado tenga que navegar aparte,
// el enlace de seguimiento ya lo tiene desde que creó el ticket).
import { ref, computed, onMounted } from 'vue';
import { responderEncuesta, encuestaYaRespondida } from '../../api/ticketsPublicos.js';

const props = defineProps({
  token: { type: String, required: true },
  // Embebido: si la encuesta no existe todavía (ticket sin empleado
  // vinculado) o falla la consulta, no tiene sentido mostrar una pantalla
  // de error dentro de una página de seguimiento que por lo demás carga
  // bien — el bloque simplemente no aparece. Standalone sí muestra el
  // error: quien navega directo al enlace de calificación espera una
  // respuesta explícita.
  embebido: { type: Boolean, default: false },
});

// estado: 'cargando' | 'formulario' | 'enviando' | 'gracias' | 'ya_respondida' | 'error'
const estado = ref('cargando');
const error = ref('');
const nivel = ref(0);
const comentario = ref('');

const oculto = computed(() => props.embebido && estado.value === 'error');

// Antes de mostrar el formulario, hay que saber si ya se respondió: si no,
// tras refrescar la página parece que se puede volver a enviar (aunque el
// backend ya lo bloquee, no debe ni parecer posible).
onMounted(async () => {
  try {
    const yaRespondida = await encuestaYaRespondida(props.token);
    estado.value = yaRespondida ? 'ya_respondida' : 'formulario';
  } catch (e) {
    error.value = e?.message || 'No se pudo cargar la encuesta';
    estado.value = 'error';
  }
});

const NIVELES = [
  { valor: 1, icono: 'ti-mood-cry', label: 'Muy insatisfecho' },
  { valor: 2, icono: 'ti-mood-sad', label: 'Insatisfecho' },
  { valor: 3, icono: 'ti-mood-neutral', label: 'Neutral' },
  { valor: 4, icono: 'ti-mood-smile', label: 'Satisfecho' },
  { valor: 5, icono: 'ti-mood-happy', label: 'Muy satisfecho' },
];

async function enviar() {
  if (!nivel.value) {
    error.value = 'Seleccione un nivel de satisfacción';
    return;
  }
  error.value = '';
  estado.value = 'enviando';
  try {
    await responderEncuesta(props.token, nivel.value, comentario.value.trim());
    estado.value = 'gracias';
  } catch (e) {
    // Ya se respondió (ej. otra pestaña envió justo antes): no hay nada que
    // reintentar, mostrar la misma pantalla de "ya respondida".
    if (e?.code === 'ya_respondida') {
      estado.value = 'ya_respondida';
      return;
    }
    error.value = e?.message || 'No se pudo enviar la respuesta';
    estado.value = 'formulario';
  }
}
</script>

<template>
  <div v-if="!oculto" role="status" aria-live="polite">
    <div v-if="estado === 'cargando'" class="ticket-texto">Cargando...</div>

    <template v-else-if="estado === 'error'">
      <div class="ticket-error-icon"><i class="ti ti-link-off" aria-hidden="true"></i></div>
      <h2 class="ticket-title">No disponible</h2>
      <p class="ticket-texto">{{ error }}</p>
      <RouterLink class="public-volver" to="/soporte">
        <i class="ti ti-arrow-left" aria-hidden="true"></i> Volver a soporte
      </RouterLink>
    </template>

    <template v-else-if="estado === 'formulario' || estado === 'enviando'">
      <h2 class="ticket-title">Calificación del servicio</h2>
      <p class="ticket-texto">Su respuesta contribuye a mejorar el servicio de soporte.</p>

      <div class="niveles">
        <button
          v-for="n in NIVELES"
          :key="n.valor"
          type="button"
          class="nivel-btn"
          :class="{ 'nivel-btn--activo': nivel === n.valor }"
          :disabled="estado === 'enviando'"
          :title="n.label"
          :aria-label="n.label"
          :aria-pressed="nivel === n.valor"
          @click="nivel = n.valor"
        >
          <i :class="`ti ${n.icono}`" aria-hidden="true"></i>
        </button>
      </div>

      <div class="form-group full">
        <label for="ts-comentario">Comentarios (opcional)</label>
        <textarea
          id="ts-comentario"
          v-model="comentario"
          rows="3"
          placeholder="Observaciones adicionales..."
          :disabled="estado === 'enviando'"
        ></textarea>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <button class="btn btn-primary ticket-submit" type="button" :disabled="estado === 'enviando'" @click="enviar">
        <i v-if="estado === 'enviando'" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
        {{ estado === 'enviando' ? 'Enviando...' : 'Enviar respuesta' }}
      </button>
    </template>

    <template v-else-if="estado === 'gracias'">
      <div class="ticket-ok-icon"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
      <h2 class="ticket-title">Respuesta registrada</h2>
      <p class="ticket-texto">Gracias por completar la encuesta de satisfacción.</p>
    </template>

    <template v-else-if="estado === 'ya_respondida'">
      <div class="ticket-ok-icon"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
      <h2 class="ticket-title">Respuesta ya registrada</h2>
      <p class="ticket-texto">La encuesta ya fue completada — no es necesario volver a responder.</p>
    </template>
  </div>
</template>

<style scoped>
.ticket-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.ticket-texto {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 16px;
}

.niveles {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}

.nivel-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  font-size: 24px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.nivel-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

.nivel-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--mat-ring);
}

.nivel-btn--activo {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}

.ticket-submit {
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
  margin-top: 12px;
}

.ticket-ok-icon {
  font-size: 40px;
  color: var(--color-success-text);
  margin-bottom: 8px;
}

.ticket-error-icon {
  font-size: 40px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
</style>
