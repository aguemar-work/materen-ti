<script setup>
// Filtros bajo demanda (V2, 2026-09-25): "+ Filtro" abre la lista de
// dimensiones del listado (Empresa, Ubicación, Tipo…); al elegir una se
// marcan uno o varios valores y queda un CHIP aplicado ("Empresa: Materen,
// Andes ×"). Entre valores de una misma dimensión es O; entre dimensiones,
// Y. Nada ocupa espacio hasta que se usa — así un listado puede ofrecer
// muchas dimensiones sin llenarse de selects, y cada una acepta más de un
// valor (antes, un select = un solo valor).
//
// Estado: `modelValue` = { [id]: string[] } — el mismo objeto de listas que
// useFiltrosUrl guarda en la URL. Este componente no sabe de servidores ni
// de URLs: solo edita ese objeto.
//
// dimensiones: [{ id, label, icono, opciones: [{ valor, label }] }]
//   o, para un rango de fechas: [{ id, label, icono, tipo: 'rango' }] — su
//   valor es [desde, hasta] ('YYYY-MM-DD' o ''), con atajos (hoy, 7 días…).
//
// El panel es un popover teletransportado (usePopoverFlotante: cierre con
// Escape devolviendo el foco, click afuera, resize), no un modal: no
// bloquea la página ni atrapa el foco, y cada cambio se aplica al instante.
import { ref, computed, nextTick } from 'vue';
import { usePopoverFlotante } from '../../composables/usePopoverFlotante.js';
import { PANEL_FLOTANTE, ITEM_PANEL } from '../shared/shellClases.js';
import { fechaLocalISO } from '../../core/formatters.js';

const props = defineProps({
  dimensiones: { type: Array, required: true },
  modelValue: { type: Object, required: true },
});
const emit = defineEmits(['update:modelValue']);

// Con más opciones que esto, el panel trae un buscador arriba.
const UMBRAL_BUSCADOR = 7;

const seleccionDe = (id) => props.modelValue[id] || [];
const esRango = (d) => d?.tipo === 'rango';
const enUso = (d) => (esRango(d) ? seleccionDe(d.id).some(Boolean) : seleccionDe(d.id).length > 0);
const activas = computed(() => props.dimensiones.filter(enUso));
const disponibles = computed(() => props.dimensiones.filter((d) => !enUso(d)));

const modo = ref('dimensiones'); // 'dimensiones' | 'opciones'
const dimActual = ref(null);
// Se llegó a las opciones desde "+ Filtro" (muestra el "volver").
const desdeMenu = ref(false);
const busqueda = ref('');
const refBusqueda = ref(null);

const { abierto, trigger, panel, coords, abrir, cerrar, posicionar } = usePopoverFlotante({
  // Debajo del disparador, alineado a su borde izquierdo; si no entra abajo,
  // arriba. Nunca fuera de la ventana.
  alinear(r, m) {
    const left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8));
    const cabeAbajo = r.bottom + 4 + m.height <= window.innerHeight - 8;
    return { top: cabeAbajo ? r.bottom + 4 : Math.max(8, r.top - m.height - 4), left };
  },
  alAbrir: enfocar,
});

async function enfocar() {
  await nextTick();
  const destino = refBusqueda.value || panel.value?.querySelector('input, button');
  destino?.focus();
}

async function mostrar(el, nuevoModo, dim = null) {
  trigger.value = el;
  modo.value = nuevoModo;
  dimActual.value = dim;
  busqueda.value = '';
  if (!abierto.value) {
    await abrir();
  } else {
    await nextTick();
    posicionar();
    enfocar();
  }
}

function abrirMenu(e) {
  desdeMenu.value = false;
  if (abierto.value && trigger.value === e.currentTarget) { cerrar(); return; }
  mostrar(e.currentTarget, 'dimensiones');
}

function abrirOpciones(e, dim) {
  desdeMenu.value = false;
  if (abierto.value && trigger.value === e.currentTarget && dimActual.value?.id === dim.id) { cerrar(); return; }
  mostrar(e.currentTarget, 'opciones', dim);
}

function elegirDimension(dim) {
  desdeMenu.value = true;
  mostrar(trigger.value, 'opciones', dim);
}

function volverAlMenu() {
  desdeMenu.value = false;
  mostrar(trigger.value, 'dimensiones');
}

const opcionesVisibles = computed(() => {
  const d = dimActual.value;
  if (!d) return [];
  const q = busqueda.value.trim().toLowerCase();
  return q ? d.opciones.filter((o) => o.label.toLowerCase().includes(q)) : d.opciones;
});

async function alternar(valor) {
  const id = dimActual.value.id;
  const actual = seleccionDe(id);
  const nueva = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor];
  emit('update:modelValue', { ...props.modelValue, [id]: nueva });
  // El chip puede aparecer/desaparecer y mover al disparador. Si el
  // disparador ya no está en el DOM ("+ Filtro" se oculta cuando no quedan
  // dimensiones libres), el panel se queda donde está: medir un nodo
  // desmontado da (0,0) y lo mandaría a la esquina.
  await nextTick();
  if (trigger.value?.isConnected) posicionar();
}

// Rango: [desde, hasta]. Cambiar un extremo conserva el otro.
function fijarRango(desde, hasta) {
  emit('update:modelValue', { ...props.modelValue, [dimActual.value.id]: [desde || '', hasta || ''] });
}
const rangoActual = computed(() => {
  const [desde = '', hasta = ''] = dimActual.value ? seleccionDe(dimActual.value.id) : [];
  return { desde, hasta };
});
const ATAJOS_RANGO = [
  { label: 'Hoy', dias: 0 },
  { label: 'Últimos 7 días', dias: 6 },
  { label: 'Últimos 30 días', dias: 29 },
];
function aplicarAtajo(dias) {
  fijarRango(fechaLocalISO(-dias), fechaLocalISO());
}
const corta = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');

function quitar(id) {
  const d = props.dimensiones.find((x) => x.id === id);
  emit('update:modelValue', { ...props.modelValue, [id]: esRango(d) ? ['', ''] : [] });
  if (abierto.value && dimActual.value?.id === id) cerrar();
}

// "Materen" · "Materen, Andes" · "Materen y 2 más". Si las opciones todavía
// no cargaron (llegó por URL), al menos el conteo.
function resumen(d) {
  const sel = seleccionDe(d.id);
  if (esRango(d)) {
    const [desde, hasta] = sel;
    if (desde && hasta) return desde === hasta ? corta(desde) : `${corta(desde)} – ${corta(hasta)}`;
    return desde ? `desde ${corta(desde)}` : `hasta ${corta(hasta)}`;
  }
  const nombres = sel.map((v) => d.opciones.find((o) => o.valor === v)?.label).filter(Boolean);
  if (!nombres.length) return `${sel.length} ${sel.length === 1 ? 'seleccionado' : 'seleccionados'}`;
  return nombres.length <= 2 ? nombres.join(', ') : `${nombres[0]} y ${nombres.length - 1} más`;
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div
      v-for="d in activas"
      :key="d.id"
      class="inline-flex h-8 max-w-full items-center rounded-md bg-primary-50 text-sm text-primary-800 ring-1 ring-inset ring-primary-200"
    >
      <button
        type="button"
        class="flex h-full min-w-0 items-center gap-1.5 rounded-l-md pl-2.5 pr-1.5 transition-colors hover:bg-primary-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        :aria-label="`Filtro ${d.label}: ${resumen(d)}. Cambiar selección`"
        :aria-expanded="abierto && dimActual?.id === d.id"
        @click="abrirOpciones($event, d)"
      >
        <i class="text-primary-600" :class="d.icono" aria-hidden="true"></i>
        <span class="text-primary-700">{{ d.label }}:</span>
        <span class="truncate font-medium">{{ resumen(d) }}</span>
        <i class="ti ti-chevron-down text-xs text-primary-600" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="mr-0.5 inline-flex h-7 w-6 shrink-0 items-center justify-center rounded text-primary-600 transition-colors hover:bg-primary-100 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :aria-label="`Quitar filtro ${d.label}`"
        :title="`Quitar filtro ${d.label}`"
        @click="quitar(d.id)"
      >
        <i class="ti ti-x text-sm" aria-hidden="true"></i>
      </button>
    </div>

    <button
      v-if="disponibles.length"
      type="button"
      class="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      aria-label="Agregar filtro"
      :aria-expanded="abierto && modo === 'dimensiones'"
      @click="abrirMenu"
    >
      <i class="ti ti-filter-plus" aria-hidden="true"></i>
      Filtro
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="abierto"
      ref="panel"
      :class="[PANEL_FLOTANTE, 'max-h-80 w-64']"
      :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
    >
      <!-- Menú de dimensiones -->
      <div v-if="modo === 'dimensiones'" role="group" aria-label="Filtrar por">
        <div class="px-2.5 pb-1 pt-1.5 text-xs font-medium text-gray-500">Filtrar por</div>
        <button
          v-for="d in disponibles"
          :key="d.id"
          type="button"
          :class="ITEM_PANEL"
          @click="elegirDimension(d)"
        >
          <i class="text-base text-gray-500" :class="d.icono" aria-hidden="true"></i>
          <span class="flex-1">{{ d.label }}</span>
          <i class="ti ti-chevron-right text-xs text-gray-400" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Rango de fechas: atajos + desde/hasta -->
      <fieldset v-else-if="dimActual && esRango(dimActual)" class="min-w-0">
        <legend class="sr-only">Filtrar por {{ dimActual.label }}</legend>
        <div class="flex items-center gap-1 px-1 pb-1 pt-0.5">
          <button
            v-if="desdeMenu"
            type="button"
            class="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label="Volver a la lista de filtros"
            @click="volverAlMenu"
          >
            <i class="ti ti-arrow-left text-sm" aria-hidden="true"></i>
          </button>
          <span class="px-1.5 text-xs font-medium text-gray-500">{{ dimActual.label }}</span>
        </div>
        <button v-for="a in ATAJOS_RANGO" :key="a.label" type="button" :class="ITEM_PANEL" @click="aplicarAtajo(a.dias)">
          <span class="flex-1">{{ a.label }}</span>
        </button>
        <div class="mt-1 grid gap-2 border-t border-gray-100 px-2.5 pb-1.5 pt-2.5">
          <label class="flex items-center justify-between gap-2 text-sm text-gray-700">
            Desde
            <input
              type="date"
              :value="rangoActual.desde"
              :max="rangoActual.hasta || undefined"
              class="h-8 w-36 rounded-md border border-gray-300 bg-white px-2 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              @change="fijarRango($event.target.value, rangoActual.hasta)"
            >
          </label>
          <label class="flex items-center justify-between gap-2 text-sm text-gray-700">
            Hasta
            <input
              type="date"
              :value="rangoActual.hasta"
              :min="rangoActual.desde || undefined"
              class="h-8 w-36 rounded-md border border-gray-300 bg-white px-2 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              @change="fijarRango(rangoActual.desde, $event.target.value)"
            >
          </label>
        </div>
      </fieldset>

      <!-- Opciones de una dimensión -->
      <fieldset v-else-if="dimActual" class="min-w-0">
        <legend class="sr-only">Filtrar por {{ dimActual.label }}</legend>
        <div class="flex items-center gap-1 px-1 pb-1 pt-0.5">
          <button
            v-if="desdeMenu"
            type="button"
            class="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label="Volver a la lista de filtros"
            @click="volverAlMenu"
          >
            <i class="ti ti-arrow-left text-sm" aria-hidden="true"></i>
          </button>
          <span class="px-1.5 text-xs font-medium text-gray-500">{{ dimActual.label }}</span>
          <span v-if="seleccionDe(dimActual.id).length" class="ml-auto pr-1.5 text-xs text-gray-500 tabular-nums">
            {{ seleccionDe(dimActual.id).length }} {{ seleccionDe(dimActual.id).length === 1 ? 'elegido' : 'elegidos' }}
          </span>
        </div>
        <label v-if="dimActual.opciones.length > UMBRAL_BUSCADOR" class="mb-1 block px-1">
          <span class="sr-only">Buscar en {{ dimActual.label }}</span>
          <input
            ref="refBusqueda"
            v-model="busqueda"
            type="search"
            :placeholder="`Buscar ${dimActual.label.toLowerCase()}…`"
            class="h-8 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
        </label>
        <label
          v-for="o in opcionesVisibles"
          :key="o.valor"
          class="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-gray-800 transition-colors hover:bg-gray-100"
        >
          <input
            type="checkbox"
            :checked="seleccionDe(dimActual.id).includes(o.valor)"
            @change="alternar(o.valor)"
          >
          <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
        </label>
        <p v-if="!opcionesVisibles.length" class="px-2.5 py-3 text-center text-sm text-gray-500">
          {{ dimActual.opciones.length ? 'Sin coincidencias' : 'Sin opciones registradas' }}
        </p>
      </fieldset>
    </div>
  </Teleport>
</template>
