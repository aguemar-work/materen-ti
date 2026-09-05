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
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
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

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

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
        <CarbonButton variante="primary" icono="ti-plus" @click="mostrarForm = true">Nuevo problema</CarbonButton>
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

        <CarbonDataTable
          :columnas="columnas"
          :filas="lista"
          :cargando="cargando"
          :orden-por="ordenColumna"
          :orden-dir="ordenDireccion"
          :clase-fila="claseFilaProblema"
          etiqueta="Problemas"
          vacio-icono="ti ti-alert-hexagon"
          vacio-titulo="Sin problemas"
          :vacio-mensaje="busqueda || filtroEstado || filtroSeveridad ? 'No hay resultados con los filtros aplicados.' : 'Registra el primer problema con causa raíz y acciones correctivas.'"
          @ordenar="store.ordenarPor"
          @clic-fila="verProblema"
        >
          <template #celda-severidad="{ fila }">
            <span class="severidad-ind" :class="claseSeveridad(fila.severidad)">
              {{ severidadProblemaInfo(fila.severidad).label }}
            </span>
          </template>
          <template #celda-titulo="{ fila }">
            <RouterLink class="problema-titulo-link" :to="`/problemas/${fila.id}`" @click.stop>{{ fila.titulo }}</RouterLink>
          </template>
          <template #celda-estado="{ fila }">
            <BadgeEstado tipo="problema_estado" :valor="fila.estado" />
          </template>
          <template #celda-responsable="{ fila }">
            <span v-if="fila.responsable_id">{{ staffPorId[fila.responsable_id] || 'Staff' }}</span>
            <TextoVacio v-else placeholder="Sin asignar" />
          </template>
          <template #celda-updated_at="{ fila }">
            <span class="fecha-cell" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
          </template>
          <template #vacio-accion>
            <CarbonButton v-if="!busqueda && !filtroEstado && !filtroSeveridad" variante="secondary" icono="ti-plus" @click="mostrarForm = true">Nuevo problema</CarbonButton>
          </template>
        </CarbonDataTable>

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="total"
          :tam-pagina="store.tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="problemas"
          @update:tam-pagina="store.cambiarTamPagina"
        />
        </template>
      </div>
    </main>

    <ProblemaForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>

<style scoped>
.problemas-error { color: var(--color-danger); }

/* :deep porque CarbonDataTable pinta el <tr>/<li> en su propio scope; el
   hover en sí ya lo cubre main.css para toda tabla, esto solo agrega el
   cursor de "fila clicable" que main.css no asume por defecto. */
:deep(.fila-problema) { cursor: pointer; }

.problema-titulo-link {
  /* Peso 400, no 600 (pasada de diseño de tablas ago 2026): pisaba la
     regla global "ningún dato de tabla en negrita" — bug real, no una
     excepción a propósito. */
  color: var(--color-text-primary);
  text-decoration: none;
}
.problema-titulo-link:hover,
.problema-titulo-link:focus-visible {
  text-decoration: underline;
}

.fecha-cell { white-space: nowrap; }

/* Indicador de Severidad: punto + texto, mismo mecanismo visual que
   IndicadorPrioridad.vue (componentes/shared, Tickets) pero LOCAL a este
   archivo — Severidad es un dato de dominio propio de Problemas, no vale
   generalizar el componente de Tickets para esto. El punto es decorativo
   (::before, fuera del árbol de accesibilidad): el texto siempre está al
   lado, el color nunca es el único portador del significado (WCAG 1.4.1). */
.severidad-ind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-size: var(--fs-body-01);
  color: var(--color-text-tertiary);
}

.severidad-ind::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-border-strong);
  flex-shrink: 0;
}

/* alta conserva el mismo púrpura que ya tenía el badge (SEVERIDADES_PROBLEMA);
   crítica conserva el mismo rojo — el vocabulario de color no cambia. */
.severidad-ind--alta {
  color: var(--color-text-secondary);
}
.severidad-ind--alta::before {
  background: var(--color-purple-text);
}

.severidad-ind--critica {
  color: var(--color-danger-text);
}
.severidad-ind--critica::before {
  background: var(--color-danger-text);
}
</style>
