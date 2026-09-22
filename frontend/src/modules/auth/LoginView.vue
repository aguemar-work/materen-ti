<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../../stores/auth.js';
import { NOMBRE_PRODUCTO } from '../../core/marca.js';
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
  'reset-email': 'Reestablecer contraseña',
  'reset-codigo': 'Revisa tu correo',
  'reset-password': 'Nueva contraseña',
}[modo.value]));

const subtitulo = computed(() => ({
  'login': null, // el login va limpio: solo título, campos y CTA
  'reset-email': 'Te enviaremos un código de verificación a tu correo',
  'reset-codigo': `Ingresa el código de 6 dígitos enviado a ${email.value}`,
  'reset-password': 'Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo',
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
    error.value = 'Código inválido o expirado. Verifica e intenta de nuevo.';
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
    aviso.value = 'Contraseña actualizada. Ya puedes iniciar sesión.';
  } catch (e) {
    error.value = e?.message || 'No se pudo cambiar la contraseña';
  } finally {
    procesando.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card card">
      <img src="/logo_materen_sisti.svg" :alt="NOMBRE_PRODUCTO" class="login-logo">

      <h2 class="login-title">{{ titulo }}</h2>
      <p v-if="subtitulo" class="login-subtitle">{{ subtitulo }}</p>

      <!-- Paso: login -->
      <form v-if="modo === 'login'" class="login-form" @submit.prevent="onSubmit">
        <div class="campo" :class="{ 'campo--inerte': cargando }">
          <label class="campo__etiqueta" :for="campoEmailLogin.id">Correo electrónico<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoEmailLogin.id"
              v-model="email"
              class="campo__control"
              type="email"
              placeholder="tu@empresa.com"
              required
              :disabled="cargando"
              autocomplete="username"
              :aria-invalid="campoEmailLogin.invalido.value"
              :aria-describedby="campoEmailLogin.describedBy.value"
            >
          </div>
        </div>

        <div class="form-group full">
          <label for="password">Contraseña</label>
          <div class="password-field">
            <input
              id="password"
              v-model="password"
              :type="verPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
              required
              :disabled="cargando"
            >
            <button
              v-if="password"
              class="password-toggle"
              type="button"
              :title="verPassword ? 'Ocultar contraseña' : 'Ver contraseña'"
              :aria-label="verPassword ? 'Ocultar contraseña' : 'Ver contraseña'"
              @click="verPassword = !verPassword"
            >
              <i :class="verPassword ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <button class="btn btn--primary btn--ancho login-submit" type="submit" :disabled="cargando">
          {{ cargando ? 'Ingresando...' : 'Ingresar' }}
          <i v-if="cargando" class="ti ti-loader-2" aria-hidden="true"></i>
        </button>

        <button class="login-link" type="button" @click="irA('reset-email')">
          Olvidé la contraseña
        </button>

        <p v-if="aviso" class="login-aviso" role="status">{{ aviso }}</p>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>

      <!-- Paso: pedir correo -->
      <form v-else-if="modo === 'reset-email'" class="login-form" @submit.prevent="onSolicitarCodigo">
        <div class="campo" :class="{ 'campo--inerte': procesando }">
          <label class="campo__etiqueta" :for="campoEmailReset.id">Correo electrónico<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoEmailReset.id"
              v-model="email"
              class="campo__control"
              type="email"
              placeholder="tu@empresa.com"
              required
              :disabled="procesando"
              autocomplete="username"
              :aria-invalid="campoEmailReset.invalido.value"
              :aria-describedby="campoEmailReset.describedBy.value"
            >
          </div>
        </div>

        <button class="btn btn--primary btn--ancho login-submit" type="submit" :disabled="procesando">
          {{ procesando ? 'Enviando...' : 'Enviar código' }}
          <i v-if="procesando" class="ti ti-loader-2" aria-hidden="true"></i>
        </button>

        <button class="login-link" type="button" @click="volverAlLogin">
          Volver a iniciar sesión
        </button>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>

      <!-- Paso: código de verificación -->
      <form v-else-if="modo === 'reset-codigo'" class="login-form" @submit.prevent="onVerificarCodigo">
        <div class="campo" :class="{ 'campo--inerte': procesando }">
          <label class="campo__etiqueta" :for="campoCodigo.id">Código de verificación<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoCodigo.id"
              v-model="codigo"
              class="campo__control input-codigo"
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

        <button class="btn btn--primary btn--ancho login-submit" type="submit" :disabled="procesando || codigo.trim().length < 6">
          {{ procesando ? 'Verificando...' : 'Verificar código' }}
          <i v-if="procesando" class="ti ti-loader-2" aria-hidden="true"></i>
        </button>

        <button class="login-link" type="button" :disabled="procesando" @click="onSolicitarCodigo">
          Reenviar código
        </button>

        <button class="login-link" type="button" @click="volverAlLogin">
          Volver a iniciar sesión
        </button>

        <p v-if="aviso" class="login-aviso" role="status">{{ aviso }}</p>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>

      <!-- Paso: nueva contraseña -->
      <form v-else class="login-form" @submit.prevent="onCambiarPassword">
        <div class="campo" :class="{ 'campo--inerte': procesando }">
          <label class="campo__etiqueta" :for="campoNuevaPassword.id">Nueva contraseña<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoNuevaPassword.id"
              v-model="nuevaPassword"
              class="campo__control"
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
              class="campo__control"
              type="password"
              placeholder="••••••••"
              required
              :disabled="procesando"
              autocomplete="new-password"
              :aria-invalid="campoConfirmarPassword.invalido.value"
              :aria-describedby="campoConfirmarPassword.describedBy.value"
            >
            <i v-if="campoConfirmarPassword.invalido.value" class="ti ti-alert-circle-filled campo__adorno" aria-hidden="true"></i>
          </div>
          <p
            v-if="errorConfirmar"
            :id="campoConfirmarPassword.idAyuda"
            class="campo__pie campo__pie--error"
            role="alert"
          >{{ errorConfirmar }}</p>
        </div>

        <button class="btn btn--primary btn--ancho login-submit" type="submit" :disabled="procesando">
          {{ procesando ? 'Guardando...' : 'Cambiar contraseña' }}
          <i v-if="procesando" class="ti ti-loader-2" aria-hidden="true"></i>
        </button>

        <button class="login-link" type="button" @click="volverAlLogin">
          Cancelar
        </button>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>
    </div>
  </div>
</template>


