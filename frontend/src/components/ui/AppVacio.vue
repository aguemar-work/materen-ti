<script setup>
// Estado vacío. `variante`:
//   pagina   — mensaje centrado en la hoja con una acción de salida.
//   seccion  — compacto, dentro de una AppSeccion.
// El slot default lleva la acción que resuelve el vacío (ej. "Agregar").
defineProps({
  titulo: { type: String, required: true },
  mensaje: { type: String, default: '' },
  icono: { type: String, default: 'ti ti-inbox' },
  variante: { type: String, default: 'pagina', validator: (v) => ['pagina', 'seccion'].includes(v) },
});
</script>

<template>
  <div
    v-if="variante === 'pagina'"
    class="flex min-h-64 flex-1 flex-col items-center justify-center px-6 py-12 text-center"
  >
    <span class="mb-4 text-3xl text-gray-500">
      <i :class="icono" aria-hidden="true"></i>
    </span>
    <h2 class="text-base font-semibold text-gray-900">{{ titulo }}</h2>
    <p v-if="mensaje" class="mt-2 max-w-sm text-sm leading-relaxed text-gray-600">{{ mensaje }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
  <div v-else class="px-4 py-8 text-center">
    <p class="text-sm font-medium text-gray-900">{{ titulo }}</p>
    <p v-if="mensaje" class="mt-1 text-sm text-gray-500">{{ mensaje }}</p>
    <div v-if="$slots.default" class="mt-4"><slot /></div>
  </div>
</template>
