<script setup>
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import Modal from '../../components/shared/Modal.vue';

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
const procesando = ref(false);
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

async function confirmarBaja() {
  error.value = '';
  procesando.value = true;
  try {
    await store.darDeBaja(props.empleado.id);
    showToast(`${nombreCompleto.value} dado de baja`);
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al dar de baja';
  } finally {
    procesando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    size="sm"
    overlay-class="confirm-dialog--destructive"
    @close="emit('cerrar', resultado)"
  >
    <template #titulo>
      <span class="baja-title-con-icono">
        <span class="modal-icon"><i class="ti ti-user-off" aria-hidden="true"></i></span>
        Dar de baja a {{ nombreCompleto }}
      </span>
    </template>

    <div class="baja-body">
      <div v-if="cargando" class="baja-cargando">Cargando resumen de accesos...</div>

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

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </template>
    </div>

    <template #acciones>
      <button class="btn" type="button" :disabled="procesando" @click="modal?.cerrar()">Cancelar</button>
      <button
        class="btn btn-danger"
        type="button"
        :disabled="cargando || procesando"
        @click="confirmarBaja"
      >
        <i :class="procesando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-user-off'" aria-hidden="true"></i>
        {{ procesando ? 'Procesando...' : 'Confirmar baja' }}
      </button>
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
  font-size: var(--fs-base);
}

.baja-intro {
  margin: 0;
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
}

.baja-sin-cuentas {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.baja-grupo {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.grupo-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
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
  font-size: var(--fs-base);
}

.cuenta-usuario {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.cuenta-plataforma {
  font-size: var(--fs-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.baja-aviso-rotacion {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: var(--fs-sm);
  line-height: 1.45;
  color: var(--color-warning-text-strong);
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.baja-aviso-rotacion i {
  font-size: var(--fs-md);
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
