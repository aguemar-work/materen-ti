<script setup>
// Página PÚBLICA (sin sesión): seguimiento de UN ticket, dado su token.
// Token de TICKET — distinto del token de entrega. Solo lectura acotada
// a este ticket (estado + comentarios visibles), nunca el resto del sistema.
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { seguimientoTicket } from '../../api/ticketsPublicos.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { estadoInfo } from '../../core/dominio-tickets.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';

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
  return `${window.location.origin}/ticket/${route.params.token}`;
}
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Seguimiento de solicitud" />

      <div v-if="estado === 'cargando'" class="ticket-texto">Cargando...</div>

      <template v-else-if="estado === 'error'">
        <div class="ticket-error-icon"><i class="ti ti-link-off"></i></div>
        <h2 class="ticket-title">No disponible</h2>
        <p class="ticket-texto">{{ error }}</p>
        <RouterLink class="ticket-link" to="/ticket/buscar">
          <i class="ti ti-search" aria-hidden="true"></i> Buscar mis tickets por DNI
        </RouterLink>
      </template>

      <template v-else>
        <div class="segui-header">
          <span class="segui-codigo">{{ ticket.codigo }}</span>
          <span class="badge" :class="estadoInfo(ticket.estado).clase">{{ estadoInfo(ticket.estado).label }}</span>
        </div>

        <div class="segui-copiar">
          <button class="btn" type="button" @click="copiar(enlaceSeguimiento(), 'link')">
            <i :class="copiado === 'link' ? 'ti ti-check' : 'ti ti-link'" aria-hidden="true"></i>
            {{ copiado === 'link' ? 'Enlace copiado' : 'Copiar enlace' }}
          </button>
          <button class="btn" type="button" @click="copiar(ticket.codigo, 'codigo')">
            <i :class="copiado === 'codigo' ? 'ti ti-check' : 'ti ti-copy'" aria-hidden="true"></i>
            {{ copiado === 'codigo' ? 'Código copiado' : 'Copiar código' }}
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

        <RouterLink
          v-if="ticket.estado === 'cerrado'"
          class="ticket-link"
          :to="`/ticket/${route.params.token}/satisfaccion`"
        >
          <i class="ti ti-mood-smile" aria-hidden="true"></i> Contarnos cómo te fue
        </RouterLink>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ticket-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 8px;
}

.ticket-texto {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 10px;
}

.ticket-error-icon {
  font-size: 40px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.segui-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.segui-codigo {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.segui-copiar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.segui-copiar .btn {
  flex: 1;
  justify-content: center;
  font-size: var(--fs-sm);
}

.segui-meta {
  font-size: var(--fs-sm);
  color: var(--color-text-tertiary);
  margin: 0 0 16px;
}

.segui-subtitulo {
  font-size: var(--fs-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
  margin: 0 0 10px;
}

.segui-comentarios {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.segui-comentario {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: var(--color-bg-subtle);
}

.segui-comentario p {
  margin: 4px 0 0;
  font-size: var(--fs-base);
  color: var(--color-text-primary);
}

.segui-comentario-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.segui-autor {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-accent-text);
}

.segui-fecha {
  font-size: var(--fs-sm);
  color: var(--color-text-tertiary);
}

.ticket-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  padding: 10px 14px;
  margin: 4px 0 0;
  border: 1.5px solid var(--color-accent);
  border-radius: var(--radius-md);
  color: var(--color-accent-text);
  font-weight: 600;
  text-decoration: none;
}

.ticket-link:hover {
  background: var(--color-accent-subtle);
}
</style>
