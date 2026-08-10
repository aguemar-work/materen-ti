<script setup>
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterLink } from 'vue-router';
import { useEncuestasStore } from '../../stores/encuestas.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import Pagination from '../../components/shared/Pagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import EncuestaForm from './EncuestaForm.vue';

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

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(lista);
</script>

<template>
  <div class="encuestas-page vista-modulo">
    <PageHeader titulo="Encuestas" icono="ti ti-clipboard-list" :conteo="lista.length">
      <template v-if="auth.esJefe" #acciones>
        <button class="btn btn-primary" type="button" @click="abrirNueva">
          <i class="ti ti-plus" aria-hidden="true"></i> Nueva encuesta
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div v-if="error" class="no-results">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && lista.length === 0"
          icono="ti ti-clipboard-list"
          titulo="Sin encuestas"
          :mensaje="auth.esJefe ? 'Crea una plantilla de encuesta para lanzar la primera ronda.' : 'Todavía no hay ninguna encuesta creada.'"
        >
          <button v-if="auth.esJefe" class="btn" type="button" @click="abrirNueva">
            <i class="ti ti-plus"></i> Nueva encuesta
          </button>
        </EmptyState>

        <div v-else class="table-wrap">
          <p v-if="cargando" class="sr-only" role="status">Cargando encuestas…</p>
          <table aria-label="Encuestas">
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col">Preguntas</th>
                <th scope="col">Creada</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="4" />
              <template v-else>
              <tr v-for="e in listaPaginada" :key="e.id">
                <td>
                  <RouterLink class="user-name empleado-link" :to="`/encuestas/${e.id}`">{{ e.titulo }}</RouterLink>
                </td>
                <td>{{ e.preguntas?.length || 0 }}</td>
                <td>{{ formatFecha(e.created_at) }}</td>
                <td>
                  <div class="actions">
                    <RouterLink class="icon-btn" :to="`/encuestas/${e.id}`" title="Ver rondas y resultados" aria-label="Ver rondas y resultados">
                      <i class="ti ti-chart-bar"></i>
                    </RouterLink>
                    <template v-if="auth.esJefe">
                      <button class="icon-btn" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(e)">
                        <i class="ti ti-pencil"></i>
                      </button>
                      <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = e">
                        <i class="ti ti-trash"></i>
                      </button>
                    </template>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
          <Pagination v-if="!cargando" v-model="paginaActual" :total-items="totalItems" :page-size="tamPagina" />
        </div>
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
