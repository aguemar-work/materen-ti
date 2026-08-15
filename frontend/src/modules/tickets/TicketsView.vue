<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useTicketsStore } from '../../stores/tickets.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { ESTADOS_TICKET as ESTADOS, PRIORIDADES_TICKET as PRIORIDADES } from '../../core/dominio-tickets.js';
import { badgeInfo } from '../../core/badges.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import TicketInternoForm from './TicketInternoForm.vue';
import ReporteTicketsModal from './ReporteTicketsModal.vue';
import Pagination from '../../components/shared/Pagination.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';

const router = useRouter();
const store = useTicketsStore();
const auth = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

// El auto-refresco de tickets:list vive en AppLayout.vue (suscripción
// única, así el sonido de "ticket nuevo" suena en cualquier pantalla).

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });
const filtroEstado = ref('');
const filtroPrioridad = ref('');
const soloSinAsignar = ref(false);
const soloSinVincular = ref(false);
const misTickets = ref(false);
const mostrarNuevo = ref(false);
const mostrarReporte = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => {
  const mapa = {};
  for (const s of staffLista.value) mapa[s.user_id] = s.nombre;
  return mapa;
});

// "Mis tickets" y "Sin asignar" se excluyen entre sí (un ticket no puede
// ser ambas cosas): activar uno apaga el otro.
function toggleMisTickets() {
  misTickets.value = !misTickets.value;
  if (misTickets.value) soloSinAsignar.value = false;
}
function toggleSinAsignar() {
  soloSinAsignar.value = !soloSinAsignar.value;
  if (soloSinAsignar.value) misTickets.value = false;
}

// Búsqueda y filtros viajan al servidor (paginación server-side):
// la búsqueda con debounce, los chips/selects al instante.
watch(
  [filtroEstado, filtroPrioridad, soloSinAsignar, soloSinVincular, misTickets],
  ([estado, prioridad, sinAsignar, sinVincular, mios]) =>
    store.aplicarFiltros({ estado, prioridad, sinAsignar, sinVincular, asignadoA: mios ? (auth.user?.id || '') : '' }),
);

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

function verTicket(ticket) {
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
    const [, staff] = await Promise.all([store.cargar(), insforgeApi.listStaff()]);
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

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por código, título o solicitante...">
          </div>
          <div class="filter-field">
            <label for="filtro-estado">Estado</label>
            <select id="filtro-estado" v-model="filtroEstado">
              <option value="">Todos los estados</option>
              <option v-for="(v, k) in ESTADOS" :key="k" :value="k">{{ v.label }}</option>
            </select>
          </div>
          <div class="filter-field">
            <label for="filtro-prioridad">Prioridad</label>
            <select id="filtro-prioridad" v-model="filtroPrioridad">
              <option value="">Toda prioridad</option>
              <option v-for="(v, k) in PRIORIDADES" :key="k" :value="k">{{ v.label }}</option>
            </select>
          </div>
          <div class="chips-filtro">
            <button type="button" class="chip-filtro" :class="{ 'chip-filtro--activo': misTickets }" @click="toggleMisTickets">
              <i class="ti ti-user" aria-hidden="true"></i> Mis tickets
            </button>
            <button type="button" class="chip-filtro" :class="{ 'chip-filtro--activo': soloSinAsignar }" @click="toggleSinAsignar">
              Sin asignar
            </button>
            <button type="button" class="chip-filtro" :class="{ 'chip-filtro--activo': soloSinVincular }" @click="soloSinVincular = !soloSinVincular">
              Sin vincular
            </button>
          </div>
        </div>

        <div v-if="cargando" class="no-results solo-movil">Cargando tickets...</div>
        <div v-else-if="error" class="no-results tk-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-headset"
          titulo="Sin tickets"
          :mensaje="busqueda || filtroEstado || filtroPrioridad ? 'No hay resultados con los filtros aplicados.' : 'Aquí aparecerán las solicitudes de soporte.'"
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
                  <span v-if="t.categoria" class="badge badge--accent">{{ t.categoria }}</span>
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

        <!-- Render móvil: misma lista paginada, como tarjetas apiladas -->
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
              <span v-if="t.categoria" class="badge badge--accent">{{ t.categoria }}</span>
            </div>
          </li>
        </ul>

        <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </template>
      </div>
    </main>

    <TicketInternoForm v-if="mostrarNuevo" @cerrar="onNuevoCerrado" />
    <ReporteTicketsModal v-if="mostrarReporte" :staff-por-id="staffPorId" @cerrar="mostrarReporte = false" />
  </div>
</template>

<style scoped>
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
