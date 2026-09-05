<script setup>
// Notificaciones en tiempo real: toast emergente + carga inicial de la
// campana. Extraído de AppLayout.vue (A-06). No maneja el canal
// 'tickets:list' (queda en el layout raíz: alimenta también el badge de
// AppNav y el store global de tickets, no solo las notificaciones) — así
// se evita acoplar este componente con AppNav.
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useNotificacionesStore } from '../../stores/notificaciones.js';
import { reproducirNotificacion } from '../../core/notificacionSonido.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import { iconoNotificacion } from '../../core/notificacionIconos.js';
import { toasts, descartarToast } from '../../core/toast.js';
import CarbonNotification from '../carbon/CarbonNotification.vue';

const router = useRouter();
const auth = useAuthStore();
const notificacionesStore = useNotificacionesStore();

onMounted(() => {
  if (auth.user) notificacionesStore.cargar(auth.user.id);
});

const MAX_AVISOS = 4;
const avisos = ref([]);
let avisoSeq = 0;

function descartarAviso(key) {
  avisos.value = avisos.value.filter((a) => a.key !== key);
}

// Compartido entre el canal broadcast (notificaciones:nuevas) y el personal
// (notificaciones:usuario:<id>, migración 048): mismo aviso emergente + misma
// entrada en la campana, la única diferencia es si suena o no.
function manejarNotificacionNueva(payload, { sonido = false } = {}) {
  notificacionesStore.agregar(payload);
  if (sonido) reproducirNotificacion();
  if (avisos.value.length >= MAX_AVISOS) return;
  const key = ++avisoSeq;
  avisos.value.push({
    key,
    id: payload.id,
    titulo: payload.titulo,
    url_destino: payload.url_destino,
    icono: iconoNotificacion(payload.tipo),
  });
  setTimeout(() => descartarAviso(key), 6000);
}

useRealtimeRefresco('notificaciones:nuevas', (payload) => {
  manejarNotificacionNueva(payload, { sonido: false });
});

// Notificaciones personales (migración 048/049): asignación, cambio de
// estado, comentario nuevo o correo fallido en un ticket que le corresponde
// a este usuario. Más accionable que el feed broadcast, por eso sí suena.
if (auth.user) {
  useRealtimeRefresco(`notificaciones:usuario:${auth.user.id}`, (payload) => {
    manejarNotificacionNueva(payload, { sonido: true });
  });
}

async function irAAviso(aviso) {
  descartarAviso(aviso.key);
  router.push(aviso.url_destino);
  try {
    await notificacionesStore.marcarLeida(aviso.id, auth.user.id);
  } catch {
    // El store ya revirtió el estado optimista; sin más feedback posible acá.
  }
}
</script>

<template>
  <!-- Aviso emergente de notificación nueva (tiempo real) -->
  <transition-group name="aviso-fade" tag="div" class="aviso-stack">
    <div
      v-for="a in avisos"
      :key="a.key"
      class="aviso-card"
      role="button"
      tabindex="0"
      @click="irAAviso(a)"
      @keydown.enter="irAAviso(a)"
      @keydown.space.prevent="irAAviso(a)"
    >
      <i class="ti" :class="a.icono" aria-hidden="true"></i>
      <div class="aviso-card-texto">
        <span class="aviso-card-titulo">{{ a.titulo }}</span>
      </div>
      <button
        type="button"
        class="aviso-card-cerrar"
        aria-label="Descartar aviso"
        @click.stop="descartarAviso(a.key)"
      >
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  </transition-group>

  <!-- Confirmaciones de acciones propias (showToast, core/toast.js): abajo a
       la derecha, se van solas. Distinto del stack de arriba (avisos
       realtime, arriba a la derecha, los descarta el usuario o expiran a los
       6s) — mismo componente (CarbonNotification variante "toast"), dos
       colas independientes porque su origen y su posición en pantalla son
       distintos (ver CarbonNotification.vue, cabecera). -->
  <transition-group name="toast-fade" tag="div" class="toast-stack">
    <CarbonNotification
      v-for="t in toasts"
      :key="t.id"
      :tipo="t.tipo"
      variante="toast"
      descartable
      @cerrar="descartarToast(t.id)"
    >{{ t.msg }}</CarbonNotification>
  </transition-group>
</template>

<style scoped>
.aviso-stack {
  position: fixed;
  /* Debajo del header del shell (48px), no pegado al borde del viewport:
     ahi los avisos tapaban las acciones globales. */
  top: calc(var(--cds-shell-header-h) + var(--space-7));
  right: var(--space-7);
  z-index: var(--z-popover);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: min(320px, calc(100vw - 32px));
}

.aviso-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
  padding: 12px 12px 12px 14px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-overlay);
  cursor: pointer;
}

.aviso-card:hover {
  border-color: var(--color-border);
}

.aviso-card > i {
  color: var(--color-accent-soft);
  font-size: var(--icon-md);
  flex-shrink: 0;
  margin-top: 1px;
}

.aviso-card-texto {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}

.aviso-card-titulo {
  font-size: var(--fs-body-01);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.aviso-card-cerrar {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  padding: var(--space-1);
  border-radius: var(--radius-base);
  display: flex;
  flex-shrink: 0;
  font-size: var(--icon-sm);
}

.aviso-card-cerrar:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.aviso-fade-enter-active,
.aviso-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.aviso-fade-enter-from,
.aviso-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 768px) {
  .aviso-stack {
    left: 16px;
    right: 16px;
    width: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .aviso-fade-enter-active,
  .aviso-fade-leave-active {
    transition-duration: 0.01ms !important;
  }
}

/* Misma posición que el `#toast` que reemplaza (bottom:24px/right:24px,
   max-width 400px, apilado 16px en mobile) — la migración cambia el
   mecanismo de render, no dónde aparece. */
.toast-stack {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: min(400px, calc(100vw - 32px));
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 768px) {
  .toast-stack {
    left: 16px;
    right: 16px;
    bottom: 16px;
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-fade-enter-active,
  .toast-fade-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
