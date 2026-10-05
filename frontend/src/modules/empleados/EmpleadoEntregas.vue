<script setup>
// "Entregas de credenciales": los enlaces de un solo uso que se enviaron al
// empleado, con su estado (enviada / abierta / vencida) y fecha. Antes ninguna
// ficha mostraba las aperturas (163 registradas en accesos_log). "Enviar nueva"
// crea otro enlace con todas sus cuentas y abre WhatsApp: solo se ofrece a quien
// puede revelar contraseñas (la edge function `credenciales` lo exige), a un
// empleado Activo y si tiene cuentas que enviar.
//
// Los renglones se arman en el script: este bloque es una lista de registros
// (no el libro de movimientos, que vive en EmpleadoLibro).
import { computed } from 'vue';
import { formatFechaLibro } from '../../core/formatters.js';
import { estadoEntrega } from './libroEmpleado.js';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  entregas: { type: Array, default: () => [] },
  // Puede enviar una nueva (permiso + estado + cuentas), lo decide la vista.
  puedeEnviar: { type: Boolean, default: false },
  enviando: { type: Boolean, default: false },
});
defineEmits(['enviar']);

const TEXTO = { enviada: 'enviada', abierta: 'abierta', vencida: 'vencida' };

const filas = computed(() => props.entregas.slice(0, 6).map((e) => {
  const estado = estadoEntrega(e);
  const { fecha, hora } = formatFechaLibro(estado === 'abierta' ? e.viewed_at : e.created_at);
  return { id: e.id, estado: TEXTO[estado], cuando: hora ? `${fecha} ${hora}` : fecha };
}));
</script>

<template>
  <AppSeccion data-no-print titulo="Entregas de credenciales" :conteo="entregas.length" sin-padding>
    <template v-if="puedeEnviar" #acciones>
      <AppButton
        size="sm"
        variant="text"
        :icon="enviando ? 'ti ti-loader-2' : 'ti ti-brand-whatsapp'"
        :loading="enviando"
        :label="enviando ? 'Generando enlace...' : 'Enviar nueva'"
        :disabled="enviando"
        @click="$emit('enviar')"
      />
    </template>

    <p v-if="!filas.length" class="px-4 py-3 text-sm text-gray-500">— Sin entregas registradas.</p>
    <ul v-else class="divide-y divide-gray-100" aria-label="Entregas de credenciales">
      <li v-for="f in filas" :key="f.id" class="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
        <span class="text-gray-900">Entrega {{ f.estado }}</span>
        <span class="text-xs tabular-nums text-gray-500">{{ f.cuando }}</span>
      </li>
    </ul>
  </AppSeccion>
</template>
