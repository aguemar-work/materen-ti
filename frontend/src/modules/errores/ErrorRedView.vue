<script setup>
// Fallback de red/backend caído (ver core/error-red.js). No es una ruta:
// App.vue la superpone a la vista actual cuando una petición no llegó al
// servidor, y "Reintentar" repite esa misma petición sin perder el estado
// de la vista que quedó debajo (ej. un formulario ya completado).
import { reintentarErrorRed } from '../../core/error-red.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
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

      <CarbonButton variante="primary" icono="ti-refresh" ancho @click="reintentarErrorRed">
        Reintentar
      </CarbonButton>
    </div>
  </div>
</template>

<style scoped>
.error-red {
  position: fixed;
  inset: 0;
  z-index: 900;
}

.error-red-icon {
  font-size: var(--icon-lg);
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.error-red-title {
  font-size: var(--fs-heading-02);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.error-red-texto {
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 16px;
}

</style>
