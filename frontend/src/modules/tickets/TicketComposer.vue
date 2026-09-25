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
  <!-- Una sola caja: el texto arriba, la visibilidad y el envío abajo. Con
       "Nota interna" marcada la caja se tiñe de ámbar (mismo código que la
       nota en el feed): se ve ANTES de enviar a quién le llega el mensaje. -->
  <div
    class="rounded-lg border transition-colors duration-150 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500"
    :class="interno ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-white'"
  >
    <textarea
      ref="textarea"
      rows="2"
      class="block w-full resize-none rounded-t-lg bg-transparent px-3.5 pt-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
      aria-label="Mensaje del comentario"
      :placeholder="interno ? 'Nota interna para el equipo de TI…' : 'Escriba una respuesta para el empleado…'"
      :value="mensaje"
      :disabled="enviando"
      @input="alEscribir"
    ></textarea>
    <div class="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
      <label
        class="inline-flex min-w-0 cursor-pointer select-none items-center gap-2 rounded-md px-1.5 py-1 text-sm"
        :class="interno ? 'text-amber-800' : 'text-gray-600'"
      >
        <input
          :checked="interno"
          type="checkbox"
          class="h-4 w-4 accent-amber-600"
          :disabled="enviando"
          @change="emit('update:interno', $event.target.checked)"
        >
        <i class="ti ti-lock" aria-hidden="true"></i>
        <span class="truncate">Nota interna <span class="text-xs text-gray-500">· no la ve el empleado</span></span>
      </label>
      <AppButton
        size="sm"
        severity="secondary"
        icon="ti ti-send"
        :label="enviando ? 'Enviando...' : 'Comentar'"
        :title="interno ? 'Guardar como nota interna: solo la ve el equipo de TI' : 'Enviar al empleado: lo verá en su seguimiento'"
        :loading="enviando"
        :disabled="!mensaje.trim()"
        @click="emit('enviar')"
      />
    </div>
  </div>
</template>
