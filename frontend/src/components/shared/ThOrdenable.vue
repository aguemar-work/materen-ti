<script setup>
// <th> clickeable para ordenar una tabla por esa columna (ver useOrdenTabla.js
// para el cliente, o el store correspondiente para server-side).
const props = defineProps({
  clave: { type: String, required: true },
  columna: { type: String, default: '' },
  direccion: { type: String, default: 'asc' },
});
const emit = defineEmits(['ordenar']);

function estadoOrden() {
  if (props.columna !== props.clave) return 'none';
  return props.direccion === 'asc' ? 'ascending' : 'descending';
}

function icono() {
  if (props.columna !== props.clave) return 'ti-arrows-sort';
  return props.direccion === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
}
</script>

<template>
  <th scope="col" class="th-ordenable" :aria-sort="estadoOrden()">
    <button type="button" class="th-ordenable-btn" @click="emit('ordenar', clave)">
      <slot />
      <i class="ti th-ordenable-icono" :class="icono()" aria-hidden="true"></i>
    </button>
  </th>
</template>

<style scoped>
.th-ordenable { padding: 0; }

.th-ordenable-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 10px 1.25rem;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  white-space: inherit;
  cursor: pointer;
}

.th-ordenable-icono {
  font-size: 13px;
  opacity: 0.5;
}

.th-ordenable-btn:hover { color: var(--color-text-primary); }
.th-ordenable-btn:hover .th-ordenable-icono { opacity: 1; }
.th-ordenable[aria-sort="ascending"] .th-ordenable-icono,
.th-ordenable[aria-sort="descending"] .th-ordenable-icono { opacity: 1; color: var(--color-primary); }
</style>
