<script setup>
// Importar equipos desde el Excel de activos fijos: asistente de tres pasos
// (pegar → confirmar columnas → corregir y migrar). Cada paso es su componente
// (ImportarEquiposPegar / Mapeo / Bandeja) y el estado y la migración viven en
// useImportacionEquipos.js. Migrar usa las RPC `migrar_importacion_equipo(s)` de
// la migración 101. Pantalla de escritorio (plan §3.9): en móvil se avisa.
import { onMounted } from 'vue';
import { useImportacionEquipos } from './useImportacionEquipos.js';
import ImportarEquiposPegar from './ImportarEquiposPegar.vue';
import ImportarEquiposMapeo from './ImportarEquiposMapeo.vue';
import ImportarEquiposBandeja from './ImportarEquiposBandeja.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';

const imp = useImportacionEquipos();

const PASOS = [
  { id: 'pegar', label: 'Pegar datos' },
  { id: 'mapeo', label: 'Confirmar columnas' },
  { id: 'grid', label: 'Corregir y migrar' },
];

function indicePaso() {
  return PASOS.findIndex((p) => p.id === imp.paso);
}

onMounted(() => imp.iniciar());
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado
      titulo="Importar equipos desde Excel"
      :subtitulo="imp.paso === 'grid'
        ? `${imp.filas.length} ${imp.filas.length === 1 ? 'equipo' : 'equipos'} en la bandeja · ${imp.cantidadParaMigrar} ${imp.cantidadParaMigrar === 1 ? 'listo' : 'listos'} para migrar`
        : 'Pegue el inventario, confirme las columnas y corrija cada equipo antes de migrarlo'"
    >
      <template v-if="imp.paso === 'grid' && !imp.cargandoCatalogos" #acciones>
        <AppButton variant="outline" severity="danger" icon="ti ti-trash" label="Vaciar bandeja" :disabled="imp.migrandoLote" @click="imp.confirmarVaciar = true" />
        <AppButton
          icon="ti ti-file-import"
          :label="imp.migrandoLote ? `Migrando ${imp.progresoLote.hecho}/${imp.progresoLote.total}...` : 'Migrar filas listas'"
          :loading="imp.migrandoLote"
          :disabled="!imp.hayListasParaMigrar"
          @click="imp.confirmarMigrarTodas = true"
        />
      </template>
    </AppEncabezado>

    <p class="px-4 pb-3 text-sm text-gray-500 sm:hidden">Esta pantalla está pensada para escritorio: la grilla de corrección se desplaza en horizontal.</p>

    <!-- ══ Pasos del asistente ══ -->
    <ol class="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 pb-4 text-sm sm:px-6" aria-label="Pasos de la importación">
      <li v-for="(p, i) in PASOS" :key="p.id" class="flex items-center gap-2" :aria-current="imp.paso === p.id ? 'step' : undefined">
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
          :class="i < indicePaso() ? 'bg-green-50 text-green-700' : i === indicePaso() ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200' : 'bg-gray-100 text-gray-500'"
        >
          <i v-if="i < indicePaso()" class="ti ti-check" aria-hidden="true"></i>
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span :class="i === indicePaso() ? 'font-medium text-gray-900' : 'text-gray-500'">{{ p.label }}</span>
        <i v-if="i < PASOS.length - 1" class="ti ti-chevron-right mx-1 text-gray-300" aria-hidden="true"></i>
      </li>
    </ol>

    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <p v-if="imp.cargandoCatalogos" class="py-16 text-center text-sm text-gray-500" role="status">Cargando catálogos...</p>
      <ImportarEquiposPegar v-else-if="imp.paso === 'pegar'" :imp="imp" />
      <ImportarEquiposMapeo v-else-if="imp.paso === 'mapeo'" :imp="imp" />
      <ImportarEquiposBandeja v-else :imp="imp" />
    </div>

    <ConfirmDialog
      v-if="imp.confirmarVaciar"
      destructivo
      icono="ti-trash"
      titulo="Vaciar la bandeja de importación"
      mensaje="Se borrarán todas las filas pendientes de la bandeja (no afecta lo que ya se migró a Equipos). Úselo si pegó el lote equivocado."
      confirmar-label="Vaciar bandeja"
      :cargando="imp.vaciando"
      @cerrado="imp.confirmarVaciar = false"
      @confirm="imp.confirmarVaciarBandeja()"
    />

    <ConfirmDialog
      v-if="imp.confirmarMigrarTodas"
      icono="ti-file-import"
      titulo="Migrar todas las filas listas"
      :mensaje="`Se crearán ${imp.cantidadParaMigrar} equipos nuevos en el sistema (con su asignación o ubicación indicada). Esta acción no se puede deshacer desde acá.`"
      confirmar-label="Migrar"
      @cerrado="imp.confirmarMigrarTodas = false"
      @confirm="imp.migrarTodasListas()"
    />
  </div>
</template>
