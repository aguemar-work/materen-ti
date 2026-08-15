<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { MODULOS_CONFIGURABLES } from '../../constants/modulos.js';
import Modal from '../../components/shared/Modal.vue';

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
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>

    <template #acciones>
      <button class="btn" type="button" :disabled="guardando" @click="modal?.cerrar()">Cancelar</button>
      <button class="btn btn-primary" type="submit" form="staff-modulos-form" :disabled="guardando || cargando">
        <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
        {{ guardando ? 'Guardando...' : 'Guardar' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.loading-inline {
  font-size: 13px;
  color: var(--color-text-secondary);
  padding: 8px 0;
}

.modulos-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modulo-item label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-primary);
  cursor: pointer;
}

/* Mismo tratamiento que .form-group input[type="checkbox"]:focus-visible
   (main.css) — este checklist vive fuera de .form-group, así que necesita
   la regla propia para no caer al outline nativo del navegador. */
.modulo-item input[type="checkbox"]:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.field-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
