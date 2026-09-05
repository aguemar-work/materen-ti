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
import Modal from '../../components/shared/Modal.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  empleadoId: { type: String, required: true },
  empleadoNombre: { type: String, default: '' },
});
const emit = defineEmits(['close', 'asignado']);

const modal = ref(null);
const cargandoLista = ref(true);
const conCupo = ref([]);
const licenciaSelId = ref('');
const procesando = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    const todas = await insforgeApi.listLicencias();
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
    <template #titulo><i class="ti ti-user-plus" aria-hidden="true"></i> Asignar licencia a {{ empleadoNombre }}</template>

    <div class="form-group">
      <label for="asig-lic-licencia">Licencia *</label>
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
          <span class="combo-sec">{{ item.usados }}/{{ item.cantidad }} asientos</span>
        </template>
      </BuscadorCombo>
      <p v-if="!cargandoLista && conCupo.length === 0" class="form-hint">
        No hay licencias con cupo disponible ahora mismo.
      </p>
    </div>

    <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="procesando" @click="modal?.cerrar()">Cancelar</CarbonButton>
      <CarbonButton variante="primary" :cargando="procesando" :deshabilitado="!licenciaSelId" @click="confirmar">
        {{ procesando ? 'Asignando...' : 'Asignar' }}
      </CarbonButton>
    </template>
  </Modal>
</template>
