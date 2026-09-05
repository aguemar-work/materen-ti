<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlataformasStore } from '../../stores/plataformas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import Modal from '../../components/shared/Modal.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = usePlataformasStore();
const { lista, cargando, error } = storeToRefs(store);

const { termino: busqueda } = useBusqueda({ debounceMs: 0, umbralMinimo: 0, sanitizar: false });
const mostrarForm = ref(false);
const plataformaEditar = ref(null);
const guardando = ref(false);
const errorForm = ref('');

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

// Definición de columnas de CarbonDataTable: "Nombre" es la elástica; "Slug"
// e "Ícono" van al renglón superior de la tarjeta móvil, igual que la
// cabecera de la tarjeta vieja.
const columnas = [
  { clave: 'id', label: 'Slug', ordenable: true, movil: 'cab' },
  { clave: 'nombre', label: 'Nombre', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'icono', label: 'Ícono', movil: 'cab' },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];

const esEdicion = computed(() => !!plataformaEditar.value?.id);

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
          <CarbonButton variante="primary" icono="ti-plus" @click="abrirNueva">Nueva plataforma</CarbonButton>
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

        <CarbonDataTable
          :columnas="columnas"
          :filas="listaPaginada"
          :cargando="cargando"
          :orden-por="columna"
          :orden-dir="direccion"
          etiqueta="Plataformas registradas"
          vacio-icono="ti ti-apps"
          vacio-titulo="Sin plataformas"
          :vacio-mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Agrega la primera plataforma.'"
          @ordenar="ordenarPor"
        >
          <template #celda-id="{ valor }">
            <code class="slug">{{ valor }}</code>
          </template>
          <template #celda-nombre="{ valor }">
            <div class="user-name">{{ valor }}</div>
          </template>
          <template #celda-icono="{ fila }">
            <span v-if="fila.icono" class="icono-preview">
              <i :class="fila.icono" aria-hidden="true"></i>
              <span>{{ fila.icono }}</span>
            </span>
            <TextoVacio v-else />
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
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </template>
          <template #vacio-accion>
            <CarbonButton v-if="!busqueda" variante="secondary" icono="ti-plus" @click="abrirNueva">Agregar plataforma</CarbonButton>
          </template>
        </CarbonDataTable>
        </template>

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="totalItems"
          :tam-pagina="tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="plataformas"
          @update:tam-pagina="cambiarTamPagina"
        />
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
        <CarbonCampo
          v-model="form.id"
          etiqueta="Slug (ID)"
          requerido
          :deshabilitado="guardando || esEdicion"
          placeholder="ej: google-workspace"
          :ayuda="esEdicion ? 'No editable después de creado' : ''"
          pattern="[a-z0-9\-]+"
          title="Minúsculas, números y guiones"
        />

        <CarbonCampo
          v-model="form.nombre"
          etiqueta="Nombre"
          requerido
          :deshabilitado="guardando"
        />

        <div class="icono-field">
          <CarbonCampo
            v-model="form.icono"
            etiqueta="Ícono"
            ayuda="Clase CSS, ej: ti ti-brand-google"
            :deshabilitado="guardando"
            placeholder="ti ti-..."
          />
          <span v-if="form.icono" class="icono-preview-sm">
            <i :class="form.icono"></i>
          </span>
        </div>

        </div>

        <CarbonNotification v-if="errorForm" tipo="error">{{ errorForm }}</CarbonNotification>
      </form>
      <template #acciones>
        <CarbonButton variante="secondary" :deshabilitado="guardando" @click="modalForm?.cerrar()">Cancelar</CarbonButton>
        <CarbonButton variante="primary" tipo="submit" form="plat-form" :cargando="guardando">
          {{ guardando ? 'Guardando...' : 'Guardar' }}
        </CarbonButton>
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

<style scoped>
.plataformas-error {
  color: var(--color-danger);
}

/* Datos uniformes: el chip conserva fondo/borde, no cambia tipografía */
.slug {
  background: var(--color-surface-2, var(--color-bg-hover));
  padding: 2px 6px;
  border-radius: var(--radius-base);
}

.icono-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--icon-sm);
}


.icono-field {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.icono-field :deep(.cds-campo) {
  flex: 1;
  min-width: 0;
}

.icono-preview-sm {
  font-size: var(--icon-md);
  line-height: 1;
  color: var(--color-text-primary);
  padding-bottom: var(--space-6);
}
</style>
