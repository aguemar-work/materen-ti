<script setup>
// Catálogo de ubicaciones: lugares físicos (sedes, almacenes, obras...),
// usado por Equipos para asignar equipos y por Empleados para su ubicación
// — independiente de areas_obras (función/asignación laboral, ver
// AreasObrasPanel.vue), desde la migración 059.
import { useUbicacionesStore } from '../../stores/catalogos.js';
import { badgeInfo } from '../../core/badges.js';
import { useCrudCatalogo } from '../../composables/useCrudCatalogo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import EncabezadoCatalogo from './EncabezadoCatalogo.vue';
import { useEsMovil } from '../../composables/useEsMovil.js';

const store = useUbicacionesStore();

// sede | almacen | obra | otro (migración 059) — check de BD, ver catálogo
// espejo en core/badges.js (TIPOS_UBICACION) para el label/color del badge.
const TIPOS = [
  { valor: 'sede', label: 'Sede' },
  { valor: 'almacen', label: 'Almacén' },
  { valor: 'obra', label: 'Obra' },
  { valor: 'otro', label: 'Otro' },
];

const {
  lista, cargando, guardando, mostrarForm, editar, form, errorForm, modalForm,
  porEliminar, eliminando, dialogoEliminar,
  abrirNueva, abrirEditar, guardar, confirmarEliminar,
  columna, direccion, ordenarPor, paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina,
} = useCrudCatalogo(store, {
  formVacio: () => ({ nombre: '', descripcion: '', tipo: 'sede' }),
  aForm: (u) => ({ nombre: u.nombre, descripcion: u.descripcion || '', tipo: u.tipo }),
  crear: (f) => store.crear(f.nombre, f.descripcion, f.tipo),
  textos: {
    creado: 'Ubicación creada',
    actualizado: 'Ubicación actualizada',
    eliminado: 'Ubicación eliminada',
    errorCargar: 'Error al cargar ubicaciones',
  },
});

const { esMovil } = useEsMovil();

// Acciones de fila en el menú ⋮ (rediseño 2026-09-23 — antes, íconos sueltos).
function accionesDe(fila) {
  return [
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(fila) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => { porEliminar.value = fila; } },
  ];
}

const infoErrorForm = infoNotificacion('error');
const campoNombre = useCampoAccesible();
const campoTipo = useCampoAccesible();
const campoDescripcion = useCampoAccesible();
</script>

<template>
  <div class="space-y-4">
    <EncabezadoCatalogo
      titulo="Ubicaciones"
      :conteo="lista.length"
      descripcion="Lugares físicos (sedes, almacenes, obras) donde están los equipos y trabajan los empleados."
    >
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nueva ubicación" @click="abrirNueva" />
      </template>
    </EncabezadoCatalogo>

    <AppVacio
      v-if="!cargando && totalItems === 0"
      icono="ti ti-map-pin"
      titulo="Sin ubicaciones todavía"
      mensaje="Cree sedes, almacenes u obras para asignarles equipos y empleados."
    >
      <AppButton variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar ubicación" @click="abrirNueva" />
    </AppVacio>

    <template v-else>
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <p v-if="cargando" class="sr-only" role="status">Cargando ubicaciones…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppTable
          v-if="!esMovil"
          :value="listaPaginada"
          :loading="cargando"
          :total-records="totalItems"
          :rows="tamPagina"
          :orden="{ columna, direccion }"
          aria-label="Ubicaciones"
          @ordenar="ordenarPor"
        >
          <AppColumn field="nombre" header="Ubicación" sortable>
            <template #body="{ data: fila }">
              <!-- El tipo (sede/almacén/obra/otro) es clasificación fija, no
                   un estado: va como texto secundario, sin tag. -->
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base text-gray-500">
                  <i class="ti ti-map-pin" aria-hidden="true"></i>
                </span>
                <div class="min-w-0">
                  <div class="truncate font-medium text-gray-900">{{ fila.nombre }}</div>
                  <div class="text-xs text-gray-500">{{ badgeInfo('tipo_ubicacion', fila.tipo).label }}</div>
                </div>
              </div>
            </template>
          </AppColumn>
          <AppColumn field="descripcion" header="Descripción" sortable>
            <template #body="{ data: fila }">
              <span :class="fila.descripcion ? 'text-gray-700' : 'text-gray-500'">{{ fila.descripcion || 'Sin descripción' }}</span>
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
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando ubicaciones...</p>
          <ul v-else class="divide-y divide-gray-100" aria-label="Ubicaciones">
            <li v-for="fila in listaPaginada" :key="fila.id" class="flex items-start gap-3 px-4 py-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                <i class="ti ti-map-pin" aria-hidden="true"></i>
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-gray-900">{{ fila.nombre }}</div>
                <div class="text-xs text-gray-500">
                  {{ badgeInfo('tipo_ubicacion', fila.tipo).label }}<template v-if="fila.descripcion"> · {{ fila.descripcion }}</template>
                </div>
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

    <!-- Formulario (AppDialog compartido) -->
    <AppDialog
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="editar ? 'Editar ubicación' : 'Nueva ubicación'"
      size="sm"
      @cerrado="mostrarForm = false"
    >
      <form id="ub-form" class="space-y-4" @submit.prevent="guardar">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoNombre.id">
            Nombre<span aria-hidden="true"> *</span>
          </label>
          <div class="campo__caja">
            <input
              :id="campoNombre.id"
              v-model="form.nombre"
              type="text"
              class="campo__control"
              required
              placeholder="ej: Almacén de TI, Recepción, Obra Norte"
              :disabled="guardando"
              :aria-invalid="campoNombre.invalido.value"
              :aria-describedby="campoNombre.describedBy.value"
            >
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoTipo.id">
            Tipo<span aria-hidden="true"> *</span>
          </label>
          <div class="campo__caja">
            <select
              :id="campoTipo.id"
              v-model="form.tipo"
              class="campo__control campo__control--select"
              required
              :disabled="guardando"
              :aria-invalid="campoTipo.invalido.value"
              :aria-describedby="campoTipo.describedBy.value"
            >
              <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoDescripcion.id">Descripción</label>
          <div class="campo__caja">
            <input
              :id="campoDescripcion.id"
              v-model="form.descripcion"
              type="text"
              class="campo__control"
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
        <AppButton type="submit" form="ub-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
      </template>
    </AppDialog>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar ubicación"
      :mensaje="`¿Eliminar la ubicación “${porEliminar.nombre}”? Los equipos que estuvieron ahí conservan su historial.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cerrado="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>


