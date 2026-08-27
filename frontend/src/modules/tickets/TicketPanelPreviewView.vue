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
        <button type="button" class="btn btn-primary" @click="cargarId">Cargar</button>
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

<style scoped>
.preview-ticket-panel-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.ptp-toolbar {
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  flex-shrink: 0;
}

.ptp-toolbar h1 {
  font-size: var(--fs-xl);
  margin-bottom: 6px;
}

.ptp-nota {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  max-width: 720px;
  margin-bottom: 14px;
}

.ptp-form {
  display: flex;
  gap: 8px;
  max-width: 480px;
}

.ptp-form input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm);
}

/* Escenario angosto a propósito — simula el ancho que tendría el panel
   derecho del split-view real (~420px), no todo el viewport. */
.ptp-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
  background: var(--color-bg);
}

.ptp-stage > * {
  width: 420px;
  max-width: 100%;
}

.ptp-vacio {
  color: var(--color-text-tertiary);
  font-style: italic;
  margin-top: 40px;
}
</style>
