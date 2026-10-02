<script setup>
// "En custodia": UNA tabla que reúne las cuentas, los equipos y las licencias
// directas del empleado (antes tres paneles: CuentasPanel, Equipos, Licencias).
// TIPO · IDENTIFICADOR · DETALLE · DESDE · acciones (⋮).
//
// Conserva todas las acciones de los paneles anteriores, con sus permisos:
//   · cuenta   revelar/copiar contraseña (barra de 8 s), historial, editar,
//              traspasar (solo reutilizables), revocar o eliminar, abrir la URL
//   · equipo   hoja de vida, registrar devolución, acta de entrega
//   · licencia ver en Licencias, liberar asiento
// Cada fila existe SOLO si el usuario tiene el módulo de su tipo
// (`puedeCorreos/Equipos/Licencias`); los permisos no son estética.
//
// Las acciones sobre cuentas llaman a las RPC de la migración 101 a través del
// store (stores/cuentas.js); este componente no escribe nada por su cuenta
// salvo liberar una licencia. Al terminar cualquier cambio emite `cambio` para
// que el expediente refresque su libro.
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCuentasStore } from '../../stores/cuentas.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { useRevelados } from '../cuentas/useRevelados.js';
import CuentaForm from '../cuentas/CuentaForm.vue';
import TraspasarCuentaDialog from '../cuentas/TraspasarCuentaDialog.vue';
import HistorialCuentaDialog from '../cuentas/HistorialCuentaDialog.vue';
import CustodiaFilaCuenta from './CustodiaFilaCuenta.vue';
import CustodiaFilaEquipo from './CustodiaFilaEquipo.vue';
import CustodiaFilaLicencia from './CustodiaFilaLicencia.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  empleado: { type: Object, required: true },
  cuentas: { type: Array, default: () => [] },
  equipos: { type: Array, default: () => [] },
  licencias: { type: Array, default: () => [] },
  // asignacion_equipo_id → acta de entrega firmada
  actaPorAsignacion: { type: Object, default: () => ({}) },
  puedeCorreos: { type: Boolean, default: false },
  puedeEquipos: { type: Boolean, default: false },
  puedeLicencias: { type: Boolean, default: false },
  cargandoCuentas: { type: Boolean, default: false },
  errorCuentas: { type: String, default: '' },
});
const emit = defineEmits(['cambio', 'agregar']);

const router = useRouter();
const store = useCuentasStore();
const { revelarDe, puedeRevelar, motivoBloqueo } = useRevelados();

// Un Inactivo no recibe cuentas (el servidor lo rechaza); equipos solo a un
// Activo. Las acciones que el servidor rechazaría no se ofrecen.
const esActivo = computed(() => props.empleado.estado === 'Activo');
const esInactivo = computed(() => props.empleado.estado === 'Inactivo');

const total = computed(
  () => (props.puedeCorreos ? props.cuentas.length : 0)
    + (props.puedeEquipos ? props.equipos.length : 0)
    + (props.puedeLicencias ? props.licencias.length : 0),
);

// ── Estado de los diálogos ───────────────────────────────────────────────────
const mostrarForm = ref(false);
const cuentaEditar = ref(null);
const cuentaTraspaso = ref(null);
const cuentaHistorial = ref(null);
const porRevocar = ref(null);
const dialogoRevocar = ref(null);
const revocando = ref(false);
const porLiberar = ref(null);
const dialogoLiberar = ref(null);
const liberando = ref(false);

function abrirNuevaCuenta() {
  cuentaEditar.value = null;
  mostrarForm.value = true;
}
defineExpose({ abrirNuevaCuenta });

function onFormCerrado(guardado) {
  const fueEdicion = !!cuentaEditar.value;
  mostrarForm.value = false;
  cuentaEditar.value = null;
  if (guardado) {
    showToast(fueEdicion ? 'Cuenta actualizada' : 'Cuenta creada');
    emit('cambio');
  }
}

function onTraspasoCerrado(traspasada) {
  cuentaTraspaso.value = null;
  if (traspasada) emit('cambio');
}

// ── Revocar una cuenta ───────────────────────────────────────────────────────
// "Personal" no es un simple cierre: revocarCuentaPersonal también elimina la
// cuenta (hallazgo 2026-08-20). Título, mensaje y acción difieren a propósito
// para no repetir la confusión original ("Revocar" sonaba reversible).
const tituloRevocar = computed(() => {
  const t = porRevocar.value?.tipo_cuenta;
  if (t === 'personal') return 'Eliminar cuenta';
  return t === 'compartida' ? 'Revocar acceso' : 'Revocar cuenta';
});

const mensajeRevocar = computed(() => {
  const c = porRevocar.value;
  if (!c) return '';
  if (c.tipo_cuenta === 'personal') {
    return `¿Eliminar la cuenta de “${c.plataforma_nombre}”? Se cerrará la asignación y se eliminará la cuenta por completo: no se puede deshacer.`;
  }
  return c.tipo_cuenta === 'compartida'
    ? `¿Revocar el acceso de este empleado a “${c.plataforma_nombre}”? La cuenta seguirá existiendo para otros.`
    : `¿Revocar la cuenta de ${c.plataforma_nombre}? Se cerrará la asignación y quedará marcada “Rotar contraseña”.`;
});

async function confirmarRevocar() {
  const c = porRevocar.value;
  if (!c) return;
  revocando.value = true;
  try {
    if (c.tipo_cuenta === 'personal') {
      await store.revocarCuentaPersonal(c.asignacion_id);
      showToast('Cuenta eliminada');
    } else {
      await store.revocarAsignacion(c.asignacion_id);
      showToast('Asignación revocada');
    }
    dialogoRevocar.value?.cerrar();
    emit('cambio');
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'cuenta', porDefecto: 'No se pudo revocar la cuenta.' }).mensaje, 'error');
  } finally {
    revocando.value = false;
  }
}

// ── Liberar el asiento de una licencia ───────────────────────────────────────
async function confirmarLiberar() {
  const lic = porLiberar.value;
  if (!lic) return;
  liberando.value = true;
  try {
    await insforgeApi.cerrarAsignacionLicencia(lic.asignacion_id);
    showToast('Asiento liberado');
    dialogoLiberar.value?.cerrar();
    emit('cambio');
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudo liberar el asiento.' }).mensaje, 'error');
  } finally {
    liberando.value = false;
  }
}

// ── Acciones por fila (menú ⋮) ───────────────────────────────────────────────
function accionesCuenta(cuenta) {
  const etiquetaRevocar = cuenta.tipo_cuenta === 'personal'
    ? 'Eliminar'
    : (cuenta.tipo_cuenta === 'compartida' ? 'Revocar acceso' : 'Revocar');
  return [
    { icono: 'ti-history', label: 'Historial', onClick: () => { cuentaHistorial.value = cuenta; } },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => { cuentaEditar.value = cuenta; mostrarForm.value = true; } },
    // El servidor solo traspasa cuentas reutilizables (la personal se revoca y
    // se crea otra; la compartida no tiene un único titular).
    {
      icono: 'ti-transfer',
      label: 'Traspasar a otro empleado',
      visible: cuenta.tipo_cuenta === 'reutilizable',
      onClick: () => { cuentaTraspaso.value = cuenta; },
    },
    {
      icono: 'ti-external-link',
      label: 'Abrir la plataforma',
      visible: !!cuenta.url,
      onClick: () => window.open(cuenta.url, '_blank', 'noopener'),
    },
    { separador: true },
    { icono: 'ti-user-minus', label: etiquetaRevocar, danger: true, onClick: () => { porRevocar.value = cuenta; } },
  ];
}

function accionesEquipo(eq) {
  return [
    { icono: 'ti-file-description', label: 'Ver hoja de vida', onClick: () => router.push(`/equipos/${eq.equipo_id}`) },
    // La devolución se registra en la hoja de vida del equipo.
    { icono: 'ti-arrow-back-up', label: 'Registrar devolución', onClick: () => router.push(`/equipos/${eq.equipo_id}`) },
    {
      icono: 'ti-file-certificate',
      label: 'Acta de entrega',
      onClick: () => router.push(`/equipos/${eq.equipo_id}/acta/${eq.asignacion_id}?tipo=entrega`),
    },
  ];
}

function accionesLicencia(lic) {
  return [
    { icono: 'ti-license', label: 'Ver en Licencias', onClick: () => router.push({ path: '/licencias', query: { q: lic.software } }) },
    { separador: true },
    { icono: 'ti-user-minus', label: 'Liberar asiento', danger: true, onClick: () => { porLiberar.value = lic; } },
  ];
}

// Menú "Agregar" de la cabecera: solo lo que el módulo y el estado permiten.
const accionesAgregar = computed(() => [
  {
    icono: 'ti-key',
    label: 'Cuenta de correo',
    visible: props.puedeCorreos && !esInactivo.value,
    onClick: abrirNuevaCuenta,
  },
  { icono: 'ti-device-laptop', label: 'Equipo', visible: props.puedeEquipos && esActivo.value, onClick: () => emit('agregar', 'equipo') },
  { icono: 'ti-license', label: 'Licencia', visible: props.puedeLicencias && !esInactivo.value, onClick: () => emit('agregar', 'licencia') },
]);
const hayAgregar = computed(() => accionesAgregar.value.some((a) => a.visible));
</script>

<template>
  <AppSeccion titulo="En custodia" :conteo="total" sin-padding>
    <template v-if="hayAgregar" #acciones>
      <MenuAcciones data-no-print :acciones="accionesAgregar" label="Agregar a la custodia" texto="Agregar" icono="ti-plus" />
    </template>

    <p v-if="errorCuentas" class="border-b border-gray-100 px-4 py-2 text-sm text-red-700" role="alert">{{ errorCuentas }}</p>

    <div class="overflow-x-auto">
      <table class="w-full table-fixed border-collapse text-sm" aria-label="Cuentas, equipos y licencias en custodia">
        <colgroup>
          <col class="w-[76px] sm:w-[96px]">
          <col>
          <col class="hidden w-[30%] sm:table-column">
          <col class="hidden w-[84px] sm:table-column">
          <col class="w-[56px] sm:w-[80px]">
        </colgroup>
        <thead>
          <tr class="h-8 border-b border-gray-200">
            <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Tipo</th>
            <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Identificador</th>
            <th scope="col" class="hidden px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Detalle</th>
            <th scope="col" class="hidden px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Desde</th>
            <th scope="col" class="px-3 py-0 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500" data-no-print><span class="hidden sm:inline">Acciones</span><span class="sm:hidden">Más</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="cargandoCuentas && puedeCorreos && !cuentas.length" class="h-10 border-b border-gray-100">
            <td colspan="5" class="px-3 py-2 text-gray-500" role="status">— Cargando cuentas...</td>
          </tr>
          <tr v-else-if="!total" class="h-10 border-b border-gray-100" data-custodia-vacia>
            <td colspan="5" class="px-3 py-2 text-gray-500">
              — Sin cuentas, equipos ni licencias en custodia.
              <AppButton
                v-if="puedeCorreos && !esInactivo"
                data-no-print
                size="sm"
                variant="text"
                label="Agregar cuenta"
                @click="abrirNuevaCuenta"
              />
            </td>
          </tr>

          <template v-if="puedeCorreos">
            <CustodiaFilaCuenta
              v-for="cuenta in cuentas"
              :key="`cuenta-${cuenta.asignacion_id}`"
              :cuenta="cuenta"
              :revelado="revelarDe(cuenta)"
              :puede-revelar="puedeRevelar(cuenta)"
              :motivo-bloqueo="motivoBloqueo()"
              :acciones="accionesCuenta(cuenta)"
            />
          </template>
          <template v-if="puedeEquipos">
            <CustodiaFilaEquipo
              v-for="eq in equipos"
              :key="`equipo-${eq.asignacion_id}`"
              :equipo="eq"
              :acta="actaPorAsignacion[eq.asignacion_id] || null"
              :acciones="accionesEquipo(eq)"
            />
          </template>
          <template v-if="puedeLicencias">
            <CustodiaFilaLicencia
              v-for="lic in licencias"
              :key="`licencia-${lic.asignacion_id}`"
              :licencia="lic"
              :acciones="accionesLicencia(lic)"
            />
          </template>
        </tbody>
      </table>
    </div>
  </AppSeccion>

  <CuentaForm
    v-if="mostrarForm"
    :cuenta="cuentaEditar"
    :empleado-id="empleado.id"
    @cerrar="onFormCerrado"
  />

  <TraspasarCuentaDialog
    v-if="cuentaTraspaso"
    :cuenta="cuentaTraspaso"
    :empleado-id="empleado.id"
    @cerrado="onTraspasoCerrado"
  />

  <HistorialCuentaDialog
    v-if="cuentaHistorial"
    :cuenta="cuentaHistorial"
    @cerrado="cuentaHistorial = null"
  />

  <ConfirmDialog
    v-if="porRevocar"
    ref="dialogoRevocar"
    destructivo
    icono="ti-user-minus"
    :titulo="tituloRevocar"
    :mensaje="mensajeRevocar"
    :confirmar-label="porRevocar.tipo_cuenta === 'personal' ? 'Eliminar' : 'Revocar'"
    :cargando="revocando"
    @cerrado="porRevocar = null"
    @confirm="confirmarRevocar"
  />

  <ConfirmDialog
    v-if="porLiberar"
    ref="dialogoLiberar"
    destructivo
    icono="ti-user-minus"
    titulo="Liberar asiento"
    :mensaje="`¿Liberar el asiento de “${porLiberar.software}” de este empleado?`"
    confirmar-label="Liberar"
    :cargando="liberando"
    @cerrado="porLiberar = null"
    @confirm="confirmarLiberar"
  />
</template>
