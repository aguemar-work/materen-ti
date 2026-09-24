<script setup>
// Layout del portal público y de las páginas de error (receta 4.5 de
// docs/SISTEMA-DISENO.md): fondo gray-50, logo arriba, UNA card blanca
// centrada de `max-w-lg`, textos cortos, mucho aire. Pensado primero para
// un teléfono (360–600px): quien abre estas páginas es un empleado sin
// sesión, casi siempre desde el enlace que le llegó por WhatsApp.
//
// Reemplaza a components/shared/PublicBrand.vue (retirado) + las clases
// `.public-page`/`.public-card` de componentes.css. La marca sale de
// core/marca.js (alt del logo), igual que en el resto de la app.
//
// Contrato:
//   - `titulo` → el <h1> de la página, dentro de la card. Toda página del
//     portal tiene uno (slot `titulo` si necesita marcado propio). Slot
//     `antetitulo`: fila corta sobre el h1 (código + estado de un ticket).
//   - `seccion` → contexto corto bajo el logo ("Soporte de TI").
//   - `icono` + `tono` → círculo de estado sobre el título, para pantallas
//     de resultado (éxito, enlace vencido, sin conexión). Con ícono, el
//     encabezado se centra solo; `centrado` lo fuerza sin ícono.
//   - slot default → cuerpo de la card; slot `pie` → debajo de la card
//     (enlace "Volver a soporte"), fuera de la superficie blanca.
//   - `superpuesto` → capa fija sobre la vista actual (ErrorRedView: no es
//     una ruta, App.vue la monta encima para no perder el estado de abajo).
import { NOMBRE_PRODUCTO } from '../../core/marca.js';

defineProps({
  titulo: { type: String, default: '' },
  descripcion: { type: String, default: '' },
  seccion: { type: String, default: '' },
  icono: { type: String, default: '' },
  tono: {
    type: String,
    default: 'neutral',
    validator: (v) => ['neutral', 'primary', 'success', 'warning', 'danger'].includes(v),
  },
  centrado: { type: Boolean, default: false },
  superpuesto: { type: Boolean, default: false },
});

const TONOS = {
  neutral: 'bg-gray-100 text-gray-500',
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-green-50 text-green-600',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
};
</script>

<template>
  <div
    class="flex flex-col items-center bg-gray-50 px-4 py-8 sm:py-12"
    :class="superpuesto ? 'fixed inset-0 z-[60] overflow-y-auto' : 'min-h-dvh'"
  >
    <div class="my-auto w-full max-w-lg">
      <div class="mb-6 flex flex-col items-center gap-2 text-center">
        <img src="/logo_materen_sisti.svg" :alt="NOMBRE_PRODUCTO" class="block h-8 w-auto">
        <p v-if="seccion" class="text-sm text-gray-500">{{ seccion }}</p>
      </div>

      <component :is="superpuesto ? 'div' : 'main'" class="rounded-lg border border-gray-200 bg-white p-6 sm:p-8">
        <div
          v-if="titulo || $slots.titulo || icono"
          class="mb-6"
          :class="{ 'text-center': icono || centrado }"
        >
          <div v-if="$slots.antetitulo" class="mb-2 flex flex-wrap items-center gap-2" :class="{ 'justify-center': icono || centrado }">
            <slot name="antetitulo" />
          </div>
          <span
            v-if="icono"
            class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
            :class="TONOS[tono]"
          >
            <i :class="icono" aria-hidden="true"></i>
          </span>
          <h1 class="text-xl font-semibold tracking-tight text-gray-900 [overflow-wrap:anywhere]">
            <slot name="titulo">{{ titulo }}</slot>
          </h1>
          <p v-if="descripcion || $slots.descripcion" class="mt-1.5 text-sm text-gray-600 [overflow-wrap:anywhere]">
            <slot name="descripcion">{{ descripcion }}</slot>
          </p>
        </div>

        <slot />
      </component>

      <div v-if="$slots.pie" class="mt-6 flex flex-col items-center gap-3 text-center text-sm">
        <slot name="pie" />
      </div>
    </div>
  </div>
</template>
