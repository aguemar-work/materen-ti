<script setup>
import { TIPOS_PREGUNTA } from '../../core/dominio-encuestas.js';

defineProps({
  pregunta: { type: Object, required: true },
  modelValue: { default: undefined },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

function actualizar(valor) {
  emit('update:modelValue', valor);
}
</script>

<template>
  <div class="form-group full">
    <template v-if="pregunta.tipo === 'texto_corto' || pregunta.tipo === 'texto_largo'">
      <label :for="`pc-${pregunta.id}`">{{ pregunta.etiqueta }}<span v-if="pregunta.requerido"> *</span></label>

      <input
        v-if="pregunta.tipo === 'texto_corto'"
        :id="`pc-${pregunta.id}`"
        :value="modelValue || ''"
        type="text"
        :maxlength="TIPOS_PREGUNTA.texto_corto.maxLen"
        :required="pregunta.requerido"
        :disabled="disabled"
        @input="actualizar($event.target.value)"
      >

      <textarea
        v-else
        :id="`pc-${pregunta.id}`"
        :value="modelValue || ''"
        rows="4"
        :maxlength="TIPOS_PREGUNTA.texto_largo.maxLen"
        :required="pregunta.requerido"
        :disabled="disabled"
        @input="actualizar($event.target.value)"
      ></textarea>
    </template>

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

<style scoped>
/* Reset de fieldset/legend para que se vean como el .form-group/label que
   reemplazan (mismo tamaño/color/peso que "label" en main.css), no como el
   recuadro nativo del navegador. */
.pc-fieldset {
  border: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.pc-fieldset legend {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  font-weight: 600;
  padding: 0;
}

.pc-opciones, .pc-sino {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.pc-opcion {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
}

/* Radios uno por línea en mobile: en flex-wrap una opción sola se ve
   suelta y el toque es menos preciso que con la fila completa. */
@media (max-width: 768px) {
  .pc-opciones {
    flex-direction: column;
    gap: 10px;
  }
}

.pc-escala-fila {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pc-escala-hint {
  font-size: var(--fs-xs);
  color: var(--color-text-secondary);
}

.pc-escala {
  display: flex;
  gap: 8px;
}

.pc-escala-btn {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--color-border);
  background: none;
  font-weight: 600;
  cursor: pointer;
}

.pc-escala-btn--activo {
  border-color: var(--color-primary);
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}

.pc-sino-btn--activo {
  border-color: var(--color-primary);
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}
</style>
