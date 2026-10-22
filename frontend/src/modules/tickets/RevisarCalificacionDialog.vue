<script setup>
// Revisar una calificación de 1 o 2 (procedimiento de cierre, migración 120):
// el técnico asignado revisa el comentario a más tardar el día hábil
// siguiente. Si la necesidad no se resolvió, reabre el ticket y sigue la
// atención (sin ser JEFE: solo por esta vía); si se resolvió, deja una nota
// interna con la explicación. Las dos quedan en la encuesta, en el historial
// del ticket y en el reporte de Satisfacción. Una sola vez por calificación.
//
// Lo abren la ficha del ticket (TicketResumen) y la bandeja «Calificaciones
// por revisar». Emite `cerrar` con la respuesta de la RPC, o null si se canceló.
import { ref, computed } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { NOTA_REVISION_MAX } from '../../core/dominio-tickets.js';
import { formatFechaHora } from '../../core/formatters.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  // Fila de ticket_satisfaccion: { id, nivel, comentario, fecha_envio }.
  encuesta: { type: Object, required: true },
  // { codigo, titulo, estado } del ticket.
  ticket: { type: Object, required: true },
});
const emit = defineEmits(['cerrar']);

// Reabrir solo vale con el ticket todavía cerrado por esta calificación.
const puedeReabrir = computed(() => props.ticket.estado === 'cerrado');
const form = ref({ desenlace: puedeReabrir.value ? 'reabierto' : 'nota', nota: '' });
let resultado = null;

const { modal, guardando, error, ejecutarGuardado, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

const campoNota = useCampoAccesible({ ayuda: () => 'Obligatoria' });
const infoError = infoNotificacion('error');

async function guardar() {
  error.value = '';
  if (!form.value.nota.trim()) {
    error.value = 'Escriba qué se revisó con el solicitante.';
    return;
  }
  // ejecutarGuardado devuelve undefined cuando falla: una respuesta vacía de la
  // RPC no debe confundirse con una falla.
  const r = await ejecutarGuardado(
    async () => (await insforgeApi.revisarCalificacionBaja(props.encuesta.id, form.value.desenlace, form.value.nota)) ?? null,
    { entidad: 'la calificación', porDefecto: 'No se pudo registrar la revisión' },
  );
  if (r === undefined) return;
  resultado = r || { desenlace: form.value.desenlace };
  tomarSnapshot();
  modal.value?.cerrar();
}
</script>

<template>
  <AppDialog
    ref="modal"
    titulo="Revisar calificación"
    size="sm"
    :confirmar-cierre="confirmarCierre"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="revisar-calificacion-form" class="space-y-4" @submit.prevent="guardar">
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Ticket</dt>
        <dd class="min-w-0"><AppCodigo :valor="ticket.codigo" titulo="Número de ticket" /> · <span class="text-gray-900">{{ ticket.titulo }}</span></dd>
        <dt class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Calificación</dt>
        <dd class="font-medium tabular-nums text-red-700">{{ encuesta.nivel }}/5 · <span class="font-normal text-gray-700">{{ formatFechaHora(encuesta.fecha_envio) }}</span></dd>
      </dl>
      <p v-if="encuesta.comentario" class="whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">“{{ encuesta.comentario }}”</p>
      <p v-else class="text-sm text-gray-500">El solicitante no dejó comentario.</p>

      <fieldset class="space-y-2" :disabled="guardando">
        <legend class="campo__etiqueta">¿La necesidad quedó resuelta?<span aria-hidden="true"> *</span></legend>
        <label class="flex cursor-pointer items-start gap-2 text-sm text-gray-700" :class="{ 'cursor-not-allowed opacity-60': !puedeReabrir }">
          <input v-model="form.desenlace" type="radio" value="reabierto" class="mt-0.5 h-4 w-4 accent-primary-500" :disabled="!puedeReabrir">
          <span>No: reabrir el ticket y continuar la atención<span v-if="!puedeReabrir" class="block text-xs text-gray-500">El ticket ya no está cerrado con esta calificación.</span></span>
        </label>
        <label class="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
          <input v-model="form.desenlace" type="radio" value="nota" class="mt-0.5 h-4 w-4 accent-primary-500">
          <span>Sí: dejar una nota interna con la explicación</span>
        </label>
      </fieldset>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta flex items-baseline justify-between gap-3" :for="campoNota.id">
          <span>{{ form.desenlace === 'reabierto' ? 'Motivo para reabrir' : 'Explicación' }}<span aria-hidden="true"> *</span></span>
          <span class="text-xs font-normal tabular-nums text-gray-500" aria-hidden="true">{{ form.nota.length }}/{{ NOTA_REVISION_MAX }}</span>
        </label>
        <div class="campo__caja">
          <textarea
            :id="campoNota.id"
            v-model="form.nota"
            class="campo__control campo__control--area"
            :rows="3"
            required
            :maxlength="NOTA_REVISION_MAX"
            :disabled="guardando"
            :aria-describedby="campoNota.describedBy.value"
          ></textarea>
        </div>
        <p :id="campoNota.idAyuda" class="campo__pie">No la ve el solicitante. Se informa en el reporte mensual de Satisfacción.</p>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>
    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton
        type="submit"
        form="revisar-calificacion-form"
        :label="guardando ? 'Guardando...' : form.desenlace === 'reabierto' ? 'Reabrir ticket' : 'Guardar nota'"
        :loading="guardando"
      />
    </template>
  </AppDialog>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar. ¿Desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>
