<script setup>
// Catálogo de áreas/obras: puramente funcional (migración 059) — dónde
// trabaja cada empleado en términos de función/asignación laboral, sin
// relación con su ubicación física (ver UbicacionesPanel.vue, independiente).
import { computed } from 'vue';
import { useAreasObrasStore } from '../../stores/catalogos.js';
import { useCrudCatalogo } from '../../composables/useCrudCatalogo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import EncabezadoCatalogo from './EncabezadoCatalogo.vue';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const store = useAreasObrasStore();

const {
  lista, cargando, guardando, mostrarForm, editar, form, errorForm, modalForm,
  porEliminar, eliminando, dialogoEliminar,
  abrirNueva, abrirEditar, guardar, confirmarEliminar,
  columna, direccion, ordenarPor, paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina,
} = useCrudCatalogo(store, {
  formVacio: () => ({ nombre: '', descripcion: '' }),
  aForm: (a) => ({ nombre: a.nombre, descripcion: a.descripcion || '' }),
  crear: (f) => store.crear(f.nombre, f.descripcion),
  textos: {
    creado: 'Área/Obra creada',
    actualizado: 'Área/Obra actualizada',
    eliminado: 'Área/Obra eliminada',
    errorCargar: 'Error al cargar áreas/obras',
  },
});

const { esMovil } = useEsMovil();

// Puente de orden para AppTable (1 asc | -1 desc | null), mismo patrón que
// EmpleadosView (sortFieldTabla/sortOrderTabla).
const sortFieldTabla = computed(() => columna.value || null);
const sortOrderTabla = computed(() => (columna.value ? (direccion.value === 'desc' ? -1 : 1) : null));

// Acciones de fila en el menú ⋮ (rediseño 2026-09-23).
function accionesDe(fila) {
  return [
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(fila) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => { porEliminar.value = fila; } },
  ];
}

const campoNombre = useCampoAccesible();
const campoDescripcion = useCampoAccesible();
const infoErrorForm = infoNotificacion('error');

</script>


<template>
  <div class="space-y-4">
    <EncabezadoCatalogo
      titulo="Áreas/Obras"
      :conteo="lista.length"
      descripcion="Dónde trabaja cada empleado según su función o asignación laboral, independiente de su ubicación física."
    >
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nueva área/obra" @click="abrirNueva" />
      </template>
    </EncabezadoCatalogo>

    <AppVacio
      v-if="!cargando && totalItems === 0"
      icono="ti ti-building-community"
      titulo="Sin áreas/obras todavía"
      mensaje="Cree áreas administrativas u obras para asignarlas a los empleados."
    >
      <AppButton variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar área/obra" @click="abrirNueva" />
    </AppVacio>

    <template v-else>
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <p v-if="cargando" class="sr-only" role="status">Cargando áreas/obras…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppTable
          v-if="!esMovil"
          :value="listaPaginada"
          :loading="cargando"
          :total-records="totalItems"
          :rows="tamPagina"
          :sort-field="sortFieldTabla"
          :sort-order="sortOrderTabla"
          aria-label="Áreas/Obras"
          @ordenar="ordenarPor"
        >
          <AppColumn field="nombre" header="Nombre" sortable>
            <template #body="{ data: fila }">
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base text-gray-500">
                  <i class="ti ti-building-community" aria-hidden="true"></i>
                </span>
                <span class="truncate font-medium text-gray-900">{{ fila.nombre }}</span>
              </div>
            </template>
          </AppColumn>
          <AppColumn field="descripcion" header="Descripción" sortable>
            <template #body="{ data: fila }">
              <span :class="fila.descripcion ? 'text-gray-700' : 'text-gray-400'">{{ fila.descripcion || 'Sin descripción' }}</span>
            </template>
          </AppColumn>
          <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
            <template #body="{ data: fila }">
              <div class="flex justify-end" @click.stop>
                <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.nombre}`" />
              </div>
            </template>
          </AppColumn>
        </AppTable>

        <!-- ── Lista (móvil) ── -->
        <template v-else>
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando áreas/obras...</p>
          <ul v-else class="divide-y divide-gray-100" aria-label="Áreas/Obras">
            <li v-for="fila in listaPaginada" :key="fila.id" class="flex items-start gap-3 px-4 py-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                <i class="ti ti-building-community" aria-hidden="true"></i>
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-gray-900">{{ fila.nombre }}</div>
                <div class="text-xs" :class="fila.descripcion ? 'text-gray-500' : 'text-gray-400'">{{ fila.descripcion || 'Sin descripción' }}</div>
              </div>
              <div class="-mr-1">
                <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.nombre}`" />
              </div>
            </li>
          </ul>
        </template>

        <AppPaginacion
          v-if="!esMovil && !cargando && totalItems > 0"
          :pagina="paginaActual"
          :tam-pagina="tamPagina"
          :total="totalItems"
          @update:pagina="paginaActual = $event"
          @update:tam-pagina="cambiarTamPagina"
        />
      </div>
      <AppPaginacion
        v-if="esMovil && !cargando"
        variante="compacta"
        :pagina="paginaActual"
        :tam-pagina="tamPagina"
        :total="totalItems"
        @update:pagina="paginaActual = $event"
      />
    </template>

    <!-- Formulario (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="editar ? 'Editar área/obra' : 'Nueva área/obra'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form id="ao-form" class="space-y-4" @submit.prevent="guardar">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoNombre.id">Nombre<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoNombre.id"
              v-model="form.nombre"
              class="campo__control"
              type="text"
              placeholder="ej: Contabilidad, Logística"
              required
              :disabled="guardando"
              :aria-invalid="campoNombre.invalido.value"
              :aria-describedby="campoNombre.describedBy.value"
            >
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoDescripcion.id">Descripción</label>
          <div class="campo__caja">
            <input
              :id="campoDescripcion.id"
              v-model="form.descripcion"
              class="campo__control"
              type="text"
              :disabled="guardando"
              :aria-invalid="campoDescripcion.invalido.value"
              :aria-describedby="campoDescripcion.describedBy.value"
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
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="modalForm?.cerrar()" />
        <AppButton type="submit" form="ao-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
      </template>
    </Modal>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar área/obra"
      :mensaje="`¿Eliminar “${porEliminar.nombre}”? Los empleados asignados quedan sin área/obra.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>


