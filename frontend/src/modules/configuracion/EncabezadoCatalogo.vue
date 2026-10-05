<script setup>
// Encabezado compacto de una sección de Configuración (receta 4.4 de
// docs/SISTEMA-DISENO.md): el título grande de la página ya lo pone
// ConfiguracionView ("Configuración"), así que cada catálogo lleva un h2 con
// su conteo, una línea que explica para qué sirve y su acción principal a la
// derecha (el único botón sólido de la pantalla).
// Lo usan los 4 paneles de este módulo y EmpresasView/PlataformasView, que
// se renderizan dentro de Configuración. Candidato a components/ui/ si otra
// pantalla de catálogos lo necesita.
defineProps({
  titulo: { type: String, required: true },
  conteo: { type: [Number, String], default: null },
  descripcion: { type: String, default: '' },
});
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <h2 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-900">
        {{ titulo }}
        <span
          v-if="conteo != null"
          class="rounded-full bg-gray-100 px-2 text-xs font-medium leading-5 text-gray-600 tabular-nums"
        >{{ conteo }}</span>
      </h2>
      <p v-if="descripcion" class="mt-0.5 max-w-prose text-sm text-gray-500">{{ descripcion }}</p>
    </div>
    <div v-if="$slots.acciones" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="acciones" />
    </div>
  </div>
</template>
