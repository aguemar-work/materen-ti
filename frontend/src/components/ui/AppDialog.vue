<script setup>
// Wrapper estricto sobre primevue/dialog — para formularios/contenido libre
// dentro de un modal (a diferencia de ConfirmDialog.vue, que es
// específicamente "confirmar sí/no", este acepta cualquier contenido vía
// slot). Primer y único consumidor hoy: TicketInternoForm.vue
// (2026-09-08) — components/shared/Modal.vue (hand-rolled: Teleport, foco
// atrapado, Escape, bloqueo de scroll a mano) sigue siendo lo correcto
// para sus otros ~21 consumidores; no se migran acá, fuera de alcance de
// esta fase.
//
// Mismo preset que ConfirmDialog.vue (pt/dialog.pt.js), con `size: 'md'`
// (más ancho — un formulario con varios campos no entra cómodo en el
// `max-w-sm` de una confirmación).
//
// Contrato pensado para ser drop-in con composables/useFormularioModal.js
// (usado hoy por Modal.vue en ~10 formularios): expone `cerrar()`
// INCONDICIONAL (para el flujo de éxito, ej. "guardó y cierra") y guarda
// Escape/X/backdrop detrás de `confirmarCierre` (si devuelve `false`, el
// cierre se veta — Dialog nunca llega a ocultarse). `cancelar()` en
// useFormularioModal.js ya revisa `confirmarCierre()` ANTES de llamar
// `cerrar()`, así que `cerrar()` no necesita revisarlo de nuevo — mismo
// reparto de responsabilidad que Modal.vue.
import { computed, ref } from 'vue';
import Dialog from 'primevue/dialog';
import { buildDialogPT } from './pt/dialog.pt.js';

const props = defineProps({
  titulo: { type: String, default: '' },
  confirmarCierre: { type: Function, default: null },
  cerrarEnBackdrop: { type: Boolean, default: true },
  mostrarCerrar: { type: Boolean, default: true },
});
const emit = defineEmits(['close']);

const visible = ref(true);
const pt = computed(() => buildDialogPT({ size: 'md' }));

// Único punto que decide si `visible` baja de verdad — cubre las 3 vías
// que Dialog dispara solo (X, Escape, click en el backdrop): si hay guard y
// veta, ni se toca `visible` (Dialog vuelve a recibir `true`, no llega a
// cerrarse). Sin guard o si lo pasa, cierra y emite 'close' — una sola vez,
// sea cual sea la vía.
function onUpdateVisible(v) {
  if (!v && props.confirmarCierre && props.confirmarCierre() === false) return;
  visible.value = v;
  if (!v) emit('close');
}

// Expuesto para el flujo de éxito (ej. TicketInternoForm.vue tras crear el
// ticket) — incondicional a propósito, ver comentario de arriba.
function cerrar() {
  visible.value = false;
  emit('close');
}
defineExpose({ cerrar });
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :dismissable-mask="cerrarEnBackdrop"
    :closable="mostrarCerrar"
    :header="titulo"
    :pt="pt"
    @update:visible="onUpdateVisible"
  >
    <slot />
    <template #footer>
      <slot name="acciones" />
    </template>
  </Dialog>
</template>
