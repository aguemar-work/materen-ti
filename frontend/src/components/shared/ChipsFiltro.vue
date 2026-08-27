<script setup>
// Fila de chips de selección MÚLTIPLE libre (a diferencia de
// ListaVistas.vue, que es selección única/exclusiva) — pensado para
// Prioridad en Tickets (PASO 3), reutilizable en Tabla e Isla con los
// mismos datos. Ninguna marcada al montar = sin filtro (todas).
const props = defineProps({
  opciones: { type: Array, required: true }, // [{ valor, label }]
  modelValue: { type: Array, required: true }, // valores seleccionados
  label: { type: String, default: 'Filtros' }, // aria-label del grupo
});
const emit = defineEmits(['update:modelValue']);

function toggle(valor) {
  const seleccionados = props.modelValue.includes(valor)
    ? props.modelValue.filter((v) => v !== valor)
    : [...props.modelValue, valor];
  emit('update:modelValue', seleccionados);
}
</script>

<template>
  <div class="chips-filtro" role="group" :aria-label="label">
    <button
      v-for="op in opciones"
      :key="op.valor"
      type="button"
      class="chip-filtro"
      :class="{ 'chip-filtro--activo': modelValue.includes(op.valor) }"
      :aria-pressed="modelValue.includes(op.valor)"
      @click="toggle(op.valor)"
    >
      {{ op.label }}
    </button>
  </div>
</template>

<style>
/* Global (sin scoped) a propósito — "Sin vincular" (toggle único, no
   selección múltiple) sigue usando estas mismas clases fuera de este
   componente, mismo criterio que .tnav-item en ListaVistas.vue. */
.chips-filtro {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* Mismo par tenue-acento que el ítem activo del sidebar (GUIA-UX-UI):
   sin bordes, solo fondo/color de acento cuando el filtro está activo. */
.chip-filtro {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-bg-subtle);
  color: var(--color-text-secondary);
  font-size: var(--fs-base);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.chip-filtro:hover { background: var(--color-bg-hover); }

.chip-filtro:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--mat-ring);
}

.chip-filtro--activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}
</style>
