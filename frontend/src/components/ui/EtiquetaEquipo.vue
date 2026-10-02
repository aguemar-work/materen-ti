<script setup>
// Etiqueta física de un equipo (plan de mejora §3.6): 50 × 25 mm, un QR que
// abre su hoja de vida, el código con `AppCodigo` y la empresa.
//
//   ┌──────────────────────────────┐
//   │ ▓▓▓▓▓▓▓   LAP-0142           │   QR de 18 mm (corrección de errores M)
//   │ ▓▓▓▓▓▓▓   Materen            │   que codifica `<origen>/e/<codigo>`
//   └──────────────────────────────┘
//
// El QR codifica SOLO esa URL con el código de inventario, que no es secreto:
// nunca un token, un id interno, la serie ni el nombre de una persona (ver
// QrEquipo.vue y core/qr.js). El código legible no se reemplaza: si la etiqueta
// se daña, el buscador abre el expediente por código.
//
// Sin borde ni sombra propios: el borde de guía (en pantalla) lo pone quien la
// coloca (la hoja de etiquetas).
import AppCodigo from './AppCodigo.vue';
import QrEquipo from './QrEquipo.vue';

defineProps({
  codigo: { type: String, required: true },
  empresa: { type: String, default: '' },
  /** Origen de la URL del QR; por defecto el del navegador (se inyecta en tests). */
  origen: { type: String, default: undefined },
});
</script>

<template>
  <div data-etiqueta class="flex h-[25mm] w-[50mm] shrink-0 items-center gap-[2mm] overflow-hidden bg-white p-[2mm] text-gray-900">
    <QrEquipo class="h-[18mm] w-[18mm] shrink-0" :codigo="codigo" :origen="origen" />
    <div class="min-w-0 flex-1">
      <p class="whitespace-nowrap text-[11pt] leading-tight"><AppCodigo :valor="codigo" titulo="Código de inventario" /></p>
      <p v-if="empresa" class="mt-[1mm] line-clamp-2 text-[6.5pt] leading-tight text-gray-700">{{ empresa }}</p>
    </div>
  </div>
</template>
