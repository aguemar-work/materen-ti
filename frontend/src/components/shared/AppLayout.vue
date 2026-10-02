<script setup>
// ── Shell raíz V2: "marco + hoja" (2026-09-25) ────────────────────────
//
// ANATOMÍA
//   Marco   gris 50, ocupa toda la ventana. Sobre él vive el sidebar SIN
//           borde propio: marca arriba, navegación, usuario abajo.
//   Hoja    superficie blanca con esquinas redondeadas, inset de 8px sobre
//           el marco (en desktop; en móvil ocupa todo). Es "la página":
//           barra superior de 48px (menú · migas · búsqueda · campana) y
//           debajo el <main> con su propio scroll.
//
// Por qué así (reemplaza al header blanco de 56px + sidebar blanco con
// borde, 2026-09-22): aquel shell eran tres franjas del mismo blanco
// separadas por líneas, sin contexto de dónde estaba uno. Acá el marco
// agrupa todo lo que es "el sistema" (marca, menú, usuario) y la hoja todo
// lo que es "esta página", con las migas diciendo en qué grupo y módulo
// se está. El ítem activo del menú se dibuja como un pedazo de la hoja
// (ver AppNav.vue), así las dos mitades se leen como una sola pieza.
//
// Sin bordes laterales en ningún nivel (regla de producto): la hoja se
// despega del marco con un anillo de 1px que la rodea entera y una sombra
// mínima, no con una línea vertical.
//
// POR QUÉ FLEX Y NO `position: fixed`: el <main> es su PROPIO contenedor de
// scroll, así el `sticky top-0` de cada vista se pega justo debajo de la
// barra de la hoja sin saber cuánto mide. Solo en móvil el sidebar pasa a
// `fixed` (panel deslizante).
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTicketsStore } from '../../stores/tickets.js';
import { useDashboardStore } from '../../stores/dashboard.js';
import { getClient } from '../../api/client.js';
// El nombre del header es marca + descriptor, y marca.js ya tiene las dos
// piezas por separado (NOMBRE_MARCA sobrevive al crecimiento fuera de TI,
// NOMBRE_CORTO no). Se consumen las tres: las dos piezas para el título
// visible y el nombre completo para el alt.
import { NOMBRE_PRODUCTO, NOMBRE_MARCA, NOMBRE_CORTO } from '../../core/marca.js';
import { ACCION_HEADER } from './shellClases.js';
import { migasDeRuta } from './navegacion.js';
import { reproducirNotificacion } from '../../core/notificacionSonido.js';
import { useRealtimeRefresco, crearRefrescoDebounced, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import NotificacionesCampana from './NotificacionesCampana.vue';
import AppSearch from './AppSearch.vue';
import AppNav from './AppNav.vue';
import AppNotifications from './AppNotifications.vue';
import MenuAcciones from './MenuAcciones.vue';
import AppAvatar from '../ui/AppAvatar.vue';
import { useEsMovil } from '../../composables/useEsMovil.js';
// Única dependencia del shell hacia un módulo de dominio, y es a propósito:
// "editar mi nombre para mostrar" se dispara desde el menú de usuario del
// header, pero el formulario es el MISMO que usa StaffView.vue cuando el
// JEFE edita el de otro (`updateStaff`). Se evaluó moverlo a
// `components/shared/`: sería meter un formulario de dominio (tabla
// `staff`) entre los componentes genéricos, cambiar un problema por otro.
// Queda acá como excepción documentada (ARQ-10, ver
// docs/HISTORIAL-AUDITORIAS.md), pero en carga diferida: es un modal que
// casi nunca se abre y así no viaja en el chunk principal junto al shell.
const StaffNombreForm = defineAsyncComponent(() => import('../../modules/staff/StaffNombreForm.vue'));

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

// Migas de la barra de la hoja: grupo › módulo (› sub-página con nombre
// propio). Salen de la misma estructura que el SideNav (navegacion.js).
const migas = computed(() => migasDeRuta(route.path));

// Conexión realtime única por sesión: las vistas solo se suscriben/
// desuscriben a sus canales (ver useRealtimeRefresco), este layout
// abre y cierra el socket mientras dure la sesión de staff.
// Logs de diagnóstico: no rompen nada, solo ayudan a ver en consola si
// el socket llegó a conectar o por qué no.
onMounted(() => {
  const rt = getClient().realtime;
  rt.on('connect', () => console.info('[realtime] conectado'));
  rt.on('connect_error', (err) => console.warn('[realtime] connect_error:', err));
  rt.on('disconnect', (reason) => console.info('[realtime] desconectado:', reason));
  rt.on('error', (err) => console.warn('[realtime] error:', err));
  rt.connect().catch((err) => console.warn('[realtime] connect() rechazado:', err));
});

onUnmounted(() => {
  getClient().realtime.disconnect();
});

// Atajo global de búsqueda (Ctrl/Cmd+K, patrón Linear/Notion/Vercel/GitHub):
// ahorra el viaje del mouse en el flujo más repetido del día (buscar un
// ticket/empleado/cuenta). No se activa con un modal abierto y atrapando
// foco (AppDialog.vue/ConfirmDialog.vue usan role="dialog") — saltar al
// buscador del header detrás del overlay sería confuso.
const appSearchRef = ref(null);

function onAtajoBusqueda(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
  if (document.activeElement?.closest('[role="dialog"]')) return;
  e.preventDefault();
  appSearchRef.value?.enfocar();
}

onMounted(() => window.addEventListener('keydown', onAtajoBusqueda));
onUnmounted(() => window.removeEventListener('keydown', onAtajoBusqueda));

// Suscripción única a tickets:list, vivida aquí (no en TicketsView) para
// que el sonido de "ticket nuevo" suene sin importar qué pantalla esté
// viendo el staff. El store es un singleton Pinia: llamar cargar() desde
// aquí ya refresca TicketsView si está montada, sin que ella necesite su
// propia suscripción al mismo canal. Se queda en el layout raíz (no en
// AppNotifications) porque también alimenta el badge de AppNav.
const ticketsStore = useTicketsStore();

// Cola viva de tickets sin asignar para el badge del SideNav: baja cuando
// alguien asigna el ticket, no cuando alguien "lo ve" (no es un contador de
// no-leídos). Sale del MISMO store que el Inicio (`resumen.tickets`, RPC
// `dashboard_resumen`): una sola llamada para los dos, que ya no se repite
// aquí. Sin dato fiable (la RPC falló) se conserva el último valor conocido.
const dashboard = useDashboardStore();
const ticketsSinAsignar = computed(() => dashboard.sinAsignar);
onMounted(() => dashboard.cargar({ silencioso: true }));

// El sonido debe sonar por cada ticket nuevo, pero el refresco de la lista
// (pesado) se coalesce — ver crearRefrescoDebounced/REFRESCO_LISTA_DEBOUNCE_MS.
const refrescarTickets = crearRefrescoDebounced(
  () => Promise.all([ticketsStore.cargar(), dashboard.cargar({ silencioso: true })]),
  { delayMs: REFRESCO_LISTA_DEBOUNCE_MS }
);

// Al volver a la pestaña el resumen puede haber envejecido (nadie lo refresca
// en segundo plano): una recarga silenciosa, con el mismo debounce.
const refrescarResumen = crearRefrescoDebounced(
  () => dashboard.cargar({ silencioso: true }),
  { delayMs: REFRESCO_LISTA_DEBOUNCE_MS }
);
function alVolverALaPestana() {
  if (document.visibilityState === 'visible') refrescarResumen();
}
onMounted(() => document.addEventListener('visibilitychange', alVolverALaPestana));
onUnmounted(() => document.removeEventListener('visibilitychange', alVolverALaPestana));

useRealtimeRefresco('tickets:list', (payload) => {
  if (payload?.op === 'INSERT') reproducirNotificacion();
  refrescarTickets();
});

// ── Estado del SideNav ────────────────────────────────────────
// Dos mecanismos distintos, no uno con dos nombres:
//   navAbierto   solo móvil (<768px, el breakpoint `md` de Tailwind): el nav es un panel deslizante sobre
//                el contenido, con velo detrás. Se abre desde el botón de
//                menú del header y se cierra al navegar o al tocar el velo.
//   navEnRiel    solo desktop: el nav se contrae a 48px y deja solo los
//                íconos (riel). Es una preferencia, y se recuerda.
const navAbierto = ref(false);

const CLAVE_NAV = 'sistema-ti-sidebar';
// Sin preferencia guardada: riel por defecto por debajo de 1056px (el punto
// que ya usaba el shell anterior). Así el nav no le compite el ancho al
// contenido en una laptop sin que el usuario tenga que descubrir el toggle.
// Quien ya eligió una vez, siempre gana esa elección sobre el tamaño de
// ventana. La clave de localStorage NO cambia de nombre a propósito: quien
// tenía el sidebar colapsado antes del rediseño abre con el riel puesto, en
// vez de perder su preferencia.
const preferenciaNavGuardada = localStorage.getItem(CLAVE_NAV);
const navEnRiel = ref(
  preferenciaNavGuardada
    ? preferenciaNavGuardada === 'colapsado'
    : window.innerWidth <= 1056
);

// El botón de menú del header hace dos cosas distintas según el ancho, y es
// la misma cosa desde el punto de vista del usuario ("mostrame/escondeme la
// navegación"): en móvil abre el panel, en desktop alterna el riel.
function alternarNav() {
  if (window.innerWidth < 768) {
    navAbierto.value = !navAbierto.value;
    return;
  }
  navEnRiel.value = !navEnRiel.value;
  localStorage.setItem(CLAVE_NAV, navEnRiel.value ? 'colapsado' : 'expandido');
}

function expandirNav() {
  navEnRiel.value = false;
  localStorage.setItem(CLAVE_NAV, 'expandido');
}

function cerrarNav() {
  navAbierto.value = false;
}

// El mismo botón hace dos cosas según el ancho; su nombre accesible y su
// aria-expanded tienen que decir la verdad en cada caso.
const { esMovil } = useEsMovil();
const etiquetaNav = computed(() => {
  if (esMovil.value) return navAbierto.value ? 'Cerrar menú' : 'Abrir menú';
  return navEnRiel.value ? 'Expandir navegación' : 'Contraer navegación';
});

// El avatar del bloque de usuario es AppAvatar: mismas iniciales y mismo
// tono estable que esa persona tiene en cualquier otra pantalla.
const nombreUsuario = computed(() => auth.nombre || auth.user?.email || '');
const rolUsuario = computed(() => (auth.esJefe ? 'Jefe de TI' : 'Asistente de TI'));

// Móvil: panel `fixed` que entra desde la izquierda, blanco y con sombra
// (flota sobre la hoja). Desktop (md+): columna estática del marco, sin
// fondo propio — 240px, o 64px en riel.
const claseNav = computed(() => [
  'z-40 flex flex-col',
  'fixed inset-y-0 left-0 w-72 bg-white shadow-xl transition-transform duration-200',
  navAbierto.value ? 'translate-x-0' : '-translate-x-full',
  'md:static md:translate-x-0 md:bg-transparent md:shadow-none md:transition-[width]',
  navEnRiel.value ? 'md:w-16' : 'md:w-60',
]);

const mostrarEditarNombre = ref(false);

function onNombreGuardado(actualizado) {
  auth.actualizarNombre(actualizado.nombre);
}

// Menú de usuario del header (avatar con iniciales).
// Configuración sigue acá y además tiene ítem propio en el SideNav: es la
// entrada de "administrar el sistema", y llegar solo por un menú "⋮" era
// un hallazgo abierto (un usuario nuevo no asocia "⋮" con "catálogos").
const accionesUsuario = computed(() => [
  { icono: 'ti-pencil', label: 'Editar mi nombre', onClick: () => { mostrarEditarNombre.value = true; } },
  { icono: 'ti-settings', label: 'Configuración', onClick: () => router.push('/configuracion') },
  { separador: true },
  { icono: 'ti-logout', label: 'Cerrar sesión', onClick: cerrarSesion },
]);

async function cerrarSesion() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <!-- ══ Marco ══════════════════════════════════════════════════ -->
  <!-- data-marco / data-hoja: ganchos de styles/impresion.css (en papel el
       marco, el menú y la barra de la hoja desaparecen y la hoja es A4). -->
  <div data-marco class="flex h-screen overflow-hidden bg-gray-50">
    <!-- Velo del panel deslizante (solo móvil) -->
    <transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="navAbierto"
        class="fixed inset-0 z-30 bg-gray-900/30 md:hidden"
        aria-hidden="true"
        @click="cerrarNav"
      />
    </transition>

    <!-- ── Sidebar: marca · navegación · usuario ── -->
    <aside :class="claseNav">
      <!-- Marca. Mismo alto que la barra de la hoja + su margen superior,
           para que marca y migas queden en la misma línea. -->
      <RouterLink
        to="/dashboard"
        class="mx-2 mt-2 flex h-12 shrink-0 items-center gap-2.5 rounded-lg px-2 transition-colors duration-150 hover:bg-gray-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :class="{ 'md:justify-center md:px-0': navEnRiel }"
        @click="cerrarNav"
      >
        <img :src="'/icon_sisti.svg'" :alt="NOMBRE_PRODUCTO" class="h-7 w-7 shrink-0">
        <span class="min-w-0 leading-tight" :class="{ 'md:sr-only': navEnRiel }">
          <span class="block truncate text-sm font-semibold text-gray-900">{{ NOMBRE_MARCA }}</span>
          <span class="block truncate text-xs text-gray-500">{{ NOMBRE_CORTO }}</span>
        </span>
      </RouterLink>

      <nav class="min-h-0 flex-1 overflow-y-auto pb-2" aria-label="Navegación principal">
        <AppNav
          :nav-en-riel="navEnRiel"
          :tickets-sin-asignar="ticketsSinAsignar"
          @cerrar-nav="cerrarNav"
          @expandir-nav="expandirNav"
        />
      </nav>

      <!-- Usuario: quién está trabajando y con qué rol. Abre el menú de cuenta. -->
      <div class="shrink-0 px-2 pb-2">
        <MenuAcciones
          class="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-150 hover:bg-gray-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          :class="{ 'md:justify-center': navEnRiel }"
          :acciones="accionesUsuario"
          :label="`Cuenta de ${nombreUsuario}`"
          icono=" "
        >
          <template #trigger>
            <AppAvatar :nombre="nombreUsuario" />
            <span class="min-w-0 flex-1" :class="{ 'md:hidden': navEnRiel }">
              <span class="block truncate text-sm font-medium text-gray-900">{{ nombreUsuario }}</span>
              <span class="block truncate text-xs text-gray-500">{{ rolUsuario }}</span>
            </span>
            <i class="ti ti-selector shrink-0 text-gray-400" :class="{ 'md:hidden': navEnRiel }" aria-hidden="true"></i>
          </template>
        </MenuAcciones>
      </div>
    </aside>

    <!-- ══ Hoja ═══════════════════════════════════════════════════ -->
    <div class="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
      <div data-hoja class="flex min-h-0 flex-1 flex-col overflow-hidden bg-white md:rounded-xl md:shadow-xs md:ring-1 md:ring-gray-900/[0.07]">
        <!-- Barra de la hoja: menú · migas · acciones globales -->
        <header class="flex h-12 shrink-0 items-center gap-2 border-b border-gray-100 px-3 sm:px-4">
          <button
            :class="ACCION_HEADER"
            type="button"
            :title="etiquetaNav"
            :aria-label="etiquetaNav"
            :aria-expanded="esMovil ? navAbierto : !navEnRiel"
            @click="alternarNav"
          >
            <i class="ti ti-menu-2 md:hidden" aria-hidden="true"></i>
            <i
              class="ti hidden md:inline"
              :class="navEnRiel ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'"
              aria-hidden="true"
            ></i>
          </button>

          <nav v-if="migas.length" class="min-w-0 flex-1" aria-label="Ubicación">
            <ol class="flex min-w-0 items-center gap-1.5 text-sm">
              <li v-for="(m, i) in migas" :key="i" class="flex min-w-0 items-center gap-1.5">
                <i v-if="i > 0" class="ti ti-chevron-right shrink-0 text-xs text-gray-400" aria-hidden="true"></i>
                <RouterLink
                  v-if="m.to"
                  :to="m.to"
                  class="truncate rounded text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >{{ m.label }}</RouterLink>
                <span
                  v-else
                  class="truncate"
                  :class="i === migas.length - 1 ? 'font-medium text-gray-900' : 'text-gray-500'"
                  :aria-current="i === migas.length - 1 ? 'page' : undefined"
                >{{ m.label }}</span>
              </li>
            </ol>
          </nav>
          <div v-else class="flex-1"></div>

          <div class="flex shrink-0 items-center gap-1">
            <AppSearch ref="appSearchRef" @navegado="cerrarNav" />
            <NotificacionesCampana />
          </div>
        </header>

        <main class="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <slot />
        </main>
      </div>
    </div>

    <AppNotifications />

    <StaffNombreForm
      v-if="mostrarEditarNombre"
      :miembro="{ user_id: auth.user?.id, nombre: auth.nombre }"
      @cerrar="mostrarEditarNombre = false"
      @guardado="onNombreGuardado"
    />
  </div>
</template>
