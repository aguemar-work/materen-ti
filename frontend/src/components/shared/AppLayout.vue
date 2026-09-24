<script setup>
// ── Shell raíz: header + SideNav + workspace ──────────────────────────
//
// ANATOMÍA (base PrimeVue/Tailwind, 2026-09-22 — ver frontend/AGENTS.md)
//   Header  56px, blanco, borde inferior de 1px — marca + acciones globales
//   SideNav 256px expandido / 56px en riel, blanco, borde derecho de 1px
//   Content gris 50 — el workspace, donde vive cada módulo
//
// Shell CLARO y fundido (decisión explícita, no por defecto): header y nav
// comparten la superficie blanca y se separan del workspace solo por un
// borde de 1px, no por una capa de color — principios del JEFE en
// docs/NOTAS-DISENO-ANTERIOR.md §2 ("preferir fusión de superficies",
// "minimalista"). Reemplaza al shell oscuro de Carbon (Gray 100/90).
//
// El header sigue concentrando lo que no es navegación de módulo
// (búsqueda global, campana, usuario); el SideNav queda SOLO para navegar.
//
// POR QUÉ FLEX Y NO `position: fixed`
// El shell es un flex de dos filas (header, luego nav + contenido) y el
// contenido es su PROPIO contenedor de scroll: el `sticky top-0` del
// encabezado de cada vista se pega justo debajo del header del shell sin
// necesidad de saber cuánto mide. Solo en móvil el nav pasa a `fixed`
// (panel deslizante sobre el contenido).
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTicketsStore } from '../../stores/tickets.js';
import { insforgeApi } from '../../api/insforge.js';
import { getClient } from '../../api/client.js';
// El nombre del header es marca + descriptor, y marca.js ya tiene las dos
// piezas por separado (NOMBRE_MARCA sobrevive al crecimiento fuera de TI,
// NOMBRE_CORTO no). Se consumen las tres: las dos piezas para el título
// visible y el nombre completo para el alt.
import { NOMBRE_PRODUCTO, NOMBRE_MARCA, NOMBRE_CORTO } from '../../core/marca.js';
import { inicialesDe } from '../../core/avatar.js';
import { ACCION_HEADER } from './shellClases.js';
import { reproducirNotificacion } from '../../core/notificacionSonido.js';
import { useRealtimeRefresco, crearRefrescoDebounced, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import NotificacionesCampana from './NotificacionesCampana.vue';
import AppSearch from './AppSearch.vue';
import AppNav from './AppNav.vue';
import AppNotifications from './AppNotifications.vue';
import MenuAcciones from './MenuAcciones.vue';
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
const auth = useAuthStore();

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
// foco (Modal.vue/ConfirmDialog.vue usan role="dialog") — saltar al
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
// no-leídos). Se reusa pendientesTickets() del Dashboard, no se agrega
// query nueva.
const ticketsSinAsignar = ref(0);
async function cargarSinAsignar() {
  try {
    const { sinAsignar } = await insforgeApi.pendientesTickets();
    ticketsSinAsignar.value = sinAsignar.length;
  } catch {
    // Sin dato fiable: se deja el último valor conocido.
  }
}
onMounted(cargarSinAsignar);

// El sonido debe sonar por cada ticket nuevo, pero el refresco de la lista
// (pesado) se coalesce — ver crearRefrescoDebounced/REFRESCO_LISTA_DEBOUNCE_MS.
const refrescarTickets = crearRefrescoDebounced(
  () => Promise.all([ticketsStore.cargar(), cargarSinAsignar()]),
  { delayMs: REFRESCO_LISTA_DEBOUNCE_MS }
);

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

const nombreUsuario = computed(() => auth.nombre || auth.user?.email || '');
// inicialesDe() y no `nombre[0]`: es la misma función que usa cualquier otro
// avatar del sistema, así el del header muestra dos letras como el de la
// ficha del empleado en vez de una sola. Con solo un correo cae a una letra,
// que es lo que la función devuelve para un string de una palabra.
const inicialesUsuario = computed(() => inicialesDe(nombreUsuario.value) || '?');

// Móvil: panel `fixed` que entra desde la izquierda. Desktop (md+): columna
// estática del flex, 256px o 56px en riel.
const claseNav = computed(() => [
  'z-40 flex flex-col overflow-y-auto border-r border-gray-200 bg-white',
  'fixed bottom-0 left-0 top-14 w-64 transition-transform duration-200',
  navAbierto.value ? 'translate-x-0' : '-translate-x-full',
  'md:static md:translate-x-0 md:transition-[width]',
  navEnRiel.value ? 'md:w-14' : 'md:w-64',
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
  <div class="flex h-screen flex-col overflow-hidden bg-gray-50">
    <!-- ══ Header (56px) ════════════════════════════════════════ -->
    <header class="flex h-14 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-2 sm:px-3" role="banner">
      <button
        :class="ACCION_HEADER"
        type="button"
        :title="navEnRiel ? 'Expandir navegación' : 'Contraer navegación'"
        :aria-label="navEnRiel ? 'Expandir navegación' : 'Contraer navegación'"
        :aria-expanded="!navEnRiel"
        @click="alternarNav"
      >
        <i class="ti ti-menu-2" aria-hidden="true"></i>
      </button>

      <!-- Marca + descriptor. Enlaza al Dashboard, la pantalla de entrada. -->
      <RouterLink
        to="/dashboard"
        class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        @click="cerrarNav"
      >
        <img :src="'/icon_sisti.svg'" :alt="NOMBRE_PRODUCTO" class="h-7 w-7 shrink-0">
        <span class="hidden truncate text-sm sm:inline">
          <span class="font-semibold text-gray-900">{{ NOMBRE_MARCA }}</span>
          <span class="ml-1.5 text-gray-500">{{ NOMBRE_CORTO }}</span>
        </span>
      </RouterLink>

      <!-- Acciones globales, alineadas a la derecha -->
      <div class="ml-auto flex items-center gap-1">
        <AppSearch ref="appSearchRef" @navegado="cerrarNav" />
        <NotificacionesCampana />
        <MenuAcciones
          :class="ACCION_HEADER"
          :acciones="accionesUsuario"
          :label="`Cuenta de ${nombreUsuario}`"
          icono=" "
        >
          <template #trigger>
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700"
              aria-hidden="true"
            >{{ inicialesUsuario }}</span>
          </template>
        </MenuAcciones>
      </div>
    </header>

    <!-- ══ Fila inferior: SideNav + workspace ═══════════════════ -->
    <div class="relative flex min-h-0 flex-1">
      <!-- Velo del panel deslizante (solo móvil) -->
      <transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="navAbierto"
          class="fixed inset-x-0 bottom-0 top-14 z-30 bg-gray-900/30 md:hidden"
          aria-hidden="true"
          @click="cerrarNav"
        />
      </transition>

      <nav :class="claseNav" aria-label="Navegación principal">
        <AppNav
          :nav-en-riel="navEnRiel"
          :tickets-sin-asignar="ticketsSinAsignar"
          @cerrar-nav="cerrarNav"
          @expandir-nav="expandirNav"
        />
      </nav>

      <main class="min-w-0 flex-1 overflow-y-auto">
        <slot />
      </main>
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
