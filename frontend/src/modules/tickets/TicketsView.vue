<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useTicketsStore } from '../../stores/tickets.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { ESTADO_FILTRO_VIGENTES } from '../../core/dominio-tickets.js';
import { badgeInfo } from '../../core/badges.js';
import { tonoAvatar, inicialesDe } from '../../core/avatar.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import { exportarCSV } from '../../core/exportar.js';
import { CABECERA_CSV_TICKETS, filaCsvTicket } from '../../core/exportar-tickets.js';
import TicketInternoForm from './TicketInternoForm.vue';
import ReporteTicketsModal from './ReporteTicketsModal.vue';
import TicketDetallePanel from './TicketDetallePanel.vue';
import FiltroFechaCreacion from './FiltroFechaCreacion.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import IndicadorPrioridad from '../../components/shared/IndicadorPrioridad.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import ListaVistas from '../../components/shared/ListaVistas.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppButton from '../../components/ui/AppButton.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';
import { useAtajosLista } from '../../composables/useAtajosLista.js';
import { rolDeTag } from '../../core/tagRol.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import { columnasVisibles, agruparParaTarjeta } from '../../core/tablaColumnas.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const router = useRouter();
const store = useTicketsStore();
const auth = useAuthStore();
const { lista, total, cargando, cargandoMas, error, orden, vistaActiva } = storeToRefs(store);
// Forma que espera AppTable (props nativas de PrimeVue DataTable) — misma
// traducción que Licencias/Equipos.
const sortFieldTabla = computed(() => orden.value?.columna ?? null);
const sortOrderTabla = computed(() => {
  if (!orden.value) return null;
  return orden.value.direccion === 'desc' ? -1 : 1;
});

// Definición de columnas — hoy sirve SOLO para agrupar la tarjeta móvil
// (`agruparParaTarjeta`, más abajo). La tabla de escritorio se migró a
// AppTable/AppColumn (2026-09-08): la columna "check" (selección múltiple)
// ya no vive acá, es una <AppColumn selection-mode="multiple"> declarada
// directo en el template — PrimeVue la resuelve sola, no necesita entrada
// en este array (que además nunca la usó para mobile: `movil:false` la
// excluía de agruparParaTarjeta desde siempre, la selección en lote es
// exclusiva de la tabla de escritorio).
//
// "codigo"/"Ticket" absorbe categoría + nivel de atención + título en un
// único .celda-apilada — igual que el <td> de antes — y es también la
// columna `elastica`. En mobile cae en 'principal' completa (antes el
// código vivía en la cabecera de la tarjeta y el título solo; unificarlos
// en un solo bloque es la misma composición que ya usa Empleados/Equipos
// para su columna principal, y evita que "categoría"/"nivel" quedaran
// huérfanos sin dónde caer en la tarjeta nueva).
const columnasTickets = [
  { clave: 'prioridad', label: 'Prioridad', ordenable: true, movil: 'pie' },
  { clave: 'codigo', label: 'Ticket', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'solicitante', label: 'Solicitante', movil: 'sec' },
  { clave: 'estado', label: 'Estado', ordenable: true, movil: 'pie' },
  { clave: 'asignado_a', label: 'Asignado a', movil: 'sec' },
  { clave: 'created_at', label: 'Edad', ordenable: true, num: true, movil: 'cab' },
];

const { esMovil } = useEsMovil();

// ── Selector Tabla/Triage (FASE 3, renombrado octava pasada) ────────────
// Triage (3 paneles: nav + lista angosta + detalle) es un concepto de
// escritorio — el nav y el panel llevan v-if="!esMovil" más abajo, ni se
// montan en mobile. Por eso `vistaEfectiva` fuerza 'tabla' en mobile sin
// importar la preferencia guardada: es el mismo comportamiento que ya
// tenía el sistema antes de que Triage existiera, y evita dejar al usuario
// de mobile con los filtros del nav (que ahí no tiene forma de cambiar,
// el nav no se monta en mobile).
const OPCIONES_VISTA_TICKETS = [
  { valor: 'tabla', icono: 'ti-table', label: 'Tabla' },
  { valor: 'triage', icono: 'ti-layout-columns', label: 'Triage' },
];
// Triage como modo por defecto (Plan Maestro v2, Frente 2, 2026-09-04): es
// el workspace de 3 columnas, el modo principal ahora. Quien ya tenía
// 'tabla' guardado en localStorage la conserva — esto solo cambia lo que
// ve alguien sin preferencia previa.
const { vista } = useVistaModulo('tickets', ['tabla', 'triage'], 'triage');
const vistaEfectiva = computed(() => (esMovil.value ? 'tabla' : vista.value));

// Split-view: id del ticket mostrado en el panel derecho, solo relevante
// en modo Triage. No reemplaza la ruta /tickets/:id — esa sigue existiendo
// para los enlaces externos (Empleados, Dashboard, etc.) y para mobile.
//
// Arranca en `store.ultimoAbierto`, no en null (rediseño ago 2026, séptima
// pasada). Las dos vistas ya marcaban el ticket en curso, pero con DOS
// estados distintos: Tabla con `ultimoAbierto` (persiste en el store) y Triage
// con este ref (arrancaba vacío). El resultado era una asimetría real: abrir
// un ticket en Tabla y pasar a Triage mostraba el panel vacío aunque el sistema
// sabía perfectamente cuál era el ticket en curso — y `verTicket()` ya escribe
// `ultimoAbierto` en AMBOS modos, así que el dato estaba ahí sin usarse.
// Sigue habiendo estado vacío del panel: en una sesión de SPA nueva, donde
// `ultimoAbierto` es null de verdad.
const ticketSeleccionado = ref(store.ultimoAbierto);

// El auto-refresco de tickets:list vive en AppLayout.vue (suscripción
// única, así el sonido de "ticket nuevo" suena en cualquier pantalla).

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// ── Vistas (reemplaza el modelo anterior de Estado dropdown/nav-list +
// "Mis tickets"/"Sin asignar" como 2 toggles sueltos que se cruzaban con
// él). Antes eran 2 superficies separadas manteniendo el mismo estado
// (dropdown+chips en Tabla, nav-list+toggles en Triage) — 2 bugs de
// desincronización seguidos entre ellas. Ahora es UNA sola lista de
// vistas, cada una un combo cerrado de estado+asignación elegido de una
// vez, no editable por separado — mismos datos, mismo componente
// (ListaVistas.vue, PASO 2) en ambos modos. ────────────────────────────────
//
// Modelo de 4 Bandejas exclusivas (ago 2026, sexta pasada — suma "Equipo"
// a la quinta tras detectar que no quedaba NINGUNA vista sin restricción de
// técnico: "Mis tickets" tapa todo lo que no sea mío, y "Sin asignar"/"Sin
// vincular" no sirven para ver el estado global de trabajo en curso):
// - `sin_asignar` / `sin_vincular`: 2 bandejas planas, agrupadas en una
//   misma sección del nav porque responden el mismo tipo de pregunta
//   ("qué necesita revisión/limpieza"), pero siguen siendo excluyentes
//   entre sí — nunca "todo se deshabilita" quiere decir que conviven.
// - `mis_tickets` / `equipo`: 2 bandejas HERMANAS, cada una con su propio
//   sub-filtro de estado (ESTADOS_SUBFILTRO, mismas 4 opciones para las
//   dos). La diferencia es SOLO el alcance de `asignadoA`: "Mis tickets"
//   acota al usuario actual, "Equipo" no acota a nadie (todos los
//   técnicos) — es la respuesta a "¿cómo veo todos los tickets de todos
//   los técnicos?". Cada una es un REQUISITO, no un modificador opcional
//   (igual que "Mis tickets" ya lo era desde la quinta pasada): los
//   sub-estados de cada una solo se pueden usar cuando SU bandeja padre
//   está activa (ver misTicketsActivo/equipoActivo, prop `disabled` de
//   ListaVistas.vue). Cada bandeja tiene su PROPIO campo de sub-estado en
//   el store (estadoMisTickets/estadoEquipo) — no comparten uno solo, para
//   que cambiar de una a la otra no pise en qué sub-estado estabas mirando
//   la anterior. En sin_asignar/sin_vincular ambos sub-filtros quedan
//   deshabilitados: no tiene sentido "sin asignar" combinado con un
//   sub-estado ni con un alcance de técnico.
// No hay bandeja "Cerrados" separada de "Resuelto" — sería deshacer la
// fusión resuelto+cerrado decidida el 2026-08-21 (ver ESTADOS_TICKET en
// dominio-tickets.js): cerrar_ticket() encadena ambos estados en un solo
// clic, nadie ve nunca un ticket parado en 'resuelto' solo, y mostrarlos
// separados solo reintroduciría la pregunta "¿en qué se diferencian?".
//
// Séptima pasada (ago 2026) — las 4 bandejas quedan al MISMO nivel en el
// nav y los sub-estados salen de ahí. Motivo: el nav tenía 12 ítems, de los
// cuales 8 eran los mismos 4 sub-estados repetidos dos veces (una bajo "Mis
// tickets", otra bajo "Equipo") y 4 estaban SIEMPRE deshabilitados — los de
// la bandeja que no fuera la activa. Un riel de 200px donde un tercio de los
// ítems está permanentemente gris y las etiquetas se repiten palabra por
// palabra a 12px de distancia no se escanea: obliga a desambiguar por
// posición relativa a un encabezado. Y las 2 bandejas más usadas ("Mis
// tickets", "Equipo") eran justo las únicas 2 sin contador.
// Ahora: 4 bandejas, las 4 con su contador, ninguna deshabilitada; el
// sub-estado es UN solo control segmentado que vive junto a la lista que
// refina (ver `subestadoActivo`). El modelo de datos no cambia — siguen
// siendo dos campos separados en el store (estadoMisTickets/estadoEquipo),
// por la misma razón de siempre.
const BANDEJAS_REVISION = [
  { id: 'sin_asignar', label: 'Sin asignar', icono: 'ti-user-off' },
  { id: 'sin_vincular', label: 'Sin vincular', icono: 'ti-alert-triangle' },
];

const BANDEJAS_TRABAJO = [
  { id: 'mis_tickets', label: 'Mis tickets', icono: 'ti-user' },
  { id: 'equipo', label: 'Equipo', icono: 'ti-users' },
];

// Sub-estados compartidos por "Mis tickets" y "Equipo" — mismas 4 opciones,
// cada bandeja las combina con su propio alcance de `asignadoA` (ver
// aplicarVista). `todos: estado ''` es a propósito SIN restricción de
// estado — la tercera pasada lo mapeaba a ESTADO_FILTRO_VIGENTES
// ("vigentes", excluye resuelto/cerrado/rechazado) y el label decía "Todos
// (vigentes)": prometía "todos" y entregaba un subconjunto, bug real
// detectado en uso. `queryTickets()` (api/domains/tickets.js) ya trata
// `estado: ''` como "sin filtro", así que esto es real: cualquier estado,
// sin recorte.
const ESTADOS_SUBFILTRO = [
  { id: 'todos', label: 'Todos', estado: '' },
  { id: 'en_progreso', label: 'En progreso', estado: 'en_progreso' },
  { id: 'resuelto', label: 'Resuelto', estado: 'resuelto' },
  { id: 'rechazado', label: 'Rechazados', estado: 'rechazado' },
];

const misTicketsActivo = computed(() => vistaActiva.value === 'mis_tickets');
const equipoActivo = computed(() => vistaActiva.value === 'equipo');

// El sub-estado solo existe para las 2 bandejas de trabajo. En
// sin_asignar/sin_vincular el control no se renderiza — antes se renderizaba
// deshabilitado, que es peor: ocupa el mismo espacio, invita al clic y no
// responde. Un control que nunca puede usarse en este contexto no debería
// estar en pantalla; el sistema ya no tiene ningún otro que lo haga.
const bandejaConSubestado = computed(() => misTicketsActivo.value || equipoActivo.value);

// Una sola superficie escribiendo en el campo de la bandeja activa. Los dos
// campos del store siguen separados a propósito (cambiar de "Mis tickets" a
// "Equipo" no pisa en qué sub-estado estabas mirando la otra) — lo que se
// unificó es el CONTROL, no el estado.
const subestadoActivo = computed({
  get: () => (misTicketsActivo.value ? store.estadoMisTickets : store.estadoEquipo),
  set: (v) => {
    if (misTicketsActivo.value) store.estadoMisTickets = v;
    else store.estadoEquipo = v;
  },
});

// vistaActiva/estadoMisTickets/estadoEquipo viven en el STORE (storeToRefs
// de arriba / store.estado*), no en refs locales — sobreviven a navegar a
// /tickets/:id y volver (ver comentario en stores/tickets.js). Arrancan en
// sus defaults de `state()`, aplicados recién en una sesión de SPA
// realmente nueva (carga de página completa).
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
    store.aplicarFiltros({ estado: sub.estado, asignadoA: '', sinAsignar: false, sinVincular: false });
  }
}
watch([vistaActiva, () => store.estadoMisTickets, () => store.estadoEquipo], aplicarVista, { immediate: true });

// "Vencidos" sigue sin funcionar de verdad (falta query de servidor) — no
// es una vista más (no tiene combo estado+asignación propio), es un ítem
// aparte deshabilitado con su propio tratamiento visual ("Próximamente",
// no candado/gris de error — ver .tnav-proximamente).

// ── Filtro secundario: Fecha de creación (ago 2026, cuarta pasada) ──────
// Prioridad/Nivel de atención/Tipo/Categoría se RETIRARON como filtros de
// este listado (el dato sigue viéndose en la tabla/detalle, solo se quitó
// la capacidad de filtrar por ellos acá) — cuatro ejes de filtro sin
// demanda real de uso, ocupando espacio permanente en el nav. Fecha de
// creación es el único que queda, eje INDEPENDIENTE de la Vista activa:
// cambiar de Vista nunca lo pisa ni viceversa (aplicarFiltros() solo
// mergea). Deliberadamente NO hay un filtro de "Estado" acá — Estado sigue
// siendo SOLO lo que la Vista activa decide.
//
// `computed` con get/set atado DIRECTO a `store.filtros`, no un ref local
// con un watcher aparte — sobrevive a navegar a /tickets/:id y volver,
// igual que vistaActiva.
const fechaDesde = computed({
  get: () => store.filtros.fechaDesde,
  set: (v) => store.aplicarFiltros({ fechaDesde: v }),
});
const fechaHasta = computed({
  get: () => store.filtros.fechaHasta,
  set: (v) => store.aplicarFiltros({ fechaHasta: v }),
});

// Cantidad de filtros SECUNDARIOS activos (sin contar Vista ni búsqueda) —
// para saber si mostrar la fila de chips removibles y el botón "Limpiar".
const cantidadFiltrosActivos = computed(() => (fechaDesde.value ? 1 : 0) + (fechaHasta.value ? 1 : 0));

function limpiarFiltrosSecundarios() {
  store.aplicarFiltros({ fechaDesde: '', fechaHasta: '' });
}

// Chip removible (una fila, sobre la lista) — mismos datos en Tabla y Triage:
// antes Triage no tenía forma de ver qué había filtrado sin abrir el popover.
const chipsFiltrosActivos = computed(() => {
  const chips = [];
  if (fechaDesde.value || fechaHasta.value) {
    const rango = [fechaDesde.value, fechaHasta.value].filter(Boolean).join(' - ');
    chips.push({ key: 'fecha', label: `Fecha: ${rango}`, quitar: () => { fechaDesde.value = ''; fechaHasta.value = ''; } });
  }
  return chips;
});

const mostrarNuevo = ref(false);
const mostrarReporte = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => {
  const mapa = {};
  for (const s of staffLista.value) mapa[s.user_id] = s.nombre;
  return mapa;
});

// ── Selección múltiple y acciones masivas (Plan Maestro, 2026-09-01) ────
// Piloto: solo el modo Tabla de escritorio — Triage muestra un ticket a la
// vez por diseño (split-view), seleccionar filas ahí no tiene sentido. El
// borde-izquierdo de acento en la fila seleccionada usa la excepción de 2px
// ya aprobada a la regla "sin bordes de costado" (mismo criterio que ya se
// usa para severidad).
//
// `seleccionados` sigue siendo un Set<id> — TODA la lógica de acciones
// masivas de abajo (ticketsSeleccionados, todosResueltos, la barra de
// selección) se queda exactamente como estaba, cero riesgo de tocarla. Lo
// único nuevo (2026-09-08, migración a AppTable) es `seleccionParaTabla`:
// un puente hacia `v-model:selection`, que en PrimeVue es un array de FILAS
// (compara por dataKey, no por id suelto) — no una razón para reescribir
// `seleccionados` a otra forma en todo el resto del archivo.
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
// Cerrar en lote solo tiene sentido si CADA seleccionado ya está resuelto —
// mismo alcance que cerrarTicket() (resuelto -> cerrado, único salto que
// hace esa RPC). No es "todos o ninguno" por conveniencia: mezclar un
// ticket abierto en la acción "Cerrar seleccionados" lo rechazaría el
// backend de todos modos (check_transicion_ticket_permitida), así que
// mejor no ofrecer la acción que ofrecerla y fallar a medias.
const todosResueltos = computed(() =>
  ticketsSeleccionados.value.length > 0 && ticketsSeleccionados.value.every((t) => t.estado === 'resuelto')
);

// Una selección de otra bandeja/búsqueda no debería sobrevivir al cambio de
// contexto — evita reasignar "lo que estaba seleccionado antes" sin querer.
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

// ── Contadores por Bandeja (rediseño ago 2026) ──────────────────────────
// Antes acá había `computed(() => ({ [vistaActiva]: total }))`: el nav solo
// sabía el total de la vista ACTIVA, así que no podía responder "¿cuántos
// sin asignar hay?" sin cambiarse de vista — que es exactamente para lo que
// existe ese nav. Ahora se cuentan las 2 bandejas planas + los 4 sub-estados
// de "Mis tickets" (asignadoA=yo) + los 4 de "Equipo" (asignadoA='', ver
// sexta pasada) de una (insforgeApi.contarTickets: una query de count por
// bandeja, sin traer filas ni embeds) — 10 en total. Los 8 sub-estados se
// cuentan SIEMPRE con su alcance fijo, no dependen de si esa Vista está
// activa ahora mismo, igual que "Sin asignar"/"Sin vincular" se cuentan
// aunque no estés parado ahí.
//
// `conteosVistas` queda como `{ sin_asignar, sin_vincular, misTickets: {
// todos, en_progreso, resuelto, rechazado }, equipo: { ... } }` — los 2
// sub-mapas evitan que "Mis tickets > En progreso" y "Equipo > En
// progreso" (mismo `id` de sub-estado) se pisen si compartieran un único
// objeto plano: cada `ListaVistas` de sub-estados recibe SU sub-mapa
// (`:conteos="conteosVistas?.misTickets"` / `?.equipo`), no el objeto
// completo.
//
// Los contadores respetan el filtro SECUNDARIO activo (búsqueda + fecha) a
// propósito: el número tiene que ser el que se va a ver al hacer clic, no
// un total teórico. Por eso se recalculan con él y NO con el cambio de
// Vista — cambiar de Vista no mueve ningún contador.
const conteosVistas = ref(null);
let peticionConteos = 0;

async function cargarConteos() {
  const peticion = ++peticionConteos;
  const secundarios = { q: store.filtros.q, fechaDesde: store.filtros.fechaDesde, fechaHasta: store.filtros.fechaHasta };
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
    // Best-effort: si los contadores fallan, ListaVistas no muestra número y
    // ya. Nunca rompen ni bloquean el listado, que es lo que el usuario vino
    // a ver — por eso acá no hay toast de error.
    if (peticion === peticionConteos) conteosVistas.value = null;
  }
}

watch([() => store.filtros.q, () => store.filtros.fechaDesde, () => store.filtros.fechaHasta], cargarConteos);

// Contador de las 4 bandejas del nav. Las 2 de trabajo usan el conteo de su
// sub-estado `todos` — que es el total real de esa bandeja sin recorte de
// estado, no una suma de los otros tres (ver ESTADOS_SUBFILTRO: `todos` es
// `estado: ''`, sin filtro). Antes "Mis tickets" y "Equipo" eran las únicas
// bandejas sin número, justo las dos que más se miran.
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

// Los 4 conteos del sub-estado de la bandeja activa. El control segmentado
// es uno solo, así que recibe el sub-mapa que corresponda — los dos mapas
// siguen calculándose siempre (no dependen de qué bandeja esté activa), lo
// que cambia es cuál se muestra.
const conteosSubestado = computed(() =>
  (misTicketsActivo.value ? conteosVistas.value?.misTickets : conteosVistas.value?.equipo) || null);

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

// Paginación (ex-CarbonPagination): server-side, la fuente es el store.
const totalPaginasTickets = computed(() => totalPaginasDe(total.value, store.tamPagina));
const paginasTickets = computed(() => paginasDe(totalPaginasTickets.value));
const rangoTickets = computed(() => rangoDe(paginaActual.value, store.tamPagina, total.value));
function irAPaginaTickets(pagina) {
  const destino = clampPagina(pagina, totalPaginasTickets.value);
  if (destino !== store.pagina) store.irAPagina(destino);
}

// Tabla (ex-CarbonDataTable): derivaciones de `columnasTickets` para el
// <table> y la tarjeta móvil escritos a mano más abajo.
const columnasVisiblesTickets = computed(() => columnasVisibles(columnasTickets));
const enTarjetaTickets = computed(() => agruparParaTarjeta(columnasVisiblesTickets.value));

// Antigüedad: siempre visible bajo la fecha; se resalta cuando señala
// riesgo operativo (abierto sin atender >24h, en curso sin novedad >3 días).
function ticketEnvejecido(t) {
  const horas = (Date.now() - new Date(t.created_at).getTime()) / 3600000;
  if (t.estado === 'abierto') return horas > 24;
  if (t.estado === 'en_progreso' || t.estado === 'reabierto') return horas > 72;
  return false;
}

// Tipo (incidente/solicitud) salió de la tarjeta angosta de Triage en el
// rediseño de ago 2026: era la píldora más débil de la tarjeta (2 valores
// fijos, sin color propio, sin peso en el triage) y su lugar lo ocupa ahora
// Prioridad, que sí decide el orden de atención. Sigue visible y editable en
// el panel de detalle — no se perdió el dato, se sacó de la lista.

// Fecha relativa hasta el umbral; más vieja, fecha corta (DD/MM) en vez de
// "hace 12 d" — pasado cierto punto la fecha concreta ubica mejor que la
// antigüedad relativa. Solo para la lista angosta de Triage: no toca
// formatAntiguedad() (compartida con la tarjeta mobile, que no cambia).
const UMBRAL_FECHA_CORTA_DIAS = 7;
function fechaListaAngosta(iso) {
  const dias = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (dias < UMBRAL_FECHA_CORTA_DIAS) return formatAntiguedad(iso);
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}

// Triage (desktop): selecciona en el panel, sin navegar. Tabla o mobile
// (vistaEfectiva ya resuelve mobile a 'tabla'): navega a la página
// completa, igual que el comportamiento de siempre.
// Clases de fila: la MISMA función alimenta el <tr> de escritorio (vía
// `:row-class` de AppTable — es una prop nativa de DataTable, no un invento
// nuestro, ver AppTable.vue) y el <li> de la tarjeta móvil, así que
// devuelve la unión de las dos familias de clases que antes vivían por
// separado a mano: `.fila-ticket*` (reglas que apuntan a `td`, sirven en la
// fila de escritorio) y `.tarjeta-fila--activa` (reglas sin `td`, sirven en
// la tarjeta). Ambos juegos de selectores siguen existiendo tal cual en el
// <style> de abajo — esto no les agrega trabajo, solo hace que las dos
// superficies reciban las clases que ya necesitaban.
function claseFilaTicket(fila) {
  const clases = ['fila-ticket', 'tarjeta-fila--clic'];
  if (fila.id === store.ultimoAbierto) clases.push('fila-ticket--activa', 'tarjeta-fila--activa');
  if (estaSeleccionado(fila.id)) clases.push('fila-ticket--seleccionada');
  return clases;
}

// aria-current, no solo la clase visual: la fila activa (el ticket que se
// está viendo) lo lleva para que un lector de pantalla lo anuncie, no solo
// lo resalte en color. `claseFilaTicket` no expresa atributos ARIA, por eso
// esta función existe aparte — en la tabla de escritorio se conecta vía
// `:row-attrs` de AppTable (prop nueva, 2026-09-08: DataTable no tiene un
// equivalente nativo a "atributos extra por fila" más allá de clase/estilo,
// así que se resuelve por PT — ver table.pt.js).
function filaAtributosTicket(fila) {
  return fila.id === store.ultimoAbierto ? { 'aria-current': 'true' } : null;
}

function verTicket(ticket) {
  // Se marca en los dos modos: en Triage la selección ya se ve por
  // `ticketSeleccionado`, pero en Tabla es lo único que permite volver del
  // detalle y reencontrar en qué fila se estaba.
  store.ultimoAbierto = ticket.id;
  if (vistaEfectiva.value === 'triage') {
    ticketSeleccionado.value = ticket.id;
    return;
  }
  router.push(`/tickets/${ticket.id}`);
}

// ── Exportar la bandeja (guía externa §1.1: botón en la toolbar) ────────
// Los mismos filtros que están puestos en pantalla, sin página. La cabecera y
// el mapeo de fila son los de core/exportar-tickets.js, compartidos con las 2
// exportaciones de ReporteTicketsModal.vue — una sola forma del CSV para las
// tres, no una copia por botón.
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

// ── Atajos de teclado (guía externa §10) ────────────────────────────────
// El ref se declara una sola vez aunque haya dos plantillas: Tabla y Triage
// son ramas v-if/v-else, así que solo una está montada y solo esa escribe el
// ref. Ya no hay atajo "f": los filtros secundarios dejaron de vivir detrás
// de un popover (ver nota en el template, sección "filtros secundarios") —
// están siempre visibles, así que no hay nada que "abrir".
const refBuscador = ref(null);

useAtajosLista({
  onBuscar: () => refBuscador.value?.focus(),
});

// Enlace público único (landing /soporte): desde ahí el empleado elige
// reportar o buscar por DNI — reemplaza los dos enlaces sueltos de antes.
async function copiarEnlaceSoporte() {
  const link = `${window.location.origin}${router.resolve({ name: 'soporte' }).href}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast('Enlace de soporte copiado');
  } catch {
    showToast('No se pudo copiar. Copia manualmente: ' + link, 'error');
  }
}

// Menú "Más" — en escritorio Y móvil (rediseño ago 2026, séptima pasada;
// consolidado en la décima). El header tenía 5 controles al mismo peso
// visual: selector de vista + 3 botones secundarios con texto + el
// primario. Las cuatro acciones secundarias (Enlace soporte, Reporte,
// Satisfacción, Exportar datos) son todas de baja frecuencia frente a
// "+ Ticket interno" — ninguna se usa varias veces por turno, a diferencia
// de crear un ticket — así que ninguna necesita quedar como botón suelto
// en el header compitiendo con el único acento de la vista. "Reporte"
// vivía como botón propio hasta la séptima pasada (se consideraba de uso
// más frecuente); feedback directo de uso lo bajó también a "Más" en la
// décima — confirma el mismo criterio para las cuatro, no una excepción.
//
// Orden pedido por el JEFE al usar el menú (décima pasada): Enlace
// soporte → Reporte → Satisfacción → Exportar datos. "Exportar" se sumó
// acá desde la toolbar de Tabla en la séptima pasada, y eso además CERRÓ
// UN HUECO real: vivía en `.tickets-filtros`, que solo se renderiza en
// modo Tabla — desde Triage no había forma de exportar la bandeja.
const accionesMas = computed(() => [
  { icono: 'ti-link', label: 'Enlace soporte', onClick: copiarEnlaceSoporte },
  { icono: 'ti-report', label: 'Reporte', onClick: () => { mostrarReporte.value = true; } },
  { icono: 'ti-mood-smile', label: 'Satisfacción', onClick: () => router.push('/tickets/satisfaccion') },
  {
    // `:class` de MenuAcciones acepta la cadena con varias clases, así que
    // el spinner gira igual que giraba en el botón de la toolbar.
    icono: exportando.value ? 'ti-loader-2 spinner-icon' : 'ti-download',
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
  // Solo el buscador se resetea acá desde ago 2026 (ver
  // resetearBusqueda() en stores/tickets.js) — Vista/estadoMisTickets/fecha
  // YA NO se tocan: viven en controles atados directo al store y sobreviven
  // a propósito a este remontaje (volver de /tickets/:id). El watcher de
  // vistaActiva (arriba, immediate:true) corre apenas se crea y ya deja
  // estado/asignadoA/sinAsignar/sinVincular consistentes con lo que
  // vistaActiva tenga en ese momento — sea 'sin_asignar' recién nacido o lo
  // que el usuario haya dejado antes de navegar al detalle.
  store.resetearBusqueda();
  try {
    const [, staff] = await Promise.all([
      store.cargar(),
      insforgeApi.nombresStaff(),
    ]);
    staffLista.value = staff;
    // Después del listado y sin await: los contadores son secundarios, no
    // deben retrasar la primera pintada de la tabla.
    cargarConteos();
  } catch {
    showToast(error.value || 'Error al cargar tickets', 'error');
  }
});
</script>

<template>
  <div class="tickets-page vista-modulo">
    <PageHeader titulo="Tickets" icono="ti ti-headset" :conteo="total">
      <!-- Séptima pasada (ago 2026): de 5 controles a 4 (Satisfacción y
           Enlace soporte bajaron al menú "Más" — dos botones de texto de
           baja frecuencia con el mismo peso visual que el acento de la
           vista). Décima pasada: de 4 a 3 — "Reporte" también baja a "Más"
           (ver `accionesMas` en el script para el orden y el porqué), con
           el mismo criterio que ya se aplicó a los otros dos. Queda:
           vista · Más · el único .btn-primary. -->
      <template #acciones>
        <SelectorVista v-model="vista" :opciones="OPCIONES_VISTA_TICKETS" class="solo-escritorio" />
        <MenuAcciones texto="Más" label="Más acciones" :acciones="accionesMas" />
        <AppButton severity="primary" icon="ti ti-plus" label="Ticket interno" @click="mostrarNuevo = true" />
      </template>
    </PageHeader>

    <!-- ═══ Shell común a los modos (renombrado y unificado octava pasada,
         ver el <style> más abajo) ═══════════════════════════════════════
         Las Bandejas (nav de Vistas) son un panel lateral fijo en TODOS los
         modos, no un elemento que se muda de lugar al cambiar de vista.
         Antes el nav solo existía en Triage (entonces "Isla") y en Tabla las
         Vistas eran una fila horizontal dentro de la barra de filtros:
         alternar Tabla/Triage movía las bandejas de arriba a la izquierda,
         que es el tipo de salto que hace dudar de si cambió algo más. Ahora
         los modos comparten `nav + contenido` y lo único que cambia es el
         contenido — y, desde la octava pasada, también comparten el mismo
         tratamiento visual de tarjeta flotante (nav y contenido), no solo el
         mismo esqueleto: antes Tabla iba pegada a los bordes sin marco y
         Triage flotaba con gap/padding, así que cambiar de modo reflejaba
         ese quiebre en cada esquina.
         El nav no se monta en mobile (v-if="!esMovil", igual que antes): ahí
         las Vistas vuelven a la barra de filtros como fila horizontal — mismo
         componente y mismo v-model, solo otro contenedor. ══════════════ -->
    <div class="tickets-shell" :class="`tickets-shell--${vistaEfectiva}`">
      <nav v-if="!esMovil" class="tickets-nav" aria-label="Bandejas de tickets">
        <!-- Sección 1: qué necesita revisión. "Sin asignar" y "Sin vincular"
             responden el mismo tipo de pregunta ("qué está sin tocar"), por
             eso van juntas y separadas de las bandejas de trabajo. -->
        <ListaVistas v-model="vistaActiva" :vistas="BANDEJAS_REVISION" :conteos="conteosBandejas" class="tickets-nav-vistas" />

        <div class="tnav-separador" role="separator"></div>

        <!-- Sección 2: bandejas de trabajo. Las 4 bandejas del nav están
             ahora al mismo nivel jerárquico y las 4 llevan contador; los
             sub-estados de "Mis tickets"/"Equipo" ya NO viven acá (ver la
             nota larga de la séptima pasada en el script: 8 de los 12 ítems
             del riel eran los mismos 4 sub-estados duplicados, y 4 estaban
             siempre deshabilitados). El sub-estado es un control segmentado
             junto a la lista que refina, no un segundo nivel de riel. -->
        <ListaVistas v-model="vistaActiva" :vistas="BANDEJAS_TRABAJO" :conteos="conteosBandejas" class="tickets-nav-vistas" />

        <!-- Sub-estado de la bandeja de trabajo activa: UNA instancia, no una
             por bandeja. Se pinta indentada bajo las dos bandejas de trabajo
             y desaparece por completo en sin_asignar/sin_vincular. Vertical y
             no un control segmentado horizontal porque el riel mide 200px:
             "Todos · En progreso · Resuelto · Rechazados" con sus contadores
             no entra en una fila de ese ancho (en móvil, donde hay ancho de
             sobra, sí va como segmento — ver la barra de filtros). -->
        <div v-if="bandejaConSubestado" class="tk-subestado-nav">
          <span class="tk-nav-titulo">Estado</span>
          <ListaVistas
            v-model="subestadoActivo"
            :vistas="ESTADOS_SUBFILTRO"
            :conteos="conteosSubestado"
            class="tickets-nav-vistas tk-substate"
          />
        </div>

        <div class="tnav-separador" role="separator"></div>

        <!-- Filtro secundario: Fecha de creación. Eje siempre visible, no
             detrás de un popover (ver "cuarta pasada" en GUIA-UX-UI.md sobre
             el retiro de MasFiltros.vue). El markup vive en
             FiltroFechaCreacion.vue porque también se pinta en la barra de
             filtros en móvil, donde no hay nav. -->
        <div class="tk-filtros-secundarios">
          <FiltroFechaCreacion v-model:desde="fechaDesde" v-model:hasta="fechaHasta" id-prefijo="tk-filtro-fecha-nav" />
          <button v-if="cantidadFiltrosActivos > 0" type="button" class="tk-filtros-limpiar" @click="limpiarFiltrosSecundarios">
            <i class="ti ti-x" aria-hidden="true"></i> Limpiar filtros ({{ cantidadFiltrosActivos }})
          </button>
        </div>

      </nav>

    <!-- ═══ Tabla (default, y siempre en mobile — ver vistaEfectiva) ═══ -->
    <main v-if="vistaEfectiva === 'tabla'" class="page">
      <div class="card card--fill">
        <!-- Toolbar de UNA fila: buscador + sub-estado. "Exportar" se fue al
             menú "Más" del header (séptima pasada) — vivía solo acá, así que
             desde Triage no se podía exportar; ahora sirve a las dos vistas.
             Vistas y Prioridad ya vivían en el nav lateral. -->
        <div class="filters tickets-filtros">
          <!-- Solo mobile: sin nav lateral, las 4 Bandejas necesitan un
               lugar en la barra. Mismo componente y mismo v-model que el
               nav, en fila horizontal. -->
          <ListaVistas
            v-if="esMovil"
            v-model="vistaActiva"
            :vistas="[...BANDEJAS_REVISION, ...BANDEJAS_TRABAJO]"
            :conteos="conteosBandejas"
            class="tickets-vistas-fila"
          />
          <!-- Sub-estado en móvil: mismo v-model y mismos datos que el riel,
               como control segmentado. Contenido en un grupo con borde a
               propósito: suelto en la barra, sus 4 ítems se leerían igual que
               las 4 bandejas de la fila de arriba, que son otro eje. El
               segmento dice "estos 4 son un solo eje, y no es el de arriba". -->
          <ListaVistas
            v-if="esMovil && bandejaConSubestado"
            v-model="subestadoActivo"
            :vistas="ESTADOS_SUBFILTRO"
            :conteos="conteosSubestado"
            variante="segmento"
            class="tk-subestado"
          />
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input ref="refBuscador" v-model="busqueda" type="text" placeholder="Buscar por código, título o solicitante...">
            <kbd class="search-atajo solo-escritorio" aria-hidden="true">/</kbd>
          </div>
        </div>

        <!-- En mobile no hay nav lateral, así que el filtro secundario
             (Fecha de creación) va en su propia fila visible, mismo bloque
             que el nav de escritorio (ver nota "cuarta pasada" arriba). -->
        <div v-if="esMovil" class="tk-filtros-secundarios tk-filtros-secundarios--movil">
          <FiltroFechaCreacion v-model:desde="fechaDesde" v-model:hasta="fechaHasta" id-prefijo="tk-filtro-fecha-movil" />
          <button v-if="cantidadFiltrosActivos > 0" type="button" class="tk-filtros-limpiar" @click="limpiarFiltrosSecundarios">
            <i class="ti ti-x" aria-hidden="true"></i> Limpiar filtros ({{ cantidadFiltrosActivos }})
          </button>
        </div>

        <!-- Chips de filtros activos (ago 2026): fila removible sobre la
             tabla, visible SOLO cuando hay algo puesto — evita el "¿qué
             filtro tengo activo?" que antes obligaba a reabrir el popover
             para acordarse. "Limpiar todo" quita los 6 ejes secundarios de
             una — la Vista y el buscador NO se tocan, son ejes aparte. -->
        <div v-if="cantidadFiltrosActivos > 0" class="tk-chips-activos">
          <button
            v-for="chip in chipsFiltrosActivos"
            :key="chip.key"
            type="button"
            class="chip-filtro chip-filtro--activo tk-chip-quitar"
            @click="chip.quitar"
          >
            {{ chip.label }} <i class="ti ti-x" aria-hidden="true"></i>
          </button>
          <button type="button" class="tk-limpiar-todo" @click="limpiarFiltrosSecundarios">Limpiar todo</button>
        </div>

        <div v-if="cargando" class="no-results solo-movil">Cargando tickets...</div>
        <div v-else-if="error" class="no-results tk-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-headset"
          titulo="Sin tickets"
          :mensaje="busqueda || vistaActiva !== 'sin_asignar' || cantidadFiltrosActivos > 0 ? 'No hay resultados con los filtros aplicados.' : 'No hay tickets sin asignar en este momento — no significa que el sistema esté vacío, revisa las otras bandejas.'"
        />

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando tickets…</p>

        <div v-if="seleccionados.size > 0" class="barra-seleccion solo-escritorio" role="toolbar" aria-label="Acciones sobre los tickets seleccionados">
          <span class="barra-seleccion__conteo">{{ seleccionados.size }} seleccionado{{ seleccionados.size === 1 ? '' : 's' }}</span>
          <div class="barra-seleccion__acciones">
            <select v-model="reasignarLoteA" aria-label="Reasignar seleccionados a" :disabled="procesandoLote">
              <option value="" disabled>Reasignar a...</option>
              <option v-for="s in staffLista" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
            </select>
            <AppButton
              severity="secondary"
              size="sm"
              label="Reasignar"
              :disabled="!reasignarLoteA || procesandoLote"
              @click="pedirReasignarLote"
            />
            <AppButton
              severity="secondary"
              size="sm"
              label="Cerrar seleccionados"
              :disabled="!todosResueltos || procesandoLote"
              :title="todosResueltos ? 'Cerrar los tickets seleccionados' : 'Solo se pueden cerrar en lote tickets ya resueltos'"
              @click="pedirCerrarLote"
            />
            <AppButton severity="secondary" size="sm" label="Cancelar" :disabled="procesandoLote" @click="limpiarSeleccion" />
          </div>
        </div>

        <!-- Rediseño ago 2026 — de 8 columnas a 6 (7 hasta la séptima
             pasada, que fusionó Nivel de atención en la celda "Ticket"; el
             comentario decía 6 desde antes, contando de más), y de 3
             píldoras de color por fila a 1. Qué cambió y por qué:
             · Código + Categoría + Título colapsan en UNA celda "Ticket"
               (.celda-apilada): el código y la categoría van arriba en gris
               chico, el título abajo. Da jerarquía SIN negrita, que es lo
               que exige la regla de tipografía uniforme de tabla.
             · Fecha + Antigüedad colapsan en "Edad" (una línea, no dos): la
               fecha exacta pasa al `title`. Ahorra media fila de alto en
               TODAS las filas para un dato que casi nunca se lee al segundo
               exacto.
             · Prioridad deja de ser badge y pasa a punto+texto
               (IndicadorPrioridad) y se va a la izquierda: es el primer
               criterio de triage, se escanea en vertical.
             · Categoría deja de ser badge: es metadato, no estado.
             · Nivel de atención (séptima pasada) pierde su columna y se
               suma a esa misma línea de metadatos: un código de 2 caracteres
               que además suele venir vacío no justifica una columna propia,
               y el resultado era una columna casi entera de "—". Es la
               misma familia que Categoría; va donde ya vive esa familia.
             Ordenar por `titulo` se retiró con la columna: ordenar una cola
             de tickets por título alfabético no responde ninguna pregunta
             operativa. Las otras 4 claves siguen.

             Migración a CarbonDataTable (2026-09-03, Tanda 4): reemplaza el
             <table> de escritorio Y su tarjeta móvil duplicada de abajo
             (antes 2 templates a mano, ahora 1 definición de columnas —
             ver `columnasTickets`). `densidad="lg"` confirmado por el
             JEFE. `claseFilaTicket` unifica las clases de fila que antes
             vivían por separado en el <tr> y el <li> (ver el comentario en
             el script) — el <style> de abajo no cambió una línea. -->
        <div class="tabla-envoltorio solo-escritorio">
          <AppTable
            v-model:selection="seleccionParaTabla"
            :value="lista"
            :loading="cargando"
            :total-records="total"
            :rows="store.tamPagina"
            :sort-field="sortFieldTabla"
            :sort-order="sortOrderTabla"
            :row-class="claseFilaTicket"
            :row-attrs="filaAtributosTicket"
            :table-props="{ 'aria-label': 'Tickets de soporte' }"
            @ordenar="store.ordenarPor"
            @row-click="({ data }) => verTicket(data)"
          >
            <!-- Selección múltiple (piloto, solo esta tabla): columna real
                 de PrimeVue, no un checkbox a mano — ver AppTable.vue. -->
            <AppColumn selection-mode="multiple" :header-style="{ width: '36px' }" />

            <AppColumn field="prioridad" header="Prioridad" sortable>
              <template #body="{ data: fila }"><IndicadorPrioridad :valor="fila.prioridad" /></template>
            </AppColumn>

            <AppColumn field="codigo" header="Ticket" sortable>
              <template #body="{ data: fila }">
                <div class="celda-apilada">
                  <span class="celda-apilada__meta">
                    <RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${fila.id}`" @click.stop>{{ fila.codigo }}</RouterLink>
                    <template v-if="fila.categoria">
                      <span class="celda-sep" aria-hidden="true">·</span>
                      <span class="tk-categoria">{{ fila.categoria }}</span>
                    </template>
                    <!-- Nivel de atención se fusiona acá (séptima pasada). Ver
                         nota larga en el comentario del script: misma familia
                         que Categoría, sin `v-else`/TextoVacio a propósito. -->
                    <template v-if="fila.nivel_atencion">
                      <span class="celda-sep" aria-hidden="true">·</span>
                      <span class="tk-nivel" :title="`Nivel de atención ${fila.nivel_atencion}`">{{ fila.nivel_atencion }}</span>
                    </template>
                  </span>
                  <span class="celda-apilada__principal">{{ fila.titulo }}</span>
                </div>
              </template>
            </AppColumn>

            <AppColumn field="solicitante" header="Solicitante">
              <template #body="{ data: fila }">
                <span v-if="!fila.vinculado" class="tag badge-inline" :class="`tag--${rolDeTag(badgeInfo('ticket_sin_vincular').clase)}`" title="No se pudo identificar al solicitante">
                  <i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}
                </span>
                <RouterLink v-else-if="fila.solicitante_id" class="empleado-link" :to="`/empleados/${fila.solicitante_id}`" @click.stop>{{ fila.solicitante }}</RouterLink>
                <TextoVacio v-else :valor="fila.solicitante" />
              </template>
            </AppColumn>

            <AppColumn field="estado" header="Estado" sortable>
              <template #body="{ data: fila }"><BadgeEstado tipo="ticket" :valor="fila.estado" /></template>
            </AppColumn>

            <AppColumn field="asignado_a" header="Asignado a">
              <!-- Sin avatar acá a propósito: .avatar.sm mide 32px y llevaría
                   la fila de ~32px a ~50px, anulando la densidad nueva — y
                   suma un círculo de acento por fila, justo el ruido de
                   color que este rediseño quita. El avatar se queda donde sí
                   paga: la tarjeta angosta de Triage, que no tiene ancho para
                   el nombre completo. -->
              <template #body="{ data: fila }">
                <TextoVacio v-if="!fila.asignado_a" placeholder="Sin asignar" />
                <span v-else class="tk-asignado">{{ staffPorId[fila.asignado_a] || 'Staff' }}</span>
              </template>
            </AppColumn>

            <AppColumn field="created_at" header="Edad" sortable>
              <template #body="{ data: fila }">
                <span class="tk-edad" :class="{ 'tk-antiguedad--alerta': ticketEnvejecido(fila) }" :title="formatFechaHora(fila.created_at)">
                  {{ formatAntiguedad(fila.created_at) }}
                </span>
              </template>
            </AppColumn>
          </AppTable>
        </div>

        <ul v-if="!cargando && lista.length" class="lista-tarjetas solo-movil" aria-label="Tickets de soporte">
          <li
            v-for="fila in lista"
            :key="fila.id"
            class="tarjeta-fila"
            :class="claseFilaTicket(fila)"
            @click="verTicket(fila)"
          >
            <div v-if="enTarjetaTickets.cab.length" class="tarjeta-fila__cab">
              <template v-for="col in enTarjetaTickets.cab" :key="col.clave">
                <span v-if="col.clave === 'created_at'" class="tk-edad" :class="{ 'tk-antiguedad--alerta': ticketEnvejecido(fila) }" :title="formatFechaHora(fila.created_at)">
                  {{ formatAntiguedad(fila.created_at) }}
                </span>
              </template>
            </div>

            <div v-for="col in enTarjetaTickets.principal" :key="col.clave" class="tarjeta-fila__principal">
              <div v-if="col.clave === 'codigo'" class="celda-apilada">
                <span class="celda-apilada__meta">
                  <RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${fila.id}`" @click.stop>{{ fila.codigo }}</RouterLink>
                  <template v-if="fila.categoria">
                    <span class="celda-sep" aria-hidden="true">·</span>
                    <span class="tk-categoria">{{ fila.categoria }}</span>
                  </template>
                  <template v-if="fila.nivel_atencion">
                    <span class="celda-sep" aria-hidden="true">·</span>
                    <span class="tk-nivel" :title="`Nivel de atención ${fila.nivel_atencion}`">{{ fila.nivel_atencion }}</span>
                  </template>
                </span>
                <span class="celda-apilada__principal">{{ fila.titulo }}</span>
              </div>
            </div>

            <div v-for="col in enTarjetaTickets.sec" :key="col.clave" class="tarjeta-fila__sec">
              <template v-if="col.clave === 'solicitante'">
                <span v-if="!fila.vinculado" class="tag badge-inline" :class="`tag--${rolDeTag(badgeInfo('ticket_sin_vincular').clase)}`" title="No se pudo identificar al solicitante">
                  <i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}
                </span>
                <RouterLink v-else-if="fila.solicitante_id" class="empleado-link" :to="`/empleados/${fila.solicitante_id}`" @click.stop>{{ fila.solicitante }}</RouterLink>
                <TextoVacio v-else :valor="fila.solicitante" />
              </template>
              <template v-else-if="col.clave === 'asignado_a'">
                <TextoVacio v-if="!fila.asignado_a" placeholder="Sin asignar" />
                <span v-else class="tk-asignado">{{ staffPorId[fila.asignado_a] || 'Staff' }}</span>
              </template>
            </div>

            <div v-if="enTarjetaTickets.pie.length" class="tarjeta-fila__pie">
              <template v-for="col in enTarjetaTickets.pie" :key="col.clave">
                <IndicadorPrioridad v-if="col.clave === 'prioridad'" :valor="fila.prioridad" />
                <BadgeEstado v-else-if="col.clave === 'estado'" tipo="ticket" :valor="fila.estado" />
              </template>
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
                @change="store.cambiarTamPagina($event.target.value)"
              >
                <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <span class="paginacion__rango">{{ rangoTickets.desde }}–{{ rangoTickets.hasta }} de {{ total }} tickets</span>
          </div>

          <div v-if="totalPaginasTickets > 1" class="paginacion__lado">
            <label class="paginacion__campo">
              <span class="sr-only">Ir a la página</span>
              <select class="paginacion__select" :value="paginaActual" @change="irAPaginaTickets(Number($event.target.value))">
                <option v-for="p in paginasTickets" :key="p" :value="p">{{ p }}</option>
              </select>
              <span>de {{ totalPaginasTickets }}</span>
            </label>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual <= 1" aria-label="Página anterior" @click="irAPaginaTickets(paginaActual - 1)">
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual >= totalPaginasTickets" aria-label="Página siguiente" @click="irAPaginaTickets(paginaActual + 1)">
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
        </template>
      </div>
    </main>

    <!-- ═══ Triage (desktop, ver vistaEfectiva): lista angosta + panel de
         detalle. El nav ya está arriba, compartido con Tabla ═══ -->
    <template v-else>
      <main class="page tickets-lista">
        <div class="card card--fill">
          <!-- Solo el buscador: bandejas, sub-estado y fecha viven todos en
               el riel compartido de arriba, que es el mismo en las dos
               vistas. Esta columna mide ~25% del ancho y no es lugar para
               ejes de filtro. -->
          <div class="filters tickets-filtros">
            <div class="search-wrap search-wrap--full">
              <i class="ti ti-search"></i>
              <input ref="refBuscador" v-model="busqueda" type="text" placeholder="Buscar por código, título o solicitante...">
              <kbd class="search-atajo" aria-hidden="true">/</kbd>
            </div>
          </div>

          <!-- Chips de filtros activos + conteo de resultados (ago 2026):
               en Triage la lista angosta nunca tuvo tabla ni cabecera de
               columnas — sin esto no había forma de ver qué filtro estaba
               puesto ni cuántos tickets calzaban sin contar tarjetas a
               ojo. Los filtros en sí (Prioridad/Nivel/Tipo/Categoría/
               Fecha) ya viven siempre visibles en el nav compartido de
               arriba — Triage no necesita su propia fila, es el mismo bloque
               para las dos vistas. -->
          <div v-if="!cargando" class="tk-resultados-fila">
            <span class="tk-resultados-conteo">{{ total }} resultado{{ total === 1 ? '' : 's' }}</span>
            <div v-if="cantidadFiltrosActivos > 0" class="tk-chips-activos tk-chips-activos--triage">
              <button
                v-for="chip in chipsFiltrosActivos"
                :key="chip.key"
                type="button"
                class="chip-filtro chip-filtro--activo tk-chip-quitar"
                @click="chip.quitar"
              >
                {{ chip.label }} <i class="ti ti-x" aria-hidden="true"></i>
              </button>
              <button type="button" class="tk-limpiar-todo" @click="limpiarFiltrosSecundarios">Limpiar todo</button>
            </div>
          </div>

          <div v-if="cargando" class="no-results">Cargando tickets...</div>
          <div v-else-if="error" class="no-results tk-error">{{ error }}</div>

          <EmptyState
            v-else-if="!cargando && total === 0"
            icono="ti ti-headset"
            titulo="Sin tickets"
            :mensaje="busqueda || vistaActiva !== 'sin_asignar' || cantidadFiltrosActivos > 0 ? 'No hay resultados con los filtros aplicados.' : 'No hay tickets sin asignar en este momento — no significa que el sistema esté vacío, revisa las otras bandejas.'"
          />

          <template v-if="!error && (cargando || total > 0)">
          <p v-if="cargando" class="sr-only" role="status">Cargando tickets…</p>
          <ul v-if="!cargando" class="lista-tarjetas" aria-label="Tickets de soporte">
            <!-- Rediseño ago 2026 — la tarjeta angosta pasa a responder las
                 3 preguntas del triage en 3 renglones fijos:
                   quién/cuál →  TCK-0142 · María Quispe        hace 3 h
                   qué        →  Impresora del piso 3 no imprime
                   cómo va    →  [Abierto]  ● Alta                   (MQ)
                 Antes faltaban Prioridad y Solicitante — una lista de triage
                 sin prioridad no permite triar, y sin solicitante no se
                 reconoce el caso sin abrirlo. Entraron en lugar de la
                 píldora de Tipo (ver nota en el script). -->
            <li
              v-for="t in lista"
              :key="t.id"
              class="tarjeta-fila tarjeta-fila--clic"
              :class="{ 'tarjeta-fila--activa': t.id === ticketSeleccionado }"
              :aria-current="t.id === ticketSeleccionado ? 'true' : undefined"
              @click="verTicket(t)"
            >
              <div class="tarjeta-fila__cab">
                <span class="tfs-identidad">
                  <RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${t.id}`" @click.stop>{{ t.codigo }}</RouterLink>
                  <!-- Indicador de vinculado (4.6): faltaba en esta tarjeta —
                       la versión móvil ya lo mostraba como badge con texto,
                       acá va solo el ícono (sin espacio para un badge en una
                       columna de ~240px) con title/aria-label como único
                       texto accesible. -->
                  <i
                    v-if="!t.vinculado"
                    class="ti ti-alert-triangle tfs-sin-vincular"
                    title="No se pudo identificar al solicitante"
                    aria-label="Sin vincular"
                  ></i>
                  <template v-if="t.solicitante">
                    <span class="celda-sep" aria-hidden="true">·</span>
                    <span class="tfs-solicitante">{{ t.solicitante }}</span>
                  </template>
                </span>
                <span class="tk-antiguedad" :class="{ 'tk-antiguedad--alerta': ticketEnvejecido(t) }">{{ fechaListaAngosta(t.created_at) }}</span>
              </div>
              <!-- `title` porque en esta columna el texto se recorta a 2
                   líneas (ver .tickets-lista .tarjeta-fila__principal): el
                   título completo tiene que seguir a mano sin abrir el
                   ticket. La tarjeta móvil no lo lleva — ahí no se corta. -->
              <div class="tarjeta-fila__principal" :title="t.titulo">{{ t.titulo }}</div>
              <div class="tarjeta-fila__pie">
                <div class="tfs-badges">
                  <BadgeEstado tipo="ticket" :valor="t.estado" />
                  <IndicadorPrioridad :valor="t.prioridad" />
                </div>
                <span v-if="t.asignado_a" class="avatar sm" :class="tonoAvatar(staffPorId[t.asignado_a])" :title="staffPorId[t.asignado_a] || 'Staff'">{{ inicialesDe(staffPorId[t.asignado_a]) }}</span>
                <span v-else class="avatar sm avatar--neutro" title="Sin asignar">
                  <i class="ti ti-user" aria-hidden="true"></i>
                </span>
              </div>
            </li>
          </ul>

          <div v-if="!cargando && lista.length < total" class="tickets-cargar-mas">
            <AppButton
              severity="secondary"
              :label="cargandoMas ? 'Cargando...' : `Cargar más (${lista.length} de ${total})`"
              :loading="cargandoMas"
              @click="store.cargarMas()"
            />
          </div>
          </template>
        </div>
      </main>

      <TicketDetallePanel
        v-if="ticketSeleccionado"
        :key="ticketSeleccionado"
        class="tickets-panel"
        :ticket-id="ticketSeleccionado"
        @cerrar="ticketSeleccionado = null"
      />
      <!-- Estado vacío del panel con EmptyState, el componente que ya usan
           las otras 15 vistas, en vez de un ícono + 2 <p> hechos a mano con
           su propio tamaño de ícono (28px sueltos). El contenedor sigue
           siendo esa tarjeta (borde, radio, superficie elevada); lo que se
           delega es la composición interna.
           Copy impersonal, sin voseo ni tuteo (regla de tono del proyecto):
           el estado vacío nombra la superficie y no da una orden. -->
      <div v-else class="tickets-panel tickets-panel-vacio">
        <EmptyState
          icono="ti ti-headset"
          titulo="Detalle del ticket"
          mensaje="Seleccionar un ticket de la lista para ver su detalle acá."
        />
      </div>
    </template>
    </div>

    <TicketInternoForm v-if="mostrarNuevo" @cerrar="onNuevoCerrado" />
    <ReporteTicketsModal v-if="mostrarReporte" :staff-por-id="staffPorId" @cerrar="mostrarReporte = false" />

    <!-- Acciones masivas (Plan Maestro, 2026-09-01): mismo criterio que la
         baja de empleado — mostrar la lista real afectada antes de
         confirmar, no un "¿estás seguro? (N tickets)" ciego. -->
    <ConfirmDialog
      v-if="mostrarConfirmarReasignarLote"
      titulo="Reasignar tickets"
      confirmar-label="Reasignar"
      :cargando="procesandoLote"
      @cancel="mostrarConfirmarReasignarLote = false"
      @confirm="confirmarReasignarLote"
    >
      <p>Reasignar {{ ticketsSeleccionados.length }} ticket(s) a <strong>{{ staffPorId[reasignarLoteA] || 'Staff' }}</strong>:</p>
      <ul class="lote-lista">
        <li v-for="t in ticketsSeleccionados" :key="t.id">{{ t.codigo }} — {{ t.titulo }}</li>
      </ul>
    </ConfirmDialog>

    <ConfirmDialog
      v-if="mostrarConfirmarCerrarLote"
      titulo="Cerrar tickets"
      confirmar-label="Cerrar"
      :cargando="procesandoLote"
      @cancel="mostrarConfirmarCerrarLote = false"
      @confirm="confirmarCerrarLote"
    >
      <p>Cerrar {{ ticketsSeleccionados.length }} ticket(s) resuelto(s), con su encuesta de satisfacción de siempre:</p>
      <ul class="lote-lista">
        <li v-for="t in ticketsSeleccionados" :key="t.id">{{ t.codigo }} — {{ t.titulo }}</li>
      </ul>
    </ConfirmDialog>
  </div>
</template>


