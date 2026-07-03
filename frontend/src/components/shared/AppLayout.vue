<script setup>
import { ref, computed, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';

const router = useRouter();
const auth = useAuthStore();

const sidebarAbierto = ref(false);

// ── Búsqueda global ───────────────────────────────────────────
const busqueda = ref('');
const resultados = ref({ empleados: [], cuentas: [], equipos: [] });
const buscando = ref(false);
const busquedaAbierta = ref(false);
let debounceTimer = null;

const hayResultados = computed(() =>
  resultados.value.empleados.length ||
  resultados.value.cuentas.length ||
  resultados.value.equipos.length
);

watch(busqueda, (q) => {
  clearTimeout(debounceTimer);
  if (q.trim().length < 2) {
    resultados.value = { empleados: [], cuentas: [], equipos: [] };
    busquedaAbierta.value = false;
    return;
  }
  buscando.value = true;
  busquedaAbierta.value = true;
  debounceTimer = setTimeout(async () => {
    try {
      resultados.value = await insforgeApi.buscarGlobal(q);
    } catch {
      resultados.value = { empleados: [], cuentas: [], equipos: [] };
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
  // Personal con titular → su ficha; compartida/reutilizable → módulo Correos
  if (cuenta.tipo_cuenta === 'personal' && cuenta.titular_id) {
    router.push(`/empleados/${cuenta.titular_id}`);
  } else {
    router.push('/correos');
  }
}

function irAEquipo() {
  limpiarBusqueda();
  router.push('/equipos');
}

const navItems = computed(() => {
  const items = [
    { path: '/dashboard', label: 'Dashboard', icon: 'ti ti-layout-dashboard' },
    { path: '/empleados', label: 'Empleados', icon: 'ti ti-users' },
    { path: '/empresas', label: 'Empresas', icon: 'ti ti-building' },
    { path: '/plataformas', label: 'Plataformas', icon: 'ti ti-apps' },
    { path: '/correos', label: 'Correos', icon: 'ti ti-mail-share' },
    { path: '/licencias', label: 'Licencias', icon: 'ti ti-license' },
    { path: '/equipos', label: 'Equipos', icon: 'ti ti-devices' },
  ];
  if (auth.esJefe) {
    items.push({ path: '/actividad', label: 'Actividad', icon: 'ti ti-activity' });
    items.push({ path: '/staff', label: 'Staff', icon: 'ti ti-shield' });
  }
  return items;
});

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
    <aside class="sidebar" :class="{ 'sidebar--open': sidebarAbierto }" aria-label="Menú principal">
      <div class="sb-logo">
        <div class="sb-logo-icon" aria-hidden="true">
          <i class="ti ti-cpu"></i>
        </div>
        <span class="sb-logo-text">Sistema TI</span>
      </div>

      <!-- Búsqueda global -->
      <div class="sb-busqueda">
        <i class="ti ti-search sb-busqueda-icon" aria-hidden="true"></i>
        <input
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
                @mousedown.prevent="irAEquipo()"
              >
                <i class="ti ti-devices"></i>
                <span class="sb-res-main">{{ eq.codigo }}</span>
                <span class="sb-res-sec">{{ eq.descripcion }}</span>
              </button>
            </template>
          </template>
          <div v-else class="sb-res-vacio">Sin resultados para "{{ busqueda }}"</div>
        </div>
      </div>

      <nav class="sb-nav" aria-label="Navegación">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="sb-nav-item"
          active-class="sb-nav-item--active"
          @click="cerrar"
        >
          <i :class="item.icon" aria-hidden="true"></i>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sb-footer">
        <div class="sb-user">
          <div class="sb-user-avatar" aria-hidden="true">{{ userInitial }}</div>
          <div class="sb-user-info">
            <span class="sb-user-email" :title="auth.user?.email">{{ auth.user?.email }}</span>
            <span class="sb-user-rol">{{ auth.rol ?? 'Staff' }}</span>
          </div>
        </div>
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
        <span class="topbar-title">Sistema TI</span>
      </div>

      <slot />
    </div>
  </div>
</template>

<style scoped>
/* ── Variables del sidebar ───────────────────────────────────── */
.sidebar {
  --sb-w: 240px;
  --sb-bg: #111827;
  --sb-text: #9ca3af;
  --sb-text-strong: #f9fafb;
  --sb-border: rgba(255, 255, 255, 0.08);
  --sb-hover: rgba(255, 255, 255, 0.06);
  --sb-active-bg: rgba(99, 102, 241, 0.18);
  --sb-active-text: #c7d2fe;
  --sb-active-border: #6366f1;
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
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 200;
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
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--sb-border);
  border-radius: 8px;
  outline: none;
}

.sb-busqueda input::placeholder { color: var(--sb-text); }

.sb-busqueda input:focus {
  border-color: var(--sb-active-border);
  background: rgba(255, 255, 255, 0.1);
}

.sb-resultados {
  position: absolute;
  top: calc(100% + 2px);
  left: 14px;
  right: 14px;
  z-index: 300;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  max-height: 340px;
  overflow-y: auto;
  padding: 4px;
}

.sb-res-grupo {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
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

.sb-res-item:hover { background: #eef2ff; }

.sb-res-item i {
  color: #6366f1;
  font-size: 15px;
  flex-shrink: 0;
}

.sb-res-main {
  color: #111827;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.sb-res-sec {
  font-size: 11.5px;
  color: #6b7280;
  white-space: nowrap;
  flex-shrink: 0;
}

.sb-res-vacio {
  padding: 14px 10px;
  font-size: 12.5px;
  color: #6b7280;
  text-align: center;
}

/* ── Logo ────────────────────────────────────────────────────── */
.sb-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 18px;
  border-bottom: 1px solid var(--sb-border);
  flex-shrink: 0;
}

.sb-logo-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
}

.sb-logo-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--sb-text-strong);
  letter-spacing: -0.01em;
}

/* ── Nav ─────────────────────────────────────────────────────── */
.sb-nav {
  flex: 1;
  padding: 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  border-left: 3px solid transparent;
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
  border-left-color: var(--sb-active-border);
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
  border-top: 1px solid var(--sb-border);
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
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
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
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
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

  .sidebar--open {
    transform: translateX(0);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
  }

  .sb-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 199;
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
    z-index: 60;
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
