<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useProblemasStore } from '../../stores/problemas.js';
import { OPCIONES_SEVERIDAD_PROBLEMA } from '../../core/dominio-problemas.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

// ticketDisparador (opcional): { id, titulo, descripcion } de un ticket
// desde el que se abre el problema (flujo "Marcar como problema" de
// TicketDetalleView) — precarga título/descripción y fija
// ticket_disparador_id al crear (se autovincula solo en problema_tickets,
// ver trigger vincular_ticket_disparador de la migración 033).
const props = defineProps({
  ticketDisparador: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);

let resultado = false;

const store = useProblemasStore();

const cargandoStaff = ref(true);
const guardando = ref(false);
const error = ref('');
const staffLista = ref([]);

const form = ref({
  titulo: props.ticketDisparador?.titulo || '',
  descripcion: props.ticketDisparador?.descripcion || '',
  severidad: 'media',
  responsable_id: '',
});

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

async function guardar() {
  error.value = '';
  if (!form.value.titulo.trim()) {
    error.value = 'Escriba un título';
    return;
  }
  if (!form.value.descripcion.trim()) {
    error.value = 'Describa qué pasó';
    return;
  }
  guardando.value = true;
  try {
    const problema = await store.crear({
      titulo: form.value.titulo,
      descripcion: form.value.descripcion,
      severidad: form.value.severidad,
      responsable_id: form.value.responsable_id || null,
      ticket_disparador_id: props.ticketDisparador?.id || null,
    });
    tomarSnapshot();
    resultado = problema;
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al crear el problema';
  } finally {
    guardando.value = false;
  }
}

onMounted(async () => {
  try {
    staffLista.value = await insforgeApi.nombresStaff();
  } catch (e) {
    error.value = e?.message || 'Error al cargar staff';
  } finally {
    cargandoStaff.value = false;
  }
});
</script>

<template>
  <Modal ref="modal" titulo="Nuevo problema" :confirmar-cierre="confirmarCierre" @close="emit('cerrar', resultado)">
    <form id="problema-form" class="form-grid" @submit.prevent="guardar">
      <p v-if="ticketDisparador" class="problema-disparador">
        <i class="ti ti-ticket" aria-hidden="true"></i> Originado en el ticket {{ ticketDisparador.codigo || ticketDisparador.id }}
      </p>

      <CarbonCampo class="full" v-model="form.titulo" etiqueta="Título" requerido :deshabilitado="guardando" placeholder="Ej.: VPN institucional cae varias veces por semana" />

      <CarbonCampo class="full" v-model="form.descripcion" etiqueta="Descripción" tipo="textarea" :filas="5" requerido :deshabilitado="guardando" placeholder="Qué pasó, cronología de lo observado" />

      <CarbonCampo v-model="form.severidad" etiqueta="Severidad" tipo="select" :deshabilitado="guardando">
        <template #opciones>
          <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
        </template>
      </CarbonCampo>

      <CarbonCampo v-model="form.responsable_id" etiqueta="Responsable" tipo="select" :deshabilitado="guardando || cargandoStaff">
        <template #opciones>
          <option value="">Sin asignar</option>
          <option v-for="s in staffLista" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
        </template>
      </CarbonCampo>

      <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
    </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="problema-form" :cargando="guardando">
        {{ guardando ? 'Creando...' : 'Crear problema' }}
      </CarbonButton>
    </template>
  </Modal>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar, ¿desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
/* CarbonCampo no puede envolverse en el viejo .form-group.full (le filtraría
   el estilo de <input>/<select>/<textarea> anterior), así que repite solo el
   grid-column (mismo criterio que EquipoForm.vue/EmpleadoForm.vue). */
.full {
  grid-column: 1 / -1;
}

.problema-disparador {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-base);
  padding: 8px 12px;
  margin: 0;
}
</style>
