<script setup>
// Tickets enlazados a un cambio (migración 107, tabla de enlace `cambio_tickets`):
// los incidentes que lo originaron o que corrige. Un cambio enlaza varios tickets
// y un ticket varios cambios; enlazar NO modifica el ticket. Se enlaza escribiendo
// el código (TCK-0123) y cada movimiento queda en el libro del cambio.
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useCambiosStore } from '../../stores/cambios.js';
import { showToast } from '../../core/toast.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppVacio from '../../components/ui/AppVacio.vue';

const props = defineProps({
  cambio: { type: Object, required: true },
  // Filas de ticketsDeCambio(): { id, codigo, titulo, estado, vinculado_at }.
  tickets: { type: Array, default: () => [] },
  // Con el módulo tickets se puede enlazar y desenlazar; sin él, solo se ve.
  puedeEnlazar: { type: Boolean, default: false },
});

const store = useCambiosStore();
const abierto = ref(false);
const codigo = ref('');
const ocupado = ref(false);
const error = ref('');
const campo = useCampoAccesible({ error: () => error.value });

function abrir() {
  abierto.value = true;
  codigo.value = '';
  error.value = '';
}

async function enlazar() {
  const texto = codigo.value.trim();
  if (!texto) {
    error.value = 'Escriba el código del ticket, p. ej. TCK-0123.';
    return;
  }
  ocupado.value = true;
  error.value = '';
  try {
    const ticket = await insforgeApi.buscarTicketPorCodigo(texto);
    if (!ticket) {
      error.value = `No hay un ticket con el código ${texto.toUpperCase()}.`;
      return;
    }
    await store.vincularTicket(props.cambio.id, ticket.id);
    showToast(`Ticket ${ticket.codigo} enlazado`);
    abierto.value = false;
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'cambio', porDefecto: 'No se pudo enlazar el ticket.' }).mensaje;
  } finally {
    ocupado.value = false;
  }
}

async function quitar(ticket) {
  ocupado.value = true;
  try {
    await store.desvincularTicket(props.cambio.id, ticket.id);
    showToast(`Ticket ${ticket.codigo} desenlazado`);
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'cambio', porDefecto: 'No se pudo quitar el enlace.' }).mensaje, 'error');
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <AppSeccion titulo="Tickets enlazados" :conteo="tickets.length" sin-padding>
    <template v-if="puedeEnlazar && !abierto" #acciones>
      <AppButton size="sm" variant="text" severity="secondary" icon="ti ti-link" label="Enlazar ticket" @click="abrir" />
    </template>

    <form v-if="abierto" class="flex flex-wrap items-start gap-2 border-b border-gray-100 px-4 py-3" @submit.prevent="enlazar">
      <div class="campo min-w-0 flex-1 basis-56" :class="{ 'campo--invalido': campo.invalido.value }">
        <label class="campo__etiqueta" :for="campo.id">Código del ticket</label>
        <div class="campo__caja">
          <input
            :id="campo.id"
            v-model="codigo"
            class="campo__control"
            type="text"
            maxlength="20"
            placeholder="TCK-0123"
            autocomplete="off"
            :disabled="ocupado"
            :aria-invalid="campo.invalido.value"
            :aria-describedby="campo.describedBy.value"
          >
        </div>
        <p v-if="error" :id="campo.idAyuda" class="campo__pie text-red-700" role="alert">{{ error }}</p>
      </div>
      <div class="flex items-center gap-2 pt-6">
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="ocupado" @click="abierto = false" />
        <AppButton type="submit" icon="ti ti-link" :label="ocupado ? 'Enlazando...' : 'Enlazar'" :loading="ocupado" />
      </div>
    </form>

    <ul v-if="tickets.length" class="divide-y divide-gray-100" aria-label="Tickets enlazados al cambio">
      <li v-for="t in tickets" :key="t.id" class="flex items-center gap-3 px-4 py-2.5" data-ticket-enlazado>
        <RouterLink
          :to="`/tickets/${t.id}`"
          class="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <span class="text-primary-600"><AppCodigo :valor="t.codigo" titulo="Número de ticket" /></span>
          <span class="ml-2 text-sm text-gray-900 [overflow-wrap:anywhere]">{{ t.titulo }}</span>
        </RouterLink>
        <BadgeEstado v-if="t.estado" tipo="ticket" :valor="t.estado" />
        <button
          v-if="puedeEnlazar"
          type="button"
          class="icon-btn danger"
          :aria-label="`Quitar el enlace con el ticket ${t.codigo}`"
          title="Quitar el enlace"
          :disabled="ocupado"
          @click="quitar(t)"
        >
          <i class="ti ti-unlink" aria-hidden="true"></i>
        </button>
      </li>
    </ul>
    <AppVacio
      v-else-if="!abierto"
      variante="seccion"
      titulo="Sin tickets enlazados"
      mensaje="Enlace el incidente que originó el cambio o el que este corrige."
    />
  </AppSeccion>
</template>
