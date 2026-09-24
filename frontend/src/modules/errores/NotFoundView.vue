<script setup>
// Página PÚBLICA (sin sesión): catch-all del router. Una URL que no
// matchea ninguna ruta (ej. /soporte/nuevoo) no debe dejar la pantalla en
// blanco: se explica que la página no existe y se ofrece la salida que
// corresponda según la zona (portal público vs panel interno).
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';

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
  <AppPortal
    titulo="Página no encontrada"
    icono="ti ti-error-404"
  >
    <p class="text-center text-sm text-gray-600">
      La dirección ingresada no existe o dejó de estar disponible.
      Verifique el enlace e intente nuevamente.
    </p>

    <!-- Hasta el 2026-09-24 esto era un <CarbonButton> — componente que ya
         no existía: la 404 se quedaba sin ninguna salida. -->
    <AppButton
      v-if="destino"
      class="mt-6"
      size="lg"
      block
      icon="ti ti-arrow-left"
      :label="destino.label"
      :to="destino.to"
    />
  </AppPortal>
</template>
