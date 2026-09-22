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


