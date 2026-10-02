<script setup>
// Expediente de una solicitud (versión "Expediente", reglas 14, 15, 19 y 20):
//
//   SOLICITUD · SOL-0012 · ALTA DE EMPLEADO                               [Más ▾]
//   Alta de empleado   [Abierta]  /  [COMPLETADA 15/10/26]
//   PERSONA Rosa Quispe · ORIGEN Pedido de RRHH por correo · ABIERTA … · AVANCE 3 de 7
//   ───────────────────────────────────────────────────────────────────────────
//   Pasos  (cada uno con su acción y el enlace al módulo donde se hace)
//   Libro de movimientos
//
// El trámite lo guarda el servidor (migración 108). Esta vista solo lo lee y
// ofrece las acciones que el servidor aceptaría: marcar un paso, omitirlo
// (motivo), cancelar. Los pasos que se hacen en otro módulo se marcan solos al
// usar ese módulo; al volver aquí (o al recargar) ya están hechos.
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useSolicitudesStore } from '../../stores/solicitudes.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatFechaLibro } from '../../core/formatters.js';
import {
  tipoSolicitudInfo, origenSolicitudInfo, avanceSolicitud, textoAvance, armarLibroSolicitud,
} from '../../core/dominio-solicitudes.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppCaratula from '../../components/ui/AppCaratula.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppSello from '../../components/ui/AppSello.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppLibro from '../../components/ui/AppLibro.vue';
import SolicitudPasos from './SolicitudPasos.vue';
import SolicitudMotivoDialog from './SolicitudMotivoDialog.vue';

const route = useRoute();
const router = useRouter();
const store = useSolicitudesStore();
const auth = useAuthStore();

const solicitud = computed(() => store.detalle);
const nombresStaff = ref({});
const ocupado = ref('');
const dialogo = ref(null); // { accion: 'omitir' | 'cancelar', paso? }

const info = computed(() => tipoSolicitudInfo(solicitud.value?.tipo_id));
const abierta = computed(() => solicitud.value?.estado === 'abierta');
const avance = computed(() => avanceSolicitud(solicitud.value?.pasos));
const libro = computed(() => armarLibroSolicitud(solicitud.value, { nombresStaff: nombresStaff.value }));

// Fecha del sello: completada o cancelada.
const fechaCierre = computed(() => {
  const s = solicitud.value;
  const iso = s?.completada_at || s?.cancelada_at;
  return iso ? formatFechaLibro(iso).fecha : '';
});

const datos = computed(() => {
  const s = solicitud.value;
  return [
    { rotulo: 'Persona', valor: s.empleado_nombre },
    { rotulo: 'Origen', valor: origenSolicitudInfo(s.origen) },
    { rotulo: 'Abierta', valor: formatFecha(s.created_at) },
    { rotulo: 'Avance', valor: textoAvance(avance.value) },
    ...(s.ticket ? [{ rotulo: 'Ticket', valor: s.ticket.codigo }] : []),
  ];
});

const acciones = computed(() => [
  { icono: 'ti-printer', label: 'Imprimir solicitud', onClick: () => window.print() },
  { icono: 'ti-ban', label: 'Cancelar solicitud', danger: true, visible: abierta.value, onClick: () => { dialogo.value = { accion: 'cancelar' }; } },
]);

async function cargar(id) {
  if (!id) return;
  const encontrada = await store.cargarDetalle(id);
  if (!encontrada && !store.errorDetalle) {
    showToast('Solicitud no encontrada', 'error');
    router.replace('/solicitudes');
  }
}

// «Marcar hecho»: sin diálogo; el servidor valida y, si era el último paso,
// completa la solicitud.
async function completar(paso) {
  ocupado.value = paso.id;
  try {
    await store.completarPaso(solicitud.value.id, paso.id);
    if (store.detalle?.estado === 'completada') showToast(`Solicitud ${store.detalle.codigo} completada`);
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'solicitud', porDefecto: 'No se pudo marcar el paso.' }).mensaje, 'error');
  } finally {
    ocupado.value = '';
  }
}

watch(() => route.params.id, cargar, { immediate: true });

// Los nombres del staff son del libro: una falla no tumba la pantalla.
insforgeApi.nombresStaff()
  .then((lista) => { nombresStaff.value = Object.fromEntries(lista.map((s) => [s.user_id, s.nombre])); })
  .catch(() => {});

onBeforeUnmount(() => store.limpiarDetalle());
</script>

<template>
  <div class="w-full pb-10">
    <p v-if="store.cargandoDetalle && !solicitud" class="px-4 py-16 text-center text-sm text-gray-500 sm:px-6" role="status">Cargando solicitud...</p>

    <p v-else-if="store.errorDetalle" class="px-4 py-16 text-center text-sm text-red-700 sm:px-6" role="alert">{{ store.errorDetalle }}</p>

    <p v-else-if="!solicitud" class="px-4 py-16 text-center text-sm text-gray-500 sm:px-6">No se encontró la solicitud.</p>

    <template v-else>
      <AppCaratula :titulo="info.label" :datos="datos">
        <template #rotulo>
          SOLICITUD · <AppCodigo :valor="solicitud.codigo" titulo="Número de solicitud" />
        </template>

        <template #sello>
          <AppSello v-if="solicitud.estado === 'completada'" tono="ok">COMPLETADA {{ fechaCierre }}</AppSello>
          <AppSello v-else-if="solicitud.estado === 'cancelada'" tono="neutro">CANCELADA {{ fechaCierre }}</AppSello>
          <BadgeEstado v-else tipo="solicitud" :valor="solicitud.estado" />
        </template>

        <template #valor-0>
          <RouterLink
            :to="`/empleados/${solicitud.empleado_id}`"
            class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >{{ solicitud.empleado_nombre }}</RouterLink>
        </template>

        <template v-if="solicitud.ticket" #valor-4>
          <RouterLink
            :to="`/tickets/${solicitud.ticket.id}`"
            class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          ><AppCodigo :valor="solicitud.ticket.codigo" titulo="Número de ticket" /></RouterLink>
        </template>

        <template #acciones>
          <MenuAcciones :acciones="acciones" label="Más acciones de la solicitud" texto="Más" icono="ti-chevron-down" />
        </template>
      </AppCaratula>

      <div class="space-y-6 px-4 pt-6 sm:px-6">
        <AppSeccion v-if="solicitud.nota || solicitud.motivo_cancelacion" titulo="Pedido">
          <p v-if="solicitud.nota" class="whitespace-pre-line text-sm text-gray-900 [overflow-wrap:anywhere]">{{ solicitud.nota }}</p>
          <p v-if="solicitud.motivo_cancelacion" class="text-sm text-gray-700 [overflow-wrap:anywhere]" :class="solicitud.nota ? 'mt-2' : ''">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Motivo de la cancelación</span><br>
            {{ solicitud.motivo_cancelacion }}
          </p>
        </AppSeccion>

        <SolicitudPasos
          :solicitud="solicitud"
          :objetivos="store.objetivos"
          :nombres-staff="nombresStaff"
          :puede-modulo="(m) => auth.puedeVerModulo(m)"
          :es-jefe="auth.esJefe"
          :ocupado="ocupado"
          @completar="completar"
          @omitir="(paso) => { dialogo = { accion: 'omitir', paso }; }"
        />

        <AppSeccion titulo="Libro de movimientos" :conteo="libro.length" sin-padding>
          <div class="overflow-x-auto">
            <AppLibro :filas="libro" etiqueta="Libro de movimientos de la solicitud" vacio="Sin movimientos registrados" />
          </div>
        </AppSeccion>
      </div>
    </template>

    <SolicitudMotivoDialog
      v-if="dialogo && solicitud"
      :accion="dialogo.accion"
      :solicitud="solicitud"
      :paso="dialogo.paso || null"
      @cerrar="dialogo = null"
    />
  </div>
</template>
