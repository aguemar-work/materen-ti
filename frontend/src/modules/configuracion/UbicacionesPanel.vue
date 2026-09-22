<script setup>
// Catálogo de ubicaciones: lugares físicos (sedes, almacenes, obras...),
// usado por Equipos para asignar equipos y por Empleados para su ubicación
// — independiente de areas_obras (función/asignación laboral, ver
// AreasObrasPanel.vue), desde la migración 059.
import { computed } from 'vue';
import { useUbicacionesStore } from '../../stores/catalogos.js';
import { badgeInfo } from '../../core/badges.js';
import { useCrudCatalogo } from '../../composables/useCrudCatalogo.js';
import { columnasVisibles, estiloColumna, agruparParaTarjeta } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
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

const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);
const enTarjeta = computed(() => agruparParaTarjeta(columnasVisiblesLista.value));

const totalPaginas = computed(() => totalPaginasDe(totalItems.value, tamPagina.value));
const paginas = computed(() => paginasDe(totalPaginas.value));
const rangoPaginacion = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value));
const desde = computed(() => rangoPaginacion.value.desde);
const hasta = computed(() => rangoPaginacion.value.hasta);

function irA(pagina) {
  paginaActual.value = clampPagina(pagina, totalPaginas.value);
}

const infoErrorForm = infoNotificacion('error');
const campoNombre = useCampoAccesible();
const campoTipo = useCampoAccesible();
const campoDescripcion = useCampoAccesible();
</script>

<template>
  <main class="page">
    <div class="card card--fill">
      <div class="card-toolbar">
        <div class="toolbar-title">
          Ubicaciones
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <button type="button" class="btn btn--primary btn--md" @click="abrirNueva">
          Nueva ubicación
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </div>

      <div class="tabla-envoltorio">
        <table class="tabla" aria-label="Ubicaciones">
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
                <EmptyState
                  icono="ti ti-map-pin"
                  titulo="Sin ubicaciones"
                  mensaje="Crea almacenes, áreas u obras para asignarles equipos."
                />
              </td>
            </tr>
            <template v-else>
              <tr v-for="fila in listaPaginada" :key="fila.id">
                <td>
                  <!-- Tipo colapsa acá (mismo criterio que Tickets): es metadato
                       de clasificación fijo (sede/almacén/obra/otro), no un
                       estado — baja de badge a texto. -->
                  <div class="celda-apilada">
                    <span class="celda-apilada__meta">{{ badgeInfo('tipo_ubicacion', fila.tipo).label }}</span>
                    <span class="celda-apilada__principal"><i class="ti ti-map-pin ub-icon"></i> {{ fila.nombre }}</span>
                  </div>
                </td>
                <td><TextoVacio :valor="fila.descripcion" /></td>
                <td>
                  <div class="actions">
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

      <ul v-if="!cargando && listaPaginada.length" class="lista-tarjetas solo-movil" aria-label="Ubicaciones">
        <li v-for="fila in listaPaginada" :key="fila.id" class="tarjeta-fila">
          <div v-if="enTarjeta.cab.length" class="tarjeta-fila__cab"></div>
          <div v-for="col in enTarjeta.principal" :key="col.clave" class="tarjeta-fila__principal">
            <div class="celda-apilada">
              <span class="celda-apilada__meta">{{ badgeInfo('tipo_ubicacion', fila.tipo).label }}</span>
              <span class="celda-apilada__principal"><i class="ti ti-map-pin ub-icon"></i> {{ fila.nombre }}</span>
            </div>
          </div>
          <div v-for="col in enTarjeta.sec" :key="col.clave" class="tarjeta-fila__sec">
            <TextoVacio :valor="fila.descripcion" />
          </div>
          <div v-if="enTarjeta.pie.length" class="tarjeta-fila__pie">
            <div class="actions">
              <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(fila)">
                <i class="ti ti-pencil"></i>
              </button>
              <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </div>
        </li>
      </ul>

      <nav v-if="!cargando && totalItems > 0" class="paginacion" aria-label="Paginación">
        <div class="paginacion__lado">
          <label class="paginacion__campo">
            <span>Filas por página:</span>
            <select
              class="paginacion__select"
              :value="tamPagina"
              @change="cambiarTamPagina($event.target.value)"
            >
              <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
          <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} ubicaciones</span>
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
      :titulo="editar ? 'Editar ubicación' : 'Nueva ubicación'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form id="ub-form" class="ub-form" @submit.prevent="guardar">
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
        <button type="button" class="btn btn--secondary btn--md" :disabled="guardando" @click="modalForm?.cerrar()">Cancelar</button>
        <button type="submit" form="ub-form" class="btn btn--primary btn--md" :disabled="guardando">
          {{ guardando ? 'Guardando...' : 'Guardar' }}
          <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
        </button>
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


