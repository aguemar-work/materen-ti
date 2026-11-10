<script setup>
// Auditoría de accesos a contraseñas — solo visible para el JEFE.
// Los registros los escribe la edge function; nadie puede crearlos
// ni borrarlos desde el cliente.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import EnlaceReporte from '../../components/shared/EnlaceReporte.vue';
import { usePaginacion } from '../../composables/usePaginacion.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import AppLibro from '../../components/ui/AppLibro.vue';

const registros = ref([]);
const cargando = ref(true);
const error = ref(false);
const LIMITE = 200;

const ACCIONES = {
  ver: 'Contraseña vista',
  copiar: 'Contraseña copiada',
  enviar: 'Entrega creada',
  entrega_creada: 'Entrega creada',
  entrega_abierta: 'Entrega abierta',
  entrega_fallida: 'Entrega fallida',
  creado: 'Cuenta creada',
  editado: 'Cuenta editada',
  eliminado: 'Cuenta eliminada',
  acceso_denegado: 'Acceso denegado',
  permiso_otorgado: 'Permiso otorgado',
  permiso_revocado: 'Permiso revocado',
  revelado_fallido: 'Revelación fallida',
  revelado_denegado: 'Revelación denegada',
  purga_ejecutada: 'Limpieza ejecutada',
  portal_abierto: 'Portal abierto',
  exportacion: 'Exportación',
};
const ACCIONES_ENLACE = ['entrega_abierta', 'portal_abierto'];
const ACTORES = { enlace: 'Empleado, vía enlace', sistema: 'Sistema', 'sin-actor': 'Sin actor registrado' };
const etiquetaActor = (id) => ACTORES[id] || id;

// ── Filtros V2: vistas + chips + URL (2026-09-25, SISTEMA-DISENO §3.2.1) ──
// Filtran en el cliente: la vista trae los últimos 200 registros de una vez.
// VISTA = qué tipo de movimiento (las preguntas del JEFE: ¿quién vio o copió
// contraseñas?, ¿qué entregas salieron?, ¿hubo accesos denegados?); quién,
// plataforma y fecha son chips.
const VISTAS_ACCION = {
  todo: null,
  contrasenas: ['ver', 'copiar'],
  entregas: ['enviar', 'entrega_creada', 'entrega_abierta', 'entrega_fallida'],
  permisos: ['permiso_otorgado', 'permiso_revocado'],
  denegados: ['acceso_denegado', 'revelado_denegado'],
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
// Identificador reservado para enlaces sin sesión ya guardados en la URL.
function quienDe(fila) {
  if (fila.user_email) return fila.user_email;
  if (ACCIONES_ENLACE.includes(fila.accion)) return 'enlace';
  return fila.accion === 'purga_ejecutada' ? 'sistema' : 'sin-actor';
}

function fechaLocal(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function pasaChips(r) {
  if (filtros.quien.length && !filtros.quien.includes(quienDe(r))) return false;
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
  { valor: 'entregas', label: 'Entregas', titulo: 'Entregas creadas, abiertas o fallidas', conteo: cargando.value ? null : deVista('entregas', filtradosPorChips.value).length },
  { valor: 'permisos', label: 'Permisos', titulo: 'Permisos otorgados o revocados', conteo: cargando.value ? null : deVista('permisos', filtradosPorChips.value).length },
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
    opciones: opcionesPorFrecuencia(quienDe, etiquetaActor),
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

// Se conserva el orden cronológico de la consulta (lo más reciente primero).
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaFiltrada);
// Otro filtro, otra lista: vuelve a la primera página.
watch(() => JSON.stringify(filtros), () => { paginaActual.value = 1; });

const movimientos = computed(() => listaPaginada.value.map((fila) => ({
  id: fila.id,
  fecha: fila.created_at,
  movimiento: ACCIONES[fila.accion] || fila.accion,
  detalle: [fila.cuenta_usuario, fila.plataforma, fila.detalle].filter(Boolean).join(' · '),
  por: etiquetaActor(quienDe(fila)),
})));

const subtitulo = computed(() => {
  if (cargando.value || error.value) return 'Consulta de accesos, entregas e intentos denegados.';
  const n = listaFiltrada.value.length;
  const base = `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;
  return `${base}${hayFiltros.value ? ', con los filtros aplicados' : ''} · búsqueda en los últimos ${LIMITE} registros`;
});

async function cargar() {
  cargando.value = true;
  error.value = false;
  try {
    const filas = await insforgeApi.listActividad(LIMITE);
    registros.value = [...filas].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  } catch {
    error.value = true;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Registro de actividad" :subtitulo="subtitulo">
      <template #acciones>
        <EnlaceReporte reporte="auditoria" />
      </template>
    </AppEncabezado>

    <!-- ══ Vistas + barra de filtros (SISTEMA-DISENO §3.2.1) ══════ -->
    <AppBarraFiltros v-if="!error">
      <AppFiltros v-model="chips" :dimensiones="DIMENSIONES" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiar(CLAVES_FILTRO)" />
      <AppVistas v-model="filtros.vista" en-barra class="ml-auto" :opciones="VISTAS" label="Vista de actividad" />
    </AppBarraFiltros>

    <!-- ══ Libro de movimientos ════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <p v-if="cargando" class="py-6 text-sm text-gray-600" role="status">Cargando actividad…</p>
      <div v-else-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__titulo">No se pudo cargar el registro</p>
          <p class="notif__detalle">Vuelva a intentar la consulta para revisar los movimientos recientes.</p>
        </div>
        <AppButton size="sm" variant="outline" severity="secondary" label="Reintentar" @click="cargar" />
      </div>

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
          <AppLibro :filas="movimientos" etiqueta="Movimientos recientes de auditoría" :mostrar-referencia="false" />
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
