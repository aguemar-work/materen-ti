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

// Tarjeta flotante común a los dos stacks: superficie blanca con borde de
// 1px + sombra (flota sobre el contenido). El tipo se comunica con el
// COLOR DEL ÍCONO y el texto, nunca con un fondo o borde de color — peso
// visual proporcional al significado (docs/NOTAS-DISENO-ANTERIOR.md §2).
// Los colores de estado son los de la paleta estándar de Tailwind (el rojo
// ya lo usa AppButton `danger`); no hay escala success/warning propia en
// el @theme, a propósito.
const TARJETA =
  'pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-gray-200 bg-white ' +
  'px-4 py-3 text-sm text-gray-800 shadow-lg';
const COLOR_ICONO = {
  danger: 'text-red-600',
  success: 'text-green-600',
  warning: 'text-amber-500',
  info: 'text-primary-500',
};
const BOTON_CERRAR =
  '-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 ' +
  'hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
// Transición compartida (entrada desde la derecha, salida con fade).
const TRANSICION = {
  enterActiveClass: 'transition duration-200 ease-out',
  leaveActiveClass: 'transition duration-150 ease-in',
  enterFromClass: 'translate-x-4 opacity-0',
  leaveToClass: 'opacity-0',
};

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
  <transition-group
    v-bind="TRANSICION"
    tag="div"
    class="pointer-events-none fixed right-4 top-16 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
  >
    <div
      v-for="a in avisos"
      :key="a.key"
      :class="[TARJETA, 'cursor-pointer transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500']"
      role="button"
      tabindex="0"
      @click="irAAviso(a)"
      @keydown.enter="irAAviso(a)"
      @keydown.space.prevent="irAAviso(a)"
    >
      <i class="ti mt-0.5 shrink-0 text-base text-primary-500" :class="a.icono" aria-hidden="true"></i>
      <div class="min-w-0 flex-1">
        <span class="font-medium text-gray-900">{{ a.titulo }}</span>
      </div>
      <button
        type="button"
        :class="BOTON_CERRAR"
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
       6s) — misma tarjeta, dos colas independientes porque su origen y
       su posición en pantalla son distintos. -->
  <transition-group
    v-bind="TRANSICION"
    tag="div"
    class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      :class="TARJETA"
      :role="infoNotificacion(t.tipo).rolAria"
    >
      <i
        class="ti mt-0.5 shrink-0 text-base"
        :class="[infoNotificacion(t.tipo).icono, COLOR_ICONO[infoNotificacion(t.tipo).rol]]"
        aria-hidden="true"
      ></i>
      <div class="min-w-0 flex-1">
        <p>{{ t.msg }}</p>
      </div>
      <button type="button" :class="BOTON_CERRAR" aria-label="Descartar aviso" @click="descartarToast(t.id)">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  </transition-group>
</template>


