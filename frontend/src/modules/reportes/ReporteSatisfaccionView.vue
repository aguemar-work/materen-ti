<script setup>
// Reporte de Satisfacción (encuestas de cierre de tickets): el histórico
// completo de reporte_satisfaccion_consolidado (migración 115) en la hoja
// común de reportes. Antes era la vista Tickets › Satisfacción con su propio
// PDF de jsPDF; desde 2026-10-05 vive acá y se imprime con window.print().
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import AppButton from '../../components/ui/AppButton.vue';
import ReporteHoja from './ReporteHoja.vue';
import ReporteSecciones from './ReporteSecciones.vue';
import { seccionesSatisfaccion, caratulaSatisfaccion, csvSatisfaccion } from './hoja-satisfaccion.js';
import { GLOSARIOS, VERSION_DEFINICIONES } from './glosario.js';

const cargando = ref(false);
const error = ref('');
const consolidado = ref(null);

const secciones = computed(() => seccionesSatisfaccion(consolidado.value));
const caratula = computed(() => (consolidado.value ? caratulaSatisfaccion(consolidado.value) : []));

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    consolidado.value = await insforgeApi.obtenerSatisfaccionConsolidado();
  } catch (e) {
    consolidado.value = null;
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar la satisfacción de tickets.' }).mensaje;
  } finally {
    cargando.value = false;
  }
}

function exportar() {
  const { cabecera, filas } = csvSatisfaccion(consolidado.value);
  if (!filas.length) {
    showToast('No hay encuestas para exportar', 'warning');
    return;
  }
  exportarCSV('Reporte_satisfaccion', cabecera, filas);
}

onMounted(cargar);
</script>

<template>
  <ReporteHoja
    rotulo="REPORTE · MESA DE AYUDA"
    titulo="Satisfacción"
    :datos="caratula"
    :cargando="cargando"
    :error="error"
    :listo="!!consolidado"
    :glosario="GLOSARIOS.satisfaccion"
    :version="VERSION_DEFINICIONES"
    @csv="exportar"
  >
    <template #controles>
      <div data-no-print class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
        <p class="text-sm text-gray-500">Todo el historial de encuestas de cierre de tickets.</p>
        <AppButton label="Actualizar" icon="ti ti-refresh" variant="text" severity="secondary" size="sm" :disabled="cargando" @click="cargar" />
      </div>
    </template>
    <ReporteSecciones :secciones="secciones" vacio="Sin encuestas registradas" />
  </ReporteHoja>
</template>
