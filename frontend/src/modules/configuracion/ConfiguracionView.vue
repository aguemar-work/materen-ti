<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { GRUPOS_CONFIGURACION } from '../../core/configuracion.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppSelect from '../../components/ui/AppSelect.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const grupos = computed(() => GRUPOS_CONFIGURACION.filter((grupo) => !grupo.soloJefe || auth.esJefe));
const esIndice = computed(() => route.name === 'configuracion');
</script>

<template>
  <div class="flex min-h-full flex-col">
    <AppEncabezado
      titulo="Configuración"
      subtitulo="Administre los catálogos y las opciones que organizan el trabajo de TI."
    />

    <div v-if="esIndice" class="grid items-start gap-x-8 gap-y-7 px-4 pb-10 sm:px-6 lg:grid-cols-2">
      <section v-for="grupo in grupos" :key="grupo.id" :aria-labelledby="`config-grupo-${grupo.id}`" class="min-w-0">
        <h2 :id="`config-grupo-${grupo.id}`" class="text-base font-semibold">{{ grupo.titulo }}</h2>
        <ul class="mt-2 divide-y divide-gray-100 border-y border-gray-200">
          <li v-for="seccion in grupo.secciones" :key="seccion.id">
            <RouterLink
              :to="{ name: `configuracion-${seccion.id}` }"
              :aria-labelledby="`config-titulo-${seccion.id}`"
              :aria-describedby="`config-descripcion-${seccion.id}`"
              class="flex items-start gap-3 rounded-sm px-3 py-3 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
            >
              <i :class="seccion.icono" class="mt-1 shrink-0 text-base text-gray-500" aria-hidden="true"></i>
              <div class="min-w-0 flex-1">
                <span :id="`config-titulo-${seccion.id}`" class="text-sm font-semibold text-primary-700">{{ seccion.titulo }}</span>
                <p :id="`config-descripcion-${seccion.id}`" class="mt-1 text-sm leading-relaxed text-gray-600">{{ seccion.descripcion }}</p>
              </div>
              <i class="ti ti-arrow-right mt-1 shrink-0 text-gray-500" aria-hidden="true"></i>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>

    <div v-else class="grid min-w-0 items-start gap-6 px-4 pb-10 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <nav class="md:hidden" aria-label="Secciones de configuración">
        <AppSelect
          :model-value="route.name"
          label="Ir a una sección de configuración"
          class="w-full [&_select]:h-11 [&_select]:w-full [&_select]:max-w-none"
          @update:model-value="router.push({ name: $event })"
        >
          <option value="configuracion">Todas las secciones</option>
          <optgroup v-for="grupo in grupos" :key="grupo.id" :label="grupo.titulo">
            <option v-for="seccion in grupo.secciones" :key="seccion.id" :value="`configuracion-${seccion.id}`">{{ seccion.titulo }}</option>
          </optgroup>
        </AppSelect>
      </nav>

      <nav class="hidden space-y-4 md:sticky md:top-4 md:block" aria-label="Secciones de configuración">
        <RouterLink :to="{ name: 'configuracion' }" class="inline-flex min-h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-primary-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary-500">
          <i class="ti ti-layout-grid" aria-hidden="true"></i>Todas las secciones
        </RouterLink>
        <div v-for="grupo in grupos" :key="grupo.id">
          <p class="px-2 text-xs font-medium text-gray-500">{{ grupo.titulo }}</p>
          <ul class="mt-1 space-y-0.5">
            <li v-for="seccion in grupo.secciones" :key="seccion.id">
              <RouterLink
                :to="{ name: `configuracion-${seccion.id}` }"
                exact-active-class="bg-gray-100 text-gray-900"
                class="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <i :class="seccion.icono" class="shrink-0 text-base text-gray-500" aria-hidden="true"></i>
                {{ seccion.titulo }}
              </RouterLink>
            </li>
          </ul>
        </div>
      </nav>

      <div class="min-w-0">
        <RouterView />
      </div>
    </div>
  </div>
</template>
