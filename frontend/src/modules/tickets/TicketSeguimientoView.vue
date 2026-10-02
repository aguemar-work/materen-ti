<script setup>
// Página PÚBLICA (sin sesión): seguimiento de UN ticket, dado su token.
// Token de TICKET — distinto del token de entrega. Solo lectura acotada
// a este ticket (estado + comentarios visibles), nunca el resto del sistema.
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { seguimientoTicket } from '../../api/ticketsPublicos.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import EncuestaSatisfaccionForm from './EncuestaSatisfaccionForm.vue';

const route = useRoute();

// estado: 'cargando' | 'listo' | 'error'
const estado = ref('cargando');
const error = ref('');
const ticket = ref(null);
const copiado = ref(null);
const errorCaptura = ref('');

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

// La captura vive en un bucket privado (migración 111): `seguimiento` entrega una
// URL firmada que vence en 5 minutos, así que al hacer clic se vuelve a pedir
// una fresca. La pestaña se abre en el clic (antes del `await`) para que el
// navegador no la bloquee como ventana emergente.
async function verCaptura() {
  const ventana = window.open('', '_blank');
  if (ventana) ventana.opener = null;
  errorCaptura.value = '';
  try {
    const fresco = await seguimientoTicket(route.params.token);
    if (!fresco.adjuntoUrl) throw new Error('sin captura');
    if (ventana) ventana.location.href = fresco.adjuntoUrl;
    else window.open(fresco.adjuntoUrl, '_blank', 'noopener');
  } catch {
    ventana?.close();
    errorCaptura.value = 'No se pudo abrir la captura. Intente de nuevo.';
  }
}

function enlaceSeguimiento() {
  return `${window.location.origin}/soporte/${route.params.token}`;
}

// ── Solo presentación (rediseño 2026-09-24, receta 4.5) ──────────────────
const titulo = computed(() => {
  if (estado.value === 'error') return 'No disponible';
  if (estado.value === 'listo') return ticket.value.titulo;
  return 'Seguimiento de solicitud';
});

// El ícono/texto del botón cambia al copiar; esto lo confirma también a un
// lector de pantalla (región aria-live).
const mensajeCopiado = computed(() => {
  if (copiado.value === 'link') return 'Enlace copiado';
  if (copiado.value === 'codigo') return 'Código copiado';
  return '';
});
</script>

<template>
  <AppPortal
    seccion="Seguimiento de solicitud"
    :titulo="titulo"
    :icono="estado === 'error' ? 'ti ti-link-off' : ''"
  >
    <template v-if="estado === 'listo'" #antetitulo>
      <span class="font-mono text-sm font-medium text-gray-500 tabular-nums">{{ ticket.codigo }}</span>
      <BadgeEstado tipo="ticket" :valor="ticket.estado" />
    </template>
    <template v-if="estado === 'listo'" #descripcion>
      {{ ticket.categoria }}{{ ticket.subcategoria ? ` · ${ticket.subcategoria}` : '' }}
      · Creado el {{ formatFecha(ticket.creado) }}
    </template>

    <p v-if="estado === 'cargando'" class="py-4 text-center text-sm text-gray-500" role="status">Cargando...</p>

    <template v-else-if="estado === 'error'">
      <p class="text-center text-sm text-gray-600">{{ error }}</p>
      <AppButton
        class="mt-6"
        size="lg"
        block
        icon="ti ti-search"
        label="Buscar tickets por DNI"
        :to="{ name: 'ticket-buscar' }"
      />
    </template>

    <template v-else>
      <p class="whitespace-pre-line text-sm leading-relaxed text-gray-700 [overflow-wrap:anywhere]">{{ ticket.descripcion }}</p>

      <div class="mt-5 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        <AppButton
          variant="outline"
          severity="secondary"
          :icon="copiado === 'link' ? 'ti ti-check' : 'ti ti-link'"
          :label="copiado === 'link' ? 'Enlace copiado' : 'Copiar enlace'"
          @click="copiar(enlaceSeguimiento(), 'link')"
        />
        <AppButton
          variant="outline"
          severity="secondary"
          :icon="copiado === 'codigo' ? 'ti ti-check' : 'ti ti-copy'"
          :label="copiado === 'codigo' ? 'Código copiado' : 'Copiar código'"
          @click="copiar(ticket.codigo, 'codigo')"
        />
      </div>
      <p class="sr-only" role="status" aria-live="polite">{{ mensajeCopiado }}</p>

      <div v-if="ticket.adjuntoUrl" class="mt-3">
        <AppButton
          variant="outline"
          severity="secondary"
          icon="ti ti-camera"
          label="Ver captura adjunta"
          block
          data-captura="ver"
          @click="verCaptura"
        />
        <p v-if="errorCaptura" class="mt-2 text-xs text-red-700" role="alert">{{ errorCaptura }}</p>
      </div>

      <section v-if="ticket.comentarios.length" class="mt-6 border-t border-gray-100 pt-5" aria-labelledby="segui-actualizaciones">
        <h2 id="segui-actualizaciones" class="text-sm font-semibold text-gray-900">Actualizaciones</h2>
        <ol class="mt-3 flex flex-col gap-3">
          <li v-for="(c, i) in ticket.comentarios" :key="i" class="rounded-md bg-gray-50 px-4 py-3">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span class="text-sm font-medium text-gray-900">{{ c.autor }}</span>
              <span class="text-xs text-gray-500 tabular-nums">{{ formatFechaHora(c.fecha) }}</span>
            </div>
            <p class="mt-1 whitespace-pre-line text-sm text-gray-700 [overflow-wrap:anywhere]">{{ c.mensaje }}</p>
          </li>
        </ol>
      </section>

      <div v-if="ticket.estado === 'cerrado'" class="mt-6 border-t border-gray-100 pt-5 empty:hidden">
        <EncuestaSatisfaccionForm :token="route.params.token" embebido />
      </div>
    </template>

    <template v-if="estado === 'error'" #pie>
      <AppButton
        variant="text"
        severity="secondary"
        icon="ti ti-arrow-left"
        label="Volver a soporte"
        to="/soporte"
      />
    </template>
  </AppPortal>
</template>
