<script setup>
// Datos mínimos del correo que se registrará en Correos al guardar la licencia
// (plataforma, tipo y contraseña opcional). Extraído de LicenciaForm.vue al
// partirlo. El valor es inmutable hacia afuera: cada cambio emite un objeto
// nuevo por `update:modelValue`.
import { ref } from 'vue';
import { generarPassword } from '../../core/generarPassword.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

const props = defineProps({
  modelValue: { type: Object, required: true },
  plataformas: { type: Array, default: () => [] },
  deshabilitado: { type: Boolean, default: false },
  // La plataforma falló la validación del último intento de guardar.
  plataformaInvalida: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const refPlataforma = ref(null);
const passwordVisible = ref(false);

const campoPlataforma = useCampoAccesible({
  error: () => (props.plataformaInvalida ? 'Seleccione la plataforma del correo nuevo' : ''),
});
const campoTipoCuenta = useCampoAccesible();
const campoPassword = useCampoAccesible();

function cambiar(campo, valor) {
  emit('update:modelValue', { ...props.modelValue, [campo]: valor });
}

function generar() {
  cambiar('password', generarPassword());
  passwordVisible.value = true;
}

// Lleva el foco a la plataforma cuando es el campo que falló.
function enfocarPlataforma() {
  refPlataforma.value?.focus();
}
defineExpose({ enfocarPlataforma });
</script>

<template>
  <div class="full rounded-lg border border-gray-200 bg-gray-50 p-4">
    <p class="mb-3 flex items-start gap-2 text-sm text-gray-700">
      <i class="ti ti-mail-plus mt-0.5 text-gray-500" aria-hidden="true"></i>
      Este correo no existe todavía: se registrará en el módulo Correos al guardar.
    </p>
    <div class="grid gap-4 md:grid-cols-2">
      <div class="campo" :class="{ 'campo--invalido': campoPlataforma.invalido.value, 'campo--inerte': deshabilitado }">
        <label class="campo__etiqueta" :for="campoPlataforma.id">Plataforma<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <select
            :id="campoPlataforma.id"
            ref="refPlataforma"
            class="campo__control campo__control--select"
            :value="modelValue.plataforma_id"
            required
            :disabled="deshabilitado"
            :aria-invalid="campoPlataforma.invalido.value"
            :aria-describedby="campoPlataforma.describedBy.value"
            @change="cambiar('plataforma_id', $event.target.value)"
          >
            <option value="" disabled>Seleccionar plataforma</option>
            <option v-for="p in plataformas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
        <p
          v-if="campoPlataforma.invalido.value"
          :id="campoPlataforma.idAyuda"
          class="campo__pie campo__pie--error"
          role="alert"
        >Seleccione la plataforma del correo nuevo</p>
      </div>

      <div class="campo" :class="{ 'campo--inerte': deshabilitado }">
        <label class="campo__etiqueta" :for="campoTipoCuenta.id">Tipo de correo</label>
        <div class="campo__caja">
          <select
            :id="campoTipoCuenta.id"
            class="campo__control campo__control--select"
            :value="modelValue.tipo_cuenta"
            :disabled="deshabilitado"
            @change="cambiar('tipo_cuenta', $event.target.value)"
          >
            <option value="compartida">Compartido (varios a la vez)</option>
            <option value="reutilizable">Reutilizable (uno a la vez)</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo md:col-span-2" :class="{ 'campo--inerte': deshabilitado }">
        <label class="campo__etiqueta" :for="campoPassword.id">Contraseña del correo</label>
        <div class="campo__caja pr-1">
          <input
            :id="campoPassword.id"
            :value="modelValue.password"
            class="campo__control"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="Opcional, se puede completar después en Correos"
            :disabled="deshabilitado"
            @input="cambiar('password', $event.target.value)"
          >
          <button type="button" class="icon-btn shrink-0" title="Generar contraseña" aria-label="Generar contraseña" :disabled="deshabilitado" @click="generar">
            <i class="ti ti-refresh" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-btn shrink-0" :title="passwordVisible ? 'Ocultar' : 'Mostrar'" :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="passwordVisible = !passwordVisible">
            <i :class="passwordVisible ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
