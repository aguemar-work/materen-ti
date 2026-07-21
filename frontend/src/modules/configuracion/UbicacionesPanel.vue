<script setup>
// Catálogo de ubicaciones (almacenes, áreas, sedes, obras...)
// usado por el módulo de Equipos para asignar equipos a lugares.
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useUbicacionesStore } from '../../stores/catalogos.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import Pagination from '../../components/shared/Pagination.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';

const store = useUbicacionesStore();
const { lista, cargando } = storeToRefs(store);
const guardando = ref(false);

const porEliminar = ref(null);
const eliminando = ref(false);
// Al terminar la eliminación se cierra el diálogo con su animación de
// salida (cerrar()); el @cancel que emite al final baja porEliminar.
const dialogoEliminar = ref(null);

const mostrarForm = ref(false);
const editar = ref(null);
const form = ref({ nombre: '', descripcion: '' });
const errorForm = ref('');
// Cerrar vía Modal.cerrar() reproduce la animación de salida;
// el @close del Modal es quien baja mostrarForm.
const modalForm = ref(null);

function abrirNueva() {
  editar.value = null;
  form.value = { nombre: '', descripcion: '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function abrirEditar(u) {
  editar.value = u;
  form.value = { nombre: u.nombre, descripcion: u.descripcion || '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (editar.value) {
      await store.actualizar(editar.value.id, form.value);
      showToast('Ubicación actualizada');
    } else {
      await store.crear(form.value.nombre, form.value.descripcion);
      showToast('Ubicación creada');
    }
    modalForm.value?.cerrar();
  } catch (e) {
    errorForm.value = e?.message || 'Error al guardar';
  } finally {
    guardando.value = false;
  }
}

async function confirmarEliminar() {
  const u = porEliminar.value;
  if (!u) return;
  eliminando.value = true;
  try {
    await store.softDelete(u.id);
    showToast('Ubicación eliminada');
    dialogoEliminar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch (e) {
    showToast(e?.message || 'Error al cargar ubicaciones', 'error');
  }
});

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(lista);
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Ubicaciones
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <button class="btn btn-primary" type="button" @click="abrirNueva">
          <i class="ti ti-plus" aria-hidden="true"></i> Nueva ubicación
        </button>
      </div>

      <EmptyState
        v-if="!cargando && lista.length === 0"
        icono="ti ti-map-pin"
        titulo="Sin ubicaciones"
        mensaje="Crea almacenes, áreas u obras para asignarles equipos."
      />

      <div v-else class="table-wrap">
        <p v-if="cargando" class="sr-only" role="status">Cargando ubicaciones…</p>
        <table aria-label="Ubicaciones">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Descripción</th>
              <th scope="col"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <SkeletonTabla v-if="cargando" :columnas="3" />
            <template v-else>
            <tr v-for="u in listaPaginada" :key="u.id">
              <td><span class="user-name"><i class="ti ti-map-pin ub-icon"></i> {{ u.nombre }}</span></td>
              <td><TextoVacio :valor="u.descripcion" /></td>
              <td>
                <div class="actions">
                  <button class="icon-btn" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(u)">
                    <i class="ti ti-pencil"></i>
                  </button>
                  <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = u">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
        <Pagination v-if="!cargando" v-model="paginaActual" :total-items="totalItems" :page-size="tamPagina" />
      </div>
    </div>

    <!-- Formulario (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="editar ? 'Editar ubicación' : 'Nueva ubicación'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form id="ub-form" class="ub-form" @submit.prevent="guardar">
        <div class="form-group">
          <label for="ub-nombre">Nombre *</label>
          <input id="ub-nombre" v-model="form.nombre" required placeholder="ej: Almacén de TI, Recepción, Obra Norte" :disabled="guardando">
        </div>
        <div class="form-group">
          <label for="ub-desc">Descripción</label>
          <input id="ub-desc" v-model="form.descripcion" :disabled="guardando">
        </div>
        <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>
      </form>
      <template #acciones>
        <button class="btn" type="button" :disabled="guardando" @click="modalForm?.cerrar()">Cancelar</button>
        <button class="btn btn-primary" type="submit" form="ub-form" :disabled="guardando">
          <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
          {{ guardando ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </Modal>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar ubicación"
      :mensaje="`¿Eliminar la ubicación “${porEliminar.nombre}”? Los equipos que estuvieron ahí conservan su historial.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </main>
</template>

<style scoped>
.ub-icon { color: var(--color-purple-text); margin-right: 4px; }
.ub-form { display: flex; flex-direction: column; gap: 12px; }
</style>
