<script setup>
import { computed } from 'vue';

const props = defineProps({
  valor: { type: [String, Number], default: '' },
  placeholder: { type: String, default: '—' },
});

const vacio = computed(() => props.valor == null || props.valor === '');
</script>

<template>
  <span :class="{ 'text-muted': vacio }">{{ vacio ? placeholder : valor }}</span>
</template>
