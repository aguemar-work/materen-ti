<script setup>
// Franja bajo las vistas de Cambios (migración 107): lo que el listado solo no
// dice. Dos cosas, ambas opcionales y ambas de las vistas `security_invoker`:
//   · EMERGENCIAS SIN APROBAR vencidas (v_cambios_aprobacion_vencida): una
//     emergencia se ejecuta sin esperar al jefe, pero tiene 48 horas para que un
//     jefe la apruebe; pasado el plazo se avisa aquí con enlace a cada una.
//   · RESUMEN de los últimos 90 días (v_kpi_cambios): cuántos cambios, qué parte
//     fueron emergencias y cuántos hubo que revertir.
// Si las vistas no responden, el padre no pasa nada y la franja no se dibuja.
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import AppCodigo from '../../components/ui/AppCodigo.vue';

const props = defineProps({
  // Filas de v_kpi_cambios (una por tipo).
  kpi: { type: Array, default: () => [] },
  // Filas de v_cambios_aprobacion_vencida.
  vencidas: { type: Array, default: () => [] },
});

const total = computed(() => props.kpi.reduce((s, f) => s + Number(f.total_90d || 0), 0));
const revertidos = computed(() => props.kpi.reduce((s, f) => s + Number(f.revertidos_90d || 0), 0));
const pctEmergencia = computed(() => Number(props.kpi.find((f) => f.tipo === 'emergencia')?.pct_del_total_90d || 0));

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
</script>

<template>
  <div v-if="vencidas.length || total > 0" class="px-4 pt-3 sm:px-6">
    <div v-if="vencidas.length" class="notif notif--danger" role="alert" data-vencidas>
      <i class="ti ti-alert-triangle" aria-hidden="true"></i>
      <div class="notif__texto">
        <p class="notif__titulo">
          {{ plural(vencidas.length, 'emergencia sin aprobar pasó', 'emergencias sin aprobar pasaron') }} el plazo de 48 horas
        </p>
        <p class="notif__detalle">
          Un jefe debe aprobarla a posteriori:
          <template v-for="(v, i) in vencidas" :key="v.cambio_id">
            <RouterLink
              :to="`/cambios/${v.cambio_id}`"
              class="rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            ><AppCodigo :valor="v.codigo" titulo="Número de cambio" /></RouterLink><template v-if="i < vencidas.length - 1">, </template>
          </template>.
        </p>
      </div>
    </div>

    <p v-if="total > 0" class="mt-2 text-xs tabular-nums text-gray-500" data-resumen-90d>
      Últimos 90 días: {{ plural(total, 'cambio', 'cambios') }} ·
      {{ pctEmergencia.toLocaleString('es-PE', { maximumFractionDigits: 1 }) }} % de emergencia ·
      {{ plural(revertidos, 'revertido', 'revertidos') }}
    </p>
  </div>
</template>
