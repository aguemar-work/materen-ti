<script setup>
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterLink } from 'vue-router';
import { useEncuestasStore } from '../../stores/encuestas.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import EncuestaForm from './EncuestaForm.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

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
</script>

<template>
  <div class="encuestas-page vista-modulo">
    <PageHeader titulo="Encuestas" icono="ti ti-clipboard-list" :conteo="lista.length">
      <template v-if="auth.esJefe" #acciones>
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNueva">Nueva encuesta</CarbonButton>
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
        <CarbonDataTable
          :columnas="columnas"
          :filas="listaPaginada"
          :cargando="cargando"
          etiqueta="Encuestas"
          vacio-icono="ti ti-clipboard-list"
          vacio-titulo="Sin encuestas"
          :vacio-mensaje="auth.esJefe ? 'Cree una plantilla de encuesta para lanzar la primera ronda.' : 'Todavía no hay ninguna encuesta creada.'"
        >
          <template #celda-titulo="{ fila }">
            <RouterLink class="user-name empleado-link" :to="`/encuestas/${fila.id}`">{{ fila.titulo }}</RouterLink>
          </template>
          <template #celda-preguntas="{ fila }">
            {{ fila.preguntas?.length || 0 }}
          </template>
          <template #celda-created_at="{ fila }">
            <span :title="formatFechaHora(fila.created_at)">{{ formatAntiguedad(fila.created_at) }}</span>
          </template>
          <template #celda-acciones="{ fila }">
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
          </template>
          <template #vacio-accion>
            <CarbonButton v-if="auth.esJefe" variante="secondary" icono="ti-plus" @click="abrirNueva">Nueva encuesta</CarbonButton>
          </template>
        </CarbonDataTable>

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="totalItems"
          :tam-pagina="tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="encuestas"
          @update:tam-pagina="cambiarTamPagina"
        />
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

<style scoped>
/* Puente de descubrimiento entre "Encuestas" (propio módulo) y la encuesta
   de satisfacción de tickets (ticket_satisfaccion) — dos sistemas separados
   a propósito (modelos de datos incompatibles, ver docs/PANORAMA-SISTEMA.md
   §6), pero sin ningún enlace entre ambos antes de esto. */
.encuestas-nota-satisfaccion {
  margin: 0 var(--space-9, 24px) var(--space-7, 16px);
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}
</style>
