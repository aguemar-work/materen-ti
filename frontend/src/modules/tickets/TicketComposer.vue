<script setup>
import { nextTick, ref, watch } from 'vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';

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
      <CarbonButton
        variante="secondary"
        :deshabilitado="enviando || !mensaje.trim()"
        :cargando="enviando"
        @click="emit('enviar')"
      >{{ enviando ? 'Enviando...' : 'Comentar' }}</CarbonButton>
    </div>
  </div>
</template>

<style scoped>
.tk-nuevo-comentario {
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tk-comentario-input {
  width: 100%;
  min-height: 40px;
  max-height: 160px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  font-size: var(--fs-body-01);
  font-family: var(--font-sans);
  line-height: 1.4;
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
  resize: none;
  overflow-y: auto;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tk-comentario-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--ring);
}

.tk-comentario-acciones {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.check-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
  cursor: pointer;
}
</style>
