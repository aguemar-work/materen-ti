<script setup>
// Página PÚBLICA (sin sesión): seguimiento de UN ticket, dado su token.
// Token de TICKET — distinto del token de entrega. Solo lectura acotada
// a este ticket (estado + comentarios visibles), nunca el resto del sistema.
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { seguimientoTicket } from '../../api/ticketsPublicos.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import EncuestaSatisfaccionForm from './EncuestaSatisfaccionForm.vue';

const route = useRoute();

// estado: 'cargando' | 'listo' | 'error'
const estado = ref('cargando');
const error = ref('');
const ticket = ref(null);
const copiado = ref(null);

async function cargar() {
  try {
    ticket.value = await seguimientoTicket(route.params.token);
    estado.value = 'listo';
  } catch (e) {
    // Un refresco en segundo plano que falla (red) no debe tumbar una
    // vista que ya mostraba el ticket correctamente.
    if (estado.value !== 'listo') {
      error.value = e?.message || 'No se pudo cargar el ticket';
      estado.value = 'error';
    }
  }
}

onMounted(cargar);

// Recarga sola cuando cambia el estado o llega una respuesta pública nueva,
// sin que el empleado tenga que refrescar la página.
useRealtimeRefresco(`ticket:${route.params.token}`, cargar);

async function copiar(texto, id) {
  try {
    await navigator.clipboard.writeText(texto);
    copiado.value = id;
    setTimeout(() => { if (copiado.value === id) copiado.value = null; }, 1500);
  } catch { /* portapapeles no disponible */ }
}

function enlaceSeguimiento() {
  return `${window.location.origin}/soporte/${route.params.token}`;
}
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Seguimiento de solicitud" />

      <div v-if="estado === 'cargando'" class="ticket-texto">Cargando...</div>

      <template v-else-if="estado === 'error'">
        <div class="ticket-error-icon"><i class="ti ti-link-off" aria-hidden="true"></i></div>
        <h2 class="ticket-title">No disponible</h2>
        <p class="ticket-texto">{{ error }}</p>
        <RouterLink class="ticket-link" :to="{ name: 'ticket-buscar' }">
          <i class="ti ti-search" aria-hidden="true"></i> Buscar tickets por DNI
        </RouterLink>
        <RouterLink class="public-volver" to="/soporte">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Volver a soporte
        </RouterLink>
      </template>

      <template v-else>
        <div class="segui-header">
          <span class="segui-codigo">{{ ticket.codigo }}</span>
          <BadgeEstado tipo="ticket" :valor="ticket.estado" />
        </div>

        <div class="segui-copiar">
          <button type="button" class="btn btn--secondary btn--ancho btn--sm" @click="copiar(enlaceSeguimiento(), 'link')">
            {{ copiado === 'link' ? 'Enlace copiado' : 'Copiar enlace' }}
            <i class="ti" :class="copiado === 'link' ? 'ti-check' : 'ti-link'" aria-hidden="true"></i>
          </button>
          <button type="button" class="btn btn--secondary btn--ancho btn--sm" @click="copiar(ticket.codigo, 'codigo')">
            {{ copiado === 'codigo' ? 'Código copiado' : 'Copiar código' }}
            <i class="ti" :class="copiado === 'codigo' ? 'ti-check' : 'ti-copy'" aria-hidden="true"></i>
          </button>
        </div>

        <h2 class="ticket-title">{{ ticket.titulo }}</h2>
        <p class="ticket-texto">{{ ticket.descripcion }}</p>

        <p class="segui-meta">
          {{ ticket.categoria }}{{ ticket.subcategoria ? ` · ${ticket.subcategoria}` : '' }}
          · Creado el {{ formatFecha(ticket.creado) }}
        </p>

        <div v-if="ticket.comentarios.length" class="segui-comentarios">
          <h3 class="segui-subtitulo">Actualizaciones</h3>
          <div v-for="(c, i) in ticket.comentarios" :key="i" class="segui-comentario">
            <div class="segui-comentario-head">
              <span class="segui-autor">{{ c.autor }}</span>
              <span class="segui-fecha">{{ formatFechaHora(c.fecha) }}</span>
            </div>
            <p>{{ c.mensaje }}</p>
          </div>
        </div>

        <div v-if="ticket.estado === 'cerrado'" class="segui-encuesta">
          <EncuestaSatisfaccionForm :token="route.params.token" embebido />
        </div>
      </template>
    </div>
  </div>
</template>


