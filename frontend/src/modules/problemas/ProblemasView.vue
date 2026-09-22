<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useProblemasStore } from '../../stores/problemas.js';
import { insforgeApi } from '../../api/insforge.js';
import { OPCIONES_ESTADO_PROBLEMA, OPCIONES_SEVERIDAD_PROBLEMA, severidadProblemaInfo } from '../../core/dominio-problemas.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import ProblemaForm from './ProblemaForm.vue';
import { columnasVisibles, estiloColumna, agruparParaTarjeta } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const router = useRouter();
const store = useProblemasStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });
const filtroEstado = ref('');
const filtroSeveridad = ref('');
const mostrarForm = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => Object.fromEntries(staffLista.value.map((s) => [s.user_id, s.nombre])));

watch(
  [filtroEstado, filtroSeveridad],
  ([estado, severidad]) => store.aplicarFiltros({ estado, severidad }),
);

function verProblema(problema) {
  router.push(`/problemas/${problema.id}`);
}

// Severidad como punto+texto, no badge (pasada de diseño de tablas ago
// 2026) — mismo criterio que IndicadorPrioridad.vue en Tickets: Severidad
// es un dato de triage, no un estado, y competía como 2ª píldora de color
// junto a Estado en la misma fila. baja/media (el caso mayoritario, no
// piden atención) quedan sin color; alta/crítica sí se pintan, cada una
// con el MISMO color que ya tenía su badge (`SEVERIDADES_PROBLEMA`,
// dominio-problemas.js: alta→purple, crítica→danger) — el vocabulario de
// color no cambia, cambia el envase. No se generaliza IndicadorPrioridad.vue:
// es específico de Tickets (`prioridadInfo`), esto usa su propia función.
const SEVERIDAD_COLOREADA = new Set(['alta', 'critica']);
function claseSeveridad(valor) {
  return SEVERIDAD_COLOREADA.has(valor) ? `severidad-ind--${valor}` : '';
}

// Definición de columnas de CarbonDataTable: paginación y orden son de
// servidor (store.ordenarPor), el @ordenar de la tabla se cablea directo a
// eso. "Título" es la elástica.
const columnas = [
  { clave: 'severidad', label: 'Severidad', movil: 'pie' },
  { clave: 'titulo', label: 'Título', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'estado', label: 'Estado', ordenable: true, movil: 'pie' },
  { clave: 'responsable', label: 'Responsable', movil: 'sec' },
  { clave: 'updated_at', label: 'Actualizado', ordenable: true, num: true, movil: 'sec' },
];

const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);
const enTarjeta = computed(() => agruparParaTarjeta(columnasVisiblesLista.value));

const totalPaginas = computed(() => totalPaginasDe(total.value, store.tamPagina));
const paginas = computed(() => paginasDe(totalPaginas.value));
const rango = computed(() => rangoDe(store.pagina, store.tamPagina, total.value));

function irA(pagina) {
  const destino = clampPagina(pagina, totalPaginas.value);
  if (destino !== store.pagina) store.irAPagina(destino);
}

function claseFilaProblema() {
  return 'fila-problema tarjeta-fila--clic';
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
    const [, staff] = await Promise.all([store.cargar(), insforgeApi.nombresStaff()]);
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
        <button type="button" class="btn btn--primary" @click="mostrarForm = true">
          Nuevo problema
          <i class="ti ti-plus" aria-hidden="true"></i>
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
          <div class="filter-field">
            <label for="filtro-estado">Estado</label>
            <select id="filtro-estado" v-model="filtroEstado">
              <option value="">Todos los estados</option>
              <option v-for="e in OPCIONES_ESTADO_PROBLEMA" :key="e.valor" :value="e.valor">{{ e.label }}</option>
            </select>
          </div>
          <div class="filter-field">
            <label for="filtro-severidad">Severidad</label>
            <select id="filtro-severidad" v-model="filtroSeveridad">
              <option value="">Todas las severidades</option>
              <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
            </select>
          </div>
        </div>

        <div v-if="error" class="no-results problemas-error">{{ error }}</div>

        <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando problemas…</p>

        <div class="table-wrap">
          <table class="tabla" aria-label="Problemas">
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
                    icono="ti ti-alert-hexagon"
                    titulo="Sin problemas"
                    :mensaje="busqueda || filtroEstado || filtroSeveridad ? 'No hay resultados con los filtros aplicados.' : 'Registra el primer problema con causa raíz y acciones correctivas.'"
                  >
                    <button v-if="!busqueda && !filtroEstado && !filtroSeveridad" type="button" class="btn btn--secondary" @click="mostrarForm = true">
                      Nuevo problema
                      <i class="ti ti-plus" aria-hidden="true"></i>
                    </button>
                  </EmptyState>
                </td>
              </tr>
              <template v-else>
                <tr
                  v-for="fila in lista"
                  :key="fila.id"
                  :class="claseFilaProblema()"
                  @click="verProblema(fila)"
                >
                  <td>
                    <span class="severidad-ind" :class="claseSeveridad(fila.severidad)">
                      {{ severidadProblemaInfo(fila.severidad).label }}
                    </span>
                  </td>
                  <td>
                    <RouterLink class="problema-titulo-link" :to="`/problemas/${fila.id}`" @click.stop>{{ fila.titulo }}</RouterLink>
                  </td>
                  <td>
                    <BadgeEstado tipo="problema_estado" :valor="fila.estado" />
                  </td>
                  <td>
                    <span v-if="fila.responsable_id">{{ staffPorId[fila.responsable_id] || 'Staff' }}</span>
                    <TextoVacio v-else placeholder="Sin asignar" />
                  </td>
                  <td class="col-num">
                    <span class="fecha-cell" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul v-if="!cargando && lista.length" class="lista-tarjetas solo-movil" aria-label="Problemas">
          <li
            v-for="fila in lista"
            :key="fila.id"
            class="tarjeta-fila"
            :class="claseFilaProblema()"
            @click="verProblema(fila)"
          >
            <div class="tarjeta-fila__principal">
              <RouterLink class="problema-titulo-link" :to="`/problemas/${fila.id}`" @click.stop>{{ fila.titulo }}</RouterLink>
            </div>
            <div v-if="enTarjeta.sec.length" class="tarjeta-fila__sec">
              <span v-if="fila.responsable_id">{{ staffPorId[fila.responsable_id] || 'Staff' }}</span>
              <TextoVacio v-else placeholder="Sin asignar" />
              <span class="fecha-cell" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
            </div>
            <div class="tarjeta-fila__pie">
              <span class="severidad-ind" :class="claseSeveridad(fila.severidad)">
                {{ severidadProblemaInfo(fila.severidad).label }}
              </span>
              <BadgeEstado tipo="problema_estado" :valor="fila.estado" />
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
            <span class="paginacion__rango">{{ rango.desde }}–{{ rango.hasta }} de {{ total }} problemas</span>
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

    <ProblemaForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>


