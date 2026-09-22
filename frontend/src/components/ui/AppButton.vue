<script setup>
// Wrapper estricto sobre primevue/button — patrón obligatorio para TODO
// componente de PrimeVue que entre al sistema: ninguna vista importa
// `primevue/*` directo, siempre pasa por components/ui/*.
//
// Por qué: PrimeVue está instalado en modo unstyled (main.js), así que
// `primevue/button` sin este wrapper se renderiza SIN estilo alguno. Este
// archivo es el único lugar que sabe qué clases de Tailwind corresponden a
// "botón primario", "botón de peligro", etc. — si esa decisión cambia
// (nuevo tamaño, nueva severidad), cambia acá una sola vez y toda la app la
// hereda, en vez de buscar cada `<Button>` suelto.
import { computed, useAttrs } from 'vue';
import PrimeButton from 'primevue/button';
import { buildButtonPT } from './pt/button.pt.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  label: { type: String, default: '' },
  // Clase de ícono a mostrar (agnóstico de librería: 'pi pi-check',
  // 'ti ti-check', etc.) — el sistema de iconografía todavía no está
  // decidido (ver docs/NOTAS-DISENO-ANTERIOR.md), así que este wrapper no
  // asume ninguna.
  icon: { type: String, default: undefined },
  iconPos: { type: String, default: 'left', validator: (v) => ['left', 'right', 'top', 'bottom'].includes(v) },
  severity: { type: String, default: 'primary', validator: (v) => ['primary', 'secondary', 'danger'].includes(v) },
  variant: { type: String, default: 'solid', validator: (v) => ['solid', 'outline', 'text'].includes(v) },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  // Ancho completo del contenedor — para botones de acción única en
  // formularios angostos o modales.
  block: { type: Boolean, default: false },
});

const attrs = useAttrs();

// `class` se funde a mano dentro del preset (ver button.pt.js); el resto de
// $attrs (id, aria-*, data-testid, listeners) sigue el fallthrough normal de
// Vue vía v-bind más abajo. Sin este split, PrimeVue recibiría la misma
// `class` dos veces (una por $attrs, otra por :pt) con orden de cascada
// impredecible.
const restAttrs = computed(() => {
  const { class: _class, ...resto } = attrs;
  return resto;
});

const pt = computed(() => buildButtonPT(props, attrs.class));
</script>

<template>
  <PrimeButton
    :label="label"
    :icon="icon"
    :icon-pos="iconPos"
    :type="type"
    :disabled="disabled || loading"
    :loading="loading"
    :pt="pt"
    v-bind="restAttrs"
  >
    <template v-if="$slots.default" #default>
      <slot />
    </template>
  </PrimeButton>
</template>
