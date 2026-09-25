<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useTicketsStore } from '../../stores/tickets.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { ESTADO_FILTRO_VIGENTES, ESTADOS_TERMINALES } from '../../core/dominio-tickets.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import { exportarCSV } from '../../core/exportar.js';
import { CABECERA_CSV_TICKETS, filaCsvTicket } from '../../core/exportar-tickets.js';
import TicketInternoForm from './TicketInternoForm.vue';
import ReporteTicketsModal from './ReporteTicketsModal.vue';
import TicketDetallePanel from './TicketDetallePanel.vue';
import FiltroFechaCreacion from './FiltroFechaCreacion.vue';
import PrioridadTicket from './PrioridadTicket.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';
import { useAtajosLista } from '../../composables/useAtajosLista.js';

const router = useRouter();
const route = useRoute();
const store = useTicketsStore();
const auth = useAuthStore();
const { lista, total, cargando, cargandoMas, error, orden, vistaActiva } = storeToRefs(store);

const { esMovil } = useEsMovil();

// ── Selector Tabla/Triage ───────────────────────────────────────────────
// Triage (lista angosta + panel de detalle) es un concepto de escritorio:
// en móvil `vistaEfectiva` fuerza 'tabla' (que ahí se pinta como tarjetas)
// sin importar la preferencia guardada, y el clic navega a /tickets/:id.
// Triage es el modo por defecto (Plan Maestro v2, Frente 2, 2026-09-04);
// quien ya tenía 'tabla' guardado en localStorage la conserva.
const OPCIONES_VISTA_TICKETS = [
  { valor: 'tabla', icono: 'ti-table', label: 'Tabla' },
  { valor: 'triage', icono: 'ti-layout-columns', label: 'Triage' },
];
const { vista } = useVistaModulo('tickets', ['tabla', 'triage'], 'triage');
const vistaEfectiva = computed(() => (esMovil.value ? 'tabla' : vista.value));

// Split-view: id del ticket mostrado en el panel derecho (solo Triage).
// Arranca en `store.ultimoAbierto` para que pasar de Tabla a Triage
// muestre el ticket en curso en vez de un panel vacío.
const ticketSeleccionado = ref(store.ultimoAbierto);

// El auto-refresco de tickets:list vive en AppLayout.vue (suscripción
// única, así el sonido de "ticket nuevo" suena en cualquier pantalla).

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// ── Bandejas (modelo de 4 bandejas exclusivas, ago 2026) ────────────────
// - `sin_asignar` / `sin_vincular`: qué necesita revisión/limpieza.
// - `mis_tickets` / `equipo`: bandejas de trabajo HERMANAS, cada una con su
//   propio sub-filtro de estado (ESTADOS_SUBFILTRO). La diferencia es solo
//   el alcance de `asignadoA` (yo vs. todos los técnicos). Cada bandeja
//   guarda su sub-estado en su propio campo del store
//   (estadoMisTickets/estadoEquipo) para que cambiar de una a otra no pise
//   el de la anterior.
// No hay bandeja "Cerrados" separada de "Resuelto": sería deshacer la
// fusión resuelto+cerrado del 2026-08-21 (ver dominio-tickets.js).
//
// Rediseño 2026-09-23: las bandejas dejan el riel lateral y pasan a un
// control segmentado en la barra de filtros, igual en escritorio y móvil.
// El riel le quitaba ~220px a la lista y al panel de detalle en Triage —
// justo el ancho que necesita la conversación — y en móvil ya eran una
// fila horizontal. Mismos datos, mismo v-model, un solo control.
// "Sin asignar" se muestra como "Nuevos" (2026-09-24): un ticket sin
// asignado solo puede estar en `abierto` (check_iniciar_completo() exige
// asignado_a antes de pasar a en_progreso, y reabrir conserva el asignado
// previo) — "sin asignar" describía el filtro técnico, no lo que el
// usuario ve: un ticket recién creado, todavía sin triar. El id interno
// (`sin_asignar`, en el store/filtros) no cambia, solo la etiqueta.
const BANDEJAS_REVISION = [
  { id: 'sin_asignar', label: 'Nuevos', icono: 'ti-user-off' },
  { id: 'sin_vincular', label: 'Sin vincular', icono: 'ti-alert-triangle' },
];

const BANDEJAS_TRABAJO = [
  { id: 'mis_tickets', label: 'Mis tickets', icono: 'ti-user' },
  { id: 'equipo', label: 'Todos', icono: 'ti-users' },
];

// `todos: estado ''` es a propósito SIN restricción de estado —
// `queryTickets()` (api/domains/tickets.js) trata `estado: ''` como "sin
// filtro". Ver el bug de "Todos (vigentes)" en el historial.
const ESTADOS_SUBFILTRO = [
  { id: 'todos', label: 'Todos', estado: '' },
  { id: 'en_progreso', label: 'En progreso', estado: 'en_progreso' },
  { id: 'resuelto', label: 'Resuelto', estado: 'resuelto' },
  { id: 'rechazado', label: 'Rechazados', estado: 'rechazado' },
];

const misTicketsActivo = computed(() => vistaActiva.value === 'mis_tickets');
const equipoActivo = computed(() => vistaActiva.value === 'equipo');

// El sub-estado solo existe para las 2 bandejas de trabajo: en
// sin_asignar/sin_vincular el control no se renderiza.
const bandejaConSubestado = computed(() => misTicketsActivo.value || equipoActivo.value);

// Una sola superficie escribiendo en el campo de la bandeja activa. Los dos
// campos del store siguen separados a propósito.
const subestadoActivo = computed({
  get: () => (misTicketsActivo.value ? store.estadoMisTickets : store.estadoEquipo),
  set: (v) => {
    if (misTicketsActivo.value) store.estadoMisTickets = v;
    else store.estadoEquipo = v;
  },
});

// Filtro por técnico, solo dentro de "Todos" (Equipo): "Mis tickets" ya está
// fijo al propio usuario, no necesita el selector. '' = todos los técnicos.
const tecnicoActivo = computed({
  get: () => store.tecnicoEquipo,
  set: (v) => { store.tecnicoEquipo = v; },
});

// ── Filtro por categoría (solo deep-link: /tickets?categoria=<id>) ─────
// Lo usa el pendiente "Posible problema recurrente" del Dashboard. No es un
// selector más de la barra (la cuarta pasada retiró Categoría como filtro
// del listado): llega por URL, se ve como un chip y se quita desde ahí.
// Vive en store.filtros como la fecha, así que sobrevive a abrir un ticket y
// volver, y el chip (atado al store) siempre dice la verdad.
//
// Al llegar por el enlace se pasa a la bandeja "Todos" sin sub-estado: el
// pendiente cuenta TODOS los tickets de la categoría, y quedarse en "Sin
// asignar" mostraría solo una parte sin avisar. Se hace ANTES del watch de
// vista (immediate) de más abajo para que la primera carga ya salga
// filtrada, sin una consulta de más.
function tomarCategoriaDeUrl(valor) {
  const categoriaId = typeof valor === 'string' ? valor.trim() : '';
  if (!categoriaId) return false;
  store.filtros = { ...store.filtros, categoriaId };
  store.pagina = 1;
  store.vistaActiva = 'equipo';
  store.estadoEquipo = 'todos';
  return true;
}
tomarCategoriaDeUrl(route.query.categoria);

// Nombre para el chip: el catálogo de categorías es chico y ya existe; si
// falla, el chip muestra el id tal cual (el filtro funciona igual).
const categoriasTicket = ref([]);
const categoriaFiltrada = computed(() => {
  const id = store.filtros.categoriaId;
  if (!id) return null;
  return categoriasTicket.value.find((c) => c.id === id)?.nombre || id;
});

async function cargarCategorias() {
  try {
    categoriasTicket.value = await insforgeApi.listCategoriasTicket();
  } catch {
    /* el chip cae al id, no bloquea nada */
  }
}

function quitarFiltroCategoria() {
  store.aplicarFiltros({ categoriaId: '' });
  // Sin esto, recargar la página volvería a aplicar el filtro recién quitado.
  if (route.query.categoria != null) {
    const { categoria: _categoria, ...resto } = route.query;
    router.replace({ query: resto });
  }
}

// Mismo componente, otra categoría en la URL (ej. otro enlace con la vista
// ya abierta): se aplica sin esperar a un remontaje.
watch(() => route.query.categoria, (valor, anterior) => {
  if (valor === anterior || !valor || valor === store.filtros.categoriaId) return;
  if (tomarCategoriaDeUrl(valor)) {
    if (!categoriasTicket.value.length) cargarCategorias();
    store.cargar().catch(() => {});
  }
});

// vistaActiva/estadoMisTickets/estadoEquipo viven en el STORE: sobreviven a
// navegar a /tickets/:id y volver (ver stores/tickets.js).
function aplicarVista() {
  if (vistaActiva.value === 'sin_asignar') {
    store.aplicarFiltros({ estado: ESTADO_FILTRO_VIGENTES, asignadoA: '', sinAsignar: true, sinVincular: false });
  } else if (vistaActiva.value === 'sin_vincular') {
    store.aplicarFiltros({ estado: ESTADO_FILTRO_VIGENTES, asignadoA: '', sinAsignar: false, sinVincular: true });
  } else if (vistaActiva.value === 'mis_tickets') {
    const sub = ESTADOS_SUBFILTRO.find((s) => s.id === store.estadoMisTickets) || ESTADOS_SUBFILTRO[0];
    store.aplicarFiltros({ estado: sub.estado, asignadoA: auth.user?.id || '', sinAsignar: false, sinVincular: false });
  } else { // 'equipo'
    const sub = ESTADOS_SUBFILTRO.find((s) => s.id === store.estadoEquipo) || ESTADOS_SUBFILTRO[0];
    store.aplicarFiltros({ estado: sub.estado, asignadoA: store.tecnicoEquipo, sinAsignar: false, sinVincular: false });
  }
}
watch(
  [vistaActiva, () => store.estadoMisTickets, () => store.estadoEquipo, () => store.tecnicoEquipo],
  aplicarVista,
  { immediate: true },
);

// ── Filtro secundario: Fecha de creación ────────────────────────────────
// Eje INDEPENDIENTE de la bandeja activa (aplicarFiltros() solo mergea).
// `computed` con get/set atado DIRECTO a `store.filtros`: sobrevive a
// navegar a /tickets/:id y volver, igual que vistaActiva.
const fechaDesde = computed({
  get: () => store.filtros.fechaDesde,
  set: (v) => store.aplicarFiltros({ fechaDesde: v }),
});
const fechaHasta = computed({
  get: () => store.filtros.fechaHasta,
  set: (v) => store.aplicarFiltros({ fechaHasta: v }),
});

const cantidadFiltrosActivos = computed(() => (fechaDesde.value ? 1 : 0) + (fechaHasta.value ? 1 : 0));
// Para los estados vacíos: cualquier filtro secundario (fecha o categoría).
const hayFiltrosSecundarios = computed(() => cantidadFiltrosActivos.value > 0 || !!store.filtros.categoriaId);

function limpiarFiltrosSecundarios() {
  store.aplicarFiltros({ fechaDesde: '', fechaHasta: '' });
}

const mostrarNuevo = ref(false);
const mostrarReporte = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => {
  const mapa = {};
  for (const s of staffLista.value) mapa[s.user_id] = s.nombre;
  return mapa;
});

// ── Selección múltiple y acciones masivas (Plan Maestro, 2026-09-01) ────
// Solo el modo Tabla de escritorio — Triage muestra un ticket a la vez.
// `seleccionados` sigue siendo un Set<id>; `seleccionParaTabla` es el
// puente hacia `v-model:selection` de AppTable (array de FILAS).
const seleccionados = ref(new Set());

function estaSeleccionado(id) {
  return seleccionados.value.has(id);
}
function limpiarSeleccion() {
  seleccionados.value = new Set();
}
const ticketsSeleccionados = computed(() => lista.value.filter((t) => seleccionados.value.has(t.id)));
const seleccionParaTabla = computed({
  get: () => ticketsSeleccionados.value,
  set: (filas) => { seleccionados.value = new Set(filas.map((t) => t.id)); },
});
// Cerrar en lote solo si CADA seleccionado ya está resuelto — mismo alcance
// que cerrarTicket() (resuelto -> cerrado); el backend rechazaría el resto.
const todosResueltos = computed(() =>
  ticketsSeleccionados.value.length > 0 && ticketsSeleccionados.value.every((t) => t.estado === 'resuelto')
);

// Una selección de otra bandeja/búsqueda no sobrevive al cambio de contexto.
watch([vistaActiva, busqueda, () => store.pagina], limpiarSeleccion);

const reasignarLoteA = ref('');
const mostrarConfirmarReasignarLote = ref(false);
const mostrarConfirmarCerrarLote = ref(false);
const procesandoLote = ref(false);

function pedirReasignarLote() {
  if (!reasignarLoteA.value || ticketsSeleccionados.value.length === 0) return;
  mostrarConfirmarReasignarLote.value = true;
}

async function confirmarReasignarLote() {
  procesandoLote.value = true;
  const staffId = reasignarLoteA.value;
  const nombre = staffPorId.value[staffId] || 'Staff';
  let ok = 0;
  let fallidos = 0;
  for (const t of ticketsSeleccionados.value) {
    try {
      await store.actualizar(t.id, { asignado_a: staffId });
      ok++;
    } catch {
      fallidos++;
    }
  }
  procesandoLote.value = false;
  mostrarConfirmarReasignarLote.value = false;
  reasignarLoteA.value = '';
  limpiarSeleccion();
  showToast(
    fallidos === 0 ? `${ok} ticket(s) reasignado(s) a ${nombre}` : `${ok} reasignado(s), ${fallidos} fallaron`,
    fallidos ? 'error' : undefined,
  );
}

function pedirCerrarLote() {
  if (!todosResueltos.value) return;
  mostrarConfirmarCerrarLote.value = true;
}

async function confirmarCerrarLote() {
  procesandoLote.value = true;
  let ok = 0;
  let fallidos = 0;
  for (const t of ticketsSeleccionados.value) {
    try {
      await insforgeApi.cerrarTicket(t.id);
      ok++;
    } catch {
      fallidos++;
    }
  }
  procesandoLote.value = false;
  mostrarConfirmarCerrarLote.value = false;
  limpiarSeleccion();
  await store.cargar();
  showToast(
    fallidos === 0 ? `${ok} ticket(s) cerrado(s)` : `${ok} cerrado(s), ${fallidos} fallaron`,
    fallidos ? 'error' : undefined,
  );
}

// ── Contadores por bandeja (rediseño ago 2026) ──────────────────────────
// Las 2 bandejas planas + los 4 sub-estados de "Mis tickets" (asignadoA=yo)
// + los 4 de "Equipo" (asignadoA=''), de una (insforgeApi.contarTickets:
// un count por bandeja, sin traer filas). Respetan el filtro SECUNDARIO
// activo (búsqueda + fecha): el número tiene que ser el que se va a ver al
// hacer clic. Cambiar de bandeja no mueve ningún contador.
const conteosVistas = ref(null);
let peticionConteos = 0;

async function cargarConteos() {
  const peticion = ++peticionConteos;
  const secundarios = {
    q: store.filtros.q,
    fechaDesde: store.filtros.fechaDesde,
    fechaHasta: store.filtros.fechaHasta,
    categoriaId: store.filtros.categoriaId,
  };
  try {
    const yo = auth.user?.id || '';
    const [sinAsignarTotal, sinVincularTotal, ...resto] = await Promise.all([
      insforgeApi.contarTickets({ ...secundarios, estado: ESTADO_FILTRO_VIGENTES, sinAsignar: true, sinVincular: false, asignadoA: '' }),
      insforgeApi.contarTickets({ ...secundarios, estado: ESTADO_FILTRO_VIGENTES, sinAsignar: false, sinVincular: true, asignadoA: '' }),
      ...ESTADOS_SUBFILTRO.map((s) => insforgeApi.contarTickets({ ...secundarios, estado: s.estado, sinAsignar: false, sinVincular: false, asignadoA: yo })),
      ...ESTADOS_SUBFILTRO.map((s) => insforgeApi.contarTickets({ ...secundarios, estado: s.estado, sinAsignar: false, sinVincular: false, asignadoA: '' })),
    ]);
    if (peticion !== peticionConteos) return; // respuesta obsoleta, mismo guard que store.cargar()
    const n = ESTADOS_SUBFILTRO.length;
    conteosVistas.value = {
      sin_asignar: sinAsignarTotal,
      sin_vincular: sinVincularTotal,
      misTickets: Object.fromEntries(ESTADOS_SUBFILTRO.map((s, i) => [s.id, resto[i]])),
      equipo: Object.fromEntries(ESTADOS_SUBFILTRO.map((s, i) => [s.id, resto[n + i]])),
    };
  } catch {
    // Best-effort: sin contadores las bandejas no muestran número y ya.
    if (peticion === peticionConteos) conteosVistas.value = null;
  }
}

watch(
  [() => store.filtros.q, () => store.filtros.fechaDesde, () => store.filtros.fechaHasta, () => store.filtros.categoriaId],
  cargarConteos,
);

// Contador de las 4 bandejas. Las 2 de trabajo usan el conteo de su
// sub-estado `todos` (total real de la bandeja, sin recorte de estado).
const conteosBandejas = computed(() => {
  const c = conteosVistas.value;
  if (!c) return null;
  return {
    sin_asignar: c.sin_asignar,
    sin_vincular: c.sin_vincular,
    mis_tickets: c.misTickets?.todos,
    equipo: c.equipo?.todos,
  };
});

const conteosSubestado = computed(() =>
  (misTicketsActivo.value ? conteosVistas.value?.misTickets : conteosVistas.value?.equipo) || null);

// ── Presentación (rediseño 2026-09-23) ──────────────────────────────────
// Opciones de AppSegmentado derivadas de las mismas listas de bandejas y
// sub-estados, con su contador.
const opcionesBandejas = computed(() =>
  [...BANDEJAS_REVISION, ...BANDEJAS_TRABAJO].map((b) => ({
    valor: b.id,
    label: b.label,
    icono: `ti ${b.icono}`,
    conteo: conteosBandejas.value?.[b.id] ?? null,
  })));
const opcionesSubestado = computed(() =>
  ESTADOS_SUBFILTRO.map((s) => ({ valor: s.id, label: s.label, conteo: conteosSubestado.value?.[s.id] ?? null })));

const bandejaActiva = computed(() =>
  [...BANDEJAS_REVISION, ...BANDEJAS_TRABAJO].find((b) => b.id === vistaActiva.value) || BANDEJAS_REVISION[0]);

// La página dice qué se está viendo: bandeja + sub-estado.
const FRASE_BANDEJA = {
  sin_asignar: 'vigentes sin asignar',
  sin_vincular: 'vigentes sin vincular a un empleado',
  mis_tickets: 'asignados a usted',
  equipo: 'de todo el equipo',
};
const subtituloBandeja = computed(() => {
  const n = total.value;
  const frase = bandejaActiva.value.id === 'equipo' && store.tecnicoEquipo
    ? `asignados a ${nombreStaff(store.tecnicoEquipo)}`
    : FRASE_BANDEJA[bandejaActiva.value.id] || '';
  let texto = `${n} ${n === 1 ? 'ticket' : 'tickets'} ${frase}`.trim();
  if (categoriaFiltrada.value) texto += ` en la categoría “${categoriaFiltrada.value}”`;
  if (bandejaConSubestado.value && subestadoActivo.value !== 'todos') {
    const sub = ESTADOS_SUBFILTRO.find((s) => s.id === subestadoActivo.value);
    if (sub) texto += ` · ${sub.label.toLowerCase()}`;
  }
  return texto;
});

// Lo que requiere atención ahora, visible desde cualquier bandeja: cuántos
// tickets vigentes siguen sin responsable. Es un atajo a esa bandeja.
const pendientesSinAsignar = computed(() =>
  (vistaActiva.value !== 'sin_asignar' ? conteosBandejas.value?.sin_asignar || 0 : 0));

function nombreStaff(id) {
  return staffPorId.value[id] || 'Staff';
}

// "Sin asignar" solo es una alerta mientras el ticket sigue vivo.
function sinAsignarVigente(t) {
  return !t.asignado_a && !ESTADOS_TERMINALES.includes(t.estado);
}

// Antigüedad: se resalta cuando señala riesgo operativo (abierto sin
// atender >24h, en curso sin novedad >3 días).
function ticketEnvejecido(t) {
  const horas = (Date.now() - new Date(t.created_at).getTime()) / 3600000;
  if (t.estado === 'abierto') return horas > 24;
  if (t.estado === 'en_progreso' || t.estado === 'reabierto') return horas > 72;
  return false;
}

// Fecha relativa hasta el umbral; más vieja, fecha corta (DD/MM) — pasado
// cierto punto la fecha concreta ubica mejor. Solo la lista de Triage.
const UMBRAL_FECHA_CORTA_DIAS = 7;
function fechaListaAngosta(iso) {
  const dias = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (dias < UMBRAL_FECHA_CORTA_DIAS) return formatAntiguedad(iso);
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}

// Clases de fila (tabla de escritorio vía `:row-class` y tarjeta móvil):
// seleccionada = fondo azul tenue; la abierta por última vez = fondo gris
// tenue (distinto del de selección, para no confundirse con ella) + `aria-
// current`. Sin borde: se retiró la única excepción de la escala de bordes
// (ver SISTEMA-DISENO §1.7).
function claseFilaTicket(fila) {
  const clases = ['cursor-pointer'];
  if (estaSeleccionado(fila.id)) clases.push('bg-primary-50/70!');
  else if (fila.id === store.ultimoAbierto) clases.push('bg-gray-50');
  return clases;
}

// aria-current en la fila activa, no solo la señal visual.
function filaAtributosTicket(fila) {
  return fila.id === store.ultimoAbierto ? { 'aria-current': 'true' } : null;
}

function verTicket(ticket) {
  // Se marca en los dos modos: en Tabla es lo único que permite volver del
  // detalle y reencontrar en qué fila se estaba.
  store.ultimoAbierto = ticket.id;
  if (vistaEfectiva.value === 'triage') {
    ticketSeleccionado.value = ticket.id;
    return;
  }
  router.push(`/tickets/${ticket.id}`);
}

// ── Exportar la bandeja ─────────────────────────────────────────────────
// Los mismos filtros que están puestos en pantalla, sin página.
const exportando = ref(false);
async function exportarBandeja() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV('tickets_bandeja', CABECERA_CSV_TICKETS, filas.map((t) => filaCsvTicket(t, staffPorId.value)));
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// ── Atajos de teclado: "/" enfoca el buscador ───────────────────────────
// AppBuscador no expone focus(): se enfoca su <input> interno.
const refBuscador = ref(null);

useAtajosLista({
  onBuscar: () => refBuscador.value?.$el?.querySelector?.('input')?.focus(),
});

// Enlace público único (landing /soporte).
async function copiarEnlaceSoporte() {
  const link = `${window.location.origin}${router.resolve({ name: 'soporte' }).href}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast('Enlace de soporte copiado');
  } catch {
    showToast('No se pudo copiar. Copie manualmente: ' + link, 'error');
  }
}

// Menú "Más": acciones de baja frecuencia frente a "Ticket interno", el
// único acento de la vista. Orden pedido por el JEFE: Enlace soporte →
// Reporte → Satisfacción → Exportar datos.
const accionesMas = computed(() => [
  { icono: 'ti-link', label: 'Enlace soporte', onClick: copiarEnlaceSoporte },
  { icono: 'ti-report', label: 'Reporte', onClick: () => { mostrarReporte.value = true; } },
  { icono: 'ti-mood-smile', label: 'Satisfacción', onClick: () => router.push('/tickets/satisfaccion') },
  {
    icono: exportando.value ? 'ti-loader-2 animate-spin' : 'ti-download',
    label: exportando.value ? 'Exportando...' : 'Exportar datos',
    disabled: exportando.value || !total.value,
    onClick: exportarBandeja,
  },
]);

function onNuevoCerrado(creado) {
  mostrarNuevo.value = false;
  if (creado) {
    showToast('Ticket interno creado');
    store.cargar();
    cargarConteos(); // el ticket nuevo entra en "Sin asignar": el contador tiene que moverse con él
  }
}

onMounted(async () => {
  // Solo el buscador se resetea acá (ver resetearBusqueda() en
  // stores/tickets.js): bandeja/sub-estado/fecha viven atados al store y
  // sobreviven a propósito a volver de /tickets/:id.
  store.resetearBusqueda();
  if (store.filtros.categoriaId) cargarCategorias();
  try {
    const [, staff] = await Promise.all([
      store.cargar(),
      insforgeApi.nombresStaff(),
    ]);
    staffLista.value = staff;
    // Sin await: los contadores no deben retrasar la primera pintada.
    cargarConteos();
  } catch {
    showToast(error.value || 'Error al cargar tickets', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Tickets">
      <template #subtitulo>
        {{ subtituloBandeja }}
        <template v-if="pendientesSinAsignar > 0">
          ·
          <button
            type="button"
            class="rounded font-medium text-amber-700 tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="vistaActiva = 'sin_asignar'"
          >{{ pendientesSinAsignar }} sin asignar</button>
        </template>
      </template>
      <template #acciones>
        <MenuAcciones
          label="Más acciones"
          :acciones="accionesMas"
          class="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <template #trigger>
            <i class="ti ti-dots" aria-hidden="true"></i>Más
          </template>
        </MenuAcciones>
        <AppButton severity="primary" icon="ti ti-plus" label="Ticket interno" @click="mostrarNuevo = true" />
      </template>
    </AppEncabezado>

    <!-- ══ Barra de filtros: bandeja (qué cola) → estado (refina la cola) →
         búsqueda y fecha. Fuera de la lista: filtra, no es parte del dato. -->
    <div class="flex flex-col gap-3 px-4 pb-4 sm:px-6">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AppSegmentado v-model="vistaActiva" :opciones="opcionesBandejas" label="Bandeja de tickets" />
        <template v-if="bandejaConSubestado">
          <span class="hidden h-6 w-px bg-gray-200 sm:block" aria-hidden="true"></span>
          <AppSegmentado v-model="subestadoActivo" :opciones="opcionesSubestado" label="Filtrar por estado" />
        </template>
        <AppSelect v-if="equipoActivo" v-model="tecnicoActivo" label="Filtrar por técnico" class="w-48">
          <option value="">Todos los técnicos</option>
          <option v-for="s in staffLista" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
        </AppSelect>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <AppBuscador
          ref="refBuscador"
          v-model="busqueda"
          label="Buscar tickets"
          placeholder="Buscar por código, título o solicitante"
          title="Atajo: /"
        />
        <FiltroFechaCreacion v-model:desde="fechaDesde" v-model:hasta="fechaHasta" id-prefijo="tk-filtro-fecha" />
        <AppButton
          v-if="cantidadFiltrosActivos > 0"
          size="sm"
          variant="text"
          severity="secondary"
          icon="ti ti-x"
          label="Limpiar fecha"
          @click="limpiarFiltrosSecundarios"
        />
        <!-- Chip del filtro por categoría (solo llega por ?categoria=). -->
        <span
          v-if="categoriaFiltrada"
          class="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-primary-50 pl-3 pr-1 text-sm text-primary-800"
          data-testid="chip-categoria"
        >
          <i class="ti ti-filter shrink-0" aria-hidden="true"></i>
          <span class="truncate">Filtrado por categoría: <strong class="font-medium">{{ categoriaFiltrada }}</strong></span>
          <button
            type="button"
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-primary-700 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :aria-label="`Quitar el filtro por categoría ${categoriaFiltrada}`"
            :title="`Quitar el filtro por categoría ${categoriaFiltrada}`"
            @click="quitarFiltroCategoria"
          >
            <i class="ti ti-x text-xs" aria-hidden="true"></i>
          </button>
        </span>
        <SelectorVista v-if="!esMovil" v-model="vista" :opciones="OPCIONES_VISTA_TICKETS" class="ml-auto" />
      </div>
    </div>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <!-- ── Tabla (escritorio) / tarjetas (móvil) ── -->
      <template v-else-if="vistaEfectiva === 'tabla'">
        <AppVacio
          v-if="!cargando && total === 0"
          icono="ti ti-headset"
          :titulo="busqueda || vistaActiva !== 'sin_asignar' || hayFiltrosSecundarios ? 'Sin resultados' : 'Nada sin asignar'"
          :mensaje="busqueda || vistaActiva !== 'sin_asignar' || hayFiltrosSecundarios ? 'No hay tickets con los filtros aplicados.' : 'Todos los tickets vigentes tienen responsable. Revise las otras bandejas para ver el trabajo en curso.'"
        />

        <template v-else>
          <p v-if="cargando" class="sr-only" role="status">Cargando tickets…</p>

          <div v-if="!esMovil" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <!-- Selección múltiple: la barra reemplaza a la cabecera de la
                 card mientras hay filas marcadas (fondo tenue = selección). -->
            <div
              v-if="seleccionados.size > 0"
              class="flex flex-wrap items-center gap-3 border-b border-primary-100 bg-primary-50 px-4 py-2"
              role="toolbar"
              aria-label="Acciones sobre los tickets seleccionados"
            >
              <span class="text-sm font-medium text-primary-800 tabular-nums">
                {{ seleccionados.size }} seleccionado{{ seleccionados.size === 1 ? '' : 's' }}
              </span>
              <div class="ml-auto flex flex-wrap items-center gap-2">
                <label class="relative inline-block">
                  <span class="sr-only">Reasignar seleccionados a</span>
                  <select
                    v-model="reasignarLoteA"
                    class="h-8 max-w-56 cursor-pointer appearance-none truncate rounded-md border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    :disabled="procesandoLote"
                  >
                    <option value="" disabled>Reasignar a...</option>
                    <option v-for="s in staffLista" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
                  </select>
                  <i class="ti ti-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
                </label>
                <AppButton
                  size="sm"
                  variant="outline"
                  severity="secondary"
                  label="Reasignar"
                  :disabled="!reasignarLoteA || procesandoLote"
                  @click="pedirReasignarLote"
                />
                <AppButton
                  size="sm"
                  variant="outline"
                  severity="secondary"
                  label="Cerrar seleccionados"
                  :disabled="!todosResueltos || procesandoLote"
                  :title="todosResueltos ? 'Cerrar los tickets seleccionados' : 'Solo se pueden cerrar en lote tickets ya resueltos'"
                  @click="pedirCerrarLote"
                />
                <AppButton size="sm" variant="text" severity="secondary" label="Cancelar" :disabled="procesandoLote" @click="limpiarSeleccion" />
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-auto">
              <AppTable
                v-model:selection="seleccionParaTabla"
                :value="lista"
                :loading="cargando"
                :total-records="total"
                :rows="store.tamPagina"
                :orden="orden"
                :row-class="claseFilaTicket"
                :row-attrs="filaAtributosTicket"
                :table-props="{ 'aria-label': 'Tickets de soporte' }"
                @ordenar="store.ordenarPor"
                @row-click="({ data }) => verTicket(data)"
              >
                <AppColumn selection-mode="multiple" :header-style="{ width: '44px' }" />

                <AppColumn field="prioridad" header="Prioridad" sortable :header-style="{ width: '112px' }">
                  <template #body="{ data: fila }"><PrioridadTicket :valor="fila.prioridad" /></template>
                </AppColumn>

                <AppColumn field="codigo" header="Ticket" sortable>
                  <template #body="{ data: fila }">
                    <div class="min-w-0">
                      <div class="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
                        <RouterLink
                          class="font-medium tabular-nums text-gray-600 hover:text-primary-700 hover:underline"
                          :to="`/tickets/${fila.id}`"
                          @click.stop
                        >{{ fila.codigo }}</RouterLink>
                        <template v-if="fila.categoria">
                          <span aria-hidden="true">·</span>
                          <span class="truncate">{{ fila.categoria }}</span>
                        </template>
                        <template v-if="fila.nivel_atencion">
                          <span aria-hidden="true">·</span>
                          <span :title="`Nivel de atención ${fila.nivel_atencion}`">{{ fila.nivel_atencion }}</span>
                        </template>
                      </div>
                      <div class="mt-0.5 line-clamp-1 font-medium text-gray-900" :title="fila.titulo">{{ fila.titulo }}</div>
                    </div>
                  </template>
                </AppColumn>

                <AppColumn field="solicitante" header="Solicitante" :header-style="{ width: '200px' }">
                  <template #body="{ data: fila }">
                    <BadgeEstado v-if="!fila.vinculado" tipo="ticket_sin_vincular" valor="sin_vincular" title="No se pudo identificar al solicitante" />
                    <div v-else class="flex min-w-0 items-center gap-2">
                      <AppAvatar :nombre="fila.solicitante || ''" />
                      <RouterLink
                        v-if="fila.solicitante_id"
                        class="truncate text-gray-900 hover:text-primary-700 hover:underline"
                        :to="`/empleados/${fila.solicitante_id}`"
                        @click.stop
                      >{{ fila.solicitante }}</RouterLink>
                      <span v-else class="truncate" :class="fila.solicitante ? 'text-gray-900' : 'text-gray-500'">{{ fila.solicitante || 'Sin registrar' }}</span>
                    </div>
                  </template>
                </AppColumn>

                <AppColumn field="estado" header="Estado" sortable :header-style="{ width: '124px' }">
                  <template #body="{ data: fila }"><BadgeEstado tipo="ticket" :valor="fila.estado" /></template>
                </AppColumn>

                <AppColumn field="asignado_a" header="Asignado a" :header-style="{ width: '170px' }">
                  <template #body="{ data: fila }">
                    <span v-if="fila.asignado_a" class="block truncate text-gray-700">{{ nombreStaff(fila.asignado_a) }}</span>
                    <span v-else-if="sinAsignarVigente(fila)" class="inline-flex items-center gap-1.5 text-amber-700">
                      <i class="ti ti-user-off" aria-hidden="true"></i>Sin asignar
                    </span>
                    <span v-else class="text-gray-500">Sin asignar</span>
                  </template>
                </AppColumn>

                <AppColumn field="created_at" header="Edad" sortable :header-style="{ width: '104px' }">
                  <template #body="{ data: fila }">
                    <span
                      class="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"
                      :class="ticketEnvejecido(fila) ? 'text-red-700' : 'text-gray-500'"
                      :title="`Creado el ${formatFechaHora(fila.created_at)}${ticketEnvejecido(fila) ? ' — sin novedad hace demasiado' : ''}`"
                    >
                      <i v-if="ticketEnvejecido(fila)" class="ti ti-clock-exclamation" aria-hidden="true"></i>
                      {{ formatAntiguedad(fila.created_at) }}
                    </span>
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

          <!-- ── Tarjetas (móvil): mismas señales, apiladas ── -->
          <div v-else class="min-h-0 flex-1 overflow-y-auto">
            <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando tickets...</p>
            <ul v-else class="grid gap-3" aria-label="Tickets de soporte">
              <li
                v-for="fila in lista"
                :key="fila.id"
                class="rounded-lg border border-gray-200 p-4 transition-colors duration-150 hover:border-gray-300"
                :class="[
                  fila.id === store.ultimoAbierto ? 'bg-gray-50' : 'bg-white',
                  'cursor-pointer',
                ]"
                :aria-current="fila.id === store.ultimoAbierto ? 'true' : undefined"
                @click="verTicket(fila)"
              >
                <div class="flex items-center justify-between gap-3 text-xs text-gray-500">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <RouterLink class="font-medium tabular-nums text-gray-600" :to="`/tickets/${fila.id}`" @click.stop>{{ fila.codigo }}</RouterLink>
                    <template v-if="fila.categoria"><span aria-hidden="true">·</span><span class="truncate">{{ fila.categoria }}</span></template>
                  </span>
                  <span
                    class="inline-flex shrink-0 items-center gap-1 tabular-nums"
                    :class="ticketEnvejecido(fila) ? 'font-medium text-red-700' : ''"
                    :title="formatFechaHora(fila.created_at)"
                  >
                    <i v-if="ticketEnvejecido(fila)" class="ti ti-clock-exclamation" aria-hidden="true"></i>
                    {{ formatAntiguedad(fila.created_at) }}
                  </span>
                </div>
                <p class="mt-1.5 line-clamp-2 font-medium text-gray-900">{{ fila.titulo }}</p>
                <p class="mt-1 truncate text-sm text-gray-600">
                  <BadgeEstado v-if="!fila.vinculado" tipo="ticket_sin_vincular" valor="sin_vincular" />
                  <template v-else>{{ fila.solicitante || 'Solicitante sin registrar' }}</template>
                </p>
                <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <BadgeEstado tipo="ticket" :valor="fila.estado" />
                    <PrioridadTicket :valor="fila.prioridad" />
                  </div>
                  <span v-if="fila.asignado_a" class="truncate text-xs text-gray-600">{{ nombreStaff(fila.asignado_a) }}</span>
                  <span v-else class="text-xs" :class="sinAsignarVigente(fila) ? 'text-amber-700' : 'text-gray-500'">Sin asignar</span>
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
      </template>

      <!-- ── Triage (escritorio): cola angosta + detalle ── -->
      <div v-else class="flex min-h-0 flex-1 gap-4">
        <section
          class="flex min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white 2xl:w-96"
          aria-label="Cola de tickets"
        >
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500" role="status">Cargando tickets...</p>

          <AppVacio
            v-else-if="total === 0"
            variante="seccion"
            :titulo="busqueda || vistaActiva !== 'sin_asignar' || hayFiltrosSecundarios ? 'Sin resultados' : 'Nada sin asignar'"
            :mensaje="busqueda || vistaActiva !== 'sin_asignar' || hayFiltrosSecundarios ? 'No hay tickets con los filtros aplicados.' : 'Todos los tickets vigentes tienen responsable.'"
          />

          <template v-else>
            <ul class="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto" aria-label="Tickets de soporte">
              <li
                v-for="t in lista"
                :key="t.id"
                tabindex="0"
                class="cursor-pointer px-4 py-3 transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                :class="t.id === ticketSeleccionado
                  ? 'bg-primary-50/70'
                  : 'hover:bg-gray-50'"
                :aria-current="t.id === ticketSeleccionado ? 'true' : undefined"
                @click="verTicket(t)"
                @keydown.enter.self="verTicket(t)"
              >
                <div class="flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <RouterLink
                      class="shrink-0 font-medium tabular-nums text-gray-600 hover:text-primary-700 hover:underline"
                      :to="`/tickets/${t.id}`"
                      @click.stop
                    >{{ t.codigo }}</RouterLink>
                    <i
                      v-if="!t.vinculado"
                      class="ti ti-alert-triangle shrink-0 text-red-600"
                      title="No se pudo identificar al solicitante"
                      aria-label="Sin vincular"
                    ></i>
                    <template v-if="t.solicitante">
                      <span aria-hidden="true">·</span>
                      <span class="truncate">{{ t.solicitante }}</span>
                    </template>
                  </span>
                  <span
                    class="inline-flex shrink-0 items-center gap-1 tabular-nums"
                    :class="ticketEnvejecido(t) ? 'font-medium text-red-700' : ''"
                    :title="formatFechaHora(t.created_at)"
                  >
                    <i v-if="ticketEnvejecido(t)" class="ti ti-clock-exclamation" aria-hidden="true"></i>
                    {{ fechaListaAngosta(t.created_at) }}
                  </span>
                </div>
                <p class="mt-1 line-clamp-2 text-sm font-medium text-gray-900" :title="t.titulo">{{ t.titulo }}</p>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <BadgeEstado tipo="ticket" :valor="t.estado" />
                    <PrioridadTicket :valor="t.prioridad" />
                  </div>
                  <span v-if="t.asignado_a" :title="nombreStaff(t.asignado_a)">
                    <AppAvatar :nombre="nombreStaff(t.asignado_a)" />
                  </span>
                  <span
                    v-else
                    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed"
                    :class="sinAsignarVigente(t) ? 'border-amber-300 text-amber-600' : 'border-gray-300 text-gray-500'"
                    title="Sin asignar"
                  >
                    <i class="ti ti-user" aria-hidden="true"></i>
                    <span class="sr-only">Sin asignar</span>
                  </span>
                </div>
              </li>
            </ul>

            <div class="shrink-0 border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
              <AppButton
                v-if="lista.length < total"
                size="sm"
                variant="text"
                severity="secondary"
                block
                :label="cargandoMas ? 'Cargando...' : `Cargar más (${lista.length} de ${total})`"
                :loading="cargandoMas"
                @click="store.cargarMas()"
              />
              <p v-else class="py-1.5 text-center tabular-nums">{{ total }} {{ total === 1 ? 'ticket' : 'tickets' }}</p>
            </div>
          </template>
        </section>

        <TicketDetallePanel
          v-if="ticketSeleccionado"
          :key="ticketSeleccionado"
          class="min-w-0 flex-1"
          :ticket-id="ticketSeleccionado"
          @cerrar="ticketSeleccionado = null"
        />
        <AppVacio
          v-else
          icono="ti ti-message-2"
          titulo="Ningún ticket abierto"
          mensaje="Seleccione un ticket de la cola para leer la conversación, responder y gestionarlo sin salir de la bandeja."
        />
      </div>
    </div>

    <TicketInternoForm v-if="mostrarNuevo" @cerrar="onNuevoCerrado" />
    <ReporteTicketsModal v-if="mostrarReporte" :staff-por-id="staffPorId" @cerrar="mostrarReporte = false" />

    <!-- Acciones masivas: mostrar la lista real afectada antes de confirmar,
         no un "¿está seguro? (N tickets)" ciego. -->
    <ConfirmDialog
      v-if="mostrarConfirmarReasignarLote"
      titulo="Reasignar tickets"
      confirmar-label="Reasignar"
      :cargando="procesandoLote"
      @cerrado="mostrarConfirmarReasignarLote = false"
      @confirm="confirmarReasignarLote"
    >
      <p>Reasignar {{ ticketsSeleccionados.length }} ticket(s) a <strong>{{ staffPorId[reasignarLoteA] || 'Staff' }}</strong>:</p>
      <ul class="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-gray-700">
        <li v-for="t in ticketsSeleccionados" :key="t.id"><span class="tabular-nums">{{ t.codigo }}</span> — {{ t.titulo }}</li>
      </ul>
    </ConfirmDialog>

    <ConfirmDialog
      v-if="mostrarConfirmarCerrarLote"
      titulo="Cerrar tickets"
      confirmar-label="Cerrar"
      :cargando="procesandoLote"
      @cerrado="mostrarConfirmarCerrarLote = false"
      @confirm="confirmarCerrarLote"
    >
      <p>Cerrar {{ ticketsSeleccionados.length }} ticket(s) resuelto(s), con su encuesta de satisfacción de siempre:</p>
      <ul class="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-gray-700">
        <li v-for="t in ticketsSeleccionados" :key="t.id"><span class="tabular-nums">{{ t.codigo }}</span> — {{ t.titulo }}</li>
      </ul>
    </ConfirmDialog>
  </div>
</template>
