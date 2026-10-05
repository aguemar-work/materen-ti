<script setup>
// Página PÚBLICA (sin sesión): encuesta de satisfacción. El enlace llega
// resuelto (copiado por staff para WhatsApp, o desde el seguimiento) — el
// empleado no escribe ningún ID a mano, solo responde nivel + comentario.
// El formulario en sí vive en EncuestaSatisfaccionForm.vue, compartido con
// el bloque embebido de TicketSeguimientoView.vue (cuando el ticket ya está
// cerrado, no hace falta navegar hasta acá). El <h1> lo pone esta página;
// los títulos de cada estado del formulario son <h2> por debajo.
import { useRoute } from 'vue-router';
import AppPortal from '../../components/ui/AppPortal.vue';
import EncuestaSatisfaccionForm from './EncuestaSatisfaccionForm.vue';

const route = useRoute();
</script>

<template>
  <AppPortal seccion="Soporte técnico" titulo="Encuesta de satisfacción">
    <EncuestaSatisfaccionForm :token="route.params.token" />
  </AppPortal>
</template>
