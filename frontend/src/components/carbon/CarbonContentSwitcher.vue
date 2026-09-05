<script setup>
// ContentSwitcher de IBM Carbon v11 — grupo segmentado.
//
// QUÉ ABSORBE
// El sistema tenía TRES lenguajes distintos para "esto está seleccionado", en
// tres archivos, sin nada en común:
//
//   `.tnav-item--activo`            ListaVistas.vue (CSS global, fuera de main.css)
//   `.selector-vista__btn--activo`  SelectorVista.vue (scoped)
//   `.config-sidebar-item--activa`  ConfiguracionView.vue (scoped)
//
// Los tres resolvían lo mismo —tinte de acento de fondo + texto de acento— y
// los tres lo escribían por su cuenta. Carbon tiene dos patrones para esto y
// la diferencia entre ellos es real:
//
//   ContentSwitcher (este)  cambia QUÉ SE VE del mismo contenido: Tabla vs.
//                           Triage, Tabla vs. Tarjetas. Es un control, y por
//                           eso se comporta como un grupo de radios.
//   Tabs (CarbonTabs)       navega entre SECCIONES distintas: las pestañas de
//                           Configuración, las bandejas de Tickets.
//
// CUÁNDO USAR CUÁL: si al cambiar de opción cambia la URL, son Tabs. Si es
// la misma pantalla mirada de otra forma, es ContentSwitcher.
//
// LO QUE SORPRENDE DEL SPEC
// El segmento seleccionado de Carbon es un **relleno de gris invertido** —
// casi negro en tema claro, casi blanco en oscuro— con el texto al revés. No
// es un tinte de acento. Es deliberado en Carbon: el azul está reservado a
// "acción" y a "foco", y un segmento seleccionado no es ninguna de las dos —
// es un estado. Usar acento acá le quita al acento su significado.
// El par usa --color-bg-inverse / --color-text-inverse, que existen
// exactamente para esto (ver la nota de esos tokens en main.css).
import { computed } from 'vue';

const props = defineProps({
  /** [{ valor, label, icono?, contador?, titulo? }] */
  opciones: { type: Array, required: true },
  modelValue: { type: [String, Number], default: null },
  /** sm (32px) | md (40px) | lg (48px). */
  tam: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
  /** Solo íconos, sin etiqueta. Cada opción necesita su `titulo` como nombre accesible. */
  soloIcono: { type: Boolean, default: false },
  /** Nombre accesible del grupo entero. */
  etiqueta: { type: String, required: true },
});

const emit = defineEmits(['update:modelValue']);

// `role="group"` + `aria-pressed` por botón, no `role="tablist"`: no hay
// paneles asociados que un `tab` deba controlar (`aria-controls`), y anunciar
// "pestaña" sin panel confunde más de lo que ayuda. Carbon usa tablist en su
// ContentSwitcher porque su API sí exige los paneles; acá el consumidor solo
// cambia cómo se pinta la misma lista.
const seleccionada = computed(() => props.modelValue);
</script>

<template>
  <div class="cds-switcher" :class="[`cds-switcher--${tam}`, { 'cds-switcher--icono': soloIcono }]" role="group" :aria-label="etiqueta">
    <button
      v-for="op in opciones"
      :key="op.valor"
      class="cds-switcher__btn"
      :class="{ 'cds-switcher__btn--activo': op.valor === seleccionada }"
      type="button"
      :aria-pressed="op.valor === seleccionada"
      :title="op.titulo || (soloIcono ? op.label : null)"
      :aria-label="soloIcono ? (op.titulo || op.label) : null"
      @click="emit('update:modelValue', op.valor)"
    >
      <i v-if="op.icono" class="ti cds-switcher__icono" :class="op.icono" aria-hidden="true"></i>
      <span v-if="!soloIcono" class="cds-switcher__label">{{ op.label }}</span>
      <span v-if="op.contador != null && !soloIcono" class="cds-switcher__contador">{{ op.contador }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Los segmentos van AL RAS, compartiendo borde: es un control, no una fila de
   botones. El `margin-left: -1px` colapsa el borde entre vecinos para que la
   línea divisoria sea de 1px y no de 2. */
.cds-switcher {
  display: inline-flex;
  max-width: 100%;
}

.cds-switcher__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: 0 var(--space-7);
  background: transparent;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-base);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
  letter-spacing: var(--cds-body-01-ls);
  white-space: nowrap;
  transition: background 0.11s, color 0.11s;
}

.cds-switcher__btn + .cds-switcher__btn {
  margin-left: -1px;
}

.cds-switcher--sm .cds-switcher__btn { min-height: var(--space-10); }
.cds-switcher--md .cds-switcher__btn { min-height: var(--space-11); }
.cds-switcher--lg .cds-switcher__btn { min-height: var(--space-12); }

/* Solo-ícono: cuadrado, y el ícono manda. */
.cds-switcher--icono .cds-switcher__btn {
  padding: 0;
  aspect-ratio: 1;
}

.cds-switcher__icono {
  font-size: var(--icon-sm);
}

.cds-switcher__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.cds-switcher__contador {
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-label-01);
  opacity: 0.75;
}

.cds-switcher__btn:hover:not(.cds-switcher__btn--activo) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* El foco va por encima de los vecinos: con los bordes colapsados, un
   outline inset de un segmento del medio quedaría tapado por el borde del
   de al lado sin este z-index. */
.cds-switcher__btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
  position: relative;
  z-index: 1;
}

/* Seleccionado: relleno de gris invertido, no tinte de acento (ver la
   cabecera). El borde acompaña al fondo para que el segmento se lea como un
   bloque sólido y no como una caja pintada por dentro. */
.cds-switcher__btn--activo {
  background: var(--color-bg-inverse);
  border-color: var(--color-bg-inverse);
  color: var(--color-text-inverse);
  position: relative;
  z-index: 1;
}
</style>
