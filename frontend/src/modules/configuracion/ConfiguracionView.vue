<script setup>
// Centro de configuración: catálogos y administración del sistema.
// Los módulos operativos (Empleados, Correos, Licencias, Equipos)
// viven en el sidebar principal; aquí va lo que se toca de vez en cuando.
// Layout de secciones (receta 4.4, rediseño 2026-09-23): cada sección es una
// ruta hija (/configuracion/<seccion>, ver router/routes/config.routes.js)
// que se renderiza en el RouterView, junto a una lista vertical de secciones.
// En móvil la misma lista pasa a una fila horizontal desplazable (sin
// empujar el ancho de la página).
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';

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

const ITEM =
  'inline-flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ' +
  'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 md:w-full';
const ITEM_INACTIVO = 'text-gray-600 hover:bg-gray-100 hover:text-gray-900';
const ITEM_ACTIVO = 'bg-primary-50 text-primary-700';
</script>

<template>
  <div class="flex min-h-full flex-col">
    <AppEncabezado titulo="Configuración" subtitulo="Catálogos que alimentan al resto de los módulos y administración del equipo de TI" />

    <div class="grid min-w-0 flex-1 items-start gap-6 px-4 pb-10 sm:px-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <nav
        class="-mx-4 min-w-0 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:sticky md:top-5 md:mx-0 md:overflow-visible md:px-0"
        aria-label="Secciones de configuración"
      >
        <ul class="flex gap-1 md:flex-col">
          <li v-for="tab in TABS" :key="tab.name" class="shrink-0">
            <!-- replace: cambiar de sección no apila entradas en el historial -->
            <RouterLink v-slot="{ href, navigate, isActive }" :to="{ name: tab.name }" replace custom>
              <a
                :href="href"
                :class="[ITEM, isActive ? ITEM_ACTIVO : ITEM_INACTIVO]"
                :aria-current="isActive ? 'page' : undefined"
                @click="navigate"
              >
                <i :class="tab.icon" class="text-base" aria-hidden="true"></i>
                {{ tab.label }}
              </a>
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div class="min-w-0">
        <RouterView />
      </div>
    </div>
  </div>
</template>
