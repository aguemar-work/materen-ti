<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useLicenciasStore } from '../../stores/licencias.js';
import { insforgeApi } from '../../api/insforge.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import { revelarClaveLicencia, revelarPassword } from '../../api/passwords.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import LicenciaForm from './LicenciaForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import { useBusqueda } from '../../composables/useBusqueda.js';

const store = useLicenciasStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

useRealtimeRefresco('licencias:list', () => store.cargar());

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// Deep-link desde la búsqueda global: /licencias?q=SOFTWARE
const route = useRoute();
busqueda.value = String(route.query.q ?? '');
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const mostrarForm = ref(false);
const licenciaEditar = ref(null);
const clavesVisibles = ref({});

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

// Modal de captura: clic fuera NO cierra (se perdería la selección);
// solo Cancelar, la X o Escape.
useCerrarConEscape(() => {
  if (mostrarAsignar.value && !asignando.value) mostrarAsignar.value = false;
});

// Foco atrapado mientras el modal está abierto (Fase 4)
const panelAsignar = ref(null);
useFocoAtrapado(panelAsignar, mostrarAsignar);

const HOY = new Date().toISOString().split('T')[0];
const EN_30_DIAS = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
})();

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
  if (l.tipo === 'perpetua' || !l.fecha_vencimiento) return { clase: 'badge--success', texto: 'Perpetua' };
  if (l.fecha_vencimiento < HOY) return { clase: 'badge--danger', texto: `Venció ${formatFecha(l.fecha_vencimiento)}` };
  if (l.fecha_vencimiento <= EN_30_DIAS) return { clase: 'badge--warning', texto: `Vence ${formatFecha(l.fecha_vencimiento)}` };
  return { clase: 'badge--success', texto: formatFecha(l.fecha_vencimiento) };
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
  } while (d.toISOString().split('T')[0] <= HOY);
  return d.toISOString().split('T')[0];
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

async function toggleClave(licencia) {
  if (clavesVisibles.value[licencia.id]) {
    clavesVisibles.value[licencia.id] = null;
    return;
  }
  try {
    clavesVisibles.value[licencia.id] = await revelarDeLicencia(licencia, 'ver');
  } catch (e) {
    showToast(e?.message || 'Error al revelar la clave', 'error');
  }
}

async function copiarClave(licencia) {
  try {
    const clave = await revelarDeLicencia(licencia, 'copiar');
    await navigator.clipboard.writeText(clave);
    showToast('Contraseña copiada');
  } catch (e) {
    showToast(e?.message || 'No se pudo copiar', 'error');
  }
}

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
      mostrarAsignar.value = false;
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
    await store.asignar(licenciaAsignar.value.id, empleadoAsignarId.value);
    mostrarAsignar.value = false;
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

async function confirmarAccionPendiente() {
  const a = accionPendiente.value;
  if (!a) return;
  procesandoAccion.value = true;
  try {
    if (a.tipo === 'liberar') {
      await store.liberar(a.usuario.asignacion_id);
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
        <button class="btn" type="button" title="Exportar a Excel (CSV)" :disabled="exportando" @click="exportar">
          <i :class="exportando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-table-export'" aria-hidden="true"></i> {{ exportando ? 'Exportando...' : 'Exportar' }}
        </button>
        <button class="btn btn-primary" type="button" @click="abrirNueva">
          <i class="ti ti-plus" aria-hidden="true"></i> Nueva licencia
        </button>
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

        <div v-if="error" class="no-results lic-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-license"
          titulo="Sin licencias"
          :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Registra la primera licencia para ordenar el software que pagan.'"
        >
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNueva">
            <i class="ti ti-plus"></i> Nueva licencia
          </button>
        </EmptyState>

        <div v-else-if="cargando || total > 0" class="table-wrap">
          <p v-if="cargando" class="sr-only" role="status">Cargando licencias…</p>
          <table aria-label="Licencias de software">
            <thead>
              <tr>
                <ThOrdenable clave="software" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Software</ThOrdenable>
                <th scope="col">Empresa</th>
                <th scope="col">Acceso</th>
                <th scope="col">Asientos</th>
                <th scope="col">Usuarios</th>
                <ThOrdenable clave="fecha_vencimiento" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Vencimiento</ThOrdenable>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="7" />
              <template v-else>
              <tr v-for="lic in lista" :key="lic.id">
                <td>
                  <div class="user-name">{{ lic.software }}</div>
                  <span v-if="lic.proveedor" class="lic-proveedor">{{ lic.proveedor }}</span>
                </td>
                <td>{{ lic.empresa_nombre || 'Del grupo' }}</td>
                <td>
                  <div v-if="lic.cuenta_id" class="acceso-login">
                    <span class="lic-acceso" :title="lic.cuenta_usuario">
                      <i class="ti ti-mail"></i> {{ lic.cuenta_usuario }}
                    </span>
                    <div class="clave-cell">
                      <span class="clave-text">{{ clavesVisibles[lic.id] || '••••••••' }}</span>
                      <button
                        class="icon-btn"
                        type="button"
                        :title="clavesVisibles[lic.id] ? 'Ocultar' : (lic.tiene_clave ? 'Mostrar contraseña del software' : 'Mostrar contraseña del correo')"
                        :aria-label="clavesVisibles[lic.id] ? 'Ocultar' : (lic.tiene_clave ? 'Mostrar contraseña del software' : 'Mostrar contraseña del correo')"
                        @click="toggleClave(lic)"
                      >
                        <i :class="clavesVisibles[lic.id] ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
                      </button>
                      <button class="icon-btn" type="button" title="Copiar contraseña" aria-label="Copiar contraseña" @click="copiarClave(lic)">
                        <i class="ti ti-copy"></i>
                      </button>
                      <span class="clave-origen">{{ lic.tiene_clave ? 'propia' : 'del correo' }}</span>
                    </div>
                  </div>
                  <div v-else-if="lic.tiene_clave" class="clave-cell">
                    <span class="clave-text">{{ clavesVisibles[lic.id] || '••••••••' }}</span>
                    <button class="icon-btn" type="button" :title="clavesVisibles[lic.id] ? 'Ocultar' : 'Mostrar clave'" :aria-label="clavesVisibles[lic.id] ? 'Ocultar' : 'Mostrar clave'" @click="toggleClave(lic)">
                      <i :class="clavesVisibles[lic.id] ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
                    </button>
                    <button class="icon-btn" type="button" title="Copiar clave" aria-label="Copiar clave" @click="copiarClave(lic)">
                      <i class="ti ti-copy"></i>
                    </button>
                  </div>
                  <TextoVacio v-else />
                </td>
                <td>
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
                </td>
                <td>
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
                </td>
                <td>
                  <div class="venc-cell">
                    <span class="badge" :class="estadoVencimiento(lic).clase">
                      {{ estadoVencimiento(lic).texto }}
                    </span>
                    <span v-if="lic.tipo === 'suscripcion' && lic.renovacion_meses" class="venc-periodo">
                      <i class="ti ti-refresh"></i> {{ periodoLabel(lic.renovacion_meses) }}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="actions">
                    <button
                      v-if="lic.tipo === 'suscripcion' && lic.renovacion_meses && lic.fecha_vencimiento"
                      class="icon-btn"
                      type="button"
                      title="Renovar (corre el vencimiento un periodo)"
                      aria-label="Renovar (corre el vencimiento un periodo)"
                      @click="pedirRenovar(lic)"
                    >
                      <i class="ti ti-refresh"></i>
                    </button>
                    <button
                      v-if="!lic.cuenta_id"
                      class="icon-btn"
                      type="button"
                      title="Asignar asiento a un empleado"
                      aria-label="Asignar asiento a un empleado"
                      :disabled="lic.usados >= lic.cantidad"
                      @click="abrirAsignar(lic)"
                    >
                      <i class="ti ti-user-plus"></i>
                    </button>
                    <button class="icon-btn" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(lic)">
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="pedirEliminar(lic)">
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
          <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </div>
      </div>
    </main>

    <LicenciaForm
      v-if="mostrarForm"
      :licencia="licenciaEditar"
      @cerrar="onFormCerrado"
    />

    <!-- Modal: asignar asiento -->
    <Transition name="modal-anim">
    <div v-if="mostrarAsignar" class="modal-bg">
      <div ref="panelAsignar" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="asignar-title" tabindex="-1">
        <div class="modal-title">
          <span id="asignar-title"><i class="ti ti-user-plus" aria-hidden="true"></i> Asignar asiento</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarAsignar = false">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body">
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
        </div>

        <p v-if="errorAsignar" class="form-error" role="alert">{{ errorAsignar }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" :disabled="asignando" @click="mostrarAsignar = false">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="asignando || !empleadoAsignarId" @click="confirmarAsignar">
            <i v-if="asignando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ asignando ? 'Asignando...' : 'Asignar' }}
          </button>
        </div>
      </div>
    </div>
    </Transition>

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

.lic-proveedor {
  display: block;
}

.lic-acceso {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
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
  font-size: 10.5px;
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle, var(--color-neutral-bg));
  border-radius: 8px;
  padding: 1px 6px;
  white-space: nowrap;
}

.clave-text {
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
  letter-spacing: 0.05em;
  min-width: 72px;
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
  font-size: 11.5px;
  background: var(--color-bg-subtle, var(--color-neutral-bg));
  border: 1px solid var(--color-border);
  border-radius: 20px;
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
  font-size: 12px;
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
  font-size: 11px;
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
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
