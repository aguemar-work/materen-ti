<script setup>
// Catálogo de áreas/obras (áreas administrativas, obras en campo...)
// usado por el módulo de Empleados para asignar dónde trabaja cada uno.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';
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
      const actualizada = await insforgeApi.updateAreaObra(editar.value.id, form.value);
      const idx = lista.value.findIndex((a) => a.id === editar.value.id);
      if (idx !== -1) lista.value[idx] = actualizada;
      showToast('Área/Obra actualizada');
    } else {
      const nueva = await insforgeApi.createAreaObra(form.value.nombre, form.value.descripcion);
      lista.value.push(nueva);
      lista.value.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      showToast('Área/Obra creada');
    }
    mostrarForm.value = false;
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
    await insforgeApi.softDeleteAreaObra(a.id);
    lista.value = lista.value.filter((x) => x.id !== a.id);
    showToast('Área/Obra eliminada');
    porEliminar.value = null;
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  try {
    lista.value = await insforgeApi.listAreasObras();
  } catch (e) {
    showToast(e?.message || 'Error al cargar áreas/obras', 'error');
  } finally {
    cargando.value = false;
  }
});

const TAM_PAGINA = 20;
const paginaActual = ref(1);
watch(lista, () => { paginaActual.value = 1; });
const listaPaginada = computed(() => {
  const inicio = (paginaActual.value - 1) * TAM_PAGINA;
  return lista.value.slice(inicio, inicio + TAM_PAGINA);
});
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

      <div v-else-if="lista.length === 0" class="empty">
        <div class="empty-icon"><i class="ti ti-building-community"></i></div>
        <h3>Sin áreas/obras</h3>
        <p>Crea áreas administrativas u obras para asignarlas a los empleados.</p>
      </div>

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
              <td :class="{ 'text-muted': !a.descripcion }">{{ a.descripcion || '—' }}</td>
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
        <Pagination v-model="paginaActual" :total-items="lista.length" :page-size="TAM_PAGINA" />
      </div>
    </div>

    <!-- Formulario (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      :titulo="editar ? 'Editar área/obra' : 'Nueva área/obra'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form class="ao-form" @submit.prevent="guardar">
        <div class="form-group">
          <label for="ao-nombre">Nombre *</label>
          <input id="ao-nombre" v-model="form.nombre" required placeholder="ej: Oficina Central, Obra San Isidro" :disabled="guardando">
        </div>
        <div class="form-group">
          <label for="ao-desc">Descripción</label>
          <input id="ao-desc" v-model="form.descripcion" :disabled="guardando">
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
