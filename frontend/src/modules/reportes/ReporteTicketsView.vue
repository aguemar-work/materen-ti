<script setup>
// Reporte de tickets (migraciones 115 y 118): UNA hoja imprimible por período
// (día, semana, mes o rango), compuesta en el servidor (`reporte_tickets`).
// Esta vista solo elige el período y el alcance (la URL es la fuente de
// verdad), pinta las secciones que arma hoja.js dentro de la hoja común
// (ReporteHoja: carátula, Imprimir, CSV y glosario), ofrece un CSV con las
// filas que ya trajo la RPC y copia el resumen en texto para gerencia. Nada
// se suma ni se promedia acá. El CSV de la bandeja que vivía en Tickets se
// integró en este (título y asignado hoy): Tickets ya no exporta.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import AppButton from '../../components/ui/AppButton.vue';
import ReporteHoja from './ReporteHoja.vue';
import ReporteControles from './ReporteControles.vue';
import ReporteSecciones from './ReporteSecciones.vue';
import { usePeriodoUrl } from './usePeriodoUrl.js';
import { TIPOS_PERIODO_MESA, nombreArchivoPeriodo } from './periodo.js';
import { armarSecciones, datosCaratula, resumenTexto } from './hoja.js';
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

// Nombres del staff: para «A cargo hoy» (la bandeja ya los mostraba a todo el
// módulo) y el selector de técnico del JEFE. Quién resolvió cada ticket solo
// aparece cuando el servidor manda la sección por técnico (JEFE).
const nombresStaff = computed(() => Object.fromEntries(staff.value.map((s) => [s.user_id, s.nombre])));
const secciones = computed(() => armarSecciones(reporte.value, { nombresStaff: nombresStaff.value }));
const caratula = computed(() => datosCaratula(reporte.value, etiqueta.value));
const enCurso = computed(() => reporte.value?.periodo?.en_curso === true);
const resumen = computed(() => resumenTexto(reporte.value, etiqueta.value));

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

async function copiarResumen() {
  try {
    await navigator.clipboard.writeText(resumen.value);
    showToast('Resumen copiado: péguelo en el correo o en WhatsApp');
  } catch {
    showToast('No se pudo copiar el resumen. Seleccione el texto de la hoja y cópielo a mano.', 'warning');
  }
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
    rotulo="REPORTE · MESA DE AYUDA"
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
        :tipos="TIPOS_PERIODO_MESA"
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

    <div v-if="resumen" data-no-print class="flex justify-end">
      <AppButton label="Copiar resumen" icon="ti ti-copy" variant="outline" severity="secondary" size="sm" @click="copiarResumen" />
    </div>
    <ReporteSecciones :secciones="secciones" />
  </ReporteHoja>
</template>
