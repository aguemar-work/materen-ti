<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import { rolDeTag } from '../../core/tagRol.js';
import { prioridadInfo } from '../../core/dominio-tickets.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppKpi from '../../components/ui/AppKpi.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppButton from '../../components/ui/AppButton.vue';
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

// ── Presentación (rediseño 2026-09-23) ─────────────────────────────────
// Los KPIs de arriba agrupan el MISMO feed por área y lo filtran en el
// lugar (mismo patrón que la fila de disponibilidad de Equipos): la cifra
// explica exactamente qué filas hay debajo, sin una segunda consulta ni un
// segundo criterio de urgencia. El grupo sale del prefijo de `key` que ya
// arma pendientesFeed.js — no se toca la regla de tiers.
const GRUPOS = [
  { id: 'tickets', label: 'Tickets', icono: 'ti ti-headset', prefijos: ['tk-'] },
  { id: 'accesos', label: 'Accesos y altas', icono: 'ti ti-key', prefijos: ['sinpw-', 'rotar-', 'alta-'] },
  { id: 'inventario', label: 'Licencias y equipos', icono: 'ti ti-devices', prefijos: ['lic-', 'garantia-', 'equipo-'] },
  { id: 'problemas', label: 'Problemas', icono: 'ti ti-bug', prefijos: ['accion-vencida-', 'recurrencia-'] },
];
function grupoDe(item) {
  return GRUPOS.find((g) => g.prefijos.some((p) => item.key.startsWith(p)))?.id || null;
}
const filtroGrupo = ref('');
function alternarGrupo(id) {
  filtroGrupo.value = filtroGrupo.value === id ? '' : id;
  feedExpandido.value = false;
}
const kpisGrupo = computed(() => GRUPOS.map((g) => {
  const items = feedPendientes.value.filter((i) => grupoDe(i) === g.id);
  const criticos = items.filter((i) => i.tier === 1).length;
  let tono = 'success';
  let detalle = 'Al día';
  if (criticos) {
    tono = 'danger';
    detalle = `${criticos} ${criticos === 1 ? 'crítico' : 'críticos'}`;
  } else if (items.length) {
    tono = 'warning';
    detalle = 'Requieren atención';
  }
  return { ...g, total: items.length, tono, detalle };
}));
const feedFiltrado = computed(() =>
  filtroGrupo.value ? feedPendientes.value.filter((i) => grupoDe(i) === filtroGrupo.value) : feedPendientes.value
);
const feedMostrado = computed(() =>
  feedExpandido.value ? feedFiltrado.value : feedFiltrado.value.slice(0, LIMITE_FEED)
);
// Crítico y atención como dos bloques con su propio rótulo: el orden ya
// venía por tier, esto solo lo hace visible.
const bloquesFeed = computed(() => [
  { tier: 1, label: 'Crítico', items: feedMostrado.value.filter((i) => i.tier === 1) },
  { tier: 2, label: 'Atención', items: feedMostrado.value.filter((i) => i.tier !== 1) },
].filter((b) => b.items.length));
const totalCriticos = computed(() => feedPendientes.value.filter((i) => i.tier === 1).length);
const grupoActivo = computed(() => GRUPOS.find((g) => g.id === filtroGrupo.value) || null);

const CAJA_ICONO = {
  danger: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
  info: 'bg-primary-50 text-primary-600',
  neutral: 'bg-gray-100 text-gray-500',
};
function tonoFamilia(familia) {
  const rol = rolDeTag(familia);
  return CAJA_ICONO[rol] ? rol : 'neutral';
}

function tonoPrioridad(p) {
  return rolDeTag(prioridadInfo(p).clase);
}

// V2: la portada saluda a quien entra (el menú y las migas la llaman
// "Inicio"; el título "Dashboard" no coincidía con ninguno de los dos).
const saludo = computed(() => {
  const hora = new Date().getHours();
  const tramo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = (auth.nombre || '').trim().split(/\s+/)[0];
  return nombre ? `${tramo}, ${nombre}` : tramo;
});

const fechaHoy = computed(() => {
  const txt = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
});
const subtitulo = computed(() => {
  if (cargando.value) return fechaHoy.value;
  const n = feedPendientes.value.length;
  if (!n) return `${fechaHoy.value} · todo al día`;
  const pend = `${n} ${n === 1 ? 'pendiente' : 'pendientes'}`;
  const crit = totalCriticos.value ? `, ${totalCriticos.value} ${totalCriticos.value === 1 ? 'crítico' : 'críticos'}` : '';
  return `${fechaHoy.value} · ${pend}${crit}`;
});

// Inventario: cifras de "cuánto hay", secundarias — una lista compacta en
// la columna lateral, no tarjetas que compitan con los pendientes. Mismos
// gates de módulo y mismos destinos que las stat-cards anteriores.
const inventario = computed(() => {
  if (!stats.value) return [];
  const s = stats.value;
  return [
    { label: 'Tickets abiertos', icono: 'ti ti-headset', valor: s.ticketsAbiertos, to: '/tickets?vista=pendientes', visible: auth.puedeVerModulo('tickets') },
    { label: 'Empleados activos', icono: 'ti ti-users', valor: s.empleadosActivos, to: '/empleados?estado=Activo', visible: auth.puedeVerModulo('empleados') },
    { label: 'Dados de baja', icono: 'ti ti-users-minus', valor: s.empleadosTotal - s.empleadosActivos, to: '/empleados?estado=Inactivo', visible: auth.puedeVerModulo('empleados') },
    // Sin enlace: no existe una vista global de cuentas (viven en la ficha del empleado)
    { label: 'Cuentas asignadas', icono: 'ti ti-key', valor: s.cuentasAsignadas, to: null, visible: true },
    { label: 'Correos compartidos', icono: 'ti ti-mail-share', valor: s.correosCompartidos, to: '/correos', visible: auth.puedeVerModulo('correos') },
    { label: 'Equipos', icono: 'ti ti-devices', valor: s.equiposTotal, to: '/equipos', visible: auth.puedeVerModulo('equipos') },
  ].filter((f) => f.visible);
});

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
  <div class="w-full pb-10">
    <AppEncabezado :titulo="saludo" :subtitulo="subtitulo" />

    <!-- ══ Carga: esqueleto con la misma forma que la página ══════════ -->
    <div v-if="cargando" class="px-4 sm:px-6" aria-hidden="true">
      <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div v-for="n in 4" :key="n" class="h-[76px] animate-pulse rounded-lg border border-gray-200 bg-white"></div>
      </div>
      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="h-96 animate-pulse rounded-lg border border-gray-200 bg-white"></div>
        <div class="h-64 animate-pulse rounded-lg border border-gray-200 bg-white"></div>
      </div>
    </div>
    <p v-if="cargando" class="sr-only" role="status">Cargando el dashboard…</p>

    <template v-else>
      <!-- ══ Pendientes por área: cada KPI filtra la lista de abajo ═════ -->
      <div class="grid grid-cols-2 gap-3 px-4 sm:px-6 xl:grid-cols-4" role="group" aria-label="Pendientes por área">
        <button
          v-for="k in kpisGrupo"
          :key="k.id"
          type="button"
          class="min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          :aria-pressed="filtroGrupo === k.id"
          @click="alternarGrupo(k.id)"
        >
          <AppKpi
            :label="k.label"
            :valor="k.total"
            :icono="k.icono"
            :tono="k.tono"
            :detalle="filtroGrupo === k.id ? 'Filtro aplicado · clic para quitar' : k.detalle"
            class="h-full transition-colors duration-150"
            :class="filtroGrupo === k.id ? 'border-primary-300 bg-primary-50/50' : 'hover:border-gray-300 hover:bg-gray-50/60'"
          />
        </button>
      </div>

      <div class="mt-6 grid items-start gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <!-- ══ Requiere atención (feed único, ordenado por urgencia) ══ -->
        <AppSeccion
          titulo="Requiere atención"
          :conteo="feedFiltrado.length"
          :descripcion="grupoActivo ? `Solo ${grupoActivo.label.toLowerCase()}` : 'Lo que nadie tomó todavía o se está pasando de tiempo'"
          sin-padding
        >
          <template v-if="grupoActivo" #acciones>
            <AppButton size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Quitar filtro" @click="filtroGrupo = ''" />
          </template>

          <div v-if="feedFiltrado.length === 0" class="flex flex-col items-center px-6 py-12 text-center">
            <span class="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-green-50 text-xl text-green-600">
              <i class="ti ti-circle-check" aria-hidden="true"></i>
            </span>
            <p class="text-sm font-medium text-gray-900">Todo al día</p>
            <p class="mt-1 max-w-sm text-sm text-gray-500">
              <template v-if="grupoActivo">Sin pendientes en {{ grupoActivo.label.toLowerCase() }}.</template>
              <template v-else>Sin contraseñas por rotar, licencias por vencer, equipos sin devolver ni tickets pendientes.</template>
            </p>
          </div>

          <template v-else>
            <div v-for="bloque in bloquesFeed" :key="bloque.tier">
              <h3
                class="flex items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-4 py-1.5 text-xs font-medium"
                :class="bloque.tier === 1 ? 'text-red-700' : 'text-gray-500'"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="bloque.tier === 1 ? 'bg-red-500' : 'bg-amber-400'" aria-hidden="true"></span>
                {{ bloque.label }}
              </h3>
              <ul class="divide-y divide-gray-100">
                <li v-for="item in bloque.items" :key="item.key">
                  <RouterLink
                    :to="item.destino"
                    class="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                  >
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg" :class="CAJA_ICONO[tonoFamilia(item.colorFamilia)]">
                      <i :class="item.icono" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="min-w-0 truncate text-sm font-medium text-gray-900">{{ item.titulo }}</span>
                        <AppTag class="shrink-0">{{ item.categoriaLabel }}</AppTag>
                      </div>
                      <p class="mt-0.5 truncate text-xs text-gray-500">{{ item.contexto }}</p>
                    </div>
                    <i class="ti ti-chevron-right shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" aria-hidden="true"></i>
                  </RouterLink>
                </li>
              </ul>
            </div>
            <div v-if="feedFiltrado.length > LIMITE_FEED" class="border-t border-gray-100 px-2 py-1.5">
              <AppButton
                size="sm"
                variant="text"
                block
                :icon="feedExpandido ? 'ti ti-chevron-up' : 'ti ti-chevron-down'"
                :label="feedExpandido ? 'Ver menos' : `Ver ${feedFiltrado.length - LIMITE_FEED} más`"
                @click="feedExpandido = !feedExpandido"
              />
            </div>
          </template>
        </AppSeccion>

        <!-- ══ Lateral: lo propio + inventario ═══════════════════════ -->
        <aside class="min-w-0 space-y-6 lg:sticky lg:top-6">
          <!-- "Mis tickets" reemplaza a "Últimos empleados" (2026-09-02):
               lo que un técnico abre la app para ver es lo suyo. El feed
               cubre lo que NADIE tomó todavía. -->
          <AppSeccion titulo="Mis tickets" :conteo="misTickets.total" sin-padding>
            <AppVacio
              v-if="misTickets.total === 0"
              variante="seccion"
              titulo="Sin tickets asignados"
              mensaje="Los tickets que se le asignen aparecerán acá."
            />
            <template v-else>
              <ul class="divide-y divide-gray-100">
                <li v-for="t in misTickets.lista" :key="t.id">
                  <RouterLink
                    :to="`/tickets/${t.id}`"
                    class="block px-4 py-3 transition-colors duration-150 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                  >
                    <div class="flex items-center gap-2 text-xs">
                      <span class="font-medium text-gray-500 tabular-nums">{{ t.codigo }}</span>
                      <AppTag v-if="t.prioridad === 'alta' || t.prioridad === 'urgente'" :tono="tonoPrioridad(t.prioridad)">{{ prioridadInfo(t.prioridad).label }}</AppTag>
                      <BadgeEstado class="ml-auto" tipo="ticket" :valor="t.estado" status />
                    </div>
                    <p class="mt-1 line-clamp-2 text-sm text-gray-900">{{ t.titulo }}</p>
                  </RouterLink>
                </li>
              </ul>
              <!-- El total es de todos los asignados, no de los mostrados:
                   el enlace tiene que decir la verdad. -->
              <RouterLink
                v-if="misTickets.total > misTickets.lista.length"
                to="/tickets?vista=mios"
                class="flex items-center justify-center gap-1.5 border-t border-gray-100 px-4 py-2.5 text-sm font-medium text-primary-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
              >
                Ver mis {{ misTickets.total }} tickets
                <i class="ti ti-arrow-right" aria-hidden="true"></i>
              </RouterLink>
            </template>
          </AppSeccion>

          <AppSeccion titulo="Inventario" sin-padding>
            <p v-if="!stats" class="px-4 py-6 text-center text-sm text-gray-500">No se pudo cargar el resumen.</p>
            <ul v-else class="divide-y divide-gray-100">
              <li v-for="f in inventario" :key="f.label">
                <component
                  :is="f.to ? RouterLink : 'div'"
                  :to="f.to || undefined"
                  class="flex items-center gap-3 px-4 py-2.5 text-sm"
                  :class="f.to ? 'group transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500' : ''"
                >
                  <i :class="f.icono" class="text-base text-gray-500" aria-hidden="true"></i>
                  <span class="min-w-0 flex-1 truncate text-gray-600">{{ f.label }}</span>
                  <span class="font-semibold text-gray-900 tabular-nums">{{ f.valor }}</span>
                  <i v-if="f.to" class="ti ti-chevron-right text-gray-300 group-hover:text-gray-500" aria-hidden="true"></i>
                  <span v-else class="w-4" aria-hidden="true"></span>
                </component>
              </li>
            </ul>
          </AppSeccion>
        </aside>
      </div>
    </template>
  </div>
</template>
