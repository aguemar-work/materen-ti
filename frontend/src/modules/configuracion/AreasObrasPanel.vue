<script setup>
// Catálogo de áreas/obras: puramente funcional (migración 059) — dónde
// trabaja cada empleado en términos de función/asignación laboral, sin
// relación con su ubicación física (ver UbicacionesPanel.vue, independiente).
import { computed } from 'vue';
import { useAreasObrasStore } from '../../stores/catalogos.js';
import { useCrudCatalogo } from '../../composables/useCrudCatalogo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import { columnasVisibles, estiloColumna, agruparParaTarjeta } from '../../core/tablaColumnas.js';
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

const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);
const enTarjeta = computed(() => agruparParaTarjeta(columnasVisiblesLista.value));

const campoNombre = useCampoAccesible();
const campoDescripcion = useCampoAccesible();
const infoErrorForm = infoNotificacion('error');

const totalPaginas = computed(() => totalPaginasDe(totalItems.value, tamPagina.value));
const paginas = computed(() => paginasDe(totalPaginas.value));
const rangoPagina = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value));
const desde = computed(() => rangoPagina.value.desde);
const hasta = computed(() => rangoPagina.value.hasta);
function irA(pagina) {
  paginaActual.value = clampPagina(pagina, totalPaginas.value);
}
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Áreas/Obras
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <button type="button" class="btn btn--primary" @click="abrirNueva">
          Nueva área/obra
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </div>

      <div class="tabla-envoltorio">
        <table class="tabla" aria-label="Áreas/Obras">
          <thead>
            <tr>
              <template v-for="col in columnasVisiblesLista" :key="col.clave">
                <ThOrdenable
                  v-if="col.ordenable"
                  :clave="col.clave"
                  :columna="columna"
                  :direccion="direccion"
                  :class="{ 'col-num': col.num }"
                  :style="estiloColumna(col)"
                  @ordenar="ordenarPor(col.clave)"
                >{{ col.label }}</ThOrdenable>
                <th v-else scope="col" :class="{ 'col-num': col.num }" :style="estiloColumna(col)">{{ col.label }}</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
            <tr v-else-if="!listaPaginada.length">
              <td :colspan="totalColumnas" class="tabla__vacio">
                <EmptyState icono="ti ti-building-community" titulo="Sin áreas/obras" mensaje="Crea áreas administrativas u obras para asignarlas a los empleados." />
              </td>
            </tr>
            <template v-else>
              <tr v-for="fila in listaPaginada" :key="fila.id">
                <td v-for="col in columnasVisiblesLista" :key="col.clave" :class="{ 'col-num': col.num }">
                  <span v-if="col.clave === 'nombre'" class="user-name"><i class="ti ti-building-community ao-icon"></i> {{ fila.nombre }}</span>
                  <TextoVacio v-else-if="col.clave === 'descripcion'" :valor="fila.descripcion" />
                  <div v-else-if="col.clave === 'acciones'" class="actions">
                    <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(fila)">
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <ul v-if="!cargando && listaPaginada.length" class="lista-tarjetas solo-movil" aria-label="Áreas/Obras">
        <li v-for="fila in listaPaginada" :key="fila.id" class="tarjeta-fila">
          <div v-if="enTarjeta.cab.length" class="tarjeta-fila__cab">
            <template v-for="col in enTarjeta.cab" :key="col.clave">{{ fila[col.clave] }}</template>
          </div>
          <div v-for="col in enTarjeta.principal" :key="col.clave" class="tarjeta-fila__principal">
            <span v-if="col.clave === 'nombre'" class="user-name"><i class="ti ti-building-community ao-icon"></i> {{ fila.nombre }}</span>
          </div>
          <div v-for="col in enTarjeta.sec" :key="col.clave" class="tarjeta-fila__sec">
            <TextoVacio v-if="col.clave === 'descripcion'" :valor="fila.descripcion" />
          </div>
          <div v-if="enTarjeta.pie.length" class="tarjeta-fila__pie">
            <template v-for="col in enTarjeta.pie" :key="col.clave">
              <div v-if="col.clave === 'acciones'" class="actions">
                <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(fila)">
                  <i class="ti ti-pencil"></i>
                </button>
                <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </template>
          </div>
        </li>
      </ul>

      <nav v-if="!cargando && totalItems > 0" class="paginacion" aria-label="Paginación">
        <div class="paginacion__lado">
          <label v-if="TAMANOS_PAGINA?.length" class="paginacion__campo">
            <span>Filas por página:</span>
            <select class="paginacion__select" :value="tamPagina" @change="cambiarTamPagina($event.target.value)">
              <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
          <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} áreas/obras</span>
        </div>

        <div v-if="totalPaginas > 1" class="paginacion__lado">
          <label class="paginacion__campo">
            <span class="sr-only">Ir a la página</span>
            <select class="paginacion__select" :value="paginaActual" @change="irA(Number($event.target.value))">
              <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
            </select>
            <span>de {{ totalPaginas }}</span>
          </label>
          <button class="paginacion__flecha" type="button" :disabled="paginaActual <= 1" aria-label="Página anterior" @click="irA(paginaActual - 1)">
            <i class="ti ti-chevron-left" aria-hidden="true"></i>
          </button>
          <button class="paginacion__flecha" type="button" :disabled="paginaActual >= totalPaginas" aria-label="Página siguiente" @click="irA(paginaActual + 1)">
            <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </nav>
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
        <button type="button" class="btn btn--secondary" :disabled="guardando" @click="modalForm?.cerrar()">Cancelar</button>
        <button type="submit" class="btn btn--primary" form="ao-form" :disabled="guardando">
          {{ guardando ? 'Guardando...' : 'Guardar' }}
          <i v-if="guardando" class="ti ti-loader-2" aria-hidden="true"></i>
        </button>
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


