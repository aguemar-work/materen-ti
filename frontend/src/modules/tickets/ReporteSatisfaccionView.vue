<script setup>
// Consolidado histórico de satisfacción de tickets (todo el tiempo, sin
// recorte de periodo — a diferencia del modal "Reporte", que sí está
// acotado a un día/semana/mes). Se trae una sola vez desde
// obtenerSatisfaccionConsolidado() y todo el orden/paginación de la tabla
// principal es en el cliente: los dos resúmenes ya necesitan el histórico
// completo, así que no tiene sentido pedirlo de nuevo por página.
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { MIN_MUESTRA_PROMEDIO } from '../../api/domains/reportesTickets.js';
import { formatFechaHora } from '../../core/formatters.js';
import { showToast } from '../../core/toast.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import Pagination from '../../components/shared/Pagination.vue';

const cargando = ref(true);
const error = ref('');
const respuestas = ref([]);
const porSolicitante = ref([]);
const porTecnico = ref([]);
const staffPorId = ref({});

const orden = ref({ columna: 'created_at', direccion: 'desc' });
const pagina = ref(1);
const TAM_PAGINA = 20;

function ordenarPor(columna) {
  if (orden.value.columna === columna) {
    orden.value = { columna, direccion: orden.value.direccion === 'asc' ? 'desc' : 'asc' };
  } else {
    orden.value = { columna, direccion: 'asc' };
  }
  pagina.value = 1;
}

const respuestasOrdenadas = computed(() => {
  const { columna, direccion } = orden.value;
  const signo = direccion === 'asc' ? 1 : -1;
  return [...respuestas.value].sort((a, b) => {
    if (columna === 'nivel') return signo * ((a.nivel ?? -1) - (b.nivel ?? -1));
    if (columna === 'solicitante') return signo * a.solicitante.localeCompare(b.solicitante);
    return signo * (new Date(a[columna]) - new Date(b[columna]));
  });
});

const paginaActual = computed({
  get: () => pagina.value,
  set: (p) => { pagina.value = p; },
});

const respuestasPagina = computed(() => {
  const desde = (pagina.value - 1) * TAM_PAGINA;
  return respuestasOrdenadas.value.slice(desde, desde + TAM_PAGINA);
});

function nombreTecnico(tecnicoId) {
  if (!tecnicoId) return 'Sin asignar';
  return staffPorId.value[tecnicoId] || 'Staff';
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const [consolidado, staff] = await Promise.all([
      insforgeApi.obtenerSatisfaccionConsolidado(),
      insforgeApi.listStaff(),
    ]);
    respuestas.value = consolidado.respuestas;
    porSolicitante.value = consolidado.porSolicitante;
    porTecnico.value = consolidado.porTecnico;
    staffPorId.value = Object.fromEntries(staff.map((s) => [s.user_id, s.nombre]));
  } catch (e) {
    error.value = e?.message || 'Error al cargar la satisfacción de tickets';
    showToast(error.value, 'error');
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="satisfaccion-tickets-page vista-modulo">
    <PageHeader titulo="Satisfacción de tickets" icono="ti ti-mood-smile" :conteo="respuestas.length">
      <template #acciones>
        <RouterLink class="btn" to="/tickets"><i class="ti ti-arrow-left" aria-hidden="true"></i> Volver</RouterLink>
      </template>
    </PageHeader>

    <main class="page">
      <div v-if="error" class="no-results">{{ error }}</div>

      <template v-else>
        <div class="resumenes-grid">
          <div class="card">
            <div class="datos-title"><i class="ti ti-user"></i> Por solicitante</div>
            <p class="tk-nota">Promedio marcado en gris con menos de {{ MIN_MUESTRA_PROMEDIO }} respuestas con nivel.</p>
            <div class="table-wrap">
              <table aria-label="Satisfacción por solicitante">
                <thead>
                  <tr>
                    <th scope="col">Solicitante</th>
                    <th scope="col">Encuestas</th>
                    <th scope="col">Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  <SkeletonTabla v-if="cargando" :columnas="3" />
                  <template v-else>
                    <tr v-if="!porSolicitante.length"><td colspan="3"><TextoVacio /></td></tr>
                    <tr v-for="f in porSolicitante" :key="f.empleado_id || 'sin_empleado'">
                      <td>{{ f.nombre }}</td>
                      <td>{{ f.encuestasRespondidas }}/{{ f.encuestasGeneradas }}</td>
                      <td>
                        <TextoVacio v-if="f.promedio === null" placeholder="Sin respuestas" />
                        <span v-else :class="{ 'text-muted': f.muestra < MIN_MUESTRA_PROMEDIO }">{{ f.promedio.toFixed(1) }}/5</span>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="datos-title"><i class="ti ti-headset"></i> Por técnico</div>
            <p class="tk-nota">Es quien marcó el ticket como resuelto por última vez, no necesariamente el asignado actual.</p>
            <div class="table-wrap">
              <table aria-label="Satisfacción por técnico">
                <thead>
                  <tr>
                    <th scope="col">Técnico</th>
                    <th scope="col">Encuestas</th>
                    <th scope="col">Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  <SkeletonTabla v-if="cargando" :columnas="3" />
                  <template v-else>
                    <tr v-if="!porTecnico.length"><td colspan="3"><TextoVacio /></td></tr>
                    <tr v-for="f in porTecnico" :key="f.tecnico_id || 'sin_asignar'">
                      <td>{{ nombreTecnico(f.tecnico_id) }}</td>
                      <td>{{ f.encuestasRespondidas }}/{{ f.encuestasGeneradas }}</td>
                      <td>
                        <TextoVacio v-if="f.promedio === null" placeholder="Sin respuestas" />
                        <span v-else :class="{ 'text-muted': f.muestra < MIN_MUESTRA_PROMEDIO }">{{ f.promedio.toFixed(1) }}/5</span>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card card--fill">
          <div class="datos-title">Todas las respuestas</div>

          <EmptyState
            v-if="!cargando && !respuestas.length"
            icono="ti ti-mood-smile"
            titulo="Sin encuestas todavía"
            mensaje="Se generan automáticamente al cerrar un ticket con solicitante identificado."
          />

          <div v-else class="table-wrap">
            <p v-if="cargando" class="sr-only" role="status">Cargando satisfacción de tickets…</p>
            <table aria-label="Todas las respuestas de satisfacción">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <ThOrdenable clave="solicitante" :columna="orden.columna" :direccion="orden.direccion" @ordenar="ordenarPor">Solicitante</ThOrdenable>
                  <th scope="col">Técnico</th>
                  <ThOrdenable clave="nivel" :columna="orden.columna" :direccion="orden.direccion" @ordenar="ordenarPor">Nivel</ThOrdenable>
                  <th scope="col">Comentario</th>
                  <ThOrdenable clave="created_at" :columna="orden.columna" :direccion="orden.direccion" @ordenar="ordenarPor">Fecha</ThOrdenable>
                </tr>
              </thead>
              <tbody>
                <SkeletonTabla v-if="cargando" :columnas="6" />
                <template v-else>
                  <tr v-for="r in respuestasPagina" :key="r.id">
                    <td><RouterLink :to="`/tickets/${r.ticket_id}`">{{ r.ticket_codigo }}</RouterLink></td>
                    <td>{{ r.solicitante }}</td>
                    <td>{{ nombreTecnico(r.tecnico_id) }}</td>
                    <td>
                      <span v-if="r.nivel !== null">{{ r.nivel }}/5</span>
                      <TextoVacio v-else-if="!r.respondida" placeholder="Pendiente" />
                      <TextoVacio v-else />
                    </td>
                    <td><span v-if="r.comentario">{{ r.comentario }}</span><TextoVacio v-else /></td>
                    <td>{{ formatFechaHora(r.fecha_envio || r.created_at) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
            <Pagination v-if="!cargando" v-model="paginaActual" :total-items="respuestasOrdenadas.length" :page-size="TAM_PAGINA" />
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.resumenes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  gap: 16px;
  margin-bottom: 16px;
}

@media (max-width: 860px) {
  .resumenes-grid { grid-template-columns: 1fr; }
}
</style>
