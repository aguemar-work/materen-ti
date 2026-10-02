<script setup>
// "Hoy en custodia": las últimas entregas y devoluciones de equipos a
// personas, de hoy (hora de Lima). El código del equipo enlaza al listado
// filtrado por ese código (la hoja de vida `/equipos/:id` llega con su ruta;
// el contrato de `custodia_hoy` aún no trae `equipo_id`).
import { RouterLink } from 'vue-router';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import PanelInicio from './PanelInicio.vue';
import FilaAviso from './FilaAviso.vue';

defineProps({
  /** `resumen.custodia_hoy` (hasta 10 movimientos). */
  movimientos: { type: Array, default: () => [] },
  aviso: { type: String, default: '' },
});
defineEmits(['reintentar']);

const EVENTO = {
  entregado: { texto: 'Entregado', flecha: '→' },
  devuelto: { texto: 'Devuelto', flecha: '←' },
};
const textoEvento = (e) => (EVENTO[e] || { texto: e }).texto;
const flechaEvento = (e) => (EVENTO[e] || { flecha: '·' }).flecha;
</script>

<template>
  <PanelInicio titulo="Hoy en custodia" :conteo="aviso ? null : movimientos.length">
    <FilaAviso v-if="aviso" :texto="aviso" @reintentar="$emit('reintentar')" />
    <p v-else-if="!movimientos.length" class="min-h-10 px-3 py-2 text-sm text-gray-500" data-vacio>— Sin entregas ni devoluciones hoy</p>
    <ul v-else>
      <li
        v-for="(m, i) in movimientos"
        :key="`${m.equipo_codigo}-${m.evento}-${i}`"
        class="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 border-b border-gray-100 px-3 py-2"
        data-movimiento
      >
        <span class="pt-0.5 text-xs tabular-nums text-gray-900">{{ m.hora || '—' }}</span>
        <span class="min-w-0">
          <span class="block text-sm font-medium text-gray-900">{{ textoEvento(m.evento) }}</span>
          <span class="flex min-w-0 items-baseline gap-1.5 text-sm text-gray-700">
            <RouterLink
              :to="m.equipo_id ? `/equipos/${m.equipo_id}` : `/equipos?q=${encodeURIComponent(m.equipo_codigo)}`"
              :title="m.equipo_descripcion || undefined"
              class="shrink-0 rounded text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            ><AppCodigo :valor="m.equipo_codigo" titulo="Código del equipo" /></RouterLink>
            <span class="shrink-0 text-gray-500" aria-hidden="true">{{ flechaEvento(m.evento) }}</span>
            <span class="min-w-0 truncate">{{ m.persona }}</span>
          </span>
        </span>
      </li>
    </ul>
  </PanelInicio>
</template>
