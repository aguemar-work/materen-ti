<script setup>
// Aviso fijo de una categoría/subcategoría de ticket (migración 114): lo ve el
// solicitante al elegirla (portal público y formulario interno) y el técnico
// en el contexto del ticket. Es una advertencia que pide algo a quien lee
// ("adjunte la autorización..."), así que lleva el tono `accion` del mapa único
// (core/tonos.js, regla 24): fondo ámbar tenue e ícono ámbar; el texto va en
// gray-900 porque es un párrafo, no una etiqueta. Sin borde lateral (regla 7),
// sin azul (regla 17) y sin animación: aparece y desaparece con el selector.
// El texto es plano (CHECK en la base): se respetan sus saltos de línea.
import { TONOS } from '../../core/tonos.js';

defineProps({
  texto: { type: String, required: true },
});

const CLASES_ACCION = TONOS.accion.tag.split(' ');
const FONDO = CLASES_ACCION.find((c) => c.startsWith('bg-'));
const TINTA_ICONO = CLASES_ACCION.find((c) => c.startsWith('text-'));
</script>

<template>
  <div
    class="flex items-start gap-2 rounded-md px-3 py-2.5 text-sm text-gray-900"
    :class="FONDO"
    role="note"
    data-aviso-categoria
  >
    <i class="ti ti-alert-triangle mt-0.5 shrink-0 text-base" :class="TINTA_ICONO" aria-hidden="true"></i>
    <p class="min-w-0 flex-1 whitespace-pre-line">{{ texto }}</p>
  </div>
</template>
