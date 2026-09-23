<script setup>
// Contexto del ticket para resolverlo sin salir de la pantalla: equipos del
// solicitante, artículos de KB de la misma categoría y el problema
// vinculado. Compartido por la página completa y el panel del split-view
// (AGENTS.md, "Helpers compartidos… 3"); rediseño 2026-09-23. Solo pinta;
// los datos vienen del composable (useTicketDetalleLogica.js), sin
// consultas propias. Cada bloque es su propio v-if: nunca una sección vacía,
// salvo "Artículos de KB" con `mostrar-vacios` (la página completa lo usa
// para decir que la categoría todavía no tiene artículos).
import AppTag from '../../components/ui/AppTag.vue';
import { estadoProblemaInfo } from '../../core/dominio-problemas.js';
import { rolDeTag } from '../../core/tagRol.js';

defineProps({
  equipos: { type: Array, default: () => [] },
  articulos: { type: Array, default: () => [] },
  problema: { type: Object, default: null },
  categoriaId: { type: String, default: null },
  mostrarVacios: { type: Boolean, default: false },
});

const ROTULO = 'mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500';
</script>

<template>
  <div class="space-y-4">
    <div v-if="problema">
      <p :class="ROTULO"><i class="ti ti-alert-hexagon" aria-hidden="true"></i>Problema vinculado</p>
      <RouterLink
        :to="`/problemas/${problema.id}`"
        class="group flex items-start gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <span class="min-w-0 flex-1 text-gray-900 group-hover:underline">{{ problema.titulo }}</span>
        <AppTag :tono="rolDeTag(estadoProblemaInfo(problema.estado).clase)">{{ estadoProblemaInfo(problema.estado).label }}</AppTag>
      </RouterLink>
    </div>

    <div v-if="equipos.length">
      <p :class="ROTULO"><i class="ti ti-devices" aria-hidden="true"></i>Equipos del solicitante</p>
      <ul class="space-y-1">
        <li v-for="eq in equipos" :key="eq.asignacion_id || eq.equipo_id" class="flex min-w-0 items-baseline gap-2 text-sm">
          <span class="shrink-0 font-medium tabular-nums text-gray-900">{{ eq.codigo }}</span>
          <span class="truncate text-gray-600">{{ [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ') }}</span>
        </li>
      </ul>
    </div>

    <div v-if="articulos.length || (mostrarVacios && categoriaId)">
      <p :class="ROTULO"><i class="ti ti-books" aria-hidden="true"></i>Artículos de KB relacionados</p>
      <ul v-if="articulos.length" class="space-y-1">
        <li v-for="a in articulos" :key="a.id">
          <RouterLink class="text-sm text-primary-700 hover:underline" :to="`/base-conocimiento/${a.id}`">{{ a.titulo }}</RouterLink>
        </li>
      </ul>
      <p v-else class="text-sm text-gray-400">Sin artículos publicados en esta categoría todavía.</p>
    </div>
  </div>
</template>
