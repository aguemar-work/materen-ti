<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import Modal from '../../components/shared/Modal.vue';
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
    size="sm"
    :mostrar-cerrar="fase !== 'confirmando'"
    :cerrar-en-backdrop="fase !== 'confirmando'"
    :confirmar-cierre="() => fase !== 'confirmando'"
    @close="emit('cerrar', resultado)"
  >
    <template #titulo>
      <span class="baja-title-con-icono">
        <span class="icon-box icon-box--danger"><i class="ti ti-user-off" aria-hidden="true"></i></span>
        Dar de baja a {{ nombreCompleto }}
      </span>
    </template>

    <div class="baja-body">
      <div v-if="cargando" class="baja-cargando">Cargando resumen de accesos...</div>

      <template v-else-if="fase === 'confirmando'">
        <p class="baja-intro">Procesando la baja de {{ nombreCompleto }}:</p>
        <ul class="baja-checklist">
          <li
            v-for="(paso, idx) in pasosConfirmacion"
            :key="paso.id"
            class="checklist-item"
          >
            <i
              v-if="idx < pasoActivo && paso.estado === 'exito'"
              class="ti ti-circle-check checklist-icono checklist-icono--exito"
              aria-hidden="true"
            ></i>
            <i
              v-else-if="idx < pasoActivo"
              class="ti ti-clock checklist-icono checklist-icono--pendiente"
              aria-hidden="true"
            ></i>
            <i
              v-else-if="idx === pasoActivo"
              class="ti ti-loader-2 checklist-icono checklist-icono--activo spinner-icon"
              aria-hidden="true"
            ></i>
            <i v-else class="ti ti-circle-dashed checklist-icono checklist-icono--espera" aria-hidden="true"></i>
            <span :class="{ 'checklist-texto--espera': idx > pasoActivo }">{{ paso.label }}</span>
          </li>
        </ul>
      </template>

      <template v-else>
        <p class="baja-intro">
          Esto es lo que pasará con sus accesos. Revise antes de confirmar:
        </p>

        <div v-if="sinAccesos" class="baja-sin-cuentas">
          <i class="ti ti-info-circle"></i>
          No tiene cuentas, licencias ni equipos asignados actualmente.
        </div>

        <div v-if="personales.length" class="baja-grupo">
          <div class="grupo-header grupo-header--danger">
            <i class="ti ti-user"></i>
            Cuentas personales — se darán de baja
          </div>
          <ul>
            <li v-for="c in personales" :key="c.asignacion_id">
              <span class="cuenta-usuario">{{ c.usuario }}</span>
              <span class="cuenta-plataforma">{{ c.plataforma }}</span>
            </li>
          </ul>
        </div>

        <div v-if="reutilizables.length" class="baja-grupo">
          <div class="grupo-header grupo-header--ok">
            <i class="ti ti-transfer"></i>
            Reutilizables — quedarán disponibles para otro empleado
          </div>
          <ul>
            <li v-for="c in reutilizables" :key="c.asignacion_id">
              <span class="cuenta-usuario">{{ c.usuario }}</span>
              <span class="cuenta-plataforma">{{ c.plataforma }}</span>
            </li>
          </ul>
        </div>

        <div v-if="compartidas.length" class="baja-grupo">
          <div class="grupo-header grupo-header--info">
            <i class="ti ti-users"></i>
            Compartidas — se le quitará el acceso (los demás usuarios continúan)
          </div>
          <ul>
            <li v-for="c in compartidas" :key="c.asignacion_id">
              <span class="cuenta-usuario">{{ c.usuario }}</span>
              <span class="cuenta-plataforma">{{ c.plataforma }}</span>
            </li>
          </ul>
        </div>

        <div v-if="licencias.length" class="baja-grupo">
          <div class="grupo-header grupo-header--ok">
            <i class="ti ti-license"></i>
            Licencias — el asiento quedará libre
          </div>
          <ul>
            <li v-for="l in licencias" :key="l.asignacion_id">
              <span class="cuenta-usuario">{{ l.software }}</span>
            </li>
          </ul>
        </div>

        <div v-if="reutilizables.length || compartidas.length" class="baja-aviso-rotacion">
          <i class="ti ti-alert-triangle"></i>
          <span>
            Estas cuentas quedarán marcadas <strong>"Rotar contraseña"</strong>:
            el empleado conoce las claves actuales. Cámbielas cuanto antes.
          </span>
        </div>

        <!-- Equipos: NO se cierran con la baja — devolución física pendiente -->
        <div v-if="equipos.length" class="baja-grupo">
          <div class="grupo-header grupo-header--danger">
            <i class="ti ti-devices"></i>
            Equipos — quedan PENDIENTES DE DEVOLUCIÓN
          </div>
          <ul>
            <li v-for="eq in equipos" :key="eq.asignacion_id">
              <span class="cuenta-usuario">{{ eq.codigo }} — {{ eq.tipo }} {{ eq.marca }} {{ eq.modelo }}</span>
            </li>
          </ul>
        </div>

        <div v-if="equipos.length" class="baja-aviso-rotacion">
          <i class="ti ti-alert-triangle"></i>
          <span>
            La baja <strong>no</strong> marca los equipos como devueltos: recupérelos
            físicamente y registre la devolución en el módulo <strong>Equipos</strong>.
            Mientras tanto aparecerán como "Sin devolver" en el Dashboard.
          </span>
        </div>

        <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
          <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ error }}</p>
          </div>
        </div>
      </template>
    </div>

    <template v-if="fase !== 'confirmando'" #acciones>
      <button type="button" class="btn btn--secondary btn--md" @click="modal?.cerrar()">Cancelar</button>
      <button
        type="button"
        class="btn btn--danger btn--md"
        :disabled="cargando"
        @click="confirmarBaja"
      >
        Confirmar baja
        <i class="ti ti-user-off" aria-hidden="true"></i>
      </button>
    </template>
  </Modal>
</template>


