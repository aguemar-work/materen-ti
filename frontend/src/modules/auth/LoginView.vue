<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../../stores/auth.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

const router = useRouter();
const auth = useAuthStore();
const { cargando } = storeToRefs(auth);

// modo: 'login' | 'reset-email' | 'reset-codigo' | 'reset-password'
const modo = ref('login');

const email = ref('');
const password = ref('');
const verPassword = ref(false);

// Si el campo se vacía, vuelve a ocultarse (el toggle desaparece con él)
watch(password, (v) => {
  if (!v) verPassword.value = false;
});
const error = ref('');
const aviso = ref('');
const procesando = ref(false);

const codigo = ref('');
const resetToken = ref('');
const nuevaPassword = ref('');
const confirmarPassword = ref('');
const errorConfirmar = ref('');

const campoEmailLogin = useCampoAccesible();
const campoEmailReset = useCampoAccesible();
const campoCodigo = useCampoAccesible();
const campoNuevaPassword = useCampoAccesible();
const campoConfirmarPassword = useCampoAccesible({ error: () => errorConfirmar.value });

const titulo = computed(() => ({
  'login': 'Iniciar sesión',
  'reset-email': 'Restablecer contraseña',
  'reset-codigo': 'Revise su correo',
  'reset-password': 'Nueva contraseña',
}[modo.value]));

const subtitulo = computed(() => ({
  'login': null, // el login va limpio: solo título, campos y CTA
  'reset-email': 'Se enviará un código de verificación a su correo.',
  'reset-codigo': `Ingrese el código de 6 dígitos enviado a ${email.value}.`,
  'reset-password': 'Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.',
}[modo.value]));

function irA(nuevoModo) {
  error.value = '';
  aviso.value = '';
  errorConfirmar.value = '';
  modo.value = nuevoModo;
}

function volverAlLogin() {
  codigo.value = '';
  resetToken.value = '';
  nuevaPassword.value = '';
  confirmarPassword.value = '';
  errorConfirmar.value = '';
  irA('login');
}

async function onSubmit() {
  error.value = '';

  try {
    await auth.login(email.value, password.value);
    await router.push('/dashboard');
  } catch (e) {
    error.value = e?.message || 'No se pudo iniciar sesión';
  }
}

async function onSolicitarCodigo() {
  error.value = '';
  const reenvio = modo.value === 'reset-codigo';
  procesando.value = true;
  try {
    await auth.solicitarCodigoReset(email.value);
    irA('reset-codigo');
    if (reenvio) aviso.value = 'Código reenviado.';
  } catch (e) {
    error.value = e?.message || 'No se pudo enviar el código';
  } finally {
    procesando.value = false;
  }
}

async function onVerificarCodigo() {
  error.value = '';
  procesando.value = true;
  try {
    resetToken.value = await auth.verificarCodigoReset(email.value, codigo.value.trim());
    irA('reset-password');
  } catch {
    error.value = 'Código inválido o expirado. Verifíquelo e intente de nuevo.';
  } finally {
    procesando.value = false;
  }
}

async function onCambiarPassword() {
  error.value = '';
  errorConfirmar.value = '';
  if (nuevaPassword.value !== confirmarPassword.value) {
    errorConfirmar.value = 'Las contraseñas no coinciden';
    return;
  }
  procesando.value = true;
  try {
    await auth.cambiarPassword(resetToken.value, nuevaPassword.value);
    volverAlLogin();
    aviso.value = 'Contraseña actualizada. Ya puede iniciar sesión.';
  } catch (e) {
    error.value = e?.message || 'No se pudo cambiar la contraseña';
  } finally {
    procesando.value = false;
  }
}

// Controles del portal (SISTEMA-DISENO §4.5): un poco más altos que en el
// panel (44px, objetivo táctil) y a 16px en móvil para que iOS no haga zoom
// al enfocar el campo.
const CLASE_CONTROL = 'campo__control h-11 text-base sm:text-sm';
</script>

<template>
  <AppPortal :titulo="titulo" :descripcion="subtitulo || ''">
    <!-- Paso: login -->
    <form v-if="modo === 'login'" class="flex flex-col gap-5" @submit.prevent="onSubmit">
      <div class="campo" :class="{ 'campo--inerte': cargando }">
        <label class="campo__etiqueta" :for="campoEmailLogin.id">Correo electrónico<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoEmailLogin.id"
            v-model="email"
            :class="CLASE_CONTROL"
            type="email"
            placeholder="nombre@empresa.com"
            required
            :disabled="cargando"
            autocomplete="username"
            :aria-invalid="campoEmailLogin.invalido.value"
            :aria-describedby="campoEmailLogin.describedBy.value"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': cargando }">
        <label class="campo__etiqueta" for="password">Contraseña<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            id="password"
            v-model="password"
            :class="CLASE_CONTROL"
            :type="verPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="••••••••"
            required
            :disabled="cargando"
          >
          <button
            v-if="password"
            class="mr-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            type="button"
            :title="verPassword ? 'Ocultar contraseña' : 'Ver contraseña'"
            :aria-label="verPassword ? 'Ocultar contraseña' : 'Ver contraseña'"
            :aria-pressed="verPassword"
            @click="verPassword = !verPassword"
          >
            <i :class="verPassword ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <p v-if="aviso" class="notif notif--success" role="status">
        <i class="ti ti-circle-check" aria-hidden="true"></i>
        <span class="notif__texto">{{ aviso }}</span>
      </p>
      <p v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <span class="notif__texto">{{ error }}</span>
      </p>

      <AppButton
        type="submit"
        size="lg"
        block
        :label="cargando ? 'Ingresando...' : 'Ingresar'"
        :loading="cargando"
      />

      <AppButton
        class="self-center"
        variant="text"
        label="Olvidé la contraseña"
        @click="irA('reset-email')"
      />
    </form>

    <!-- Paso: pedir correo -->
    <form v-else-if="modo === 'reset-email'" class="flex flex-col gap-5" @submit.prevent="onSolicitarCodigo">
      <div class="campo" :class="{ 'campo--inerte': procesando }">
        <label class="campo__etiqueta" :for="campoEmailReset.id">Correo electrónico<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoEmailReset.id"
            v-model="email"
            :class="CLASE_CONTROL"
            type="email"
            placeholder="nombre@empresa.com"
            required
            :disabled="procesando"
            autocomplete="username"
            :aria-invalid="campoEmailReset.invalido.value"
            :aria-describedby="campoEmailReset.describedBy.value"
          >
        </div>
      </div>

      <p v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <span class="notif__texto">{{ error }}</span>
      </p>

      <AppButton
        type="submit"
        size="lg"
        block
        :label="procesando ? 'Enviando...' : 'Enviar código'"
        :loading="procesando"
      />

      <AppButton
        class="self-center"
        variant="text"
        severity="secondary"
        icon="ti ti-arrow-left"
        label="Volver a iniciar sesión"
        @click="volverAlLogin"
      />
    </form>

    <!-- Paso: código de verificación -->
    <form v-else-if="modo === 'reset-codigo'" class="flex flex-col gap-5" @submit.prevent="onVerificarCodigo">
      <div class="campo" :class="{ 'campo--inerte': procesando }">
        <label class="campo__etiqueta" :for="campoCodigo.id">Código de verificación<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoCodigo.id"
            v-model="codigo"
            :class="[CLASE_CONTROL, 'text-center font-mono tracking-[0.3em]']"
            type="text"
            placeholder="123456"
            required
            :disabled="procesando"
            autocomplete="one-time-code"
            inputmode="numeric"
            :aria-invalid="campoCodigo.invalido.value"
            :aria-describedby="campoCodigo.describedBy.value"
          >
        </div>
      </div>

      <p v-if="aviso" class="notif notif--success" role="status">
        <i class="ti ti-circle-check" aria-hidden="true"></i>
        <span class="notif__texto">{{ aviso }}</span>
      </p>
      <p v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <span class="notif__texto">{{ error }}</span>
      </p>

      <AppButton
        type="submit"
        size="lg"
        block
        :label="procesando ? 'Verificando...' : 'Verificar código'"
        :loading="procesando"
        :disabled="codigo.trim().length < 6"
      />

      <div class="flex flex-wrap items-center justify-center gap-2">
        <AppButton
          variant="text"
          label="Reenviar código"
          :disabled="procesando"
          @click="onSolicitarCodigo"
        />
        <AppButton
          variant="text"
          severity="secondary"
          icon="ti ti-arrow-left"
          label="Volver a iniciar sesión"
          @click="volverAlLogin"
        />
      </div>
    </form>

    <!-- Paso: nueva contraseña -->
    <form v-else class="flex flex-col gap-5" @submit.prevent="onCambiarPassword">
      <div class="campo" :class="{ 'campo--inerte': procesando }">
        <label class="campo__etiqueta" :for="campoNuevaPassword.id">Nueva contraseña<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoNuevaPassword.id"
            v-model="nuevaPassword"
            :class="CLASE_CONTROL"
            type="password"
            placeholder="••••••••"
            required
            :disabled="procesando"
            autocomplete="new-password"
            :aria-invalid="campoNuevaPassword.invalido.value"
            :aria-describedby="campoNuevaPassword.describedBy.value"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--invalido': campoConfirmarPassword.invalido.value, 'campo--inerte': procesando }">
        <label class="campo__etiqueta" :for="campoConfirmarPassword.id">Confirmar contraseña<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoConfirmarPassword.id"
            v-model="confirmarPassword"
            :class="CLASE_CONTROL"
            type="password"
            placeholder="••••••••"
            required
            :disabled="procesando"
            autocomplete="new-password"
            :aria-invalid="campoConfirmarPassword.invalido.value"
            :aria-describedby="campoConfirmarPassword.describedBy.value"
          >
          <i v-if="campoConfirmarPassword.invalido.value" class="ti ti-alert-circle campo__adorno campo__adorno--error" aria-hidden="true"></i>
        </div>
        <p
          v-if="errorConfirmar"
          :id="campoConfirmarPassword.idAyuda"
          class="campo__pie campo__pie--error"
          role="alert"
        >{{ errorConfirmar }}</p>
      </div>

      <p v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <span class="notif__texto">{{ error }}</span>
      </p>

      <AppButton
        type="submit"
        size="lg"
        block
        :label="procesando ? 'Guardando...' : 'Cambiar contraseña'"
        :loading="procesando"
      />

      <AppButton
        class="self-center"
        variant="text"
        severity="secondary"
        label="Cancelar"
        @click="volverAlLogin"
      />
    </form>
  </AppPortal>
</template>

