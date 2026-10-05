<script setup>
// «Tickets por reclasificar» (catálogo v2, migración 116), solo para el JEFE:
// la vista v_tickets_por_reclasificar lista los tickets creados ANTES del
// catálogo nuevo que quedaron en «Otro (no clasificado)», sin subcategoría o
// en «Virus o malware sospechoso» (la antigua «Seguridad (virus/malware) o
// backup», que mezclaba respaldos). Cada uno se reclasifica con
// ReclasificarTicketDialog (RPC reclasificar_ticket) y sale de la lista.
// Vive en Configuración › Categorías porque es la limpieza del catálogo y no
// necesita un permiso nuevo: la vista y la RPC exigen rol:jefe.
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { MOTIVOS_RECLASIFICAR } from '../../core/dominio-tickets.js';
import { formatFecha } from '../../core/formatters.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import ReclasificarTicketDialog from './ReclasificarTicketDialog.vue';

defineProps({
  categorias: { type: Array, default: () => [] },
  subcategorias: { type: Array, default: () => [] },
});

const filas = ref([]);
const cargando = ref(true);
const error = ref('');
const enCurso = ref(null);

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    filas.value = await insforgeApi.listTicketsPorReclasificar();
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar la lista de tickets por reclasificar.' }).mensaje;
  } finally {
    cargando.value = false;
  }
}

function onCerrado(resultado) {
  const ticket = enCurso.value;
  enCurso.value = null;
  if (!resultado || !ticket) return;
  filas.value = filas.value.filter((f) => f.ticket_id !== ticket.ticket_id);
  showToast(resultado.cambio === false ? `Clasificación de ${ticket.codigo} confirmada` : `Ticket ${ticket.codigo} reclasificado`);
}

onMounted(cargar);
</script>

<template>
  <section class="space-y-3" aria-labelledby="por-reclasificar-titulo" data-por-reclasificar>
    <div>
      <h3 id="por-reclasificar-titulo" class="flex items-center gap-2 text-base font-semibold text-gray-900">
        Tickets por reclasificar
        <span v-if="!cargando && !error" class="rounded-full bg-gray-100 px-2 text-xs font-medium leading-5 tabular-nums text-gray-600">{{ filas.length }}</span>
      </h3>
      <p class="mt-0.5 max-w-prose text-sm text-gray-500">
        Tickets anteriores al catálogo actual que quedaron en «Otro (no clasificado)», sin subcategoría o en la antigua categoría de seguridad. Elija la subcategoría correcta y el motivo; el tipo y la prioridad del ticket no cambian.
      </p>
    </div>

    <p v-if="cargando" class="text-sm text-gray-500" role="status">Cargando tickets por reclasificar...</p>
    <p v-else-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
    <p v-else-if="!filas.length" class="border-y border-gray-100 py-2 text-sm text-gray-500">— Sin tickets por reclasificar.</p>
    <ul v-else class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" aria-label="Tickets por reclasificar">
      <li v-for="f in filas" :key="f.ticket_id" class="flex items-start gap-3 px-4 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="flex min-w-0 items-baseline gap-2 text-sm">
            <RouterLink :to="`/tickets/${f.ticket_id}`" class="shrink-0 text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              <AppCodigo :valor="f.codigo" titulo="Abrir el ticket" />
            </RouterLink>
            <span class="truncate text-gray-900">{{ f.titulo }}</span>
          </p>
          <p class="mt-0.5 text-xs text-gray-500">
            <span class="tabular-nums">{{ formatFecha(f.created_at) }}</span>
            · {{ f.categoria || 'Sin categoría' }} › {{ f.subcategoria || 'sin subcategoría' }}
            <!-- La clasificación ya dice por qué está aquí, salvo la seguridad heredada: se aclara. -->
            <template v-if="f.motivo === 'seguridad_legado'"> · {{ MOTIVOS_RECLASIFICAR.seguridad_legado }}</template>
          </p>
        </div>
        <AppButton size="sm" variant="outline" severity="secondary" label="Reclasificar" :aria-label="`Reclasificar el ticket ${f.codigo}`" @click="enCurso = f" />
      </li>
    </ul>

    <ReclasificarTicketDialog
      v-if="enCurso"
      :ticket="enCurso"
      :categorias="categorias"
      :subcategorias="subcategorias"
      @cerrar="onCerrado"
    />
  </section>
</template>
