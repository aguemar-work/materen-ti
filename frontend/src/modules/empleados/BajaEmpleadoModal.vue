<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import Modal from '../../components/shared/Modal.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

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

        <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
      </template>
    </div>

    <template v-if="fase !== 'confirmando'" #acciones>
      <CarbonButton variante="secondary" @click="modal?.cerrar()">Cancelar</CarbonButton>
      <CarbonButton
        variante="danger"
        icono="ti-user-off"
        :deshabilitado="cargando"
        @click="confirmarBaja"
      >
        Confirmar baja
      </CarbonButton>
    </template>
  </Modal>
</template>

<style scoped>
.baja-title-con-icono {
  display: flex;
  align-items: center;
  gap: 10px;
}

.baja-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.baja-cargando {
  padding: 24px 0;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--fs-body-01);
}

.baja-checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  font-size: var(--fs-body-01);
}

.checklist-icono {
  flex-shrink: 0;
  font-size: var(--icon-md);
}

.checklist-icono--exito { color: var(--color-success-text); }
.checklist-icono--pendiente { color: var(--color-warning-text-strong); }
.checklist-icono--activo { color: var(--color-accent); }
.checklist-icono--espera { color: var(--color-text-secondary); }

.checklist-texto--espera {
  color: var(--color-text-secondary);
}

.baja-intro {
  margin: 0;
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
}

.baja-sin-cuentas {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 10px 12px;
}

.baja-grupo {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  overflow: hidden;
}

.grupo-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-label-01);
  font-weight: 600;
  padding: 8px 12px;
}

.grupo-header--danger { background: var(--color-danger-bg); color: var(--color-danger-text); }
.grupo-header--ok     { background: var(--color-success-bg); color: var(--color-success-text); }
.grupo-header--info   { background: var(--color-info-bg); color: var(--color-info-text); }

.baja-grupo ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.baja-grupo li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
  font-size: var(--fs-body-01);
}

.cuenta-usuario {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-label-01);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.cuenta-plataforma {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.baja-aviso-rotacion {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: var(--fs-label-01);
  line-height: 1.45;
  color: var(--color-warning-text-strong);
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-base);
  padding: 10px 12px;
}

.baja-aviso-rotacion i {
  /* Token de ícono, no de texto (mismo valor, 14px, pero es la escala
     correcta — misma distinción tokenizada en el barrido de Tickets). */
  font-size: var(--icon-sm);
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
