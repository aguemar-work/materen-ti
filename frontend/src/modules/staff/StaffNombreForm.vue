<script setup>
// Edición mínima del nombre para mostrar (migración 061): cualquier staff
// edita el suyo, JEFE edita el de cualquiera — RLS + trigger deciden qué
// combinación es válida, este componente solo pide el texto. Mismo patrón
// que StaffModulosForm.vue: llama al API directo, sin pasar por un store.
import { ref } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import Modal from '../../components/shared/Modal.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  miembro: { type: Object, required: true }, // { user_id, nombre }
});
const emit = defineEmits(['cerrar', 'guardado']);

const modal = ref(null);
const guardando = ref(false);
const error = ref('');
const nombre = ref(props.miembro.nombre);

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
    <form id="staff-nombre-form" @submit.prevent="guardar">
      <CarbonCampo
        v-model="nombre"
        etiqueta="Nombre para mostrar"
        requerido
        :deshabilitado="guardando"
        placeholder="ej: Ana Guevara"
        ayuda="Aparece en tickets, problemas y reportes en vez del usuario de acceso."
      />
      <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
    </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="modal?.cerrar()">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="staff-nombre-form" :cargando="guardando">
        {{ guardando ? 'Guardando...' : 'Guardar' }}
      </CarbonButton>
    </template>
  </Modal>
</template>
