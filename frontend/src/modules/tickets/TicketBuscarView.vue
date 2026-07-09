<script setup>
// Página PÚBLICA (sin sesión): para quien reportó un problema y perdió
// el enlace de seguimiento. Solo muestra tickets ACTIVOS (nunca cerrados/
// rechazados/resueltos) del DNI ingresado — la edge function nunca revela
// si el DNI corresponde o no a un empleado real.
import { ref } from 'vue';
import { buscarTicketsPorDni } from '../../api/ticketsPublicos.js';
import { formatFecha } from '../../core/formatters.js';
import { estadoInfo } from '../../core/dominio-tickets.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';

const dni = ref('');
const buscando = ref(false);
const error = ref('');
const resultados = ref(null); // null = aún no se buscó

async function buscar() {
  error.value = '';
  if (dni.value.replace(/\D/g, '').length !== 8) {
    error.value = 'Ingresa un DNI válido (8 dígitos)';
    return;
  }
  buscando.value = true;
  try {
    resultados.value = await buscarTicketsPorDni(dni.value.trim());
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
      <PublicBrand subtitulo="Buscar mis tickets" />

      <h2 class="ticket-title">¿Perdiste el enlace de tu ticket?</h2>
      <p class="ticket-subtitulo">
        Ingresa tu DNI para ver tus solicitudes activas.
      </p>

      <form class="ticket-form" @submit.prevent="buscar">
        <div class="form-group full">
          <label for="tk-dni">DNI</label>
          <input
            id="tk-dni"
            v-model="dni"
            type="text"
            inputmode="numeric"
            maxlength="8"
            placeholder="8 dígitos"
            :disabled="buscando"
          >
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="btn btn-primary ticket-submit" type="submit" :disabled="buscando">
          {{ buscando ? 'Buscando...' : 'Buscar' }}
        </button>
      </form>

      <div v-if="resultados !== null" class="buscar-resultados">
        <p v-if="!resultados.length" class="ticket-texto ticket-nota">
          No encontramos solicitudes activas para ese DNI. Si tu caso ya fue
          resuelto o cerrado, no aparecerá aquí.
        </p>
        <div v-else class="buscar-lista">
          <RouterLink
            v-for="t in resultados"
            :key="t.token"
            class="buscar-item"
            :to="`/ticket/${t.token}`"
          >
            <div class="buscar-item-head">
              <span class="segui-codigo">{{ t.codigo }}</span>
              <span class="badge" :class="estadoInfo(t.estado).clase">{{ estadoInfo(t.estado).label }}</span>
            </div>
            <div class="buscar-item-titulo">{{ t.titulo }}</div>
            <div class="buscar-item-fecha">Creado el {{ formatFecha(t.creado) }}</div>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ticket-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.ticket-subtitulo {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  margin: 0 0 16px;
}

.ticket-texto {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 10px;
}

.ticket-nota {
  font-size: var(--fs-sm);
  font-style: italic;
}

.ticket-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ticket-submit {
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
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
  border-radius: var(--radius-md);
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
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.buscar-item-titulo {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--color-text-primary);
}

.buscar-item-fecha {
  font-size: var(--fs-sm);
  color: var(--color-text-tertiary);
  margin-top: 2px;
}
</style>
