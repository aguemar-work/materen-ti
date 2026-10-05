<script setup>
// Asignar un asiento de una licencia (fija) a un empleado activo (se busca),
// desde el listado de Licencias. Dirección inversa de AsignarLicenciaModal.vue
// (ficha del empleado: el empleado es fijo y se busca la licencia). Extraído de
// LicenciasView.vue al partirla; el rechazo del trigger de tope de asientos
// (check_tope_licencia) se muestra DENTRO del diálogo, no solo en el toast,
// porque el mensaje completo debe leerse con calma antes de reintentar.
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useLicenciasStore } from '../../stores/licencias.js';
import { showToast } from '../../core/toast.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { capacidadInfo } from './useLicenciaCupos.js';

const props = defineProps({
  licencia: { type: Object, required: true },
});
const emit = defineEmits(['cerrado']);

const store = useLicenciasStore();
const infoError = infoNotificacion('error');

const modal = ref(null);
const empleadosActivos = ref([]);
const empleadoId = ref('');
const cargandoEmpleados = ref(false);
const asignando = ref(false);
const error = ref('');

// Guard de cierre del AppDialog compartido (X, Escape, backdrop): no cierra
// mientras se está asignando, mismo criterio que el botón Cancelar.
function confirmarCierre() {
  return !asignando.value;
}

onMounted(async () => {
  cargandoEmpleados.value = true;
  try {
    const todos = await insforgeApi.listEmpleados();
    empleadosActivos.value = todos.filter((e) => e.estado === 'Activo');
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'Error al cargar empleados' }).mensaje, 'error');
    modal.value?.cerrar();
  } finally {
    cargandoEmpleados.value = false;
  }
});

async function confirmar() {
  if (!empleadoId.value) return;
  error.value = '';
  asignando.value = true;
  try {
    await store.asignar(props.licencia, empleadoId.value);
    modal.value?.cerrar();
    showToast('Asiento asignado');
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'Error al asignar' }).mensaje;
  } finally {
    asignando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="modal"
    size="sm"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @cerrado="emit('cerrado')"
  >
    <template #titulo>Asignar asiento</template>
    <div class="space-y-4">
      <div class="rounded-md bg-gray-50 px-3 py-2.5">
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span class="truncate font-medium text-gray-900">{{ licencia.software }}</span>
          <span class="shrink-0 text-xs text-gray-500 tabular-nums">{{ licencia.usados }}/{{ licencia.cantidad }} asientos usados</span>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
          <div class="h-full rounded-full" :class="capacidadInfo(licencia).clase" :style="{ width: capacidadInfo(licencia).pct + '%' }"></div>
        </div>
      </div>

      <p v-if="cargandoEmpleados" class="text-sm text-gray-500" role="status">Cargando empleados...</p>
      <div v-else class="campo">
        <label class="campo__etiqueta" for="as-empleado">Empleado<span aria-hidden="true"> *</span></label>
        <BuscadorCombo
          id="as-empleado"
          v-model="empleadoId"
          :items="empleadosActivos"
          :campos-busqueda="['nombres', 'apellidos', 'dni']"
          :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
          placeholder="Buscar por nombre o DNI..."
          :disabled="asignando"
        >
          <template #resultado="{ item }">
            <span>{{ item.nombres }} {{ item.apellidos }}</span>
            <span class="combo-sec tabular-nums">{{ item.dni }}</span>
          </template>
        </BuscadorCombo>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </div>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="asignando" @click="modal?.cerrar()" />
      <AppButton
        :label="asignando ? 'Asignando...' : 'Asignar'"
        :loading="asignando"
        :disabled="!empleadoId"
        @click="confirmar"
      />
    </template>
  </AppDialog>
</template>
