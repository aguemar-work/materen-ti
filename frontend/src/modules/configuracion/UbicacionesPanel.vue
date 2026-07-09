<script setup>
// Catálogo de ubicaciones (almacenes, áreas, sedes, obras...)
// usado por el módulo de Equipos para asignar equipos a lugares.
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import Pagination from '../../components/shared/Pagination.vue';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const lista = ref([]);
const cargando = ref(true);
const guardando = ref(false);

const porEliminar = ref(null);
const eliminando = ref(false);

const mostrarForm = ref(false);
const editar = ref(null);
const form = ref({ nombre: '', descripcion: '' });
const errorForm = ref('');

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
      const actualizada = await insforgeApi.updateUbicacion(editar.value.id, form.value);
      const idx = lista.value.findIndex((u) => u.id === editar.value.id);
      if (idx !== -1) lista.value[idx] = actualizada;
      showToast('Ubicación actualizada');
    } else {
      const nueva = await insforgeApi.createUbicacion(form.value.nombre, form.value.descripcion);
      lista.value.push(nueva);
      lista.value.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      showToast('Ubicación creada');
    }
    mostrarForm.value = false;
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
    await insforgeApi.softDeleteUbicacion(u.id);
    lista.value = lista.value.filter((x) => x.id !== u.id);
    showToast('Ubicación eliminada');
    porEliminar.value = null;
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  try {
    lista.value = await insforgeApi.listUbicaciones();
  } catch (e) {
    showToast(e?.message || 'Error al cargar ubicaciones', 'error');
  } finally {
    cargando.value = false;
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

      <div v-if="cargando" class="no-results">Cargando ubicaciones...</div>

      <div v-else-if="lista.length === 0" class="empty">
        <div class="empty-icon"><i class="ti ti-map-pin"></i></div>
        <h3>Sin ubicaciones</h3>
        <p>Crea almacenes, áreas u obras para asignarles equipos.</p>
      </div>

      <div v-else class="table-wrap">
        <table aria-label="Ubicaciones">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Descripción</th>
              <th scope="col"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in listaPaginada" :key="u.id">
              <td><span class="user-name"><i class="ti ti-map-pin ub-icon"></i> {{ u.nombre }}</span></td>
              <td :class="{ 'text-muted': !u.descripcion }">{{ u.descripcion || '—' }}</td>
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
          </tbody>
        </table>
        <Pagination v-model="paginaActual" :total-items="totalItems" :page-size="tamPagina" />
      </div>
    </div>

    <!-- Formulario (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      :titulo="editar ? 'Editar ubicación' : 'Nueva ubicación'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form class="ub-form" @submit.prevent="guardar">
        <div class="form-group">
          <label for="ub-nombre">Nombre *</label>
          <input id="ub-nombre" v-model="form.nombre" required placeholder="ej: Almacén de TI, Recepción, Obra Norte" :disabled="guardando">
        </div>
        <div class="form-group">
          <label for="ub-desc">Descripción</label>
          <input id="ub-desc" v-model="form.descripcion" :disabled="guardando">
        </div>
        <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" :disabled="guardando" @click="mostrarForm = false">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            {{ guardando ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </form>
    </Modal>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porEliminar"
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
