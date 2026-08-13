<script setup>
// Página PÚBLICA (sin sesión): pre-registro de personal. No crea un
// empleado — solo guarda los datos para que TI los revise después
// (ver functions/personal-registro.ts). Mismo patrón que TicketNuevoView.
import { ref, computed } from 'vue';
import {
  buscarDniPersonal,
  crearPersonalRegistro,
  MENSAJES_ERROR_PERSONAL_REGISTRO,
} from '../../api/personalRegistro.js';
import { esDniValido } from '../../core/utils.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';

// estado: 'formulario' | 'buscando_dni' | 'enviando' | 'confirmacion'
const estado = ref('formulario');
const error = ref('');
const yaPendiente = ref(false);

const form = ref({
  dni: '',
  nombres: '',
  apellidos: '',
  celular: '',
  correoPersonal: '',
});

const dniTocado = ref(false);
const dniValido = computed(() => esDniValido(form.value.dni));
const errorDni = computed(() =>
  dniTocado.value && !dniValido.value ? MENSAJES_ERROR_PERSONAL_REGISTRO.dni_invalido : ''
);

// Aviso de "te encontramos": null = todavía no se buscó o no hubo match
const encontrado = ref(null);

function onDniInput(e) {
  const limpio = e.target.value.replace(/\D/g, '').slice(0, 8);
  e.target.value = limpio;
  // Cambiar el DNI invalida lo que se autocompletó para el anterior: un
  // DNI distinto es una identidad distinta, no debe quedar mezclado con
  // datos de otra persona (bug reportado 2026-08-07).
  if (limpio !== form.value.dni) {
    form.value.nombres = '';
    form.value.apellidos = '';
    form.value.celular = '';
    form.value.correoPersonal = '';
  }
  form.value.dni = limpio;
  encontrado.value = null;
}

// Al completar el DNI, se intenta autocompletar contra `empleados` (sin
// ningún servicio externo). onDniInput ya limpió los campos al cambiar
// el DNI, así que acá siempre se puede sobrescribir sin pisar nada.
async function onDniBlur() {
  dniTocado.value = true;
  if (!dniValido.value) return;
  estado.value = 'buscando_dni';
  try {
    const datos = await buscarDniPersonal(form.value.dni);
    encontrado.value = !!datos;
    if (datos) {
      form.value.nombres = datos.nombres;
      form.value.apellidos = datos.apellidos;
      form.value.celular = datos.celular;
      form.value.correoPersonal = datos.correoPersonal;
    }
  } catch {
    // Autocompletar es una ayuda, no algo bloqueante: si falla, se llena a mano.
    encontrado.value = null;
  } finally {
    estado.value = 'formulario';
  }
}

async function enviar() {
  error.value = '';
  if (!dniValido.value) {
    dniTocado.value = true;
    error.value = MENSAJES_ERROR_PERSONAL_REGISTRO.dni_invalido;
    return;
  }
  if (!form.value.nombres.trim() || !form.value.apellidos.trim()) {
    error.value = MENSAJES_ERROR_PERSONAL_REGISTRO.datos_requeridos;
    return;
  }
  estado.value = 'enviando';
  try {
    const resultado = await crearPersonalRegistro({
      dni: form.value.dni,
      nombres: form.value.nombres.trim(),
      apellidos: form.value.apellidos.trim(),
      celular: form.value.celular.trim(),
      correoPersonal: form.value.correoPersonal.trim(),
    });
    yaPendiente.value = resultado.yaPendiente;
    estado.value = 'confirmacion';
  } catch (e) {
    error.value = e?.message || 'No se pudo registrar sus datos';
    estado.value = 'formulario';
  }
}
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Registro de personal" />

      <template v-if="estado === 'confirmacion'">
        <div class="ticket-ok-icon"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
        <h2 class="ticket-title">{{ yaPendiente ? 'Ya tenías un registro pendiente' : 'Datos registrados' }}</h2>
        <p class="ticket-texto">
          {{ yaPendiente
            ? 'Ya habías dejado tus datos antes. En breve nos pondremos en contacto.'
            : 'Gracias, tus datos quedaron registrados. En breve nos pondremos en contacto.' }}
        </p>
      </template>

      <template v-else>
        <h2 class="ticket-title">Registro de personal</h2>
        <p class="ticket-texto">Completa tus datos. Si ya trabajaste aquí antes, tu DNI autocompleta el resto.</p>

        <form class="ticket-form" @submit.prevent="enviar">
          <div class="form-group full">
            <label for="pr-dni">DNI *</label>
            <input
              id="pr-dni"
              :value="form.dni"
              type="text"
              inputmode="numeric"
              maxlength="8"
              placeholder="8 dígitos"
              :disabled="estado === 'enviando'"
              :aria-invalid="errorDni ? 'true' : undefined"
              @input="onDniInput"
              @blur="onDniBlur"
            >
            <p v-if="errorDni" class="form-error" role="alert">{{ errorDni }}</p>
            <p v-else-if="estado === 'buscando_dni'" class="ticket-nota" role="status">Buscando...</p>
            <p v-else-if="encontrado" class="ticket-identificado" role="status">
              <i class="ti ti-user-check" aria-hidden="true"></i> Te encontramos — revisa tus datos.
            </p>
          </div>

          <div class="form-group full">
            <label for="pr-nombres">Nombres *</label>
            <input id="pr-nombres" v-model="form.nombres" required maxlength="100" autocomplete="given-name" :disabled="estado === 'enviando'">
          </div>

          <div class="form-group full">
            <label for="pr-apellidos">Apellidos *</label>
            <input id="pr-apellidos" v-model="form.apellidos" required maxlength="100" autocomplete="family-name" :disabled="estado === 'enviando'">
          </div>

          <div class="form-group full">
            <label for="pr-celular">Teléfono / Celular</label>
            <input id="pr-celular" v-model="form.celular" type="tel" maxlength="20" placeholder="9XXXXXXXX" autocomplete="tel" :disabled="estado === 'enviando'">
          </div>

          <div class="form-group full">
            <label for="pr-correo">Correo personal</label>
            <input id="pr-correo" v-model="form.correoPersonal" type="email" maxlength="200" placeholder="tunombre@correo.com" autocomplete="email" :disabled="estado === 'enviando'">
          </div>

          <p v-if="error" class="form-error" role="alert">{{ error }}</p>

          <button class="btn btn-primary ticket-submit" type="submit" :disabled="estado === 'enviando' || !dniValido">
            <i v-if="estado === 'enviando'" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ estado === 'enviando' ? 'Enviando...' : 'Registrar' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ticket-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 16px;
}

.ticket-texto {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 10px;
}

.ticket-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ticket-identificado {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--color-success-text);
  margin: 4px 0 0;
}

.ticket-submit {
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
  margin-top: 4px;
}

.ticket-ok-icon {
  font-size: 40px;
  color: var(--color-success-text);
  margin-bottom: 8px;
}

.ticket-nota {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  margin: 4px 0 0;
}
</style>
