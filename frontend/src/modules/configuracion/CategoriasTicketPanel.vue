<script setup>
// Catálogo de dos niveles: categoría de ticket → subcategorías.
// Mismo patrón de catálogo editable que Tipos de equipo/Ubicaciones,
// con un nivel anidado extra. Con el catálogo v2 (migración 116) el panel se
// partió para no pasar de 400 líneas: el diálogo de categoría vive en
// CategoriaTicketForm.vue, la lista y el alta de subcategorías en
// SubcategoriasTicketLista.vue y la limpieza de tickets viejos (solo JEFE) en
// TicketsPorReclasificar.vue.
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useAuthStore } from '../../stores/auth.js';
import { useCategoriasTicketStore, useServiciosStore } from '../../stores/catalogos.js';
import { showToast } from '../../core/toast.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import EncabezadoCatalogo from './EncabezadoCatalogo.vue';
import CategoriaTicketForm from './CategoriaTicketForm.vue';
import SubcategoriaTicketForm from './SubcategoriaTicketForm.vue';
import SubcategoriasTicketLista from './SubcategoriasTicketLista.vue';
import TicketsPorReclasificar from './TicketsPorReclasificar.vue';

// Quién escribe este catálogo lo decide la RLS: INSERT/UPDATE de categorías
// (099) y subcategorías (082) exigen el módulo `tickets` (el JEFE está exento).
// El resto del staff solo lee; no se le ofrecen acciones que el servidor
// rechazaría (frontend/AGENTS.md). El aviso al solicitante (114) y la
// prioridad sugerida (116) son columnas más de esas filas: las edita quien
// edita la categoría. Reclasificar tickets es solo del JEFE (rol:jefe en la
// RPC y en la vista).
const auth = useAuthStore();
const puedeEditar = computed(() => auth.puedeVerModulo('tickets'));

// Las categorías viven en el store de catálogos; las subcategorías son
// un detalle de este panel y se quedan locales (insforgeApi directo).
const catStore = useCategoriasTicketStore();
const { lista: categorias } = storeToRefs(catStore);
// Servicio de TI de la categoría (opcional, migración 107): permite medir tickets por servicio.
const serviciosStore = useServiciosStore();
const { lista: servicios } = storeToRefs(serviciosStore);
const nombreServicio = (id) => servicios.value.find((s) => s.id === id)?.nombre || '';
const subcategorias = ref([]);
const cargando = ref(true);
const expandidoId = ref(null);

// Diálogo de categoría: false = cerrado, null = nueva, objeto = edición.
const catEditar = ref(false);
// Edición de una subcategoría (nombre, tipo, prioridad y aviso): su propio diálogo.
const subEditar = ref(null);

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

// La fila vuelve del diálogo ya guardada (o null si se canceló); el store de
// catálogos ya la dejó en la lista.
function onCategoriaCerrada(fila) {
  const eraEdicion = !!catEditar.value;
  catEditar.value = false;
  if (fila) showToast(eraEdicion ? 'Categoría actualizada' : 'Categoría creada');
}

function pedirEliminarCategoria(cat) {
  if (subsDe(cat.id).length) {
    showToast('Elimine primero sus subcategorías', 'error');
    return;
  }
  pendienteEliminar.value = { tipo: 'categoria', item: cat };
}

function onSubcategoriaCerrada(fila) {
  subEditar.value = null;
  if (!fila) return;
  subcategorias.value = subcategorias.value.map((s) => (s.id === fila.id ? fila : s));
  showToast('Subcategoría actualizada');
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
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudo eliminar' }).mensaje, 'error');
  } finally {
    eliminando.value = false;
  }
}

// Acciones de la categoría en el menú ⋮ (antes, íconos sueltos).
function accionesCategoria(cat) {
  return [
    { icono: 'ti-pencil', label: 'Editar', onClick: () => { catEditar.value = cat; } },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => pedirEliminarCategoria(cat) },
  ];
}

onMounted(async () => {
  try {
    const [, subs] = await Promise.all([
      catStore.cargar(),
      insforgeApi.listSubcategoriasTicket(),
      // El servicio es opcional: si el catálogo no carga, solo falta el selector.
      serviciosStore.cargar().catch(() => {}),
    ]);
    subcategorias.value = subs;
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudieron cargar las categorías' }).mensaje, 'error');
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
      descripcion="Clasifican cada ticket; sus subcategorías sugieren si es un incidente o una solicitud y con qué prioridad entra."
    >
      <template v-if="puedeEditar" #acciones>
        <AppButton icon="ti ti-plus" label="Nueva categoría" @click="catEditar = null" />
      </template>
    </EncabezadoCatalogo>

    <p v-if="!puedeEditar" class="text-sm text-gray-500" data-solo-modulo>Solo el staff con el módulo Tickets puede crear, editar o eliminar categorías y sus avisos.</p>

    <div v-if="cargando" class="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500" role="status">
      Cargando categorías...
    </div>

    <AppVacio
      v-else-if="categorias.length === 0"
      icono="ti ti-headset"
      titulo="Sin categorías todavía"
      :mensaje="puedeEditar ? 'Cree la primera categoría para clasificar los tickets.' : 'Todavía no hay categorías registradas.'"
    >
      <AppButton v-if="puedeEditar" variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar categoría" @click="catEditar = null" />
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
              <span class="block text-xs tabular-nums text-gray-500">
                {{ subsDe(cat.id).length }} {{ subsDe(cat.id).length === 1 ? 'subcategoría' : 'subcategorías' }}<template v-if="nombreServicio(cat.servicio_id)"> · Servicio: {{ nombreServicio(cat.servicio_id) }}</template><template v-if="cat.aviso"> · Con aviso</template>
              </span>
            </span>
          </button>
          <MenuAcciones v-if="puedeEditar" :acciones="accionesCategoria(cat)" :label="`Acciones de ${cat.nombre}`" />
        </div>

        <div v-if="expandidoId === cat.id" class="border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:pl-11">
          <SubcategoriasTicketLista
            :categoria="cat"
            :subcategorias="subsDe(cat.id)"
            :puede-editar="puedeEditar"
            @editar="subEditar = $event"
            @eliminar="pendienteEliminar = { tipo: 'subcategoria', item: $event }"
            @agregada="subcategorias.push($event)"
          />
        </div>
      </li>
    </ul>

    <!-- Limpieza del catálogo v2 (116): solo el JEFE (la vista y la RPC lo exigen) -->
    <TicketsPorReclasificar
      v-if="auth.esJefe && !cargando"
      class="pt-4"
      :categorias="categorias"
      :subcategorias="subcategorias"
    />

    <!-- Alta y edición de categoría: nombre, servicio y aviso al solicitante -->
    <CategoriaTicketForm v-if="catEditar !== false" :categoria="catEditar" @cerrar="onCategoriaCerrada" />

    <!-- Edición de subcategoría: nombre, tipo, prioridad sugerida y aviso al solicitante (114/116) -->
    <SubcategoriaTicketForm v-if="subEditar" :subcategoria="subEditar" @cerrar="onSubcategoriaCerrada" />

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
