<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useProblemasStore } from '../../stores/problemas.js';
import { insforgeApi } from '../../api/insforge.js';
import { OPCIONES_ESTADO_PROBLEMA, OPCIONES_SEVERIDAD_PROBLEMA } from '../../core/dominio-problemas.js';
import { formatFechaHora } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import ProblemaForm from './ProblemaForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';

const router = useRouter();
const store = useProblemasStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

const busqueda = ref('');
const filtroEstado = ref('');
const filtroSeveridad = ref('');
const mostrarForm = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => Object.fromEntries(staffLista.value.map((s) => [s.user_id, s.nombre])));

let debounceBusqueda = null;
watch(busqueda, (q) => {
  clearTimeout(debounceBusqueda);
  debounceBusqueda = setTimeout(() => store.aplicarFiltros({ q: q.trim() }), 300);
});
watch(
  [filtroEstado, filtroSeveridad],
  ([estado, severidad]) => store.aplicarFiltros({ estado, severidad }),
);

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

function verProblema(problema) {
  router.push(`/problemas/${problema.id}`);
}

function onFormCerrado(creado) {
  mostrarForm.value = false;
  if (creado) {
    showToast('Problema creado');
    router.push(`/problemas/${creado.id}`);
  }
}

onMounted(async () => {
  store.resetearFiltros();
  try {
    const [, staff] = await Promise.all([store.cargar(), insforgeApi.listStaff()]);
    staffLista.value = staff;
  } catch {
    showToast(error.value || 'Error al cargar los problemas', 'error');
  }
});
</script>

<template>
  <div class="problemas-page vista-modulo">
    <PageHeader titulo="Problemas" icono="ti ti-alert-hexagon" :conteo="total">
      <template #acciones>
        <button class="btn btn-primary" type="button" @click="mostrarForm = true">
          <i class="ti ti-plus" aria-hidden="true"></i> Nuevo problema
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por título...">
          </div>
          <select v-model="filtroEstado">
            <option value="">Todos los estados</option>
            <option v-for="e in OPCIONES_ESTADO_PROBLEMA" :key="e.valor" :value="e.valor">{{ e.label }}</option>
          </select>
          <select v-model="filtroSeveridad">
            <option value="">Todas las severidades</option>
            <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
          </select>
        </div>

        <div v-if="error" class="no-results problemas-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-alert-hexagon"
          titulo="Sin problemas"
          :mensaje="busqueda || filtroEstado || filtroSeveridad ? 'No hay resultados con los filtros aplicados.' : 'Registra el primer problema con causa raíz y acciones correctivas.'"
        >
          <button v-if="!busqueda && !filtroEstado && !filtroSeveridad" class="btn" type="button" @click="mostrarForm = true">
            <i class="ti ti-plus"></i> Nuevo problema
          </button>
        </EmptyState>

        <div v-else-if="cargando || total > 0" class="table-wrap">
          <p v-if="cargando" class="sr-only" role="status">Cargando problemas…</p>
          <table aria-label="Problemas">
            <thead>
              <tr>
                <ThOrdenable clave="titulo" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Título</ThOrdenable>
                <ThOrdenable clave="severidad" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Severidad</ThOrdenable>
                <ThOrdenable clave="estado" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Estado</ThOrdenable>
                <th scope="col">Responsable</th>
                <ThOrdenable clave="updated_at" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Actualizado</ThOrdenable>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="5" />
              <template v-else>
              <tr v-for="p in lista" :key="p.id" class="fila-problema" @click="verProblema(p)">
                <td>
                  <RouterLink class="problema-titulo-link" :to="`/problemas/${p.id}`" @click.stop>{{ p.titulo }}</RouterLink>
                </td>
                <td><BadgeEstado tipo="problema_severidad" :valor="p.severidad" /></td>
                <td><BadgeEstado tipo="problema_estado" :valor="p.estado" /></td>
                <td>
                  <span v-if="p.responsable_id">{{ staffPorId[p.responsable_id] || 'Staff' }}</span>
                  <TextoVacio v-else placeholder="Sin asignar" />
                </td>
                <td class="fecha-cell">{{ formatFechaHora(p.updated_at) }}</td>
              </tr>
              </template>
            </tbody>
          </table>
          <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </div>
      </div>
    </main>

    <ProblemaForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>

<style scoped>
.problemas-error { color: var(--color-danger); }

.fila-problema { cursor: pointer; }
.fila-problema:hover td { background: var(--color-bg-hover); }

.problema-titulo-link {
  color: var(--color-text-primary);
  text-decoration: none;
  font-weight: 600;
}
.problema-titulo-link:hover,
.problema-titulo-link:focus-visible {
  text-decoration: underline;
}

.fecha-cell { white-space: nowrap; }
</style>
