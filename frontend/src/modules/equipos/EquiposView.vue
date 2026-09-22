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
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import Modal from '../../components/shared/Modal.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppButton from '../../components/ui/AppButton.vue';
import { rolDeTag } from '../../core/tagRol.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = useEquiposStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
// Forma que espera AppTable (props nativas de PrimeVue DataTable) — ver la
// misma traducción en LicenciasView.vue: sortOrder es 1 (asc) | -1 (desc) |
// null (sin orden), no el string 'asc'/'desc' que usa el store puertas
// adentro.
const sortFieldTabla = computed(() => orden.value?.columna ?? null);
const sortOrderTabla = computed(() => {
  if (!orden.value) return null;
  return orden.value.direccion === 'desc' ? -1 : 1;
});

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
const totalPaginasEquipos = computed(() => totalPaginasDe(total.value, store.tamPagina));
const paginasEquipos = computed(() => paginasDe(totalPaginasEquipos.value));
const rangoEquipos = computed(() => rangoDe(paginaActual.value, store.tamPagina, total.value));

function irAPaginaEquipos(pagina) {
  const destino = clampPagina(pagina, totalPaginasEquipos.value);
  if (destino !== store.pagina) store.irAPagina(destino);
}

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
const infoErrorAsignar = infoNotificacion('error');
const campoCondicionEntrega = useCampoAccesible();

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
const campoCondicionDevolucion = useCampoAccesible();
const campoMotivoCierre = useCampoAccesible();

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
        <AppButton severity="primary" icon="ti ti-plus" label="Nuevo equipo" @click="abrirNuevo" />
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
          <AppButton
            v-if="!busqueda && !filtroTipo && !filtroSituacion"
            variant="outline"
            severity="secondary"
            icon="ti ti-plus"
            label="Nuevo equipo"
            @click="abrirNuevo"
          />
        </EmptyState>

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando equipos…</p>
        <div v-if="vista === 'tabla' && !esMovil" class="tabla-envoltorio">
          <AppTable
            :value="lista"
            :loading="cargando"
            :total-records="total"
            :rows="store.tamPagina"
            :sort-field="sortFieldTabla"
            :sort-order="sortOrderTabla"
            @ordenar="store.ordenarPor"
          >
            <AppColumn field="codigo" header="Código equipo" sortable>
              <template #body="{ data: fila }"><span class="eq-codigo">{{ fila.codigo }}</span></template>
            </AppColumn>

            <AppColumn field="codigo_almacen" header="Código almacén" sortable>
              <template #body="{ data: fila }"><span class="eq-codigo-almacen"><TextoVacio :valor="fila.codigo_almacen" /></span></template>
            </AppColumn>

            <AppColumn field="equipo" header="Equipo">
              <template #body="{ data: fila }">
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
            </AppColumn>

            <AppColumn field="serie" header="Serie" sortable>
              <template #body="{ data: fila }"><span class="eq-serie"><TextoVacio :valor="fila.serie" /></span></template>
            </AppColumn>

            <AppColumn field="situacion" header="Situación" :header-style="{ width: '120px' }">
              <template #body="{ data: fila }">
                <span class="tag" :class="`tag--${rolDeTag(badgeEstadoFisico(fila).clase)}`">{{ badgeEstadoFisico(fila).label }}</span>
              </template>
            </AppColumn>

            <AppColumn field="portador" header="Asignado a">
              <template #body="{ data: fila }">
                <template v-if="fila.portador">
                  <RouterLink class="empleado-link" :to="`/empleados/${fila.empleado_id}`">{{ fila.portador }}</RouterLink>
                  <span v-if="fila.portador_inactivo" class="tag" :class="`tag--${rolDeTag('danger')}`" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                    <i class="ti ti-alert-triangle"></i> Sin devolver
                  </span>
                </template>
                <TextoVacio v-else />
              </template>
            </AppColumn>

            <AppColumn field="ubicacion" header="Ubicación">
              <template #body="{ data: fila }">
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
            </AppColumn>

            <AppColumn field="acciones" header="Acciones" :header-style="{ width: '176px' }">
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
              <template #body="{ data: fila }">
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
            </AppColumn>
          </AppTable>
        </div>

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
                <span v-if="eq.portador_inactivo" class="tag" :class="`tag--${rolDeTag('danger')}`" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                  <i class="ti ti-alert-triangle"></i> Sin devolver
                </span>
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
              <span class="tag" :class="`tag--${rolDeTag(badgeEstadoFisico(eq).clase)}`">{{ badgeEstadoFisico(eq).label }}</span>
              <MenuAcciones :acciones="accionesDe(eq)" :label="`Acciones de ${eq.codigo}`" />
            </div>
          </li>
        </ul>

        <nav v-if="!cargando && total > 0" class="paginacion" aria-label="Paginación">
          <div class="paginacion__lado">
            <label class="paginacion__campo">
              <span>Filas por página:</span>
              <select
                class="paginacion__select"
                :value="store.tamPagina"
                @change="store.cambiarTamPagina(Number($event.target.value))"
              >
                <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <span class="paginacion__rango">{{ rangoEquipos.desde }}–{{ rangoEquipos.hasta }} de {{ total }} equipos</span>
          </div>

          <div v-if="totalPaginasEquipos > 1" class="paginacion__lado">
            <label class="paginacion__campo">
              <span class="sr-only">Ir a la página</span>
              <select class="paginacion__select" :value="paginaActual" @change="irAPaginaEquipos(Number($event.target.value))">
                <option v-for="p in paginasEquipos" :key="p" :value="p">{{ p }}</option>
              </select>
              <span>de {{ totalPaginasEquipos }}</span>
            </label>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual <= 1" aria-label="Página anterior" @click="irAPaginaEquipos(paginaActual - 1)">
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual >= totalPaginasEquipos" aria-label="Página siguiente" @click="irAPaginaEquipos(paginaActual + 1)">
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
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

      <div class="campo" :class="{ 'campo--inerte': procesando }">
        <label class="campo__etiqueta" :for="campoCondicionEntrega.id">Condición de entrega</label>
        <div class="campo__caja">
          <input
            :id="campoCondicionEntrega.id"
            v-model="condicionEntrega"
            class="campo__control"
            type="text"
            placeholder="ej: nuevo, con cargador y mochila"
            :disabled="procesando"
          >
        </div>
      </div>

      <div v-if="errorAsignar" class="notif" :class="[`notif--${infoErrorAsignar.rol}`, 'notif--inline']" :role="infoErrorAsignar.rolAria">
        <i class="ti" :class="infoErrorAsignar.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ errorAsignar }}</p>
        </div>
      </div>

      <template #acciones>
        <AppButton variant="text" severity="secondary" label="Cancelar" :disabled="procesando" @click="modalAsignar?.cerrar()" />
        <AppButton
          severity="primary"
          :label="procesando ? 'Entregando...' : 'Entregar'"
          :loading="procesando"
          :disabled="!empleadoSelId"
          @click="confirmarAsignar"
        />
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

      <div class="campo" :class="{ 'campo--inerte': procesando }">
        <label class="campo__etiqueta" :for="campoCondicionDevolucion.id">Condición en que vuelve<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoCondicionDevolucion.id"
            v-model="condicionDevolucion"
            class="campo__control"
            type="text"
            required
            placeholder="ej: operativo / pantalla rota / sin cargador"
            :disabled="procesando"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': procesando }">
        <label class="campo__etiqueta" :for="campoMotivoCierre.id">Motivo</label>
        <div class="campo__caja">
          <select :id="campoMotivoCierre.id" v-model="motivoCierre" class="campo__control campo__control--select" :disabled="procesando">
            <option value="devolucion">Devolución normal</option>
            <option value="cambio_equipo">Cambio de equipo</option>
            <option value="baja_empleado">Baja del empleado</option>
            <option value="perdida">Pérdida / robo</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <label class="check-reparacion" :class="{ 'check-reparacion--disabled': motivoCierre === 'perdida' }">
        <input v-model="aReparacion" type="checkbox" :disabled="procesando || motivoCierre === 'perdida'">
        Volvió dañado — enviarlo a reparación
      </label>
      <p v-if="motivoCierre === 'perdida'" class="check-reparacion-hint">
        No aplica si el equipo se reporta como perdido/robado.
      </p>

      <template #acciones>
        <AppButton variant="text" severity="secondary" label="Cancelar" :disabled="procesando" @click="modalDevolver?.cerrar()" />
        <AppButton
          severity="primary"
          :label="procesando ? 'Registrando...' : 'Registrar devolución'"
          :loading="procesando"
          :disabled="!condicionDevolucion.trim()"
          @click="confirmarDevolver"
        />
      </template>
    </Modal>

    <!-- Drawer: hoja de vida (Modal accesible compartido, modo lateral —
         Plan Maestro v2, Frente 4). Antes era un Modal centrado tamaño
         "detail"; el contrato de accesibilidad (foco, Escape, Teleport) no
         cambió, solo la presentación. -->
    <Modal v-if="mostrarHoja" ref="modalHoja" size="detail" lateral @close="mostrarHoja = false">
      <template #titulo><i class="ti ti-history" aria-hidden="true"></i> Hoja de vida — {{ equipoHoja?.codigo }}</template>
      <p class="modal-info">{{ equipoHoja?.tipo_nombre }} {{ equipoHoja?.marca }} {{ equipoHoja?.modelo }}</p>
      <span v-if="equipoHoja" class="tag" :class="`tag--${rolDeTag(badgeEstadoFisico(equipoHoja).clase)}`">
        {{ badgeEstadoFisico(equipoHoja).label }}
      </span>

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


