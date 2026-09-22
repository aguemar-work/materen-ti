<script setup>
import { nextTick, ref, watch } from 'vue';
import AppButton from '../../components/ui/AppButton.vue';

// Caja para comentar un ticket (mensaje + "nota interna" + enviar).
// Compartida por TicketDetalleView.vue y TicketDetallePanel.vue, que hasta
// ago 2026 tenían cada uno su copia idéntica del bloque y de sus ~45
// líneas de estilo.
const props = defineProps({
  mensaje: { type: String, default: '' },
  interno: { type: Boolean, default: false },
  enviando: { type: Boolean, default: false },
});

const emit = defineEmits(['update:mensaje', 'update:interno', 'enviar']);

// Crece con el texto (como un chat) hasta un tope; pasado ese tope
// scrollea adentro en vez de seguir empujando el layout. Vive acá y no en
// useTicketDetalleLogica.js porque es comportamiento del control, no
// lógica de negocio del ticket.
const ALTURA_MAX = 160;
const textarea = ref(null);

function ajustarAlto() {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAX)}px`;
}

function alEscribir(event) {
  emit('update:mensaje', event.target.value);
  ajustarAlto();
}

// Tras enviar, el contenedor limpia el mensaje: hay que devolver el alto
// al mínimo o queda un textarea alto y vacío.
watch(
  () => props.mensaje,
  (valor) => {
    if (!valor) nextTick(ajustarAlto);
  },
);
</script>

<template>
  <div class="tk-nuevo-comentario">
    <textarea
      ref="textarea"
      rows="1"
      class="tk-comentario-input"
      placeholder="Escribe una nota interna o una respuesta para el empleado..."
      :value="mensaje"
      :disabled="enviando"
      @input="alEscribir"
    ></textarea>
    <div class="tk-comentario-acciones">
      <label class="check-inline">
        <input
          :checked="interno"
          type="checkbox"
          :disabled="enviando"
          @change="emit('update:interno', $event.target.checked)"
        >
        Nota interna (no visible para el empleado)
      </label>
      <AppButton
        severity="secondary"
        :label="enviando ? 'Enviando...' : 'Comentar'"
        :loading="enviando"
        :disabled="!mensaje.trim()"
        @click="emit('enviar')"
      />
    </div>
  </div>
</template>


