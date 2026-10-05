<script setup>
// Controles de la hoja de reporte (no se imprimen): tipo de período (mes,
// semana, rango), navegación ‹ › y fechas, y el alcance (todo el equipo o un
// técnico). Solo emite el período normalizado; quién puede elegir a otro
// técnico lo decide el servidor (42501), acá solo se ofrece la lista al JEFE y
// "solo mi actividad" al resto.
import { computed } from 'vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { TIPOS_PERIODO, normalizarPeriodo, desplazarPeriodo, esFuturo, mesesDisponibles, etiquetaPeriodo } from './periodo.js';

const props = defineProps({
  periodo: { type: Object, required: true },
  tecnicoId: { type: String, default: '' },
  tecnicos: { type: Array, default: () => [] },
  esJefe: { type: Boolean, default: false },
  usuarioId: { type: String, default: '' },
  primerTicket: { type: String, default: '' },
  cargando: { type: Boolean, default: false },
});
const emit = defineEmits(['update:periodo', 'update:tecnicoId']);

const meses = computed(() => mesesDisponibles(props.primerTicket ? props.primerTicket.slice(0, 10) : ''));
const siguienteEsFuturo = computed(() => esFuturo(desplazarPeriodo(props.periodo, 1)));
const etiqueta = computed(() => etiquetaPeriodo(props.periodo));

function cambiarTipo(tipo) {
  if (tipo === props.periodo.tipo) return;
  emit('update:periodo', normalizarPeriodo({ tipo, desde: props.periodo.desde, hasta: props.periodo.hasta }));
}
function mover(delta) {
  emit('update:periodo', desplazarPeriodo(props.periodo, delta));
}
function elegirMes(valor) {
  emit('update:periodo', normalizarPeriodo({ tipo: 'mes', desde: valor }));
}
function cambiarFecha(campo, e) {
  const valor = e.target.value;
  if (!valor) return;
  const base = { ...props.periodo, [campo]: valor };
  if (props.periodo.tipo !== 'rango') emit('update:periodo', normalizarPeriodo({ tipo: props.periodo.tipo, desde: valor }));
  else emit('update:periodo', normalizarPeriodo(base));
}
</script>

<template>
  <div data-no-print class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
    <AppSegmentado :model-value="periodo.tipo" :opciones="TIPOS_PERIODO" label="Tipo de período" @update:model-value="cambiarTipo" />

    <div class="flex items-center gap-1" role="group" aria-label="Navegar el período">
      <AppButton icon="ti ti-chevron-left" variant="text" severity="secondary" size="sm" aria-label="Período anterior" :disabled="cargando" @click="mover(-1)" />
      <span class="min-w-40 text-center text-sm text-gray-900 tabular-nums" aria-live="polite">{{ etiqueta }}</span>
      <AppButton icon="ti ti-chevron-right" variant="text" severity="secondary" size="sm" aria-label="Período siguiente" :disabled="cargando || siguienteEsFuturo" @click="mover(1)" />
    </div>

    <AppSelect v-if="periodo.tipo === 'mes'" :model-value="periodo.desde" label="Mes" @update:model-value="elegirMes">
      <option v-for="m in meses" :key="m.valor" :value="m.valor">{{ m.label }}</option>
      <option v-if="!meses.some((m) => m.valor === periodo.desde)" :value="periodo.desde">{{ etiqueta }}</option>
    </AppSelect>

    <template v-else>
      <label class="flex items-center gap-2 text-sm text-gray-700">
        <span>{{ periodo.tipo === 'semana' ? 'Semana del' : 'Desde' }}</span>
        <input
          type="date"
          class="h-8 rounded-md border border-gray-300 px-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          :value="periodo.desde"
          @change="cambiarFecha('desde', $event)"
        >
      </label>
      <label v-if="periodo.tipo === 'rango'" class="flex items-center gap-2 text-sm text-gray-700">
        <span>Hasta</span>
        <input
          type="date"
          class="h-8 rounded-md border border-gray-300 px-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          :value="periodo.hasta"
          @change="cambiarFecha('hasta', $event)"
        >
      </label>
    </template>

    <AppSelect :model-value="tecnicoId" label="Alcance" class="ml-auto" @update:model-value="emit('update:tecnicoId', $event)">
      <option value="">Todo el equipo</option>
      <template v-if="esJefe">
        <option v-for="t in tecnicos" :key="t.user_id" :value="t.user_id">Técnico · {{ t.nombre }}</option>
      </template>
      <option v-else-if="usuarioId" :value="usuarioId">Solo mi actividad</option>
    </AppSelect>
  </div>
</template>
