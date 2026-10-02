<script setup>
// Campo «Aviso al solicitante» (migración 114), compartido por el formulario de
// categoría y el de subcategoría de ticket: textarea con contador contra el tope
// de la base (AVISO_CATEGORIA_MAX) y una ayuda con el ejemplo del dueño. Solo
// pinta y emite: quién puede guardar lo decide la RLS (módulo Tickets) y el
// panel que lo monta (`disabled`).
import { computed } from 'vue';
import { AVISO_CATEGORIA_MAX } from '../../core/dominio-tickets.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  // 'categoría' | 'subcategoría': solo cambia la frase de ayuda.
  nivel: { type: String, default: 'categoría' },
});
const emit = defineEmits(['update:modelValue']);

const campo = useCampoAccesible({ ayuda: () => 'Opcional' });
const largo = computed(() => (props.modelValue || '').length);
const ejemplo = 'Deberá adjuntar la autorización de gerencia. TI no es responsable del contenido: solo administra el sistema.';
</script>

<template>
  <div class="campo" :class="{ 'campo--inerte': disabled }">
    <label class="campo__etiqueta flex items-baseline justify-between gap-3" :for="campo.id">
      <span>Aviso al solicitante</span>
      <span class="text-xs font-normal text-gray-500 tabular-nums" aria-hidden="true">{{ largo }}/{{ AVISO_CATEGORIA_MAX }}</span>
    </label>
    <div class="campo__caja">
      <textarea
        :id="campo.id"
        class="campo__control campo__control--area"
        :value="modelValue"
        :rows="3"
        :maxlength="AVISO_CATEGORIA_MAX"
        :disabled="disabled"
        :aria-describedby="campo.describedBy.value"
        @input="emit('update:modelValue', $event.target.value)"
      ></textarea>
    </div>
    <p :id="campo.idAyuda" class="campo__pie">
      Opcional. Se muestra al elegir esta {{ nivel }} al registrar un ticket; si la subcategoría tiene su propio aviso, gana el suyo.
      Hasta {{ AVISO_CATEGORIA_MAX }} caracteres, en texto plano. Ejemplo: «{{ ejemplo }}»
    </p>
  </div>
</template>
