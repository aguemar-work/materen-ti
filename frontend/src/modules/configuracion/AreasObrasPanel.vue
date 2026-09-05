<script setup>
// Catálogo de áreas/obras: puramente funcional (migración 059) — dónde
// trabaja cada empleado en términos de función/asignación laboral, sin
// relación con su ubicación física (ver UbicacionesPanel.vue, independiente).
import { useAreasObrasStore } from '../../stores/catalogos.js';
import { useCrudCatalogo } from '../../composables/useCrudCatalogo.js';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

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

const columnas = [
  { clave: 'nombre', label: 'Nombre', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'descripcion', label: 'Descripción', ordenable: true, movil: 'sec' },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Áreas/Obras
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNueva">Nueva área/obra</CarbonButton>
      </div>

      <CarbonDataTable
        :columnas="columnas"
        :filas="listaPaginada"
        :cargando="cargando"
        :orden-por="columna"
        :orden-dir="direccion"
        etiqueta="Áreas/Obras"
        vacio-icono="ti ti-building-community"
        vacio-titulo="Sin áreas/obras"
        vacio-mensaje="Crea áreas administrativas u obras para asignarlas a los empleados."
        @ordenar="ordenarPor"
      >
        <template #celda-nombre="{ fila }">
          <span class="user-name"><i class="ti ti-building-community ao-icon"></i> {{ fila.nombre }}</span>
        </template>
        <template #celda-descripcion="{ valor }">
          <TextoVacio :valor="valor" />
        </template>
        <template #celda-acciones="{ fila }">
          <div class="actions">
            <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(fila)">
              <i class="ti ti-pencil"></i>
            </button>
            <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </template>
      </CarbonDataTable>

      <CarbonPagination
        v-if="!cargando"
        v-model="paginaActual"
        :total-items="totalItems"
        :tam-pagina="tamPagina"
        :tamanos-pagina="TAMANOS_PAGINA"
        unidad="áreas/obras"
        @update:tam-pagina="cambiarTamPagina"
      />
    </div>

    <!-- Formulario (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="editar ? 'Editar área/obra' : 'Nueva área/obra'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form id="ao-form" class="ao-form" @submit.prevent="guardar">
        <CarbonCampo
          v-model="form.nombre"
          etiqueta="Nombre"
          requerido
          placeholder="ej: Contabilidad, Logística"
          :deshabilitado="guardando"
        />
        <CarbonCampo
          v-model="form.descripcion"
          etiqueta="Descripción"
          :deshabilitado="guardando"
        />
        <CarbonNotification v-if="errorForm" tipo="error">{{ errorForm }}</CarbonNotification>
      </form>
      <template #acciones>
        <CarbonButton variante="secondary" :deshabilitado="guardando" @click="modalForm?.cerrar()">Cancelar</CarbonButton>
        <CarbonButton variante="primary" tipo="submit" form="ao-form" :deshabilitado="guardando" :cargando="guardando">
          {{ guardando ? 'Guardando...' : 'Guardar' }}
        </CarbonButton>
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
  </main>
</template>

<style scoped>
.ao-icon { color: var(--color-purple-text); margin-right: 4px; }
.ao-form { display: flex; flex-direction: column; gap: 12px; }
</style>
