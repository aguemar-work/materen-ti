<script setup>
// Consolidado histórico de satisfacción de tickets (todo el tiempo, sin
// recorte de periodo — a diferencia del modal "Reporte", que sí está
// acotado a un día/semana/mes). Se trae una sola vez desde
// obtenerSatisfaccionConsolidado() y todo el orden/paginación de la tabla
// principal es en el cliente: los dos resúmenes ya necesitan el histórico
// completo, así que no tiene sentido pedirlo de nuevo por página.
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { MIN_MUESTRA_PROMEDIO } from '../../api/domains/reportesTickets.js';
import { formatFechaHora } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { generarReporteSatisfaccion } from './reporteSatisfaccion.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const cargando = ref(true);
const error = ref('');
const respuestas = ref([]);
const porSolicitante = ref([]);
const porTecnico = ref([]);
const staffPorId = ref({});

function nombreTecnico(tecnicoId) {
  if (!tecnicoId) return 'Sin asignar';
  return staffPorId.value[tecnicoId] || 'Staff';
}

// Búsqueda 100% client-side: el histórico completo ya está en memoria
// (ver comentario de arriba), así que no hay red que ahorrar con debounce.
const { termino: busqueda } = useBusqueda({ debounceMs: 0, umbralMinimo: 0, sanitizar: false });

// Chip "Solo insatisfechos" (nivel ≤ 3, incluye "Neutral" — decisión del
// usuario 2026-08-19): mismo patrón que los chips de TicketsView, se
// combina con el buscador de texto (AND entre ambos).
const soloInsatisfechos = ref(false);
function esBaja(r) {
  return r.nivel !== null && r.nivel <= 3;
}

const respuestasFiltradas = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return respuestas.value.filter((r) => {
    if (soloInsatisfechos.value && !esBaja(r)) return false;
    if (!q) return true;
    return r.ticket_codigo.toLowerCase().includes(q) ||
      r.solicitante.toLowerCase().includes(q) ||
      nombreTecnico(r.tecnico_id).toLowerCase().includes(q) ||
      (r.comentario || '').toLowerCase().includes(q);
  });
});

// Mismo par orden+paginación client-side que el resto de las vistas
// (useOrdenTabla + usePaginacion) en vez de reimplementarlo acá; 'desc'
// inicial porque un reporte se lee de más reciente a más antiguo.
const { columna, direccion, ordenarPor, listaOrdenada: respuestasOrdenadas } = useOrdenTabla(respuestasFiltradas, 'created_at', 'desc');
const { paginaActual, listaPaginada: respuestasPagina, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(respuestasOrdenadas);

// KPIs generales del PDF (independientes del buscador/orden de la tabla:
// siempre sobre el histórico completo, igual que "Todas las respuestas"
// antes de filtrar).
const resumenGeneral = computed(() => {
  const conNivel = respuestas.value.filter((r) => r.nivel !== null);
  return {
    encuestasGeneradas: respuestas.value.length,
    encuestasRespondidas: respuestas.value.filter((r) => r.respondida).length,
    promedioGeneral: conNivel.length ? conNivel.reduce((acc, r) => acc + r.nivel, 0) / conNivel.length : null,
  };
});

// Desglose 1-5 por solicitante/técnico: la RPC ya devuelve generadas/
// respondidas/promedio/muestra pre-agregados (`porSolicitante`/`porTecnico`),
// pero no un conteo por nivel — como `respuestas` ya trae CADA fila
// individual con su empleado_id/tecnico_id y su nivel (histórico completo,
// ya en memoria), el desglose se arma acá agrupando ese mismo array en vez
// de pedirle un campo nuevo a la RPC.
function contarNivelesPorClave(items, claveFn) {
  const mapa = new Map();
  for (const r of items) {
    if (r.nivel === null) continue;
    const clave = claveFn(r);
    if (!mapa.has(clave)) mapa.set(clave, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    const conteo = mapa.get(clave);
    conteo[r.nivel] += 1;
  }
  return mapa;
}

function niveles(mapa, clave) {
  return mapa.get(clave) || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

const nivelesPorSolicitante = computed(() => contarNivelesPorClave(respuestas.value, (r) => r.empleado_id));
const nivelesPorTecnico = computed(() => contarNivelesPorClave(respuestas.value, (r) => r.tecnico_id));

// Filas ya enriquecidas con su desglose 1-5 (y, para técnico, el nombre
// resuelto) — una sola vez acá, en vez de recalcularlo en cada celda del
// template o de nuevo al armar el PDF.
const porSolicitanteConNiveles = computed(() =>
  porSolicitante.value.map((f) => ({ ...f, conteos: niveles(nivelesPorSolicitante.value, f.empleado_id) }))
);
const porTecnicoConNiveles = computed(() =>
  porTecnico.value.map((f) => ({ ...f, nombre: nombreTecnico(f.tecnico_id), conteos: niveles(nivelesPorTecnico.value, f.tecnico_id) }))
);

// El PDF no puede cargar miles de filas (mismo motivo que MAX_COMENTARIOS en
// reportesTickets.js): se recorta a las más recientes/relevantes y se avisa
// el total real en una nota, no en silencio.
const MAX_RESPUESTAS_PDF = 40;
const MAX_RESPUESTAS_BAJAS_PDF = 60;

function mapRespuestaParaPdf(r) {
  return {
    ticketCodigo: r.ticket_codigo,
    solicitante: r.solicitante,
    tecnico: nombreTecnico(r.tecnico_id),
    nivel: r.nivel,
    respondida: r.respondida,
    comentario: r.comentario,
    fecha: r.fecha_envio || r.created_at,
  };
}

const exportandoPdf = ref(false);
async function descargarPdf() {
  exportandoPdf.value = true;
  try {
    const ordenadasPorFecha = [...respuestas.value].sort(
      (a, b) => new Date(b.fecha_envio || b.created_at) - new Date(a.fecha_envio || a.created_at),
    );
    // Baja satisfacción: peor nivel primero (el objetivo es entender el
    // porqué, no leer en orden cronológico) y, a igual nivel, la más
    // reciente primero.
    const bajas = respuestas.value
      .filter(esBaja)
      .sort((a, b) => a.nivel - b.nivel || new Date(b.fecha_envio || b.created_at) - new Date(a.fecha_envio || a.created_at));

    await generarReporteSatisfaccion({
      ...resumenGeneral.value,
      porSolicitante: porSolicitanteConNiveles.value,
      porTecnico: porTecnicoConNiveles.value,
      respuestasTotal: respuestas.value.length,
      respuestas: ordenadasPorFecha.slice(0, MAX_RESPUESTAS_PDF).map(mapRespuestaParaPdf),
      respuestasBajasTotal: bajas.length,
      respuestasBajas: bajas.slice(0, MAX_RESPUESTAS_BAJAS_PDF).map(mapRespuestaParaPdf),
    });
  } catch (e) {
    showToast(e?.message || 'No se pudo generar el PDF', 'error');
  } finally {
    exportandoPdf.value = false;
  }
}

// Definición de columnas de CarbonDataTable, 3 tablas: ninguna tiene tarjeta
// móvil propia (siempre fueron .table-wrap a secas, sin variante
// solo-escritorio/solo-movil — el scroll horizontal ya las resolvía en
// pantallas angostas), así que las tres van con `:con-tarjetas="false"`.
// Densidad `sm`: son reportes numéricos densos, no un listado operativo.
const columnasPorSolicitante = [
  { clave: 'nombre', label: 'Solicitante', elastica: true },
  { clave: 'encuestasRespondidas', label: 'Respondidas' },
  { clave: 'pendientes', label: 'Pendientes' },
  { clave: 'n1', label: '1★', ancho: '48px' },
  { clave: 'n2', label: '2★', ancho: '48px' },
  { clave: 'n3', label: '3★', ancho: '48px' },
  { clave: 'n4', label: '4★', ancho: '48px' },
  { clave: 'n5', label: '5★', ancho: '48px' },
  { clave: 'promedio', label: 'Promedio' },
];

const columnasPorTecnico = [
  { clave: 'nombre', label: 'Técnico', elastica: true },
  { clave: 'encuestasGeneradas', label: 'Total' },
  { clave: 'encuestasRespondidas', label: 'Respondidas' },
  { clave: 'n1', label: '1★', ancho: '48px' },
  { clave: 'n2', label: '2★', ancho: '48px' },
  { clave: 'n3', label: '3★', ancho: '48px' },
  { clave: 'n4', label: '4★', ancho: '48px' },
  { clave: 'n5', label: '5★', ancho: '48px' },
  { clave: 'promedio', label: 'Promedio' },
];

const columnasRespuestas = [
  { clave: 'ticket_codigo', label: 'Ticket' },
  { clave: 'solicitante', label: 'Solicitante', ordenable: true },
  { clave: 'tecnico', label: 'Técnico' },
  { clave: 'nivel', label: 'Nivel', ordenable: true },
  { clave: 'comentario', label: 'Comentario', elastica: true },
  { clave: 'created_at', label: 'Fecha', ordenable: true },
];

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const [consolidado, staff] = await Promise.all([
      insforgeApi.obtenerSatisfaccionConsolidado(),
      insforgeApi.nombresStaff(),
    ]);
    respuestas.value = consolidado.respuestas;
    porSolicitante.value = consolidado.porSolicitante;
    porTecnico.value = consolidado.porTecnico;
    staffPorId.value = Object.fromEntries(staff.map((s) => [s.user_id, s.nombre]));
  } catch (e) {
    error.value = e?.message || 'Error al cargar la satisfacción de tickets';
    showToast(error.value, 'error');
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="satisfaccion-tickets-page vista-modulo">
    <PageHeader titulo="Satisfacción de tickets" icono="ti ti-mood-smile" :conteo="respuestasFiltradas.length">
      <template #acciones>
        <CarbonButton
          variante="secondary"
          icono="ti-download"
          :cargando="exportandoPdf"
          :deshabilitado="cargando"
          @click="descargarPdf"
        >{{ exportandoPdf ? 'Generando...' : 'Descargar PDF' }}</CarbonButton>
        <CarbonButton variante="secondary" icono="ti-arrow-left" to="/tickets">Volver</CarbonButton>
      </template>
    </PageHeader>

    <main class="page page--padded">
      <div v-if="error" class="no-results">{{ error }}</div>

      <template v-else>
        <div class="resumenes-grid">
          <div class="card">
            <div class="datos-title"><i class="ti ti-user"></i> Por solicitante</div>
            <p class="tk-nota">Promedio marcado en gris con menos de {{ MIN_MUESTRA_PROMEDIO }} respuestas con nivel.</p>
            <CarbonDataTable
              :columnas="columnasPorSolicitante"
              :filas="porSolicitanteConNiveles"
              :cargando="cargando"
              :con-tarjetas="false"
              densidad="sm"
              clave="empleado_id"
              etiqueta="Satisfacción por solicitante"
              vacio-titulo="Sin datos"
              vacio-mensaje="Todavía no hay encuestas generadas."
            >
              <template #celda-encuestasRespondidas="{ fila }">{{ fila.encuestasRespondidas }}</template>
              <template #celda-pendientes="{ fila }">{{ fila.encuestasGeneradas - fila.encuestasRespondidas }}</template>
              <template #celda-n1="{ fila }"><span class="nivel-valor">{{ fila.conteos[1] }}</span></template>
              <template #celda-n2="{ fila }"><span class="nivel-valor">{{ fila.conteos[2] }}</span></template>
              <template #celda-n3="{ fila }"><span class="nivel-valor">{{ fila.conteos[3] }}</span></template>
              <template #celda-n4="{ fila }"><span class="nivel-valor">{{ fila.conteos[4] }}</span></template>
              <template #celda-n5="{ fila }"><span class="nivel-valor">{{ fila.conteos[5] }}</span></template>
              <template #celda-promedio="{ fila }">
                <TextoVacio v-if="fila.promedio === null" placeholder="Sin respuestas" />
                <span v-else :class="{ 'text-muted': fila.muestra < MIN_MUESTRA_PROMEDIO }">{{ fila.promedio.toFixed(1) }}/5</span>
              </template>
            </CarbonDataTable>
          </div>

          <div class="card">
            <div class="datos-title"><i class="ti ti-headset"></i> Por técnico</div>
            <p class="tk-nota">Es quien marcó el ticket como resuelto por última vez, no necesariamente el asignado actual.</p>
            <CarbonDataTable
              :columnas="columnasPorTecnico"
              :filas="porTecnicoConNiveles"
              :cargando="cargando"
              :con-tarjetas="false"
              densidad="sm"
              clave="tecnico_id"
              etiqueta="Satisfacción por técnico"
              vacio-titulo="Sin datos"
              vacio-mensaje="Todavía no hay encuestas generadas."
            >
              <template #celda-n1="{ fila }"><span class="nivel-valor">{{ fila.conteos[1] }}</span></template>
              <template #celda-n2="{ fila }"><span class="nivel-valor">{{ fila.conteos[2] }}</span></template>
              <template #celda-n3="{ fila }"><span class="nivel-valor">{{ fila.conteos[3] }}</span></template>
              <template #celda-n4="{ fila }"><span class="nivel-valor">{{ fila.conteos[4] }}</span></template>
              <template #celda-n5="{ fila }"><span class="nivel-valor">{{ fila.conteos[5] }}</span></template>
              <template #celda-promedio="{ fila }">
                <TextoVacio v-if="fila.promedio === null" placeholder="Sin respuestas" />
                <span v-else :class="{ 'text-muted': fila.muestra < MIN_MUESTRA_PROMEDIO }">{{ fila.promedio.toFixed(1) }}/5</span>
              </template>
            </CarbonDataTable>
          </div>
        </div>

        <div class="card">
          <div class="datos-title">Todas las respuestas</div>

          <EmptyState
            v-if="!cargando && !respuestas.length"
            icono="ti ti-mood-smile"
            titulo="Sin encuestas todavía"
            mensaje="Se generan automáticamente al cerrar un ticket con solicitante identificado."
          />

          <template v-else>
            <div class="filters">
              <div class="search-wrap">
                <i class="ti ti-search"></i>
                <input v-model="busqueda" type="text" placeholder="Buscar por ticket, solicitante, técnico o comentario...">
              </div>
              <div class="chips-filtro">
                <button type="button" class="chip-filtro" :class="{ 'chip-filtro--activo': soloInsatisfechos }" @click="soloInsatisfechos = !soloInsatisfechos">
                  <i class="ti ti-mood-sad" aria-hidden="true"></i> Solo insatisfechos (nivel ≤ 3)
                </button>
              </div>
            </div>

            <EmptyState
              v-if="!cargando && respuestasOrdenadas.length === 0"
              icono="ti ti-search"
              titulo="Sin resultados"
              :mensaje="busqueda || soloInsatisfechos ? 'No hay respuestas con esos filtros.' : 'No hay respuestas con ese filtro.'"
            />

            <template v-else>
              <p v-if="cargando" class="sr-only" role="status">Cargando satisfacción de tickets…</p>
              <CarbonDataTable
                :columnas="columnasRespuestas"
                :filas="respuestasPagina"
                :cargando="cargando"
                :con-tarjetas="false"
                densidad="sm"
                :orden-por="columna"
                :orden-dir="direccion"
                etiqueta="Todas las respuestas de satisfacción"
                @ordenar="ordenarPor"
              >
                <template #celda-ticket_codigo="{ fila }">
                  <RouterLink :to="`/tickets/${fila.ticket_id}`">{{ fila.ticket_codigo }}</RouterLink>
                </template>
                <template #celda-tecnico="{ fila }">{{ nombreTecnico(fila.tecnico_id) }}</template>
                <template #celda-nivel="{ fila }">
                  <span v-if="fila.nivel !== null">{{ fila.nivel }}/5</span>
                  <TextoVacio v-else-if="!fila.respondida" placeholder="Pendiente" />
                  <TextoVacio v-else />
                </template>
                <template #celda-comentario="{ fila }">
                  <span v-if="fila.comentario">{{ fila.comentario }}</span><TextoVacio v-else />
                </template>
                <template #celda-created_at="{ fila }">{{ formatFechaHora(fila.fecha_envio || fila.created_at) }}</template>
              </CarbonDataTable>
            </template>
            <CarbonPagination
              v-if="!cargando"
              v-model="paginaActual"
              :total-items="totalItems"
              :tam-pagina="tamPagina"
              :tamanos-pagina="TAMANOS_PAGINA"
              unidad="respuestas"
              @update:tam-pagina="cambiarTamPagina"
            />
          </template>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
/* Antes eran 2 columnas lado a lado (3 datos c/u, entraban cómodas a media
   pantalla). Con el desglose 1-5★ (2026-08-19) cada tarjeta pasó a 9
   columnas — a la mitad del viewport scrollearían casi todo el tiempo, así
   que se apilan a ancho completo; .table-wrap ya resuelve el scroll
   horizontal dentro de cada una si hace falta en pantallas angostas. */
.resumenes-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

/* Columnas de conteo por nivel (1★..5★): números cortos, centrados. El
   ancho angosto ahora lo fija la columna (`ancho: '48px'`), acá solo queda
   centrar el valor dentro de la celda. */
.nivel-valor {
  display: block;
  text-align: center;
}

.chips-filtro {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* Mismo par tenue-acento que el ítem activo del sidebar y los chips de
   TicketsView (GUIA-UX-UI): sin bordes, solo fondo/color de acento cuando
   el filtro está activo. */
.chip-filtro {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-base);
  background: var(--color-bg-subtle);
  color: var(--color-text-secondary);
  font-size: var(--fs-body-01);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.chip-filtro:hover { background: var(--color-bg-hover); }

.chip-filtro:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring);
}

.chip-filtro--activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}

/* .datos-title/.tk-nota viven duplicados como estilo scoped en cada vista
   que los usa (TicketDetalleView, ProblemaDetalleView, etc.) — a esta
   vista le faltaban por completo, así que el título de cada tarjeta y las
   notas quedaban sin tratar (tamaño/peso de párrafo suelto). A diferencia
   de esas vistas de detalle (donde el padding vive en un wrapper por
   tarjeta, ej. .tk-historial), acá cada tarjeta sigue con .table-wrap a
   sangre — igual que en .card--fill — así que el padding va en el
   título/nota, no en la tarjeta entera. */
/* Únicos ajustes sobre las clases globales de ficha (main.css): acá el
   título y la nota van dentro de una card sin padding propio, así que lo
   ponen ellos. */
.datos-title { padding: 16px 20px 0; }

.tk-nota {
  padding: 0 20px;
  margin: 0 0 14px;
}
</style>
