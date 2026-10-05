<script setup>
// Diálogo de confirmación de dos tiers (auditoría UX/UI, hallazgo CNF-1 y
// §3.1). Reemplaza los 16 confirm() nativos y unifica la confirmación
// destructiva.
//   - Tier base: nombre de la entidad en el título + foco inicial en Cancelar.
//   - Tier auditable (requiereMotivo): motivo obligatorio (>= motivoMin),
//     formaliza el patrón de "rechazar ticket".
//
// Reescrito 2026-09-07 sobre primevue/dialog (Unstyled + Tailwind, ver
// pt/dialog.pt.js) + AppButton — antes sobre un <Modal> propio (retirado el 2026-10-02). La API PÚBLICA
// (props/emits/expose) NO cambió: las ~31 vistas que usan <ConfirmDialog>
// siguen funcionando sin tocarlas. Dialog trae su propio focus-trap,
// Escape, aria-modal y backdrop — no hace falta reimplementar nada de eso
// (a diferencia del antiguo Modal.vue, que lo hacía a mano, y que fue
// reemplazado por AppDialog.vue para modales de contenido libre — este cambio es solo de
// ConfirmDialog).
//
// Diferencia de comportamiento aceptada a propósito: el antiguo Modal esperaba a
// que la animación de salida terminara (@after-leave) antes de emitir
// 'cancel', para que el padre desmontara con v-if recién ahí y la salida se
// viera completa. PrimeVue Dialog no expone un hook público equivalente
// (@update:visible dispara al INICIO del cierre, no al final) — 'cancel' se
// emite ahí. Con un padre que desmonta con v-if apenas recibe 'cancel', la
// animación de salida puede cortarse. Es un recorte visual menor, no un
// cambio de comportamiento de negocio — ningún otro comportamiento cambió:
// cerrar() sigue sin emitir 'cancel' (para el camino de éxito), Escape/X/
// backdrop siguen cerrando libremente incluso con `cargando` (igual que
// antes: ese guard nunca existió, solo los botones del footer se
// deshabilitaban).
//
// 'cerrado' (2026-09-24): se emite SIEMPRE que el diálogo deja de verse, por
// cualquier camino (cancelar o cerrar() tras un éxito). Es el evento con el
// que el padre debe desmontar (`@cerrado="pendiente = null"`). Antes los
// padres solo escuchaban 'cancel': tras un cerrar() exitoso su estado quedaba
// asignado con el diálogo oculto, y la SIGUIENTE confirmación de la misma
// pantalla (otro correo a eliminar, otro lote a cerrar) nunca aparecía.
import { ref } from 'vue';
import Dialog from 'primevue/dialog';
import AppButton from '../ui/AppButton.vue';
import { buildDialogPT } from '../ui/pt/dialog.pt.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

const props = defineProps({
  titulo: { type: String, required: true },
  mensaje: { type: String, default: '' },
  confirmarLabel: { type: String, default: 'Confirmar' },
  cancelarLabel: { type: String, default: 'Cancelar' },
  destructivo: { type: Boolean, default: false },
  icono: { type: String, default: 'ti-alert-triangle' },
  requiereMotivo: { type: Boolean, default: false },
  motivoMin: { type: Number, default: 10 },
  motivoLabel: { type: String, default: 'Motivo' },
  cargando: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm', 'cancel', 'cerrado']);

const motivo = ref('');
const error = ref('');
const campoMotivo = useCampoAccesible({ error: () => error.value });

const visible = ref(true);
const pt = buildDialogPT();

// cerrar() != cancelar(): el padre llama cerrar() tras un confirm exitoso
// (no es un cancel); Escape/X/backdrop/botón Cancelar sí cancelan.
function ocultar() {
  visible.value = false;
  emit('cerrado');
}
defineExpose({ cerrar: ocultar });

function cancelar() {
  emit('cancel');
  ocultar();
}

function confirmar() {
  if (props.requiereMotivo) {
    if (motivo.value.trim().length < props.motivoMin) {
      error.value = `Escriba al menos ${props.motivoMin} caracteres.`;
      return;
    }
    emit('confirm', motivo.value.trim());
    return;
  }
  emit('confirm');
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :pt="pt"
    @update:visible="(v) => { if (!v) cancelar(); }"
  >
    <template #header>
      <span v-if="destructivo" class="flex items-center gap-2">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
          <i :class="`ti ${icono}`" aria-hidden="true"></i>
        </span>
        <span class="text-base font-semibold text-gray-900">{{ titulo }}</span>
      </span>
      <span v-else class="text-base font-semibold text-gray-900">{{ titulo }}</span>
    </template>

    <p v-if="mensaje" class="mb-3 text-sm text-gray-600">{{ mensaje }}</p>
    <slot />

    <div v-if="requiereMotivo" class="mt-3">
      <label class="mb-1 block text-sm font-medium text-gray-700" :for="campoMotivo.id">{{ motivoLabel }}</label>
      <textarea
        :id="campoMotivo.id"
        class="w-full rounded-md border px-3 py-2 text-sm text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
        :class="campoMotivo.invalido.value ? 'border-red-300' : 'border-gray-300'"
        :rows="3"
        :value="motivo"
        :disabled="cargando"
        :aria-invalid="campoMotivo.invalido.value"
        :aria-describedby="campoMotivo.describedBy.value"
        @input="motivo = $event.target.value"
      ></textarea>
      <p v-if="error" :id="campoMotivo.idAyuda" class="mt-1 text-sm text-red-600" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <AppButton variant="text" severity="secondary" :label="cancelarLabel" :disabled="cargando" @click="cancelar" />
      <AppButton
        :severity="destructivo ? 'danger' : 'primary'"
        :label="cargando ? 'Procesando...' : confirmarLabel"
        :loading="cargando"
        @click="confirmar"
      />
    </template>
  </Dialog>
</template>
