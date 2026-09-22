<script setup>
// Página PÚBLICA (sin sesión): catch-all del router. Una URL que no
// matchea ninguna ruta (ej. /soporte/nuevoo) no debe dejar la pantalla en
// blanco: se explica que la página no existe y se ofrece la salida que
// corresponda según la zona (portal público vs panel interno).
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';

const route = useRoute();
const auth = useAuthStore();

// Zona pública (soporte, tickets, entregas): la salida es /soporte, sin
// tocar la sesión. Fuera de esa zona depende de si hay sesión de staff.
const esZonaPublica = /^\/(soporte|ticket|entrega)(\/|$)/.test(route.path);

const destino = ref(
  esZonaPublica ? { to: '/soporte', label: 'Volver a soporte' } : null
);

onMounted(async () => {
  if (esZonaPublica) return;
  // La ruta es meta.public, así que el guard no cargó la sesión: se carga
  // acá para saber si corresponde ofrecer el panel o el inicio de sesión.
  if (!auth.sesionCargada) await auth.cargarSesion();
  destino.value = auth.esStaff
    ? { to: '/dashboard', label: 'Ir al panel' }
    : { to: '/login', label: 'Ir al inicio de sesión' };
});
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Página no encontrada" />

      <div class="notfound-icon"><i class="ti ti-error-404" aria-hidden="true"></i></div>
      <h2 class="notfound-title">Página no encontrada</h2>
      <p class="notfound-texto">
        La dirección ingresada no existe o dejó de estar disponible.
        Verifique el enlace e intente nuevamente.
      </p>

      <CarbonButton v-if="destino" variante="primary" icono="ti-arrow-left" ancho :to="destino.to">
        {{ destino.label }}
      </CarbonButton>
    </div>
  </div>
</template>


