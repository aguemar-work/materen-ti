<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useKbStore } from '../../stores/kb.js';
import { insforgeApi } from '../../api/insforge.js';
import { OPCIONES_ESTADO_KB } from '../../core/dominio-kb.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import KbArticuloForm from './KbArticuloForm.vue';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const router = useRouter();
const store = useKbStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });
const filtroCategoria = ref('');
const filtroEstado = ref('');
const mostrarForm = ref(false);
const categorias = ref([]);

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

// Toda la fila navega (clic-fila): el link de "Artículo" existe aparte solo
// para que Ctrl/Cmd-clic y "abrir en pestaña nueva" sigan funcionando.
function claseFilaKb() {
  return 'fila-kb tarjeta-fila--clic';
}

// "¿Sirvió?" no es un campo propio del artículo: combina util_si/util_no en
// una sola columna sintética (clave 'feedback', sin dato real detrás, solo
// slot). Va al pie de la tarjeta móvil junto al estado, mismo layout
// space-between que tenía a mano.
const columnas = [
  { clave: 'titulo', label: 'Artículo', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'estado', label: 'Estado', ordenable: true, movil: 'pie' },
  { clave: 'feedback', label: '¿Sirvió?', num: true, movil: 'pie' },
  { clave: 'updated_at', label: 'Actualizado', ordenable: true, num: true, movil: 'sec' },
];

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
        <CarbonButton variante="primary" icono="ti-plus" @click="mostrarForm = true">Nuevo artículo</CarbonButton>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por título o síntoma...">
          </div>
          <div class="filter-field">
            <label for="filtro-categoria">Categoría</label>
            <select id="filtro-categoria" v-model="filtroCategoria">
              <option value="">Todas las categorías</option>
              <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
            </select>
          </div>
          <div class="filter-field">
            <label for="filtro-estado">Estado</label>
            <select id="filtro-estado" v-model="filtroEstado">
              <option value="">Todos los estados</option>
              <option v-for="e in OPCIONES_ESTADO_KB" :key="e.valor" :value="e.valor">{{ e.label }}</option>
            </select>
          </div>
        </div>

        <div v-if="error" class="no-results kb-error">{{ error }}</div>

        <template v-else>
        <CarbonDataTable
          :columnas="columnas"
          :filas="lista"
          :cargando="cargando"
          :orden-por="ordenColumna"
          :orden-dir="ordenDireccion"
          :clase-fila="claseFilaKb"
          etiqueta="Artículos de la base de conocimiento"
          vacio-icono="ti ti-books"
          vacio-titulo="Sin artículos"
          :vacio-mensaje="busqueda || filtroCategoria || filtroEstado ? 'No hay resultados con los filtros aplicados.' : 'Registra la primera solución reutilizable de la base de conocimiento.'"
          @ordenar="store.ordenarPor"
          @clic-fila="verArticulo"
        >
          <template #celda-titulo="{ fila }">
            <!-- Categoría + Síntoma colapsan como metadato arriba (mismo
                 criterio que Tickets: Categoría baja de badge a texto, es
                 clasificación fija, no estado), Título como dato principal
                 abajo. -->
            <div class="celda-apilada">
              <span v-if="fila.categoria_nombre || fila.sintoma" class="celda-apilada__meta">
                <template v-if="fila.categoria_nombre">{{ fila.categoria_nombre }}</template>
                <span v-if="fila.categoria_nombre && fila.sintoma" class="celda-sep" aria-hidden="true">·</span>
                <template v-if="fila.sintoma">{{ fila.sintoma }}</template>
              </span>
              <RouterLink class="celda-apilada__principal kb-titulo-link" :to="`/base-conocimiento/${fila.id}`" @click.stop>{{ fila.titulo }}</RouterLink>
            </div>
          </template>
          <template #celda-estado="{ fila }">
            <BadgeEstado tipo="kb_estado" :valor="fila.estado" />
          </template>
          <template #celda-feedback="{ fila }">
            <span class="kb-feedback">
              <span title="Le sirvió"><i class="ti ti-thumb-up" aria-hidden="true"></i> {{ fila.util_si }}</span>
              <span title="No le sirvió"><i class="ti ti-thumb-down" aria-hidden="true"></i> {{ fila.util_no }}</span>
            </span>
          </template>
          <template #celda-updated_at="{ fila }">
            <span class="fecha-cell" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
          </template>
          <template #vacio-accion>
            <CarbonButton v-if="!busqueda && !filtroCategoria && !filtroEstado" variante="secondary" icono="ti-plus" @click="mostrarForm = true">Nuevo artículo</CarbonButton>
          </template>
        </CarbonDataTable>

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="total"
          :tam-pagina="store.tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="artículos"
          @update:tam-pagina="store.cambiarTamPagina"
        />
        </template>
      </div>
    </main>

    <KbArticuloForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>

<style scoped>
.kb-error { color: var(--color-danger); }

/* :deep() porque CarbonDataTable renderiza el <tr> en SU PROPIO ámbito de
   scope (vía claseFila) — un selector scoped normal acá nunca lo alcanza
   (bug real encontrado en la Tanda 2 del rediseño de tablas, 2026-09-03). */
:deep(.fila-kb) { cursor: pointer; }
:deep(.fila-kb:hover td) { background: var(--color-bg-hover); }

.kb-titulo-link {
  /* Peso 400, no 600 (pasada de diseño de tablas ago 2026): pisaba la
     regla global "ningún dato de tabla en negrita" (main.css,
     .user-name{font-weight:400}) — bug real, no una excepción a propósito. */
  color: var(--color-text-primary);
  text-decoration: none;
}
.kb-titulo-link:hover,
.kb-titulo-link:focus-visible {
  text-decoration: underline;
}

.kb-feedback {
  display: flex;
  gap: 12px;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.fecha-cell { white-space: nowrap; }
</style>
