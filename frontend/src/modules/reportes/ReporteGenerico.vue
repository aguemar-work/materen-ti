<script setup>
// Hoja de un reporte centralizado (migración 117): inventario de equipos,
// licencias, correos, personal, solicitudes, cambios, problemas y
// conocimiento, encuestas y auditoría. El servidor manda las secciones listas
// para la hoja y el CSV del mismo cálculo; acá solo se eligen los controles
// según el alcance del reporte (período, foto al corte o ronda), se da formato
// (celdas.js) y se imprime o descarga. La URL es la fuente de verdad del
// período y de la ronda. Qué reporte es lo dice `reporteId` (core/reportes.js).
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { REPORTE_POR_ID, AREAS_REPORTES } from '../../core/reportes.js';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ReporteHoja from './ReporteHoja.vue';
import ReporteControles from './ReporteControles.vue';
import ReporteSecciones from './ReporteSecciones.vue';
import { usePeriodoUrl } from './usePeriodoUrl.js';
import { seccionesParaHoja, csvDeReporte, nombreArchivo } from './celdas.js';
import { GLOSARIOS, VERSION_DEFINICIONES_117 } from './glosario.js';

const props = defineProps({ reporteId: { type: String, required: true } });

const def = REPORTE_POR_ID[props.reporteId];
const area = AREAS_REPORTES.find((a) => a.id === def.area)?.label || '';
const porPeriodo = def.alcance === 'periodo';
const porRonda = def.alcance === 'ronda';

const { filtros, periodo, etiqueta, fijarPeriodo, normalizarUrl } = usePeriodoUrl({ ronda: { tipo: 'valor' } });

const cargando = ref(false);
const error = ref('');
const reporte = ref(null);

const secciones = computed(() => seccionesParaHoja(reporte.value?.secciones));
const enCurso = computed(() => reporte.value?.periodo?.en_curso === true);
const rondas = computed(() => reporte.value?.rondas || []);
const ronda = computed(() => reporte.value?.ronda || null);

const caratula = computed(() => {
  const r = reporte.value;
  if (!r) return [];
  const comunes = [
    { rotulo: 'Generado por', valor: r.generado_por?.nombre || '' },
    { rotulo: 'Definiciones', valor: r.definiciones_version || '' },
  ];
  if (porRonda) {
    return ronda.value ? [
      { rotulo: 'Encuesta', valor: ronda.value.encuesta },
      { rotulo: 'Ronda del', valor: formatFecha(ronda.value.abierta_el) },
      { rotulo: 'Estado', valor: ronda.value.cerrada ? 'Cerrada' : 'Abierta' },
      { rotulo: 'Respuestas', valor: String(ronda.value.respuestas) },
      ...comunes,
    ] : comunes;
  }
  if (porPeriodo) {
    return [{ rotulo: 'Período', valor: etiqueta.value }, ...comunes, { rotulo: 'Generado el', valor: r.generado_en ? formatFecha(r.generado_en.slice(0, 10)) : '' }];
  }
  return [{ rotulo: 'Corte', valor: r.corte_at ? formatFechaHora(r.corte_at) : '' }, ...comunes];
});

function parametros() {
  if (porPeriodo) return { desde: periodo.value.desde, hasta: periodo.value.hasta };
  if (porRonda) return { rondaId: filtros.ronda || null };
  return {};
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    reporte.value = await insforgeApi[def.metodo](parametros());
  } catch (e) {
    reporte.value = null;
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo generar el reporte.' }).mensaje;
  } finally {
    cargando.value = false;
  }
}

function exportar() {
  if (!reporte.value) return;
  const { cabecera, filas } = csvDeReporte(reporte.value);
  if (!filas.length) {
    showToast('No hay filas para exportar', 'warning');
    return;
  }
  exportarCSV(nombreArchivo(def.id, reporte.value), cabecera, filas);
}

// La URL manda: cambiar el período o la ronda (controles, atrás/adelante,
// enlace) recarga.
if (porPeriodo) watch(() => [filtros.tipo, filtros.desde, filtros.hasta], cargar);
if (porRonda) watch(() => filtros.ronda, cargar);

onMounted(() => {
  if (!porPeriodo || normalizarUrl()) cargar();
});
</script>

<template>
  <ReporteHoja
    :rotulo="`REPORTE · ${area.toUpperCase()}`"
    :titulo="def.titulo"
    :datos="caratula"
    :en-curso="enCurso"
    :cargando="cargando"
    :error="error"
    :listo="!!reporte"
    :glosario="GLOSARIOS[def.id] || []"
    :version="reporte?.definiciones_version || ''"
    :version-esperada="VERSION_DEFINICIONES_117"
    @csv="exportar"
  >
    <template #controles>
      <ReporteControles
        v-if="porPeriodo"
        :periodo="periodo"
        :cargando="cargando"
        @update:periodo="fijarPeriodo"
      />
      <div v-else data-no-print class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
        <AppSelect v-if="porRonda && rondas.length" :model-value="ronda?.ronda_id || ''" label="Ronda" @update:model-value="filtros.ronda = $event">
          <option v-for="r in rondas" :key="r.ronda_id" :value="r.ronda_id">
            {{ r.encuesta }} · {{ formatFecha(r.abierta_el) }} · {{ r.respuestas }} {{ r.respuestas === 1 ? 'respuesta' : 'respuestas' }}
          </option>
        </AppSelect>
        <p v-if="!porRonda" class="text-sm text-gray-500">Foto al momento de generar el reporte.</p>
        <AppButton label="Actualizar" icon="ti ti-refresh" variant="text" severity="secondary" size="sm" :disabled="cargando" @click="cargar" />
      </div>
    </template>

    <p v-if="porPeriodo && enCurso" class="text-sm text-gray-500">El período no terminó: las cifras siguen cambiando.</p>
    <p v-for="aviso in reporte.avisos || []" :key="aviso" class="text-sm text-gray-700" role="status">{{ aviso }}</p>
    <p v-if="porRonda && !ronda" class="text-sm text-gray-500">— Sin rondas de encuesta registradas.</p>
    <ReporteSecciones :secciones="secciones" :vacio="porPeriodo ? 'Sin datos en el período' : 'Sin registros'" />
  </ReporteHoja>
</template>
