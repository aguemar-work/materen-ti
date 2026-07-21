<script setup>
// Diálogo de confirmación de dos tiers (auditoría UX/UI, hallazgo CNF-1 y §3.1).
// Reemplaza los 16 confirm() nativos y unifica la confirmación destructiva.
//   - Tier base: nombre de la entidad en el título + foco inicial en Cancelar.
//   - Tier auditable (requiereMotivo): motivo obligatorio (>= motivoMin),
//     formaliza el patrón de "rechazar ticket".
// Construido sobre <Modal>, así hereda foco atrapado / Escape / aria-modal.
import { ref, useId } from 'vue';
import Modal from './Modal.vue';

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
const emit = defineEmits(['confirm', 'cancel']);

const motivoId = useId();
const motivo = ref('');
const error = ref('');

// Cancelar cierra con animación: Modal emite 'close' al terminar la salida
// y eso ya está mapeado a 'cancel'. Confirmar no cierra acá — el padre
// mantiene el diálogo abierto mientras procesa (cargando); al terminar debe
// llamar cerrar() (expuesto abajo) en vez de desmontar con v-if, para que
// la salida anime igual que Cancelar/X/Escape. El 'cancel' que se emite al
// final de esa animación es quien baja el v-if del padre.
const modalRef = ref(null);

defineExpose({ cerrar: () => modalRef.value?.cerrar() });

function confirmar() {
  if (props.requiereMotivo) {
    if (motivo.value.trim().length < props.motivoMin) {
      error.value = `Escribe al menos ${props.motivoMin} caracteres.`;
      return;
    }
    emit('confirm', motivo.value.trim());
    return;
  }
  emit('confirm');
}
</script>

<template>
  <Modal
    ref="modalRef"
    :titulo="titulo"
    size="sm"
    transicion="modal-anim-rapida"
    :overlay-class="destructivo ? 'confirm-dialog--destructive' : ''"
    @close="emit('cancel')"
  >
    <template v-if="destructivo" #titulo>
      <span class="confirm-titulo">
        <span class="modal-icon"><i :class="`ti ${icono}`" aria-hidden="true"></i></span>
        {{ titulo }}
      </span>
    </template>

    <p v-if="mensaje" class="confirm-mensaje">{{ mensaje }}</p>
    <slot />

    <div v-if="requiereMotivo" class="form-group full">
      <label :for="motivoId">{{ motivoLabel }}</label>
      <textarea :id="motivoId" v-model="motivo" rows="3" :disabled="cargando"></textarea>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>

    <template #acciones>
      <button class="btn" type="button" :disabled="cargando" @click="modalRef?.cerrar()">
        {{ cancelarLabel }}
      </button>
      <button
        :class="destructivo ? 'btn btn-danger' : 'btn btn-primary'"
        type="button"
        :disabled="cargando"
        @click="confirmar"
      >
        <i v-if="cargando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
        {{ cargando ? 'Procesando...' : confirmarLabel }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.confirm-titulo { display: flex; align-items: center; gap: 10px; }
.confirm-mensaje {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 4px;
}
</style>
