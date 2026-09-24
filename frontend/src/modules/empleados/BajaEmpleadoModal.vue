<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import Modal from '../../components/shared/Modal.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const props = defineProps({
  empleado: { type: Object, required: true },
});

const emit = defineEmits(['cerrar']);

const modal = ref(null);
let resultado = false;

const store = useEmpleadosStore();

const cuentas = ref([]);
const licencias = ref([]);
const equipos = ref([]);
const cargando = ref(true);
const error = ref('');
const infoError = infoNotificacion('error');

const nombreCompleto = computed(() => nombreCompletoDe(props.empleado));

const personales = computed(() => cuentas.value.filter((c) => c.tipo_cuenta === 'personal'));
const reutilizables = computed(() => cuentas.value.filter((c) => c.tipo_cuenta === 'reutilizable'));
const compartidas = computed(() => cuentas.value.filter((c) => c.tipo_cuenta === 'compartida'));

const sinAccesos = computed(
  () => cuentas.value.length === 0 && licencias.value.length === 0 && equipos.value.length === 0
);

onMounted(async () => {
  try {
    const resumen = await insforgeApi.resumenBaja(props.empleado.id);
    cuentas.value = resumen.cuentas;
    licencias.value = resumen.licencias;
    equipos.value = resumen.equipos;
  } catch (e) {
    error.value = e?.message || 'Error al cargar los accesos del empleado';
  } finally {
    cargando.value = false;
  }
});

// Checklist progresivo de confirmación (Plan Maestro v2, Frente 3): el RPC
// `dar_baja_empleado()` sigue siendo una sola transacción atómica de
// servidor — no hay progreso real por paso que reportar. Esta secuencia es
// puramente de presentación (retardo fijo de 300ms por ítem) para que la
// confirmación se sienta tan seria como la operación que dispara; el
// checklist recién marca el ÚLTIMO paso como completo cuando el RPC real
// también resolvió (`Promise.all` más abajo), así que nunca miente sobre si
// la baja ya ocurrió en el servidor.
const fase = ref('resumen'); // 'resumen' | 'confirmando'
const pasoActivo = ref(-1);
let temporizadores = [];

function limpiarTemporizadores() {
  temporizadores.forEach(clearTimeout);
  temporizadores = [];
}
onUnmounted(limpiarTemporizadores);

// Equipos no forma parte del RPC (la baja de empleado nunca cierra
// asignaciones de equipos, ver docs/PANORAMA-SISTEMA.md §2) — se muestra
// como último ítem "pendiente", no "hecho", porque el sistema no hizo nada
// con ellos: sigue quedando una devolución física por registrar a mano.
const pasosConfirmacion = computed(() => {
  const pasos = [];
  if (personales.value.length) {
    pasos.push({ id: 'personales', label: `Dando de baja ${personales.value.length} cuenta(s) personal(es)`, estado: 'exito' });
  }
  if (reutilizables.value.length || compartidas.value.length) {
    const n = reutilizables.value.length + compartidas.value.length;
    pasos.push({ id: 'rotacion', label: `Liberando ${n} cuenta(s) — marcando rotación de contraseña pendiente`, estado: 'exito' });
  }
  if (licencias.value.length) {
    pasos.push({ id: 'licencias', label: `Liberando ${licencias.value.length} asiento(s) de licencia`, estado: 'exito' });
  }
  pasos.push({ id: 'estado', label: 'Marcando al empleado como Inactivo', estado: 'exito' });
  if (equipos.value.length) {
    pasos.push({ id: 'equipos', label: `${equipos.value.length} equipo(s) quedan pendientes de devolución`, estado: 'pendiente' });
  }
  return pasos;
});

async function confirmarBaja() {
  error.value = '';
  fase.value = 'confirmando';
  pasoActivo.value = -1;

  const pasos = pasosConfirmacion.value;
  const avance = new Promise((resolve) => {
    let i = 0;
    function siguiente() {
      if (i >= pasos.length) { resolve(); return; }
      pasoActivo.value = i;
      temporizadores.push(setTimeout(() => { i += 1; siguiente(); }, 300));
    }
    siguiente();
  });

  try {
    await Promise.all([store.darDeBaja(props.empleado.id), avance]);
    pasoActivo.value = pasos.length;
    showToast(`${nombreCompleto.value} dado de baja`);
    resultado = true;
    temporizadores.push(setTimeout(() => modal.value?.cerrar(), 450));
  } catch (e) {
    limpiarTemporizadores();
    error.value = e?.message || 'Error al dar de baja';
    fase.value = 'resumen';
  }
}
</script>

<template>
  <Modal
    ref="modal"
    size="md"
    :mostrar-cerrar="fase !== 'confirmando'"
    :cerrar-en-backdrop="fase !== 'confirmando'"
    :confirmar-cierre="() => fase !== 'confirmando'"
    @close="emit('cerrar', resultado)"
  >
    <template #titulo>
      <span class="flex min-w-0 items-center gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-lg text-red-600">
          <i class="ti ti-user-off" aria-hidden="true"></i>
        </span>
        <span class="min-w-0">
          <span class="block truncate">Dar de baja a {{ nombreCompleto }}</span>
          <span class="block text-xs font-normal text-gray-500">Revise las consecuencias antes de confirmar</span>
        </span>
      </span>
    </template>

    <p v-if="cargando" class="py-8 text-center text-sm text-gray-500" role="status">Cargando resumen de accesos...</p>

    <!-- ══ Fase 2: procesando (checklist progresivo) ══════════════ -->
    <div v-else-if="fase === 'confirmando'" role="status" aria-live="polite">
      <p class="mb-3 text-sm text-gray-600">Procesando la baja de {{ nombreCompleto }}:</p>
      <ol class="space-y-2">
        <li
          v-for="(paso, idx) in pasosConfirmacion"
          :key="paso.id"
          class="flex items-center gap-2.5 text-sm"
        >
          <i
            v-if="idx < pasoActivo && paso.estado === 'exito'"
            class="ti ti-circle-check text-lg text-green-600"
            aria-hidden="true"
          ></i>
          <i
            v-else-if="idx < pasoActivo"
            class="ti ti-clock text-lg text-amber-600"
            aria-hidden="true"
          ></i>
          <i
            v-else-if="idx === pasoActivo"
            class="ti ti-loader-2 animate-spin text-lg text-primary-600"
            aria-hidden="true"
          ></i>
          <i v-else class="ti ti-circle-dashed text-lg text-gray-300" aria-hidden="true"></i>
          <span :class="idx > pasoActivo ? 'text-gray-400' : 'text-gray-900'">{{ paso.label }}</span>
        </li>
      </ol>
    </div>

    <!-- ══ Fase 1: resumen de consecuencias ═══════════════════════ -->
    <div v-else class="space-y-5">
      <!-- Lo que hace el sistema al confirmar -->
      <section aria-labelledby="baja-automatico">
        <h3 id="baja-automatico" class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Al confirmar, el sistema</h3>
        <ul class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
          <li v-if="personales.length" class="flex gap-3 px-3 py-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-50 text-base text-red-600">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900">
                Elimina {{ personales.length }} {{ personales.length === 1 ? 'cuenta personal' : 'cuentas personales' }}
              </p>
              <ul class="mt-1 space-y-0.5 text-xs text-gray-500">
                <li v-for="c in personales" :key="c.asignacion_id" class="truncate">
                  <span class="text-gray-700">{{ c.usuario }}</span> · {{ c.plataforma }}
                </li>
              </ul>
            </div>
          </li>

          <li v-if="reutilizables.length" class="flex gap-3 px-3 py-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-base text-gray-500">
              <i class="ti ti-transfer" aria-hidden="true"></i>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900">
                Libera {{ reutilizables.length }} {{ reutilizables.length === 1 ? 'cuenta reutilizable' : 'cuentas reutilizables' }}
                <span class="font-normal text-gray-500">— quedan disponibles para otro empleado</span>
              </p>
              <ul class="mt-1 space-y-0.5 text-xs text-gray-500">
                <li v-for="c in reutilizables" :key="c.asignacion_id" class="truncate">
                  <span class="text-gray-700">{{ c.usuario }}</span> · {{ c.plataforma }}
                </li>
              </ul>
            </div>
          </li>

          <li v-if="compartidas.length" class="flex gap-3 px-3 py-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-base text-gray-500">
              <i class="ti ti-users" aria-hidden="true"></i>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900">
                Le quita el acceso a {{ compartidas.length }} {{ compartidas.length === 1 ? 'cuenta compartida' : 'cuentas compartidas' }}
                <span class="font-normal text-gray-500">— los demás usuarios continúan</span>
              </p>
              <ul class="mt-1 space-y-0.5 text-xs text-gray-500">
                <li v-for="c in compartidas" :key="c.asignacion_id" class="truncate">
                  <span class="text-gray-700">{{ c.usuario }}</span> · {{ c.plataforma }}
                </li>
              </ul>
            </div>
          </li>

          <li v-if="licencias.length" class="flex gap-3 px-3 py-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-base text-gray-500">
              <i class="ti ti-license" aria-hidden="true"></i>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900">
                Libera {{ licencias.length }} {{ licencias.length === 1 ? 'asiento de licencia' : 'asientos de licencia' }}
              </p>
              <p class="mt-1 truncate text-xs text-gray-500">{{ licencias.map((l) => l.software).join(', ') }}</p>
            </div>
          </li>

          <li class="flex gap-3 px-3 py-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-base text-gray-500">
              <i class="ti ti-user-off" aria-hidden="true"></i>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900">Marca al empleado como Inactivo</p>
              <p v-if="sinAccesos" class="mt-1 text-xs text-gray-500">No tiene cuentas, licencias ni equipos asignados actualmente.</p>
            </div>
          </li>
        </ul>
      </section>

      <!-- Lo que queda a cargo de TI -->
      <section v-if="reutilizables.length || compartidas.length || equipos.length" aria-labelledby="baja-pendiente">
        <h3 id="baja-pendiente" class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Queda pendiente para TI</h3>
        <ul class="space-y-2">
          <li v-if="reutilizables.length || compartidas.length" class="notif notif--warning">
            <i class="ti ti-key" aria-hidden="true"></i>
            <div class="notif__texto">
              <p class="notif__titulo">Rotar contraseñas</p>
              <p class="notif__detalle">
                Las cuentas reutilizables y compartidas quedarán marcadas “Rotar contraseña”: el empleado conoce las claves actuales. Cámbielas cuanto antes.
              </p>
            </div>
          </li>
          <li v-if="equipos.length" class="notif notif--warning">
            <i class="ti ti-devices" aria-hidden="true"></i>
            <div class="notif__texto">
              <p class="notif__titulo">
                Recuperar {{ equipos.length }} {{ equipos.length === 1 ? 'equipo' : 'equipos' }}
              </p>
              <ul class="my-1 space-y-0.5">
                <li v-for="eq in equipos" :key="eq.asignacion_id" class="truncate">
                  <span class="font-medium tabular-nums">{{ eq.codigo }}</span> · {{ [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ') }}
                </li>
              </ul>
              <p class="notif__detalle">
                La baja no los marca como devueltos: recupérelos físicamente y registre la devolución en el módulo Equipos. Mientras tanto aparecerán como “Sin devolver” en el Dashboard.
              </p>
            </div>
          </li>
        </ul>
      </section>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </div>

    <template v-if="fase !== 'confirmando'" #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" @click="modal?.cerrar()" />
      <AppButton severity="danger" icon="ti ti-user-off" label="Confirmar baja" :disabled="cargando" @click="confirmarBaja" />
    </template>
  </Modal>
</template>
