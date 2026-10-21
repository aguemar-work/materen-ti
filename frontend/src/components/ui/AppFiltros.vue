<script setup>
// Filtros de un listado (V2, 2026-09-25; rediseño 2026-10-21, pedido del
// dueño). UN solo botón "Filtros", justo después del buscador, que abre UN
// solo panel con todas las dimensiones del listado (Empresa, Prioridad,
// Asignado a…) como secciones a la vista: se marca lo que haga falta y se
// cierra. Sin menú de dimensiones que lleve a otra pantalla de opciones (se
// perdía el hilo) y sin un botón por dimensión (la barra se llenaba de
// botones iguales). Con algo elegido, el botón se tiñe y dice cuántos filtros
// hay puestos. Entre valores de una misma dimensión es O; entre dimensiones, Y.
//
// Estado: `modelValue` = { [id]: string[] } — el mismo objeto de listas que
// useFiltrosUrl guarda en la URL. Este componente no sabe de servidores ni
// de URLs: solo edita ese objeto.
//
// dimensiones: [{ id, label, icono, opciones: [{ valor, label }] }]
//   o, para un rango de fechas: [{ id, label, icono, tipo: 'rango' }] — su
//   valor es [desde, hasta] ('YYYY-MM-DD' o ''), con atajos (hoy, 7 días…).
//   El ORDEN del arreglo es el orden de las secciones: lo que más se usa
//   primero, y dentro de cada una, las opciones diarias primero ("Usted").
//
// El panel es un popover teletransportado (usePopoverFlotante: cierre con
// Escape devolviendo el foco, click afuera, resize), no un modal: no
// bloquea la página ni atrapa el foco, y cada cambio se aplica al instante.
import { reactive, computed, nextTick } from 'vue';
import { usePopoverFlotante } from '../../composables/usePopoverFlotante.js';
import { PANEL_FLOTANTE, ITEM_PANEL } from '../shared/shellClases.js';
import { fechaLocalISO } from '../../core/formatters.js';

const props = defineProps({
  dimensiones: { type: Array, required: true },
  modelValue: { type: Object, required: true },
});
const emit = defineEmits(['update:modelValue']);

// Con más opciones que esto, la sección trae su propio buscador.
const UMBRAL_BUSCADOR = 7;

const seleccionDe = (id) => props.modelValue[id] || [];
const esRango = (d) => d?.tipo === 'rango';
const enUso = (d) => (esRango(d) ? seleccionDe(d.id).some(Boolean) : seleccionDe(d.id).length > 0);
const activas = computed(() => props.dimensiones.filter(enUso));

const busquedas = reactive({});
function opcionesVisibles(d) {
  const q = (busquedas[d.id] || '').trim().toLowerCase();
  return q ? d.opciones.filter((o) => o.label.toLowerCase().includes(q)) : d.opciones;
}

const { abierto, trigger, panel, coords, abrir, cerrar, posicionar } = usePopoverFlotante({
  // Debajo del botón, alineado a su borde izquierdo; si no entra abajo,
  // arriba. Nunca fuera de la ventana.
  alinear(r, m) {
    const left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8));
    const cabeAbajo = r.bottom + 4 + m.height <= window.innerHeight - 8;
    return { top: cabeAbajo ? r.bottom + 4 : Math.max(8, r.top - m.height - 4), left };
  },
  alAbrir: async () => {
    await nextTick();
    panel.value?.querySelector('input, button')?.focus();
  },
});

function alternarPanel(e) {
  if (abierto.value) { cerrar(); return; }
  trigger.value = e.currentTarget;
  for (const k of Object.keys(busquedas)) busquedas[k] = '';
  abrir();
}

// El botón cambia de ancho al mostrar el conteo: se reacomoda el panel.
async function reubicar() {
  await nextTick();
  if (trigger.value?.isConnected) posicionar();
}

function alternar(d, valor) {
  const actual = seleccionDe(d.id);
  const nueva = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor];
  emit('update:modelValue', { ...props.modelValue, [d.id]: nueva });
  reubicar();
}

// Rango: [desde, hasta]. Cambiar un extremo conserva el otro.
function fijarRango(d, desde, hasta) {
  emit('update:modelValue', { ...props.modelValue, [d.id]: [desde || '', hasta || ''] });
  reubicar();
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
  reubicar();
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

// Nombre accesible y `title`: qué hay puesto, sin abrir el panel.
const descripcion = computed(() => (activas.value.length
  ? `Filtros: ${activas.value.map((d) => `${d.label} ${resumen(d)}`).join('; ')}`
  : 'Filtros'));
</script>

<template>
  <button
    type="button"
    class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    :class="activas.length
      ? 'bg-primary-50 font-medium text-primary-800 ring-1 ring-inset ring-primary-200 hover:bg-primary-100/70'
      : 'border border-gray-300 bg-white text-gray-700 shadow-xs hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900'"
    :data-chip="activas.length ? '' : undefined"
    :aria-label="descripcion"
    :title="descripcion"
    aria-haspopup="dialog"
    :aria-expanded="abierto"
    @click="alternarPanel"
  >
    <i class="ti ti-filter" :class="activas.length ? '' : 'text-gray-500'" aria-hidden="true"></i>
    Filtros
    <span
      v-if="activas.length"
      class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs tabular-nums text-primary-800 ring-1 ring-inset ring-primary-200"
      aria-hidden="true"
    >{{ activas.length }}</span>
    <i class="ti ti-chevron-down text-xs" :class="activas.length ? '' : 'text-gray-500'" aria-hidden="true"></i>
  </button>

  <Teleport to="body">
    <div
      v-if="abierto"
      ref="panel"
      role="dialog"
      aria-label="Filtros"
      :class="[PANEL_FLOTANTE, 'max-h-[28rem] w-80']"
      :style="{ top: coords.top + 'px', left: coords.left + 'px' }"
    >
      <fieldset
        v-for="(d, i) in dimensiones"
        :key="d.id"
        class="min-w-0"
        :class="i > 0 ? 'mt-1 border-t border-gray-100 pt-1' : ''"
      >
        <legend class="sr-only">Filtrar por {{ d.label }}</legend>
        <div class="flex items-center gap-2 px-2.5 pb-1 pt-1.5">
          <i class="text-gray-500" :class="d.icono" aria-hidden="true"></i>
          <span class="text-xs font-medium text-gray-700" aria-hidden="true">{{ d.label }}</span>
          <button
            v-if="enUso(d)"
            type="button"
            class="ml-auto rounded px-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :aria-label="`Quitar filtro ${d.label}`"
            @click="quitar(d)"
          >Quitar</button>
        </div>

        <!-- Rango de fechas: atajos + desde/hasta -->
        <template v-if="esRango(d)">
          <button v-for="a in ATAJOS_RANGO" :key="a.label" type="button" :class="ITEM_PANEL" @click="aplicarAtajoRango(d, a.dias)">
            <span class="flex-1">{{ a.label }}</span>
          </button>
          <div class="grid gap-2 px-2.5 pb-1.5 pt-1">
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
          <label v-if="d.opciones.length > UMBRAL_BUSCADOR" class="mb-1 block px-1">
            <span class="sr-only">Buscar en {{ d.label }}</span>
            <input
              v-model="busquedas[d.id]"
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
          <p v-if="!opcionesVisibles(d).length" class="px-2.5 py-2 text-sm text-gray-500">
            {{ d.opciones.length ? 'Sin coincidencias' : 'Sin opciones registradas' }}
          </p>
        </template>
      </fieldset>
    </div>
  </Teleport>
</template>
