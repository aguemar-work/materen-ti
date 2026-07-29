<script setup>
// Reporte de tickets (volumen/distribución, desempeño por técnico y
// satisfacción) para un periodo diario/semanal/mensual. Se ve en pantalla y
// se puede "Descargar" como documento imprimible (Guardar como PDF) para
// compartir con control/gerencia — ver reporte.js.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useTicketsStore } from '../../stores/tickets.js';
import { estadoInfo, prioridadInfo } from '../../core/dominio-tickets.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { exportarCSV } from '../../core/exportar.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import { showToast } from '../../core/toast.js';
import { generarReporteTickets } from './reporte.js';
import TextoVacio from '../../components/shared/TextoVacio.vue';

// Exportar CSV y "Descargar reporte" (PDF) cumplen la misma finalidad
// (sacar información de tickets para compartir/analizar) — viven juntos
// en este modal en vez de un botón aparte en el toolbar de la bandeja.
const ticketsStore = useTicketsStore();

const props = defineProps({
  staffPorId: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['cerrar']);

const visible = ref(true);
function cerrar() { visible.value = false; }
function emitirCierre() { emit('cerrar'); }

const panelModal = ref(null);
useFocoAtrapado(panelModal);
useCerrarConEscape(() => cerrar());

const PERIODOS = [
  { valor: 'diario', label: 'Diario' },
  { valor: 'semanal', label: 'Semanal' },
  { valor: 'mensual', label: 'Mensual' },
];

const periodo = ref('semanal');
const cargando = ref(true);
const error = ref('');
const datos = ref(null);
const rango = ref({ desde: new Date(), hasta: new Date() });

function calcularRango(p) {
  const hasta = new Date();
  const desde = new Date(hasta);
  if (p === 'diario') desde.setHours(0, 0, 0, 0);
  else if (p === 'semanal') desde.setDate(desde.getDate() - 7);
  else desde.setDate(desde.getDate() - 30);
  return { desde, hasta };
}

const rangoLabel = computed(() => `${formatFecha(rango.value.desde.toISOString())} — ${formatFecha(rango.value.hasta.toISOString())}`);
const periodoLabel = computed(() => PERIODOS.find((p) => p.valor === periodo.value)?.label || '');

const porPrioridadLabel = computed(() =>
  (datos.value?.porPrioridad || []).map((c) => ({ clave: prioridadInfo(c.clave).label, cantidad: c.cantidad })),
);
const porEstadoLabel = computed(() =>
  (datos.value?.porEstado || []).map((c) => ({ clave: estadoInfo(c.clave).label, cantidad: c.cantidad })),
);
const porTecnicoNombres = computed(() => {
  if (!datos.value) return [];
  return Object.entries(datos.value.porTecnico)
    .map(([staffId, cantidad]) => ({
      nombre: staffId === 'sin_asignar' ? 'Sin asignar' : (props.staffPorId[staffId] || 'Staff'),
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
});
const tasaRespuesta = computed(() => {
  if (!datos.value || !datos.value.encuestasEnviadas) return 0;
  return Math.round((datos.value.encuestasRespondidas / datos.value.encuestasEnviadas) * 100);
});

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const { desde, hasta } = calcularRango(periodo.value);
    rango.value = { desde, hasta };
    datos.value = await insforgeApi.obtenerReporteTickets({ desde: desde.toISOString(), hasta: hasta.toISOString() });
  } catch (e) {
    error.value = e?.message || 'Error al cargar el reporte';
  } finally {
    cargando.value = false;
  }
}

function cambiarPeriodo(p) {
  if (p === periodo.value || cargando.value) return;
  periodo.value = p;
  cargar();
}

function descargar() {
  try {
    generarReporteTickets(
      {
        ...datos.value,
        porPrioridadLabel: porPrioridadLabel.value,
        porEstadoLabel: porEstadoLabel.value,
        porTecnicoNombres: porTecnicoNombres.value,
      },
      periodoLabel.value,
      rangoLabel.value,
    );
  } catch (e) {
    showToast(e?.message || 'No se pudo generar el reporte', 'error');
  }
}

// Exporta el dataset de la BANDEJA con los filtros que el staff tenía
// aplicados (no el periodo del reporte, que es un recorte distinto).
const exportando = ref(false);
async function exportarCsv() {
  exportando.value = true;
  try {
    const filas = await ticketsStore.listaParaExportar();
    exportarCSV(
      'tickets',
      ['Código', 'Fecha', 'Solicitante', 'Título', 'Categoría', 'Estado', 'Prioridad', 'Asignado a'],
      filas.map((t) => [
        t.codigo,
        formatFechaHora(t.created_at),
        t.vinculado ? t.solicitante : 'Sin vincular',
        t.titulo,
        t.categoria,
        estadoInfo(t.estado).label,
        prioridadInfo(t.prioridad).label,
        t.asignado_a ? (props.staffPorId[t.asignado_a] || 'Staff') : 'Sin asignar',
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <Transition name="modal-anim" appear @after-leave="emitirCierre">
    <div v-if="visible" class="modal-bg" @click.self="cerrar">
      <div ref="panelModal" class="modal modal-lg reporte-modal" role="dialog" aria-modal="true" aria-labelledby="rep-title" tabindex="-1">
        <div class="modal-title">
          <span id="rep-title"><i class="ti ti-report" aria-hidden="true"></i> Reporte de tickets</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="cerrar"><i class="ti ti-x"></i></button>
        </div>

        <div class="modal-body rep-body">
          <div class="rep-periodos">
            <button
              v-for="p in PERIODOS"
              :key="p.valor"
              type="button"
              class="btn"
              :class="{ 'btn-primary': periodo === p.valor }"
              :disabled="cargando"
              @click="cambiarPeriodo(p.valor)"
            >{{ p.label }}</button>
            <span class="rep-rango">{{ rangoLabel }}</span>
          </div>

          <div v-if="cargando" class="no-results">Calculando reporte...</div>
          <p v-else-if="error" class="form-error" role="alert">{{ error }}</p>

          <template v-else-if="datos">
            <div class="rep-kpis">
              <div class="rep-kpi"><span class="rep-kpi-valor">{{ datos.totalCreados }}</span><span class="rep-kpi-label">Creados</span></div>
              <div class="rep-kpi"><span class="rep-kpi-valor">{{ datos.totalResueltos }}</span><span class="rep-kpi-label">Resueltos</span></div>
              <div class="rep-kpi"><span class="rep-kpi-valor">{{ datos.promedioSatisfaccion !== null ? datos.promedioSatisfaccion.toFixed(1) : '—' }}/5</span><span class="rep-kpi-label">Satisfacción</span></div>
              <div class="rep-kpi"><span class="rep-kpi-valor">{{ tasaRespuesta }}%</span><span class="rep-kpi-label">Tasa de respuesta</span></div>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Volumen y distribución</div>
              <div class="rep-cols">
                <table class="rep-tabla">
                  <thead><tr><th>Categoría</th><th class="num">Cant.</th></tr></thead>
                  <tbody>
                    <tr v-for="c in datos.porCategoria" :key="c.clave"><td>{{ c.clave }}</td><td class="num">{{ c.cantidad }}</td></tr>
                    <tr v-if="!datos.porCategoria.length"><td colspan="2" class="rep-vacio">Sin datos</td></tr>
                  </tbody>
                </table>
                <table class="rep-tabla">
                  <thead><tr><th>Prioridad</th><th class="num">Cant.</th></tr></thead>
                  <tbody>
                    <tr v-for="c in porPrioridadLabel" :key="c.clave"><td>{{ c.clave }}</td><td class="num">{{ c.cantidad }}</td></tr>
                    <tr v-if="!porPrioridadLabel.length"><td colspan="2" class="rep-vacio">Sin datos</td></tr>
                  </tbody>
                </table>
                <table class="rep-tabla">
                  <thead><tr><th>Estado</th><th class="num">Cant.</th></tr></thead>
                  <tbody>
                    <tr v-for="c in porEstadoLabel" :key="c.clave"><td>{{ c.clave }}</td><td class="num">{{ c.cantidad }}</td></tr>
                    <tr v-if="!porEstadoLabel.length"><td colspan="2" class="rep-vacio">Sin datos</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Desempeño por técnico</div>
              <table class="rep-tabla">
                <thead><tr><th>Técnico</th><th class="num">Resueltos</th></tr></thead>
                <tbody>
                  <tr v-for="t in porTecnicoNombres" :key="t.nombre"><td>{{ t.nombre }}</td><td class="num">{{ t.cantidad }}</td></tr>
                  <tr v-if="!porTecnicoNombres.length"><td colspan="2" class="rep-vacio">Sin tickets resueltos en el periodo</td></tr>
                </tbody>
              </table>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Tickets del periodo por solicitante</div>
              <table class="rep-tabla">
                <thead>
                  <tr>
                    <th>Solicitante</th>
                    <th class="num">Total tickets</th>
                    <th class="num">Resueltos</th>
                    <th class="num">Sin resolver</th>
                    <th class="num">Encuestas contestadas</th>
                    <th class="num">Encuestas pendientes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in datos.porSolicitante" :key="s.solicitante">
                    <td><TextoVacio :valor="s.solicitante" /></td>
                    <td class="num">{{ s.total }}</td>
                    <td class="num">{{ s.resueltos }}</td>
                    <td class="num">{{ s.sinResolver }}</td>
                    <td class="num">{{ s.encuestasContestadas }}</td>
                    <td class="num">{{ s.encuestasPendientes }}</td>
                  </tr>
                  <tr v-if="!datos.porSolicitante.length"><td colspan="6" class="rep-vacio">Sin tickets creados en el periodo</td></tr>
                </tbody>
              </table>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Satisfacción del servicio</div>
              <p class="tk-detalle">{{ datos.encuestasRespondidas }} de {{ datos.encuestasEnviadas }} encuestas respondidas ({{ tasaRespuesta }}%)</p>
              <ul v-if="datos.comentarios.length" class="rep-comentarios">
                <li v-for="(c, i) in datos.comentarios" :key="i"><strong>{{ c.nivel }}/5</strong> — {{ c.comentario }} <span class="rep-fecha">({{ formatFecha(c.fecha) }})</span></li>
              </ul>
              <p v-else class="tk-nota">Sin comentarios en el periodo.</p>
            </div>
          </template>
        </div>

        <div class="modal-actions">
          <button class="btn" type="button" @click="cerrar">Cerrar</button>
          <button class="btn" type="button" :disabled="exportando" @click="exportarCsv">
            <i :class="exportando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-table-export'" aria-hidden="true"></i>
            {{ exportando ? 'Exportando...' : 'Exportar CSV' }}
          </button>
          <button class="btn btn-primary" type="button" :disabled="cargando || !datos" @click="descargar">
            <i class="ti ti-download" aria-hidden="true"></i> Descargar reporte
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rep-body { display: flex; flex-direction: column; gap: 16px; }

.rep-periodos { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rep-rango { font-size: var(--fs-sm); color: var(--color-text-secondary); margin-left: auto; }

.rep-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.rep-kpi { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 10px; text-align: center; }
.rep-kpi-valor { display: block; font-size: var(--fs-xl); font-weight: 600; }
.rep-kpi-label { font-size: var(--fs-sm); color: var(--color-text-secondary); }

.rep-seccion { border-top: 1px solid var(--color-border); padding-top: 12px; }
.rep-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

.rep-tabla { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.rep-tabla th, .rep-tabla td { padding: 5px 8px; border-bottom: 1px solid var(--color-border); text-align: left; }
.rep-tabla .num { text-align: right; }
.rep-vacio { color: var(--color-text-tertiary); font-style: italic; text-align: center; }
.rep-codigo { font-family: var(--font-mono, monospace); white-space: nowrap; }

.rep-comentarios { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rep-comentarios li { font-size: var(--fs-base); border-bottom: 1px solid var(--color-border); padding-bottom: 6px; }
.rep-fecha { color: var(--color-text-tertiary); font-size: var(--fs-sm); }

@media (max-width: 768px) {
  .rep-cols { grid-template-columns: 1fr; }
  .rep-kpis { grid-template-columns: repeat(2, 1fr); }
}
</style>
