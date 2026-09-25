<script setup>
// Tarjeta de un ticket en la cola de Triage y en el listado móvil (V2,
// pedido del dueño 2026-09-25). Tres filas, siempre en este orden:
//   1. número · prioridad · nivel · estado   (lo que decide qué atender)
//   2. título                                (qué pasa)
//   3. solicitante ··········· responsable   (quién pide · quién atiende)
// El responsable es un avatar con sus iniciales; sin técnico, un círculo
// punteado (ámbar si el ticket sigue vigente). La antigüedad solo aparece
// cuando es una alerta (vigente y sin novedad hace demasiado).
//
// El contenedor (<li>, clic, selección) es del padre: este componente solo
// pinta el contenido. Slot `inicio` para el checkbox de selección.
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppTag from '../../components/ui/AppTag.vue';
import PrioridadTicket from './PrioridadTicket.vue';

defineProps({
  ticket: { type: Object, required: true },
  // Nombre del técnico asignado ('' = sin asignar).
  responsable: { type: String, default: '' },
  // Sin técnico y todavía vigente: el círculo vacío se pinta en ámbar.
  alertaSinAsignar: { type: Boolean, default: false },
  // Vigente y sin novedad hace demasiado: se muestra la antigüedad en rojo.
  envejecido: { type: Boolean, default: false },
  edad: { type: String, default: '' },
  tituloFecha: { type: String, default: '' },
});
</script>

<template>
  <!-- relative: los textos sr-only (position: absolute) quedan contenidos en
       la tarjeta. Sin esto escapaban del recorte de la cola con scroll y
       estiraban el documento ("scroll general" que llevaba a un vacío,
       reportado 2026-09-25). -->
  <div class="relative flex min-w-0 gap-3">
    <slot name="inicio" />
    <div class="min-w-0 flex-1">
      <!-- 1 · número + prioridad + nivel + estado -->
      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <RouterLink
          class="mr-0.5 shrink-0 text-xs font-medium tabular-nums text-gray-600 hover:text-primary-700 hover:underline"
          :to="`/tickets/${ticket.id}`"
          @click.stop
        >{{ ticket.codigo }}</RouterLink>
        <PrioridadTicket :valor="ticket.prioridad" />
        <AppTag v-if="ticket.nivel_atencion" tono="neutral" :title="`Nivel de atención ${ticket.nivel_atencion}`">{{ ticket.nivel_atencion }}</AppTag>
        <BadgeEstado tipo="ticket" :valor="ticket.estado" />
      </div>

      <!-- 2 · título -->
      <p class="mt-1.5 line-clamp-2 text-sm font-medium text-gray-900" :title="ticket.titulo">{{ ticket.titulo }}</p>

      <!-- 3 · solicitante + responsable -->
      <div class="mt-2 flex min-w-0 items-center justify-between gap-2">
        <span class="flex min-w-0 items-center gap-1.5 text-xs text-gray-600">
          <BadgeEstado v-if="!ticket.vinculado" tipo="ticket_sin_vincular" valor="sin_vincular" title="No se pudo identificar al solicitante" />
          <template v-else>
            <i class="ti ti-user shrink-0 text-gray-400" aria-hidden="true"></i>
            <span class="truncate">{{ ticket.solicitante || 'Solicitante sin registrar' }}</span>
          </template>
          <span
            v-if="envejecido"
            class="inline-flex shrink-0 items-center gap-1 font-medium tabular-nums text-red-700"
            :title="tituloFecha"
          >
            <span aria-hidden="true">·</span>
            <i class="ti ti-clock-exclamation" aria-hidden="true"></i>{{ edad }}
          </span>
        </span>
        <span v-if="responsable" class="shrink-0" :title="`Responsable: ${responsable}`">
          <AppAvatar :nombre="responsable" />
          <span class="sr-only">Responsable: {{ responsable }}</span>
        </span>
        <span
          v-else
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed"
          :class="alertaSinAsignar ? 'border-amber-300 text-amber-600' : 'border-gray-300 text-gray-500'"
          title="Sin responsable asignado"
        >
          <i class="ti ti-user" aria-hidden="true"></i>
          <span class="sr-only">Sin responsable asignado</span>
        </span>
      </div>
    </div>
  </div>
</template>
