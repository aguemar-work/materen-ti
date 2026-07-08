<script setup>
import { computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Number, required: true },
  totalItems: { type: Number, required: true },
  pageSize: { type: Number, default: 20 },
});

const emit = defineEmits(['update:modelValue']);

const totalPaginas = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)));
const desde = computed(() => (props.totalItems === 0 ? 0 : (props.modelValue - 1) * props.pageSize + 1));
const hasta = computed(() => Math.min(props.modelValue * props.pageSize, props.totalItems));

watch(totalPaginas, (nuevo) => {
  if (props.modelValue > nuevo) emit('update:modelValue', nuevo);
});

function irA(pagina) {
  if (pagina < 1 || pagina > totalPaginas.value || pagina === props.modelValue) return;
  emit('update:modelValue', pagina);
}
</script>

<template>
  <div v-if="totalItems > 0" class="pagination">
    <span class="pagination-info">Mostrando {{ desde }}–{{ hasta }} de {{ totalItems }}</span>
    <div v-if="totalPaginas > 1" class="pagination-controls">
      <button class="icon-btn" type="button" :disabled="modelValue <= 1" @click="irA(modelValue - 1)" aria-label="Página anterior">
        <i class="ti ti-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="pagination-pages">Página {{ modelValue }} de {{ totalPaginas }}</span>
      <button class="icon-btn" type="button" :disabled="modelValue >= totalPaginas" @click="irA(modelValue + 1)" aria-label="Página siguiente">
        <i class="ti ti-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>
