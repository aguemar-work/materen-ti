<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useTicketsStore } from '../../stores/tickets.js';
import { insforgeApi } from '../../api/insforge.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
import { ESTADOS_TICKET as ESTADOS, PRIORIDADES_TICKET as PRIORIDADES, estadoInfo, prioridadInfo } from '../../core/dominio-tickets.js';
import { formatFechaHora } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import TicketInternoForm from './TicketInternoForm.vue';
import ReporteTicketsModal from './ReporteTicketsModal.vue';
import Pagination from '../../components/shared/Pagination.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';

const router = useRouter();
const store = useTicketsStore();
const { lista, total, cargando, error } = storeToRefs(store);

useRealtimeRefresco('tickets:list', () => store.cargar());

const busqueda = ref('');
const filtroEstado = ref('');
const filtroPrioridad = ref('');
const soloSinAsignar = ref(false);
const soloSinVincular = ref(false);
const mostrarNuevo = ref(false);
const mostrarReporte = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => {
  const mapa = {};
  for (const s of staffLista.value) mapa[s.user_id] = s.nombre;
  return mapa;
});

// Búsqueda y filtros viajan al servidor (paginación server-side):
// la búsqueda con debounce, los selects/checkboxes al instante.
let debounceBusqueda = null;
watch(busqueda, (q) => {
  clearTimeout(debounceBusqueda);
  debounceBusqueda = setTimeout(() => store.aplicarFiltros({ q: q.trim() }), 300);
});
watch(
  [filtroEstado, filtroPrioridad, soloSinAsignar, soloSinVincular],
  ([estado, prioridad, sinAsignar, sinVincular]) =>
    store.aplicarFiltros({ estado, prioridad, sinAsignar, sinVincular }),
);

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

// Exporta el dataset filtrado COMPLETO (el servidor solo tiene la página)
const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'tickets',
      ['Código', 'Fecha', 'Solicitante', 'Título', 'Categoría', 'Estado', 'Prioridad', 'Asignado a'],
      filas.map((t) => [
        t.codigo,
        formatFechaHora(t.created_at),
        t.vinculado ? t.solicitante : 'Sin vincular',
        t.titulo,
        t.categoria,
        estadoInfo(t.estado).label,
        prioridadInfo(t.prioridad).label,
        t.asignado_a ? (staffPorId.value[t.asignado_a] || 'Staff') : 'Sin asignar',
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

function verTicket(ticket) {
  router.push(`/tickets/${ticket.id}`);
}

// Enlaces públicos que el staff comparte con los empleados (o abre para
// probar) — se copian con window.location.origin para que funcionen igual
// en desarrollo y en producción.
async function copiarEnlace(ruta, mensaje) {
  const link = `${window.location.origin}${ruta}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast(mensaje);
  } catch {
    showToast('No se pudo copiar. Copia manualmente: ' + link, 'error');
  }
}

// En móvil los 4 botones secundarios del header se condensan en un menú
// "Más" (patrón mobile); en escritorio siguen como botones sueltos.
const accionesMas = computed(() => [
  {
    icono: 'ti-link',
    label: 'Copiar enlace para reportar',
    onClick: () => copiarEnlace('/ticket/nuevo', 'Enlace para reportar copiado'),
  },
  {
    icono: 'ti-search',
    label: 'Copiar enlace de búsqueda',
    onClick: () => copiarEnlace('/ticket/buscar', 'Enlace de búsqueda por DNI copiado'),
  },
  { icono: 'ti-table-export', label: 'Exportar', disabled: exportando.value, onClick: exportar },
  { icono: 'ti-report', label: 'Reporte', onClick: () => { mostrarReporte.value = true; } },
]);

function onNuevoCerrado(creado) {
  mostrarNuevo.value = false;
  if (creado) {
    showToast('Ticket interno creado');
    store.cargar();
  }
}

onMounted(async () => {
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
        <button class="btn solo-escritorio" type="button" @click="copiarEnlace('/ticket/nuevo', 'Enlace para reportar copiado')">
          <i class="ti ti-link" aria-hidden="true"></i> Copiar enlace para reportar
        </button>
        <button class="btn solo-escritorio" type="button" @click="copiarEnlace('/ticket/buscar', 'Enlace de búsqueda por DNI copiado')">
          <i class="ti ti-search" aria-hidden="true"></i> Copiar enlace de búsqueda
        </button>
        <button class="btn solo-escritorio" type="button" title="Exportar a Excel (CSV)" :disabled="exportando" @click="exportar">
          <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
        </button>
        <button class="btn solo-escritorio" type="button" @click="mostrarReporte = true">
          <i class="ti ti-report" aria-hidden="true"></i> Reporte
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
          <select v-model="filtroEstado">
            <option value="">Todos los estados</option>
            <option v-for="(v, k) in ESTADOS" :key="k" :value="k">{{ v.label }}</option>
          </select>
          <select v-model="filtroPrioridad">
            <option value="">Toda prioridad</option>
            <option v-for="(v, k) in PRIORIDADES" :key="k" :value="k">{{ v.label }}</option>
          </select>
          <label class="filtro-check">
            <input v-model="soloSinAsignar" type="checkbox"> Sin asignar
          </label>
          <label class="filtro-check">
            <input v-model="soloSinVincular" type="checkbox"> Sin vincular
          </label>
        </div>

        <div v-if="cargando" class="no-results">Cargando tickets...</div>
        <div v-else-if="error" class="no-results tk-error">{{ error }}</div>

        <EmptyState
          v-else-if="total === 0"
          icono="ti ti-headset"
          titulo="Sin tickets"
          :mensaje="busqueda || filtroEstado || filtroPrioridad ? 'No hay resultados con los filtros aplicados.' : 'Aquí aparecerán las solicitudes de soporte.'"
        />

        <template v-else>
        <div class="table-wrap solo-escritorio">
          <table aria-label="Tickets de soporte">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Fecha</th>
                <th scope="col">Solicitante</th>
                <th scope="col">Título</th>
                <th scope="col">Categoría</th>
                <th scope="col">Estado</th>
                <th scope="col">Prioridad</th>
                <th scope="col">Asignado a</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in lista" :key="t.id" class="fila-ticket" @click="verTicket(t)">
                <td><RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${t.id}`" @click.stop>{{ t.codigo }}</RouterLink></td>
                <td class="fecha-cell">{{ formatFechaHora(t.created_at) }}</td>
                <td>
                  <span v-if="!t.vinculado" class="badge badge--danger badge-inline" title="No se pudo identificar al solicitante">
                    <i class="ti ti-alert-triangle"></i> Sin vincular
                  </span>
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
            </tbody>
          </table>
        </div>

        <!-- Render móvil: misma lista paginada, como tarjetas apiladas -->
        <ul class="lista-tarjetas solo-movil" aria-label="Tickets de soporte">
          <li v-for="t in lista" :key="t.id" class="tarjeta-fila tarjeta-fila--clic" @click="verTicket(t)">
            <div class="tarjeta-fila__cab">
              <RouterLink class="tk-codigo tk-codigo-link" :to="`/tickets/${t.id}`" @click.stop>{{ t.codigo }}</RouterLink>
              <span class="fecha-cell">{{ formatFechaHora(t.created_at) }}</span>
            </div>
            <div class="tarjeta-fila__principal">{{ t.titulo }}</div>
            <div class="tarjeta-fila__sec">
              <span v-if="!t.vinculado" class="badge badge--danger badge-inline" title="No se pudo identificar al solicitante">
                <i class="ti ti-alert-triangle"></i> Sin vincular
              </span>
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

        <Pagination v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
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

.tk-codigo-link {
  color: inherit;
  text-decoration: none;
}
.tk-codigo-link:hover,
.tk-codigo-link:focus-visible {
  text-decoration: underline;
}

.filtro-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.fila-ticket { cursor: pointer; }
.fila-ticket:hover td { background: var(--color-bg-hover); }
</style>
