<script setup>
// Tag / pastilla de estado o categoría (escalón 3: fondo tenue sin borde).
// Para estados de dominio con su propio mapa (empleado, ticket, situación de
// equipo...) seguir usando components/shared/BadgeEstado.vue, que resuelve
// el tono desde core/badges.js. Este es para tags sueltos de una vista.
// Es además el ÚNICO render de tag del sistema: BadgeEstado se dibuja con
// este componente por dentro (desde el 2026-09-24 no quedan clases `.tag`/
// `.cds-tag` en styles/componentes.css). Un cambio de look va acá.
defineProps({
  tono: {
    type: String,
    default: 'neutral',
    validator: (v) => ['neutral', 'success', 'warning', 'danger', 'info', 'purple', 'sky', 'teal'].includes(v),
  },
  icono: { type: String, default: '' },
  punto: { type: Boolean, default: false },
});

const TONOS = {
  neutral: 'bg-gray-100 text-gray-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-primary-50 text-primary-700',
  purple: 'bg-violet-50 text-violet-700',
  sky: 'bg-sky-50 text-sky-700',
  teal: 'bg-teal-50 text-teal-700',
};
</script>

<template>
  <span class="inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded px-2 text-xs font-medium leading-none" :class="TONOS[tono]">
    <span v-if="punto" class="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
    <i v-if="icono" :class="icono" aria-hidden="true"></i>
    <slot />
  </span>
</template>
