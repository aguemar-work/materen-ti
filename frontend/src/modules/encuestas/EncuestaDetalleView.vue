<script setup>
// Rondas de una plantilla + resultados de la ronda seleccionada. Rondas y
// respuestas son estado local de esta vista (no se comparten con otra
// pantalla, no necesitan vivir en el store de Pinia).
import { ref, computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import { exportarCSV } from '../../core/exportar.js';
import { resumenPregunta } from '../../core/dominio-encuestas.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

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

onMounted(cargar);
</script>

<template>
  <div class="encuesta-detalle-page vista-modulo">
    <PageHeader :titulo="encuesta?.titulo || 'Encuesta'" icono="ti ti-clipboard-list">
      <template #acciones>
        <RouterLink class="btn" to="/encuestas"><i class="ti ti-arrow-left" aria-hidden="true"></i> Volver</RouterLink>
        <button v-if="auth.esJefe" class="btn btn-primary" type="button" :disabled="creandoRonda" @click="nuevaRonda">
          <i :class="creandoRonda ? 'ti ti-loader-2 spinner-icon' : 'ti ti-circle-plus'" aria-hidden="true"></i>
          {{ creandoRonda ? 'Abriendo...' : 'Nueva ronda' }}
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
            :mensaje="auth.esJefe ? 'Abre una ronda para generar el link que vas a compartir.' : 'Todavía no se abrió ninguna ronda de esta encuesta.'"
          />

          <template v-else>
          <div class="table-wrap solo-escritorio">
            <table aria-label="Rondas de la encuesta">
              <thead>
                <tr>
                  <th scope="col">Abierta</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Respuestas</th>
                  <th scope="col"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rondas" :key="r.id" :class="{ 'fila-activa': rondaSeleccionada?.id === r.id }">
                  <td>{{ formatFecha(r.abierta_en) }}</td>
                  <td>
                    <span class="badge" :class="r.cerrada ? 'badge--neutral' : 'badge--success'">
                      {{ r.cerrada ? 'Cerrada' : 'Abierta' }}
                    </span>
                  </td>
                  <td>{{ r.n_respuestas }}</td>
                  <td>
                    <div class="actions">
                      <button class="icon-btn" type="button" title="Copiar link" aria-label="Copiar link" :disabled="r.cerrada" @click="copiarLink(r)">
                        <i class="ti ti-link"></i>
                      </button>
                      <button class="icon-btn" type="button" title="Ver resultados" aria-label="Ver resultados" @click="verResultados(r)">
                        <i class="ti ti-chart-bar"></i>
                      </button>
                      <button
                        v-if="auth.esJefe && !r.cerrada"
                        class="icon-btn"
                        type="button"
                        title="Cerrar ronda"
                        aria-label="Cerrar ronda"
                        :disabled="cerrandoId === r.id"
                        @click="pedirCerrarRonda(r)"
                      >
                        <i class="ti ti-lock"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Render móvil: misma lista, como tarjetas apiladas -->
          <ul class="lista-tarjetas solo-movil" aria-label="Rondas de la encuesta">
            <li v-for="r in rondas" :key="r.id" class="tarjeta-fila" :class="{ 'fila-activa': rondaSeleccionada?.id === r.id }">
              <div class="tarjeta-fila__principal">{{ formatFecha(r.abierta_en) }}</div>
              <div class="tarjeta-fila__sec">
                <span>{{ r.n_respuestas }} respuestas</span>
              </div>
              <div class="tarjeta-fila__pie">
                <span class="badge" :class="r.cerrada ? 'badge--neutral' : 'badge--success'">
                  {{ r.cerrada ? 'Cerrada' : 'Abierta' }}
                </span>
                <div class="actions">
                  <button class="icon-btn" type="button" title="Copiar link" aria-label="Copiar link" :disabled="r.cerrada" @click="copiarLink(r)">
                    <i class="ti ti-link"></i>
                  </button>
                  <button class="icon-btn" type="button" title="Ver resultados" aria-label="Ver resultados" @click="verResultados(r)">
                    <i class="ti ti-chart-bar"></i>
                  </button>
                  <button
                    v-if="auth.esJefe && !r.cerrada"
                    class="icon-btn"
                    type="button"
                    title="Cerrar ronda"
                    aria-label="Cerrar ronda"
                    :disabled="cerrandoId === r.id"
                    @click="pedirCerrarRonda(r)"
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
            <button class="btn" type="button" :disabled="cargandoRespuestas || !respuestas.length" @click="exportar">
              <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
            </button>
          </div>

          <p v-if="cargandoRespuestas" class="sr-only" role="status">Cargando respuestas…</p>
          <EmptyState
            v-else-if="!respuestas.length"
            icono="ti ti-chart-bar"
            titulo="Sin respuestas todavía"
            mensaje="Comparte el link de esta ronda para empezar a recibir respuestas."
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

.fila-activa { background: var(--color-bg-hover); }

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
.resumen-total { font-size: var(--fs-sm); color: var(--color-text-tertiary); margin: 0 0 8px; }

.resumen-opciones { display: flex; flex-direction: column; gap: 4px; max-width: 320px; }
.resumen-opcion { display: flex; justify-content: space-between; font-size: var(--fs-base); }
.resumen-cant { font-weight: 600; }
.resumen-promedio { margin: 0 0 6px; font-size: var(--fs-base); }

.resumen-textos { margin: 0; padding-left: 18px; font-size: var(--fs-base); display: flex; flex-direction: column; gap: 4px; }
</style>
