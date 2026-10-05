<script setup>
// Lista de datos etiqueta/valor (columna lateral de una ficha, resumen de
// un registro). `datos`: [{ label, valor, mono? }]. Un valor vacío se
// muestra como "Sin registrar" en gris — nunca un guion suelto ni un hueco.
// Para un valor con formato propio (enlace, tag) usar el slot `valor-<i>`.
defineProps({
  datos: { type: Array, required: true },
  columnas: { type: Number, default: 1 },
});
</script>

<template>
  <dl class="grid gap-x-6 gap-y-3 text-sm" :class="columnas === 2 ? 'sm:grid-cols-2' : ''">
    <div v-for="(dato, i) in datos" :key="dato.label" class="min-w-0">
      <dt class="text-xs text-gray-500">{{ dato.label }}</dt>
      <dd class="mt-0.5 min-w-0 break-words" :class="[dato.valor || $slots[`valor-${i}`] ? 'text-gray-900' : 'text-gray-500', { 'tabular-nums': dato.mono }]">
        <slot :name="`valor-${i}`">{{ dato.valor || 'Sin registrar' }}</slot>
      </dd>
    </div>
  </dl>
</template>
