<script setup>
// Menú contextual "⋮" compartido (patrón mobile, jul 2026).
// Condensa acciones por fila (tarjetas móviles) o botones de toolbar que no
// caben en pantallas angostas. El panel se teletransporta a <body> (mismo
// patrón que Modal.vue) porque .card tiene overflow:hidden y recortaría un
// popover posicionado con absolute.
import { computed } from 'vue';
import { usePopoverFlotante } from '../../composables/usePopoverFlotante.js';

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
  // Con el slot #trigger no aplica ninguna de las dos: quien pasa el slot
  // se hace cargo del aspecto del boton (ver mas abajo).
  texto: { type: String, default: '' },
});

const visibles = computed(() => props.acciones.filter((a) => a.visible !== false));

// Foco-ables del menú, para el recorrido con flechas.
function items() {
  if (!panel.value) return [];
  return Array.from(panel.value.querySelectorAll('[role="menuitem"]:not([disabled])'));
}

const { abierto, trigger, panel, coords, cerrar, alternar } = usePopoverFlotante({
  alinear(r, m) {
    // Alineado al borde derecho del trigger, sin salirse del viewport.
    const left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
    // Abre hacia abajo; si no cabe, hacia arriba.
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    return { top, left };
  },
  cerrarConScroll: true,
  alTeclear(e) {
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
  },
  alAbrir: () => items()[0]?.focus(),
});

function ejecutar(a) {
  cerrar();
  a.onClick?.();
}
</script>

<template>
  <!-- El slot #trigger deja que quien usa el componente ponga su propio
       contenido Y su propia clase en el disparador. Existe por el menu de
       usuario del header del shell (AppLayout.vue), cuyo disparador es un
       avatar de iniciales dentro de un cuadro de 48px: ni .btn ni .icon-btn
       sirven ahi, y dejar que .icon-btn se aplique de todas formas metia su
       hover claro (--color-bg-subtle) sobre el header en Gray 100.
       Sin el slot, el comportamiento es exactamente el de antes. -->
  <button
    ref="trigger"
    v-bind="$attrs"
    :class="$slots.trigger ? null : (texto ? 'btn' : 'icon-btn')"
    type="button"
    :aria-label="label"
    aria-haspopup="menu"
    :aria-expanded="abierto"
    :title="texto ? undefined : label"
    @click.stop="alternar"
  >
    <slot name="trigger">
      <i class="ti" :class="icono" aria-hidden="true"></i>
      <template v-if="texto">{{ texto }}</template>
    </slot>
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
  border-radius: var(--radius-base);
  padding: var(--space-2);
  box-shadow: var(--shadow-overlay);
}

.menu-acciones__item {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  width: 100%;
  padding: 11px 12px;
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}

.menu-acciones__item i {
  font-size: var(--icon-sm);
  color: var(--color-text-secondary);
}

.menu-acciones__item:hover {
  background: var(--color-bg-hover);
}

.menu-acciones__item:focus-visible {
  background: var(--color-bg-hover);
  box-shadow: 0 0 0 2px var(--ring);
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
  margin: var(--space-2) var(--space-4);
  background: var(--color-border-subtle);
}
</style>
