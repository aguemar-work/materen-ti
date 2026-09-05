<script setup>
// Tabs de IBM Carbon v11 — navegación entre secciones.
//
// EL PAR DE CarbonContentSwitcher, Y LA DIFERENCIA IMPORTA
//   Tabs (este)      navega entre SECCIONES distintas: las 7 pestañas de
//                    Configuración, las bandejas de Tickets. Cada una tiene
//                    su propio contenido, y normalmente su propia URL.
//   ContentSwitcher  cambia CÓMO SE VE el mismo contenido: Tabla vs. Triage.
//
// Regla para elegir: **si al cambiar de opción cambia la URL, son Tabs.**
//
// Marca el seleccionado con una **línea inferior de 2px** en el acento, no
// con un relleno. Es la diferencia visual con el ContentSwitcher, y responde
// a que una pestaña es un rótulo sobre contenido —la línea la ata a lo que
// hay debajo— mientras que un segmento es un control.
//
// SOBRE EL MARCADO
// Dos modos, y no es un detalle de implementación:
//   · Con `to` en la opción renderiza `<RouterLink>` — una pestaña que
//     cambia la URL tiene que ser un ENLACE: se abre en pestaña nueva con
//     ctrl+clic, se copia, la lee un lector de pantalla como destino.
//     Es el caso de Configuración, que hoy usa `<button>` y pierde todo eso.
//   · Sin `to`, `<button role="tab">` con el contrato ARIA completo
//     (`aria-selected`, `aria-controls`), para el caso en memoria.
import { computed } from 'vue';

const props = defineProps({
  /** [{ valor, label, contador?, icono?, to? }] — con `to` la pestaña es un enlace. */
  opciones: { type: Array, required: true },
  modelValue: { type: [String, Number], default: null },
  /** Nombre accesible del conjunto. */
  etiqueta: { type: String, required: true },
  /** id del panel que las pestañas controlan (solo en modo botón). */
  panel: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue']);

// Un conjunto de pestañas es enlaces o botones, nunca mezclado: son dos
// contratos de accesibilidad distintos y mezclarlos deja al lector de
// pantalla anunciando "pestaña 1 de 3" para unas y "enlace" para otras.
const esNav = computed(() => props.opciones.some((o) => o.to));
</script>

<template>
  <div
    class="cds-tabs"
    :role="esNav ? 'navigation' : 'tablist'"
    :aria-label="etiqueta"
  >
    <template v-for="op in opciones" :key="op.valor">
      <RouterLink
        v-if="esNav"
        class="cds-tabs__item"
        active-class="cds-tabs__item--activo"
        :to="op.to"
      >
        <i v-if="op.icono" class="ti cds-tabs__icono" :class="op.icono" aria-hidden="true"></i>
        <span>{{ op.label }}</span>
        <span v-if="op.contador != null" class="cds-tabs__contador">{{ op.contador }}</span>
      </RouterLink>

      <button
        v-else
        class="cds-tabs__item"
        :class="{ 'cds-tabs__item--activo': op.valor === modelValue }"
        type="button"
        role="tab"
        :aria-selected="op.valor === modelValue"
        :aria-controls="panel || undefined"
        @click="emit('update:modelValue', op.valor)"
      >
        <i v-if="op.icono" class="ti cds-tabs__icono" :class="op.icono" aria-hidden="true"></i>
        <span>{{ op.label }}</span>
        <span v-if="op.contador != null" class="cds-tabs__contador">{{ op.contador }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
/* La línea de la fila entera va en el contenedor y la de la pestaña activa la
   tapa: así el borde inferior es continuo y la pestaña seleccionada se lee
   como un tramo de esa misma línea, no como una caja aparte. */
.cds-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border-subtle);
  overflow-x: auto;
  /* La barra de scroll horizontal en una fila de 40px se come la mitad del
     control; el scroll sigue funcionando con rueda y teclado. */
  scrollbar-width: none;
}

.cds-tabs::-webkit-scrollbar {
  display: none;
}

.cds-tabs__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  flex-shrink: 0;
  min-height: var(--space-11);
  padding: 0 var(--space-7);
  background: transparent;
  border: none;
  /* El borde de 2px existe desde el reposo, en transparente: si apareciera
     solo al seleccionar, la fila entera se movería 2px cada vez. */
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  border-radius: var(--radius-base);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
  letter-spacing: var(--cds-body-01-ls);
  text-decoration: none;
  white-space: nowrap;
  transition: border-color 0.11s, color 0.11s;
}

.cds-tabs__icono {
  font-size: var(--icon-sm);
}

.cds-tabs__contador {
  color: var(--color-text-tertiary);
  font-size: var(--fs-label-01);
  font-variant-numeric: tabular-nums;
}

.cds-tabs__item:hover {
  border-bottom-color: var(--color-border-strong);
  color: var(--color-text-primary);
}

.cds-tabs__item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

/* Activo: la línea en el acento y el texto en primario con peso. Tres
   señales, no solo el color — una pestaña seleccionada distinguida
   únicamente por su tono azul no se ve en escala de grises. */
.cds-tabs__item--activo {
  border-bottom-color: var(--color-accent);
  color: var(--color-text-primary);
  font-weight: 600;
}

.cds-tabs__item--activo .cds-tabs__contador {
  color: var(--color-text-secondary);
}
</style>
