<script setup>
// Tabla de escritorio del listado de equipos: la fila abre la hoja de vida
// (/equipos/:id), la primera columna selecciona filas para "Imprimir
// etiquetas", y la última lleva la acción contextual más el menú ⋮. La
// paginación es server-side (AppPaginacion como hermano de AppTable).
//
// La selección es un Set<id> que vive en la vista y SOBREVIVE a cambiar de
// página (se pueden juntar equipos de varias páginas para una hoja de
// etiquetas); AppTable trabaja con un array de FILAS, de ahí el puente.
import { computed } from 'vue';
import { situacionInfo, nombreEquipo } from '../../core/dominio-equipos.js';
import { rolDeTag } from '../../core/tagRol.js';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import EquipoAsignacion from './EquipoAsignacion.vue';

const props = defineProps({
  lista: { type: Array, required: true },
  cargando: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  pagina: { type: Number, default: 1 },
  tamPagina: { type: Number, default: 20 },
  orden: { type: Object, default: null },
  acciones: { type: Object, required: true },
  seleccion: { type: Set, required: true },
});
const emit = defineEmits(['abrir', 'ordenar', 'ir-a-pagina', 'cambiar-tam-pagina', 'update:seleccion']);

// Estado FÍSICO (operativo / en reparación / de baja / perdido). Que esté
// asignado a una persona o en una ubicación ya se ve en "Asignación".
function estadoFisico(eq) {
  if (eq.estado === 'operativo') return { label: 'Operativo', clase: 'badge--success' };
  return situacionInfo(eq.estado);
}

// Etiqueta corta de la acción de la fila (la completa va en aria-label).
function etiquetaCorta(accion) {
  return accion.label.replace(' a un empleado', '').replace(' (operativo)', '').replace('Registrar devolución', 'Devolución');
}

const seleccionParaTabla = computed({
  get: () => props.lista.filter((eq) => props.seleccion.has(eq.id)),
  set: (filas) => {
    const nuevo = new Set(props.seleccion);
    for (const eq of props.lista) nuevo.delete(eq.id);
    for (const eq of filas) nuevo.add(eq.id);
    emit('update:seleccion', nuevo);
  },
});
</script>

<template>
  <AppMarcoTabla>
    <div class="min-h-0 flex-1 overflow-auto">
      <AppTable
        v-model:selection="seleccionParaTabla"
        :value="lista"
        :loading="cargando"
        :total-records="total"
        :rows="tamPagina"
        :orden="orden"
        :row-class="() => 'cursor-pointer'"
        aria-label="Inventario de equipos"
        @ordenar="emit('ordenar', $event)"
        @row-click="({ data }) => emit('abrir', data)"
      >
        <AppColumn selection-mode="multiple" :header-style="{ width: '44px' }" />

        <AppColumn field="codigo" header="Equipo" sortable>
          <template #body="{ data: eq }">
            <div class="flex min-w-0 max-w-60 items-center gap-3 2xl:max-w-md">
              <a
                v-if="eq.fotos.length"
                class="block h-9 w-9 shrink-0 overflow-hidden rounded-md bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                :href="eq.fotos[0].url"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`Ver foto de ${eq.codigo}`"
                @click.stop
              >
                <img :src="eq.fotos[0].url" alt="" class="h-full w-full object-cover">
              </a>
              <div class="min-w-0">
                <div class="truncate font-medium text-gray-900" :title="nombreEquipo(eq)">{{ nombreEquipo(eq) }}</div>
                <div class="truncate text-xs text-gray-500 tabular-nums">
                  <AppCodigo :valor="eq.codigo" titulo="Código de equipo" />
                  <template v-if="eq.codigo_almacen"> · Alm. {{ eq.codigo_almacen }}</template>
                  <template v-if="eq.empresa_nombre"> · {{ eq.empresa_nombre }}</template>
                </div>
              </div>
            </div>
          </template>
        </AppColumn>

        <AppColumn field="serie" header="Serie" sortable>
          <template #body="{ data: eq }">
            <span class="tabular-nums" :class="eq.serie ? 'text-gray-700' : 'text-gray-500'">{{ eq.serie || 'Sin serie' }}</span>
          </template>
        </AppColumn>

        <AppColumn field="situacion" header="Estado">
          <template #body="{ data: eq }">
            <AppTag :tono="rolDeTag(estadoFisico(eq).clase)" punto>{{ estadoFisico(eq).label }}</AppTag>
          </template>
        </AppColumn>

        <AppColumn field="asignacion" header="Asignación">
          <template #body="{ data: eq }">
            <EquipoAsignacion :equipo="eq" :acciones="acciones" />
          </template>
        </AppColumn>

        <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
          <template #body="{ data: eq }">
            <div class="flex items-center justify-end gap-1 whitespace-nowrap" @click.stop>
              <AppButton
                v-if="acciones.accionPrincipalDe(eq)"
                size="sm"
                variant="text"
                severity="secondary"
                :icon="`ti ${acciones.accionPrincipalDe(eq).icono}`"
                :label="etiquetaCorta(acciones.accionPrincipalDe(eq))"
                :aria-label="`${acciones.accionPrincipalDe(eq).label} — ${eq.codigo}`"
                @click="acciones.accionPrincipalDe(eq).onClick()"
              />
              <MenuAcciones :acciones="acciones.accionesDe(eq)" :label="`Acciones de ${eq.codigo}`" />
            </div>
          </template>
        </AppColumn>
      </AppTable>
    </div>

    <AppPaginacion
      v-if="!cargando && total > 0"
      :pagina="pagina"
      :tam-pagina="tamPagina"
      :total="total"
      @update:pagina="emit('ir-a-pagina', $event)"
      @update:tam-pagina="emit('cambiar-tam-pagina', $event)"
    />
  </AppMarcoTabla>
</template>
