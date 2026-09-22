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
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import { columnasVisibles, estiloColumna } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
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

const totalPaginas = computed(() => totalPaginasDe(totalItems.value, tamPagina.value));
const paginas = computed(() => paginasDe(totalPaginas.value));
const rangoPaginacion = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value));
const desde = computed(() => rangoPaginacion.value.desde);
const hasta = computed(() => rangoPaginacion.value.hasta);
function irAPagina(pagina) {
  paginaActual.value = clampPagina(pagina, totalPaginas.value);
}

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
const columnasPorSolicitanteVisibles = computed(() => columnasVisibles(columnasPorSolicitante));
const totalColPorSolicitante = computed(() => columnasPorSolicitanteVisibles.value.length);

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
const columnasPorTecnicoVisibles = computed(() => columnasVisibles(columnasPorTecnico));
const totalColPorTecnico = computed(() => columnasPorTecnicoVisibles.value.length);

const columnasRespuestas = [
  { clave: 'ticket_codigo', label: 'Ticket' },
  { clave: 'solicitante', label: 'Solicitante', ordenable: true },
  { clave: 'tecnico', label: 'Técnico' },
  { clave: 'nivel', label: 'Nivel', ordenable: true },
  { clave: 'comentario', label: 'Comentario', elastica: true },
  { clave: 'created_at', label: 'Fecha', ordenable: true },
];
const columnasRespuestasVisibles = computed(() => columnasVisibles(columnasRespuestas));
const totalColRespuestas = computed(() => columnasRespuestasVisibles.value.length);

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
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="exportandoPdf || cargando"
          @click="descargarPdf"
        >
          {{ exportandoPdf ? 'Generando...' : 'Descargar PDF' }}
          <i v-if="exportandoPdf" class="ti ti-loader-2" aria-hidden="true"></i>
          <i v-else class="ti ti-download" aria-hidden="true"></i>
        </button>
        <RouterLink to="/tickets" class="btn btn--secondary">
          Volver
          <i class="ti ti-arrow-left" aria-hidden="true"></i>
        </RouterLink>
      </template>
    </PageHeader>

    <main class="page page--padded">
      <div v-if="error" class="no-results">{{ error }}</div>

      <template v-else>
        <div class="resumenes-grid">
          <div class="card">
            <div class="datos-title"><i class="ti ti-user"></i> Por solicitante</div>
            <p class="tk-nota">Promedio marcado en gris con menos de {{ MIN_MUESTRA_PROMEDIO }} respuestas con nivel.</p>
            <div class="table-wrap">
              <table class="cds-table cds-table--sm" aria-label="Satisfacción por solicitante">
                <thead>
                  <tr>
                    <th
                      v-for="col in columnasPorSolicitanteVisibles"
                      :key="col.clave"
                      scope="col"
                      :class="{ 'col-num': col.num }"
                      :style="estiloColumna(col)"
                    >{{ col.label }}</th>
                  </tr>
                </thead>
                <tbody>
                  <SkeletonTabla v-if="cargando" :columnas="totalColPorSolicitante" />
                  <tr v-else-if="!porSolicitanteConNiveles.length">
                    <td :colspan="totalColPorSolicitante" class="cds-table__vacio">
                      <EmptyState icono="ti ti-inbox" titulo="Sin datos" mensaje="Todavía no hay encuestas generadas." />
                    </td>
                  </tr>
                  <template v-else>
                    <tr v-for="fila in porSolicitanteConNiveles" :key="fila.empleado_id">
                      <td v-for="col in columnasPorSolicitanteVisibles" :key="col.clave" :class="{ 'col-num': col.num }">
                        <template v-if="col.clave === 'encuestasRespondidas'">{{ fila.encuestasRespondidas }}</template>
                        <template v-else-if="col.clave === 'pendientes'">{{ fila.encuestasGeneradas - fila.encuestasRespondidas }}</template>
                        <span v-else-if="col.clave === 'n1'" class="nivel-valor">{{ fila.conteos[1] }}</span>
                        <span v-else-if="col.clave === 'n2'" class="nivel-valor">{{ fila.conteos[2] }}</span>
                        <span v-else-if="col.clave === 'n3'" class="nivel-valor">{{ fila.conteos[3] }}</span>
                        <span v-else-if="col.clave === 'n4'" class="nivel-valor">{{ fila.conteos[4] }}</span>
                        <span v-else-if="col.clave === 'n5'" class="nivel-valor">{{ fila.conteos[5] }}</span>
                        <template v-else-if="col.clave === 'promedio'">
                          <TextoVacio v-if="fila.promedio === null" placeholder="Sin respuestas" />
                          <span v-else :class="{ 'text-muted': fila.muestra < MIN_MUESTRA_PROMEDIO }">{{ fila.promedio.toFixed(1) }}/5</span>
                        </template>
                        <template v-else>{{ fila[col.clave] }}</template>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="datos-title"><i class="ti ti-headset"></i> Por técnico</div>
            <p class="tk-nota">Es quien marcó el ticket como resuelto por última vez, no necesariamente el asignado actual.</p>
            <div class="table-wrap">
              <table class="cds-table cds-table--sm" aria-label="Satisfacción por técnico">
                <thead>
                  <tr>
                    <th
                      v-for="col in columnasPorTecnicoVisibles"
                      :key="col.clave"
                      scope="col"
                      :class="{ 'col-num': col.num }"
                      :style="estiloColumna(col)"
                    >{{ col.label }}</th>
                  </tr>
                </thead>
                <tbody>
                  <SkeletonTabla v-if="cargando" :columnas="totalColPorTecnico" />
                  <tr v-else-if="!porTecnicoConNiveles.length">
                    <td :colspan="totalColPorTecnico" class="cds-table__vacio">
                      <EmptyState icono="ti ti-inbox" titulo="Sin datos" mensaje="Todavía no hay encuestas generadas." />
                    </td>
                  </tr>
                  <template v-else>
                    <tr v-for="fila in porTecnicoConNiveles" :key="fila.tecnico_id">
                      <td v-for="col in columnasPorTecnicoVisibles" :key="col.clave" :class="{ 'col-num': col.num }">
                        <span v-if="col.clave === 'n1'" class="nivel-valor">{{ fila.conteos[1] }}</span>
                        <span v-else-if="col.clave === 'n2'" class="nivel-valor">{{ fila.conteos[2] }}</span>
                        <span v-else-if="col.clave === 'n3'" class="nivel-valor">{{ fila.conteos[3] }}</span>
                        <span v-else-if="col.clave === 'n4'" class="nivel-valor">{{ fila.conteos[4] }}</span>
                        <span v-else-if="col.clave === 'n5'" class="nivel-valor">{{ fila.conteos[5] }}</span>
                        <template v-else-if="col.clave === 'promedio'">
                          <TextoVacio v-if="fila.promedio === null" placeholder="Sin respuestas" />
                          <span v-else :class="{ 'text-muted': fila.muestra < MIN_MUESTRA_PROMEDIO }">{{ fila.promedio.toFixed(1) }}/5</span>
                        </template>
                        <template v-else>{{ fila[col.clave] }}</template>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
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
              <div class="table-wrap">
                <table class="cds-table cds-table--sm" aria-label="Todas las respuestas de satisfacción">
                  <thead>
                    <tr>
                      <template v-for="col in columnasRespuestasVisibles" :key="col.clave">
                        <ThOrdenable
                          v-if="col.ordenable"
                          :clave="col.clave"
                          :columna="columna"
                          :direccion="direccion"
                          :class="{ 'col-num': col.num }"
                          :style="estiloColumna(col)"
                          @ordenar="ordenarPor(col.clave)"
                        >{{ col.label }}</ThOrdenable>
                        <th v-else scope="col" :class="{ 'col-num': col.num }" :style="estiloColumna(col)">{{ col.label }}</th>
                      </template>
                    </tr>
                  </thead>
                  <tbody>
                    <SkeletonTabla v-if="cargando" :columnas="totalColRespuestas" />
                    <tr v-else-if="!respuestasPagina.length">
                      <td :colspan="totalColRespuestas" class="cds-table__vacio">
                        <EmptyState icono="ti ti-inbox" titulo="Sin resultados" />
                      </td>
                    </tr>
                    <template v-else>
                      <tr v-for="fila in respuestasPagina" :key="fila.id">
                        <td v-for="col in columnasRespuestasVisibles" :key="col.clave" :class="{ 'col-num': col.num }">
                          <RouterLink v-if="col.clave === 'ticket_codigo'" :to="`/tickets/${fila.ticket_id}`">{{ fila.ticket_codigo }}</RouterLink>
                          <template v-else-if="col.clave === 'tecnico'">{{ nombreTecnico(fila.tecnico_id) }}</template>
                          <template v-else-if="col.clave === 'nivel'">
                            <span v-if="fila.nivel !== null">{{ fila.nivel }}/5</span>
                            <TextoVacio v-else-if="!fila.respondida" placeholder="Pendiente" />
                            <TextoVacio v-else />
                          </template>
                          <template v-else-if="col.clave === 'comentario'">
                            <span v-if="fila.comentario">{{ fila.comentario }}</span><TextoVacio v-else />
                          </template>
                          <template v-else-if="col.clave === 'created_at'">{{ formatFechaHora(fila.fecha_envio || fila.created_at) }}</template>
                          <template v-else>{{ fila[col.clave] }}</template>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </template>
            <nav v-if="!cargando && totalItems > 0" class="paginacion" aria-label="Paginación">
              <div class="paginacion__lado">
                <label class="paginacion__campo">
                  <span>Filas por página:</span>
                  <select
                    class="paginacion__select"
                    :value="tamPagina"
                    @change="cambiarTamPagina(Number($event.target.value))"
                  >
                    <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
                  </select>
                </label>
                <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} respuestas</span>
              </div>

              <div v-if="totalPaginas > 1" class="paginacion__lado">
                <label class="paginacion__campo">
                  <span class="sr-only">Ir a la página</span>
                  <select class="paginacion__select" :value="paginaActual" @change="irAPagina(Number($event.target.value))">
                    <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
                  </select>
                  <span>de {{ totalPaginas }}</span>
                </label>
                <button class="paginacion__flecha" type="button" :disabled="paginaActual <= 1" aria-label="Página anterior" @click="irAPagina(paginaActual - 1)">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <button class="paginacion__flecha" type="button" :disabled="paginaActual >= totalPaginas" aria-label="Página siguiente" @click="irAPagina(paginaActual + 1)">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </nav>
          </template>
        </div>
      </template>
    </main>
  </div>
</template>


