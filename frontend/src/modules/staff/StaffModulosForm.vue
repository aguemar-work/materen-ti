<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { MODULOS_CONFIGURABLES } from '../../constants/modulos.js';
import Modal from '../../components/shared/Modal.vue';
import AppButton from '../../components/ui/AppButton.vue';
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
    <form id="staff-modulos-form" class="space-y-4" @submit.prevent="guardar">
      <p v-if="cargando" class="py-6 text-center text-sm text-gray-500" role="status">Cargando módulos...</p>
      <fieldset v-else>
        <legend class="mb-2 flex w-full items-center justify-between text-sm font-medium text-gray-700">
          Módulos que puede usar
          <span class="text-xs font-normal text-gray-500 tabular-nums">{{ seleccionados.length }} de {{ MODULOS_CONFIGURABLES.length }}</span>
        </legend>
        <ul class="grid gap-1.5 sm:grid-cols-2">
          <li v-for="m in MODULOS_CONFIGURABLES" :key="m.id">
            <label
              class="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors duration-150 focus-within:ring-2 focus-within:ring-primary-500"
              :class="seleccionados.includes(m.id) ? 'border-primary-200 bg-primary-50 text-primary-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'"
            >
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 accent-primary-600"
                :checked="seleccionados.includes(m.id)"
                :disabled="guardando"
                @change="toggle(m.id)"
              >
              {{ m.label }}
            </label>
          </li>
        </ul>
        <p class="mt-3 text-xs text-gray-500">
          Los módulos sin marcar desaparecen del menú de {{ miembro.nombre }} y no son accesibles por URL directa.
        </p>
      </fieldset>
      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="modal?.cerrar()" />
      <AppButton type="submit" form="staff-modulos-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" :disabled="cargando" />
    </template>
  </Modal>
</template>
