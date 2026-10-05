<script setup>
// Guía de alta: una fila de pasos bajo la carátula, sin barra de progreso. Es la
// solicitud de alta ABIERTA de la persona (migración 108) leída en el lugar donde
// se trabaja: cada paso pendiente es su propia acción («Crear cuenta», «Enviar por
// WhatsApp», «Entregar», «Asignar», «Marcar hecho»). Qué pasos hay y cuáles están
// hechos lo decide el servidor —los marca solos el uso de cuentas, entregas,
// equipos y licencias—; la vista solo le engancha qué abre cada botón.
//
//   ALTA EN CURSO · 2 de 7 pasos · abierta hace 1 día · SOL-0012                [×]
//   ✓ Registrar a la persona   ✓ Crear la cuenta de correo   ○ Entregar las credenciales  Enviar por WhatsApp …
//
// No se imprime. Ocultarla con la × la silencia solo en esta visita: el trámite
// sigue abierto (en la sección «Solicitudes» y en Inicio) hasta que se complete.
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';

const props = defineProps({
  // [{ id, label, hecho, omitido, requisito, accion, ejecutar? }]
  pasos: { type: Array, required: true },
  // { id, codigo } de la solicitud de alta.
  solicitud: { type: Object, required: true },
  // Días desde que se abrió (null = no se sabe, 0 = hoy).
  dias: { type: Number, default: null },
});
defineEmits(['cerrar']);

const hechos = computed(() => props.pasos.filter((p) => p.hecho).length);
const abierta = computed(() => {
  if (props.dias == null) return '';
  if (props.dias <= 0) return 'abierta hoy';
  return `abierta hace ${props.dias} ${props.dias === 1 ? 'día' : 'días'}`;
});
</script>

<template>
  <section data-no-print class="border-b border-gray-200 px-4 py-3 sm:px-6" aria-labelledby="alta-titulo">
    <div class="flex items-center justify-between gap-3">
      <h2 id="alta-titulo" class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        Alta en curso · {{ hechos }} de {{ pasos.length }} pasos<template v-if="abierta"> · {{ abierta }}</template>
        ·
        <RouterLink
          :to="`/solicitudes/${solicitud.id}`"
          class="rounded-sm normal-case text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        ><AppCodigo :valor="solicitud.codigo" titulo="Número de solicitud" /></RouterLink>
      </h2>
      <button
        class="icon-btn"
        type="button"
        title="Ocultar la guía"
        aria-label="Ocultar la guía de alta"
        @click="$emit('cerrar')"
      >
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>

    <ol class="mt-2 flex flex-wrap gap-x-6 gap-y-1">
      <li v-for="paso in pasos" :key="paso.id" class="flex items-center gap-1.5 text-sm" :data-hecho="paso.hecho">
        <i
          :class="paso.hecho ? (paso.omitido ? 'ti ti-circle-minus text-gray-500' : 'ti ti-circle-check text-green-700') : 'ti ti-circle-dashed text-gray-500'"
          aria-hidden="true"
        ></i>
        <span :class="paso.hecho ? 'text-gray-500' : 'text-gray-900'">{{ paso.label }}</span>
        <span v-if="!paso.requisito && !paso.hecho" class="text-xs text-gray-500">opcional</span>
        <span v-if="paso.omitido" class="text-xs text-gray-500">omitido</span>
        <AppButton
          v-if="!paso.hecho && paso.ejecutar"
          size="sm"
          variant="text"
          :label="paso.accion"
          :aria-label="`${paso.accion}: ${paso.label}`"
          @click="paso.ejecutar()"
        />
      </li>
    </ol>
  </section>
</template>
