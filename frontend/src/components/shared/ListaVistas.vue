<script setup>
// Lista de Vistas — reemplaza el modelo anterior de Tickets (Estado
// dropdown/nav-list + toggles sueltos, ver TicketsView.vue PASO 1). Un
// solo componente, reutilizado con los MISMOS datos en Tabla e Isla (y
// pensado para cualquier módulo futuro con el mismo patrón) — el layout
// (columna angosta, fila horizontal, etc.) lo decide el consumidor vía la
// clase que le pase; este componente no impone display/flex-direction
// propio, solo la lista de botones.
defineProps({
  vistas: { type: Array, required: true }, // [{ id, label, icono, filtro }]
  modelValue: { type: String, required: true },
  conteos: { type: Object, default: null }, // { [id]: numero } — opcional, no obliga a calcularlo si no hace falta
});
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <div class="lista-vistas" role="group" aria-label="Vistas">
    <button
      v-for="v in vistas"
      :key="v.id"
      type="button"
      class="tnav-item"
      :class="{ 'tnav-item--activo': modelValue === v.id }"
      :aria-pressed="modelValue === v.id"
      @click="emit('update:modelValue', v.id)"
    >
      <i v-if="v.icono" class="ti" :class="v.icono" aria-hidden="true"></i>
      <span class="tnav-label">{{ v.label }}</span>
      <span v-if="conteos && modelValue === v.id" class="tnav-contador">{{ conteos[v.id] }}</span>
    </button>
  </div>
</template>

<style>
/* Global (sin scoped) a propósito: .tnav-item también lo usa el botón
   "Vencidos" de TicketsView.vue, fuera de este componente — mismo
   criterio que .icon-btn/.chip-filtro, clases compartidas sin scope de un
   único componente dueño. */
.tnav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--fs-base);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
}

.tnav-item:hover:not(:disabled) { background: var(--color-bg-hover); }

.tnav-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--mat-ring);
}

/* Mismo par tenue/acento que el ítem activo del sidebar real (GUIA-UX-UI):
   un solo lenguaje para "esto está seleccionado" en toda la app. */
.tnav-item--activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}

.tnav-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tnav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tnav-contador {
  font-size: var(--fs-xs);
  font-weight: 700;
  flex-shrink: 0;
}
</style>
