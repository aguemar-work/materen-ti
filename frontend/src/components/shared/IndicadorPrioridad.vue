<script setup>
// Prioridad de ticket en 4 niveles con color propio cada uno (rediseño
// Materen, Fase 1 — kit de componentes, sep 2026).
//
// Historia corta: en el rediseño de tabla (ago 2026) Prioridad dejó de ser
// una píldora para no sumar una tercera píldora de color por fila junto a
// Estado y Categoría — y en esa pasada baja y media se dejaron SIN color
// (punto gris + texto terciario), asumiendo que "el caso mayoritario no pide
// atención". El efecto real fue que baja y media quedaron indistinguibles
// entre sí: dos de los cuatro niveles de la escala no se leían.
//
// Reparto actual — peso visual proporcional al significado (principio nuevo
// en GUIA-UX-UI.md):
//   baja    → punto + texto sky   (tratamiento liviano, color propio)
//   media   → punto + texto teal  (mismo teal que "Media" de severidad en
//                                  Problemas: refuerza una asociación que el
//                                  sistema ya tenía)
//   alta    → badge purple  (fondo tenue + texto, sin punto)
//   urgente → badge danger  (fondo tenue + texto, sin punto)
//
// Alta y urgente escalan a badge completo: mismo peso que un badge de Estado,
// para que el salto de "informativo" a "accionable" se lea de un vistazo. Ya
// no llevan punto — el fondo tenue ES la señal, un punto encima sería
// redundante.
//
// El vocabulario de color del dominio no cambia: sky/teal/purple/danger son
// los mismos tokens que ya usa PRIORIDADES_TICKET para la vía de <Badge>
// (core/badges.js), que sigue existiendo aparte y no se toca acá.
import { computed } from 'vue';
import { prioridadInfo } from '../../core/dominio-tickets.js';

const props = defineProps({
  valor: { type: String, default: '' },
});

const info = computed(() => prioridadInfo(props.valor));

// Los dos niveles altos usan la clase base .badge de main.css en vez de .prio,
// y NO una copia de su padding/radio/tipografía acá: "mismo peso visual que un
// badge de Estado" es el requisito, así que compartir el box es la forma
// correcta de cumplirlo — una copia se despega la primera vez que .badge
// cambie. Lo único propio de prioridad es el par de color (.prio--alta /
// .prio--urgente, abajo).
const NIVELES_BADGE = ['alta', 'urgente'];
const clases = computed(() => [
  NIVELES_BADGE.includes(props.valor) ? 'badge' : 'prio',
  `prio--${props.valor}`,
]);
</script>

<template>
  <span :class="clases">{{ info.label }}</span>
</template>

<style>
/* Global (sin scoped) a propósito: lo usan la tabla, la tarjeta angosta de
   Triage y la tarjeta móvil de Tickets — mismo criterio que .tnav-item en
   ListaVistas.vue y .chip-filtro en main.css. */
.prio {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  white-space: nowrap;
  font-size: var(--fs-body-01);
}

/* Baja y media: tratamiento liviano (punto + texto), ahora con color propio
   en vez del gris neutro que las volvía indistinguibles entre sí.
   El punto es decorativo (::before, fuera del árbol de accesibilidad): el
   texto de la prioridad siempre está visible al lado, el color nunca es el
   único portador del significado (WCAG 1.4.1). */
.prio--baja::before,
.prio--media::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.prio--baja {
  color: var(--color-sky-text);
}

.prio--media {
  color: var(--color-teal-text);
}

/* Alta y urgente: solo el par de color. El box (padding, radio de píldora,
   --fs-label-01, peso 600) lo pone .badge, que el template agrega para estos dos
   niveles. Mismos pares que .badge--purple/.badge--danger, declarados acá y
   no reusando esas clases para que el mapa nivel→color de Prioridad viva en
   un solo archivo: este. */
.prio--alta {
  background: var(--color-purple-bg);
  color: var(--color-purple-text);
}

.prio--urgente {
  background: var(--color-danger-bg);
  color: var(--color-danger-text);
}
</style>
