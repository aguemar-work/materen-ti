<script setup>
// Selector de vista (Tabla/Lista/Tarjetas en Empleados y Equipos; Tabla/
// Triage en Tickets) — mismo componente reutilizado en los tres lugares,
// solo cambia el arreglo de `opciones` que recibe. Cada botón reusa la
// clase global `.icon-btn` (tamaño, foco, target táctil en pointer:coarse
// ya corregido a 44px) en vez de reinventar esas reglas acá — el único
// estilo propio de este componente es el contenedor agrupador y el
// estado "activo".
defineProps({
  modelValue: { type: String, required: true },
  opciones: { type: Array, required: true }, // [{ valor, icono, label }]
});
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <div class="selector-vista" role="group" aria-label="Vista">
    <button
      v-for="op in opciones"
      :key="op.valor"
      type="button"
      class="icon-btn selector-vista__btn"
      :class="{ 'selector-vista__btn--activo': modelValue === op.valor }"
      :aria-pressed="modelValue === op.valor"
      :title="op.label"
      :aria-label="op.label"
      @click="emit('update:modelValue', op.valor)"
    >
      <i class="ti" :class="op.icono" aria-hidden="true"></i>
    </button>
  </div>
</template>

<style scoped>
.selector-vista {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg-subtle);
}

/* Mismo par tenue/acento que el ítem activo del sidebar y de .tnav-item
   (GUIA-UX-UI) para "esto está seleccionado" — más --shadow-sm porque acá
   el fondo activo es igual de claro que el contenedor (bg-elevated sobre
   bg-subtle), y sin la sombra el botón activo no se distinguía del resto
   en el tema claro. */
.selector-vista__btn--activo {
  background: var(--color-bg-elevated);
  color: var(--color-accent-text);
  box-shadow: none;
}
.selector-vista__btn--activo:hover { background: var(--color-bg-elevated); }
</style>
