<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useLicenciasStore } from '../../stores/licencias.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { revelarClaveLicencia, revelarPassword } from '../../api/passwords.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, fechaISO, fechaLocalISO } from '../../core/formatters.js';
import { estadoVencimientoLicencia, CLASE_VENCIMIENTO_LICENCIA } from '../../core/dominio-licencias.js';
import LicenciaForm from './LicenciaForm.vue';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import CarbonPasswordReveal from '../../components/carbon/CarbonPasswordReveal.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import Modal from '../../components/shared/Modal.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = useLicenciasStore();
const auth = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

useRealtimeRefresco('licencias:list', () => store.cargar(), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

// Definición de columnas de CarbonDataTable. "Acciones" usa MenuAcciones
// (menú ⋮), no icon-btn sueltos, así que no lleva `.fila-accion` — ese
// disparador ya tiene su propio estilo.
const columnasLicencias = [
  { clave: 'software', label: 'Software', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'empresa', label: 'Empresa', movil: 'sec' },
  { clave: 'acceso', label: 'Acceso', movil: false },
  { clave: 'asientos', label: 'Asientos', movil: 'sec' },
  { clave: 'usuarios', label: 'Usuarios', movil: false },
  { clave: 'fecha_vencimiento', label: 'Vencimiento', ordenable: true, movil: 'pie' },
  { clave: 'acciones', label: 'Acciones', ancho: '56px', movil: 'pie' },
];

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// Deep-link desde la búsqueda global: /licencias?q=SOFTWARE
const route = useRoute();
busqueda.value = String(route.query.q ?? '');
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const mostrarForm = ref(false);
const licenciaEditar = ref(null);

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'licencias',
      ['Software', 'Proveedor', 'Empresa', 'Acceso', 'Asientos usados', 'Asientos totales', 'Usuarios', 'Vencimiento'],
      filas.map((l) => [
        l.software,
        l.proveedor,
        l.empresa_nombre || 'Del grupo',
        l.cuenta_usuario,
        l.usados,
        l.cantidad,
        (l.usuarios || []).map((u) => u.nombre).join(', '),
        l.tipo === 'perpetua' ? 'Perpetua' : l.fecha_vencimiento,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// ── Asignación directa ────────────────────────────────────────
const mostrarAsignar = ref(false);
const licenciaAsignar = ref(null);
const empleadosActivos = ref([]);
const empleadoAsignarId = ref('');
const cargandoEmpleados = ref(false);
const asignando = ref(false);
const errorAsignar = ref('');
const modalAsignar = ref(null);

// Guard de cierre del Modal compartido (X, Escape, backdrop): no cierra
// mientras se está asignando, mismo criterio que el botón Cancelar.
function confirmarCierreAsignar() {
  return !asignando.value;
}

// Barra de capacidad: comunica cercanía al tope de asientos antes de que
// el trigger de BD (check_tope_licencia) bloquee la asignación.
function capacidadInfo(l) {
  const pct = l.cantidad > 0 ? Math.min(100, Math.round((l.usados / l.cantidad) * 100)) : 0;
  let clase = 'capacity-fill--ok';
  if (pct >= 100) clase = 'capacity-fill--full';
  else if (pct >= 70) clase = 'capacity-fill--warning';
  return { pct, clase };
}

function estadoVencimiento(l) {
  const estado = estadoVencimientoLicencia(l);
  const clase = CLASE_VENCIMIENTO_LICENCIA[estado];
  if (estado === 'perpetua') return { clase, texto: 'Perpetua' };
  if (estado === 'vencida') return { clase, texto: `Venció ${formatFecha(l.fecha_vencimiento)}` };
  if (estado === 'por_vencer') return { clase, texto: `Vence ${formatFecha(l.fecha_vencimiento)}` };
  return { clase, texto: formatFecha(l.fecha_vencimiento) };
}

const PERIODO_LABELS = {
  1: 'Mensual', 3: 'Trimestral', 6: 'Cada 6 meses',
  12: 'Anual', 24: 'Cada 2 años', 36: 'Cada 3 años',
};

function periodoLabel(meses) {
  return PERIODO_LABELS[meses] || `Cada ${meses} meses`;
}

// Próxima fecha: avanza el periodo desde el vencimiento actual las veces
// necesarias hasta quedar en el futuro (por si estuvo vencida un tiempo)
function proximaFecha(l) {
  const d = new Date(`${l.fecha_vencimiento}T00:00:00`);
  do {
    d.setMonth(d.getMonth() + l.renovacion_meses);
  } while (fechaISO(d) <= fechaLocalISO());
  return fechaISO(d);
}

// Confirmación (ConfirmDialog compartido): una sola instancia para las 3
// acciones de esta vista (eliminar/liberar/renovar), diferenciadas por
// `tipo`. Renovar no es destructiva — usa el botón primario, no btn-danger.
const accionPendiente = ref(null); // { tipo: 'eliminar'|'liberar'|'renovar', licencia, usuario?, nuevaFecha? }
const procesandoAccion = ref(false);
const dialogoAccion = ref(null);

const tituloAccion = computed(() => {
  const tipo = accionPendiente.value?.tipo;
  if (tipo === 'liberar') return 'Liberar asiento';
  if (tipo === 'renovar') return 'Renovar licencia';
  return 'Eliminar licencia';
});

const mensajeAccion = computed(() => {
  const a = accionPendiente.value;
  if (!a) return '';
  if (a.tipo === 'liberar') return `¿Liberar el asiento de ${a.usuario.nombre} en “${a.licencia.software}”?`;
  if (a.tipo === 'renovar') {
    return `¿Renovar “${a.licencia.software}”? Nuevo vencimiento: ${formatFecha(a.nuevaFecha)} (${periodoLabel(a.licencia.renovacion_meses).toLowerCase()}).`;
  }
  return `¿Eliminar la licencia “${a.licencia.software}”? El historial de asignaciones se conserva.`;
});

const confirmarLabelAccion = computed(() => {
  const tipo = accionPendiente.value?.tipo;
  if (tipo === 'liberar') return 'Liberar';
  if (tipo === 'renovar') return 'Renovar';
  return 'Eliminar';
});

const iconoAccion = computed(() => (accionPendiente.value?.tipo === 'liberar' ? 'ti-user-minus' : 'ti-trash'));

function pedirRenovar(lic) {
  accionPendiente.value = { tipo: 'renovar', licencia: lic, nuevaFecha: proximaFecha(lic) };
}

function abrirNueva() {
  licenciaEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(licencia) {
  licenciaEditar.value = licencia;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!licenciaEditar.value;
  mostrarForm.value = false;
  licenciaEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Licencia actualizada' : 'Licencia creada');
}

// La contraseña de la licencia: la propia (clave) si tiene una; si es una
// licencia con login sin clave propia, se entra con la contraseña del correo
async function revelarDeLicencia(licencia, motivo) {
  if (licencia.tiene_clave) return revelarClaveLicencia(licencia.id, motivo);
  if (licencia.cuenta_id) return revelarPassword(licencia.cuenta_id, motivo);
  return '';
}

// El revelado de una credencial (peticion a la edge function `credenciales`,
// auditoria en accesos_log con el motivo, cuenta regresiva de 8 segundos y
// ocultado automatico) vive en CarbonPasswordReveal.vue desde el
// 2026-09-02. Esta vista solo declara QUE credencial se revela.

async function abrirAsignar(licencia) {
  licenciaAsignar.value = licencia;
  empleadoAsignarId.value = '';
  errorAsignar.value = '';
  mostrarAsignar.value = true;
  if (!empleadosActivos.value.length) {
    cargandoEmpleados.value = true;
    try {
      const todos = await insforgeApi.listEmpleados();
      empleadosActivos.value = todos.filter((e) => e.estado === 'Activo');
    } catch (e) {
      showToast(e?.message || 'Error al cargar empleados', 'error');
      modalAsignar.value?.cerrar();
    } finally {
      cargandoEmpleados.value = false;
    }
  }
}

async function confirmarAsignar() {
  if (!empleadoAsignarId.value) return;
  errorAsignar.value = '';
  asignando.value = true;
  try {
    await store.asignar(licenciaAsignar.value, empleadoAsignarId.value);
    modalAsignar.value?.cerrar();
    showToast('Asiento asignado');
  } catch (e) {
    // Rechazo del trigger de tope de asientos (check_tope_licencia): se
    // muestra dentro del modal, no solo en el toast, porque el mensaje
    // completo debe leerse con calma antes de reintentar.
    errorAsignar.value = e?.message || 'Error al asignar';
  } finally {
    asignando.value = false;
  }
}

function pedirLiberar(licencia, usuario) {
  accionPendiente.value = { tipo: 'liberar', licencia, usuario };
}

function pedirEliminar(licencia) {
  accionPendiente.value = { tipo: 'eliminar', licencia };
}

// Fuente única de las acciones por licencia para el menú ⋮ de las tarjetas
// móviles (mismo criterio que accionesDe/accionesVisibles en EquiposView).
function accionesDe(lic) {
  return [
    {
      icono: 'ti-refresh',
      label: 'Renovar',
      visible: lic.tipo === 'suscripcion' && !!lic.renovacion_meses && !!lic.fecha_vencimiento,
      onClick: () => pedirRenovar(lic),
    },
    {
      icono: 'ti-user-plus',
      label: 'Asignar asiento a un empleado',
      disabled: lic.usados >= lic.cantidad,
      onClick: () => abrirAsignar(lic),
    },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(lic) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => pedirEliminar(lic) },
  ];
}

async function confirmarAccionPendiente() {
  const a = accionPendiente.value;
  if (!a) return;
  procesandoAccion.value = true;
  try {
    if (a.tipo === 'liberar') {
      await store.liberar(a.usuario);
      showToast('Asiento liberado');
    } else if (a.tipo === 'renovar') {
      await store.renovar(a.licencia.id, a.nuevaFecha);
      showToast(`${a.licencia.software} renovada hasta ${formatFecha(a.nuevaFecha)}`);
    } else {
      await store.softDelete(a.licencia.id);
      showToast('Licencia eliminada');
    }
    dialogoAccion.value?.cerrar();
  } catch (e) {
    const verbo = a.tipo === 'liberar' ? 'liberar' : a.tipo === 'renovar' ? 'renovar' : 'eliminar';
    showToast(e?.message || `Error al ${verbo}`, 'error');
  } finally {
    procesandoAccion.value = false;
  }
}

onMounted(async () => {
  store.resetearFiltros();
  try {
    if (busqueda.value.trim()) {
      await store.aplicarFiltros({ q: busqueda.value.trim() });
    } else {
      await store.cargar();
    }
  } catch {
    showToast(error.value || 'Error al cargar licencias', 'error');
  }
});
</script>

<template>
  <div class="licencias-page vista-modulo">
    <PageHeader titulo="Licencias" icono="ti ti-license" :conteo="total">
      <template #acciones>
        <CarbonButton variante="secondary" icono="ti-table-export" :cargando="exportando" title="Exportar a Excel (CSV)" @click="exportar">
          {{ exportando ? 'Exportando...' : 'Exportar' }}
        </CarbonButton>
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNueva">Nueva licencia</CarbonButton>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por software, empresa o correo...">
          </div>
        </div>

        <div v-if="cargando" class="no-results solo-movil">Cargando licencias...</div>
        <div v-else-if="error" class="no-results lic-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-license"
          titulo="Sin licencias"
          :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Registra la primera licencia para ordenar el software que pagan.'"
        >
          <CarbonButton v-if="!busqueda" variante="secondary" icono="ti-plus" @click="abrirNueva">Nueva licencia</CarbonButton>
        </EmptyState>

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando licencias…</p>
        <CarbonDataTable
          :columnas="columnasLicencias"
          :filas="lista"
          :cargando="cargando"
          :orden-por="ordenColumna"
          :orden-dir="ordenDireccion"
          etiqueta="Licencias de software"
          @ordenar="store.ordenarPor"
        >
          <template #celda-software="{ fila: lic }">
            <!-- Proveedor + Software colapsan (mismo criterio que Tickets):
                 ya vivía apilado a mano (.user-name + .lic-proveedor, sin el
                 gris de __meta) — se migra a las clases oficiales en vez de
                 mantener la reimplementación incompleta. -->
            <div class="celda-apilada">
              <span v-if="lic.proveedor" class="celda-apilada__meta">{{ lic.proveedor }}</span>
              <span class="celda-apilada__principal">{{ lic.software }}</span>
            </div>
          </template>
          <template #celda-empresa="{ fila: lic }">{{ lic.empresa_nombre || 'Del grupo' }}</template>
          <template #celda-acceso="{ fila: lic }">
            <div v-if="lic.cuenta_id" class="acceso-login">
              <span class="lic-acceso" :title="lic.cuenta_usuario">
                <i class="ti ti-mail"></i> {{ lic.cuenta_usuario }}
              </span>
              <div class="clave-cell">
                <CarbonPasswordReveal
                  :revelar="(motivo) => revelarDeLicencia(lic, motivo)"
                  :bloqueado="!auth.puedeVerCredenciales"
                  :etiqueta="lic.tiene_clave ? 'contraseña del software' : 'contraseña del correo'"
                  motivo-bloqueo="Sin permiso para ver contraseñas"
                />
                <span class="clave-origen">{{ lic.tiene_clave ? 'propia' : 'del correo' }}</span>
              </div>
            </div>
            <div v-else-if="lic.tiene_clave" class="clave-cell">
              <CarbonPasswordReveal
                :revelar="(motivo) => revelarDeLicencia(lic, motivo)"
                :bloqueado="!auth.puedeVerCredenciales"
                etiqueta="clave"
                motivo-bloqueo="Sin permiso para ver contraseñas"
              />
            </div>
            <TextoVacio v-else />
          </template>
          <template #celda-asientos="{ fila: lic }">
            <div class="capacity">
              <div class="capacity-bar">
                <div
                  class="capacity-fill"
                  :class="capacidadInfo(lic).clase"
                  :style="{ width: capacidadInfo(lic).pct + '%' }"
                ></div>
              </div>
              <span class="capacity-label">{{ lic.usados }}/{{ lic.cantidad }} asientos</span>
            </div>
          </template>
          <template #celda-usuarios="{ fila: lic }">
            <div v-if="lic.usuarios.length" class="usuarios-cell">
              <span
                v-for="(u, i) in lic.usuarios"
                :key="i"
                class="usuario-chip"
              >
                <RouterLink v-if="u.empleado_id" class="empleado-link" :to="`/empleados/${u.empleado_id}`">{{ u.nombre }}</RouterLink>
                <template v-else>{{ u.nombre }}</template>
                <button
                  v-if="u.asignacion_id"
                  class="chip-x"
                  type="button"
                  title="Liberar asiento"
                  aria-label="Liberar asiento"
                  @click="pedirLiberar(lic, u)"
                >
                  <i class="ti ti-x"></i>
                </button>
              </span>
            </div>
            <TextoVacio v-else placeholder="Sin usuarios" />
          </template>
          <template #celda-fecha_vencimiento="{ fila: lic }">
            <div class="venc-cell">
              <CarbonTag :variante="estadoVencimiento(lic).clase">
                {{ estadoVencimiento(lic).texto }}
              </CarbonTag>
              <span v-if="lic.tipo === 'suscripcion' && lic.renovacion_meses" class="venc-periodo">
                <i class="ti ti-refresh"></i> {{ periodoLabel(lic.renovacion_meses) }}
              </span>
            </div>
          </template>
          <template #celda-acciones="{ fila: lic }">
            <div class="actions">
              <MenuAcciones :acciones="accionesDe(lic)" :label="`Acciones de ${lic.software}`" />
            </div>
          </template>
        </CarbonDataTable>

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="total"
          :tam-pagina="store.tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="licencias"
          @update:tam-pagina="store.cambiarTamPagina"
        />
        </template>
      </div>
    </main>

    <LicenciaForm
      v-if="mostrarForm"
      :licencia="licenciaEditar"
      @cerrar="onFormCerrado"
    />

    <!-- Modal: asignar asiento (Modal accesible compartido) -->
    <Modal
      v-if="mostrarAsignar"
      ref="modalAsignar"
      size="sm"
      :confirmar-cierre="confirmarCierreAsignar"
      :cerrar-en-backdrop="false"
      @close="mostrarAsignar = false"
    >
      <template #titulo><i class="ti ti-user-plus" aria-hidden="true"></i> Asignar asiento</template>
      <p class="asignar-info">
        <strong>{{ licenciaAsignar?.software }}</strong>
      </p>
      <div v-if="licenciaAsignar" class="capacity">
        <div class="capacity-bar">
          <div
            class="capacity-fill"
            :class="capacidadInfo(licenciaAsignar).clase"
            :style="{ width: capacidadInfo(licenciaAsignar).pct + '%' }"
          ></div>
        </div>
        <span class="capacity-label">{{ licenciaAsignar.usados }}/{{ licenciaAsignar.cantidad }} asientos usados</span>
      </div>
      <div v-if="cargandoEmpleados" class="no-results">Cargando empleados...</div>
      <div v-else class="form-group">
        <label for="as-empleado">Empleado *</label>
        <BuscadorCombo
          id="as-empleado"
          v-model="empleadoAsignarId"
          :items="empleadosActivos"
          :campos-busqueda="['nombres', 'apellidos', 'dni']"
          :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
          placeholder="Buscar por nombre o DNI..."
          :disabled="asignando"
        >
          <template #resultado="{ item }">
            <span>{{ item.nombres }} {{ item.apellidos }}</span>
            <span class="combo-sec">{{ item.dni }}</span>
          </template>
        </BuscadorCombo>
      </div>

      <CarbonNotification v-if="errorAsignar" tipo="error">{{ errorAsignar }}</CarbonNotification>

      <template #acciones>
        <CarbonButton variante="secondary" :deshabilitado="asignando" @click="modalAsignar?.cerrar()">Cancelar</CarbonButton>
        <CarbonButton variante="primary" :cargando="asignando" :deshabilitado="!empleadoAsignarId" @click="confirmarAsignar">
          {{ asignando ? 'Asignando...' : 'Asignar' }}
        </CarbonButton>
      </template>
    </Modal>

    <!-- Confirmación (ConfirmDialog compartido): eliminar/liberar son
         destructivas (btn-danger); renovar no (btn-primary). -->
    <ConfirmDialog
      v-if="accionPendiente"
      ref="dialogoAccion"
      :destructivo="accionPendiente.tipo !== 'renovar'"
      :icono="iconoAccion"
      :titulo="tituloAccion"
      :mensaje="mensajeAccion"
      :confirmar-label="confirmarLabelAccion"
      :cargando="procesandoAccion"
      @cancel="accionPendiente = null"
      @confirm="confirmarAccionPendiente"
    />
  </div>
</template>

<style scoped>
.lic-error { color: var(--color-danger); }

.lic-acceso {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-label-01);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acceso-login {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.clave-cell {
  display: flex;
  align-items: center;
  gap: 2px;
}

.clave-origen {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle, var(--color-neutral-bg));
  border-radius: var(--radius-base);
  padding: 1px 6px;
  white-space: nowrap;
}

/* Ocupación de asientos: .capacity/.capacity-bar globales (main.css) */

.usuarios-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 240px;
}

.usuario-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-label-01);
  background: var(--color-bg-subtle, var(--color-neutral-bg));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 2px 8px;
  white-space: nowrap;
}

.chip-x {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: var(--icon-sm);
}

.chip-x:hover { color: var(--color-danger, var(--color-danger)); }

.venc-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.venc-periodo {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

/* Ancho: .modal-sm de la escala centralizada (main.css) */

.modal-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-body {
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.asignar-info {
  margin: 0;
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
}
</style>
