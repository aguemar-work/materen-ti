<script setup>
// Avatar de iniciales del sistema nuevo. Tono e iniciales salen de
// core/avatar.js (mismo hash que el resto de la app: la misma persona tiene
// el mismo tono en todas las pantallas); acá solo se traduce ese tono a
// clases de Tailwind. Decorativo: el nombre ya está en el texto vecino, por
// eso va aria-hidden.
import { computed } from 'vue';
import { tonoAvatar, inicialesDe } from '../../core/avatar.js';

const props = defineProps({
  nombre: { type: String, default: '' },
  // sm 32px (tablas) · md 40px (tarjetas) · lg 56px · xl 64px (ficha)
  tamano: { type: String, default: 'sm', validator: (v) => ['sm', 'md', 'lg', 'xl'].includes(v) },
});

const TONOS = {
  'avatar--azul': 'bg-primary-50 text-primary-700',
  'avatar--slate': 'bg-slate-100 text-slate-700',
  'avatar--teal': 'bg-teal-50 text-teal-700',
  'avatar--violeta': 'bg-violet-50 text-violet-700',
  'avatar--arena': 'bg-orange-50 text-orange-800',
  'avatar--neutro': 'bg-gray-100 text-gray-500',
};
const TAMANOS = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-16 w-16 text-xl',
};

const clases = computed(() => [
  'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
  TONOS[tonoAvatar(props.nombre)] ?? TONOS['avatar--neutro'],
  TAMANOS[props.tamano],
]);
</script>

<template>
  <span :class="clases" aria-hidden="true">{{ inicialesDe(nombre) || '?' }}</span>
</template>
