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
import AppButton from '../../components/ui/AppButton.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

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
const infoError = infoNotificacion('error');
const campoCondicion = useCampoAccesible();

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
    <template #titulo>Asignar equipo a {{ empleadoNombre }}</template>

    <div class="space-y-4">
      <div class="campo">
        <label class="campo__etiqueta" for="asig-eq-equipo">Equipo<span aria-hidden="true"> *</span></label>
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
        <p v-if="!cargandoLista && disponibles.length === 0" class="campo__pie">
          No hay equipos disponibles en almacén ahora mismo.
        </p>
        <p v-else-if="!cargandoLista" class="campo__pie">
          {{ disponibles.length }} {{ disponibles.length === 1 ? 'equipo disponible' : 'equipos disponibles' }} en almacén.
        </p>
      </div>

      <div class="campo" :class="{ 'campo--inerte': procesando }">
        <label class="campo__etiqueta" :for="campoCondicion.id">Condición de entrega</label>
        <div class="campo__caja">
          <input
            :id="campoCondicion.id"
            v-model="condicionEntrega"
            class="campo__control"
            type="text"
            placeholder="ej: nuevo, con cargador y mochila"
            :disabled="procesando"
          >
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
        :label="procesando ? 'Entregando...' : 'Entregar'"
        :loading="procesando"
        :disabled="!equipoSelId"
        @click="confirmar"
      />
    </template>
  </Modal>
</template>
