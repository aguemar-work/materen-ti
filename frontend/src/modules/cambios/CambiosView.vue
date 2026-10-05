<script setup>
// Cambios (migración 107): registro de cambios en producción — estándar, normal
// y emergencia — con su aprobación. Listado V2 (receta 4.1): vistas con conteo,
// buscador, chips de tipo y servicio, tabla de libro con el código como primera
// columna y la URL como fuente de verdad
// (`/cambios?vista=por_aprobar&tipo=emergencia&servicio=vpn&q=router`).
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter, RouterLink } from 'vue-router';
import { useCambiosStore } from '../../stores/cambios.js';
import { useServiciosStore } from '../../stores/catalogos.js';
import { insforgeApi } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';
import {
  ESTADOS_DE_VISTA, ETIQUETAS_VISTA, VISTA_CAMBIO_DEFECTO, OPCIONES_TIPO_CAMBIO,
  estadosDeVista, plazoAprobacion, fechaVentana, emergenciaSinAprobar,
} from '../../core/dominio-cambios.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import CambiosResumen from './CambiosResumen.vue';
import CambioForm from './CambioForm.vue';

const router = useRouter();
const store = useCambiosStore();
const servicios = useServiciosStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);

// ── Filtros V2: vistas + chips + URL ─────────────────────────────────────
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  vista: { tipo: 'valor', defecto: VISTA_CAMBIO_DEFECTO },
  q: { tipo: 'texto' },
  tipo: { tipo: 'lista' },
  servicio: { tipo: 'lista' },
});
const CLAVES_FILTRO = ['q', 'tipo', 'servicio'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

const filtrosSinVista = computed(() => ({ q: filtros.q, tipos: filtros.tipo, servicios: filtros.servicio }));
const filtrosServidor = computed(() => ({ ...filtrosSinVista.value, estados: estadosDeVista(filtros.vista) }));

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosCambiosPorVista(filtrosSinVista.value);
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}

const VISTAS = computed(() => Object.keys(ESTADOS_DE_VISTA).map((valor) => ({
  valor,
  label: ETIQUETAS_VISTA[valor],
  conteo: conteos.value?.[valor],
  titulo: valor === 'por_aprobar' ? 'Esperan la decisión de un jefe' : undefined,
})));

const DIMENSIONES = computed(() => [
  { id: 'tipo', label: 'Tipo', icono: 'ti ti-category', opciones: OPCIONES_TIPO_CAMBIO },
  { id: 'servicio', label: 'Servicio', icono: 'ti ti-server', opciones: servicios.lista.map((s) => ({ valor: s.id, label: s.nombre })) },
]);
const chips = computed({
  get: () => ({ tipo: filtros.tipo, servicio: filtros.servicio }),
  set: (v) => { filtros.tipo = v.tipo; filtros.servicio = v.servicio; },
});

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

watch(filtrosServidor, (f) => store.aplicarFiltros(f), { deep: true });
watch(filtrosSinVista, refrescarConteos, { deep: true });

const { esMovil } = useEsMovil();

// ── Filas ───────────────────────────────────────────────────────────────
const filas = computed(() => lista.value.map((c) => {
  const plazo = emergenciaSinAprobar(c) ? plazoAprobacion(c) : null;
  return { ...c, ventanaTexto: fechaVentana(c), plazo };
}));

const vistaVacia = computed(() => {
  if (filtros.vista === 'todos' || !(conteos.value?.todos > 0)) return null;
  const nombre = ETIQUETAS_VISTA[filtros.vista]?.toLowerCase();
  return { titulo: `Sin cambios en «${nombre}»`, mensaje: 'No hay nada en esta vista. Las demás pestañas muestran el resto de los cambios.' };
});

function abrir(cambio) {
  router.push(`/cambios/${cambio.id}`);
}

// ── Indicadores (vistas security_invoker; opcionales) ───────────────────
const kpi = ref([]);
const vencidas = ref([]);
async function cargarResumen() {
  const [k, v] = await Promise.allSettled([insforgeApi.kpiCambios(), insforgeApi.cambiosAprobacionVencida()]);
  kpi.value = k.status === 'fulfilled' ? k.value : [];
  vencidas.value = v.status === 'fulfilled' ? v.value : [];
}

// ── Nuevo cambio ────────────────────────────────────────────────────────
const mostrarForm = ref(false);

function onFormCerrado(creado) {
  mostrarForm.value = false;
  if (!creado) return;
  showToast(`Cambio ${creado.codigo} registrado`);
  router.push(`/cambios/${creado.id}`);
}

onMounted(async () => {
  refrescarConteos();
  cargarResumen();
  servicios.cargar().catch(() => {});
  try {
    // Lo que se aplica es SIEMPRE lo que dice la URL (gotcha de resetearFiltros).
    store.resetearFiltros();
    await store.aplicarFiltros(filtrosServidor.value);
  } catch {
    showToast(error.value || 'Error al cargar cambios', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado
      titulo="Cambios"
      subtitulo="Cambios en producción y su aprobación"
    >
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nuevo cambio" @click="mostrarForm = true" />
      </template>
    </AppEncabezado>

    <AppVistas v-model="filtros.vista" :opciones="VISTAS" label="Vista de cambios" />

    <CambiosResumen :kpi="kpi" :vencidas="vencidas" />

    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar cambios" placeholder="Buscar por código o título" />
      <AppFiltros v-model="chips" :dimensiones="DIMENSIONES" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
    </AppBarraFiltros>

    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && total === 0"
        icono="ti ti-arrows-exchange"
        :titulo="hayFiltros ? 'Sin resultados' : vistaVacia ? vistaVacia.titulo : 'Sin cambios todavía'"
        :mensaje="hayFiltros ? 'No hay cambios con los filtros aplicados.' : vistaVacia ? vistaVacia.mensaje : 'Registre el primer cambio antes de tocar producción: queda con su plan de retroceso y quién lo aprobó.'"
      >
        <AppButton v-if="!hayFiltros && !vistaVacia" variant="outline" severity="secondary" icon="ti ti-plus" label="Nuevo cambio" @click="mostrarForm = true" />
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando cambios…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppMarcoTabla v-if="!esMovil">
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="filas"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :orden="orden"
              :row-class="() => 'cursor-pointer'"
              aria-label="Cambios"
              @ordenar="store.ordenarPor"
              @row-click="({ data }) => abrir(data)"
            >
              <AppColumn field="codigo" header="Código" sortable>
                <template #body="{ data: c }">
                  <RouterLink :to="`/cambios/${c.id}`" class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" @click.stop>
                    <AppCodigo :valor="c.codigo" titulo="Número de cambio" />
                  </RouterLink>
                </template>
              </AppColumn>

              <AppColumn field="titulo" header="Cambio">
                <template #body="{ data: c }">
                  <div class="min-w-0">
                    <div class="truncate font-medium text-gray-900">{{ c.titulo }}</div>
                    <div class="truncate text-xs text-gray-500">{{ c.servicio_nombre || 'Sin servicio' }}</div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="tipo" header="Tipo">
                <template #body="{ data: c }">
                  <BadgeEstado tipo="tipo_cambio" :valor="c.tipo" />
                </template>
              </AppColumn>

              <AppColumn field="riesgo" header="Riesgo">
                <template #body="{ data: c }">
                  <BadgeEstado tipo="riesgo_cambio" :valor="c.riesgo" />
                </template>
              </AppColumn>

              <AppColumn field="ventana_inicio" header="Ventana" sortable>
                <template #body="{ data: c }">
                  <span class="text-xs tabular-nums text-gray-500">{{ c.ventanaTexto || 'Sin ventana' }}</span>
                </template>
              </AppColumn>

              <!-- En las vistas de un solo estado repetiría la pestaña. -->
              <AppColumn v-if="!['por_aprobar', 'en_ejecucion'].includes(filtros.vista)" field="estado" header="Estado" sortable>
                <template #body="{ data: c }">
                  <div class="min-w-0">
                    <BadgeEstado tipo="cambio" :valor="c.estado" />
                    <div v-if="c.plazo" class="mt-0.5 text-xs" :class="c.plazo.vencida ? 'text-red-700' : 'text-gray-500'">Sin aprobar · {{ c.plazo.texto }}</div>
                  </div>
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

        <!-- ── Tarjetas (solo móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando cambios...</p>
          <ul v-else class="grid grid-cols-1 gap-3" aria-label="Cambios">
            <li
              v-for="c in filas"
              :key="c.id"
              class="flex cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              tabindex="0"
              @keydown.enter.self="abrir(c)"
              @click="abrir(c)"
            >
              <div class="flex items-baseline justify-between gap-3">
                <span class="text-sm text-primary-600"><AppCodigo :valor="c.codigo" titulo="Número de cambio" /></span>
                <BadgeEstado tipo="cambio" :valor="c.estado" />
              </div>
              <p class="mt-2 font-medium text-gray-900">{{ c.titulo }}</p>
              <p class="text-sm text-gray-600">{{ c.servicio_nombre || 'Sin servicio' }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <BadgeEstado tipo="tipo_cambio" :valor="c.tipo" />
                <BadgeEstado tipo="riesgo_cambio" :valor="c.riesgo" />
                <span class="text-xs tabular-nums text-gray-500">{{ c.ventanaTexto || 'Sin ventana' }}</span>
              </div>
              <p v-if="c.plazo" class="mt-1 text-xs" :class="c.plazo.vencida ? 'text-red-700' : 'text-gray-500'">Sin aprobar · {{ c.plazo.texto }}</p>
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

    <CambioForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>
