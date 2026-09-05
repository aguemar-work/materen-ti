<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useEmpresasStore } from '../../stores/empresas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import Modal from '../../components/shared/Modal.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';

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
            <CarbonTag variante="accent">{{ listaFiltrada.length }} empresas</CarbonTag>
          </div>
          <CarbonButton icono="ti-plus" @click="abrirNueva">Nueva empresa</CarbonButton>
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

        <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>

        <template v-else>
          <p v-if="cargando" class="sr-only" role="status">Cargando empresas…</p>

          <CarbonDataTable
            :columnas="columnas"
            :filas="listaPaginada"
            :cargando="cargando"
            :orden-por="columna"
            :orden-dir="direccion"
            etiqueta="Empresas registradas"
            vacio-icono="ti ti-building"
            vacio-titulo="Sin empresas"
            :vacio-mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Agrega la primera empresa.'"
            @ordenar="ordenarPor"
          >
            <template #celda-nombre="{ fila }">
              <div class="user-name">{{ fila.nombre }}</div>
            </template>
            <template #celda-ruc="{ valor }">
              <TextoVacio :valor="valor" placeholder="Sin RUC" />
            </template>
            <template #celda-acciones="{ fila }">
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
            </template>
            <template #vacio-accion>
              <CarbonButton v-if="!busqueda" variante="secondary" icono="ti-plus" @click="abrirNueva">
                Agregar empresa
              </CarbonButton>
            </template>
          </CarbonDataTable>

          <CarbonPagination
            v-if="!cargando"
            v-model="paginaActual"
            :total-items="totalItems"
            :tam-pagina="tamPagina"
            :tamanos-pagina="TAMANOS_PAGINA"
            unidad="empresas"
            @update:tam-pagina="cambiarTamPagina"
          />
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
        <CarbonCampo
          v-model="form.nombre"
          etiqueta="Nombre"
          requerido
          :deshabilitado="guardando"
        />
        <CarbonCampo
          v-model="form.ruc"
          etiqueta="RUC"
          :deshabilitado="guardando"
        />

        <CarbonNotification v-if="errorForm" tipo="error">{{ errorForm }}</CarbonNotification>
      </form>
      <template #acciones>
        <CarbonButton variante="secondary" :deshabilitado="guardando" @click="modalForm?.cerrar()">
          Cancelar
        </CarbonButton>
        <CarbonButton tipo="submit" form="empresa-form" :cargando="guardando">
          {{ guardando ? 'Guardando...' : 'Guardar' }}
        </CarbonButton>
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

<style scoped>
/* Esta ficha solo tiene dos campos, los dos a ancho completo: no necesita
   la grilla de 2 columnas que .form-grid ofrece por defecto (mismo
   criterio que el ajuste propio de EmpleadoDetalleView/
   ReporteSatisfaccionView sobre .datos-title — ver GUIA-UX-UI.md). */
.form-grid {
  grid-template-columns: 1fr;
}
</style>
