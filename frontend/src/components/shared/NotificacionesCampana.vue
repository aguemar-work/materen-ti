<script setup>
// Campana genérica del footer del sidebar (no hay topbar en desktop, ver
// AppLayout.vue). Alimentada por el store de notificaciones: la carga
// inicial y la suscripción realtime viven en AppLayout, este componente
// solo lee el store y dispara las acciones de marcar leída.
import { ref, nextTick, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useNotificacionesStore } from '../../stores/notificaciones.js';
import { formatAntiguedad } from '../../core/formatters.js';
import { iconoNotificacion as icono } from '../../core/notificacionIconos.js';

const router = useRouter();
const auth = useAuthStore();
const store = useNotificacionesStore();

const abierto = ref(false);
const trigger = ref(null);
const panel = ref(null);
const coords = ref({ top: 0, left: 0 });

// Mismo mecanismo de posicionamiento/cierre que MenuAcciones.vue: Teleport
// a <body> (el sidebar no recorta overflow, pero el panel sí debe quedar
// por encima de todo) + pointerdown fuera para cerrar.
function posicionar() {
  if (!trigger.value || !panel.value) return;
  const r = trigger.value.getBoundingClientRect();
  const m = panel.value.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8));
  let top = r.top - m.height - 8;
  if (top < 8) top = r.bottom + 8;
  coords.value = { top, left };
}

function onDocPointer(e) {
  if (trigger.value?.contains(e.target) || panel.value?.contains(e.target)) return;
  cerrar();
}

async function abrir() {
  abierto.value = true;
  await nextTick();
  posicionar();
  document.addEventListener('pointerdown', onDocPointer, true);
  window.addEventListener('resize', cerrar);
}

function cerrar() {
  if (!abierto.value) return;
  abierto.value = false;
  document.removeEventListener('pointerdown', onDocPointer, true);
  window.removeEventListener('resize', cerrar);
}

function alternar() {
  if (abierto.value) cerrar();
  else abrir();
}

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

onBeforeUnmount(cerrar);
</script>

<template>
  <button
    ref="trigger"
    class="icon-btn campana-trigger"
    type="button"
    :title="store.noLeidas.length ? `Notificaciones (${store.noLeidas.length} sin leer)` : 'Notificaciones'"
    aria-haspopup="menu"
    :aria-expanded="abierto"
    @click.stop="alternar"
  >
    <i class="ti ti-bell" aria-hidden="true"></i>
    <span v-if="store.noLeidas.length" class="badge-count campana-badge">{{ store.noLeidas.length }}</span>
  </button>

  <Teleport to="body">
    <div
      v-if="abierto"
      ref="panel"
      class="campana-panel"
      role="menu"
      aria-label="Notificaciones"
      :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
    >
      <div class="campana-panel__header">
        <span>Notificaciones</span>
        <button
          v-if="store.noLeidas.length"
          type="button"
          class="campana-panel__marcar-todas"
          @click="marcarTodas"
        >
          Marcar todas como leídas
        </button>
      </div>

      <div v-if="!store.lista.length" class="campana-panel__vacio">Sin notificaciones</div>

      <button
        v-for="n in store.lista"
        :key="n.id"
        type="button"
        class="campana-panel__item"
        role="menuitem"
        @click="abrirNotificacion(n)"
      >
        <i class="ti" :class="icono(n.tipo)" aria-hidden="true"></i>
        <span class="campana-panel__item-texto">
          <span class="campana-panel__item-titulo">{{ n.titulo }}</span>
          <span class="campana-panel__item-fecha">{{ formatAntiguedad(n.creado_en) }}</span>
        </span>
        <span v-if="!store.leidasIds.has(n.id)" class="campana-panel__punto" aria-hidden="true"></span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.campana-trigger {
  position: relative;
}

.campana-badge {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 10px;
  line-height: 1;
  padding: 1px 5px;
}

.campana-panel {
  position: fixed;
  z-index: var(--z-popover);
  width: min(340px, calc(100vw - 16px));
  max-height: min(420px, calc(100vh - 16px));
  overflow-y: auto;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px;
}

.campana-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.campana-panel__marcar-todas {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-accent-text);
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px;
}

.campana-panel__marcar-todas:hover {
  text-decoration: underline;
}

.campana-panel__vacio {
  padding: 20px 10px;
  text-align: center;
  font-size: 12.5px;
  color: var(--color-text-secondary);
}

.campana-panel__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.campana-panel__item:hover,
.campana-panel__item:focus-visible {
  background: var(--color-bg-hover);
}

.campana-panel__item i {
  font-size: 16px;
  color: var(--color-accent-soft);
  flex-shrink: 0;
  margin-top: 1px;
}

.campana-panel__item-texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.campana-panel__item-titulo {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.campana-panel__item-fecha {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.campana-panel__punto {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-accent);
  flex-shrink: 0;
  margin-top: 5px;
}
</style>
