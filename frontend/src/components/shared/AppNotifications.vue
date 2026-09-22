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
import { infoNotificacion } from '../../core/notificacionInfo.js';

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
    <div
      v-for="t in toasts"
      :key="t.id"
      class="notif"
      :class="[`notif--${infoNotificacion(t.tipo).rol}`, 'notif--toast']"
      :role="infoNotificacion(t.tipo).rolAria"
    >
      <i class="ti" :class="infoNotificacion(t.tipo).icono" aria-hidden="true"></i>
      <div class="notif__texto">
        <p class="notif__detalle">{{ t.msg }}</p>
      </div>
      <button type="button" class="notif__cerrar" aria-label="Descartar aviso" @click="descartarToast(t.id)">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  </transition-group>
</template>


