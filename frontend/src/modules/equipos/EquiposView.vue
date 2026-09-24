<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
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
import { reservarVentanaActa } from './acta-base.js';
import { construirDatosReporteEquipos, generarReporteEquipos, LIMITE_MOVIMIENTOS_PDF } from './reporteEquipos.js';
import EquipoForm from './EquipoForm.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import Modal from '../../components/shared/Modal.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppKpi from '../../components/ui/AppKpi.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';
import { rolDeTag } from '../../core/tagRol.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';

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

// ── Presentación (rediseño 2026-09-23) ─────────────────────────
// KPI de la franja superior: misma pregunta "¿qué tengo y dónde está?" que
// el filtro de Situación — cada tarjeta ES ese filtro (clic = filtrar, otro
// clic = quitar), no una ruta nueva.
const KPIS = [
  { situacion: 'disponible', label: 'Libres para entregar', icono: 'ti ti-circle-check', tono: 'success', detalle: 'Listos en almacén o ubicación' },
  { situacion: 'asignado', label: 'Ocupados', icono: 'ti ti-user-check', tono: 'primary', detalle: 'En manos de un empleado' },
  { situacion: 'en_reparacion', label: 'En reparación', icono: 'ti ti-tool', tono: 'warning', detalle: 'Fuera de servicio temporal' },
];

const hayFiltros = computed(() => !!(busqueda.value.trim() || filtroTipo.value || filtroSituacion.value));

function limpiarFiltros() {
  busqueda.value = '';
  filtroTipo.value = '';
  filtroSituacion.value = '';
}

const subtitulo = computed(() => {
  const partes = [`${total.value} ${total.value === 1 ? 'equipo' : 'equipos'}`];
  if (filtroSituacion.value) partes.push(`situación ${situacionInfo(filtroSituacion.value).label.toLowerCase()}`);
  const tipo = store.tipos.find((t) => t.id === filtroTipo.value);
  if (tipo) partes.push(tipo.nombre.toLowerCase());
  if (partes.length === 1) partes.push('quién tiene cada equipo, dónde está y en qué estado');
  return partes.join(' · ');
});

// Tono de AppTag desde la clase de dominio (badge--success → success).
function tonoEstado(eq) {
  return rolDeTag(badgeEstadoFisico(eq).clase);
}

function nombreEquipo(eq) {
  return [eq.tipo_nombre, eq.marca, eq.modelo].filter(Boolean).join(' ') || 'Equipo sin descripción';
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
    icono: exportando.value ? 'ti-loader-2 animate-spin' : 'ti-table-export',
    label: exportando.value ? 'Exportando...' : 'Exportar',
    disabled: exportando.value,
    onClick: exportar,
  },
  {
    icono: generandoPdf.value ? 'ti-loader-2 animate-spin' : 'ti-download',
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

// Al entregar se abre el acta de ENTREGA sola, igual que la de devolución
// en confirmarDevolver(): antes solo estaba en el menú de desborde y había
// que acordarse de imprimirla. La ventana se reserva en el mismo instante
// del clic (antes de cualquier `await`) porque el navegador bloquea
// window.open fuera de un gesto del usuario; se cierra si algo falla.
async function confirmarAsignar() {
  if (!empleadoSelId.value) return;
  errorAsignar.value = '';
  procesando.value = true;
  let ventanaActa = null;
  try { ventanaActa = reservarVentanaActa(); } catch (e) { showToast(e.message, 'error'); }
  // Foto de lo que se entrega, tomada ANTES de recargar el listado: el
  // empleado ya viene completo (listEmpleados → dni, cargo, empresa), así
  // que el acta no necesita otra consulta.
  const equipo = equipoAsignar.value;
  const empleado = empleadosActivos.value.find((e) => e.id === empleadoSelId.value);
  const condicion = condicionEntrega.value.trim();
  try {
    await store.asignar(equipo.id, empleadoSelId.value, condicionEntrega.value);
    modalAsignar.value?.cerrar();
    showToast(`${equipo.codigo} entregado`);
    if (ventanaActa && empleado) {
      try {
        generarActa({ ...equipo, condicion_entrega: condicion, fecha_asignacion: null }, empleado, ventanaActa);
      } catch (e) {
        ventanaActa.close();
        showToast(e?.message || 'No se pudo generar el acta de entrega', 'error');
      }
    } else {
      ventanaActa?.close();
    }
  } catch (e) {
    ventanaActa?.close();
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
  // Solo hay acta cuando el portador es una persona (no una ubicación).
  let ventanaActa = null;
  if (equipoDevolver.value?.empleado_id) {
    try { ventanaActa = reservarVentanaActa(); } catch (e) { showToast(e.message, 'error'); }
  }
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
      if (empleado && ventanaActa) generarActaDevolucion(equipoDevuelto, empleado, datosDevolucion, ventanaActa);
      else ventanaActa?.close();
    } catch (e) {
      ventanaActa?.close();
      showToast(e?.message || 'No se pudo generar el acta de devolución', 'error');
    }
  } catch (e) {
    ventanaActa?.close();
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
    showToast('Registre primero la devolución (o ciérrela con motivo pérdida)', 'error');
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
  let ventana = null;
  try {
    ventana = reservarVentanaActa();
    const empleado = await insforgeApi.getEmpleado(equipo.empleado_id);
    if (!empleado) throw new Error('No se encontró al empleado');
    generarActa(equipo, empleado, ventana);
  } catch (e) {
    ventana?.close();
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

// Acción contextual de la fila (Entregar / Registrar devolución / Marcar
// reparado / Reactivar / Recuperar — mutuamente excluyentes por situación):
// queda visible con etiqueta junto al ⋮, que igual trae TODAS las acciones.
function accionPrincipalDe(eq) {
  return accionesVisibles(eq).find((a) => !a.overflow && a.label !== 'Editar') || null;
}

// Pie de la hoja de vida: cierra el drawer antes de abrir el modal de la
// acción (dos modales con foco atrapado a la vez se pelearían el teclado).
// Se desmonta directo (sin animación) para que devuelva el foco ANTES de que
// el modal siguiente tome el suyo.
function desdeHoja(accion) {
  mostrarHoja.value = false;
  nextTick(accion);
}

// Etiqueta visible de esa acción en la fila (la completa va en aria-label).
function etiquetaCorta(accion) {
  return accion.label.replace(' a un empleado', '').replace(' (operativo)', '').replace('Registrar devolución', 'Devolución');
}

onMounted(async () => {
  cargarKpi();
  store.resetearFiltros();
  // /equipos?nuevo=1 — atajo desde el estado vacío de AsignarEquipoModal
  // (ficha del empleado) cuando no hay equipos disponibles en almacén.
  // Se quita de la URL para que recargar no vuelva a abrir el formulario.
  if (route.query.nuevo) {
    abrirNuevo();
    const { nuevo: _nuevo, ...resto } = route.query;
    router.replace({ query: resto });
  }
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
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Equipos" :subtitulo="subtitulo">
      <template #acciones>
        <MenuAcciones
          label="Más acciones"
          :acciones="accionesMas"
          class="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <template #trigger>
            <i class="ti ti-dots" aria-hidden="true"></i>
            Más
          </template>
        </MenuAcciones>
        <AppButton icon="ti ti-plus" label="Nuevo equipo" @click="abrirNuevo" />
      </template>
    </AppEncabezado>

    <!-- ══ Disponibilidad: cada KPI filtra la lista por su situación ══ -->
    <div class="grid grid-cols-3 gap-3 px-4 pb-4 sm:px-6" role="group" aria-label="Disponibilidad del inventario">
      <button
        v-for="k in KPIS"
        :key="k.situacion"
        type="button"
        class="min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :aria-pressed="filtroSituacion === k.situacion"
        @click="filtrarPorSituacion(k.situacion)"
      >
        <AppKpi
          :label="k.label"
          :valor="cargandoKpi ? '…' : kpi[k.situacion]"
          :icono="esMovil ? '' : k.icono"
          :tono="k.tono"
          :detalle="esMovil ? '' : filtroSituacion === k.situacion ? 'Filtro aplicado · clic para quitar' : k.detalle"
          class="h-full transition-colors duration-150"
          :class="filtroSituacion === k.situacion ? 'border-primary-300 bg-primary-50/50' : 'hover:border-gray-300 hover:bg-gray-50/60'"
        />
      </button>
    </div>

    <!-- ══ Barra de filtros ═══════════════════════════════════════ -->
    <div class="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6">
      <AppBuscador v-model="busqueda" label="Buscar equipos" placeholder="Buscar por código, marca, serie o portador" />
      <AppSelect v-model="filtroSituacion" label="Filtrar por situación">
        <option value="">Todas las situaciones</option>
        <option v-for="(s, k) in SITUACIONES_EQUIPO" :key="k" :value="k">{{ s.label }}</option>
      </AppSelect>
      <AppSelect v-model="filtroTipo" label="Filtrar por tipo">
        <option value="">Todos los tipos</option>
        <option v-for="t in store.tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
      </AppSelect>
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
      <SelectorVista v-model="vista" :opciones="OPCIONES_VISTA_EQUIPOS" class="solo-escritorio ml-auto" />
    </div>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && total === 0"
        icono="ti ti-devices"
        :titulo="hayFiltros ? 'Sin resultados' : 'Sin equipos todavía'"
        :mensaje="hayFiltros ? 'No hay equipos con los filtros aplicados.' : 'Registre el primer equipo del inventario o impórtelos desde Excel.'"
      >
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
        <AppButton v-else variant="outline" severity="secondary" icon="ti ti-plus" label="Registrar equipo" @click="abrirNuevo" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando equipos…</p>

        <!-- ── Tabla (escritorio): la fila abre la hoja de vida ── -->
        <div
          v-if="vista === 'tabla' && !esMovil"
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
        >
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="lista"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :sort-field="sortFieldTabla"
              :sort-order="sortOrderTabla"
              :row-class="() => 'cursor-pointer'"
              aria-label="Inventario de equipos"
              @ordenar="store.ordenarPor"
              @row-click="({ data }) => verHoja(data)"
            >
              <AppColumn field="codigo" header="Equipo" sortable>
                <template #body="{ data: eq }">
                  <div class="flex min-w-0 max-w-60 items-center gap-3 2xl:max-w-md">
                    <a
                      v-if="eq.fotos.length"
                      class="block h-9 w-9 shrink-0 overflow-hidden rounded-md bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                      :href="eq.fotos[0].url"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="`Ver foto de ${eq.codigo}`"
                      @click.stop
                    >
                      <img :src="eq.fotos[0].url" alt="" class="h-full w-full object-cover">
                    </a>
                    <span v-else class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                      <i class="ti ti-devices" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0">
                      <div class="truncate font-medium text-gray-900" :title="nombreEquipo(eq)">{{ nombreEquipo(eq) }}</div>
                      <div class="truncate text-xs text-gray-500 tabular-nums">
                        <span class="font-medium text-gray-700">{{ eq.codigo }}</span>
                        <template v-if="eq.codigo_almacen"> · Alm. {{ eq.codigo_almacen }}</template>
                        <template v-if="eq.empresa_nombre"> · {{ eq.empresa_nombre }}</template>
                      </div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="serie" header="Serie" sortable>
                <template #body="{ data: eq }">
                  <span class="tabular-nums" :class="eq.serie ? 'text-gray-700' : 'text-gray-500'">{{ eq.serie || 'Sin serie' }}</span>
                </template>
              </AppColumn>

              <AppColumn field="situacion" header="Estado">
                <template #body="{ data: eq }">
                  <AppTag :tono="tonoEstado(eq)" punto>{{ badgeEstadoFisico(eq).label }}</AppTag>
                </template>
              </AppColumn>

              <AppColumn field="asignacion" header="Asignación">
                <template #body="{ data: eq }">
                  <!-- Quién lo tiene -->
                  <div v-if="eq.portador" class="flex min-w-0 items-center gap-2">
                    <AppAvatar :nombre="eq.portador" />
                    <div class="min-w-0">
                      <RouterLink
                        class="block truncate text-gray-900 hover:text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        :to="`/empleados/${eq.empleado_id}`"
                        @click.stop
                      >{{ eq.portador }}</RouterLink>
                      <AppTag
                        v-if="eq.portador_inactivo"
                        tono="danger"
                        icono="ti ti-alert-triangle"
                        class="mt-0.5"
                        title="Este empleado fue dado de baja y no ha devuelto el equipo"
                      >Sin devolver</AppTag>
                    </div>
                  </div>
                  <!-- En almacén: la ubicación se cambia aquí mismo -->
                  <div v-else-if="creandoUbicacionId === eq.id" class="flex items-center gap-1" @click.stop>
                    <input
                      v-model="nombreNuevaUbicacion"
                      class="h-8 w-44 rounded-md border border-gray-200 bg-white px-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      aria-label="Nombre de la ubicación nueva"
                      placeholder="Nombre de la ubicación"
                      :disabled="moviendoId === eq.id"
                      @keydown.enter.prevent="confirmarNuevaUbicacion(eq)"
                      @keydown.esc.prevent="cancelarNuevaUbicacion"
                    >
                    <button class="icon-btn" type="button" title="Crear y mover aquí" aria-label="Crear y mover aquí" :disabled="moviendoId === eq.id || !nombreNuevaUbicacion.trim()" @click="confirmarNuevaUbicacion(eq)">
                      <i class="ti" :class="moviendoId === eq.id ? 'ti-loader-2 animate-spin' : 'ti-check'" aria-hidden="true"></i>
                    </button>
                    <button class="icon-btn" type="button" title="Cancelar" aria-label="Cancelar" :disabled="moviendoId === eq.id" @click="cancelarNuevaUbicacion">
                      <i class="ti ti-x" aria-hidden="true"></i>
                    </button>
                  </div>
                  <label v-else-if="enAlmacen(eq)" class="relative inline-flex items-center" @click.stop>
                    <span class="sr-only">Ubicación de {{ eq.codigo }}</span>
                    <i class="ti ti-map-pin pointer-events-none absolute left-2 text-gray-500" aria-hidden="true"></i>
                    <select
                      class="h-8 max-w-48 cursor-pointer appearance-none truncate rounded-md border border-transparent bg-transparent pl-7 pr-7 text-sm hover:bg-gray-100 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                      :class="eq.ubicacion_id ? 'text-gray-700' : 'text-gray-500'"
                      data-ui
                      :value="eq.ubicacion_id || ''"
                      :disabled="moviendoId === eq.id"
                      @change="onCambiarUbicacion(eq, $event.target.value)"
                    >
                      <option value="" disabled>En almacén, sin ubicación</option>
                      <option v-for="u in store.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
                      <option value="__nueva__">+ Crear nueva ubicación…</option>
                    </select>
                    <i class="ti ti-chevron-down pointer-events-none absolute right-2 text-xs text-gray-500" aria-hidden="true"></i>
                  </label>
                  <span v-else-if="eq.ubicacion_nombre" class="inline-flex items-center gap-1.5 text-gray-700">
                    <i class="ti ti-map-pin text-gray-500" aria-hidden="true"></i>{{ eq.ubicacion_nombre }}
                  </span>
                  <span v-else class="text-gray-500">Sin asignar</span>
                </template>
              </AppColumn>

              <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
                <template #body="{ data: eq }">
                  <div class="flex items-center justify-end gap-1 whitespace-nowrap" @click.stop>
                    <AppButton
                      v-if="accionPrincipalDe(eq)"
                      size="sm"
                      variant="text"
                      severity="secondary"
                      :icon="`ti ${accionPrincipalDe(eq).icono}`"
                      :label="etiquetaCorta(accionPrincipalDe(eq))"
                      :aria-label="`${accionPrincipalDe(eq).label} — ${eq.codigo}`"
                      @click="accionPrincipalDe(eq).onClick()"
                    />
                    <MenuAcciones :acciones="accionesDe(eq)" :label="`Acciones de ${eq.codigo}`" />
                  </div>
                </template>
              </AppColumn>
            </AppTable>
          </div>

          <AppPaginacion
            v-if="!cargando && total > 0"
            :pagina="store.pagina"
            :tam-pagina="store.tamPagina"
            :total="total"
            @update:pagina="store.irAPagina"
            @update:tam-pagina="store.cambiarTamPagina"
          />
        </div>

        <!-- ── Tarjetas (vista elegida en escritorio, o siempre en móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando equipos...</p>
          <ul v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Inventario de equipos">
            <li
              v-for="eq in lista"
              :key="eq.id"
              class="flex cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300"
              @click="verHoja(eq)"
            >
              <div class="flex items-start gap-3">
                <a
                  v-if="eq.fotos.length"
                  class="block h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  :href="eq.fotos[0].url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`Ver foto de ${eq.codigo}`"
                  @click.stop
                >
                  <img :src="eq.fotos[0].url" alt="" class="h-full w-full object-cover">
                </a>
                <span v-else class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-50 text-2xl text-gray-500">
                  <i class="ti ti-devices" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-gray-900" :title="nombreEquipo(eq)">{{ nombreEquipo(eq) }}</div>
                  <div class="truncate text-xs text-gray-500 tabular-nums">
                    <span class="font-medium text-gray-700">{{ eq.codigo }}</span>
                    <template v-if="eq.serie"> · S/N {{ eq.serie }}</template>
                  </div>
                  <div v-if="eq.empresa_nombre || eq.codigo_almacen" class="truncate text-xs text-gray-500 tabular-nums">
                    {{ [eq.codigo_almacen ? `Alm. ${eq.codigo_almacen}` : '', eq.empresa_nombre].filter(Boolean).join(' · ') }}
                  </div>
                </div>
                <div class="-mr-1 -mt-1" @click.stop>
                  <MenuAcciones :acciones="accionesDe(eq)" :label="`Acciones de ${eq.codigo}`" />
                </div>
              </div>

              <div class="mt-3 flex min-h-8 items-center gap-2 text-sm" @click.stop>
                <template v-if="eq.portador">
                  <AppAvatar :nombre="eq.portador" />
                  <RouterLink
                    class="truncate text-gray-900 hover:text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    :to="`/empleados/${eq.empleado_id}`"
                  >{{ eq.portador }}</RouterLink>
                  <AppTag v-if="eq.portador_inactivo" tono="danger" icono="ti ti-alert-triangle" title="Este empleado fue dado de baja y no ha devuelto el equipo">Sin devolver</AppTag>
                </template>
                <div v-else-if="creandoUbicacionId === eq.id" class="flex w-full items-center gap-1">
                  <input
                    v-model="nombreNuevaUbicacion"
                    class="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    aria-label="Nombre de la ubicación nueva"
                    placeholder="ej: Almacén de TI"
                    :disabled="moviendoId === eq.id"
                    @keydown.enter.prevent="confirmarNuevaUbicacion(eq)"
                    @keydown.esc.prevent="cancelarNuevaUbicacion"
                  >
                  <button class="icon-btn" type="button" title="Crear y mover aquí" aria-label="Crear y mover aquí" :disabled="moviendoId === eq.id || !nombreNuevaUbicacion.trim()" @click="confirmarNuevaUbicacion(eq)">
                    <i class="ti" :class="moviendoId === eq.id ? 'ti-loader-2 animate-spin' : 'ti-check'" aria-hidden="true"></i>
                  </button>
                  <button class="icon-btn" type="button" title="Cancelar" aria-label="Cancelar" :disabled="moviendoId === eq.id" @click="cancelarNuevaUbicacion">
                    <i class="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>
                <label v-else-if="enAlmacen(eq)" class="relative inline-flex min-w-0 items-center">
                  <span class="sr-only">Ubicación de {{ eq.codigo }}</span>
                  <i class="ti ti-map-pin pointer-events-none absolute left-2 text-gray-500" aria-hidden="true"></i>
                  <select
                    class="h-8 max-w-full cursor-pointer appearance-none truncate rounded-md border border-gray-200 bg-white pl-7 pr-7 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    :class="eq.ubicacion_id ? 'text-gray-700' : 'text-gray-500'"
                    data-ui
                    :value="eq.ubicacion_id || ''"
                    :disabled="moviendoId === eq.id"
                    @change="onCambiarUbicacion(eq, $event.target.value)"
                  >
                    <option value="" disabled>En almacén, sin ubicación</option>
                    <option v-for="u in store.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
                    <option value="__nueva__">+ Crear nueva ubicación…</option>
                  </select>
                  <i class="ti ti-chevron-down pointer-events-none absolute right-2 text-xs text-gray-500" aria-hidden="true"></i>
                </label>
                <span v-else-if="eq.ubicacion_nombre" class="inline-flex items-center gap-1.5 text-gray-700">
                  <i class="ti ti-map-pin text-gray-500" aria-hidden="true"></i>{{ eq.ubicacion_nombre }}
                </span>
                <span v-else class="text-gray-500">Sin asignar</span>
              </div>

              <div class="mt-3 flex min-h-8 items-center justify-between gap-2 border-t border-gray-100 pt-3">
                <AppTag :tono="tonoEstado(eq)" punto>{{ badgeEstadoFisico(eq).label }}</AppTag>
                <div class="-my-1 -mr-2" @click.stop>
                  <AppButton
                    v-if="accionPrincipalDe(eq)"
                    size="sm"
                    variant="text"
                    severity="secondary"
                    :icon="`ti ${accionPrincipalDe(eq).icono}`"
                    :label="etiquetaCorta(accionPrincipalDe(eq))"
                    :aria-label="`${accionPrincipalDe(eq).label} — ${eq.codigo}`"
                    @click="accionPrincipalDe(eq).onClick()"
                  />
                </div>
              </div>
            </li>
          </ul>
          <AppPaginacion
            v-if="!cargando"
            variante="compacta"
            :pagina="store.pagina"
            :tam-pagina="store.tamPagina"
            :total="total"
            @update:pagina="store.irAPagina"
          />
        </div>
      </template>
    </div>

    <EquipoForm v-if="mostrarForm" :equipo="equipoEditar" @cerrar="onFormCerrado" />

    <!-- Modal: entregar equipo -->
    <Modal
      v-if="mostrarAsignar"
      ref="modalAsignar"
      size="sm"
      :confirmar-cierre="confirmarCierreProcesando"
      :cerrar-en-backdrop="false"
      @close="mostrarAsignar = false"
    >
      <template #titulo>Entregar {{ equipoAsignar?.codigo }}</template>
      <div class="space-y-4">
        <div class="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-2.5">
          <i class="ti ti-devices text-lg text-gray-500" aria-hidden="true"></i>
          <div class="min-w-0 text-sm">
            <div class="truncate font-medium text-gray-900">{{ equipoAsignar ? nombreEquipo(equipoAsignar) : '' }}</div>
            <div class="text-xs text-gray-500 tabular-nums">{{ equipoAsignar?.codigo }}<template v-if="equipoAsignar?.serie"> · S/N {{ equipoAsignar.serie }}</template></div>
          </div>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="asig-emp">Empleado<span aria-hidden="true"> *</span></label>
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
      </div>

      <template #acciones>
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="procesando" @click="modalAsignar?.cerrar()" />
        <AppButton
          :label="procesando ? 'Entregando...' : 'Entregar'"
          :loading="procesando"
          :disabled="!empleadoSelId"
          @click="confirmarAsignar"
        />
      </template>
    </Modal>

    <!-- Modal: registrar devolución -->
    <Modal
      v-if="mostrarDevolver"
      ref="modalDevolver"
      size="sm"
      :confirmar-cierre="confirmarCierreProcesando"
      :cerrar-en-backdrop="false"
      @close="mostrarDevolver = false"
    >
      <template #titulo>Devolución de {{ equipoDevolver?.codigo }}</template>
      <div class="space-y-4">
        <div class="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-2.5">
          <AppAvatar :nombre="equipoDevolver?.portador || ''" />
          <div class="min-w-0 text-sm">
            <div class="text-xs text-gray-500">Lo tiene</div>
            <div class="truncate font-medium text-gray-900">{{ equipoDevolver?.portador }}</div>
          </div>
        </div>

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

        <div>
          <label
            class="flex items-start gap-2.5 text-sm"
            :class="motivoCierre === 'perdida' ? 'cursor-not-allowed text-gray-500' : 'cursor-pointer text-gray-700'"
          >
            <input
              v-model="aReparacion"
              type="checkbox"
              class="mt-0.5 h-4 w-4 shrink-0 accent-primary-500"
              :disabled="procesando || motivoCierre === 'perdida'"
            >
            Volvió dañado — enviarlo a reparación
          </label>
          <p v-if="motivoCierre === 'perdida'" class="mt-1 pl-6.5 text-xs text-gray-500">
            No aplica si el equipo se reporta como perdido/robado.
          </p>
        </div>
      </div>

      <template #acciones>
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="procesando" @click="modalDevolver?.cerrar()" />
        <AppButton
          :label="procesando ? 'Registrando...' : 'Registrar devolución'"
          :loading="procesando"
          :disabled="!condicionDevolucion.trim()"
          @click="confirmarDevolver"
        />
      </template>
    </Modal>

    <!-- Drawer: hoja de vida (Modal lateral compartido) -->
    <Modal v-if="mostrarHoja" ref="modalHoja" size="detail" lateral @close="mostrarHoja = false">
      <template #titulo>Hoja de vida</template>
      <div v-if="equipoHoja" class="space-y-6">
        <header class="flex items-start gap-4">
          <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-2xl text-gray-500">
            <i class="ti ti-devices" aria-hidden="true"></i>
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-semibold tracking-tight text-gray-900 tabular-nums">{{ equipoHoja.codigo }}</h3>
              <AppTag :tono="tonoEstado(equipoHoja)" punto>{{ badgeEstadoFisico(equipoHoja).label }}</AppTag>
            </div>
            <p class="mt-0.5 text-sm text-gray-600">{{ nombreEquipo(equipoHoja) }}</p>
            <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <li v-if="equipoHoja.serie" class="inline-flex items-center gap-1 tabular-nums"><i class="ti ti-barcode" aria-hidden="true"></i>S/N {{ equipoHoja.serie }}</li>
              <li v-if="equipoHoja.portador" class="inline-flex items-center gap-1"><i class="ti ti-user" aria-hidden="true"></i>{{ equipoHoja.portador }}</li>
              <li v-else-if="equipoHoja.ubicacion_nombre" class="inline-flex items-center gap-1"><i class="ti ti-map-pin" aria-hidden="true"></i>{{ equipoHoja.ubicacion_nombre }}</li>
            </ul>
          </div>
        </header>

        <section v-if="equipoHoja.fotos.length" aria-labelledby="hoja-fotos">
          <h4 id="hoja-fotos" class="mb-2 text-sm font-semibold text-gray-900">Fotos</h4>
          <div class="grid grid-cols-4 gap-2">
            <a
              v-for="(foto, i) in equipoHoja.fotos"
              :key="foto.key || i"
              class="block aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              :href="foto.url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Ver foto ${i + 1} en tamaño completo`"
            >
              <img :src="foto.url" alt="" class="h-full w-full object-cover">
            </a>
          </div>
        </section>

        <section v-if="specsHoja.length" aria-labelledby="hoja-specs">
          <h4 id="hoja-specs" class="mb-2 text-sm font-semibold text-gray-900">Especificaciones técnicas</h4>
          <AppListaDatos :datos="specsHoja.map(([campo, valor]) => ({ label: campo, valor }))" :columnas="2" />
        </section>

        <section v-if="equipoHoja.accesorios_lineas?.length" aria-labelledby="hoja-acc">
          <h4 id="hoja-acc" class="mb-2 text-sm font-semibold text-gray-900">Accesorios</h4>
          <ul class="divide-y divide-gray-100 rounded-md border border-gray-200">
            <li v-for="a in equipoHoja.accesorios_lineas" :key="a.catalogo_id || a.descripcion" class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span class="text-gray-900">{{ a.descripcion }}</span>
              <span v-if="a.cantidad > 1" class="text-xs text-gray-500 tabular-nums">× {{ a.cantidad }}</span>
            </li>
          </ul>
        </section>

        <section aria-labelledby="hoja-historial">
          <h4 id="hoja-historial" class="mb-3 text-sm font-semibold text-gray-900">Historial</h4>
          <p v-if="cargandoEventos" class="py-4 text-sm text-gray-500" role="status">Cargando historial...</p>
          <p v-else-if="!eventos.length" class="py-4 text-sm text-gray-500">Sin movimientos registrados.</p>
          <ol v-else class="space-y-4">
            <li v-for="ev in eventos" :key="ev.id" class="flex gap-3">
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm text-gray-500">
                <i :class="EVENTO_ICONS[ev.evento] || 'ti ti-point'" aria-hidden="true"></i>
              </span>
              <div class="min-w-0 pt-0.5">
                <p class="text-sm text-gray-900">{{ ev.detalle }}</p>
                <p class="mt-0.5 text-xs text-gray-500 tabular-nums">{{ formatFechaHora(ev.created_at) }}{{ ev.user_email ? ` · ${ev.user_email}` : '' }}</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
      <template v-if="equipoHoja" #acciones>
        <AppButton variant="outline" severity="secondary" icon="ti ti-pencil" label="Editar" @click="desdeHoja(() => abrirEditar(equipoHoja))" />
        <AppButton
          v-if="accionPrincipalDe(equipoHoja)"
          :icon="`ti ${accionPrincipalDe(equipoHoja).icono}`"
          :label="accionPrincipalDe(equipoHoja).label"
          @click="desdeHoja(accionPrincipalDe(equipoHoja).onClick)"
        />
      </template>
    </Modal>

    <ConfirmDialog
      v-if="accionPendiente"
      ref="dialogoAccion"
      :destructivo="destructivoAccion"
      icono="ti-trash"
      :titulo="tituloAccion"
      :mensaje="mensajeAccion"
      :confirmar-label="confirmarLabelAccion"
      :cargando="procesandoAccion"
      @cerrado="accionPendiente = null"
      @confirm="confirmarAccionPendiente"
    />
  </div>
</template>
