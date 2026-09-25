<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useProblemasStore } from '../../stores/problemas.js';
import { insforgeApi } from '../../api/insforge.js';
import { OPCIONES_SEVERIDAD_PROBLEMA, ESTADOS_PROBLEMA_ABIERTOS, estadoProblemaInfo } from '../../core/dominio-problemas.js';
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
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';

const router = useRouter();
const store = useProblemasStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const { esMovil } = useEsMovil();

const mostrarForm = ref(false);
const staffLista = ref([]);

const staffPorId = computed(() => Object.fromEntries(staffLista.value.map((s) => [s.user_id, s.nombre])));

// ── Filtros V2: vistas + chips + URL (2026-09-25, SISTEMA-DISENO §3.2.1) ──
// VISTA = la pregunta del día: ¿qué sigue abierto? (por defecto) · ¿qué se
// cerró? · todo. La etapa del ciclo (abierto/diagnóstico/acciones) pasa a
// ser un chip que refina "Abiertos" — en "Cerrados" no se ofrece.
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  vista: { tipo: 'valor', defecto: 'abiertos' },
  q: { tipo: 'texto' },
  etapa: { tipo: 'lista' },
  severidad: { tipo: 'lista' },
  responsable: { tipo: 'lista' },
});
const CLAVES_FILTRO = ['q', 'etapa', 'severidad', 'responsable'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

// Cambiar a "Cerrados" poda el chip Etapa (nunca una combinación imposible).
watch(() => filtros.vista, (vista) => {
  if (vista === 'cerrados' && filtros.etapa.length) filtros.etapa = [];
}, { immediate: true });

const filtrosSinVista = computed(() => ({
  q: filtros.q, severidades: filtros.severidad, responsables: filtros.responsable,
}));
const filtrosServidor = computed(() => {
  let estados = filtros.etapa;
  if (filtros.vista === 'cerrados') estados = ['cerrado'];
  else if (filtros.vista === 'abiertos' && !estados.length) estados = ESTADOS_PROBLEMA_ABIERTOS;
  return { ...filtrosSinVista.value, estados };
});

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosProblemasPorVista({ ...filtrosSinVista.value, etapas: filtros.etapa });
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}
const VISTAS = computed(() => [
  { valor: 'abiertos', label: 'Abiertos', conteo: conteos.value?.abiertos, titulo: 'Abiertos, en diagnóstico o con acciones en curso' },
  { valor: 'cerrados', label: 'Cerrados', conteo: conteos.value?.cerrados },
  { valor: 'todos', label: 'Todos', conteo: conteos.value?.todos },
]);

const DIMENSIONES = computed(() => [
  ...(filtros.vista === 'cerrados' ? [] : [{
    id: 'etapa', label: 'Etapa', icono: 'ti ti-progress',
    opciones: ESTADOS_PROBLEMA_ABIERTOS.map((e) => ({ valor: e, label: estadoProblemaInfo(e).label })),
  }]),
  { id: 'severidad', label: 'Severidad', icono: 'ti ti-flag', opciones: [...OPCIONES_SEVERIDAD_PROBLEMA].reverse() },
  {
    id: 'responsable', label: 'Responsable', icono: 'ti ti-user',
    opciones: [{ valor: 'sin', label: 'Sin responsable' }, ...staffLista.value.map((s) => ({ valor: s.user_id, label: s.nombre }))],
  },
]);
const chips = computed({
  get: () => Object.fromEntries(DIMENSIONES.value.map((d) => [d.id, filtros[d.id]])),
  set: (v) => { for (const k of Object.keys(v)) filtros[k] = v[k]; },
});

const FRASE_VISTA = { abiertos: ' abiertos', cerrados: ' cerrados', todos: '' };
const subtitulo = computed(() => {
  const n = total.value;
  const base = `${n} ${n === 1 ? 'problema' : 'problemas'}${FRASE_VISTA[filtros.vista] ?? ''}`;
  return `${base}${hayFiltros.value ? ', con los filtros aplicados' : ''} · causa raíz y acciones correctivas de incidentes recurrentes`;
});

// "Abiertos: 0" sin filtros es una buena noticia, no "Sin problemas registrados".
const vistaVacia = computed(() => !hayFiltros.value && filtros.vista !== 'todos' && conteos.value?.todos > 0);

watch(filtrosServidor, (f) => { store.aplicarFiltros(f).catch(() => {}); }, { deep: true });
watch([filtrosSinVista, () => filtros.etapa], refrescarConteos, { deep: true });

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
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
  refrescarConteos();
  try {
    const [, staff] = await Promise.all([store.aplicarFiltros(filtrosServidor.value), insforgeApi.nombresStaff()]);
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

    <!-- ══ Vistas + barra de filtros (SISTEMA-DISENO §3.2.1) ══════ -->
    <AppVistas v-model="filtros.vista" :opciones="VISTAS" label="Vista de problemas" />
    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar problemas" placeholder="Buscar por título" />
      <AppFiltros v-model="chips" :dimensiones="DIMENSIONES" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
    </AppBarraFiltros>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && total === 0"
        icono="ti ti-alert-hexagon"
        :titulo="hayFiltros ? 'Sin resultados' : vistaVacia ? (filtros.vista === 'abiertos' ? 'Nada abierto' : 'Sin problemas cerrados') : 'Sin problemas registrados'"
        :mensaje="hayFiltros ? 'No hay problemas con los filtros aplicados.' : vistaVacia ? 'Las demás pestañas muestran el resto de los problemas.' : 'Registre el primer problema con su causa raíz y sus acciones correctivas.'"
      >
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
        <AppButton v-else-if="!vistaVacia" variant="outline" severity="secondary" icon="ti ti-plus" label="Registrar problema" @click="mostrarForm = true" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando problemas…</p>

        <!-- ── Tabla (escritorio): la fila abre el detalle ── -->
        <AppMarcoTabla v-if="!esMovil">
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="lista"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :orden="orden"
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
        </AppMarcoTabla>

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
