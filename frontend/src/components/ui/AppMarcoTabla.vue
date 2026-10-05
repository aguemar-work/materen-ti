<script setup>
// Marco de la tabla de un LISTADO (V2 "marco + hoja", 2026-09-25).
//
// La tabla de un listado va a sangre dentro de la hoja blanca: de borde a
// borde, sin card propia, separada del encabezado y la barra de filtros por
// una línea. Antes era una card con borde dentro de una superficie gris que
// además se estiraba al alto de la ventana: con 3 filas quedaba una caja
// enorme y vacía, y el filtro flotaba lejos de lo que filtraba. Con la hoja
// ya blanca, una card adentro era un marco doble.
//
// Alto: NO se estira (sin flex-1). Con pocas filas mide lo que su
// contenido y la paginación queda pegada a la última fila; con muchas,
// `min-h-0` lo deja encoger dentro del contenedor del listado y el scroll
// pasa al hijo `overflow-auto` de la tabla — la cabecera y la paginación
// quedan quietas.
//
// Dónde vive: dentro del contenedor de contenido de la receta de listado
// (`px-4 pb-4 sm:px-6 sm:pb-6`, ver docs/SISTEMA-DISENO.md §4.1). Los
// márgenes negativos lo sacan de ese padding para llegar a los bordes de la
// hoja, y las celdas extremas recuperan el mismo padding para que el texto
// de la primera columna quede alineado con el título de la página.
</script>

<template>
  <div
    class="-mx-4 -mb-4 flex min-h-0 flex-col border-t border-gray-200 sm:-mx-6 sm:-mb-6
      [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4
      sm:[&_td:first-child]:pl-6 sm:[&_td:last-child]:pr-6 sm:[&_th:first-child]:pl-6 sm:[&_th:last-child]:pr-6
      [&>nav]:px-4 sm:[&>nav]:px-6"
  >
    <slot />
  </div>
</template>
