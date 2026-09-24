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
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTag from '../../components/ui/AppTag.vue';
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
  <AppPortal
    seccion="Buscar tickets"
    titulo="Consulta de tickets"
    descripcion="Ingrese su número de DNI para consultar tickets activos y encuestas de satisfacción pendientes."
  >
    <form class="flex flex-col gap-5" @submit.prevent="buscar">
      <div class="campo" :class="{ 'campo--invalido': campoDni.invalido.value, 'campo--inerte': buscando }">
        <label class="campo__etiqueta" :for="campoDni.id">
          DNI<span aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <input
            :id="campoDni.id"
            class="campo__control h-11 text-base tabular-nums sm:text-sm"
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
          <i v-if="campoDni.invalido.value" class="ti ti-alert-circle campo__adorno campo__adorno--error" aria-hidden="true"></i>
        </div>
        <p
          v-if="errorDni || error"
          :id="campoDni.idAyuda"
          class="campo__pie"
          :class="{ 'campo__pie--error': campoDni.invalido.value }"
          :role="campoDni.invalido.value ? 'alert' : undefined"
        >{{ errorDni || error }}</p>
      </div>
      <AppButton
        type="submit"
        size="lg"
        block
        icon="ti ti-search"
        :label="buscando ? 'Buscando...' : 'Buscar'"
        :loading="buscando"
        :disabled="!dniValido"
      />
    </form>

    <section v-if="resultados !== null" class="mt-6 border-t border-gray-100 pt-5" aria-labelledby="buscar-resultados-titulo">
      <h2 id="buscar-resultados-titulo" class="text-sm font-semibold text-gray-900">
        Resultados
        <span v-if="resultados.length" class="font-normal text-gray-500 tabular-nums">· {{ resultados.length }}</span>
      </h2>
      <p v-if="!resultados.length" class="mt-2 text-sm text-gray-500" role="status">
        No se encontraron solicitudes activas ni encuestas pendientes para
        ese DNI.
      </p>
      <ul v-else class="mt-3 flex flex-col gap-2">
        <li v-for="t in resultados" :key="t.token">
          <RouterLink
            class="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 no-underline transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :to="{ name: t.encuestaPendiente ? 'ticket-satisfaccion' : 'ticket-seguimiento', params: { token: t.token } }"
          >
            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs font-medium text-gray-500 tabular-nums">{{ t.codigo }}</span>
                <AppTag v-if="t.encuestaPendiente" tono="info" icono="ti ti-mood-smile">Encuesta pendiente</AppTag>
                <BadgeEstado v-else tipo="ticket" :valor="t.estado" />
              </span>
              <span class="text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">{{ t.titulo }}</span>
              <span class="text-xs text-gray-500">Creado el {{ formatFecha(t.creado) }}</span>
            </span>
            <i class="ti ti-chevron-right shrink-0 text-lg text-gray-400" aria-hidden="true"></i>
          </RouterLink>
        </li>
      </ul>
    </section>

    <template #pie>
      <AppButton
        variant="text"
        severity="secondary"
        icon="ti ti-arrow-left"
        label="Volver a soporte"
        to="/soporte"
      />
    </template>
  </AppPortal>
</template>
