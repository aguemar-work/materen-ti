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
import { sanitizarTermino } from '../../api/sanitizar.js';
import { estadoInfo } from '../../core/dominio-tickets.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { usePopoverFlotante } from '../../composables/usePopoverFlotante.js';
import { ACCION_HEADER, PANEL_FLOTANTE, ITEM_PANEL, ROTULO_GRUPO } from './shellClases.js';

const VACIO = 'px-3 py-6 text-center text-sm text-gray-500';

// Desde sm el botón colapsado se dibuja como un campo (fondo gris tenue,
// texto de ayuda y el atajo); por debajo sigue siendo el botón de lupa.
const CAMPO_COLAPSADO =
  'sm:w-56 sm:justify-start sm:gap-2 sm:bg-gray-100 sm:px-2.5 sm:text-base sm:text-gray-500 sm:hover:bg-gray-200/70 md:w-56';
const atajo = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';

const emit = defineEmits(['navegado']);

const router = useRouter();
const inputBusqueda = ref(null);
const botonBusqueda = ref(null);
const expandido = ref(false);

const SIN_RESULTADOS = { empleados: [], cuentas: [], equipos: [], tickets: [], licencias: [] };
const resultados = ref({ ...SIN_RESULTADOS });

const estado = ref('inicial');
const incompleta = ref(false);
const opcionActiva = ref(null);
const opciones = computed(() => Object.entries(resultados.value)
  .flatMap(([grupo, filas]) => filas.map((fila) => idOpcion(grupo, fila))));
const mensaje = computed(() => {
  if (!panelAbierto.value) return '';
  if (estado.value === 'buscando') return 'Buscando…';
  if (estado.value === 'error') return 'No se pudo completar la búsqueda. Presione Enter para reintentar.';
  if (incompleta.value && !opciones.value.length) return 'No se pudieron consultar todos los módulos. Presione Enter para reintentar.';
  if (!opciones.value.length) return `Sin resultados para «${busqueda.value}».`;
  const total = opciones.value.length;
  const conteo = `${total} ${total === 1 ? 'resultado disponible' : 'resultados disponibles'}.`;
  return `${conteo} Use las flechas para recorrerlos.${incompleta.value ? ' Búsqueda parcial. Presione Enter sin seleccionar un resultado para reintentar.' : ''}`;
});

function idOpcion(grupo, fila) {
  return `busqueda-global-${grupo}-${fila.id}`;
}

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
const { termino: busqueda } = useBusqueda({ onBuscar: buscar });

async function buscar(q) {
  if (q.length < 2) return;
  const id = ++peticionBusquedaId;
  incompleta.value = false;
  opcionActiva.value = null;
  estado.value = 'buscando';
  try {
    const { incompleta: parcial, ...filas } = await insforgeApi.buscarGlobal(q);
    if (id !== peticionBusquedaId) return;
    incompleta.value = Boolean(parcial);
    resultados.value = filas;
    estado.value = 'listo';
  } catch {
    if (id === peticionBusquedaId) estado.value = 'error';
  }
}

function reintentar() {
  inputBusqueda.value?.focus();
  buscar(sanitizarTermino(busqueda.value));
}

// Dos caracteres es el umbral para abrir el panel (una sola letra devuelve
// media base de datos). Cuando ya está abierto, se reposiciona en vez de
// reabrir: el panel cambia de alto al llegar los resultados y sin esto
// quedaba anclado al alto que tenía vacío.
watch(busqueda, (q) => {
  peticionBusquedaId++;
  opcionActiva.value = null;
  incompleta.value = false;
  resultados.value = { ...SIN_RESULTADOS };
  if (sanitizarTermino(q).length >= 2) {
    estado.value = 'buscando';
    if (!panelAbierto.value) abrirPanel();
  } else {
    estado.value = 'inicial';
    cerrarPanel();
  }
});

watch(panelAbierto, (abierto) => { if (!abierto) opcionActiva.value = null; });
watch(estado, async () => {
  if (!panelAbierto.value) return;
  await nextTick();
  posicionar();
});

async function expandir() {
  expandido.value = true;
  await nextTick();
  inputBusqueda.value?.focus();
}

async function colapsar(restaurarFoco = true) {
  cerrarPanel();
  busqueda.value = '';
  resultados.value = { ...SIN_RESULTADOS };
  expandido.value = false;
  await nextTick();
  if (restaurarFoco) botonBusqueda.value?.focus();
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

async function moverOpcion(paso) {
  if (!panelAbierto.value && estado.value !== 'inicial') await abrirPanel();
  if (estado.value !== 'listo' || !opciones.value.length) return;
  const actual = opciones.value.indexOf(opcionActiva.value);
  const total = opciones.value.length;
  const indice = actual < 0 ? (paso > 0 ? 0 : total - 1) : (actual + paso + total) % total;
  opcionActiva.value = opciones.value[indice];
  document.getElementById(opcionActiva.value)?.scrollIntoView?.({ block: 'nearest' });
}

function elegirOpcion() {
  if (!panelAbierto.value) return;
  if (opcionActiva.value) document.getElementById(opcionActiva.value)?.click();
  else if (estado.value === 'error' || incompleta.value) reintentar();
}

async function irA(destino) {
  colapsar(false);
  await router.push(destino);
  emit('navegado');
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
    <!-- Colapsado: en pantallas chicas un botón de lupa; desde sm se ve como
         un campo (con el atajo a la vista), que es lo que el usuario busca
         con la mirada cuando quiere encontrar algo. -->
    <button
      v-if="!expandido"
      ref="botonBusqueda"
      :class="[ACCION_HEADER, CAMPO_COLAPSADO]"
      type="button"
      title="Buscar en todo (Ctrl+K)"
      aria-label="Buscar en todo"
      @click="expandir"
    >
      <i class="ti ti-search" aria-hidden="true"></i>
      <span class="hidden flex-1 text-left text-sm sm:inline">Buscar…</span>
      <kbd class="hidden rounded bg-white px-1.5 font-sans text-[11px] font-medium leading-5 text-gray-500 shadow-xs ring-1 ring-gray-900/10 sm:inline">{{ atajo }}</kbd>
    </button>

    <div
      v-else
      class="flex h-10 w-[min(14rem,calc(100vw-8rem))] items-center gap-2 rounded-md bg-white px-2.5 text-gray-500 ring-1 ring-gray-300 focus-within:ring-2 focus-within:ring-primary-500 sm:w-72"
    >
      <i class="ti ti-search shrink-0" aria-hidden="true"></i>
      <input
        ref="inputBusqueda"
        v-model="busqueda"
        type="text"
        class="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none"
        placeholder="Buscar en todo..."
        aria-label="Búsqueda global"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="panelAbierto"
        :aria-controls="panelAbierto ? 'resultados-busqueda-global' : undefined"
        :aria-activedescendant="panelAbierto ? opcionActiva || undefined : undefined"
        @keydown.down.prevent="moverOpcion(1)"
        @keydown.up.prevent="moverOpcion(-1)"
        @keydown.enter.prevent="elegirOpcion"
        @keydown.tab="cerrarPanel"
        @keydown.esc="onEscape"
      >
      <button
        class="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        type="button"
        title="Cerrar búsqueda"
        aria-label="Cerrar búsqueda"
        @click="colapsar()"
      >
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
    <p class="sr-only" role="status">{{ mensaje }}</p>

    <Teleport to="body">
      <div
        v-if="panelAbierto"
        ref="panel"
        :class="[PANEL_FLOTANTE, 'max-h-[70vh] w-[min(24rem,calc(100vw-1rem))]']"
        :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
      >
        <div id="resultados-busqueda-global" role="listbox" aria-label="Resultados de la búsqueda" :aria-busy="estado === 'buscando'">
          <template v-if="estado === 'listo' && opciones.length">
            <div v-if="resultados.empleados.length" role="group" aria-label="Empleados">
              <div :class="ROTULO_GRUPO" aria-hidden="true">Empleados</div>
              <button
                v-for="e in resultados.empleados"
                :id="idOpcion('empleados', e)"
                :key="e.id"
                type="button"
                role="option"
                tabindex="-1"
                                :aria-selected="opcionActiva === idOpcion('empleados', e)"
                :class="[ITEM_PANEL, { 'bg-primary-50 ring-1 ring-inset ring-primary-500': opcionActiva === idOpcion('empleados', e) }]"
                @mousedown.prevent
                @click="irAEmpleado(e)"
              >
                <i class="ti ti-user shrink-0 text-base text-gray-500" aria-hidden="true"></i>
                <span class="min-w-0 flex-1 truncate">{{ e.nombres }} {{ e.apellidos }}</span>
                <span class="shrink-0 truncate text-xs text-gray-500">{{ e.dni }}</span>
              </button>
            </div>
            <div v-if="resultados.cuentas.length" role="group" aria-label="Cuentas">
              <div :class="ROTULO_GRUPO" aria-hidden="true">Cuentas</div>
              <button
                v-for="c in resultados.cuentas"
                :id="idOpcion('cuentas', c)"
                :key="c.id"
                type="button"
                role="option"
                tabindex="-1"
                                :aria-selected="opcionActiva === idOpcion('cuentas', c)"
                :class="[ITEM_PANEL, { 'bg-primary-50 ring-1 ring-inset ring-primary-500': opcionActiva === idOpcion('cuentas', c) }]"
                @mousedown.prevent
                @click="irACuenta(c)"
              >
                <i class="ti ti-key shrink-0 text-base text-gray-500" aria-hidden="true"></i>
                <span class="min-w-0 flex-1 truncate">{{ c.usuario }}</span>
                <span class="shrink-0 truncate text-xs text-gray-500">{{ c.plataforma_nombre }}</span>
              </button>
            </div>
            <div v-if="resultados.equipos.length" role="group" aria-label="Equipos">
              <div :class="ROTULO_GRUPO" aria-hidden="true">Equipos</div>
              <button
                v-for="eq in resultados.equipos"
                :id="idOpcion('equipos', eq)"
                :key="eq.id"
                type="button"
                role="option"
                tabindex="-1"
                                :aria-selected="opcionActiva === idOpcion('equipos', eq)"
                :class="[ITEM_PANEL, { 'bg-primary-50 ring-1 ring-inset ring-primary-500': opcionActiva === idOpcion('equipos', eq) }]"
                @mousedown.prevent
                @click="irAEquipo(eq)"
              >
                <i class="ti ti-devices shrink-0 text-base text-gray-500" aria-hidden="true"></i>
                <span class="min-w-0 flex-1 truncate">{{ eq.codigo }}</span>
                <span class="shrink-0 truncate text-xs text-gray-500">{{ eq.descripcion }}</span>
              </button>
            </div>
            <div v-if="resultados.tickets.length" role="group" aria-label="Tickets">
              <div :class="ROTULO_GRUPO" aria-hidden="true">Tickets</div>
              <button
                v-for="t in resultados.tickets"
                :id="idOpcion('tickets', t)"
                :key="t.id"
                type="button"
                role="option"
                tabindex="-1"
                                :aria-selected="opcionActiva === idOpcion('tickets', t)"
                :class="[ITEM_PANEL, { 'bg-primary-50 ring-1 ring-inset ring-primary-500': opcionActiva === idOpcion('tickets', t) }]"
                @mousedown.prevent
                @click="irATicket(t)"
              >
                <i class="ti ti-headset shrink-0 text-base text-gray-500" aria-hidden="true"></i>
                <span class="min-w-0 flex-1 truncate">{{ t.titulo }}</span>
                <span class="shrink-0 truncate text-xs text-gray-500">{{ t.codigo }} · {{ estadoInfo(t.estado).label }}</span>
              </button>
            </div>
            <div v-if="resultados.licencias.length" role="group" aria-label="Licencias">
              <div :class="ROTULO_GRUPO" aria-hidden="true">Licencias</div>
              <button
                v-for="lic in resultados.licencias"
                :id="idOpcion('licencias', lic)"
                :key="lic.id"
                type="button"
                role="option"
                tabindex="-1"
                                :aria-selected="opcionActiva === idOpcion('licencias', lic)"
                :class="[ITEM_PANEL, { 'bg-primary-50 ring-1 ring-inset ring-primary-500': opcionActiva === idOpcion('licencias', lic) }]"
                @mousedown.prevent
                @click="irALicencia(lic)"
              >
                <i class="ti ti-license shrink-0 text-base text-gray-500" aria-hidden="true"></i>
                <span class="min-w-0 flex-1 truncate">{{ lic.software }}</span>
                <span class="shrink-0 truncate text-xs text-gray-500">{{ lic.proveedor }}</span>
              </button>
            </div>
          </template>
          </div>
          <div v-if="estado === 'error' || incompleta" :class="VACIO">
            <p>{{ incompleta ? 'No se pudieron consultar todos los módulos.' : 'No se pudo completar la búsqueda.' }}</p>
            <button type="button" tabindex="-1" class="mt-2 min-h-8 rounded px-2 font-medium text-primary-700 hover:bg-primary-50" @click="reintentar">Reintentar</button>
          </div>
          <p v-else-if="estado === 'buscando' || !opciones.length" :class="VACIO">{{ mensaje }}</p>
        </div>
      </Teleport>
    </div>
  </template>


