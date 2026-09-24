<script setup>
// Edición mínima del nombre para mostrar (migración 061): cualquier staff
// edita el suyo, JEFE edita el de cualquiera — RLS + trigger deciden qué
// combinación es válida, este componente solo pide el texto. Mismo patrón
// que StaffModulosForm.vue: llama al API directo, sin pasar por un store.
import { ref } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import Modal from '../../components/shared/Modal.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const props = defineProps({
  miembro: { type: Object, required: true }, // { user_id, nombre }
});
const emit = defineEmits(['cerrar', 'guardado']);

const modal = ref(null);
const guardando = ref(false);
const error = ref('');
const nombre = ref(props.miembro.nombre);

const campoNombre = useCampoAccesible({
  ayuda: () => 'Aparece en tickets, problemas y reportes en vez del usuario de acceso.',
});
const infoError = infoNotificacion('error');

async function guardar() {
  error.value = '';
  const limpio = nombre.value.trim();
  if (!limpio) {
    error.value = 'El nombre no puede quedar vacío';
    return;
  }
  guardando.value = true;
  try {
    const actualizado = await insforgeApi.updateStaff(props.miembro.user_id, { nombre: limpio });
    emit('guardado', actualizado);
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al guardar el nombre';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal ref="modal" titulo="Editar nombre" size="sm" @close="emit('cerrar')">
    <form id="staff-nombre-form" class="space-y-4" @submit.prevent="guardar">
      <div class="campo" :class="{ 'campo--invalido': campoNombre.invalido.value, 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoNombre.id">
          Nombre para mostrar<span aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <input
            :id="campoNombre.id"
            v-model="nombre"
            class="campo__control"
            type="text"
            placeholder="ej: Ana Guevara"
            required
            :disabled="guardando"
            :aria-invalid="campoNombre.invalido.value"
            :aria-describedby="campoNombre.describedBy.value"
          >
        </div>
        <p :id="campoNombre.idAyuda.value" class="campo__pie">
          Aparece en tickets, problemas y reportes en vez del usuario de acceso.
        </p>
      </div>
      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="modal?.cerrar()" />
      <AppButton type="submit" form="staff-nombre-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
    </template>
  </Modal>
</template>
