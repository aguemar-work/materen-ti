<script setup>
// Quién pidió el ticket y a qué está enlazado (equipo, cuenta, licencia,
// captura). Contenido compartido entre la página completa
// (TicketDetalleView.vue) y el panel del split-view (TicketDetallePanel.vue)
// — mismo criterio que TicketCamposGestion/TicketComposer (AGENTS.md,
// "Helpers compartidos… 3"): el contenedor pone el marco y el título, esto
// pone el contenido. Rediseño 2026-09-23; antes cada contenedor tenía su
// propia copia de este bloque y ya habían divergido (uno mostraba la
// captura como miniatura, el otro como chip).
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppTag from '../../components/ui/AppTag.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';

defineProps({
  ticket: { type: Object, required: true },
  // La página completa tiene ancho para ver la captura; el panel, no.
  miniatura: { type: Boolean, default: false },
});
</script>

<template>
  <div class="space-y-3">
    <div v-if="ticket.vinculado && ticket.empleado_nombre" class="flex min-w-0 items-center gap-3">
      <AppAvatar :nombre="ticket.empleado_nombre" tamano="md" />
      <div class="min-w-0">
        <RouterLink
          class="block truncate font-medium text-gray-900 hover:text-primary-700 hover:underline"
          :to="`/empleados/${ticket.empleado_id}`"
        >{{ ticket.empleado_nombre }}</RouterLink>
        <p class="truncate text-xs text-gray-500">
          <span class="tabular-nums">DNI {{ ticket.empleado_dni }}</span>
          <template v-if="ticket.empleado_correo"> · {{ ticket.empleado_correo }}</template>
        </p>
      </div>
    </div>

    <div v-else class="space-y-2">
      <BadgeEstado tipo="ticket_sin_vincular" valor="sin_vincular" />
      <p v-if="ticket.contacto_ingresado" class="text-sm text-gray-700">
        Contacto ingresado: <span class="font-medium">{{ ticket.contacto_ingresado }}</span>
      </p>
      <p class="text-xs text-gray-500">
        No se pudo identificar al solicitante. Revise manualmente quién es y, si corresponde, vincúlelo desde los comentarios.
      </p>
    </div>

    <div
      v-if="ticket.equipo_desc || ticket.cuenta_desc || ticket.licencia_desc || (ticket.adjunto_url && !miniatura)"
      class="flex flex-wrap gap-1.5"
    >
      <AppTag v-if="ticket.equipo_desc" icono="ti ti-devices">{{ ticket.equipo_desc }}</AppTag>
      <AppTag v-if="ticket.cuenta_desc" icono="ti ti-key">{{ ticket.cuenta_desc }}</AppTag>
      <AppTag v-if="ticket.licencia_desc" icono="ti ti-license">{{ ticket.licencia_desc }}</AppTag>
      <a
        v-if="ticket.adjunto_url && !miniatura"
        class="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :href="ticket.adjunto_url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <AppTag icono="ti ti-camera" tono="info">Captura adjunta</AppTag>
      </a>
    </div>

    <a
      v-if="ticket.adjunto_url && miniatura"
      class="block overflow-hidden rounded-md border border-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      :href="ticket.adjunto_url"
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir la captura en otra pestaña"
    >
      <img class="max-h-48 w-full object-cover" :src="ticket.adjunto_url" alt="Captura adjunta al ticket">
    </a>
  </div>
</template>
