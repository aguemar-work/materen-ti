<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
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
                  <CarbonTag class="feed-badge" :variante="item.colorFamilia">{{ item.categoriaLabel }}</CarbonTag>
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
  border-radius: var(--radius-base);
  background: var(--color-bg-subtle);
  animation: skeleton-pulso 1.4s ease-in-out infinite;
}

.skel-bar--title { width: 140px; height: 15px; margin-bottom: 14px; }
.skel-bar--secondary { width: 100px; height: 13px; }

.skel-block--mio { height: 280px; }
.skel-block--pendientes { height: 280px; }
.skel-block--stat { height: 66px; }

@media (prefers-reduced-motion: reduce) {
  .skel-bar,
  .skel-block { animation: none; opacity: 0.6; }
}

.stat-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  font: inherit;
}

.stat-card--clic {
  text-decoration: none;
  cursor: pointer;
  transition: box-shadow 0.12s;
}
.stat-card--clic:hover,
.stat-card--clic:focus-visible { box-shadow: var(--shadow-overlay, none); }

/* "Cuentas asignadas" no navega a ningún lado (no existe vista global de
   cuentas): mismo marcado que las demás stat-card, pero sin el cursor de
   puntero que sugiere interactividad. */
.stat-card--no-clic { cursor: default; }

.section--stats .stat-card { padding: 12px 14px; }

.stat-icon {
  width: 38px; height: 38px; border-radius: var(--radius-base);
  display: flex; align-items: center; justify-content: center;
  font-size: var(--icon-md); flex-shrink: 0;
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
.section--stats .stat-value { font-size: var(--fs-heading-03); }
.stat-value { font-size: var(--fs-heading-05); font-weight: 700; color: var(--color-text-primary); line-height: 1; }
.stat-label { font-size: var(--fs-label-01); color: var(--color-text-secondary); margin-top: 4px; }

.section-title--secondary {
  font-size: var(--fs-body-01);
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
  font-size: var(--fs-body-01);
  color: var(--color-success-text);
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-base);
  padding: 14px 16px;
}

.todo-ok i { font-size: var(--icon-md); }

/* Fila superior: columna angosta de "Últimos empleados" + feed de
   Pendientes, uno al lado del otro sobre grid-12 */
.pendientes-row { align-items: start; }

.mio-col { grid-column: span 2; }
.pendientes-col { grid-column: span 10; }

@media (max-width: 1200px) {
  .mio-col { grid-column: span 4; }
  .pendientes-col { grid-column: span 8; }
}

@media (max-width: 768px) {
  .mio-col,
  .pendientes-col { grid-column: span 12; }
  /* H6 (auditoría visual, 2026-09-01): en una sola columna, lo accionable
     (Pendientes) va antes que la referencia (Últimos empleados) — en
     desktop el orden visual ya lo da la posición en la grilla (columna
     angosta a la izquierda vs. feed ancho a la derecha), pero al apilarse
     el orden del DOM pasaba a mandar y enterraba el feed debajo de 6
     tarjetas de empleados. */
  .pendientes-col { order: 1; }
  .mio-col { order: 2; }
}

/* Contenedor compartido: panel bordeado con filas separadas por línea
   (usado por el feed de Pendientes y la lista de últimos empleados) */
.panel-lista {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  overflow: hidden;
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

/* El ícono del feed usa .icon-box de main.css (rediseño Materen, Fase 1):
   antes era .feed-icon, una segunda implementación del mismo patrón que
   .soporte-accion-icono, divergente en tamaño (30 vs 38px) y en escala de
   ícono. `item.colorFamilia` ya nombraba las familias --danger/--warning/
   --info/--neutral (las mismas que usa el .badge de la derecha), así que el
   modificador es literalmente el mismo valor.
   'teal'/'purple'/'accent' quedaron sin consumidores en pendientesFeed.js
   (pasada de diseño ago 2026, ver ese archivo): colisionaban con prioridad
   Media/Alta de Tickets, Ubicaciones/rol JEFE y contadores/"copió
   contraseña" respectivamente. 'neutral' es el reemplazo de 'accent'
   ("Ticket sin vincular", dato incompleto sin urgencia real). */

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
  font-size: var(--fs-body-01);
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
  font-size: var(--fs-label-01);
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
  font-size: var(--fs-label-01);
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
  font-size: var(--fs-heading-02); font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 14px;
}

.no-results--compacto { padding: 20px; font-size: var(--fs-label-01); }

/* Mi trabajo: lista vertical angosta (col-2) de mis tickets vigentes.
   Cada ítem apila código+prioridad / título / estado en vez de ponerlos en
   fila — la columna es angosta y en una sola línea el título quedaría
   truncado a dos palabras, que no alcanzan para reconocer un ticket. */
.mio-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-5) var(--space-6);
  text-decoration: none;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.12s;
}

.mio-item:last-child { border-bottom: none; }
.mio-item:hover { background: var(--color-bg-hover); }

.mio-item-cab {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}

.mio-codigo {
  font-family: var(--font-mono);
  font-size: var(--fs-label-01);
  color: var(--color-text-tertiary);
}

.mio-titulo {
  font-size: var(--fs-label-01);
  font-weight: 600;
  color: var(--color-text-primary);
  /* Dos líneas y corta: una sola no alcanza para reconocer el ticket, tres
     desbalancean la columna contra el feed de al lado. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* .cds-tag y no .badge: el badge de esta fila lo pinta BadgeEstado, que
   desde el 2026-09-02 delega en CarbonTag. */
.mio-item .cds-tag { align-self: flex-start; }

/* "Ver mis N tickets": enlace de cierre de la lista, no una acción más —
   sin fondo ni borde, alineado con el contenido. */
.mio-todos {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
  font-size: var(--fs-label-01);
  color: var(--color-accent-text);
  text-decoration: none;
}

.mio-todos:hover { text-decoration: underline; }
.mio-todos i { font-size: var(--icon-sm); }

/* Sin tickets asignados NO es un estado de alarma: es una buena noticia.
   Mismo tratamiento discreto que .todo-ok del feed, no un EmptyState con
   ilustración — la columna es angosta y no hay nada que ir a crear. */
.mio-vacio {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-8) var(--space-6);
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.mio-vacio i {
  font-size: var(--icon-md);
  color: var(--color-success);
}
</style>
