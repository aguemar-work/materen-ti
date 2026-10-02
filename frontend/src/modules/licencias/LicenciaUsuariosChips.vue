<script setup>
// Chips de los empleados con asiento en una licencia: enlace a su ficha, botón
// para liberar el asiento y "+N" para ver el resto. Compartido por la tabla y
// las tarjetas móviles (`tarjeta` = chips un poco más altos, para el dedo).
defineProps({
  licencia: { type: Object, required: true },
  visibles: { type: Array, required: true },
  tarjeta: { type: Boolean, default: false },
});
const emit = defineEmits(['liberar', 'expandir']);
</script>

<template>
  <ul
    class="flex flex-wrap items-center gap-1.5"
    :class="tarjeta ? 'mt-3' : 'max-w-96'"
    :aria-label="`Usuarios de ${licencia.software}`"
  >
    <li
      v-for="(u, i) in visibles"
      :key="u.asignacion_id || i"
      class="inline-flex items-center gap-1 rounded-full bg-gray-100 pl-2.5 text-xs text-gray-700"
      :class="[tarjeta ? 'h-7 max-w-full' : 'h-6 max-w-40', u.asignacion_id ? 'pr-0.5' : 'pr-2.5']"
    >
      <RouterLink
        v-if="u.empleado_id"
        class="truncate hover:text-primary-600"
        :class="tarjeta ? '' : 'hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'"
        :to="`/empleados/${u.empleado_id}`"
      >{{ u.nombre }}</RouterLink>
      <span v-else class="truncate">{{ u.nombre }}</span>
      <button
        v-if="u.asignacion_id"
        class="flex shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :class="tarjeta ? 'h-6 w-6' : 'h-5 w-5 transition-colors'"
        type="button"
        :title="`Liberar asiento de ${u.nombre}`"
        :aria-label="`Liberar asiento de ${u.nombre}`"
        @click="emit('liberar', u)"
      >
        <i class="ti ti-x text-xs" aria-hidden="true"></i>
      </button>
    </li>
    <li v-if="licencia.usuarios.length > visibles.length">
      <button
        type="button"
        class="rounded-full px-2 text-xs font-medium text-gray-500 hover:bg-gray-100"
        :class="tarjeta ? 'h-7' : 'h-6 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'"
        :aria-label="`Ver los ${licencia.usuarios.length} usuarios de ${licencia.software}`"
        @click="emit('expandir')"
      >+{{ licencia.usuarios.length - visibles.length }}</button>
    </li>
  </ul>
</template>
