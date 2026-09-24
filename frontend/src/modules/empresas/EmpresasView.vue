<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useEmpresasStore } from '../../stores/empresas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import EncabezadoCatalogo from '../configuracion/EncabezadoCatalogo.vue';
import { useEsMovil } from '../../composables/useEsMovil.js';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

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

const { esMovil } = useEsMovil();

// Acciones de fila en el menú ⋮ (rediseño 2026-09-23 — antes, íconos sueltos).
function accionesDe(fila) {
  return [
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(fila) },
    { icono: 'ti-building-off', label: 'Dar de baja', danger: true, onClick: () => { porDarDeBaja.value = fila; } },
  ];
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
  <!-- Panel embebido en Configuración (la cabecera de página la pone ConfiguracionView) -->
  <div class="space-y-4">
    <EncabezadoCatalogo
      titulo="Empresas"
      :conteo="listaFiltrada.length"
      descripcion="Razones sociales a las que pertenecen los empleados, las licencias y los correos."
    >
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nueva empresa" @click="abrirNueva" />
      </template>
    </EncabezadoCatalogo>

    <!-- Filtro (fuera de la tabla) -->
    <div class="flex flex-wrap items-center gap-3">
      <AppBuscador v-model="busqueda" label="Buscar empresas" placeholder="Buscar por nombre o RUC" />
    </div>

    <div v-if="error" class="notif" :class="`notif--${infoError.rol}`" :role="infoError.rolAria">
      <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
      <div class="notif__texto">
        <p class="notif__detalle">{{ error }}</p>
      </div>
    </div>

    <AppVacio
      v-else-if="!cargando && totalItems === 0"
      icono="ti ti-building"
      :titulo="busqueda ? 'Sin resultados' : 'Sin empresas todavía'"
      :mensaje="busqueda ? 'No hay empresas que coincidan con la búsqueda.' : 'Agregue la primera empresa para asociarle empleados, licencias y correos.'"
    >
      <AppButton v-if="!busqueda" variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar empresa" @click="abrirNueva" />
    </AppVacio>

    <template v-else>
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <p v-if="cargando" class="sr-only" role="status">Cargando empresas…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppTable
          v-if="!esMovil"
          :value="listaPaginada"
          :loading="cargando"
          :total-records="totalItems"
          :rows="tamPagina"
          :orden="{ columna, direccion }"
          aria-label="Empresas registradas"
          @ordenar="ordenarPor"
        >
          <AppColumn field="nombre" header="Empresa" sortable>
            <template #body="{ data: fila }">
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base text-gray-500">
                  <i class="ti ti-building" aria-hidden="true"></i>
                </span>
                <span class="truncate font-medium text-gray-900">{{ fila.nombre }}</span>
              </div>
            </template>
          </AppColumn>
          <AppColumn field="ruc" header="RUC" sortable>
            <template #body="{ data: fila }">
              <span class="tabular-nums" :class="fila.ruc ? 'text-gray-700' : 'text-gray-500'">{{ fila.ruc || 'Sin RUC' }}</span>
            </template>
          </AppColumn>
          <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
            <template #body="{ data: fila }">
              <div class="flex justify-end" @click.stop>
                <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.nombre}`" />
              </div>
            </template>
          </AppColumn>
        </AppTable>

        <!-- ── Lista (móvil) ── -->
        <template v-else>
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando empresas...</p>
          <ul v-else class="divide-y divide-gray-100" aria-label="Empresas registradas">
            <li v-for="fila in listaPaginada" :key="fila.id" class="flex items-start gap-3 px-4 py-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                <i class="ti ti-building" aria-hidden="true"></i>
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-gray-900">{{ fila.nombre }}</div>
                <div class="text-xs tabular-nums" :class="fila.ruc ? 'text-gray-500' : 'text-gray-500'">{{ fila.ruc ? `RUC ${fila.ruc}` : 'Sin RUC' }}</div>
              </div>
              <div class="-mr-1">
                <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.nombre}`" />
              </div>
            </li>
          </ul>
        </template>

        <AppPaginacion
          v-if="!esMovil && !cargando && totalItems > 0"
          :pagina="paginaActual"
          :tam-pagina="tamPagina"
          :total="totalItems"
          @update:pagina="paginaActual = $event"
          @update:tam-pagina="cambiarTamPagina"
        />
      </div>
      <AppPaginacion
        v-if="esMovil && !cargando"
        variante="compacta"
        :pagina="paginaActual"
        :tam-pagina="tamPagina"
        :total="totalItems"
        @update:pagina="paginaActual = $event"
      />
    </template>

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
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="modalForm?.cerrar()" />
        <AppButton type="submit" form="empresa-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
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
      @cerrado="porDarDeBaja = null"
      @confirm="confirmarBaja"
    />
  </div>
</template>


