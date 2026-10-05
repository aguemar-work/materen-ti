<script setup>
// Sección "Acceso al software" del formulario de licencia: el modo de acceso
// (sin credencial / con login / con clave), el buscador del correo que da el
// acceso —con registro "al vuelo" de un correo nuevo— y la clave o serial
// propios. Extraído de LicenciaForm.vue al partirlo: el estado vive en el
// formulario (snapshot de cambios sin guardar y validación) y llega por
// v-model; esta pieza solo pinta y avisa.
import { ref, computed } from 'vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import LicenciaCorreoNuevo from './LicenciaCorreoNuevo.vue';
import { esCorreoValido } from './licenciaFormulario.js';

const props = defineProps({
  correos: { type: Array, default: () => [] },
  plataformas: { type: Array, default: () => [] },
  cargandoCatalogos: { type: Boolean, default: false },
  guardando: { type: Boolean, default: false },
  // Campo que falló la última validación: '' | 'correo' | 'plataforma'.
  campoInvalido: { type: String, default: '' },
  esEdicion: { type: Boolean, default: false },
  // La licencia editada ya tiene clave propia (la actual nunca se muestra).
  tieneClave: { type: Boolean, default: false },
});
// El usuario eligió (o volvió a escribir) un correo: el formulario apaga el
// resaltado de error.
const emit = defineEmits(['seleccion-correo']);

const modo = defineModel('modo', { type: String, required: true });
const cuentaId = defineModel('cuentaId', { type: String, default: '' });
const clave = defineModel('clave', { type: String, default: '' });
const busqueda = defineModel('busqueda', { type: String, default: '' });
const registrando = defineModel('registrando', { type: Boolean, default: false });
const correoNuevo = defineModel('correoNuevo', { type: Object, required: true });

const OPCIONES = [
  { valor: 'ninguno', icono: 'ti ti-ban', label: 'Sin credencial', desc: 'Solo registro del contrato' },
  { valor: 'login', icono: 'ti ti-mail', label: 'Con login', desc: 'Se entra con un correo del sistema' },
  { valor: 'clave', icono: 'ti ti-key', label: 'Con clave/serial', desc: 'Clave de activación cifrada' },
];

const claveVisible = ref(false);
const refGrupoCorreo = ref(null);
const refCorreoNuevo = ref(null);

const campoClaveLogin = useCampoAccesible({
  ayuda: () => 'Algunos software (ej: AutoCAD) usan el correo como usuario pero tienen su propia contraseña. Si se entra con la contraseña del correo, déjelo vacío.',
});
const campoClaveDirecta = useCampoAccesible();

const correoEscritoValido = computed(() => esCorreoValido(busqueda.value));

// Si ya existe exactamente ese correo, no tiene sentido ofrecer registrarlo
const correoYaRegistrado = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return props.correos.some((c) => c.usuario.toLowerCase() === q);
});

// Cualquier cambio de selección (elegir de la lista o volver a escribir)
// cancela el modo "registrar correo nuevo" en curso.
function onSeleccionCorreo() {
  registrando.value = false;
  emit('seleccion-correo');
}

function elegirRegistrarCorreo() {
  busqueda.value = busqueda.value.trim().toLowerCase();
  registrando.value = true;
}

const etiquetaClaveLogin = computed(() => (props.esEdicion && props.tieneClave ? 'Nueva contraseña del software' : 'Contraseña del software'));
const etiquetaClaveDirecta = computed(() => (props.esEdicion && props.tieneClave ? 'Nueva clave/serial' : 'Clave / serial'));
const mantenerActual = computed(() => props.esEdicion && props.tieneClave);

// Lleva el foco al campo que falló la validación.
function enfocar(campo) {
  if (campo === 'correo') refGrupoCorreo.value?.querySelector('input')?.focus();
  else if (campo === 'plataforma') refCorreoNuevo.value?.enfocarPlataforma();
}
defineExpose({ enfocar });
</script>

<template>
  <div class="section-label">
    <i class="ti ti-lock-access" aria-hidden="true"></i> Acceso al software
  </div>
  <fieldset class="full">
    <legend class="sr-only">Acceso al software</legend>
    <div class="grid gap-2 sm:grid-cols-3">
      <label
        v-for="op in OPCIONES"
        :key="op.valor"
        class="relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150 focus-within:ring-2 focus-within:ring-primary-500"
        :class="modo === op.valor ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'"
      >
        <input v-model="modo" type="radio" :value="op.valor" class="sr-only" :disabled="guardando">
        <i class="mt-0.5 text-lg" :class="[op.icono, modo === op.valor ? 'text-primary-600' : 'text-gray-500']" aria-hidden="true"></i>
        <span class="min-w-0">
          <span class="block text-sm font-medium" :class="modo === op.valor ? 'text-primary-700' : 'text-gray-900'">{{ op.label }}</span>
          <span class="mt-0.5 block text-xs text-gray-500">{{ op.desc }}</span>
        </span>
      </label>
    </div>
  </fieldset>

  <template v-if="modo === 'login'">
    <div ref="refGrupoCorreo" class="campo full" :class="{ '[&_.combo-wrap_input]:border-red-500': campoInvalido === 'correo' }">
      <label class="campo__etiqueta" for="lf-cuenta">Correo que da acceso<span aria-hidden="true"> *</span></label>
      <BuscadorCombo
        id="lf-cuenta"
        v-model="cuentaId"
        v-model:busqueda="busqueda"
        :items="correos"
        :campos-busqueda="['usuario', 'plataforma_nombre']"
        :etiqueta="(c) => c.usuario"
        :placeholder="cargandoCatalogos ? 'Cargando correos...' : 'Buscar correo por dirección o plataforma...'"
        :disabled="guardando || cargandoCatalogos"
        :forzar-cerrado="registrando"
        @update:model-value="onSeleccionCorreo"
      >
        <template #icono="{ seleccionado }">
          <i v-if="seleccionado" class="ti ti-circle-check combo-check" aria-hidden="true"></i>
          <i v-else-if="registrando" class="ti ti-circle-plus combo-check combo-check--nuevo" aria-hidden="true"></i>
        </template>
        <template #resultado="{ item }">
          <span class="combo-usuario">{{ item.usuario }}</span>
          <span class="combo-plataforma">{{ item.plataforma_nombre }}</span>
        </template>
        <template #vacio="{ sinResultados }">
          <li v-if="sinResultados && !correoEscritoValido" class="combo-vacio">
            Sin resultados. Escriba el correo completo para registrarlo desde aquí.
          </li>
        </template>
        <template #extra>
          <li
            v-if="correoEscritoValido && !correoYaRegistrado"
            class="combo-registrar"
            @mousedown.prevent="elegirRegistrarCorreo"
          >
            <i class="ti ti-circle-plus" aria-hidden="true"></i>
            <span>Registrar <strong>{{ busqueda.trim().toLowerCase() }}</strong> como correo nuevo</span>
          </li>
        </template>
      </BuscadorCombo>
      <p class="campo__pie">
        Los usuarios se asignan desde la lista de Licencias, desde Correos o desde la ficha del
        empleado: es la misma cuenta. El sistema no permite más personas que asientos comprados.
      </p>
    </div>

    <LicenciaCorreoNuevo
      v-if="registrando"
      ref="refCorreoNuevo"
      v-model="correoNuevo"
      :plataformas="plataformas"
      :deshabilitado="guardando"
      :plataforma-invalida="campoInvalido === 'plataforma'"
    />

    <div class="campo full" :class="{ 'campo--inerte': guardando }">
      <label class="campo__etiqueta" :for="campoClaveLogin.id">{{ etiquetaClaveLogin }}</label>
      <div class="campo__caja pr-1">
        <input
          :id="campoClaveLogin.id"
          v-model="clave"
          class="campo__control"
          :type="claveVisible ? 'text' : 'password'"
          autocomplete="off"
          :placeholder="mantenerActual ? 'Dejar vacío para mantener la actual' : 'Dejar vacío si es la misma del correo'"
          :disabled="guardando"
          :aria-describedby="campoClaveLogin.describedBy.value"
        >
        <button type="button" class="icon-btn shrink-0" :title="claveVisible ? 'Ocultar' : 'Mostrar'" :aria-label="claveVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="claveVisible = !claveVisible">
          <i :class="claveVisible ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
        </button>
      </div>
      <p :id="campoClaveLogin.idAyuda" class="campo__pie">Algunos software (ej: AutoCAD) usan el correo como usuario pero tienen su propia contraseña. Si se entra con la contraseña del correo, déjelo vacío.</p>
    </div>
  </template>

  <div v-if="modo === 'clave'" class="campo full" :class="{ 'campo--inerte': guardando }">
    <label class="campo__etiqueta" :for="campoClaveDirecta.id">{{ etiquetaClaveDirecta }}</label>
    <div class="campo__caja pr-1">
      <input
        :id="campoClaveDirecta.id"
        v-model="clave"
        class="campo__control tabular-nums"
        :type="claveVisible ? 'text' : 'password'"
        autocomplete="off"
        :placeholder="mantenerActual ? 'Dejar vacío para mantener la actual' : 'XXXXX-XXXXX-XXXXX'"
        :disabled="guardando"
      >
      <button type="button" class="icon-btn shrink-0" :title="claveVisible ? 'Ocultar' : 'Mostrar'" :aria-label="claveVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="claveVisible = !claveVisible">
        <i :class="claveVisible ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>
