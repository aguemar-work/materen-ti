<script setup>
// Página PÚBLICA (sin sesión): encuesta de satisfacción. El enlace llega
// resuelto (copiado por staff para WhatsApp, o desde el seguimiento) — el
// empleado no escribe ningún ID a mano, solo responde nivel + comentario.
// El formulario en sí vive en EncuestaSatisfaccionForm.vue, compartido con
// el bloque embebido de TicketSeguimientoView.vue (cuando el ticket ya está
// cerrado, no hace falta navegar hasta acá).
import { useRoute } from 'vue-router';
import PublicBrand from '../../components/shared/PublicBrand.vue';
import EncuestaSatisfaccionForm from './EncuestaSatisfaccionForm.vue';

const route = useRoute();
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Encuesta de satisfacción" />
      <EncuestaSatisfaccionForm :token="route.params.token" />
    </div>
  </div>
</template>
