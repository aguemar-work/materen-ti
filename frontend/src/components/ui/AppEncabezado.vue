<script setup>
// Encabezado de página del sistema nuevo (rediseño 2026-09-22): título
// grande, subtítulo que dice QUÉ se está viendo (conteo, filtro activo) y
// acciones a la derecha. Opcionalmente un enlace "volver" arriba, para
// páginas de detalle. Reemplaza a components/shared/PageHeader.vue en las
// vistas rediseñadas. Ver docs/SISTEMA-DISENO.md.
defineProps({
  titulo: { type: String, required: true },
  subtitulo: { type: String, default: '' },
  // Texto del enlace de retorno (ej. "Empleados"). Sin él, no se muestra.
  volverLabel: { type: String, default: '' },
});
defineEmits(['volver']);
</script>

<template>
  <header class="px-4 pb-4 pt-5 sm:px-6">
    <button
      v-if="volverLabel"
      type="button"
      class="-ml-1 mb-2 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      @click="$emit('volver')"
    >
      <i class="ti ti-arrow-left" aria-hidden="true"></i>
      {{ volverLabel }}
    </button>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 class="text-2xl font-semibold tracking-tight text-gray-900">{{ titulo }}</h1>
          <slot name="junto-titulo" />
        </div>
        <p v-if="subtitulo || $slots.subtitulo" class="mt-1 text-sm text-gray-500">
          <slot name="subtitulo">{{ subtitulo }}</slot>
        </p>
      </div>
      <div v-if="$slots.acciones" class="flex flex-wrap items-center gap-2">
        <slot name="acciones" />
      </div>
    </div>
  </header>
</template>
