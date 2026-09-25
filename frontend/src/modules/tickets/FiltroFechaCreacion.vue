<script setup>
// Filtro secundario "Fecha de creación" de la bandeja de Tickets.
//
// V2 (2026-09-25): un solo control agrupado de 32px — ícono + "Creado" +
// [desde] – [hasta] dentro de la misma caja —, en vez de dos inputs de fecha
// nativos sueltos con una etiqueta al costado. El rango es UN filtro, y así
// se lee: una sola caja, un solo foco. Los inputs internos van sin borde ni
// sombra propios (pisan los estilos base de main.css).
//
// El `v-model` es doble (desde/hasta) porque el consumidor lo limpia de una
// sola vez. El `idPrefijo` se conserva: los `id` tienen que ser únicos si
// alguna vez vuelve a montarse dos veces.
defineProps({
  desde: { type: String, default: '' },
  hasta: { type: String, default: '' },
  idPrefijo: { type: String, required: true },
});
defineEmits(['update:desde', 'update:hasta']);

const CAMPO =
  'h-full rounded-none border-0 bg-transparent px-1.5 text-sm text-gray-900 tabular-nums shadow-none ' +
  'hover:border-0 focus:outline-none focus:ring-0';
</script>

<template>
  <div
    class="inline-flex h-8 items-center rounded-md border border-gray-300 bg-white pr-1 shadow-xs transition-colors duration-150 hover:border-gray-400 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500"
    role="group"
    :aria-labelledby="`${idPrefijo}-label`"
  >
    <span :id="`${idPrefijo}-label`" class="inline-flex items-center gap-1.5 pl-2.5 pr-1 text-sm text-gray-500">
      <i class="ti ti-calendar" aria-hidden="true"></i>Creado
    </span>
    <label :for="`${idPrefijo}-desde`" class="sr-only">Desde</label>
    <input
      :id="`${idPrefijo}-desde`"
      :value="desde"
      type="date"
      :class="CAMPO"
      title="Desde"
      @input="$emit('update:desde', $event.target.value)"
    >
    <span class="text-gray-400" aria-hidden="true">–</span>
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
