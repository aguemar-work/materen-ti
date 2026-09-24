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
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppKpi from '../../components/ui/AppKpi.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import { generarReporteTickets } from './reporte.js';
import {
  PERIODOS, MESES, anclaDeHoy, normalizarAncla, limitarAncla, desplazarAncla,
  rangoDe, enCurso, puedeAvanzar, etiquetaRango, etiquetaPeriodo, etiquetaCompacta,
  nombreArchivoReporte, aniosDisponibles,
} from './reportePeriodo.js';

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
const infoError = infoNotificacion('error');

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

// Rediseño 2026-09-23: las tablas del reporte pasan a AppTable en modo
// cliente (`:lazy="false"`, sin paginador: son pocas filas y ya vienen
// completas). El rótulo de la 3ª columna de técnicos cambia con el periodo
// (Hoy/Esta semana/Este mes) — sale de etiquetaColMismoPeriodo.

// Detalle de un KPI: variación contra el periodo anterior + un desglose
// opcional, en una sola línea.
function detalleKpi(delta, extra = '') {
  return [delta ? `${delta} vs. anterior` : '', extra].filter(Boolean).join(' · ');
}

// Las tres distribuciones de "Volumen", en el orden en que se leen.
const gruposVolumen = computed(() => [
  { titulo: 'Por categoría', filas: datos.value?.porCategoria || [] },
  { titulo: 'Por prioridad', filas: porPrioridadLabel.value },
  { titulo: 'Por tipo', filas: porTipoLabel.value },
]);

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
  <Modal ref="modal" size="lg" titulo="Reporte de tickets" @close="emit('cerrar')">
    <div class="space-y-6">
      <!-- ══ Qué periodo y de quién: granularidad, navegación y alcance ══ -->
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <AppSegmentado
            :model-value="periodo"
            :opciones="PERIODOS"
            label="Tipo de periodo"
            @update:model-value="cambiarPeriodo"
          />
          <div class="flex items-center gap-1">
            <button
              class="icon-btn"
              type="button"
              :disabled="cargando"
              :aria-label="periodo === 'diario' ? 'Día anterior' : periodo === 'semanal' ? 'Semana anterior' : 'Mes anterior'"
              @click="mover(-1)"
            ><i class="ti ti-chevron-left" aria-hidden="true"></i></button>

            <template v-if="periodo === 'mensual'">
              <label class="relative inline-block">
                <span class="sr-only">Mes del reporte</span>
                <select
                  class="h-9 cursor-pointer appearance-none rounded-md border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                <i class="ti ti-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
              </label>
              <label class="relative inline-block">
                <span class="sr-only">Año del reporte</span>
                <select
                  class="h-9 cursor-pointer appearance-none rounded-md border border-gray-200 bg-white pl-3 pr-8 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  :value="anioElegido"
                  :disabled="cargando"
                  @change="elegirAnio"
                >
                  <option v-for="a in anios" :key="a" :value="a">{{ a }}</option>
                </select>
                <i class="ti ti-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
              </label>
            </template>
            <input
              v-else
              class="h-9 rounded-md border border-gray-200 bg-white px-2.5 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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

            <AppButton size="sm" variant="text" severity="secondary" label="Actual" :disabled="cargando || esPeriodoActual" @click="irAlActual" />
          </div>
          <AppSegmentado
            class="sm:ml-auto"
            :model-value="alcance"
            :opciones="ALCANCES"
            label="Alcance del reporte"
            @update:model-value="cambiarAlcance"
          />
        </div>

        <p class="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span class="font-medium text-gray-900">{{ rangoLabel }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ alcanceLabel }}</span>
          <AppTag v-if="periodoEnCurso" tono="warning" punto>En curso</AppTag>
        </p>
      </div>

      <p v-if="cargando" class="py-10 text-center text-sm text-gray-500" role="status">Calculando reporte...</p>
      <div v-else-if="error" class="notif notif--inline" :class="`notif--${infoError.rol}`" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>

      <template v-else-if="datos">
        <!-- ══ Resumen ══ -->
        <section class="space-y-3" aria-labelledby="rep-resumen">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 id="rep-resumen" class="text-sm font-semibold text-gray-900">Resumen</h3>
            <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              <input v-model="incluirTasaRespuesta" type="checkbox" class="h-4 w-4 accent-primary-500">
              Incluir tasa de respuesta de encuestas
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <AppKpi icono="ti ti-inbox" label="Creados" :valor="datos.totalCreados" :detalle="detalleKpi(deltaDe('totalCreados'))" />
            <AppKpi
              icono="ti ti-circle-check"
              tono="success"
              label="Resueltos"
              :valor="datos.totalResueltos"
              :detalle="detalleKpi(deltaDe('totalResueltos'), `${datos.resueltosMismoPeriodo} ${etiquetaResueltosMismoPeriodo} · ${datos.resueltosArrastrados} anteriores`)"
            />
            <AppKpi
              icono="ti ti-mood-smile"
              label="Satisfacción"
              :valor="`${datos.promedioSatisfaccion !== null ? datos.promedioSatisfaccion.toFixed(1) : '—'}/5`"
              :detalle="detalleKpi(deltaDe('promedioSatisfaccion', 1))"
            />
            <AppKpi
              v-if="incluirTasaRespuesta"
              icono="ti ti-message-check"
              label="Tasa de respuesta"
              :valor="`${tasaRespuesta}%`"
              :detalle="detalleKpi(deltaDe('tasaRespuesta', 0, ' pp'))"
            />
          </div>
          <p v-if="comparativa" class="text-xs text-gray-500">Variación respecto a {{ etiquetaAnterior }}.</p>
        </section>

        <!-- ══ Volumen y distribución: tres listas cortas lado a lado ══ -->
        <section class="space-y-3" aria-labelledby="rep-volumen">
          <h3 id="rep-volumen" class="text-sm font-semibold text-gray-900">Volumen y distribución</h3>
          <div class="grid gap-3 sm:grid-cols-3">
            <div v-for="grupo in gruposVolumen" :key="grupo.titulo" class="rounded-lg border border-gray-200">
              <p class="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-500">{{ grupo.titulo }}</p>
              <ul v-if="grupo.filas.length" class="divide-y divide-gray-100" :aria-label="`Tickets ${grupo.titulo.toLowerCase()}`">
                <li v-for="c in grupo.filas" :key="c.clave" class="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                  <span class="truncate text-gray-700">{{ c.clave }}</span>
                  <span class="font-medium tabular-nums text-gray-900">{{ c.cantidad }}</span>
                </li>
              </ul>
              <p v-else class="px-3 py-3 text-sm text-gray-500">Sin datos</p>
            </div>
          </div>
        </section>

        <!-- ══ Tiempos y calidad ══ -->
        <section class="space-y-3" aria-labelledby="rep-tiempos">
          <h3 id="rep-tiempos" class="text-sm font-semibold text-gray-900">Tiempos y calidad de la atención</h3>
          <div class="grid gap-3 sm:grid-cols-3">
            <AppKpi icono="ti ti-clock" label="Tiempo medio de resolución" :valor="formatHoras(datos.tiempoResolucion?.promedio)" />
            <AppKpi icono="ti ti-clock-hour-4" label="Mediana" :valor="formatHoras(datos.tiempoResolucion?.mediana)" />
            <AppKpi
              icono="ti ti-refresh"
              :tono="datos.tasaReapertura ? 'warning' : 'neutral'"
              label="Tasa de reapertura"
              :valor="datos.tasaReapertura === null ? '—' : datos.tasaReapertura + '%'"
              :detalle="`${datos.reaperturas} de ${datos.totalResueltos} resueltos`"
            />
          </div>
          <div class="overflow-hidden rounded-lg border border-gray-200">
            <AppTable :value="tiempoPorPrioridadLabel" :lazy="false" data-key="clave" aria-label="Tiempo de atención por prioridad">
              <AppColumn field="clave" header="Prioridad" />
              <AppColumn field="muestra" header="Resueltos">
                <template #body="{ data: f }"><span class="tabular-nums">{{ f.muestra }}</span></template>
              </AppColumn>
              <AppColumn field="promedio" header="Tiempo medio">
                <template #body="{ data: f }"><span class="tabular-nums">{{ formatHoras(f.promedio) }}</span></template>
              </AppColumn>
              <AppColumn field="mediana" header="Mediana">
                <template #body="{ data: f }"><span class="tabular-nums">{{ formatHoras(f.mediana) }}</span></template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Sin tickets resueltos en el periodo.</p></template>
            </AppTable>
          </div>
        </section>

        <!-- ══ Desempeño por técnico ══ -->
        <section class="space-y-3" aria-labelledby="rep-tecnicos">
          <h3 id="rep-tecnicos" class="text-sm font-semibold text-gray-900">Desempeño por técnico</h3>
          <div class="overflow-hidden rounded-lg border border-gray-200">
            <AppTable :value="porTecnicoNombres" :lazy="false" data-key="nombre" aria-label="Desempeño por técnico">
              <AppColumn field="nombre" header="Técnico">
                <template #body="{ data: f }"><span class="font-medium text-gray-900">{{ f.nombre }}</span></template>
              </AppColumn>
              <AppColumn field="cantidad" header="Resueltos">
                <template #body="{ data: f }"><span class="tabular-nums">{{ f.cantidad }}</span></template>
              </AppColumn>
              <AppColumn field="mismoPeriodo" :header="etiquetaColMismoPeriodo">
                <template #body="{ data: f }"><span class="tabular-nums">{{ f.mismoPeriodo }}</span></template>
              </AppColumn>
              <AppColumn field="arrastrados" header="Anteriores">
                <template #body="{ data: f }"><span class="tabular-nums" :class="f.arrastrados ? '' : 'text-gray-300'">{{ f.arrastrados }}</span></template>
              </AppColumn>
              <AppColumn field="promedio" header="Tiempo medio">
                <template #body="{ data: f }"><span class="tabular-nums">{{ formatHoras(f.promedio) }}</span></template>
              </AppColumn>
              <AppColumn field="mediana" header="Mediana">
                <template #body="{ data: f }"><span class="tabular-nums">{{ formatHoras(f.mediana) }}</span></template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Sin tickets resueltos en el periodo.</p></template>
            </AppTable>
          </div>
        </section>

        <!-- ══ Arrastrados ══ -->
        <section class="space-y-3" aria-labelledby="rep-arrastrados">
          <h3 id="rep-arrastrados" class="text-sm font-semibold text-gray-900">Tickets anteriores resueltos en el periodo</h3>
          <div class="overflow-hidden rounded-lg border border-gray-200">
            <AppTable :value="arrastradosNombres" :lazy="false" data-key="codigo" aria-label="Tickets anteriores resueltos en el periodo">
              <AppColumn field="titulo" header="Ticket">
                <template #body="{ data: f }">
                  <div class="min-w-0">
                    <div class="text-xs font-medium tabular-nums text-gray-500">{{ f.codigo }}</div>
                    <div class="text-gray-900">{{ f.titulo }}</div>
                  </div>
                </template>
              </AppColumn>
              <AppColumn field="tecnico" header="Técnico" />
              <AppColumn field="creadoEn" header="Creado el">
                <template #body="{ data: f }"><span class="whitespace-nowrap tabular-nums">{{ formatFecha(f.creadoEn) }}</span></template>
              </AppColumn>
              <AppColumn field="diasAbierto" header="Días abierto">
                <template #body="{ data: f }"><span class="tabular-nums">{{ f.diasAbierto }}</span></template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Sin tickets arrastrados resueltos en el periodo.</p></template>
            </AppTable>
          </div>
        </section>

        <!-- ══ Por solicitante ══ -->
        <section class="space-y-3" aria-labelledby="rep-solicitantes">
          <div>
            <h3 id="rep-solicitantes" class="text-sm font-semibold text-gray-900">Tickets del periodo por solicitante</h3>
            <p class="mt-0.5 text-xs text-gray-500">"Histórico" es el total de siempre para ese usuario, no de este periodo — el resto de columnas sí es solo del periodo.</p>
          </div>
          <div class="overflow-hidden rounded-lg border border-gray-200">
            <AppTable :value="datos.porSolicitante" :lazy="false" data-key="solicitante" aria-label="Tickets del periodo por solicitante">
              <AppColumn field="solicitante" header="Usuario">
                <template #body="{ data: f }">
                  <span :class="f.solicitante ? 'text-gray-900' : 'text-gray-500'">{{ f.solicitante || 'Sin registrar' }}</span>
                </template>
              </AppColumn>
              <AppColumn field="total" header="Histórico">
                <template #body="{ data: f }"><span class="tabular-nums text-gray-500">{{ f.total }}</span></template>
              </AppColumn>
              <AppColumn field="creados" header="Creados">
                <template #body="{ data: f }"><span class="tabular-nums">{{ f.creados }}</span></template>
              </AppColumn>
              <AppColumn field="resueltos" header="Resueltos">
                <template #body="{ data: f }"><span class="tabular-nums">{{ f.resueltos }}</span></template>
              </AppColumn>
              <AppColumn field="rechazados" header="Rechazados">
                <template #body="{ data: f }"><span class="tabular-nums" :class="f.rechazados ? '' : 'text-gray-300'">{{ f.rechazados }}</span></template>
              </AppColumn>
              <AppColumn field="encuestasContestadas" header="Encuestas">
                <template #body="{ data: f }">
                  <span class="whitespace-nowrap tabular-nums" :title="`${f.encuestasContestadas} contestadas, ${f.encuestasPendientes} pendientes`">
                    {{ f.encuestasContestadas }} <span class="text-gray-500">/ {{ f.encuestasContestadas + f.encuestasPendientes }}</span>
                  </span>
                </template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Sin tickets creados en el periodo.</p></template>
            </AppTable>
          </div>
        </section>

        <!-- ══ Satisfacción ══ -->
        <section class="space-y-3" aria-labelledby="rep-satisfaccion">
          <div>
            <h3 id="rep-satisfaccion" class="text-sm font-semibold text-gray-900">Satisfacción del servicio</h3>
            <p class="mt-0.5 text-xs tabular-nums text-gray-500">
              {{ datos.encuestasRespondidas }} de {{ datos.encuestasGeneradas }} encuestas respondidas ({{ tasaRespuesta }}%)
              <template v-if="datos.comentariosTotal > datos.comentarios.length"> · se muestran los {{ datos.comentarios.length }} comentarios más recientes de {{ datos.comentariosTotal }}</template>
            </p>
          </div>
          <ul v-if="datos.comentarios.length" class="divide-y divide-gray-100 rounded-lg border border-gray-200">
            <li v-for="(c, i) in datos.comentarios" :key="i" class="flex items-start gap-3 px-3 py-2.5">
              <AppTag :tono="c.nivel <= 2 ? 'danger' : c.nivel === 3 ? 'warning' : 'success'" class="tabular-nums">{{ c.nivel }}/5</AppTag>
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800">{{ c.comentario }}</p>
                <p class="mt-0.5 text-xs tabular-nums text-gray-500">{{ formatFechaHora(c.fecha) }}</p>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-gray-500">Sin comentarios en el periodo.</p>
        </section>
      </template>
    </div>

    <template #acciones>
      <AppButton variant="text" severity="secondary" label="Cerrar" @click="modal?.cerrar()" />
      <AppButton
        variant="outline"
        severity="secondary"
        :icon="exportandoPeriodo ? 'ti ti-loader-2' : 'ti ti-table-export'"
        :loading="exportandoPeriodo"
        :label="exportandoPeriodo ? 'Exportando...' : 'CSV del periodo'"
        :disabled="exportandoPeriodo || cargando"
        title="Exporta los tickets del periodo del reporte"
        @click="exportarCsvPeriodo"
      />
      <AppButton
        variant="outline"
        severity="secondary"
        :icon="exportando ? 'ti ti-loader-2' : 'ti ti-table-export'"
        :loading="exportando"
        :label="exportando ? 'Exportando...' : 'CSV de la bandeja'"
        :disabled="exportando"
        title="Exporta la bandeja con los filtros aplicados, no el periodo del reporte"
        @click="exportarCsv"
      />
      <AppButton
        :icon="descargando ? 'ti ti-loader-2' : 'ti ti-download'"
        :loading="descargando"
        :label="descargando ? 'Generando PDF...' : 'Descargar PDF'"
        :disabled="descargando || cargando || !datos"
        @click="descargar"
      />
    </template>
  </Modal>
</template>
