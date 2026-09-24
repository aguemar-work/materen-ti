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
//
// "Botón que navega" (2026-09-24): con `to` renderiza un `RouterLink` y con
// `href` un `<a>` nativo, con las MISMAS clases del preset (pt/button.pt.js)
// — la semántica correcta de algo que lleva a otra página es un enlace
// (clic medio, "abrir en pestaña nueva", lector de pantalla), no un
// `<button>` con `router.push`. Sin `to`/`href` el componente es idéntico
// al de antes: `primevue/button`, misma API.
import { computed, useAttrs } from 'vue';
import { RouterLink } from 'vue-router';
import PrimeButton from 'primevue/button';
import { buildButtonPT } from './pt/button.pt.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  label: { type: String, default: '' },
  // Clase de ícono a mostrar, completa ('ti ti-check'). La iconografía del
  // sistema es Tabler (webfont, importado en main.js), pero el wrapper
  // recibe la clase entera y no asume la librería.
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
  // Destino de vue-router (string o objeto de ruta): renderiza RouterLink.
  to: { type: [String, Object], default: undefined },
  // URL externa/absoluta: renderiza <a href>. `target`/`rel` pasan por $attrs.
  href: { type: String, default: undefined },
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

// Modo enlace. Un <a> no tiene `disabled` nativo: se marca aria-disabled,
// se saca del orden de tabulación y se anula el puntero (el preset ya trae
// `disabled:*`, que en un <a> no aplica — por eso el estilo va explícito).
const esEnlace = computed(() => props.to !== undefined || props.href !== undefined);
const inhabilitado = computed(() => props.disabled || props.loading);
const claseEnlace = computed(() => [
  pt.value.root.class,
  'no-underline',
  inhabilitado.value ? 'pointer-events-none opacity-50' : '',
]);
const claseIcono = computed(() => [
  props.loading ? 'ti ti-loader-2' : props.icon,
  pt.value.icon.class,
]);
// `to` solo para RouterLink y `href` solo para <a>: un `href: undefined`
// que cae a RouterLink por fallthrough pisaría el href que él calcula.
const attrsEnlace = computed(() => ({
  ...restAttrs.value,
  ...(props.to !== undefined ? { to: props.to } : { href: props.href }),
  ...(inhabilitado.value ? { 'aria-disabled': 'true', tabindex: '-1' } : {}),
}));
</script>

<template>
  <component
    :is="to !== undefined ? RouterLink : 'a'"
    v-if="esEnlace"
    v-bind="attrsEnlace"
    :class="claseEnlace"
  >
    <i v-if="icon || loading" :class="claseIcono" aria-hidden="true"></i>
    <slot><span v-if="label" :class="pt.label.class">{{ label }}</span></slot>
  </component>
  <PrimeButton
    v-else
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
