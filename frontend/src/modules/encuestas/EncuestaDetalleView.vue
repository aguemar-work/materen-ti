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
import { rolDeTag } from '../../core/tagRol.js';
import { columnasVisibles, estiloColumna } from '../../core/tablaColumnas.js';

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
const columnasVisiblesLista = computed(() => columnasVisibles(columnas));

function claseFilaRonda(ronda) {
  return { 'fila-activa': rondaSeleccionada.value?.id === ronda.id };
}

onMounted(cargar);
</script>

<template>
  <div class="encuesta-detalle-page vista-modulo">
    <PageHeader :titulo="encuesta?.titulo || 'Encuesta'" icono="ti ti-clipboard-list">
      <template #acciones>
        <RouterLink class="btn btn--secondary" to="/encuestas">
          Volver
          <i class="ti ti-arrow-left" aria-hidden="true"></i>
        </RouterLink>
        <button
          v-if="auth.esJefe"
          type="button"
          class="btn btn--primary"
          :disabled="creandoRonda"
          @click="nuevaRonda"
        >
          <span class="btn__label">{{ creandoRonda ? 'Abriendo...' : 'Nueva ronda' }}</span>
          <i v-if="creandoRonda" class="ti ti-loader-2 btn__icono--girando" aria-hidden="true"></i>
          <i v-else class="ti ti-circle-plus" aria-hidden="true"></i>
        </button>
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

          <template v-else>
          <div class="tabla-envoltorio">
            <table class="tabla" aria-label="Rondas de la encuesta">
              <thead>
                <tr>
                  <th v-for="col in columnasVisiblesLista" :key="col.clave" scope="col" :class="{ 'col-num': col.num }" :style="estiloColumna(col)">{{ col.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="fila in rondas" :key="fila.id" :class="claseFilaRonda(fila)">
                  <td>
                    <span class="tag" :class="[`tag--${rolDeTag(fila.cerrada ? 'neutral' : 'success')}`]">
                      {{ fila.cerrada ? 'Cerrada' : 'Abierta' }}
                    </span>
                  </td>
                  <td class="col-num">{{ fila.n_respuestas }}</td>
                  <td class="col-num">
                    <span :title="formatFechaHora(fila.abierta_en)">{{ formatAntiguedad(fila.abierta_en) }}</span>
                  </td>
                  <td>
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
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <ul class="lista-tarjetas solo-movil" aria-label="Rondas de la encuesta">
            <li v-for="fila in rondas" :key="fila.id" class="tarjeta-fila" :class="claseFilaRonda(fila)">
              <div class="tarjeta-fila__principal">
                <span :title="formatFechaHora(fila.abierta_en)">{{ formatAntiguedad(fila.abierta_en) }}</span>
              </div>
              <div class="tarjeta-fila__sec">{{ fila.n_respuestas }} respuestas</div>
              <div class="tarjeta-fila__pie">
                <span class="tag" :class="[`tag--${rolDeTag(fila.cerrada ? 'neutral' : 'success')}`]">
                  {{ fila.cerrada ? 'Cerrada' : 'Abierta' }}
                </span>
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
              </div>
            </li>
          </ul>
          </template>
        </div>

        <div v-if="rondaSeleccionada" class="card card--fill resultados-card">
          <div class="card-toolbar">
            <div class="toolbar-title">Resultados — {{ formatFecha(rondaSeleccionada.abierta_en) }}</div>
            <button type="button" class="btn btn--secondary btn--sm" :disabled="cargandoRespuestas || !respuestas.length" @click="exportar">
              Exportar
              <i class="ti ti-table-export" aria-hidden="true"></i>
            </button>
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


