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
</script>

<template>
  <div class="full">
    <div v-if="pregunta.tipo === 'texto_corto' || pregunta.tipo === 'texto_largo'" class="campo" :class="{ 'campo--inerte': disabled }">
      <label class="campo__etiqueta" :for="campo.id">
        {{ pregunta.etiqueta }}<span v-if="pregunta.requerido" aria-hidden="true"> *</span>
      </label>
      <div class="campo__caja">
        <input
          v-if="pregunta.tipo === 'texto_corto'"
          :id="campo.id"
          class="campo__control"
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
          class="campo__control campo__control--area"
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
    <fieldset v-else class="pc-fieldset">
      <legend>{{ pregunta.etiqueta }}<span v-if="pregunta.requerido"> *</span></legend>

      <div v-if="pregunta.tipo === 'opcion_unica'" class="pc-opciones">
        <label v-for="op in pregunta.opciones" :key="op" class="pc-opcion">
          <input
            type="radio"
            :name="`pc-${pregunta.id}`"
            :value="op"
            :checked="modelValue === op"
            :disabled="disabled"
            @change="actualizar(op)"
          >
          {{ op }}
        </label>
      </div>

      <div v-else-if="pregunta.tipo === 'escala_1_5'" class="pc-escala-fila">
        <span class="pc-escala-hint">{{ pregunta.opciones?.[0] || '1 = Nada satisfecho' }}</span>
        <div class="pc-escala">
          <button
            v-for="n in [1, 2, 3, 4, 5]"
            :key="n"
            type="button"
            class="pc-escala-btn"
            :class="{ 'pc-escala-btn--activo': modelValue === n }"
            :aria-pressed="modelValue === n"
            :disabled="disabled"
            @click="actualizar(n)"
          >{{ n }}</button>
        </div>
        <span class="pc-escala-hint pc-escala-hint--der">{{ pregunta.opciones?.[1] || '5 = Muy satisfecho' }}</span>
      </div>

      <div v-else-if="pregunta.tipo === 'si_no'" class="pc-sino">
        <button
          type="button"
          class="btn pc-sino-btn"
          :class="{ 'pc-sino-btn--activo': modelValue === true }"
          :aria-pressed="modelValue === true"
          :disabled="disabled"
          @click="actualizar(true)"
        >Sí</button>
        <button
          type="button"
          class="btn pc-sino-btn"
          :class="{ 'pc-sino-btn--activo': modelValue === false }"
          :aria-pressed="modelValue === false"
          :disabled="disabled"
          @click="actualizar(false)"
        >No</button>
      </div>
    </fieldset>
  </div>
</template>


