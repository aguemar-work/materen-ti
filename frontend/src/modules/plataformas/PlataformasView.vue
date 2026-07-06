<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlataformasStore } from '../../stores/plataformas.js';
import { showToast } from '../../core/toast.js';

const store = usePlataformasStore();
const { lista, cargando, error } = storeToRefs(store);

const busqueda = ref('');
const mostrarForm = ref(false);
const plataformaEditar = ref(null);
const guardando = ref(false);
const errorForm = ref('');

const form = ref({ id: '', nombre: '', icono: '' });

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return lista.value;
  return lista.value.filter((p) =>
    p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  );
});

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

async function darDeBaja(plataforma) {
  if (!confirm(`¿Dar de baja a "${plataforma.nombre}"? El registro se eliminará lógicamente.`)) return;
  try {
    await store.softDelete(plataforma.id);
    showToast(`"${plataforma.nombre}" dada de baja`);
  } catch (e) {
    showToast(e?.message || 'Error al dar de baja', 'error');
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
  <div class="plataformas-page">
    <main class="page">
      <div class="card">
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

        <div v-if="cargando" class="no-results">Cargando plataformas...</div>

        <div v-else-if="error" class="no-results plataformas-error">{{ error }}</div>

        <div v-else-if="listaFiltrada.length === 0" class="empty">
          <div class="empty-icon"><i class="ti ti-apps"></i></div>
          <h3>Sin plataformas</h3>
          <p>{{ busqueda ? 'No hay resultados con ese filtro.' : 'Agrega la primera plataforma.' }}</p>
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNueva">
            <i class="ti ti-plus"></i> Agregar plataforma
          </button>
        </div>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Slug</th>
                <th>Nombre</th>
                <th>Ícono</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plat in listaFiltrada" :key="plat.id">
                <td>
                  <code class="slug">{{ plat.id }}</code>
                </td>
                <td>
                  <div class="user-name">{{ plat.nombre }}</div>
                </td>
                <td>
                  <span v-if="plat.icono" class="icono-preview">
                    <i :class="plat.icono" aria-hidden="true"></i>
                    <span class="text-muted icono-texto">{{ plat.icono }}</span>
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <div class="actions">
                    <button
                      class="icon-btn"
                      type="button"
                      title="Editar"
                      @click="abrirEditar(plat)"
                    >
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button
                      class="icon-btn danger"
                      type="button"
                      title="Dar de baja"
                      @click="darDeBaja(plat)"
                    >
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Modal plataforma -->
    <div v-if="mostrarForm" class="modal-bg" @click.self="cerrarForm">
      <div class="modal" role="dialog" aria-labelledby="plat-form-title">
        <div class="modal-title">
          <span id="plat-form-title">{{ esEdicion ? 'Editar plataforma' : 'Nueva plataforma' }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="cerrarForm">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <form class="form-grid" @submit.prevent="guardar">
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
.plataformas-error {
  color: var(--color-danger);
}

.slug {
  font-size: 12px;
  background: var(--color-surface-2, var(--color-bg-hover));
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--color-text-muted, #666);
}

.icono-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
}

.icono-texto {
  font-size: 12px;
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
  color: var(--color-text-muted, #888);
  font-weight: 400;
  margin-left: 6px;
}


.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
