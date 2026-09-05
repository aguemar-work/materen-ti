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

<style scoped>
/* ── Raíz ─────────────────────────────────────────────────────
   Alto de viewport fijo y sin scroll propio: el único scroll vertical
   está en .cds-shell__contenido. Así el header no se va nunca y el
   `position: sticky` de los headers de página funciona relativo al
   contenido, no al documento. */
.cds-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ── Header ───────────────────────────────────────────────────
   48px es la medida del spec del shell de Carbon, no una elección:
   condiciona el ancho del riel (48px, para que el cuadro del botón de
   menú sea cuadrado) y el lado de cada acción global. */
.cds-header {
  /* relative: en móvil el campo de búsqueda expandido se posiciona sobre
     el header entero (`inset: 0` en AppSearch.vue), y necesita este
     contenedor como referencia. */
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: var(--cds-shell-header-h);
  background: var(--cds-shell-header-bg);
  border-bottom: 1px solid var(--cds-shell-border);
  /* Por encima del nav: el panel deslizante de móvil entra por debajo del
     header, no lo tapa (ni con su sombra). */
  z-index: var(--z-shell-header);
}

/* Acción global del header: cuadrado de 48×48, sin radio, sin borde.
   El hover es una capa de gris (no un tinte de acento) — en Carbon el
   color de acento está reservado a lo que es una acción primaria o un
   estado seleccionado, y una acción de header no es ninguna de las dos. */
.cds-header__action {
  width: var(--cds-shell-header-h);
  height: var(--cds-shell-header-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-base);
  color: var(--cds-shell-text);
  cursor: pointer;
  font-size: var(--icon-md);
  transition: background 0.11s;
}

.cds-header__action:hover {
  background: var(--cds-shell-hover);
}

/* Foco del shell: línea sólida BLANCA de 2px por dentro. En Carbon el
   indicador de foco sobre superficie oscura es blanco, no el azul — Blue 60
   sobre Gray 100 da 2.0:1 y no se ve. Es la misma decisión que el tema
   oscuro toma para --ring. */
.cds-header__action:focus-visible,
.cds-header__name:focus-visible {
  outline: 2px solid var(--cds-shell-focus);
  outline-offset: -2px;
}

/* ── HeaderName ───────────────────────────────────────────────
   La jerarquía es de peso, no de color: los dos textos son
   --cds-shell-text (16.45:1 sobre el header) y lo que distingue el
   producto del prefijo es el 600. Teñir "Materen" de gris secundario lo
   habría dejado en 10.6:1, legible, pero convierte la marca en metadato. */
.cds-header__name {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 100%;
  padding: 0 var(--space-9) 0 var(--space-3);
  color: var(--cds-shell-text);
  text-decoration: none;
  font-size: var(--fs-body-01);
  letter-spacing: 0.1px;
  white-space: nowrap;
  min-width: 0;
}

.cds-header__logo {
  width: var(--icon-md);
  height: var(--icon-md);
  flex-shrink: 0;
  /* El logotipo es azul de marca sobre fondo claro; sobre el header en
     Gray 100 se pasa a blanco, mismo tratamiento que ya tenía en el tema
     oscuro y en el login. */
  filter: brightness(0) invert(1);
}

.cds-header__name-texto {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
  overflow: hidden;
}

.cds-header__prefijo {
  font-weight: 400;
}

.cds-header__producto {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── HeaderGlobalBar ──────────────────────────────────────────
   `margin-left: auto` y no `justify-content: space-between` en el header:
   el HeaderName tiene que poder truncar sin empujar las acciones. */
.cds-header__global {
  margin-left: auto;
  display: flex;
  align-items: center;
  height: 100%;
}

/* El trigger del menú de usuario lleva un avatar en vez de un glifo, así
   que el ícono heredado de .cds-header__action no aplica; se centra el
   avatar y se le quita el tamaño de fuente de ícono. */
.cds-header__usuario {
  font-size: var(--fs-label-01);
}

/* ── Cuerpo: nav + workspace ──────────────────────────────── */
.cds-shell__cuerpo {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

/* ── SideNav (Gray 90) ────────────────────────────────────────
   256px expandido / 48px en riel, las dos medidas del spec de Carbon.
   El borde derecho separa el nav del workspace claro; en el tema oscuro
   los dos son grises cercanos y el borde es lo que evita que se fundan. */
.cds-side-nav {
  width: var(--cds-shell-nav-w);
  flex-shrink: 0;
  background: var(--cds-shell-nav-bg);
  border-right: 1px solid var(--cds-shell-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: var(--z-nav); /* solo aplica cuando es panel deslizante (≤768px) */
  transition: width 0.11s;
}

@media (min-width: 769px) {
  .cds-side-nav--riel {
    width: var(--cds-shell-nav-rail-w);
  }
}

/* ── Workspace (Gray 10) ──────────────────────────────────────
   El único contenedor con scroll vertical de toda la app. */
.cds-shell__contenido {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}

/* ── Velo ─────────────────────────────────────────────────── */
.cds-shell__velo {
  display: none;
}

.cds-fade-enter-active,
.cds-fade-leave-active {
  transition: opacity 0.15s;
}
.cds-fade-enter-from,
.cds-fade-leave-to {
  opacity: 0;
}

/* ── Móvil (≤768px) ───────────────────────────────────────────
   El nav pasa a panel deslizante SOBRE el contenido. Sale de debajo del
   header (top: 0 dentro de .cds-shell__cuerpo, que ya empieza a 48px), así
   que el header sigue accesible con el panel abierto — incluido el botón
   que lo cierra. */
@media (max-width: 768px) {
  .cds-side-nav {
    position: absolute;
    inset: 0 auto 0 0;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }

  .cds-side-nav--abierto {
    transform: translateX(0);
    /* Única sombra direccional del sistema: despega el panel del contenido
       hacia la derecha. --shadow-overlay es vertical y no expresa
       dirección; está declarada como excepción en
       scripts/literales-vs-tokens.mjs. */
    box-shadow: 4px 0 16px rgba(22, 22, 22, 0.4);
  }

  .cds-shell__velo {
    display: block;
    position: absolute;
    inset: 0;
    background: var(--color-overlay);
    z-index: calc(var(--z-nav) - 1); /* justo debajo del panel que cubre */
  }

  /* El HeaderName pierde el prefijo: a 360px de ancho compite con las
     cuatro acciones globales y el producto es el dato que importa. */
  .cds-header__prefijo {
    display: none;
  }

  .cds-header__name {
    padding-right: var(--space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cds-side-nav,
  .cds-header__action,
  .cds-fade-enter-active,
  .cds-fade-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
