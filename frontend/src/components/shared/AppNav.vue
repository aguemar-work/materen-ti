<script setup>
// Navegación principal del sidebar. Extraído de AppLayout.vue (A-06).
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';

defineProps({
  sidebarColapsado: { type: Boolean, default: false },
  ticketsSinAsignar: { type: Number, default: 0 },
});
const emit = defineEmits(['cerrar-drawer']);

const auth = useAuthStore();

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
      // Solo JEFE: la migración a empleados y el hard delete que hace esta
      // vista (migración 046) quedan reservados a ese rol.
      ...(auth.esJefe
        ? [{ path: '/personal-registros', label: 'Pre-registro de personal', icon: 'ti ti-id-badge-2' }]
        : []),
      { path: '/correos', label: 'Correos', icon: 'ti ti-mail-share' },
      { path: '/licencias', label: 'Licencias', icon: 'ti ti-license' },
      { path: '/equipos', label: 'Equipos', icon: 'ti ti-devices' },
      { path: '/base-conocimiento', label: 'Base de Conocimiento', icon: 'ti ti-books' },
      { path: '/problemas', label: 'Problemas', icon: 'ti ti-alert-hexagon' },
      { path: '/encuestas', label: 'Encuestas', icon: 'ti ti-clipboard-list' },
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
</script>

<template>
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
        @click="emit('cerrar-drawer')"
      >
        <i :class="item.icon" aria-hidden="true"></i>
        <span class="sb-nav-label">{{ item.label }}</span>
        <span
          v-if="item.path === '/tickets' && ticketsSinAsignar"
          class="badge-count sb-nav-badge"
          :title="`${ticketsSinAsignar} ticket(s) sin asignar`"
        >{{ ticketsSinAsignar }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
/* Durante la transición de ancho los labels no deben envolver línea */
.sb-nav-label {
  white-space: nowrap;
}

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
  color: var(--sb-text, var(--color-text-secondary));
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
  background: var(--sb-hover, var(--color-bg-hover));
  color: var(--sb-text-strong, var(--color-text-primary));
}

.sb-nav-item--active {
  background: var(--sb-active-bg, var(--color-accent-subtle));
  color: var(--sb-active-text, var(--color-accent-text));
  font-weight: 600;
}

.sb-nav-item--active:hover {
  background: var(--sb-active-bg, var(--color-accent-subtle));
  color: var(--sb-active-text, var(--color-accent-text));
}

/* Badge de "sin asignar": cola viva, no contador de no-leídos */
.sb-nav-badge {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
}

</style>

<!-- Sin scoped: .sidebar--colapsado vive en el <aside> del layout raíz
     (AppLayout.vue), un componente distinto — el pseudo-selector :global()
     de Vue no propaga el descendiente de esta regla (probado: lo pierde al
     compilar), así que va en un bloque de estilos global. -->
<style>
@media (min-width: 769px) {
  .sidebar--colapsado .sb-nav {
    padding: 10px 12px;
  }

  .sidebar--colapsado .sb-nav-item {
    justify-content: center;
    padding: 9px 0;
    position: relative;
  }

  .sidebar--colapsado .sb-nav-label {
    display: none;
  }

  /* Colapsado: sin títulos de grupo; la separación la da el gap del nav */
  .sidebar--colapsado .sb-nav-titulo {
    display: none;
  }

  .sidebar--colapsado .sb-nav-badge {
    position: absolute;
    top: 2px;
    right: 6px;
    margin-left: 0;
    padding: 1px 5px;
  }
}
</style>
