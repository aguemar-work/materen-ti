<script setup>
// Auditoría de accesos a contraseñas — solo visible para el JEFE.
// Los registros los escribe la edge function; nadie puede crearlos
// ni borrarlos desde el cliente.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import EnlaceReporte from '../../components/shared/EnlaceReporte.vue';
import { showToast } from '../../core/toast.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { rolDeTag } from '../../core/tagRol.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';

const registros = ref([]);
const cargando = ref(true);

const ACCIONES = {
  ver:             { label: 'Vio la contraseña',   icon: 'ti ti-eye',              clase: 'badge--info' },
  copiar:          { label: 'Copió la contraseña', icon: 'ti ti-copy',             clase: 'badge--accent' },
  enviar:          { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_creada:  { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_abierta: { label: 'Entrega abierta',     icon: 'ti ti-mail-opened',     clase: 'badge--warning' },
  acceso_denegado: { label: 'Acceso denegado',     icon: 'ti ti-shield-x',        clase: 'badge--danger' },
};

// ── Filtros V2: vistas + chips + URL (2026-09-25, SISTEMA-DISENO §3.2.1) ──
// Filtran en el cliente: la vista trae los últimos 200 registros de una vez.
// VISTA = qué tipo de movimiento (las preguntas del JEFE: ¿quién vio o copió
// contraseñas?, ¿qué entregas salieron?, ¿hubo accesos denegados?); quién,
// plataforma y fecha son chips.
const VISTAS_ACCION = {
  todo: null,
  contrasenas: ['ver', 'copiar'],
  entregas: ['enviar', 'entrega_creada', 'entrega_abierta'],
  denegados: ['acceso_denegado'],
};
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  vista: { tipo: 'valor', defecto: 'todo' },
  quien: { tipo: 'lista' },
  plataforma: { tipo: 'lista' },
  desde: { tipo: 'texto' },
  hasta: { tipo: 'texto' },
});
const CLAVES_FILTRO = ['quien', 'plataforma', 'desde', 'hasta'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));
// El empleado que abre una entrega no tiene sesión: su "quién" es este valor.
const SIN_SESION = 'enlace';

function fechaLocal(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function pasaChips(r) {
  if (filtros.quien.length && !filtros.quien.includes(r.user_email || SIN_SESION)) return false;
  if (filtros.plataforma.length && !filtros.plataforma.includes(r.plataforma || '')) return false;
  const dia = fechaLocal(r.created_at);
  if (filtros.desde && dia < filtros.desde) return false;
  if (filtros.hasta && dia > filtros.hasta) return false;
  return true;
}
const filtradosPorChips = computed(() => registros.value.filter(pasaChips));
const deVista = (vista, lista) => (VISTAS_ACCION[vista] ? lista.filter((r) => VISTAS_ACCION[vista].includes(r.accion)) : lista);
const listaFiltrada = computed(() => deVista(filtros.vista, filtradosPorChips.value));

const VISTAS = computed(() => [
  { valor: 'todo', label: 'Todo', conteo: cargando.value ? null : filtradosPorChips.value.length },
  { valor: 'contrasenas', label: 'Contraseñas', titulo: 'Vio o copió una contraseña', conteo: cargando.value ? null : deVista('contrasenas', filtradosPorChips.value).length },
  { valor: 'entregas', label: 'Entregas', titulo: 'Entregas creadas y abiertas', conteo: cargando.value ? null : deVista('entregas', filtradosPorChips.value).length },
  { valor: 'denegados', label: 'Denegados', titulo: 'Intentos sin permiso', conteo: cargando.value ? null : deVista('denegados', filtradosPorChips.value).length },
]);

// Opciones de los chips: salen de los propios registros (quién aparece de
// verdad en la auditoría), más frecuentes primero.
function opcionesPorFrecuencia(valorDe, etiquetaDe) {
  const conteo = new Map();
  for (const r of registros.value) {
    const v = valorDe(r);
    if (v) conteo.set(v, (conteo.get(v) || 0) + 1);
  }
  return [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([valor]) => ({ valor, label: etiquetaDe(valor) }));
}
const DIMENSIONES = computed(() => [
  {
    id: 'quien', label: 'Quién', icono: 'ti ti-user',
    opciones: opcionesPorFrecuencia((r) => r.user_email || SIN_SESION, (v) => (v === SIN_SESION ? 'Empleado, vía enlace' : v)),
  },
  { id: 'plataforma', label: 'Plataforma', icono: 'ti ti-apps', opciones: opcionesPorFrecuencia((r) => r.plataforma, (v) => v) },
  { id: 'creado', label: 'Fecha', icono: 'ti ti-calendar', tipo: 'rango' },
]);
const chips = computed({
  get: () => ({ quien: filtros.quien, plataforma: filtros.plataforma, creado: [filtros.desde, filtros.hasta] }),
  set: (v) => {
    filtros.quien = v.quien;
    filtros.plataforma = v.plataforma;
    [filtros.desde, filtros.hasta] = v.creado;
  },
});

// Rediseño 2026-09-23: la auditoría se lee como una línea de tiempo
// (más reciente primero, agrupada por día), no como una tabla ordenable —
// la pregunta del JEFE es "qué pasó y cuándo", y el orden cronológico es
// el único que responde eso.
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaFiltrada);
// Otro filtro, otra lista: vuelve a la primera página.
watch(() => JSON.stringify(filtros), () => { paginaActual.value = 1; });

function infoAccion(accion) {
  return ACCIONES[accion] || { label: accion, icon: 'ti ti-activity', clase: '' };
}

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
  return `${base}${hayFiltros.value ? ', con los filtros aplicados' : ''} · quién vio, copió o entregó contraseñas`;
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
        <EnlaceReporte reporte="auditoria" />
      </template>
    </AppEncabezado>

    <!-- ══ Vistas + barra de filtros (SISTEMA-DISENO §3.2.1) ══════ -->
    <AppVistas v-model="filtros.vista" :opciones="VISTAS" label="Vista de actividad" />
    <AppBarraFiltros class="pt-3">
      <AppFiltros v-model="chips" :dimensiones="DIMENSIONES" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiar(CLAVES_FILTRO)" />
      <span class="ml-auto hidden text-xs text-gray-500 sm:inline">Últimos 200 registros</span>
    </AppBarraFiltros>

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
        :titulo="hayFiltros ? 'Sin resultados' : filtros.vista === 'denegados' ? 'Sin accesos denegados' : filtros.vista !== 'todo' ? 'Sin movimientos de este tipo' : 'Sin actividad registrada'"
        :mensaje="hayFiltros ? 'No hay movimientos con los filtros aplicados.' : filtros.vista !== 'todo' ? 'Nada de este tipo en los últimos 200 registros.' : 'Aquí aparecerá cada vez que alguien vea, copie o envíe una contraseña.'"
      >
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiar(CLAVES_FILTRO)" />
      </AppVacio>

      <AppMarcoTabla v-else>
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
      </AppMarcoTabla>
    </div>
  </div>
</template>
