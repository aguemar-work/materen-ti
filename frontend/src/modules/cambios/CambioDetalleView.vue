<script setup>
// Expediente de un cambio (versión "Expediente", reglas 14, 15, 19 y 20):
//
//   CAMBIO · CHG-0004                                       [Enviar a aprobación] [Más ▾]
//   Cambio del router principal   [Por aprobar]  /  [CERRADO 15/10/26]
//   SERVICIO … · TIPO … · RIESGO … · VENTANA … · REGISTRADO POR … · APROBACIÓN …
//   ───────────────────────────────────────────────────────────────────────────
//   Descripción · Plan de retroceso · Resultado · Tickets enlazados · Libro
//
// El cambio lo guarda el servidor (migración 107). Esta vista solo lo lee y
// ofrece las acciones que el servidor aceptaría para este tipo, este estado y este
// usuario (accionesDeCambio): enviar, aprobar (solo un jefe), ejecutar, implementar,
// cerrar, revertir, rechazar, cancelar. El sello va solo en estados terminales.
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCambiosStore } from '../../stores/cambios.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import {
  SELLO_CAMBIO, accionesDeCambio, armarLibroCambio, emergenciaSinAprobar, fechaCierreCambio,
  plazoAprobacion, rotuloResultado, textoAprobacion, textoVentana, tipoCambioInfo, riesgoCambioInfo, estadoCambioInfo,
} from '../../core/dominio-cambios.js';
import { formatFechaLibro } from '../../core/formatters.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCaratula from '../../components/ui/AppCaratula.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppSello from '../../components/ui/AppSello.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppLibro from '../../components/ui/AppLibro.vue';
import CambioForm from './CambioForm.vue';
import CambioNotaDialog from './CambioNotaDialog.vue';
import CambioTickets from './CambioTickets.vue';

const route = useRoute();
const router = useRouter();
const store = useCambiosStore();
const auth = useAuthStore();

const cambio = computed(() => store.detalle);
const nombresStaff = ref({});
const ocupado = ref('');
const dialogo = ref(null); // { accion }
const editando = ref(false);

const puedeTickets = computed(() => auth.puedeVerModulo('tickets'));
const acciones = computed(() => accionesDeCambio(cambio.value, { esJefe: auth.esJefe, puedeTickets: puedeTickets.value }));
const primaria = computed(() => acciones.value.find((a) => a.primaria) || null);
const libro = computed(() => armarLibroCambio(store.eventos, { nombresStaff: nombresStaff.value }));
const sello = computed(() => SELLO_CAMBIO[cambio.value?.estado] || null);
const plazo = computed(() => (emergenciaSinAprobar(cambio.value) ? plazoAprobacion(cambio.value) : null));

const datos = computed(() => {
  const c = cambio.value;
  return [
    { rotulo: 'Servicio', valor: c.servicio_nombre },
    { rotulo: 'Tipo', valor: tipoCambioInfo(c.tipo).label },
    { rotulo: 'Riesgo', valor: riesgoCambioInfo(c.riesgo).label },
    { rotulo: 'Ventana', valor: c.ventana_inicio ? textoVentana(c) : '' },
    { rotulo: 'Registrado por', valor: nombresStaff.value[c.solicitado_por] || '' },
    { rotulo: 'Aprobación', valor: textoAprobacion(c, nombresStaff.value) },
  ];
});

const menu = computed(() => [
  ...acciones.value
    .filter((a) => a !== primaria.value)
    .map((a) => ({ icono: a.icono, label: a.label, danger: a.peligro, onClick: () => ejecutar(a) })),
  { icono: 'ti-pencil', label: 'Editar borrador', visible: puedeTickets.value && cambio.value?.estado === 'borrador', onClick: () => { editando.value = true; } },
  { icono: 'ti-printer', label: 'Imprimir cambio', onClick: () => window.print() },
]);

async function cargar(id) {
  if (!id) return;
  const encontrado = await store.cargarDetalle(id);
  if (!encontrado && !store.errorDetalle) {
    showToast('Cambio no encontrado', 'error');
    router.replace('/cambios');
  }
}

// Las acciones sin nota se ejecutan al instante; las que piden nota abren el diálogo.
async function ejecutar(accion) {
  if (accion.nota) {
    dialogo.value = { accion };
    return;
  }
  ocupado.value = accion.id;
  try {
    await store.transicionar(cambio.value.id, accion.destino);
    showToast(`${cambio.value.codigo} pasó a «${estadoCambioInfo(store.detalle?.estado).label}»`);
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'cambio', porDefecto: 'No se pudo completar la operación.' }).mensaje, 'error');
  } finally {
    ocupado.value = '';
  }
}

function onEditado(fila) {
  editando.value = false;
  if (fila) {
    showToast('Cambio actualizado');
    cargar(cambio.value.id);
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
    <p v-if="store.cargandoDetalle && !cambio" class="px-4 py-16 text-center text-sm text-gray-500 sm:px-6" role="status">Cargando cambio...</p>

    <p v-else-if="store.errorDetalle" class="px-4 py-16 text-center text-sm text-red-700 sm:px-6" role="alert">{{ store.errorDetalle }}</p>

    <p v-else-if="!cambio" class="px-4 py-16 text-center text-sm text-gray-500 sm:px-6">No se encontró el cambio.</p>

    <template v-else>
      <AppCaratula :titulo="cambio.titulo" :datos="datos">
        <template #rotulo>
          CAMBIO · <AppCodigo :valor="cambio.codigo" titulo="Número de cambio" />
        </template>

        <template #sello>
          <AppSello v-if="sello" :tono="sello.tono">{{ sello.texto }} {{ fechaCierreCambio(cambio) }}</AppSello>
          <BadgeEstado v-else tipo="cambio" :valor="cambio.estado" />
        </template>

        <template #acciones>
          <AppButton
            v-if="primaria"
            :icon="`ti ${primaria.icono}`"
            :label="primaria.label"
            :loading="ocupado === primaria.id"
            :disabled="!!ocupado"
            @click="ejecutar(primaria)"
          />
          <MenuAcciones :acciones="menu" label="Más acciones del cambio" texto="Más" icono="ti-chevron-down" />
        </template>
      </AppCaratula>

      <div class="space-y-6 px-4 pt-6 sm:px-6">
        <!-- Emergencia ejecutada sin aprobación: el plazo corre -->
        <div
          v-if="plazo"
          class="notif"
          :class="plazo.vencida ? 'notif--danger' : 'notif--warning'"
          :role="plazo.vencida ? 'alert' : 'status'"
          data-plazo-aprobacion
        >
          <i class="ti ti-alert-triangle" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__titulo">Emergencia sin aprobación de un jefe</p>
            <p class="notif__detalle">
              Se ejecutó sin esperar aprobación. {{ plazo.texto }}
              (límite {{ formatFechaLibro(cambio.aprobacion_pendiente_hasta).fecha }} {{ formatFechaLibro(cambio.aprobacion_pendiente_hasta).hora }}).
              No se podrá cerrar hasta que un jefe la apruebe.
            </p>
          </div>
        </div>

        <AppSeccion titulo="Descripción">
          <p class="whitespace-pre-line text-sm text-gray-900 [overflow-wrap:anywhere]">{{ cambio.descripcion }}</p>
        </AppSeccion>

        <AppSeccion titulo="Plan de retroceso">
          <p v-if="cambio.plan_retroceso" class="whitespace-pre-line text-sm text-gray-900 [overflow-wrap:anywhere]">{{ cambio.plan_retroceso }}</p>
          <p v-else-if="cambio.tipo === 'estandar'" class="text-sm text-gray-500">No requiere: es un cambio estándar.</p>
          <p v-else class="text-sm text-gray-500">Sin registrar (se pide antes de enviarlo a aprobación).</p>
        </AppSeccion>

        <AppSeccion v-if="cambio.resultado" :titulo="rotuloResultado(cambio.estado)">
          <p class="whitespace-pre-line text-sm text-gray-900 [overflow-wrap:anywhere]">{{ cambio.resultado }}</p>
        </AppSeccion>

        <CambioTickets :cambio="cambio" :tickets="store.tickets" :puede-enlazar="puedeTickets" />

        <AppSeccion titulo="Libro de movimientos" :conteo="libro.length" sin-padding>
          <div class="overflow-x-auto">
            <AppLibro :filas="libro" etiqueta="Libro de movimientos del cambio" vacio="Sin movimientos registrados" />
          </div>
        </AppSeccion>
      </div>
    </template>

    <CambioNotaDialog
      v-if="dialogo && cambio"
      :accion="dialogo.accion"
      :cambio="cambio"
      @cerrar="dialogo = null"
    />
    <CambioForm v-if="editando && cambio" :cambio="cambio" @cerrar="onEditado" />
  </div>
</template>
