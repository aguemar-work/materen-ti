<script setup>
// Marco común de los bloques del Inicio (el feed y los tres paneles
// laterales): hoja con borde de 1 px, cabecera de 32 px con el rótulo de
// expediente (regla 16) y, a la derecha, un conteo o una acción en texto. El
// cuerpo es una lista de filas de libro (regla 18): lo pone cada bloque.
import { useId } from 'vue';

defineProps({
  titulo: { type: String, required: true },
  conteo: { type: [Number, String], default: null },
});

const idTitulo = useId();
</script>

<template>
  <section class="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white" :aria-labelledby="idTitulo">
    <header class="flex min-h-8 items-center justify-between gap-3 border-b border-gray-200 px-3 py-1">
      <h2 :id="idTitulo" class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ titulo }}</h2>
      <span v-if="conteo != null" class="text-xs tabular-nums text-gray-500">{{ conteo }}</span>
      <slot name="acciones" />
    </header>
    <slot />
  </section>
</template>
