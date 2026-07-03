<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../../stores/auth.js';

const router = useRouter();
const auth = useAuthStore();
const { cargando } = storeToRefs(auth);

// modo: 'login' | 'reset-email' | 'reset-codigo' | 'reset-password'
const modo = ref('login');

const email = ref('');
const password = ref('');
const error = ref('');
const aviso = ref('');
const procesando = ref(false);

const codigo = ref('');
const resetToken = ref('');
const nuevaPassword = ref('');
const confirmarPassword = ref('');

const titulo = computed(() => ({
  'login': 'Iniciar sesión',
  'reset-email': 'Reestablecer contraseña',
  'reset-codigo': 'Revisa tu correo',
  'reset-password': 'Nueva contraseña',
}[modo.value]));

const subtitulo = computed(() => ({
  'login': 'Ingresa con tu cuenta de staff',
  'reset-email': 'Te enviaremos un código de verificación a tu correo',
  'reset-codigo': `Ingresa el código de 6 dígitos enviado a ${email.value}`,
  'reset-password': 'Elige tu nueva contraseña (mínimo 6 caracteres)',
}[modo.value]));

function irA(nuevoModo) {
  error.value = '';
  aviso.value = '';
  modo.value = nuevoModo;
}

function volverAlLogin() {
  codigo.value = '';
  resetToken.value = '';
  nuevaPassword.value = '';
  confirmarPassword.value = '';
  irA('login');
}

async function onSubmit() {
  error.value = '';

  try {
    await auth.login(email.value, password.value);
    await router.push('/empleados');
  } catch (e) {
    error.value = e?.message || 'No se pudo iniciar sesión';
  }
}

async function onSolicitarCodigo() {
  error.value = '';
  procesando.value = true;
  try {
    await auth.solicitarCodigoReset(email.value);
    irA('reset-codigo');
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
  } catch (e) {
    error.value = 'Código inválido o expirado. Verifica e intenta de nuevo.';
  } finally {
    procesando.value = false;
  }
}

async function onCambiarPassword() {
  error.value = '';
  if (nuevaPassword.value !== confirmarPassword.value) {
    error.value = 'Las contraseñas no coinciden';
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
      <div class="login-brand brand">
        <div class="brand-icon">
          <i class="ti ti-shield-lock" aria-hidden="true"></i>
        </div>
        <div class="brand-text">
          <h1>Sistema TI</h1>
          <span>Panel de administración</span>
        </div>
      </div>

      <h2 class="login-title">{{ titulo }}</h2>
      <p class="login-subtitle">{{ subtitulo }}</p>

      <!-- Paso: login -->
      <form v-if="modo === 'login'" class="login-form" @submit.prevent="onSubmit">
        <div class="form-group full">
          <label for="email">Correo electrónico</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="tu@empresa.com"
            required
            :disabled="cargando"
          >
        </div>

        <div class="form-group full">
          <label for="password">Contraseña</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            required
            :disabled="cargando"
          >
        </div>

        <button
          class="btn btn-primary login-submit"
          type="submit"
          :disabled="cargando"
        >
          {{ cargando ? 'Ingresando...' : 'Ingresar' }}
        </button>

        <button class="login-link" type="button" @click="irA('reset-email')">
          ¿Olvidaste tu contraseña?
        </button>

        <p v-if="aviso" class="login-aviso" role="status">{{ aviso }}</p>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>

      <!-- Paso: pedir correo -->
      <form v-else-if="modo === 'reset-email'" class="login-form" @submit.prevent="onSolicitarCodigo">
        <div class="form-group full">
          <label for="reset-email">Correo electrónico</label>
          <input
            id="reset-email"
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="tu@empresa.com"
            required
            :disabled="procesando"
          >
        </div>

        <button class="btn btn-primary login-submit" type="submit" :disabled="procesando">
          {{ procesando ? 'Enviando...' : 'Enviar código' }}
        </button>

        <button class="login-link" type="button" @click="volverAlLogin">
          Volver a iniciar sesión
        </button>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>

      <!-- Paso: código de verificación -->
      <form v-else-if="modo === 'reset-codigo'" class="login-form" @submit.prevent="onVerificarCodigo">
        <div class="form-group full">
          <label for="reset-codigo">Código de verificación</label>
          <input
            id="reset-codigo"
            v-model="codigo"
            class="input-codigo"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="123456"
            maxlength="6"
            required
            :disabled="procesando"
          >
        </div>

        <button class="btn btn-primary login-submit" type="submit" :disabled="procesando || codigo.trim().length < 6">
          {{ procesando ? 'Verificando...' : 'Verificar código' }}
        </button>

        <button class="login-link" type="button" :disabled="procesando" @click="onSolicitarCodigo">
          Reenviar código
        </button>

        <button class="login-link" type="button" @click="volverAlLogin">
          Volver a iniciar sesión
        </button>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>

      <!-- Paso: nueva contraseña -->
      <form v-else class="login-form" @submit.prevent="onCambiarPassword">
        <div class="form-group full">
          <label for="nueva-password">Nueva contraseña</label>
          <input
            id="nueva-password"
            v-model="nuevaPassword"
            type="password"
            autocomplete="new-password"
            placeholder="••••••••"
            minlength="6"
            required
            :disabled="procesando"
          >
        </div>

        <div class="form-group full">
          <label for="confirmar-password">Confirmar contraseña</label>
          <input
            id="confirmar-password"
            v-model="confirmarPassword"
            type="password"
            autocomplete="new-password"
            placeholder="••••••••"
            minlength="6"
            required
            :disabled="procesando"
          >
        </div>

        <button class="btn btn-primary login-submit" type="submit" :disabled="procesando">
          {{ procesando ? 'Guardando...' : 'Cambiar contraseña' }}
        </button>

        <button class="login-link" type="button" @click="volverAlLogin">
          Cancelar
        </button>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
}

.login-brand {
  margin-bottom: 1.75rem;
}

.login-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}

.login-subtitle {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-form .form-group.full {
  grid-column: unset;
}

.login-submit {
  width: 100%;
  justify-content: center;
  margin-top: 4px;
  padding: 10px 14px;
}

.login-submit:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  box-shadow: none;
}

.login-form input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  background: var(--color-bg-subtle);
}

.login-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--color-primary, var(--color-accent));
  cursor: pointer;
  align-self: center;
}

.login-link:hover {
  text-decoration: underline;
}

.login-link:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-codigo {
  text-align: center;
  font-size: 18px;
  letter-spacing: 0.4em;
  font-variant-numeric: tabular-nums;
}

.login-aviso {
  color: var(--color-success, var(--color-success-text));
  background: var(--color-success-bg, var(--color-success-bg));
  border: 1px solid var(--color-success-border, var(--color-success-border));
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  margin: 0;
}

.login-error {
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  margin: 0;
}
</style>
