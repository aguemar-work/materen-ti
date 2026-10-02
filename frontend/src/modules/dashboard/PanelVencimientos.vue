<script setup>
// "Vence esta semana": licencias y garantías que vencen dentro de los
// próximos días (las ya vencidas están en el feed como críticas). Cada fila
// lleva al listado ya filtrado por ese nombre o código.
import { RouterLink } from 'vue-router';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import { formatFechaLibro } from '../../core/formatters.js';
import PanelInicio from './PanelInicio.vue';
import FilaAviso from './FilaAviso.vue';

defineProps({
  items: { type: Array, default: () => [] },
  /** Cuántas más vencen después de esta semana (dentro del horizonte del servidor). */
  mas: { type: Number, default: 0 },
  /** Textos de aviso de las secciones que fallaron. */
  avisos: { type: Array, default: () => [] },
});
defineEmits(['reintentar']);
</script>

<template>
  <PanelInicio titulo="Vence esta semana" :conteo="items.length">
    <FilaAviso v-for="a in avisos" :key="a" :texto="a" @reintentar="$emit('reintentar')" />
    <p v-if="!items.length && !avisos.length" class="min-h-10 px-3 py-2 text-sm text-gray-500" data-vacio>
      — Nada vence esta semana<template v-if="mas > 0"> ({{ mas }} más adelante)</template>
    </p>
    <ul v-else-if="items.length">
      <li v-for="v in items" :key="v.key" data-vencimiento>
        <RouterLink
          :to="v.destino"
          class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 border-b border-gray-100 px-3 py-2 transition-colors duration-150 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        >
          <span class="pt-0.5 text-xs tabular-nums text-gray-900">{{ formatFechaLibro(v.fecha).fecha }}</span>
          <span class="min-w-0">
            <span class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm sm:flex-nowrap">
              <AppCodigo v-if="v.codigo" :valor="v.codigo" titulo="Código del equipo" class="shrink-0" />
              <span class="min-w-0 break-words font-medium text-gray-900 sm:truncate">{{ v.titulo }}</span>
            </span>
            <span v-if="v.contexto" class="mt-0.5 block break-words text-xs text-gray-500 sm:truncate">{{ v.contexto }}</span>
          </span>
        </RouterLink>
      </li>
      <li v-if="mas > 0" class="min-h-10 px-3 py-2 text-xs text-gray-500">{{ mas }} más vencen después de esta semana.</li>
    </ul>
  </PanelInicio>
</template>
