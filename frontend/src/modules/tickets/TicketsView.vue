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
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import IndicadorPrioridad from '../../components/shared/IndicadorPrioridad.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import ListaVistas from '../../components/shared/ListaVistas.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';
import { useAtajosLista } from '../../composables/useAtajosLista.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const router = useRouter();
const store = useTicketsStore();
const auth = useAuthStore();
const { lista, total, cargando, cargandoMas, error, orden, vistaActiva } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

// Definición de columnas de CarbonDataTable (solo el modo Tabla — Triage,
// más abajo, es un panel de lista angosta + detalle, no una tabla, y no usa
// este componente). Densidad `lg`: vista insignia, confirmado por el JEFE.
//
// "check" (selección múltiple, piloto Tabla de escritorio — ver
// `seleccionados` más abajo) es la única columna del sistema con encabezado
// propio (`#encabezado-check`, extensión aditiva de CarbonDataTable) en vez
// de texto — el checkbox "seleccionar todos" no es una etiqueta. `movil:
// false` porque la selección en lote no existe en mobile (Triage tampoco
// la monta: es exclusivo de esta tabla de escritorio).
//
// "codigo"/"Ticket" absorbe categoría + nivel de atención + título en un
// único .celda-apilada — igual que el <td> de antes — y es también la
// columna `elastica`. En mobile cae en 'principal' completa (antes el
// código vivía en la cabecera de la tarjeta y el título solo; unificarlos
// en un solo bloque es la misma composición que ya usa Empleados/Equipos
// para su columna principal, y evita que "categoría"/"nivel" quedaran
// huérfanos sin dónde caer en la tarjeta nueva).
const columnasTickets = [
  { clave: 'check', label: '', ancho: '36px', movil: false },
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
const seleccionados = ref(new Set());

function estaSeleccionado(id) {
  return seleccionados.value.has(id);
}
function alternarSeleccion(id) {
  const s = new Set(seleccionados.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  seleccionados.value = s;
}
function limpiarSeleccion() {
  seleccionados.value = new Set();
}
const todosSeleccionadosEnPagina = computed(() =>
  lista.value.length > 0 && lista.value.every((t) => seleccionados.value.has(t.id))
);
function alternarSeleccionTodos() {
  seleccionados.value = todosSeleccionadosEnPagina.value
    ? new Set()
    : new Set(lista.value.map((t) => t.id));
}
const ticketsSeleccionados = computed(() => lista.value.filter((t) => seleccionados.value.has(t.id)));
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
// Clases de fila para CarbonDataTable: la MISMA función alimenta el <tr> de
// escritorio y el <li> de la tarjeta móvil (ver claseFila en el
// componente), así que devuelve la unión de las dos familias de clases que
// antes vivían por separado a mano: `.fila-ticket*` (reglas que apuntan a
// `td`, sirven en la fila de escritorio) y `.tarjeta-fila--activa` (reglas
// sin `td`, sirven en la tarjeta). Ambos juegos de selectores siguen
// existiendo tal cual en el <style> de abajo — esto no les agrega trabajo,
// solo hace que las dos superficies reciban las clases que ya necesitaban.
function claseFilaTicket(fila) {
  const clases = ['fila-ticket', 'tarjeta-fila--clic'];
  if (fila.id === store.ultimoAbierto) clases.push('fila-ticket--activa', 'tarjeta-fila--activa');
  if (estaSeleccionado(fila.id)) clases.push('fila-ticket--seleccionada');
  return clases;
}

// aria-current, no solo la clase visual: el <tr> a mano lo llevaba en la
// fila activa (el ticket que se está viendo) para que un lector de
// pantalla lo anuncie, no solo lo resalte en color. `claseFila` no expresa
// atributos ARIA, por eso `filaAtributos` (agregado a CarbonDataTable en
// esta misma migración) es lo que lo preserva.
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
        <CarbonButton variante="primary" icono="ti-plus" @click="mostrarNuevo = true">Ticket interno</CarbonButton>
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
            <CarbonButton variante="secondary" tam="sm" :deshabilitado="!reasignarLoteA || procesandoLote" @click="pedirReasignarLote">
              Reasignar
            </CarbonButton>
            <CarbonButton
              variante="secondary"
              tam="sm"
              :deshabilitado="!todosResueltos || procesandoLote"
              :title="todosResueltos ? 'Cerrar los tickets seleccionados' : 'Solo se pueden cerrar en lote tickets ya resueltos'"
              @click="pedirCerrarLote"
            >
              Cerrar seleccionados
            </CarbonButton>
            <CarbonButton variante="secondary" tam="sm" :deshabilitado="procesandoLote" @click="limpiarSeleccion">
              Cancelar
            </CarbonButton>
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
        <CarbonDataTable
          :columnas="columnasTickets"
          :filas="lista"
          :cargando="cargando"
          densidad="lg"
          :orden-por="ordenColumna"
          :orden-dir="ordenDireccion"
          :clase-fila="claseFilaTicket"
          :fila-atributos="filaAtributosTicket"
          etiqueta="Tickets de soporte"
          @ordenar="store.ordenarPor"
          @clic-fila="verTicket"
        >
          <template #encabezado-check>
            <span class="chk-celda">
              <input
                type="checkbox"
                :checked="todosSeleccionadosEnPagina"
                aria-label="Seleccionar todos los tickets de esta página"
                @change="alternarSeleccionTodos"
              >
            </span>
          </template>
          <template #celda-check="{ fila }">
            <span class="chk-celda" @click.stop>
              <input
                type="checkbox"
                :checked="estaSeleccionado(fila.id)"
                :aria-label="`Seleccionar ${fila.codigo}`"
                @change="alternarSeleccion(fila.id)"
              >
            </span>
          </template>
          <template #celda-prioridad="{ fila }">
            <IndicadorPrioridad :valor="fila.prioridad" />
          </template>
          <template #celda-codigo="{ fila }">
            <div class="celda-apilada">
              <span class="celda-apilada__meta">
                <RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${fila.id}`" @click.stop>{{ fila.codigo }}</RouterLink>
                <template v-if="fila.categoria">
                  <span class="celda-sep" aria-hidden="true">·</span>
                  <span class="tk-categoria">{{ fila.categoria }}</span>
                </template>
                <!-- Nivel de atención se fusiona acá (séptima pasada). Ver
                     nota larga arriba: misma familia que Categoría, sin
                     `v-else`/TextoVacio a propósito. -->
                <template v-if="fila.nivel_atencion">
                  <span class="celda-sep" aria-hidden="true">·</span>
                  <span class="tk-nivel" :title="`Nivel de atención ${fila.nivel_atencion}`">{{ fila.nivel_atencion }}</span>
                </template>
              </span>
              <span class="celda-apilada__principal">{{ fila.titulo }}</span>
            </div>
          </template>
          <template #celda-solicitante="{ fila }">
            <CarbonTag v-if="!fila.vinculado" class="badge-inline" :variante="badgeInfo('ticket_sin_vincular').clase" title="No se pudo identificar al solicitante">
              <i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}
            </CarbonTag>
            <RouterLink v-else-if="fila.solicitante_id" class="empleado-link" :to="`/empleados/${fila.solicitante_id}`" @click.stop>{{ fila.solicitante }}</RouterLink>
            <TextoVacio v-else :valor="fila.solicitante" />
          </template>
          <template #celda-estado="{ fila }">
            <BadgeEstado tipo="ticket" :valor="fila.estado" />
          </template>
          <template #celda-asignado_a="{ fila }">
            <!-- Sin avatar acá a propósito: .avatar.sm mide 32px y llevaría
                 la fila de ~32px a ~50px, anulando la densidad nueva — y
                 suma un círculo de acento por fila, justo el ruido de
                 color que este rediseño quita. El avatar se queda donde sí
                 paga: la tarjeta angosta de Triage, que no tiene ancho para
                 el nombre completo. -->
            <TextoVacio v-if="!fila.asignado_a" placeholder="Sin asignar" />
            <span v-else class="tk-asignado">{{ staffPorId[fila.asignado_a] || 'Staff' }}</span>
          </template>
          <template #celda-created_at="{ fila }">
            <span class="tk-edad" :class="{ 'tk-antiguedad--alerta': ticketEnvejecido(fila) }" :title="formatFechaHora(fila.created_at)">
              {{ formatAntiguedad(fila.created_at) }}
            </span>
          </template>
        </CarbonDataTable>

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="total"
          :tam-pagina="store.tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="tickets"
          @update:tam-pagina="store.cambiarTamPagina"
        />
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
            <CarbonButton variante="secondary" :cargando="cargandoMas" @click="store.cargarMas()">
              {{ cargandoMas ? 'Cargando...' : `Cargar más (${lista.length} de ${total})` }}
            </CarbonButton>
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

<style scoped>
/* ── Shell común a los tres modos (octava pasada, ago 2026) ──────────────
   Un solo grid con el nav de Bandejas como primera columna en TODOS los
   modos; lo único que cambia entre ellos es qué ocupa el resto — Tabla es
   una columna (la tabla completa), Triage son dos (lista angosta + detalle),
   y el mismo hueco es donde entrará Kanban (columnas por estado) cuando se
   agregue: ninguno de los tres necesita su propio shell, solo su propio
   `grid-template-columns`.

   Hasta la séptima pasada, Tabla y Triage (entonces "Isla") NO compartían
   paradigma de superficie a propósito: Tabla iba full-bleed, pegada a los
   bordes, sin marco; Triage flotaba con gap/padding como tarjetas separadas.
   La razón documentada era real (una tabla densa se sirve mejor sin marco
   que compita con las filas) pero el costo, en uso real, resultó mayor que
   el beneficio: alternar de modo recolocaba el nav de sitio (de riel pegado
   al borde a tarjeta con radio) y todo el layout se sentía "mal hecho" en
   el cambio, no como dos vistas del mismo sistema. Ahora las tres tarjetas
   (nav, contenido, y el panel de detalle cuando existe) usan SIEMPRE el
   mismo tratamiento — borde, radio, gap, padding — sin importar el modo; lo
   que cambia entre Tabla y Triage es la densidad INTERNA de cada tarjeta
   (la tabla sigue tan compacta como antes), no el marco que la contiene. */
.tickets-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  /* La fila se declara EXPLÍCITA y acotada. Sin esto el grid usa su fila
     implícita `auto`, que se dimensiona por el hijo más alto y crece por
     debajo del shell: las tarjetas se derraman fuera del padding de 16px
     y del viewport, y sus esquinas redondeadas de abajo nunca se ven.
     Peor: con la fila en `auto` ninguna tarjeta tiene un alto del que
     desbordar, así que el `overflow-y:auto` del nav (y el de la lista)
     jamás se dispara — el scroll que debería vivir DENTRO de cada tarjeta
     no existe y scrollea la página entera. Con minmax(0,1fr) cada tarjeta
     mide exactamente el alto del shell y scrollea puertas adentro, que es
     el contrato de un layout multi-panel. */
  grid-template-rows: minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
  background: var(--color-bg);
}

/* Tabla: riel de 200px + tabla, ahora en tarjeta igual que el nav — antes
   era full-bleed sin gap ni padding (ver nota de la octava pasada arriba).
   200px es el ancho de la guía externa y alcanza para "Todos (vigentes)"
   con su contador sin recortar. */
.tickets-shell--tabla {
  grid-template-columns: 200px 1fr;
}

/* Triage: el mismo riel + lista angosta + detalle, las tres como tarjetas
   flotantes del mismo tamaño de gap/padding que Tabla. */
.tickets-shell--triage {
  grid-template-columns: 200px minmax(240px, 25%) 1fr;
}

/* Mobile: no hay nav (v-if="!esMovil"), el grid vuelve a una sola columna
   y el contenido ocupa todo el ancho, igual que el resto de los módulos —
   ahí no aplica ninguna de las dos tarjetas, mismo criterio de siempre. */
@media (max-width: 768px) {
  .tickets-shell,
  .tickets-shell--tabla,
  .tickets-shell--triage {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 0;
  }

}

.tickets-nav {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  /* Con `overflow-y:auto` el eje X computa a `auto` por especificación, así
     que cualquier hijo más ancho que el riel de 200px (una etiqueta de
     bandeja larga, un input de fecha) le colgaría una barra horizontal al
     nav. Nada del riel debe scrollear en X: lo que no entra, se recorta. */
  overflow-x: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg-elevated);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* La regla que despojaba al nav de Tabla (borde+radio -> solo borde
   derecho, "riel pegado a la tabla") se retiró en la octava pasada: el nav
   es ahora la misma tarjeta en los dos modos, no hace falta un override por
   modo. */

/* .tnav-item/.tnav-label/.tnav-contador/.tnav-item--activo se movieron a
   ListaVistas.vue (global, sin scope) — los usa ese componente Y el botón
   "Vencidos" de acá abajo, que no es una vista más. */
.tickets-nav-vistas {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tnav-separador {
  height: 1px;
  background: var(--color-border-subtle);
  margin: 8px 4px;
}

/* Sub-estado dentro del riel. Sigue indentado para leerse como hijo de las
   bandejas de trabajo de arriba, pero desde la séptima pasada es UNA sola
   lista contextual (la de la bandeja activa) en vez de dos listas fijas con
   las mismas 4 etiquetas, una de ellas siempre deshabilitada. Con ese cambio
   desapareció también el único uso de la prop `disabled` de ListaVistas.vue
   en esta vista: ya no hay ningún control apagado en pantalla. */
.tk-subestado-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.tk-substate {
  padding-left: 12px;
}

/* Encabezado del grupo: sin él, los 4 sub-estados se leen como 4 bandejas
   más del riel. Mismo tratamiento que el título del filtro de fecha (ver
   FiltroFechaCreacion.vue) — son las dos únicas etiquetas de grupo del
   riel y tienen que verse iguales. */
.tk-nav-titulo {
  display: block;
  padding: 4px 10px 2px 12px;
  font-size: var(--fs-label-01);
  font-weight: 600;
  color: var(--color-text-tertiary);
}


/* Filtro secundario: Fecha de creación (ago 2026, cuarta pasada retiró
   Prioridad/Nivel/Tipo/Categoría — ver nota en el script). Sigue siendo un
   bloque siempre visible, no detrás de un popover — en el nav de
   escritorio, apilado bajo las Bandejas; en mobile (sin nav), su propia
   fila bajo la barra de búsqueda. */
.tk-filtros-secundarios {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 10px 8px;
}

.tk-filtros-secundarios--movil {
  padding: 0 1.25rem 10px;
}

/* .tk-filtro-grupo/.tk-filtro-titulo/.tk-filtro-fecha-campo se mudaron a
   FiltroFechaCreacion.vue junto con su markup — obligatorio, no cosmético:
   el <style scoped> de un padre alcanza el elemento RAÍZ de un hijo pero no
   su interior, así que acá habrían dejado de aplicar. */

.tk-filtros-limpiar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 8px 0 4px;
  border: none;
  border-top: 1px solid var(--color-border-subtle);
  background: none;
  color: var(--color-text-secondary);
  font-size: var(--fs-label-01);
  font-weight: 600;
  cursor: pointer;
}

.tk-filtros-limpiar:hover { color: var(--color-danger-text); }

/* .tnav-proximamente/.tnav-badge-proximamente se retiraron con el ítem
   "Vencidos · Próximamente" del nav (ver nota en el template). */

.tfs-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.tickets-lista { min-width: 0; }

/* .card--fill es adrede sin borde/radio en main.css (comentario propio ahí:
   "pegado a los bordes") — pensado para el resto del sistema, donde el
   listado ocupa el área de contenido entera sin tarjeta propia. Dentro de
   Tickets NINGÚN modo usa ese comportamiento por defecto: desde la octava
   pasada, tanto la tabla completa (Tabla) como la lista angosta (Triage)
   vuelven a ganar el borde+radio para leerse como la misma tarjeta flotante
   que el nav — selector `.tickets-shell .card--fill` en vez de
   `.tickets-lista .card--fill` (como era hasta la séptima pasada) para
   cubrir las DOS, no solo Triage. Override LOCAL, scoped a esta vista: el
   resto del sistema sigue usando `.card--fill` sin tocar. */
.tickets-shell .card--fill {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  /* main.css deja .card--fill en `overflow:auto` (pensado para contenido
     no-tabla). Con el borde y el radio de vuelta eso hace dos daños:
     scrollea la card ENTERA — el buscador y la fila de chips se van de
     vista al bajar por la lista, cuando son justamente el cromo que tiene
     que quedar fijo — y deja que las filas pasen por encima de las
     esquinas redondeadas. `hidden` devuelve el scroll al hijo que ya lo
     maneja solo (`.table-wrap`/`.lista-tarjetas`, ambos flex:1 /
     min-height:0 / overflow-y:auto en main.css) y es lo único que debería
     moverse. */
  overflow: hidden;
}

/* Reset a mobile: tiene que venir DESPUÉS de la regla de arriba en el
   archivo — misma especificidad (`.tickets-shell .card--fill` en los dos
   casos) y CSS resuelve un empate por orden de aparición, no por si un lado
   está dentro de `@media`. Puesto antes (como se probó primero), la regla
   de arriba lo pisaba también en mobile: la tarjeta quedaba con
   borde+radio+overflow:hidden pegada a los 4 bordes de la pantalla (el
   shell va a padding:0 en mobile), el radio se veía cortado contra el
   viewport y el borde no separaba de nada. Acá sí gana, y devuelve el
   comportamiento full-bleed de siempre — igual que el resto de los
   módulos en mobile. */
@media (max-width: 768px) {
  .tickets-shell .card--fill {
    border: 0;
    border-radius: var(--radius-base);
    overflow: auto;
  }
}

.tickets-panel {
  min-width: 0;
}

/* Solo la tarjeta: superficie, borde y centrado. Tipografía, ícono y espaciado
   los pone EmptyState — por eso acá ya no hay font-size ni color propios. */
.tickets-panel-vacio {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg-elevated);
}

.tickets-cargar-mas {
  display: flex;
  justify-content: center;
  padding: 16px;
}

/* EmptyState viene con padding de página completa (3.5rem); dentro de una
   tarjeta de ~40% del ancho eso lo empuja contra los bordes. Acotar el ancho
   del mensaje mantiene la medida de lectura sin tocar el componente, que
   sirve igual a las otras 15 vistas. */
.tickets-panel-vacio :deep(.empty) { padding: 1.5rem; }
.tickets-panel-vacio :deep(.empty p) { max-width: 34ch; margin-inline: auto; }

/* Triage: el buscador queda solo en su fila (Prioridad vive en el nav). */
.search-wrap--full { flex: 1; }

.tk-error { color: var(--color-danger); }

.tk-codigo {
  font-family: var(--font-mono, monospace);
  white-space: nowrap; /* el código nunca se parte en dos líneas */
}

.fecha-cell { white-space: nowrap; }

/* En la tarjeta móvil, fecha + antigüedad pueden partirse en dos líneas
   si no caben (a diferencia de la celda de tabla, que sí fuerza una sola). */
.tarjeta-fila__cab .fecha-cell {
  white-space: normal;
  text-align: right;
}

.tk-codigo-link {
  color: inherit;
  text-decoration: none;
}
.tk-codigo-link:hover,
.tk-codigo-link:focus-visible {
  text-decoration: underline;
}

/* .chips-filtro/.chip-filtro* ahora viven en main.css (global) — ago 2026,
   cuarta pasada retiró ChipsFiltro.vue (sin consumidores tras quitar
   Prioridad/Nivel/Tipo como filtros), pero la fila de "chips de filtros
   activos" de acá abajo (Fecha, removible con X) sigue usando esas mismas
   clases, de ahí el traslado a main.css en vez de borrarlas.
   ReporteSatisfaccionView.vue tiene su propia copia scoped de estas mismas
   reglas para "Solo insatisfechos" — independiente, no se tocó. */

/* Vistas en modo Tabla: mismos .tnav-item que la columna de Triage, en fila
   horizontal con wrap en vez de columna — mismo componente/datos, layout
   distinto por contexto (ver comentario en el template). */
.tickets-vistas-fila {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  min-width: 0;
}

/* La barra única, ahora compartida por Tabla y Triage: .filters trae
   align-items:flex-end (pensado para selects con label arriba); acá todo mide
   lo mismo de alto y va centrado. El buscador deja de estirarse a discreción
   (flex:2 global) — con Vistas y Prioridad ya en el nav, un campo de 340px
   alcanza de sobra y deja que el sub-estado se ancle a la derecha. */
.tickets-filtros {
  align-items: center;
  gap: 12px;
}

/* En Triage el buscador SÍ se estira (.search-wrap--full, flex:1): esa columna
   es angosta y no hay nada más compitiendo por el ancho. */
.tickets-filtros .search-wrap:not(.search-wrap--full) {
  flex: 0 1 340px;
}

/* Sub-estado como segmento: solo existe en la barra móvil (en escritorio
   vive en el riel). Fila completa, y si las 4 opciones con sus contadores no
   entran, scrollea en X — lo que no debe es partirse en dos líneas y dejar de
   leerse como un grupo exclusivo. */
.tk-subestado {
  max-width: 100%;
  overflow-x: auto;
}

/* main.css tiene `.filters .search-wrap { flex-basis: 100% }` para móvil,
   pero esta regla scoped gana por especificidad (el atributo data-v suma) y
   dejaría el buscador clavado en 340px. Se restituye a mano: en móvil la
   barra apila y el buscador va a fila completa, igual que en el resto de los
   módulos. Modo Tabla ES lo que se ve en móvil (ver vistaEfectiva), así que
   esta barra sí se renderiza ahí. */
@media (max-width: 768px) {
  .tickets-filtros .search-wrap:not(.search-wrap--full) {
    flex: 1 1 100%;
  }
  .tk-subestado { flex: 1 1 100%; }
}

/* Pista del atajo "/" dentro del buscador. Decorativa (aria-hidden): el
   atajo no es la única forma de llegar al campo, se puede tabular. Se oculta
   apenas el campo tiene foco para no competir con el texto que se escribe. */
.search-atajo {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  padding: 1px 6px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-base);
  background: var(--color-bg-subtle);
  color: var(--color-text-tertiary);
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-label-01);
  line-height: 1.5;
  pointer-events: none;
}

.search-wrap:focus-within .search-atajo { display: none; }

/* Nivel de atención: dato de clasificación, no estado — texto plano, sin
   píldora (la guía externa lo pedía como `badge badge-info`: una píldora azul
   por fila reintroduce el ruido de color que este rediseño quitó). Mono
   porque N1/N2/N3 se lee como un código.
   `color: inherit` desde la séptima pasada, cuando dejó de ser columna
   propia y pasó a la línea de metadatos de "Ticket": ahí el código y la
   categoría son terciarios, y un secundario en el medio se leería como el
   dato más importante de los tres. Heredar además lo hace subir solo con el
   resto de la línea en la fila activa (ver la regla de contraste más abajo),
   sin sumar un selector más a esa lista. */
.tk-nivel {
  font-family: var(--font-mono, monospace);
  color: inherit;
}

/* Fila/tarjeta abierta. Solo fondo tenue, SIN indicador lateral: la
   dirección validada en el Style Lab suma un inset de 2px en el borde
   izquierdo, pero la guía dejó explícitamente esa parte pendiente de
   confirmación del JEFE (choca con el principio "sin bordes de acento en los
   costados"). El fondo solo ya cumple "la selección de fila es visible" y es
   además lo que pide el principio vigente: hover/activo sin bordes, solo
   fondos muy tenues. */
/* :deep() porque CarbonDataTable pinta el <tr> en su propio ámbito de
   scope (vía claseFila) — mismo bug/lección que EmpleadosView/KbView. */
:deep(.fila-ticket--activa td),
:deep(.fila-ticket--activa:hover td) {
  background: var(--color-accent-subtle);
}

/* Selección múltiple (Plan Maestro, 2026-09-01): borde-izquierdo de acento
   de 2px — la excepción ya aprobada a "sin bordes de costado", mismo
   criterio que severidad. Deliberadamente distinto de --activa (fondo
   teñido, "este es el que tengo abierto"): acá es "está en mi selección",
   ambos pueden convivir en la misma fila sin confundirse. */
:deep(.fila-ticket--seleccionada td:first-child) {
  box-shadow: inset 2px 0 0 var(--color-accent);
}

/* Columna de selección (checkbox): CarbonDataTable no da una clase propia
   al <td>/<th> según la columna (solo `col-num`), así que el centrado vive
   en un wrapper dentro del slot en vez de en `.col-check` sobre la celda —
   reemplaza esa regla del <table> a mano. El ancho fijo de 36px ahora sale
   de `columnasTickets` (`ancho: '36px'`). */
.chk-celda {
  display: flex;
  align-items: center;
  justify-content: center;
}

.chk-celda input[type="checkbox"] {
  cursor: pointer;
}

.barra-seleccion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  margin-bottom: 10px;
  background: var(--color-accent-subtle);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-base);
}

.barra-seleccion__conteo {
  font-weight: 600;
  font-size: var(--fs-body-01);
  color: var(--color-accent-text);
}

.barra-seleccion__acciones {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.barra-seleccion__acciones select {
  height: 34px;
}

.lote-lista {
  max-height: 220px;
  overflow-y: auto;
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

/* :deep(): esta clase la pinta tanto el <li> de Triage (mismo scope, ya
   funcionaba) como, desde la migración a CarbonDataTable, la tarjeta móvil
   del modo Tabla (scope del componente hijo) — bare :deep() la vuelve un
   selector sin atributo de scope, así que alcanza a las dos por igual. */
:deep(.tarjeta-fila--activa) {
  background: var(--color-accent-subtle);
}

/* El fondo de acento sube la luminancia bajo el texto y hunde el contraste
   de los tonos grises más claros: medido, --color-text-tertiary cae a
   4.27:1 en claro y 3.87:1 en oscuro sobre esta superficie — debajo del
   4.5:1 exigible a texto normal. Dentro de la fila/tarjeta activa esos
   tonos suben un escalón a --color-text-secondary (5.49:1 claro / 6.05:1
   oscuro, ambos verificados). No se toca el token global: es un ajuste
   local a la única superficie que lo necesita.
   `.prio` ya NO entra en esta regla (rediseño Materen, Fase 1): los cuatro
   niveles de prioridad tienen color propio, ninguno depende del gris
   terciario. Los dos que siguen siendo texto suelto pasan sobre este fondo
   sin ayuda (baja/sky 5.34:1, media/teal 6.26:1 en claro; 7.41:1 y 6.54:1
   en oscuro — verificados en scripts/contraste.mjs, pares
   prioridadBajaFilaActiva/prioridadMediaFilaActiva), y alta/urgente son
   badges con fondo propio que tapa esta superficie. Antes la regla los
   incluía con `:not(.prio--urgente)`; hoy ese :not tendría que ser
   `:not(.prio--baja):not(.prio--media):not(.prio--alta):not(.prio--urgente)`,
   o sea nada. */
:deep(.fila-ticket--activa) .celda-apilada__meta,
:deep(.fila-ticket--activa) .celda-sep,
:deep(.fila-ticket--activa) .tk-categoria,
:deep(.fila-ticket--activa) .tk-edad,
:deep(.fila-ticket--activa) .text-muted,
:deep(.tarjeta-fila--activa) .celda-sep,
:deep(.tarjeta-fila--activa) .tk-antiguedad,
:deep(.tarjeta-fila--activa) .tfs-solicitante {
  color: var(--color-text-secondary);
}

/* Metadato de fila que no es estado: categoría en la tabla y en la tarjeta
   móvil. Antes era .badge--neutral — una píldora gris compitiendo por
   atención con la píldora de Estado, que sí la merece. */
.tk-categoria {
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Nombre del técnico: una sola línea, la columna no se ensancha por un
   nombre largo (la elástica es "Ticket", ver `elastica: true` en
   `columnasTickets`). */
.tk-asignado { white-space: nowrap; }

/* Columna Edad: relativa siempre visible, fecha/hora exacta en el title.
   Antes eran 2 líneas por fila (fecha completa + antigüedad debajo). */
.tk-edad {
  white-space: nowrap;
  color: var(--color-text-tertiary);
}

.tk-antiguedad {
  font-size: var(--fs-label-01);
  color: var(--color-text-tertiary);
}

/* Envejecido = riesgo operativo (ver ticketEnvejecido()). Es el ÚNICO
   color que este rediseño agrega a la fila fuera de la píldora de Estado y
   del punto de prioridad alta/urgente — y solo aparece cuando hay algo que
   mirar. */
.tk-antiguedad--alerta,
.tk-edad.tk-antiguedad--alerta { color: var(--color-warning-text); }

/* Identidad de la tarjeta angosta de Triage: código + solicitante en un solo
   renglón, el solicitante cede espacio primero (el código nunca se corta). */
.tfs-identidad {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.tfs-solicitante {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* La antigüedad es el ancla derecha del renglón de identidad: mide lo que
   mide y nunca se parte en dos líneas ni cede espacio. Quien cede es
   .tfs-solicitante, que para eso tiene el ellipsis de arriba — sin este
   flex-shrink:0 el reparto es al revés y "hace 3 h" se desarma en dos
   renglones apenas el nombre del solicitante es largo. */
.tarjeta-fila__cab .tk-antiguedad {
  flex-shrink: 0;
  white-space: nowrap;
}

/* Título del ticket en la columna angosta (~280px). .tarjeta-fila__principal
   trae `overflow-wrap: anywhere` de main.css, pensado para la tarjeta móvil
   —que tiene el ancho entero de la pantalla—; acá un título largo se
   desarma en 4 o 5 renglones, cada tarjeta termina midiendo distinto y la
   lista deja de escanearse en vertical, que es lo único para lo que existe
   una lista de triage. Se corta en 2 líneas; el título completo queda en el
   `title` y, a un clic, en el panel de detalle de al lado. */
.tickets-lista .tarjeta-fila__principal {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

:deep(.fila-ticket) { cursor: pointer; }
:deep(.fila-ticket:hover td) { background: var(--color-bg-hover); }

/* Ícono "sin vincular" en la tarjeta angosta de Triage (4.6) — mismo color
   que la píldora .badge--danger que ya usa este mismo dato en la tabla y en
   la tarjeta móvil (--color-danger-text), sin el fondo: acá no hay espacio
   para una píldora completa. */
.tfs-sin-vincular {
  color: var(--color-danger-text);
  font-size: var(--fs-body-01);
  flex-shrink: 0;
}

/* Fila de "N resultados" + chips, sobre la lista angosta de Triage. */
.tk-resultados-fila {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 1.25rem 0;
}

.tk-resultados-conteo {
  font-size: var(--fs-label-01);
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.tk-chips-activos {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

/* En Tabla, la fila de chips es su propio renglón con el mismo gutter que
   .filters; en Triage comparte renglón con el conteo de resultados. */
.tk-chips-activos:not(.tk-chips-activos--triage) {
  padding: 10px 1.25rem 0;
}

/* Cada chip es un .chip-filtro--activo (mismo componente visual que los
   filtros del nav) con una X: reusa el par tenue/acento ya validado en vez
   de inventar un estilo de "chip removible" aparte. */
.tk-chip-quitar {
  gap: 5px;
  height: 30px;
  padding: 0 8px 0 12px;
}

.tk-chip-quitar i { font-size: var(--icon-sm); opacity: 0.7; }
.tk-chip-quitar:hover i { opacity: 1; }

.tk-limpiar-todo {
  background: none;
  border: none;
  padding: 6px 4px;
  color: var(--color-text-secondary);
  font-size: var(--fs-label-01);
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  flex-shrink: 0;
}

.tk-limpiar-todo:hover { color: var(--color-text-primary); }
.tk-limpiar-todo:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-base);
}
</style>
