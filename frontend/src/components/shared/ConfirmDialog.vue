<script setup>
// Diálogo de confirmación de dos tiers (auditoría UX/UI, hallazgo CNF-1 y §3.1).
// Reemplaza los 16 confirm() nativos y unifica la confirmación destructiva.
//   - Tier base: nombre de la entidad en el título + foco inicial en Cancelar.
//   - Tier auditable (requiereMotivo): motivo obligatorio (>= motivoMin),
//     formaliza el patrón de "rechazar ticket".
// Construido sobre <Modal>, así hereda foco atrapado / Escape / aria-modal.
import { ref } from 'vue';
import Modal from './Modal.vue';
import CarbonButton from '../carbon/CarbonButton.vue';
import CarbonCampo from '../carbon/CarbonCampo.vue';

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
    @close="emit('cancel')"
  >
    <template v-if="destructivo" #titulo>
      <span class="confirm-titulo">
        <span class="icon-box icon-box--danger"><i :class="`ti ${icono}`" aria-hidden="true"></i></span>
        {{ titulo }}
      </span>
    </template>

    <p v-if="mensaje" class="confirm-mensaje">{{ mensaje }}</p>
    <slot />

    <CarbonCampo
      v-if="requiereMotivo"
      v-model="motivo"
      :etiqueta="motivoLabel"
      tipo="textarea"
      :filas="3"
      :error="error"
      :deshabilitado="cargando"
    />

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="cargando" @click="modalRef?.cerrar()">
        {{ cancelarLabel }}
      </CarbonButton>
      <CarbonButton
        :variante="destructivo ? 'danger' : 'primary'"
        :deshabilitado="cargando"
        :cargando="cargando"
        @click="confirmar"
      >
        {{ cargando ? 'Procesando...' : confirmarLabel }}
      </CarbonButton>
    </template>
  </Modal>
</template>

<style scoped>
.confirm-titulo { display: flex; align-items: center; gap: var(--space-5); }
.confirm-mensaje {
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 var(--space-2);
}
</style>
