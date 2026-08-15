<script setup>
// Reporte de tickets para un periodo diario/semanal/mensual: volumen y
// distribución, tiempos y calidad de la atención, backlog, desempeño por
// técnico y satisfacción. Se ve en pantalla y se descarga como PDF para
// compartir con control/gerencia — ver reporte.js.
//
// El periodo es un recorte de CALENDARIO elegible (un día, una semana o un mes
// concretos, navegables con las flechas), no una ventana móvil desde hoy —
// la aritmética de fechas vive en reportePeriodo.js.
import { ref, computed, nextTick, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useTicketsStore } from '../../stores/tickets.js';
import { estadoInfo, prioridadInfo, OPCIONES_TIPO } from '../../core/dominio-tickets.js';
import { formatFecha, formatFechaHora, formatHoras, formatDelta } from '../../core/formatters.js';
import { exportarCSV } from '../../core/exportar.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import { showToast } from '../../core/toast.js';
import { generarReporteTickets } from './reporte.js';
import {
  PERIODOS, MESES, aISO, anclaDeHoy, normalizarAncla, limitarAncla, desplazarAncla,
  rangoDe, enCurso, puedeAvanzar, etiquetaRango, etiquetaPeriodo, etiquetaCompacta,
  nombreArchivoReporte, aniosDisponibles,
} from './reportePeriodo.js';
import TextoVacio from '../../components/shared/TextoVacio.vue';

// Las exportaciones (CSV del periodo, CSV de la bandeja) y el PDF cumplen la
// misma finalidad —sacar información de tickets para compartir o analizar— así
// que viven juntas acá en vez de repartidas por el toolbar de la bandeja.
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

const periodo = ref('semanal');
const ancla = ref(anclaDeHoy('semanal'));
const cargando = ref(true);
const error = ref('');
const datos = ref(null);

const rangoLabel = computed(() => etiquetaRango(periodo.value, ancla.value));
const periodoLabel = computed(() => etiquetaPeriodo(periodo.value, ancla.value));
const periodoEnCurso = computed(() => enCurso(periodo.value, ancla.value));
const hayPeriodoSiguiente = computed(() => puedeAvanzar(periodo.value, ancla.value));
const esPeriodoActual = computed(() => ancla.value === anclaDeHoy(periodo.value));

// Selector del periodo mensual: mes + año (no <input type="month">, que
// Firefox y Safari degradan a un campo de texto libre).
const anios = aniosDisponibles();
const mesElegido = computed(() => Number(ancla.value.slice(5, 7)) - 1);
const anioElegido = computed(() => Number(ancla.value.slice(0, 4)));
const hoyMes = new Date().getMonth();
const hoyAnio = new Date().getFullYear();
const maxDia = aISO(new Date());

function anclaMensual(mes, anio) {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
}

const porPrioridadLabel = computed(() =>
  (datos.value?.porPrioridad || []).map((c) => ({ clave: prioridadInfo(c.clave).label, cantidad: c.cantidad })),
);
const TIPO_LABELS = { ...Object.fromEntries(OPCIONES_TIPO.map((t) => [t.valor, t.label])), sin_clasificar: 'Sin clasificar' };
const porTipoLabel = computed(() =>
  (datos.value?.porTipo || []).map((c) => ({ clave: TIPO_LABELS[c.clave] || c.clave, cantidad: c.cantidad })),
);
const porTecnicoNombres = computed(() => {
  if (!datos.value) return [];
  const tiempos = datos.value.tiempoPorTecnico || {};
  return Object.entries(datos.value.porTecnico)
    .map(([staffId, resumen]) => ({
      nombre: staffId === 'sin_asignar' ? 'Sin asignar' : (props.staffPorId[staffId] || 'Staff'),
      cantidad: resumen.total,
      mismoPeriodo: resumen.mismoPeriodo,
      arrastrados: resumen.arrastrados,
      promedio: tiempos[staffId]?.promedio ?? null,
      mediana: tiempos[staffId]?.mediana ?? null,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
});
// Detalle de los tickets resueltos en el periodo que venían de antes, con el
// nombre del técnico ya resuelto (mismo criterio que porTecnicoNombres).
const arrastradosNombres = computed(() => {
  if (!datos.value) return [];
  return (datos.value.arrastrados || []).map((a) => ({
    ...a,
    tecnico: a.tecnicoId ? (props.staffPorId[a.tecnicoId] || 'Staff') : 'Sin asignar',
  }));
});
// Prioridades en el orden del dominio (urgente → baja), no por cantidad: acá se
// compara el tiempo de atención entre prioridades y el orden importa.
const tiempoPorPrioridadLabel = computed(() => {
  const tiempos = datos.value?.tiempoPorPrioridad || {};
  return ['urgente', 'alta', 'media', 'baja', 'sin_definir']
    .filter((p) => tiempos[p])
    .map((p) => ({
      clave: p === 'sin_definir' ? 'Sin definir' : prioridadInfo(p).label,
      ...tiempos[p],
    }));
});
// Sobre las encuestas generadas al cerrar el ticket: todas son alcanzables
// (por el enlace del correo o buscando el ticket por DNI en el portal), así
// que todas cuentan en el denominador.
const tasaRespuesta = computed(() => {
  if (!datos.value || !datos.value.encuestasGeneradas) return 0;
  return Math.round((datos.value.encuestasRespondidas / datos.value.encuestasGeneradas) * 100);
});

// Sin canal de aviso por correo (retirado, migración 055) la tasa de
// respuesta depende de que el empleado busque su ticket por su cuenta — no es
// comparable a como se leía antes, así que queda oculta salvo que se pida.
const incluirTasaRespuesta = ref(false);

// Desglose del KPI "Resueltos": "de hoy/esta semana/este mes" según el
// periodo elegido, para no decir "del periodo" en abstracto.
const etiquetaResueltosMismoPeriodo = computed(() => {
  if (periodo.value === 'diario') return 'de hoy';
  if (periodo.value === 'semanal') return 'de esta semana';
  return 'de este mes';
});
// Misma idea, como encabezado de columna en la tabla de técnicos.
const etiquetaColMismoPeriodo = computed(() => {
  if (periodo.value === 'diario') return 'Hoy';
  if (periodo.value === 'semanal') return 'Esta semana';
  return 'Este mes';
});

// Comparativa contra el periodo anterior equivalente (mes contra mes, semana
// contra semana). Es un resumen liviano aparte: no hace falta traer todas las
// distribuciones del periodo pasado para mostrar cuatro variaciones. Si falla,
// el reporte se muestra igual y solo se omite la comparativa.
const comparativa = ref(null);
const etiquetaAnterior = computed(() => etiquetaCompacta(periodo.value, desplazarAncla(periodo.value, ancla.value, -1)));

function deltaDe(campo, decimales = 0, sufijo = '') {
  if (!datos.value || !comparativa.value) return null;
  const actual = campo === 'tasaRespuesta' ? tasaRespuesta.value : datos.value[campo];
  return formatDelta(actual, comparativa.value[campo], decimales, sufijo);
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  comparativa.value = null;
  try {
    const { desde, hasta } = rangoDe(periodo.value, ancla.value);
    // El diario no compara contra "el día anterior": un día suelto no es
    // representativo (para eso está el reporte semanal/mensual) y el delta
    // salía engañoso comparando un día a medias contra uno ya cerrado.
    const incluirComparativa = periodo.value !== 'diario';
    const anterior = incluirComparativa ? rangoDe(periodo.value, desplazarAncla(periodo.value, ancla.value, -1)) : null;
    const [reporte, resumenAnterior] = await Promise.all([
      insforgeApi.obtenerReporteTickets({ desde: desde.toISOString(), hasta: hasta.toISOString() }),
      incluirComparativa
        ? insforgeApi.obtenerResumenTickets({ desde: anterior.desde.toISOString(), hasta: anterior.hasta.toISOString() }).catch(() => null)
        : Promise.resolve(null),
    ]);
    datos.value = reporte;
    comparativa.value = resumenAnterior;
  } catch (e) {
    error.value = e?.message || 'Error al cargar el reporte';
  } finally {
    cargando.value = false;
  }
}

// Punto único de cambio de recorte: limita a periodos ya empezados y recarga
// solo si el rango efectivamente cambió.
function aplicarPeriodo(nuevoPeriodo, nuevaAncla) {
  if (cargando.value) return;
  const anclaFinal = limitarAncla(nuevoPeriodo, nuevaAncla);
  if (nuevoPeriodo === periodo.value && anclaFinal === ancla.value) return;
  periodo.value = nuevoPeriodo;
  ancla.value = anclaFinal;
  cargar();
}

// Al cambiar de granularidad se conserva la fecha vista: de la semana del
// 03/08 se pasa a agosto y de ahí al 01/08. Si el recorte en pantalla incluye
// hoy, se mantiene hoy (de la semana en curso al día de hoy, no al lunes).
function cambiarPeriodo(p) {
  aplicarPeriodo(p, periodoEnCurso.value ? anclaDeHoy(p) : normalizarAncla(p, ancla.value));
}

function mover(delta) {
  aplicarPeriodo(periodo.value, desplazarAncla(periodo.value, ancla.value, delta));
}

function irAlActual() {
  aplicarPeriodo(periodo.value, anclaDeHoy(periodo.value));
}

// Los campos se atan con :value + @change (no v-model) porque el ancla se
// normaliza y se limita: hay que devolver el control al valor realmente
// reportado cuando el cambio se ajustó (semana del lunes) o se descartó
// (fecha futura tecleada a mano, campo borrado).
async function elegirDia(e) {
  const campo = e.target;
  if (campo.value) aplicarPeriodo(periodo.value, campo.value);
  await nextTick();
  campo.value = ancla.value;
}

async function elegirMes(e) {
  const campo = e.target;
  aplicarPeriodo('mensual', anclaMensual(Number(campo.value), anioElegido.value));
  await nextTick();
  campo.value = String(mesElegido.value);
}

async function elegirAnio(e) {
  const campo = e.target;
  aplicarPeriodo('mensual', anclaMensual(mesElegido.value, Number(campo.value)));
  await nextTick();
  campo.value = String(anioElegido.value);
}

// Descarga el PDF directamente (sin diálogo de impresión). Es asíncrona porque
// el generador carga jsPDF bajo demanda; la primera descarga de la sesión tarda
// lo que pesa esa librería, de ahí el estado en el botón.
const descargando = ref(false);
async function descargar() {
  descargando.value = true;
  try {
    await generarReporteTickets(
      {
        ...datos.value,
        porPrioridadLabel: porPrioridadLabel.value,
        porTipoLabel: porTipoLabel.value,
        porTecnicoNombres: porTecnicoNombres.value,
        tiempoPorPrioridadLabel: tiempoPorPrioridadLabel.value,
        arrastradosNombres: arrastradosNombres.value,
      },
      {
        periodoLabel: periodoLabel.value,
        rangoLabel: rangoLabel.value,
        nombreArchivo: nombreArchivoReporte(periodo.value, ancla.value),
        enCurso: periodoEnCurso.value,
        comparativa: comparativa.value ? { ...comparativa.value, etiqueta: etiquetaAnterior.value } : null,
        incluirTasaRespuesta: incluirTasaRespuesta.value,
        etiquetaResueltosMismoPeriodo: etiquetaResueltosMismoPeriodo.value,
        etiquetaColMismoPeriodo: etiquetaColMismoPeriodo.value,
      },
    );
  } catch (e) {
    showToast(e?.message || 'No se pudo generar el PDF', 'error');
  } finally {
    descargando.value = false;
  }
}

const CABECERA_CSV = ['Código', 'Fecha', 'Solicitante', 'Título', 'Categoría', 'Tipo', 'Estado', 'Prioridad', 'Asignado a'];

function filaCsv(t) {
  return [
    t.codigo,
    formatFechaHora(t.created_at),
    t.solicitante || 'Sin vincular',
    t.titulo,
    t.categoria,
    TIPO_LABELS[t.tipo || 'sin_clasificar'] || '',
    estadoInfo(t.estado).label,
    prioridadInfo(t.prioridad).label,
    t.asignado_a ? (props.staffPorId[t.asignado_a] || 'Staff') : 'Sin asignar',
  ];
}

// Dos exportaciones distintas y etiquetadas como tales: la del PERIODO (el
// mismo recorte que el reporte en pantalla) y la de la BANDEJA (los filtros que
// el staff tenía puestos). Antes solo existía la segunda con el rótulo de la
// primera, que era justo lo confuso.
const exportandoPeriodo = ref(false);
async function exportarCsvPeriodo() {
  exportandoPeriodo.value = true;
  try {
    const { desde, hasta } = rangoDe(periodo.value, ancla.value);
    const filas = await insforgeApi.listarTicketsDelPeriodo({ desde: desde.toISOString(), hasta: hasta.toISOString() });
    exportarCSV(`tickets_${nombreArchivoReporte(periodo.value, ancla.value)}`, CABECERA_CSV, filas.map(filaCsv));
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportandoPeriodo.value = false;
  }
}

const exportando = ref(false);
async function exportarCsv() {
  exportando.value = true;
  try {
    const filas = await ticketsStore.listaParaExportar();
    exportarCSV('tickets_bandeja', CABECERA_CSV, filas.map((t) => filaCsv({
      ...t,
      solicitante: t.vinculado ? t.solicitante : 'Sin vincular',
    })));
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
            <div class="rep-granularidad" role="group" aria-label="Tipo de periodo">
              <button
                v-for="p in PERIODOS"
                :key="p.valor"
                type="button"
                class="btn"
                :class="{ 'is-activo': periodo === p.valor }"
                :disabled="cargando"
                :aria-pressed="periodo === p.valor"
                @click="cambiarPeriodo(p.valor)"
              >{{ p.label }}</button>
            </div>

            <div class="rep-nav">
              <button
                class="icon-btn"
                type="button"
                :disabled="cargando"
                :aria-label="periodo === 'diario' ? 'Día anterior' : periodo === 'semanal' ? 'Semana anterior' : 'Mes anterior'"
                @click="mover(-1)"
              ><i class="ti ti-chevron-left" aria-hidden="true"></i></button>

              <template v-if="periodo === 'mensual'">
                <select
                  class="rep-campo"
                  aria-label="Mes del reporte"
                  :value="mesElegido"
                  :disabled="cargando"
                  @change="elegirMes"
                >
                  <option
                    v-for="(nombre, i) in MESES"
                    :key="nombre"
                    :value="i"
                    :disabled="anioElegido === hoyAnio && i > hoyMes"
                  >{{ nombre }}</option>
                </select>
                <select
                  class="rep-campo rep-campo-anio"
                  aria-label="Año del reporte"
                  :value="anioElegido"
                  :disabled="cargando"
                  @change="elegirAnio"
                >
                  <option v-for="a in anios" :key="a" :value="a">{{ a }}</option>
                </select>
              </template>
              <input
                v-else
                class="rep-campo"
                type="date"
                :value="ancla"
                :max="maxDia"
                :disabled="cargando"
                :aria-label="periodo === 'diario' ? 'Día del reporte' : 'Semana del reporte (cualquier día de la semana)'"
                @change="elegirDia"
              >

              <button
                class="icon-btn"
                type="button"
                :disabled="cargando || !hayPeriodoSiguiente"
                :aria-label="periodo === 'diario' ? 'Día siguiente' : periodo === 'semanal' ? 'Semana siguiente' : 'Mes siguiente'"
                @click="mover(1)"
              ><i class="ti ti-chevron-right" aria-hidden="true"></i></button>

              <button class="btn" type="button" :disabled="cargando || esPeriodoActual" @click="irAlActual">Actual</button>
            </div>

            <span class="rep-rango">
              {{ rangoLabel }}
              <span v-if="periodoEnCurso" class="rep-encurso">En curso</span>
            </span>
          </div>

          <div v-if="cargando" class="no-results">Calculando reporte...</div>
          <p v-else-if="error" class="form-error" role="alert">{{ error }}</p>

          <template v-else-if="datos">
            <label class="rep-toggle-tasa">
              <input v-model="incluirTasaRespuesta" type="checkbox">
              Incluir tasa de respuesta de encuestas
            </label>
            <div class="rep-kpis" :class="{ 'rep-kpis-3col': !incluirTasaRespuesta }">
              <div class="rep-kpi">
                <span class="rep-kpi-valor">{{ datos.totalCreados }}</span>
                <span class="rep-kpi-label">Creados</span>
                <span v-if="deltaDe('totalCreados')" class="rep-kpi-delta">{{ deltaDe('totalCreados') }}</span>
              </div>
              <div class="rep-kpi">
                <span class="rep-kpi-valor">{{ datos.totalResueltos }}</span>
                <span class="rep-kpi-label">Resueltos</span>
                <span v-if="deltaDe('totalResueltos')" class="rep-kpi-delta">{{ deltaDe('totalResueltos') }}</span>
                <span class="rep-kpi-desglose">{{ datos.resueltosMismoPeriodo }} {{ etiquetaResueltosMismoPeriodo }} · {{ datos.resueltosArrastrados }} anteriores</span>
              </div>
              <div class="rep-kpi">
                <span class="rep-kpi-valor">{{ datos.promedioSatisfaccion !== null ? datos.promedioSatisfaccion.toFixed(1) : '—' }}/5</span>
                <span class="rep-kpi-label">Satisfacción</span>
                <span v-if="deltaDe('promedioSatisfaccion', 1)" class="rep-kpi-delta">{{ deltaDe('promedioSatisfaccion', 1) }}</span>
              </div>
              <div v-if="incluirTasaRespuesta" class="rep-kpi">
                <span class="rep-kpi-valor">{{ tasaRespuesta }}%</span>
                <span class="rep-kpi-label">Tasa de respuesta</span>
                <span v-if="deltaDe('tasaRespuesta', 0, ' pp')" class="rep-kpi-delta">{{ deltaDe('tasaRespuesta', 0, ' pp') }}</span>
              </div>
            </div>
            <p v-if="comparativa" class="rep-comparativa">Variación respecto a {{ etiquetaAnterior }}</p>

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
                  <thead><tr><th>Tipo</th><th class="num">Cant.</th></tr></thead>
                  <tbody>
                    <tr v-for="c in porTipoLabel" :key="c.clave"><td>{{ c.clave }}</td><td class="num">{{ c.cantidad }}</td></tr>
                    <tr v-if="!porTipoLabel.length"><td colspan="2" class="rep-vacio">Sin datos</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Tiempos y calidad de la atención</div>
              <div class="rep-kpis rep-kpis-3">
                <div class="rep-kpi">
                  <span class="rep-kpi-valor">{{ formatHoras(datos.tiempoResolucion?.promedio) }}</span>
                  <span class="rep-kpi-label">Tiempo medio</span>
                </div>
                <div class="rep-kpi">
                  <span class="rep-kpi-valor">{{ formatHoras(datos.tiempoResolucion?.mediana) }}</span>
                  <span class="rep-kpi-label">Mediana</span>
                </div>
                <div class="rep-kpi">
                  <span class="rep-kpi-valor">{{ datos.tasaReapertura === null ? '—' : datos.tasaReapertura + '%' }}</span>
                  <span class="rep-kpi-label">Tasa de reapertura</span>
                </div>
              </div>
              <table class="rep-tabla">
                <thead><tr><th>Prioridad</th><th class="num">Resueltos</th><th class="num">Tiempo medio</th><th class="num">Mediana</th></tr></thead>
                <tbody>
                  <tr v-for="f in tiempoPorPrioridadLabel" :key="f.clave">
                    <td>{{ f.clave }}</td>
                    <td class="num">{{ f.muestra }}</td>
                    <td class="num">{{ formatHoras(f.promedio) }}</td>
                    <td class="num">{{ formatHoras(f.mediana) }}</td>
                  </tr>
                  <tr v-if="!tiempoPorPrioridadLabel.length"><td colspan="4" class="rep-vacio">Sin tickets resueltos en el periodo</td></tr>
                </tbody>
              </table>
              <p class="tk-nota">
                {{ datos.reaperturas }} reapertura(s) sobre {{ datos.totalResueltos }} ticket(s) resueltos en el periodo.
              </p>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Desempeño por técnico</div>
              <table class="rep-tabla">
                <thead>
                  <tr>
                    <th>Técnico</th>
                    <th class="num">Resueltos</th>
                    <th class="num">{{ etiquetaColMismoPeriodo }}</th>
                    <th class="num">Anteriores</th>
                    <th class="num">Tiempo medio</th>
                    <th class="num">Mediana</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in porTecnicoNombres" :key="t.nombre">
                    <td>{{ t.nombre }}</td>
                    <td class="num">{{ t.cantidad }}</td>
                    <td class="num">{{ t.mismoPeriodo }}</td>
                    <td class="num">{{ t.arrastrados }}</td>
                    <td class="num">{{ formatHoras(t.promedio) }}</td>
                    <td class="num">{{ formatHoras(t.mediana) }}</td>
                  </tr>
                  <tr v-if="!porTecnicoNombres.length"><td colspan="6" class="rep-vacio">Sin tickets resueltos en el periodo</td></tr>
                </tbody>
              </table>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Tickets anteriores resueltos en el periodo</div>
              <div class="table-wrap">
                <table class="rep-tabla rep-tabla-ancha">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Título</th>
                      <th>Técnico</th>
                      <th>Creado el</th>
                      <th class="num">Días abierto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in arrastradosNombres" :key="a.codigo">
                      <td class="rep-codigo">{{ a.codigo }}</td>
                      <td>{{ a.titulo }}</td>
                      <td>{{ a.tecnico }}</td>
                      <td>{{ formatFecha(a.creadoEn) }}</td>
                      <td class="num">{{ a.diasAbierto }}</td>
                    </tr>
                    <tr v-if="!arrastradosNombres.length"><td colspan="5" class="rep-vacio">Sin tickets arrastrados resueltos en el periodo</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Tickets del periodo por solicitante</div>
              <!-- 7 columnas: en pantallas angostas la tabla scrollea sola en
                   vez de desbordar el modal (.table-wrap, patrón del sistema). -->
              <div class="table-wrap">
                <table class="rep-tabla rep-tabla-ancha">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th class="num">Total</th>
                      <th class="num">Ticket creado</th>
                      <th class="num">Ticket resuelto</th>
                      <th class="num">Rechazado</th>
                      <th class="num">Enc. contestadas</th>
                      <th class="num">Enc. pendientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in datos.porSolicitante" :key="s.solicitante">
                      <td><TextoVacio :valor="s.solicitante" /></td>
                      <td class="num">{{ s.total }}</td>
                      <td class="num">{{ s.creados }}</td>
                      <td class="num">{{ s.resueltos }}</td>
                      <td class="num">{{ s.rechazados }}</td>
                      <td class="num">{{ s.encuestasContestadas }}</td>
                      <td class="num">{{ s.encuestasPendientes }}</td>
                    </tr>
                    <tr v-if="!datos.porSolicitante.length"><td colspan="7" class="rep-vacio">Sin tickets creados en el periodo</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Satisfacción del servicio</div>
              <p class="tk-detalle">{{ datos.encuestasRespondidas }} de {{ datos.encuestasGeneradas }} encuestas respondidas ({{ tasaRespuesta }}%)</p>
              <p v-if="datos.comentariosTotal > datos.comentarios.length" class="tk-nota">
                Se muestran los {{ datos.comentarios.length }} comentarios más recientes de {{ datos.comentariosTotal }}.
              </p>
              <ul v-if="datos.comentarios.length" class="rep-comentarios">
                <li v-for="(c, i) in datos.comentarios" :key="i"><strong>{{ c.nivel }}/5</strong> — {{ c.comentario }} <span class="rep-fecha">({{ formatFechaHora(c.fecha) }})</span></li>
              </ul>
              <p v-else class="tk-nota">Sin comentarios en el periodo.</p>
            </div>
          </template>
        </div>

        <div class="modal-actions">
          <button class="btn" type="button" @click="cerrar">Cerrar</button>
          <button
            class="btn"
            type="button"
            :disabled="cargando || exportandoPeriodo"
            title="Exporta los tickets del periodo del reporte"
            @click="exportarCsvPeriodo"
          >
            <i :class="exportandoPeriodo ? 'ti ti-loader-2 spinner-icon' : 'ti ti-table-export'" aria-hidden="true"></i>
            {{ exportandoPeriodo ? 'Exportando...' : 'CSV del periodo' }}
          </button>
          <button
            class="btn"
            type="button"
            :disabled="exportando"
            title="Exporta la bandeja con los filtros aplicados, no el periodo del reporte"
            @click="exportarCsv"
          >
            <i :class="exportando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-table-export'" aria-hidden="true"></i>
            {{ exportando ? 'Exportando...' : 'CSV de la bandeja' }}
          </button>
          <button class="btn btn-primary" type="button" :disabled="cargando || descargando || !datos" @click="descargar">
            <i :class="descargando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-download'" aria-hidden="true"></i>
            {{ descargando ? 'Generando PDF...' : 'Descargar PDF' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rep-body { display: flex; flex-direction: column; gap: 16px; }

.rep-periodos { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rep-granularidad, .rep-nav { display: flex; align-items: center; gap: 6px; }
.rep-nav { padding-left: 8px; border-left: 1px solid var(--color-border-subtle); }

/* Selector segmentado (no es la acción principal del modal, es un estado de
   selección) — mismo par tenue-acento que .chip-filtro--activo en vez de
   .btn-primary, para no competir con "Descargar PDF". */
.rep-granularidad .btn.is-activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
  border-color: var(--color-accent-subtle);
}

.rep-campo {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--fs-base);
  font-family: var(--font-sans);
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rep-campo:focus { outline: none; border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--mat-ring); }
.rep-campo:disabled { opacity: 0.6; cursor: not-allowed; }
select.rep-campo { cursor: pointer; }
.rep-campo-anio { min-width: 84px; }

.rep-rango { font-size: var(--fs-sm); color: var(--color-text-secondary); margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.rep-encurso {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-subtle);
  color: var(--color-text-tertiary);
}

.rep-toggle-tasa {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  cursor: pointer;
  margin-bottom: 4px;
}

.rep-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.rep-kpis-3, .rep-kpis-3col { grid-template-columns: repeat(3, 1fr); }
.rep-kpis-3 { margin-bottom: 10px; }
.rep-kpi { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 10px; text-align: center; }
.rep-kpi-valor { display: block; font-size: var(--fs-xl); font-weight: 600; }
.rep-kpi-label { font-size: var(--fs-sm); color: var(--color-text-secondary); }
/* La variación no se pinta de verde/rojo: "más creados" no es bueno ni malo por
   sí mismo y el color le pondría un juicio que el dato no tiene. */
.rep-kpi-delta { display: block; margin-top: 2px; font-size: 11px; color: var(--color-text-tertiary); }
.rep-kpi-desglose { display: block; margin-top: 2px; font-size: 11px; color: var(--color-text-tertiary); }
.rep-comparativa { margin: -8px 0 0; font-size: var(--fs-sm); color: var(--color-text-tertiary); text-align: right; }

.rep-seccion { border-top: 1px solid var(--color-border); padding-top: 12px; }
/* Tres conteos (categoría, prioridad, tipo): caben en una sola fila dentro de
   los 680px de .modal-lg sin partir los encabezados. */
.rep-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

.rep-tabla { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.rep-tabla-ancha { min-width: 620px; }
.rep-tabla-ancha .num { white-space: nowrap; }
.rep-tabla th, .rep-tabla td { padding: 5px 8px; border-bottom: 1px solid var(--color-border); text-align: left; }
.rep-tabla .num { text-align: right; }
.rep-vacio { color: var(--color-text-tertiary); font-style: italic; text-align: center; }
.rep-codigo { font-family: var(--font-mono, monospace); white-space: nowrap; }

.rep-comentarios { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rep-comentarios li { font-size: var(--fs-base); border-bottom: 1px solid var(--color-border); padding-bottom: 6px; }
.rep-fecha { color: var(--color-text-tertiary); font-size: var(--fs-sm); }

@media (max-width: 768px) {
  .rep-cols { grid-template-columns: 1fr; }
  .rep-kpis, .rep-kpis-3, .rep-kpis-3col { grid-template-columns: repeat(2, 1fr); }
  .rep-comparativa { text-align: left; }
  .rep-nav { padding-left: 0; border-left: none; }
  .rep-rango { margin-left: 0; }
}
</style>
