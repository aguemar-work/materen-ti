<script setup>
// Sección de contenido: card blanca con cabecera (título + conteo +
// acciones) y cuerpo. Es la unidad de composición de las páginas de detalle
// y del dashboard. `sinPadding` para cuerpos que son listas/tablas de borde
// a borde (filas con divide-y). Ver docs/SISTEMA-DISENO.md.
import { useId } from 'vue';

defineProps({
  titulo: { type: String, required: true },
  conteo: { type: [Number, String], default: null },
  descripcion: { type: String, default: '' },
  sinPadding: { type: Boolean, default: false },
  // Llena el alto de su contenedor: la cabecera queda fija y el cuerpo es una
  // columna flex que el consumidor reparte (ej. conversación con scroll
  // propio + composer abajo en el detalle de un ticket).
  llenar: { type: Boolean, default: false },
});

const idTitulo = useId();
</script>

<template>
  <section
    class="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs"
    :class="llenar ? 'flex min-h-0 flex-col' : ''"
    :aria-labelledby="idTitulo"
  >
    <div class="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
      <div class="min-w-0">
        <h2 :id="idTitulo" class="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {{ titulo }}
          <span
            v-if="conteo != null"
            class="rounded-full bg-gray-100 px-2 text-xs font-medium leading-5 text-gray-600 tabular-nums"
          >{{ conteo }}</span>
        </h2>
        <p v-if="descripcion" class="mt-0.5 text-xs text-gray-500">{{ descripcion }}</p>
      </div>
      <div v-if="$slots.acciones" class="flex min-w-0 flex-wrap items-center gap-1">
        <slot name="acciones" />
      </div>
    </div>
    <div :class="[sinPadding ? '' : 'p-4', llenar ? 'flex min-h-0 flex-1 flex-col' : '']">
      <slot />
    </div>
  </section>
</template>
