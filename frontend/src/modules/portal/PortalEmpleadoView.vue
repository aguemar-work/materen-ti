<script setup>
// Página PÚBLICA (sin sesión): portal del empleado por enlace personal
// (/mi/:token, migración 109). Es una identidad ligera: quien abre el enlace es
// «ese empleado» y ve SOLO lo que el alcance del enlace permite (equipos, cuentas
// sin contraseña, tickets activos) y, si se permite, confirma la recepción de un
// equipo. Un enlace inexistente, vencido o revocado se ve igual (sin oráculo).
//
// El token nunca se muestra ni se guarda: vive en la URL y viaja en el cuerpo de
// las peticiones a la edge function `portal`.
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { abrirPortal, confirmarEquipoPortal, MENSAJES_ERROR_PORTAL } from '../../api/portalEmpleado.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { fechaLocal } from '../../core/dominio-portal.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';
import PortalEquipos from './PortalEquipos.vue';
import PortalAccesos from './PortalAccesos.vue';
import PortalTickets from './PortalTickets.vue';

const route = useRoute();
const token = String(route.params.token || '');

// estado: 'cargando' | 'listo' | 'invalido' | 'error'
const estado = ref('cargando');
const error = ref('');
const datos = ref(null);
const confirmandoId = ref('');
const errorConfirmar = ref('');

async function cargar() {
  estado.value = 'cargando';
  error.value = '';
  try {
    datos.value = await abrirPortal(token);
    estado.value = 'listo';
  } catch (e) {
    if (e?.code === 'no_existe') {
      estado.value = 'invalido';
      return;
    }
    error.value = traducirErrorDb(e, { porDefecto: MENSAJES_ERROR_PORTAL.error_interno }).mensaje;
    estado.value = 'error';
  }
}

async function confirmar(asignacionId) {
  if (confirmandoId.value) return;
  errorConfirmar.value = '';
  confirmandoId.value = asignacionId;
  try {
    const r = await confirmarEquipoPortal(token, asignacionId);
    const equipo = datos.value.equipos.find((e) => e.asignacion_id === asignacionId);
    if (equipo) equipo.confirmado_at = r.confirmadoAt || new Date().toISOString();
  } catch (e) {
    if (e?.code === 'no_existe') estado.value = 'invalido';
    else errorConfirmar.value = traducirErrorDb(e, { porDefecto: MENSAJES_ERROR_PORTAL.error_interno }).mensaje;
  } finally {
    confirmandoId.value = '';
  }
}

onMounted(cargar);

const tiene = (alcance) => !!datos.value?.alcance?.includes(alcance);
const vence = computed(() => fechaLocal(datos.value?.vence));

const encabezado = computed(() => {
  if (estado.value === 'cargando') return { titulo: 'Portal del empleado', icono: '', tono: 'neutral', descripcion: '' };
  if (estado.value === 'invalido') {
    return { titulo: 'Enlace no disponible', icono: 'ti ti-link-off', tono: 'neutral', descripcion: '' };
  }
  if (estado.value === 'error') {
    return { titulo: 'No se pudo abrir el portal', icono: 'ti ti-plug-connected-x', tono: 'neutral', descripcion: '' };
  }
  return {
    titulo: datos.value.nombre,
    icono: '',
    tono: 'neutral',
    descripcion: `Este enlace es personal: no lo comparta.${vence.value ? ` Vence el ${vence.value}.` : ''}`,
  };
});
</script>

<template>
  <AppPortal
    seccion="Portal del empleado"
    :titulo="encabezado.titulo"
    :descripcion="encabezado.descripcion"
    :icono="encabezado.icono"
    :tono="encabezado.tono"
  >
    <p v-if="estado === 'cargando'" class="py-4 text-center text-sm text-gray-500" role="status">Abriendo su portal...</p>

    <template v-else-if="estado === 'invalido'">
      <p class="text-center text-sm text-gray-600">{{ MENSAJES_ERROR_PORTAL.no_existe }}</p>
      <AppButton
        class="mt-6"
        size="lg"
        block
        icon="ti ti-ticket"
        label="Crear ticket de soporte"
        :to="{ name: 'ticket-nuevo' }"
      />
    </template>

    <template v-else-if="estado === 'error'">
      <p class="text-center text-sm text-gray-600">{{ error }}</p>
      <AppButton class="mt-6" size="lg" block icon="ti ti-refresh" label="Intentar de nuevo" @click="cargar" />
    </template>

    <div v-else class="flex flex-col gap-8">
      <PortalEquipos
        v-if="tiene('ver_equipos')"
        :equipos="datos.equipos || []"
        :puede-confirmar="tiene('confirmar_equipo')"
        :confirmando-id="confirmandoId"
        :error="errorConfirmar"
        @confirmar="confirmar"
      />
      <PortalAccesos v-if="tiene('ver_accesos')" :accesos="datos.accesos || []" />
      <PortalTickets v-if="tiene('ver_tickets')" :tickets="datos.tickets || []" />
      <p
        v-if="!tiene('ver_equipos') && !tiene('ver_accesos') && !tiene('ver_tickets')"
        class="text-center text-sm text-gray-500"
      >
        Este enlace no muestra información. Solicite uno nuevo a TI.
      </p>
    </div>
  </AppPortal>
</template>
