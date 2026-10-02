<script setup>
// «Mis tickets» del portal del empleado (migración 109): los tickets activos
// (código, asunto y estado). El seguimiento detallado de un ticket sigue siendo
// su propio enlace; aquí no se muestra el token de ningún ticket.
import { useId } from 'vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';

defineProps({
  tickets: { type: Array, default: () => [] },
});

const idTitulo = useId();
</script>

<template>
  <section :aria-labelledby="idTitulo">
    <h2 :id="idTitulo" class="text-sm font-semibold text-gray-900">Mis tickets</h2>

    <p v-if="!tickets.length" class="mt-2 text-sm text-gray-500">No tiene tickets activos.</p>

    <ul v-else class="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
      <li v-for="t in tickets" :key="t.codigo" class="px-4 py-3">
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <AppCodigo :valor="t.codigo" titulo="Número de ticket" class="text-sm" />
          <BadgeEstado tipo="ticket" :valor="t.estado" />
        </div>
        <p class="mt-1 text-sm text-gray-600 [overflow-wrap:anywhere]">{{ t.titulo }}</p>
      </li>
    </ul>

    <AppButton
      class="mt-3"
      size="lg"
      block
      variant="outline"
      severity="secondary"
      icon="ti ti-ticket"
      label="Crear ticket de soporte"
      :to="{ name: 'ticket-nuevo' }"
    />
  </section>
</template>
