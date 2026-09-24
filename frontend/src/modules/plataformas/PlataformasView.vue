<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlataformasStore } from '../../stores/plataformas.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
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

const { esMovil } = useEsMovil();

// Puente de orden para AppTable (1 asc | -1 desc | null), mismo patrón que
// EmpleadosView (sortFieldTabla/sortOrderTabla).
const sortFieldTabla = computed(() => columna.value || null);
const sortOrderTabla = computed(() => (columna.value ? (direccion.value === 'desc' ? -1 : 1) : null));

// Acciones de fila en el menú ⋮ (rediseño 2026-09-23 — antes, íconos sueltos).
function accionesDe(fila) {
  return [
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(fila) },
    { icono: 'ti-trash', label: 'Dar de baja', danger: true, onClick: () => { porDarDeBaja.value = fila; } },
  ];
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
  <!-- Panel embebido en Configuración (la cabecera de página la pone ConfiguracionView) -->
  <div class="space-y-4">
    <EncabezadoCatalogo
      titulo="Plataformas"
      :conteo="listaFiltrada.length"
      descripcion="Servicios donde el personal tiene cuentas de acceso: Gmail, Bitrix24, VPN, ERP."
    >
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nueva plataforma" @click="abrirNueva" />
      </template>
    </EncabezadoCatalogo>

    <!-- Filtro (fuera de la tabla) -->
    <div class="flex flex-wrap items-center gap-3">
      <AppBuscador v-model="busqueda" label="Buscar plataformas" placeholder="Buscar por nombre o slug" />
    </div>

    <div v-if="error" class="notif notif--danger" role="alert">
      <i class="ti ti-alert-circle" aria-hidden="true"></i>
      <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
    </div>

    <AppVacio
      v-else-if="!cargando && totalItems === 0"
      icono="ti ti-apps"
      :titulo="busqueda ? 'Sin resultados' : 'Sin plataformas todavía'"
      :mensaje="busqueda ? 'No hay plataformas que coincidan con la búsqueda.' : 'Agregue la primera plataforma (Gmail, Bitrix24, VPN...) para registrar cuentas de acceso en ella.'"
    >
      <AppButton v-if="!busqueda" variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar plataforma" @click="abrirNueva" />
    </AppVacio>

    <template v-else>
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <p v-if="cargando" class="sr-only" role="status">Cargando plataformas…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppTable
          v-if="!esMovil"
          :value="listaPaginada"
          :loading="cargando"
          :total-records="totalItems"
          :rows="tamPagina"
          :sort-field="sortFieldTabla"
          :sort-order="sortOrderTabla"
          aria-label="Plataformas registradas"
          @ordenar="ordenarPor"
        >
          <AppColumn field="nombre" header="Plataforma" sortable>
            <template #body="{ data: fila }">
              <div class="flex min-w-0 items-center gap-3">
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base"
                  :class="fila.icono ? 'text-gray-600' : 'text-gray-300'"
                  :title="fila.icono || 'Sin ícono'"
                >
                  <i :class="fila.icono ? ['ti', fila.icono] : 'ti ti-apps'" aria-hidden="true"></i>
                </span>
                <span class="truncate font-medium text-gray-900">{{ fila.nombre }}</span>
              </div>
            </template>
          </AppColumn>
          <AppColumn field="id" header="Slug" sortable>
            <template #body="{ data: fila }">
              <code class="font-mono text-xs text-gray-600">{{ fila.id }}</code>
            </template>
          </AppColumn>
          <AppColumn field="icono" header="Ícono">
            <template #body="{ data: fila }">
              <code v-if="fila.icono" class="font-mono text-xs text-gray-500">{{ fila.icono }}</code>
              <span v-else class="text-gray-400">Sin ícono</span>
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
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando plataformas...</p>
          <ul v-else class="divide-y divide-gray-100" aria-label="Plataformas registradas">
            <li v-for="fila in listaPaginada" :key="fila.id" class="flex items-start gap-3 px-4 py-3">
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg"
                :class="fila.icono ? 'text-gray-600' : 'text-gray-300'"
              >
                <i :class="fila.icono ? ['ti', fila.icono] : 'ti ti-apps'" aria-hidden="true"></i>
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-gray-900">{{ fila.nombre }}</div>
                <code class="block truncate font-mono text-xs text-gray-500">{{ fila.id }}</code>
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

        <div class="full flex items-start gap-3">
          <div class="campo min-w-0 flex-1" :class="{ 'campo--inerte': guardando }">
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
          <span
            v-if="form.icono"
            class="mt-7 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-50 text-xl text-gray-600"
            title="Vista previa del ícono"
          >
            <i :class="['ti', form.icono]" aria-hidden="true"></i>
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
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="modalForm?.cerrar()" />
        <AppButton type="submit" form="plat-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
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
      @cerrado="porDarDeBaja = null"
      @confirm="confirmarBaja"
    />
  </div>
</template>
