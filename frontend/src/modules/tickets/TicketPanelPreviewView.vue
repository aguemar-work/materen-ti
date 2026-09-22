<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TicketDetallePanel from './TicketDetallePanel.vue';

// Arnés de preview — solo-dev (ver ticket-panel-preview.routes.js). Único
// propósito: montar TicketDetallePanel.vue standalone, sin la lista al
// lado, para revisarlo visualmente antes de integrarlo al split-view real.
// No es parte del split-view en sí — eso todavía no existe.
const route = useRoute();
const router = useRouter();

// Input simple en vez de asumir un ID de prueba: no tengo forma de saber
// qué tickets existen en esta base sin sesión propia. Pegá acá el ID (UUID,
// no el código TCK-...) desde la URL de /tickets/:id de un ticket real ya
// abierto en la app.
const idInput = ref(route.params.id || '');
const idActivo = ref(route.params.id || '');
// key fuerza el remount del panel al cambiar de id — TicketDetallePanel no
// observa cambios de prop todavía (fuera de alcance de este preview, ver
// nota en TicketDetallePanel.vue/composable sobre reactividad al id).
const panelKey = ref(0);

function cargarId() {
  const id = idInput.value.trim();
  if (!id) return;
  idActivo.value = id;
  panelKey.value += 1;
  router.replace(`/preview/ticket-panel/${id}`);
}
</script>

<template>
  <div class="preview-ticket-panel-page">
    <div class="ptp-toolbar">
      <h1>Preview — TicketDetallePanel (standalone)</h1>
      <p class="ptp-nota">
        Solo-dev, no existe en producción. Pegá el <strong>ID</strong> (UUID) de un ticket real
        — lo sacás de la URL de <code>/tickets/:id</code> al abrir cualquier ticket desde el
        listado normal — y presioná "Cargar". Requiere sesión de staff igual que el resto del
        panel: si no ves datos, verificá que estás logueado.
      </p>
      <div class="ptp-form">
        <input
          v-model="idInput"
          type="text"
          placeholder="ID del ticket (UUID) — ej. 3f2a1c9e-..."
          @keyup.enter="cargarId"
        >
        <button type="button" class="btn btn--primary" @click="cargarId">Cargar</button>
      </div>
    </div>

    <div class="ptp-stage">
      <p v-if="!idActivo" class="ptp-vacio">Pegá un ID de ticket arriba para ver el panel.</p>
      <TicketDetallePanel
        v-else
        :key="panelKey"
        :ticket-id="idActivo"
        @cerrar="idActivo = ''"
      />
    </div>
  </div>
</template>


