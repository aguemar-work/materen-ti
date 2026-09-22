<script setup>
// Estado vacío. `variante`:
//   pagina   — ocupa el área de contenido (listado sin resultados), borde
//              punteado: se lee como "acá iría algo", no como una card rota.
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
    class="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center"
  >
    <span class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-2xl text-gray-400">
      <i :class="icono" aria-hidden="true"></i>
    </span>
    <h2 class="text-base font-semibold text-gray-900">{{ titulo }}</h2>
    <p v-if="mensaje" class="mt-1 max-w-sm text-sm text-gray-500">{{ mensaje }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
  <div v-else class="px-4 py-8 text-center">
    <p class="text-sm font-medium text-gray-900">{{ titulo }}</p>
    <p v-if="mensaje" class="mt-1 text-sm text-gray-500">{{ mensaje }}</p>
    <div v-if="$slots.default" class="mt-4"><slot /></div>
  </div>
</template>
