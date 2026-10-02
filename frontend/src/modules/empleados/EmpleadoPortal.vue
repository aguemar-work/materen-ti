<script setup>
// «Portal del empleado» del expediente (migración 109): estado del enlace
// personal con el que el empleado ve sus equipos, cuentas (sin contraseña) y
// tickets, y confirma la recepción de un equipo, sin tener una cuenta. La acción
// «Enviar enlace del portal» abre PortalEnlaceDialog (que genera, muestra UNA vez
// el enlace y permite revocarlo); el envío al empleado lo hace el staff a mano.
// Solo se ofrece a un empleado Activo y a quien tiene el módulo `empleados`.
import { computed } from 'vue';
import { estadoEnlacePortal, fechaLocal, resumenAlcance } from '../../core/dominio-portal.js';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  // Enlace sin revocar (columnas no secretas) o null.
  enlace: { type: Object, default: null },
});
defineEmits(['abrir']);

const estado = computed(() => estadoEnlacePortal(props.enlace));
const usos = computed(() => props.enlace?.usos || 0);
</script>

<template>
  <AppSeccion data-no-print titulo="Portal del empleado">
    <template #acciones>
      <AppButton size="sm" variant="text" icon="ti ti-link" label="Enviar enlace del portal" @click="$emit('abrir')" />
    </template>

    <p v-if="!estado" class="text-sm text-gray-500">
      Sin enlace. Con uno, el empleado ve sus equipos, cuentas y tickets, y confirma la recepción, sin crear una cuenta.
    </p>
    <div v-else class="space-y-2 text-sm">
      <p class="flex flex-wrap items-center gap-2 text-gray-900">
        <AppTag :tono="estado === 'vigente' ? 'ok' : 'neutro'" punto>{{ estado === 'vigente' ? 'Vigente' : 'Vencido' }}</AppTag>
        <span class="text-gray-600">
          {{ estado === 'vigente' ? 'hasta el' : 'venció el' }} {{ fechaLocal(enlace.expires_at) }}
        </span>
      </p>
      <p class="text-xs text-gray-500">
        Puede ver: {{ resumenAlcance(enlace.alcance) }}.
        <template v-if="usos">Abierto {{ usos }} {{ usos === 1 ? 'vez' : 'veces' }}, la última el {{ fechaLocal(enlace.ultimo_uso_at) }}.</template>
        <template v-else>Todavía no se abrió.</template>
      </p>
    </div>
  </AppSeccion>
</template>
