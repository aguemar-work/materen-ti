<script setup>
// Edición mínima del nombre para mostrar (migración 061): cualquier staff
// edita el suyo, JEFE edita el de cualquiera — RLS + trigger deciden qué
// combinación es válida, este componente solo pide el texto. Mismo patrón
// que StaffModulosForm.vue: llama al API directo, sin pasar por un store.
import { ref } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import Modal from '../../components/shared/Modal.vue';

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
      <div class="form-group">
        <label for="staff-nombre-input">Nombre para mostrar</label>
        <input id="staff-nombre-input" v-model="nombre" required :disabled="guardando" placeholder="ej: Ana Guevara">
        <p class="field-hint">Aparece en tickets, problemas y reportes en vez del usuario de acceso.</p>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>

    <template #acciones>
      <button class="btn" type="button" :disabled="guardando" @click="modal?.cerrar()">Cancelar</button>
      <button class="btn btn-primary" type="submit" form="staff-nombre-form" :disabled="guardando">
        <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
        {{ guardando ? 'Guardando...' : 'Guardar' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.field-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
