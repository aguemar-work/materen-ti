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

      <RouterLink v-if="destino" class="btn btn-primary notfound-btn" :to="destino.to">
        <i class="ti ti-arrow-left" aria-hidden="true"></i> {{ destino.label }}
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.notfound-icon {
  font-size: 40px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.notfound-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.notfound-texto {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 16px;
}

.notfound-btn {
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
  text-decoration: none;
}
</style>
