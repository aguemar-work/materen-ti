<script setup>
// Reporte de tickets para un periodo diario/semanal/mensual: volumen y
// distribución, tiempos y calidad de la atención, desempeño por técnico
// (incluye qué resolvió cada uno del periodo vs. arrastrado de antes) y
// satisfacción. Se ve en pantalla y se descarga como PDF para compartir con
// control/gerencia — ver reporte.js.
//
// El periodo es un recorte de CALENDARIO elegible (un día, una semana o un mes
// concretos, navegables con las flechas), no una ventana móvil desde hoy —
// la aritmética de fechas vive en reportePeriodo.js.
import { ref, computed, nextTick, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useTicketsStore } from '../../stores/tickets.js';
import { useAuthStore } from '../../stores/auth.js';
import { prioridadInfo, OPCIONES_TIPO } from '../../core/dominio-tickets.js';
import { formatFecha, formatFechaHora, formatHoras, formatDelta, fechaISO as aISO } from '../../core/formatters.js';
import { exportarCSV } from '../../core/exportar.js';
import { CABECERA_CSV_TICKETS, filaCsvTicket } from '../../core/exportar-tickets.js';
import Modal from '../../components/shared/Modal.vue';
import { showToast } from '../../core/toast.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import { generarReporteTickets } from './reporte.js';
import {
  PERIODOS, MESES, anclaDeHoy, normalizarAncla, limitarAncla, desplazarAncla,
  rangoDe, enCurso, puedeAvanzar, etiquetaRango, etiquetaPeriodo, etiquetaCompacta,
  nombreArchivoReporte, aniosDisponibles,
} from './reportePeriodo.js';
import TextoVacio from '../../components/shared/TextoVacio.vue';

// Las exportaciones (CSV del periodo, CSV de la bandeja) y el PDF cumplen la
// misma finalidad —sacar información de tickets para compartir o analizar— así
// que viven juntas acá en vez de repartidas por el toolbar de la bandeja.
const ticketsStore = useTicketsStore();
const auth = useAuthStore();

const props = defineProps({
  staffPorId: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['cerrar']);

// Alcance del reporte: disponible para cualquier staff (JEFE y ASISTENTE),
// no restringido por rol — el reporte de equipo lo puede generar cualquiera
// del área. Por defecto "equipo" (comportamiento de siempre, nadie se
// sorprende). El alcance elegido se muestra siempre junto al periodo, en
// pantalla y en el PDF: un reporte "solo mi actividad" que no lo diga es
// tan engañoso como el bug de nombres que este mismo cambio corrige.
const ALCANCES = [
  { valor: 'equipo', label: 'Todo el equipo' },
  { valor: 'propia', label: 'Solo mi actividad' },
];
const alcance = ref('equipo');
const alcanceLabel = computed(() => ALCANCES.find((a) => a.valor === alcance.value)?.label || '');

const modal = ref(null);

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

// Definición de columnas de CarbonDataTable para las 4 tablas de reporte con
// estructura real (filas dinámicas, varias columnas numéricas): densidad
// `sm` porque son reportes numéricos densos de solo lectura, no un listado
// operativo con acciones, y `:con-tarjetas="false"` porque ninguna tenía
// tarjeta móvil propia (ya resolvían pantallas angostas con scroll
// horizontal dentro de `.table-wrap`). Las 3 tablas de "Volumen y
// distribución" (Categoría/Prioridad/Tipo) se dejan como `<table>` simple
// más abajo: son 2 columnas, una lista fija y chica (categorías/prioridades/
// tipos del dominio), sin orden ni estado vacío real que aporte algo sobre
// el colspan=2 ya hardcodeado — migrarlas no gana nada y sí les hace perder
// el layout compacto lado a lado de `.rep-cols`.
const columnasTiempoPrioridad = [
  { clave: 'clave', label: 'Prioridad', elastica: true },
  { clave: 'muestra', label: 'Resueltos', num: true },
  { clave: 'promedio', label: 'Tiempo medio', num: true },
  { clave: 'mediana', label: 'Mediana', num: true },
];

// Rótulo de la 3ª columna cambia con el periodo (Hoy/Esta semana/Este mes) —
// por eso este arreglo es un computed y no una constante como las demás.
const columnasTecnico = computed(() => [
  { clave: 'nombre', label: 'Técnico', elastica: true },
  { clave: 'cantidad', label: 'Resueltos', num: true },
  { clave: 'mismoPeriodo', label: etiquetaColMismoPeriodo.value, num: true },
  { clave: 'arrastrados', label: 'Anteriores', num: true },
  { clave: 'promedio', label: 'Tiempo medio', num: true },
  { clave: 'mediana', label: 'Mediana', num: true },
]);

const columnasArrastrados = [
  { clave: 'codigo', label: 'Código' },
  { clave: 'titulo', label: 'Título', elastica: true },
  { clave: 'tecnico', label: 'Técnico' },
  { clave: 'creadoEn', label: 'Creado el' },
  { clave: 'diasAbierto', label: 'Días abierto', num: true },
];

// "Histórico" perdió el title="Total histórico..." que tenía como <th> plano
// (CarbonDataTable no expone un atributo por columna para eso) — la nota
// .tk-nota justo encima del template ya explica lo mismo en texto, así que
// no se pierde la aclaración, solo el tooltip puntual del encabezado.
const columnasSolicitante = [
  { clave: 'solicitante', label: 'Usuario', elastica: true },
  { clave: 'total', label: 'Histórico', num: true },
  { clave: 'creados', label: 'Ticket creado', num: true },
  { clave: 'resueltos', label: 'Ticket resuelto', num: true },
  { clave: 'rechazados', label: 'Rechazado', num: true },
  { clave: 'encuestasContestadas', label: 'Enc. contestadas', num: true },
  { clave: 'encuestasPendientes', label: 'Enc. pendientes', num: true },
];

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
    const asignadoA = alcance.value === 'propia' ? auth.user?.id : undefined;
    // El diario no compara contra "el día anterior" (un día suelto no es
    // representativo); "solo mi actividad" tampoco lleva comparativa —
    // sería una comparación distinta y más compleja (satisfacción no se
    // puede recortar por técnico sin un cambio aparte), así que se omite en
    // vez de mostrar un delta a medias.
    const incluirComparativa = periodo.value !== 'diario' && alcance.value === 'equipo';
    const anterior = incluirComparativa ? rangoDe(periodo.value, desplazarAncla(periodo.value, ancla.value, -1)) : null;
    const [reporte, resumenAnterior] = await Promise.all([
      insforgeApi.obtenerReporteTickets({ desde: desde.toISOString(), hasta: hasta.toISOString(), asignadoA }),
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

// Cambiar el alcance recarga igual que cambiar de periodo (mismo criterio
// que aplicarPeriodo): sin esto, el modal mostraría datos del alcance
// anterior hasta el próximo cambio de periodo.
function cambiarAlcance(nuevo) {
  if (cargando.value || alcance.value === nuevo) return;
  alcance.value = nuevo;
  cargar();
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
        alcanceLabel: alcanceLabel.value,
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

// La cabecera y el mapeo de fila viven en core/exportar-tickets.js: los
// comparten estas 2 exportaciones y el botón "Exportar" de la toolbar de
// TicketsView.vue. Antes estaban acá y eran la única copia; al sumar el tercer
// consumidor se extrajeron para que una columna nueva no tenga que agregarse
// en dos lugares (fue justo el caso de "Nivel").
const filaCsv = (t) => filaCsvTicket(t, props.staffPorId);

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
    exportarCSV(`tickets_${nombreArchivoReporte(periodo.value, ancla.value)}`, CABECERA_CSV_TICKETS, filas.map(filaCsv));
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
    exportarCSV('tickets_bandeja', CABECERA_CSV_TICKETS, filas.map(filaCsv));
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <Modal ref="modal" size="lg" @close="emit('cerrar')">
    <template #titulo><i class="ti ti-report" aria-hidden="true"></i> Reporte de tickets</template>
        <div class="rep-body">
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

              <CarbonButton variante="secondary" :deshabilitado="cargando || esPeriodoActual" @click="irAlActual">Actual</CarbonButton>
            </div>

            <span class="rep-rango">
              {{ rangoLabel }} · {{ alcanceLabel }}
              <span v-if="periodoEnCurso" class="rep-encurso">En curso</span>
            </span>
          </div>

          <div class="rep-alcance" role="group" aria-label="Alcance del reporte">
            <button
              v-for="a in ALCANCES"
              :key="a.valor"
              type="button"
              class="btn"
              :class="{ 'is-activo': alcance === a.valor }"
              :disabled="cargando"
              :aria-pressed="alcance === a.valor"
              @click="cambiarAlcance(a.valor)"
            >{{ a.label }}</button>
          </div>

          <div v-if="cargando" class="no-results">Calculando reporte...</div>
          <CarbonNotification v-else-if="error" tipo="error">{{ error }}</CarbonNotification>

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
                <table class="rep-tabla" aria-label="Tickets por categoría">
                  <thead><tr><th scope="col">Categoría</th><th scope="col" class="num">Cant.</th></tr></thead>
                  <tbody>
                    <tr v-for="c in datos.porCategoria" :key="c.clave"><td>{{ c.clave }}</td><td class="num">{{ c.cantidad }}</td></tr>
                    <tr v-if="!datos.porCategoria.length"><td colspan="2" class="rep-vacio">Sin datos</td></tr>
                  </tbody>
                </table>
                <table class="rep-tabla" aria-label="Tickets por prioridad">
                  <thead><tr><th scope="col">Prioridad</th><th scope="col" class="num">Cant.</th></tr></thead>
                  <tbody>
                    <tr v-for="c in porPrioridadLabel" :key="c.clave"><td>{{ c.clave }}</td><td class="num">{{ c.cantidad }}</td></tr>
                    <tr v-if="!porPrioridadLabel.length"><td colspan="2" class="rep-vacio">Sin datos</td></tr>
                  </tbody>
                </table>
                <table class="rep-tabla" aria-label="Tickets por tipo">
                  <thead><tr><th scope="col">Tipo</th><th scope="col" class="num">Cant.</th></tr></thead>
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
              <CarbonDataTable
                :columnas="columnasTiempoPrioridad"
                :filas="tiempoPorPrioridadLabel"
                :con-tarjetas="false"
                densidad="sm"
                etiqueta="Tiempo de atención por prioridad"
                vacio-titulo="Sin datos"
                vacio-mensaje="Sin tickets resueltos en el periodo"
              >
                <template #celda-promedio="{ fila }">{{ formatHoras(fila.promedio) }}</template>
                <template #celda-mediana="{ fila }">{{ formatHoras(fila.mediana) }}</template>
              </CarbonDataTable>
              <p class="tk-nota">
                {{ datos.reaperturas }} reapertura(s) sobre {{ datos.totalResueltos }} ticket(s) resueltos en el periodo.
              </p>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Desempeño por técnico</div>
              <CarbonDataTable
                :columnas="columnasTecnico"
                :filas="porTecnicoNombres"
                clave="nombre"
                :con-tarjetas="false"
                densidad="sm"
                etiqueta="Desempeño por técnico"
                vacio-titulo="Sin datos"
                vacio-mensaje="Sin tickets resueltos en el periodo"
              >
                <template #celda-promedio="{ fila }">{{ formatHoras(fila.promedio) }}</template>
                <template #celda-mediana="{ fila }">{{ formatHoras(fila.mediana) }}</template>
              </CarbonDataTable>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Tickets anteriores resueltos en el periodo</div>
              <CarbonDataTable
                :columnas="columnasArrastrados"
                :filas="arrastradosNombres"
                clave="codigo"
                :con-tarjetas="false"
                densidad="sm"
                etiqueta="Tickets anteriores resueltos en el periodo"
                vacio-titulo="Sin datos"
                vacio-mensaje="Sin tickets arrastrados resueltos en el periodo"
              >
                <template #celda-codigo="{ valor }"><span class="rep-codigo">{{ valor }}</span></template>
                <template #celda-creadoEn="{ valor }">{{ formatFecha(valor) }}</template>
              </CarbonDataTable>
            </div>

            <div class="rep-seccion">
              <div class="datos-title">Tickets del periodo por solicitante</div>
              <p class="tk-nota">
                "Histórico" es el total de siempre para ese usuario, no de este periodo — el resto de columnas sí es solo del periodo.
              </p>
              <!-- 7 columnas: en pantallas angostas la tabla scrollea sola en
                   vez de desbordar el modal (.table-wrap, dentro de
                   CarbonDataTable). -->
              <CarbonDataTable
                :columnas="columnasSolicitante"
                :filas="datos.porSolicitante"
                clave="solicitante"
                :con-tarjetas="false"
                densidad="sm"
                etiqueta="Tickets del periodo por solicitante"
                vacio-titulo="Sin datos"
                vacio-mensaje="Sin tickets creados en el periodo"
              >
                <template #celda-solicitante="{ valor }"><TextoVacio :valor="valor" /></template>
              </CarbonDataTable>
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

    <template #acciones>
      <CarbonButton variante="secondary" @click="modal?.cerrar()">Cerrar</CarbonButton>
      <CarbonButton
        variante="secondary"
        icono="ti-table-export"
        :cargando="exportandoPeriodo"
        :deshabilitado="cargando"
        title="Exporta los tickets del periodo del reporte"
        @click="exportarCsvPeriodo"
      >{{ exportandoPeriodo ? 'Exportando...' : 'CSV del periodo' }}</CarbonButton>
      <CarbonButton
        variante="secondary"
        icono="ti-table-export"
        :cargando="exportando"
        title="Exporta la bandeja con los filtros aplicados, no el periodo del reporte"
        @click="exportarCsv"
      >{{ exportando ? 'Exportando...' : 'CSV de la bandeja' }}</CarbonButton>
      <CarbonButton variante="primary" icono="ti-download" :cargando="descargando" :deshabilitado="cargando || !datos" @click="descargar">
        {{ descargando ? 'Generando PDF...' : 'Descargar PDF' }}
      </CarbonButton>
    </template>
  </Modal>
</template>

<style scoped>
.rep-body { display: flex; flex-direction: column; gap: 16px; }

.rep-periodos { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rep-granularidad, .rep-nav, .rep-alcance { display: flex; align-items: center; gap: 6px; }
.rep-nav { padding-left: 8px; border-left: 1px solid var(--color-border-subtle); }
.rep-alcance { margin: -6px 0 2px; }

/* Selector segmentado (no es la acción principal del modal, es un estado de
   selección) — mismo par tenue-acento que .chip-filtro--activo en vez de
   .btn-primary, para no competir con "Descargar PDF". */
.rep-granularidad .btn.is-activo,
.rep-alcance .btn.is-activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
  border-color: var(--color-accent-subtle);
}

.rep-campo {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  font-size: var(--fs-body-01);
  font-family: var(--font-sans);
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rep-campo:focus { outline: none; border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--ring); }
.rep-campo:disabled { opacity: 0.6; cursor: not-allowed; }
select.rep-campo { cursor: pointer; }
.rep-campo-anio { min-width: 84px; }

.rep-rango { font-size: var(--fs-label-01); color: var(--color-text-secondary); margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.rep-encurso {
  font-size: var(--fs-label-01);
  padding: 1px 6px;
  border-radius: var(--radius-base);
  background: var(--color-bg-subtle);
  color: var(--color-text-tertiary);
}

.rep-toggle-tasa {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
  cursor: pointer;
  margin-bottom: 4px;
}

.rep-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.rep-kpis-3, .rep-kpis-3col { grid-template-columns: repeat(3, 1fr); }
.rep-kpis-3 { margin-bottom: 10px; }
.rep-kpi { border: 1px solid var(--color-border); border-radius: var(--radius-base); padding: 10px; text-align: center; }
.rep-kpi-valor { display: block; font-size: var(--fs-heading-02); font-weight: 600; }
.rep-kpi-label { font-size: var(--fs-label-01); color: var(--color-text-secondary); }
/* La variación no se pinta de verde/rojo: "más creados" no es bueno ni malo por
   sí mismo y el color le pondría un juicio que el dato no tiene. */
.rep-kpi-delta { display: block; margin-top: 2px; font-size: var(--fs-label-01); color: var(--color-text-tertiary); }
.rep-kpi-desglose { display: block; margin-top: 2px; font-size: var(--fs-label-01); color: var(--color-text-tertiary); }
.rep-comparativa { margin: -8px 0 0; font-size: var(--fs-label-01); color: var(--color-text-tertiary); text-align: right; }

.rep-seccion { border-top: 1px solid var(--color-border); padding-top: 12px; }
/* Tres conteos (categoría, prioridad, tipo): caben en una sola fila dentro de
   los 680px de .modal-lg sin partir los encabezados. */
.rep-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

.rep-tabla { width: 100%; border-collapse: collapse; font-size: var(--fs-label-01); }
.rep-tabla th, .rep-tabla td { padding: 5px 8px; border-bottom: 1px solid var(--color-border); text-align: left; }
.rep-tabla .num { text-align: right; }
.rep-vacio { color: var(--color-text-tertiary); font-style: italic; text-align: center; }
.rep-codigo { font-family: var(--font-mono, monospace); white-space: nowrap; }

.rep-comentarios { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rep-comentarios li { font-size: var(--fs-body-01); border-bottom: 1px solid var(--color-border); padding-bottom: 6px; }
.rep-fecha { color: var(--color-text-tertiary); font-size: var(--fs-label-01); }

@media (max-width: 768px) {
  .rep-cols { grid-template-columns: 1fr; }
  .rep-kpis, .rep-kpis-3, .rep-kpis-3col { grid-template-columns: repeat(2, 1fr); }
  .rep-comparativa { text-align: left; }
  .rep-nav { padding-left: 0; border-left: none; }
  .rep-rango { margin-left: 0; }
}
</style>
