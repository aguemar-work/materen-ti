<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  empleados: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: undefined },
  placeholder: { type: String, default: 'Buscar por nombre o DNI...' },
  limite: { type: Number, default: 8 },
});

const emit = defineEmits(['update:modelValue']);

const busqueda = ref('');
const listaAbierta = ref(false);

const filtrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  const base = q
    ? props.empleados.filter((e) =>
        `${e.nombres} ${e.apellidos}`.toLowerCase().includes(q) || (e.dni || '').includes(q))
    : props.empleados;
  return base.slice(0, props.limite);
});

function seleccionar(e) {
  emit('update:modelValue', e.id);
  busqueda.value = `${e.nombres} ${e.apellidos}`;
  listaAbierta.value = false;
}

function onInput() {
  if (props.modelValue) emit('update:modelValue', '');
  listaAbierta.value = true;
}

function cerrarLista() {
  setTimeout(() => { listaAbierta.value = false; }, 150);
}

// Si el padre limpia la selección (reset de formulario, cambio de registro),
// el texto buscado debe limpiarse también.
watch(() => props.modelValue, (v) => {
  if (!v) busqueda.value = '';
});
</script>

<template>
  <div class="combo-wrap">
    <i class="ti ti-search combo-icon"></i>
    <input
      :id="id"
      v-model="busqueda"
      type="text"
      autocomplete="off"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="{ 'combo-ok': modelValue }"
      @input="onInput"
      @focus="listaAbierta = true"
      @blur="cerrarLista"
    >
    <i v-if="modelValue" class="ti ti-circle-check combo-check"></i>
    <ul v-if="listaAbierta && !modelValue" class="combo-lista">
      <li v-if="filtrados.length === 0" class="combo-vacio">Sin resultados</li>
      <li v-for="e in filtrados" :key="e.id" @mousedown.prevent="seleccionar(e)">
        <span>{{ e.nombres }} {{ e.apellidos }}</span>
        <span class="combo-sec">{{ e.dni }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.combo-wrap { position: relative; }
.combo-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-text-secondary); font-size: 15px; pointer-events: none;
}
.combo-wrap input { width: 100%; padding-left: 32px; padding-right: 32px; }
.combo-wrap input.combo-ok { border-color: var(--color-success); }
.combo-check {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-success); font-size: 16px; pointer-events: none;
}
.combo-lista {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: var(--z-popover);
  margin: 0; padding: 4px; list-style: none;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 220px; overflow-y: auto;
}
.combo-lista li {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: var(--fs-base);
}
.combo-lista li:hover { background: var(--color-accent-subtle); }
.combo-vacio { color: var(--color-text-secondary); cursor: default !important; font-size: var(--fs-sm); }
.combo-vacio:hover { background: none !important; }
.combo-sec { font-size: var(--fs-sm); color: var(--color-text-secondary); }
</style>
