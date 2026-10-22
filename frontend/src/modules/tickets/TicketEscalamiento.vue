<script setup>
// Escalamiento por niveles de un ticket (migración 121): dónde está (nivel),
// quién lo tiene, qué pasó, el especialista y la referencia en N3, cuándo se
// espera la solución (con aviso si la fecha ya pasó) y el último avance.
// La historia completa (cada escalamiento, devolución y avance, con su
// motivo) va en la actividad del ticket (TicketTimelineUnificado): acá no se
// arma un segundo historial (regla 19). Las acciones (Escalar, Devolver
// nivel, Registrar avance) abren EscalamientoDialog. Compartido por
// TicketDetalleView.vue y TicketDetallePanel.vue: el estado y las reglas
// vienen en `escalamiento` (useTicketEscalamiento), los contenedores solo lo
// pasan.
import { computed } from 'vue';
import { nivelAtencionLabel, especialistaTipoLabel, fechaEstimadaVencida } from '../../core/dominio-tickets.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTag from '../../components/ui/AppTag.vue';
import EscalamientoDialog from './EscalamientoDialog.vue';

const props = defineProps({
  // { visible, puedeEscalar, puedeDevolver, puedeAvance, tramos, tramoActual,
  //   dialogo, abrir(tipo), alCerrar(resultado) }
  escalamiento: { type: Object, required: true },
  ticket: { type: Object, required: true },
  staffActivo: { type: Array, default: () => [] },
  staffPorId: { type: Object, default: () => ({}) },
});

const actual = computed(() => props.escalamiento.tramoActual);
const vencida = computed(() => fechaEstimadaVencida(actual.value?.fecha_estimada));

const datos = computed(() => {
  const t = actual.value;
  const filas = [{ label: 'Nivel actual', valor: nivelAtencionLabel(props.ticket.nivel_atencion) }];
  if (!t) return filas;
  filas.push({ label: 'Lo tiene', valor: props.staffPorId[t.responsable_id] || '' });
  if (t.nivel_hacia === 'N3') {
    filas.push({ label: 'Especialista', valor: [especialistaTipoLabel(t.especialista_tipo), t.especialista_nombre].filter(Boolean).join(' · ') });
    filas.push({ label: 'Referencia', valor: t.referencia_externa || '', mono: true });
  }
  filas.push({ label: 'Fecha estimada de solución', valor: formatFecha(t.fecha_estimada), mono: true, fecha: true });
  filas.push({ label: 'En este nivel desde', valor: formatFechaHora(t.inicio_at), mono: true });
  return filas;
});
const indiceFecha = computed(() => datos.value.findIndex((d) => d.fecha));
const slotFecha = computed(() => `valor-${indiceFecha.value}`);

// El más reciente; los demás están en la actividad del ticket.
const ultimoAvance = computed(() => (actual.value?.avances || []).at(-1) || null);
const otrosAvances = computed(() => Math.max((actual.value?.avances || []).length - 1, 0));
</script>

<template>
  <div class="grid gap-3" data-escalamiento>
    <AppListaDatos :datos="datos">
      <template v-if="indiceFecha >= 0 && actual?.fecha_estimada" #[slotFecha]>
        <span class="tabular-nums">{{ formatFecha(actual.fecha_estimada) }}</span>
        <AppTag v-if="vencida" class="ml-2" tono="critico" data-fecha-vencida>Vencida</AppTag>
      </template>
    </AppListaDatos>

    <div v-if="actual" class="text-sm">
      <p class="text-xs text-gray-500">Qué pasó</p>
      <p class="mt-0.5 whitespace-pre-line break-words text-gray-900" data-motivo>{{ actual.motivo }}</p>
    </div>

    <div v-if="ultimoAvance" class="text-sm" data-avance>
      <p class="text-xs text-gray-500">Último avance</p>
      <p class="mt-0.5 whitespace-pre-line break-words text-gray-900">{{ ultimoAvance.nota }}</p>
      <p class="text-xs text-gray-500">
        <span class="tabular-nums">{{ formatFechaHora(ultimoAvance.created_at) }}</span>
        · {{ staffPorId[ultimoAvance.autor_id] || 'Staff' }}
        · {{ ultimoAvance.visible_usuario ? 'visible para el empleado' : 'interno' }}
      </p>
      <p v-if="otrosAvances" class="text-xs text-gray-500">Los {{ otrosAvances }} anteriores están en la actividad del ticket.</p>
    </div>

    <div v-if="escalamiento.puedeEscalar || escalamiento.puedeDevolver || escalamiento.puedeAvance" class="flex flex-wrap gap-2">
      <AppButton v-if="escalamiento.puedeEscalar" size="sm" variant="outline" severity="secondary" icon="ti ti-stairs-up" label="Escalar" @click="escalamiento.abrir('escalar')" />
      <AppButton v-if="escalamiento.puedeAvance" size="sm" variant="outline" severity="secondary" icon="ti ti-notes" label="Registrar avance" @click="escalamiento.abrir('avance')" />
      <AppButton v-if="escalamiento.puedeDevolver" size="sm" variant="text" severity="secondary" icon="ti ti-stairs-down" label="Devolver nivel" @click="escalamiento.abrir('devolver')" />
    </div>

    <EscalamientoDialog
      v-if="escalamiento.dialogo"
      :modo="escalamiento.dialogo"
      :ticket="ticket"
      :tramo="actual"
      :staff-activo="staffActivo"
      @cerrar="escalamiento.alCerrar"
    />
  </div>
</template>
