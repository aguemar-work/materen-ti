<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useTicketsStore } from '../../stores/tickets.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { ESTADOS_TERMINALES, SIN_ASIGNAR } from '../../core/dominio-tickets.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import { exportarCSV } from '../../core/exportar.js';
import { CABECERA_CSV_TICKETS, filaCsvTicket } from '../../core/exportar-tickets.js';
import TicketInternoForm from './TicketInternoForm.vue';
import ReporteTicketsModal from './ReporteTicketsModal.vue';
import TicketDetallePanel from './TicketDetallePanel.vue';
import PrioridadTicket from './PrioridadTicket.vue';
import TarjetaTicket from './TarjetaTicket.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import {
  VISTAS_TICKETS, VISTA_DEFECTO, VISTAS_ANTERIORES, CLAVES_CHIPS, vistaDe, dimensionesDe, podarChips, paramsServidor,
} from './filtrosTickets.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';
import { useAtajosLista } from '../../composables/useAtajosLista.js';

const router = useRouter();
const store = useTicketsStore();
const auth = useAuthStore();
const { lista, total, cargando, cargandoMas, error, orden } = storeToRefs(store);

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

// ── Filtros V2: vistas + chips + URL (2026-09-25) ──────────────────────
// Qué vistas hay, qué chips admite cada una y por qué se retiraron las
// bandejas con sub-filtros: modules/tickets/filtrosTickets.js. La URL es la
// fuente de verdad (`?vista=pendientes&prioridad=urgente,alta`) y `recordar`
// devuelve la última combinación al volver del detalle o desde el menú —
// lo que antes hacía el store con vistaActiva/estadoEquipo/tecnicoEquipo.
// El pendiente "Posible problema recurrente" del Dashboard llega con
// `?vista=todos&categoria=<id>`: el mismo chip de Categoría que cualquier otro.
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  vista: { tipo: 'valor', defecto: VISTA_DEFECTO },
  q: { tipo: 'texto' },
  ...Object.fromEntries(CLAVES_CHIPS.map((k) => [k, { tipo: 'lista' }])),
  desde: { tipo: 'texto' },
  hasta: { tipo: 'texto' },
}, { recordar: 'tickets' });

const CLAVES_FILTRO = ['q', ...CLAVES_CHIPS, 'desde', 'hasta'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

// Búsqueda: el campo responde al instante; a la URL (y al servidor) llega
// con el debounce de useBusqueda.
const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const yo = computed(() => auth.user?.id || '');
const chipsActuales = () => Object.fromEntries(CLAVES_CHIPS.map((k) => [k, filtros[k]]));
const filtrosServidor = computed(() => paramsServidor(
  { vista: filtros.vista, chips: chipsActuales(), q: filtros.q, desde: filtros.desde, hasta: filtros.hasta },
  yo.value,
));

// Cambiar de vista (o llegar por un enlace) poda los estados que no caben
// en la vista ("Estado: Resuelto" dentro de "Pendientes"). Nunca queda puesto
// un chip que no se puede ver ni quitar. Un enlace viejo (?vista=nuevos|mios)
// se traduce a su vista + chip equivalentes.
watch(() => filtros.vista, (vista) => {
  const anterior = VISTAS_ANTERIORES[vista];
  if (anterior) {
    filtros.vista = anterior.vista;
    filtros.asignado = [...new Set([...filtros.asignado, ...anterior.asignado])];
    return;
  }
  const podados = podarChips(vista, chipsActuales());
  for (const k of CLAVES_CHIPS) if (podados[k].length !== filtros[k].length) filtros[k] = podados[k];
}, { immediate: true });

const vistaActual = computed(() => vistaDe(filtros.vista));

// Catálogos de las dimensiones: técnicos (también para "Asignado a" en la
// tabla y la reasignación en lote) y categorías. Si fallan, la dimensión
// sale sin opciones y el resto del listado funciona igual.
const staffLista = ref([]);
const categoriasTicket = ref([]);
async function cargarCategorias() {
  try {
    categoriasTicket.value = await insforgeApi.listCategoriasTicket();
  } catch {
    /* sin catálogo, el chip de Categoría no ofrece opciones */
  }
}

const dimensiones = computed(() =>
  dimensionesDe(filtros.vista, { staff: staffLista.value, categorias: categoriasTicket.value, yo: yo.value }));
const chips = computed({
  // 'creado' es un rango: en la URL viaja como desde/hasta, acá como par.
  get: () => Object.fromEntries(dimensiones.value.map((d) =>
    [d.id, d.id === 'creado' ? [filtros.desde, filtros.hasta] : filtros[d.id]])),
  set: (v) => {
    for (const k of Object.keys(v)) {
      if (k === 'creado') [filtros.desde, filtros.hasta] = v.creado;
      else filtros[k] = v[k];
    }
  },
});

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

// Cualquier cambio de vista o de filtro recarga la página 1.
watch(filtrosServidor, (f) => { store.aplicarFiltros(f).catch(() => {}); }, { deep: true });

const mostrarNuevo = ref(false);
const mostrarReporte = ref(false);
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
// Selección desde la cola de Triage (misma selección que la tabla).
function alternarSeleccion(id) {
  const nuevo = new Set(seleccionados.value);
  if (nuevo.has(id)) nuevo.delete(id);
  else nuevo.add(id);
  seleccionados.value = nuevo;
}
const todaLaColaSeleccionada = computed(() => lista.value.length > 0 && lista.value.every((t) => seleccionados.value.has(t.id)));
function alternarTodaLaCola() {
  seleccionados.value = todaLaColaSeleccionada.value ? new Set() : new Set(lista.value.map((t) => t.id));
}
const seleccionParaTabla = computed({
  get: () => ticketsSeleccionados.value,
  set: (filas) => { seleccionados.value = new Set(filas.map((t) => t.id)); },
});
// Cerrar en lote solo si CADA seleccionado ya está resuelto — mismo alcance
// que cerrarTicket() (resuelto -> cerrado); el backend rechazaría el resto.
const todosResueltos = computed(() =>
  ticketsSeleccionados.value.length > 0 && ticketsSeleccionados.value.every((t) => t.estado === 'resuelto')
);

// Una selección de otra vista/filtro no sobrevive al cambio de contexto.
watch([filtrosServidor, () => store.pagina], limpiarSeleccion);

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

// ── Conteos por vista ───────────────────────────────────────────────────
// Un count por vista (insforgeApi.contarTickets: sin traer filas), con los
// chips/búsqueda/fecha activos podados para CADA vista: el número es el que
// se va a ver al hacer clic. Cambiar de vista no mueve ningún conteo. Los
// dos últimos son los atajos del subtítulo: pendientes sin técnico ("N sin
// asignar") y pendientes cuyo solicitante no se pudo identificar ("N sin
// vincular").
const conteos = ref(null);
let peticionConteos = 0;

async function cargarConteos() {
  const peticion = ++peticionConteos;
  const base = { chips: chipsActuales(), q: filtros.q, desde: filtros.desde, hasta: filtros.hasta };
  try {
    const numeros = await Promise.all([
      ...VISTAS_TICKETS.map((v) => insforgeApi.contarTickets(paramsServidor({ ...base, vista: v.valor }, yo.value))),
      insforgeApi.contarTickets(paramsServidor({ ...base, vista: 'pendientes', chips: { ...base.chips, asignado: [SIN_ASIGNAR] } }, yo.value)),
      insforgeApi.contarTickets(paramsServidor({ ...base, vista: 'pendientes', chips: { ...base.chips, solicitante: ['no'] } }, yo.value)),
    ]);
    if (peticion !== peticionConteos) return; // respuesta obsoleta, mismo guard que store.cargar()
    conteos.value = {
      ...Object.fromEntries(VISTAS_TICKETS.map((v, i) => [v.valor, numeros[i]])),
      sinAsignar: numeros[VISTAS_TICKETS.length],
      sinVincular: numeros[VISTAS_TICKETS.length + 1],
    };
  } catch {
    // Best-effort: sin conteos las pestañas no muestran número y ya.
    if (peticion === peticionConteos) conteos.value = null;
  }
}

const firmaConteos = computed(() => JSON.stringify([chipsActuales(), filtros.q, filtros.desde, filtros.hasta]));
watch(firmaConteos, cargarConteos);

const opcionesVistas = computed(() => VISTAS_TICKETS.map((v) => ({
  valor: v.valor, label: v.label, titulo: v.titulo, conteo: conteos.value?.[v.valor],
})));

// La página dice qué se está viendo: "8 tickets pendientes".
const subtituloVista = computed(() => {
  const n = total.value;
  const texto = `${n} ${n === 1 ? 'ticket' : 'tickets'} ${vistaActual.value.frase}`;
  return hayFiltros.value ? `${texto}, con los filtros aplicados` : texto;
});

// Atajos del subtítulo, visibles desde cualquier vista mientras haya alguno
// y no estén ya filtrados: lo que nadie tomó y los solicitantes sin
// identificar. Cada uno lleva a Pendientes con su chip puesto.
const pendientesSinAsignar = computed(() =>
  (filtros.asignado.includes(SIN_ASIGNAR) ? 0 : conteos.value?.sinAsignar || 0));
const pendientesSinVincular = computed(() =>
  (filtros.solicitante.includes('no') ? 0 : conteos.value?.sinVincular || 0));
function verSinAsignar() {
  filtros.vista = 'pendientes';
  filtros.asignado = [SIN_ASIGNAR];
}
function verSinVincular() {
  filtros.vista = 'pendientes';
  filtros.solicitante = ['no'];
}

// Estado vacío: con filtros es "sin resultados"; sin filtros, cada vista
// explica por qué está vacía (una cola en cero es una buena noticia).
const VACIO_POR_VISTA = {
  todos: { titulo: 'Sin tickets', mensaje: 'Todavía no se registró ningún ticket.' },
  pendientes: { titulo: 'Nada pendiente', mensaje: 'No hay tickets abiertos, en progreso ni reabiertos.' },
  resueltos: { titulo: 'Sin tickets resueltos', mensaje: 'Todavía no se resolvió ningún ticket.' },
  rechazados: { titulo: 'Sin tickets rechazados', mensaje: 'No se descartó ningún ticket.' },
};
const vacio = computed(() => (hayFiltros.value
  ? { titulo: 'Sin resultados', mensaje: 'No hay tickets con los filtros aplicados.', conLimpiar: true }
  : VACIO_POR_VISTA[filtros.vista] || VACIO_POR_VISTA.todos));

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

// Columna "Fecha" de la tabla: recibido o resuelto según el estado.
function fechaDeFila(t) {
  if (t.resuelto_at && ['resuelto', 'cerrado'].includes(t.estado)) return { etiqueta: 'Resuelto', fecha: t.resuelto_at };
  return { etiqueta: 'Recibido', fecha: t.created_at };
}
// DD/MM; con año solo si no es el actual.
function fechaCorta(iso) {
  const d = new Date(iso);
  const dosDigitos = (n) => String(n).padStart(2, '0');
  const base = `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base}/${String(d.getFullYear()).slice(2)}`;
}
function tituloFecha(t) {
  const partes = [`Recibido el ${formatFechaHora(t.created_at)}`];
  if (t.resuelto_at && ['resuelto', 'cerrado'].includes(t.estado)) partes.push(`resuelto el ${formatFechaHora(t.resuelto_at)}`);
  if (ticketEnvejecido(t)) partes.push('sin novedad hace demasiado');
  return partes.join(' · ');
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

// ── Exportar la vista ─────────────────────────────────────────────────
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
    cargarConteos(); // el ticket nuevo entra en "Nuevos": el conteo tiene que moverse con él
  }
}

onMounted(async () => {
  // Sin resetearFiltros(): filtrosServidor lleva TODAS las claves, así que lo
  // aplicado es exactamente lo que dice la URL (no queda filtro fantasma).
  cargarCategorias();
  try {
    const [, staff] = await Promise.all([
      store.aplicarFiltros(filtrosServidor.value),
      insforgeApi.nombresStaff(),
    ]);
    staffLista.value = staff;
    // Sin await: los conteos no deben retrasar la primera pintada.
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
        {{ subtituloVista }}
        <template v-if="pendientesSinAsignar > 0">
          ·
          <button
            type="button"
            class="rounded font-medium text-amber-700 tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            title="Pendientes que ningún técnico tomó todavía"
            @click="verSinAsignar"
          >{{ pendientesSinAsignar }} sin asignar</button>
        </template>
        <template v-if="pendientesSinVincular > 0">
          ·
          <button
            type="button"
            class="rounded font-medium text-amber-700 tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            title="Pendientes cuyo solicitante no se pudo identificar"
            @click="verSinVincular"
          >{{ pendientesSinVincular }} sin vincular</button>
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

    <!-- ══ Vistas (qué cola) y filtros bajo demanda (cómo recortarla) ══
         Una sola fila de vistas que nunca cambia de forma, y chips que se
         suman solo cuando hacen falta (ver filtrosTickets.js). -->
    <AppVistas v-model="filtros.vista" :opciones="opcionesVistas" label="Vista de tickets" />

    <!-- La barra de acciones en lote SE SOBREPONE a la fila de búsqueda
         (misma altura, sin mover la tabla ni la cola): con filas marcadas,
         buscar o filtrar no es lo que se está haciendo. La fila de abajo
         queda `inert` para que el foco no caiga debajo de la barra. -->
    <div class="relative">
    <AppBarraFiltros class="pt-3" :inert="seleccionados.size > 0 || undefined">
      <AppBuscador
        ref="refBuscador"
        v-model="busqueda"
        label="Buscar tickets"
        placeholder="Buscar por código, título o solicitante"
        title="Atajo: /"
      />
      <AppFiltros v-model="chips" :dimensiones="dimensiones" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
      <SelectorVista v-if="!esMovil" v-model="vista" :opciones="OPCIONES_VISTA_TICKETS" class="ml-auto" />
    </AppBarraFiltros>
    <div
      v-if="seleccionados.size > 0"
      class="absolute inset-x-4 bottom-4 top-3 z-10 flex flex-wrap items-center gap-3 rounded-md bg-primary-50 px-3 ring-1 ring-inset ring-primary-200 sm:inset-x-6"
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
          :titulo="vacio.titulo"
          :mensaje="vacio.mensaje"
        >
          <template v-if="vacio.conLimpiar" #default>
            <AppButton size="sm" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
          </template>
        </AppVacio>

        <template v-else>
          <p v-if="cargando" class="sr-only" role="status">Cargando tickets…</p>

          <AppMarcoTabla v-if="!esMovil">
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
                :table-props="{ 'aria-label': 'Tickets de soporte', style: 'table-layout: fixed' }"
                @ordenar="store.ordenarPor"
                @row-click="({ data }) => verTicket(data)"
              >
                <AppColumn selection-mode="multiple" :header-style="{ width: '44px' }" />

                <!-- Orden de columnas (pedido del dueño, 2026-09-25): primero lo que
                     decide qué atender (prioridad, estado), luego qué es, quién lo
                     pide, quién lo atiende y la fecha. -->
                <AppColumn field="prioridad" header="Prioridad" sortable :header-style="{ width: '112px' }">
                  <template #body="{ data: fila }"><PrioridadTicket :valor="fila.prioridad" /></template>
                </AppColumn>

                <AppColumn field="estado" header="Estado" sortable :header-style="{ width: '124px' }">
                  <template #body="{ data: fila }"><BadgeEstado tipo="ticket" :valor="fila.estado" /></template>
                </AppColumn>

                <!-- Ticket = solo número y título (categoría y nivel viven en el
                     detalle y en los filtros). -->
                <AppColumn field="codigo" header="Ticket" sortable>
                  <template #body="{ data: fila }">
                    <div class="flex min-w-0 items-baseline gap-2">
                      <RouterLink
                        class="shrink-0 text-xs font-medium tabular-nums text-gray-500 hover:text-primary-700 hover:underline"
                        :to="`/tickets/${fila.id}`"
                        @click.stop
                      >{{ fila.codigo }}</RouterLink>
                      <span class="truncate font-medium text-gray-900" :title="fila.titulo">{{ fila.titulo }}</span>
                    </div>
                  </template>
                </AppColumn>

                <AppColumn field="solicitante" header="Solicitante" :header-style="{ width: '220px' }">
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

                <AppColumn field="asignado_a" header="Responsable" :header-style="{ width: '170px' }">
                  <template #body="{ data: fila }">
                    <span v-if="fila.asignado_a" class="block truncate text-gray-700">{{ nombreStaff(fila.asignado_a) }}</span>
                    <span v-else-if="sinAsignarVigente(fila)" class="inline-flex items-center gap-1.5 text-amber-700">
                      <i class="ti ti-user-off" aria-hidden="true"></i>Sin asignar
                    </span>
                    <span v-else class="text-gray-500">Sin asignar</span>
                  </template>
                </AppColumn>

                <!-- Fecha: "Recibido" mientras sigue vigente (en rojo si lleva
                     demasiado sin atención), "Resuelto" cuando ya se resolvió
                     (resuelto_at, migración 089). -->
                <AppColumn field="created_at" header="Fecha" sortable :header-style="{ width: '184px' }">
                  <template #body="{ data: fila }">
                    <span
                      class="inline-flex items-center gap-1 whitespace-nowrap text-sm tabular-nums"
                      :class="ticketEnvejecido(fila) ? 'text-red-700' : 'text-gray-600'"
                      :title="tituloFecha(fila)"
                    >
                      <i v-if="ticketEnvejecido(fila)" class="ti ti-clock-exclamation" aria-hidden="true"></i>
                      <span class="text-xs text-gray-500">{{ fechaDeFila(fila).etiqueta }}</span>
                      {{ fechaCorta(fechaDeFila(fila).fecha) }}
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
          </AppMarcoTabla>

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
                <TarjetaTicket
                  :ticket="fila"
                  :responsable="fila.asignado_a ? nombreStaff(fila.asignado_a) : ''"
                  :alerta-sin-asignar="sinAsignarVigente(fila)"
                  :envejecido="ticketEnvejecido(fila)"
                  :edad="fechaListaAngosta(fila.created_at)"
                  :titulo-fecha="tituloFecha(fila)"
                />
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
          class="flex min-h-0 w-96 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white 2xl:w-[26rem]"
          aria-label="Cola de tickets"
        >
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500" role="status">Cargando tickets...</p>

          <AppVacio
            v-else-if="total === 0"
            variante="seccion"
            :titulo="vacio.titulo"
            :mensaje="vacio.mensaje"
          >
            <template v-if="vacio.conLimpiar" #default>
              <AppButton size="sm" variant="outline" severity="secondary" label="Limpiar filtros" @click="limpiarFiltros" />
            </template>
          </AppVacio>

          <template v-else>
            <label class="flex shrink-0 cursor-pointer items-center gap-2.5 border-b border-gray-100 bg-gray-50/80 px-4 py-2 text-xs font-medium text-gray-500">
              <input type="checkbox" :checked="todaLaColaSeleccionada" @change="alternarTodaLaCola">
              Seleccionar {{ lista.length === total ? 'todos' : `los ${lista.length} cargados` }}
            </label>
            <ul class="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto" aria-label="Tickets de soporte">
              <li
                v-for="t in lista"
                :key="t.id"
                tabindex="0"
                class="cursor-pointer px-4 py-3 transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                :class="t.id === ticketSeleccionado
                  ? 'bg-primary-50/70'
                  : estaSeleccionado(t.id) ? 'bg-primary-50/40' : 'hover:bg-gray-50'"
                :aria-current="t.id === ticketSeleccionado ? 'true' : undefined"
                @click="verTicket(t)"
                @keydown.enter.self="verTicket(t)"
              >
                <TarjetaTicket
                  :ticket="t"
                  :responsable="t.asignado_a ? nombreStaff(t.asignado_a) : ''"
                  :alerta-sin-asignar="sinAsignarVigente(t)"
                  :envejecido="ticketEnvejecido(t)"
                  :edad="fechaListaAngosta(t.created_at)"
                  :titulo-fecha="tituloFecha(t)"
                >
                  <template #inicio>
                    <input
                      type="checkbox"
                      class="mt-0.5 shrink-0"
                      :checked="estaSeleccionado(t.id)"
                      :aria-label="`Seleccionar ${t.codigo}`"
                      @click.stop
                      @change="alternarSeleccion(t.id)"
                    >
                  </template>
                </TarjetaTicket>
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
          mensaje="Seleccione un ticket de la cola para leer la conversación, responder y gestionarlo sin salir de la lista."
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
