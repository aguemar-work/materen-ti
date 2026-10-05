<script setup>
// Índice de Reportes (/reportes): todos los reportes y exportaciones del
// sistema en un solo lugar, agrupados por área (Mesa de ayuda · Personas ·
// Custodia · Administración), y SOLO los que el usuario puede ver con el mismo
// permiso que exige cada RPC (core/reportes.js). Cada reporte abre su hoja
// imprimible con su CSV; los módulos ya no exportan por su cuenta.
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { reportesPorArea, rutaReporte } from '../../core/reportes.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';

const auth = useAuthStore();
const areas = computed(() => reportesPorArea(auth));

const ALCANCE = {
  periodo: 'Por período',
  corte: 'Al momento',
  historico: 'Todo el historial',
  ronda: 'Por ronda',
};
</script>

<template>
  <div class="w-full pb-10">
    <AppEncabezado
      titulo="Reportes"
      subtitulo="Todo lo que se reporta o se exporta, en un solo lugar: cada hoja se imprime o se descarga en CSV."
    />

    <div class="space-y-8 px-4 sm:px-6">
      <p v-if="!areas.length" class="text-sm text-gray-500">— No tiene acceso a ningún reporte. Pida al jefe de TI el módulo que corresponda.</p>

      <section v-for="area in areas" :key="area.id" :aria-labelledby="`reportes-${area.id}`">
        <h2 :id="`reportes-${area.id}`" class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ area.label }}</h2>
        <ul class="mt-2 divide-y divide-gray-100 border-y border-gray-200">
          <li v-for="r in area.reportes" :key="r.id" class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
            <div class="min-w-0 max-w-prose">
              <RouterLink :to="rutaReporte(r.id)" class="text-sm font-medium text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                {{ r.titulo }}
              </RouterLink>
              <p class="mt-0.5 text-xs text-gray-500">{{ r.descripcion }}</p>
            </div>
            <span class="shrink-0 text-xs text-gray-500">{{ ALCANCE[r.alcance] }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
