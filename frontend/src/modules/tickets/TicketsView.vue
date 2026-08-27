<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useTicketsStore } from '../../stores/tickets.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { PRIORIDADES_TICKET as PRIORIDADES, ESTADO_FILTRO_VIGENTES, OPCIONES_TIPO } from '../../core/dominio-tickets.js';
import { badgeInfo } from '../../core/badges.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import TicketInternoForm from './TicketInternoForm.vue';
import ReporteTicketsModal from './ReporteTicketsModal.vue';
import TicketDetallePanel from './TicketDetallePanel.vue';
import Pagination from '../../components/shared/Pagination.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import ListaVistas from '../../components/shared/ListaVistas.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';

const router = useRouter();
const store = useTicketsStore();
const auth = useAuthStore();
const { lista, total, cargando, cargandoMas, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

const { esMovil } = useEsMovil();

// ── Selector Tabla/Isla (FASE 3) ───────────────────────────────────────
// Isla (3 paneles: nav + lista angosta + detalle) es un concepto de
// escritorio — el nav y el panel llevan v-if="!esMovil" más abajo, ni se
// montan en mobile. Por eso `vistaEfectiva` fuerza 'tabla' en mobile sin
// importar la preferencia guardada: es el mismo comportamiento que ya
// tenía el sistema antes de que Isla existiera, y evita dejar al usuario
// de mobile con los filtros del nav (que ahí no tiene forma de cambiar,
// el nav no se monta en mobile).
const OPCIONES_VISTA_TICKETS = [
  { valor: 'tabla', icono: 'ti-table', label: 'Tabla' },
  { valor: 'isla', icono: 'ti-layout-columns', label: 'Isla' },
];
const { vista } = useVistaModulo('tickets', ['tabla', 'isla']);
const vistaEfectiva = computed(() => (esMovil.value ? 'tabla' : vista.value));

// Split-view: id del ticket mostrado en el panel derecho, solo relevante
// en modo Isla. null = nada seleccionado todavía (estado vacío del panel).
// No reemplaza la ruta /tickets/:id — esa sigue existiendo para los
// enlaces externos (Empleados, Dashboard, etc.) y para mobile.
const ticketSeleccionado = ref(null);

// El auto-refresco de tickets:list vive en AppLayout.vue (suscripción
// única, así el sonido de "ticket nuevo" suena en cualquier pantalla).

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// ── Vistas (reemplaza el modelo anterior de Estado dropdown/nav-list +
// "Mis tickets"/"Sin asignar" como 2 toggles sueltos que se cruzaban con
// él). Antes eran 2 superficies separadas manteniendo el mismo estado
// (dropdown+chips en Tabla, nav-list+toggles en Isla) — 2 bugs de
// desincronización seguidos entre ellas. Ahora es UNA sola lista de
// vistas, cada una un combo cerrado de estado+asignación elegido de una
// vez, no editable por separado — mismos datos, mismo componente
// (ListaVistas.vue, PASO 2) en ambos modos. ────────────────────────────────
const VISTAS_TICKETS = [
  { id: 'sin_asignar', label: 'Sin asignar', icono: 'ti-user-off',
    filtro: { estado: ESTADO_FILTRO_VIGENTES, asignadoA: '', sinAsignar: true } },
  { id: 'mis_tickets', label: 'Mis tickets', icono: 'ti-user',
    filtro: { estado: ESTADO_FILTRO_VIGENTES, asignadoA: '__yo__', sinAsignar: false } },
  { id: 'todos', label: 'Todos (vigentes)', icono: null,
    filtro: { estado: ESTADO_FILTRO_VIGENTES, asignadoA: '', sinAsignar: false } },
  { id: 'en_progreso', label: 'En progreso', icono: null,
    filtro: { estado: 'en_progreso', asignadoA: '', sinAsignar: false } },
  { id: 'resuelto', label: 'Resuelto', icono: null,
    filtro: { estado: 'resuelto', asignadoA: '', sinAsignar: false } },
  { id: 'rechazado', label: 'Rechazados', icono: null,
    filtro: { estado: 'rechazado', asignadoA: '', sinAsignar: false } },
];

// Arranca SIEMPRE en 'sin_asignar', cada sesión — a propósito sin
// localStorage (a diferencia de useVistaModulo/tema/sidebar): "Mis
// tickets" nunca debe recordarse de una sesión a otra, quedaría fácil
// perder de vista tickets sin asignar de otro turno.
const vistaActiva = ref('sin_asignar');

// '__yo__' se resuelve acá (no se hardcodea en VISTAS_TICKETS) — mismo
// patrón que ya usaba "Mis tickets" antes de este cambio.
function aplicarVista(id) {
  const vista = VISTAS_TICKETS.find((v) => v.id === id) || VISTAS_TICKETS[0];
  const asignadoA = vista.filtro.asignadoA === '__yo__' ? (auth.user?.id || '') : vista.filtro.asignadoA;
  store.aplicarFiltros({ estado: vista.filtro.estado, asignadoA, sinAsignar: vista.filtro.sinAsignar });
}
watch(vistaActiva, aplicarVista, { immediate: true });

// "Vencidos" sigue sin funcionar de verdad (falta query de servidor) — no
// es una vista más (no tiene combo estado+asignación propio), es un ítem
// aparte deshabilitado con su propio tratamiento visual ("Próximamente",
// no candado/gris de error — ver .tnav-proximamente).

// ── Sin vincular (independiente de las Vistas) y Prioridad (todavía
// single-select, PASO 3 la pasa a chips múltiples) — mismo watcher propio,
// separado del de vistaActiva: aplicarFiltros() mergea sobre this.filtros,
// así que cambiar de vista nunca pisa estos 2 valores ni viceversa. ───────
const filtroPrioridad = ref('');
const soloSinVincular = ref(false);
watch([filtroPrioridad, soloSinVincular], ([prioridad, sinVincular]) => {
  store.aplicarFiltros({ prioridad, sinVincular });
});

const mostrarNuevo = ref(false);
const mostrarReporte = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => {
  const mapa = {};
  for (const s of staffLista.value) mapa[s.user_id] = s.nombre;
  return mapa;
});

// Contador junto a la vista activa en el nav de Isla (ver ListaVistas más
// adelante) — no hay conteo por vista del servidor, solo el total ya
// cargado de la vista actualmente activa.
const conteosVistas = computed(() => (cargando.value ? null : { [vistaActiva.value]: total.value }));

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

// Iniciales para el avatar de "asignado a" en la lista angosta de Isla —
// a diferencia de Empleados (nombres/apellidos separados), staffPorId ya
// viene como un solo string "Nombre Apellido" (insforgeApi.nombresStaff()),
// así que se parte por espacio en vez de leer dos campos.
function inicialesDe(nombre) {
  if (!nombre) return '';
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
}

// Tipo (incidente/solicitud) en la lista angosta de Isla — no hay un badge
// dedicado para esto en badges.js (solo tipo_cuenta/tipo_ubicacion), y no
// vale la pena sumar un caso nuevo ahí para 2 valores fijos.
function tipoLabel(valor) {
  return OPCIONES_TIPO.find((t) => t.valor === valor)?.label || valor;
}

// Fecha relativa hasta el umbral; más vieja, fecha corta (DD/MM) en vez de
// "hace 12 d" — pasado cierto punto la fecha concreta ubica mejor que la
// antigüedad relativa. Solo para la lista angosta de Isla: no toca
// formatAntiguedad() (compartida con la tarjeta mobile, que no cambia).
const UMBRAL_FECHA_CORTA_DIAS = 7;
function fechaListaAngosta(iso) {
  const dias = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (dias < UMBRAL_FECHA_CORTA_DIAS) return formatAntiguedad(iso);
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}

// Isla (desktop): selecciona en el panel, sin navegar. Tabla o mobile
// (vistaEfectiva ya resuelve mobile a 'tabla'): navega a la página
// completa, igual que el comportamiento de siempre.
function verTicket(ticket) {
  if (vistaEfectiva.value === 'isla') {
    ticketSeleccionado.value = ticket.id;
    return;
  }
  router.push(`/tickets/${ticket.id}`);
}

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

// En móvil los botones secundarios del header se condensan en un menú
// "Más" (patrón mobile); en escritorio siguen como botones sueltos.
const accionesMas = computed(() => [
  { icono: 'ti-report', label: 'Reporte', onClick: () => { mostrarReporte.value = true; } },
  { icono: 'ti-mood-smile', label: 'Satisfacción', onClick: () => router.push('/tickets/satisfaccion') },
  { icono: 'ti-link', label: 'Enlace soporte', onClick: copiarEnlaceSoporte },
]);

function onNuevoCerrado(creado) {
  mostrarNuevo.value = false;
  if (creado) {
    showToast('Ticket interno creado');
    store.cargar();
  }
}

onMounted(async () => {
  store.resetearFiltros();
  try {
    // resetearFiltros() ya deja el store en estado:''/asignadoA:''/
    // sinAsignar:false — no es lo mismo que el default de modo Tabla
    // (ESTADO_FILTRO_VIGENTES), pero el watcher de arriba corre apenas se
    // monta el componente y ya lo corrige antes de que se note; no hace
    // falta duplicar esa traducción acá.
    const [, staff] = await Promise.all([store.cargar(), insforgeApi.nombresStaff()]);
    staffLista.value = staff;
  } catch {
    showToast(error.value || 'Error al cargar tickets', 'error');
  }
});
</script>

<template>
  <div class="tickets-page vista-modulo">
    <PageHeader titulo="Tickets" icono="ti ti-headset" :conteo="total">
      <template #acciones>
        <SelectorVista v-model="vista" :opciones="OPCIONES_VISTA_TICKETS" class="solo-escritorio" />
        <button class="btn solo-escritorio" type="button" @click="mostrarReporte = true">
          <i class="ti ti-report" aria-hidden="true"></i> Reporte
        </button>
        <button class="btn solo-escritorio" type="button" @click="router.push('/tickets/satisfaccion')">
          <i class="ti ti-mood-smile" aria-hidden="true"></i> Satisfacción
        </button>
        <button class="btn solo-escritorio" type="button" title="Copiar enlace de soporte (reportar o buscar tickets)" @click="copiarEnlaceSoporte">
          <i class="ti ti-link" aria-hidden="true"></i> Enlace soporte
        </button>
        <MenuAcciones class="solo-movil solo-movil--flex" texto="Más" label="Más acciones" :acciones="accionesMas" />
        <button class="btn btn-primary" type="button" @click="mostrarNuevo = true">
          <i class="ti ti-plus" aria-hidden="true"></i> Ticket interno
        </button>
      </template>
    </PageHeader>

    <!-- ═══ Tabla (default, y siempre en mobile — ver vistaEfectiva) ═══ -->
    <main v-if="vistaEfectiva === 'tabla'" class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por código, título o solicitante...">
          </div>
          <div class="filter-field">
            <label for="filtro-prioridad">Prioridad</label>
            <select id="filtro-prioridad" v-model="filtroPrioridad">
              <option value="">Toda prioridad</option>
              <option v-for="(v, k) in PRIORIDADES" :key="k" :value="k">{{ v.label }}</option>
            </select>
          </div>
          <div class="chips-filtro">
            <button type="button" class="chip-filtro" :class="{ 'chip-filtro--activo': soloSinVincular }" @click="soloSinVincular = !soloSinVincular">
              Sin vincular
            </button>
          </div>
        </div>

        <!-- Vistas: fila horizontal en Tabla, mismos datos/componente que
             la columna del nav de Isla más abajo (ver ListaVistas.vue). -->
        <ListaVistas
          v-model="vistaActiva"
          :vistas="VISTAS_TICKETS"
          :conteos="conteosVistas"
          class="tickets-vistas-fila"
        />

        <div v-if="cargando" class="no-results solo-movil">Cargando tickets...</div>
        <div v-else-if="error" class="no-results tk-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-headset"
          titulo="Sin tickets"
          :mensaje="busqueda || vistaActiva !== 'sin_asignar' || filtroPrioridad || soloSinVincular ? 'No hay resultados con los filtros aplicados.' : 'Aquí aparecerán las solicitudes de soporte.'"
        />

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando tickets…</p>
        <div class="table-wrap solo-escritorio">
          <table aria-label="Tickets de soporte">
            <thead>
              <tr>
                <ThOrdenable clave="codigo" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Código</ThOrdenable>
                <ThOrdenable clave="created_at" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Fecha</ThOrdenable>
                <th scope="col">Solicitante</th>
                <ThOrdenable clave="titulo" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Título</ThOrdenable>
                <th scope="col">Categoría</th>
                <ThOrdenable clave="estado" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Estado</ThOrdenable>
                <ThOrdenable clave="prioridad" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Prioridad</ThOrdenable>
                <th scope="col">Asignado a</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="8" />
              <template v-else>
              <tr v-for="t in lista" :key="t.id" class="fila-ticket" @click="verTicket(t)">
                <td><RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${t.id}`" @click.stop>{{ t.codigo }}</RouterLink></td>
                <td class="fecha-cell">
                  {{ formatFechaHora(t.created_at) }}
                  <div class="tk-antiguedad" :class="{ 'tk-antiguedad--alerta': ticketEnvejecido(t) }">{{ formatAntiguedad(t.created_at) }}</div>
                </td>
                <td>
                  <span v-if="!t.vinculado" class="badge badge-inline" :class="badgeInfo('ticket_sin_vincular').clase" title="No se pudo identificar al solicitante">
                    <i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}
                  </span>
                  <RouterLink v-else-if="t.solicitante_id" class="empleado-link" :to="`/empleados/${t.solicitante_id}`" @click.stop>{{ t.solicitante }}</RouterLink>
                  <TextoVacio v-else :valor="t.solicitante" />
                </td>
                <td>
                  <div class="user-name">{{ t.titulo }}</div>
                </td>
                <td>
                  <span v-if="t.categoria" class="badge badge--neutral">{{ t.categoria }}</span>
                  <TextoVacio v-else />
                </td>
                <td><BadgeEstado tipo="ticket" :valor="t.estado" /></td>
                <td><BadgeEstado tipo="prioridad" :valor="t.prioridad" /></td>
                <td>
                  <TextoVacio v-if="!t.asignado_a" placeholder="Sin asignar" />
                  <template v-else>{{ staffPorId[t.asignado_a] || 'Staff' }}</template>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Render móvil: misma lista paginada, como tarjetas apiladas.
             También es lo que se ve en mobile cuando la preferencia
             guardada es Isla (ver vistaEfectiva) — Isla no tiene versión
             mobile propia, siempre cae acá. -->
        <ul v-if="!cargando" class="lista-tarjetas solo-movil" aria-label="Tickets de soporte">
          <li v-for="t in lista" :key="t.id" class="tarjeta-fila tarjeta-fila--clic" @click="verTicket(t)">
            <div class="tarjeta-fila__cab">
              <RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${t.id}`" @click.stop>{{ t.codigo }}</RouterLink>
              <span class="fecha-cell">
                {{ formatFechaHora(t.created_at) }}
                <span class="tk-antiguedad" :class="{ 'tk-antiguedad--alerta': ticketEnvejecido(t) }">· {{ formatAntiguedad(t.created_at) }}</span>
              </span>
            </div>
            <div class="tarjeta-fila__principal">{{ t.titulo }}</div>
            <div class="tarjeta-fila__sec">
              <span v-if="!t.vinculado" class="badge badge-inline" :class="badgeInfo('ticket_sin_vincular').clase" title="No se pudo identificar al solicitante">
                <i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}
              </span>
              <RouterLink v-else-if="t.solicitante_id" class="empleado-link" :to="`/empleados/${t.solicitante_id}`" @click.stop>{{ t.solicitante }}</RouterLink>
              <TextoVacio v-else :valor="t.solicitante" />
              <span aria-hidden="true">·</span>
              <TextoVacio v-if="!t.asignado_a" placeholder="Sin asignar" />
              <template v-else>{{ staffPorId[t.asignado_a] || 'Staff' }}</template>
            </div>
            <div class="tarjeta-fila__badges">
              <BadgeEstado tipo="ticket" :valor="t.estado" />
              <BadgeEstado tipo="prioridad" :valor="t.prioridad" />
              <span v-if="t.categoria" class="badge badge--neutral">{{ t.categoria }}</span>
            </div>
          </li>
        </ul>

        <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </template>
      </div>
    </main>

    <!-- ═══ Isla (desktop, ver vistaEfectiva): nav + lista angosta +
         panel de detalle ═══ -->
    <div v-else class="tickets-layout">
      <nav class="tickets-nav" aria-label="Filtros rápidos de tickets">
        <!-- Mismos datos/componente que la fila horizontal de modo Tabla
             más arriba (ver ListaVistas.vue) — el componente no impone
             ningún display propio, cada consumidor pasa su propia clase de
             layout (acá columna, allá fila). -->
        <ListaVistas v-model="vistaActiva" :vistas="VISTAS_TICKETS" :conteos="conteosVistas" class="tickets-nav-vistas" />

        <div class="tnav-separador" role="separator"></div>

        <!-- Sin vincular sigue independiente de las Vistas (se cruza libre
             con cualquiera) — degrada a filtro secundario en PASO 4, sigue
             acá tal cual por ahora. -->
        <button
          type="button"
          class="tnav-item"
          :class="{ 'tnav-item--activo': soloSinVincular }"
          :aria-pressed="soloSinVincular"
          @click="soloSinVincular = !soloSinVincular"
        >
          <i class="ti ti-link-off" aria-hidden="true"></i>
          <span class="tnav-label">Sin vincular</span>
        </button>

        <div class="tnav-prioridad">
          <label for="tnav-filtro-prioridad">Prioridad</label>
          <select id="tnav-filtro-prioridad" v-model="filtroPrioridad">
            <option value="">Toda prioridad</option>
            <option v-for="(v, k) in PRIORIDADES" :key="k" :value="k">{{ v.label }}</option>
          </select>
        </div>

        <div class="tnav-separador" role="separator"></div>

        <button
          type="button"
          class="tnav-item tnav-proximamente"
          disabled
          title="Todavía no disponible — necesita un filtro nuevo del lado del servidor"
        >
          <span class="tnav-label">Vencidos</span>
          <span class="tnav-badge-proximamente">Próximamente</span>
        </button>
      </nav>

      <main class="page tickets-lista">
        <div class="card card--fill">
          <div class="filters">
            <div class="search-wrap search-wrap--full">
              <i class="ti ti-search"></i>
              <input v-model="busqueda" type="text" placeholder="Buscar por código, título o solicitante...">
            </div>
          </div>

          <div v-if="cargando" class="no-results">Cargando tickets...</div>
          <div v-else-if="error" class="no-results tk-error">{{ error }}</div>

          <EmptyState
            v-else-if="!cargando && total === 0"
            icono="ti ti-headset"
            titulo="Sin tickets"
            :mensaje="busqueda || vistaActiva !== 'sin_asignar' || filtroPrioridad || soloSinVincular ? 'No hay resultados con los filtros aplicados.' : 'Aquí aparecerán las solicitudes de soporte.'"
          />

          <template v-if="!error && (cargando || total > 0)">
          <p v-if="cargando" class="sr-only" role="status">Cargando tickets…</p>
          <ul v-if="!cargando" class="lista-tarjetas" aria-label="Tickets de soporte">
            <li v-for="t in lista" :key="t.id" class="tarjeta-fila tarjeta-fila--clic" @click="verTicket(t)">
              <div class="tarjeta-fila__cab">
                <RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${t.id}`" @click.stop>{{ t.codigo }}</RouterLink>
                <span class="tk-antiguedad" :class="{ 'tk-antiguedad--alerta': ticketEnvejecido(t) }">{{ fechaListaAngosta(t.created_at) }}</span>
              </div>
              <div class="tarjeta-fila__principal">{{ t.titulo }}</div>
              <div class="tarjeta-fila__pie">
                <div class="tfs-badges">
                  <BadgeEstado tipo="ticket" :valor="t.estado" />
                  <span v-if="t.tipo" class="badge badge--neutral">{{ tipoLabel(t.tipo) }}</span>
                </div>
                <span v-if="t.asignado_a" class="avatar sm" :title="staffPorId[t.asignado_a] || 'Staff'">{{ inicialesDe(staffPorId[t.asignado_a]) }}</span>
                <span v-else class="avatar sm tfs-avatar-vacio" title="Sin asignar">
                  <i class="ti ti-user" aria-hidden="true"></i>
                </span>
              </div>
            </li>
          </ul>

          <div v-if="!cargando && lista.length < total" class="tickets-cargar-mas">
            <button type="button" class="btn" :disabled="cargandoMas" @click="store.cargarMas()">
              <i v-if="cargandoMas" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
              {{ cargandoMas ? 'Cargando...' : `Cargar más (${lista.length} de ${total})` }}
            </button>
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
      <div v-else class="tickets-panel tickets-panel-vacio">
        <i class="ti ti-headset" aria-hidden="true"></i>
        <p>Seleccioná un ticket para ver el detalle</p>
      </div>
    </div>

    <TicketInternoForm v-if="mostrarNuevo" @cerrar="onNuevoCerrado" />
    <ReporteTicketsModal v-if="mostrarReporte" :staff-por-id="staffPorId" @cerrar="mostrarReporte = false" />
  </div>
</template>

<style scoped>
/* ── Isla: 3 columnas, nav ~15% / lista ~25% / panel resto, con minmax
   como piso para que no se aplasten en ventanas chicas. Solo se monta en
   desktop (vistaEfectiva === 'isla' implica !esMovil, ver script) — no
   necesita una variante mobile propia, a diferencia de la versión previa
   de este layout que sí tenía que contemplar esMovil acá mismo. */
.tickets-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(160px, 15%) minmax(240px, 25%) 1fr;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg);
}

.tickets-nav {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

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

.tnav-prioridad {
  padding: 4px 10px 8px;
}

.tnav-prioridad label {
  display: block;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--color-text-tertiary);
  margin-bottom: 3px;
}

.tnav-prioridad select {
  width: 100%;
  box-sizing: border-box;
}

.tnav-proximamente:disabled {
  opacity: 1;
  cursor: default;
}

.tnav-badge-proximamente {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  background: var(--color-bg-subtle);
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.tfs-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.tickets-lista { min-width: 0; }

/* .card--fill es adrede sin borde/radio (comentario propio en main.css:
   "pegado a los bordes") — pensado para pegarse al borde del área de
   contenido, el paradigma del modo Tabla. En Isla flota sobre --color-bg
   con gap alrededor, necesita el borde+radio de vuelta para leerse como
   isla — override LOCAL, escoped a esta vista y solo dentro de
   .tickets-lista (modo Tabla usa .card--fill sin tocar, tal cual el resto
   del sistema). */
.tickets-lista .card--fill {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.tickets-panel {
  min-width: 0;
}

.tickets-panel-vacio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  color: var(--color-text-tertiary);
  font-size: var(--fs-base);
}

.tickets-cargar-mas {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.tickets-panel-vacio i { font-size: 28px; }

/* Avatar "sin asignar" en la lista angosta de Isla — mismo .avatar.sm
   global, pero neutro (no el acento por defecto): el color acá es
   puramente "hay alguien vs. no hay nadie", no debería competir con el
   acento real de foco/selección. */
.tfs-avatar-vacio {
  background: var(--color-bg-subtle);
  color: var(--color-text-tertiary);
  border-color: var(--color-border);
}

/* Isla: el buscador queda solo en su fila (Prioridad vive en el nav). */
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

.chips-filtro {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* Vistas en modo Tabla: mismos .tnav-item que la columna de Isla, en fila
   horizontal con wrap en vez de columna — mismo componente/datos, layout
   distinto por contexto (ver comentario en el template). */
.tickets-vistas-fila {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 10px;
}

/* Mismo par tenue-acento que el ítem activo del sidebar (GUIA-UX-UI):
   sin bordes, solo fondo/color de acento cuando el filtro está activo. */
.chip-filtro {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-bg-subtle);
  color: var(--color-text-secondary);
  font-size: var(--fs-base);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.chip-filtro:hover { background: var(--color-bg-hover); }

.chip-filtro:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--mat-ring);
}

.chip-filtro--activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}

.tk-antiguedad {
  font-size: var(--fs-sm);
  color: var(--color-text-tertiary);
}

.tk-antiguedad--alerta { color: var(--color-warning-text); }

.fila-ticket { cursor: pointer; }
.fila-ticket:hover td { background: var(--color-bg-hover); }
</style>
