<script setup>
// Paginación server-side del sistema nuevo. Agnóstica del store: recibe
// página/tamaño/total y emite los cambios; la vista los conecta con
// irAPagina/cambiarTamPagina de crearStorePaginado.js. Matemática en
// core/paginacionRender.js (compartida con los tests).
//   completa  — pie de tabla: filas por página + rango + salto + flechas.
//   compacta  — debajo de una grilla de tarjetas: flechas + "Página X de Y".
import { computed, watch } from 'vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';

const props = defineProps({
  pagina: { type: Number, required: true },
  tamPagina: { type: Number, required: true },
  total: { type: Number, required: true },
  tamanos: { type: Array, default: () => TAMANOS_PAGINA },
  variante: { type: String, default: 'completa', validator: (v) => ['completa', 'compacta'].includes(v) },
});
const emit = defineEmits(['update:pagina', 'update:tamPagina']);

const totalPaginas = computed(() => totalPaginasDe(props.total, props.tamPagina));
const paginas = computed(() => paginasDe(totalPaginas.value));
const rango = computed(() => rangoDe(props.pagina, props.tamPagina, props.total));

// Si el total encoge por debajo de la página actual (p.ej. se borró la última
// fila de la última página), se repliega a la última válida: quedarse en una
// página que ya no existe muestra la tabla vacía sin motivo aparente.
watch(totalPaginas, (n) => {
  if (props.total > 0 && props.pagina > n) emit('update:pagina', n);
});

function irA(p) {
  const destino = clampPagina(p, totalPaginas.value);
  if (destino !== props.pagina) emit('update:pagina', destino);
}

const FLECHA =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-base text-gray-600 transition-colors ' +
  'hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent';
const SELECT =
  'h-8 cursor-pointer rounded-md bg-transparent px-1.5 text-sm text-gray-900 tabular-nums hover:bg-gray-100 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
</script>

<template>
  <nav
    v-if="variante === 'completa'"
    class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-2 text-sm text-gray-500"
    aria-label="Paginación"
  >
    <div class="flex items-center gap-3">
      <label class="inline-flex items-center gap-1.5 font-normal text-gray-500">
        <span>Filas</span>
        <select data-ui :class="SELECT" :value="tamPagina" @change="emit('update:tamPagina', Number($event.target.value))">
          <option v-for="t in tamanos" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <span class="tabular-nums" aria-live="polite">{{ rango.desde }}–{{ rango.hasta }} de {{ total }}</span>
    </div>
    <div v-if="totalPaginas > 1" class="flex items-center gap-1">
      <label class="inline-flex items-center gap-1.5 font-normal text-gray-500">
        <span class="sr-only">Ir a la página</span>
        <select data-ui :class="SELECT" :value="pagina" @change="irA(Number($event.target.value))">
          <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
        </select>
        <span>de {{ totalPaginas }}</span>
      </label>
      <button :class="FLECHA" type="button" :disabled="pagina <= 1" aria-label="Página anterior" @click="irA(pagina - 1)">
        <i class="ti ti-chevron-left" aria-hidden="true"></i>
      </button>
      <button :class="FLECHA" type="button" :disabled="pagina >= totalPaginas" aria-label="Página siguiente" @click="irA(pagina + 1)">
        <i class="ti ti-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </nav>

  <nav v-else-if="totalPaginas > 1" class="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500" aria-label="Paginación">
    <button :class="FLECHA" type="button" :disabled="pagina <= 1" aria-label="Página anterior" @click="irA(pagina - 1)">
      <i class="ti ti-chevron-left" aria-hidden="true"></i>
    </button>
    <span class="tabular-nums" aria-live="polite">Página {{ pagina }} de {{ totalPaginas }}</span>
    <button :class="FLECHA" type="button" :disabled="pagina >= totalPaginas" aria-label="Página siguiente" @click="irA(pagina + 1)">
      <i class="ti ti-chevron-right" aria-hidden="true"></i>
    </button>
  </nav>
</template>
