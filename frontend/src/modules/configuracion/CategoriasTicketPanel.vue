<script setup>
// Catálogo de dos niveles: categoría de ticket → subcategorías.
// Mismo patrón de catálogo editable que Tipos de equipo/Ubicaciones,
// con un nivel anidado extra.
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { insforgeApi } from '../../api/insforge.js';
import { useCategoriasTicketStore } from '../../stores/catalogos.js';
import { showToast } from '../../core/toast.js';
import { slugDe } from '../../core/utils.js';
import { OPCIONES_TIPO as TIPOS } from '../../core/dominio-tickets.js';
import EmptyState from '../../components/shared/EmptyState.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import Modal from '../../components/shared/Modal.vue';

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

// Cerrar vía Modal.cerrar() reproduce la animación de salida;
// el @close del Modal es quien baja mostrarCatForm.
const modalCatForm = ref(null);

// Alta rápida de subcategoría (inline, sin modal)
const nuevaSubPorCategoria = ref({});
// tipo_sugerido obligatorio para subcategorías nuevas (a diferencia de los
// 3 casos históricos ambiguos, que son excepción cerrada y no se repiten).
const nuevoTipoPorCategoria = ref({});

// Confirmación destructiva (ConfirmDialog compartido): una sola instancia
// para ambos niveles (categoría/subcategoría), diferenciados por `tipo`.
const pendienteEliminar = ref(null); // { tipo: 'categoria' | 'subcategoria', item }
const eliminando = ref(false);
const dialogoEliminar = ref(null);

const tituloEliminar = computed(() =>
  pendienteEliminar.value?.tipo === 'subcategoria' ? 'Eliminar subcategoría' : 'Eliminar categoría'
);

const mensajeEliminar = computed(() => {
  const p = pendienteEliminar.value;
  if (!p) return '';
  return p.tipo === 'subcategoria'
    ? `¿Eliminar la subcategoría “${p.item.nombre}”?`
    : `¿Eliminar la categoría “${p.item.nombre}”? Los tickets existentes conservan su historial.`;
});

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
    modalCatForm.value?.cerrar();
  } catch (e) {
    errorForm.value = e?.message?.includes('duplicate') ? 'Ya existe una categoría con ese nombre' : (e?.message || 'Error al guardar');
  } finally {
    guardando.value = false;
  }
}

function pedirEliminarCategoria(cat) {
  if (subsDe(cat.id).length) {
    showToast('Elimina primero sus subcategorías', 'error');
    return;
  }
  pendienteEliminar.value = { tipo: 'categoria', item: cat };
}

async function agregarSubcategoria(categoriaId) {
  const nombre = (nuevaSubPorCategoria.value[categoriaId] || '').trim();
  if (!nombre) return;
  const tipoSugerido = nuevoTipoPorCategoria.value[categoriaId] || '';
  if (!tipoSugerido) {
    showToast('Selecciona si es Incidente o Solicitud', 'error');
    return;
  }
  try {
    const nueva = await insforgeApi.createSubcategoriaTicket(categoriaId, nombre, tipoSugerido);
    subcategorias.value.push(nueva);
    nuevaSubPorCategoria.value[categoriaId] = '';
    nuevoTipoPorCategoria.value[categoriaId] = '';
  } catch (e) {
    showToast(e?.message || 'Error al agregar subcategoría', 'error');
  }
}

function pedirEliminarSubcategoria(sub) {
  pendienteEliminar.value = { tipo: 'subcategoria', item: sub };
}

async function confirmarEliminarPendiente() {
  const p = pendienteEliminar.value;
  if (!p) return;
  eliminando.value = true;
  try {
    if (p.tipo === 'subcategoria') {
      await insforgeApi.softDeleteSubcategoriaTicket(p.item.id);
      subcategorias.value = subcategorias.value.filter((s) => s.id !== p.item.id);
      showToast('Subcategoría eliminada');
    } else {
      await catStore.softDelete(p.item.id);
      showToast('Categoría eliminada');
    }
    dialogoEliminar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
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
              <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="pedirEliminarCategoria(cat)">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </div>

          <div v-if="expandidoId === cat.id" class="cat-subs">
            <div v-for="sub in subsDe(cat.id)" :key="sub.id" class="cat-sub-fila">
              <span>{{ sub.nombre }}</span>
              <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="pedirEliminarSubcategoria(sub)">
                <i class="ti ti-trash"></i>
              </button>
            </div>
            <div class="cat-sub-nueva">
              <input
                v-model="nuevaSubPorCategoria[cat.id]"
                placeholder="Nueva subcategoría..."
                @keydown.enter.prevent="agregarSubcategoria(cat.id)"
              >
              <select v-model="nuevoTipoPorCategoria[cat.id]">
                <option value="" disabled>Tipo</option>
                <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
              </select>
              <button class="btn" type="button" @click="agregarSubcategoria(cat.id)">Agregar</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Formulario de categoría (Modal accesible compartido) -->
    <Modal
      v-if="mostrarCatForm"
      ref="modalCatForm"
      :titulo="catEditar ? 'Editar categoría' : 'Nueva categoría'"
      size="sm"
      @close="mostrarCatForm = false"
    >
      <form id="cat-form" @submit.prevent="guardarCategoria">
        <div class="form-group">
          <label for="cat-nombre">Nombre *</label>
          <input id="cat-nombre" v-model="catForm.nombre" required placeholder="ej: Accesos y Cuentas" :disabled="guardando">
        </div>
        <p v-if="errorForm" class="form-error" role="alert">{{ errorForm }}</p>
      </form>
      <template #acciones>
        <button class="btn" type="button" :disabled="guardando" @click="modalCatForm?.cerrar()">Cancelar</button>
        <button class="btn btn-primary" type="submit" form="cat-form" :disabled="guardando">
          <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
          {{ guardando ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </Modal>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="pendienteEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      :titulo="tituloEliminar"
      :mensaje="mensajeEliminar"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="pendienteEliminar = null"
      @confirm="confirmarEliminarPendiente"
    />
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
</style>
