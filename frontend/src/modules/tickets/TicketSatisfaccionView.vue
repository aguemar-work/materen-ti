<script setup>
// Página PÚBLICA (sin sesión): encuesta de satisfacción. El enlace llega
// resuelto (por correo o desde el seguimiento) — el empleado no escribe
// ningún ID a mano, solo responde nivel + comentario.
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { responderEncuesta, encuestaYaRespondida } from '../../api/ticketsPublicos.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';

const route = useRoute();

// estado: 'cargando' | 'formulario' | 'enviando' | 'gracias' | 'ya_respondida' | 'error'
const estado = ref('cargando');
const error = ref('');
const nivel = ref(0);
const comentario = ref('');

// Antes de mostrar el formulario, hay que saber si ya se respondió: si no,
// tras refrescar la página parece que se puede volver a enviar (aunque el
// backend ya lo bloquee, no debe ni parecer posible).
onMounted(async () => {
  try {
    const yaRespondida = await encuestaYaRespondida(route.params.token);
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
    error.value = 'Elige un nivel de satisfacción';
    return;
  }
  error.value = '';
  estado.value = 'enviando';
  try {
    await responderEncuesta(route.params.token, nivel.value, comentario.value.trim());
    estado.value = 'gracias';
  } catch (e) {
    // Ya se respondió (ej. otra pestaña envió justo antes): no hay nada que
    // reintentar, mostrar la misma pantalla de "ya respondida".
    if (e?.code === 'ya_respondida') {
      estado.value = 'ya_respondida';
      return;
    }
    error.value = e?.message || 'No se pudo enviar tu respuesta';
    estado.value = 'formulario';
  }
}
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Encuesta de satisfacción" />

      <div v-if="estado === 'cargando'" class="ticket-texto">Cargando...</div>

      <template v-else-if="estado === 'error'">
        <div class="ticket-error-icon"><i class="ti ti-link-off"></i></div>
        <h2 class="ticket-title">No disponible</h2>
        <p class="ticket-texto">{{ error }}</p>
      </template>

      <template v-else-if="estado === 'formulario' || estado === 'enviando'">
        <h2 class="ticket-title">¿Cómo te fue?</h2>
        <p class="ticket-texto">Tu opinión nos ayuda a mejorar el soporte.</p>

        <div class="niveles">
          <button
            v-for="n in NIVELES"
            :key="n.valor"
            type="button"
            class="nivel-btn"
            :class="{ 'nivel-btn--activo': nivel === n.valor }"
            :disabled="estado === 'enviando'"
            :title="n.label"
            @click="nivel = n.valor"
          >
            <i :class="`ti ${n.icono}`"></i>
          </button>
        </div>

        <div class="form-group full">
          <label for="ts-comentario">Comentarios (opcional)</label>
          <textarea
            id="ts-comentario"
            v-model="comentario"
            rows="3"
            placeholder="¿Algo que quieras contarnos?"
            :disabled="estado === 'enviando'"
          ></textarea>
        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <button class="btn btn-primary ticket-submit" type="button" :disabled="estado === 'enviando'" @click="enviar">
          {{ estado === 'enviando' ? 'Enviando...' : 'Enviar respuesta' }}
        </button>
      </template>

      <template v-else-if="estado === 'gracias'">
        <div class="ticket-ok-icon"><i class="ti ti-circle-check"></i></div>
        <h2 class="ticket-title">¡Gracias por tu respuesta!</h2>
        <p class="ticket-texto">Tu opinión quedó registrada.</p>
      </template>

      <template v-else-if="estado === 'ya_respondida'">
        <div class="ticket-ok-icon"><i class="ti ti-circle-check"></i></div>
        <h2 class="ticket-title">Ya registramos tu respuesta</h2>
        <p class="ticket-texto">Gracias por contarnos cómo te fue — no es necesario volver a responder.</p>
      </template>
    </div>
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
  gap: 6px;
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
