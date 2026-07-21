<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlataformasStore } from '../../stores/plataformas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import Pagination from '../../components/shared/Pagination.vue';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';

const store = usePlataformasStore();
const { lista, cargando, error } = storeToRefs(store);

const busqueda = ref('');
const mostrarForm = ref(false);
const plataformaEditar = ref(null);
const guardando = ref(false);
const errorForm = ref('');

// Foco atrapado mientras el modal está abierto (Fase 4)
const panelForm = ref(null);
useFocoAtrapado(panelForm, mostrarForm);

const form = ref({ id: '', nombre: '', icono: '' });

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return lista.value;
  return lista.value.filter((p) =>
    p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  );
});

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(listaFiltrada);

const esEdicion = computed(() => !!plataformaEditar.value?.id);

function abrirNueva() {
  plataformaEditar.value = null;
  form.value = { id: '', nombre: '', icono: '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function abrirEditar(plataforma) {
  plataformaEditar.value = plataforma;
  form.value = { id: plataforma.id, nombre: plataforma.nombre, icono: plataforma.icono || '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function cerrarForm() {
  mostrarForm.value = false;
  plataformaEditar.value = null;
  errorForm.value = '';
}

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (esEdicion.value) {
      await store.actualizar(plataformaEditar.value.id, { nombre: form.value.nombre, icono: form.value.icono });
      showToast('Plataforma actualizada');
    } else {
      await store.crear(form.value);
      showToast('Plataforma creada');
    }
    cerrarForm();
  } catch (e) {
    errorForm.value = e?.message || 'Error al guardar plataforma';
  } finally {
    guardando.value = false;
  }
}

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porDarDeBaja = ref(null);
const dandoDeBaja = ref(false);
const dialogoBaja = ref(null);

async function confirmarBaja() {
  const p = porDarDeBaja.value;
  if (!p) return;
  dandoDeBaja.value = true;
  try {
    await store.softDelete(p.id);
    showToast(`"${p.nombre}" dada de baja`);
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
    showToast(error.value || 'Error al cargar plataformas', 'error');
  }
});
</script>

<template>
  <!-- Panel embebido en Configuración (la cabecera la pone ConfiguracionView) -->
  <div class="plataformas-page vista-modulo">
    <main class="page">
      <div class="card card--fill">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Plataformas registradas
            <span class="badge-count">{{ listaFiltrada.length }} plataformas</span>
          </div>
          <button class="btn btn-primary" type="button" @click="abrirNueva">
            <i class="ti ti-plus" aria-hidden="true"></i> Nueva plataforma
          </button>
        </div>

        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input
              v-model="busqueda"
              type="text"
              placeholder="Buscar por nombre o slug..."
            >
          </div>
        </div>

        <div v-if="error" class="no-results plataformas-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && listaFiltrada.length === 0"
          icono="ti ti-apps"
          titulo="Sin plataformas"
          :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Agrega la primera plataforma.'"
        >
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNueva">
            <i class="ti ti-plus"></i> Agregar plataforma
          </button>
        </EmptyState>

        <div v-else-if="cargando || listaFiltrada.length > 0" class="table-wrap">
          <p v-if="cargando" class="sr-only" role="status">Cargando plataformas…</p>
          <table aria-label="Plataformas registradas">
            <thead>
              <tr>
                <th scope="col">Slug</th>
                <th scope="col">Nombre</th>
                <th scope="col">Ícono</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="4" />
              <template v-else>
              <tr v-for="plat in listaPaginada" :key="plat.id">
                <td>
                  <code class="slug">{{ plat.id }}</code>
                </td>
                <td>
                  <div class="user-name">{{ plat.nombre }}</div>
                </td>
                <td>
                  <span v-if="plat.icono" class="icono-preview">
                    <i :class="plat.icono" aria-hidden="true"></i>
                    <span>{{ plat.icono }}</span>
                  </span>
                  <TextoVacio v-else />
                </td>
                <td>
                  <div class="actions">
                    <button
                      class="icon-btn"
                      type="button"
                      title="Editar"
                      aria-label="Editar"
                      @click="abrirEditar(plat)"
                    >
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button
                      class="icon-btn danger"
                      type="button"
                      title="Dar de baja"
                      aria-label="Dar de baja"
                      @click="porDarDeBaja = plat"
                    >
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
    </main>

    <!-- Modal plataforma -->
    <Transition name="modal-anim">
    <div v-if="mostrarForm" class="modal-bg" @click.self="cerrarForm">
      <div ref="panelForm" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="plat-form-title" tabindex="-1">
        <div class="modal-title">
          <span id="plat-form-title">{{ esEdicion ? 'Editar plataforma' : 'Nueva plataforma' }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="cerrarForm">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <form @submit.prevent="guardar">
          <div class="modal-body form-grid">
          <div class="form-group full">
            <label for="plat-id">
              Slug (ID) *
              <span v-if="esEdicion" class="label-hint">no editable</span>
            </label>
            <input
              id="plat-id"
              v-model="form.id"
              required
              :disabled="guardando || esEdicion"
              placeholder="ej: google-workspace"
              pattern="[a-z0-9\-]+"
              title="Solo minúsculas, números y guiones"
            >
          </div>

          <div class="form-group full">
            <label for="plat-nombre">Nombre *</label>
            <input id="plat-nombre" v-model="form.nombre" required :disabled="guardando">
          </div>

          <div class="form-group full">
            <label for="plat-icono">
              Ícono
              <span class="label-hint">clase CSS, ej: ti ti-brand-google</span>
            </label>
            <div class="icono-row">
              <input id="plat-icono" v-model="form.icono" :disabled="guardando" placeholder="ti ti-...">
              <span v-if="form.icono" class="icono-preview-sm">
                <i :class="form.icono"></i>
              </span>
            </div>
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
      icono="ti-trash"
      titulo="Dar de baja plataforma"
      :mensaje="`¿Dar de baja a “${porDarDeBaja.nombre}”? El registro se eliminará lógicamente.`"
      confirmar-label="Dar de baja"
      :cargando="dandoDeBaja"
      @cancel="porDarDeBaja = null"
      @confirm="confirmarBaja"
    />
  </div>
</template>

<style scoped>
.plataformas-error {
  color: var(--color-danger);
}

/* Datos uniformes: el chip conserva fondo/borde, no cambia tipografía */
.slug {
  background: var(--color-surface-2, var(--color-bg-hover));
  padding: 2px 6px;
  border-radius: 4px;
}

.icono-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
}


.icono-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icono-row input {
  flex: 1;
}

.icono-preview-sm {
  font-size: 20px;
  line-height: 1;
  color: var(--color-text);
}

.label-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: 400;
  margin-left: 6px;
}


.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
