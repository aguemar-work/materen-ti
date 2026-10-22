<script setup>
// Barra de filtros de un listado (V2, 2026-09-25): buscador, segmentados,
// selects y el "Limpiar" van en una sola línea de controles de 32px, entre
// el encabezado de la página y la tabla que filtran. Antes era el mismo
// <div> copiado a mano en cada vista; como componente, el espaciado de
// todos los listados es uno solo.
//
// Una sola línea desde `sm` (pedido del dueño, 2026-10-21), en este orden:
// buscador · Filtros (un solo menú, AppFiltros) · Limpiar · y a la derecha las
// vistas (`AppVistas en-barra class="ml-auto"`: no saltan cuando aparece
// Limpiar) y, si hay, el selector Tabla/Triage. Nunca se parte en dos filas:
// si no entra, las vistas se deslizan. En móvil cada pieza va en su fila.
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 px-4 pb-4 sm:flex-nowrap sm:px-6">
    <slot />
  </div>
</template>
