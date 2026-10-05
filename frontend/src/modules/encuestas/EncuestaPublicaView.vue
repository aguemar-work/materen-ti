<script setup>
// Página PÚBLICA (sin sesión): responder una ronda de encuesta. A
// diferencia de EntregaView (un solo uso), esta misma ronda la puede
// abrir y responder cualquier cantidad de personas.
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { abrirEncuesta, responderEncuesta, MENSAJES_ERROR_ENCUESTA } from '../../api/encuestaPublica.js';
import { respuestaValida } from '../../core/dominio-encuestas.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';
import PreguntaCampo from './PreguntaCampo.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const infoError = infoNotificacion('error');

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
      error.value = `Revise la pregunta “${p.etiqueta}”`;
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

// ── Solo presentación (rediseño 2026-09-24, receta 4.5) ──────────────────
const encabezado = computed(() => {
  if (estado.value === 'cargando') return { titulo: 'Encuesta', icono: '', tono: 'neutral' };
  if (estado.value === 'error') {
    return { titulo: 'No se pudo abrir la encuesta', icono: 'ti ti-plug-connected-x', tono: 'neutral' };
  }
  if (estado.value === 'confirmacion') {
    return { titulo: '¡Gracias por su respuesta!', icono: 'ti ti-circle-check', tono: 'success' };
  }
  return { titulo: titulo.value, icono: '', tono: 'neutral', descripcion: descripcion.value };
});
const porcentajeRespondido = computed(() =>
  totalPreguntas.value ? Math.round((preguntasRespondidas.value / totalPreguntas.value) * 100) : 0
);
</script>

<template>
  <AppPortal
    seccion="Encuesta"
    :titulo="encabezado.titulo"
    :descripcion="encabezado.descripcion || ''"
    :icono="encabezado.icono"
    :tono="encabezado.tono"
  >
    <p v-if="estado === 'cargando'" class="py-4 text-center text-sm text-gray-500" role="status">Cargando encuesta...</p>

    <p v-else-if="estado === 'error'" class="text-center text-sm text-gray-600">{{ error }}</p>

    <p v-else-if="estado === 'confirmacion'" class="text-center text-sm text-gray-600">
      Su respuesta quedó registrada de forma anónima.
    </p>

    <template v-else>
      <div v-if="totalPreguntas" class="mb-6">
        <p class="text-xs text-gray-500 tabular-nums">{{ preguntasRespondidas }} de {{ totalPreguntas }} preguntas respondidas</p>
        <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <div class="h-full rounded-full bg-primary-500 transition-[width] duration-300" :style="{ width: `${porcentajeRespondido}%` }"></div>
        </div>
      </div>

      <form class="flex flex-col gap-6" @submit.prevent="enviar">
        <PreguntaCampo
          v-for="p in preguntas"
          :key="p.id"
          :pregunta="p"
          :model-value="respuestas[p.id]"
          :disabled="estado === 'enviando'"
          @update:model-value="(v) => (respuestas[p.id] = v)"
        />

        <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
          <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ error }}</p>
          </div>
        </div>

        <AppButton
          type="submit"
          size="lg"
          block
          :label="estado === 'enviando' ? 'Enviando...' : 'Enviar respuesta'"
          :loading="estado === 'enviando'"
        />
      </form>
    </template>

    <template v-if="estado === 'error'" #pie>
      <AppButton
        variant="text"
        severity="secondary"
        icon="ti ti-arrow-left"
        label="Volver a soporte"
        to="/soporte"
      />
    </template>
  </AppPortal>
</template>
