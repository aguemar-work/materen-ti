<script setup>
import { TIPOS_PREGUNTA } from '../../core/dominio-encuestas.js';

const props = defineProps({
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
      v-else-if="pregunta.tipo === 'texto_largo'"
      :id="`pc-${pregunta.id}`"
      :value="modelValue || ''"
      rows="4"
      :maxlength="TIPOS_PREGUNTA.texto_largo.maxLen"
      :required="pregunta.requerido"
      :disabled="disabled"
      @input="actualizar($event.target.value)"
    ></textarea>

    <div v-else-if="pregunta.tipo === 'opcion_unica'" class="pc-opciones">
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

    <div v-else-if="pregunta.tipo === 'escala_1_5'" class="pc-escala">
      <button
        v-for="n in [1, 2, 3, 4, 5]"
        :key="n"
        type="button"
        class="pc-escala-btn"
        :class="{ 'pc-escala-btn--activo': modelValue === n }"
        :disabled="disabled"
        @click="actualizar(n)"
      >{{ n }}</button>
    </div>

    <div v-else-if="pregunta.tipo === 'si_no'" class="pc-sino">
      <button
        type="button"
        class="btn pc-sino-btn"
        :class="{ 'pc-sino-btn--activo': modelValue === true }"
        :disabled="disabled"
        @click="actualizar(true)"
      >Sí</button>
      <button
        type="button"
        class="btn pc-sino-btn"
        :class="{ 'pc-sino-btn--activo': modelValue === false }"
        :disabled="disabled"
        @click="actualizar(false)"
      >No</button>
    </div>
  </div>
</template>

<style scoped>
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

.pc-escala {
  display: flex;
  gap: 8px;
}

.pc-escala-btn {
  width: 40px;
  height: 40px;
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
