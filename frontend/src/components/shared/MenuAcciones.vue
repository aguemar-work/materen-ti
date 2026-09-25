<script setup>
// Menú contextual "⋮" compartido (patrón mobile, jul 2026). Condensa
// acciones por fila (tarjetas móviles) o botones de toolbar que no caben en
// pantallas angostas.
//
// Reescrito 2026-09-07 sobre AppMenu (primevue/menu, Unstyled + Tailwind —
// ver components/ui/AppMenu.vue): posicionamiento del panel, foco por
// teclado (flechas/Home/End/Enter/Escape), cierre por click-afuera/scroll/
// resize y devolución de foco al trigger al cerrar con Escape los resuelve
// PrimeVue Menu — ya no usePopoverFlotante (usado antes acá, sigue vivo en
// NotificacionesCampana.vue, no se tocó ese archivo).
//
// La API PÚBLICA de este componente no cambió: mismas props, mismo slot
// #trigger, mismo comportamiento visible desde afuera. Los 5 usos
// existentes (Licencias, Equipos, Empleados...) no necesitan tocarse.
import { computed, ref } from 'vue';
import AppMenu from '../ui/AppMenu.vue';

// Raíz múltiple (botón + AppMenu, que a su vez teletransporta su panel a
// <body> vía appendTo, igual que antes): los attrs del padre (class, etc.)
// se aplican explícitamente al botón disparador.
defineOptions({ inheritAttrs: false });

const props = defineProps({
  // [{ icono, label, danger?, disabled?, visible?, separador?, onClick }]
  // visible: false omite el ítem (condiciones por fila);
  // separador: true dibuja una línea divisoria en lugar de un ítem.
  acciones: { type: Array, required: true },
  // Etiqueta accesible del botón disparador (y del <ul role="menu">).
  label: { type: String, default: 'Acciones' },
  icono: { type: String, default: 'ti-dots-vertical' },
  // Texto visible junto al icono; con texto el trigger es un botón de texto (toolbar),
  // sin texto usa .icon-btn (fila de tabla/tarjeta).
  // Con el slot #trigger no aplica ninguna de las dos: quien pasa el slot
  // se hace cargo del aspecto del boton (ver mas abajo).
  texto: { type: String, default: '' },
});

// Trigger con texto (toolbar): mismo aspecto que AppButton variant="text"
// severity="secondary" — antes usaba la clase provisional `.btn`.
const CLASE_CON_TEXTO =
  'inline-flex h-9 items-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-gray-600 ' +
  'transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

// Traducción a la forma nativa de MenuItem de PrimeVue — la única pieza
// custom es `danger` (no es un campo de PrimeVue); pt/menu.pt.js lo lee vía
// el `context` que Menu pasa a cada ítem, ver ese archivo.
const items = computed(() => props.acciones.map((a) => (
  a.separador
    ? { separator: true }
    : {
        label: a.label,
        icon: a.icono ? `ti ${a.icono}` : undefined,
        disabled: a.disabled,
        visible: a.visible,
        danger: a.danger,
        // Menu ya se cierra solo al ejecutar un ítem (comportamiento propio
        // de PrimeVue) — `abierto = false` acá es la MISMA actualización,
        // solo que explícita, para no depender únicamente del evento @hide
        // (ver nota más abajo sobre por qué).
        command: () => { a.onClick?.(); abierto.value = false; },
      }
)));

const appMenu = ref(null);
// No se deriva SOLO de @show/@hide (evento que Menu emite recién cuando
// termina su transición de entrada/salida): alternar()/un ítem ejecutado
// actualizan `abierto` en el momento, así aria-expanded refleja la acción
// real sin depender de esa animación. @hide sigue escuchado abajo como red
// de seguridad para el único caso que no iniciamos nosotros: cerrar por
// click afuera, Escape o Tab (ahí si hace falta el eco de Menu).
const abierto = ref(false);

function alternar(event) {
  const abriendo = !abierto.value;
  appMenu.value?.toggle(event);
  abierto.value = abriendo;
}
</script>

<template>
  <button
    v-bind="$attrs"
    :class="$slots.trigger ? null : (texto ? CLASE_CON_TEXTO : 'icon-btn')"
    type="button"
    :aria-label="label"
    aria-haspopup="menu"
    :aria-expanded="abierto"
    :title="texto ? undefined : label"
    @click.stop="alternar"
  >
    <slot name="trigger">
      <i class="ti" :class="icono" aria-hidden="true"></i>
      <template v-if="texto">{{ texto }}</template>
    </slot>
  </button>
  <AppMenu ref="appMenu" :model="items" :aria-label="label" @show="abierto = true" @hide="abierto = false" />
</template>
