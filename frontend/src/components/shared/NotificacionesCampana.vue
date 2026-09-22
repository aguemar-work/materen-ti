<script setup>
// Campana del header del shell (HeaderGlobalAction + panel flotante de
// Carbon v11). Alimentada por el store de notificaciones: la carga inicial
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
// borde derecho, como el NotificationPanel de Carbon.
import { useRouter } from 'vue-router';
import { usePopoverFlotante } from '../../composables/usePopoverFlotante.js';
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
    class="cds-campana"
    type="button"
    :title="store.noLeidas.length ? `Notificaciones (${store.noLeidas.length} sin leer)` : 'Notificaciones'"
    :aria-label="store.noLeidas.length ? `Notificaciones (${store.noLeidas.length} sin leer)` : 'Notificaciones'"
    aria-haspopup="menu"
    :aria-expanded="abierto"
    @click.stop="alternar"
  >
    <i class="ti ti-bell" aria-hidden="true"></i>
    <span v-if="store.noLeidas.length" class="cds-campana__conteo">{{ store.noLeidas.length }}</span>
  </button>

  <Teleport to="body">
    <div
      v-if="abierto"
      ref="panel"
      class="cds-panel"
      role="menu"
      aria-label="Notificaciones"
      :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
    >
      <div class="cds-panel__header">
        <span class="cds-panel__titulo">Notificaciones</span>
        <button
          v-if="store.noLeidas.length"
          type="button"
          class="cds-panel__accion"
          @click="marcarTodas"
        >
          Marcar todas como leídas
        </button>
      </div>

      <div v-if="!store.lista.length" class="cds-panel__vacio">Sin notificaciones</div>

      <button
        v-for="n in store.lista"
        :key="n.id"
        type="button"
        class="cds-panel__item"
        :class="{ 'cds-panel__item--no-leida': !store.leidasIds.has(n.id) }"
        role="menuitem"
        @click="abrirNotificacion(n)"
      >
        <i class="ti" :class="icono(n.tipo)" aria-hidden="true"></i>
        <span class="cds-panel__item-texto">
          <span class="cds-panel__item-titulo">{{ n.titulo }}</span>
          <span class="cds-panel__item-fecha">{{ formatAntiguedad(n.creado_en) }}</span>
        </span>
      </button>
    </div>
  </Teleport>
</template>


