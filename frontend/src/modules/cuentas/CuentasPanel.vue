<script setup>
import { reactive, ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useCuentasStore } from '../../stores/cuentas.js';
import { insforgeApi } from '../../api/insforge.js';
import { revelarPassword } from '../../api/passwords.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import CuentaForm from './CuentaForm.vue';

const props = defineProps({
  empleadoId: { type: String, required: true },
  empleadoNombre: { type: String, required: true },
  empleadoWhatsapp: { type: String, default: '' },
});

const store = useCuentasStore();
const { lista, cargando, error } = storeToRefs(store);

const mostrarForm = ref(false);
const cuentaEditar = ref(null);
const passwordVisibles = reactive({});

// ── Traspaso ──────────────────────────────────────────────────────────────────
const mostrarTraspaso = ref(false);
const cuentaTraspaso = ref(null);
const empleadosDestino = ref([]);
const nuevoEmpleadoId = ref('');
const notasTraspaso = ref('');
const cargandoTraspaso = ref(false);
const guardandoTraspaso = ref(false);

// ── Historial ─────────────────────────────────────────────────────────────────
const mostrarHistorial = ref(false);
const cuentaHistorial = ref(null);
const historialItems = ref([]);
const cargandoHistorial = ref(false);

// passwordVisibles[asignacion_id] guarda el texto revelado; null = oculto.
// Cada revelado pasa por la edge function y queda auditado.
async function togglePassword(cuenta) {
  const id = cuenta.asignacion_id;
  if (passwordVisibles[id]) {
    passwordVisibles[id] = null;
    return;
  }
  try {
    passwordVisibles[id] = await revelarPassword(cuenta.cuenta_id, 'ver');
  } catch (e) {
    showToast(e?.message || 'Error al revelar contraseña', 'error');
  }
}

async function copiarPassword(cuenta) {
  try {
    const password = await revelarPassword(cuenta.cuenta_id, 'copiar');
    await navigator.clipboard.writeText(password);
    showToast('Contraseña copiada');
  } catch (e) {
    showToast(e?.message || 'No se pudo copiar', 'error');
  }
}

function abrirNueva() {
  cuentaEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(cuenta) {
  cuentaEditar.value = cuenta;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!cuentaEditar.value;
  mostrarForm.value = false;
  cuentaEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Cuenta actualizada' : 'Cuenta creada');
}

async function revocar(cuenta) {
  const msg = cuenta.tipo_cuenta === 'compartida'
    ? `¿Revocar acceso de este empleado a "${cuenta.plataforma_nombre}"? La cuenta seguirá existiendo para otros.`
    : `¿Revocar la cuenta de ${cuenta.plataforma_nombre}? Se cerrará la asignación.`;
  if (!confirm(msg)) return;
  try {
    await store.revocarAsignacion(cuenta.asignacion_id);
    showToast('Asignación revocada');
  } catch (e) {
    showToast(e?.message || 'Error al revocar', 'error');
  }
}

async function abrirTraspaso(cuenta) {
  cuentaTraspaso.value = cuenta;
  nuevoEmpleadoId.value = '';
  notasTraspaso.value = '';
  mostrarTraspaso.value = true;
  if (!empleadosDestino.value.length) {
    cargandoTraspaso.value = true;
    try {
      const todos = await insforgeApi.listEmpleados();
      empleadosDestino.value = todos.filter((e) => e.id !== props.empleadoId && e.estado === 'Activo');
    } catch (e) {
      showToast(e?.message || 'Error al cargar empleados', 'error');
      mostrarTraspaso.value = false;
    } finally {
      cargandoTraspaso.value = false;
    }
  }
}

async function confirmarTraspaso() {
  if (!nuevoEmpleadoId.value) return;
  guardandoTraspaso.value = true;
  try {
    await store.traspasar(cuentaTraspaso.value.asignacion_id, nuevoEmpleadoId.value, notasTraspaso.value || null);
    mostrarTraspaso.value = false;
    showToast(`Cuenta traspasada — ${cuentaTraspaso.value.plataforma_nombre}`);
  } catch (e) {
    showToast(e?.message || 'Error al traspasar', 'error');
  } finally {
    guardandoTraspaso.value = false;
  }
}

async function verHistorial(cuenta) {
  cuentaHistorial.value = cuenta;
  historialItems.value = [];
  mostrarHistorial.value = true;
  cargandoHistorial.value = true;
  try {
    historialItems.value = await insforgeApi.historialCuenta(cuenta.cuenta_id);
  } catch (e) {
    showToast(e?.message || 'Error al cargar historial', 'error');
    mostrarHistorial.value = false;
  } finally {
    cargandoHistorial.value = false;
  }
}

// El WhatsApp ya no lleva contraseñas: se genera un enlace de un solo
// uso que expira en 24 horas o al abrirse por primera vez.
const creandoEntrega = ref(false);

async function enviarWhatsApp() {
  creandoEntrega.value = true;
  try {
    await enviarCredencialesWhatsApp({
      empleadoId: props.empleadoId,
      empleadoNombre: props.empleadoNombre,
      whatsapp: props.empleadoWhatsapp,
      cuentaIds: lista.value.map((c) => c.cuenta_id),
    });
  } catch (e) {
    showToast(e?.message || 'Error al crear la entrega', 'error');
  } finally {
    creandoEntrega.value = false;
  }
}

onMounted(async () => {
  try {
    await store.cargarPorEmpleado(props.empleadoId);
  } catch {
    showToast(error.value || 'Error al cargar cuentas', 'error');
  }
});
</script>

<template>
  <div class="card cuentas-panel">
    <div class="panel-toolbar">
      <div class="panel-title">
        <i class="ti ti-key" aria-hidden="true"></i>
        Accesos
        <span class="badge-count">{{ lista.length }}</span>
      </div>
      <div class="panel-actions">
        <button v-if="lista.length" class="btn btn-whatsapp" type="button" :disabled="creandoEntrega" @click="enviarWhatsApp">
          <i class="ti ti-brand-whatsapp" aria-hidden="true"></i>
          {{ creandoEntrega ? 'Generando enlace...' : 'Enviar por WhatsApp' }}
        </button>
        <button class="btn btn-primary" type="button" @click="abrirNueva">
          <i class="ti ti-plus" aria-hidden="true"></i> Agregar cuenta
        </button>
      </div>
    </div>

    <div v-if="cargando" class="no-results">Cargando cuentas...</div>
    <div v-else-if="error" class="no-results cuentas-error">{{ error }}</div>

    <div v-else-if="lista.length === 0" class="empty">
      <div class="empty-icon"><i class="ti ti-key"></i></div>
      <h3>Sin cuentas registradas</h3>
      <p>Agrega la primera cuenta para este empleado.</p>
      <button class="btn" type="button" @click="abrirNueva">
        <i class="ti ti-plus"></i> Agregar cuenta
      </button>
    </div>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Plataforma</th>
            <th>Usuario</th>
            <th>Contraseña</th>
            <th>URL</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cuenta in lista" :key="cuenta.asignacion_id">
            <td>
              <span class="user-name">{{ cuenta.plataforma_nombre }}</span>
              <span v-if="cuenta.tipo_cuenta === 'compartida'" class="badge badge--sky badge-inline" title="Cuenta compartida: varios usuarios a la vez">compartida</span>
              <span v-else-if="cuenta.tipo_cuenta === 'reutilizable'" class="badge badge--sky badge-inline" title="Cuenta reutilizable: se hereda entre empleados">reutilizable</span>
              <span
                v-if="cuenta.requiere_rotacion"
                class="badge badge--warning badge-inline"
                title="Un titular anterior dejó esta cuenta y la contraseña no se ha cambiado"
              >
                <i class="ti ti-alert-triangle"></i> Rotar contraseña
              </span>
            </td>
            <td>{{ cuenta.usuario }}</td>
            <td>
              <div class="password-cell">
                <span class="password-text">{{ passwordVisibles[cuenta.asignacion_id] || '••••••••' }}</span>
                <button
                  class="icon-btn"
                  type="button"
                  :title="passwordVisibles[cuenta.asignacion_id] ? 'Ocultar' : 'Mostrar'"
                  @click="togglePassword(cuenta)"
                >
                  <i :class="passwordVisibles[cuenta.asignacion_id] ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
                </button>
                <button class="icon-btn" type="button" title="Copiar contraseña" @click="copiarPassword(cuenta)">
                  <i class="ti ti-copy"></i>
                </button>
              </div>
            </td>
            <td>
              <a v-if="cuenta.url" :href="cuenta.url" target="_blank" rel="noopener noreferrer" class="url-link" :title="cuenta.url">
                <i class="ti ti-external-link"></i>
              </a>
              <span v-else class="text-muted">—</span>
            </td>
            <td>
              <div class="actions">
                <button class="icon-btn" type="button" title="Historial" @click="verHistorial(cuenta)">
                  <i class="ti ti-history"></i>
                </button>
                <button class="icon-btn" type="button" title="Editar" @click="abrirEditar(cuenta)">
                  <i class="ti ti-pencil"></i>
                </button>
                <button
                  v-if="cuenta.tipo_cuenta !== 'compartida'"
                  class="icon-btn"
                  type="button"
                  title="Traspasar a otro empleado"
                  @click="abrirTraspaso(cuenta)"
                >
                  <i class="ti ti-transfer"></i>
                </button>
                <button
                  class="icon-btn danger"
                  type="button"
                  :title="cuenta.tipo_cuenta === 'compartida' ? 'Revocar acceso' : 'Revocar'"
                  @click="revocar(cuenta)"
                >
                  <i class="ti ti-user-minus"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <CuentaForm
    v-if="mostrarForm"
    :cuenta="cuentaEditar"
    :empleado-id="empleadoId"
    @cerrar="onFormCerrado"
  />

  <!-- Modal: Traspasar cuenta -->
  <div v-if="mostrarTraspaso" class="modal-bg" @click.self="mostrarTraspaso = false">
    <div class="modal modal-sm" role="dialog">
      <div class="modal-title">
        <span><i class="ti ti-transfer" aria-hidden="true"></i> Traspasar cuenta</span>
        <button class="icon-btn" type="button" @click="mostrarTraspaso = false">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="modal-body">
        <p class="traspaso-info">
          <strong>{{ cuentaTraspaso?.plataforma_nombre }}</strong> — {{ cuentaTraspaso?.usuario }}
        </p>
        <div v-if="cargandoTraspaso" class="no-results">Cargando empleados...</div>
        <template v-else>
          <div class="form-group">
            <label for="tr-empleado">Asignar a *</label>
            <select id="tr-empleado" v-model="nuevoEmpleadoId" :disabled="guardandoTraspaso">
              <option value="" disabled>Seleccionar empleado</option>
              <option v-for="emp in empleadosDestino" :key="emp.id" :value="emp.id">
                {{ emp.nombres }} {{ emp.apellidos }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="tr-notas">Notas</label>
            <input id="tr-notas" v-model="notasTraspaso" placeholder="ej: rotación de contraseña previa" :disabled="guardandoTraspaso">
          </div>
        </template>
        <div class="modal-actions">
          <button class="btn" type="button" :disabled="guardandoTraspaso" @click="mostrarTraspaso = false">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="guardandoTraspaso || !nuevoEmpleadoId" @click="confirmarTraspaso">
            {{ guardandoTraspaso ? 'Traspasando...' : 'Traspasar' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Historial de asignaciones -->
  <div v-if="mostrarHistorial" class="modal-bg" @click.self="mostrarHistorial = false">
    <div class="modal modal-historial" role="dialog">
      <div class="modal-title">
        <span><i class="ti ti-history" aria-hidden="true"></i> Historial — {{ cuentaHistorial?.plataforma_nombre }}</span>
        <button class="icon-btn" type="button" @click="mostrarHistorial = false">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="modal-body">
        <p class="traspaso-info">{{ cuentaHistorial?.usuario }}</p>
        <div v-if="cargandoHistorial" class="no-results">Cargando historial...</div>
        <div v-else-if="historialItems.length === 0" class="no-results">Sin historial registrado.</div>
        <div v-else class="timeline">
          <div v-for="h in historialItems" :key="h.id" class="timeline-item">
            <span class="timeline-dot" :class="h.activa ? 'timeline-dot--active' : 'timeline-dot--closed'"></span>
            <div class="timeline-content">
              <div class="timeline-title">
                {{ h.empleado_nombre }}
                <span v-if="h.activa" class="badge badge--success badge-inline">Activa</span>
              </div>
              <div class="timeline-meta">
                Desde {{ formatFecha(h.fecha_inicio) }}
                <template v-if="h.fecha_fin"> · hasta {{ formatFecha(h.fecha_fin) }}</template>
              </div>
              <div v-if="h.notas" class="timeline-notas">{{ h.notas }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cuentas-panel {
  padding: 0 0 8px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.modal-sm {
  width: 420px;
  max-width: 95vw;
}

.modal-historial {
  width: 640px;
  max-width: 95vw;
}

.modal-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.password-cell {
  display: flex;
  align-items: center;
  gap: 2px;
}

.password-text {
  font-family: monospace;
  letter-spacing: 0.05em;
  min-width: 72px;
}

.url-link {
  color: var(--color-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.url-link:hover { text-decoration: underline; }

.btn-whatsapp {
  background: #25d366;
  color: #fff;
  border-color: #25d366;
  font-size: 13px;
  padding: 6px 12px;
}
.btn-whatsapp:hover { background: #1ebe5d; border-color: #1ebe5d; }

.cuentas-error { color: var(--color-danger); }

/* Estructura y color: sistema de badges global (.badge + .badge--X);
   aquí solo el ajuste de este contexto: separación del texto vecino. */
.badge-inline {
  margin-left: 6px;
  vertical-align: middle;
}

/* Modales internos */
.modal-body {
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.traspaso-info {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* Estructura del historial: sistema de timeline global (main.css) */
</style>
