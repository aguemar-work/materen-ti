<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlataformasStore } from '../../stores/plataformas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import { columnasVisibles, estiloColumna, agruparParaTarjeta } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import Modal from '../../components/shared/Modal.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = usePlataformasStore();
const { lista, cargando, error } = storeToRefs(store);

const { termino: busqueda } = useBusqueda({ debounceMs: 0, umbralMinimo: 0, sanitizar: false });
const mostrarForm = ref(false);
const plataformaEditar = ref(null);
const guardando = ref(false);
const errorForm = ref('');
const infoErrorForm = infoNotificacion('error');

// Cerrar vía Modal.cerrar() reproduce la animación de salida;
// el @close del Modal es quien baja mostrarForm.
const modalForm = ref(null);

const form = ref({ id: '', nombre: '', icono: '' });

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return lista.value;
  return lista.value.filter((p) =>
    p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  );
});

const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(listaFiltrada);
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaOrdenada);

// Definición de columnas de la tabla: "Nombre" es la elástica; "Slug" e
// "Ícono" van al renglón superior de la tarjeta móvil, igual que la
// cabecera de la tarjeta vieja.
const columnas = [
  { clave: 'id', label: 'Slug', ordenable: true, movil: 'cab' },
  { clave: 'nombre', label: 'Nombre', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'icono', label: 'Ícono', movil: 'cab' },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];

const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);
const enTarjeta = computed(() => agruparParaTarjeta(columnasVisiblesLista.value));

const totalPaginas = computed(() => totalPaginasDe(totalItems.value, tamPagina.value));
const paginas = computed(() => paginasDe(totalPaginas.value));
const desde = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value).desde);
const hasta = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value).hasta);
function irA(pagina) {
  const destino = clampPagina(pagina, totalPaginas.value);
  if (destino !== paginaActual.value) paginaActual.value = destino;
}

const esEdicion = computed(() => !!plataformaEditar.value?.id);

const campoSlug = useCampoAccesible({ ayuda: () => (esEdicion.value ? 'No editable después de creado' : '') });
const campoNombre = useCampoAccesible();
const campoIcono = useCampoAccesible({ ayuda: () => 'Clase CSS, ej: ti ti-brand-google' });

function abrirNueva() {
  plataformaEditar.value = null;
  form.value = { id: '', nombre: '', icono: '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function abrirEditar(plataforma) {
  plataformaEditar.value = plataforma;
  form.value = { id: plataforma.id, nombre: plataforma.nombre, icono: plataforma.icono || '' };
  errorForm.value = '';
  mostrarForm.value = true;
}

function cerrarForm() {
  mostrarForm.value = false;
  plataformaEditar.value = null;
  errorForm.value = '';
}

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (esEdicion.value) {
      await store.actualizar(plataformaEditar.value.id, { nombre: form.value.nombre, icono: form.value.icono });
      showToast('Plataforma actualizada');
    } else {
      await store.crear(form.value);
      showToast('Plataforma creada');
    }
    cerrarForm();
  } catch (e) {
    errorForm.value = e?.message || 'Error al guardar plataforma';
  } finally {
    guardando.value = false;
  }
}

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porDarDeBaja = ref(null);
const dandoDeBaja = ref(false);
const dialogoBaja = ref(null);

async function confirmarBaja() {
  const p = porDarDeBaja.value;
  if (!p) return;
  dandoDeBaja.value = true;
  try {
    await store.softDelete(p.id);
    showToast(`"${p.nombre}" dada de baja`);
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
    showToast(error.value || 'Error al cargar plataformas', 'error');
  }
});
</script>

<template>
  <!-- Panel embebido en Configuración (la cabecera la pone ConfiguracionView) -->
  <div class="plataformas-page vista-modulo">
    <main class="page">
      <div class="card card--fill">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Plataformas registradas
            <span class="badge-count">{{ listaFiltrada.length }} plataformas</span>
          </div>
          <button type="button" class="btn btn--primary" @click="abrirNueva">
            Nueva plataforma
            <i class="ti ti-plus" aria-hidden="true"></i>
          </button>
        </div>

        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input
              v-model="busqueda"
              type="text"
              placeholder="Buscar por nombre o slug..."
            >
          </div>
        </div>

        <div v-if="error" class="no-results plataformas-error">{{ error }}</div>

        <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando plataformas…</p>

        <div class="tabla-envoltorio">
          <table class="tabla" aria-label="Plataformas registradas">
            <thead>
              <tr>
                <template v-for="col in columnasVisiblesLista" :key="col.clave">
                  <ThOrdenable
                    v-if="col.ordenable"
                    :clave="col.clave"
                    :columna="columna"
                    :direccion="direccion"
                    :style="estiloColumna(col)"
                    @ordenar="ordenarPor(col.clave)"
                  >{{ col.label }}</ThOrdenable>
                  <th v-else scope="col" :style="estiloColumna(col)">{{ col.label }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
              <tr v-else-if="!listaPaginada.length">
                <td :colspan="totalColumnas" class="tabla__vacio">
                  <EmptyState
                    icono="ti ti-apps"
                    titulo="Sin plataformas"
                    :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Agrega la primera plataforma.'"
                  >
                    <button v-if="!busqueda" type="button" class="btn btn--secondary" @click="abrirNueva">
                      Agregar plataforma
                      <i class="ti ti-plus" aria-hidden="true"></i>
                    </button>
                  </EmptyState>
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in listaPaginada" :key="fila.id">
                  <td><code class="slug">{{ fila.id }}</code></td>
                  <td><div class="user-name">{{ fila.nombre }}</div></td>
                  <td>
                    <span v-if="fila.icono" class="icono-preview">
                      <i :class="fila.icono" aria-hidden="true"></i>
                      <span>{{ fila.icono }}</span>
                    </span>
                    <TextoVacio v-else />
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
                        <i class="ti ti-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul v-if="!cargando && listaPaginada.length" class="lista-tarjetas solo-movil" aria-label="Plataformas registradas">
          <li v-for="fila in listaPaginada" :key="fila.id" class="tarjeta-fila">
            <div v-if="enTarjeta.cab.length" class="tarjeta-fila__cab">
              <code class="slug">{{ fila.id }}</code>
              <span v-if="fila.icono" class="icono-preview">
                <i :class="fila.icono" aria-hidden="true"></i>
                <span>{{ fila.icono }}</span>
              </span>
              <TextoVacio v-else />
            </div>
            <div v-for="col in enTarjeta.principal" :key="col.clave" class="tarjeta-fila__principal">
              <div class="user-name">{{ fila.nombre }}</div>
            </div>
            <div v-if="enTarjeta.pie.length" class="tarjeta-fila__pie">
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
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </div>
          </li>
        </ul>
        </template>

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
            <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} plataformas</span>
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
    </main>

    <!-- Modal plataforma (Modal accesible compartido) -->
    <Modal
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="esEdicion ? 'Editar plataforma' : 'Nueva plataforma'"
      size="sm"
      @close="cerrarForm"
    >
      <form id="plat-form" @submit.prevent="guardar">
        <div class="form-grid">
        <div class="campo" :class="{ 'campo--inerte': guardando || esEdicion }">
          <label class="campo__etiqueta" :for="campoSlug.id">
            Slug (ID)<span aria-hidden="true"> *</span>
          </label>
          <div class="campo__caja">
            <input
              :id="campoSlug.id"
              v-model="form.id"
              class="campo__control"
              type="text"
              placeholder="ej: google-workspace"
              required
              :disabled="guardando || esEdicion"
              pattern="[a-z0-9\-]+"
              title="Minúsculas, números y guiones"
              :aria-describedby="campoSlug.describedBy.value"
            >
          </div>
          <p v-if="esEdicion" :id="campoSlug.idAyuda" class="campo__pie">No editable después de creado</p>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoNombre.id">
            Nombre<span aria-hidden="true"> *</span>
          </label>
          <div class="campo__caja">
            <input
              :id="campoNombre.id"
              v-model="form.nombre"
              class="campo__control"
              type="text"
              required
              :disabled="guardando"
            >
          </div>
        </div>

        <div class="icono-field">
          <div class="campo" :class="{ 'campo--inerte': guardando }">
            <label class="campo__etiqueta" :for="campoIcono.id">Ícono</label>
            <div class="campo__caja">
              <input
                :id="campoIcono.id"
                v-model="form.icono"
                class="campo__control"
                type="text"
                placeholder="ti ti-..."
                :disabled="guardando"
                :aria-describedby="campoIcono.describedBy.value"
              >
            </div>
            <p :id="campoIcono.idAyuda" class="campo__pie">Clase CSS, ej: ti ti-brand-google</p>
          </div>
          <span v-if="form.icono" class="icono-preview-sm">
            <i :class="form.icono"></i>
          </span>
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
        <button type="submit" form="plat-form" class="btn btn--primary" :disabled="guardando">
          {{ guardando ? 'Guardando...' : 'Guardar' }}
          <i v-if="guardando" class="ti ti-loader-2" aria-hidden="true"></i>
        </button>
      </template>
    </Modal>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porDarDeBaja"
      ref="dialogoBaja"
      destructivo
      icono="ti-trash"
      titulo="Dar de baja plataforma"
      :mensaje="`¿Dar de baja a “${porDarDeBaja.nombre}”? El registro se eliminará lógicamente.`"
      confirmar-label="Dar de baja"
      :cargando="dandoDeBaja"
      @cancel="porDarDeBaja = null"
      @confirm="confirmarBaja"
    />
  </div>
</template>
