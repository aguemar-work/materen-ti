<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useProblemasStore } from '../../stores/problemas.js';
import { insforgeApi } from '../../api/insforge.js';
import { OPCIONES_ESTADO_PROBLEMA, OPCIONES_SEVERIDAD_PROBLEMA, estadoProblemaInfo } from '../../core/dominio-problemas.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import ProblemaForm from './ProblemaForm.vue';
import SeveridadProblema from './SeveridadProblema.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';

const router = useRouter();
const store = useProblemasStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const { esMovil } = useEsMovil();

// Orden en la forma que espera AppTable (1 asc | -1 desc | null), derivada
// de la `orden` del store — mismo puente que EmpleadosView.
const sortFieldTabla = computed(() => orden.value?.columna || null);
const sortOrderTabla = computed(() => {
  if (!orden.value) return null;
  return orden.value.direccion === 'desc' ? -1 : 1;
});

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });
const filtroEstado = ref('');
const filtroSeveridad = ref('');
const mostrarForm = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => Object.fromEntries(staffLista.value.map((s) => [s.user_id, s.nombre])));

// Estado como segmentado (rediseño 2026-09-23): son 4 estados del ciclo de
// vida y se leen de un vistazo; '' = todos, mismo valor que la opción
// "Todos los estados" del select anterior.
const ESTADOS_SEGMENTO = [
  ...OPCIONES_ESTADO_PROBLEMA.map((e) => ({ valor: e.valor, label: e.label })),
  { valor: '', label: 'Todos' },
];

const hayFiltros = computed(() => !!(busqueda.value || filtroEstado.value || filtroSeveridad.value));

const subtitulo = computed(() => {
  const base = `${total.value} ${total.value === 1 ? 'problema' : 'problemas'}`;
  const estado = filtroEstado.value ? ` en estado ${estadoProblemaInfo(filtroEstado.value).label.toLowerCase()}` : '';
  return `${base}${estado} · causa raíz y acciones correctivas de incidentes recurrentes`;
});

watch(
  [filtroEstado, filtroSeveridad],
  ([estado, severidad]) => store.aplicarFiltros({ estado, severidad }),
);

function limpiarFiltros() {
  busqueda.value = '';
  filtroEstado.value = '';
  filtroSeveridad.value = '';
}

function verProblema(problema) {
  router.push(`/problemas/${problema.id}`);
}

function nombreResponsable(fila) {
  return fila.responsable_id ? staffPorId.value[fila.responsable_id] || 'Staff' : '';
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
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Problemas" :subtitulo="subtitulo">
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nuevo problema" @click="mostrarForm = true" />
      </template>
    </AppEncabezado>

    <!-- ══ Barra de filtros ═══════════════════════════════════════ -->
    <div class="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6">
      <AppBuscador v-model="busqueda" label="Buscar problemas" placeholder="Buscar por título" />
      <AppSegmentado v-model="filtroEstado" :opciones="ESTADOS_SEGMENTO" label="Filtrar por estado" />
      <AppSelect v-model="filtroSeveridad" label="Filtrar por severidad">
        <option value="">Todas las severidades</option>
        <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
      </AppSelect>
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
    </div>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && total === 0"
        icono="ti ti-alert-hexagon"
        :titulo="hayFiltros ? 'Sin resultados' : 'Sin problemas registrados'"
        :mensaje="hayFiltros ? 'No hay problemas con los filtros aplicados.' : 'Registre el primer problema con su causa raíz y sus acciones correctivas.'"
      >
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
        <AppButton v-else variant="outline" severity="secondary" icon="ti ti-plus" label="Registrar problema" @click="mostrarForm = true" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando problemas…</p>

        <!-- ── Tabla (escritorio): la fila abre el detalle ── -->
        <div
          v-if="!esMovil"
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
        >
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="lista"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :sort-field="sortFieldTabla"
              :sort-order="sortOrderTabla"
              :row-class="() => 'cursor-pointer'"
              aria-label="Problemas"
              @ordenar="store.ordenarPor"
              @row-click="({ data }) => verProblema(data)"
            >
              <AppColumn field="titulo" header="Problema" sortable>
                <template #body="{ data: fila }">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base text-gray-500">
                      <i class="ti ti-alert-hexagon" aria-hidden="true"></i>
                    </span>
                    <RouterLink
                      class="min-w-0 truncate font-medium text-gray-900 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                      :to="`/problemas/${fila.id}`"
                      @click.stop
                    >{{ fila.titulo }}</RouterLink>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="severidad" header="Severidad">
                <template #body="{ data: fila }">
                  <SeveridadProblema :valor="fila.severidad" />
                </template>
              </AppColumn>

              <AppColumn field="estado" header="Estado" sortable>
                <template #body="{ data: fila }">
                  <BadgeEstado tipo="problema_estado" :valor="fila.estado" />
                </template>
              </AppColumn>

              <AppColumn field="responsable" header="Responsable">
                <template #body="{ data: fila }">
                  <div v-if="fila.responsable_id" class="flex min-w-0 items-center gap-2">
                    <AppAvatar :nombre="nombreResponsable(fila)" />
                    <span class="truncate text-gray-900">{{ nombreResponsable(fila) }}</span>
                  </div>
                  <span v-else class="text-gray-500">Sin asignar</span>
                </template>
              </AppColumn>

              <AppColumn field="updated_at" header="Actualizado" sortable>
                <template #body="{ data: fila }">
                  <span class="whitespace-nowrap text-gray-600 tabular-nums" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
                </template>
              </AppColumn>
            </AppTable>
          </div>

          <AppPaginacion
            v-if="!cargando && total > 0"
            :pagina="store.pagina"
            :tam-pagina="store.tamPagina"
            :total="total"
            @update:pagina="store.irAPagina"
            @update:tam-pagina="store.cambiarTamPagina"
          />
        </div>

        <!-- ── Tarjetas (móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando problemas...</p>
          <ul v-else class="grid gap-3 sm:grid-cols-2" aria-label="Problemas">
            <li
              v-for="fila in lista"
              :key="fila.id"
              class="flex cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              tabindex="0"
              @keydown.enter.self="verProblema(fila)"
              @click="verProblema(fila)"
            >
              <div class="flex items-start justify-between gap-3">
                <RouterLink
                  class="min-w-0 font-medium text-gray-900 hover:text-primary-700"
                  :to="`/problemas/${fila.id}`"
                  @click.stop
                >{{ fila.titulo }}</RouterLink>
                <BadgeEstado tipo="problema_estado" :valor="fila.estado" />
              </div>
              <p class="mt-2 text-sm" :class="fila.responsable_id ? 'text-gray-600' : 'text-gray-500'">
                {{ fila.responsable_id ? nombreResponsable(fila) : 'Sin asignar' }}
              </p>
              <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <SeveridadProblema :valor="fila.severidad" />
                <span class="text-xs text-gray-500 tabular-nums" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
              </div>
            </li>
          </ul>
          <AppPaginacion
            v-if="!cargando"
            variante="compacta"
            :pagina="store.pagina"
            :tam-pagina="store.tamPagina"
            :total="total"
            @update:pagina="store.irAPagina"
          />
        </div>
      </template>
    </div>

    <ProblemaForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>
