<script setup>
// Listado de licencias de software. La vista orquesta filtros (vistas + chips
// en la URL), exportación y las acciones; la presentación vive en
// LicenciasTabla (tabla/tarjetas), los diálogos en AsignarAsientoDialog,
// LicenciaAccionDialog y LicenciaForm, y los cálculos de asientos y
// vencimiento en useLicenciaCupos.js / licenciaPresentacion.js (la vista pasó
// de 812 a ~250 líneas; regla: ningún .vue supera ~400).
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useLicenciasStore } from '../../stores/licencias.js';
import { insforgeApi } from '../../api/insforge.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { DIAS_POR_VENCER_LICENCIA } from '../../core/dominio-licencias.js';
import LicenciaForm from './LicenciaForm.vue';
import LicenciasTabla from './LicenciasTabla.vue';
import AsignarAsientoDialog from './AsignarAsientoDialog.vue';
import LicenciaAccionDialog from './LicenciaAccionDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useLicenciaCupos } from './useLicenciaCupos.js';
import { proximaFecha } from './licenciaPresentacion.js';

const store = useLicenciasStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);

useRealtimeRefresco('licencias:list', () => Promise.all([store.cargar(), refrescarConteos()]), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const route = useRoute();
const router = useRouter();

// ── Filtros V2: vistas + chips + URL (2026-09-25, SISTEMA-DISENO §3.2.1) ──
// `situacion` es la VISTA (pestañas con conteo); empresa y acceso, chips.
// La búsqueda global enlaza con /licencias?q=SOFTWARE: mismo parámetro.
// No hay vista "Sin cupo": comparar asientos usados contra `cantidad` no se
// puede expresar en la query sin un cambio de esquema (api/domains/licencias.js).
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  situacion: { tipo: 'valor', defecto: '' },
  q: { tipo: 'texto' },
  empresa: { tipo: 'lista' },
  acceso: { tipo: 'lista' },
});
const CLAVES_FILTRO = ['q', 'empresa', 'acceso'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

const filtrosSinVista = computed(() => ({ q: filtros.q, empresaIds: filtros.empresa, accesos: filtros.acceso }));
const filtrosServidor = computed(() => ({ ...filtrosSinVista.value, situacion: filtros.situacion }));

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosLicenciasPorSituacion(filtrosSinVista.value);
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}

const VISTAS = computed(() => [
  { valor: '', label: 'Todas', conteo: conteos.value?.todas },
  { valor: 'por_vencer', label: 'Por vencer', conteo: conteos.value?.por_vencer, titulo: `Vencen en los próximos ${DIAS_POR_VENCER_LICENCIA} días` },
  { valor: 'vencidas', label: 'Vencidas', conteo: conteos.value?.vencidas },
  { valor: 'perpetuas', label: 'Perpetuas', conteo: conteos.value?.perpetuas, titulo: 'Sin fecha de vencimiento' },
]);

const FRASE_SITUACION = {
  vencidas: ' vencidas',
  por_vencer: ` por vencer en ${DIAS_POR_VENCER_LICENCIA} días`,
  perpetuas: ' perpetuas',
};

const empresas = ref([]);
const DIMENSIONES = computed(() => [
  { id: 'empresa', label: 'Empresa', icono: 'ti ti-building', opciones: empresas.value.map((e) => ({ valor: e.id, label: e.nombre })) },
  {
    id: 'acceso', label: 'Acceso', icono: 'ti ti-key', opciones: [
      { valor: 'correo', label: 'Con correo compartido' },
      { valor: 'clave', label: 'Con clave de producto' },
      { valor: 'ninguno', label: 'Sin credencial' },
    ],
  },
]);
const chips = computed({
  get: () => ({ empresa: filtros.empresa, acceso: filtros.acceso }),
  set: (v) => { filtros.empresa = v.empresa; filtros.acceso = v.acceso; },
});

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

// Una vista vacía en un inventario que sí tiene licencias ("Vencidas: 0") no
// es "Sin licencias todavía": es una buena noticia de esa vista.
const VACIO_VISTA = {
  por_vencer: { titulo: 'Nada por vencer', mensaje: `Ninguna licencia vence en los próximos ${DIAS_POR_VENCER_LICENCIA} días.` },
  vencidas: { titulo: 'Sin licencias vencidas', mensaje: 'Todas las suscripciones están al día.' },
  perpetuas: { titulo: 'Sin licencias perpetuas', mensaje: 'Todas las licencias registradas tienen fecha de vencimiento.' },
};
const vistaVacia = computed(() => (!hayFiltros.value && conteos.value?.todas > 0 ? VACIO_VISTA[filtros.situacion] || null : null));

watch(filtrosServidor, (f) => { store.aplicarFiltros(f).catch(() => {}); }, { deep: true });
watch(filtrosSinVista, refrescarConteos, { deep: true });

const { sinCupo } = useLicenciaCupos({ lista, total });

// ── Exportación ──────────────────────────────────────────────
const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'licencias',
      ['Software', 'Proveedor', 'Empresa', 'Acceso', 'Asientos usados', 'Asientos totales', 'Usuarios', 'Vencimiento'],
      filas.map((l) => [
        l.software,
        l.proveedor,
        l.empresa_nombre || 'Del grupo',
        l.cuenta_usuario,
        l.usados,
        l.cantidad,
        (l.usuarios || []).map((u) => u.nombre).join(', '),
        l.tipo === 'perpetua' ? 'Perpetua' : l.fecha_vencimiento,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// ── Formulario, asignación y confirmaciones ───────────────────
const mostrarForm = ref(false);
const licenciaEditar = ref(null);
const licenciaAsignar = ref(null);
// { tipo: 'eliminar'|'liberar'|'renovar', licencia, usuario?, nuevaFecha? }
const accionPendiente = ref(null);

function abrirNueva() {
  licenciaEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(licencia) {
  licenciaEditar.value = licencia;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!licenciaEditar.value;
  mostrarForm.value = false;
  licenciaEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Licencia actualizada' : 'Licencia creada');
}

const pedirRenovar = (licencia) => { accionPendiente.value = { tipo: 'renovar', licencia, nuevaFecha: proximaFecha(licencia) }; };
const pedirLiberar = (licencia, usuario) => { accionPendiente.value = { tipo: 'liberar', licencia, usuario }; };
const pedirEliminar = (licencia) => { accionPendiente.value = { tipo: 'eliminar', licencia }; };

onMounted(async () => {
  store.resetearFiltros();
  // /licencias?nuevo=1 — atajo desde el estado vacío de AsignarLicenciaModal
  // (ficha del empleado) cuando todavía no hay ninguna licencia registrada.
  // Se quita de la URL para que recargar no vuelva a abrir el formulario.
  if (route.query.nuevo) {
    abrirNueva();
    const { nuevo: _nuevo, ...resto } = route.query;
    router.replace({ query: resto });
  }
  insforgeApi.listEmpresas().then((e) => { empresas.value = e; }).catch(() => {});
  refrescarConteos();
  try {
    await store.aplicarFiltros(filtrosServidor.value);
  } catch {
    showToast(error.value || 'Error al cargar licencias', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Licencias">
      <template #subtitulo>
        {{ total }} {{ total === 1 ? 'licencia' : 'licencias' }}{{ FRASE_SITUACION[filtros.situacion] || '' }}{{ hayFiltros ? ', con los filtros aplicados' : '' }}
        <template v-if="sinCupo"> · {{ sinCupo }} sin asientos libres</template>
      </template>
      <template #acciones>
        <AppButton
          variant="text"
          severity="secondary"
          icon="ti ti-table-export"
          :loading="exportando"
          :disabled="exportando"
          :label="exportando ? 'Exportando...' : 'Exportar'"
          title="Exportar a Excel (CSV)"
          @click="exportar"
        />
        <AppButton icon="ti ti-plus" label="Nueva licencia" @click="abrirNueva" />
      </template>
    </AppEncabezado>

    <!-- ══ Vistas + barra de filtros (SISTEMA-DISENO §3.2.1) ══════ -->
    <AppVistas v-model="filtros.situacion" :opciones="VISTAS" label="Vista de licencias" />
    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar licencias" placeholder="Buscar por software, empresa o correo" />
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
        icono="ti ti-license"
        :titulo="hayFiltros ? 'Sin resultados' : vistaVacia?.titulo || 'Sin licencias todavía'"
        :mensaje="hayFiltros ? 'No hay licencias con los filtros aplicados.' : vistaVacia?.mensaje || 'Registre la primera licencia para controlar asientos, accesos y vencimientos del software que se paga.'"
      >
        <AppButton v-if="!hayFiltros && !vistaVacia" variant="outline" severity="secondary" icon="ti ti-plus" label="Registrar licencia" @click="abrirNueva" />
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
      </AppVacio>

      <LicenciasTabla
        v-else
        :lista="lista"
        :cargando="cargando"
        :total="total"
        :pagina="store.pagina"
        :tam-pagina="store.tamPagina"
        :orden="orden"
        @ordenar="store.ordenarPor"
        @update:pagina="store.irAPagina"
        @update:tam-pagina="store.cambiarTamPagina"
        @renovar="pedirRenovar"
        @asignar="licenciaAsignar = $event"
        @editar="abrirEditar"
        @eliminar="pedirEliminar"
        @liberar="pedirLiberar"
      />
    </div>

    <LicenciaForm
      v-if="mostrarForm"
      :licencia="licenciaEditar"
      @cerrar="onFormCerrado"
    />

    <AsignarAsientoDialog
      v-if="licenciaAsignar"
      :licencia="licenciaAsignar"
      @cerrado="licenciaAsignar = null"
    />

    <LicenciaAccionDialog
      v-if="accionPendiente"
      :accion="accionPendiente"
      @cerrado="accionPendiente = null"
    />
  </div>
</template>
