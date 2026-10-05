<script setup>
// Paso 2 de la importación: confirmar a qué campo del sistema corresponde cada
// columna del Excel. La detección es una sugerencia (core: importarEquipos.js);
// nunca se asume en silencio: cada columna se revisa aquí.
import { CAMPOS_SISTEMA } from './importarEquipos.js';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  // Objeto reactivo de useImportacionEquipos(): encabezadosDetectados, filasCrudas,
  // generandoGrilla, continuarAGrilla, paso.
  imp: { type: Object, required: true },
});
const imp = props.imp;
</script>

<template>
  <section class="max-w-3xl rounded-lg border border-gray-200 bg-white" aria-labelledby="paso-mapeo">
    <div class="p-5 pb-4">
      <h2 id="paso-mapeo" class="text-base font-semibold text-gray-900">Confirmar columnas</h2>
      <p class="mt-1 text-sm text-gray-500">
        Se detectaron <span class="font-medium text-gray-900 tabular-nums">{{ imp.encabezadosDetectados.length }}</span> columnas y
        <span class="font-medium text-gray-900 tabular-nums">{{ imp.filasCrudas.length }}</span> filas. Revise que cada una apunte al campo correcto.
      </p>
    </div>
    <div class="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] gap-3 border-y border-gray-100 bg-gray-50 px-5 py-2 text-xs font-medium text-gray-500">
      <span>Columna del Excel</span>
      <span></span>
      <span>Campo del sistema</span>
    </div>
    <ul class="divide-y divide-gray-100">
      <li
        v-for="(h, i) in imp.encabezadosDetectados"
        :key="i"
        class="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] items-center gap-3 px-5 py-2"
      >
        <span class="truncate text-sm" :class="h.original ? 'text-gray-900' : 'text-gray-500'">{{ h.original || `(columna ${i + 1})` }}</span>
        <i class="ti ti-arrow-right text-center text-gray-300" aria-hidden="true"></i>
        <label class="relative block">
          <span class="sr-only">Campo del sistema para {{ h.original || `columna ${i + 1}` }}</span>
          <select
            v-model="h.campo"
            data-ui
            class="h-9 w-full cursor-pointer appearance-none rounded-md border bg-white pl-3 pr-9 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            :class="h.campo === 'ignorar' ? 'border-gray-200 text-gray-500' : 'border-gray-300 text-gray-900'"
          >
            <option v-for="c in CAMPOS_SISTEMA" :key="c.clave" :value="c.clave">{{ c.label }}</option>
          </select>
          <i class="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
        </label>
      </li>
    </ul>
    <div class="flex justify-end gap-2 border-t border-gray-100 p-4">
      <AppButton variant="outline" severity="secondary" icon="ti ti-arrow-left" label="Atrás" :disabled="imp.generandoGrilla" @click="imp.paso = 'pegar'" />
      <AppButton
        :icon="imp.generandoGrilla ? undefined : 'ti ti-arrow-right'"
        icon-pos="right"
        :label="imp.generandoGrilla ? 'Guardando bandeja...' : 'Crear bandeja de corrección'"
        :loading="imp.generandoGrilla"
        @click="imp.continuarAGrilla()"
      />
    </div>
  </section>
</template>
