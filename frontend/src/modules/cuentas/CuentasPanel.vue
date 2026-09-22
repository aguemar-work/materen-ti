<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useCuentasStore } from '../../stores/cuentas.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { revelarPassword } from '../../api/passwords.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import { badgeInfo } from '../../core/badges.js';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import CuentaForm from './CuentaForm.vue';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import { columnasVisibles, estiloColumna } from '../../core/tablaColumnas.js';
import { rolDeTag } from '../../core/tagRol.js';
import { crearRevelado, escucharOcultamientoPorCambioDePestana } from '../../composables/useRevelado.js';

const props = defineProps({
  empleadoId: { type: String, required: true },
  empleadoNombre: { type: String, required: true },
  empleadoWhatsapp: { type: String, default: '' },
});

// Avisa a la ficha del empleado que ya se generó una entrega, para que su
// guía de alta pueda marcar ese paso como hecho sin recargar la página.
const emit = defineEmits(['entrega-enviada']);

const store = useCuentasStore();
const auth = useAuthStore();
const { lista, cargando, error } = storeToRefs(store);

// Reglas del servidor (functions/credenciales.ts), en orden:
//  1. Permiso individual "credenciales.ver" (migración 060) — sin él, nadie
//     que no sea JEFE revela ninguna contraseña, sin importar el tipo.
//  2. Una cuenta "personal" se entrega a un empleado, no la revela el
//     ASISTENTE aunque tenga el permiso de arriba — solo JEFE. Compartida/
//     reutilizable sí, porque el ASISTENTE las opera directamente.
// Definición de columnas de CarbonDataTable. "Contraseña" y sus otros no son
// ordenables (nunca lo fueron acá). El botón de CarbonPasswordReveal es la
// razón de ser de su celda, así que va SIN `.fila-accion` (no debe ocultarse
// en reposo) — los demás botones de la celda de Acciones sí la llevan.
const columnasCuentas = [
  { clave: 'plataforma', label: 'Plataforma', elastica: true, movil: 'principal' },
  { clave: 'password', label: 'Contraseña', movil: 'sec' },
  { clave: 'url', label: 'URL', movil: 'sec' },
  { clave: 'acciones', label: 'Acciones', ancho: '160px', movil: 'pie' },
];
const columnasCuentasVisibles = columnasVisibles(columnasCuentas);
const totalColumnasCuentas = columnasCuentasVisibles.length;

// El revelado (temporizador de 8s, distingue "ver" de "copiar" para el log
// de seguridad) vive en composables/useRevelado.js — una instancia por fila,
// creada perezosamente.
const revelados = new Map();
function revelarDe(cuenta) {
  if (!revelados.has(cuenta.asignacion_id)) {
    revelados.set(cuenta.asignacion_id, crearRevelado({
      revelar: (motivo) => revelarPassword(cuenta.cuenta_id, motivo),
      etiqueta: 'contraseña',
    }));
  }
  return revelados.get(cuenta.asignacion_id);
}
const detenerOcultamiento = escucharOcultamientoPorCambioDePestana(() => [...revelados.values()]);
onBeforeUnmount(() => {
  detenerOcultamiento();
  revelados.forEach((r) => r.ocultar());
});

// Si el permiso se cae mientras una credencial está a la vista, se oculta.
watch(() => auth.puedeVerCredenciales, (puede) => {
  if (!puede) revelados.forEach((r) => r.ocultar());
});

function puedeRevelar(cuenta) {
  return auth.puedeVerCredenciales && (auth.esJefe || cuenta.tipo_cuenta !== 'personal');
}

// Motivo del candado, para el título/aria-label del ícono — distingue las
// dos reglas de arriba en vez de un mensaje genérico.
function motivoBloqueo() {
  if (!auth.puedeVerCredenciales) return 'Sin permiso para ver contraseñas.';
  return 'Solo un JEFE puede ver esta contraseña. Usa "Enviar por WhatsApp" para entregarla al empleado.';
}

const mostrarForm = ref(false);
const cuentaEditar = ref(null);

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

// Cerrar vía Modal.cerrar() reproduce la animación de salida;
// el @close del Modal es quien baja mostrarTraspaso/mostrarHistorial.
const modalTraspaso = ref(null);
const modalHistorial = ref(null);

// El revelado de una credencial (petición a la edge function
// `credenciales`, auditoría en accesos_log con el motivo, cuenta regresiva
// de 8 segundos y ocultado automático) vive en CarbonPasswordReveal.vue
// desde el 2026-09-02. Este panel solo declara QUÉ credencial se revela y
// si el usuario puede (ver puedeRevelar/motivoBloqueo arriba).

function abrirNueva() {
  cuentaEditar.value = null;
  mostrarForm.value = true;
}

// La ficha del empleado dispara el alta y la entrega desde su guía de alta
// guiada, para que ambas sean un botón del propio paso y no una caza del
// botón correcto dentro de este panel. Mismo patrón de exposición que usa
// Modal.vue.
defineExpose({ abrirNueva, enviarWhatsApp });

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

// Confirmación destructiva (ConfirmDialog compartido, tier base). El
// mensaje/título varían según el tipo de cuenta, igual que en el confirm()
// nativo que reemplaza.
const porRevocar = ref(null);
const revocando = ref(false);
const dialogoRevocar = ref(null);

// “Personal” ya no es un simple cierre de asignación: revocarCuentaPersonal
// también hace soft-delete de la cuenta (hallazgo 2026-08-20, ver
// api/domains/cuentas.js) — el título/mensaje/acción de esta rama son
// distintos a propósito, para no repetir la confusión original (“Revocar”
// sonaba a reversible y no lo era).
const tituloRevocar = computed(() => {
  const t = porRevocar.value?.tipo_cuenta;
  if (t === 'personal') return 'Eliminar cuenta';
  return t === 'compartida' ? 'Revocar acceso' : 'Revocar cuenta';
});

const mensajeRevocar = computed(() => {
  const c = porRevocar.value;
  if (!c) return '';
  if (c.tipo_cuenta === 'personal') {
    return `¿Eliminar la cuenta de “${c.plataforma_nombre}”? Se cerrará la asignación y se eliminará la cuenta por completo — no se puede deshacer.`;
  }
  return c.tipo_cuenta === 'compartida'
    ? `¿Revocar acceso de este empleado a “${c.plataforma_nombre}”? La cuenta seguirá existiendo para otros.`
    : `¿Revocar la cuenta de ${c.plataforma_nombre}? Se cerrará la asignación.`;
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
  } catch (e) {
    showToast(e?.message || 'Error al revocar', 'error');
  } finally {
    revocando.value = false;
  }
}

function cerrarTraspaso() {
  if (modalTraspaso.value) modalTraspaso.value.cerrar();
  else mostrarTraspaso.value = false;
}

function cerrarHistorial() {
  if (modalHistorial.value) modalHistorial.value.cerrar();
  else mostrarHistorial.value = false;
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
      cerrarTraspaso();
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
    cerrarTraspaso();
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
    cerrarHistorial();
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
    emit('entrega-enviada');
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
    <div class="card-toolbar">
      <div class="toolbar-title">
        <i class="ti ti-key" aria-hidden="true"></i>
        Accesos
        <span class="badge-count">{{ lista.length }}</span>
      </div>
      <div class="panel-actions">
        <button
          v-if="lista.length"
          class="btn btn-whatsapp"
          type="button"
          :disabled="creandoEntrega || !auth.puedeVerCredenciales"
          :title="auth.puedeVerCredenciales ? '' : 'Sin permiso para ver contraseñas'"
          @click="enviarWhatsApp"
        >
          <i :class="creandoEntrega ? 'ti ti-loader-2 spinner-icon' : 'ti ti-brand-whatsapp'" aria-hidden="true"></i>
          {{ creandoEntrega ? 'Generando enlace...' : 'Enviar por WhatsApp' }}
        </button>
        <!-- Secundario, no acento (Empleados, pasada de diseño ago 2026):
             era .btn-primary incondicional, y cuando el empleado está
             Inactivo el header de EmpleadoDetalleView.vue YA muestra su
             propio .btn-primary ("Reactivar") — dos acentos compitiendo en
             la misma vista. Mismo peso visual que "Asignar" en los paneles
             de Equipos/Licencias, que ya eran .btn secundario. -->
        <button type="button" class="btn btn--secondary" @click="abrirNueva">
          Agregar cuenta
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <div v-if="error" class="no-results cuentas-error">{{ error }}</div>

    <template v-else>
      <div class="tabla-envoltorio">
        <table class="tabla" aria-label="Cuentas del empleado">
          <thead>
            <tr>
              <th v-for="col in columnasCuentasVisibles" :key="col.clave" scope="col" :style="estiloColumna(col)">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <SkeletonTabla v-if="cargando" :columnas="totalColumnasCuentas" />
            <tr v-else-if="!lista.length">
              <td :colspan="totalColumnasCuentas" class="tabla__vacio">
                <EmptyState icono="ti ti-key" titulo="Sin cuentas registradas" mensaje="Agrega la primera cuenta para este empleado.">
                  <button type="button" class="btn btn--secondary" @click="abrirNueva">
                    Agregar cuenta
                    <i class="ti ti-plus" aria-hidden="true"></i>
                  </button>
                </EmptyState>
              </td>
            </tr>
            <template v-else>
              <tr v-for="cuenta in lista" :key="cuenta.asignacion_id">
                <td>
                  <!-- Usuario + Plataforma colapsan (mismo criterio que Tickets):
                       Usuario es el identificador chico arriba, Plataforma es el dato
                       que más se escanea acá (viendo las cuentas de UN empleado, "en
                       qué plataforma" importa más que repetir el usuario en cada
                       fila). tipo_cuenta baja de badge a texto — metadato de
                       clasificación fijo, no estado; "Rotar contraseña" se queda como
                       badge, es una alerta operativa real, igual que en
                       Tickets/Correos. -->
                  <div class="celda-apilada">
                    <span class="celda-apilada__meta">
                      {{ cuenta.usuario }}
                      <template v-if="cuenta.tipo_cuenta === 'compartida' || cuenta.tipo_cuenta === 'reutilizable'">
                        <span class="celda-sep" aria-hidden="true">·</span>
                        {{ badgeInfo('tipo_cuenta', cuenta.tipo_cuenta).label }}
                      </template>
                    </span>
                    <span class="celda-apilada__principal">
                      {{ cuenta.plataforma_nombre }}
                      <span
                        v-if="cuenta.requiere_rotacion"
                        class="tag badge-inline"
                        :class="`tag--${rolDeTag('warning')}`"
                        title="Un titular anterior dejó esta cuenta y la contraseña no se ha cambiado"
                      >
                        <i class="ti ti-alert-triangle"></i> Rotar contraseña
                      </span>
                    </span>
                  </div>
                </td>
                <td>
                  <div class="cred">
                    <span v-if="revelarDe(cuenta).valor.value" class="cred__valor">{{ revelarDe(cuenta).valor.value }}</span>
                    <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                    <template v-if="puedeRevelar(cuenta)">
                      <button
                        type="button"
                        class="cred__accion"
                        :disabled="revelarDe(cuenta).pidiendo.value"
                        :aria-label="revelarDe(cuenta).valor.value ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                        @click="revelarDe(cuenta).mostrar()"
                      >
                        <i :class="revelarDe(cuenta).valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                      </button>
                      <button
                        type="button"
                        class="cred__accion"
                        :disabled="revelarDe(cuenta).pidiendo.value"
                        aria-label="Copiar contraseña"
                        @click="revelarDe(cuenta).copiar()"
                      >
                        <i class="ti ti-copy" aria-hidden="true"></i>
                      </button>
                      <span v-if="revelarDe(cuenta).valor.value" class="cred__cuenta" aria-live="off">{{ revelarDe(cuenta).restante.value }}s</span>
                    </template>
                    <span v-else class="cred__candado" role="img" :aria-label="motivoBloqueo()" :title="motivoBloqueo()">
                      <i class="ti ti-lock" aria-hidden="true"></i>
                    </span>
                  </div>
                </td>
                <td>
                  <a v-if="cuenta.url" :href="cuenta.url" target="_blank" rel="noopener noreferrer" class="url-link" :title="cuenta.url" aria-label="Abrir URL de la plataforma">
                    <i class="ti ti-external-link"></i>
                  </a>
                  <TextoVacio v-else />
                </td>
                <td>
                  <div class="actions">
                    <button class="icon-btn fila-accion" type="button" title="Historial" aria-label="Historial" @click="verHistorial(cuenta)">
                      <i class="ti ti-history"></i>
                    </button>
                    <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(cuenta)">
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button
                      v-if="cuenta.tipo_cuenta !== 'compartida'"
                      class="icon-btn fila-accion"
                      type="button"
                      title="Traspasar a otro empleado"
                      aria-label="Traspasar a otro empleado"
                      @click="abrirTraspaso(cuenta)"
                    >
                      <i class="ti ti-transfer"></i>
                    </button>
                    <button
                      class="icon-btn danger fila-accion"
                      type="button"
                      :title="cuenta.tipo_cuenta === 'personal' ? 'Eliminar' : (cuenta.tipo_cuenta === 'compartida' ? 'Revocar acceso' : 'Revocar')"
                      :aria-label="cuenta.tipo_cuenta === 'personal' ? 'Eliminar' : (cuenta.tipo_cuenta === 'compartida' ? 'Revocar acceso' : 'Revocar')"
                      @click="porRevocar = cuenta"
                    >
                      <i class="ti ti-user-minus"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <ul v-if="!cargando && lista.length" class="lista-tarjetas solo-movil" aria-label="Cuentas del empleado">
        <li v-for="cuenta in lista" :key="cuenta.asignacion_id" class="tarjeta-fila">
          <div class="tarjeta-fila__principal">
            <div class="celda-apilada">
              <span class="celda-apilada__meta">
                {{ cuenta.usuario }}
                <template v-if="cuenta.tipo_cuenta === 'compartida' || cuenta.tipo_cuenta === 'reutilizable'">
                  <span class="celda-sep" aria-hidden="true">·</span>
                  {{ badgeInfo('tipo_cuenta', cuenta.tipo_cuenta).label }}
                </template>
              </span>
              <span class="celda-apilada__principal">
                {{ cuenta.plataforma_nombre }}
                <span v-if="cuenta.requiere_rotacion" class="tag badge-inline" :class="`tag--${rolDeTag('warning')}`">
                  <i class="ti ti-alert-triangle"></i> Rotar contraseña
                </span>
              </span>
            </div>
          </div>
          <div class="tarjeta-fila__sec">
            <div class="cred">
              <span v-if="revelarDe(cuenta).valor.value" class="cred__valor">{{ revelarDe(cuenta).valor.value }}</span>
              <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
              <template v-if="puedeRevelar(cuenta)">
                <button type="button" class="cred__accion" :disabled="revelarDe(cuenta).pidiendo.value" :aria-label="revelarDe(cuenta).valor.value ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="revelarDe(cuenta).mostrar()">
                  <i :class="revelarDe(cuenta).valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                </button>
                <button type="button" class="cred__accion" :disabled="revelarDe(cuenta).pidiendo.value" aria-label="Copiar contraseña" @click="revelarDe(cuenta).copiar()">
                  <i class="ti ti-copy" aria-hidden="true"></i>
                </button>
              </template>
              <span v-else class="cred__candado" role="img" :aria-label="motivoBloqueo()"><i class="ti ti-lock" aria-hidden="true"></i></span>
            </div>
          </div>
          <div class="tarjeta-fila__sec">
            <a v-if="cuenta.url" :href="cuenta.url" target="_blank" rel="noopener noreferrer" class="url-link" :title="cuenta.url" aria-label="Abrir URL de la plataforma">
              <i class="ti ti-external-link"></i>
            </a>
            <TextoVacio v-else />
          </div>
          <div class="tarjeta-fila__pie">
            <div class="actions">
              <button class="icon-btn fila-accion" type="button" aria-label="Historial" @click="verHistorial(cuenta)"><i class="ti ti-history"></i></button>
              <button class="icon-btn fila-accion" type="button" aria-label="Editar" @click="abrirEditar(cuenta)"><i class="ti ti-pencil"></i></button>
              <button v-if="cuenta.tipo_cuenta !== 'compartida'" class="icon-btn fila-accion" type="button" aria-label="Traspasar a otro empleado" @click="abrirTraspaso(cuenta)"><i class="ti ti-transfer"></i></button>
              <button
                class="icon-btn danger fila-accion"
                type="button"
                :aria-label="cuenta.tipo_cuenta === 'personal' ? 'Eliminar' : (cuenta.tipo_cuenta === 'compartida' ? 'Revocar acceso' : 'Revocar')"
                @click="porRevocar = cuenta"
              ><i class="ti ti-user-minus"></i></button>
            </div>
          </div>
        </li>
      </ul>
    </template>
  </div>

  <CuentaForm
    v-if="mostrarForm"
    :cuenta="cuentaEditar"
    :empleado-id="empleadoId"
    @cerrar="onFormCerrado"
  />

  <!-- Modal: Traspasar cuenta (Modal accesible compartido) -->
  <Modal
    v-if="mostrarTraspaso"
    ref="modalTraspaso"
    size="sm"
    @close="mostrarTraspaso = false"
  >
    <template #titulo>
      <i class="ti ti-transfer" aria-hidden="true"></i> Traspasar cuenta
    </template>

    <div class="modal-body-inner">
      <p class="traspaso-info">
        <strong>{{ cuentaTraspaso?.plataforma_nombre }}</strong> — {{ cuentaTraspaso?.usuario }}
      </p>
      <div v-if="cargandoTraspaso" class="no-results">Cargando empleados...</div>
      <template v-else>
        <div class="form-group">
          <label for="tr-empleado">Asignar a *</label>
          <BuscadorCombo
            id="tr-empleado"
            v-model="nuevoEmpleadoId"
            :items="empleadosDestino"
            :campos-busqueda="['nombres', 'apellidos', 'dni']"
            :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
            placeholder="Buscar por nombre o DNI..."
            :disabled="guardandoTraspaso"
          >
            <template #resultado="{ item }">
              <span>{{ item.nombres }} {{ item.apellidos }}</span>
              <span class="combo-sec">{{ item.dni }}</span>
            </template>
          </BuscadorCombo>
        </div>
        <div class="campo">
          <label class="campo__etiqueta" for="traspaso-notas">Notas</label>
          <div class="campo__caja">
            <input
              id="traspaso-notas"
              v-model="notasTraspaso"
              class="campo__control"
              type="text"
              placeholder="ej: rotación de contraseña previa"
              :disabled="guardandoTraspaso"
            >
          </div>
        </div>
      </template>
    </div>

    <template #acciones>
      <button type="button" class="btn btn--secondary" :disabled="guardandoTraspaso" @click="cerrarTraspaso">Cancelar</button>
      <button type="button" class="btn btn--primary" :disabled="guardandoTraspaso || !nuevoEmpleadoId" @click="confirmarTraspaso">
        {{ guardandoTraspaso ? 'Traspasando...' : 'Traspasar' }}
        <i v-if="guardandoTraspaso" class="ti ti-loader-2" aria-hidden="true"></i>
      </button>
    </template>
  </Modal>

  <!-- Modal: Historial de asignaciones (Modal accesible compartido) -->
  <Modal
    v-if="mostrarHistorial"
    ref="modalHistorial"
    size="detail"
    @close="mostrarHistorial = false"
  >
    <template #titulo>
      <i class="ti ti-history" aria-hidden="true"></i> Historial — {{ cuentaHistorial?.plataforma_nombre }}
    </template>

    <div class="modal-body-inner">
      <p class="traspaso-info">{{ cuentaHistorial?.usuario }}</p>
      <div v-if="cargandoHistorial" class="no-results">Cargando historial...</div>
      <div v-else-if="historialItems.length === 0" class="no-results">Sin historial registrado.</div>
      <div v-else class="timeline">
        <div v-for="h in historialItems" :key="h.id" class="timeline-item">
          <span class="timeline-dot" :class="h.activa ? 'timeline-dot--active' : 'timeline-dot--closed'"></span>
          <div class="timeline-content">
            <div class="timeline-title">
              <RouterLink v-if="h.empleado_id" class="empleado-link" :to="`/empleados/${h.empleado_id}`">{{ h.empleado_nombre }}</RouterLink>
              <template v-else>{{ h.empleado_nombre }}</template>
              <span v-if="h.activa" class="tag badge-inline" :class="`tag--${rolDeTag('success')}`">Activa</span>
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
  </Modal>

  <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
  <ConfirmDialog
    v-if="porRevocar"
    ref="dialogoRevocar"
    destructivo
    icono="ti-user-minus"
    :titulo="tituloRevocar"
    :mensaje="mensajeRevocar"
    :confirmar-label="porRevocar?.tipo_cuenta === 'personal' ? 'Eliminar' : 'Revocar'"
    :cargando="revocando"
    @cancel="porRevocar = null"
    @confirm="confirmarRevocar"
  />
</template>


