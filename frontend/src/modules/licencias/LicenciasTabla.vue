<script setup>
// Listado de licencias: tabla en escritorio y tarjetas en móvil, con su
// paginación. Es presentación pura: recibe la página del store por props y
// avisa con eventos (ordenar, paginar, liberar, y las acciones del menú ⋮);
// quien muta es LicenciasView. Extraído de LicenciasView.vue al partirla.
import { useAuthStore } from '../../stores/auth.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppTag from '../../components/ui/AppTag.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import LicenciaAcceso from './LicenciaAcceso.vue';
import LicenciaCapacidad from './LicenciaCapacidad.vue';
import LicenciaUsuariosChips from './LicenciaUsuariosChips.vue';
import { useUsuariosVisibles } from './useLicenciaCupos.js';
import { useLicenciaRevelados } from './useLicenciaRevelados.js';
import { accionesDeLicencia, detalleVencimiento, estadoVencimiento, tonoVencimiento } from './licenciaPresentacion.js';

defineProps({
  lista: { type: Array, required: true },
  cargando: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  pagina: { type: Number, default: 1 },
  tamPagina: { type: Number, default: 20 },
  orden: { type: Object, default: null },
});
const emit = defineEmits([
  'ordenar', 'update:pagina', 'update:tam-pagina',
  'renovar', 'asignar', 'editar', 'eliminar', 'liberar',
]);

const auth = useAuthStore();
const { esMovil } = useEsMovil();
const { usuariosVisibles, expandir } = useUsuariosVisibles();
const { revelarDe } = useLicenciaRevelados();

// Fuente única de las acciones por licencia para el menú ⋮ (tabla y tarjetas).
const ACCIONES = {
  renovar: (lic) => emit('renovar', lic),
  asignar: (lic) => emit('asignar', lic),
  editar: (lic) => emit('editar', lic),
  eliminar: (lic) => emit('eliminar', lic),
};
const accionesDe = (lic) => accionesDeLicencia(lic, ACCIONES);
</script>

<template>
  <p v-if="cargando" class="sr-only" role="status">Cargando licencias…</p>

  <!-- ── Tabla (escritorio) ── -->
  <AppMarcoTabla v-if="!esMovil">
    <div class="min-h-0 flex-1 overflow-auto">
      <AppTable
        :value="lista"
        :loading="cargando"
        :total-records="total"
        :rows="tamPagina"
        :orden="orden"
        aria-label="Licencias de software"
        @ordenar="emit('ordenar', $event)"
      >
        <AppColumn field="software" header="Software" sortable>
          <template #body="{ data: lic }">
            <div class="flex min-w-0 max-w-56 items-center gap-3 2xl:max-w-72">
              <div class="min-w-0">
                <div class="truncate font-medium text-gray-900">{{ lic.software }}</div>
                <div class="truncate text-xs text-gray-500">
                  {{ [lic.proveedor, lic.empresa_nombre || 'Del grupo'].filter(Boolean).join(' · ') }}
                </div>
              </div>
            </div>
          </template>
        </AppColumn>

        <AppColumn field="acceso" header="Acceso">
          <template #body="{ data: lic }">
            <LicenciaAcceso :licencia="lic" :revelado="revelarDe(lic)" :puede-ver="auth.puedeVerCredenciales" />
          </template>
        </AppColumn>

        <AppColumn field="asientos" header="Asientos">
          <template #body="{ data: lic }">
            <LicenciaCapacidad class="w-36" :licencia="lic" />
          </template>
        </AppColumn>

        <AppColumn field="usuarios" header="Usuarios">
          <template #body="{ data: lic }">
            <LicenciaUsuariosChips
              v-if="lic.usuarios.length"
              :licencia="lic"
              :visibles="usuariosVisibles(lic)"
              @liberar="emit('liberar', lic, $event)"
              @expandir="expandir(lic)"
            />
            <span v-else class="text-gray-500">Sin usuarios</span>
          </template>
        </AppColumn>

        <AppColumn field="fecha_vencimiento" header="Vencimiento" sortable>
          <template #body="{ data: lic }">
            <div class="whitespace-nowrap">
              <AppTag :tono="tonoVencimiento(lic)" punto>{{ estadoVencimiento(lic).texto }}</AppTag>
              <div class="mt-1 text-xs text-gray-500 tabular-nums">{{ detalleVencimiento(lic) }}</div>
            </div>
          </template>
        </AppColumn>

        <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
          <template #body="{ data: lic }">
            <div class="flex justify-end">
              <MenuAcciones :acciones="accionesDe(lic)" :label="`Acciones de ${lic.software}`" />
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
      @update:pagina="emit('update:pagina', $event)"
      @update:tam-pagina="emit('update:tam-pagina', $event)"
    />
  </AppMarcoTabla>

  <!-- ── Tarjetas (móvil) ── -->
  <div v-else class="min-h-0 flex-1 overflow-y-auto">
    <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando licencias...</p>
    <ul v-else class="grid gap-3 sm:grid-cols-2" aria-label="Licencias de software">
      <li v-for="lic in lista" :key="lic.id" class="flex flex-col rounded-lg border border-gray-200 bg-white p-4">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium text-gray-900">{{ lic.software }}</div>
            <div class="truncate text-xs text-gray-500">{{ [lic.proveedor, lic.empresa_nombre || 'Del grupo'].filter(Boolean).join(' · ') }}</div>
          </div>
          <div class="-mr-1 -mt-1">
            <MenuAcciones :acciones="accionesDe(lic)" :label="`Acciones de ${lic.software}`" />
          </div>
        </div>

        <LicenciaCapacidad class="mt-3" :licencia="lic" />

        <LicenciaUsuariosChips
          v-if="lic.usuarios.length"
          tarjeta
          :licencia="lic"
          :visibles="usuariosVisibles(lic)"
          @liberar="emit('liberar', lic, $event)"
          @expandir="expandir(lic)"
        />

        <div class="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
          <AppTag :tono="tonoVencimiento(lic)" punto>{{ estadoVencimiento(lic).texto }}</AppTag>
          <span class="text-xs text-gray-500 tabular-nums">{{ detalleVencimiento(lic) }}</span>
        </div>
      </li>
    </ul>
    <AppPaginacion
      v-if="!cargando"
      variante="compacta"
      :pagina="pagina"
      :tam-pagina="tamPagina"
      :total="total"
      @update:pagina="emit('update:pagina', $event)"
    />
  </div>
</template>
