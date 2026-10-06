<script setup>
// Interruptor «Mesa de ayuda» de una fila de Configuración › Staff (migración
// 118): marca al técnico que los reportes de Tickets y Satisfacción muestran en
// su propia fila; lo que resuelva cualquier otra persona va en «Jefatura y
// otros». Solo un JEFE lo cambia: para el resto es texto. La barrera real es
// el trigger check_staff_tecnico_mesa (42501).
defineProps({
  miembro: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false },
});
const emit = defineEmits(['cambiar']);
</script>

<template>
  <button
    v-if="editable"
    type="button"
    role="switch"
    class="inline-flex items-center gap-2 rounded-md py-1 pr-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed"
    :aria-checked="miembro.tecnico_mesa"
    :disabled="ocupado"
    :aria-label="`Técnico de mesa de ayuda: ${miembro.nombre}`"
    :title="miembro.tecnico_mesa ? 'Quitar de los reportes de mesa de ayuda' : 'Mostrar en su propia fila en los reportes de mesa de ayuda'"
    @click="emit('cambiar', miembro)"
  >
    <span
      class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150"
      :class="miembro.tecnico_mesa ? 'bg-primary-500' : 'bg-gray-200'"
      aria-hidden="true"
    >
      <span
        class="inline-block h-4 w-4 rounded-full bg-white ring-1 ring-black/5 transition-transform duration-150"
        :class="miembro.tecnico_mesa ? 'translate-x-4.5' : 'translate-x-0.5'"
      ></span>
    </span>
    <span class="whitespace-nowrap" :class="miembro.tecnico_mesa ? 'text-gray-900' : 'text-gray-500'">
      <i v-if="ocupado" class="ti ti-loader-2 animate-spin" aria-hidden="true"></i>
      {{ miembro.tecnico_mesa ? 'Técnico' : 'No' }}
    </span>
  </button>
  <span v-else class="text-sm" :class="miembro.tecnico_mesa ? 'text-gray-900' : 'text-gray-500'">{{ miembro.tecnico_mesa ? 'Técnico' : 'No' }}</span>
</template>
