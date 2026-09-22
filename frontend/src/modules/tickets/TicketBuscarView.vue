<script setup>
// Página PÚBLICA (sin sesión): para quien reportó un problema y perdió
// el enlace de seguimiento. Muestra tickets ACTIVOS del DNI ingresado más
// los CERRADOS con encuesta de satisfacción pendiente (nunca el resto del
// historial cerrado) — la edge function nunca revela si el DNI
// corresponde o no a un empleado real.
import { ref, computed } from 'vue';
import { buscarTicketsPorDni, MENSAJES_ERROR_TICKETS } from '../../api/ticketsPublicos.js';
import { formatFecha } from '../../core/formatters.js';
import { esDniValido } from '../../core/utils.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';

const dni = ref('');
const dniTocado = ref(false);
const buscando = ref(false);
const error = ref('');
const resultados = ref(null); // null = aún no se buscó

const dniValido = computed(() => esDniValido(dni.value));

// Aviso en vivo: aparece al salir del campo con menos de 8 dígitos y se
// apaga solo al completarlos. Mismo texto que la validación del servidor.
const errorDni = computed(() =>
  dniTocado.value && !dniValido.value ? MENSAJES_ERROR_TICKETS.dni_invalido : ''
);

// inputmode/maxlength son solo pistas de teclado: el filtrado real es este.
function onDniInput(valor) {
  dni.value = valor.replace(/\D/g, '').slice(0, 8);
}

const campoDni = useCampoAccesible({
  error: () => errorDni.value || error.value,
});

async function buscar() {
  error.value = '';
  // El botón ya se deshabilita sin 8 dígitos; esto cubre el submit
  // implícito con Enter, que algún navegador puede seguir disparando.
  if (!dniValido.value) {
    dniTocado.value = true;
    return;
  }
  buscando.value = true;
  try {
    resultados.value = await buscarTicketsPorDni(dni.value);
  } catch (e) {
    error.value = e?.message || 'No se pudo realizar la búsqueda';
    resultados.value = null;
  } finally {
    buscando.value = false;
  }
}
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Buscar tickets" />

      <h2 class="ticket-title">Consulta de tickets</h2>
      <p class="ticket-subtitulo">
        Ingrese su número de DNI para consultar tickets activos y encuestas
        de satisfacción pendientes.
      </p>

      <form class="ticket-form" @submit.prevent="buscar">
        <div class="campo" :class="{ 'campo--invalido': campoDni.invalido.value, 'campo--inerte': buscando }">
          <label class="campo__etiqueta" :for="campoDni.id">
            DNI<span aria-hidden="true"> *</span>
          </label>
          <div class="campo__caja">
            <input
              :id="campoDni.id"
              class="campo__control"
              type="text"
              inputmode="numeric"
              maxlength="8"
              placeholder="8 dígitos"
              :value="dni"
              required
              :disabled="buscando"
              :aria-invalid="campoDni.invalido.value"
              :aria-describedby="campoDni.describedBy.value"
              @input="onDniInput($event.target.value)"
              @blur="dniTocado = true"
            >
            <i v-if="campoDni.invalido.value" class="ti ti-alert-circle campo__adorno" aria-hidden="true"></i>
          </div>
          <p
            v-if="errorDni || error"
            :id="campoDni.idAyuda"
            class="campo__pie"
            :class="{ 'campo__pie--error': campoDni.invalido.value }"
            :role="campoDni.invalido.value ? 'alert' : undefined"
          >{{ errorDni || error }}</p>
        </div>
        <button type="submit" class="btn btn--primary btn--ancho ticket-submit" :disabled="buscando || !dniValido">
          {{ buscando ? 'Buscando...' : 'Buscar' }}
          <i v-if="buscando" class="ti ti-loader-2" aria-hidden="true"></i>
        </button>
      </form>

      <div v-if="resultados !== null" class="buscar-resultados">
        <p v-if="!resultados.length" class="ticket-texto ticket-nota">
          No se encontraron solicitudes activas ni encuestas pendientes para
          ese DNI.
        </p>
        <div v-else class="buscar-lista">
          <RouterLink
            v-for="t in resultados"
            :key="t.token"
            class="buscar-item"
            :to="{ name: t.encuestaPendiente ? 'ticket-satisfaccion' : 'ticket-seguimiento', params: { token: t.token } }"
          >
            <div class="buscar-item-head">
              <span class="segui-codigo">{{ t.codigo }}</span>
              <span v-if="t.encuestaPendiente" class="tag tag--accent">
                <i class="ti ti-mood-smile" aria-hidden="true"></i> Encuesta pendiente
              </span>
              <BadgeEstado v-else tipo="ticket" :valor="t.estado" />
            </div>
            <div class="buscar-item-titulo">{{ t.titulo }}</div>
            <div class="buscar-item-fecha">Creado el {{ formatFecha(t.creado) }}</div>
          </RouterLink>
        </div>
      </div>

      <RouterLink class="public-volver" to="/soporte">
        <i class="ti ti-arrow-left" aria-hidden="true"></i> Volver a soporte
      </RouterLink>
    </div>
  </div>
</template>


