<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import { construirFeedPendientes } from './pendientesFeed.js';

const stats = ref(null);
const recientes = ref([]);
const pendientes = ref({
  porRotar: [], sinPassword: [], licenciasPorVencer: [],
  equiposSinDevolver: [], garantiasPorVencer: [],
});
const pendientesTickets = ref({ sinAsignar: [], sinVincular: [], abiertosViejos: [] });
const pendientesProblemas = ref({ categoriasRecurrentes: [], accionesVencidas: [] });
const cargando = ref(true);

// El feed mezcla las 10 categorías y las ordena por urgencia real
// (ver pendientesFeed.js); acá solo se corta a un tamaño mostrable.
const LIMITE_FEED = 10;
const feedExpandido = ref(false);

const feedPendientes = computed(() => construirFeedPendientes(pendientes.value, pendientesTickets.value, pendientesProblemas.value));
const feedMostrado = computed(() =>
  feedExpandido.value ? feedPendientes.value : feedPendientes.value.slice(0, LIMITE_FEED)
);

// "Cuentas por rotar" en el Resumen no tiene una vista propia a la cual
// navegar: su detalle real es este mismo feed, así que solo hace scroll.
function irAFeedPendientes() {
  document.getElementById('pendientes-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onMounted(async () => {
  try {
    const [est, emp, pend, pendTk, pendProb] = await Promise.all([
      insforgeApi.getEstadisticas(),
      insforgeApi.listEmpleadosRecientes(6),
      insforgeApi.listPendientes(),
      insforgeApi.pendientesTickets(),
      insforgeApi.pendientesProblemas(),
    ]);
    stats.value = est;
    recientes.value = emp;
    pendientes.value = pend;
    pendientesTickets.value = pendTk;
    pendientesProblemas.value = pendProb;
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <div class="dashboard-page vista-modulo">
    <PageHeader titulo="Dashboard" icono="ti ti-layout-dashboard" />

    <main class="page page--padded dashboard-body">
      <div v-if="cargando" class="dashboard-skeleton" aria-hidden="true">
        <div class="section">
          <div class="grid-12 pendientes-row">
            <div class="recientes-col">
              <div class="skel-bar skel-bar--title"></div>
              <div class="skel-block skel-block--recientes"></div>
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
        <!-- Pendientes (feed único por urgencia) + Últimos empleados,
             como una columna angosta a la izquierda del feed -->
        <div class="section" id="pendientes-feed">
          <div class="grid-12 pendientes-row">
            <div class="recientes-col">
              <h2 class="section-title">Últimos empleados</h2>
              <div v-if="recientes.length === 0" class="no-results no-results--compacto">Sin empleados aún.</div>
              <div v-else class="panel-lista">
                <RouterLink v-for="emp in recientes" :key="emp.id" class="recientes-item" :to="`/empleados/${emp.id}`">
                  <div class="recientes-avatar">{{ emp.nombres[0] }}{{ emp.apellidos[0] }}</div>
                  <div class="recientes-info">
                    <span class="recientes-nombre">{{ emp.nombres }} {{ emp.apellidos }}</span>
                    <span class="recientes-cargo"><TextoVacio :valor="emp.cargo || emp.empresa_nombre" /></span>
                    <BadgeEstado tipo="empleado" :valor="emp.estado" status />
                  </div>
                </RouterLink>
              </div>
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
                  :class="`feed-item--${item.colorFamilia}`"
                  :to="item.destino"
                >
                  <span class="feed-icon"><i :class="item.icono"></i></span>
                  <div class="feed-main">
                    <span class="feed-titulo">{{ item.titulo }}</span>
                    <span class="feed-sep">·</span>
                    <span class="feed-contexto">{{ item.contexto }}</span>
                  </div>
                  <span class="badge feed-badge" :class="`badge--${item.colorFamilia}`">{{ item.categoriaLabel }}</span>
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

        <!-- Resumen: salud general de los 6 módulos, todo navegable -->
        <div class="section section--stats">
          <h2 class="section-title section-title--secondary">Resumen</h2>
          <div class="grid-12">
            <RouterLink to="/empleados?estado=Activo" class="stat-card stat-card--clic col-2">
              <div class="stat-icon stat-icon--empleados"><i class="ti ti-users"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.empleadosActivos }}</span>
                <span class="stat-label">Empleados activos</span>
              </div>
            </RouterLink>
            <RouterLink to="/empleados?estado=Inactivo" class="stat-card stat-card--clic col-2">
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
            <RouterLink to="/correos" class="stat-card stat-card--clic col-2">
              <div class="stat-icon stat-icon--correos"><i class="ti ti-mail-share"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.correosCompartidos }}</span>
                <span class="stat-label">Correos compartidos</span>
              </div>
            </RouterLink>
            <!-- Su detalle real vive en el feed de arriba: scroll en vez de navegar -->
            <button
              type="button"
              class="stat-card stat-card--clic col-2"
              :class="{ 'stat-card--alerta': stats.cuentasPorRotar > 0 }"
              @click="irAFeedPendientes"
            >
              <div class="stat-icon stat-icon--alerta"><i class="ti ti-key-off"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.cuentasPorRotar }}</span>
                <span class="stat-label">Contraseñas por rotar</span>
              </div>
            </button>
            <RouterLink
              to="/licencias"
              class="stat-card stat-card--clic col-2"
              :class="{ 'stat-card--alerta': stats.licenciasPorVencer > 0 }"
            >
              <div class="stat-icon stat-icon--licencias"><i class="ti ti-license"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.licenciasPorVencer }}</span>
                <span class="stat-label">Licencias por vencer</span>
              </div>
            </RouterLink>
            <RouterLink to="/equipos" class="stat-card stat-card--clic col-2">
              <div class="stat-icon stat-icon--equipos"><i class="ti ti-devices"></i></div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.equiposTotal }}</span>
                <span class="stat-label">Equipos</span>
              </div>
            </RouterLink>
            <RouterLink to="/tickets" class="stat-card stat-card--clic col-2">
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

<style scoped>
/* Header y page vienen del shell global (main.css); acá solo el
   layout interno de las secciones del dashboard. */
.dashboard-body { display: flex; flex-direction: column; gap: 28px; }

.no-results { text-align: center; padding: 40px; color: var(--color-text-secondary); }

/* Esqueleto de carga inicial: reserva aprox. la misma altura/estructura
   que el contenido real (fila Últimos empleados + Pendientes, y el
   Resumen de 7 stat-cards) para evitar el salto de layout al terminar
   de cargar. Reusa la animación .skeleton-bar/skeleton-pulso de main.css. */
.skel-bar,
.skel-block {
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
  animation: skeleton-pulso 1.4s ease-in-out infinite;
}

.skel-bar--title { width: 140px; height: 15px; margin-bottom: 14px; }
.skel-bar--secondary { width: 100px; height: 13px; }

.skel-block--recientes { height: 280px; }
.skel-block--pendientes { height: 280px; }
.skel-block--stat { height: 66px; }

@media (prefers-reduced-motion: reduce) {
  .skel-bar,
  .skel-block { animation: none; opacity: 0.6; }
}

.stat-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  text-align: left;
  font: inherit;
}

.stat-card--clic {
  text-decoration: none;
  cursor: pointer;
  transition: box-shadow 0.12s;
}
.stat-card--clic:hover,
.stat-card--clic:focus-visible { box-shadow: var(--shadow-md, var(--shadow-sm)); }

/* "Cuentas asignadas" no navega a ningún lado (no existe vista global de
   cuentas): mismo marcado que las demás stat-card, pero sin el cursor de
   puntero que sugiere interactividad. */
.stat-card--no-clic { cursor: default; }

.section--stats .stat-card { padding: 12px 14px; }

.stat-icon {
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 19px; flex-shrink: 0;
}

.stat-icon--empleados { background: var(--color-success-bg); color: var(--color-success-text); }
.stat-icon--neutral   { background: var(--color-neutral-bg); color: var(--color-neutral-text); }
.stat-icon--accesos   { background: var(--color-accent-subtle); color: var(--color-accent-text); }
.stat-icon--correos   { background: var(--color-purple-bg); color: var(--color-purple-text); }
.stat-icon--licencias { background: var(--color-teal-bg); color: var(--color-teal-text); }
.stat-icon--alerta    { background: var(--color-warning-bg-strong); color: var(--color-warning-text); }
.stat-icon--equipos   { background: var(--color-sky-bg); color: var(--color-sky-text); }
.stat-icon--tickets   { background: var(--color-info-bg); color: var(--color-info-text); }

.stat-card--alerta { border-color: var(--color-warning-border); }

.stat-info { display: flex; flex-direction: column; }
.section--stats .stat-value { font-size: 22px; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text-primary); line-height: 1; }
.stat-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }

.section-title--secondary {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Pendientes: feed único, severidad como borde izquierdo + badge de
   categoría (no franja de header completa) */
.todo-ok {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--color-success-text);
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px;
}

.todo-ok i { font-size: 18px; }

/* Fila superior: columna angosta de "Últimos empleados" + feed de
   Pendientes, uno al lado del otro sobre grid-12 */
.pendientes-row { align-items: start; }

.recientes-col { grid-column: span 2; }
.pendientes-col { grid-column: span 10; }

@media (max-width: 1200px) {
  .recientes-col { grid-column: span 4; }
  .pendientes-col { grid-column: span 8; }
}

@media (max-width: 768px) {
  .recientes-col,
  .pendientes-col { grid-column: span 12; }
}

/* Contenedor compartido: panel bordeado con filas separadas por línea
   (usado por el feed de Pendientes y la lista de últimos empleados) */
.panel-lista {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.feed-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  text-decoration: none;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.12s;
}

.feed-item:last-child { border-bottom: none; }
.feed-item:hover { background: var(--color-bg-hover, var(--color-bg-subtle)); }

.feed-icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 15px;
}

.feed-item--danger  .feed-icon { background: var(--color-danger-bg); color: var(--color-danger-text); }
.feed-item--warning .feed-icon { background: var(--color-warning-bg); color: var(--color-warning-text); }
.feed-item--info    .feed-icon { background: var(--color-info-bg); color: var(--color-info-text); }
.feed-item--teal    .feed-icon { background: var(--color-teal-bg-subtle); color: var(--color-teal-text); }
.feed-item--purple  .feed-icon { background: var(--color-purple-bg); color: var(--color-purple-text); }
.feed-item--accent  .feed-icon { background: var(--color-accent-subtle); color: var(--color-accent-text); }

.feed-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
}

.feed-titulo {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  font-family: var(--font-mono, monospace);
  flex-shrink: 0;
}

.feed-sep {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.feed-contexto {
  font-size: 12.5px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.feed-badge { flex-shrink: 0; white-space: nowrap; }
.feed-chevron { color: var(--color-text-secondary); flex-shrink: 0; }

@media (max-width: 768px) {
  .feed-badge { display: none; }
}

.pend-vermas {
  display: block;
  width: 100%;
  padding: 9px 14px;
  border: none;
  background: none;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-accent-text, var(--color-accent));
  text-align: center;
  cursor: pointer;
  transition: background 0.12s;
}

.pend-vermas:hover {
  background: var(--color-bg-hover, var(--color-bg-subtle));
}

.section-title {
  font-size: 15px; font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 14px;
}

.no-results--compacto { padding: 20px; font-size: 12.5px; }

/* Últimos empleados: lista vertical angosta (col-2), no la tarjeta
   horizontal que usaba antes cuando ocupaba col-3 a lo ancho */
.recientes-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  text-decoration: none;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.12s;
}

.recientes-item:last-child { border-bottom: none; }
.recientes-item:hover { background: var(--color-bg-hover, var(--color-bg-subtle)); }

.recientes-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%);
  color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; text-transform: uppercase;
  margin-top: 1px;
}

.recientes-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.recientes-nombre { font-size: 12.5px; font-weight: 600; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.recientes-cargo  { font-size: 11.5px; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.recientes-info .badge { align-self: flex-start; }
</style>
