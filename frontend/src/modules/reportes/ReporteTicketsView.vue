<script setup>
// Reporte de tickets (migración 115): UNA hoja imprimible por período,
// compuesta en el servidor (`reporte_tickets`). Esta vista solo elige el
// período y el alcance (la URL es la fuente de verdad), pinta las secciones
// que arma hoja.js dentro de la hoja común (ReporteHoja: carátula, Imprimir,
// CSV y glosario) y ofrece un CSV con las filas que ya trajo la RPC. Nada se
// suma ni se promedia acá. El CSV de la bandeja que vivía en Tickets se
// integró en este (título y asignado hoy): Tickets ya no exporta.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import ReporteHoja from './ReporteHoja.vue';
import ReporteControles from './ReporteControles.vue';
import ReporteSecciones from './ReporteSecciones.vue';
import { usePeriodoUrl } from './usePeriodoUrl.js';
import { etiquetaPeriodo, nombreArchivoPeriodo } from './periodo.js';
import { armarSecciones, datosCaratula } from './hoja.js';
import { filasCsvReporte } from './csv.js';
import { GLOSARIO, VERSION_DEFINICIONES } from './glosario.js';

const auth = useAuthStore();
const { filtros, periodo, etiqueta, fijarPeriodo, normalizarUrl } = usePeriodoUrl({ tecnico: { tipo: 'valor' } });
const esJefe = computed(() => auth.esJefe);
const usuarioId = computed(() => auth.user?.id || '');

const cargando = ref(false);
const error = ref('');
const reporte = ref(null);
const staff = ref([]);

const nombresStaff = computed(() => Object.fromEntries(staff.value.map((s) => [s.user_id, s.nombre])));
const secciones = computed(() => armarSecciones(reporte.value, { nombresStaff: esJefe.value ? nombresStaff.value : {} }));
const caratula = computed(() => datosCaratula(reporte.value, etiqueta.value));
const enCurso = computed(() => reporte.value?.periodo?.en_curso === true);
const comparacionParcial = computed(() => reporte.value?.comparacion?.parcial === true);
const subtitulo = computed(() => {
  if (!reporte.value) return '';
  const v = reporte.value.volumen || {};
  const partes = [];
  if (v.creados != null) partes.push(`${v.creados} creados`);
  partes.push(`${v.resueltos ?? 0} resueltos`);
  if (v.rechazados) partes.push(`${v.rechazados} rechazados`);
  return partes.join(' · ');
});

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    reporte.value = await insforgeApi.obtenerReporteTickets({
      desde: periodo.value.desde,
      hasta: periodo.value.hasta,
      tecnicoId: filtros.tecnico || null,
    });
  } catch (e) {
    reporte.value = null;
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo generar el reporte.' }).mensaje;
  } finally {
    cargando.value = false;
  }
}

// Nombres del staff: para el selector de técnico (JEFE) y la columna
// «Asignado hoy» del CSV (la bandeja ya los mostraba a todo el módulo).
async function cargarStaff() {
  try {
    staff.value = await insforgeApi.nombresStaff();
  } catch {
    staff.value = [];
  }
}

function exportar() {
  if (!reporte.value) return;
  const { cabecera, filas } = filasCsvReporte(reporte.value, { nombresStaff: nombresStaff.value });
  if (!filas.length) {
    showToast('No hay tickets en el período para exportar', 'warning');
    return;
  }
  exportarCSV(nombreArchivoPeriodo(periodo.value), cabecera, filas);
}

// La URL manda: cualquier cambio (controles, atrás/adelante, enlace) recarga.
watch(() => [filtros.tipo, filtros.desde, filtros.hasta, filtros.tecnico], cargar);

onMounted(() => {
  if (normalizarUrl()) cargar();
  cargarStaff();
});
</script>

<template>
  <ReporteHoja
    rotulo="REPORTE · TICKETS"
    titulo="Reporte de tickets"
    :datos="caratula"
    :en-curso="enCurso"
    :cargando="cargando"
    :error="error"
    :listo="!!reporte"
    :glosario="GLOSARIO"
    :version="reporte?.definiciones_version || ''"
    :version-esperada="VERSION_DEFINICIONES"
    @csv="exportar"
  >
    <template #controles>
      <ReporteControles
        :periodo="periodo"
        :tecnico-id="filtros.tecnico"
        :tecnicos="esJefe ? staff : []"
        :es-jefe="esJefe"
        :usuario-id="usuarioId"
        :desde-minimo="reporte?.primer_ticket_at || ''"
        :cargando="cargando"
        con-alcance
        @update:periodo="fijarPeriodo"
        @update:tecnico-id="filtros.tecnico = $event"
      />
    </template>

    <p class="text-sm text-gray-700">
      {{ subtitulo }}
      <span v-if="enCurso" class="text-gray-500"> · el período no terminó: las cifras siguen cambiando y no se compara con el anterior.</span>
      <span v-else-if="reporte.comparacion" class="text-gray-500">
        · comparado con {{ etiquetaPeriodo({ tipo: periodo.tipo === 'mes' ? 'mes' : 'rango', ...reporte.comparacion.periodo }) }}<template v-if="comparacionParcial"> (período anterior parcial: empieza antes del primer ticket registrado)</template>.
      </span>
    </p>
    <ReporteSecciones :secciones="secciones" />
  </ReporteHoja>
</template>
