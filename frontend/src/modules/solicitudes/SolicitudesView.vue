<script setup>
// Solicitudes de servicio (migración 108): la cola de trámites con pasos —
// altas, bajas, cambios de puesto, accesos, equipos y licencias. Listado V2
// (receta 4.1): vistas por estado con conteo, buscador, chip de tipo, tabla de
// libro con el código como primera columna y la URL como fuente de verdad
// (`/solicitudes?estado=completada&tipo=alta_empleado&q=quispe`).
//
// Las altas las genera RRHH por correo y TI las registra a mano desde acá
// («Nueva solicitud»); el formulario para RRHH queda como mejora futura.
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter, RouterLink } from 'vue-router';
import { useSolicitudesStore } from '../../stores/solicitudes.js';
import { insforgeApi } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import {
  OPCIONES_TIPO_SOLICITUD, avanceSolicitud, textoAvance, siguientePaso, origenSolicitudInfo,
} from '../../core/dominio-solicitudes.js';
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
import SolicitudForm from './SolicitudForm.vue';

const router = useRouter();
const store = useSolicitudesStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);

// ── Filtros V2: vistas + chip + URL ─────────────────────────────────────
// `estado` es la VISTA; 'abierta' por defecto (la de trabajo) y 'todas' la
// vista sin filtro de estado.
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  estado: { tipo: 'valor', defecto: 'abierta' },
  q: { tipo: 'texto' },
  tipo: { tipo: 'lista' },
});
const CLAVES_FILTRO = ['q', 'tipo'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

const filtrosSinEstado = computed(() => ({ q: filtros.q, tipos: filtros.tipo }));
const filtrosServidor = computed(() => ({
  ...filtrosSinEstado.value,
  estado: filtros.estado === 'todas' ? '' : filtros.estado,
}));

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosSolicitudesPorEstado(filtrosSinEstado.value);
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}

const VISTAS = computed(() => [
  { valor: 'abierta', label: 'Abiertas', conteo: conteos.value?.abierta, titulo: 'Con pasos pendientes' },
  { valor: 'completada', label: 'Completadas', conteo: conteos.value?.completada },
  { valor: 'cancelada', label: 'Canceladas', conteo: conteos.value?.cancelada },
  { valor: 'todas', label: 'Todas', conteo: conteos.value?.todas },
]);

const DIMENSIONES = [
  { id: 'tipo', label: 'Tipo', icono: 'ti ti-clipboard-list', opciones: OPCIONES_TIPO_SOLICITUD },
];
const chips = computed({
  get: () => ({ tipo: filtros.tipo }),
  set: (v) => { filtros.tipo = v.tipo; },
});

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

watch(filtrosServidor, (f) => store.aplicarFiltros(f), { deep: true });
watch(filtrosSinEstado, refrescarConteos, { deep: true });

const { esMovil } = useEsMovil();

// ── Filas ───────────────────────────────────────────────────────────────
const filas = computed(() => lista.value.map((s) => {
  const avance = avanceSolicitud(s.pasos);
  return {
    ...s,
    avance,
    avanceTexto: textoAvance(avance),
    siguiente: s.estado === 'abierta' ? siguientePaso(s.pasos)?.label || '' : '',
    fechaTexto: formatFecha(s.created_at),
    origenTexto: origenSolicitudInfo(s.origen),
  };
}));

const vistaVacia = computed(() => {
  if (filtros.estado === 'todas' || !(conteos.value?.todas > 0)) return null;
  const nombre = VISTAS.value.find((v) => v.valor === filtros.estado)?.label.toLowerCase();
  return { titulo: `Sin solicitudes ${nombre}`, mensaje: 'No hay nada en esta vista. Las demás pestañas muestran el resto de los trámites.' };
});

function abrir(solicitud) {
  router.push(`/solicitudes/${solicitud.id}`);
}

// ── Nueva solicitud ─────────────────────────────────────────────────────
const mostrarForm = ref(false);

function onFormCerrado(creada) {
  mostrarForm.value = false;
  if (!creada) return;
  showToast(`Solicitud ${creada.codigo} abierta`);
  router.push(`/solicitudes/${creada.id}`);
}

onMounted(async () => {
  refrescarConteos();
  try {
    // Lo que se aplica es SIEMPRE lo que dice la URL (gotcha de resetearFiltros).
    store.resetearFiltros();
    await store.aplicarFiltros(filtrosServidor.value);
  } catch {
    showToast(error.value || 'Error al cargar solicitudes', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado
      titulo="Solicitudes"
      subtitulo="Altas, bajas y pedidos de servicio con sus pasos"
    >
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nueva solicitud" @click="mostrarForm = true" />
      </template>
    </AppEncabezado>

    <AppVistas v-model="filtros.estado" :opciones="VISTAS" label="Vista de solicitudes" />

    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar solicitudes" placeholder="Buscar por código o por persona" />
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
        icono="ti ti-clipboard-list"
        :titulo="hayFiltros ? 'Sin resultados' : vistaVacia ? vistaVacia.titulo : 'Sin solicitudes todavía'"
        :mensaje="hayFiltros ? 'No hay solicitudes con los filtros aplicados.' : vistaVacia ? vistaVacia.mensaje : 'Registre la primera solicitud cuando RRHH pida un alta o un acceso.'"
      >
        <AppButton v-if="!hayFiltros && !vistaVacia" variant="outline" severity="secondary" icon="ti ti-plus" label="Nueva solicitud" @click="mostrarForm = true" />
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando solicitudes…</p>

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
              aria-label="Solicitudes de servicio"
              @ordenar="store.ordenarPor"
              @row-click="({ data }) => abrir(data)"
            >
              <AppColumn field="codigo" header="Código" sortable>
                <template #body="{ data: s }">
                  <RouterLink :to="`/solicitudes/${s.id}`" class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" @click.stop>
                    <AppCodigo :valor="s.codigo" titulo="Número de solicitud" />
                  </RouterLink>
                </template>
              </AppColumn>

              <AppColumn field="tipo" header="Solicitud">
                <template #body="{ data: s }">
                  <div class="min-w-0">
                    <div class="truncate font-medium text-gray-900">{{ s.tipo_nombre }}</div>
                    <div class="truncate text-xs text-gray-500">{{ s.origenTexto }}</div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="empleado" header="Persona">
                <template #body="{ data: s }">
                  <RouterLink :to="`/empleados/${s.empleado_id}`" class="block truncate rounded-sm text-gray-900 hover:text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" @click.stop>
                    {{ s.empleado_nombre }}
                  </RouterLink>
                </template>
              </AppColumn>

              <AppColumn field="avance" header="Avance">
                <template #body="{ data: s }">
                  <div class="min-w-0">
                    <div class="tabular-nums text-gray-900">{{ s.avanceTexto }}</div>
                    <div v-if="s.siguiente" class="truncate text-xs text-gray-500">Falta: {{ s.siguiente }}</div>
                  </div>
                </template>
              </AppColumn>

              <!-- Solo en "Todas": dentro de una vista de estado repetiría la pestaña. -->
              <AppColumn v-if="filtros.estado === 'todas'" field="estado" header="Estado" sortable>
                <template #body="{ data: s }">
                  <BadgeEstado tipo="solicitud" :valor="s.estado" />
                </template>
              </AppColumn>

              <AppColumn field="created_at" header="Abierta" sortable>
                <template #body="{ data: s }">
                  <span class="text-xs tabular-nums text-gray-500">{{ s.fechaTexto }}</span>
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
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando solicitudes...</p>
          <ul v-else class="grid grid-cols-1 gap-3" aria-label="Solicitudes de servicio">
            <li
              v-for="s in filas"
              :key="s.id"
              class="flex cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              tabindex="0"
              @keydown.enter.self="abrir(s)"
              @click="abrir(s)"
            >
              <div class="flex items-baseline justify-between gap-3">
                <span class="text-sm text-primary-600"><AppCodigo :valor="s.codigo" titulo="Número de solicitud" /></span>
                <BadgeEstado tipo="solicitud" :valor="s.estado" />
              </div>
              <p class="mt-2 font-medium text-gray-900">{{ s.tipo_nombre }}</p>
              <p class="text-sm text-gray-600">{{ s.empleado_nombre }}</p>
              <p class="mt-2 text-xs tabular-nums text-gray-500">
                {{ s.avanceTexto }}<template v-if="s.siguiente"> · Falta: {{ s.siguiente }}</template>
              </p>
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

    <SolicitudForm v-if="mostrarForm" @cerrar="onFormCerrado" />
  </div>
</template>
