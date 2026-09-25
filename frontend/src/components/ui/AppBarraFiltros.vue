<script setup>
// Barra de filtros de un listado (V2, 2026-09-25): buscador, segmentados,
// selects y el "Limpiar" van en una sola línea de controles de 32px, entre
// el encabezado de la página y la tabla que filtran. Antes era el mismo
// <div> copiado a mano en cada vista; como componente, el espaciado de
// todos los listados es uno solo.
//
// Lo que va a la derecha del todo (selector de vista Tabla/Tarjetas) lleva
// `class="ml-auto"` en el propio control, como hasta ahora.
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
    <slot />
  </div>
</template>
