<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import { rolDeTag } from '../../core/tagRol.js';
import IndicadorPrioridad from '../../components/shared/IndicadorPrioridad.vue';
import { construirFeedPendientes } from './pendientesFeed.js';

const auth = useAuthStore();
const stats = ref(null);
// Mis tickets vigentes. Se pide siempre (no depende de un módulo: un ticket
// asignado a mí es mío tenga o no el módulo Tickets en el sidebar — si no lo
// tuviera, la RLS de `tickets` devolvería vacío y la columna queda vacía, que
// es el comportamiento correcto).
const misTickets = ref({ lista: [], total: 0 });
const pendientes = ref({
  porRotar: [], sinPassword: [], licenciasPorVencer: [],
  equiposSinDevolver: [], garantiasPorVencer: [],
});
const pendientesTickets = ref({ sinAsignar: [], sinVincular: [], abiertosViejos: [] });
const pendientesProblemas = ref({ categoriasRecurrentes: [], accionesVencidas: [] });
// Altas de personal a medias. Se pide SOLO con el módulo `correos`: la RLS de
// `asignaciones_cuenta` lo exige (migración 068), y sin él el embed vuelve
// vacío y todos los empleados recientes parecerían sin cuenta. Mismo criterio
// que ya gatea las stat-cards de más abajo.
const altasIncompletas = ref([]);
const cargando = ref(true);

// El feed mezcla las 10 categorías y las ordena por urgencia real
// (ver pendientesFeed.js); acá solo se corta a un tamaño mostrable.
const LIMITE_FEED = 10;
const feedExpandido = ref(false);

const feedPendientes = computed(() => construirFeedPendientes(pendientes.value, pendientesTickets.value, pendientesProblemas.value, altasIncompletas.value));
const feedMostrado = computed(() =>
  feedExpandido.value ? feedPendientes.value : feedPendientes.value.slice(0, LIMITE_FEED)
);

onMounted(async () => {
  try {
    const [est, mios, pend, pendTk, pendProb, altas] = await Promise.all([
      insforgeApi.getEstadisticas(),
      insforgeApi.misTickets(auth.user?.id),
      insforgeApi.listPendientes(),
      insforgeApi.pendientesTickets(),
      insforgeApi.pendientesProblemas(),
      auth.puedeVerModulo('correos') ? insforgeApi.altasIncompletas() : Promise.resolve([]),
    ]);
    stats.value = est;
    misTickets.value = mios;
    pendientes.value = pend;
    pendientesTickets.value = pendTk;
    pendientesProblemas.value = pendProb;
    altasIncompletas.value = altas;
  } catch (e) {
    // Un fallo de carga no debe tumbar la vista: stats queda en null y el
    // template lo trata como "no disponible" en vez de leer sus propiedades.
    showToast(e?.message || 'Error al cargar el dashboard', 'error');
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <div class="dashboard-page vista-modulo">
    <PageHeader titulo="Dashboard" icono="ti ti-layout-dashboard" />

    <main class="page page--padded dashboard-body">
      <div v-if="cargando" aria-hidden="true">
        <div class="section">
          <div class="grid-12 pendientes-row">
            <div class="mio-col">
              <div class="skel-bar skel-bar--title"></div>
              <div class="skel-block skel-block--mio"></div>
            </div>

            <div class="pendientes-col">
              <div class="skel-bar skel-bar--title"></div>
              <div class="skel-block skel-block--pendientes"></div>
            </div>
          </div>
        </div>
        <div class="section">
          <div class="skel-bar skel-bar--title skel-bar--secondary"></div>
          <div class="grid-12">
            <div v-for="n in 8" :key="n" class="skel-block skel-block--stat col-2"></div>
          </div>
        </div>
      </div>

      <template v-else>
        <!-- Feed de pendientes del equipo (único, ordenado por urgencia) con
             "Mi trabajo" como columna angosta a su izquierda: lo propio y lo
             de todos, uno al lado del otro. -->
        <div class="section">
          <div class="grid-12 pendientes-row">
            <div class="mio-col">
              <h2 class="section-title">Mi trabajo</h2>

              <!-- Reemplaza a "Últimos empleados" (hasta 2026-09-02). Ese
                   bloque respondía "quién entró hace poco", una pregunta sin
                   decisión asociada — y desde que existe el pendiente "Alta
                   sin completar" el feed ya muestra el subconjunto que sí
                   pide acción. Este sitio pasa a lo que un técnico abre la
                   app para ver: lo suyo. El feed de al lado cubre lo que
                   NADIE tomó todavía o lo que se está pasando de tiempo; un
                   ticket asignado a mí, en curso, no estaba en pantalla. -->
              <div v-if="misTickets.total === 0" class="mio-vacio">
                <i class="ti ti-circle-check" aria-hidden="true"></i>
                <span>Sin tickets asignados</span>
              </div>

              <template v-else>
                <div class="panel-lista">
                  <RouterLink
                    v-for="t in misTickets.lista"
                    :key="t.id"
                    class="mio-item"
                    :to="`/tickets/${t.id}`"
                  >
                    <span class="mio-item-cab">
                      <span class="mio-codigo">{{ t.codigo }}</span>
                      <IndicadorPrioridad :valor="t.prioridad" />
                    </span>
                    <span class="mio-titulo">{{ t.titulo }}</span>
                    <BadgeEstado tipo="ticket" :valor="t.estado" status />
                  </RouterLink>
                </div>

                <!-- El total es de todos los asignados, no de los 5
                     mostrados: el enlace tiene que decir la verdad. -->
                <RouterLink
                  v-if="misTickets.total > misTickets.lista.length"
                  class="mio-todos"
                  to="/tickets"
                >
                  Ver mis {{ misTickets.total }} tickets
                  <i class="ti ti-arrow-right" aria-hidden="true"></i>
                </RouterLink>
              </template>
            </div>

            <div class="pendientes-col">
              <h2 class="section-title">Pendientes</h2>

              <div v-if="feedPendientes.length === 0" class="todo-ok">
                <i class="ti ti-circle-check"></i> Todo al día: sin contraseñas por rotar, licencias por vencer, equipos sin devolver ni tickets pendientes.
              </div>

              <div v-else class="panel-lista">
                <RouterLink
                  v-for="item in feedMostrado"
                  :key="item.key"
                  class="feed-item"
                  :to="item.destino"
                >
                  <span class="icon-box" :class="`icon-box--${item.colorFamilia}`"><i :class="item.icono"></i></span>
                  <div class="feed-main">
                    <span class="feed-titulo">{{ item.titulo }}</span>
                    <span class="feed-sep">·</span>
                    <span class="feed-contexto">{{ item.contexto }}</span>
                  </div>
                  <span class="tag feed-badge" :class="`tag--${rolDeTag(item.colorFamilia)}`">{{ item.categoriaLabel }}</span>
                  <i class="ti ti-chevron-right feed-chevron"></i>
                </RouterLink>
                <button
                  v-if="feedPendientes.length > LIMITE_FEED"
                  type="button"
                  class="pend-vermas"
                  @click="feedExpandido = !feedExpandido"
                >
                  {{ feedExpandido ? 'Ver menos' : `Ver ${feedPendientes.length - LIMITE_FEED} más` }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Resumen: inventario, no pendientes. Solo cifras que responden
             "cuánto hay" y sirven de entrada al módulo.
             Se retiraron el 2026-09-02 "Contraseñas por rotar" y "Licencias
             por vencer": las dos duplicaban filas del feed de arriba con
             MENOS información (el feed dice cuáles, desde cuándo y lleva a
             cada una; la tarjeta decía un número). La de rotación era el caso
             extremo — su única acción era hacer scroll hacia el feed que
             tenía justo encima. -->
        <div class="section section--stats">
          <h2 class="section-title section-title--secondary">Resumen</h2>
          <div v-if="!stats" class="no-results no-results--compacto">No se pudo cargar el resumen.</div>
          <div v-else class="grid-12">
            <RouterLink v-if="auth.puedeVerModulo('empleados')" to="/empleados?estado=Activo" class="stat-card stat-card--clic col-2">
              <div class="stat-icon stat-icon--empleados"><i class="ti ti-users"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.empleadosActivos }}</span>
                <span class="stat-label">Empleados activos</span>
              </div>
            </RouterLink>
            <RouterLink v-if="auth.puedeVerModulo('empleados')" to="/empleados?estado=Inactivo" class="stat-card stat-card--clic col-2">
              <div class="stat-icon stat-icon--neutral"><i class="ti ti-users-minus"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.empleadosTotal - stats.empleadosActivos }}</span>
                <span class="stat-label">Dados de baja</span>
              </div>
            </RouterLink>
            <!-- Sin link: no existe una vista global de cuentas (viven en la ficha del empleado) -->
            <div class="stat-card stat-card--no-clic col-2">
              <div class="stat-icon stat-icon--accesos"><i class="ti ti-key"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.cuentasAsignadas }}</span>
                <span class="stat-label">Cuentas asignadas</span>
              </div>
            </div>
            <RouterLink v-if="auth.puedeVerModulo('correos')" to="/correos" class="stat-card stat-card--clic col-2">
              <div class="stat-icon stat-icon--correos"><i class="ti ti-mail-share"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.correosCompartidos }}</span>
                <span class="stat-label">Correos compartidos</span>
              </div>
            </RouterLink>
            <RouterLink v-if="auth.puedeVerModulo('equipos')" to="/equipos" class="stat-card stat-card--clic col-2">
              <div class="stat-icon stat-icon--equipos"><i class="ti ti-devices"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.equiposTotal }}</span>
                <span class="stat-label">Equipos</span>
              </div>
            </RouterLink>
            <RouterLink v-if="auth.puedeVerModulo('tickets')" to="/tickets" class="stat-card stat-card--clic col-2">
              <div class="stat-icon stat-icon--tickets"><i class="ti ti-headset"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.ticketsAbiertos }}</span>
                <span class="stat-label">Tickets abiertos</span>
              </div>
            </RouterLink>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>


