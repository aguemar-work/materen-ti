<script setup>
// Consolidado histórico de satisfacción de tickets (todo el tiempo, sin
// recorte de período — el reporte por período vive en /reportes). Todo lo
// agregado llega de reporte_satisfaccion_consolidado (migración 115): promedio
// general, por solicitante, por técnico y por mes, cada uno con su muestra y
// con el promedio en NULL cuando no alcanza la muestra mínima
// (csat_muestra_minima). Acá no se promedia ni se cuenta nada: solo se filtra
// y ordena la tabla de respuestas en el cliente (ya está completa en memoria).
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { formatFechaHora, formatFecha } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { generarReporteSatisfaccion } from './reporteSatisfaccion.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import DistribucionNiveles from './DistribucionNiveles.vue';

const { esMovil } = useEsMovil();

const cargando = ref(true);
const error = ref('');
const muestraMinima = ref(5);
const resumen = ref(null);
const respuestas = ref([]);
const porSolicitante = ref([]);
const porTecnico = ref([]);
const porMes = ref([]);

const nombreTecnico = (fila) => fila?.nombre || 'Sin registrar';
const tecnicoDeRespuesta = (r) => porTecnico.value.find((t) => t.tecnico_id === r.tecnico_id)?.nombre || (r.tecnico_id ? 'Sin registrar' : 'Sin registrar');

// "n insuficiente (k)" cuando el servidor no publicó el promedio.
function textoPromedio(f) {
  if (!f || f.promedio == null) return f?.muestra ? `n insuficiente (${f.muestra})` : 'Sin respuestas';
  return `${Number(f.promedio).toFixed(1)}/5`;
}

// Búsqueda 100% client-side: el histórico completo ya está en memoria.
const { termino: busqueda } = useBusqueda({ debounceMs: 0, umbralMinimo: 0, sanitizar: false });

// Chip "Solo insatisfechas" (nivel ≤ 2, misma definición que el reporte por
// período y que la columna `insatisfechos` del servidor; hasta el 2026-10-03
// incluía el 3).
const soloInsatisfechos = ref(false);
const esBaja = (r) => r.nivel !== null && r.nivel <= 2;

const respuestasFiltradas = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return respuestas.value.filter((r) => {
    if (soloInsatisfechos.value && !esBaja(r)) return false;
    if (!q) return true;
    return r.ticket_codigo.toLowerCase().includes(q) ||
      r.solicitante.toLowerCase().includes(q) ||
      tecnicoDeRespuesta(r).toLowerCase().includes(q) ||
      (r.comentario || '').toLowerCase().includes(q);
  });
});

const { columna, direccion, ordenarPor, listaOrdenada: respuestasOrdenadas } = useOrdenTabla(respuestasFiltradas, 'created_at', 'desc');
const { paginaActual, listaPaginada: respuestasPagina, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(respuestasOrdenadas);

// El PDF no puede cargar miles de filas: se recorta a las más recientes y se
// avisa el total real en una nota, no en silencio.
const MAX_RESPUESTAS_PDF = 40;
const MAX_RESPUESTAS_BAJAS_PDF = 60;

function mapRespuestaParaPdf(r) {
  return {
    ticketCodigo: r.ticket_codigo,
    solicitante: r.solicitante,
    tecnico: tecnicoDeRespuesta(r),
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
    const porFecha = (a, b) => new Date(b.fecha_envio || b.created_at) - new Date(a.fecha_envio || a.created_at);
    const bajas = respuestas.value.filter(esBaja).sort((a, b) => a.nivel - b.nivel || porFecha(a, b));
    await generarReporteSatisfaccion({
      muestraMinima: muestraMinima.value,
      resumen: resumen.value,
      porSolicitante: porSolicitante.value,
      porTecnico: porTecnico.value.map((f) => ({ ...f, nombre: nombreTecnico(f) })),
      porMes: porMes.value,
      respuestasTotal: respuestas.value.length,
      respuestas: [...respuestas.value].sort(porFecha).slice(0, MAX_RESPUESTAS_PDF).map(mapRespuestaParaPdf),
      respuestasBajasTotal: bajas.length,
      respuestasBajas: bajas.slice(0, MAX_RESPUESTAS_BAJAS_PDF).map(mapRespuestaParaPdf),
    });
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudo generar el PDF' }).mensaje, 'error');
  } finally {
    exportandoPdf.value = false;
  }
}

const FILTRO_SATISFACCION = [
  { valor: false, label: 'Todas' },
  { valor: true, label: 'Solo insatisfechas (nivel 1 o 2)', icono: 'ti ti-mood-sad' },
];

// Tono del nivel 1–5: 1-2 insatisfecho, 3 neutral, 4-5 satisfecho.
function tonoNivel(n) {
  if (n <= 2) return 'danger';
  if (n === 3) return 'neutral';
  return 'success';
}

const subtitulo = computed(() => {
  if (cargando.value) return 'Cargando encuestas…';
  const r = resumen.value || {};
  const tasa = r.tasaRespuestaPct == null ? '' : ` (${r.tasaRespuestaPct} %)`;
  return `${r.encuestasRespondidas ?? 0} de ${r.encuestasGeneradas ?? 0} encuestas respondidas${tasa} · histórico completo · promedio general ${textoPromedio(r)}`;
});

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const consolidado = await insforgeApi.obtenerSatisfaccionConsolidado();
    muestraMinima.value = consolidado.muestraMinima;
    resumen.value = consolidado.resumen;
    respuestas.value = consolidado.respuestas;
    porSolicitante.value = consolidado.porSolicitante;
    porTecnico.value = consolidado.porTecnico;
    porMes.value = consolidado.porMes;
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar la satisfacción de tickets.' }).mensaje;
    showToast(error.value, 'error');
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="w-full pb-10">
    <AppEncabezado titulo="Satisfacción de tickets" :subtitulo="subtitulo">
      <template #acciones>
        <AppButton variant="outline" severity="secondary" icon="ti ti-report" label="Reporte por período" to="/reportes" />
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
        <p class="text-sm text-gray-500">
          Un promedio se publica solo con {{ muestraMinima }} o más respuestas con nivel; con menos se muestra «n insuficiente». Insatisfecho es nivel 1 o 2.
          <template v-if="resumen"> Insatisfechas en total: {{ resumen.insatisfechos }}.</template>
        </p>

        <!-- ══ Por solicitante, por técnico y por mes ══ -->
        <div class="grid items-start gap-6 lg:grid-cols-2">
          <AppSeccion titulo="Por solicitante" :conteo="porSolicitante.length" sin-padding>
            <div class="overflow-hidden rounded-b-lg">
            <AppTable :value="porSolicitante" :lazy="false" :loading="cargando" data-key="empleado_id" aria-label="Satisfacción por solicitante">
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
              <AppColumn field="niveles" header="Respuestas 1–5">
                <template #body="{ data: f }"><DistribucionNiveles :conteos="f.niveles" /></template>
              </AppColumn>
              <AppColumn field="promedio" header="Promedio">
                <template #body="{ data: f }">
                  <span class="tabular-nums" :class="f.promedio == null ? 'text-gray-500' : 'font-medium text-gray-900'">{{ textoPromedio(f) }}</span>
                </template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Todavía no hay encuestas generadas.</p></template>
            </AppTable>
            </div>
          </AppSeccion>

          <AppSeccion
            titulo="Por técnico"
            :conteo="porTecnico.length"
            descripcion="Es quien marcó el ticket como resuelto por última vez, no necesariamente el asignado actual."
            sin-padding
          >
            <div class="overflow-hidden rounded-b-lg">
            <AppTable :value="porTecnico" :lazy="false" :loading="cargando" data-key="tecnico_id" aria-label="Satisfacción por técnico">
              <AppColumn field="nombre" header="Técnico">
                <template #body="{ data: f }">
                  <div class="min-w-0">
                    <div class="truncate font-medium text-gray-900">{{ nombreTecnico(f) }}</div>
                    <div class="text-xs tabular-nums text-gray-500">{{ f.encuestasRespondidas }} de {{ f.encuestasGeneradas }} respondidas</div>
                  </div>
                </template>
              </AppColumn>
              <AppColumn field="niveles" header="Respuestas 1–5">
                <template #body="{ data: f }"><DistribucionNiveles :conteos="f.niveles" /></template>
              </AppColumn>
              <AppColumn field="promedio" header="Promedio">
                <template #body="{ data: f }">
                  <span class="tabular-nums" :class="f.promedio == null ? 'text-gray-500' : 'font-medium text-gray-900'">{{ textoPromedio(f) }}</span>
                </template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Todavía no hay encuestas generadas.</p></template>
            </AppTable>
            </div>
          </AppSeccion>

          <AppSeccion titulo="Por mes de resolución" :conteo="porMes.length" descripcion="Encuestas de los tickets resueltos en cada mes (hora de Lima)." sin-padding class="lg:col-span-2">
            <div class="overflow-hidden rounded-b-lg">
            <AppTable :value="porMes" :lazy="false" :loading="cargando" data-key="mes" aria-label="Satisfacción por mes">
              <AppColumn field="mes" header="Mes">
                <template #body="{ data: f }"><span class="tabular-nums text-gray-900">{{ formatFecha(f.mes).slice(3) }}</span></template>
              </AppColumn>
              <AppColumn field="encuestasGeneradas" header="Generadas / respondidas">
                <template #body="{ data: f }"><span class="tabular-nums text-gray-700">{{ f.encuestasGeneradas }} / {{ f.encuestasRespondidas }}</span></template>
              </AppColumn>
              <AppColumn field="niveles" header="Respuestas 1–5">
                <template #body="{ data: f }"><DistribucionNiveles :conteos="f.niveles" /></template>
              </AppColumn>
              <AppColumn field="promedio" header="Promedio">
                <template #body="{ data: f }">
                  <span class="tabular-nums" :class="f.promedio == null ? 'text-gray-500' : 'font-medium text-gray-900'">{{ textoPromedio(f) }}</span>
                </template>
              </AppColumn>
              <template #empty><p class="py-6 text-center text-sm text-gray-500">Todavía no hay tickets resueltos con encuesta.</p></template>
            </AppTable>
            </div>
          </AppSeccion>
        </div>

        <!-- ══ Todas las respuestas ══ -->
        <section class="space-y-3" aria-labelledby="sat-respuestas">
          <h2 id="sat-respuestas" class="text-sm font-semibold text-gray-900">
            Respuestas
            <span class="ml-1 rounded-full bg-gray-100 px-2 text-xs font-medium leading-5 text-gray-600 tabular-nums">{{ respuestasFiltradas.length }}</span>
          </h2>
          <div class="flex flex-wrap items-center gap-3">
            <AppBuscador v-model="busqueda" label="Buscar respuestas" placeholder="Buscar por ticket, solicitante, técnico o comentario" />
            <AppSegmentado v-model="soloInsatisfechos" :opciones="FILTRO_SATISFACCION" label="Filtrar por satisfacción" />
          </div>

          <AppVacio v-if="!cargando && respuestasOrdenadas.length === 0" icono="ti ti-search" titulo="Sin resultados" mensaje="No hay respuestas con esos filtros." />

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
                      <RouterLink class="text-xs font-medium tabular-nums text-gray-600 hover:text-primary-700 hover:underline" :to="`/tickets/${f.ticket_id}`">{{ f.ticket_codigo }}</RouterLink>
                      <div class="truncate text-gray-900">{{ f.solicitante }}</div>
                    </div>
                  </template>
                </AppColumn>
                <AppColumn field="tecnico" header="Técnico">
                  <template #body="{ data: f }"><span class="text-gray-700">{{ tecnicoDeRespuesta(f) }}</span></template>
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
              <ul v-else class="grid grid-cols-1 gap-3" aria-label="Todas las respuestas de satisfacción">
                <li v-for="f in respuestasPagina" :key="f.id" class="rounded-lg border border-gray-200 bg-white p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <RouterLink class="text-xs font-medium tabular-nums text-gray-600" :to="`/tickets/${f.ticket_id}`">{{ f.ticket_codigo }}</RouterLink>
                      <div class="truncate font-medium text-gray-900">{{ f.solicitante }}</div>
                      <div class="text-xs text-gray-500">Atendió {{ tecnicoDeRespuesta(f) }}</div>
                    </div>
                    <AppTag v-if="f.nivel !== null" :tono="tonoNivel(f.nivel)" class="tabular-nums">{{ f.nivel }}/5</AppTag>
                    <span v-else class="text-xs text-gray-500">{{ f.respondida ? 'Sin nivel' : 'Pendiente' }}</span>
                  </div>
                  <p v-if="f.comentario" class="mt-2 text-sm text-gray-700">{{ f.comentario }}</p>
                  <p class="mt-2 text-xs tabular-nums text-gray-500">{{ formatFechaHora(f.fecha_envio || f.created_at) }}</p>
                </li>
              </ul>
              <AppPaginacion v-if="!cargando" variante="compacta" :pagina="paginaActual" :tam-pagina="tamPagina" :total="totalItems" @update:pagina="paginaActual = $event" />
            </div>
          </template>
        </section>
      </template>
    </div>
  </div>
</template>
