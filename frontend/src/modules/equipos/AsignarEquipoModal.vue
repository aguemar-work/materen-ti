<script setup>
// Asignar un equipo YA EXISTENTE a un empleado, desde la ficha del propio
// empleado (Plan Maestro, 2026-09-01 — "Ficha de Empleado", propuesta
// aprobada). Dirección inversa del modal "Entregar" de EquiposView.vue: acá
// el empleado es fijo y se busca el equipo; allá el equipo es fijo y se
// busca el empleado. Mismo endpoint de negocio (`insforgeApi.asignarEquipo`),
// llamado directo — sin pasar por el store de Equipos (evitar recargar su
// listado paginado, que no tiene sentido reactivar desde esta pantalla).
// Crear/editar un equipo sigue siendo exclusivo del módulo Equipos: acá
// solo se elige uno que ya existe y está disponible.
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import Modal from '../../components/shared/Modal.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';

const props = defineProps({
  empleadoId: { type: String, required: true },
  empleadoNombre: { type: String, default: '' },
});
const emit = defineEmits(['close', 'asignado']);

const modal = ref(null);
const cargandoLista = ref(true);
const disponibles = ref([]);
const equipoSelId = ref('');
const condicionEntrega = ref('');
const procesando = ref(false);
const error = ref('');

function enAlmacen(eq) {
  return eq.situacion === 'disponible' || eq.situacion === 'en_ubicacion';
}

onMounted(async () => {
  try {
    const todos = await insforgeApi.listEquipos();
    disponibles.value = todos.filter(enAlmacen);
  } catch (e) {
    error.value = e?.message || 'No se pudo cargar la lista de equipos';
  } finally {
    cargandoLista.value = false;
  }
});

function confirmarCierreProcesando() {
  return !procesando.value;
}

async function confirmar() {
  if (!equipoSelId.value) return;
  error.value = '';
  procesando.value = true;
  try {
    await insforgeApi.asignarEquipo(equipoSelId.value, props.empleadoId, condicionEntrega.value);
    emit('asignado');
    modal.value?.cerrar();
  } catch (e) {
    // Rechazo del trigger de asignación (portador activo o equipo no
    // operativo, mismo candado que en EquiposView): se muestra en el modal.
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
    <template #titulo><i class="ti ti-user-plus" aria-hidden="true"></i> Asignar equipo a {{ empleadoNombre }}</template>

    <div class="form-group">
      <label for="asig-eq-equipo">Equipo *</label>
      <BuscadorCombo
        id="asig-eq-equipo"
        v-model="equipoSelId"
        :items="disponibles"
        :campos-busqueda="['codigo', 'marca', 'modelo', 'serie']"
        :etiqueta="(eq) => `${eq.codigo} — ${[eq.tipo_nombre, eq.marca, eq.modelo].filter(Boolean).join(' ')}`"
        :placeholder="cargandoLista ? 'Cargando equipos disponibles...' : 'Buscar por código, marca, modelo o serie...'"
        :disabled="procesando || cargandoLista"
      >
        <template #resultado="{ item }">
          <span>{{ item.codigo }} — {{ [item.tipo_nombre, item.marca, item.modelo].filter(Boolean).join(' ') }}</span>
          <span class="combo-sec">{{ item.serie }}</span>
        </template>
      </BuscadorCombo>
      <p v-if="!cargandoLista && disponibles.length === 0" class="form-hint">
        No hay equipos disponibles en almacén ahora mismo.
      </p>
    </div>

    <CarbonCampo v-model="condicionEntrega" etiqueta="Condición de entrega" placeholder="ej: nuevo, con cargador y mochila" :deshabilitado="procesando" />

    <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="procesando" @click="modal?.cerrar()">Cancelar</CarbonButton>
      <CarbonButton variante="primary" :cargando="procesando" :deshabilitado="!equipoSelId" @click="confirmar">
        {{ procesando ? 'Entregando...' : 'Entregar' }}
      </CarbonButton>
    </template>
  </Modal>
</template>
