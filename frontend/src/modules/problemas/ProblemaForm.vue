<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useProblemasStore } from '../../stores/problemas.js';
import { OPCIONES_SEVERIDAD_PROBLEMA } from '../../core/dominio-problemas.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

// ticketDisparador (opcional): { id, titulo, descripcion } de un ticket
// desde el que se abre el problema (flujo "Marcar como problema" de
// TicketDetalleView) — precarga título/descripción y fija
// ticket_disparador_id al crear (se autovincula solo en problema_tickets,
// ver trigger vincular_ticket_disparador de la migración 033).
const props = defineProps({
  ticketDisparador: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);

const modal = ref(null);
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

const { estaSucio, tomarSnapshot } = useDetectorDeCambios(() => form.value);
tomarSnapshot();
const confirmarDescarte = ref(false);
const dialogoDescarte = ref(null);

function confirmarCierre() {
  if (estaSucio.value) {
    confirmarDescarte.value = true;
    return false;
  }
  return true;
}

function cancelar() {
  if (confirmarCierre()) modal.value?.cerrar();
}

function descartarCambios() {
  dialogoDescarte.value?.cerrar();
  modal.value?.cerrar();
}

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
    staffLista.value = (await insforgeApi.listStaff()).filter((s) => s.activo);
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

      <div class="form-group full">
        <label for="problema-titulo">Título *</label>
        <input id="problema-titulo" v-model="form.titulo" required :disabled="guardando" placeholder="Ej.: VPN institucional cae varias veces por semana">
      </div>

      <div class="form-group full">
        <label for="problema-descripcion">Descripción *</label>
        <textarea id="problema-descripcion" v-model="form.descripcion" rows="5" required :disabled="guardando" placeholder="Qué pasó, cronología de lo observado"></textarea>
      </div>

      <div class="form-group">
        <label for="problema-severidad">Severidad</label>
        <select id="problema-severidad" v-model="form.severidad" :disabled="guardando">
          <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
        </select>
      </div>

      <div class="form-group">
        <label for="problema-responsable">Responsable</label>
        <select id="problema-responsable" v-model="form.responsable_id" :disabled="guardando || cargandoStaff">
          <option value="">Sin asignar</option>
          <option v-for="s in staffLista" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
        </select>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>

    <template #acciones>
      <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
      <button class="btn btn-primary" type="submit" form="problema-form" :disabled="guardando">
        <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
        {{ guardando ? 'Creando...' : 'Crear problema' }}
      </button>
    </template>
  </Modal>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Tienes cambios sin guardar, ¿deseas continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
.problema-disparador {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  margin: 0;
}
</style>
