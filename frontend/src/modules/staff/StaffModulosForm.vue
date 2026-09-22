<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { MODULOS_CONFIGURABLES } from '../../constants/modulos.js';
import Modal from '../../components/shared/Modal.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const infoError = infoNotificacion('error');

const props = defineProps({
  miembro: { type: Object, required: true }, // { user_id, nombre }
});

const emit = defineEmits(['cerrar']);

const modal = ref(null);
const cargando = ref(true);
const guardando = ref(false);
const error = ref('');
const seleccionados = ref([]);

onMounted(async () => {
  try {
    seleccionados.value = await insforgeApi.modulosDeStaff(props.miembro.user_id);
  } catch (e) {
    error.value = e?.message || 'Error al cargar los módulos';
  } finally {
    cargando.value = false;
  }
});

function toggle(id) {
  const i = seleccionados.value.indexOf(id);
  if (i === -1) seleccionados.value.push(id);
  else seleccionados.value.splice(i, 1);
}

async function guardar() {
  error.value = '';
  guardando.value = true;
  try {
    await insforgeApi.guardarModulos(props.miembro.user_id, seleccionados.value);
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al guardar los módulos';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal ref="modal" :titulo="`Módulos visibles para ${miembro.nombre}`" size="sm" @close="emit('cerrar')">
    <form id="staff-modulos-form" @submit.prevent="guardar">
      <div v-if="cargando" class="loading-inline">Cargando módulos...</div>
      <template v-else>
        <ul class="modulos-lista">
          <li v-for="m in MODULOS_CONFIGURABLES" :key="m.id" class="modulo-item">
            <label>
              <input
                type="checkbox"
                :checked="seleccionados.includes(m.id)"
                :disabled="guardando"
                @change="toggle(m.id)"
              >
              {{ m.label }}
            </label>
          </li>
        </ul>
        <p class="field-hint">
          Los módulos sin marcar desaparecen del menú de {{ miembro.nombre }} y no son accesibles por URL directa.
        </p>
      </template>
      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>

    <template #acciones>
      <button type="button" class="btn btn--secondary" :disabled="guardando" @click="modal?.cerrar()">Cancelar</button>
      <button type="submit" form="staff-modulos-form" class="btn btn--primary" :disabled="guardando || cargando">
        {{ guardando ? 'Guardando...' : 'Guardar' }}
        <i v-if="guardando" class="ti ti-loader-2" aria-hidden="true"></i>
      </button>
    </template>
  </Modal>
</template>


