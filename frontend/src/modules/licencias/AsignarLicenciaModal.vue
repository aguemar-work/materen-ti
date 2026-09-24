<script setup>
// Asignar un asiento de una licencia YA EXISTENTE a un empleado, desde la
// ficha del propio empleado (Plan Maestro, 2026-09-01 — "Ficha de
// Empleado", propuesta aprobada). Dirección inversa del modal "Asignar
// asiento" de LicenciasView.vue: acá el empleado es fijo y se busca la
// licencia con cupo; allá la licencia es fija y se busca el empleado.
// Mismo endpoint de negocio (`insforgeApi.asignarUsuario`, que ya decide
// internamente si va por cuenta-login o por licencia directa), llamado
// directo — sin pasar por el store de Licencias. Crear/editar una licencia
// sigue siendo exclusivo del módulo Licencias.
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import Modal from '../../components/shared/Modal.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  empleadoId: { type: String, required: true },
  empleadoNombre: { type: String, default: '' },
});
const emit = defineEmits(['close', 'asignado']);

const modal = ref(null);
const cargandoLista = ref(true);
const conCupo = ref([]);
// Cuántas licencias hay en total: distingue "no hay ninguna registrada"
// (salida: registrar una) de "todas están llenas" (salida: ir a Licencias a
// liberar un asiento o ampliar la cantidad).
const totalLicencias = ref(0);
const licenciaSelId = ref('');
const procesando = ref(false);
const error = ref('');
const infoError = infoNotificacion('error');

onMounted(async () => {
  try {
    const todas = await insforgeApi.listLicencias();
    totalLicencias.value = todas.length;
    conCupo.value = todas.filter((lic) => lic.usados < lic.cantidad);
  } catch (e) {
    error.value = e?.message || 'No se pudo cargar la lista de licencias';
  } finally {
    cargandoLista.value = false;
  }
});

function confirmarCierreProcesando() {
  return !procesando.value;
}

async function confirmar() {
  const licencia = conCupo.value.find((lic) => lic.id === licenciaSelId.value);
  if (!licencia) return;
  error.value = '';
  procesando.value = true;
  try {
    await insforgeApi.asignarUsuario(licencia, props.empleadoId);
    emit('asignado');
    modal.value?.cerrar();
  } catch (e) {
    // Rechazo del trigger de tope de asientos (mismo candado que en
    // LicenciasView): se muestra en el modal, no solo en un toast.
    error.value = e?.message || 'Error al asignar';
  } finally {
    procesando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    size="sm"
    :confirmar-cierre="confirmarCierreProcesando"
    :cerrar-en-backdrop="false"
    @close="emit('close')"
  >
    <template #titulo>Asignar licencia a {{ empleadoNombre }}</template>

    <div class="space-y-4">
      <div class="campo">
        <label class="campo__etiqueta" for="asig-lic-licencia">Licencia<span aria-hidden="true"> *</span></label>
        <BuscadorCombo
          id="asig-lic-licencia"
          v-model="licenciaSelId"
          :items="conCupo"
          :campos-busqueda="['software', 'proveedor']"
          :etiqueta="(lic) => `${lic.software} (${lic.usados}/${lic.cantidad})`"
          :placeholder="cargandoLista ? 'Cargando licencias con cupo...' : 'Buscar por software o proveedor...'"
          :disabled="procesando || cargandoLista"
        >
          <template #resultado="{ item }">
            <span>{{ item.software }}</span>
            <span class="combo-sec tabular-nums">{{ item.cantidad - item.usados }} de {{ item.cantidad }} libres</span>
          </template>
        </BuscadorCombo>
        <!-- Estado vacío con salida (antes solo informaba y dejaba al
             usuario sin paso siguiente). -->
        <div v-if="!cargandoLista && conCupo.length === 0 && !error" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <template v-if="totalLicencias === 0">
            <p class="text-xs text-gray-500">Todavía no hay licencias registradas.</p>
            <AppButton size="sm" variant="text" icon="ti ti-plus" label="Registrar una licencia" to="/licencias?nuevo=1" />
          </template>
          <template v-else>
            <p class="text-xs text-gray-500">Todas las licencias tienen sus asientos ocupados. Libere un asiento o amplíe la cantidad desde Licencias.</p>
            <AppButton size="sm" variant="text" icon="ti ti-arrow-right" icon-pos="right" label="Ir a Licencias" to="/licencias" />
          </template>
        </div>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </div>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="procesando" @click="modal?.cerrar()" />
      <AppButton
        :label="procesando ? 'Asignando...' : 'Asignar'"
        :loading="procesando"
        :disabled="!licenciaSelId"
        @click="confirmar"
      />
    </template>
  </Modal>
</template>
