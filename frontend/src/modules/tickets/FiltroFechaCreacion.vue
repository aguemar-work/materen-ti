<script setup>
// Filtro secundario "Fecha de creación" de la bandeja de Tickets.
//
// Rediseño 2026-09-23: pasa a ser un control compacto de la barra de
// filtros (mismo alto h-9 que AppBuscador/AppSelect), en una sola línea
// "Creado [desde] – [hasta]". Antes se pintaba en dos contenedores (riel
// lateral en escritorio, barra en móvil); ahora las bandejas y este filtro
// viven en la misma barra en los dos tamaños, así que hay un solo montaje.
// El `idPrefijo` se conserva: los `id` tienen que ser únicos si alguna vez
// vuelve a montarse dos veces.
//
// El `v-model` es doble (desde/hasta) porque el rango es UN filtro, no dos:
// el consumidor lo limpia de una sola vez.
defineProps({
  desde: { type: String, default: '' },
  hasta: { type: String, default: '' },
  idPrefijo: { type: String, required: true },
});
defineEmits(['update:desde', 'update:hasta']);

const CAMPO =
  'h-9 rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 tabular-nums ' +
  'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
</script>

<template>
  <div class="inline-flex flex-wrap items-center gap-2" role="group" :aria-labelledby="`${idPrefijo}-label`">
    <span :id="`${idPrefijo}-label`" class="text-sm text-gray-500">Creado</span>
    <label :for="`${idPrefijo}-desde`" class="sr-only">Desde</label>
    <input
      :id="`${idPrefijo}-desde`"
      :value="desde"
      type="date"
      :class="CAMPO"
      title="Desde"
      @input="$emit('update:desde', $event.target.value)"
    >
    <span class="text-gray-500" aria-hidden="true">–</span>
    <label :for="`${idPrefijo}-hasta`" class="sr-only">Hasta</label>
    <input
      :id="`${idPrefijo}-hasta`"
      :value="hasta"
      type="date"
      :class="CAMPO"
      title="Hasta"
      @input="$emit('update:hasta', $event.target.value)"
    >
  </div>
</template>
