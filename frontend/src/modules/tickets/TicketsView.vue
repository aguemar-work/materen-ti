<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useTicketsStore } from '../../stores/tickets.js';
import { insforgeApi } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import TicketInternoForm from './TicketInternoForm.vue';

const router = useRouter();
const store = useTicketsStore();
const { lista, cargando, error } = storeToRefs(store);

const busqueda = ref('');
const filtroEstado = ref('');
const filtroPrioridad = ref('');
const soloSinAsignar = ref(false);
const soloSinVincular = ref(false);
const mostrarNuevo = ref(false);

const ESTADOS = {
  abierto:     { label: 'Abierto',      clase: 'badge--info' },
  en_progreso: { label: 'En progreso',  clase: 'badge--warning' },
  resuelto:    { label: 'Resuelto',     clase: 'badge--success' },
  cerrado:     { label: 'Cerrado',      clase: 'badge--neutral' },
  reabierto:   { label: 'Reabierto',    clase: 'badge--danger' },
  rechazado:   { label: 'Rechazado',    clase: 'badge--neutral' },
};

const PRIORIDADES = {
  baja:    { label: 'Baja',    clase: 'badge--neutral' },
  media:   { label: 'Media',   clase: 'badge--info' },
  alta:    { label: 'Alta',    clase: 'badge--warning' },
  urgente: { label: 'Urgente', clase: 'badge--danger' },
};

function estadoInfo(e) { return ESTADOS[e] || { label: e, clase: 'badge--neutral' }; }
function prioridadInfo(p) { return PRIORIDADES[p] || { label: p, clase: 'badge--neutral' }; }

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return lista.value.filter((t) => {
    if (filtroEstado.value && t.estado !== filtroEstado.value) return false;
    if (filtroPrioridad.value && t.prioridad !== filtroPrioridad.value) return false;
    if (soloSinAsignar.value && t.asignado_a) return false;
    if (soloSinVincular.value && t.vinculado) return false;
    if (!q) return true;
    return t.codigo.toLowerCase().includes(q) ||
      t.titulo.toLowerCase().includes(q) ||
      t.solicitante.toLowerCase().includes(q);
  });
});

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

function onNuevoCerrado(creado) {
  mostrarNuevo.value = false;
  if (creado) {
    showToast('Ticket interno creado');
    store.cargar();
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar tickets', 'error');
  }
});
</script>

<template>
  <div class="tickets-page">
    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <div class="brand-icon">
            <i class="ti ti-headset" aria-hidden="true"></i>
          </div>
          <div class="brand-text">
            <h1>Sistema TI</h1>
            <span>Módulo: Tickets</span>
          </div>
        </div>
        <button class="btn btn-primary" type="button" @click="mostrarNuevo = true">
          <i class="ti ti-plus" aria-hidden="true"></i> Ticket interno
        </button>
      </div>
    </header>

    <main class="page">
      <div class="card">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Tickets de soporte
            <span class="badge-count">{{ listaFiltrada.length }}</span>
          </div>
          <div class="toolbar-actions">
            <button class="btn" type="button" @click="copiarEnlace('/ticket/nuevo', 'Enlace para reportar copiado')">
              <i class="ti ti-link" aria-hidden="true"></i> Copiar enlace para reportar
            </button>
            <button class="btn" type="button" @click="copiarEnlace('/ticket/buscar', 'Enlace de búsqueda por DNI copiado')">
              <i class="ti ti-search" aria-hidden="true"></i> Copiar enlace de búsqueda
            </button>
          </div>
        </div>

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

        <div v-else-if="listaFiltrada.length === 0" class="empty">
          <div class="empty-icon"><i class="ti ti-headset"></i></div>
          <h3>Sin tickets</h3>
          <p>{{ busqueda || filtroEstado || filtroPrioridad ? 'No hay resultados con los filtros aplicados.' : 'Aquí aparecerán las solicitudes de soporte.' }}</p>
        </div>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Solicitante</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Prioridad</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in listaFiltrada" :key="t.id" class="fila-ticket" @click="verTicket(t)">
                <td><span class="tk-codigo">{{ t.codigo }}</span></td>
                <td>
                  <div class="user-name">{{ t.titulo }}</div>
                </td>
                <td>
                  <span v-if="!t.vinculado" class="badge badge--danger badge-inline" title="No se pudo identificar al solicitante">
                    <i class="ti ti-alert-triangle"></i> Sin vincular
                  </span>
                  <span v-else>{{ t.solicitante || '—' }}</span>
                </td>
                <td class="text-muted">{{ t.categoria }}{{ t.subcategoria ? ` · ${t.subcategoria}` : '' }}</td>
                <td><span class="badge" :class="estadoInfo(t.estado).clase">{{ estadoInfo(t.estado).label }}</span></td>
                <td><span class="badge" :class="prioridadInfo(t.prioridad).clase">{{ prioridadInfo(t.prioridad).label }}</span></td>
                <td class="text-muted">
                  <span v-if="!t.asignado_a" class="badge badge--neutral" title="Sin asignar">Sin asignar</span>
                  <template v-else>{{ formatFecha(t.updated_at) }}</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <TicketInternoForm v-if="mostrarNuevo" @cerrar="onNuevoCerrado" />
  </div>
</template>

<style scoped>
.tk-error { color: var(--color-danger); }

.tk-codigo {
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
  font-weight: 600;
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
