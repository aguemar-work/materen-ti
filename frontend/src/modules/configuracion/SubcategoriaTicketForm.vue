<script setup>
// Edición de una subcategoría de ticket (nombre, tipo sugerido, prioridad
// sugerida de la 116 y aviso al solicitante de la 114). Hasta hoy una subcategoría solo se creaba
// (alta rápida inline) o se eliminaba; el aviso necesita un lugar donde
// escribirlo. Mismo andamiaje que todo formulario en modal
// (useFormularioModal + AppDialog). Emite `cerrar` con la fila actualizada,
// o con null si se canceló.
import { ref } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { OPCIONES_TIPO as TIPOS, OPCIONES_PRIORIDAD, prioridadSugeridaDe } from '../../core/dominio-tickets.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CampoAvisoCategoria from './CampoAvisoCategoria.vue';

const props = defineProps({
  subcategoria: { type: Object, required: true },
});
const emit = defineEmits(['cerrar']);

const form = ref({
  nombre: props.subcategoria.nombre || '',
  tipo_sugerido: props.subcategoria.tipo_sugerido || '',
  // NULL en la base = media (116): el selector la muestra como «Media».
  prioridad_sugerida: prioridadSugeridaDe(props.subcategoria),
  aviso: props.subcategoria.aviso || '',
});
let resultado = null;

const { modal, guardando, error, ejecutarGuardado, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

const campoNombre = useCampoAccesible();
const campoTipo = useCampoAccesible();
const campoPrioridad = useCampoAccesible({ ayuda: () => 'Prioridad inicial' });
const infoError = infoNotificacion('error');

async function guardar() {
  const fila = await ejecutarGuardado(
    () => insforgeApi.updateSubcategoriaTicket(props.subcategoria.id, {
      nombre: form.value.nombre,
      tipo_sugerido: form.value.tipo_sugerido || null,
      prioridad_sugerida: form.value.prioridad_sugerida || null,
      aviso: form.value.aviso,
    }),
    { entidad: 'la subcategoría', porDefecto: 'No se pudo guardar la subcategoría' },
  );
  if (!fila) return;
  resultado = fila;
  tomarSnapshot();
  modal.value?.cerrar();
}
</script>

<template>
  <AppDialog
    ref="modal"
    titulo="Editar subcategoría"
    size="sm"
    :confirmar-cierre="confirmarCierre"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="subcat-form" class="space-y-4" @submit.prevent="guardar">
      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoNombre.id">Nombre<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input :id="campoNombre.id" v-model="form.nombre" class="campo__control" type="text" required maxlength="120" :disabled="guardando">
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoTipo.id">Tipo sugerido</label>
        <div class="campo__caja">
          <select :id="campoTipo.id" v-model="form.tipo_sugerido" class="campo__control campo__control--select" :disabled="guardando">
            <option value="">Sin definir</option>
            <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoPrioridad.id">Prioridad sugerida</label>
        <div class="campo__caja">
          <select :id="campoPrioridad.id" v-model="form.prioridad_sugerida" class="campo__control campo__control--select" :disabled="guardando" :aria-describedby="campoPrioridad.describedBy.value">
            <option v-for="p in OPCIONES_PRIORIDAD" :key="p.valor" :value="p.valor">{{ p.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
        <p :id="campoPrioridad.idAyuda" class="campo__pie">Con esta prioridad entra un ticket nuevo de esta subcategoría; el técnico puede cambiarla. No cambia los tickets ya registrados.</p>
      </div>

      <CampoAvisoCategoria v-model="form.aviso" nivel="subcategoría" :disabled="guardando" />

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>
    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton type="submit" form="subcat-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
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
