<script setup>
// Consolidado histórico de satisfacción de tickets (todo el tiempo, sin
// recorte de periodo — a diferencia del modal "Reporte", que sí está
// acotado a un día/semana/mes). Se trae una sola vez desde
// obtenerSatisfaccionConsolidado() y todo el orden/paginación de la tabla
// principal es en el cliente: los dos resúmenes ya necesitan el histórico
// completo, así que no tiene sentido pedirlo de nuevo por página.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { MIN_MUESTRA_PROMEDIO } from '../../api/domains/reportesTickets.js';
import { formatFechaHora } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { generarReporteSatisfaccion } from './reporteSatisfaccion.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppKpi from '../../components/ui/AppKpi.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import DistribucionNiveles from './DistribucionNiveles.vue';

const router = useRouter();
const { esMovil } = useEsMovil();

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

// ── Presentación (rediseño 2026-09-23) ──
const FILTRO_SATISFACCION = [
  { valor: false, label: 'Todas' },
  { valor: true, label: 'Solo insatisfechas (nivel ≤ 3)', icono: 'ti ti-mood-sad' },
];

const insatisfechas = computed(() => respuestas.value.filter(esBaja).length);
const tasaRespuestaGeneral = computed(() => {
  const g = resumenGeneral.value.encuestasGeneradas;
  return g ? Math.round((resumenGeneral.value.encuestasRespondidas / g) * 100) : 0;
});

// Tono del nivel 1–5: 1-2 mal, 3 regular (cuenta como insatisfecho, ver
// esBaja), 4-5 bien.
function tonoNivel(n) {
  if (n <= 2) return 'danger';
  if (n === 3) return 'warning';
  return 'success';
}

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
  <div class="mx-auto w-full max-w-7xl pb-10">
    <AppEncabezado
      titulo="Satisfacción de tickets"
      volver-label="Tickets"
      :subtitulo="cargando ? 'Cargando encuestas…' : `${resumenGeneral.encuestasRespondidas} de ${resumenGeneral.encuestasGeneradas} encuestas respondidas · histórico completo`"
      @volver="router.push('/tickets')"
    >
      <template #acciones>
        <AppButton
          :icon="exportandoPdf ? 'ti ti-loader-2' : 'ti ti-download'"
          :loading="exportandoPdf"
          :label="exportandoPdf ? 'Generando...' : 'Descargar PDF'"
          :disabled="exportandoPdf || cargando"
          @click="descargarPdf"
        />
      </template>
    </AppEncabezado>

    <div class="space-y-6 px-4 sm:px-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && !respuestas.length"
        icono="ti ti-mood-smile"
        titulo="Sin encuestas todavía"
        mensaje="Se generan automáticamente al cerrar un ticket con solicitante identificado."
      />

      <template v-else>
        <!-- ══ Indicadores: cómo va el servicio, de un vistazo ══ -->
        <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <AppKpi
            icono="ti ti-mood-smile"
            tono="primary"
            label="Promedio general"
            :valor="resumenGeneral.promedioGeneral === null ? '—' : `${resumenGeneral.promedioGeneral.toFixed(1)}/5`"
            detalle="Sobre las respuestas con nivel"
          />
          <AppKpi icono="ti ti-send" label="Encuestas generadas" :valor="resumenGeneral.encuestasGeneradas" detalle="Una por ticket cerrado con solicitante" />
          <AppKpi
            icono="ti ti-message-check"
            tono="success"
            label="Respondidas"
            :valor="resumenGeneral.encuestasRespondidas"
            :detalle="`${tasaRespuestaGeneral}% de respuesta`"
          />
          <AppKpi
            icono="ti ti-mood-sad"
            :tono="insatisfechas ? 'warning' : 'neutral'"
            label="Insatisfechas"
            :valor="insatisfechas"
            detalle="Nivel 3 o menos"
          />
        </div>

        <!-- ══ Desglose por solicitante y por técnico ══ -->
        <div class="grid items-start gap-6 lg:grid-cols-2">
          <AppSeccion
            titulo="Por solicitante"
            :conteo="porSolicitanteConNiveles.length"
            :descripcion="`Promedio en gris con menos de ${MIN_MUESTRA_PROMEDIO} respuestas con nivel.`"
            sin-padding
          >
            <div class="overflow-hidden rounded-b-lg">
            <AppTable :value="porSolicitanteConNiveles" :lazy="false" :loading="cargando" data-key="empleado_id" aria-label="Satisfacción por solicitante">
              <AppColumn field="nombre" header="Solicitante">
                <template #body="{ data: f }">
                  <div class="min-w-0">
                    <div class="truncate font-medium text-gray-900">{{ f.nombre }}</div>
                    <div class="text-xs tabular-nums text-gray-500">
                      {{ f.encuestasRespondidas }} respondida(s)<template v-if="f.encuestasGeneradas - f.encuestasRespondidas"> · {{ f.encuestasGeneradas - f.encuestasRespondidas }} pendiente(s)</template>
                    </div>
                  </div>
                </template>
              </AppColumn>
              <AppColumn field="conteos" header="Respuestas 1–5">
                <template #body="{ data: f }">
                  <DistribucionNiveles :conteos="f.conteos" />
                </template>
              </AppColumn>
              <AppColumn field="promedio" header="Promedio">
                <template #body="{ data: f }">
                  <span v-if="f.promedio === null" class="text-gray-500">Sin respuestas</span>
                  <span v-else class="font-medium tabular-nums" :class="f.muestra < MIN_MUESTRA_PROMEDIO ? 'text-gray-500' : 'text-gray-900'">{{ f.promedio.toFixed(1) }}/5</span>
                </template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Todavía no hay encuestas generadas.</p></template>
            </AppTable>
            </div>
          </AppSeccion>

          <AppSeccion
            titulo="Por técnico"
            :conteo="porTecnicoConNiveles.length"
            descripcion="Es quien marcó el ticket como resuelto por última vez, no necesariamente el asignado actual."
            sin-padding
          >
            <div class="overflow-hidden rounded-b-lg">
            <AppTable :value="porTecnicoConNiveles" :lazy="false" :loading="cargando" data-key="tecnico_id" aria-label="Satisfacción por técnico">
              <AppColumn field="nombre" header="Técnico">
                <template #body="{ data: f }">
                  <div class="min-w-0">
                    <div class="truncate font-medium text-gray-900">{{ f.nombre }}</div>
                    <div class="text-xs tabular-nums text-gray-500">{{ f.encuestasRespondidas }} de {{ f.encuestasGeneradas }} respondidas</div>
                  </div>
                </template>
              </AppColumn>
              <AppColumn field="conteos" header="Respuestas 1–5">
                <template #body="{ data: f }">
                  <DistribucionNiveles :conteos="f.conteos" />
                </template>
              </AppColumn>
              <AppColumn field="promedio" header="Promedio">
                <template #body="{ data: f }">
                  <span v-if="f.promedio === null" class="text-gray-500">Sin respuestas</span>
                  <span v-else class="font-medium tabular-nums" :class="f.muestra < MIN_MUESTRA_PROMEDIO ? 'text-gray-500' : 'text-gray-900'">{{ f.promedio.toFixed(1) }}/5</span>
                </template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Todavía no hay encuestas generadas.</p></template>
            </AppTable>
            </div>
          </AppSeccion>
        </div>

        <!-- ══ Todas las respuestas: barra de filtros fuera de la card ══ -->
        <section class="space-y-3" aria-labelledby="sat-respuestas">
          <h2 id="sat-respuestas" class="text-sm font-semibold text-gray-900">
            Respuestas
            <span class="ml-1 rounded-full bg-gray-100 px-2 text-xs font-medium leading-5 text-gray-600 tabular-nums">{{ respuestasFiltradas.length }}</span>
          </h2>
          <div class="flex flex-wrap items-center gap-3">
            <AppBuscador v-model="busqueda" label="Buscar respuestas" placeholder="Buscar por ticket, solicitante, técnico o comentario" />
            <AppSegmentado v-model="soloInsatisfechos" :opciones="FILTRO_SATISFACCION" label="Filtrar por satisfacción" />
          </div>

          <AppVacio
            v-if="!cargando && respuestasOrdenadas.length === 0"
            icono="ti ti-search"
            titulo="Sin resultados"
            mensaje="No hay respuestas con esos filtros."
          />

          <template v-else>
            <p v-if="cargando" class="sr-only" role="status">Cargando satisfacción de tickets…</p>

            <div v-if="!esMovil" class="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <AppTable
                :value="respuestasPagina"
                :lazy="false"
                :loading="cargando"
                :rows="tamPagina"
                :orden="{ columna, direccion }"
                aria-label="Todas las respuestas de satisfacción"
                @ordenar="ordenarPor"
              >
                <AppColumn field="solicitante" header="Ticket y solicitante" sortable>
                  <template #body="{ data: f }">
                    <div class="min-w-0">
                      <RouterLink
                        class="text-xs font-medium tabular-nums text-gray-600 hover:text-primary-700 hover:underline"
                        :to="`/tickets/${f.ticket_id}`"
                      >{{ f.ticket_codigo }}</RouterLink>
                      <div class="truncate text-gray-900">{{ f.solicitante }}</div>
                    </div>
                  </template>
                </AppColumn>
                <AppColumn field="tecnico" header="Técnico">
                  <template #body="{ data: f }"><span class="text-gray-700">{{ nombreTecnico(f.tecnico_id) }}</span></template>
                </AppColumn>
                <AppColumn field="nivel" header="Nivel" sortable :header-style="{ width: '110px' }">
                  <template #body="{ data: f }">
                    <AppTag v-if="f.nivel !== null" :tono="tonoNivel(f.nivel)" class="tabular-nums">{{ f.nivel }}/5</AppTag>
                    <span v-else-if="!f.respondida" class="text-gray-500">Pendiente</span>
                    <span v-else class="text-gray-500">Sin nivel</span>
                  </template>
                </AppColumn>
                <AppColumn field="comentario" header="Comentario">
                  <template #body="{ data: f }">
                    <p v-if="f.comentario" class="line-clamp-2 max-w-md text-gray-700" :title="f.comentario">{{ f.comentario }}</p>
                    <span v-else class="text-gray-500">Sin comentario</span>
                  </template>
                </AppColumn>
                <AppColumn field="created_at" header="Fecha" sortable :header-style="{ width: '150px' }">
                  <template #body="{ data: f }"><span class="whitespace-nowrap tabular-nums text-gray-500">{{ formatFechaHora(f.fecha_envio || f.created_at) }}</span></template>
                </AppColumn>
              </AppTable>
              <AppPaginacion
                v-if="!cargando && totalItems > 0"
                :pagina="paginaActual"
                :tam-pagina="tamPagina"
                :total="totalItems"
                @update:pagina="paginaActual = $event"
                @update:tam-pagina="cambiarTamPagina"
              />
            </div>

            <!-- Móvil: una tarjeta por respuesta -->
            <div v-else>
              <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando respuestas...</p>
              <ul v-else class="grid gap-3" aria-label="Todas las respuestas de satisfacción">
                <li v-for="f in respuestasPagina" :key="f.id" class="rounded-lg border border-gray-200 bg-white p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <RouterLink class="text-xs font-medium tabular-nums text-gray-600" :to="`/tickets/${f.ticket_id}`">{{ f.ticket_codigo }}</RouterLink>
                      <div class="truncate font-medium text-gray-900">{{ f.solicitante }}</div>
                      <div class="text-xs text-gray-500">Atendió {{ nombreTecnico(f.tecnico_id) }}</div>
                    </div>
                    <AppTag v-if="f.nivel !== null" :tono="tonoNivel(f.nivel)" class="tabular-nums">{{ f.nivel }}/5</AppTag>
                    <span v-else class="text-xs text-gray-500">{{ f.respondida ? 'Sin nivel' : 'Pendiente' }}</span>
                  </div>
                  <p v-if="f.comentario" class="mt-2 text-sm text-gray-700">{{ f.comentario }}</p>
                  <p class="mt-2 text-xs tabular-nums text-gray-500">{{ formatFechaHora(f.fecha_envio || f.created_at) }}</p>
                </li>
              </ul>
              <AppPaginacion
                v-if="!cargando"
                variante="compacta"
                :pagina="paginaActual"
                :tam-pagina="tamPagina"
                :total="totalItems"
                @update:pagina="paginaActual = $event"
              />
            </div>
          </template>
        </section>
      </template>
    </div>
  </div>
</template>
