<script setup>
// Catálogo de ubicaciones: lugares físicos (sedes, almacenes, obras...),
// usado por Equipos para asignar equipos y por Empleados para su ubicación
// — independiente de areas_obras (función/asignación laboral, ver
// AreasObrasPanel.vue), desde la migración 059.
import { useUbicacionesStore } from '../../stores/catalogos.js';
import { badgeInfo } from '../../core/badges.js';
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

const columnas = [
  { clave: 'nombre', label: 'Nombre', ordenable: true, movil: 'principal' },
  { clave: 'descripcion', label: 'Descripción', ordenable: true, elastica: true, movil: 'sec' },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Ubicaciones
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNueva">Nueva ubicación</CarbonButton>
      </div>

      <CarbonDataTable
        :columnas="columnas"
        :filas="listaPaginada"
        :cargando="cargando"
        :orden-por="columna"
        :orden-dir="direccion"
        etiqueta="Ubicaciones"
        vacio-icono="ti ti-map-pin"
        vacio-titulo="Sin ubicaciones"
        vacio-mensaje="Crea almacenes, áreas u obras para asignarles equipos."
        @ordenar="ordenarPor"
      >
        <template #celda-nombre="{ fila }">
          <!-- Tipo colapsa acá (mismo criterio que Tickets): es metadato
               de clasificación fijo (sede/almacén/obra/otro), no un
               estado — baja de badge a texto. -->
          <div class="celda-apilada">
            <span class="celda-apilada__meta">{{ badgeInfo('tipo_ubicacion', fila.tipo).label }}</span>
            <span class="celda-apilada__principal"><i class="ti ti-map-pin ub-icon"></i> {{ fila.nombre }}</span>
          </div>
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
        unidad="ubicaciones"
        @update:tam-pagina="cambiarTamPagina"
      />
    </div>

    <!-- Formulario (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="editar ? 'Editar ubicación' : 'Nueva ubicación'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form id="ub-form" class="ub-form" @submit.prevent="guardar">
        <CarbonCampo
          v-model="form.nombre"
          etiqueta="Nombre"
          requerido
          placeholder="ej: Almacén de TI, Recepción, Obra Norte"
          :deshabilitado="guardando"
        />
        <CarbonCampo
          v-model="form.tipo"
          etiqueta="Tipo"
          tipo="select"
          requerido
          :deshabilitado="guardando"
        >
          <template #opciones>
            <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
          </template>
        </CarbonCampo>
        <CarbonCampo
          v-model="form.descripcion"
          etiqueta="Descripción"
          :deshabilitado="guardando"
        />
        <CarbonNotification v-if="errorForm" tipo="error">{{ errorForm }}</CarbonNotification>
      </form>
      <template #acciones>
        <CarbonButton variante="secondary" :deshabilitado="guardando" @click="modalForm?.cerrar()">Cancelar</CarbonButton>
        <CarbonButton variante="primary" tipo="submit" form="ub-form" :deshabilitado="guardando" :cargando="guardando">
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
      titulo="Eliminar ubicación"
      :mensaje="`¿Eliminar la ubicación “${porEliminar.nombre}”? Los equipos que estuvieron ahí conservan su historial.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </main>
</template>

<style scoped>
.ub-icon { color: var(--color-purple-text); margin-right: 4px; }
.ub-form { display: flex; flex-direction: column; gap: 12px; }
</style>
