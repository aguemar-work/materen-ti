<script setup>
// «Mis equipos» del portal del empleado (migración 109): los equipos que tiene a
// su cargo y, si el enlace lo permite, el botón «Confirmar recepción». Una vez
// confirmada se escribe la fecha; la confirmación NO es una firma: el acta firmada
// sigue siendo el documento. Solo presenta: la llamada la hace la vista.
import { useId } from 'vue';
import { formatFecha } from '../../core/formatters.js';
import { fechaLocal } from '../../core/dominio-portal.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppTag from '../../components/ui/AppTag.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';

defineProps({
  equipos: { type: Array, default: () => [] },
  // El enlace permite confirmar (alcance confirmar_equipo).
  puedeConfirmar: { type: Boolean, default: false },
  // asignacion_id que se está confirmando ahora.
  confirmandoId: { type: String, default: '' },
  error: { type: String, default: '' },
});
defineEmits(['confirmar']);

const idTitulo = useId();
const infoError = infoNotificacion('error');
</script>

<template>
  <section :aria-labelledby="idTitulo">
    <h2 :id="idTitulo" class="text-sm font-semibold text-gray-900">Mis equipos</h2>

    <p v-if="!equipos.length" class="mt-2 text-sm text-gray-500">No tiene equipos a su cargo.</p>

    <ul v-else class="mt-3 flex flex-col gap-3">
      <li v-for="e in equipos" :key="e.asignacion_id" class="rounded-lg border border-gray-200 p-4">
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p class="min-w-0 text-sm text-gray-900 [overflow-wrap:anywhere]">
            <AppCodigo :valor="e.codigo" titulo="Código del equipo" />
            <span class="text-gray-600"> · {{ e.tipo }}</span>
          </p>
          <AppTag v-if="e.confirmado_at" tono="ok" icono="ti ti-check">Recibido</AppTag>
        </div>
        <p class="mt-1 text-xs text-gray-500 [overflow-wrap:anywhere]">
          Entregado el {{ formatFecha(e.entregado) }}<template v-if="e.condicion"> · {{ e.condicion }}</template>
        </p>

        <p v-if="e.confirmado_at" class="mt-3 text-sm text-gray-600">
          Recepción confirmada el {{ fechaLocal(e.confirmado_at) }}.
        </p>
        <AppButton
          v-else-if="puedeConfirmar"
          class="mt-3"
          size="lg"
          block
          icon="ti ti-check"
          label="Confirmar recepción"
          :aria-label="`Confirmar recepción del equipo ${e.codigo}`"
          :loading="confirmandoId === e.asignacion_id"
          :disabled="!!confirmandoId"
          @click="$emit('confirmar', e.asignacion_id)"
        />
      </li>
    </ul>

    <div v-if="error" class="notif mt-3" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
      <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
      <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
    </div>
    <p v-if="confirmandoId" class="sr-only" role="status">Confirmando la recepción...</p>
  </section>
</template>
