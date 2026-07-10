<script setup>
// Catálogo de dos niveles: categoría de ticket → subcategorías.
// Mismo patrón de catálogo editable que Tipos de equipo/Ubicaciones,
// con un nivel anidado extra.
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { insforgeApi } from '../../api/insforge.js';
import { useCategoriasTicketStore } from '../../stores/catalogos.js';
import { showToast } from '../../core/toast.js';
import { slugDe } from '../../core/utils.js';
import EmptyState from '../../components/shared/EmptyState.vue';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';

// Las categorías viven en el store de catálogos; las subcategorías son
// un detalle de este panel y se quedan locales (insforgeApi directo).
const catStore = useCategoriasTicketStore();
const { lista: categorias } = storeToRefs(catStore);
const subcategorias = ref([]);
const cargando = ref(true);
const guardando = ref(false);
const expandidoId = ref(null);

// Modal categoría
const mostrarCatForm = ref(false);
const catEditar = ref(null);
const catForm = ref({ id: '', nombre: '' });
const errorForm = ref('');

// Foco atrapado mientras el modal está abierto (Fase 4)
const panelCatForm = ref(null);
useFocoAtrapado(panelCatForm, mostrarCatForm);

// Alta rápida de subcategoría (inline, sin modal)
const nuevaSubPorCategoria = ref({});

function subsDe(categoriaId) {
  return subcategorias.value.filter((s) => s.categoria_id === categoriaId);
}

function toggleExpandir(id) {
  expandidoId.value = expandidoId.value === id ? null : id;
}

function abrirNuevaCategoria() {
  catEditar.value = null;
  catForm.value = { id: '', nombre: '' };
  errorForm.value = '';
  mostrarCatForm.value = true;
}

function abrirEditarCategoria(cat) {
  catEditar.value = cat;
  catForm.value = { id: cat.id, nombre: cat.nombre };
  errorForm.value = '';
  mostrarCatForm.value = true;
}

async function guardarCategoria() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (catEditar.value) {
      await catStore.actualizar(catEditar.value.id, catForm.value);
      showToast('Categoría actualizada');
    } else {
      await catStore.crear({ id: slugDe(catForm.value.nombre), nombre: catForm.value.nombre });
      showToast('Categoría creada');
    }
    mostrarCatForm.value = false;
  } catch (e) {
    errorForm.value = e?.message?.includes('duplicate') ? 'Ya existe una categoría con ese nombre' : (e?.message || 'Error al guardar');
  } finally {
    guardando.value = false;
  }
}

async function eliminarCategoria(cat) {
  if (subsDe(cat.id).length) {
    showToast('Elimina primero sus subcategorías', 'error');
    return;
  }
  if (!confirm(`¿Eliminar la categoría "${cat.nombre}"? Los tickets existentes conservan su historial.`)) return;
  try {
    await catStore.softDelete(cat.id);
    showToast('Categoría eliminada');
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  }
}

async function agregarSubcategoria(categoriaId) {
  const nombre = (nuevaSubPorCategoria.value[categoriaId] || '').trim();
  if (!nombre) return;
  try {
    const nueva = await insforgeApi.createSubcategoriaTicket(categoriaId, nombre);
    subcategorias.value.push(nueva);
    nuevaSubPorCategoria.value[categoriaId] = '';
  } catch (e) {
    showToast(e?.message || 'Error al agregar subcategoría', 'error');
  }
}

async function eliminarSubcategoria(sub) {
  if (!confirm(`¿Eliminar la subcategoría "${sub.nombre}"?`)) return;
  try {
    await insforgeApi.softDeleteSubcategoriaTicket(sub.id);
    subcategorias.value = subcategorias.value.filter((s) => s.id !== sub.id);
    showToast('Subcategoría eliminada');
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  }
}

onMounted(async () => {
  try {
    const [, subs] = await Promise.all([
      catStore.cargar(),
      insforgeApi.listSubcategoriasTicket(),
    ]);
    subcategorias.value = subs;
  } catch (e) {
    showToast(e?.message || 'Error al cargar categorías', 'error');
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Categorías de tickets
          <span class="badge-count">{{ categorias.length }}</span>
        </div>
        <button class="btn btn-primary" type="button" @click="abrirNuevaCategoria">
          <i class="ti ti-plus" aria-hidden="true"></i> Nueva categoría
        </button>
      </div>

      <div v-if="cargando" class="no-results">Cargando categorías...</div>

      <EmptyState
        v-else-if="categorias.length === 0"
        icono="ti ti-headset"
        titulo="Sin categorías"
        mensaje="Crea la primera categoría para clasificar los tickets."
      >
        <button class="btn" type="button" @click="abrirNuevaCategoria">
          <i class="ti ti-plus"></i> Nueva categoría
        </button>
      </EmptyState>

      <div v-else class="cat-lista">
        <div v-for="cat in categorias" :key="cat.id" class="cat-item">
          <div
            class="cat-fila"
            role="button"
            tabindex="0"
            :aria-expanded="expandidoId === cat.id"
            @click="toggleExpandir(cat.id)"
            @keydown.enter.prevent="toggleExpandir(cat.id)"
            @keydown.space.prevent="toggleExpandir(cat.id)"
          >
            <i class="ti cat-chevron" :class="expandidoId === cat.id ? 'ti-chevron-down' : 'ti-chevron-right'"></i>
            <span class="user-name">{{ cat.nombre }}</span>
            <span class="cat-count">{{ subsDe(cat.id).length }} subcategorías</span>
            <div class="actions" @click.stop>
              <button class="icon-btn" type="button" title="Editar" aria-label="Editar" @click="abrirEditarCategoria(cat)">
                <i class="ti ti-pencil"></i>
              </button>
              <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="eliminarCategoria(cat)">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </div>

          <div v-if="expandidoId === cat.id" class="cat-subs">
            <div v-for="sub in subsDe(cat.id)" :key="sub.id" class="cat-sub-fila">
              <span>{{ sub.nombre }}</span>
              <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="eliminarSubcategoria(sub)">
                <i class="ti ti-trash"></i>
              </button>
            </div>
            <div class="cat-sub-nueva">
              <input
                v-model="nuevaSubPorCategoria[cat.id]"
                placeholder="Nueva subcategoría..."
                @keydown.enter.prevent="agregarSubcategoria(cat.id)"
              >
              <button class="btn" type="button" @click="agregarSubcategoria(cat.id)">Agregar</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal categoría -->
    <Transition name="modal-anim">
    <div v-if="mostrarCatForm" class="modal-bg" @click.self="mostrarCatForm = false">
      <div ref="panelCatForm" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="cat-form-title" tabindex="-1">
        <div class="modal-title">
          <span id="cat-form-title">{{ catEditar ? 'Editar categoría' : 'Nueva categoría' }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarCatForm = false"><i class="ti ti-x"></i></button>
        </div>
        <form @submit.prevent="guardarCategoria">
          <div class="modal-body">
          <div class="form-group">
            <label for="cat-nombre">Nombre *</label>
            <input id="cat-nombre" v-model="catForm.nombre" required placeholder="ej: Accesos y Cuentas" :disabled="guardando">
          </div>
          </div>
          <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>
          <div class="modal-actions">
            <button class="btn" type="button" :disabled="guardando" @click="mostrarCatForm = false">Cancelar</button>
            <button class="btn btn-primary" type="submit" :disabled="guardando">
              {{ guardando ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Transition>
  </main>
</template>

<style scoped>
.cat-lista {
  display: flex;
  flex-direction: column;
}

.cat-item {
  border-bottom: 1px solid var(--color-border);
}

.cat-item:last-child { border-bottom: none; }

.cat-fila {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
}

.cat-fila:hover { background: var(--color-bg-hover); }

.cat-fila:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.cat-chevron { color: var(--color-text-secondary); font-size: 15px; }

.cat-count {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  margin-left: auto;
}

.cat-subs {
  padding: 4px 16px 14px 42px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cat-sub-fila {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--fs-base);
  padding: 4px 0;
}

.cat-sub-nueva {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.cat-sub-nueva input { flex: 1; }

/* Ancho: .modal-sm de la escala centralizada (main.css) */
.modal-title { display: flex; align-items: center; justify-content: space-between; }
.modal-body { padding: 16px 24px 24px; display: flex; flex-direction: column; gap: 12px; }
</style>
