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
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { slugDe } from '../../core/utils.js';

const auth = useAuthStore();
const areas = computed(() => reportesPorArea(auth));
const { filtros, limpiar } = useFiltrosUrl({ q: { tipo: 'texto' } });
const areasVisibles = computed(() => areas.value.map((area) => ({
  ...area,
  reportes: area.reportes.filter((reporte) =>
    slugDe(`${area.label} ${reporte.titulo} ${reporte.descripcion}`).includes(slugDe(filtros.q))),
})).filter((area) => area.reportes.length));
const total = computed(() => areasVisibles.value.reduce((suma, area) => suma + area.reportes.length, 0));

const ALCANCE = {
  periodo: 'Por período',
  corte: 'Al momento',
  ronda: 'Por ronda',
};
</script>

<template>
  <div class="w-full pb-10">
    <AppEncabezado
      titulo="Reportes"
      subtitulo="Consulte la operación, el personal y los recursos de TI. Cada reporte permite imprimir o descargar sus datos."
    />

    <AppBarraFiltros v-if="areas.length">
      <AppBuscador v-model="filtros.q" label="Buscar reportes" placeholder="Buscar por reporte o tema" />
      <AppButton v-if="filtros.q" size="sm" variant="text" severity="secondary" label="Limpiar búsqueda" @click="limpiar()" />
      <p class="text-sm text-gray-600 sm:ml-auto" role="status">{{ total }} {{ total === 1 ? 'reporte disponible' : 'reportes disponibles' }}</p>
    </AppBarraFiltros>

    <div class="grid gap-8 px-4 sm:px-6 xl:grid-cols-2">
      <p v-if="!areas.length" class="text-sm text-gray-500">— No tiene acceso a ningún reporte. Pida al jefe de TI el módulo que corresponda.</p>
      <AppVacio v-else-if="!total" class="col-span-full" titulo="Sin reportes para esta búsqueda" mensaje="Busque otro tema o limpie la búsqueda para ver todos los reportes disponibles.">
        <AppButton variant="outline" severity="secondary" label="Limpiar búsqueda" @click="limpiar()" />
      </AppVacio>

      <section v-for="area in areasVisibles" :key="area.id" :aria-labelledby="`reportes-${area.id}`" class="min-w-0">
        <h2 :id="`reportes-${area.id}`" class="text-base font-semibold text-gray-900">{{ area.label }}</h2>
        <ul class="mt-3 divide-y divide-gray-100 border-y border-gray-200">
          <li v-for="r in area.reportes" :key="r.id">
            <RouterLink
              :to="rutaReporte(r.id)"
              :aria-labelledby="`reporte-${r.id}-nombre`"
              :aria-describedby="`reporte-${r.id}-descripcion`"
              class="group flex items-start gap-3 rounded-sm px-3 py-4 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
            >
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span :id="`reporte-${r.id}-nombre`" class="text-sm font-semibold text-primary-700">{{ r.titulo }}</span>
                  <span class="text-xs text-gray-600">{{ ALCANCE[r.alcance] }}</span>
                </div>
                <p :id="`reporte-${r.id}-descripcion`" class="mt-1.5 text-sm leading-relaxed text-gray-600">{{ r.descripcion }}</p>
              </div>
              <i class="ti ti-arrow-right mt-0.5 shrink-0 text-gray-500" aria-hidden="true"></i>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
