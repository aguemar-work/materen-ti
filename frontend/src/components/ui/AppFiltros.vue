<script setup>
// Filtros de un listado (V2, 2026-09-25; rediseño 2026-10-21). Cada dimensión
// del listado (Empresa, Prioridad, Asignado a…) es un BOTÓN en la misma línea
// que el buscador: un clic abre sus opciones directamente, sin un menú
// intermedio de dimensiones ni un "volver" (antes, "+ Filtro" llevaba a una
// lista y de ahí a otra pantalla: se perdía el hilo). Con algo elegido el
// botón cambia de aspecto y dice qué filtra ("Prioridad: Crítica ×"), así se
// distingue de un vistazo lo que filtra de lo que no. Entre valores de una
// misma dimensión es O; entre dimensiones, Y.
//
// Estado: `modelValue` = { [id]: string[] } — el mismo objeto de listas que
// useFiltrosUrl guarda en la URL. Este componente no sabe de servidores ni
// de URLs: solo edita ese objeto.
//
// dimensiones: [{ id, label, icono, opciones: [{ valor, label }], mas? }]
//   o, para un rango de fechas: [{ id, label, icono, tipo: 'rango', mas? }] —
//   su valor es [desde, hasta] ('YYYY-MM-DD' o ''), con atajos (hoy, 7 días…).
//   El ORDEN del arreglo es el orden en la barra: lo que más se usa primero.
//   `mas: true` la manda a "Más filtros" (un solo panel con todas sus
//   secciones a la vista) para que la barra quepa en una línea; si una de
//   esas tiene algo elegido, igual aparece en la línea como botón activo.
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

// Con más opciones que esto, el panel de una dimensión trae un buscador.
const UMBRAL_BUSCADOR = 7;
const MAS = '__mas__';

const seleccionDe = (id) => props.modelValue[id] || [];
const esRango = (d) => d?.tipo === 'rango';
const enUso = (d) => (esRango(d) ? seleccionDe(d.id).some(Boolean) : seleccionDe(d.id).length > 0);

const secundarias = computed(() => props.dimensiones.filter((d) => d.mas));
// En la línea: las principales siempre y, de las de "Más filtros", las que
// tienen algo elegido (lo que filtra nunca queda escondido).
const enLinea = computed(() => props.dimensiones.filter((d) => !d.mas || enUso(d)));

const abiertoId = ref(null);
const busqueda = ref('');
const refBusqueda = ref(null);

const { abierto, trigger, panel, coords, abrir, cerrar, posicionar } = usePopoverFlotante({
  // Debajo del botón, alineado a su borde izquierdo; si no entra abajo,
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

async function alternarPanel(e, id) {
  if (abierto.value && abiertoId.value === id) { cerrar(); return; }
  trigger.value = e.currentTarget;
  abiertoId.value = id;
  busqueda.value = '';
  if (!abierto.value) {
    await abrir();
  } else {
    await nextTick();
    posicionar();
    enfocar();
  }
}

const enPanel = computed(() => {
  if (abiertoId.value === MAS) return secundarias.value;
  const d = props.dimensiones.find((x) => x.id === abiertoId.value);
  return d ? [d] : [];
});
const unaSola = computed(() => abiertoId.value !== MAS);

function opcionesVisibles(d) {
  const q = busqueda.value.trim().toLowerCase();
  return unaSola.value && q ? d.opciones.filter((o) => o.label.toLowerCase().includes(q)) : d.opciones;
}

// Al pasar de "sin elegir" a "con algo elegido" (o al revés) el botón se
// reemplaza por el otro: el panel se reengancha al nuevo para seguir anclado
// y para que Escape devuelva el foco a un botón que existe.
const raiz = ref(null);
async function reanclar() {
  await nextTick();
  if (!trigger.value?.isConnected) {
    const nuevo = raiz.value?.querySelector(`[data-filtro="${abiertoId.value}"]`);
    if (nuevo) trigger.value = nuevo;
  }
  if (trigger.value?.isConnected) posicionar();
}

function alternar(d, valor) {
  const actual = seleccionDe(d.id);
  const nueva = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor];
  emit('update:modelValue', { ...props.modelValue, [d.id]: nueva });
  reanclar();
}

// Rango: [desde, hasta]. Cambiar un extremo conserva el otro.
function fijarRango(d, desde, hasta) {
  emit('update:modelValue', { ...props.modelValue, [d.id]: [desde || '', hasta || ''] });
  reanclar();
}
const rangoDe = (d) => {
  const [desde = '', hasta = ''] = seleccionDe(d.id);
  return { desde, hasta };
};
const ATAJOS_RANGO = [
  { label: 'Hoy', dias: 0 },
  { label: 'Últimos 7 días', dias: 6 },
  { label: 'Últimos 30 días', dias: 29 },
];
function aplicarAtajoRango(d, dias) {
  fijarRango(d, fechaLocalISO(-dias), fechaLocalISO());
}
const corta = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');

function quitar(d) {
  emit('update:modelValue', { ...props.modelValue, [d.id]: esRango(d) ? ['', ''] : [] });
  if (abierto.value && abiertoId.value === d.id) cerrar();
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

const BOTON_LIBRE =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-700 shadow-xs ' +
  'transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
</script>

<template>
  <!-- Escritorio: una línea; si no entra, se desliza en vez de bajar. Móvil
       (donde una línea no cabe): los botones bajan de fila y se ven enteros. -->
  <div ref="raiz" class="-m-0.5 flex min-w-0 flex-wrap items-center gap-2 p-0.5 max-sm:basis-full sm:flex-nowrap sm:overflow-x-auto" role="group" aria-label="Filtros">
    <template v-for="d in enLinea" :key="d.id">
      <!-- Con algo elegido: el botón dice qué filtra y trae su × -->
      <div
        v-if="enUso(d)"
        data-chip
        class="inline-flex h-8 max-w-72 shrink-0 items-center rounded-md bg-primary-50 text-sm text-primary-800 ring-1 ring-inset ring-primary-200"
      >
        <button
          type="button"
          class="flex h-full min-w-0 items-center gap-1.5 rounded-l-md pl-2.5 pr-1.5 transition-colors hover:bg-primary-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
          :data-filtro="d.id"
          :aria-label="`Filtro ${d.label}: ${resumen(d)}. Cambiar selección`"
          :aria-expanded="abierto && abiertoId === d.id"
          @click="alternarPanel($event, d.id)"
        >
          <i :class="d.icono" aria-hidden="true"></i>
          <span class="text-primary-700">{{ d.label }}:</span>
          <span class="truncate font-medium">{{ resumen(d) }}</span>
          <i class="ti ti-chevron-down text-xs" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="mr-0.5 inline-flex h-7 w-6 shrink-0 items-center justify-center rounded text-primary-700 transition-colors hover:bg-primary-100 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          :aria-label="`Quitar filtro ${d.label}`"
          :title="`Quitar filtro ${d.label}`"
          @click="quitar(d)"
        >
          <i class="ti ti-x text-sm" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Sin elegir: botón con borde, el nombre de lo que filtra y su flecha -->
      <button
        v-else
        type="button"
        :class="BOTON_LIBRE"
        :data-filtro="d.id"
        :aria-expanded="abierto && abiertoId === d.id"
        @click="alternarPanel($event, d.id)"
      >
        <i class="text-gray-500" :class="d.icono" aria-hidden="true"></i>
        {{ d.label }}
        <i class="ti ti-chevron-down text-xs text-gray-500" aria-hidden="true"></i>
      </button>
    </template>

    <button
      v-if="secundarias.length"
      type="button"
      :class="BOTON_LIBRE"
      :aria-expanded="abierto && abiertoId === MAS"
      @click="alternarPanel($event, MAS)"
    >
      <i class="ti ti-adjustments-horizontal text-gray-500" aria-hidden="true"></i>
      Más filtros
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="abierto"
      ref="panel"
      :class="[PANEL_FLOTANTE, unaSola ? 'max-h-80 w-64' : 'max-h-96 w-72']"
      :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
    >
      <fieldset
        v-for="(d, i) in enPanel"
        :key="d.id"
        class="min-w-0"
        :class="i > 0 ? 'mt-1 border-t border-gray-100 pt-1' : ''"
      >
        <legend class="sr-only">Filtrar por {{ d.label }}</legend>
        <div class="flex items-center gap-2 px-2.5 pb-1 pt-1.5" aria-hidden="true">
          <span class="text-xs font-medium text-gray-500">{{ d.label }}</span>
          <span v-if="!esRango(d) && seleccionDe(d.id).length" class="ml-auto text-xs text-gray-500 tabular-nums">
            {{ seleccionDe(d.id).length }} {{ seleccionDe(d.id).length === 1 ? 'elegido' : 'elegidos' }}
          </span>
        </div>

        <!-- Rango de fechas: atajos + desde/hasta -->
        <template v-if="esRango(d)">
          <button v-for="a in ATAJOS_RANGO" :key="a.label" type="button" :class="ITEM_PANEL" @click="aplicarAtajoRango(d, a.dias)">
            <span class="flex-1">{{ a.label }}</span>
          </button>
          <div class="mt-1 grid gap-2 border-t border-gray-100 px-2.5 pb-1.5 pt-2.5">
            <label class="flex items-center justify-between gap-2 text-sm text-gray-700">
              Desde
              <input
                type="date"
                :value="rangoDe(d).desde"
                :max="rangoDe(d).hasta || undefined"
                class="h-8 w-36 rounded-md border border-gray-300 bg-white px-2 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                @change="fijarRango(d, $event.target.value, rangoDe(d).hasta)"
              >
            </label>
            <label class="flex items-center justify-between gap-2 text-sm text-gray-700">
              Hasta
              <input
                type="date"
                :value="rangoDe(d).hasta"
                :min="rangoDe(d).desde || undefined"
                class="h-8 w-36 rounded-md border border-gray-300 bg-white px-2 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                @change="fijarRango(d, rangoDe(d).desde, $event.target.value)"
              >
            </label>
          </div>
        </template>

        <!-- Opciones: casillas, varias a la vez -->
        <template v-else>
          <label v-if="unaSola && d.opciones.length > UMBRAL_BUSCADOR" class="mb-1 block px-1">
            <span class="sr-only">Buscar en {{ d.label }}</span>
            <input
              ref="refBusqueda"
              v-model="busqueda"
              type="search"
              :placeholder="`Buscar ${d.label.toLowerCase()}…`"
              class="h-8 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
          </label>
          <label
            v-for="o in opcionesVisibles(d)"
            :key="o.valor"
            class="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-gray-800 transition-colors hover:bg-gray-100"
          >
            <input
              type="checkbox"
              :checked="seleccionDe(d.id).includes(o.valor)"
              @change="alternar(d, o.valor)"
            >
            <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
          </label>
          <p v-if="!opcionesVisibles(d).length" class="px-2.5 py-3 text-center text-sm text-gray-500">
            {{ d.opciones.length ? 'Sin coincidencias' : 'Sin opciones registradas' }}
          </p>
        </template>
      </fieldset>
    </div>
  </Teleport>
</template>
