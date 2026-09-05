<script setup>
// Tag de IBM Carbon v11 — la primitiva de "etiqueta de estado" del sistema.
//
// RECTANGULAR (casi), no píldora. En Carbon v11 el Tag es de esquinas
// redondeadas (12px, prácticamente una píldora); acá usa `--radius-sm`
// (4px), el mismo radio pequeño del resto de los elementos chicos del
// sistema (badges, chips). Sigue siendo una desviación deliberada del spec
// de Carbon, no un descuido — un tag en píldora entre botones e inputs de
// 6-8px se leería inconsistente, no como un matiz — pero ya no es "radio 0
// sin excepciones": esa regla se revisó el 2026-09-03 (ver
// docs/GUIA-UX-UI.md, "Revisión Modern Clean Enterprise"). Hoy la
// diferencia con Carbon es de escala (4px vs. 12px), no de geometría
// binaria (0 vs. redondeado).
//
// POR QUÉ LA API HABLA DE ROLES Y NO DE COLORES
// `variante` recibe el nombre SEMÁNTICO (`success`, `danger`, `sky`…), no
// el color de Carbon (`green`, `red`, `cyan`…). La razón es que todo el
// dominio ya habla ese idioma: `core/badges.js` y los `core/dominio-*.js`
// resuelven "estado de ticket" o "severidad de problema" a una clase
// `badge--X`, y son la fuente de verdad de qué significa cada color. Con
// una API de colores, cada sitio que hoy escribe `badgeInfo(...)` tendría
// que traducir, y dos tags del MISMO significado podrían terminar de
// colores distintos según quién tradujo. El color de Carbon que hay detrás
// de cada rol está en la tabla de abajo y en la guía; se cambia en un solo
// lugar (los tokens de main.css), no en cada llamada.
//
//   rol       Carbon Tag   significado en Sistema TI
//   success   green        operativo, resuelto, activo
//   warning   yellow       requiere rotación, por vencer
//   danger    red          P1, sin devolver, vencido
//   info      blue         abierto, informativo
//   neutral   gray         sin estado, cerrado, "otro"
//   purple    purple       prioridad alta
//   sky       cyan         tipo/clasificación (cuenta, ubicación)
//   teal      teal         prioridad media
//   accent    blue 20/70   contador, chip de identidad (no es un estado)
//
// RELACIÓN CON `.badge` Y `BadgeEstado.vue`
// Este componente es el motor de `BadgeEstado.vue` desde el 2026-09-02:
// `BadgeEstado` resuelve el DOMINIO (qué color le toca a "ticket cerrado")
// y delega el render acá. Dos props propias que la clase `.badge` no daba:
//   · `codigo` — el tag lleva un código, ID o serial y va en IBM Plex Mono
//     con tabular-nums, para que dos códigos uno debajo del otro se
//     comparen carácter por carácter.
//   · `punto` — punto sólido del color de soporte de Carbon
//     (support-success/warning/error), para un estado "vivo" en una tabla
//     densa. Reemplaza a la clase `.status`.
//
// `.badge` (main.css) sigue existiendo y la escriben a mano ~33 vistas que
// no pasan por `BadgeEstado`. Es la MISMA cosa en forma de clase y mide lo
// mismo (ver la nota de alto abajo); se retira en la Fase D del plan de
// convergencia, cuando esas vistas migren. No agregar nada a `.badge`
// mientras tanto: lo que le falte, va acá.
import { computed } from 'vue';

const props = defineProps({
  /**
   * Rol semántico. Ver la tabla de la cabecera. Se acepta también el nombre
   * de clase completo (`badge--success`) que devuelven los `core/dominio-*`,
   * para poder pasar `badgeInfo(...).clase` directo sin recortarlo.
   */
  variante: {
    type: String,
    default: 'neutral',
    // La cadena vacia se acepta a proposito: dos fallbacks de dominio
    // (`situacionInfo` en dominio-equipos.js y
    // `categoriaAccesoSensibleInfo` en dominio-accesos-sensibles.js)
    // devuelven `clase: ''` cuando el valor no esta en su mapa — pasa
    // cuando la base tiene un estado que el frontend todavia no conoce.
    // Cae a `neutral`: "no sabemos que es esto" reusa el gris que el
    // sistema ya tiene para eso, mismo criterio que `.avatar--neutro`.
    // Antes eso renderizaba un `.badge` sin modificador de color, o sea
    // texto suelto sin fondo — el estado desconocido era el unico que no
    // se veia como un estado.
    validator: (v) => v === '' || [
      'success', 'warning', 'danger', 'info', 'neutral',
      'purple', 'sky', 'teal', 'accent',
    ].includes(String(v).replace('badge--', '')),
  },
  /** Monoespaciada + tabular-nums: códigos de ticket, DNI, seriales, IDs. */
  codigo: { type: Boolean, default: false },
  /**
   * Punto sólido del color de soporte, para estados "vivos"
   * (Activo/Inactivo/Suspendido, requiere rotación). Equivale a la clase
   * `.status` de main.css, pero con el color de soporte de Carbon en vez
   * de `currentColor`: el punto pesa más que el texto y se ve antes.
   */
  punto: { type: Boolean, default: false },
});

const rol = computed(() => props.variante.replace('badge--', '') || 'neutral');
</script>

<template>
  <span
    class="cds-tag"
    :class="[`cds-tag--${rol}`, { 'cds-tag--codigo': codigo, 'cds-tag--punto': punto }]"
  >
    <span v-if="punto" class="cds-tag__punto" aria-hidden="true"></span>
    <slot />
  </span>
</template>

<style scoped>
/* 24px de alto y 8px de gutter: las medidas del Tag `md` de Carbon (su
   escala publica es 18 / 24 / 32; 24 es la que corresponde a una celda de
   tabla de 32px). Es tambien el alto que `.badge` de main.css ya renderiza
   hoy — 12px de texto en una caja de linea de 20px mas 2+2 de padding —,
   asi que mientras las dos implementaciones convivan (hasta que `.badge`
   se retire) un tag y un badge miden lo mismo y nadie nota cual lo pinto. */
.cds-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  height: var(--space-9);
  padding: 0 var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--fs-label-01);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  max-width: 100%;
}

/* IBM Plex Mono + tabular-nums. El peso baja a 400: a 12px la
   monoespaciada en 600 se cierra y un código deja de leerse carácter por
   carácter, que es justo lo único que se le pide. */
.cds-tag--codigo {
  font-family: var(--font-mono);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Punto de estado ──────────────────────────────────────────
   Usa el color SÓLIDO de soporte de Carbon, no el color de texto del tag:
   son dos roles distintos. `--color-warning` es Yellow 30 (#f1c21b), que
   no sirve como texto en ningún tema pero es exactamente el color del
   indicador; el texto del tag amarillo sigue siendo Yellow 70. Los roles
   sin color de soporte propio (sky, teal, purple, neutral) caen a
   `currentColor`, que es el comportamiento de `.status`. */
.cds-tag__punto {
  width: var(--space-3);
  height: var(--space-3);
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.cds-tag--success .cds-tag__punto { background: var(--color-success); }
.cds-tag--warning .cds-tag__punto { background: var(--color-warning); }
.cds-tag--danger .cds-tag__punto { background: var(--color-danger); }
.cds-tag--info .cds-tag__punto,
.cds-tag--accent .cds-tag__punto { background: var(--color-accent); }

/* ── Variantes ────────────────────────────────────────────────
   Cada par sale de los `tag-*` de Carbon (paso 20 de fondo, 70 de texto en
   claro; 70/20 en oscuro), verificados en scripts/contraste.mjs. */
.cds-tag--success { background: var(--color-success-bg); color: var(--color-success-text); }
.cds-tag--warning { background: var(--color-warning-bg); color: var(--color-warning-text); }
.cds-tag--danger  { background: var(--color-danger-bg);  color: var(--color-danger-text); }
.cds-tag--info    { background: var(--color-info-bg);    color: var(--color-info-text); }
.cds-tag--neutral { background: var(--color-neutral-bg); color: var(--color-neutral-text); }
.cds-tag--purple  { background: var(--color-purple-bg);  color: var(--color-purple-text); }
.cds-tag--sky     { background: var(--color-sky-bg);     color: var(--color-sky-text); }
.cds-tag--teal    { background: var(--color-teal-bg);    color: var(--color-teal-text); }
.cds-tag--accent  { background: var(--color-accent-subtle); color: var(--color-accent-text); }
</style>
