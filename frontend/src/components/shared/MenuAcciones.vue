<script setup>
// Menú contextual "⋮" compartido (patrón mobile, jul 2026).
// Condensa acciones por fila (tarjetas móviles) o botones de toolbar que no
// caben en pantallas angostas. El panel se teletransporta a <body> (mismo
// patrón que Modal.vue) porque .card tiene overflow:hidden y recortaría un
// popover posicionado con absolute.
import { ref, computed, nextTick, onBeforeUnmount } from 'vue';

// Raíz múltiple (botón + Teleport): los attrs del padre (class, etc.)
// se aplican explícitamente al botón disparador.
defineOptions({ inheritAttrs: false });

const props = defineProps({
  // [{ icono, label, danger?, disabled?, visible?, separador?, onClick }]
  // visible: false omite el ítem (condiciones por fila);
  // separador: true dibuja una línea divisoria en lugar de un ítem.
  acciones: { type: Array, required: true },
  // Etiqueta accesible del botón disparador.
  label: { type: String, default: 'Acciones' },
  icono: { type: String, default: 'ti-dots-vertical' },
  // Texto visible junto al icono; con texto el trigger usa .btn (toolbar),
  // sin texto usa .icon-btn (fila de tabla/tarjeta).
  texto: { type: String, default: '' },
});

const visibles = computed(() => props.acciones.filter((a) => a.visible !== false));

const abierto = ref(false);
const trigger = ref(null);
const panel = ref(null);
const coords = ref({ top: 0, left: 0 });

function posicionar() {
  if (!trigger.value || !panel.value) return;
  const r = trigger.value.getBoundingClientRect();
  const m = panel.value.getBoundingClientRect();
  // Alineado al borde derecho del trigger, sin salirse del viewport.
  let left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
  // Abre hacia abajo; si no cabe, hacia arriba.
  let top = r.bottom + 4;
  if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
  coords.value = { top, left };
}

function onDocPointer(e) {
  if (trigger.value?.contains(e.target) || panel.value?.contains(e.target)) return;
  cerrar();
}

function onScroll(e) {
  // El scroll de la página desancla el menú; el scroll interno del panel no.
  if (panel.value?.contains(e.target)) return;
  cerrar();
}

function items() {
  if (!panel.value) return [];
  return Array.from(panel.value.querySelectorAll('[role="menuitem"]:not([disabled])'));
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    cerrar();
    trigger.value?.focus();
    return;
  }
  if (e.key === 'Tab') {
    cerrar();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const f = items();
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    const paso = e.key === 'ArrowDown' ? 1 : -1;
    f[(i + paso + f.length) % f.length].focus();
  }
}

async function abrir() {
  abierto.value = true;
  await nextTick();
  posicionar();
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', cerrar);
  items()[0]?.focus();
}

function cerrar() {
  if (!abierto.value) return;
  abierto.value = false;
  document.removeEventListener('pointerdown', onDocPointer, true);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', cerrar);
}

function alternar() {
  if (abierto.value) cerrar();
  else abrir();
}

function ejecutar(a) {
  cerrar();
  a.onClick?.();
}

onBeforeUnmount(cerrar);
</script>

<template>
  <button
    ref="trigger"
    v-bind="$attrs"
    :class="texto ? 'btn' : 'icon-btn'"
    type="button"
    :aria-label="label"
    aria-haspopup="menu"
    :aria-expanded="abierto"
    :title="texto ? undefined : label"
    @click.stop="alternar"
  >
    <i class="ti" :class="icono" aria-hidden="true"></i>
    <template v-if="texto">{{ texto }}</template>
  </button>
  <Teleport to="body">
    <div
      v-if="abierto"
      ref="panel"
      class="menu-acciones"
      role="menu"
      :aria-label="label"
      :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
    >
      <template v-for="(a, i) in visibles" :key="i">
        <div v-if="a.separador" class="menu-acciones__sep" role="separator"></div>
        <button
          v-else
          class="menu-acciones__item"
          :class="{ 'menu-acciones__item--danger': a.danger }"
          type="button"
          role="menuitem"
          :disabled="a.disabled"
          @click.stop="ejecutar(a)"
        >
          <i v-if="a.icono" class="ti" :class="a.icono" aria-hidden="true"></i>
          {{ a.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-acciones {
  position: fixed;
  z-index: var(--z-popover);
  min-width: 200px;
  max-width: min(300px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 4px;
}

.menu-acciones__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}

.menu-acciones__item i {
  font-size: 16px;
  color: var(--color-text-secondary);
}

.menu-acciones__item:hover,
.menu-acciones__item:focus-visible {
  background: var(--color-bg-hover);
}

.menu-acciones__item--danger,
.menu-acciones__item--danger i {
  color: var(--color-danger-text);
}

.menu-acciones__item:disabled {
  color: var(--color-text-disabled);
  cursor: default;
  background: transparent;
}

.menu-acciones__item:disabled i {
  color: var(--color-text-disabled);
}

.menu-acciones__sep {
  height: 1px;
  margin: 4px 8px;
  background: var(--color-border-subtle);
}
</style>
