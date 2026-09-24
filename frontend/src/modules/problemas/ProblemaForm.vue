<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useProblemasStore } from '../../stores/problemas.js';
import { OPCIONES_SEVERIDAD_PROBLEMA } from '../../core/dominio-problemas.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

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

const campoTitulo = useCampoAccesible();
const campoDescripcion = useCampoAccesible();
const campoSeveridad = useCampoAccesible();
const campoResponsable = useCampoAccesible();
const infoError = infoNotificacion('error');

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
      <p v-if="ticketDisparador" class="full flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
        <i class="ti ti-ticket text-gray-400" aria-hidden="true"></i>
        Originado en el ticket <span class="font-medium text-gray-900 tabular-nums">{{ ticketDisparador.codigo || ticketDisparador.id }}</span>
      </p>

      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoTitulo.id">Título<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoTitulo.id"
            v-model="form.titulo"
            class="campo__control"
            type="text"
            placeholder="Ej.: VPN institucional cae varias veces por semana"
            required
            :disabled="guardando"
          >
        </div>
      </div>

      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoDescripcion.id">Descripción<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <textarea
            :id="campoDescripcion.id"
            v-model="form.descripcion"
            class="campo__control campo__control--area"
            :rows="5"
            placeholder="Qué pasó, cronología de lo observado"
            required
            :disabled="guardando"
          ></textarea>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoSeveridad.id">Severidad</label>
        <div class="campo__caja">
          <select
            :id="campoSeveridad.id"
            v-model="form.severidad"
            class="campo__control campo__control--select"
            :disabled="guardando"
          >
            <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando || cargandoStaff }">
        <label class="campo__etiqueta" :for="campoResponsable.id">Responsable</label>
        <div class="campo__caja">
          <select
            :id="campoResponsable.id"
            v-model="form.responsable_id"
            class="campo__control campo__control--select"
            :disabled="guardando || cargandoStaff"
          >
            <option value="">Sin asignar</option>
            <option v-for="s in staffLista" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton
        type="submit"
        form="problema-form"
        :label="guardando ? 'Creando...' : 'Crear problema'"
        :loading="guardando"
        :disabled="guardando"
      />
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


