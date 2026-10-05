<script setup>
// Alta y edición de una categoría de ticket (nombre, servicio de TI de la 107 y
// aviso al solicitante de la 114). Salió de CategoriasTicketPanel.vue cuando el
// panel sumó la prioridad sugerida y los tickets por reclasificar (116): ningún
// .vue pasa de 400 líneas. Mismo andamiaje que todo formulario en modal
// (useFormularioModal + AppDialog). Emite `cerrar` con la fila guardada, o con
// null si se canceló. Quién puede guardar lo decide la RLS (módulo Tickets).
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useCategoriasTicketStore, useServiciosStore } from '../../stores/catalogos.js';
import { slugDe } from '../../core/utils.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CampoAvisoCategoria from './CampoAvisoCategoria.vue';

const props = defineProps({
  // null = categoría nueva
  categoria: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);

const catStore = useCategoriasTicketStore();
const { lista: servicios } = storeToRefs(useServiciosStore());

const form = ref({
  nombre: props.categoria?.nombre || '',
  servicio_id: props.categoria?.servicio_id || '',
  aviso: props.categoria?.aviso || '',
});
let resultado = null;

const { modal, guardando, error, ejecutarGuardado, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

const campoNombre = useCampoAccesible();
const campoServicio = useCampoAccesible({ ayuda: () => 'Opcional' });
const infoError = infoNotificacion('error');

async function guardar() {
  const fila = await ejecutarGuardado(
    () => (props.categoria
      ? catStore.actualizar(props.categoria.id, { ...form.value })
      : catStore.crear({
          id: slugDe(form.value.nombre),
          nombre: form.value.nombre,
          servicio_id: form.value.servicio_id || null,
          aviso: form.value.aviso,
        })),
    { entidad: 'la categoría', porDefecto: 'No se pudo guardar la categoría' },
  );
  if (fila === undefined) return;
  resultado = fila || { ...form.value };
  tomarSnapshot();
  modal.value?.cerrar();
}
</script>

<template>
  <AppDialog
    ref="modal"
    :titulo="categoria ? 'Editar categoría' : 'Nueva categoría'"
    size="sm"
    :confirmar-cierre="confirmarCierre"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="cat-form" @submit.prevent="guardar">
      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoNombre.id">Nombre<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoNombre.id"
            v-model="form.nombre"
            class="campo__control"
            type="text"
            placeholder="ej: Accesos y Cuentas"
            required
            :disabled="guardando"
            :aria-invalid="campoNombre.invalido.value"
            :aria-describedby="campoNombre.describedBy.value"
          >
        </div>
      </div>
      <div class="campo mt-4" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoServicio.id">Servicio de TI</label>
        <div class="campo__caja">
          <select :id="campoServicio.id" v-model="form.servicio_id" class="campo__control campo__control--select" :disabled="guardando">
            <option value="">Sin servicio</option>
            <option v-for="s in servicios" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
        <p :id="campoServicio.idAyuda" class="campo__pie">Opcional. Sirve para medir los tickets de cada servicio.</p>
      </div>
      <CampoAvisoCategoria v-model="form.aviso" class="mt-4" :disabled="guardando" />
      <div v-if="error" class="notif mt-4" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>
    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton type="submit" form="cat-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
    </template>
  </AppDialog>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar. ¿Desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>
