<script setup>
// "Mis tickets": los vigentes asignados a quien mira el Inicio, con la
// prioridad (rango escrito) y el estado según core/tonos.js. El total es el
// de TODOS los vigentes asignados, no el de los mostrados (5): el enlace tiene
// que decir la verdad. Sin el módulo tickets el servidor devuelve `tickets:
// null` y el panel no se monta (lo decide DashboardView).
import { RouterLink } from 'vue-router';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import PanelInicio from './PanelInicio.vue';
import FilaAviso from './FilaAviso.vue';

defineProps({
  /** `resumen.tickets` (o `null` si la sección falló). */
  tickets: { type: Object, default: null },
  /** Texto del aviso cuando la sección falló; `''` si no. */
  aviso: { type: String, default: '' },
});
defineEmits(['reintentar']);
</script>

<template>
  <PanelInicio titulo="Mis tickets" :conteo="tickets ? tickets.mios_total : null">
    <FilaAviso v-if="aviso" :texto="aviso" @reintentar="$emit('reintentar')" />
    <template v-else-if="tickets">
      <p v-if="!tickets.mios.length" class="min-h-10 px-3 py-2 text-sm text-gray-500" data-vacio>— Sin tickets asignados</p>
      <ul v-else>
        <li v-for="t in tickets.mios" :key="t.id" data-mio>
          <RouterLink
            :to="`/tickets/${t.id}`"
            class="block border-b border-gray-100 px-3 py-2 transition-colors duration-150 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
          >
            <span class="flex items-center gap-2 text-sm">
              <AppCodigo :valor="t.codigo" titulo="Número de ticket" />
              <BadgeEstado tipo="prioridad" :valor="t.prioridad" />
              <BadgeEstado class="ml-auto" tipo="ticket" :valor="t.estado" />
            </span>
            <span class="mt-1 line-clamp-2 block text-sm text-gray-900">{{ t.titulo }}</span>
          </RouterLink>
        </li>
      </ul>
      <RouterLink
        v-if="tickets.mios_total > 0"
        to="/tickets?asignado=yo"
        class="flex min-h-10 items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      >
        Ver mis {{ tickets.mios_total }} {{ tickets.mios_total === 1 ? 'ticket' : 'tickets' }} →
      </RouterLink>
    </template>
  </PanelInicio>
</template>
