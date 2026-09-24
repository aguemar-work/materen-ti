<script setup>
// Búsqueda global del header del shell.
//
// Vive en el header y no en el SideNav (desde el 2026-09-02): la búsqueda
// global es una acción del header, no de la navegación. Buscar un ticket no
// es navegar a un módulo. Estilos: Tailwind + components/shared/shellClases.js.
//
// Patrón (heredado del shell de Carbon): colapsado es un botón de lupa igual que
// cualquier otra acción global; expandido es un campo que crece a la
// izquierda desde ese mismo botón, con una X para cerrar. No hay estado
// intermedio ni "campo siempre visible" — en un header de 56px un campo
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
import { ACCION_HEADER, PANEL_FLOTANTE, ITEM_PANEL, ROTULO_GRUPO } from './shellClases.js';

const VACIO = 'px-3 py-6 text-center text-sm text-gray-500';

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
// campo. Es el comportamiento que evita perder el término
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
  <div ref="anclaPanel" class="flex items-center">
    <button
      v-if="!expandido"
      :class="ACCION_HEADER"
      type="button"
      title="Buscar en todo (Ctrl+K)"
      aria-label="Buscar en todo"
      @click="expandir"
    >
      <i class="ti ti-search" aria-hidden="true"></i>
    </button>

    <div
      v-else
      class="flex h-9 w-56 items-center gap-2 rounded-md bg-gray-100 px-3 text-gray-500 focus-within:ring-2 focus-within:ring-primary-500 sm:w-72"
    >
      <i class="ti ti-search shrink-0" aria-hidden="true"></i>
      <input
        ref="inputBusqueda"
        v-model="busqueda"
        type="text"
        class="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        placeholder="Buscar en todo..."
        aria-label="Búsqueda global"
        @keydown.esc="onEscape"
      >
      <button
        class="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
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
        :class="[PANEL_FLOTANTE, 'max-h-[70vh] w-[min(24rem,calc(100vw-1rem))]']"
        role="listbox"
        aria-label="Resultados de la búsqueda"
        :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
      >
        <div v-if="buscando" :class="VACIO">Buscando...</div>
        <template v-else-if="hayResultados">
          <template v-if="resultados.empleados.length">
            <div :class="ROTULO_GRUPO">Empleados</div>
            <button
              v-for="e in resultados.empleados"
              :key="e.id"
              type="button"
              :class="ITEM_PANEL"
              role="option"
              @click="irAEmpleado(e)"
            >
              <i class="ti ti-user shrink-0 text-base text-gray-500" aria-hidden="true"></i>
              <span class="min-w-0 flex-1 truncate">{{ e.nombres }} {{ e.apellidos }}</span>
              <span class="shrink-0 truncate text-xs text-gray-500">{{ e.dni }}</span>
            </button>
          </template>
          <template v-if="resultados.cuentas.length">
            <div :class="ROTULO_GRUPO">Cuentas</div>
            <button
              v-for="c in resultados.cuentas"
              :key="c.id"
              type="button"
              :class="ITEM_PANEL"
              role="option"
              @click="irACuenta(c)"
            >
              <i class="ti ti-key shrink-0 text-base text-gray-500" aria-hidden="true"></i>
              <span class="min-w-0 flex-1 truncate">{{ c.usuario }}</span>
              <span class="shrink-0 truncate text-xs text-gray-500">{{ c.plataforma_nombre }}</span>
            </button>
          </template>
          <template v-if="resultados.equipos.length">
            <div :class="ROTULO_GRUPO">Equipos</div>
            <button
              v-for="eq in resultados.equipos"
              :key="eq.id"
              type="button"
              :class="ITEM_PANEL"
              role="option"
              @click="irAEquipo(eq)"
            >
              <i class="ti ti-devices shrink-0 text-base text-gray-500" aria-hidden="true"></i>
              <span class="min-w-0 flex-1 truncate">{{ eq.codigo }}</span>
              <span class="shrink-0 truncate text-xs text-gray-500">{{ eq.descripcion }}</span>
            </button>
          </template>
          <template v-if="resultados.tickets.length">
            <div :class="ROTULO_GRUPO">Tickets</div>
            <button
              v-for="t in resultados.tickets"
              :key="t.id"
              type="button"
              :class="ITEM_PANEL"
              role="option"
              @click="irATicket(t)"
            >
              <i class="ti ti-headset shrink-0 text-base text-gray-500" aria-hidden="true"></i>
              <span class="min-w-0 flex-1 truncate">{{ t.titulo }}</span>
              <span class="shrink-0 truncate text-xs text-gray-500">{{ t.codigo }} · {{ estadoInfo(t.estado).label }}</span>
            </button>
          </template>
          <template v-if="resultados.licencias.length">
            <div :class="ROTULO_GRUPO">Licencias</div>
            <button
              v-for="lic in resultados.licencias"
              :key="lic.id"
              type="button"
              :class="ITEM_PANEL"
              role="option"
              @click="irALicencia(lic)"
            >
              <i class="ti ti-license shrink-0 text-base text-gray-500" aria-hidden="true"></i>
              <span class="min-w-0 flex-1 truncate">{{ lic.software }}</span>
              <span class="shrink-0 truncate text-xs text-gray-500">{{ lic.proveedor }}</span>
            </button>
          </template>
        </template>
        <div v-else :class="VACIO">Sin resultados para "{{ busqueda }}"</div>
      </div>
    </Teleport>
  </div>
</template>


