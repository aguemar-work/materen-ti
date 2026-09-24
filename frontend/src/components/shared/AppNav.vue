<script setup>
// SideNav del shell. Extraído de AppLayout.vue (A-06).
//
// La estructura de la navegación —áreas → grupos → ítems, y qué ítem está
// en qué grupo— es la del 2026-09-01; el rediseño del 2026-09-22 (base
// PrimeVue/Tailwind, shell claro) solo cambió cómo se ve:
//   · Superficie blanca, fundida con el header; se separa del workspace por
//     un borde de 1px (ver la cabecera de AppLayout.vue).
//   · Ítem activo: fondo azul tenue + texto azul + barra izquierda de 2px
//     (principios del JEFE: hover/activo sin bordes, acento ≤2px y solo a
//     la izquierda — docs/NOTAS-DISENO-ANTERIOR.md §2).
//   · En el riel (solo desktop, md+) se ocultan rótulos y textos; el badge
//     pasa a un punto sobre el ícono. En móvil el panel siempre va completo.
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { ROTULO_GRUPO } from './shellClases.js';

const props = defineProps({
  navEnRiel: { type: Boolean, default: false },
  ticketsSinAsignar: { type: Number, default: 0 },
});
const emit = defineEmits(['cerrar-nav', 'expandir-nav']);

const auth = useAuthStore();

// Nav agrupada por intención de uso, no por tabla/entidad de origen (Plan
// Maestro v2, 2026-09-04): Dashboard solo (pantalla de entrada, sin grupo
// propio con rótulo) → Mesa de Ayuda (Tickets, Base de Conocimiento,
// Problemas: todo lo que gira en torno a resolver un caso) → Gestión de
// Personal (Empleados) → Inventario Global (Correos, Licencias, Equipos: lo
// que se entrega/asigna) → Administración. Cada grupo lleva un `id` fijo (no
// el `label`, que es copy).
//
// Encuestas se queda en Mesa de Ayuda como ítem propio: la idea de fundirla
// en un reporte de calidad del Helpdesk requiere una superficie de reportes
// que hoy no existe — moverla ahí sin esa pantalla le quitaría acceso, no
// se lo daría en otro lado.
//
// Gestión de Personal queda con un solo ítem (Empleados) a propósito: es el
// lugar reservado para Onboarding/Offboarding si en algún momento se separan
// de la ficha del empleado como pantallas propias — mismo criterio que
// "Personas" en 2026-08-29 (no forzar variedad artificial en un grupo).
//
// Esto reagrupa GRUPOS, no Áreas: el nivel de Áreas (ver más abajo) sigue
// reservado para cuando el sistema crezca a dominios no-TI (RRHH, Finanzas
// — `docs/PANORAMA-SISTEMA.md` §6), no para esta taxonomía.
//
// Sin acordeón por grupo (retirado ago 2026): con ~12 ítems el plegado
// agregaba más reglas de comportamiento que valor. Los grupos quedan
// siempre visibles, como encabezados de sección estáticos — que es también
// lo que hace el SideNav de Carbon cuando no hay sub-navegación real.
//
// ── Áreas (Plan Maestro, 2026-09-01) ─────────────────────────────────
// Nivel nuevo por encima de los grupos: preparar la estructura para que
// quepa una segunda área (fuera de TI, ver docs/PANORAMA-SISTEMA.md §6)
// sin rehacer el nav de nuevo cuando eso pase — no significa que exista
// una segunda área hoy. Con una sola área (como ahora) el nav se ve
// IDÉNTICO: el encabezado de área solo se renderiza si hay más de una.
const AREAS = [
  {
    id: 'ti',
    label: 'TI',
    grupos: [
      {
        id: 'general',
        label: '',
        items: [
          { path: '/dashboard', label: 'Dashboard', icon: 'ti ti-layout-dashboard' },
        ],
      },
      {
        id: 'mesa-de-ayuda',
        label: 'Mesa de Ayuda',
        items: [
          { path: '/tickets', label: 'Tickets', icon: 'ti ti-headset', badgeSinAsignar: true, modulo: 'tickets' },
          { path: '/base-conocimiento', label: 'Base de Conocimiento', icon: 'ti ti-books', modulo: 'base_conocimiento' },
          { path: '/problemas', label: 'Problemas', icon: 'ti ti-alert-hexagon', modulo: 'problemas' },
          { path: '/encuestas', label: 'Encuestas', icon: 'ti ti-clipboard-list', modulo: 'encuestas' },
        ],
      },
      {
        id: 'gestion-personal',
        label: 'Gestión de Personal',
        items: [
          { path: '/empleados', label: 'Empleados', icon: 'ti ti-users', modulo: 'empleados' },
        ],
      },
      {
        id: 'inventario-global',
        label: 'Inventario Global',
        items: [
          { path: '/correos', label: 'Correos', icon: 'ti ti-mail-share', modulo: 'correos' },
          { path: '/licencias', label: 'Licencias', icon: 'ti ti-license', modulo: 'licencias' },
          { path: '/equipos', label: 'Equipos', icon: 'ti ti-devices', modulo: 'equipos' },
        ],
      },
      {
        id: 'administracion',
        label: 'Administración',
        items: [
          // Actividad (auditoría) y Accesos sensibles son EXCLUSIVOS de
          // JEFE, y el filtro de acá acompaña al guard real de la ruta
          // (`meta: { roles: ['jefe'] }` en actividad.routes.js /
          // staff.routes.js). El sidebar nunca es la barrera: es el reflejo
          // de ella.
          ...(auth.esJefe
            ? [
                { path: '/actividad', label: 'Actividad', icon: 'ti ti-activity' },
                { path: '/accesos-sensibles', label: 'Accesos sensibles', icon: 'ti ti-shield-lock' },
              ]
            : []),
          // Configuración NO es exclusiva de JEFE, y es importante no
          // "arreglarlo": de sus 7 pestañas, 6 (Empresas, Áreas/Obras,
          // Plataformas, Tipos de equipo, Ubicaciones, Categorías de
          // ticket) están abiertas a cualquier staff activo — la única
          // restringida es Staff, que declara su propio
          // `meta: { roles: ['jefe'] }` y redirige a Empresas
          // (config.routes.js). Esconder la entrada entera al ASISTENTE le
          // quitaría 6 secciones que sí puede usar.
          //
          // Vuelve a tener ítem de nav propio (lo había perdido en el
          // rediseño de sidebar de ago 2026, cuando se movió al menú "⋮"):
          // ahora que la navegación no comparte espacio con búsqueda,
          // campana ni usuario, el argumento de "no es de uso diario, no
          // gasta una fila" ya no aplica. Sigue estando además en el menú
          // de usuario del header, para quien ya aprendió ese camino.
          { path: '/configuracion', label: 'Configuración', icon: 'ti ti-settings' },
        ],
      },
      // Grupos sin ítems visibles (cualquier grupo si al integrante le
      // desmarcaron todos sus módulos) no se renderizan — un encabezado sin
      // filas debajo se leería como una sección rota. El filtro por módulo
      // (migración 056, permisos por usuario) va después del filtro por rol.
    ],
  },
];

const navAreas = computed(() => AREAS
  .map((area) => ({
    ...area,
    grupos: area.grupos
      .map((grupo) => ({
        ...grupo,
        // El badge se resuelve ACÁ, dentro del computed, y no en la constante
        // AREAS: antes era `badge: props.ticketsSinAsignar` en AREAS, que se
        // evalúa una sola vez al montar — el badge quedaba congelado en el
        // valor inicial (0) aunque AppLayout lo actualizara por realtime.
        items: grupo.items
          .filter((item) => !item.modulo || auth.puedeVerModulo(item.modulo))
          .map((item) => ({ ...item, badge: item.badgeSinAsignar ? props.ticketsSinAsignar : 0 })),
      }))
      .filter((grupo) => grupo.items.length > 0),
  }))
  .filter((area) => area.grupos.length > 0));

// Click en un ítem: en móvil cierra el panel deslizante; en el riel no hace
// falta expandir (el ícono ya llevó a destino).
function alNavegar() {
  emit('cerrar-nav');
}

// En el riel, el rótulo del grupo no se ve. El botón de expandir de abajo
// existe para que el riel no sea un callejón sin salida cuando alguien no
// reconoce un ícono: da un camino al nav completo sin ir al header.
function expandir() {
  emit('expandir-nav');
}

// Base del link; el estado activo lo agrega RouterLink vía `active-class`.
// `relative` es para el punto del badge en el riel.
const CLASE_LINK =
  'relative flex h-9 items-center gap-3 rounded-md px-3 text-sm text-gray-700 ' +
  'transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
const CLASE_LINK_ACTIVO =
  'bg-primary-50! text-primary-700! font-medium shadow-[inset_2px_0_0_var(--color-primary-500)]';
</script>

<template>
  <div class="flex min-h-full flex-col">
    <div class="flex-1 space-y-1 px-2 py-3">
      <template v-for="area in navAreas" :key="area.id">
        <!-- Encabezado de área: solo aparece el día que haya más de una — con
             una sola área (hoy) esto no renderiza nada. -->
        <div
          v-if="navAreas.length > 1"
          class="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
          :class="{ 'md:hidden': navEnRiel }"
        >{{ area.label }}</div>

        <div v-for="grupo in area.grupos" :key="grupo.id" class="space-y-0.5">
          <div v-if="grupo.label" :class="[ROTULO_GRUPO, { 'md:hidden': navEnRiel }]">{{ grupo.label }}</div>

          <RouterLink
            v-for="item in grupo.items"
            :key="item.path"
            :to="item.path"
            :class="[CLASE_LINK, { 'md:justify-center md:px-0': navEnRiel }]"
            :active-class="CLASE_LINK_ACTIVO"
            :title="navEnRiel ? item.label : null"
            @click="alNavegar"
          >
            <i class="text-lg" :class="item.icon" aria-hidden="true"></i>
            <span class="truncate" :class="{ 'md:sr-only': navEnRiel }">{{ item.label }}</span>
            <span
              v-if="item.badge"
              class="ml-auto rounded-full bg-primary-100 px-1.5 text-xs font-medium leading-5 text-primary-700"
              :class="{ 'md:absolute md:right-1 md:top-1 md:ml-0 md:h-2 md:w-2 md:overflow-hidden md:bg-primary-500 md:p-0 md:text-[0px]': navEnRiel }"
              :title="`${item.badge} ticket(s) sin asignar`"
            >{{ item.badge }}</span>
          </RouterLink>
        </div>
      </template>
    </div>

    <!-- Pie del riel: única salida del riel sin subir al header (solo desktop) -->
    <button
      v-if="navEnRiel"
      class="mx-2 mb-3 hidden h-9 items-center justify-center rounded-md text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 md:flex"
      type="button"
      title="Expandir navegación"
      aria-label="Expandir navegación"
      @click="expandir"
    >
      <i class="ti ti-chevron-right" aria-hidden="true"></i>
    </button>
  </div>
</template>
