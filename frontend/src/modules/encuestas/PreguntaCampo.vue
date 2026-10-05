<script setup>
import { TIPOS_PREGUNTA } from '../../core/dominio-encuestas.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

defineProps({
  pregunta: { type: Object, required: true },
  modelValue: { default: undefined },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const campo = useCampoAccesible();

function actualizar(valor) {
  emit('update:modelValue', valor);
}

// ── Solo presentación (rediseño 2026-09-24, receta 4.5) ──────────────────
// Controles del portal: 44px (objetivo táctil), 16px en móvil (sin zoom iOS).
const CLASE_CONTROL = 'campo__control h-11 text-base sm:text-sm';
// Botón de alternancia (escala 1–5, Sí/No): mismo lenguaje que los niveles
// de EncuestaSatisfaccionForm — seleccionado = fondo tenue + borde de acento.
const CLASE_OPCION =
  'flex h-11 items-center justify-center rounded-md border text-sm font-medium tabular-nums ' +
  'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
function claseOpcion(activo) {
  return [
    CLASE_OPCION,
    activo
      ? 'border-primary-500 bg-primary-50 text-primary-700'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  ];
}
</script>

<template>
  <div>
    <div v-if="pregunta.tipo === 'texto_corto' || pregunta.tipo === 'texto_largo'" class="campo" :class="{ 'campo--inerte': disabled }">
      <label class="campo__etiqueta" :for="campo.id">
        {{ pregunta.etiqueta }}<span v-if="pregunta.requerido" aria-hidden="true"> *</span>
      </label>
      <div class="campo__caja">
        <input
          v-if="pregunta.tipo === 'texto_corto'"
          :id="campo.id"
          :class="CLASE_CONTROL"
          type="text"
          :value="modelValue || ''"
          :required="pregunta.requerido"
          :disabled="disabled"
          :maxlength="TIPOS_PREGUNTA.texto_corto.maxLen"
          @input="actualizar($event.target.value)"
        >
        <textarea
          v-else
          :id="campo.id"
          class="campo__control campo__control--area text-base sm:text-sm"
          :value="modelValue || ''"
          :rows="4"
          :required="pregunta.requerido"
          :disabled="disabled"
          :maxlength="TIPOS_PREGUNTA.texto_largo.maxLen"
          @input="actualizar($event.target.value)"
        ></textarea>
      </div>
    </div>

    <!-- opcion_unica / escala_1_5 / si_no: grupo de opciones sin un único
         control al que un <label for> pueda apuntar — fieldset/legend en
         vez de label colgado de un id inexistente. -->
    <fieldset v-else class="m-0 min-w-0 border-0 p-0">
      <legend class="mb-2 p-0 text-sm font-medium text-gray-700">
        {{ pregunta.etiqueta }}<span v-if="pregunta.requerido"> *</span>
      </legend>

      <div v-if="pregunta.tipo === 'opcion_unica'" class="flex flex-col gap-2">
        <label
          v-for="op in pregunta.opciones"
          :key="op"
          class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm font-normal text-gray-800 transition-colors duration-150 focus-within:ring-2 focus-within:ring-primary-500"
          :class="[
            modelValue === op ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-white hover:bg-gray-50',
            disabled ? 'cursor-not-allowed opacity-50' : '',
          ]"
        >
          <input
            type="radio"
            class="shrink-0 focus-visible:outline-none"
            :name="`pc-${pregunta.id}`"
            :value="op"
            :checked="modelValue === op"
            :disabled="disabled"
            @change="actualizar(op)"
          >
          <span class="min-w-0 [overflow-wrap:anywhere]">{{ op }}</span>
        </label>
      </div>

      <div v-else-if="pregunta.tipo === 'escala_1_5'">
        <div class="grid grid-cols-5 gap-2">
          <button
            v-for="n in [1, 2, 3, 4, 5]"
            :key="n"
            type="button"
            :class="claseOpcion(modelValue === n)"
            :aria-pressed="modelValue === n"
            :disabled="disabled"
            @click="actualizar(n)"
          >{{ n }}</button>
        </div>
        <div class="mt-1.5 flex justify-between gap-4 text-xs text-gray-500">
          <span>{{ pregunta.opciones?.[0] || '1 = Nada satisfecho' }}</span>
          <span class="text-right">{{ pregunta.opciones?.[1] || '5 = Muy satisfecho' }}</span>
        </div>
      </div>

      <div v-else-if="pregunta.tipo === 'si_no'" class="grid grid-cols-2 gap-2">
        <button
          type="button"
          :class="claseOpcion(modelValue === true)"
          :aria-pressed="modelValue === true"
          :disabled="disabled"
          @click="actualizar(true)"
        >Sí</button>
        <button
          type="button"
          :class="claseOpcion(modelValue === false)"
          :aria-pressed="modelValue === false"
          :disabled="disabled"
          @click="actualizar(false)"
        >No</button>
      </div>
    </fieldset>
  </div>
</template>
