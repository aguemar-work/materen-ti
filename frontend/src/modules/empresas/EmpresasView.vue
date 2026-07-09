<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useEmpresasStore } from '../../stores/empresas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import Pagination from '../../components/shared/Pagination.vue';

const store = useEmpresasStore();
const { lista, cargando, error } = storeToRefs(store);

const busqueda = ref('');
const mostrarForm = ref(false);
const empresaEditar = ref(null);
const guardando = ref(false);
const errorForm = ref('');

const form = ref({ nombre: '', ruc: '' });

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return lista.value;
  return lista.value.filter((e) =>
    e.nombre.toLowerCase().includes(q) || (e.ruc || '').toLowerCase().includes(q)
  );
});

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(listaFiltrada);

const esEdicion = computed(() => !!empresaEditar.value?.id);

function abrirNueva() {
  empresaEditar.value = null;
  form.value = { nombre: '', ruc: '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function abrirEditar(empresa) {
  empresaEditar.value = empresa;
  form.value = { nombre: empresa.nombre, ruc: empresa.ruc || '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function cerrarForm() {
  mostrarForm.value = false;
  empresaEditar.value = null;
  errorForm.value = '';
}

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (esEdicion.value) {
      await store.actualizar(empresaEditar.value.id, form.value);
      showToast('Empresa actualizada');
    } else {
      await store.crear(form.value);
      showToast('Empresa creada');
    }
    cerrarForm();
  } catch (e) {
    errorForm.value = e?.message || 'Error al guardar empresa';
  } finally {
    guardando.value = false;
  }
}

async function darDeBaja(empresa) {
  if (!confirm(`¿Dar de baja a "${empresa.nombre}"? El registro se eliminará lógicamente.`)) return;
  try {
    await store.softDelete(empresa.id);
    showToast(`"${empresa.nombre}" dada de baja`);
  } catch (e) {
    showToast(e?.message || 'Error al dar de baja', 'error');
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar empresas', 'error');
  }
});
</script>

<template>
  <!-- Panel embebido en Configuración (la cabecera la pone ConfiguracionView) -->
  <div class="empresas-page vista-modulo">
    <main class="page">
      <div class="card card--fill">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Empresas registradas
            <span class="badge-count">{{ listaFiltrada.length }} empresas</span>
          </div>
          <button class="btn btn-primary" type="button" @click="abrirNueva">
            <i class="ti ti-plus" aria-hidden="true"></i> Nueva empresa
          </button>
        </div>

        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input
              v-model="busqueda"
              type="text"
              placeholder="Buscar por nombre o RUC..."
            >
          </div>
        </div>

        <div v-if="cargando" class="no-results">Cargando empresas...</div>

        <div v-else-if="error" class="no-results empresas-error">{{ error }}</div>

        <div v-else-if="listaFiltrada.length === 0" class="empty">
          <div class="empty-icon"><i class="ti ti-building"></i></div>
          <h3>Sin empresas</h3>
          <p>{{ busqueda ? 'No hay resultados con ese filtro.' : 'Agrega la primera empresa.' }}</p>
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNueva">
            <i class="ti ti-plus"></i> Agregar empresa
          </button>
        </div>

        <div v-else class="table-wrap">
          <table aria-label="Empresas registradas">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">RUC</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="emp in listaPaginada" :key="emp.id">
                <td>
                  <div class="user-name">{{ emp.nombre }}</div>
                </td>
                <td :class="{ 'text-muted': !emp.ruc }">{{ emp.ruc || '—' }}</td>
                <td>
                  <div class="actions">
                    <button
                      class="icon-btn"
                      type="button"
                      title="Editar"
                      aria-label="Editar"
                      @click="abrirEditar(emp)"
                    >
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button
                      class="icon-btn danger"
                      type="button"
                      title="Dar de baja"
                      aria-label="Dar de baja"
                      @click="darDeBaja(emp)"
                    >
                      <i class="ti ti-building-off"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <Pagination v-model="paginaActual" :total-items="totalItems" :page-size="tamPagina" />
        </div>
      </div>
    </main>

    <!-- Modal empresa -->
    <div v-if="mostrarForm" class="modal-bg" @click.self="cerrarForm">
      <div class="modal" role="dialog" aria-labelledby="empresa-form-title">
        <div class="modal-title">
          <span id="empresa-form-title">{{ esEdicion ? 'Editar empresa' : 'Nueva empresa' }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="cerrarForm">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <form class="form-grid" @submit.prevent="guardar">
          <div class="form-group full">
            <label for="emp-nombre">Nombre *</label>
            <input id="emp-nombre" v-model="form.nombre" required :disabled="guardando">
          </div>

          <div class="form-group full">
            <label for="emp-ruc">RUC</label>
            <input id="emp-ruc" v-model="form.ruc" :disabled="guardando">
          </div>

          <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>

          <div class="modal-actions full">
            <button class="btn" type="button" :disabled="guardando" @click="cerrarForm">Cancelar</button>
            <button class="btn btn-primary" type="submit" :disabled="guardando">
              {{ guardando ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empresas-error {
  color: var(--color-danger);
}


.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
