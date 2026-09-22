<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useEmpresasStore } from '../../stores/empresas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import Modal from '../../components/shared/Modal.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { rolDeTag } from '../../core/tagRol.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { columnasVisibles, estiloColumna } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';

const infoError = infoNotificacion('error');

const store = useEmpresasStore();
const { lista, cargando, error } = storeToRefs(store);

const { termino: busqueda } = useBusqueda({ debounceMs: 0, umbralMinimo: 0, sanitizar: false });
const mostrarForm = ref(false);
const empresaEditar = ref(null);
const guardando = ref(false);
const errorForm = ref('');
const modalForm = ref(null);

const form = ref({ nombre: '', ruc: '' });

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return lista.value;
  return lista.value.filter((e) =>
    e.nombre.toLowerCase().includes(q) || (e.ruc || '').toLowerCase().includes(q)
  );
});

const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(listaFiltrada);
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaOrdenada);

// Definición de columnas de CarbonDataTable: una sola vez, la tabla de
// escritorio y la tarjeta móvil salen de acá (ver la cabecera del
// componente). "Nombre" es la elástica porque es la única columna de largo
// variable; "Acciones" no es ordenable ni tiene sentido de orden.
const columnas = [
  { clave: 'nombre', label: 'Nombre', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'ruc', label: 'RUC', ordenable: true, movil: 'sec' },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];
const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);

const totalPaginas = computed(() => totalPaginasDe(totalItems.value, tamPagina.value));
const paginas = computed(() => paginasDe(totalPaginas.value));
const desde = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value).desde);
const hasta = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value).hasta);
function irA(pagina) {
  paginaActual.value = clampPagina(pagina, totalPaginas.value);
}

const campoNombre = useCampoAccesible();
const campoRuc = useCampoAccesible();

const esEdicion = computed(() => !!empresaEditar.value?.id);

function abrirNueva() {
  empresaEditar.value = null;
  form.value = { nombre: '', ruc: '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function abrirEditar(empresa) {
  empresaEditar.value = empresa;
  form.value = { nombre: empresa.nombre, ruc: empresa.ruc || '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function cerrarForm() {
  mostrarForm.value = false;
  empresaEditar.value = null;
  errorForm.value = '';
}

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (esEdicion.value) {
      await store.actualizar(empresaEditar.value.id, form.value);
      showToast('Empresa actualizada');
    } else {
      await store.crear(form.value);
      showToast('Empresa creada');
    }
    modalForm.value?.cerrar();
  } catch (e) {
    errorForm.value = e?.message || 'Error al guardar empresa';
  } finally {
    guardando.value = false;
  }
}

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porDarDeBaja = ref(null);
const dandoDeBaja = ref(false);
const dialogoBaja = ref(null);

async function confirmarBaja() {
  const emp = porDarDeBaja.value;
  if (!emp) return;
  dandoDeBaja.value = true;
  try {
    await store.softDelete(emp.id);
    showToast(`"${emp.nombre}" dada de baja`);
    dialogoBaja.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al dar de baja', 'error');
  } finally {
    dandoDeBaja.value = false;
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar empresas', 'error');
  }
});
</script>

<template>
  <!-- Panel embebido en Configuración (la cabecera la pone ConfiguracionView) -->
  <div class="empresas-page vista-modulo">
    <main class="page">
      <div class="card card--fill">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Empresas registradas
            <span class="tag" :class="`tag--${rolDeTag('accent')}`">{{ listaFiltrada.length }} empresas</span>
          </div>
          <button type="button" class="btn btn--primary" @click="abrirNueva">
            Nueva empresa
            <i class="ti ti-plus" aria-hidden="true"></i>
          </button>
        </div>

        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input
              v-model="busqueda"
              type="text"
              placeholder="Buscar por nombre o RUC..."
            >
          </div>
        </div>

        <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
          <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ error }}</p>
          </div>
        </div>

        <template v-else>
          <p v-if="cargando" class="sr-only" role="status">Cargando empresas…</p>

          <div class="tabla-envoltorio">
            <table class="tabla" aria-label="Empresas registradas">
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
                      icono="ti ti-building"
                      titulo="Sin empresas"
                      :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Agrega la primera empresa.'"
                    >
                      <button v-if="!busqueda" type="button" class="btn btn--secondary" @click="abrirNueva">
                        Agregar empresa
                        <i class="ti ti-plus" aria-hidden="true"></i>
                      </button>
                    </EmptyState>
                  </td>
                </tr>
                <template v-else>
                  <tr v-for="fila in listaPaginada" :key="fila.id">
                    <td>
                      <div class="user-name">{{ fila.nombre }}</div>
                    </td>
                    <td>
                      <TextoVacio :valor="fila.ruc" placeholder="Sin RUC" />
                    </td>
                    <td>
                      <div class="actions">
                        <button
                          class="icon-btn fila-accion"
                          type="button"
                          title="Editar"
                          aria-label="Editar"
                          @click="abrirEditar(fila)"
                        >
                          <i class="ti ti-pencil"></i>
                        </button>
                        <button
                          class="icon-btn danger fila-accion"
                          type="button"
                          title="Dar de baja"
                          aria-label="Dar de baja"
                          @click="porDarDeBaja = fila"
                        >
                          <i class="ti ti-building-off"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <ul v-if="!cargando && listaPaginada.length" class="lista-tarjetas solo-movil" aria-label="Empresas registradas">
            <li v-for="fila in listaPaginada" :key="fila.id" class="tarjeta-fila">
              <div class="tarjeta-fila__principal">
                <div class="user-name">{{ fila.nombre }}</div>
              </div>
              <div class="tarjeta-fila__sec">
                <TextoVacio :valor="fila.ruc" placeholder="Sin RUC" />
              </div>
              <div class="tarjeta-fila__pie">
                <div class="actions">
                  <button
                    class="icon-btn fila-accion"
                    type="button"
                    title="Editar"
                    aria-label="Editar"
                    @click="abrirEditar(fila)"
                  >
                    <i class="ti ti-pencil"></i>
                  </button>
                  <button
                    class="icon-btn danger fila-accion"
                    type="button"
                    title="Dar de baja"
                    aria-label="Dar de baja"
                    @click="porDarDeBaja = fila"
                  >
                    <i class="ti ti-building-off"></i>
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
                  @change="cambiarTamPagina(Number($event.target.value))"
                >
                  <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
                </select>
              </label>
              <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} empresas</span>
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
        </template>
      </div>
    </main>

    <!-- Modal empresa (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="esEdicion ? 'Editar empresa' : 'Nueva empresa'"
      size="sm"
      @close="cerrarForm"
    >
      <form id="empresa-form" class="form-grid" @submit.prevent="guardar">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoNombre.id">Nombre<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoNombre.id"
              v-model="form.nombre"
              class="campo__control"
              type="text"
              required
              :disabled="guardando"
              :aria-invalid="campoNombre.invalido.value"
              :aria-describedby="campoNombre.describedBy.value"
            >
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoRuc.id">RUC</label>
          <div class="campo__caja">
            <input
              :id="campoRuc.id"
              v-model="form.ruc"
              class="campo__control"
              type="text"
              :disabled="guardando"
              :aria-invalid="campoRuc.invalido.value"
              :aria-describedby="campoRuc.describedBy.value"
            >
          </div>
        </div>

        <div v-if="errorForm" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
          <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ errorForm }}</p>
          </div>
        </div>
      </form>
      <template #acciones>
        <button type="button" class="btn btn--secondary" :disabled="guardando" @click="modalForm?.cerrar()">
          Cancelar
        </button>
        <button type="submit" form="empresa-form" class="btn btn--primary" :disabled="guardando">
          <span class="btn__label">{{ guardando ? 'Guardando...' : 'Guardar' }}</span>
          <i v-if="guardando" class="ti ti-loader-2 btn__icono--girando" aria-hidden="true"></i>
        </button>
      </template>
    </Modal>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porDarDeBaja"
      ref="dialogoBaja"
      destructivo
      icono="ti-building-off"
      titulo="Dar de baja empresa"
      :mensaje="`¿Dar de baja a “${porDarDeBaja.nombre}”? El registro se eliminará lógicamente.`"
      confirmar-label="Dar de baja"
      :cargando="dandoDeBaja"
      @cancel="porDarDeBaja = null"
      @confirm="confirmarBaja"
    />
  </div>
</template>


