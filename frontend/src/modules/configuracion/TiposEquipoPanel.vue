<script setup>
// Catálogo de tipos de equipo con sus plantillas: qué specs pide cada
// tipo y qué accesorios sugiere al registrar/entregar un equipo.
import { computed } from 'vue';
import { useTiposEquipoStore } from '../../stores/catalogos.js';
import { useEquiposStore } from '../../stores/equipos.js';
import { slugDe } from '../../core/utils.js';
import { useCrudCatalogo } from '../../composables/useCrudCatalogo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import Modal from '../../components/shared/Modal.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import { rolDeTag } from '../../core/tagRol.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import { columnasVisibles, estiloColumna, agruparParaTarjeta } from '../../core/tablaColumnas.js';
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

const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);
const enTarjeta = computed(() => agruparParaTarjeta(columnasVisiblesLista.value));

const campoNombre = useCampoAccesible();
const campoSpecs = useCampoAccesible();
const campoAccesorios = useCampoAccesible();
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
          Tipos de equipo
          <span class="badge-count">{{ lista.length }}</span>
        </div>
        <button type="button" class="btn btn--primary" @click="abrirNuevo">
          Nuevo tipo
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </div>

      <div class="tabla-envoltorio">
        <table class="tabla" aria-label="Tipos de equipo">
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
                <EmptyState icono="ti ti-devices" titulo="Sin tipos de equipo" mensaje="Crea plantillas con los campos y accesorios que pide cada tipo.">
                  <button type="button" class="btn btn--secondary" @click="abrirNuevo">
                    Nuevo tipo
                    <i class="ti ti-plus" aria-hidden="true"></i>
                  </button>
                </EmptyState>
              </td>
            </tr>
            <template v-else>
              <tr v-for="fila in listaPaginada" :key="fila.id">
                <td v-for="col in columnasVisiblesLista" :key="col.clave" :class="{ 'col-num': col.num }">
                  <span v-if="col.clave === 'nombre'" class="user-name">{{ fila.nombre }}</span>
                  <div v-else-if="col.clave === 'campos_spec'" class="chips">
                    <span v-for="c in fila.campos_spec" :key="c" class="tag" :class="`tag--${rolDeTag('info')}`">{{ c }}</span>
                    <TextoVacio v-if="!fila.campos_spec?.length" />
                  </div>
                  <div v-else-if="col.clave === 'accesorios_sugeridos'" class="chips">
                    <span v-for="a in fila.accesorios_sugeridos" :key="a" class="tag" :class="`tag--${rolDeTag('success')}`">{{ a }}</span>
                    <TextoVacio v-if="!fila.accesorios_sugeridos?.length" />
                  </div>
                  <div v-else-if="col.clave === 'acciones'" class="actions">
                    <button class="icon-btn fila-accion" type="button" title="Editar plantilla" aria-label="Editar plantilla" @click="abrirEditar(fila)">
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

      <ul v-if="!cargando && listaPaginada.length" class="lista-tarjetas solo-movil" aria-label="Tipos de equipo">
        <li v-for="fila in listaPaginada" :key="fila.id" class="tarjeta-fila">
          <div v-if="enTarjeta.cab.length" class="tarjeta-fila__cab">
            <template v-for="col in enTarjeta.cab" :key="col.clave">{{ fila[col.clave] }}</template>
          </div>
          <div v-for="col in enTarjeta.principal" :key="col.clave" class="tarjeta-fila__principal">
            <span v-if="col.clave === 'nombre'" class="user-name">{{ fila.nombre }}</span>
          </div>
          <div v-for="col in enTarjeta.sec" :key="col.clave" class="tarjeta-fila__sec">
            <div v-if="col.clave === 'campos_spec'" class="chips">
              <span v-for="c in fila.campos_spec" :key="c" class="tag" :class="`tag--${rolDeTag('info')}`">{{ c }}</span>
              <TextoVacio v-if="!fila.campos_spec?.length" />
            </div>
            <div v-else-if="col.clave === 'accesorios_sugeridos'" class="chips">
              <span v-for="a in fila.accesorios_sugeridos" :key="a" class="tag" :class="`tag--${rolDeTag('success')}`">{{ a }}</span>
              <TextoVacio v-if="!fila.accesorios_sugeridos?.length" />
            </div>
          </div>
          <div v-if="enTarjeta.pie.length" class="tarjeta-fila__pie">
            <template v-for="col in enTarjeta.pie" :key="col.clave">
              <div v-if="col.clave === 'acciones'" class="actions">
                <button class="icon-btn fila-accion" type="button" title="Editar plantilla" aria-label="Editar plantilla" @click="abrirEditar(fila)">
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
          <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} tipos de equipo</span>
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
      :titulo="esEdicion ? `Editar “${editar.nombre}”` : 'Nuevo tipo de equipo'"
      size="sm"
      @close="mostrarForm = false"
    >
      <form id="te-form" class="te-form" @submit.prevent="guardar">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoNombre.id">Nombre<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoNombre.id"
              v-model="form.nombre"
              class="campo__control"
              type="text"
              placeholder="ej: Cámara de seguridad"
              required
              :disabled="guardando"
              :aria-invalid="campoNombre.invalido.value"
              :aria-describedby="campoNombre.describedBy.value"
            >
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoSpecs.id">Specs que pide (separadas por coma)</label>
          <div class="campo__caja">
            <input
              :id="campoSpecs.id"
              v-model="form.specs"
              class="campo__control"
              type="text"
              placeholder="ej: Resolución, Alcance, Conectividad"
              :disabled="guardando"
              :aria-invalid="campoSpecs.invalido.value"
              :aria-describedby="campoSpecs.describedBy.value"
            >
          </div>
          <p :id="campoSpecs.idAyuda" class="campo__pie">Estos campos aparecerán al registrar un equipo de este tipo.</p>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoAccesorios.id">Accesorios sugeridos (separados por coma)</label>
          <div class="campo__caja">
            <input
              :id="campoAccesorios.id"
              v-model="form.accesorios"
              class="campo__control"
              type="text"
              placeholder="ej: Fuente de poder, Soporte"
              :disabled="guardando"
              :aria-invalid="campoAccesorios.invalido.value"
              :aria-describedby="campoAccesorios.describedBy.value"
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
        <button type="submit" class="btn btn--primary" form="te-form" :disabled="guardando">
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
      titulo="Eliminar tipo de equipo"
      :mensaje="`¿Eliminar el tipo “${porEliminar.nombre}”? Los equipos existentes de este tipo no se ven afectados.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </main>
</template>


