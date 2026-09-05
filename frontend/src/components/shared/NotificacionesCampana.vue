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

<style scoped>
/* ── Trigger: acción global del header ────────────────────────
   Cuadrado de 48×48 sobre Gray 100, igual que el resto de la barra de
   acciones. Los valores repiten los de .cds-header__action por la misma
   razón que en AppSearch.vue: esa clase es scoped a AppLayout.vue. */
.cds-campana {
  position: relative;
  width: var(--cds-shell-header-h);
  height: var(--cds-shell-header-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-base);
  color: var(--cds-shell-text);
  cursor: pointer;
  font-size: var(--icon-md);
  transition: background 0.11s;
}

.cds-campana:hover {
  background: var(--cds-shell-hover);
}

.cds-campana:focus-visible {
  outline: 2px solid var(--cds-shell-focus);
  outline-offset: -2px;
}

/* Conteo de no-leídas: Blue 60 sólido con texto blanco (5.00:1), el mismo
   par que el badge de "sin asignar" del SideNav. NO rojo: en este sistema
   Red 60 significa P1 o falta de devolución, y una notificación sin leer no
   es ninguna de las dos. Un color, un significado. */
.cds-campana__conteo {
  position: absolute;
  top: var(--space-5);
  right: var(--space-5);
  min-width: var(--space-7);
  padding: 0 var(--space-2);
  border-radius: var(--radius-base);
  background: var(--color-accent);
  color: var(--color-text-on-color);
  font-size: var(--fs-label-01);
  font-weight: 600;
  line-height: var(--space-7);
  text-align: center;
}

/* ── Panel ────────────────────────────────────────────────────
   Vive sobre el workspace, así que usa los roles claro/oscuro normales.
   Separadores de 1px entre ítems y encabezado en layer-accent: la jerarquía
   de una lista de Carbon se lee por líneas y capas, sin tarjetas
   anidadas ni radios. */
.cds-panel {
  position: fixed;
  z-index: var(--z-popover);
  width: min(360px, calc(100vw - 16px));
  max-height: min(420px, calc(100vh - 96px));
  overflow-y: auto;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-overlay);
}

.cds-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-7);
  background: var(--color-bg-accent);
  border-bottom: 1px solid var(--color-border-subtle);
}

.cds-panel__titulo {
  color: var(--color-text-primary);
  font-size: var(--fs-label-01);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--cds-label-01-ls);
}

.cds-panel__accion {
  background: none;
  border: none;
  border-radius: var(--radius-base);
  cursor: pointer;
  color: var(--color-accent-text);
  font-family: var(--font-sans);
  font-size: var(--fs-label-01);
  padding: var(--space-1) var(--space-2);
}

.cds-panel__accion:hover {
  text-decoration: underline;
}

.cds-panel__accion:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.cds-panel__vacio {
  padding: var(--space-9) var(--space-7);
  color: var(--color-text-secondary);
  font-size: var(--fs-body-01);
  text-align: center;
}

.cds-panel__item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
  width: 100%;
  padding: var(--space-5) var(--space-7);
  border: none;
  border-bottom: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-base);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
}

.cds-panel__item:hover {
  background: var(--color-bg-hover);
}

.cds-panel__item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.cds-panel__item:last-child {
  border-bottom: none;
}

/* No-leída: barra de acento a la izquierda en vez del punto azul que había
   antes. El punto competía con el ícono de tipo al otro extremo de la fila
   (dos marcas en la misma fila para dos cosas distintas); la barra
   pertenece al borde de la fila, no a su contenido, y es el mismo recurso
   con el que el SideNav marca el ítem activo. */
.cds-panel__item--no-leida::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: var(--color-accent);
}

.cds-panel__item--no-leida .cds-panel__item-titulo {
  font-weight: 600;
}

.cds-panel__item i {
  flex-shrink: 0;
  margin-top: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--icon-sm);
}

.cds-panel__item-texto {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}

.cds-panel__item-titulo {
  color: var(--color-text-primary);
  font-size: var(--fs-body-01);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.cds-panel__item-fecha {
  color: var(--color-text-secondary);
  font-size: var(--fs-label-01);
}
</style>
