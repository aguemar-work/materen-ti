<script setup>
// Página PÚBLICA (sin sesión): responder una ronda de encuesta. A
// diferencia de EntregaView (un solo uso), esta misma ronda la puede
// abrir y responder cualquier cantidad de personas.
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { abrirEncuesta, responderEncuesta, MENSAJES_ERROR_ENCUESTA } from '../../api/encuestaPublica.js';
import { respuestaValida } from '../../core/dominio-encuestas.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';
import PreguntaCampo from './PreguntaCampo.vue';

const route = useRoute();
const slug = String(route.params.slug || '');

// estado: 'cargando' | 'formulario' | 'enviando' | 'confirmacion' | 'error'
const estado = ref('cargando');
const error = ref('');

const titulo = ref('');
const descripcion = ref('');
const preguntas = ref([]);
const respuestas = reactive({});

// Todas las preguntas se muestran juntas (no hay paginado de a una), así
// que el indicador de progreso es un conteo de respondidas sobre el total,
// no "Pregunta X de N".
const totalPreguntas = computed(() => preguntas.value.length);
const preguntasRespondidas = computed(() => preguntas.value.filter((p) => {
  const v = respuestas[p.id];
  return v !== undefined && v !== null && v !== '';
}).length);

function enviar() {
  error.value = '';
  for (const p of preguntas.value) {
    if (!respuestaValida(p, respuestas[p.id])) {
      error.value = `Revisa la pregunta “${p.etiqueta}”`;
      return;
    }
  }
  guardar();
}

async function guardar() {
  estado.value = 'enviando';
  try {
    await responderEncuesta(slug, { ...respuestas });
    estado.value = 'confirmacion';
  } catch (e) {
    error.value = e?.message || 'No se pudo enviar la respuesta';
    estado.value = 'formulario';
  }
}

onMounted(async () => {
  try {
    const datos = await abrirEncuesta(slug);
    titulo.value = datos.titulo;
    descripcion.value = datos.descripcion;
    preguntas.value = datos.preguntas;
    estado.value = 'formulario';
  } catch (e) {
    error.value = e?.message || MENSAJES_ERROR_ENCUESTA.no_disponible;
    estado.value = 'error';
  }
});
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Encuesta" />

      <template v-if="estado === 'cargando'">
        <p class="ticket-texto">Cargando encuesta...</p>
      </template>

      <template v-else-if="estado === 'error'">
        <div class="ticket-error-icon"><i class="ti ti-plug-connected-x" aria-hidden="true"></i></div>
        <h2 class="ticket-title">No se pudo abrir la encuesta</h2>
        <p class="ticket-texto">{{ error }}</p>
      </template>

      <template v-else-if="estado === 'confirmacion'">
        <div class="ticket-ok-icon"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
        <h2 class="ticket-title">¡Gracias por tu respuesta!</h2>
        <p class="ticket-texto">Tu respuesta quedó registrada de forma anónima.</p>
      </template>

      <template v-else>
        <h2 class="ticket-title">{{ titulo }}</h2>
        <p v-if="descripcion" class="ticket-texto">{{ descripcion }}</p>
        <p v-if="totalPreguntas" class="encuesta-progreso">{{ preguntasRespondidas }} de {{ totalPreguntas }} preguntas respondidas</p>

        <form class="ticket-form" @submit.prevent="enviar">
          <PreguntaCampo
            v-for="p in preguntas"
            :key="p.id"
            :pregunta="p"
            :model-value="respuestas[p.id]"
            :disabled="estado === 'enviando'"
            @update:model-value="(v) => (respuestas[p.id] = v)"
          />

          <p v-if="error" class="form-error" role="alert">{{ error }}</p>

          <button class="btn btn-primary ticket-submit" type="submit" :disabled="estado === 'enviando'">
            <i v-if="estado === 'enviando'" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ estado === 'enviando' ? 'Enviando...' : 'Enviar respuesta' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ticket-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 16px;
}

.ticket-texto {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 10px;
}

.encuesta-progreso {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  margin: 0 0 14px;
}

.ticket-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ticket-submit {
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
  margin-top: 4px;
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
