<script setup>
// SideNav del UI Shell de Carbon v11. Extraído de AppLayout.vue (A-06).
//
// QUÉ CAMBIÓ CON EL REDISEÑO (2026-09-02)
// La estructura de la navegación —áreas → grupos → ítems, y qué ítem está
// en qué grupo— no cambió: sigue siendo la del 2026-09-01. Lo que cambió es
// dónde vive y de qué color es:
//   · El nav ya NO contiene búsqueda, campana ni identidad de usuario. Todo
//     eso subió al header del shell (ver AppLayout.vue). Este componente es
//     ahora lo único que hay dentro del <nav>, que es lo que Carbon espera:
//     una región con una sola responsabilidad.
//   · Vive sobre Gray 90 (#262626), no sobre el fondo del contenido. Por eso
//     consume tokens `--cds-shell-*` en vez de roles `--color-*`: el nav es
//     oscuro en los dos temas (ver carbon-theme.css, sección 6).
//   · El ítem activo se marca como en Carbon: capa de gris más clara
//     (Gray 80) + barra vertical de acento a la izquierda. Antes era un
//     tinte azul de fondo con texto azul, que sobre una superficie oscura
//     no funciona.
//   · Configuración vuelve a tener ítem propio (ver el grupo Administración).
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';

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
          { path: '/tickets', label: 'Tickets', icon: 'ti ti-headset', badge: props.ticketsSinAsignar, modulo: 'tickets' },
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
        items: grupo.items.filter((item) => !item.modulo || auth.puedeVerModulo(item.modulo)),
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
</script>

<template>
  <div class="cds-nav">
    <div class="cds-nav__items">
      <template v-for="area in navAreas" :key="area.id">
        <!-- Encabezado de área: solo aparece el día que haya más de una — con
             una sola área (hoy) esto no renderiza nada. -->
        <div v-if="navAreas.length > 1" class="cds-nav__area">{{ area.label }}</div>

        <div v-for="grupo in area.grupos" :key="grupo.id" class="cds-nav__grupo">
          <div v-if="grupo.label" class="cds-nav__grupo-titulo">{{ grupo.label }}</div>

          <RouterLink
            v-for="item in grupo.items"
            :key="item.path"
            :to="item.path"
            class="cds-nav__link"
            active-class="cds-nav__link--activo"
            :title="navEnRiel ? item.label : null"
            @click="alNavegar"
          >
            <i class="cds-nav__icono" :class="item.icon" aria-hidden="true"></i>
            <span class="cds-nav__label">{{ item.label }}</span>
            <span
              v-if="item.badge"
              class="cds-nav__badge"
              :title="`${item.badge} ticket(s) sin asignar`"
            >{{ item.badge }}</span>
          </RouterLink>
        </div>
      </template>
    </div>

    <!-- Pie del riel: única salida del riel sin subir al header -->
    <button
      v-if="navEnRiel"
      class="cds-nav__expandir"
      type="button"
      title="Expandir navegación"
      aria-label="Expandir navegación"
      @click="expandir"
    >
      <i class="ti ti-chevron-right" aria-hidden="true"></i>
    </button>
  </div>
</template>

<style scoped>
.cds-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.cds-nav__items {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--space-7) 0 var(--space-9);
  /* Sin gap: la separación entre grupos la da el margen del rótulo, que es
     lo que se esconde en el riel. Con gap, el riel quedaba con huecos
     inexplicables donde antes había un título. */
}

.cds-nav__grupo {
  display: flex;
  flex-direction: column;
}

/* Encabezado de área — un nivel por encima del rótulo de grupo. Hoy nunca
   se renderiza (ver navAreas.length > 1 en el template); la regla vive acá
   para no improvisarla el día que exista una segunda área. */
.cds-nav__area {
  font-size: var(--fs-label-01);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--cds-label-01-ls);
  color: var(--cds-shell-text);
  padding: var(--space-6) var(--space-7) var(--space-2);
}

.cds-nav__area:not(:first-child) {
  margin-top: var(--space-6);
  border-top: 1px solid var(--cds-shell-border);
  padding-top: var(--space-7);
}

/* Rótulo de grupo: estático, no interactivo (sin cursor, sin hover, sin
   foco propio). El letter-spacing de 0.32px es el del paso label-01 del
   type set de Carbon, no un ajuste a ojo: a 12px en mayúsculas el texto se
   cierra sin él. */
.cds-nav__grupo-titulo {
  font-size: var(--fs-label-01);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--cds-label-01-ls);
  color: var(--cds-shell-text-muted);
  padding: var(--space-7) var(--space-7) var(--space-3);
}

/* ── Ítem (SideNavLink) ───────────────────────────────────────
   32px de alto mínimo y 16px de gutter: las dos medidas del SideNavLink de
   Carbon. Con 12 ítems y cuatro rótulos, el nav completo entra sin scroll
   en una pantalla de 768px de alto. */
.cds-nav__link {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-7);
  min-height: var(--cds-row-h-sm);
  padding: var(--space-3) var(--space-7);
  border-radius: var(--radius-base);
  color: var(--cds-shell-text-secondary);
  text-decoration: none;
  font-size: var(--fs-body-01);
  letter-spacing: var(--cds-body-01-ls);
  transition: background 0.11s, color 0.11s;
}

.cds-nav__icono {
  font-size: var(--icon-md);
  flex-shrink: 0;
}

.cds-nav__label {
  /* Durante la transición de ancho los labels no deben envolver línea */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cds-nav__link:hover {
  background: var(--cds-shell-hover);
  color: var(--cds-shell-text);
}

.cds-nav__link:focus-visible {
  outline: 2px solid var(--cds-shell-focus);
  outline-offset: -2px;
}

/* Activo: capa de gris (Gray 80) + barra de acento a la izquierda, que es
   como Carbon marca el ítem seleccionado. El color de texto NO se tiñe de
   azul: sobre Gray 80 el Blue 60 da 2.4:1. La jerarquía la dan la capa, el
   peso y la barra.

   La barra es de 2px, no de los 3px del spec de Carbon: hay una regla de la
   casa anterior a este rediseño —ningún borde de componente supera 2px— y
   se respeta. A esta escala la diferencia no se lee; si se quiere el valor
   literal de Carbon, es este único número. */
.cds-nav__link--activo {
  background: var(--cds-shell-selected);
  color: var(--cds-shell-text);
  font-weight: 600;
}

.cds-nav__link--activo::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: var(--color-accent);
}

.cds-nav__link--activo:hover {
  background: var(--cds-shell-selected);
}

/* Badge de "sin asignar": cola viva, no contador de no-leídos.
   Blue 60 sólido con texto blanco (5.00:1) y no el par claro de
   `.badge-count`: ese está pensado para superficies claras y sobre Gray 90
   quedaba como una etiqueta encendida, más llamativa que el ítem activo. */
.cds-nav__badge {
  margin-left: auto;
  flex-shrink: 0;
  min-width: var(--space-7);
  padding: 0 var(--space-3);
  border-radius: var(--radius-base);
  background: var(--color-accent);
  color: var(--color-text-on-color);
  font-size: var(--fs-label-01);
  font-weight: 600;
  line-height: var(--space-7);
  text-align: center;
}

/* ── Pie del riel ─────────────────────────────────────────── */
.cds-nav__expandir {
  flex-shrink: 0;
  height: var(--cds-row-h-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-top: 1px solid var(--cds-shell-border);
  border-radius: var(--radius-base);
  color: var(--cds-shell-text-secondary);
  cursor: pointer;
  font-size: var(--icon-md);
  transition: background 0.11s, color 0.11s;
}

.cds-nav__expandir:hover {
  background: var(--cds-shell-hover);
  color: var(--cds-shell-text);
}

.cds-nav__expandir:focus-visible {
  outline: 2px solid var(--cds-shell-focus);
  outline-offset: -2px;
}
</style>

<!-- Sin scoped: `.cds-side-nav--riel` vive en el <nav> del shell raíz
     (AppLayout.vue), un componente distinto — el pseudo-selector :global()
     de Vue no propaga el descendiente de esta regla (probado: lo pierde al
     compilar), así que va en un bloque de estilos global. -->
<style>
@media (min-width: 769px) {
  /* En el riel el ítem es un cuadrado de 48px con el ícono centrado: mismo
     lado que el header, así la columna de íconos queda alineada con el
     botón de menú de arriba. */
  .cds-side-nav--riel .cds-nav__link {
    justify-content: center;
    padding: var(--space-3) 0;
    min-height: var(--cds-shell-nav-rail-w);
  }

  .cds-side-nav--riel .cds-nav__label {
    display: none;
  }

  /* Sin rótulos de grupo en el riel: un texto de 12px en 48px de ancho
     trunca a dos letras y no rotula nada. La separación entre grupos la
     da el padding del ítem. */
  .cds-side-nav--riel .cds-nav__grupo-titulo,
  .cds-side-nav--riel .cds-nav__area {
    display: none;
  }

  /* El badge deja de ser una columna a la derecha y pasa a ser un punto
     contador sobre el ícono, que es lo único que cabe. */
  .cds-side-nav--riel .cds-nav__badge {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    margin-left: 0;
    min-width: auto;
    padding: 0 var(--space-2);
    line-height: var(--space-6);
    font-size: var(--fs-label-01);
  }
}
</style>
