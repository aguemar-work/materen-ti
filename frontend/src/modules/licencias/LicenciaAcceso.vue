<script setup>
// Celda "Acceso" de una licencia: el correo que da el acceso o la clave/serial
// propia, con el revelado auditado (useRevelado, marcado .cred* intacto). Sin
// permiso para ver contraseñas queda el candado; el servidor es la barrera.
import { computed } from 'vue';

const props = defineProps({
  licencia: { type: Object, required: true },
  // Instancia de crearRevelado() de esta licencia (useLicenciaRevelados).
  revelado: { type: Object, required: true },
  puedeVer: { type: Boolean, default: false },
});

const conCorreo = computed(() => !!props.licencia.cuenta_id);
// "Clave" cuando el secreto es el serial; "contraseña" cuando es la del correo.
const nombreSecreto = computed(() => (conCorreo.value ? 'contraseña' : 'clave'));
</script>

<template>
  <div v-if="conCorreo || licencia.tiene_clave" class="min-w-0" :class="{ 'max-w-52 2xl:max-w-64': conCorreo }">
    <div v-if="conCorreo" class="flex min-w-0 items-center gap-1.5 text-sm text-gray-700" :title="licencia.cuenta_usuario">
      <i class="ti ti-mail shrink-0 text-gray-500" aria-hidden="true"></i>
      <span class="truncate">{{ licencia.cuenta_usuario }}</span>
    </div>
    <div v-else class="flex items-center gap-1.5 text-sm text-gray-700">
      <i class="ti ti-key text-gray-500" aria-hidden="true"></i>Clave / serial
    </div>
    <div class="mt-1" :class="{ 'flex items-center gap-2': conCorreo }">
      <div class="cred">
        <span v-if="revelado.valor.value" class="cred__valor">{{ revelado.valor.value }}</span>
        <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
        <template v-if="puedeVer">
          <button
            type="button"
            class="cred__accion"
            :disabled="revelado.pidiendo.value"
            :aria-label="revelado.valor.value ? `Ocultar ${nombreSecreto}` : `Mostrar ${nombreSecreto}`"
            @click="revelado.mostrar()"
          >
            <i :class="revelado.valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
          </button>
          <button type="button" class="cred__accion" :disabled="revelado.pidiendo.value" :aria-label="`Copiar ${nombreSecreto}`" @click="revelado.copiar()">
            <i class="ti ti-copy" aria-hidden="true"></i>
          </button>
          <span v-if="revelado.valor.value" class="cred__cuenta" aria-live="off">{{ revelado.restante.value }}s</span>
        </template>
        <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver contraseñas"><i class="ti ti-lock" aria-hidden="true"></i></span>
      </div>
      <span v-if="conCorreo" class="text-xs text-gray-500">{{ licencia.tiene_clave ? 'propia' : 'del correo' }}</span>
    </div>
  </div>
  <span v-else class="text-gray-500">Sin credencial</span>
</template>
