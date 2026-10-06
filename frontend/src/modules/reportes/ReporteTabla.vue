<script setup>
// Tabla de la hoja de reporte: una `<table>` real con cabecera, densidad de
// libro (celdas px-3 py-2, cabecera de 32 px, `table-layout: fixed`) y sin
// bordes laterales. En papel imprime como tabla de líneas finas con la
// cabecera repetida por página (styles/impresion.css la reconoce por
// `data-libro`). Sin filas: UNA fila en gris con el texto de `vacio` (regla 21).
//
//   columnas: [{ titulo, num?, ancho? }]   num = alineado a la derecha, tabular
//   filas:    [[{ texto, num?, tenue?, codigo?, tag? }, ...]]   tag = tono de AppTag (una palabra de estado)
import AppTag from '../../components/ui/AppTag.vue';

defineProps({
  titulo: { type: String, default: '' },
  nota: { type: String, default: '' },
  columnas: { type: Array, required: true },
  filas: { type: Array, default: () => [] },
  vacio: { type: String, default: 'Sin datos en el período' },
});
</script>

<template>
  <div class="break-inside-avoid">
    <h3 v-if="titulo" class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ titulo }}</h3>
    <p v-if="nota" class="mb-2 text-xs text-gray-500">{{ nota }}</p>
    <table data-libro class="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr class="h-8 border-b border-gray-200">
          <th
            v-for="(col, i) in columnas"
            :key="i"
            scope="col"
            class="px-3 py-0 text-[11px] font-semibold uppercase tracking-wider text-gray-500"
            :class="[col.num ? 'text-right' : 'text-left', col.ancho || '']"
          >{{ col.titulo }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!filas.length" class="h-10 border-b border-gray-100">
          <td :colspan="columnas.length" class="px-3 py-2 text-gray-500">— {{ vacio }}</td>
        </tr>
        <tr v-for="(fila, i) in filas" :key="i" class="h-10 border-b border-gray-100">
          <td
            v-for="(c, j) in fila"
            :key="j"
            class="px-3 py-2 align-top [overflow-wrap:anywhere]"
            :class="[
              c.num ? 'text-right tabular-nums' : '',
              c.tenue ? 'text-gray-500' : 'text-gray-900',
              c.codigo ? 'font-medium tabular-nums' : '',
            ]"
          ><AppTag v-if="c.tag" :tono="c.tag">{{ c.texto }}</AppTag><template v-else>{{ c.texto }}</template></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
