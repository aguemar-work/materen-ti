<script setup>
// Reporte de Satisfacción (encuestas de cierre de tickets, migración 118): un
// día, una semana, un mes, un rango o todo el historial de
// `reporte_satisfaccion`, en la hoja común de reportes. Por solicitante dice
// cuántos tickets se le atendieron, cuántas encuestas respondió, cuántas le
// faltan y si está conforme; por técnico (solo JEFE), el % de cada técnico de
// mesa. La URL es la fuente de verdad del período; se imprime con
// window.print().
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import ReporteHoja from './ReporteHoja.vue';
import ReporteControles from './ReporteControles.vue';
import ReporteSecciones from './ReporteSecciones.vue';
import { usePeriodoUrl } from './usePeriodoUrl.js';
import { TIPOS_PERIODO_MESA, TIPO_TODO, nombreArchivoPeriodo } from './periodo.js';
import { seccionesSatisfaccion, caratulaSatisfaccion, csvSatisfaccion } from './hoja-satisfaccion.js';
import { GLOSARIOS, VERSION_DEFINICIONES } from './glosario.js';

const TIPOS = [...TIPOS_PERIODO_MESA, TIPO_TODO];
const { filtros, periodo, etiqueta, fijarPeriodo, normalizarUrl } = usePeriodoUrl({}, { permitirTodo: true });

const cargando = ref(false);
const error = ref('');
const reporte = ref(null);
const staff = ref([]);

const nombresStaff = computed(() => Object.fromEntries(staff.value.map((s) => [s.user_id, s.nombre])));
const secciones = computed(() => seccionesSatisfaccion(reporte.value));
const caratula = computed(() => (reporte.value ? caratulaSatisfaccion(reporte.value, etiqueta.value) : []));
const enCurso = computed(() => reporte.value?.periodo?.en_curso === true);

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const todo = periodo.value.tipo === 'todo';
    reporte.value = await insforgeApi.obtenerReporteSatisfaccion(todo ? {} : { desde: periodo.value.desde, hasta: periodo.value.hasta });
  } catch (e) {
    reporte.value = null;
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar la satisfacción de tickets.' }).mensaje;
  } finally {
    cargando.value = false;
  }
}

// Nombres del staff para la columna «Resolvió» del CSV (solo llega al JEFE).
async function cargarStaff() {
  try {
    staff.value = await insforgeApi.nombresStaff();
  } catch {
    staff.value = [];
  }
}

function exportar() {
  const { cabecera, filas } = csvSatisfaccion(reporte.value, { nombresStaff: nombresStaff.value });
  if (!filas.length) {
    showToast('No hay encuestas para exportar', 'warning');
    return;
  }
  exportarCSV(nombreArchivoPeriodo(periodo.value, 'satisfaccion'), cabecera, filas);
}

// La URL manda: cambiar el período (controles, atrás/adelante, enlace) recarga.
watch(() => [filtros.tipo, filtros.desde, filtros.hasta], cargar);

onMounted(() => {
  if (normalizarUrl()) cargar();
  cargarStaff();
});
</script>

<template>
  <ReporteHoja
    rotulo="REPORTE · MESA DE AYUDA"
    titulo="Satisfacción"
    :datos="caratula"
    :en-curso="enCurso"
    :cargando="cargando"
    :error="error"
    :listo="!!reporte"
    :glosario="GLOSARIOS.satisfaccion"
    :version="reporte?.definiciones_version || ''"
    :version-esperada="VERSION_DEFINICIONES"
    @csv="exportar"
  >
    <template #controles>
      <ReporteControles :periodo="periodo" :tipos="TIPOS" :cargando="cargando" @update:periodo="fijarPeriodo" />
    </template>
    <ReporteSecciones :secciones="secciones" vacio="Sin encuestas en el período" />
  </ReporteHoja>
</template>
