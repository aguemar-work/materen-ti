<script setup>
// Listado de equipos. La fila abre la hoja de vida (/equipos/:id, antes un modal
// de este archivo). Entregar, devolver, mover, cambiar el estado y verificar
// salen de acá: viven en useEquiposAcciones + EquipoAccionesModales y son los
// MISMOS que usa la hoja de vida. La tabla, la tarjeta móvil y la celda
// "Asignación" son sus propios componentes (EquiposTabla, EquipoTarjeta,
// EquipoAsignacion); acá quedan los filtros, la selección y el cableado.
import { ref, computed, watch, onMounted, toRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useEquiposStore } from '../../stores/equipos.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { situacionInfo } from '../../core/dominio-equipos.js';
import { construirDatosReporteEquipos, generarReporteEquipos, LIMITE_MOVIMIENTOS_PDF } from './reporteEquipos.js';
import { useEquiposAcciones } from './useEquiposAcciones.js';
import EquipoForm from './EquipoForm.vue';
import EquipoAccionesModales from './EquipoAccionesModales.vue';
import EquiposTabla from './EquiposTabla.vue';
import EquipoTarjeta from './EquipoTarjeta.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { useEsMovil } from '../../composables/useEsMovil.js';

const store = useEquiposStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);

// Escritorio: tabla. Móvil: tarjetas apiladas.
const { esMovil } = useEsMovil();

// ── Filtros V2: vistas + chips + URL (2026-09-25) ──────────────────────
// La URL es la fuente de verdad (`?situacion=disponible&tipo=laptop&q=LAP`).
// La SITUACIÓN es la vista (pestañas con conteo); Tipo y Empresa son chips con
// selección múltiple. `q` también es el deep-link de la búsqueda global
// (/equipos?q=CODIGO).
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  situacion: { tipo: 'valor', defecto: '' },
  q: { tipo: 'texto' },
  tipo: { tipo: 'lista' },
  empresa: { tipo: 'lista' },
});
const CLAVES_FILTRO = ['q', 'tipo', 'empresa'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

const filtrosSinSituacion = computed(() => ({ q: filtros.q, tipoIds: filtros.tipo, empresaIds: filtros.empresa }));
const filtrosServidor = computed(() => ({ ...filtrosSinSituacion.value, situacion: filtros.situacion }));

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosEquiposPorSituacion(filtrosSinSituacion.value);
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}

const VISTAS = computed(() => [
  { valor: '', label: 'Todos', conteo: conteos.value?.todos },
  { valor: 'disponible', label: 'Libres', conteo: conteos.value?.disponible, titulo: 'Operativos y sin asignación: listos para entregar' },
  { valor: 'asignado', label: 'Con personas', conteo: conteos.value?.asignado, titulo: 'En manos de un empleado' },
  { valor: 'en_ubicacion', label: 'En ubicaciones', conteo: conteos.value?.en_ubicacion, titulo: 'Asignados a un almacén, sede u obra' },
  { valor: 'en_reparacion', label: 'En reparación', conteo: conteos.value?.en_reparacion },
  { valor: 'fuera', label: 'Fuera de servicio', conteo: conteos.value?.fuera, titulo: 'Dados de baja o robados/perdidos' },
]);

const empresas = ref([]);
const DIMENSIONES = computed(() => [
  { id: 'tipo', label: 'Tipo', icono: 'ti ti-devices', opciones: store.tipos.map((t) => ({ valor: t.id, label: t.nombre })) },
  { id: 'empresa', label: 'Empresa', icono: 'ti ti-building', opciones: empresas.value.map((e) => ({ valor: e.id, label: e.nombre })) },
]);
const chips = computed({
  get: () => ({ tipo: filtros.tipo, empresa: filtros.empresa }),
  set: (v) => { filtros.tipo = v.tipo; filtros.empresa = v.empresa; },
});

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

watch(filtrosServidor, (f) => store.aplicarFiltros(f), { deep: true });
watch(filtrosSinSituacion, refrescarConteos, { deep: true });

useRealtimeRefresco('equipos:list', () => { store.cargar(); refrescarConteos(); }, { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const route = useRoute();
const router = useRouter();

// ── Acciones sobre un equipo (compartidas con la hoja de vida) ──────────
const acciones = useEquiposAcciones({
  alCambiar: () => Promise.all([store.cargar(), refrescarConteos()]),
  ubicaciones: toRef(store, 'ubicaciones'),
});
acciones.alEditar((eq) => abrirEditar(eq));

// ── Formulario de alta / edición ────────────────────────────────────────
const mostrarForm = ref(false);
const equipoEditar = ref(null);

function abrirNuevo() {
  equipoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(equipo) {
  equipoEditar.value = equipo;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!equipoEditar.value;
  mostrarForm.value = false;
  equipoEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Equipo actualizado' : 'Equipo registrado');
}

const abrirHoja = (eq) => router.push(`/equipos/${eq.id}`);

// ── Selección para imprimir etiquetas (sobrevive a cambiar de página) ───
const seleccion = ref(new Set());

function imprimirEtiquetas() {
  router.push({ path: '/equipos/etiquetas', query: { ids: [...seleccion.value].join(',') } });
}

// ── Exportar ────────────────────────────────────────────────────────────
function etiquetaEstado(eq) {
  return eq.estado === 'operativo' ? 'Operativo' : situacionInfo(eq.estado).label;
}

const mensajeDe = (e, porDefecto) => traducirErrorDb(e, { porDefecto }).mensaje;

// PDF: siempre el inventario COMPLETO (sin los filtros del toolbar), es la foto
// de todo el parque — decisión de producto 2026-08-22, distinto del CSV, que sí
// exporta lo que esté filtrado.
const generandoPdf = ref(false);
async function descargarPdf() {
  generandoPdf.value = true;
  try {
    const [equipos, movimientos] = await Promise.all([
      insforgeApi.listEquiposFiltrados({}),
      insforgeApi.ultimosMovimientos(LIMITE_MOVIMIENTOS_PDF),
    ]);
    await generarReporteEquipos({ ...construirDatosReporteEquipos(equipos), movimientos });
  } catch (e) {
    showToast(mensajeDe(e, 'No se pudo generar el PDF'), 'error');
  } finally {
    generandoPdf.value = false;
  }
}

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'equipos',
      ['Código equipo', 'Código almacén', 'Tipo', 'Marca', 'Modelo', 'Empresa', 'Serie', 'Situación', 'Asignado a', 'Ubicación'],
      filas.map((eq) => [
        eq.codigo, eq.codigo_almacen, eq.tipo_nombre, eq.marca, eq.modelo, eq.empresa_nombre, eq.serie,
        etiquetaEstado(eq), eq.portador, eq.ubicacion_nombre,
      ]),
    );
  } catch (e) {
    showToast(mensajeDe(e, 'Error al exportar'), 'error');
  } finally {
    exportando.value = false;
  }
}

// Menú "Más": acciones de baja frecuencia frente a "+ Nuevo equipo", el único
// acento de la vista (mismo criterio que TicketsView).
const accionesMas = computed(() => [
  {
    icono: exportando.value ? 'ti-loader-2 animate-spin' : 'ti-table-export',
    label: exportando.value ? 'Exportando...' : 'Exportar',
    disabled: exportando.value,
    onClick: exportar,
  },
  {
    icono: generandoPdf.value ? 'ti-loader-2 animate-spin' : 'ti-download',
    label: generandoPdf.value ? 'Generando...' : 'Descargar PDF',
    disabled: generandoPdf.value,
    onClick: descargarPdf,
  },
  {
    icono: 'ti-qrcode',
    label: 'Etiquetas de todos los filtrados',
    onClick: () => router.push({
      path: '/equipos/etiquetas',
      query: {
        todos: 1,
        ...(filtros.q ? { q: filtros.q } : {}),
        ...(filtros.situacion ? { situacion: filtros.situacion } : {}),
        ...(filtros.tipo.length ? { tipo: filtros.tipo.join(',') } : {}),
        ...(filtros.empresa.length ? { empresa: filtros.empresa.join(',') } : {}),
      },
    }),
  },
  { icono: 'ti-file-import', label: 'Importar desde Excel', onClick: () => router.push('/equipos/importar') },
]);

onMounted(async () => {
  insforgeApi.listEmpresas().then((e) => { empresas.value = e; }).catch(() => {
    // Sin empresas, el chip "Empresa" queda sin opciones; el listado sigue.
  });
  refrescarConteos();
  store.resetearFiltros();
  // /equipos?nuevo=1 — atajo desde el estado vacío de AsignarEquipoModal (ficha
  // del empleado) cuando no hay equipos disponibles en almacén. Se quita de la
  // URL para que recargar no vuelva a abrir el formulario.
  if (route.query.nuevo) {
    abrirNuevo();
    const { nuevo: _nuevo, ...resto } = route.query;
    router.replace({ query: resto });
  }
  try {
    // Lo que se aplica es siempre lo que dice la URL (sin filtros invisibles).
    await store.aplicarFiltros(filtrosServidor.value);
  } catch {
    showToast(error.value || 'Error al cargar equipos', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Equipos" subtitulo="Quién tiene cada equipo, dónde está y en qué estado">
      <template #acciones>
        <MenuAcciones
          label="Más acciones"
          :acciones="accionesMas"
          class="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <template #trigger>
            <i class="ti ti-dots" aria-hidden="true"></i>
            Más
          </template>
        </MenuAcciones>
        <AppButton icon="ti ti-plus" label="Nuevo equipo" @click="abrirNuevo" />
      </template>
    </AppEncabezado>

    <!-- ══ Vistas (situación) ══ -->
    <AppVistas v-model="filtros.situacion" :opciones="VISTAS" label="Vista de equipos" />

    <!-- ══ Barra de filtros: búsqueda + chips bajo demanda ══ -->
    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar equipos" placeholder="Buscar por código, marca, serie o portador" />
      <AppFiltros v-model="chips" :dimensiones="DIMENSIONES" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
    </AppBarraFiltros>

    <!-- ══ Selección para etiquetas ══ -->
    <div
      v-if="seleccion.size > 0 && !esMovil"
      class="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-md bg-gray-50 px-3 py-2 text-sm sm:mx-6"
      role="region"
      aria-label="Acciones sobre los equipos seleccionados"
    >
      <span class="font-medium text-gray-900 tabular-nums">{{ seleccion.size }} seleccionado{{ seleccion.size === 1 ? '' : 's' }}</span>
      <AppButton size="sm" variant="outline" severity="secondary" icon="ti ti-qrcode" label="Imprimir etiquetas" @click="imprimirEtiquetas" />
      <AppButton size="sm" variant="text" severity="secondary" label="Quitar selección" @click="seleccion = new Set()" />
    </div>

    <!-- ══ Contenido ══ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && total === 0"
        icono="ti ti-devices"
        :titulo="hayFiltros ? 'Sin resultados' : 'Sin equipos todavía'"
        :mensaje="hayFiltros ? 'No hay equipos con los filtros aplicados.' : 'Registre el primer equipo del inventario o impórtelos desde Excel.'"
      >
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
        <AppButton v-else variant="outline" severity="secondary" icon="ti ti-plus" label="Registrar equipo" @click="abrirNuevo" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando equipos…</p>

        <EquiposTabla
          v-if="!esMovil"
          v-model:seleccion="seleccion"
          :lista="lista"
          :cargando="cargando"
          :total="total"
          :pagina="store.pagina"
          :tam-pagina="store.tamPagina"
          :orden="orden"
          :acciones="acciones"
          @abrir="abrirHoja"
          @ordenar="store.ordenarPor"
          @ir-a-pagina="store.irAPagina"
          @cambiar-tam-pagina="store.cambiarTamPagina"
        />

        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando equipos...</p>
          <ul v-else class="grid grid-cols-1 gap-3" aria-label="Inventario de equipos">
            <EquipoTarjeta v-for="eq in lista" :key="eq.id" :equipo="eq" :acciones="acciones" @abrir="abrirHoja" />
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

    <EquipoForm v-if="mostrarForm" :equipo="equipoEditar" @cerrar="onFormCerrado" />
    <EquipoAccionesModales :acciones="acciones" />
  </div>
</template>
