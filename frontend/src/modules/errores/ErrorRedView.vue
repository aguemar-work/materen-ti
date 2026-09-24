<script setup>
// Fallback de red/backend caído (ver core/error-red.js). No es una ruta:
// App.vue la superpone a la vista actual cuando una petición no llegó al
// servidor, y "Reintentar" repite esa misma petición sin perder el estado
// de la vista que quedó debajo (ej. un formulario ya completado).
// Por eso AppPortal va `superpuesto` (capa fija), no como página propia.
import { reintentarErrorRed } from '../../core/error-red.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';
</script>

<template>
  <AppPortal
    superpuesto
    titulo="Sin conexión con el servidor"
    icono="ti ti-wifi-off"
  >
    <p class="text-center text-sm text-gray-600">
      No se pudo conectar con el servidor. Verifique su conexión e intente
      nuevamente.
    </p>

    <AppButton
      class="mt-6"
      size="lg"
      block
      label="Reintentar"
      icon="ti ti-refresh"
      icon-pos="right"
      @click="reintentarErrorRed"
    />
  </AppPortal>
</template>
