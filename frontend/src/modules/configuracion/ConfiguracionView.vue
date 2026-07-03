<script setup>
// Centro de configuración: catálogos y administración del sistema.
// Los módulos operativos (Empleados, Correos, Licencias, Equipos)
// viven en el sidebar; aquí va lo que se toca de vez en cuando.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import EmpresasView from '../empresas/EmpresasView.vue';
import PlataformasView from '../plataformas/PlataformasView.vue';
import TiposEquipoPanel from './TiposEquipoPanel.vue';
import UbicacionesPanel from './UbicacionesPanel.vue';
import StaffView from '../staff/StaffView.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const TABS = computed(() => {
  const tabs = [
    { id: 'empresas',     label: 'Empresas',        icon: 'ti ti-building',  componente: EmpresasView },
    { id: 'plataformas',  label: 'Plataformas',     icon: 'ti ti-apps',      componente: PlataformasView },
    { id: 'tipos-equipo', label: 'Tipos de equipo', icon: 'ti ti-devices',   componente: TiposEquipoPanel },
    { id: 'ubicaciones',  label: 'Ubicaciones',     icon: 'ti ti-map-pin',   componente: UbicacionesPanel },
  ];
  if (auth.esJefe) {
    tabs.push({ id: 'staff', label: 'Staff y roles', icon: 'ti ti-shield', componente: StaffView });
  }
  return tabs;
});

// La pestaña vive en la URL (?tab=) para poder enlazar directo
const tabActual = computed(() => {
  const id = route.query.tab;
  return TABS.value.find((t) => t.id === id) || TABS.value[0];
});

function irATab(tab) {
  router.replace({ query: { tab: tab.id } });
}
</script>

<template>
  <div class="config-page">
    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <div class="brand-icon">
            <i class="ti ti-settings" aria-hidden="true"></i>
          </div>
          <div class="brand-text">
            <h1>Sistema TI</h1>
            <span>Módulo: Configuración</span>
          </div>
        </div>
      </div>
      <nav class="config-tabs" aria-label="Secciones de configuración">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="config-tab"
          :class="{ 'config-tab--activa': tab.id === tabActual.id }"
          @click="irATab(tab)"
        >
          <i :class="tab.icon" aria-hidden="true"></i>
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <component :is="tabActual.componente" :key="tabActual.id" />
  </div>
</template>

<style scoped>
.config-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

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
