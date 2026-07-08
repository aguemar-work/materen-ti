<script setup>
// Modal accesible reutilizable (auditoría UX/UI, hallazgo MOD-1).
// Reemplaza los ~21 modales hand-rolled: centraliza role=dialog + aria-modal,
// atrapamiento de foco (Tab/Shift+Tab), cierre con Escape, foco inicial y
// restauración del foco previo. Reusa las clases globales de main.css
// (.modal-bg / .modal / .modal-title / .modal-actions) para ser drop-in.
import { ref, onMounted, onBeforeUnmount, nextTick, useId } from 'vue';

const props = defineProps({
  // Título simple; para uno compuesto (ícono + texto) usar el slot #titulo.
  titulo: { type: String, default: '' },
  // '' | 'sm' | 'lg' | 'detail' — pasa a la clase .modal-<size> ya existente.
  size: { type: String, default: '' },
  // Clase extra en el .modal-bg (ej. 'confirm-dialog--destructive').
  overlayClass: { type: String, default: '' },
  cerrarEnBackdrop: { type: Boolean, default: true },
  mostrarCerrar: { type: Boolean, default: true },
});
const emit = defineEmits(['close']);

const tituloId = useId();
const panel = ref(null);
let prevActivo = null;

function focusables() {
  if (!panel.value) return [];
  return Array.from(
    panel.value.querySelectorAll(
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
    return;
  }
  if (e.key !== 'Tab') return;
  const f = focusables();
  if (!f.length) {
    e.preventDefault();
    panel.value?.focus();
    return;
  }
  const primero = f[0];
  const ultimo = f[f.length - 1];
  if (e.shiftKey && document.activeElement === primero) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault();
    primero.focus();
  }
}

onMounted(async () => {
  prevActivo = document.activeElement;
  document.body.style.overflow = 'hidden';
  await nextTick();
  const f = focusables();
  // Foco inicial en el primer control que no sea la "X" de cerrar (así en un
  // form cae en el primer campo, y en un ConfirmDialog en Cancelar).
  const inicial = f.find((el) => el.getAttribute('aria-label') !== 'Cerrar') || f[0] || panel.value;
  inicial?.focus();
  document.addEventListener('keydown', onKeydown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true);
  document.body.style.overflow = '';
  if (prevActivo && typeof prevActivo.focus === 'function') prevActivo.focus();
});

function onBackdrop() {
  if (props.cerrarEnBackdrop) emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-bg" :class="overlayClass" @click.self="onBackdrop">
      <div
        ref="panel"
        class="modal"
        :class="size ? `modal-${size}` : ''"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="tituloId"
        tabindex="-1"
      >
        <div v-if="titulo || $slots.titulo" class="modal-title">
          <span :id="tituloId"><slot name="titulo">{{ titulo }}</slot></span>
          <button
            v-if="mostrarCerrar"
            class="icon-btn"
            type="button"
            aria-label="Cerrar"
            @click="emit('close')"
          >
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <slot />
        <div v-if="$slots.acciones" class="modal-actions">
          <slot name="acciones" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
