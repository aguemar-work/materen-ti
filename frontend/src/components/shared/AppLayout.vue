<script setup>
// ── Shell raíz: UI Shell de IBM Carbon v11 ────────────────────────────
//
// ANATOMÍA (docs/GUIA-UX-UI.md, "Anatomía del shell")
//   Header  48px, Gray 100 (#161616) — marca + acciones globales
//   SideNav 256px expandido / 48px en riel, Gray 90 (#262626) — navegación
//   Content Gray 10 (#f4f4f4) — el workspace, donde vive cada módulo
//
// Reemplaza al shell anterior (sidebar de 240px que se FUNDÍA con el fondo
// del contenido, sin header en desktop). Los tres cambios de fondo, con su
// motivo, porque no son estéticos:
//
//   1. Aparece un header en desktop. Antes solo existía en móvil. Todo lo
//      que no es navegación de módulo salió del sidebar y subió acá:
//      búsqueda global, campana e identidad del usuario. El SideNav queda
//      SOLO para navegar, que es lo que Carbon llama un shell "de una
//      responsabilidad por región" — antes el pie del sidebar apilaba
//      avatar + nombre + rol + 3 botones de ícono en 240px de ancho y el
//      nombre truncaba (por eso tema y logout se habían condensado en un
//      menú "⋮"; ese apretujamiento ya no existe).
//   2. El shell es OSCURO en los dos temas. No es "el header del tema
//      oscuro": en Carbon el shell es Gray 100/90 siempre, y el tema
//      claro/oscuro solo gobierna el workspace. Por eso consume tokens
//      `--cds-shell-*` y no roles `--color-*` (ver la cabecera de
//      styles/carbon-theme.css, sección 6).
//   3. Hay separación real entre navegación y contenido. Antes el sidebar
//      usaba `--color-bg` (el mismo fondo del contenido) y se apoyaba en
//      un borde de 1px para distinguirse; ahora la distinción es la capa
//      de gris, que es como Carbon resuelve jerarquía sin sombras.
//
// POR QUÉ FLEX Y NO `position: fixed`
// La implementación de Carbon fija el header y el SideNav y compensa el
// contenido con `margin-left`/`padding-top`. Acá el shell es un flex de
// dos filas (header, luego nav + contenido) y el resultado visual es el
// mismo, con una ventaja concreta: el contenido es su PROPIO contenedor de
// scroll, así que el `position: sticky; top: 0` del `.site-header` de cada
// vista (el h1 del módulo) se pega justo debajo del header del shell sin
// necesidad de saber que el shell mide 48px. Con `fixed` había que
// escribir `top: 48px` en una regla global aparte — que es exactamente lo
// que hacía el bloque `<style>` sin scoped al final de la versión
// anterior de este archivo, y que acá desaparece.
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTicketsStore } from '../../stores/tickets.js';
import { insforgeApi } from '../../api/insforge.js';
import { getClient } from '../../api/client.js';
import { temaActual, alternarTema } from '../../core/tema.js';
// El HeaderName de Carbon es prefijo + nombre, y marca.js ya tenia las dos
// piezas por separado desde antes de este rediseno (NOMBRE_MARCA sobrevive
// al crecimiento fuera de TI, NOMBRE_CORTO no). Se consumen las tres: las
// dos piezas para el titulo visible y el nombre completo para el alt.
import { NOMBRE_PRODUCTO, NOMBRE_MARCA, NOMBRE_CORTO } from '../../core/marca.js';
import { tonoAvatar, inicialesDe } from '../../core/avatar.js';
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
//   navAbierto   solo móvil (≤768px): el nav es un panel deslizante sobre
//                el contenido, con velo detrás. Se abre desde el botón de
//                menú del header y se cierra al navegar o al tocar el velo.
//   navEnRiel    solo desktop: el nav se contrae a 48px y deja solo los
//                íconos (el "rail" de Carbon). Es una preferencia, y se
//                recuerda.
const navAbierto = ref(false);

const CLAVE_NAV = 'sistema-ti-sidebar';
// Sin preferencia guardada: riel por defecto por debajo de 1056px, que es
// el breakpoint `lg` de la grilla de Carbon y el punto donde su propio
// shell empieza a esconder el SideNav. Así el nav no le compite el ancho al
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
  if (window.innerWidth <= 768) {
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

// ── Tema claro/oscuro ─────────────────────────────────────────
// Gobierna el WORKSPACE, no el shell: el header y el nav son Gray 100/90
// en los dos temas (ver la nota 2 de la cabecera).
const tema = ref(temaActual());

function toggleTema() {
  tema.value = alternarTema();
}

const nombreUsuario = computed(() => auth.nombre || auth.user?.email || '');
// inicialesDe() y no `nombre[0]`: es la misma función que usa cualquier otro
// avatar del sistema, así el del header muestra dos letras como el de la
// ficha del empleado en vez de una sola. Con solo un correo cae a una letra,
// que es lo que la función devuelve para un string de una palabra.
const inicialesUsuario = computed(() => inicialesDe(nombreUsuario.value) || '?');

const mostrarEditarNombre = ref(false);

function onNombreGuardado(actualizado) {
  auth.actualizarNombre(actualizado.nombre);
}

// Menú de usuario del header (HeaderGlobalAction con avatar en Carbon).
// Configuración sigue acá y además tiene ítem propio en el SideNav: es la
// entrada de "administrar el sistema", y llegar solo por un menú "⋮" era
// un hallazgo abierto (un usuario nuevo no asocia "⋮" con "catálogos").
const accionesUsuario = computed(() => [
  { icono: 'ti-pencil', label: 'Editar mi nombre', onClick: () => { mostrarEditarNombre.value = true; } },
  { icono: 'ti-settings', label: 'Configuración', onClick: () => router.push('/configuracion') },
  { separador: true },
  {
    icono: tema.value === 'dark' ? 'ti-sun' : 'ti-moon',
    label: tema.value === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
    onClick: toggleTema,
  },
  { separador: true },
  { icono: 'ti-logout', label: 'Cerrar sesión', onClick: cerrarSesion },
]);

async function cerrarSesion() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="cds-shell">
    <!-- ══ Header (48px, Gray 100) ══════════════════════════════ -->
    <header class="cds-header" role="banner">
      <button
        class="cds-header__action cds-header__menu"
        type="button"
        :title="navEnRiel ? 'Expandir navegación' : 'Contraer navegación'"
        :aria-label="navEnRiel ? 'Expandir navegación' : 'Contraer navegación'"
        :aria-expanded="!navEnRiel"
        @click="alternarNav"
      >
        <i class="ti ti-menu-2" aria-hidden="true"></i>
      </button>

      <!-- HeaderName de Carbon: prefijo en peso normal + nombre en 600.
           Enlaza al Dashboard, que es la pantalla de entrada. -->
      <RouterLink to="/dashboard" class="cds-header__name" @click="cerrarNav">
        <img :src="'/icon_sisti.svg'" :alt="NOMBRE_PRODUCTO" class="cds-header__logo">
        <span class="cds-header__name-texto">
          <span class="cds-header__prefijo">{{ NOMBRE_MARCA }}</span>
          <span class="cds-header__producto">{{ NOMBRE_CORTO }}</span>
        </span>
      </RouterLink>

      <!-- HeaderGlobalBar: acciones globales, alineadas a la derecha -->
      <div class="cds-header__global">
        <AppSearch ref="appSearchRef" @navegado="cerrarNav" />
        <NotificacionesCampana />
        <button
          class="cds-header__action"
          type="button"
          :title="tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
          :aria-label="tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
          @click="toggleTema"
        >
          <i :class="tema === 'dark' ? 'ti ti-sun' : 'ti ti-moon'" aria-hidden="true"></i>
        </button>
        <MenuAcciones
          class="cds-header__action cds-header__usuario"
          :acciones="accionesUsuario"
          :label="`Cuenta de ${nombreUsuario}`"
          icono=" "
        >
          <template #trigger>
            <span class="avatar sm" :class="tonoAvatar(nombreUsuario)" aria-hidden="true">{{ inicialesUsuario }}</span>
          </template>
        </MenuAcciones>
      </div>
    </header>

    <!-- ══ Fila inferior: SideNav + workspace ═══════════════════ -->
    <div class="cds-shell__cuerpo">
      <!-- Velo del panel deslizante (solo móvil) -->
      <transition name="cds-fade">
        <div
          v-if="navAbierto"
          class="cds-shell__velo"
          aria-hidden="true"
          @click="cerrarNav"
        />
      </transition>

      <nav
        class="cds-side-nav"
        :class="{ 'cds-side-nav--abierto': navAbierto, 'cds-side-nav--riel': navEnRiel }"
        aria-label="Navegación principal"
      >
        <AppNav
          :nav-en-riel="navEnRiel"
          :tickets-sin-asignar="ticketsSinAsignar"
          @cerrar-nav="cerrarNav"
          @expandir-nav="expandirNav"
        />
      </nav>

      <main class="cds-shell__contenido">
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


