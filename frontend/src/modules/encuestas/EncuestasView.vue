<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterLink } from 'vue-router';
import { useEncuestasStore } from '../../stores/encuestas.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import EncuestaForm from './EncuestaForm.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';
import { columnasVisibles, estiloColumna } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';

const store = useEncuestasStore();
const auth = useAuthStore();
const { lista, cargando, error } = storeToRefs(store);

const mostrarForm = ref(false);
const encuestaEditar = ref(null);

function abrirNueva() {
  encuestaEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(encuesta) {
  encuestaEditar.value = encuesta;
  mostrarForm.value = true;
}

function onFormCerrado() {
  mostrarForm.value = false;
  encuestaEditar.value = null;
}

const porEliminar = ref(null);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function confirmarEliminar() {
  const e = porEliminar.value;
  if (!e) return;
  eliminando.value = true;
  try {
    await store.softDelete(e.id);
    showToast('Encuesta eliminada');
    dialogoEliminar.value?.cerrar();
  } catch (err) {
    showToast(err?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar las encuestas', 'error');
  }
});

const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(lista);

const columnas = [
  { clave: 'titulo', label: 'Título', elastica: true, movil: 'principal' },
  { clave: 'preguntas', label: 'Preguntas', num: true, movil: 'sec' },
  { clave: 'created_at', label: 'Creada', num: true, movil: 'sec' },
  { clave: 'acciones', label: 'Acciones', ancho: '128px', movil: 'pie' },
];
const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);

const totalPaginas = computed(() => totalPaginasDe(totalItems.value, tamPagina.value));
const paginas = computed(() => paginasDe(totalPaginas.value));
const desde = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value).desde);
const hasta = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value).hasta);
function irA(pagina) {
  paginaActual.value = clampPagina(pagina, totalPaginas.value);
}
</script>

<template>
  <div class="encuestas-page vista-modulo">
    <PageHeader titulo="Encuestas" icono="ti ti-clipboard-list" :conteo="lista.length">
      <template v-if="auth.esJefe" #acciones>
        <button type="button" class="btn btn--primary" @click="abrirNueva">
          Nueva encuesta
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </template>
    </PageHeader>

    <p class="encuestas-nota-satisfaccion">
      ¿Busca la satisfacción de un ticket puntual? Eso vive en
      <RouterLink to="/tickets/satisfaccion">Tickets → Satisfacción</RouterLink>
      — son dos sistemas distintos: esta pantalla es para encuestas propias
      (clima, feedback puntual, rondas anónimas).
    </p>

    <main class="page">
      <div class="card card--fill">
        <div v-if="error" class="no-results">{{ error }}</div>

        <template v-else>
        <div class="tabla-envoltorio">
          <table class="tabla" aria-label="Encuestas">
            <thead>
              <tr>
                <th v-for="col in columnasVisiblesLista" :key="col.clave" scope="col" :class="{ 'col-num': col.num }" :style="estiloColumna(col)">{{ col.label }}</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
              <tr v-else-if="!listaPaginada.length">
                <td :colspan="totalColumnas" class="tabla__vacio">
                  <EmptyState
                    icono="ti ti-clipboard-list"
                    titulo="Sin encuestas"
                    :mensaje="auth.esJefe ? 'Cree una plantilla de encuesta para lanzar la primera ronda.' : 'Todavía no hay ninguna encuesta creada.'"
                  >
                    <button v-if="auth.esJefe" type="button" class="btn btn--secondary" @click="abrirNueva">
                      Nueva encuesta
                      <i class="ti ti-plus" aria-hidden="true"></i>
                    </button>
                  </EmptyState>
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in listaPaginada" :key="fila.id">
                  <td>
                    <RouterLink class="user-name empleado-link" :to="`/encuestas/${fila.id}`">{{ fila.titulo }}</RouterLink>
                  </td>
                  <td class="col-num">{{ fila.preguntas?.length || 0 }}</td>
                  <td class="col-num">
                    <span :title="formatFechaHora(fila.created_at)">{{ formatAntiguedad(fila.created_at) }}</span>
                  </td>
                  <td>
                    <div class="actions">
                      <RouterLink class="icon-btn fila-accion" :to="`/encuestas/${fila.id}`" title="Ver rondas y resultados" aria-label="Ver rondas y resultados">
                        <i class="ti ti-chart-bar"></i>
                      </RouterLink>
                      <template v-if="auth.esJefe">
                        <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(fila)">
                          <i class="ti ti-pencil"></i>
                        </button>
                        <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
                          <i class="ti ti-trash"></i>
                        </button>
                      </template>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul v-if="!cargando && listaPaginada.length" class="lista-tarjetas solo-movil" aria-label="Encuestas">
          <li v-for="fila in listaPaginada" :key="fila.id" class="tarjeta-fila">
            <div class="tarjeta-fila__principal">
              <RouterLink class="user-name empleado-link" :to="`/encuestas/${fila.id}`">{{ fila.titulo }}</RouterLink>
            </div>
            <div class="tarjeta-fila__sec">{{ fila.preguntas?.length || 0 }} preguntas</div>
            <div class="tarjeta-fila__sec">
              <span :title="formatFechaHora(fila.created_at)">{{ formatAntiguedad(fila.created_at) }}</span>
            </div>
            <div class="tarjeta-fila__pie">
              <div class="actions">
                <RouterLink class="icon-btn fila-accion" :to="`/encuestas/${fila.id}`" title="Ver rondas y resultados" aria-label="Ver rondas y resultados">
                  <i class="ti ti-chart-bar"></i>
                </RouterLink>
                <template v-if="auth.esJefe">
                  <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(fila)">
                    <i class="ti ti-pencil"></i>
                  </button>
                  <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
                    <i class="ti ti-trash"></i>
                  </button>
                </template>
              </div>
            </div>
          </li>
        </ul>

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
            <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} encuestas</span>
          </div>

          <div v-if="totalPaginas > 1" class="paginacion__lado">
            <label class="paginacion__campo">
              <span class="sr-only">Ir a la página</span>
              <select class="paginacion__select" :value="paginaActual" @change="irA(Number($event.target.value))">
                <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
              </select>
              <span>de {{ totalPaginas }}</span>
            </label>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual <= 1" aria-label="Página anterior" @click="irA(paginaActual - 1)">
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual >= totalPaginas" aria-label="Página siguiente" @click="irA(paginaActual + 1)">
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
        </template>
      </div>
    </main>

    <EncuestaForm v-if="mostrarForm" :encuesta="encuestaEditar" @cerrar="onFormCerrado" />

    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar encuesta"
      :mensaje="`¿Eliminar la encuesta “${porEliminar.titulo}”? Sus rondas y respuestas quedan fuera del listado.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>


