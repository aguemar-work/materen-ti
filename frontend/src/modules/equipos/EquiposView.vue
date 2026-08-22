<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useEquiposStore } from '../../stores/equipos.js';
import { insforgeApi } from '../../api/insforge.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora } from '../../core/formatters.js';
import { SITUACIONES_EQUIPO, situacionInfo } from '../../core/dominio-equipos.js';
import { generarActa } from './acta.js';
import { generarActaDevolucion } from './acta-devolucion.js';
import { construirDatosReporteEquipos, generarReporteEquipos, LIMITE_MOVIMIENTOS_PDF } from './reporteEquipos.js';
import EquipoForm from './EquipoForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
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

const store = useEquiposStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

useRealtimeRefresco('equipos:list', () => store.cargar(), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// Deep-link desde la búsqueda global: /equipos?q=CODIGO precarga el buscador.
const route = useRoute();
busqueda.value = String(route.query.q ?? '');
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const filtroTipo = ref('');
const filtroSituacion = ref('');
const mostrarForm = ref(false);
const equipoEditar = ref(null);

watch(filtroTipo, (tipoId) => store.aplicarFiltros({ tipoId }));
watch(filtroSituacion, (situacion) => store.aplicarFiltros({ situacion }));

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

// PDF: siempre el inventario COMPLETO (sin los filtros del toolbar), es la
// foto de todo el parque — decisión de producto 2026-08-22, distinto del
// CSV de arriba, que sí exporta lo que esté filtrado.
const generandoPdf = ref(false);
async function descargarPdf() {
  generandoPdf.value = true;
  try {
    const [equipos, movimientos] = await Promise.all([
      insforgeApi.listEquiposFiltrados({}),
      insforgeApi.ultimosMovimientos(LIMITE_MOVIMIENTOS_PDF),
    ]);
    await generarReporteEquipos({ ...construirDatosReporteEquipos(equipos), movimientos });
  } catch (e) {
    showToast(e?.message || 'No se pudo generar el PDF', 'error');
  } finally {
    generandoPdf.value = false;
  }
}

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'equipos',
      ['Código equipo', 'Código almacén', 'Tipo', 'Marca', 'Modelo', 'Empresa', 'Serie', 'Situación', 'Asignado a', 'Ubicación'],
      filas.map((eq) => [
        eq.codigo,
        eq.codigo_almacen,
        eq.tipo_nombre,
        eq.marca,
        eq.modelo,
        eq.empresa_nombre,
        eq.serie,
        badgeEstadoFisico(eq).label,
        eq.portador,
        eq.ubicacion_nombre,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// Columna Situación: solo el estado FÍSICO (operativo/en_reparacion/de_baja/
// perdido). Si está asignado a un empleado o en una ubicación ya se ve en
// las columnas "Asignado a"/"Ubicación" — repetirlo acá era redundante.
// `eq.situacion` (disponible/asignado/en_ubicacion) sigue intacto para el
// filtro del toolbar y las condiciones de accionesDe()/enAlmacen().
function badgeEstadoFisico(eq) {
  if (eq.estado === 'operativo') return { label: 'Operativo', clase: 'badge--success' };
  return situacionInfo(eq.estado);
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
const empleadoSelId = ref('');
const condicionEntrega = ref('');
const procesando = ref(false);
const errorAsignar = ref('');

async function abrirAsignar(equipo) {
  equipoAsignar.value = equipo;
  empleadoSelId.value = '';
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

// "Perdida/robo" y "volvió dañado" son contradictorios (el backend ya le da
// prioridad a perdida, pero mejor que el form ni permita capturar la mezcla):
// al elegir ese motivo, el checkbox se desmarca y se deshabilita solo.
watch(motivoCierre, (motivo) => {
  if (motivo === 'perdida') aReparacion.value = false;
});

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
    const datosDevolucion = {
      condicion: condicionDevolucion.value,
      motivo: motivoCierre.value,
      aReparacion: aReparacion.value,
      fecha: new Date().toISOString(),
    };
    await store.devolver(equipoDevolver.value.asignacion_id, equipoDevolver.value.id, {
      condicion: datosDevolucion.condicion,
      motivo: datosDevolucion.motivo,
      aReparacion: datosDevolucion.aReparacion,
    });
    const equipoDevuelto = equipoDevolver.value;
    mostrarDevolver.value = false;
    showToast(`${equipoDevuelto.codigo} devuelto${aReparacion.value ? ' — enviado a reparación' : ''}`);
    try {
      const empleado = await insforgeApi.getEmpleado(equipoDevuelto.empleado_id);
      if (empleado) generarActaDevolucion(equipoDevuelto, empleado, datosDevolucion);
    } catch (e) {
      showToast(e?.message || 'No se pudo generar el acta de devolución', 'error');
    }
  } catch (e) {
    showToast(e?.message || 'Error al registrar devolución', 'error');
  } finally {
    procesando.value = false;
  }
}

// ── Mover a ubicación (edición inline en la columna Ubicación) ─
// Cambio de un solo campo, reversible y de bajo riesgo: se guarda al
// cambiar el <select>, sin modal ni confirmación (mismo patrón que
// StaffView usa para "Rol").
const moviendoId = ref(null);
const creandoUbicacionId = ref(null); // eq.id de la fila que muestra el input "nueva ubicación"
const nombreNuevaUbicacion = ref('');

async function onCambiarUbicacion(eq, valor) {
  if (valor === '__nueva__') {
    creandoUbicacionId.value = eq.id;
    nombreNuevaUbicacion.value = '';
    return;
  }
  if (!valor || valor === eq.ubicacion_id) return;
  moviendoId.value = eq.id;
  try {
    await store.mover(eq.id, valor);
    showToast(`${eq.codigo} movido`);
  } catch (e) {
    showToast(e?.message || 'Error al mover', 'error');
  } finally {
    moviendoId.value = null;
  }
}

function cancelarNuevaUbicacion() {
  creandoUbicacionId.value = null;
  nombreNuevaUbicacion.value = '';
}

async function confirmarNuevaUbicacion(eq) {
  const nombre = nombreNuevaUbicacion.value.trim();
  if (!nombre) return;
  moviendoId.value = eq.id;
  try {
    const ub = await store.crearUbicacion(nombre);
    await store.mover(eq.id, ub.id);
    showToast(`Ubicación "${ub.nombre}" creada — ${eq.codigo} movido`);
  } catch (e) {
    showToast(e?.message || 'Error al crear ubicación', 'error');
  } finally {
    moviendoId.value = null;
    creandoUbicacionId.value = null;
    nombreNuevaUbicacion.value = '';
  }
}

// Los modales de captura (entregar/devolver) no se cierran con clic fuera
// para no perder lo escrito; Escape sí los cierra. El de hoja de impresión
// (informativo) conserva el cierre por clic en el fondo.
useCerrarConEscape(() => {
  if (procesando.value) return;
  if (mostrarAsignar.value) mostrarAsignar.value = false;
  else if (mostrarDevolver.value) mostrarDevolver.value = false;
});

// ── Cambiar estado físico ─────────────────────────────────────
// Confirmación (ConfirmDialog compartido): una sola instancia para las 5
// transiciones (a reparación / reparado / de baja / reactivar / recuperar).
// Solo "de_baja" es destructiva (btn-danger); las demás (incluidas
// reactivar/recuperar, que devuelven el equipo a servicio) usan el botón
// primario, mismo criterio que "Renovar licencia"/"Reactivar empleado".
const accionPendiente = ref(null); // { equipo, estado, estadoLabel, titulo, mensaje, confirmarLabel, destructivo }
const procesandoAccion = ref(false);
const dialogoAccion = ref(null);

const tituloAccion = computed(() => accionPendiente.value?.titulo || '');
const mensajeAccion = computed(() => accionPendiente.value?.mensaje || '');
const destructivoAccion = computed(() => !!accionPendiente.value?.destructivo);
const confirmarLabelAccion = computed(() => accionPendiente.value?.confirmarLabel || 'Confirmar');

function pedirCambiarEstado(equipo, estado, label) {
  if (equipo.situacion === 'asignado' && (estado === 'de_baja' || estado === 'perdido')) {
    showToast('Registra primero la devolución (o ciérrala con motivo pérdida)', 'error');
    return;
  }
  accionPendiente.value = {
    equipo,
    estado,
    estadoLabel: label,
    titulo: `Marcar como “${label}”`,
    mensaje: `¿Marcar ${equipo.codigo} como “${label}”?`,
    confirmarLabel: label,
    destructivo: estado === 'de_baja',
  };
}

// Reactivar (de_baja → operativo) y recuperar (perdido → operativo): un
// equipo de_baja/perdido nunca tiene asignación activa a un empleado (todas
// las vías que llevan a esos estados cierran o bloquean esa asignación
// primero), así que no hace falta ninguna validación extra acá. Si el
// equipo conservaba una asignación activa a UBICACIÓN, vuelve a esa
// ubicación en vez de "disponible" — mismo comportamiento ya aceptado hoy
// para "Marcar reparado".
function pedirReactivar(equipo) {
  accionPendiente.value = {
    equipo,
    estado: 'operativo',
    estadoLabel: 'Operativo',
    titulo: 'Reactivar equipo',
    mensaje: '¿Reactivar este equipo? Volverá a estar disponible.',
    confirmarLabel: 'Reactivar',
    destructivo: false,
  };
}

function pedirRecuperar(equipo) {
  accionPendiente.value = {
    equipo,
    estado: 'operativo',
    estadoLabel: 'Operativo',
    titulo: 'Marcar como recuperado',
    mensaje: '¿Marcar este equipo como recuperado? Volverá a estar disponible.',
    confirmarLabel: 'Marcar recuperado',
    destructivo: false,
  };
}

async function confirmarAccionPendiente() {
  const a = accionPendiente.value;
  if (!a) return;
  procesandoAccion.value = true;
  try {
    await store.cambiarEstado(a.equipo.id, a.estado);
    showToast(`${a.equipo.codigo} → ${a.estadoLabel}`);
    dialogoAccion.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al cambiar estado', 'error');
  } finally {
    procesandoAccion.value = false;
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

// Foco atrapado por modal inline (Fase 4): cada uno sigue su flag de
// apertura; al cerrarse, el foco vuelve al botón que lo abrió
const panelAsignar = ref(null);
const panelDevolver = ref(null);
const panelHoja = ref(null);
useFocoAtrapado(panelAsignar, mostrarAsignar);
useFocoAtrapado(panelDevolver, mostrarDevolver);
useFocoAtrapado(panelHoja, mostrarHoja);

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

// Equipo en almacén (disponible o en una ubicación, sin portador): puede
// entregarse, moverse de ubicación o enviarse a reparación. Se usa tanto
// para las acciones por fila como para decidir si la columna Ubicación
// muestra el <select> editable (desktop y tarjeta móvil).
function enAlmacen(eq) {
  return eq.situacion === 'disponible' || eq.situacion === 'en_ubicacion';
}

// ── Acciones por equipo ───────────────────────────────────────
// Fuente única de las acciones condicionales por fila: la tabla de
// escritorio las pinta como icon-btn (o las cuelga del menú ⋮ si `overflow`
// es true) y las tarjetas móviles siempre las cuelan todas del menú ⋮.
// Las condiciones `visible` replican el estado físico/derivado del equipo.
function accionesDe(eq) {
  return [
    { icono: 'ti-user-plus', label: 'Entregar a un empleado', visible: enAlmacen(eq), onClick: () => abrirAsignar(eq) },
    { icono: 'ti-printer', label: 'Imprimir acta de entrega', visible: eq.situacion === 'asignado', overflow: true, onClick: () => imprimirActa(eq) },
    { icono: 'ti-arrow-back-up', label: 'Registrar devolución', visible: eq.situacion === 'asignado', onClick: () => abrirDevolver(eq) },
    { icono: 'ti-tool', label: 'Enviar a reparación', visible: enAlmacen(eq), overflow: true, onClick: () => pedirCambiarEstado(eq, 'en_reparacion', 'En reparación') },
    { icono: 'ti-circle-check', label: 'Marcar reparado (operativo)', visible: eq.situacion === 'en_reparacion', onClick: () => pedirCambiarEstado(eq, 'operativo', 'Operativo') },
    { icono: 'ti-history', label: 'Hoja de vida', overflow: true, onClick: () => verHoja(eq) },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(eq) },
    {
      icono: 'ti-circle-off',
      label: 'Dar de baja el equipo',
      danger: true,
      overflow: true,
      visible: eq.situacion !== 'asignado' && eq.estado !== 'de_baja',
      onClick: () => pedirCambiarEstado(eq, 'de_baja', 'De baja'),
    },
    { icono: 'ti-refresh', label: 'Reactivar equipo', visible: eq.situacion === 'de_baja', onClick: () => pedirReactivar(eq) },
    { icono: 'ti-circle-check', label: 'Marcar como recuperado', visible: eq.situacion === 'perdido', onClick: () => pedirRecuperar(eq) },
  ];
}

function accionesVisibles(eq) {
  return accionesDe(eq).filter((a) => a.visible !== false);
}

// Escritorio: solo la acción principal + Editar quedan sueltas como icon-btn;
// el resto se cuelga del mismo MenuAcciones que ya usa la tarjeta móvil, para
// no repetir hasta 6 íconos sin etiqueta en una sola fila (equipo en almacén).
function accionesInlineDe(eq) {
  return accionesVisibles(eq).filter((a) => !a.overflow);
}

function accionesOverflowDe(eq) {
  return accionesVisibles(eq).filter((a) => a.overflow);
}

onMounted(async () => {
  store.resetearFiltros();
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
          <i :class="exportando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-table-export'" aria-hidden="true"></i> {{ exportando ? 'Exportando...' : 'Exportar' }}
        </button>
        <button class="btn" type="button" :disabled="generandoPdf" @click="descargarPdf">
          <i :class="generandoPdf ? 'ti ti-loader-2 spinner-icon' : 'ti ti-download'" aria-hidden="true"></i>
          {{ generandoPdf ? 'Generando...' : 'Descargar PDF' }}
        </button>
        <RouterLink class="btn" to="/equipos/importar" title="Importar equipos desde un Excel de activos">
          <i class="ti ti-file-import" aria-hidden="true"></i> Importar desde Excel
        </RouterLink>
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
          <div class="filter-field">
            <label for="filtro-tipo">Tipo</label>
            <select id="filtro-tipo" v-model="filtroTipo">
              <option value="">Todos los tipos</option>
              <option v-for="t in store.tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
            </select>
          </div>
          <div class="filter-field">
            <label for="filtro-situacion">Situación</label>
            <select id="filtro-situacion" v-model="filtroSituacion">
              <option value="">Todas las situaciones</option>
              <option v-for="(s, k) in SITUACIONES_EQUIPO" :key="k" :value="k">{{ s.label }}</option>
            </select>
          </div>
        </div>

        <div v-if="cargando" class="no-results solo-movil">Cargando equipos...</div>
        <div v-else-if="error" class="no-results eq-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-devices"
          titulo="Sin equipos"
          :mensaje="busqueda || filtroTipo || filtroSituacion ? 'No hay resultados con los filtros aplicados.' : 'Registra el primer equipo del inventario.'"
        >
          <button v-if="!busqueda && !filtroTipo && !filtroSituacion" class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Nuevo equipo
          </button>
        </EmptyState>

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando equipos…</p>
        <div class="table-wrap solo-escritorio">
          <table aria-label="Inventario de equipos">
            <thead>
              <tr>
                <ThOrdenable clave="codigo" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Código equipo</ThOrdenable>
                <ThOrdenable clave="codigo_almacen" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Código almacén</ThOrdenable>
                <th scope="col">Equipo</th>
                <ThOrdenable clave="serie" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Serie</ThOrdenable>
                <th scope="col" class="th-situacion">Situación</th>
                <th scope="col">Asignado a</th>
                <th scope="col">Ubicación</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="8" />
              <template v-else>
              <tr v-for="eq in lista" :key="eq.id">
                <td><span class="eq-codigo">{{ eq.codigo }}</span></td>
                <td class="eq-codigo-almacen"><TextoVacio :valor="eq.codigo_almacen" /></td>
                <td>
                  <div class="eq-info">
                    <a v-if="eq.fotos.length" class="eq-foto" :href="eq.fotos[0].url" target="_blank" rel="noopener noreferrer" title="Ver foto" aria-label="Ver foto del equipo">
                      <img :src="eq.fotos[0].url" alt="">
                    </a>
                    <div>
                      <div class="user-name">{{ eq.tipo_nombre }} {{ eq.marca }}</div>
                      <span class="eq-modelo"><TextoVacio :valor="eq.modelo" />{{ eq.empresa_nombre ? ` · ${eq.empresa_nombre}` : '' }}</span>
                    </div>
                  </div>
                </td>
                <td class="eq-serie"><TextoVacio :valor="eq.serie" /></td>
                <td>
                  <span class="badge" :class="badgeEstadoFisico(eq).clase">{{ badgeEstadoFisico(eq).label }}</span>
                </td>
                <td>
                  <template v-if="eq.portador">
                    <RouterLink class="empleado-link" :to="`/empleados/${eq.empleado_id}`">{{ eq.portador }}</RouterLink>
                    <span v-if="eq.portador_inactivo" class="badge badge--danger badge-sin-devolver" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                      <i class="ti ti-alert-triangle"></i> Sin devolver
                    </span>
                  </template>
                  <TextoVacio v-else />
                </td>
                <td>
                  <div v-if="creandoUbicacionId === eq.id" class="ubicacion-nueva-inline">
                    <input
                      v-model="nombreNuevaUbicacion"
                      placeholder="Nombre de la ubicación"
                      :disabled="moviendoId === eq.id"
                      @keydown.enter.prevent="confirmarNuevaUbicacion(eq)"
                      @keydown.esc.prevent="cancelarNuevaUbicacion"
                    >
                    <button class="icon-btn" type="button" title="Crear y mover aquí" :disabled="moviendoId === eq.id || !nombreNuevaUbicacion.trim()" @click="confirmarNuevaUbicacion(eq)">
                      <i class="ti" :class="moviendoId === eq.id ? 'ti-loader-2 spinner-icon' : 'ti-check'"></i>
                    </button>
                    <button class="icon-btn" type="button" title="Cancelar" :disabled="moviendoId === eq.id" @click="cancelarNuevaUbicacion">
                      <i class="ti ti-x"></i>
                    </button>
                  </div>
                  <select
                    v-else-if="enAlmacen(eq)"
                    class="ubicacion-select"
                    :value="eq.ubicacion_id || ''"
                    :disabled="moviendoId === eq.id"
                    aria-label="Ubicación"
                    @change="onCambiarUbicacion(eq, $event.target.value)"
                  >
                    <option value="" disabled>Seleccionar ubicación</option>
                    <option v-for="u in store.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
                    <option value="__nueva__">+ Crear nueva ubicación…</option>
                  </select>
                  <template v-else>
                    <span v-if="eq.ubicacion_nombre" class="ubicacion-nombre">
                      <i class="ti ti-map-pin"></i> {{ eq.ubicacion_nombre }}
                    </span>
                    <TextoVacio v-else />
                  </template>
                </td>
                <td>
                  <div class="actions">
                    <button
                      v-for="a in accionesInlineDe(eq)"
                      :key="a.label"
                      class="icon-btn"
                      :class="{ danger: a.danger }"
                      type="button"
                      :title="a.label"
                      :aria-label="a.label"
                      @click="a.onClick"
                    >
                      <i class="ti" :class="a.icono"></i>
                    </button>
                    <MenuAcciones
                      v-if="accionesOverflowDe(eq).length"
                      :acciones="accionesOverflowDe(eq)"
                      :label="`Más acciones de ${eq.codigo}`"
                    />
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Render móvil: misma lista paginada, como tarjetas apiladas -->
        <ul v-if="!cargando" class="lista-tarjetas solo-movil" aria-label="Inventario de equipos">
          <li v-for="eq in lista" :key="eq.id" class="tarjeta-fila">
            <div class="tarjeta-fila__cab">
              <span class="eq-codigo">{{ eq.codigo }}</span>
              <a v-if="eq.fotos.length" class="eq-foto" :href="eq.fotos[0].url" target="_blank" rel="noopener noreferrer" title="Ver foto" aria-label="Ver foto del equipo">
                <img :src="eq.fotos[0].url" alt="">
              </a>
            </div>
            <div class="tarjeta-fila__principal user-name">{{ eq.tipo_nombre }} {{ eq.marca }}</div>
            <div class="tarjeta-fila__sec">
              <TextoVacio :valor="eq.modelo" />
              <template v-if="eq.empresa_nombre"><span aria-hidden="true">·</span><span>{{ eq.empresa_nombre }}</span></template>
              <template v-if="eq.serie"><span aria-hidden="true">·</span><span class="eq-serie">{{ eq.serie }}</span></template>
            </div>
            <div v-if="eq.portador || eq.ubicacion_nombre || enAlmacen(eq)" class="tarjeta-fila__sec">
              <template v-if="eq.portador">
                <RouterLink class="empleado-link" :to="`/empleados/${eq.empleado_id}`">{{ eq.portador }}</RouterLink>
                <span v-if="eq.portador_inactivo" class="badge badge--danger badge-sin-devolver" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                  <i class="ti ti-alert-triangle"></i> Sin devolver
                </span>
              </template>
              <div v-else-if="creandoUbicacionId === eq.id" class="ubicacion-nueva-inline">
                <input
                  v-model="nombreNuevaUbicacion"
                  placeholder="Nombre de la ubicación"
                  :disabled="moviendoId === eq.id"
                  @keydown.enter.prevent="confirmarNuevaUbicacion(eq)"
                  @keydown.esc.prevent="cancelarNuevaUbicacion"
                >
                <button class="icon-btn" type="button" title="Crear y mover aquí" :disabled="moviendoId === eq.id || !nombreNuevaUbicacion.trim()" @click="confirmarNuevaUbicacion(eq)">
                  <i class="ti" :class="moviendoId === eq.id ? 'ti-loader-2 spinner-icon' : 'ti-check'"></i>
                </button>
                <button class="icon-btn" type="button" title="Cancelar" :disabled="moviendoId === eq.id" @click="cancelarNuevaUbicacion">
                  <i class="ti ti-x"></i>
                </button>
              </div>
              <select
                v-else-if="enAlmacen(eq)"
                class="ubicacion-select"
                :value="eq.ubicacion_id || ''"
                :disabled="moviendoId === eq.id"
                aria-label="Ubicación"
                @change="onCambiarUbicacion(eq, $event.target.value)"
              >
                <option value="" disabled>Seleccionar ubicación</option>
                <option v-for="u in store.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
                <option value="__nueva__">+ Crear nueva ubicación…</option>
              </select>
              <span v-else class="ubicacion-nombre">
                <i class="ti ti-map-pin"></i> {{ eq.ubicacion_nombre }}
              </span>
            </div>
            <div class="tarjeta-fila__pie">
              <span class="badge" :class="badgeEstadoFisico(eq).clase">{{ badgeEstadoFisico(eq).label }}</span>
              <MenuAcciones :acciones="accionesDe(eq)" :label="`Acciones de ${eq.codigo}`" />
            </div>
          </li>
        </ul>

        <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </template>
      </div>
    </main>

    <EquipoForm v-if="mostrarForm" :equipo="equipoEditar" @cerrar="onFormCerrado" />

    <!-- Modal: entregar equipo -->
    <Transition name="modal-anim">
    <div v-if="mostrarAsignar" class="modal-bg">
      <div ref="panelAsignar" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="asignar-title" tabindex="-1">
        <div class="modal-title">
          <span id="asignar-title"><i class="ti ti-user-plus" aria-hidden="true"></i> Entregar {{ equipoAsignar?.codigo }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarAsignar = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">{{ equipoAsignar?.tipo_nombre }} {{ equipoAsignar?.marca }} {{ equipoAsignar?.modelo }}</p>

          <div class="form-group">
            <label for="asig-emp">Empleado *</label>
            <BuscadorCombo
              id="asig-emp"
              v-model="empleadoSelId"
              :items="empleadosActivos"
              :campos-busqueda="['nombres', 'apellidos', 'dni']"
              :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
              placeholder="Buscar por nombre o DNI..."
              :disabled="procesando"
            >
              <template #resultado="{ item }">
                <span>{{ item.nombres }} {{ item.apellidos }}</span>
                <span class="combo-sec">{{ item.dni }}</span>
              </template>
            </BuscadorCombo>
          </div>

          <div class="form-group">
            <label for="asig-cond">Condición de entrega</label>
            <input id="asig-cond" v-model="condicionEntrega" placeholder="ej: nuevo, con cargador y mochila" :disabled="procesando">
          </div>

        </div>

        <p v-if="errorAsignar" class="form-error" role="alert">{{ errorAsignar }}</p>

        <div class="modal-actions">
          <button class="btn" type="button" :disabled="procesando" @click="mostrarAsignar = false">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="procesando || !empleadoSelId" @click="confirmarAsignar">
            <i v-if="procesando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ procesando ? 'Entregando...' : 'Entregar' }}
          </button>
        </div>
      </div>
    </div>
    </Transition>

    <!-- Modal: registrar devolución -->
    <Transition name="modal-anim">
    <div v-if="mostrarDevolver" class="modal-bg">
      <div ref="panelDevolver" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="devolver-title" tabindex="-1">
        <div class="modal-title">
          <span id="devolver-title"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Devolución de {{ equipoDevolver?.codigo }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarDevolver = false"><i class="ti ti-x"></i></button>
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

          <label class="check-reparacion" :class="{ 'check-reparacion--disabled': motivoCierre === 'perdida' }">
            <input v-model="aReparacion" type="checkbox" :disabled="procesando || motivoCierre === 'perdida'">
            Volvió dañado — enviarlo a reparación
          </label>
          <p v-if="motivoCierre === 'perdida'" class="check-reparacion-hint">
            No aplica si el equipo se reporta como perdido/robado.
          </p>

        </div>

        <div class="modal-actions">
          <button class="btn" type="button" :disabled="procesando" @click="mostrarDevolver = false">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="procesando || !condicionDevolucion.trim()" @click="confirmarDevolver">
            <i v-if="procesando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ procesando ? 'Registrando...' : 'Registrar devolución' }}
          </button>
        </div>
      </div>
    </div>
    </Transition>

    <!-- Modal: hoja de vida -->
    <Transition name="modal-anim">
    <div v-if="mostrarHoja" class="modal-bg" @click.self="mostrarHoja = false">
      <div ref="panelHoja" class="modal modal-detail" role="dialog" aria-modal="true" aria-labelledby="hoja-title" tabindex="-1">
        <div class="modal-title">
          <span id="hoja-title"><i class="ti ti-history" aria-hidden="true"></i> Hoja de vida — {{ equipoHoja?.codigo }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarHoja = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">{{ equipoHoja?.tipo_nombre }} {{ equipoHoja?.marca }} {{ equipoHoja?.modelo }}</p>
          <span v-if="equipoHoja" class="badge" :class="badgeEstadoFisico(equipoHoja).clase">
            {{ badgeEstadoFisico(equipoHoja).label }}
          </span>
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
    </Transition>

    <!-- Confirmación (ConfirmDialog compartido): "de_baja" y "eliminar" son
         destructivas (btn-danger); las demás transiciones usan el botón
         primario, igual que "renovar" en Licencias. -->
    <ConfirmDialog
      v-if="accionPendiente"
      ref="dialogoAccion"
      :destructivo="destructivoAccion"
      icono="ti-trash"
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
.eq-error { color: var(--color-danger); }

/* Datos uniformes: solo cambia la familia (mono para identificadores),
   nunca el peso/tamaño/color */
.eq-codigo {
  font-family: var(--font-mono, monospace);
}

.eq-codigo-almacen {
  font-family: var(--font-mono, monospace);
  color: var(--color-text-secondary);
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

/* Columna Situación: ancho mínimo para que "Robado/Perdido" (el label más
   largo) no corte el badge. */
.th-situacion { min-width: 120px; }

.ubicacion-nombre {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Solo el icono conserva el color de la familia "ubicaciones" */
.ubicacion-nombre i { color: var(--color-purple-text); }

.ubicacion-select {
  max-width: 170px;
}

.ubicacion-select:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.ubicacion-nueva-inline {
  display: flex;
  gap: 6px;
  max-width: 220px;
}

.ubicacion-nueva-inline input { flex: 1; min-width: 0; }

.badge-sin-devolver {
  /* Estructura y color: sistema de badges global (.badge + .badge--danger);
     aquí solo el ajuste único de este chip: separación del texto vecino.
     Sin peso extra: 700 se reserva para stat cards y wordmark (Materen Core #fundaciones). */
  margin-left: 6px;
}

/* Anchos: .modal-sm / .modal-detail de la escala centralizada (main.css) */

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

.check-reparacion--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.check-reparacion-hint {
  margin: 2px 0 0 24px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

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
