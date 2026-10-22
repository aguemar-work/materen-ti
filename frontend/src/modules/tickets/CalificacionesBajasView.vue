<script setup>
// «Calificaciones por revisar» (procedimiento de cierre, migración 120): las
// respuestas de 1 o 2 que nadie revisó todavía, la más antigua primero (es la
// que vence antes). El técnico asignado las recibe en sus notificaciones y
// tiene hasta el día hábil siguiente a la respuesta para revisarlas: reabrir
// el ticket si la necesidad no se resolvió, o dejar una nota si se resolvió.
// Cada una se revisa con RevisarCalificacionDialog y sale de la lista. Lo que
// pasó con cada una (y si fue a tiempo) va al reporte de Satisfacción.
// Lista de trabajo sin filtros (misma forma que «Tickets por reclasificar»).
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { plazoRevisionCalificacion, diaLimaDe } from '../../core/dominio-tickets.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import EnlaceReporte from '../../components/shared/EnlaceReporte.vue';
import RevisarCalificacionDialog from './RevisarCalificacionDialog.vue';

const filas = ref([]);
const nombres = ref({});
const cargando = ref(true);
const error = ref('');
const enCurso = ref(null);

const hoy = diaLimaDe();
const conPlazo = computed(() => filas.value.map((f) => {
  const plazo = plazoRevisionCalificacion(f.fecha_envio);
  return { ...f, plazo, vencida: hoy > plazo };
}));

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const [lista, staff] = await Promise.all([
      insforgeApi.listCalificacionesBajasPendientes(),
      insforgeApi.nombresStaff(),
    ]);
    filas.value = lista;
    nombres.value = Object.fromEntries(staff.map((s) => [s.user_id, s.nombre]));
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar la lista de calificaciones por revisar.' }).mensaje;
  } finally {
    cargando.value = false;
  }
}

function onCerrado(resultado) {
  const fila = enCurso.value;
  enCurso.value = null;
  if (!resultado || !fila) return;
  filas.value = filas.value.filter((f) => f.id !== fila.id);
  showToast(resultado.desenlace === 'reabierto' ? `Ticket ${fila.tickets.codigo} reabierto` : `Revisión de ${fila.tickets.codigo} registrada`);
}

onMounted(cargar);
</script>

<template>
  <div class="flex w-full flex-col">
    <AppEncabezado titulo="Calificaciones por revisar">
      <template #subtitulo>
        Respuestas de 1 o 2 sin revisar. Se revisan a más tardar el día hábil siguiente: reabra el ticket si la necesidad no se resolvió, o deje una nota si se resolvió.
      </template>
      <template #acciones>
        <EnlaceReporte reporte="satisfaccion" />
      </template>
    </AppEncabezado>

    <section class="px-4 pb-6 sm:px-6" aria-label="Calificaciones por revisar">
      <p v-if="cargando" class="text-sm text-gray-500" role="status">Cargando calificaciones...</p>
      <p v-else-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
      <p v-else-if="!conPlazo.length" class="border-y border-gray-100 py-2 text-sm text-gray-500">— Sin calificaciones por revisar.</p>
      <ul v-else class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <li v-for="f in conPlazo" :key="f.id" class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
          <div class="min-w-0 flex-1">
            <p class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
              <span class="font-semibold tabular-nums text-red-700">{{ f.nivel }}/5</span>
              <RouterLink :to="`/tickets/${f.tickets.id}`" class="shrink-0 text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                <AppCodigo :valor="f.tickets.codigo" titulo="Abrir el ticket" />
              </RouterLink>
              <span class="min-w-0 truncate text-gray-900">{{ f.tickets.titulo }}</span>
            </p>
            <p v-if="f.comentario" class="mt-1 whitespace-pre-line text-sm text-gray-700">“{{ f.comentario }}”</p>
            <p class="mt-1 text-xs text-gray-500">
              Respondió el <span class="tabular-nums">{{ formatFechaHora(f.fecha_envio) }}</span>
              · Técnico: {{ nombres[f.tickets.asignado_a] || 'sin asignar' }}
              ·
              <span :class="f.vencida ? 'font-medium text-red-700' : ''">
                {{ f.vencida ? 'Venció el' : 'Revisar a más tardar el' }} <span class="tabular-nums">{{ formatFecha(f.plazo) }}</span>
              </span>
            </p>
          </div>
          <AppButton
            size="sm"
            variant="outline"
            severity="secondary"
            label="Revisar"
            :aria-label="`Revisar la calificación del ticket ${f.tickets.codigo}`"
            @click="enCurso = f"
          />
        </li>
      </ul>
    </section>

    <RevisarCalificacionDialog
      v-if="enCurso"
      :encuesta="enCurso"
      :ticket="enCurso.tickets"
      @cerrar="onCerrado"
    />
  </div>
</template>
