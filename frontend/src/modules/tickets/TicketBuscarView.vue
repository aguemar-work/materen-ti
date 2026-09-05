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
import PublicBrand from '../../components/shared/PublicBrand.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';

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
        <CarbonCampo
          :model-value="dni"
          etiqueta="DNI"
          requerido
          inputmode="numeric"
          maxlength="8"
          placeholder="8 dígitos"
          :deshabilitado="buscando"
          :error="errorDni || error"
          @update:model-value="onDniInput"
          @blur="dniTocado = true"
        />
        <CarbonButton variante="primary" ancho tipo="submit" class="ticket-submit" :cargando="buscando" :deshabilitado="!dniValido">
          {{ buscando ? 'Buscando...' : 'Buscar' }}
        </CarbonButton>
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
              <CarbonTag v-if="t.encuestaPendiente" variante="accent">
                <i class="ti ti-mood-smile" aria-hidden="true"></i> Encuesta pendiente
              </CarbonTag>
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

<style scoped>
.ticket-title {
  font-size: var(--fs-heading-02);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.ticket-subtitulo {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  margin: 0 0 16px;
}

.ticket-texto {
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 10px;
}

.ticket-nota {
  font-size: var(--fs-label-01);
  font-style: italic;
}

.ticket-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ticket-submit {
  margin-top: 4px;
}

.buscar-resultados {
  margin-top: 20px;
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}

.buscar-lista {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.buscar-item {
  display: block;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 10px 12px;
  text-decoration: none;
  transition: background 0.15s;
}

.buscar-item:hover {
  background: var(--color-bg-subtle);
}

.buscar-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.segui-codigo {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.buscar-item-titulo {
  font-size: var(--fs-body-01);
  font-weight: 600;
  color: var(--color-text-primary);
}

.buscar-item-fecha {
  font-size: var(--fs-label-01);
  color: var(--color-text-tertiary);
  margin-top: 2px;
}
</style>
