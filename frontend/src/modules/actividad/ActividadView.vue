<script setup>
// Auditoría de accesos a contraseñas — solo visible para el JEFE.
// Los registros los escribe la edge function; nadie puede crearlos
// ni borrarlos desde el cliente.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { rolDeTag } from '../../core/tagRol.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';

const registros = ref([]);
const cargando = ref(true);
const filtroAccion = ref('');

const ACCIONES = {
  ver:             { label: 'Vio la contraseña',   icon: 'ti ti-eye',              clase: 'badge--info' },
  copiar:          { label: 'Copió la contraseña', icon: 'ti ti-copy',             clase: 'badge--accent' },
  enviar:          { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_creada:  { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_abierta: { label: 'Entrega abierta',     icon: 'ti ti-mail-opened',     clase: 'badge--warning' },
  acceso_denegado: { label: 'Acceso denegado',     icon: 'ti ti-shield-x',        clase: 'badge--danger' },
};

const listaFiltrada = computed(() =>
  filtroAccion.value
    ? registros.value.filter((r) => r.accion === filtroAccion.value)
    : registros.value
);

// Rediseño 2026-09-23: la auditoría se lee como una línea de tiempo
// (más reciente primero, agrupada por día), no como una tabla ordenable —
// la pregunta del JEFE es "qué pasó y cuándo", y el orden cronológico es
// el único que responde eso.
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaFiltrada);

function infoAccion(accion) {
  return ACCIONES[accion] || { label: accion, icon: 'ti ti-activity', clase: '' };
}

function exportar() {
  exportarCSV(
    'actividad',
    ['Fecha', 'Quién', 'Acción', 'Cuenta', 'Plataforma', 'Detalle'],
    listaFiltrada.value.map((r) => [
      formatFechaHora(r.created_at),
      r.user_email || '(empleado, vía enlace)',
      infoAccion(r.accion).label,
      r.cuenta_usuario,
      r.plataforma,
      r.detalle,
    ]),
  );
}

// Opciones del filtro con su conteo: el JEFE ve de un vistazo si hubo
// accesos denegados sin tener que filtrar para descubrirlo.
const OPCIONES_ACCION = [
  { valor: 'ver', label: 'Vio contraseña' },
  { valor: 'copiar', label: 'Copió contraseña' },
  { valor: 'enviar', label: 'Creó entrega' },
  { valor: 'entrega_abierta', label: 'Entrega abierta' },
  { valor: 'acceso_denegado', label: 'Acceso denegado' },
];
const conteoPorAccion = computed(() => {
  const c = {};
  for (const r of registros.value) c[r.accion] = (c[r.accion] || 0) + 1;
  return c;
});
const denegados = computed(() => conteoPorAccion.value.acceso_denegado || 0);

const CIRCULO = {
  info: 'bg-primary-50 text-primary-600',
  accent: 'bg-primary-50 text-primary-600',
  success: 'bg-green-50 text-green-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  neutral: 'bg-gray-100 text-gray-500',
};
function circuloAccion(accion) {
  return CIRCULO[rolDeTag(infoAccion(accion).clase)] || CIRCULO.neutral;
}

function claveDia(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function etiquetaDia(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (claveDia(d) === claveDia(hoy)) return 'Hoy';
  if (claveDia(d) === claveDia(ayer)) return 'Ayer';
  const txt = d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}
function horaDe(iso) {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
// Días de la página actual, en el orden en que llegan (más reciente primero).
const dias = computed(() => {
  const grupos = [];
  for (const r of listaPaginada.value) {
    const clave = claveDia(r.created_at);
    let g = grupos[grupos.length - 1];
    if (!g || g.clave !== clave) {
      g = { clave, label: etiquetaDia(r.created_at), items: [] };
      grupos.push(g);
    }
    g.items.push(r);
  }
  return grupos;
});

const subtitulo = computed(() => {
  const n = listaFiltrada.value.length;
  const base = `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;
  const accion = OPCIONES_ACCION.find((o) => o.valor === filtroAccion.value);
  return `${base}${accion ? ` · ${accion.label.toLowerCase()}` : ''} · quién vio, copió o entregó contraseñas`;
});

onMounted(async () => {
  try {
    registros.value = await insforgeApi.listActividad(200);
  } catch (e) {
    showToast(e?.message || 'Error al cargar la actividad', 'error');
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Actividad" :subtitulo="subtitulo">
      <template #acciones>
        <AppButton
          variant="text"
          severity="secondary"
          icon="ti ti-table-export"
          label="Exportar"
          title="Exportar a Excel (CSV)"
          :disabled="cargando || listaFiltrada.length === 0"
          @click="exportar"
        />
      </template>
    </AppEncabezado>

    <!-- ══ Barra de filtros ═══════════════════════════════════════ -->
    <div class="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6">
      <AppSelect v-model="filtroAccion" label="Filtrar por acción">
        <option value="">Todas las acciones</option>
        <option v-for="o in OPCIONES_ACCION" :key="o.valor" :value="o.valor">
          {{ o.label }}{{ conteoPorAccion[o.valor] ? ` (${conteoPorAccion[o.valor]})` : '' }}
        </option>
      </AppSelect>
      <AppButton
        v-if="denegados && filtroAccion !== 'acceso_denegado'"
        size="sm"
        variant="text"
        severity="danger"
        icon="ti ti-shield-x"
        :label="`${denegados} ${denegados === 1 ? 'acceso denegado' : 'accesos denegados'}`"
        @click="filtroAccion = 'acceso_denegado'"
      />
      <AppButton v-if="filtroAccion" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="filtroAccion = ''" />
      <span class="ml-auto hidden text-xs text-gray-500 sm:inline">Últimos 200 registros</span>
    </div>

    <!-- ══ Línea de tiempo ════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="cargando" class="rounded-lg border border-gray-200 bg-white p-4" aria-hidden="true">
        <div v-for="n in 6" :key="n" class="flex items-center gap-3 py-3">
          <div class="h-8 w-8 animate-pulse rounded-full bg-gray-100"></div>
          <div class="h-3 flex-1 animate-pulse rounded bg-gray-100"></div>
        </div>
      </div>
      <p v-if="cargando" class="sr-only" role="status">Cargando actividad…</p>

      <AppVacio
        v-else-if="totalItems === 0"
        icono="ti ti-activity"
        :titulo="filtroAccion ? 'Sin resultados' : 'Sin actividad registrada'"
        :mensaje="filtroAccion ? 'No hay movimientos de ese tipo en los últimos registros.' : 'Aquí aparecerá cada vez que alguien vea, copie o envíe una contraseña.'"
      >
        <AppButton v-if="filtroAccion" variant="outline" severity="secondary" icon="ti ti-x" label="Ver todas las acciones" @click="filtroAccion = ''" />
      </AppVacio>

      <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div class="min-h-0 flex-1 overflow-auto">
          <section v-for="dia in dias" :key="dia.clave" :aria-label="dia.label">
            <h2 class="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 px-4 py-1.5 text-xs font-medium text-gray-600 sm:px-5">
              {{ dia.label }}
            </h2>
            <ol class="px-4 sm:px-5">
              <li v-for="(fila, i) in dia.items" :key="fila.id" class="relative flex gap-3 py-3">
                <!-- Riel vertical que une los eventos del día -->
                <span
                  v-if="i < dia.items.length - 1"
                  class="absolute left-4 top-11 -bottom-3 w-px -translate-x-1/2 bg-gray-200"
                  aria-hidden="true"
                ></span>
                <span
                  class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                  :class="circuloAccion(fila.accion)"
                >
                  <i :class="infoAccion(fila.accion).icon" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p class="min-w-0 text-sm text-gray-700">
                      <span class="font-medium text-gray-900">{{ fila.user_email || 'Empleado, vía enlace' }}</span>
                      <span :class="fila.accion === 'acceso_denegado' ? 'font-medium text-red-700' : ''"> · {{ infoAccion(fila.accion).label.toLowerCase() }}</span>
                    </p>
                    <time
                      class="ml-auto shrink-0 text-xs text-gray-500 tabular-nums"
                      :datetime="fila.created_at"
                      :title="`${formatFechaHora(fila.created_at)} · ${formatAntiguedad(fila.created_at)}`"
                    >{{ horaDe(fila.created_at) }}</time>
                  </div>
                  <p v-if="fila.cuenta_usuario || fila.plataforma" class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
                    <i class="ti ti-key text-gray-500" aria-hidden="true"></i>
                    <span v-if="fila.cuenta_usuario" class="break-all font-medium text-gray-700">{{ fila.cuenta_usuario }}</span>
                    <span v-if="fila.cuenta_usuario && fila.plataforma" aria-hidden="true">·</span>
                    <span v-if="fila.plataforma">{{ fila.plataforma }}</span>
                  </p>
                  <p v-if="fila.detalle" class="mt-1 line-clamp-2 text-xs text-gray-500" :title="fila.detalle">{{ fila.detalle }}</p>
                </div>
              </li>
            </ol>
          </section>
        </div>

        <AppPaginacion
          :pagina="paginaActual"
          :tam-pagina="tamPagina"
          :total="totalItems"
          @update:pagina="paginaActual = $event"
          @update:tam-pagina="cambiarTamPagina"
        />
      </div>
    </div>
  </div>
</template>
