<script setup>
// Catálogo de tipos de equipo con sus plantillas: qué specs pide cada
// tipo y qué accesorios sugiere al registrar/entregar un equipo.
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useTiposEquipoStore } from '../../stores/catalogos.js';
import { useEquiposStore } from '../../stores/equipos.js';
import { showToast } from '../../core/toast.js';
import { slugDe } from '../../core/utils.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import Pagination from '../../components/shared/Pagination.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';

const store = useTiposEquipoStore();
const { lista, cargando } = storeToRefs(store);
const equiposStore = useEquiposStore();

const guardando = ref(false);

const mostrarForm = ref(false);
const editar = ref(null);
const form = ref({ nombre: '', specs: '', accesorios: '' });
const errorForm = ref('');

const esEdicion = computed(() => !!editar.value);

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(lista);

function aLista(texto) {
  return texto.split(',').map((s) => s.trim()).filter(Boolean);
}

function abrirNuevo() {
  editar.value = null;
  form.value = { nombre: '', specs: '', accesorios: '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function abrirEditar(t) {
  editar.value = t;
  form.value = {
    nombre: t.nombre,
    specs: (t.campos_spec || []).join(', '),
    accesorios: (t.accesorios_sugeridos || []).join(', '),
  };
  errorForm.value = '';
  mostrarForm.value = true;
}

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    const datos = {
      nombre: form.value.nombre,
      campos_spec: aLista(form.value.specs),
      accesorios_sugeridos: aLista(form.value.accesorios),
    };
    if (esEdicion.value) {
      await store.actualizar(editar.value.id, datos);
      showToast('Tipo de equipo actualizado');
    } else {
      await store.crear({ ...datos, id: slugDe(form.value.nombre) });
      showToast('Tipo de equipo creado');
    }
    // El formulario de equipos usa este catálogo: refrescar su copia
    equiposStore.tipos = [...lista.value];
    mostrarForm.value = false;
  } catch (e) {
    errorForm.value = e?.message?.includes('duplicate')
      ? 'Ya existe un tipo con ese nombre'
      : (e?.message || 'Error al guardar');
  } finally {
    guardando.value = false;
  }
}

async function eliminar(t) {
  if (!confirm(`¿Eliminar el tipo "${t.nombre}"?\nLos equipos existentes de este tipo no se ven afectados.`)) return;
  try {
    await store.softDelete(t.id);
    // El formulario de equipos usa este catálogo: refrescar su copia
    equiposStore.tipos = [...lista.value];
    showToast('Tipo eliminado');
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch (e) {
    showToast(e?.message || 'Error al cargar tipos de equipo', 'error');
  }
});
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Tipos de equipo
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <button class="btn btn-primary" type="button" @click="abrirNuevo">
          <i class="ti ti-plus" aria-hidden="true"></i> Nuevo tipo
        </button>
      </div>

      <div v-if="cargando" class="no-results">Cargando tipos...</div>

      <EmptyState
        v-else-if="lista.length === 0"
        icono="ti ti-devices"
        titulo="Sin tipos de equipo"
        mensaje="Crea plantillas con los campos y accesorios que pide cada tipo."
      >
        <button class="btn" type="button" @click="abrirNuevo">
          <i class="ti ti-plus"></i> Nuevo tipo
        </button>
      </EmptyState>

      <div v-else class="table-wrap">
        <table aria-label="Tipos de equipo">
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Specs que pide</th>
              <th scope="col">Accesorios sugeridos</th>
              <th scope="col"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in listaPaginada" :key="t.id">
              <td><span class="user-name">{{ t.nombre }}</span></td>
              <td>
                <div class="chips">
                  <span v-for="c in t.campos_spec" :key="c" class="chip">{{ c }}</span>
                  <TextoVacio v-if="!t.campos_spec?.length" />
                </div>
              </td>
              <td>
                <div class="chips">
                  <span v-for="a in t.accesorios_sugeridos" :key="a" class="chip chip--acc">{{ a }}</span>
                  <TextoVacio v-if="!t.accesorios_sugeridos?.length" />
                </div>
              </td>
              <td>
                <div class="actions">
                  <button class="icon-btn" type="button" title="Editar plantilla" aria-label="Editar plantilla" @click="abrirEditar(t)">
                    <i class="ti ti-pencil"></i>
                  </button>
                  <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="eliminar(t)">
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

    <!-- Modal -->
    <div v-if="mostrarForm" class="modal-bg" @click.self="mostrarForm = false">
      <div class="modal modal-sm" role="dialog">
        <div class="modal-title">
          <span>{{ esEdicion ? `Editar "${editar.nombre}"` : 'Nuevo tipo de equipo' }}</span>
          <button class="icon-btn" type="button" @click="mostrarForm = false"><i class="ti ti-x"></i></button>
        </div>
        <form class="modal-body" @submit.prevent="guardar">
          <div class="form-group">
            <label for="te-nombre">Nombre *</label>
            <input id="te-nombre" v-model="form.nombre" required placeholder="ej: Cámara de seguridad" :disabled="guardando">
          </div>
          <div class="form-group">
            <label for="te-specs">Specs que pide (separadas por coma)</label>
            <input id="te-specs" v-model="form.specs" placeholder="ej: Resolución, Alcance, Conectividad" :disabled="guardando">
            <p class="field-hint">Estos campos aparecerán al registrar un equipo de este tipo.</p>
          </div>
          <div class="form-group">
            <label for="te-acc">Accesorios sugeridos (separados por coma)</label>
            <input id="te-acc" v-model="form.accesorios" placeholder="ej: Fuente de poder, Soporte" :disabled="guardando">
          </div>
          <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>
          <div class="modal-actions">
            <button class="btn" type="button" :disabled="guardando" @click="mostrarForm = false">Cancelar</button>
            <button class="btn btn-primary" type="submit" :disabled="guardando">
              {{ guardando ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 4px; max-width: 280px; }

.chip {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--color-accent-subtle);
  color: var(--color-accent-hover);
  white-space: nowrap;
}

.chip--acc { background: var(--color-success-bg); color: var(--color-success-text); }

.modal-sm { width: 460px; max-width: 95vw; }
.modal-title { display: flex; align-items: center; justify-content: space-between; }
.modal-body { padding: 16px 24px 24px; display: flex; flex-direction: column; gap: 12px; }

.field-hint { margin: 4px 0 0; font-size: 12px; color: var(--color-text-secondary); }

</style>
