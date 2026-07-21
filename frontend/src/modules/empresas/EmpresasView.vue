<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useEmpresasStore } from '../../stores/empresas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import Pagination from '../../components/shared/Pagination.vue';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';

const store = useEmpresasStore();
const { lista, cargando, error } = storeToRefs(store);

const busqueda = ref('');
const mostrarForm = ref(false);
const empresaEditar = ref(null);
const guardando = ref(false);
const errorForm = ref('');

// Foco atrapado mientras el modal está abierto (Fase 4)
const panelForm = ref(null);
useFocoAtrapado(panelForm, mostrarForm);

const form = ref({ nombre: '', ruc: '' });

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return lista.value;
  return lista.value.filter((e) =>
    e.nombre.toLowerCase().includes(q) || (e.ruc || '').toLowerCase().includes(q)
  );
});

const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(listaFiltrada);
const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(listaOrdenada);

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

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porDarDeBaja = ref(null);
const dandoDeBaja = ref(false);
const dialogoBaja = ref(null);

async function confirmarBaja() {
  const emp = porDarDeBaja.value;
  if (!emp) return;
  dandoDeBaja.value = true;
  try {
    await store.softDelete(emp.id);
    showToast(`"${emp.nombre}" dada de baja`);
    dialogoBaja.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al dar de baja', 'error');
  } finally {
    dandoDeBaja.value = false;
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

        <div v-if="error" class="no-results empresas-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && listaFiltrada.length === 0"
          icono="ti ti-building"
          titulo="Sin empresas"
          :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Agrega la primera empresa.'"
        >
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNueva">
            <i class="ti ti-plus"></i> Agregar empresa
          </button>
        </EmptyState>

        <div v-else-if="cargando || listaFiltrada.length > 0" class="table-wrap">
          <p v-if="cargando" class="sr-only" role="status">Cargando empresas…</p>
          <table aria-label="Empresas registradas">
            <thead>
              <tr>
                <ThOrdenable clave="nombre" :columna="columna" :direccion="direccion" @ordenar="ordenarPor">Nombre</ThOrdenable>
                <ThOrdenable clave="ruc" :columna="columna" :direccion="direccion" @ordenar="ordenarPor">RUC</ThOrdenable>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="3" />
              <template v-else>
              <tr v-for="emp in listaPaginada" :key="emp.id">
                <td>
                  <div class="user-name">{{ emp.nombre }}</div>
                </td>
                <td><TextoVacio :valor="emp.ruc" /></td>
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
                      @click="porDarDeBaja = emp"
                    >
                      <i class="ti ti-building-off"></i>
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
    </main>

    <!-- Modal empresa -->
    <Transition name="modal-anim">
    <div v-if="mostrarForm" class="modal-bg" @click.self="cerrarForm">
      <div ref="panelForm" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="empresa-form-title" tabindex="-1">
        <div class="modal-title">
          <span id="empresa-form-title">{{ esEdicion ? 'Editar empresa' : 'Nueva empresa' }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="cerrarForm">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <form @submit.prevent="guardar">
          <div class="modal-body form-grid">
          <div class="form-group full">
            <label for="emp-nombre">Nombre *</label>
            <input id="emp-nombre" v-model="form.nombre" required :disabled="guardando">
          </div>

          <div class="form-group full">
            <label for="emp-ruc">RUC</label>
            <input id="emp-ruc" v-model="form.ruc" :disabled="guardando">
          </div>

          </div>

          <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>

          <div class="modal-actions full">
            <button class="btn" type="button" :disabled="guardando" @click="cerrarForm">Cancelar</button>
            <button class="btn btn-primary" type="submit" :disabled="guardando">
              <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
              {{ guardando ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Transition>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porDarDeBaja"
      ref="dialogoBaja"
      destructivo
      icono="ti-building-off"
      titulo="Dar de baja empresa"
      :mensaje="`¿Dar de baja a “${porDarDeBaja.nombre}”? El registro se eliminará lógicamente.`"
      confirmar-label="Dar de baja"
      :cargando="dandoDeBaja"
      @cancel="porDarDeBaja = null"
      @confirm="confirmarBaja"
    />
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
