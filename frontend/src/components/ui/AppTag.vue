<script setup>
// Tag / pastilla de estado o categoría (escalón 3: fondo tenue sin borde).
// Para estados de dominio con su propio mapa (empleado, ticket, situación de
// equipo...) seguir usando components/shared/BadgeEstado.vue, que resuelve
// el tono desde core/badges.js. Este es para tags sueltos de una vista.
// Es además el ÚNICO render de tag del sistema: BadgeEstado se dibuja con
// este componente por dentro. Un cambio de look va acá.
// V2: 20px de alto (antes 24) — un tag acompaña al dato, no compite con él.
//
// Los colores NO se deciden acá: salen del mapa único de core/tonos.js
// (fondo 50 + texto 800, neutro gray-100 + gray-700). `tono` acepta tanto el
// nombre semántico (accion, trabajando, espera, ok, neutro, critico,
// categoria) como el histórico de siempre (warning, sky, purple, success,
// neutral, danger, teal); `info` (azul tenue) queda solo por compatibilidad:
// el azul es tinta, no estado (regla 17).
//
// `rango`: prioridad y severidad se escriben como rango, en mayúsculas
// semibold con tracking (regla 24); es lo que las separa de un estado neutro.
//
// `data-tag` es el gancho de styles/impresion.css: en papel un tag es texto
// con borde, sin depender del color.
import { clasesTag, NOMBRES_TONO } from '../../core/tonos.js';

defineProps({
  tono: {
    type: String,
    default: 'neutral',
    validator: (v) =>
      [...NOMBRES_TONO, 'neutral', 'success', 'warning', 'danger', 'info', 'purple', 'sky', 'teal'].includes(v),
  },
  icono: { type: String, default: '' },
  punto: { type: Boolean, default: false },
  rango: { type: Boolean, default: false },
});
</script>

<template>
  <span
    data-tag
    class="inline-flex h-5 max-w-full items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs leading-none"
    :class="[clasesTag(tono), rango ? 'font-semibold uppercase tracking-wider' : 'font-medium']"
  >
    <span v-if="punto" class="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
    <i v-if="icono" :class="icono" aria-hidden="true"></i>
    <slot />
  </span>
</template>
