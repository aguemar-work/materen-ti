<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useEquiposStore } from '../../stores/equipos.js';
import { insforgeApi } from '../../api/insforge.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { SITUACIONES_EQUIPO, situacionInfo } from '../../core/dominio-equipos.js';
import { generarActa } from './acta.js';
import EquipoForm from './EquipoForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';

const store = useEquiposStore();
const { lista, total, cargando, error } = storeToRefs(store);

// Deep-link desde la búsqueda global: /equipos?q=CODIGO precarga el buscador.
const route = useRoute();
const busqueda = ref(String(route.query.q ?? ''));
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const filtroTipo = ref('');
const filtroSituacion = ref('');
const mostrarForm = ref(false);
const equipoEditar = ref(null);

const HOY = new Date().toISOString().split('T')[0];

let debounceBusqueda = null;
watch(busqueda, (q) => {
  clearTimeout(debounceBusqueda);
  debounceBusqueda = setTimeout(() => store.aplicarFiltros({ q: q.trim() }), 300);
});
watch(filtroTipo, (tipoId) => store.aplicarFiltros({ tipoId }));
watch(filtroSituacion, (situacion) => store.aplicarFiltros({ situacion }));

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
      'equipos',
      ['Código', 'Tipo', 'Marca', 'Modelo', 'Empresa', 'Serie', 'Situación', 'Portador / Ubicación', 'Garantía'],
      filas.map((eq) => [
        eq.codigo,
        eq.tipo_nombre,
        eq.marca,
        eq.modelo,
        eq.empresa_nombre,
        eq.serie,
        badgesSituacion(eq).map((b) => b.label).join(' · '),
        eq.portador || eq.ubicacion_nombre,
        eq.garantia_hasta,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// Un equipo tiene estado FÍSICO (operativo/en_reparacion/de_baja/perdido) y
// situación DERIVADA (Disponible/Asignado/En ubicación) simultáneos. Cuando
// está operativo Y en uso, mostrar ambos confirma de un vistazo que el
// equipo está sano *mientras* alguien lo tiene — con un solo badge no se ve.
// Si no está operativo, el estado físico ya lo dice todo (un solo badge).
function badgesSituacion(eq) {
  if (eq.estado === 'operativo' && (eq.situacion === 'asignado' || eq.situacion === 'en_ubicacion')) {
    const derivado = situacionInfo(eq.situacion);
    return [
      { label: 'Operativo', clase: 'badge--success', fisico: true },
      { label: derivado.label, clase: derivado.clase, fisico: false },
    ];
  }
  const info = situacionInfo(eq.situacion);
  return [{ label: info.label, clase: info.clase, fisico: false }];
}

// ── Formulario ────────────────────────────────────────────────
function abrirNuevo() {
  equipoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(equipo) {
  equipoEditar.value = equipo;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!equipoEditar.value;
  mostrarForm.value = false;
  equipoEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Equipo actualizado' : 'Equipo registrado');
}

// ── Asignar ───────────────────────────────────────────────────
const mostrarAsignar = ref(false);
const equipoAsignar = ref(null);
const empleadosActivos = ref([]);
const busquedaEmpleado = ref('');
const empleadoSelId = ref('');
const listaEmpAbierta = ref(false);
const condicionEntrega = ref('');
const procesando = ref(false);
const errorAsignar = ref('');

const empleadosFiltrados = computed(() => {
  const q = busquedaEmpleado.value.trim().toLowerCase();
  const base = q
    ? empleadosActivos.value.filter((e) =>
        `${e.nombres} ${e.apellidos}`.toLowerCase().includes(q) || e.dni.includes(q))
    : empleadosActivos.value;
  return base.slice(0, 8);
});

function seleccionarEmpleado(e) {
  empleadoSelId.value = e.id;
  busquedaEmpleado.value = `${e.nombres} ${e.apellidos}`;
  listaEmpAbierta.value = false;
}

function cerrarListaEmpleados() {
  // Pequeño retraso para que el clic en una opción alcance a ejecutarse
  setTimeout(() => { listaEmpAbierta.value = false; }, 150);
}

async function abrirAsignar(equipo) {
  equipoAsignar.value = equipo;
  empleadoSelId.value = '';
  busquedaEmpleado.value = '';
  condicionEntrega.value = '';
  errorAsignar.value = '';
  mostrarAsignar.value = true;
  if (!empleadosActivos.value.length) {
    try {
      const todos = await insforgeApi.listEmpleados();
      empleadosActivos.value = todos.filter((e) => e.estado === 'Activo');
    } catch (e) {
      showToast(e?.message || 'Error al cargar empleados', 'error');
      mostrarAsignar.value = false;
    }
  }
}

async function confirmarAsignar() {
  if (!empleadoSelId.value) return;
  errorAsignar.value = '';
  procesando.value = true;
  try {
    await store.asignar(equipoAsignar.value.id, empleadoSelId.value, condicionEntrega.value);
    mostrarAsignar.value = false;
    showToast(`${equipoAsignar.value.codigo} entregado`);
  } catch (e) {
    // Rechazo del trigger de asignación (portador activo o equipo no
    // operativo): se muestra dentro del modal, no solo en el toast.
    errorAsignar.value = e?.message || 'Error al asignar';
  } finally {
    procesando.value = false;
  }
}

// ── Devolver ──────────────────────────────────────────────────
const mostrarDevolver = ref(false);
const equipoDevolver = ref(null);
const condicionDevolucion = ref('');
const motivoCierre = ref('devolucion');
const aReparacion = ref(false);

function abrirDevolver(equipo) {
  equipoDevolver.value = equipo;
  condicionDevolucion.value = '';
  motivoCierre.value = equipo.portador_inactivo ? 'baja_empleado' : 'devolucion';
  aReparacion.value = false;
  mostrarDevolver.value = true;
}

async function confirmarDevolver() {
  procesando.value = true;
  try {
    await store.devolver(equipoDevolver.value.asignacion_id, equipoDevolver.value.id, {
      condicion: condicionDevolucion.value,
      motivo: motivoCierre.value,
      aReparacion: aReparacion.value,
    });
    mostrarDevolver.value = false;
    showToast(`${equipoDevolver.value.codigo} devuelto${aReparacion.value ? ' — enviado a reparación' : ''}`);
  } catch (e) {
    showToast(e?.message || 'Error al registrar devolución', 'error');
  } finally {
    procesando.value = false;
  }
}

// ── Mover a ubicación ─────────────────────────────────────────
const mostrarMover = ref(false);
const equipoMover = ref(null);
const ubicacionSelId = ref('');
const nuevaUbicacion = ref('');

function abrirMover(equipo) {
  equipoMover.value = equipo;
  ubicacionSelId.value = '';
  nuevaUbicacion.value = '';
  mostrarMover.value = true;
}

async function agregarUbicacion() {
  const nombre = nuevaUbicacion.value.trim();
  if (!nombre) return;
  try {
    const ub = await store.crearUbicacion(nombre);
    ubicacionSelId.value = ub.id;
    nuevaUbicacion.value = '';
    showToast(`Ubicación "${ub.nombre}" creada`);
  } catch (e) {
    showToast(e?.message || 'Error al crear ubicación', 'error');
  }
}

async function confirmarMover() {
  if (!ubicacionSelId.value) return;
  procesando.value = true;
  try {
    await store.mover(equipoMover.value.id, ubicacionSelId.value);
    mostrarMover.value = false;
    showToast(`${equipoMover.value.codigo} movido`);
  } catch (e) {
    showToast(e?.message || 'Error al mover', 'error');
  } finally {
    procesando.value = false;
  }
}

// ── Cambiar estado físico ─────────────────────────────────────
async function cambiarEstado(equipo, estado, label) {
  if (equipo.situacion === 'asignado' && (estado === 'de_baja' || estado === 'perdido')) {
    showToast('Registra primero la devolución (o ciérrala con motivo pérdida)', 'error');
    return;
  }
  if (!confirm(`¿Marcar ${equipo.codigo} como "${label}"?`)) return;
  try {
    await store.cambiarEstado(equipo.id, estado);
    showToast(`${equipo.codigo} → ${label}`);
  } catch (e) {
    showToast(e?.message || 'Error al cambiar estado', 'error');
  }
}

// ── Acta de entrega imprimible ────────────────────────────────
async function imprimirActa(equipo) {
  try {
    const empleado = await insforgeApi.getEmpleado(equipo.empleado_id);
    if (!empleado) throw new Error('No se encontró al empleado');
    generarActa(equipo, empleado);
  } catch (e) {
    showToast(e?.message || 'Error al generar el acta', 'error');
  }
}

// ── Hoja de vida ──────────────────────────────────────────────
const mostrarHoja = ref(false);
const equipoHoja = ref(null);
const eventos = ref([]);
const cargandoEventos = ref(false);

const EVENTO_ICONS = {
  registrado: 'ti ti-plus',
  asignado: 'ti ti-user-plus',
  devuelto: 'ti ti-arrow-back-up',
  estado_cambiado: 'ti ti-refresh',
};

async function verHoja(equipo) {
  equipoHoja.value = equipo;
  eventos.value = [];
  mostrarHoja.value = true;
  cargandoEventos.value = true;
  try {
    eventos.value = await insforgeApi.eventosEquipo(equipo.id);
  } catch (e) {
    showToast(e?.message || 'Error al cargar la hoja de vida', 'error');
    mostrarHoja.value = false;
  } finally {
    cargandoEventos.value = false;
  }
}

async function eliminar(equipo) {
  if (!confirm(`¿Eliminar el equipo ${equipo.codigo}?\nSu hoja de vida se conserva.`)) return;
  try {
    await store.softDelete(equipo.id);
    showToast('Equipo eliminado');
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  }
}

onMounted(async () => {
  try {
    const q = busqueda.value.trim();
    if (q) {
      await store.aplicarFiltros({ q });
    } else {
      await store.cargar();
    }
  } catch {
    showToast(error.value || 'Error al cargar equipos', 'error');
  }
});
</script>

<template>
  <div class="equipos-page vista-modulo">
    <PageHeader titulo="Equipos" icono="ti ti-devices" :conteo="total">
      <template #acciones>
        <button class="btn" type="button" title="Exportar a Excel (CSV)" :disabled="exportando" @click="exportar">
          <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
        </button>
        <button class="btn btn-primary" type="button" @click="abrirNuevo">
          <i class="ti ti-plus" aria-hidden="true"></i> Nuevo equipo
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por código, marca, serie o portador...">
          </div>
          <select v-model="filtroTipo">
            <option value="">Todos los tipos</option>
            <option v-for="t in store.tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
          </select>
          <select v-model="filtroSituacion">
            <option value="">Todas las situaciones</option>
            <option v-for="(s, k) in SITUACIONES_EQUIPO" :key="k" :value="k">{{ s.label }}</option>
          </select>
        </div>

        <div v-if="cargando" class="no-results">Cargando equipos...</div>
        <div v-else-if="error" class="no-results eq-error">{{ error }}</div>

        <EmptyState
          v-else-if="total === 0"
          icono="ti ti-devices"
          titulo="Sin equipos"
          :mensaje="busqueda || filtroTipo || filtroSituacion ? 'No hay resultados con los filtros aplicados.' : 'Registra el primer equipo del inventario.'"
        >
          <button v-if="!busqueda && !filtroTipo && !filtroSituacion" class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Nuevo equipo
          </button>
        </EmptyState>

        <div v-else class="table-wrap">
          <table aria-label="Inventario de equipos">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Equipo</th>
                <th scope="col">Serie</th>
                <th scope="col" class="th-situacion">Situación</th>
                <th scope="col">Portador</th>
                <th scope="col">Garantía</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="eq in lista" :key="eq.id">
                <td><span class="eq-codigo">{{ eq.codigo }}</span></td>
                <td>
                  <div class="eq-info">
                    <a v-if="eq.fotos.length" class="eq-foto" :href="eq.fotos[0].url" target="_blank" rel="noopener noreferrer" title="Ver foto" aria-label="Ver foto del equipo">
                      <img :src="eq.fotos[0].url" alt="">
                    </a>
                    <div>
                      <div class="user-name">{{ eq.tipo_nombre }} {{ eq.marca }}</div>
                      <span class="eq-modelo">{{ eq.modelo || '—' }}{{ eq.empresa_nombre ? ` · ${eq.empresa_nombre}` : '' }}</span>
                    </div>
                  </div>
                </td>
                <td class="eq-serie"><TextoVacio :valor="eq.serie" /></td>
                <td>
                  <span class="badge-group" :title="badgesSituacion(eq).map(b => b.label).join(' · ')">
                    <span
                      v-for="b in badgesSituacion(eq)"
                      :key="b.label"
                      class="badge"
                      :class="[b.clase, { 'badge-fisico': b.fisico }]"
                    >
                      {{ b.label }}
                    </span>
                  </span>
                </td>
                <td>
                  <template v-if="eq.portador">
                    <RouterLink class="portador-link" :to="`/empleados/${eq.empleado_id}`">{{ eq.portador }}</RouterLink>
                    <span v-if="eq.portador_inactivo" class="badge badge--danger badge-sin-devolver" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                      <i class="ti ti-alert-triangle"></i> Sin devolver
                    </span>
                  </template>
                  <span v-else-if="eq.ubicacion_nombre" class="ubicacion-nombre">
                    <i class="ti ti-map-pin"></i> {{ eq.ubicacion_nombre }}
                  </span>
                  <TextoVacio v-else />
                </td>
                <td>
                  <span v-if="eq.garantia_hasta" :class="{ 'garantia-vencida': eq.garantia_hasta < HOY }">
                    {{ formatFecha(eq.garantia_hasta) }}
                  </span>
                  <TextoVacio v-else />
                </td>
                <td>
                  <div class="actions">
                    <button
                      v-if="eq.situacion === 'disponible' || eq.situacion === 'en_ubicacion'"
                      class="icon-btn"
                      type="button"
                      title="Entregar a un empleado"
                      aria-label="Entregar a un empleado"
                      @click="abrirAsignar(eq)"
                    >
                      <i class="ti ti-user-plus"></i>
                    </button>
                    <button
                      v-if="eq.situacion === 'disponible' || eq.situacion === 'en_ubicacion'"
                      class="icon-btn"
                      type="button"
                      title="Mover a una ubicación"
                      aria-label="Mover a una ubicación"
                      @click="abrirMover(eq)"
                    >
                      <i class="ti ti-map-pin"></i>
                    </button>
                    <button
                      v-if="eq.situacion === 'asignado'"
                      class="icon-btn"
                      type="button"
                      title="Imprimir acta de entrega"
                      aria-label="Imprimir acta de entrega"
                      @click="imprimirActa(eq)"
                    >
                      <i class="ti ti-printer"></i>
                    </button>
                    <button
                      v-if="eq.situacion === 'asignado'"
                      class="icon-btn"
                      type="button"
                      title="Registrar devolución"
                      aria-label="Registrar devolución"
                      @click="abrirDevolver(eq)"
                    >
                      <i class="ti ti-arrow-back-up"></i>
                    </button>
                    <button
                      v-if="eq.situacion === 'disponible' || eq.situacion === 'en_ubicacion'"
                      class="icon-btn"
                      type="button"
                      title="Enviar a reparación"
                      aria-label="Enviar a reparación"
                      @click="cambiarEstado(eq, 'en_reparacion', 'En reparación')"
                    >
                      <i class="ti ti-tool"></i>
                    </button>
                    <button
                      v-if="eq.situacion === 'en_reparacion'"
                      class="icon-btn"
                      type="button"
                      title="Marcar reparado (operativo)"
                      aria-label="Marcar reparado (operativo)"
                      @click="cambiarEstado(eq, 'operativo', 'Operativo')"
                    >
                      <i class="ti ti-circle-check"></i>
                    </button>
                    <button class="icon-btn" type="button" title="Hoja de vida" aria-label="Hoja de vida" @click="verHoja(eq)">
                      <i class="ti ti-history"></i>
                    </button>
                    <button class="icon-btn" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(eq)">
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button
                      v-if="eq.situacion !== 'asignado' && eq.estado !== 'de_baja'"
                      class="icon-btn danger"
                      type="button"
                      title="Dar de baja el equipo"
                      aria-label="Dar de baja el equipo"
                      @click="cambiarEstado(eq, 'de_baja', 'De baja')"
                    >
                      <i class="ti ti-circle-off"></i>
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

    <EquipoForm v-if="mostrarForm" :equipo="equipoEditar" @cerrar="onFormCerrado" />

    <!-- Modal: entregar equipo -->
    <div v-if="mostrarAsignar" class="modal-bg" @click.self="mostrarAsignar = false">
      <div class="modal modal-sm" role="dialog">
        <div class="modal-title">
          <span><i class="ti ti-user-plus" aria-hidden="true"></i> Entregar {{ equipoAsignar?.codigo }}</span>
          <button class="icon-btn" type="button" @click="mostrarAsignar = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">{{ equipoAsignar?.tipo_nombre }} {{ equipoAsignar?.marca }} {{ equipoAsignar?.modelo }}</p>

          <div class="form-group combo-emp">
            <label for="asig-emp">Empleado *</label>
            <div class="combo-wrap">
              <i class="ti ti-search combo-icon"></i>
              <input
                id="asig-emp"
                v-model="busquedaEmpleado"
                type="text"
                autocomplete="off"
                placeholder="Buscar por nombre o DNI..."
                :class="{ 'combo-ok': empleadoSelId }"
                @input="empleadoSelId = ''; listaEmpAbierta = true"
                @focus="listaEmpAbierta = true"
                @blur="cerrarListaEmpleados"
              >
              <i v-if="empleadoSelId" class="ti ti-circle-check-filled combo-check"></i>
              <ul v-if="listaEmpAbierta && !empleadoSelId" class="combo-lista">
                <li v-if="empleadosFiltrados.length === 0" class="combo-vacio">Sin resultados</li>
                <li v-for="e in empleadosFiltrados" :key="e.id" @mousedown.prevent="seleccionarEmpleado(e)">
                  <span>{{ e.nombres }} {{ e.apellidos }}</span>
                  <span class="combo-sec">{{ e.dni }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div class="form-group">
            <label for="asig-cond">Condición de entrega</label>
            <input id="asig-cond" v-model="condicionEntrega" placeholder="ej: nuevo, con cargador y mochila" :disabled="procesando">
          </div>

          <p v-if="errorAsignar" class="form-error" role="alert">{{ errorAsignar }}</p>

          <div class="modal-actions">
            <button class="btn" type="button" :disabled="procesando" @click="mostrarAsignar = false">Cancelar</button>
            <button class="btn btn-primary" type="button" :disabled="procesando || !empleadoSelId" @click="confirmarAsignar">
              {{ procesando ? 'Entregando...' : 'Entregar' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: registrar devolución -->
    <div v-if="mostrarDevolver" class="modal-bg" @click.self="mostrarDevolver = false">
      <div class="modal modal-sm" role="dialog">
        <div class="modal-title">
          <span><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Devolución de {{ equipoDevolver?.codigo }}</span>
          <button class="icon-btn" type="button" @click="mostrarDevolver = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">Lo tiene: <strong>{{ equipoDevolver?.portador }}</strong></p>

          <div class="form-group">
            <label for="dev-cond">Condición en que vuelve *</label>
            <input id="dev-cond" v-model="condicionDevolucion" required placeholder="ej: operativo / pantalla rota / sin cargador" :disabled="procesando">
          </div>

          <div class="form-group">
            <label for="dev-motivo">Motivo</label>
            <select id="dev-motivo" v-model="motivoCierre" :disabled="procesando">
              <option value="devolucion">Devolución normal</option>
              <option value="cambio_equipo">Cambio de equipo</option>
              <option value="baja_empleado">Baja del empleado</option>
              <option value="perdida">Pérdida / robo</option>
            </select>
          </div>

          <label class="check-reparacion">
            <input v-model="aReparacion" type="checkbox" :disabled="procesando">
            Volvió dañado — enviarlo a reparación
          </label>

          <div class="modal-actions">
            <button class="btn" type="button" :disabled="procesando" @click="mostrarDevolver = false">Cancelar</button>
            <button class="btn btn-primary" type="button" :disabled="procesando || !condicionDevolucion.trim()" @click="confirmarDevolver">
              {{ procesando ? 'Registrando...' : 'Registrar devolución' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: mover a ubicación -->
    <div v-if="mostrarMover" class="modal-bg" @click.self="mostrarMover = false">
      <div class="modal modal-sm" role="dialog">
        <div class="modal-title">
          <span><i class="ti ti-map-pin" aria-hidden="true"></i> Mover {{ equipoMover?.codigo }}</span>
          <button class="icon-btn" type="button" @click="mostrarMover = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">
            {{ equipoMover?.tipo_nombre }} {{ equipoMover?.marca }} {{ equipoMover?.modelo }}
            <template v-if="equipoMover?.ubicacion_nombre"> — hoy en <strong>{{ equipoMover?.ubicacion_nombre }}</strong></template>
          </p>

          <div class="form-group">
            <label for="mov-ubicacion">Ubicación destino *</label>
            <select id="mov-ubicacion" v-model="ubicacionSelId" :disabled="procesando">
              <option value="" disabled>Seleccionar ubicación</option>
              <option v-for="u in store.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
            </select>
          </div>

          <div class="form-group">
            <label for="mov-nueva">¿No existe? Créala aquí</label>
            <div class="nueva-ubicacion">
              <input
                id="mov-nueva"
                v-model="nuevaUbicacion"
                placeholder="ej: Oficina Contabilidad, Obra San Isidro..."
                :disabled="procesando"
                @keydown.enter.prevent="agregarUbicacion"
              >
              <button class="btn" type="button" :disabled="procesando || !nuevaUbicacion.trim()" @click="agregarUbicacion">
                Crear
              </button>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn" type="button" :disabled="procesando" @click="mostrarMover = false">Cancelar</button>
            <button class="btn btn-primary" type="button" :disabled="procesando || !ubicacionSelId" @click="confirmarMover">
              {{ procesando ? 'Moviendo...' : 'Mover' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: hoja de vida -->
    <div v-if="mostrarHoja" class="modal-bg" @click.self="mostrarHoja = false">
      <div class="modal modal-hoja" role="dialog">
        <div class="modal-title">
          <span><i class="ti ti-history" aria-hidden="true"></i> Hoja de vida — {{ equipoHoja?.codigo }}</span>
          <button class="icon-btn" type="button" @click="mostrarHoja = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">{{ equipoHoja?.tipo_nombre }} {{ equipoHoja?.marca }} {{ equipoHoja?.modelo }}</p>
          <div v-if="cargandoEventos" class="no-results">Cargando...</div>
          <ul v-else class="hoja-lista">
            <li v-for="ev in eventos" :key="ev.id">
              <i :class="EVENTO_ICONS[ev.evento] || 'ti ti-point'"></i>
              <div class="hoja-info">
                <span class="hoja-detalle">{{ ev.detalle }}</span>
                <span class="hoja-meta">{{ formatFechaHora(ev.created_at) }}{{ ev.user_email ? ` · ${ev.user_email}` : '' }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eq-error { color: var(--color-danger); }

/* Datos uniformes: solo cambia la familia (mono para identificadores),
   nunca el peso/tamaño/color */
.eq-codigo {
  font-family: var(--font-mono, monospace);
}

.eq-modelo {
  display: block;
}

.eq-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.eq-foto {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.eq-foto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.eq-serie {
  font-family: var(--font-mono, monospace);
}

/* Estructura y color: sistema de badges global (.badge + .badge--X) */

/* Columna Situación: ancho mínimo para que el badge doble (físico +
   derivado) no se corte. En pantallas chicas, si no entra, se prioriza
   el estado derivado (el físico queda accesible en el title del grupo). */
.th-situacion { min-width: 168px; }

@media (max-width: 900px) {
  .badge-fisico { display: none; }
}

.ubicacion-nombre {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Solo el icono conserva el color de la familia "ubicaciones" */
.ubicacion-nombre i { color: var(--color-purple-text); }

.nueva-ubicacion {
  display: flex;
  gap: 6px;
}

.nueva-ubicacion input { flex: 1; }

.portador-link {
  color: var(--color-text-primary);
  text-decoration: none;
  font-size: 13px;
}

.portador-link:hover { color: var(--color-primary); text-decoration: underline; }

.badge-sin-devolver {
  /* Estructura y color: sistema de badges global (.badge + .badge--danger);
     aquí solo el ajuste único de este chip: separación del texto vecino.
     Sin peso extra: 700 se reserva para stat cards y wordmark (Materen Core #fundaciones). */
  margin-left: 6px;
}

.garantia-vencida { color: var(--color-danger-text); }

.modal-sm { width: 440px; max-width: 95vw; }
.modal-hoja { width: 560px; max-width: 95vw; }

.modal-title { display: flex; align-items: center; justify-content: space-between; }

.modal-body {
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-info {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.check-reparacion {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
}

/* Combobox empleado */
.combo-wrap { position: relative; }
.combo-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-text-secondary); font-size: 15px; pointer-events: none;
}
.combo-wrap input { width: 100%; padding-left: 32px; padding-right: 32px; }
.combo-wrap input.combo-ok { border-color: var(--color-success); }
.combo-check {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-success); font-size: 16px; pointer-events: none;
}
.combo-lista {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 20;
  margin: 0; padding: 4px; list-style: none;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  max-height: 240px; overflow-y: auto;
}
.combo-lista li {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.combo-lista li:hover { background: color-mix(in srgb, var(--color-primary, var(--color-accent)) 8%, transparent); }
.combo-vacio { color: var(--color-text-secondary); cursor: default !important; font-size: 12.5px; }
.combo-vacio:hover { background: none !important; }
.combo-sec { font-size: 11.5px; color: var(--color-text-secondary); }

/* Hoja de vida */
.hoja-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.hoja-lista li {
  display: flex;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--color-border);
}

.hoja-lista li:last-child { border-bottom: none; }

.hoja-lista li > i {
  font-size: 16px;
  color: var(--color-primary);
  margin-top: 1px;
  flex-shrink: 0;
}

.hoja-info { display: flex; flex-direction: column; min-width: 0; }
.hoja-detalle { font-size: 13px; color: var(--color-text-primary); }
.hoja-meta { font-size: 11.5px; color: var(--color-text-secondary); }
</style>
