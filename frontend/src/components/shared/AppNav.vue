<script setup>
// Navegación principal del sidebar. Extraído de AppLayout.vue (A-06).
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';

const props = defineProps({
  sidebarColapsado: { type: Boolean, default: false },
  ticketsSinAsignar: { type: Number, default: 0 },
});
const emit = defineEmits(['cerrar-drawer']);

const auth = useAuthStore();

// Nav agrupada semánticamente (propuesta ya validada en design.pen,
// GUIA-UX-UI.md "Sidebar real reagrupado"): día a día arriba, luego
// Personas / Activos y credenciales / Conocimiento y mejora, auditoría
// y catálogos al fondo. Cada grupo lleva un `id` fijo (no el `label`,
// que es copy) para mantener consistencia con las claves de preferencia
// ya persistidas en el sidebar (colapso general).
//
// Sin acordeón por grupo (retirado ago 2026, rediseño de sidebar): con
// solo ~12 ítems el plegado por grupo agregaba más reglas de
// comportamiento que valor (badge que se reubicaba, rail que lo ignoraba,
// estado que había que recordar) — los grupos quedan siempre visibles,
// como encabezados de sección estáticos.
const navGrupos = computed(() => [
  {
    id: 'dia-a-dia',
    label: 'Día a día',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'ti ti-layout-dashboard' },
      { path: '/tickets', label: 'Tickets', icon: 'ti ti-headset', badge: props.ticketsSinAsignar, modulo: 'tickets' },
    ],
  },
  {
    id: 'personas',
    label: 'Personas',
    items: [
      { path: '/empleados', label: 'Empleados', icon: 'ti ti-users', modulo: 'empleados' },
      // Solo JEFE: la migración a empleados y el hard delete que hace esta
      // vista (migración 046) quedan reservados a ese rol.
      ...(auth.esJefe
        ? [{ path: '/personal-registros', label: 'Pre-registro de personal', icon: 'ti ti-id-badge-2' }]
        : []),
    ],
  },
  {
    id: 'activos-credenciales',
    label: 'Activos y credenciales',
    items: [
      { path: '/correos', label: 'Correos', icon: 'ti ti-mail-share', modulo: 'correos' },
      { path: '/licencias', label: 'Licencias', icon: 'ti ti-license', modulo: 'licencias' },
      { path: '/equipos', label: 'Equipos', icon: 'ti ti-devices', modulo: 'equipos' },
    ],
  },
  {
    id: 'conocimiento-mejora',
    label: 'Conocimiento y mejora',
    items: [
      { path: '/base-conocimiento', label: 'Base de Conocimiento', icon: 'ti ti-books', modulo: 'base_conocimiento' },
      { path: '/problemas', label: 'Problemas', icon: 'ti ti-alert-hexagon', modulo: 'problemas' },
      { path: '/encuestas', label: 'Encuestas', icon: 'ti ti-clipboard-list', modulo: 'encuestas' },
    ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    items: [
      // Solo JEFE. Configuración se movió al menú de cuenta (⋮ junto a
      // tema/cerrar sesión, ver AppLayout.vue) — ago 2026, rediseño de
      // sidebar: no es una sección de uso diario, no necesita un ítem
      // de nav propio.
      ...(auth.esJefe
        ? [
            { path: '/actividad', label: 'Actividad', icon: 'ti ti-activity' },
            { path: '/accesos-sensibles', label: 'Accesos sensibles', icon: 'ti ti-shield-lock' },
          ]
        : []),
    ],
  },
  // Grupos sin ítems visibles (ej. "Administración" para ASISTENTE, o
  // cualquier grupo si al integrante le desmarcaron todos sus módulos) no
  // se renderizan — un encabezado sin filas debajo se leería como una
  // sección rota. El filtro por módulo (migración 056, permisos por
  // usuario) va antes del filtro por rol de arriba.
]
  .map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((item) => !item.modulo || auth.puedeVerModulo(item.modulo)),
  }))
  .filter((grupo) => grupo.items.length > 0));
</script>

<template>
  <nav class="sb-nav" aria-label="Navegación">
    <div
      v-for="grupo in navGrupos"
      :key="grupo.id"
      class="sb-nav-grupo"
    >
      <div v-if="grupo.label" class="sb-nav-titulo">{{ grupo.label }}</div>

      <div class="sb-nav-grupo-items">
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
            v-if="item.badge"
            class="badge-count sb-nav-badge"
            :title="`${item.badge} ticket(s) sin asignar`"
          >{{ item.badge }}</span>
        </RouterLink>
      </div>
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
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px; /* separación entre grupos (sin líneas divisorias) */
}

.sb-nav-grupo {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-nav-grupo-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Encabezado de sección estático (sin acordeón, ago 2026): solo etiqueta,
   no es interactivo — sin cursor, sin hover, sin foco propio. */
.sb-nav-titulo {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  padding: 4px 12px 2px;
}

.sb-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
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

.sb-nav-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
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
    padding: 8px 12px;
  }

  .sidebar--colapsado .sb-nav-item {
    justify-content: center;
    padding: 8px 0;
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
