<script setup>
// Quién pidió el ticket y a qué está enlazado (equipo, cuenta, licencia,
// captura). Contenido compartido entre la página completa
// (TicketDetalleView.vue) y el panel del split-view (TicketDetallePanel.vue)
// — mismo criterio que TicketCamposGestion/TicketComposer (AGENTS.md,
// "Helpers compartidos… 3"): el contenedor pone el marco y el título, esto
// pone el contenido. Rediseño 2026-09-23; antes cada contenedor tenía su
// propia copia de este bloque y ya habían divergido (uno mostraba la
// captura como miniatura, el otro como chip).
//
// La captura vive en un bucket PRIVADO (migración 111): no hay URL pública en el
// ticket, solo `tiene_adjunto`. La URL firmada (300 s) se pide a la edge
// function `tickets` (acción adjuntoStaff) al montar la miniatura y, para
// abrirla en otra pestaña, SIEMPRE al hacer clic: una URL guardada vence.
import { ref, watch, onBeforeUnmount } from 'vue';
import { urlAdjuntoTicket } from '../../api/ticketsPublicos.js';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppTag from '../../components/ui/AppTag.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';

const props = defineProps({
  ticket: { type: Object, required: true },
  // La página completa tiene ancho para ver la captura; el panel, no.
  miniatura: { type: Boolean, default: false },
});

const urlMiniatura = ref('');
const errorCaptura = ref('');
let vigente = 0; // descarta respuestas de un ticket que ya no es el mostrado

async function cargarMiniatura() {
  const turno = ++vigente;
  urlMiniatura.value = '';
  errorCaptura.value = '';
  if (!props.miniatura || !props.ticket.tiene_adjunto) return;
  try {
    const { url } = await urlAdjuntoTicket(props.ticket.id);
    if (turno === vigente) urlMiniatura.value = url;
  } catch {
    // La miniatura es solo vista previa: sin ella queda el aviso y se puede reintentar
    if (turno === vigente) errorCaptura.value = 'No se pudo cargar la captura.';
  }
}

watch(() => [props.ticket.id, props.ticket.tiene_adjunto, props.miniatura], cargarMiniatura, { immediate: true });
onBeforeUnmount(() => { vigente += 1; });

// La pestaña se abre en el clic (antes del `await` de la URL firmada) y se
// redirige después: así el navegador no la bloquea como ventana emergente.
async function abrirCaptura() {
  const ventana = window.open('', '_blank');
  if (ventana) ventana.opener = null;
  errorCaptura.value = '';
  try {
    const { url } = await urlAdjuntoTicket(props.ticket.id);
    if (ventana) ventana.location.href = url;
    else window.open(url, '_blank', 'noopener');
  } catch {
    ventana?.close();
    errorCaptura.value = 'No se pudo abrir la captura. Intente de nuevo.';
  }
}
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
      v-if="ticket.equipo_desc || ticket.cuenta_desc || ticket.licencia_desc || (ticket.tiene_adjunto && !miniatura)"
      class="flex flex-wrap gap-1.5"
    >
      <AppTag v-if="ticket.equipo_desc" icono="ti ti-devices">{{ ticket.equipo_desc }}</AppTag>
      <AppTag v-if="ticket.cuenta_desc" icono="ti ti-key">{{ ticket.cuenta_desc }}</AppTag>
      <AppTag v-if="ticket.licencia_desc" icono="ti ti-license">{{ ticket.licencia_desc }}</AppTag>
      <button
        v-if="ticket.tiene_adjunto && !miniatura"
        type="button"
        class="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        data-captura="abrir"
        title="Abrir la captura en otra pestaña"
        @click="abrirCaptura"
      >
        <AppTag icono="ti ti-camera" tono="info">Captura adjunta</AppTag>
      </button>
    </div>

    <button
      v-if="ticket.tiene_adjunto && miniatura && urlMiniatura"
      type="button"
      class="block w-full overflow-hidden rounded-md border border-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      data-captura="abrir"
      title="Abrir la captura en otra pestaña"
      @click="abrirCaptura"
    >
      <img class="max-h-48 w-full object-cover" :src="urlMiniatura" alt="Captura adjunta al ticket">
    </button>

    <p v-if="errorCaptura" class="text-xs text-red-700" role="alert" data-captura="error">{{ errorCaptura }}</p>
  </div>
</template>
