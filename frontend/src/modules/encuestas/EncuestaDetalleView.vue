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
import { exportarCSV } from '../../core/exportar.js';
import { resumenPregunta } from '../../core/dominio-encuestas.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';

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
    showToast('No se pudo copiar. Selecciónalo manualmente', 'error');
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

function exportar() {
  const preguntas = encuesta.value.preguntas;
  exportarCSV(
    `encuesta-${encuesta.value.titulo}-ronda`,
    preguntas.map((p) => p.etiqueta),
    respuestas.value.map((r) => preguntas.map((p) => {
      const v = r[p.id];
      if (v === undefined || v === null) return '';
      if (typeof v === 'boolean') return v ? 'Sí' : 'No';
      return v;
    })),
  );
}

// Definición de columnas de CarbonDataTable: sin orden ni paginación (la
// lista de rondas de una encuesta es corta). "Abierta" es la más parecida a
// un dato principal; ninguna columna es de texto largo, así que no hay
// elástica.
const columnas = [
  { clave: 'estado', label: 'Estado', movil: 'pie' },
  { clave: 'n_respuestas', label: 'Respuestas', num: true, movil: 'sec' },
  { clave: 'abierta_en', label: 'Abierta', num: true, movil: 'principal' },
  { clave: 'acciones', label: 'Acciones', ancho: '132px', movil: 'pie' },
];

function claseFilaRonda(ronda) {
  return { 'fila-activa': rondaSeleccionada.value?.id === ronda.id };
}

onMounted(cargar);
</script>

<template>
  <div class="encuesta-detalle-page vista-modulo">
    <PageHeader :titulo="encuesta?.titulo || 'Encuesta'" icono="ti ti-clipboard-list">
      <template #acciones>
        <CarbonButton variante="secondary" icono="ti-arrow-left" :to="'/encuestas'">Volver</CarbonButton>
        <CarbonButton v-if="auth.esJefe" variante="primary" icono="ti-circle-plus" :cargando="creandoRonda" @click="nuevaRonda">
          {{ creandoRonda ? 'Abriendo...' : 'Nueva ronda' }}
        </CarbonButton>
      </template>
    </PageHeader>

    <main class="page">
      <div v-if="error" class="card no-results">{{ error }}</div>

      <template v-else-if="!cargando">
        <p v-if="encuesta?.descripcion" class="encuesta-descripcion">{{ encuesta.descripcion }}</p>

        <div class="card card--fill">
          <EmptyState
            v-if="rondas.length === 0"
            icono="ti ti-circle-plus"
            titulo="Sin rondas todavía"
            :mensaje="auth.esJefe ? 'Abra una ronda para generar el link que va a compartir.' : 'Todavía no se abrió ninguna ronda de esta encuesta.'"
          />

          <CarbonDataTable
            v-else
            :columnas="columnas"
            :filas="rondas"
            :clase-fila="claseFilaRonda"
            etiqueta="Rondas de la encuesta"
          >
            <template #celda-estado="{ fila }">
              <CarbonTag :variante="fila.cerrada ? 'neutral' : 'success'">
                {{ fila.cerrada ? 'Cerrada' : 'Abierta' }}
              </CarbonTag>
            </template>
            <template #celda-abierta_en="{ fila }">
              <span :title="formatFechaHora(fila.abierta_en)">{{ formatAntiguedad(fila.abierta_en) }}</span>
            </template>
            <template #celda-acciones="{ fila }">
              <div class="actions">
                <button class="icon-btn fila-accion" type="button" title="Copiar link" aria-label="Copiar link" :disabled="fila.cerrada" @click="copiarLink(fila)">
                  <i class="ti ti-link"></i>
                </button>
                <button class="icon-btn fila-accion" type="button" title="Ver resultados" aria-label="Ver resultados" @click="verResultados(fila)">
                  <i class="ti ti-chart-bar"></i>
                </button>
                <button
                  v-if="auth.esJefe && !fila.cerrada"
                  class="icon-btn fila-accion"
                  type="button"
                  title="Cerrar ronda"
                  aria-label="Cerrar ronda"
                  :disabled="cerrandoId === fila.id"
                  @click="pedirCerrarRonda(fila)"
                >
                  <i class="ti ti-lock"></i>
                </button>
              </div>
            </template>
          </CarbonDataTable>
        </div>

        <div v-if="rondaSeleccionada" class="card card--fill resultados-card">
          <div class="card-toolbar">
            <div class="toolbar-title">Resultados — {{ formatFecha(rondaSeleccionada.abierta_en) }}</div>
            <CarbonButton variante="secondary" tam="sm" icono="ti-table-export" :deshabilitado="cargandoRespuestas || !respuestas.length" @click="exportar">Exportar</CarbonButton>
          </div>

          <p v-if="cargandoRespuestas" class="sr-only" role="status">Cargando respuestas…</p>
          <EmptyState
            v-else-if="!respuestas.length"
            icono="ti ti-chart-bar"
            titulo="Sin respuestas todavía"
            mensaje="Comparta el link de esta ronda para empezar a recibir respuestas."
          />

          <div v-else class="resumenes">
            <div v-for="({ pregunta, resumen }) in resumenes" :key="pregunta.id" class="resumen-bloque">
              <p class="resumen-etiqueta">{{ pregunta.etiqueta }}</p>
              <p class="resumen-total">{{ resumen.total }} de {{ respuestas.length }} respondieron</p>

              <div v-if="resumen.tipo === 'opcion_unica'" class="resumen-opciones">
                <div v-for="(cant, opcion) in resumen.conteos" :key="opcion" class="resumen-opcion">
                  <span>{{ opcion }}</span>
                  <span class="resumen-cant">{{ cant }}</span>
                </div>
              </div>

              <div v-else-if="resumen.tipo === 'si_no'" class="resumen-opciones">
                <div class="resumen-opcion"><span>Sí</span><span class="resumen-cant">{{ resumen.si }}</span></div>
                <div class="resumen-opcion"><span>No</span><span class="resumen-cant">{{ resumen.no }}</span></div>
              </div>

              <div v-else-if="resumen.tipo === 'escala_1_5'" class="resumen-opciones">
                <p class="resumen-promedio">Promedio: <strong>{{ resumen.promedio.toFixed(1) }}</strong> / 5</p>
                <div v-for="n in [1, 2, 3, 4, 5]" :key="n" class="resumen-opcion">
                  <span>{{ n }}</span>
                  <span class="resumen-cant">{{ resumen.conteos[n] }}</span>
                </div>
              </div>

              <ul v-else class="resumen-textos">
                <li v-for="(t, i) in resumen.textos" :key="i">{{ t }}</li>
              </ul>
            </div>
          </div>
        </div>
      </template>
    </main>

    <ConfirmDialog
      v-if="rondaPorCerrar"
      ref="dialogoCerrarRonda"
      destructivo
      icono="ti-lock"
      titulo="Cerrar ronda"
      mensaje="¿Cerrar esta ronda? Deja de recibir respuestas y no se puede reabrir desde la interfaz."
      confirmar-label="Cerrar ronda"
      :cargando="cerrandoId === rondaPorCerrar?.id"
      @cancel="rondaPorCerrar = null"
      @confirm="cerrarRonda"
    />
  </div>
</template>

<style scoped>
.encuesta-descripcion {
  color: var(--color-text-secondary);
  margin: -8px 0 16px;
}

/* :deep porque la fila y la tarjeta activa las pinta CarbonDataTable en su
   propio scope; sin :deep esta regla no llegaría al <tr>/<li> reales. */
:deep(.fila-activa) { background: var(--color-bg-hover); }

.resultados-card { margin-top: 16px; }

.resumenes {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 20px;
}

.resumen-bloque { border-top: 1px solid var(--color-border-subtle); padding-top: 14px; }
.resumen-bloque:first-child { border-top: none; padding-top: 0; }

.resumen-etiqueta { font-weight: 600; margin: 0 0 2px; }
.resumen-total { font-size: var(--fs-label-01); color: var(--color-text-tertiary); margin: 0 0 8px; }

.resumen-opciones { display: flex; flex-direction: column; gap: 4px; max-width: 320px; }
.resumen-opcion { display: flex; justify-content: space-between; font-size: var(--fs-body-01); }
.resumen-cant { font-weight: 600; }
.resumen-promedio { margin: 0 0 6px; font-size: var(--fs-body-01); }

.resumen-textos { margin: 0; padding-left: 18px; font-size: var(--fs-body-01); display: flex; flex-direction: column; gap: 4px; }
</style>
