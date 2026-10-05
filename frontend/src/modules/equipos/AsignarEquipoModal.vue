<script setup>
// Asignar un equipo YA EXISTENTE a un empleado, desde la ficha del propio
// empleado (Plan Maestro, 2026-09-01 — "Ficha de Empleado", propuesta
// aprobada). Dirección inversa del diálogo "Entregar" de EquipoAccionesModales.vue:
// acá el empleado es fijo y se busca el equipo; allá el equipo es fijo y se
// busca el empleado. Misma RPC de negocio (`insforgeApi.asignarEquipo`),
// llamado directo — sin pasar por el store de Equipos (evitar recargar su
// listado paginado, que no tiene sentido reactivar desde esta pantalla).
// Crear/editar un equipo sigue siendo exclusivo del módulo Equipos: acá
// solo se elige uno que ya existe y está disponible.
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import EquipoActaOfrecida from './EquipoActaOfrecida.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

const props = defineProps({
  empleadoId: { type: String, required: true },
  empleadoNombre: { type: String, default: '' },
});
const emit = defineEmits(['close', 'asignado']);

const router = useRouter();
const modal = ref(null);
const entregado = ref(null); // { tipo, mensaje } tras entregar: el diálogo ofrece "Ver acta"
const hrefActa = ref('');
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
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar la lista de equipos' }).mensaje;
  } finally {
    cargandoLista.value = false;
  }
});

function confirmarCierreProcesando() {
  return !procesando.value;
}

// Al entregar, el diálogo no se cierra: ofrece "Ver acta" (ruta imprimible
// /equipos/:id/acta/:asignacionId, en pestaña nueva). La ficha del empleado se
// recarga de inmediato (`asignado`); el diálogo se cierra con "Cerrar".
async function confirmar() {
  if (!equipoSelId.value) return;
  error.value = '';
  procesando.value = true;
  const equipo = disponibles.value.find((eq) => eq.id === equipoSelId.value);
  try {
    const asignacion = await insforgeApi.asignarEquipo(equipoSelId.value, props.empleadoId, condicionEntrega.value);
    entregado.value = {
      tipo: 'entrega',
      mensaje: `${equipo?.codigo ?? 'El equipo'} quedó a cargo de ${props.empleadoNombre || 'el empleado'}.`,
    };
    hrefActa.value = asignacion?.id
      ? router.resolve({ path: `/equipos/${equipoSelId.value}/acta/${asignacion.id}`, query: { tipo: 'entrega' } }).href
      : '';
    showToast(`${equipo?.codigo ?? 'Equipo'} entregado`);
    emit('asignado');
  } catch (e) {
    // Rechazo del servidor (portador activo o equipo no operativo): se muestra
    // en el diálogo, en español.
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo registrar la entrega' }).mensaje;
  } finally {
    procesando.value = false;
  }
}
</script>

<template>
  <AppDialog
    :key="entregado ? 'resultado' : 'formulario'"
    ref="modal"
    size="sm"
    :confirmar-cierre="confirmarCierreProcesando"
    :cerrar-en-backdrop="false"
    @cerrado="emit('close')"
  >
    <template #titulo>{{ entregado ? 'Equipo entregado' : `Asignar equipo a ${empleadoNombre}` }}</template>

    <EquipoActaOfrecida v-if="entregado" :resultado="entregado" :href="hrefActa" @cerrar="modal?.cerrar()" />
    <div v-else class="space-y-4">
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
        <!-- Estado vacío con salida: sin equipo en almacén no hay nada que
             elegir acá, pero sí se puede registrar uno (/equipos?nuevo=1
             abre el formulario de alta al llegar). -->
        <div v-if="!cargandoLista && disponibles.length === 0 && !error" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p class="text-xs text-gray-500">No hay equipos disponibles en almacén ahora mismo.</p>
          <AppButton size="sm" variant="text" icon="ti ti-plus" label="Registrar un equipo" to="/equipos?nuevo=1" />
        </div>
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

    <template v-if="!entregado" #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="procesando" @click="modal?.cerrar()" />
      <AppButton
        :label="procesando ? 'Entregando...' : 'Entregar'"
        :loading="procesando"
        :disabled="!equipoSelId"
        @click="confirmar"
      />
    </template>
  </AppDialog>
</template>
