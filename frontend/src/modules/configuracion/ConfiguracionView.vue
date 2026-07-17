<script setup>
// Centro de configuración: catálogos y administración del sistema.
// Los módulos operativos (Empleados, Correos, Licencias, Equipos)
// viven en el sidebar; aquí va lo que se toca de vez en cuando.
// Layout de pestañas: cada pestaña es una ruta hija (/configuracion/<seccion>,
// ver router/routes/config.routes.js) que se renderiza en el RouterView.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import PageHeader from '../../components/shared/PageHeader.vue';

const route = useRoute();
const auth = useAuthStore();

const TABS = computed(() => {
  const tabs = [
    { name: 'configuracion-empresas',          label: 'Empresas',        icon: 'ti ti-building' },
    { name: 'configuracion-areas-obras',       label: 'Áreas/Obras',     icon: 'ti ti-building-community' },
    { name: 'configuracion-plataformas',       label: 'Plataformas',     icon: 'ti ti-apps' },
    { name: 'configuracion-tipos-equipo',      label: 'Tipos de equipo', icon: 'ti ti-devices' },
    { name: 'configuracion-ubicaciones',       label: 'Ubicaciones',     icon: 'ti ti-map-pin' },
    { name: 'configuracion-categorias-ticket', label: 'Categorías de tickets', icon: 'ti ti-headset' },
  ];
  if (auth.esJefe) {
    tabs.push({ name: 'configuracion-staff', label: 'Staff y roles', icon: 'ti ti-shield' });
  }
  return tabs;
});
</script>

<template>
  <div class="config-page vista-modulo">
    <PageHeader titulo="Configuración" icono="ti ti-settings">
      <template #extra>
      <nav class="config-tabs" aria-label="Secciones de configuración">
        <!-- replace: cambiar de pestaña no apila entradas en el historial -->
        <RouterLink
          v-for="tab in TABS"
          :key="tab.name"
          :to="{ name: tab.name }"
          replace
          class="config-tab"
          :class="{ 'config-tab--activa': route.name === tab.name }"
        >
          <i :class="tab.icon" aria-hidden="true"></i>
          {{ tab.label }}
        </RouterLink>
      </nav>
      </template>
    </PageHeader>

    <RouterView />
  </div>
</template>

<style scoped>
.config-tabs {
  display: flex;
  gap: 2px;
  padding: 0 24px;
  overflow-x: auto;
}

.config-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.config-tab:hover {
  color: var(--color-text-primary);
}

.config-tab--activa {
  color: var(--color-primary, var(--color-accent));
  border-bottom-color: var(--color-primary, var(--color-accent));
  font-weight: 600;
}

.config-tab i {
  font-size: 15px;
}
</style>
