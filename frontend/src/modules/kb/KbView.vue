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
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { useAuthStore } from '../../stores/auth.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';

const router = useRouter();
const store = useKbStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const { esMovil } = useEsMovil();

const auth = useAuthStore();
const mostrarForm = ref(false);

// ── Filtros V2: vistas + chips + URL (2026-09-25, SISTEMA-DISENO §3.2.1) ──
// Estado del artículo = VISTA (pestañas con conteo); categoría y autor, chips.
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  estado: { tipo: 'valor', defecto: '' },
  q: { tipo: 'texto' },
  categoria: { tipo: 'lista' },
  autor: { tipo: 'lista' },
});
const CLAVES_FILTRO = ['q', 'categoria', 'autor'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));
const filtrosSinVista = computed(() => ({ q: filtros.q, categoriaIds: filtros.categoria, autorIds: filtros.autor }));
const filtrosServidor = computed(() => ({ ...filtrosSinVista.value, estado: filtros.estado }));

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosKbPorEstado(filtrosSinVista.value);
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}
// Orden de lectura: lo que se consulta (publicados) primero.
const VISTAS = computed(() => [
  { valor: '', label: 'Todos', conteo: conteos.value?.todos },
  { valor: 'publicado', label: 'Publicados', conteo: conteos.value?.publicado },
  { valor: 'en_revision', label: 'En revisión', conteo: conteos.value?.en_revision },
  { valor: 'borrador', label: 'Borradores', conteo: conteos.value?.borrador },
  { valor: 'obsoleto', label: 'Obsoletos', conteo: conteos.value?.obsoleto },
]);

const categorias = ref([]);
const staff = ref([]);
const DIMENSIONES = computed(() => {
  const yo = auth.user?.id;
  const autores = [
    ...staff.value.filter((s) => s.user_id === yo).map((s) => ({ valor: s.user_id, label: `${s.nombre} (usted)` })),
    ...staff.value.filter((s) => s.user_id !== yo).map((s) => ({ valor: s.user_id, label: s.nombre })),
  ];
  return [
    { id: 'categoria', label: 'Categoría', icono: 'ti ti-category', opciones: categorias.value.map((c) => ({ valor: c.id, label: c.nombre })) },
    { id: 'autor', label: 'Autor', icono: 'ti ti-user-edit', opciones: autores },
  ];
});
const chips = computed({
  get: () => ({ categoria: filtros.categoria, autor: filtros.autor }),
  set: (v) => { filtros.categoria = v.categoria; filtros.autor = v.autor; },
});

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

watch(filtrosServidor, (f) => { store.aplicarFiltros(f).catch(() => {}); }, { deep: true });
watch(filtrosSinVista, refrescarConteos, { deep: true });

function verArticulo(articulo) {
  router.push(`/base-conocimiento/${articulo.id}`);
}

const subtitulo = computed(() => {
  const n = total.value;
  const base = `${n} ${n === 1 ? 'artículo' : 'artículos'}`;
  const est = OPCIONES_ESTADO_KB.find((e) => e.valor === filtros.estado);
  const detalle = `${est ? ` en estado ${est.label.toLowerCase()}` : ''}${hayFiltros.value ? ', con los filtros aplicados' : ''}`;
  return `${base}${detalle} · soluciones reutilizables para tickets recurrentes`;
});

// Una vista vacía con artículos en otras pestañas no es "Sin artículos todavía".
const vistaVacia = computed(() => !hayFiltros.value && !!filtros.estado && conteos.value?.todos > 0);

function onFormCerrado(creado) {
  mostrarForm.value = false;
  if (creado) {
    showToast('Artículo creado en borrador');
    router.push(`/base-conocimiento/${creado.id}`);
  }
}

onMounted(async () => {
  store.resetearFiltros();
  refrescarConteos();
  insforgeApi.nombresStaff().then((s) => { staff.value = s; }).catch(() => {});
  try {
    const [, cats] = await Promise.all([store.aplicarFiltros(filtrosServidor.value), insforgeApi.listCategoriasTicket()]);
    categorias.value = cats;
  } catch {
    showToast(error.value || 'Error al cargar la base de conocimiento', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Base de conocimiento" :subtitulo="subtitulo">
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nuevo artículo" @click="mostrarForm = true" />
      </template>
    </AppEncabezado>

    <!-- ══ Vistas + barra de filtros (SISTEMA-DISENO §3.2.1) ══════ -->
    <AppVistas v-model="filtros.estado" :opciones="VISTAS" label="Vista de artículos" />
    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar artículos" placeholder="Buscar por título o síntoma" />
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
        icono="ti ti-books"
        :titulo="hayFiltros ? 'Sin resultados' : vistaVacia ? 'Sin artículos en esta vista' : 'Sin artículos todavía'"
        :mensaje="hayFiltros ? 'No hay artículos con los filtros aplicados.' : vistaVacia ? 'Las demás pestañas muestran el resto de la base de conocimiento.' : 'Registre la primera solución reutilizable de la base de conocimiento.'"
      >
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
        <AppButton v-else-if="!vistaVacia" variant="outline" severity="secondary" icon="ti ti-plus" label="Nuevo artículo" @click="mostrarForm = true" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando artículos…</p>

        <!-- ── Tabla (escritorio): la fila abre el artículo ── -->
        <AppMarcoTabla v-if="!esMovil">
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="lista"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :orden="orden"
              :row-class="() => 'cursor-pointer'"
              aria-label="Artículos de la base de conocimiento"
              @ordenar="store.ordenarPor"
              @row-click="({ data }) => verArticulo(data)"
            >
              <AppColumn field="titulo" header="Artículo" sortable>
                <template #body="{ data: fila }">
                  <div class="flex min-w-0 items-start gap-3">
                    <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base text-gray-500">
                      <i class="ti ti-file-text" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0">
                      <!-- Enlace real (además del clic de fila) para Ctrl/Cmd-clic
                           y "abrir en pestaña nueva". -->
                      <RouterLink
                        :to="`/base-conocimiento/${fila.id}`"
                        class="line-clamp-2 font-medium text-gray-900 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        @click.stop
                      >{{ fila.titulo }}</RouterLink>
                      <div v-if="fila.categoria_nombre || fila.sintoma" class="mt-0.5 truncate text-xs text-gray-500">
                        <span v-if="fila.categoria_nombre" class="font-medium text-gray-600">{{ fila.categoria_nombre }}</span>
                        <template v-if="fila.categoria_nombre && fila.sintoma"> · </template>
                        <template v-if="fila.sintoma">{{ fila.sintoma }}</template>
                      </div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="estado" header="Estado" sortable>
                <template #body="{ data: fila }">
                  <BadgeEstado tipo="kb_estado" :valor="fila.estado" />
                </template>
              </AppColumn>

              <AppColumn field="feedback" header="¿Sirvió?">
                <template #body="{ data: fila }">
                  <div class="flex items-center gap-4 text-sm tabular-nums">
                    <span
                      class="inline-flex items-center gap-1"
                      :class="fila.util_si ? 'text-green-700' : 'text-gray-300'"
                      :title="`${fila.util_si} le sirvió`"
                      :aria-label="`${fila.util_si} le sirvió`"
                    ><i class="ti ti-thumb-up" aria-hidden="true"></i>{{ fila.util_si }}</span>
                    <span
                      class="inline-flex items-center gap-1"
                      :class="fila.util_no ? 'text-red-700' : 'text-gray-300'"
                      :title="`${fila.util_no} no le sirvió`"
                      :aria-label="`${fila.util_no} no le sirvió`"
                    ><i class="ti ti-thumb-down" aria-hidden="true"></i>{{ fila.util_no }}</span>
                  </div>
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

        <!-- ── Lista (móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando artículos...</p>
          <ul v-else class="grid grid-cols-1 gap-3" aria-label="Artículos de la base de conocimiento">
            <li
              v-for="fila in lista"
              :key="fila.id"
              class="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300"
              @click="verArticulo(fila)"
            >
              <div v-if="fila.categoria_nombre || fila.sintoma" class="truncate text-xs text-gray-500">
                <span v-if="fila.categoria_nombre" class="font-medium text-gray-600">{{ fila.categoria_nombre }}</span>
                <template v-if="fila.categoria_nombre && fila.sintoma"> · </template>
                <template v-if="fila.sintoma">{{ fila.sintoma }}</template>
              </div>
              <RouterLink
                :to="`/base-conocimiento/${fila.id}`"
                class="mt-1 line-clamp-2 block font-medium text-gray-900"
                @click.stop
              >{{ fila.titulo }}</RouterLink>
              <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                <BadgeEstado tipo="kb_estado" :valor="fila.estado" />
                <div class="flex items-center gap-3 text-xs tabular-nums">
                  <span :class="fila.util_si ? 'text-green-700' : 'text-gray-300'" :aria-label="`${fila.util_si} le sirvió`"><i class="ti ti-thumb-up" aria-hidden="true"></i> {{ fila.util_si }}</span>
                  <span :class="fila.util_no ? 'text-red-700' : 'text-gray-300'" :aria-label="`${fila.util_no} no le sirvió`"><i class="ti ti-thumb-down" aria-hidden="true"></i> {{ fila.util_no }}</span>
                  <span class="text-gray-500" :title="formatFechaHora(fila.updated_at)">{{ formatAntiguedad(fila.updated_at) }}</span>
                </div>
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

    <KbArticuloForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>
