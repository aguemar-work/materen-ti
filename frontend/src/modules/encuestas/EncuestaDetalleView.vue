<script setup>
// Rondas de una plantilla + resultados de la ronda seleccionada. Rondas y
// respuestas son estado local de esta vista (no se comparten con otra
// pantalla, no necesitan vivir en el store de Pinia).
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import EnlaceReporte from '../../components/shared/EnlaceReporte.vue';
import { resumenPregunta, tipoPreguntaInfo } from '../../core/dominio-encuestas.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppTag from '../../components/ui/AppTag.vue';

const route = useRoute();
const auth = useAuthStore();
const encuestaId = route.params.id;

const encuesta = ref(null);
const rondas = ref([]);
const cargando = ref(true);
const error = ref('');

const rondaSeleccionada = ref(null);
const respuestas = ref([]);
const cargandoRespuestas = ref(false);
const creandoRonda = ref(false);
const cerrandoId = ref(null);

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const [datosEncuesta, datosRondas] = await Promise.all([
      insforgeApi.getEncuesta(encuestaId),
      insforgeApi.listRondas(encuestaId),
    ]);
    encuesta.value = datosEncuesta;
    rondas.value = datosRondas;
  } catch (e) {
    error.value = e?.message || 'Error al cargar la encuesta';
  } finally {
    cargando.value = false;
  }
}

async function nuevaRonda() {
  creandoRonda.value = true;
  try {
    const ronda = await insforgeApi.crearRonda(encuestaId);
    rondas.value.unshift({ ...ronda, n_respuestas: 0 });
    showToast('Ronda abierta');
  } catch (e) {
    showToast(e?.message || 'Error al abrir la ronda', 'error');
  } finally {
    creandoRonda.value = false;
  }
}

// Cerrar una ronda no se puede revertir desde la interfaz (no existe
// función para "reabrir"), así que pide confirmación (ConfirmDialog
// compartido) antes de ejecutarla, en vez de disparar el cierre al clic.
const rondaPorCerrar = ref(null);
const dialogoCerrarRonda = ref(null);

function pedirCerrarRonda(ronda) {
  rondaPorCerrar.value = ronda;
}

async function cerrarRonda() {
  const ronda = rondaPorCerrar.value;
  if (!ronda) return;
  cerrandoId.value = ronda.id;
  try {
    await insforgeApi.cerrarRonda(ronda.id);
    ronda.cerrada = true;
    showToast('Ronda cerrada');
    dialogoCerrarRonda.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al cerrar la ronda', 'error');
  } finally {
    cerrandoId.value = null;
  }
}

function linkRonda(ronda) {
  return `${window.location.origin}/encuesta/${ronda.slug}`;
}

async function copiarLink(ronda) {
  try {
    await navigator.clipboard.writeText(linkRonda(ronda));
    showToast('Link copiado');
  } catch {
    showToast('No se pudo copiar. Selecciónelo manualmente', 'error');
  }
}

async function verResultados(ronda) {
  rondaSeleccionada.value = ronda;
  cargandoRespuestas.value = true;
  try {
    const filas = await insforgeApi.listRespuestas(ronda.id);
    respuestas.value = filas.map((f) => f.respuestas);
  } catch (e) {
    showToast(e?.message || 'Error al cargar respuestas', 'error');
    respuestas.value = [];
  } finally {
    cargandoRespuestas.value = false;
  }
}

const resumenes = computed(() => {
  if (!encuesta.value) return [];
  return encuesta.value.preguntas.map((p) => ({
    pregunta: p,
    resumen: resumenPregunta(p, respuestas.value),
  }));
});

// ── Presentación (rediseño 2026-09-23) ──────────────────────────────────
function porcentaje(cant, total) {
  return total ? Math.round((cant / total) * 100) : 0;
}

// Filas de barras por pregunta cerrada: [{ label, cant }] — la vista pinta
// todas igual (etiqueta · barra · cifra), sea opción única, sí/no o escala.
function barrasDe(resumen) {
  if (resumen.tipo === 'opcion_unica') return Object.entries(resumen.conteos).map(([label, cant]) => ({ label, cant }));
  if (resumen.tipo === 'si_no') return [{ label: 'Sí', cant: resumen.si }, { label: 'No', cant: resumen.no }];
  if (resumen.tipo === 'escala_1_5') return [5, 4, 3, 2, 1].map((n) => ({ label: String(n), cant: resumen.conteos[n] }));
  return [];
}

const totalRespuestas = computed(() => rondas.value.reduce((acc, r) => acc + (r.n_respuestas || 0), 0));

// Una pantalla de resultados que abre vacía obliga a un clic que siempre es
// el mismo: se preselecciona la ronda más reciente con respuestas (o la más
// reciente a secas). Usa el mismo verResultados() del clic manual.
onMounted(async () => {
  await cargar();
  const inicial = rondas.value.find((r) => r.n_respuestas > 0) || rondas.value[0];
  if (inicial) verResultados(inicial);
});
</script>

<template>
  <div class="w-full px-4 pb-10 pt-5 sm:px-6">
    <RouterLink
      to="/encuestas"
      class="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <i class="ti ti-arrow-left" aria-hidden="true"></i>
      Encuestas
    </RouterLink>

    <div v-if="error" class="notif notif--danger mt-4" role="alert">
      <i class="ti ti-alert-circle" aria-hidden="true"></i>
      <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
    </div>

    <p v-else-if="cargando" class="py-16 text-center text-sm text-gray-500" role="status">Cargando encuesta...</p>

    <template v-else>
      <!-- ══ Encabezado ════════════════════════════════════════════ -->
      <header class="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-2xl text-gray-500">
          <i class="ti ti-clipboard-list" aria-hidden="true"></i>
        </span>
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-semibold tracking-tight text-gray-900">{{ encuesta?.titulo || 'Encuesta' }}</h1>
          <p v-if="encuesta?.descripcion" class="mt-1 max-w-prose text-sm text-gray-600">{{ encuesta.descripcion }}</p>
          <ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-500 tabular-nums">
            <li class="inline-flex items-center gap-1.5"><i class="ti ti-list-details" aria-hidden="true"></i>{{ encuesta?.preguntas?.length || 0 }} preguntas</li>
            <li class="inline-flex items-center gap-1.5"><i class="ti ti-repeat" aria-hidden="true"></i>{{ rondas.length }} {{ rondas.length === 1 ? 'ronda' : 'rondas' }}</li>
            <li class="inline-flex items-center gap-1.5"><i class="ti ti-message-circle" aria-hidden="true"></i>{{ totalRespuestas }} respuestas en total</li>
          </ul>
        </div>
        <div v-if="auth.esJefe" class="flex shrink-0 flex-wrap gap-2">
          <AppButton
            :icon="creandoRonda ? 'ti ti-loader-2' : 'ti ti-circle-plus'"
            :label="creandoRonda ? 'Abriendo...' : 'Nueva ronda'"
            :loading="creandoRonda"
            :disabled="creandoRonda"
            @click="nuevaRonda"
          />
        </div>
      </header>

      <!-- ══ Rondas (maestro) + resultados de la elegida (detalle) ═══ -->
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <AppSeccion titulo="Rondas" :conteo="rondas.length" descripcion="Elija una para ver sus resultados" sin-padding class="lg:sticky lg:top-6">
          <AppVacio
            v-if="rondas.length === 0"
            variante="seccion"
            titulo="Sin rondas todavía"
            :mensaje="auth.esJefe ? 'Abra una ronda para generar el link que va a compartir.' : 'Todavía no se abrió ninguna ronda de esta encuesta.'"
          />
          <ul v-else class="divide-y divide-gray-100" aria-label="Rondas de la encuesta">
            <li
              v-for="fila in rondas"
              :key="fila.id"
              class="flex items-center gap-2 px-3.5 py-3 transition-colors duration-150"
              :class="rondaSeleccionada?.id === fila.id ? 'bg-primary-50' : 'hover:bg-gray-50'"
            >
              <button
                type="button"
                class="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                :aria-pressed="rondaSeleccionada?.id === fila.id"
                :aria-label="`Ver resultados de la ronda abierta el ${formatFecha(fila.abierta_en)}`"
                @click="verResultados(fila)"
              >
                <span class="flex items-center gap-2">
                  <span class="text-sm font-medium text-gray-900 tabular-nums" :title="formatFechaHora(fila.abierta_en)">{{ formatFecha(fila.abierta_en) }}</span>
                  <AppTag :tono="fila.cerrada ? 'neutral' : 'success'" :punto="!fila.cerrada">{{ fila.cerrada ? 'Cerrada' : 'Abierta' }}</AppTag>
                </span>
                <span class="mt-0.5 block text-xs text-gray-500 tabular-nums">
                  {{ fila.n_respuestas }} {{ fila.n_respuestas === 1 ? 'respuesta' : 'respuestas' }} · {{ formatAntiguedad(fila.abierta_en) }}
                </span>
              </button>
              <button
                class="icon-btn"
                type="button"
                title="Copiar link"
                aria-label="Copiar link"
                :disabled="fila.cerrada"
                @click="copiarLink(fila)"
              >
                <i class="ti ti-link" aria-hidden="true"></i>
              </button>
              <button
                v-if="auth.esJefe && !fila.cerrada"
                class="icon-btn"
                type="button"
                title="Cerrar ronda"
                aria-label="Cerrar ronda"
                :disabled="cerrandoId === fila.id"
                @click="pedirCerrarRonda(fila)"
              >
                <i class="ti ti-lock" aria-hidden="true"></i>
              </button>
            </li>
          </ul>
        </AppSeccion>

        <!-- ── Resultados ── -->
        <AppSeccion
          v-if="rondaSeleccionada"
          :titulo="`Resultados de la ronda del ${formatFecha(rondaSeleccionada.abierta_en)}`"
          :descripcion="cargandoRespuestas ? 'Cargando…' : `${respuestas.length} ${respuestas.length === 1 ? 'persona respondió' : 'personas respondieron'}`"
          sin-padding
        >
          <template #acciones>
            <EnlaceReporte reporte="encuestas" :query="{ ronda: rondaSeleccionada.id }" size="sm" />
          </template>

          <p v-if="cargandoRespuestas" class="px-4 py-10 text-center text-sm text-gray-500" role="status">Cargando respuestas…</p>
          <AppVacio
            v-else-if="!respuestas.length"
            variante="seccion"
            titulo="Sin respuestas todavía"
            mensaje="Comparta el link de esta ronda para empezar a recibir respuestas."
          />

          <ol v-else class="divide-y divide-gray-100">
            <li v-for="({ pregunta, resumen }, idx) in resumenes" :key="pregunta.id" class="px-4 py-5 sm:px-5">
              <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <h3 class="min-w-0 flex-1 text-sm font-semibold text-gray-900">
                  <span class="mr-1 text-gray-500 tabular-nums">{{ idx + 1 }}.</span>{{ pregunta.etiqueta }}
                </h3>
                <span class="text-xs text-gray-500">{{ tipoPreguntaInfo(pregunta.tipo).label }}</span>
              </div>
              <p class="mt-0.5 text-xs text-gray-500 tabular-nums">{{ resumen.total }} de {{ respuestas.length }} respondieron</p>

              <!-- Escala: el promedio es la cifra que se lee primero -->
              <p v-if="resumen.tipo === 'escala_1_5'" class="mt-3 flex items-baseline gap-1.5">
                <span class="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{{ resumen.promedio.toFixed(1) }}</span>
                <span class="text-sm text-gray-500">promedio sobre 5</span>
              </p>

              <!-- Preguntas cerradas: una barra por opción, con cifra y porcentaje -->
              <ul
                v-if="resumen.tipo === 'opcion_unica' || resumen.tipo === 'si_no' || resumen.tipo === 'escala_1_5'"
                class="mt-3 max-w-2xl space-y-2"
              >
                <li
                  v-for="barra in barrasDe(resumen)"
                  :key="barra.label"
                  class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm"
                >
                  <span class="truncate text-gray-700" :title="barra.label">{{ barra.label }}</span>
                  <span class="h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                    <span class="block h-full rounded-full bg-primary-500" :style="{ width: `${porcentaje(barra.cant, resumen.total)}%` }"></span>
                  </span>
                  <span class="text-right text-gray-900 tabular-nums">
                    {{ barra.cant }}
                    <span class="text-xs text-gray-500">· {{ porcentaje(barra.cant, resumen.total) }}%</span>
                  </span>
                </li>
              </ul>

              <!-- Preguntas abiertas: las respuestas tal cual -->
              <template v-else>
                <p v-if="!resumen.textos.length" class="mt-3 text-sm text-gray-500">Nadie respondió esta pregunta.</p>
                <ul v-else class="mt-3 max-w-prose space-y-2">
                  <li
                    v-for="(t, i) in resumen.textos"
                    :key="i"
                    class="whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700"
                  >{{ t }}</li>
                </ul>
              </template>
            </li>
          </ol>
        </AppSeccion>

        <AppVacio
          v-else-if="rondas.length"
          icono="ti ti-chart-bar"
          titulo="Elija una ronda"
          mensaje="Los resultados de la ronda seleccionada aparecen acá, pregunta por pregunta."
        />
      </div>
    </template>

    <ConfirmDialog
      v-if="rondaPorCerrar"
      ref="dialogoCerrarRonda"
      destructivo
      icono="ti-lock"
      titulo="Cerrar ronda"
      mensaje="¿Cerrar esta ronda? Deja de recibir respuestas y no se puede reabrir desde la interfaz."
      confirmar-label="Cerrar ronda"
      :cargando="cerrandoId === rondaPorCerrar?.id"
      @cerrado="rondaPorCerrar = null"
      @confirm="cerrarRonda"
    />
  </div>
</template>
