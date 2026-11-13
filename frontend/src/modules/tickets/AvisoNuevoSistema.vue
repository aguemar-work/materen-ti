<script setup>
// Aviso de la migración a Kapo TI (2026-11-13): la creación de tickets se
// cerró (edge function `tickets`, acción `crear` → `creacion_cerrada`) y quien
// quiera registrar uno nuevo debe ir a kapo.com.pe. Lo muestran el portal
// público (/soporte y /soporte/nuevo) y el formulario interno del staff.
// Mismo tratamiento visual que AvisoCategoria (tono `accion`, sin borde lateral
// ni azul); el texto es el pedido por TI, con el dominio como enlace.
import { TONOS } from '../../core/tonos.js';
import { ENLACE_NUEVO_SISTEMA } from '../../core/dominio-tickets.js';

const CLASES_ACCION = TONOS.accion.tag.split(' ');
const FONDO = CLASES_ACCION.find((c) => c.startsWith('bg-'));
const TINTA_ICONO = CLASES_ACCION.find((c) => c.startsWith('text-'));
</script>

<template>
  <div
    class="flex items-start gap-2 rounded-md px-3 py-3 text-sm font-semibold text-gray-900"
    :class="FONDO"
    role="note"
    data-aviso-nuevo-sistema
  >
    <i class="ti ti-alert-triangle mt-0.5 shrink-0 text-base" :class="TINTA_ICONO" aria-hidden="true"></i>
    <p class="min-w-0 flex-1">
      POR FAVOR EL NUEVO ENLACE ES
      <a
        class="underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :href="ENLACE_NUEVO_SISTEMA"
        target="_blank"
        rel="noopener noreferrer"
      >kapo.com.pe</a>
      - Modulo TI
    </p>
  </div>
</template>
