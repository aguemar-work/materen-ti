<script setup>
// Reportes de tickets (migración 115): UNA hoja imprimible por período,
// compuesta en el servidor (`reporte_tickets`). Esta vista solo elige el
// período y el alcance (la URL es la fuente de verdad), pinta las secciones
// que arma hoja.js y ofrece "Imprimir / Guardar PDF" (la misma hoja, regla 23)
// y un CSV con las filas que ya trajo la RPC. Nada se suma ni se promedia acá.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import AppCaratula from '../../components/ui/AppCaratula.vue';
import AppSello from '../../components/ui/AppSello.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ReporteControles from './ReporteControles.vue';
import ReporteTabla from './ReporteTabla.vue';
import { normalizarPeriodo, etiquetaPeriodo, nombreArchivoPeriodo } from './periodo.js';
import { armarSecciones, datosCaratula } from './hoja.js';
import { filasCsvReporte } from './csv.js';
import { GLOSARIO, VERSION_DEFINICIONES } from './glosario.js';

const auth = useAuthStore();
const { filtros } = useFiltrosUrl({
  tipo: { tipo: 'valor', defecto: 'mes' },
  desde: { tipo: 'valor' },
  hasta: { tipo: 'valor' },
  tecnico: { tipo: 'valor' },
});

const periodo = computed(() => normalizarPeriodo(filtros));
const etiqueta = computed(() => etiquetaPeriodo(periodo.value));
const esJefe = computed(() => auth.esJefe);
const usuarioId = computed(() => auth.user?.id || '');

const cargando = ref(false);
const error = ref('');
const reporte = ref(null);
const tecnicos = ref([]);

const secciones = computed(() => armarSecciones(reporte.value));
const caratula = computed(() => datosCaratula(reporte.value, etiqueta.value));
const enCurso = computed(() => reporte.value?.periodo?.en_curso === true);
const versionDistinta = computed(() => !!reporte.value && reporte.value.definiciones_version !== VERSION_DEFINICIONES);
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

function fijarPeriodo(p) {
  filtros.tipo = p.tipo;
  filtros.desde = p.desde;
  filtros.hasta = p.hasta;
}

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

async function cargarTecnicos() {
  if (!esJefe.value) return;
  try {
    tecnicos.value = await insforgeApi.nombresStaff();
  } catch {
    tecnicos.value = [];
  }
}

function imprimir() {
  window.print();
}

function exportar() {
  if (!reporte.value) return;
  const { cabecera, filas } = filasCsvReporte(reporte.value);
  if (!filas.length) {
    showToast('No hay tickets en el período para exportar', 'warning');
    return;
  }
  exportarCSV(nombreArchivoPeriodo(periodo.value), cabecera, filas);
}

// La URL manda: cualquier cambio (controles, atrás/adelante, enlace) recarga.
watch(() => [filtros.tipo, filtros.desde, filtros.hasta, filtros.tecnico], cargar);

onMounted(() => {
  // Sin período en la URL: el mes en curso, escrito en la URL para que el
  // enlace sea reproducible. Si ya venía, se normaliza (y se carga una vez).
  const p = normalizarPeriodo(filtros);
  if (p.tipo !== filtros.tipo || p.desde !== filtros.desde || p.hasta !== filtros.hasta) fijarPeriodo(p);
  else cargar();
  cargarTecnicos();
});
</script>

<template>
  <div class="w-full pb-10">
    <AppCaratula rotulo="REPORTE · TICKETS" titulo="Reporte de tickets" :datos="caratula">
      <template #sello>
        <AppSello v-if="enCurso" tono="neutro">Período en curso</AppSello>
      </template>
      <template #acciones>
        <AppButton label="CSV" icon="ti ti-download" variant="outline" severity="secondary" :disabled="!reporte || cargando" @click="exportar" />
        <AppButton label="Imprimir / Guardar PDF" icon="ti ti-printer" :disabled="!reporte || cargando" @click="imprimir" />
      </template>
    </AppCaratula>

    <ReporteControles
      :periodo="periodo"
      :tecnico-id="filtros.tecnico"
      :tecnicos="tecnicos"
      :es-jefe="esJefe"
      :usuario-id="usuarioId"
      :primer-ticket="reporte?.primer_ticket_at || ''"
      :cargando="cargando"
      @update:periodo="fijarPeriodo"
      @update:tecnico-id="filtros.tecnico = $event"
    />

    <p data-no-print class="px-4 pt-3 text-xs text-gray-500 sm:hidden">Esta pantalla está pensada para escritorio.</p>

    <div class="space-y-8 px-4 pt-6 sm:px-6">
      <p v-if="cargando" class="text-sm text-gray-500" role="status">Generando el reporte…</p>

      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <template v-if="reporte && !cargando">
        <p class="text-sm text-gray-700">
          {{ subtitulo }}
          <span v-if="enCurso" class="text-gray-500"> · el período no terminó: las cifras siguen cambiando y no se compara con el anterior.</span>
          <span v-else-if="reporte.comparacion" class="text-gray-500">
            · comparado con {{ etiquetaPeriodo({ tipo: periodo.tipo === 'mes' ? 'mes' : 'rango', ...reporte.comparacion.periodo }) }}<template v-if="comparacionParcial"> (período anterior parcial: empieza antes del primer ticket registrado)</template>.
          </span>
        </p>
        <p v-if="versionDistinta" class="text-sm text-gray-700" role="status">
          El servidor calculó con las definiciones «{{ reporte.definiciones_version }}» y este glosario describe «{{ VERSION_DEFINICIONES }}»: lea las notas al pie con cautela.
        </p>

        <section v-for="s in secciones" :id="`reporte-${s.id}`" :key="s.id" class="space-y-4" :aria-labelledby="`reporte-${s.id}-titulo`">
          <div>
            <h2 :id="`reporte-${s.id}-titulo`" class="text-base font-semibold text-gray-900">{{ s.titulo }}</h2>
            <p v-if="s.nota" class="mt-1 max-w-prose text-xs text-gray-500">{{ s.nota }}</p>
          </div>
          <ReporteTabla v-for="(t, i) in s.tablas" :key="i" :titulo="t.titulo" :nota="t.nota" :columnas="t.columnas" :filas="t.filas" />
        </section>

        <section class="border-t border-gray-200 pt-4" aria-labelledby="reporte-glosario-titulo">
          <h2 id="reporte-glosario-titulo" class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Definiciones ({{ reporte.definiciones_version }})</h2>
          <dl class="mt-2 space-y-1 text-xs text-gray-700">
            <div v-for="g in GLOSARIO" :key="g.termino" class="flex gap-2">
              <dt class="shrink-0 font-medium text-gray-900">{{ g.termino }}:</dt>
              <dd>{{ g.definicion }}</dd>
            </div>
          </dl>
        </section>
      </template>
    </div>
  </div>
</template>
