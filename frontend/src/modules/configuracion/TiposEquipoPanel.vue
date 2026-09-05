<script setup>
// Catálogo de tipos de equipo con sus plantillas: qué specs pide cada
// tipo y qué accesorios sugiere al registrar/entregar un equipo.
import { useTiposEquipoStore } from '../../stores/catalogos.js';
import { useEquiposStore } from '../../stores/equipos.js';
import { slugDe } from '../../core/utils.js';
import { useCrudCatalogo } from '../../composables/useCrudCatalogo.js';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import Modal from '../../components/shared/Modal.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = useTiposEquipoStore();
const equiposStore = useEquiposStore();

function aLista(texto) {
  return texto.split(',').map((s) => s.trim()).filter(Boolean);
}

// Specs y accesorios se editan como texto separado por comas, pero se
// guardan como arreglo.
function aDatos(f) {
  return {
    nombre: f.nombre,
    campos_spec: aLista(f.specs),
    accesorios_sugeridos: aLista(f.accesorios),
  };
}

const {
  lista, cargando, guardando, mostrarForm, editar, esEdicion, form, errorForm, modalForm,
  porEliminar, eliminando, dialogoEliminar,
  abrirNueva: abrirNuevo, abrirEditar, guardar, confirmarEliminar,
  columna, direccion, ordenarPor, paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina,
} = useCrudCatalogo(store, {
  formVacio: () => ({ nombre: '', specs: '', accesorios: '' }),
  aForm: (t) => ({
    nombre: t.nombre,
    specs: (t.campos_spec || []).join(', '),
    accesorios: (t.accesorios_sugeridos || []).join(', '),
  }),
  crear: (f) => store.crear({ ...aDatos(f), id: slugDe(f.nombre) }),
  actualizar: (id, f) => store.actualizar(id, aDatos(f)),
  // El formulario de equipos usa este catálogo: refrescar su copia
  despuesDeGuardar: () => { equiposStore.tipos = [...lista.value]; },
  despuesDeEliminar: () => { equiposStore.tipos = [...lista.value]; },
  mensajeErrorGuardar: (e) => (e?.message?.includes('duplicate') ? 'Ya existe un tipo con ese nombre' : undefined),
  textos: {
    creado: 'Tipo de equipo creado',
    actualizado: 'Tipo de equipo actualizado',
    eliminado: 'Tipo eliminado',
    errorCargar: 'Error al cargar tipos de equipo',
  },
});

const columnas = [
  { clave: 'nombre', label: 'Tipo', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'campos_spec', label: 'Specs que pide', movil: 'sec' },
  { clave: 'accesorios_sugeridos', label: 'Accesorios sugeridos', movil: 'sec' },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Tipos de equipo
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNuevo">Nuevo tipo</CarbonButton>
      </div>

      <CarbonDataTable
        :columnas="columnas"
        :filas="listaPaginada"
        :cargando="cargando"
        :orden-por="columna"
        :orden-dir="direccion"
        etiqueta="Tipos de equipo"
        vacio-icono="ti ti-devices"
        vacio-titulo="Sin tipos de equipo"
        vacio-mensaje="Crea plantillas con los campos y accesorios que pide cada tipo."
        @ordenar="ordenarPor"
      >
        <template #celda-nombre="{ fila }">
          <span class="user-name">{{ fila.nombre }}</span>
        </template>
        <template #celda-campos_spec="{ fila }">
          <div class="chips">
            <CarbonTag v-for="c in fila.campos_spec" :key="c" variante="info">{{ c }}</CarbonTag>
            <TextoVacio v-if="!fila.campos_spec?.length" />
          </div>
        </template>
        <template #celda-accesorios_sugeridos="{ fila }">
          <div class="chips">
            <CarbonTag v-for="a in fila.accesorios_sugeridos" :key="a" variante="success">{{ a }}</CarbonTag>
            <TextoVacio v-if="!fila.accesorios_sugeridos?.length" />
          </div>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="actions">
            <button class="icon-btn fila-accion" type="button" title="Editar plantilla" aria-label="Editar plantilla" @click="abrirEditar(fila)">
              <i class="ti ti-pencil"></i>
            </button>
            <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </template>
        <template #vacio-accion>
          <CarbonButton variante="secondary" icono="ti-plus" @click="abrirNuevo">Nuevo tipo</CarbonButton>
        </template>
      </CarbonDataTable>

      <CarbonPagination
        v-if="!cargando"
        v-model="paginaActual"
        :total-items="totalItems"
        :tam-pagina="tamPagina"
        :tamanos-pagina="TAMANOS_PAGINA"
        unidad="tipos de equipo"
        @update:tam-pagina="cambiarTamPagina"
      />
    </div>

    <!-- Formulario (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="esEdicion ? `Editar “${editar.nombre}”` : 'Nuevo tipo de equipo'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form id="te-form" class="te-form" @submit.prevent="guardar">
        <CarbonCampo
          v-model="form.nombre"
          etiqueta="Nombre"
          requerido
          placeholder="ej: Cámara de seguridad"
          :deshabilitado="guardando"
        />
        <CarbonCampo
          v-model="form.specs"
          etiqueta="Specs que pide (separadas por coma)"
          placeholder="ej: Resolución, Alcance, Conectividad"
          ayuda="Estos campos aparecerán al registrar un equipo de este tipo."
          :deshabilitado="guardando"
        />
        <CarbonCampo
          v-model="form.accesorios"
          etiqueta="Accesorios sugeridos (separados por coma)"
          placeholder="ej: Fuente de poder, Soporte"
          :deshabilitado="guardando"
        />
        <CarbonNotification v-if="errorForm" tipo="error">{{ errorForm }}</CarbonNotification>
      </form>
      <template #acciones>
        <CarbonButton variante="secondary" :deshabilitado="guardando" @click="modalForm?.cerrar()">Cancelar</CarbonButton>
        <CarbonButton variante="primary" tipo="submit" form="te-form" :deshabilitado="guardando" :cargando="guardando">
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

.te-form { display: flex; flex-direction: column; gap: 12px; }
</style>
