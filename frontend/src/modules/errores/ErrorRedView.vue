<script setup>
// Fallback de red/backend caído (ver core/error-red.js). No es una ruta:
// App.vue la superpone a la vista actual cuando una petición no llegó al
// servidor, y "Reintentar" repite esa misma petición sin perder el estado
// de la vista que quedó debajo (ej. un formulario ya completado).
import { reintentarErrorRed } from '../../core/error-red.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';
</script>

<template>
  <div class="public-page error-red">
    <div class="card public-card">
      <PublicBrand subtitulo="Sin conexión" />

      <div class="error-red-icon"><i class="ti ti-wifi-off" aria-hidden="true"></i></div>
      <h2 class="error-red-title">Sin conexión con el servidor</h2>
      <p class="error-red-texto">
        No se pudo conectar con el servidor. Verifique su conexión e intente
        nuevamente.
      </p>

      <button type="button" class="btn btn--primary btn--ancho" @click="reintentarErrorRed">
        Reintentar
        <i class="ti ti-refresh" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>


