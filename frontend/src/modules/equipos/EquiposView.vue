<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
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
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import Modal from '../../components/shared/Modal.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = useEquiposStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

// Definición de columnas de CarbonDataTable, densidad `lg` (ver template):
// mobile nunca pasa por acá (`:con-tarjetas="false"`) porque ya tiene su
// propia grilla de tarjetas más abajo (vista "Tarjetas", que también sirve
// de fallback móvil) — mismo criterio que EmpleadosView. `lg` porque la fila
// es densa: foto/badge/select inline de ubicación + hasta 2 icon-btn + menú
// de overflow, comparable a StaffView.
const columnasEquipos = [
  { clave: 'codigo', label: 'Código equipo', ordenable: true },
  { clave: 'codigo_almacen', label: 'Código almacén', ordenable: true },
  { clave: 'equipo', label: 'Equipo', elastica: true },
  { clave: 'serie', label: 'Serie', ordenable: true },
  { clave: 'situacion', label: 'Situación', ancho: '120px' },
  { clave: 'portador', label: 'Asignado a' },
  { clave: 'ubicacion', label: 'Ubicación' },
  { clave: 'acciones', label: 'Acciones', ancho: '176px' },
];

// ── Selector Tabla/Tarjetas (FASE 4) — mismo criterio que EmpleadosView:
// "Lista con avatar" queda pendiente, solo 2 opciones por ahora; mobile
// siempre tarjetas sin importar la preferencia. ──────────────────────────
const OPCIONES_VISTA_EQUIPOS = [
  { valor: 'tabla', icono: 'ti-table', label: 'Tabla' },
  { valor: 'tarjetas', icono: 'ti-id', label: 'Tarjetas' },
];
const { esMovil } = useEsMovil();
const { vista } = useVistaModulo('equipos', ['tabla', 'tarjetas']);

// ── KPI de disponibilidad (Plan Maestro v2, Frente 4) ──────────
// Sobre TODO el inventario, no sobre la página/filtro actual — "¿qué tengo
// listo para entregar ahora mismo?" es una pregunta del parque completo.
const kpi = ref({ disponible: 0, asignado: 0, en_reparacion: 0 });
const cargandoKpi = ref(true);

async function cargarKpi() {
  try {
    kpi.value = await insforgeApi.conteosDisponibilidad();
  } catch {
    // Silencioso a propósito: es un resumen, no una carga bloqueante — un
    // fallo acá no debe tapar la tabla con un error que no es el suyo.
  } finally {
    cargandoKpi.value = false;
  }
}

useRealtimeRefresco('equipos:list', () => { store.cargar(); cargarKpi(); }, { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// Deep-link desde la búsqueda global: /equipos?q=CODIGO precarga el buscador.
const route = useRoute();
const router = useRouter();
busqueda.value = String(route.query.q ?? '');
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const filtroTipo = ref('');
const filtroSituacion = ref('');
const mostrarForm = ref(false);
const equipoEditar = ref(null);

watch(filtroTipo, (tipoId) => store.aplicarFiltros({ tipoId }));
watch(filtroSituacion, (situacion) => store.aplicarFiltros({ situacion }));

// Clic en una tarjeta KPI = mismo filtro que el <select> "Situación" de
// abajo, no una ruta nueva: ya estamos en Equipos, así que filtra in-place.
function filtrarPorSituacion(situacion) {
  filtroSituacion.value = filtroSituacion.value === situacion ? '' : situacion;
}

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

// Menú "Más" (H7, auditoría visual 2026-09-01): en móvil los 3 botones de
// texto (Exportar/Descargar PDF/Importar) se apilaban a ancho completo
// ANTES del buscador y de cualquier equipo real — mismo criterio ya
// aplicado en TicketsView.vue (`accionesMas`): son acciones de baja
// frecuencia frente a "+ Nuevo equipo", no necesitan quedar como botones
// sueltos compitiendo con el único acento de la vista, en ningún tamaño de
// pantalla.
const accionesMas = computed(() => [
  {
    icono: exportando.value ? 'ti-loader-2 spinner-icon' : 'ti-table-export',
    label: exportando.value ? 'Exportando...' : 'Exportar',
    disabled: exportando.value,
    onClick: exportar,
  },
  {
    icono: generandoPdf.value ? 'ti-loader-2 spinner-icon' : 'ti-download',
    label: generandoPdf.value ? 'Generando...' : 'Descargar PDF',
    disabled: generandoPdf.value,
    onClick: descargarPdf,
  },
  {
    icono: 'ti-file-import',
    label: 'Importar desde Excel',
    onClick: () => router.push('/equipos/importar'),
  },
]);

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
const modalAsignar = ref(null);

// Guard de cierre del Modal compartido (X, Escape, backdrop): no cierra
// mientras se está procesando, para "Entregar" y "Devolución" (formularios
// de captura — clic fuera tampoco cierra, ver :cerrar-en-backdrop más abajo).
function confirmarCierreProcesando() {
  return !procesando.value;
}

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
      modalAsignar.value?.cerrar();
    }
  }
}

async function confirmarAsignar() {
  if (!empleadoSelId.value) return;
  errorAsignar.value = '';
  procesando.value = true;
  try {
    await store.asignar(equipoAsignar.value.id, empleadoSelId.value, condicionEntrega.value);
    modalAsignar.value?.cerrar();
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
const modalDevolver = ref(null);

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
    modalDevolver.value?.cerrar();
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

const modalHoja = ref(null);

// specs es `{ nombreDelCampo: valor }` (jsonb, definido por tipos_equipo.
// campos_spec al momento de guardar) — Object.entries alcanza, sin depender
// de volver a resolver el tipo del equipo solo para leer las etiquetas.
const specsHoja = computed(() => Object.entries(equipoHoja.value?.specs || {}));

async function verHoja(equipo) {
  equipoHoja.value = equipo;
  eventos.value = [];
  mostrarHoja.value = true;
  cargandoEventos.value = true;
  try {
    eventos.value = await insforgeApi.eventosEquipo(equipo.id);
  } catch (e) {
    showToast(e?.message || 'Error al cargar la hoja de vida', 'error');
    modalHoja.value?.cerrar();
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
  cargarKpi();
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
        <SelectorVista v-model="vista" :opciones="OPCIONES_VISTA_EQUIPOS" class="solo-escritorio" />
        <MenuAcciones texto="Más" label="Más acciones" :acciones="accionesMas" />
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNuevo">Nuevo equipo</CarbonButton>
      </template>
    </PageHeader>

    <main class="page">
      <!-- KPI de disponibilidad (Plan Maestro v2, Frente 4): "¿qué tengo
           listo para entregar ahora mismo?", de un vistazo, antes de bajar a
           la tabla fila por fila. Clic = mismo filtro de Situación de abajo. -->
      <div v-if="!cargandoKpi" class="grid-12 eq-kpis">
        <button
          type="button"
          class="stat-card stat-card--clic col-4"
          :class="{ 'stat-card--activo': filtroSituacion === 'disponible' }"
          :aria-pressed="filtroSituacion === 'disponible'"
          @click="filtrarPorSituacion('disponible')"
        >
          <div class="stat-icon stat-icon--libre"><i class="ti ti-circle-check"></i></div>
          <div class="stat-info">
            <span class="stat-value">{{ kpi.disponible }}</span>
            <span class="stat-label">Libres para entregar</span>
          </div>
        </button>
        <button
          type="button"
          class="stat-card stat-card--clic col-4"
          :class="{ 'stat-card--activo': filtroSituacion === 'asignado' }"
          :aria-pressed="filtroSituacion === 'asignado'"
          @click="filtrarPorSituacion('asignado')"
        >
          <div class="stat-icon stat-icon--ocupado"><i class="ti ti-user-check"></i></div>
          <div class="stat-info">
            <span class="stat-value">{{ kpi.asignado }}</span>
            <span class="stat-label">Ocupados</span>
          </div>
        </button>
        <button
          type="button"
          class="stat-card stat-card--clic col-4"
          :class="{ 'stat-card--activo': filtroSituacion === 'en_reparacion' }"
          :aria-pressed="filtroSituacion === 'en_reparacion'"
          @click="filtrarPorSituacion('en_reparacion')"
        >
          <div class="stat-icon stat-icon--reparacion"><i class="ti ti-tool"></i></div>
          <div class="stat-info">
            <span class="stat-value">{{ kpi.en_reparacion }}</span>
            <span class="stat-label">En reparación</span>
          </div>
        </button>
      </div>

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
          <CarbonButton v-if="!busqueda && !filtroTipo && !filtroSituacion" variante="secondary" icono="ti-plus" @click="abrirNuevo">Nuevo equipo</CarbonButton>
        </EmptyState>

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando equipos…</p>
        <CarbonDataTable
          v-if="vista === 'tabla' && !esMovil"
          :columnas="columnasEquipos"
          :filas="lista"
          :cargando="cargando"
          densidad="lg"
          :orden-por="ordenColumna"
          :orden-dir="ordenDireccion"
          :con-tarjetas="false"
          etiqueta="Inventario de equipos"
          @ordenar="store.ordenarPor"
        >
          <template #celda-codigo="{ fila }">
            <span class="eq-codigo">{{ fila.codigo }}</span>
          </template>
          <template #celda-codigo_almacen="{ valor }">
            <span class="eq-codigo-almacen"><TextoVacio :valor="valor" /></span>
          </template>
          <template #celda-equipo="{ fila }">
            <div class="eq-info">
              <a v-if="fila.fotos.length" class="eq-foto" :href="fila.fotos[0].url" target="_blank" rel="noopener noreferrer" title="Ver foto" aria-label="Ver foto del equipo">
                <img :src="fila.fotos[0].url" alt="">
              </a>
              <div class="celda-apilada">
                <span class="celda-apilada__meta"><TextoVacio :valor="fila.modelo" />{{ fila.empresa_nombre ? ` · ${fila.empresa_nombre}` : '' }}</span>
                <span class="celda-apilada__principal">{{ fila.tipo_nombre }} {{ fila.marca }}</span>
              </div>
            </div>
          </template>
          <template #celda-serie="{ valor }">
            <span class="eq-serie"><TextoVacio :valor="valor" /></span>
          </template>
          <template #celda-situacion="{ fila }">
            <CarbonTag :variante="badgeEstadoFisico(fila).clase">{{ badgeEstadoFisico(fila).label }}</CarbonTag>
          </template>
          <template #celda-portador="{ fila }">
            <template v-if="fila.portador">
              <RouterLink class="empleado-link" :to="`/empleados/${fila.empleado_id}`">{{ fila.portador }}</RouterLink>
              <CarbonTag v-if="fila.portador_inactivo" variante="danger" class="badge-sin-devolver" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                <i class="ti ti-alert-triangle"></i> Sin devolver
              </CarbonTag>
            </template>
            <TextoVacio v-else />
          </template>
          <template #celda-ubicacion="{ fila }">
            <div v-if="creandoUbicacionId === fila.id" class="ubicacion-nueva-inline">
              <input
                v-model="nombreNuevaUbicacion"
                placeholder="Nombre de la ubicación"
                :disabled="moviendoId === fila.id"
                @keydown.enter.prevent="confirmarNuevaUbicacion(fila)"
                @keydown.esc.prevent="cancelarNuevaUbicacion"
              >
              <button class="icon-btn" type="button" title="Crear y mover aquí" aria-label="Crear y mover aquí" :disabled="moviendoId === fila.id || !nombreNuevaUbicacion.trim()" @click="confirmarNuevaUbicacion(fila)">
                <i class="ti" :class="moviendoId === fila.id ? 'ti-loader-2 spinner-icon' : 'ti-check'"></i>
              </button>
              <button class="icon-btn" type="button" title="Cancelar" aria-label="Cancelar" :disabled="moviendoId === fila.id" @click="cancelarNuevaUbicacion">
                <i class="ti ti-x"></i>
              </button>
            </div>
            <select
              v-else-if="enAlmacen(fila)"
              class="ubicacion-select"
              :value="fila.ubicacion_id || ''"
              :disabled="moviendoId === fila.id"
              aria-label="Ubicación"
              @change="onCambiarUbicacion(fila, $event.target.value)"
            >
              <option value="" disabled>Seleccionar ubicación</option>
              <option v-for="u in store.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
              <option value="__nueva__">+ Crear nueva ubicación…</option>
            </select>
            <template v-else>
              <span v-if="fila.ubicacion_nombre" class="ubicacion-nombre">
                <i class="ti ti-map-pin"></i> {{ fila.ubicacion_nombre }}
              </span>
              <TextoVacio v-else />
            </template>
          </template>
          <template #celda-acciones="{ fila }">
            <!-- Sin `.fila-accion` en el icon-btn inline a propósito: es la
                 ÚNICA acción contextual disponible para la situación actual
                 del equipo (Entregar/Registrar devolución/Marcar reparado/
                 Reactivar/Recuperar, mutuamente excluyentes por `situacion`
                 — ver accionesInlineDe()), no una acción secundaria de
                 relleno — mismo criterio que CarbonPasswordReveal en
                 EmpleadosView. El disparador de MenuAcciones (⋮) tampoco
                 lleva la clase: ese componente ya decide su propia
                 visibilidad. Sin `@click.stop`: esta vista no tiene fila
                 clicable (a diferencia de Tickets/Empleados), así que no
                 hay navegación que frenar. -->
            <div class="actions">
              <button
                v-for="a in accionesInlineDe(fila)"
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
                v-if="accionesOverflowDe(fila).length"
                :acciones="accionesOverflowDe(fila)"
                :label="`Más acciones de ${fila.codigo}`"
              />
            </div>
          </template>
        </CarbonDataTable>

        <!-- Tarjetas no tiene equivalente propio de SkeletonTabla (esa es
             la del modo Tabla) — mismo texto genérico que ya usa mobile
             mientras carga, mostrado acá también cuando la vista elegida
             en escritorio es Tarjetas (mobile ya lo cubre el div de
             arriba, .solo-movil). -->
        <div v-if="cargando && vista === 'tarjetas' && !esMovil" class="no-results">Cargando equipos...</div>

        <!-- Tarjetas: vista de escritorio elegida por el usuario, o mobile
             sin importar la preferencia (mobile nunca muestra tabla). -->
        <ul v-if="!cargando && (vista === 'tarjetas' || esMovil)" class="lista-tarjetas" aria-label="Inventario de equipos">
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
                <CarbonTag v-if="eq.portador_inactivo" variante="danger" class="badge-sin-devolver" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                  <i class="ti ti-alert-triangle"></i> Sin devolver
                </CarbonTag>
              </template>
              <div v-else-if="creandoUbicacionId === eq.id" class="ubicacion-nueva-inline">
                <input
                  v-model="nombreNuevaUbicacion"
                  aria-label="Nombre de la ubicación nueva"
                  placeholder="ej: Almacén de TI"
                  :disabled="moviendoId === eq.id"
                  @keydown.enter.prevent="confirmarNuevaUbicacion(eq)"
                  @keydown.esc.prevent="cancelarNuevaUbicacion"
                >
                <button class="icon-btn" type="button" title="Crear y mover aquí" aria-label="Crear y mover aquí" :disabled="moviendoId === eq.id || !nombreNuevaUbicacion.trim()" @click="confirmarNuevaUbicacion(eq)">
                  <i class="ti" :class="moviendoId === eq.id ? 'ti-loader-2 spinner-icon' : 'ti-check'"></i>
                </button>
                <button class="icon-btn" type="button" title="Cancelar" aria-label="Cancelar" :disabled="moviendoId === eq.id" @click="cancelarNuevaUbicacion">
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
              <CarbonTag :variante="badgeEstadoFisico(eq).clase">{{ badgeEstadoFisico(eq).label }}</CarbonTag>
              <MenuAcciones :acciones="accionesDe(eq)" :label="`Acciones de ${eq.codigo}`" />
            </div>
          </li>
        </ul>

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="total"
          :tam-pagina="store.tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="equipos"
          @update:tam-pagina="store.cambiarTamPagina"
        />
        </template>
      </div>
    </main>

    <EquipoForm v-if="mostrarForm" :equipo="equipoEditar" @cerrar="onFormCerrado" />

    <!-- Modal: entregar equipo (Modal accesible compartido) -->
    <Modal
      v-if="mostrarAsignar"
      ref="modalAsignar"
      size="sm"
      :confirmar-cierre="confirmarCierreProcesando"
      :cerrar-en-backdrop="false"
      @close="mostrarAsignar = false"
    >
      <template #titulo><i class="ti ti-user-plus" aria-hidden="true"></i> Entregar {{ equipoAsignar?.codigo }}</template>
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

      <CarbonCampo v-model="condicionEntrega" etiqueta="Condición de entrega" placeholder="ej: nuevo, con cargador y mochila" :deshabilitado="procesando" />

      <CarbonNotification v-if="errorAsignar" tipo="error">{{ errorAsignar }}</CarbonNotification>

      <template #acciones>
        <CarbonButton variante="secondary" :deshabilitado="procesando" @click="modalAsignar?.cerrar()">Cancelar</CarbonButton>
        <CarbonButton variante="primary" :cargando="procesando" :deshabilitado="!empleadoSelId" @click="confirmarAsignar">
          {{ procesando ? 'Entregando...' : 'Entregar' }}
        </CarbonButton>
      </template>
    </Modal>

    <!-- Modal: registrar devolución (Modal accesible compartido) -->
    <Modal
      v-if="mostrarDevolver"
      ref="modalDevolver"
      size="sm"
      :confirmar-cierre="confirmarCierreProcesando"
      :cerrar-en-backdrop="false"
      @close="mostrarDevolver = false"
    >
      <template #titulo><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Devolución de {{ equipoDevolver?.codigo }}</template>
      <p class="modal-info">Lo tiene: <strong>{{ equipoDevolver?.portador }}</strong></p>

      <CarbonCampo
        v-model="condicionDevolucion"
        etiqueta="Condición en que vuelve"
        requerido
        placeholder="ej: operativo / pantalla rota / sin cargador"
        :deshabilitado="procesando"
      />

      <CarbonCampo v-model="motivoCierre" etiqueta="Motivo" tipo="select" :deshabilitado="procesando">
        <template #opciones>
          <option value="devolucion">Devolución normal</option>
          <option value="cambio_equipo">Cambio de equipo</option>
          <option value="baja_empleado">Baja del empleado</option>
          <option value="perdida">Pérdida / robo</option>
        </template>
      </CarbonCampo>

      <label class="check-reparacion" :class="{ 'check-reparacion--disabled': motivoCierre === 'perdida' }">
        <input v-model="aReparacion" type="checkbox" :disabled="procesando || motivoCierre === 'perdida'">
        Volvió dañado — enviarlo a reparación
      </label>
      <p v-if="motivoCierre === 'perdida'" class="check-reparacion-hint">
        No aplica si el equipo se reporta como perdido/robado.
      </p>

      <template #acciones>
        <CarbonButton variante="secondary" :deshabilitado="procesando" @click="modalDevolver?.cerrar()">Cancelar</CarbonButton>
        <CarbonButton variante="primary" :cargando="procesando" :deshabilitado="!condicionDevolucion.trim()" @click="confirmarDevolver">
          {{ procesando ? 'Registrando...' : 'Registrar devolución' }}
        </CarbonButton>
      </template>
    </Modal>

    <!-- Drawer: hoja de vida (Modal accesible compartido, modo lateral —
         Plan Maestro v2, Frente 4). Antes era un Modal centrado tamaño
         "detail"; el contrato de accesibilidad (foco, Escape, Teleport) no
         cambió, solo la presentación. -->
    <Modal v-if="mostrarHoja" ref="modalHoja" size="detail" lateral @close="mostrarHoja = false">
      <template #titulo><i class="ti ti-history" aria-hidden="true"></i> Hoja de vida — {{ equipoHoja?.codigo }}</template>
      <p class="modal-info">{{ equipoHoja?.tipo_nombre }} {{ equipoHoja?.marca }} {{ equipoHoja?.modelo }}</p>
      <CarbonTag v-if="equipoHoja" :variante="badgeEstadoFisico(equipoHoja).clase">
        {{ badgeEstadoFisico(equipoHoja).label }}
      </CarbonTag>

      <div v-if="equipoHoja?.fotos.length" class="hoja-seccion">
        <div class="hoja-seccion-titulo">Fotos</div>
        <div class="hoja-fotos">
          <a
            v-for="(foto, i) in equipoHoja.fotos"
            :key="foto.key || i"
            class="hoja-foto"
            :href="foto.url"
            target="_blank"
            rel="noopener noreferrer"
            title="Ver foto en tamaño completo"
          >
            <img :src="foto.url" alt="">
          </a>
        </div>
      </div>

      <div v-if="specsHoja.length" class="hoja-seccion">
        <div class="hoja-seccion-titulo">Especificaciones técnicas</div>
        <dl class="hoja-specs">
          <template v-for="[campo, valor] in specsHoja" :key="campo">
            <dt>{{ campo }}</dt>
            <dd>{{ valor }}</dd>
          </template>
        </dl>
      </div>

      <div v-if="equipoHoja?.accesorios_lineas?.length" class="hoja-seccion">
        <div class="hoja-seccion-titulo">Accesorios</div>
        <ul class="hoja-accesorios">
          <li v-for="a in equipoHoja.accesorios_lineas" :key="a.catalogo_id || a.descripcion">
            {{ a.descripcion }}<span v-if="a.cantidad > 1"> × {{ a.cantidad }}</span>
          </li>
        </ul>
      </div>

      <div class="hoja-seccion">
        <div class="hoja-seccion-titulo">Historial</div>
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
    </Modal>

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

.eq-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.eq-foto {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-base);
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

/* Columna Situación: ancho fijo de 120px, declarado en `columnasEquipos`
   (`ancho: '120px'`) para que "Robado/Perdido" (el label más largo) no
   corte el badge — reemplaza la vieja regla `.th-situacion` del <table>
   a mano. */

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
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
}

.check-reparacion {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
  cursor: pointer;
}

.check-reparacion--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.check-reparacion-hint {
  margin: 2px 0 0 24px;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

/* ── KPI de disponibilidad (Plan Maestro v2, Frente 4) ──
   .stat-card/.stat-icon/.stat-info .stat-value/.stat-label son globales
   (main.css) — acá solo lo que ese componente no cubre: que además de
   RouterLink pueda ser un <button> (reset de fuente/cursor nativos), el
   estado "activo" cuando su situación es el filtro elegido, y los 3 colores
   de icono propios de esta vista (mismo patrón que las variantes de
   DashboardView.vue: cada vista define los suyos). */
.eq-kpis { margin-bottom: 16px; }

.stat-card--clic {
  font: inherit;
  cursor: pointer;
  transition: box-shadow 0.12s, border-color 0.12s;
}

.stat-card--activo {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}

.stat-icon--libre      { background: var(--color-success-bg); color: var(--color-success-text); }
.stat-icon--ocupado    { background: var(--color-info-bg); color: var(--color-info-text); }
.stat-icon--reparacion { background: var(--color-warning-bg-strong); color: var(--color-warning-text); }

/* ── Secciones del drawer de hoja de vida (Frente 4) ── */
.hoja-seccion + .hoja-seccion {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.hoja-seccion-titulo {
  font-size: var(--fs-label-01);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.hoja-fotos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hoja-foto {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-base);
  overflow: hidden;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.hoja-foto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hoja-specs {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
}

.hoja-specs dt {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.hoja-specs dd {
  margin: 0;
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
}

.hoja-accesorios {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
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
  font-size: var(--icon-sm);
  color: var(--color-primary);
  margin-top: 1px;
  flex-shrink: 0;
}

.hoja-info { display: flex; flex-direction: column; min-width: 0; }
.hoja-detalle { font-size: var(--fs-body-01); color: var(--color-text-primary); }
.hoja-meta { font-size: var(--fs-label-01); color: var(--color-text-secondary); }
</style>
