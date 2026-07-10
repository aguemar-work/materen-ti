<script setup>
// Catálogo de áreas/obras (áreas administrativas, obras en campo...)
// usado por el módulo de Empleados para asignar dónde trabaja cada uno.
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useAreasObrasStore } from '../../stores/catalogos.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import Pagination from '../../components/shared/Pagination.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const store = useAreasObrasStore();
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

function abrirEditar(a) {
  editar.value = a;
  form.value = { nombre: a.nombre, descripcion: a.descripcion || '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (editar.value) {
      await store.actualizar(editar.value.id, form.value);
      showToast('Área/Obra actualizada');
    } else {
      await store.crear(form.value.nombre, form.value.descripcion);
      showToast('Área/Obra creada');
    }
    modalForm.value?.cerrar();
  } catch (e) {
    errorForm.value = e?.message || 'Error al guardar';
  } finally {
    guardando.value = false;
  }
}

async function confirmarEliminar() {
  const a = porEliminar.value;
  if (!a) return;
  eliminando.value = true;
  try {
    await store.softDelete(a.id);
    showToast('Área/Obra eliminada');
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
    showToast(e?.message || 'Error al cargar áreas/obras', 'error');
  }
});

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(lista);
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Áreas/Obras
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <button class="btn btn-primary" type="button" @click="abrirNueva">
          <i class="ti ti-plus" aria-hidden="true"></i> Nueva área/obra
        </button>
      </div>

      <div v-if="cargando" class="no-results">Cargando áreas/obras...</div>

      <EmptyState
        v-else-if="lista.length === 0"
        icono="ti ti-building-community"
        titulo="Sin áreas/obras"
        mensaje="Crea áreas administrativas u obras para asignarlas a los empleados."
      />

      <div v-else class="table-wrap">
        <table aria-label="Áreas/Obras">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Descripción</th>
              <th scope="col"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in listaPaginada" :key="a.id">
              <td><span class="user-name"><i class="ti ti-building-community ao-icon"></i> {{ a.nombre }}</span></td>
              <td><TextoVacio :valor="a.descripcion" /></td>
              <td>
                <div class="actions">
                  <button class="icon-btn" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(a)">
                    <i class="ti ti-pencil"></i>
                  </button>
                  <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = a">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <Pagination v-model="paginaActual" :total-items="totalItems" :page-size="tamPagina" />
      </div>
    </div>

    <!-- Formulario (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="editar ? 'Editar área/obra' : 'Nueva área/obra'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form id="ao-form" class="ao-form" @submit.prevent="guardar">
        <div class="form-group">
          <label for="ao-nombre">Nombre *</label>
          <input id="ao-nombre" v-model="form.nombre" required placeholder="ej: Oficina Central, Obra San Isidro" :disabled="guardando">
        </div>
        <div class="form-group">
          <label for="ao-desc">Descripción</label>
          <input id="ao-desc" v-model="form.descripcion" :disabled="guardando">
        </div>
        <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>
      </form>
      <template #acciones>
        <button class="btn" type="button" :disabled="guardando" @click="modalForm?.cerrar()">Cancelar</button>
        <button class="btn btn-primary" type="submit" form="ao-form" :disabled="guardando">
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
      titulo="Eliminar área/obra"
      :mensaje="`¿Eliminar “${porEliminar.nombre}”? Los empleados asignados quedan sin área/obra.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </main>
</template>

<style scoped>
.ao-icon { color: var(--color-purple-text); margin-right: 4px; }
.ao-form { display: flex; flex-direction: column; gap: 12px; }
</style>
