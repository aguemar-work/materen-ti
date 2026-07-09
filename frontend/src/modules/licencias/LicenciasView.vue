<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useLicenciasStore } from '../../stores/licencias.js';
import { insforgeApi } from '../../api/insforge.js';
import { revelarClaveLicencia, revelarPassword } from '../../api/passwords.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import LicenciaForm from './LicenciaForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';

const store = useLicenciasStore();
const { lista, total, cargando, error } = storeToRefs(store);

// Deep-link desde la búsqueda global: /licencias?q=SOFTWARE
const route = useRoute();
const busqueda = ref(String(route.query.q ?? ''));
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const mostrarForm = ref(false);
const licenciaEditar = ref(null);
const clavesVisibles = ref({});

let debounceBusqueda = null;
watch(busqueda, (q) => {
  clearTimeout(debounceBusqueda);
  debounceBusqueda = setTimeout(() => store.aplicarFiltros({ q: q.trim() }), 300);
});

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
  if (l.tipo === 'perpetua' || !l.fecha_vencimiento) return { clase: 'venc-ok', texto: 'Perpetua' };
  if (l.fecha_vencimiento < HOY) return { clase: 'venc-vencida', texto: `Venció ${formatFecha(l.fecha_vencimiento)}` };
  if (l.fecha_vencimiento <= EN_30_DIAS) return { clase: 'venc-pronto', texto: `Vence ${formatFecha(l.fecha_vencimiento)}` };
  return { clase: 'venc-ok', texto: formatFecha(l.fecha_vencimiento) };
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

async function renovar(lic) {
  const nueva = proximaFecha(lic);
  if (!confirm(`¿Renovar "${lic.software}"?\n\nNuevo vencimiento: ${formatFecha(nueva)} (${periodoLabel(lic.renovacion_meses).toLowerCase()})`)) return;
  try {
    await store.renovar(lic.id, nueva);
    showToast(`${lic.software} renovada hasta ${formatFecha(nueva)}`);
  } catch (e) {
    showToast(e?.message || 'Error al renovar', 'error');
  }
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

async function liberar(licencia, usuario) {
  if (!confirm(`¿Liberar el asiento de ${usuario.nombre} en "${licencia.software}"?`)) return;
  try {
    await store.liberar(usuario.asignacion_id);
    showToast('Asiento liberado');
  } catch (e) {
    showToast(e?.message || 'Error al liberar', 'error');
  }
}

async function eliminar(licencia) {
  if (!confirm(`¿Eliminar la licencia "${licencia.software}"?\nEl historial de asignaciones se conserva.`)) return;
  try {
    await store.softDelete(licencia.id);
    showToast('Licencia eliminada');
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  }
}

onMounted(async () => {
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
          <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
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

        <div v-if="cargando" class="no-results">Cargando licencias...</div>
        <div v-else-if="error" class="no-results lic-error">{{ error }}</div>

        <EmptyState
          v-else-if="total === 0"
          icono="ti ti-license"
          titulo="Sin licencias"
          :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Registra la primera licencia para ordenar el software que pagan.'"
        >
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNueva">
            <i class="ti ti-plus"></i> Nueva licencia
          </button>
        </EmptyState>

        <div v-else class="table-wrap">
          <table aria-label="Licencias de software">
            <thead>
              <tr>
                <th scope="col">Software</th>
                <th scope="col">Empresa</th>
                <th scope="col">Acceso</th>
                <th scope="col">Asientos</th>
                <th scope="col">Usuarios</th>
                <th scope="col">Vencimiento</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
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
                      {{ u.nombre }}
                      <button
                        v-if="u.asignacion_id"
                        class="chip-x"
                        type="button"
                        title="Liberar asiento"
                        aria-label="Liberar asiento"
                        @click="liberar(lic, u)"
                      >
                        <i class="ti ti-x"></i>
                      </button>
                    </span>
                  </div>
                  <TextoVacio v-else placeholder="Sin usuarios" />
                </td>
                <td>
                  <div class="venc-cell">
                    <span class="venc-badge" :class="estadoVencimiento(lic).clase">
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
                      @click="renovar(lic)"
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
                    <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="eliminar(lic)">
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <Pagination v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </div>
      </div>
    </main>

    <LicenciaForm
      v-if="mostrarForm"
      :licencia="licenciaEditar"
      @cerrar="onFormCerrado"
    />

    <!-- Modal: asignar asiento -->
    <div v-if="mostrarAsignar" class="modal-bg" @click.self="mostrarAsignar = false">
      <div class="modal modal-asignar" role="dialog">
        <div class="modal-title">
          <span><i class="ti ti-user-plus" aria-hidden="true"></i> Asignar asiento</span>
          <button class="icon-btn" type="button" @click="mostrarAsignar = false">
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
            <select id="as-empleado" v-model="empleadoAsignarId" :disabled="asignando">
              <option value="" disabled>Seleccionar empleado</option>
              <option v-for="emp in empleadosActivos" :key="emp.id" :value="emp.id">
                {{ emp.nombres }} {{ emp.apellidos }}
              </option>
            </select>
          </div>
          <p v-if="errorAsignar" class="form-error" role="alert">{{ errorAsignar }}</p>
          <div class="modal-actions">
            <button class="btn" type="button" :disabled="asignando" @click="mostrarAsignar = false">Cancelar</button>
            <button class="btn btn-primary" type="button" :disabled="asignando || !empleadoAsignarId" @click="confirmarAsignar">
              {{ asignando ? 'Asignando...' : 'Asignar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  font-family: monospace;
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

.venc-badge {
  display: inline-block;
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
  white-space: nowrap;
}

.venc-ok      { background: var(--color-success-bg); color: var(--color-success-text); }
.venc-pronto  { background: var(--color-warning-bg); color: var(--color-warning-text); border: 1px solid var(--color-warning-border); }
.venc-vencida { background: var(--color-danger-bg); color: var(--color-danger-text); border: 1px solid var(--color-danger-border); }

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

.modal-asignar {
  width: 420px;
  max-width: 95vw;
}

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
