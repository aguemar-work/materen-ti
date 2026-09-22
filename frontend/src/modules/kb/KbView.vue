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
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { columnasVisibles, estiloColumna, agruparParaTarjeta } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
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

const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);
const enTarjeta = computed(() => agruparParaTarjeta(columnasVisiblesLista.value));

const totalPaginas = computed(() => totalPaginasDe(total.value, store.tamPagina));
const paginas = computed(() => paginasDe(totalPaginas.value));
const desde = computed(() => rangoDe(store.pagina, store.tamPagina, total.value).desde);
const hasta = computed(() => rangoDe(store.pagina, store.tamPagina, total.value).hasta);
function irA(pagina) {
  const destino = clampPagina(pagina, totalPaginas.value);
  if (destino !== store.pagina) store.irAPagina(destino);
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
        <button type="button" class="btn btn--primary" @click="mostrarForm = true">
          Nuevo artículo
          <i class="ti ti-plus" aria-hidden="true"></i>
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
        <div class="tabla-envoltorio">
          <table class="tabla" aria-label="Artículos de la base de conocimiento">
            <thead>
              <tr>
                <template v-for="col in columnasVisiblesLista" :key="col.clave">
                  <ThOrdenable
                    v-if="col.ordenable"
                    :clave="col.clave"
                    :columna="ordenColumna"
                    :direccion="ordenDireccion"
                    :class="{ 'col-num': col.num }"
                    :style="estiloColumna(col)"
                    @ordenar="store.ordenarPor(col.clave)"
                  >{{ col.label }}</ThOrdenable>
                  <th v-else scope="col" :class="{ 'col-num': col.num }" :style="estiloColumna(col)">{{ col.label }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
              <tr v-else-if="!lista.length">
                <td :colspan="totalColumnas" class="tabla__vacio">
                  <EmptyState
                    icono="ti ti-books"
                    titulo="Sin artículos"
                    :mensaje="busqueda || filtroCategoria || filtroEstado ? 'No hay resultados con los filtros aplicados.' : 'Registra la primera solución reutilizable de la base de conocimiento.'"
                  >
                    <button
                      v-if="!busqueda && !filtroCategoria && !filtroEstado"
                      type="button"
                      class="btn btn--secondary"
                      @click="mostrarForm = true"
                    >
                      Nuevo artículo
                      <i class="ti ti-plus" aria-hidden="true"></i>
                    </button>
                  </EmptyState>
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in lista" :key="fila.id" :class="claseFilaKb(fila)" @click="verArticulo(fila)">
                  <td>
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
                  </td>
                  <td>
                    <BadgeEstado tipo="kb_estado" :valor="fila.estado" />
                  </td>
                  <td class="col-num">
                    <span class="kb-feedback">
                      <span title="Le sirvió"><i class="ti ti-thumb-up" aria-hidden="true"></i> {{ fila.util_si }}</span>
                      <span title="No le sirvió"><i class="ti ti-thumb-down" aria-hidden="true"></i> {{ fila.util_no }}</span>
                    </span>
                  </td>
                  <td class="col-num">
                    <span class="fecha-cell" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul v-if="!cargando && lista.length" class="lista-tarjetas solo-movil" aria-label="Artículos de la base de conocimiento">
          <li v-for="fila in lista" :key="fila.id" class="tarjeta-fila" :class="claseFilaKb(fila)" @click="verArticulo(fila)">
            <div v-for="col in enTarjeta.principal" :key="col.clave" class="tarjeta-fila__principal">
              <div class="celda-apilada">
                <span v-if="fila.categoria_nombre || fila.sintoma" class="celda-apilada__meta">
                  <template v-if="fila.categoria_nombre">{{ fila.categoria_nombre }}</template>
                  <span v-if="fila.categoria_nombre && fila.sintoma" class="celda-sep" aria-hidden="true">·</span>
                  <template v-if="fila.sintoma">{{ fila.sintoma }}</template>
                </span>
                <RouterLink class="celda-apilada__principal kb-titulo-link" :to="`/base-conocimiento/${fila.id}`" @click.stop>{{ fila.titulo }}</RouterLink>
              </div>
            </div>
            <div v-for="col in enTarjeta.sec" :key="col.clave" class="tarjeta-fila__sec">
              <span class="fecha-cell" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
            </div>
            <div v-if="enTarjeta.pie.length" class="tarjeta-fila__pie">
              <BadgeEstado tipo="kb_estado" :valor="fila.estado" />
              <span class="kb-feedback">
                <span title="Le sirvió"><i class="ti ti-thumb-up" aria-hidden="true"></i> {{ fila.util_si }}</span>
                <span title="No le sirvió"><i class="ti ti-thumb-down" aria-hidden="true"></i> {{ fila.util_no }}</span>
              </span>
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
                @change="store.cambiarTamPagina(Number($event.target.value))"
              >
                <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ total }} artículos</span>
          </div>

          <div v-if="totalPaginas > 1" class="paginacion__lado">
            <label class="paginacion__campo">
              <span class="sr-only">Ir a la página</span>
              <select class="paginacion__select" :value="store.pagina" @change="irA(Number($event.target.value))">
                <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
              </select>
              <span>de {{ totalPaginas }}</span>
            </label>
            <button class="paginacion__flecha" type="button" :disabled="store.pagina <= 1" aria-label="Página anterior" @click="irA(store.pagina - 1)">
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <button class="paginacion__flecha" type="button" :disabled="store.pagina >= totalPaginas" aria-label="Página siguiente" @click="irA(store.pagina + 1)">
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
        </template>
      </div>
    </main>

    <KbArticuloForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>


