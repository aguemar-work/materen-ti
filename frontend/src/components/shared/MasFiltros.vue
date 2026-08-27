<script setup>
// Popover mínimo para filtros secundarios (Tickets, PASO 4: "Sin
// vincular" es el primero) — mismo patrón de Teleport + posicionamiento +
// cierre (pointerdown fuera, Escape, resize) que ya usa MenuAcciones.vue,
// pero SIN su ejecutar() (que siempre cierra el panel al hacer click en
// cualquier ítem): acá el contenido es un slot libre, cada filtro decide
// su propio comportamiento — pensado para sumar más de un checkbox/toggle
// sin que el popover se cierre en el primero. Por eso no es una reutilización
// directa de MenuAcciones.vue (el shape "lista de acciones que cierran al
// ejecutarse" no calza con "checkboxes de filtro que quedan abiertos").
import { ref, nextTick, onBeforeUnmount } from 'vue';

defineOptions({ inheritAttrs: false });

defineProps({
  // Resalta el trigger cuando algún filtro secundario está activo.
  activo: { type: Boolean, default: false },
});

const abierto = ref(false);
const trigger = ref(null);
const panel = ref(null);
const coords = ref({ top: 0, left: 0 });

function posicionar() {
  if (!trigger.value || !panel.value) return;
  const r = trigger.value.getBoundingClientRect();
  const m = panel.value.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
  let top = r.bottom + 4;
  if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
  coords.value = { top, left };
}

function onDocPointer(e) {
  if (trigger.value?.contains(e.target) || panel.value?.contains(e.target)) return;
  cerrar();
}

function onKeydown(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  cerrar();
  trigger.value?.focus();
}

async function abrir() {
  abierto.value = true;
  await nextTick();
  posicionar();
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', cerrar);
}

function cerrar() {
  if (!abierto.value) return;
  abierto.value = false;
  document.removeEventListener('pointerdown', onDocPointer, true);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('resize', cerrar);
}

function alternar() {
  abierto.value ? cerrar() : abrir();
}

onBeforeUnmount(cerrar);
</script>

<template>
  <button
    ref="trigger"
    v-bind="$attrs"
    class="icon-btn mas-filtros-trigger"
    :class="{ 'mas-filtros-trigger--activo': activo }"
    type="button"
    aria-label="Más filtros"
    aria-haspopup="true"
    :aria-expanded="abierto"
    title="Más filtros"
    @click.stop="alternar"
  >
    <i class="ti ti-filter" aria-hidden="true"></i>
  </button>
  <Teleport to="body">
    <div
      v-if="abierto"
      ref="panel"
      class="mas-filtros-panel"
      aria-label="Más filtros"
      :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
    >
      <slot />
    </div>
  </Teleport>
</template>

<style>
/* Global (sin scope): el trigger reusa .icon-btn (ya global en main.css),
   acá solo el estado activo y el panel/ítems propios de este componente —
   mismo criterio que .tnav-item/.chip-filtro en los componentes anteriores. */
.mas-filtros-trigger--activo {
  color: var(--color-accent-text);
}

.mas-filtros-panel {
  position: fixed;
  z-index: var(--z-popover);
  min-width: 180px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 8px;
  box-shadow: var(--shadow-md);
}

/* Clase lista para cada filtro que se agregue adentro del slot — no
   obliga a nada, pero evita que cada consumidor futuro reinvente el
   mismo padding/hover para una fila de checkbox. */
.mas-filtros-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.mas-filtros-item:hover {
  background: var(--color-bg-hover);
}
</style>
