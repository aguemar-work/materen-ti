<script setup>
// Formulario de calificación del servicio (ticket_satisfaccion), compartido
// por dos contextos: standalone (ResponderEncuestaView, enlace directo
// /soporte/:token/satisfaccion) y embebido (TicketSeguimientoView, cuando el
// ticket ya está cerrado — evita que el empleado tenga que navegar aparte,
// el enlace de seguimiento ya lo tiene desde que creó el ticket).
import { ref, computed, onMounted } from 'vue';
import { responderEncuesta, encuestaYaRespondida } from '../../api/ticketsPublicos.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppButton from '../../components/ui/AppButton.vue';

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
const campoComentario = useCampoAccesible();
const infoError = infoNotificacion('error');

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
  <!-- Rediseño 2026-09-23 (receta de portal público, SISTEMA-DISENO §4.5):
       sin contenedor propio — lo pone la página que lo monta (la tarjeta de
       ResponderEncuestaView o el bloque embebido del seguimiento). Controles
       grandes, pensado para un teléfono. -->
  <div v-if="!oculto" role="status" aria-live="polite">
    <p v-if="estado === 'cargando'" class="py-6 text-center text-sm text-gray-500">Cargando...</p>

    <div v-else-if="estado === 'error'" class="py-2 text-center">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-2xl text-gray-500">
        <i class="ti ti-link-off" aria-hidden="true"></i>
      </span>
      <h2 class="mt-3 text-lg font-semibold text-gray-900">No disponible</h2>
      <p class="mt-1 text-sm text-gray-500">{{ error }}</p>
      <RouterLink
        class="mt-5 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        to="/soporte"
      >
        <i class="ti ti-arrow-left" aria-hidden="true"></i> Volver a soporte
      </RouterLink>
    </div>

    <template v-else-if="estado === 'formulario' || estado === 'enviando'">
      <h2 class="text-lg font-semibold text-gray-900">Calificación del servicio</h2>
      <p class="mt-1 text-sm text-gray-500">¿Cómo fue la atención de su ticket? Su respuesta contribuye a mejorar el servicio de soporte.</p>

      <div class="mt-5 grid grid-cols-5 gap-2" role="group" aria-label="Nivel de satisfacción">
        <button
          v-for="n in NIVELES"
          :key="n.valor"
          type="button"
          class="flex flex-col items-center gap-1 rounded-lg border px-1 py-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
          :class="nivel === n.valor
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900'"
          :disabled="estado === 'enviando'"
          :title="n.label"
          :aria-label="n.label"
          :aria-pressed="nivel === n.valor"
          @click="nivel = n.valor"
        >
          <i class="text-3xl" :class="`ti ${n.icono}`" aria-hidden="true"></i>
          <span class="text-xs tabular-nums">{{ n.valor }}</span>
        </button>
      </div>
      <p class="mt-2 h-5 text-center text-sm font-medium text-gray-700">{{ NIVELES.find((n) => n.valor === nivel)?.label || '' }}</p>

      <div class="campo mt-3" :class="{ 'campo--inerte': estado === 'enviando' }">
        <label class="campo__etiqueta" :for="campoComentario.id">Comentarios (opcional)</label>
        <div class="campo__caja">
          <textarea
            :id="campoComentario.id"
            v-model="comentario"
            class="campo__control campo__control--area"
            rows="3"
            placeholder="Observaciones adicionales..."
            :disabled="estado === 'enviando'"
            :aria-invalid="campoComentario.invalido.value"
            :aria-describedby="campoComentario.describedBy.value"
          ></textarea>
        </div>
      </div>

      <div v-if="error" class="notif notif--inline mt-3" :class="`notif--${infoError.rol}`" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>

      <AppButton
        class="mt-5"
        size="lg"
        block
        :label="estado === 'enviando' ? 'Enviando...' : 'Enviar respuesta'"
        :loading="estado === 'enviando'"
        @click="enviar"
      />
    </template>

    <div v-else-if="estado === 'gracias' || estado === 'ya_respondida'" class="py-2 text-center">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-2xl text-green-600">
        <i class="ti ti-circle-check" aria-hidden="true"></i>
      </span>
      <template v-if="estado === 'gracias'">
        <h2 class="mt-3 text-lg font-semibold text-gray-900">Respuesta registrada</h2>
        <p class="mt-1 text-sm text-gray-500">Gracias por completar la encuesta de satisfacción.</p>
      </template>
      <template v-else>
        <h2 class="mt-3 text-lg font-semibold text-gray-900">Respuesta ya registrada</h2>
        <p class="mt-1 text-sm text-gray-500">La encuesta ya fue completada — no es necesario volver a responder.</p>
      </template>
    </div>
  </div>
</template>
