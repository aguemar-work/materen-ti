<script setup>
// Catálogo de tipos de equipo con sus plantillas: qué specs pide cada
// tipo y qué accesorios sugiere al registrar/entregar un equipo.
import { useTiposEquipoStore } from '../../stores/catalogos.js';
import { useEquiposStore } from '../../stores/equipos.js';
import { slugDe } from '../../core/utils.js';
import { useCrudCatalogo } from '../../composables/useCrudCatalogo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import EncabezadoCatalogo from './EncabezadoCatalogo.vue';
import { useEsMovil } from '../../composables/useEsMovil.js';
import AppTag from '../../components/ui/AppTag.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';

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

const { esMovil } = useEsMovil();

// Acciones de fila en el menú ⋮ (rediseño 2026-09-23 — antes, íconos sueltos).
function accionesDe(fila) {
  return [
    { icono: 'ti-pencil', label: 'Editar plantilla', onClick: () => abrirEditar(fila) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => { porEliminar.value = fila; } },
  ];
}

const campoNombre = useCampoAccesible();
const campoSpecs = useCampoAccesible();
const campoAccesorios = useCampoAccesible();
const infoErrorForm = infoNotificacion('error');

</script>

<template>
  <div class="space-y-4">
    <EncabezadoCatalogo
      titulo="Tipos de equipo"
      :conteo="lista.length"
      descripcion="Plantillas: qué especificaciones pide cada tipo al registrar un equipo y qué accesorios sugiere al entregarlo."
    >
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nuevo tipo" @click="abrirNuevo" />
      </template>
    </EncabezadoCatalogo>

    <AppVacio
      v-if="!cargando && totalItems === 0"
      icono="ti ti-devices"
      titulo="Sin tipos de equipo todavía"
      mensaje="Cree plantillas con los campos y accesorios que pide cada tipo."
    >
      <AppButton variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar tipo" @click="abrirNuevo" />
    </AppVacio>

    <template v-else>
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <p v-if="cargando" class="sr-only" role="status">Cargando tipos de equipo…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppTable
          v-if="!esMovil"
          :value="listaPaginada"
          :loading="cargando"
          :total-records="totalItems"
          :rows="tamPagina"
          :orden="{ columna, direccion }"
          aria-label="Tipos de equipo"
          @ordenar="ordenarPor"
        >
          <AppColumn field="nombre" header="Tipo" sortable>
            <template #body="{ data: fila }">
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base text-gray-500">
                  <i class="ti ti-devices" aria-hidden="true"></i>
                </span>
                <span class="truncate font-medium text-gray-900">{{ fila.nombre }}</span>
              </div>
            </template>
          </AppColumn>
          <AppColumn field="campos_spec" header="Specs que pide">
            <template #body="{ data: fila }">
              <div v-if="fila.campos_spec?.length" class="flex flex-wrap gap-1">
                <AppTag v-for="c in fila.campos_spec" :key="c">{{ c }}</AppTag>
              </div>
              <span v-else class="text-gray-500">Sin specs</span>
            </template>
          </AppColumn>
          <AppColumn field="accesorios_sugeridos" header="Accesorios sugeridos">
            <template #body="{ data: fila }">
              <div v-if="fila.accesorios_sugeridos?.length" class="flex flex-wrap gap-1">
                <AppTag v-for="a in fila.accesorios_sugeridos" :key="a">{{ a }}</AppTag>
              </div>
              <span v-else class="text-gray-500">Sin accesorios</span>
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
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando tipos de equipo...</p>
          <ul v-else class="divide-y divide-gray-100" aria-label="Tipos de equipo">
            <li v-for="fila in listaPaginada" :key="fila.id" class="flex items-start gap-3 px-4 py-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                <i class="ti ti-devices" aria-hidden="true"></i>
              </span>
              <div class="min-w-0 flex-1 space-y-0.5">
                <div class="truncate text-sm font-medium text-gray-900">{{ fila.nombre }}</div>
                <p class="text-xs" :class="fila.campos_spec?.length ? 'text-gray-500' : 'text-gray-500'">
                  <span class="text-gray-500">Specs:</span> {{ fila.campos_spec?.length ? fila.campos_spec.join(', ') : 'Sin specs' }}
                </p>
                <p class="text-xs" :class="fila.accesorios_sugeridos?.length ? 'text-gray-500' : 'text-gray-500'">
                  <span class="text-gray-500">Accesorios:</span> {{ fila.accesorios_sugeridos?.length ? fila.accesorios_sugeridos.join(', ') : 'Sin accesorios' }}
                </p>
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

    <!-- Formulario (AppDialog compartido) -->
    <AppDialog
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="esEdicion ? `Editar “${editar.nombre}”` : 'Nuevo tipo de equipo'"
      size="sm"
      @cerrado="mostrarForm = false"
    >
      <form id="te-form" class="space-y-4" @submit.prevent="guardar">
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
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="modalForm?.cerrar()" />
        <AppButton type="submit" form="te-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
      </template>
    </AppDialog>

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
      @cerrado="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>


