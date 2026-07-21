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
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';

const store = useTiposEquipoStore();
const { lista, cargando } = storeToRefs(store);
const equiposStore = useEquiposStore();

const guardando = ref(false);

const mostrarForm = ref(false);
const editar = ref(null);
const form = ref({ nombre: '', specs: '', accesorios: '' });
const errorForm = ref('');

// Foco atrapado mientras el modal está abierto (Fase 4)
const panelForm = ref(null);
useFocoAtrapado(panelForm, mostrarForm);

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

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porEliminar = ref(null);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function confirmarEliminar() {
  const t = porEliminar.value;
  if (!t) return;
  eliminando.value = true;
  try {
    await store.softDelete(t.id);
    // El formulario de equipos usa este catálogo: refrescar su copia
    equiposStore.tipos = [...lista.value];
    showToast('Tipo eliminado');
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

      <EmptyState
        v-if="!cargando && lista.length === 0"
        icono="ti ti-devices"
        titulo="Sin tipos de equipo"
        mensaje="Crea plantillas con los campos y accesorios que pide cada tipo."
      >
        <button class="btn" type="button" @click="abrirNuevo">
          <i class="ti ti-plus"></i> Nuevo tipo
        </button>
      </EmptyState>

      <div v-else class="table-wrap">
        <p v-if="cargando" class="sr-only" role="status">Cargando tipos de equipo…</p>
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
            <SkeletonTabla v-if="cargando" :columnas="4" />
            <template v-else>
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
                  <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = t">
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

    <!-- Modal -->
    <Transition name="modal-anim">
    <div v-if="mostrarForm" class="modal-bg" @click.self="mostrarForm = false">
      <div ref="panelForm" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="tipo-eq-title" tabindex="-1">
        <div class="modal-title">
          <span id="tipo-eq-title">{{ esEdicion ? `Editar "${editar.nombre}"` : 'Nuevo tipo de equipo' }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarForm = false"><i class="ti ti-x"></i></button>
        </div>
        <form @submit.prevent="guardar">
          <div class="modal-body">
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
          </div>
          <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>
          <div class="modal-actions">
            <button class="btn" type="button" :disabled="guardando" @click="mostrarForm = false">Cancelar</button>
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
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar tipo de equipo"
      :mensaje="`¿Eliminar el tipo “${porEliminar.nombre}”? Los equipos existentes de este tipo no se ven afectados.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
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

/* Ancho: .modal-sm de la escala centralizada (main.css) */
.modal-title { display: flex; align-items: center; justify-content: space-between; }
.modal-body { padding: 16px 24px 24px; display: flex; flex-direction: column; gap: 12px; }

.field-hint { margin: 4px 0 0; font-size: 12px; color: var(--color-text-secondary); }

</style>
