<script setup>
// Sello de estado terminal (regla 15, "Versión Expediente"): una palabra en
// un recuadro, legible en pantalla, en papel y en blanco y negro.
//
//   · Escalón 2 de la escala de peso: solo borde de 1px del tono, SIN fondo,
//     `rounded-sm`, 11px `font-semibold uppercase tracking-wider`.
//   · Tonos: `neutro` (terminal neutro: DE BAJA), `ok` (CERRADO · conforme
//     30/09), `critico` (RECHAZADO, PERDIDO). Los demás tonos son de AppTag.
//   · Reservado a estados TERMINALES en carátulas e impresión. Un sello por
//     carátula, NUNCA en filas de tabla (ahí va AppTag).
//   · El texto va SIEMPRE: el color nunca es el único portador de significado
//     ("CERRADO · conforme 30/09", "BAJA 12/08/2026"). Texto = slot.
//
// PIEZA NUEVA, aún no adoptada por las pantallas. En impresión conserva el
// borde (styles/impresion.css lo reconoce por `data-sello`).
import { clasesSello } from '../../core/tonos.js';

defineProps({
  tono: {
    type: String,
    default: 'neutro',
    validator: (v) => ['neutro', 'ok', 'critico'].includes(v),
  },
});
</script>

<template>
  <span
    data-sello
    class="inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wider"
    :class="clasesSello(tono)"
  >
    <slot />
  </span>
</template>
