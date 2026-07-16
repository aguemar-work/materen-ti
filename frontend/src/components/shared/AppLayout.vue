<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTicketsStore } from '../../stores/tickets.js';
import { insforgeApi } from '../../api/insforge.js';
import { getClient } from '../../api/client.js';
import { estadoInfo } from '../../core/dominio-tickets.js';
import { temaActual, alternarTema } from '../../core/tema.js';
import { reproducirNotificacion } from '../../core/notificacionSonido.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';

const router = useRouter();
const auth = useAuthStore();

// Conexión realtime única por sesión: las vistas solo se suscriben/
// desuscriben a sus canales (ver useRealtimeRefresco), este layout
// abre y cierra el socket mientras dure la sesión de staff.
onMounted(() => {
  getClient().realtime.connect();
});

onUnmounted(() => {
  getClient().realtime.disconnect();
});

// Suscripción única a tickets:list, vivida aquí (no en TicketsView) para
// que el sonido de "ticket nuevo" suene sin importar qué pantalla esté
// viendo el staff. El store es un singleton Pinia: llamar cargar() desde
// aquí ya refresca TicketsView si está montada, sin que ella necesite su
// propia suscripción al mismo canal.
const ticketsStore = useTicketsStore();
useRealtimeRefresco('tickets:list', (payload) => {
  if (payload?.op === 'INSERT') reproducirNotificacion();
  ticketsStore.cargar();
});

const sidebarAbierto = ref(false);

// ── Colapso del sidebar (solo desktop; en móvil manda el drawer) ──
const CLAVE_SIDEBAR = 'sistema-ti-sidebar';
const sidebarColapsado = ref(localStorage.getItem(CLAVE_SIDEBAR) === 'colapsado');

function toggleColapso() {
  sidebarColapsado.value = !sidebarColapsado.value;
  localStorage.setItem(CLAVE_SIDEBAR, sidebarColapsado.value ? 'colapsado' : 'expandido');
}

const inputBusqueda = ref(null);

async function expandirYBuscar() {
  sidebarColapsado.value = false;
  localStorage.setItem(CLAVE_SIDEBAR, 'expandido');
  await nextTick();
  inputBusqueda.value?.focus();
}

// ── Tema claro/oscuro ─────────────────────────────────────────
const tema = ref(temaActual());

function toggleTema() {
  tema.value = alternarTema();
}

// ── Búsqueda global ───────────────────────────────────────────
const SIN_RESULTADOS = { empleados: [], cuentas: [], equipos: [], tickets: [], licencias: [] };
const busqueda = ref('');
const resultados = ref({ ...SIN_RESULTADOS });
const buscando = ref(false);
const busquedaAbierta = ref(false);
let debounceTimer = null;

const hayResultados = computed(() =>
  resultados.value.empleados.length ||
  resultados.value.cuentas.length ||
  resultados.value.equipos.length ||
  resultados.value.tickets.length ||
  resultados.value.licencias.length
);

watch(busqueda, (q) => {
  clearTimeout(debounceTimer);
  if (q.trim().length < 2) {
    resultados.value = { ...SIN_RESULTADOS };
    busquedaAbierta.value = false;
    return;
  }
  buscando.value = true;
  busquedaAbierta.value = true;
  debounceTimer = setTimeout(async () => {
    try {
      resultados.value = await insforgeApi.buscarGlobal(q);
    } catch {
      resultados.value = { ...SIN_RESULTADOS };
    } finally {
      buscando.value = false;
    }
  }, 300);
});

function cerrarBusqueda() {
  setTimeout(() => { busquedaAbierta.value = false; }, 150);
}

function limpiarBusqueda() {
  busqueda.value = '';
  busquedaAbierta.value = false;
  cerrar();
}

function irAEmpleado(emp) {
  limpiarBusqueda();
  router.push(`/empleados/${emp.id}`);
}

function irACuenta(cuenta) {
  limpiarBusqueda();
  // Personal con titular → su ficha; compartida/reutilizable → Correos
  // prefiltrado con el usuario de la cuenta
  if (cuenta.tipo_cuenta === 'personal' && cuenta.titular_id) {
    router.push(`/empleados/${cuenta.titular_id}`);
  } else {
    router.push({ path: '/correos', query: { q: cuenta.usuario } });
  }
}

// Deep-links: la vista de lista lee ?q= y precarga su buscador, dejando
// visible el registro concreto (no hay vistas de detalle para estos).
function irAEquipo(eq) {
  limpiarBusqueda();
  router.push({ path: '/equipos', query: { q: eq.codigo } });
}

function irATicket(t) {
  limpiarBusqueda();
  router.push(`/tickets/${t.id}`);
}

function irALicencia(lic) {
  limpiarBusqueda();
  router.push({ path: '/licencias', query: { q: lic.software } });
}

// Nav agrupada por frecuencia de uso: día a día arriba, inventario al
// medio, auditoría y catálogos al fondo.
const navGrupos = computed(() => [
  {
    label: null,
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'ti ti-layout-dashboard' },
      { path: '/tickets', label: 'Tickets', icon: 'ti ti-headset' },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { path: '/empleados', label: 'Empleados', icon: 'ti ti-users' },
      { path: '/correos', label: 'Correos', icon: 'ti ti-mail-share' },
      { path: '/licencias', label: 'Licencias', icon: 'ti ti-license' },
      { path: '/equipos', label: 'Equipos', icon: 'ti ti-devices' },
    ],
  },
  {
    label: 'Administración',
    items: [
      ...(auth.esJefe
        ? [
            { path: '/actividad', label: 'Actividad', icon: 'ti ti-activity' },
            { path: '/accesos-sensibles', label: 'Accesos sensibles', icon: 'ti ti-shield-lock' },
          ]
        : []),
      // Catálogos (empresas, plataformas, tipos, ubicaciones, staff)
      { path: '/configuracion', label: 'Configuración', icon: 'ti ti-settings' },
    ],
  },
]);

const userInitial = computed(() => (auth.user?.email?.[0] ?? '?').toUpperCase());

function cerrar() {
  sidebarAbierto.value = false;
}

async function cerrarSesion() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="app-layout">
    <!-- Backdrop móvil -->
    <transition name="sb-fade">
      <div
        v-if="sidebarAbierto"
        class="sb-overlay"
        aria-hidden="true"
        @click="cerrar"
      />
    </transition>

    <!-- Sidebar -->
    <aside
      class="sidebar"
      :class="{ 'sidebar--open': sidebarAbierto, 'sidebar--colapsado': sidebarColapsado }"
      aria-label="Menú principal"
    >
      <div class="sb-logo">
        <img src="/logo_materen_sisti.svg" alt="Materen — Sistema TI" class="sb-logo-full">
        <img src="/icon_sisti.svg" alt="Materen — Sistema TI" class="sb-logo-icono">
        <button
          class="sb-logout sb-collapse"
          type="button"
          :title="sidebarColapsado ? 'Expandir menú' : 'Colapsar menú'"
          :aria-expanded="!sidebarColapsado"
          @click="toggleColapso"
        >
          <i
            :class="sidebarColapsado ? 'ti ti-layout-sidebar-left-expand' : 'ti ti-layout-sidebar-left-collapse'"
            aria-hidden="true"
          ></i>
        </button>
      </div>

      <!-- Búsqueda global (colapsado: solo un botón que expande y enfoca) -->
      <div class="sb-busqueda sb-busqueda--colapsada">
        <button
          class="sb-logout"
          type="button"
          title="Buscar en todo"
          @click="expandirYBuscar"
        >
          <i class="ti ti-search" aria-hidden="true"></i>
        </button>
      </div>
      <div class="sb-busqueda sb-busqueda--full">
        <i class="ti ti-search sb-busqueda-icon" aria-hidden="true"></i>
        <input
          ref="inputBusqueda"
          v-model="busqueda"
          type="text"
          placeholder="Buscar en todo..."
          aria-label="Búsqueda global"
          @focus="busqueda.trim().length >= 2 && (busquedaAbierta = true)"
          @blur="cerrarBusqueda"
        >
        <div v-if="busquedaAbierta" class="sb-resultados">
          <div v-if="buscando" class="sb-res-vacio">Buscando...</div>
          <template v-else-if="hayResultados">
            <template v-if="resultados.empleados.length">
              <div class="sb-res-grupo">Empleados</div>
              <button
                v-for="e in resultados.empleados"
                :key="e.id"
                type="button"
                class="sb-res-item"
                @mousedown.prevent="irAEmpleado(e)"
              >
                <i class="ti ti-user"></i>
                <span class="sb-res-main">{{ e.nombres }} {{ e.apellidos }}</span>
                <span class="sb-res-sec">{{ e.dni }}</span>
              </button>
            </template>
            <template v-if="resultados.cuentas.length">
              <div class="sb-res-grupo">Cuentas</div>
              <button
                v-for="c in resultados.cuentas"
                :key="c.id"
                type="button"
                class="sb-res-item"
                @mousedown.prevent="irACuenta(c)"
              >
                <i class="ti ti-key"></i>
                <span class="sb-res-main">{{ c.usuario }}</span>
                <span class="sb-res-sec">{{ c.plataforma_nombre }}</span>
              </button>
            </template>
            <template v-if="resultados.equipos.length">
              <div class="sb-res-grupo">Equipos</div>
              <button
                v-for="eq in resultados.equipos"
                :key="eq.id"
                type="button"
                class="sb-res-item"
                @mousedown.prevent="irAEquipo(eq)"
              >
                <i class="ti ti-devices"></i>
                <span class="sb-res-main">{{ eq.codigo }}</span>
                <span class="sb-res-sec">{{ eq.descripcion }}</span>
              </button>
            </template>
            <template v-if="resultados.tickets.length">
              <div class="sb-res-grupo">Tickets</div>
              <button
                v-for="t in resultados.tickets"
                :key="t.id"
                type="button"
                class="sb-res-item"
                @mousedown.prevent="irATicket(t)"
              >
                <i class="ti ti-headset"></i>
                <span class="sb-res-main">{{ t.titulo }}</span>
                <span class="sb-res-sec">{{ t.codigo }} · {{ estadoInfo(t.estado).label }}</span>
              </button>
            </template>
            <template v-if="resultados.licencias.length">
              <div class="sb-res-grupo">Licencias</div>
              <button
                v-for="lic in resultados.licencias"
                :key="lic.id"
                type="button"
                class="sb-res-item"
                @mousedown.prevent="irALicencia(lic)"
              >
                <i class="ti ti-license"></i>
                <span class="sb-res-main">{{ lic.software }}</span>
                <span class="sb-res-sec">{{ lic.proveedor }}</span>
              </button>
            </template>
          </template>
          <div v-else class="sb-res-vacio">Sin resultados para "{{ busqueda }}"</div>
        </div>
      </div>

      <nav class="sb-nav" aria-label="Navegación">
        <div
          v-for="(grupo, i) in navGrupos"
          :key="grupo.label ?? i"
          class="sb-nav-grupo"
        >
          <div v-if="grupo.label" class="sb-nav-titulo">{{ grupo.label }}</div>
          <RouterLink
            v-for="item in grupo.items"
            :key="item.path"
            :to="item.path"
            class="sb-nav-item"
            active-class="sb-nav-item--active"
            :title="sidebarColapsado ? item.label : null"
            @click="cerrar"
          >
            <i :class="item.icon" aria-hidden="true"></i>
            <span class="sb-nav-label">{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>

      <div class="sb-footer">
        <div class="sb-user" :title="sidebarColapsado ? auth.user?.email : null">
          <div class="sb-user-avatar" aria-hidden="true">{{ userInitial }}</div>
          <div class="sb-user-info">
            <span class="sb-user-email" :title="auth.user?.email">{{ auth.user?.email }}</span>
            <span class="sb-user-rol">{{ auth.rol ?? 'Staff' }}</span>
          </div>
        </div>
        <button
          class="sb-logout"
          type="button"
          :title="tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
          @click="toggleTema"
        >
          <i :class="tema === 'dark' ? 'ti ti-sun' : 'ti ti-moon'" aria-hidden="true"></i>
        </button>
        <button
          class="sb-logout"
          type="button"
          title="Cerrar sesión"
          @click="cerrarSesion"
        >
          <i class="ti ti-logout" aria-hidden="true"></i>
        </button>
      </div>
    </aside>

    <!-- Contenido -->
    <div class="layout-main">
      <!-- Barra superior móvil -->
      <div class="topbar-mobile">
        <button
          class="topbar-toggle"
          type="button"
          aria-label="Abrir menú"
          @click="sidebarAbierto = !sidebarAbierto"
        >
          <i class="ti ti-menu-2" aria-hidden="true"></i>
        </button>
        <span class="topbar-title">Materen — Sistema TI</span>
      </div>

      <slot />
    </div>
  </div>
</template>

<style scoped>
/* ── Variables del sidebar ───────────────────────────────────────
   Minimalista: el sidebar se funde con el fondo de la página
   (sin panel oscuro, sin bordes). Hover/activo = tinte muy tenue,
   nunca bordes ni indicadores. Sigue el tema claro/oscuro. */
.sidebar {
  --sb-w: 240px;
  --sb-bg: var(--color-bg);
  --sb-text: var(--color-text-secondary);
  --sb-text-strong: var(--color-text-primary);
  --sb-hover: var(--color-bg-hover);
  --sb-active-bg: var(--color-accent-subtle);
  --sb-active-text: var(--color-accent-text);
}

/* ── Layout raíz ─────────────────────────────────────────────── */
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────────────────────── */
.sidebar {
  width: var(--sb-w);
  flex-shrink: 0;
  height: 100vh;
  background: var(--sb-bg);
  border-right: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: var(--z-nav); /* solo aplica cuando es fixed (móvil, ≤768px) */
  transition: width 0.2s ease;
}

/* ── Colapsado (solo desktop; en móvil manda el drawer) ─────────── */
.sb-collapse {
  margin-left: auto;
}

.sb-busqueda--colapsada {
  display: none;
}

@media (min-width: 769px) {
  .sidebar--colapsado {
    --sb-w: 64px;
  }

  .sidebar--colapsado .sb-busqueda--full {
    display: none;
  }

  .sidebar--colapsado .sb-logo {
    flex-direction: column;
    gap: 8px;
    padding: 16px 0 10px;
  }

  .sidebar--colapsado .sb-logo-full {
    display: none;
  }

  .sidebar--colapsado .sb-logo-icono {
    display: block;
  }

  .sidebar--colapsado .sb-collapse {
    margin-left: 0;
  }

  .sidebar--colapsado .sb-busqueda--colapsada {
    display: flex;
    justify-content: center;
    padding: 4px 0;
  }

  .sidebar--colapsado .sb-nav {
    padding: 10px 12px;
  }

  .sidebar--colapsado .sb-nav-item {
    justify-content: center;
    padding: 9px 0;
  }

  .sidebar--colapsado .sb-nav-label {
    display: none;
  }

  /* Colapsado: sin títulos de grupo; la separación la da el gap del nav */
  .sidebar--colapsado .sb-nav-titulo {
    display: none;
  }

  .sidebar--colapsado .sb-footer {
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
  }

  .sidebar--colapsado .sb-user {
    flex: none;
    justify-content: center;
  }

  .sidebar--colapsado .sb-user-info {
    display: none;
  }
}

/* Durante la transición de ancho los labels no deben envolver línea */
.sb-nav-label {
  white-space: nowrap;
}

/* ── Búsqueda global ─────────────────────────────────────────── */
.sb-busqueda {
  position: relative;
  padding: 12px 14px 4px;
  flex-shrink: 0;
}

.sb-busqueda-icon {
  position: absolute;
  left: 26px;
  top: 50%;
  transform: translateY(calc(-50% + 3px));
  color: var(--sb-text);
  font-size: 14px;
  pointer-events: none;
}

.sb-busqueda input {
  width: 100%;
  padding: 8px 10px 8px 34px;
  font-size: 13px;
  color: var(--sb-text-strong);
  background: var(--color-bg-hover);
  border: 1px solid transparent;
  border-radius: 8px;
  outline: none;
  transition: background 0.15s, border-color 0.15s;
}

.sb-busqueda input::placeholder { color: var(--color-text-tertiary); }

.sb-busqueda input:focus {
  background: var(--color-bg-elevated);
  border-color: var(--color-border);
}

.sb-resultados {
  position: absolute;
  top: calc(100% + 2px);
  left: 14px;
  right: 14px;
  z-index: var(--z-popover);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  max-height: 340px;
  overflow-y: auto;
  padding: 4px;
}

.sb-res-grupo {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  padding: 8px 10px 3px;
}

.sb-res-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
}

.sb-res-item:hover { background: var(--color-accent-subtle); }

.sb-res-item i {
  color: var(--color-accent-soft);
  font-size: 15px;
  flex-shrink: 0;
}

.sb-res-main {
  color: var(--color-text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.sb-res-sec {
  font-size: 11.5px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.sb-res-vacio {
  padding: 14px 10px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  text-align: center;
}

/* ── Logo ────────────────────────────────────────────────────── */
.sb-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 14px;
  flex-shrink: 0;
}

/* Lockup "materen · sistema ti" expandido; icono cuadrado colapsado.
   El logo es verde pino: en oscuro se pasa a blanco (mismo tratamiento
   que en el login). */
.sb-logo-full {
  display: block;
  height: 26px;
  width: auto;
}

.sb-logo-icono {
  display: none;
  width: 28px;
  height: 28px;
}

[data-theme="dark"] .sb-logo-full,
[data-theme="dark"] .sb-logo-icono {
  filter: brightness(0) invert(1);
}

/* ── Nav ─────────────────────────────────────────────────────── */
.sb-nav {
  flex: 1;
  padding: 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 14px; /* separación entre grupos (sin líneas divisorias) */
}

.sb-nav-grupo {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-nav-titulo {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  padding: 0 12px 2px;
}

.sb-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--sb-text);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.sb-nav-item i {
  font-size: 18px;
  flex-shrink: 0;
}

.sb-nav-item:hover {
  background: var(--sb-hover);
  color: var(--sb-text-strong);
}

.sb-nav-item--active {
  background: var(--sb-active-bg);
  color: var(--sb-active-text);
  font-weight: 600;
}

.sb-nav-item--active:hover {
  background: var(--sb-active-bg);
  color: var(--sb-active-text);
}

/* ── Footer de usuario ───────────────────────────────────────── */
.sb-footer {
  flex-shrink: 0;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sb-user {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.sb-user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sb-user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sb-user-email {
  font-size: 12px;
  color: var(--sb-text-strong);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-user-rol {
  font-size: 11px;
  color: var(--sb-text);
}

.sb-logout {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--sb-text);
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  font-size: 18px;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}

.sb-logout:hover {
  background: var(--color-bg-hover);
  color: var(--sb-text-strong);
}

/* ── Contenido principal ─────────────────────────────────────── */
.layout-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Barra móvil ─────────────────────────────────────────────── */
.topbar-mobile {
  display: none;
}

/* ── Overlay móvil ───────────────────────────────────────────── */
.sb-overlay {
  display: none;
}

/* ── Transición fade ─────────────────────────────────────────── */
.sb-fade-enter-active,
.sb-fade-leave-active {
  transition: opacity 0.2s;
}
.sb-fade-enter-from,
.sb-fade-leave-to {
  opacity: 0;
}

/* ── Responsive ──────────────────────────────────────────────── */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
  }

  /* El drawer móvil siempre va completo: sin toggle de colapso */
  .sb-collapse {
    display: none;
  }

  .sidebar--open {
    transform: translateX(0);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
  }

  .sb-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: calc(var(--z-nav) - 1); /* justo debajo del drawer que cubre */
  }

  .topbar-mobile {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 16px;
    background: var(--color-bg-elevated);
    border-bottom: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm);
    position: sticky;
    top: 0;
    z-index: var(--z-header-mobile);
    flex-shrink: 0;
  }

  .topbar-toggle {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-text-primary);
    padding: 4px;
    display: flex;
    align-items: center;
    font-size: 22px;
    border-radius: 6px;
    transition: background 0.12s;
  }

  .topbar-toggle:hover {
    background: var(--color-bg-hover);
  }

  .topbar-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
  }
}
</style>

<!-- Ajuste global: el site-header de cada vista queda bajo la topbar móvil -->
<style>
@media (max-width: 768px) {
  .layout-main .site-header {
    top: 48px;
  }
}
</style>
