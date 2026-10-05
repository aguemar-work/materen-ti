<script setup>
// QR de un equipo como SVG: el dibujo que comparten la etiqueta física
// (EtiquetaEquipo.vue) y el acta imprimible (ActaView.vue, que lleva el mismo QR
// del equipo). Codifica `<origen>/e/<codigo>`: SOLO el código de inventario, que
// no es secreto (plan §3.6). Se genera en el navegador (core/qr.js), sin red.
//
// `data-qr-url` expone la URL codificada para los tests y para quien depure una
// etiqueta. Hereda el tamaño del contenedor: el llamador pone `h-* w-*`.
import { computed } from 'vue';
import { trazoQr, urlEtiqueta } from '../../core/qr.js';

const props = defineProps({
  codigo: { type: String, required: true },
  /** Origen de la URL; por defecto el del navegador (se inyecta en tests). */
  origen: { type: String, default: undefined },
});

const url = computed(() => urlEtiqueta(props.codigo, props.origen));
const qr = computed(() => trazoQr(url.value));
// Zona de silencio de 2 módulos alrededor: más estrecha que el ideal (4) para
// dejarle más módulos al QR en una etiqueta de 18 mm, y se lee bien.
const MARGEN = 2;
const lado = computed(() => qr.value.tamano + MARGEN * 2);
</script>

<template>
  <svg
    :viewBox="`${-MARGEN} ${-MARGEN} ${lado} ${lado}`"
    shape-rendering="crispEdges"
    role="img"
    :aria-label="`Código QR de ${codigo}`"
    :data-qr-url="url"
    :data-qr-tamano="qr.tamano"
  >
    <rect :x="-MARGEN" :y="-MARGEN" :width="lado" :height="lado" class="fill-white" />
    <path :d="qr.trazo" class="fill-gray-900" />
  </svg>
</template>
