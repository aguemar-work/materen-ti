<script setup>
// Guía de alta: una fila de pasos bajo la carátula, sin barra de progreso. Cada
// paso pendiente es su propia acción ("Crear cuenta", "Enviar por WhatsApp",
// "Entregar", "Asignar"); el estado de cada uno lo decide el dominio
// (core/dominio-empleados.js → pasosAlta) y la vista le engancha qué abre.
//
//   ALTA EN CURSO · 2 de 4 pasos · entró hace 1 día                        [×]
//   ✓ Cuenta de correo   ✓ Credenciales entregadas   ○ Equipo  Entregar   ○ Licencia  Asignar
//
// No se imprime. Ocultarla con la X solo silencia la guía cuando se llegó
// desde "Nuevo empleado"; si el alta sigue incompleta de verdad, el aviso
// vuelve (no se puede descartar un pendiente real con un clic).
import { computed } from 'vue';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  // [{ id, label, hecho, requisito, accion, ejecutar? }]
  pasos: { type: Array, required: true },
  lista: { type: Boolean, default: false },
  // Días desde el alta (null = no se sabe, 0 = hoy).
  dias: { type: Number, default: null },
});
defineEmits(['cerrar']);

const hechos = computed(() => props.pasos.filter((p) => p.hecho).length);
const entro = computed(() => {
  if (props.dias == null || props.lista) return '';
  if (props.dias <= 0) return 'entró hoy';
  return `entró hace ${props.dias} ${props.dias === 1 ? 'día' : 'días'}`;
});
</script>

<template>
  <section data-no-print class="border-b border-gray-200 px-4 py-3 sm:px-6" aria-labelledby="alta-titulo">
    <div class="flex items-center justify-between gap-3">
      <h2 id="alta-titulo" class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {{ lista ? 'Alta completa' : 'Alta en curso' }} · {{ hechos }} de {{ pasos.length }} pasos<template v-if="entro"> · {{ entro }}</template>
      </h2>
      <button
        class="icon-btn"
        type="button"
        :title="lista ? 'Ocultar' : 'Ocultar la guía'"
        aria-label="Ocultar la guía de alta"
        @click="$emit('cerrar')"
      >
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>

    <ol class="mt-2 flex flex-wrap gap-x-6 gap-y-1">
      <li v-for="paso in pasos" :key="paso.id" class="flex items-center gap-1.5 text-sm" :data-hecho="paso.hecho">
        <i
          :class="paso.hecho ? 'ti ti-circle-check text-green-700' : 'ti ti-circle-dashed text-gray-500'"
          aria-hidden="true"
        ></i>
        <span :class="paso.hecho ? 'text-gray-500' : 'text-gray-900'">{{ paso.label }}</span>
        <span v-if="!paso.requisito && !paso.hecho" class="text-xs text-gray-500">opcional</span>
        <AppButton
          v-if="!paso.hecho && paso.ejecutar"
          size="sm"
          variant="text"
          :label="paso.accion"
          @click="paso.ejecutar()"
        />
      </li>
    </ol>
  </section>
</template>
