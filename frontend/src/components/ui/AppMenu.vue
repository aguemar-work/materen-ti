<script setup>
// Wrapper estricto sobre primevue/menu — tercer caso real del patrón (ver
// AppButton.vue/AppTable.vue). Pensado ante todo para uso en modo `popup`
// (menú contextual "⋮" de fila/toolbar, ver MenuAcciones.vue), aunque nada
// impide usarlo inline (`popup=false`) si algún día hace falta.
//
// `model`: array nativo de MenuItem de PrimeVue — {label, icon, command,
// disabled, visible, separator, class, style, danger (custom, leído por
// pt/menu.pt.js para el color del ítem)}. No inventamos una forma propia:
// quien arma `model` (hoy, MenuAcciones.vue) es responsable de esa
// traducción, así este wrapper no sabe nada de "acciones" ni de dominio.
//
// Por qué exponer toggle/show/hide con defineExpose: en modo popup, Menu no
// tiene disparador propio — quien lo usa arma SU botón y llama
// `ref.toggle(event)` al clickearlo (mismo patrón documentado en el propio
// Menu.vue de PrimeVue). Reenviamos los tres directo al ref interno en vez
// de reimplementarlos.
import { computed, ref, useAttrs } from 'vue';
import PrimeMenu from 'primevue/menu';
import { twMerge } from 'tailwind-merge';
import { buildMenuPT } from './pt/menu.pt.js';

defineOptions({ inheritAttrs: false });

defineProps({
  model: { type: Array, required: true },
  popup: { type: Boolean, default: true },
  appendTo: { type: [String, Object], default: 'body' },
  // Nombre accesible del <ul role="menu">. Prop explícita (no vía $attrs):
  // un aria-label suelto en $attrs caería en el elemento raíz (el div
  // contenedor), no en el <ul> que de verdad lo necesita — PrimeVue Menu lo
  // resuelve internamente solo si se lo pasamos como prop.
  ariaLabel: { type: String, default: null },
});

defineEmits(['show', 'hide']);

const attrs = useAttrs();
const restAttrs = computed(() => {
  const { class: _class, ...resto } = attrs;
  return resto;
});
const pt = computed(() => {
  const base = buildMenuPT();
  return { ...base, root: { class: twMerge(base.root.class, attrs.class) } };
});

const menuRef = ref(null);
defineExpose({
  toggle: (event, target) => menuRef.value?.toggle(event, target),
  show: (event, target) => menuRef.value?.show(event, target),
  hide: () => menuRef.value?.hide(),
});
</script>

<template>
  <PrimeMenu
    ref="menuRef"
    :model="model"
    :popup="popup"
    :append-to="appendTo"
    :aria-label="ariaLabel"
    :pt="pt"
    v-bind="restAttrs"
    @show="$emit('show')"
    @hide="$emit('hide')"
  />
</template>
