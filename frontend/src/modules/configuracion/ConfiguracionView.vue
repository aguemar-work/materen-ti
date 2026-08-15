<script setup>
// Centro de configuración: catálogos y administración del sistema.
// Los módulos operativos (Empleados, Correos, Licencias, Equipos)
// viven en el sidebar principal; aquí va lo que se toca de vez en cuando.
// Layout de sidebar propio: cada sección es una ruta hija
// (/configuracion/<seccion>, ver router/routes/config.routes.js) que se
// renderiza en el RouterView, junto a un menú vertical de secciones
// (mismo patrón visual que AppNav.vue, a menor escala).
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import PageHeader from '../../components/shared/PageHeader.vue';

const auth = useAuthStore();

// Orden fijado por el JEFE (ago 2026): Empresas, Ubicaciones, Áreas/Obras,
// Staff y roles, Plataformas, Tipos de equipo, Categorías de tickets.
const TABS = computed(() => {
  const tabs = [
    { name: 'configuracion-empresas',    label: 'Empresas',    icon: 'ti ti-building' },
    { name: 'configuracion-ubicaciones', label: 'Ubicaciones', icon: 'ti ti-map-pin' },
    { name: 'configuracion-areas-obras', label: 'Áreas/Obras', icon: 'ti ti-building-community' },
  ];
  if (auth.esJefe) {
    tabs.push({ name: 'configuracion-staff', label: 'Staff y roles', icon: 'ti ti-shield' });
  }
  tabs.push(
    { name: 'configuracion-plataformas',       label: 'Plataformas',           icon: 'ti ti-apps' },
    { name: 'configuracion-tipos-equipo',      label: 'Tipos de equipo',       icon: 'ti ti-devices' },
    { name: 'configuracion-categorias-ticket', label: 'Categorías de tickets', icon: 'ti ti-headset' },
  );
  return tabs;
});
</script>

<template>
  <div class="config-page vista-modulo">
    <PageHeader titulo="Configuración" icono="ti ti-settings" />

    <div class="config-layout">
      <nav class="config-sidebar" aria-label="Secciones de configuración">
        <!-- replace: cambiar de sección no apila entradas en el historial -->
        <RouterLink
          v-for="tab in TABS"
          :key="tab.name"
          :to="{ name: tab.name }"
          replace
          class="config-sidebar-item"
          active-class="config-sidebar-item--activa"
        >
          <i :class="tab.icon" aria-hidden="true"></i>
          {{ tab.label }}
        </RouterLink>
      </nav>

      <div class="config-content">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
.config-layout {
  flex: 1;
  min-height: 0;
  display: flex;
}

.config-sidebar {
  width: 220px;
  flex-shrink: 0;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  border-right: 1px solid var(--color-border-subtle);
}

.config-sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.config-sidebar-item i {
  font-size: 17px;
  flex-shrink: 0;
}

.config-sidebar-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.config-sidebar-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.config-sidebar-item--activa {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
  font-weight: 600;
}

.config-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .config-layout {
    flex-direction: column;
  }

  .config-sidebar {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: visible;
    gap: 4px;
    padding: 10px 16px;
    border-right: none;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .config-sidebar-item {
    white-space: nowrap;
  }
}
</style>
