<script setup>
// SideNav del shell (V2 "marco + hoja", 2026-09-25).
//
// El sidebar vive sobre el MARCO gris del shell, sin borde propio: lo separa
// del contenido la hoja blanca (ver AppLayout.vue). El ítem activo se dibuja
// como un pedazo de esa misma hoja — fondo blanco con una sombra mínima —
// para que el menú y la página se lean como una sola pieza: "estoy acá, y
// esto de la derecha es eso". El ícono activo lleva el único acento de
// marca del menú. Sin bordes ni barras laterales (regla de producto).
//
// En el riel (solo desktop, md+) se ocultan rótulos y textos; el badge pasa
// a un punto sobre el ícono. En móvil el panel siempre va completo.
//
// La estructura (áreas → grupos → ítems) vive en ./navegacion.js, compartida
// con las migas de la barra superior. Acá solo se filtra por rol y módulo.
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { AREAS_NAV } from './navegacion.js';
import { ROTULO_GRUPO } from './shellClases.js';

const props = defineProps({
  navEnRiel: { type: Boolean, default: false },
  ticketsSinAsignar: { type: Number, default: 0 },
});
const emit = defineEmits(['cerrar-nav', 'expandir-nav']);

const auth = useAuthStore();

// El badge se resuelve dentro del computed (no en la constante): leído una
// sola vez al montar quedaba congelado en el valor inicial aunque AppLayout
// lo actualizara por realtime. Un grupo sin ítems visibles no se renderiza
// (un rótulo sin filas debajo se lee como una sección rota).
const navAreas = computed(() => AREAS_NAV
  .map((area) => ({
    ...area,
    grupos: area.grupos
      .map((grupo) => ({
        ...grupo,
        items: grupo.items
          .filter((item) => !item.soloJefe || auth.esJefe)
          .filter((item) => !item.modulo || auth.puedeVerModulo(item.modulo))
          .filter((item) => !item.algunModulo || item.algunModulo.some((m) => auth.puedeVerModulo(m)))
          .map((item) => ({ ...item, badge: item.badgeSinAsignar ? props.ticketsSinAsignar : 0 })),
      }))
      .filter((grupo) => grupo.items.length > 0),
  }))
  .filter((area) => area.grupos.length > 0));

function alNavegar() {
  emit('cerrar-nav');
}

// En el riel el rótulo del grupo no se ve: este botón evita que el riel sea
// un callejón sin salida para quien no reconoce un ícono.
function expandir() {
  emit('expandir-nav');
}

const CLASE_LINK =
  'group/item relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-gray-600 ' +
  'transition-colors duration-150 hover:bg-gray-200/60 hover:text-gray-900 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
// "Pedazo de hoja": blanco + sombra mínima + anillo de 1px (no es un borde
// lateral: rodea al ítem entero, igual que el contorno de la hoja).
const CLASE_LINK_ACTIVO =
  'nav-activo bg-white! text-gray-900! font-medium shadow-xs ring-1 ring-gray-900/5 hover:bg-white!';
</script>

<template>
  <div class="flex min-h-full flex-col">
    <div class="flex-1 space-y-0.5 px-2 py-1">
      <template v-for="area in navAreas" :key="area.id">
        <div
          v-if="navAreas.length > 1"
          :class="[ROTULO_GRUPO, { 'md:hidden': navEnRiel }]"
        >{{ area.label }}</div>

        <div v-for="grupo in area.grupos" :key="grupo.id" class="space-y-0.5">
          <div v-if="grupo.label" :class="[ROTULO_GRUPO, { 'md:hidden': navEnRiel }]">{{ grupo.label }}</div>
          <!-- En el riel no hay rótulos: una línea fina separa los grupos -->
          <div v-if="grupo.label && navEnRiel" class="mx-3 my-2 hidden h-px bg-gray-200 md:block" aria-hidden="true"></div>

          <RouterLink
            v-for="item in grupo.items"
            :key="item.path"
            :to="item.path"
            :class="[CLASE_LINK, { 'md:justify-center md:px-0': navEnRiel }]"
            :active-class="CLASE_LINK_ACTIVO"
            :title="navEnRiel ? item.label : null"
            @click="alNavegar"
          >
            <i
              class="text-[17px] text-gray-500 transition-colors group-hover/item:text-gray-700 group-[.nav-activo]/item:text-primary-600"
              :class="item.icon"
              aria-hidden="true"
            ></i>
            <span class="truncate" :class="{ 'md:sr-only': navEnRiel }">{{ item.label }}</span>
            <span
              v-if="item.badge"
              class="ml-auto min-w-5 rounded-full bg-primary-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums"
              :class="{ 'md:absolute md:right-1.5 md:top-1 md:ml-0 md:h-2 md:w-2 md:min-w-0 md:overflow-hidden md:p-0 md:text-[0px]': navEnRiel }"
              :title="`${item.badge} ticket(s) sin asignar`"
            >{{ item.badge }}</span>
          </RouterLink>
        </div>
      </template>
    </div>

    <!-- Pie del riel: única salida del riel sin subir a la barra de la hoja (solo desktop) -->
    <button
      v-if="navEnRiel"
      class="mx-2 mb-2 hidden h-8 items-center justify-center rounded-md text-gray-500 transition-colors duration-150 hover:bg-gray-200/60 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 md:flex"
      type="button"
      title="Expandir navegación"
      aria-label="Expandir navegación"
      @click="expandir"
    >
      <i class="ti ti-layout-sidebar-left-expand text-[17px]" aria-hidden="true"></i>
    </button>
  </div>
</template>
