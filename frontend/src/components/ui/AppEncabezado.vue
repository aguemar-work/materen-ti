<script setup>
// Encabezado de página: título, subtítulo que dice QUÉ se está viendo
// (conteo, filtro activo) y acciones a la derecha. Ver
// docs/SISTEMA-DISENO.md §4.
//
// V2 (2026-09-25): el "dónde estoy" lo dicen las migas de la barra de la
// hoja (AppLayout.vue), así que el enlace "← Volver" que tenía esta cabecera
// se retiró — repetía exactamente la miga del módulo, una línea más arriba.
defineProps({
  titulo: { type: String, required: true },
  subtitulo: { type: String, default: '' },
});
</script>

<template>
  <header class="px-4 pb-5 pt-6 sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
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
