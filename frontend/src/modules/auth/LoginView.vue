<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../../stores/auth.js';
import { NOMBRE_PRODUCTO } from '../../core/marca.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

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
        <CarbonCampo
          v-model="email"
          etiqueta="Correo electrónico"
          tipo="email"
          placeholder="tu@empresa.com"
          requerido
          :deshabilitado="cargando"
          autocomplete="username"
        />

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

        <CarbonButton
          class="login-submit"
          variante="primary"
          tipo="submit"
          ancho
          :deshabilitado="cargando"
          :cargando="cargando"
        >
          {{ cargando ? 'Ingresando...' : 'Ingresar' }}
        </CarbonButton>

        <button class="login-link" type="button" @click="irA('reset-email')">
          Olvidé la contraseña
        </button>

        <p v-if="aviso" class="login-aviso" role="status">{{ aviso }}</p>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>

      <!-- Paso: pedir correo -->
      <form v-else-if="modo === 'reset-email'" class="login-form" @submit.prevent="onSolicitarCodigo">
        <CarbonCampo
          v-model="email"
          etiqueta="Correo electrónico"
          tipo="email"
          placeholder="tu@empresa.com"
          requerido
          :deshabilitado="procesando"
          autocomplete="username"
        />

        <CarbonButton class="login-submit" variante="primary" tipo="submit" ancho :deshabilitado="procesando" :cargando="procesando">
          {{ procesando ? 'Enviando...' : 'Enviar código' }}
        </CarbonButton>

        <button class="login-link" type="button" @click="volverAlLogin">
          Volver a iniciar sesión
        </button>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      </form>

      <!-- Paso: código de verificación -->
      <form v-else-if="modo === 'reset-codigo'" class="login-form" @submit.prevent="onVerificarCodigo">
        <CarbonCampo
          v-model="codigo"
          class="input-codigo"
          etiqueta="Código de verificación"
          placeholder="123456"
          requerido
          :deshabilitado="procesando"
          autocomplete="one-time-code"
          inputmode="numeric"
        />

        <CarbonButton class="login-submit" variante="primary" tipo="submit" ancho :deshabilitado="procesando || codigo.trim().length < 6" :cargando="procesando">
          {{ procesando ? 'Verificando...' : 'Verificar código' }}
        </CarbonButton>

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
        <CarbonCampo
          v-model="nuevaPassword"
          etiqueta="Nueva contraseña"
          tipo="password"
          placeholder="••••••••"
          requerido
          :deshabilitado="procesando"
          autocomplete="new-password"
        />

        <CarbonCampo
          v-model="confirmarPassword"
          etiqueta="Confirmar contraseña"
          tipo="password"
          placeholder="••••••••"
          requerido
          :error="errorConfirmar"
          :deshabilitado="procesando"
          autocomplete="new-password"
        />

        <CarbonButton class="login-submit" variante="primary" tipo="submit" ancho :deshabilitado="procesando" :cargando="procesando">
          {{ procesando ? 'Guardando...' : 'Cambiar contraseña' }}
        </CarbonButton>

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

.login-logo {
  display: block;
  height: 32px;
  width: auto;
  margin-bottom: 1.75rem;
}

/* El logo es azul de marca (#0064E0, ver frontend/public/logo_materen_sisti.svg):
   en oscuro se pasa a blanco para no perderse contra el fondo (antes lo
   resolvía un plate blanco). Corregido 2026-09-01: este comentario decía
   "verde pino (#072E2A)", el color de la marca anterior — quedó describiendo
   un logo que ya no existía desde la migración a azul. */
[data-theme="dark"] .login-logo {
  filter: brightness(0) invert(1);
}

.login-title {
  font-size: var(--fs-heading-03);
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 1.25rem;
}

/* Cuando hay subtítulo (flujo de reset), el título se le acerca */
.login-title:has(+ .login-subtitle) {
  margin-bottom: 4px;
}

.login-subtitle {
  font-size: var(--fs-body-01);
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

.password-field {
  position: relative;
}

.password-field input {
  width: 100%;
  padding-right: 38px;
}

.password-toggle {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  font-size: var(--icon-sm);
  color: var(--color-text-secondary);
  border-radius: var(--radius-base);
  transition: color 0.12s;
}

.password-toggle:hover {
  color: var(--color-text-primary);
}

.password-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.login-link {
  background: none;
  border: none;
  padding: 0;
  font-size: var(--fs-body-01);
  color: var(--color-primary);
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

.input-codigo :deep(.cds-campo__control) {
  text-align: center;
  font-size: var(--fs-heading-02);
  letter-spacing: 0.4em;
  font-variant-numeric: tabular-nums;
}

.login-aviso {
  color: var(--color-success-text);
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-base);
  padding: 8px 12px;
  font-size: var(--fs-body-01);
  margin: 0;
}

.login-error {
  color: var(--color-danger-text);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-base);
  padding: 8px 12px;
  font-size: var(--fs-body-01);
  margin: 0;
}
</style>
