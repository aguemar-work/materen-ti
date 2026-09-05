<script setup>
// Búsqueda global del header del shell (HeaderSearch de Carbon v11).
//
// Vivía en el sidebar hasta el rediseño del 2026-09-02. Se movió por dos
// razones, una de forma y una de fondo:
//   · De fondo: en Carbon la búsqueda global es una acción del header, no
//     de la navegación. Buscar un ticket no es navegar a un módulo.
//   · De forma: el SideNav pasó a Gray 90 y este campo se pintaba con
//     `--color-bg-hover` (#e8e8e8) — un rectángulo casi blanco sobre fondo
//     oscuro. Había que reestilarlo de cualquier manera.
//
// Patrón de Carbon: colapsado es un botón de lupa de 48×48 igual que
// cualquier otra acción global; expandido es un campo que crece a la
// izquierda desde ese mismo botón, con una X para cerrar. No hay estado
// intermedio ni "campo siempre visible" — en un header de 48px un campo
// permanente le come el nombre del producto en cuanto la ventana se angosta.
//
// El panel de resultados se teletransporta a <body> vía
// usePopoverFlotante (el mismo mecanismo de MenuAcciones y
// NotificacionesCampana). Antes era `position: absolute` dentro del
// contenedor del campo; dentro del header eso lo dejaba en el contexto de
// apilamiento del header, por debajo del SideNav. Teletransportado el
// problema no existe, y de paso se reusa el cierre por Escape/click-afuera
// que ese composable ya resuelve en vez de la lógica propia de blur con
// setTimeout que este componente tenía.
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { estadoInfo } from '../../core/dominio-tickets.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { usePopoverFlotante } from '../../composables/usePopoverFlotante.js';

const emit = defineEmits(['navegado']);

const router = useRouter();
const inputBusqueda = ref(null);
const expandido = ref(false);

const SIN_RESULTADOS = { empleados: [], cuentas: [], equipos: [], tickets: [], licencias: [] };
const resultados = ref({ ...SIN_RESULTADOS });

const hayResultados = computed(() =>
  resultados.value.empleados.length ||
  resultados.value.cuentas.length ||
  resultados.value.equipos.length ||
  resultados.value.tickets.length ||
  resultados.value.licencias.length
);

// El panel se ancla al CAMPO, no al botón: alineado a su borde derecho y
// con su mismo ancho mínimo, para que se lea como una extensión del campo.
// `trigger` del composable apunta al contenedor del campo (ver template).
const {
  abierto: panelAbierto,
  trigger: anclaPanel,
  panel,
  coords,
  abrir: abrirPanel,
  cerrar: cerrarPanel,
  posicionar,
} = usePopoverFlotante({
  alinear(r, m) {
    const left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
    return { top: r.bottom + 1, left };
  },
  cerrarConScroll: true,
});

// peticionId descarta respuestas obsoletas: si dos búsquedas se
// superponen (red desordenada), solo se aplica la más reciente.
let peticionBusquedaId = 0;
const { termino: busqueda, cargando: buscando } = useBusqueda({
  onBuscar: async (q) => {
    const id = ++peticionBusquedaId;
    if (!q) { resultados.value = { ...SIN_RESULTADOS }; return; }
    try {
      const r = await insforgeApi.buscarGlobal(q);
      if (id === peticionBusquedaId) resultados.value = r;
    } catch {
      if (id === peticionBusquedaId) resultados.value = { ...SIN_RESULTADOS };
    }
  },
});

// Dos caracteres es el umbral para abrir el panel (una sola letra devuelve
// media base de datos). Cuando ya está abierto, se reposiciona en vez de
// reabrir: el panel cambia de alto al llegar los resultados y sin esto
// quedaba anclado al alto que tenía vacío.
watch(busqueda, async (q) => {
  if (q.trim().length >= 2) {
    if (panelAbierto.value) { await nextTick(); posicionar(); }
    else abrirPanel();
  } else {
    cerrarPanel();
  }
});

watch([hayResultados, buscando], async () => {
  if (!panelAbierto.value) return;
  await nextTick();
  posicionar();
});

async function expandir() {
  expandido.value = true;
  await nextTick();
  inputBusqueda.value?.focus();
}

function colapsar() {
  cerrarPanel();
  busqueda.value = '';
  resultados.value = { ...SIN_RESULTADOS };
  expandido.value = false;
}

// Expuesto para el atajo global Ctrl/Cmd+K (AppLayout.vue) — mismo camino
// que el botón de lupa.
defineExpose({ enfocar: expandir });

// Escape con el panel cerrado colapsa el campo. Con el panel abierto,
// usePopoverFlotante ya consumió el Escape para cerrarlo (y devolvió el
// foco), así que hacen falta dos pulsaciones: cerrar resultados, cerrar
// campo. Es el comportamiento de Carbon y el que evita perder el término
// escrito por accidente.
function onEscape() {
  if (!panelAbierto.value) colapsar();
}

function irA(destino) {
  colapsar();
  emit('navegado');
  router.push(destino);
}

function irAEmpleado(emp) {
  irA(`/empleados/${emp.id}`);
}

function irACuenta(cuenta) {
  // Personal con titular → su ficha; compartida/reutilizable → Correos
  // prefiltrado con el usuario de la cuenta
  if (cuenta.tipo_cuenta === 'personal' && cuenta.titular_id) {
    irA(`/empleados/${cuenta.titular_id}`);
  } else {
    irA({ path: '/correos', query: { q: cuenta.usuario } });
  }
}

// Deep-links: la vista de lista lee ?q= y precarga su buscador, dejando
// visible el registro concreto (no hay vistas de detalle para estos).
function irAEquipo(eq) {
  irA({ path: '/equipos', query: { q: eq.codigo } });
}

function irATicket(t) {
  irA(`/tickets/${t.id}`);
}

function irALicencia(lic) {
  irA({ path: '/licencias', query: { q: lic.software } });
}
</script>

<template>
  <div ref="anclaPanel" class="cds-search" :class="{ 'cds-search--expandido': expandido }">
    <button
      v-if="!expandido"
      class="cds-search__abrir"
      type="button"
      title="Buscar en todo (Ctrl+K)"
      aria-label="Buscar en todo"
      @click="expandir"
    >
      <i class="ti ti-search" aria-hidden="true"></i>
    </button>

    <div v-else class="cds-search__campo">
      <i class="ti ti-search cds-search__icono" aria-hidden="true"></i>
      <input
        ref="inputBusqueda"
        v-model="busqueda"
        type="text"
        class="cds-search__input"
        placeholder="Buscar en todo..."
        aria-label="Búsqueda global"
        @keydown.esc="onEscape"
      >
      <button
        class="cds-search__cerrar"
        type="button"
        title="Cerrar búsqueda"
        aria-label="Cerrar búsqueda"
        @click="colapsar"
      >
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="panelAbierto"
        ref="panel"
        class="cds-search__panel"
        role="listbox"
        aria-label="Resultados de la búsqueda"
        :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
      >
        <div v-if="buscando" class="cds-search__vacio">Buscando...</div>
        <template v-else-if="hayResultados">
          <template v-if="resultados.empleados.length">
            <div class="cds-search__grupo">Empleados</div>
            <button
              v-for="e in resultados.empleados"
              :key="e.id"
              type="button"
              class="cds-search__item"
              role="option"
              @click="irAEmpleado(e)"
            >
              <i class="ti ti-user" aria-hidden="true"></i>
              <span class="cds-search__item-main">{{ e.nombres }} {{ e.apellidos }}</span>
              <span class="cds-search__item-sec">{{ e.dni }}</span>
            </button>
          </template>
          <template v-if="resultados.cuentas.length">
            <div class="cds-search__grupo">Cuentas</div>
            <button
              v-for="c in resultados.cuentas"
              :key="c.id"
              type="button"
              class="cds-search__item"
              role="option"
              @click="irACuenta(c)"
            >
              <i class="ti ti-key" aria-hidden="true"></i>
              <span class="cds-search__item-main">{{ c.usuario }}</span>
              <span class="cds-search__item-sec">{{ c.plataforma_nombre }}</span>
            </button>
          </template>
          <template v-if="resultados.equipos.length">
            <div class="cds-search__grupo">Equipos</div>
            <button
              v-for="eq in resultados.equipos"
              :key="eq.id"
              type="button"
              class="cds-search__item"
              role="option"
              @click="irAEquipo(eq)"
            >
              <i class="ti ti-devices" aria-hidden="true"></i>
              <span class="cds-search__item-main">{{ eq.codigo }}</span>
              <span class="cds-search__item-sec">{{ eq.descripcion }}</span>
            </button>
          </template>
          <template v-if="resultados.tickets.length">
            <div class="cds-search__grupo">Tickets</div>
            <button
              v-for="t in resultados.tickets"
              :key="t.id"
              type="button"
              class="cds-search__item"
              role="option"
              @click="irATicket(t)"
            >
              <i class="ti ti-headset" aria-hidden="true"></i>
              <span class="cds-search__item-main">{{ t.titulo }}</span>
              <span class="cds-search__item-sec">{{ t.codigo }} · {{ estadoInfo(t.estado).label }}</span>
            </button>
          </template>
          <template v-if="resultados.licencias.length">
            <div class="cds-search__grupo">Licencias</div>
            <button
              v-for="lic in resultados.licencias"
              :key="lic.id"
              type="button"
              class="cds-search__item"
              role="option"
              @click="irALicencia(lic)"
            >
              <i class="ti ti-license" aria-hidden="true"></i>
              <span class="cds-search__item-main">{{ lic.software }}</span>
              <span class="cds-search__item-sec">{{ lic.proveedor }}</span>
            </button>
          </template>
        </template>
        <div v-else class="cds-search__vacio">Sin resultados para "{{ busqueda }}"</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cds-search {
  display: flex;
  align-items: center;
  height: 100%;
}

/* Botón colapsado: idéntico a cualquier otra acción global del header.
   Los valores están duplicados de .cds-header__action a propósito — esa
   clase es scoped a AppLayout.vue y no alcanza a este componente. La
   alternativa era una clase global para tres botones; se prefirió repetir
   seis declaraciones de token antes que sacar una regla del shell a
   main.css, donde no la usaría nadie más. */
.cds-search__abrir,
.cds-search__cerrar {
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

.cds-search__abrir:hover,
.cds-search__cerrar:hover {
  background: var(--cds-shell-hover);
}

.cds-search__abrir:focus-visible,
.cds-search__cerrar:focus-visible,
.cds-search__input:focus-visible {
  outline: 2px solid var(--cds-shell-focus);
  outline-offset: -2px;
}

/* ── Campo expandido ──────────────────────────────────────────
   Ocupa el alto entero del header y se apoya en Gray 80 (field del shell):
   el mismo escalón que Carbon usa para un campo sobre superficie Gray 100.
   Sin borde ni radio — el cambio de capa ya lo delimita. */
.cds-search__campo {
  display: flex;
  align-items: center;
  height: 100%;
  width: min(360px, calc(100vw - 96px));
  background: var(--cds-shell-field);
}

.cds-search__icono {
  flex-shrink: 0;
  padding: 0 var(--space-4);
  color: var(--cds-shell-text-secondary);
  font-size: var(--icon-sm);
  pointer-events: none;
}

.cds-search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--cds-shell-text);
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
  letter-spacing: var(--cds-body-01-ls);
}

.cds-search__input::placeholder {
  color: var(--cds-shell-text-muted);
}

/* ── Panel de resultados ──────────────────────────────────────
   Vive sobre el workspace, no sobre el shell: usa los roles claro/oscuro
   normales (--color-*), como cualquier popover. Es el único sitio de este
   componente donde eso aplica. */
.cds-search__panel {
  position: fixed;
  z-index: var(--z-popover);
  width: min(360px, calc(100vw - 16px));
  max-height: min(420px, calc(100vh - 96px));
  overflow-y: auto;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-overlay);
}

.cds-search__grupo {
  padding: var(--space-6) var(--space-7) var(--space-2);
  background: var(--color-bg-accent);
  color: var(--color-text-secondary);
  font-size: var(--fs-label-01);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--cds-label-01-ls);
}

.cds-search__item {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  width: 100%;
  min-height: var(--cds-row-h-md);
  padding: var(--space-3) var(--space-7);
  border: none;
  border-bottom: 1px solid var(--color-border-subtle);
  background: transparent;
  border-radius: var(--radius-base);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
}

.cds-search__item:hover {
  background: var(--color-bg-hover);
}

.cds-search__item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.cds-search__item i {
  color: var(--color-text-secondary);
  font-size: var(--icon-sm);
  flex-shrink: 0;
}

.cds-search__item-main {
  flex: 1;
  min-width: 0;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cds-search__item-sec {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: var(--fs-label-01);
  white-space: nowrap;
}

.cds-search__vacio {
  padding: var(--space-9) var(--space-7);
  color: var(--color-text-secondary);
  font-size: var(--fs-body-01);
  text-align: center;
}

/* En móvil el campo toma el header entero: el nombre del producto ya se
   recortó (ver AppLayout) y las otras acciones globales quedan detrás del
   campo, que es el comportamiento del HeaderSearch de Carbon en pantalla
   angosta. */
@media (max-width: 768px) {
  .cds-search--expandido {
    position: absolute;
    inset: 0;
    background: var(--cds-shell-header-bg);
  }

  .cds-search__campo {
    width: 100%;
  }
}
</style>
