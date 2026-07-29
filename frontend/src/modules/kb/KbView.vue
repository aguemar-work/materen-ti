<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useKbStore } from '../../stores/kb.js';
import { insforgeApi } from '../../api/insforge.js';
import { OPCIONES_ESTADO_KB } from '../../core/dominio-kb.js';
import { formatFechaHora } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import KbArticuloForm from './KbArticuloForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';

const router = useRouter();
const store = useKbStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

const busqueda = ref('');
const filtroCategoria = ref('');
const filtroEstado = ref('');
const mostrarForm = ref(false);
const categorias = ref([]);

let debounceBusqueda = null;
watch(busqueda, (q) => {
  clearTimeout(debounceBusqueda);
  debounceBusqueda = setTimeout(() => store.aplicarFiltros({ q: q.trim() }), 300);
});
watch(
  [filtroCategoria, filtroEstado],
  ([categoriaId, estado]) => store.aplicarFiltros({ categoriaId, estado }),
);

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

function verArticulo(articulo) {
  router.push(`/base-conocimiento/${articulo.id}`);
}

function onFormCerrado(creado) {
  mostrarForm.value = false;
  if (creado) {
    showToast('Artículo creado en borrador');
    router.push(`/base-conocimiento/${creado.id}`);
  }
}

onMounted(async () => {
  store.resetearFiltros();
  try {
    const [, cats] = await Promise.all([store.cargar(), insforgeApi.listCategoriasTicket()]);
    categorias.value = cats;
  } catch {
    showToast(error.value || 'Error al cargar la base de conocimiento', 'error');
  }
});
</script>

<template>
  <div class="kb-page vista-modulo">
    <PageHeader titulo="Base de Conocimiento" icono="ti ti-books" :conteo="total">
      <template #acciones>
        <button class="btn btn-primary" type="button" @click="mostrarForm = true">
          <i class="ti ti-plus" aria-hidden="true"></i> Nuevo artículo
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por título o síntoma...">
          </div>
          <select v-model="filtroCategoria">
            <option value="">Todas las categorías</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <select v-model="filtroEstado">
            <option value="">Todos los estados</option>
            <option v-for="e in OPCIONES_ESTADO_KB" :key="e.valor" :value="e.valor">{{ e.label }}</option>
          </select>
        </div>

        <div v-if="error" class="no-results kb-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-books"
          titulo="Sin artículos"
          :mensaje="busqueda || filtroCategoria || filtroEstado ? 'No hay resultados con los filtros aplicados.' : 'Registra la primera solución reutilizable de la base de conocimiento.'"
        >
          <button v-if="!busqueda && !filtroCategoria && !filtroEstado" class="btn" type="button" @click="mostrarForm = true">
            <i class="ti ti-plus"></i> Nuevo artículo
          </button>
        </EmptyState>

        <div v-else-if="cargando || total > 0" class="table-wrap">
          <p v-if="cargando" class="sr-only" role="status">Cargando artículos…</p>
          <table aria-label="Artículos de la base de conocimiento">
            <thead>
              <tr>
                <ThOrdenable clave="titulo" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Título</ThOrdenable>
                <th scope="col">Categoría</th>
                <ThOrdenable clave="estado" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Estado</ThOrdenable>
                <th scope="col">¿Sirvió?</th>
                <ThOrdenable clave="updated_at" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Actualizado</ThOrdenable>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="5" />
              <template v-else>
              <tr v-for="a in lista" :key="a.id" class="fila-kb" @click="verArticulo(a)">
                <td>
                  <RouterLink class="kb-titulo-link" :to="`/base-conocimiento/${a.id}`" @click.stop>{{ a.titulo }}</RouterLink>
                  <div v-if="a.sintoma" class="kb-sintoma">{{ a.sintoma }}</div>
                </td>
                <td>
                  <span v-if="a.categoria_nombre" class="badge badge--accent">{{ a.categoria_nombre }}</span>
                  <TextoVacio v-else />
                </td>
                <td><BadgeEstado tipo="kb_estado" :valor="a.estado" /></td>
                <td class="kb-feedback">
                  <span title="Le sirvió"><i class="ti ti-thumb-up" aria-hidden="true"></i> {{ a.util_si }}</span>
                  <span title="No le sirvió"><i class="ti ti-thumb-down" aria-hidden="true"></i> {{ a.util_no }}</span>
                </td>
                <td class="fecha-cell">{{ formatFechaHora(a.updated_at) }}</td>
              </tr>
              </template>
            </tbody>
          </table>
          <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </div>
      </div>
    </main>

    <KbArticuloForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>

<style scoped>
.kb-error { color: var(--color-danger); }

.fila-kb { cursor: pointer; }
.fila-kb:hover td { background: var(--color-bg-hover); }

.kb-titulo-link {
  color: var(--color-text-primary);
  text-decoration: none;
  font-weight: 600;
}
.kb-titulo-link:hover,
.kb-titulo-link:focus-visible {
  text-decoration: underline;
}

.kb-sintoma {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.kb-feedback {
  display: flex;
  gap: 12px;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.fecha-cell { white-space: nowrap; }
</style>
