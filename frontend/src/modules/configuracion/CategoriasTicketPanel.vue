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
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppDialog from '../../components/ui/AppDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import EncabezadoCatalogo from './EncabezadoCatalogo.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

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
const campoNombreCategoria = useCampoAccesible();
const infoErrorForm = infoNotificacion('error');

// Cerrar vía AppDialog.cerrar() reproduce la animación de salida;
// el @cerrado del AppDialog es quien baja mostrarCatForm.
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
    showToast('Seleccione si es Incidente o Solicitud', 'error');
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

// ── Presentación (rediseño 2026-09-23) ──────────────────────────────────
function tipoLabel(valor) {
  return TIPOS.find((t) => t.valor === valor)?.label || '';
}

// Acciones de la categoría en el menú ⋮ (antes, íconos sueltos).
function accionesCategoria(cat) {
  return [
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditarCategoria(cat) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => pedirEliminarCategoria(cat) },
  ];
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
  <div class="space-y-4">
    <EncabezadoCatalogo
      titulo="Categorías de tickets"
      :conteo="categorias.length"
      descripcion="Clasifican cada ticket; sus subcategorías sugieren si es un incidente o una solicitud."
    >
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nueva categoría" @click="abrirNuevaCategoria" />
      </template>
    </EncabezadoCatalogo>

    <div v-if="cargando" class="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500" role="status">
      Cargando categorías...
    </div>

    <AppVacio
      v-else-if="categorias.length === 0"
      icono="ti ti-headset"
      titulo="Sin categorías todavía"
      mensaje="Cree la primera categoría para clasificar los tickets."
    >
      <AppButton variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar categoría" @click="abrirNuevaCategoria" />
    </AppVacio>

    <ul v-else class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" aria-label="Categorías de tickets">
      <li v-for="cat in categorias" :key="cat.id">
        <div class="flex items-center gap-2 pr-3">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
            :aria-expanded="expandidoId === cat.id"
            @click="toggleExpandir(cat.id)"
          >
            <i
              class="ti text-base text-gray-500"
              :class="expandidoId === cat.id ? 'ti-chevron-down' : 'ti-chevron-right'"
              aria-hidden="true"
            ></i>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-gray-900">{{ cat.nombre }}</span>
              <span class="block text-xs tabular-nums" :class="subsDe(cat.id).length ? 'text-gray-500' : 'text-gray-500'">
                {{ subsDe(cat.id).length }} {{ subsDe(cat.id).length === 1 ? 'subcategoría' : 'subcategorías' }}
              </span>
            </span>
          </button>
          <MenuAcciones :acciones="accionesCategoria(cat)" :label="`Acciones de ${cat.nombre}`" />
        </div>

        <div v-if="expandidoId === cat.id" class="border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:pl-11">
          <ul v-if="subsDe(cat.id).length" class="mb-3 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white" :aria-label="`Subcategorías de ${cat.nombre}`">
            <li v-for="sub in subsDe(cat.id)" :key="sub.id" class="flex items-center gap-3 py-1.5 pl-3 pr-1.5">
              <span class="min-w-0 flex-1 truncate text-sm text-gray-900">{{ sub.nombre }}</span>
              <span v-if="tipoLabel(sub.tipo_sugerido)" class="shrink-0 text-xs text-gray-500">{{ tipoLabel(sub.tipo_sugerido) }}</span>
              <button
                class="icon-btn danger"
                type="button"
                title="Eliminar subcategoría"
                :aria-label="`Eliminar la subcategoría ${sub.nombre}`"
                @click="pedirEliminarSubcategoria(sub)"
              >
                <i class="ti ti-trash" aria-hidden="true"></i>
              </button>
            </li>
          </ul>
          <p v-else class="mb-3 text-sm text-gray-500">Sin subcategorías. Agregue la primera abajo.</p>

          <!-- Alta rápida de subcategoría (inline, sin modal) -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="campo min-w-0 flex-1 basis-48">
              <div class="campo__caja">
                <input
                  v-model="nuevaSubPorCategoria[cat.id]"
                  class="campo__control"
                  type="text"
                  placeholder="Nueva subcategoría..."
                  aria-label="Nombre de la subcategoría"
                  @keydown.enter.prevent="agregarSubcategoria(cat.id)"
                >
              </div>
            </div>
            <div class="campo w-40">
              <div class="campo__caja">
                <select v-model="nuevoTipoPorCategoria[cat.id]" class="campo__control campo__control--select" aria-label="Tipo sugerido">
                  <option value="" disabled>Tipo</option>
                  <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
                </select>
                <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
              </div>
            </div>
            <AppButton variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar" @click="agregarSubcategoria(cat.id)" />
          </div>
        </div>
      </li>
    </ul>

    <!-- Formulario de categoría (AppDialog compartido) -->
    <AppDialog
      v-if="mostrarCatForm"
      ref="modalCatForm"
      :titulo="catEditar ? 'Editar categoría' : 'Nueva categoría'"
      size="sm"
      @cerrado="mostrarCatForm = false"
    >
      <form id="cat-form" @submit.prevent="guardarCategoria">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoNombreCategoria.id">Nombre<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoNombreCategoria.id"
              v-model="catForm.nombre"
              class="campo__control"
              type="text"
              placeholder="ej: Accesos y Cuentas"
              required
              :disabled="guardando"
              :aria-invalid="campoNombreCategoria.invalido.value"
              :aria-describedby="campoNombreCategoria.describedBy.value"
            >
          </div>
        </div>
        <div v-if="errorForm" class="notif" :class="[`notif--${infoErrorForm.rol}`, 'notif--inline']" :role="infoErrorForm.rolAria">
          <i class="ti" :class="infoErrorForm.icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ errorForm }}</p>
          </div>
        </div>
      </form>
      <template #acciones>
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="modalCatForm?.cerrar()" />
        <AppButton type="submit" form="cat-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
      </template>
    </AppDialog>

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
      @cerrado="pendienteEliminar = null"
      @confirm="confirmarEliminarPendiente"
    />
  </div>
</template>


