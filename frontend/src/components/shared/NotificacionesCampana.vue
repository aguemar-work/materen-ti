<script setup>
// Campana del header del shell + panel flotante (estilos: Tailwind +
// components/shared/shellClases.js). Alimentada por el store de notificaciones: la carga inicial
// y las dos suscripciones realtime viven en AppNotifications.vue
// (`notificaciones:nuevas` broadcast + `notificaciones:usuario:<id>`
// personal, migración 048), este componente solo lee el store y dispara las
// acciones de marcar leída. El conteo de no-leídas es reactivo por
// definición: `store.noLeidas` es un getter sobre la lista que esas
// suscripciones alimentan, así que baja y sube sin recargar la página.
//
// Cambió de sitio con el rediseño del 2026-09-02: vivía en el pie del
// SideNav y el panel abría hacia ARRIBA (no había header en desktop). Ahora
// es una acción global del header y el panel cae hacia abajo, alineado a su
// borde derecho.
import { useRouter } from 'vue-router';
import { usePopoverFlotante } from '../../composables/usePopoverFlotante.js';
import { ACCION_HEADER, PANEL_FLOTANTE, ITEM_PANEL } from './shellClases.js';
import { useAuthStore } from '../../stores/auth.js';
import { useNotificacionesStore } from '../../stores/notificaciones.js';
import { formatAntiguedad } from '../../core/formatters.js';
import { iconoNotificacion as icono } from '../../core/notificacionIconos.js';

const router = useRouter();
const auth = useAuthStore();
const store = useNotificacionesStore();

// Mismo mecanismo que MenuAcciones.vue y AppSearch.vue: Teleport a <body>
// (el panel debe quedar por encima del workspace y del SideNav, y el header
// es su propio contexto de apilamiento) + pointerdown fuera para cerrar.
// Lo propio de acá es solo el anclaje: alineado al borde DERECHO del
// trigger y abriendo hacia abajo, porque el trigger vive en la barra de
// acciones globales, arriba a la derecha.
const { abierto, trigger, panel, coords, cerrar, alternar } = usePopoverFlotante({
  alinear(r, m) {
    const left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
    return { top: r.bottom, left };
  },
});

async function abrirNotificacion(n) {
  cerrar();
  router.push(n.url_destino);
  try {
    await store.marcarLeida(n.id, auth.user.id);
  } catch {
    // El store ya revirtió el estado optimista; sin campana no hay más feedback posible.
  }
}

async function marcarTodas() {
  try {
    await store.marcarTodasLeidas(auth.user.id);
  } catch {
    // El store ya revirtió el estado optimista.
  }
}
</script>

<template>
  <button
    ref="trigger"
    :class="ACCION_HEADER"
    type="button"
    :title="store.noLeidas.length ? `Notificaciones (${store.noLeidas.length} sin leer)` : 'Notificaciones'"
    :aria-label="store.noLeidas.length ? `Notificaciones (${store.noLeidas.length} sin leer)` : 'Notificaciones'"
    aria-haspopup="menu"
    :aria-expanded="abierto"
    @click.stop="alternar"
  >
    <i class="ti ti-bell" aria-hidden="true"></i>
    <span
      v-if="store.noLeidas.length"
      class="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-primary-500 px-1 text-center text-[10px] font-semibold leading-4 text-white"
    >{{ store.noLeidas.length }}</span>
  </button>

  <Teleport to="body">
    <div
      v-if="abierto"
      ref="panel"
      :class="[PANEL_FLOTANTE, 'max-h-[70vh] w-[min(22rem,calc(100vw-1rem))]']"
      role="menu"
      aria-label="Notificaciones"
      :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
    >
      <div class="flex items-center justify-between gap-2 border-b border-gray-100 px-3 pb-2 pt-1.5">
        <span class="text-sm font-semibold text-gray-900">Notificaciones</span>
        <button
          v-if="store.noLeidas.length"
          type="button"
          class="rounded px-1.5 py-0.5 text-xs font-medium text-primary-600 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          @click="marcarTodas"
        >
          Marcar todas como leídas
        </button>
      </div>

      <div v-if="!store.lista.length" class="px-3 py-6 text-center text-sm text-gray-500">Sin notificaciones</div>

      <button
        v-for="n in store.lista"
        :key="n.id"
        type="button"
        :class="[ITEM_PANEL, 'items-start', { 'bg-primary-50/60': !store.leidasIds.has(n.id) }]"
        role="menuitem"
        @click="abrirNotificacion(n)"
      >
        <i class="ti mt-0.5 shrink-0 text-base text-gray-400" :class="icono(n.tipo)" aria-hidden="true"></i>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-sm text-gray-800">{{ n.titulo }}</span>
          <span class="text-xs text-gray-500">{{ formatAntiguedad(n.creado_en) }}</span>
        </span>
      </button>
    </div>
  </Teleport>
</template>


