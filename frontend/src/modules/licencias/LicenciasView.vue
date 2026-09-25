<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useLicenciasStore } from '../../stores/licencias.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { revelarClaveLicencia, revelarPassword } from '../../api/passwords.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, fechaISO, fechaLocalISO } from '../../core/formatters.js';
import { estadoVencimientoLicencia, CLASE_VENCIMIENTO_LICENCIA, DIAS_POR_VENCER_LICENCIA } from '../../core/dominio-licencias.js';
import LicenciaForm from './LicenciaForm.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import Modal from '../../components/shared/Modal.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import AppTag from '../../components/ui/AppTag.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { rolDeTag } from '../../core/tagRol.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { crearRevelado, escucharOcultamientoPorCambioDePestana } from '../../composables/useRevelado.js';

const store = useLicenciasStore();
const auth = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);

useRealtimeRefresco('licencias:list', () => Promise.all([store.cargar(), refrescarConteos()]), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const route = useRoute();
const router = useRouter();

// ── Filtros V2: vistas + chips + URL (2026-09-25, SISTEMA-DISENO §3.2.1) ──
// `situacion` es la VISTA (pestañas con conteo); empresa y acceso, chips.
// La búsqueda global enlaza con /licencias?q=SOFTWARE: mismo parámetro.
// No hay vista "Sin cupo": comparar asientos usados contra `cantidad` no se
// puede expresar en la query sin un cambio de esquema (api/domains/licencias.js).
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  situacion: { tipo: 'valor', defecto: '' },
  q: { tipo: 'texto' },
  empresa: { tipo: 'lista' },
  acceso: { tipo: 'lista' },
});
const CLAVES_FILTRO = ['q', 'empresa', 'acceso'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

const filtrosSinVista = computed(() => ({ q: filtros.q, empresaIds: filtros.empresa, accesos: filtros.acceso }));
const filtrosServidor = computed(() => ({ ...filtrosSinVista.value, situacion: filtros.situacion }));

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosLicenciasPorSituacion(filtrosSinVista.value);
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}

const VISTAS = computed(() => [
  { valor: '', label: 'Todas', conteo: conteos.value?.todas },
  { valor: 'por_vencer', label: 'Por vencer', conteo: conteos.value?.por_vencer, titulo: `Vencen en los próximos ${DIAS_POR_VENCER_LICENCIA} días` },
  { valor: 'vencidas', label: 'Vencidas', conteo: conteos.value?.vencidas },
  { valor: 'perpetuas', label: 'Perpetuas', conteo: conteos.value?.perpetuas, titulo: 'Sin fecha de vencimiento' },
]);

const FRASE_SITUACION = {
  vencidas: ' vencidas',
  por_vencer: ` por vencer en ${DIAS_POR_VENCER_LICENCIA} días`,
  perpetuas: ' perpetuas',
};

const empresas = ref([]);
const DIMENSIONES = computed(() => [
  { id: 'empresa', label: 'Empresa', icono: 'ti ti-building', opciones: empresas.value.map((e) => ({ valor: e.id, label: e.nombre })) },
  {
    id: 'acceso', label: 'Acceso', icono: 'ti ti-key', opciones: [
      { valor: 'correo', label: 'Con correo compartido' },
      { valor: 'clave', label: 'Con clave de producto' },
      { valor: 'ninguno', label: 'Sin credencial' },
    ],
  },
]);
const chips = computed({
  get: () => ({ empresa: filtros.empresa, acceso: filtros.acceso }),
  set: (v) => { filtros.empresa = v.empresa; filtros.acceso = v.acceso; },
});

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

// Una vista vacía en un inventario que sí tiene licencias ("Vencidas: 0") no
// es "Sin licencias todavía": es una buena noticia de esa vista.
const VACIO_VISTA = {
  por_vencer: { titulo: 'Nada por vencer', mensaje: `Ninguna licencia vence en los próximos ${DIAS_POR_VENCER_LICENCIA} días.` },
  vencidas: { titulo: 'Sin licencias vencidas', mensaje: 'Todas las suscripciones están al día.' },
  perpetuas: { titulo: 'Sin licencias perpetuas', mensaje: 'Todas las licencias registradas tienen fecha de vencimiento.' },
};
const vistaVacia = computed(() => (!hayFiltros.value && conteos.value?.todas > 0 ? VACIO_VISTA[filtros.situacion] || null : null));

watch(filtrosServidor, (f) => { store.aplicarFiltros(f).catch(() => {}); }, { deep: true });
watch(filtrosSinVista, refrescarConteos, { deep: true });

const mostrarForm = ref(false);
const licenciaEditar = ref(null);

const { esMovil } = useEsMovil();

// ── Presentación (rediseño 2026-09-23) ─────────────────────────
// Vencidas y por vencer ya las cuentan las vistas; "sin asientos libres" no
// se puede filtrar en el servidor, así que se informa en el subtítulo, y solo
// cuando la página trae TODAS las filas (contar sobre una página parcial
// mentiría).
const sinCupo = computed(() => {
  if (!lista.value.length || lista.value.length < total.value) return 0;
  return lista.value.filter((l) => l.cantidad > 0 && l.usados >= l.cantidad).length;
});

function tonoVencimiento(l) {
  return rolDeTag(estadoVencimiento(l).clase);
}

// "en 12 días" / "hace 3 días" junto a la fecha — el plazo se lee antes
// que la fecha misma.
function plazoVencimiento(l) {
  if (l.tipo === 'perpetua' || !l.fecha_vencimiento) return '';
  const hoy = new Date(`${fechaLocalISO()}T00:00:00`);
  const venc = new Date(`${l.fecha_vencimiento}T00:00:00`);
  const dias = Math.round((venc - hoy) / 86400000);
  if (dias === 0) return 'vence hoy';
  if (dias > 0) return dias > 90 ? '' : `en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  return `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
}

// Chips de usuarios: se muestran los primeros y el resto tras "+N".
const MAX_CHIPS = 2;
const expandidas = ref(new Set());
function usuariosVisibles(l) {
  return expandidas.value.has(l.id) ? l.usuarios : l.usuarios.slice(0, MAX_CHIPS);
}
function expandir(l) {
  expandidas.value = new Set([...expandidas.value, l.id]);
}

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'licencias',
      ['Software', 'Proveedor', 'Empresa', 'Acceso', 'Asientos usados', 'Asientos totales', 'Usuarios', 'Vencimiento'],
      filas.map((l) => [
        l.software,
        l.proveedor,
        l.empresa_nombre || 'Del grupo',
        l.cuenta_usuario,
        l.usados,
        l.cantidad,
        (l.usuarios || []).map((u) => u.nombre).join(', '),
        l.tipo === 'perpetua' ? 'Perpetua' : l.fecha_vencimiento,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// ── Asignación directa ────────────────────────────────────────
const mostrarAsignar = ref(false);
const licenciaAsignar = ref(null);
const empleadosActivos = ref([]);
const empleadoAsignarId = ref('');
const cargandoEmpleados = ref(false);
const asignando = ref(false);
const errorAsignar = ref('');
const modalAsignar = ref(null);

// Guard de cierre del Modal compartido (X, Escape, backdrop): no cierra
// mientras se está asignando, mismo criterio que el botón Cancelar.
function confirmarCierreAsignar() {
  return !asignando.value;
}

// Barra de capacidad: comunica cercanía al tope de asientos antes de que
// el trigger de BD (check_tope_licencia) bloquee la asignación.
function capacidadInfo(l) {
  const pct = l.cantidad > 0 ? Math.min(100, Math.round((l.usados / l.cantidad) * 100)) : 0;
  let clase = 'bg-green-500';
  if (pct >= 100) clase = 'bg-red-500';
  else if (pct >= 70) clase = 'bg-amber-500';
  return { pct, clase, libres: Math.max(0, l.cantidad - l.usados) };
}

function estadoVencimiento(l) {
  const estado = estadoVencimientoLicencia(l);
  const clase = CLASE_VENCIMIENTO_LICENCIA[estado];
  if (estado === 'perpetua') return { clase, texto: 'Perpetua' };
  if (estado === 'vencida') return { clase, texto: `Venció ${formatFecha(l.fecha_vencimiento)}` };
  if (estado === 'por_vencer') return { clase, texto: `Vence ${formatFecha(l.fecha_vencimiento)}` };
  return { clase, texto: formatFecha(l.fecha_vencimiento) };
}

const PERIODO_LABELS = {
  1: 'Mensual', 3: 'Trimestral', 6: 'Cada 6 meses',
  12: 'Anual', 24: 'Cada 2 años', 36: 'Cada 3 años',
};

function periodoLabel(meses) {
  return PERIODO_LABELS[meses] || `Cada ${meses} meses`;
}

// Próxima fecha: avanza el periodo desde el vencimiento actual las veces
// necesarias hasta quedar en el futuro (por si estuvo vencida un tiempo)
function proximaFecha(l) {
  const d = new Date(`${l.fecha_vencimiento}T00:00:00`);
  do {
    d.setMonth(d.getMonth() + l.renovacion_meses);
  } while (fechaISO(d) <= fechaLocalISO());
  return fechaISO(d);
}

// Confirmación (ConfirmDialog compartido): una sola instancia para las 3
// acciones de esta vista (eliminar/liberar/renovar), diferenciadas por
// `tipo`. Renovar no es destructiva — usa el botón primario, no btn-danger.
const accionPendiente = ref(null); // { tipo: 'eliminar'|'liberar'|'renovar', licencia, usuario?, nuevaFecha? }
const procesandoAccion = ref(false);
const dialogoAccion = ref(null);

const tituloAccion = computed(() => {
  const tipo = accionPendiente.value?.tipo;
  if (tipo === 'liberar') return 'Liberar asiento';
  if (tipo === 'renovar') return 'Renovar licencia';
  return 'Eliminar licencia';
});

const mensajeAccion = computed(() => {
  const a = accionPendiente.value;
  if (!a) return '';
  if (a.tipo === 'liberar') return `¿Liberar el asiento de ${a.usuario.nombre} en “${a.licencia.software}”?`;
  if (a.tipo === 'renovar') {
    return `¿Renovar “${a.licencia.software}”? Nuevo vencimiento: ${formatFecha(a.nuevaFecha)} (${periodoLabel(a.licencia.renovacion_meses).toLowerCase()}).`;
  }
  return `¿Eliminar la licencia “${a.licencia.software}”? El historial de asignaciones se conserva.`;
});

const confirmarLabelAccion = computed(() => {
  const tipo = accionPendiente.value?.tipo;
  if (tipo === 'liberar') return 'Liberar';
  if (tipo === 'renovar') return 'Renovar';
  return 'Eliminar';
});

const iconoAccion = computed(() => (accionPendiente.value?.tipo === 'liberar' ? 'ti-user-minus' : 'ti-trash'));

function pedirRenovar(lic) {
  accionPendiente.value = { tipo: 'renovar', licencia: lic, nuevaFecha: proximaFecha(lic) };
}

function abrirNueva() {
  licenciaEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(licencia) {
  licenciaEditar.value = licencia;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!licenciaEditar.value;
  mostrarForm.value = false;
  licenciaEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Licencia actualizada' : 'Licencia creada');
}

// La contraseña de la licencia: la propia (clave) si tiene una; si es una
// licencia con login sin clave propia, se entra con la contraseña del correo
async function revelarDeLicencia(licencia, motivo) {
  if (licencia.tiene_clave) return revelarClaveLicencia(licencia.id, motivo);
  if (licencia.cuenta_id) return revelarPassword(licencia.cuenta_id, motivo);
  return '';
}

// El revelado de una credencial (peticion a la edge function `credenciales`,
// auditoria en accesos_log con el motivo, cuenta regresiva de 8 segundos y
// ocultado automatico) vive en composables/useRevelado.js. Esta vista solo
// declara QUE credencial se revela — una instancia por licencia.
const revelados = new Map();
function revelarDe(lic) {
  if (!revelados.has(lic.id)) {
    revelados.set(lic.id, crearRevelado({
      revelar: (motivo) => revelarDeLicencia(lic, motivo),
      etiqueta: lic.tiene_clave ? 'contraseña del software' : 'contraseña del correo',
    }));
  }
  return revelados.get(lic.id);
}
watch(() => auth.puedeVerCredenciales, (puede) => {
  if (!puede) revelados.forEach((r) => r.ocultar());
});
const detenerOcultamiento = escucharOcultamientoPorCambioDePestana(() => [...revelados.values()]);
onBeforeUnmount(() => {
  detenerOcultamiento();
  revelados.forEach((r) => r.ocultar());
});

async function abrirAsignar(licencia) {
  licenciaAsignar.value = licencia;
  empleadoAsignarId.value = '';
  errorAsignar.value = '';
  mostrarAsignar.value = true;
  if (!empleadosActivos.value.length) {
    cargandoEmpleados.value = true;
    try {
      const todos = await insforgeApi.listEmpleados();
      empleadosActivos.value = todos.filter((e) => e.estado === 'Activo');
    } catch (e) {
      showToast(e?.message || 'Error al cargar empleados', 'error');
      modalAsignar.value?.cerrar();
    } finally {
      cargandoEmpleados.value = false;
    }
  }
}

async function confirmarAsignar() {
  if (!empleadoAsignarId.value) return;
  errorAsignar.value = '';
  asignando.value = true;
  try {
    await store.asignar(licenciaAsignar.value, empleadoAsignarId.value);
    modalAsignar.value?.cerrar();
    showToast('Asiento asignado');
  } catch (e) {
    // Rechazo del trigger de tope de asientos (check_tope_licencia): se
    // muestra dentro del modal, no solo en el toast, porque el mensaje
    // completo debe leerse con calma antes de reintentar.
    errorAsignar.value = e?.message || 'Error al asignar';
  } finally {
    asignando.value = false;
  }
}

function pedirLiberar(licencia, usuario) {
  accionPendiente.value = { tipo: 'liberar', licencia, usuario };
}

function pedirEliminar(licencia) {
  accionPendiente.value = { tipo: 'eliminar', licencia };
}

// Fuente única de las acciones por licencia para el menú ⋮ de las tarjetas
// móviles (mismo criterio que accionesDe/accionesVisibles en EquiposView).
function accionesDe(lic) {
  return [
    {
      icono: 'ti-refresh',
      label: 'Renovar',
      visible: lic.tipo === 'suscripcion' && !!lic.renovacion_meses && !!lic.fecha_vencimiento,
      onClick: () => pedirRenovar(lic),
    },
    {
      icono: 'ti-user-plus',
      label: 'Asignar asiento a un empleado',
      disabled: lic.usados >= lic.cantidad,
      onClick: () => abrirAsignar(lic),
    },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(lic) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => pedirEliminar(lic) },
  ];
}

async function confirmarAccionPendiente() {
  const a = accionPendiente.value;
  if (!a) return;
  procesandoAccion.value = true;
  try {
    if (a.tipo === 'liberar') {
      await store.liberar(a.usuario);
      showToast('Asiento liberado');
    } else if (a.tipo === 'renovar') {
      await store.renovar(a.licencia.id, a.nuevaFecha);
      showToast(`${a.licencia.software} renovada hasta ${formatFecha(a.nuevaFecha)}`);
    } else {
      await store.softDelete(a.licencia.id);
      showToast('Licencia eliminada');
    }
    dialogoAccion.value?.cerrar();
  } catch (e) {
    const verbo = a.tipo === 'liberar' ? 'liberar' : a.tipo === 'renovar' ? 'renovar' : 'eliminar';
    showToast(e?.message || `Error al ${verbo}`, 'error');
  } finally {
    procesandoAccion.value = false;
  }
}

onMounted(async () => {
  store.resetearFiltros();
  // /licencias?nuevo=1 — atajo desde el estado vacío de AsignarLicenciaModal
  // (ficha del empleado) cuando todavía no hay ninguna licencia registrada.
  // Se quita de la URL para que recargar no vuelva a abrir el formulario.
  if (route.query.nuevo) {
    abrirNueva();
    const { nuevo: _nuevo, ...resto } = route.query;
    router.replace({ query: resto });
  }
  insforgeApi.listEmpresas().then((e) => { empresas.value = e; }).catch(() => {});
  refrescarConteos();
  try {
    await store.aplicarFiltros(filtrosServidor.value);
  } catch {
    showToast(error.value || 'Error al cargar licencias', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Licencias">
      <template #subtitulo>
        {{ total }} {{ total === 1 ? 'licencia' : 'licencias' }}{{ FRASE_SITUACION[filtros.situacion] || '' }}{{ hayFiltros ? ', con los filtros aplicados' : '' }}
        <template v-if="sinCupo"> · {{ sinCupo }} sin asientos libres</template>
      </template>
      <template #acciones>
        <AppButton
          variant="text"
          severity="secondary"
          icon="ti ti-table-export"
          :loading="exportando"
          :disabled="exportando"
          :label="exportando ? 'Exportando...' : 'Exportar'"
          title="Exportar a Excel (CSV)"
          @click="exportar"
        />
        <AppButton icon="ti ti-plus" label="Nueva licencia" @click="abrirNueva" />
      </template>
    </AppEncabezado>

    <!-- ══ Vistas + barra de filtros (SISTEMA-DISENO §3.2.1) ══════ -->
    <AppVistas v-model="filtros.situacion" :opciones="VISTAS" label="Vista de licencias" />
    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar licencias" placeholder="Buscar por software, empresa o correo" />
      <AppFiltros v-model="chips" :dimensiones="DIMENSIONES" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
    </AppBarraFiltros>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && total === 0"
        icono="ti ti-license"
        :titulo="hayFiltros ? 'Sin resultados' : vistaVacia?.titulo || 'Sin licencias todavía'"
        :mensaje="hayFiltros ? 'No hay licencias con los filtros aplicados.' : vistaVacia?.mensaje || 'Registre la primera licencia para controlar asientos, accesos y vencimientos del software que se paga.'"
      >
        <AppButton v-if="!hayFiltros && !vistaVacia" variant="outline" severity="secondary" icon="ti ti-plus" label="Registrar licencia" @click="abrirNueva" />
        <AppButton v-if="hayFiltros" variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando licencias…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppMarcoTabla v-if="!esMovil">
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="lista"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :orden="orden"
              aria-label="Licencias de software"
              @ordenar="store.ordenarPor"
            >
              <AppColumn field="software" header="Software" sortable>
                <template #body="{ data: lic }">
                  <div class="flex min-w-0 max-w-56 items-center gap-3 2xl:max-w-72">
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                      <i class="ti ti-license" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0">
                      <div class="truncate font-medium text-gray-900">{{ lic.software }}</div>
                      <div class="truncate text-xs text-gray-500">
                        {{ [lic.proveedor, lic.empresa_nombre || 'Del grupo'].filter(Boolean).join(' · ') }}
                      </div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="acceso" header="Acceso">
                <template #body="{ data: lic }">
                  <!-- Revelado auditado (useRevelado): marcado .cred* intacto -->
                  <div v-if="lic.cuenta_id" class="min-w-0 max-w-52 2xl:max-w-64">
                    <div class="flex min-w-0 items-center gap-1.5 text-sm text-gray-700" :title="lic.cuenta_usuario">
                      <i class="ti ti-mail shrink-0 text-gray-500" aria-hidden="true"></i>
                      <span class="truncate">{{ lic.cuenta_usuario }}</span>
                    </div>
                    <div class="mt-1 flex items-center gap-2">
                      <div class="cred">
                        <span v-if="revelarDe(lic).valor.value" class="cred__valor">{{ revelarDe(lic).valor.value }}</span>
                        <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                        <template v-if="auth.puedeVerCredenciales">
                          <button type="button" class="cred__accion" :disabled="revelarDe(lic).pidiendo.value" :aria-label="revelarDe(lic).valor.value ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="revelarDe(lic).mostrar()">
                            <i :class="revelarDe(lic).valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                          </button>
                          <button type="button" class="cred__accion" :disabled="revelarDe(lic).pidiendo.value" aria-label="Copiar contraseña" @click="revelarDe(lic).copiar()">
                            <i class="ti ti-copy" aria-hidden="true"></i>
                          </button>
                          <span v-if="revelarDe(lic).valor.value" class="cred__cuenta" aria-live="off">{{ revelarDe(lic).restante.value }}s</span>
                        </template>
                        <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver contraseñas"><i class="ti ti-lock" aria-hidden="true"></i></span>
                      </div>
                      <span class="text-xs text-gray-500">{{ lic.tiene_clave ? 'propia' : 'del correo' }}</span>
                    </div>
                  </div>
                  <div v-else-if="lic.tiene_clave" class="min-w-0">
                    <div class="flex items-center gap-1.5 text-sm text-gray-700">
                      <i class="ti ti-key text-gray-500" aria-hidden="true"></i>Clave / serial
                    </div>
                    <div class="mt-1">
                      <div class="cred">
                        <span v-if="revelarDe(lic).valor.value" class="cred__valor">{{ revelarDe(lic).valor.value }}</span>
                        <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                        <template v-if="auth.puedeVerCredenciales">
                          <button type="button" class="cred__accion" :disabled="revelarDe(lic).pidiendo.value" :aria-label="revelarDe(lic).valor.value ? 'Ocultar clave' : 'Mostrar clave'" @click="revelarDe(lic).mostrar()">
                            <i :class="revelarDe(lic).valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                          </button>
                          <button type="button" class="cred__accion" :disabled="revelarDe(lic).pidiendo.value" aria-label="Copiar clave" @click="revelarDe(lic).copiar()">
                            <i class="ti ti-copy" aria-hidden="true"></i>
                          </button>
                          <span v-if="revelarDe(lic).valor.value" class="cred__cuenta" aria-live="off">{{ revelarDe(lic).restante.value }}s</span>
                        </template>
                        <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver contraseñas"><i class="ti ti-lock" aria-hidden="true"></i></span>
                      </div>
                    </div>
                  </div>
                  <span v-else class="text-gray-500">Sin credencial</span>
                </template>
              </AppColumn>

              <AppColumn field="asientos" header="Asientos">
                <template #body="{ data: lic }">
                  <div class="w-36">
                    <div class="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                      <span class="whitespace-nowrap text-gray-700">{{ lic.usados }}/{{ lic.cantidad }} asientos</span>
                      <span v-if="capacidadInfo(lic).libres === 0" class="font-medium text-red-700">Sin cupo</span>
                      <span v-else class="whitespace-nowrap text-gray-500">{{ capacidadInfo(lic).libres }} {{ capacidadInfo(lic).libres === 1 ? 'libre' : 'libres' }}</span>
                    </div>
                    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                      <div class="h-full rounded-full" :class="capacidadInfo(lic).clase" :style="{ width: capacidadInfo(lic).pct + '%' }"></div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="usuarios" header="Usuarios">
                <template #body="{ data: lic }">
                  <ul v-if="lic.usuarios.length" class="flex max-w-96 flex-wrap items-center gap-1.5" :aria-label="`Usuarios de ${lic.software}`">
                    <li
                      v-for="(u, i) in usuariosVisibles(lic)"
                      :key="u.asignacion_id || i"
                      class="inline-flex h-6 max-w-40 items-center gap-1 rounded-full bg-gray-100 pl-2.5 text-xs text-gray-700"
                      :class="u.asignacion_id ? 'pr-0.5' : 'pr-2.5'"
                    >
                      <RouterLink
                        v-if="u.empleado_id"
                        class="truncate hover:text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        :to="`/empleados/${u.empleado_id}`"
                      >{{ u.nombre }}</RouterLink>
                      <span v-else class="truncate">{{ u.nombre }}</span>
                      <button
                        v-if="u.asignacion_id"
                        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-200 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        type="button"
                        :title="`Liberar asiento de ${u.nombre}`"
                        :aria-label="`Liberar asiento de ${u.nombre}`"
                        @click="pedirLiberar(lic, u)"
                      >
                        <i class="ti ti-x text-xs" aria-hidden="true"></i>
                      </button>
                    </li>
                    <li v-if="lic.usuarios.length > usuariosVisibles(lic).length">
                      <button
                        type="button"
                        class="h-6 rounded-full px-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        :aria-label="`Ver los ${lic.usuarios.length} usuarios de ${lic.software}`"
                        @click="expandir(lic)"
                      >+{{ lic.usuarios.length - usuariosVisibles(lic).length }}</button>
                    </li>
                  </ul>
                  <span v-else class="text-gray-500">Sin usuarios</span>
                </template>
              </AppColumn>

              <AppColumn field="fecha_vencimiento" header="Vencimiento" sortable>
                <template #body="{ data: lic }">
                  <div class="whitespace-nowrap">
                    <AppTag :tono="tonoVencimiento(lic)" punto>{{ estadoVencimiento(lic).texto }}</AppTag>
                    <div class="mt-1 text-xs text-gray-500 tabular-nums">
                      <template v-if="plazoVencimiento(lic)">{{ plazoVencimiento(lic) }}</template>
                      <template v-if="plazoVencimiento(lic) && lic.tipo === 'suscripcion' && lic.renovacion_meses"> · </template>
                      <template v-if="lic.tipo === 'suscripcion' && lic.renovacion_meses">{{ periodoLabel(lic.renovacion_meses) }}</template>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
                <template #body="{ data: lic }">
                  <div class="flex justify-end">
                    <MenuAcciones :acciones="accionesDe(lic)" :label="`Acciones de ${lic.software}`" />
                  </div>
                </template>
              </AppColumn>
            </AppTable>
          </div>

          <AppPaginacion
            v-if="!cargando && total > 0"
            :pagina="store.pagina"
            :tam-pagina="store.tamPagina"
            :total="total"
            @update:pagina="store.irAPagina"
            @update:tam-pagina="store.cambiarTamPagina"
          />
        </AppMarcoTabla>

        <!-- ── Tarjetas (móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando licencias...</p>
          <ul v-else class="grid gap-3 sm:grid-cols-2" aria-label="Licencias de software">
            <li v-for="lic in lista" :key="lic.id" class="flex flex-col rounded-lg border border-gray-200 bg-white p-4">
              <div class="flex items-start gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-50 text-xl text-gray-500">
                  <i class="ti ti-license" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-gray-900">{{ lic.software }}</div>
                  <div class="truncate text-xs text-gray-500">{{ [lic.proveedor, lic.empresa_nombre || 'Del grupo'].filter(Boolean).join(' · ') }}</div>
                </div>
                <div class="-mr-1 -mt-1">
                  <MenuAcciones :acciones="accionesDe(lic)" :label="`Acciones de ${lic.software}`" />
                </div>
              </div>

              <div class="mt-3">
                <div class="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                  <span class="whitespace-nowrap text-gray-700">{{ lic.usados }}/{{ lic.cantidad }} asientos</span>
                  <span v-if="capacidadInfo(lic).libres === 0" class="font-medium text-red-700">Sin cupo</span>
                  <span v-else class="whitespace-nowrap text-gray-500">{{ capacidadInfo(lic).libres }} {{ capacidadInfo(lic).libres === 1 ? 'libre' : 'libres' }}</span>
                </div>
                <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                  <div class="h-full rounded-full" :class="capacidadInfo(lic).clase" :style="{ width: capacidadInfo(lic).pct + '%' }"></div>
                </div>
              </div>

              <ul v-if="lic.usuarios.length" class="mt-3 flex flex-wrap gap-1.5" :aria-label="`Usuarios de ${lic.software}`">
                <li
                  v-for="(u, i) in usuariosVisibles(lic)"
                  :key="u.asignacion_id || i"
                  class="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-gray-100 pl-2.5 text-xs text-gray-700"
                  :class="u.asignacion_id ? 'pr-0.5' : 'pr-2.5'"
                >
                  <RouterLink v-if="u.empleado_id" class="truncate hover:text-primary-600" :to="`/empleados/${u.empleado_id}`">{{ u.nombre }}</RouterLink>
                  <span v-else class="truncate">{{ u.nombre }}</span>
                  <button
                    v-if="u.asignacion_id"
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    type="button"
                    :title="`Liberar asiento de ${u.nombre}`"
                    :aria-label="`Liberar asiento de ${u.nombre}`"
                    @click="pedirLiberar(lic, u)"
                  >
                    <i class="ti ti-x text-xs" aria-hidden="true"></i>
                  </button>
                </li>
                <li v-if="lic.usuarios.length > usuariosVisibles(lic).length">
                  <button
                    type="button"
                    class="h-7 rounded-full px-2 text-xs font-medium text-gray-500 hover:bg-gray-100"
                    :aria-label="`Ver los ${lic.usuarios.length} usuarios de ${lic.software}`"
                    @click="expandir(lic)"
                  >+{{ lic.usuarios.length - usuariosVisibles(lic).length }}</button>
                </li>
              </ul>

              <div class="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                <AppTag :tono="tonoVencimiento(lic)" punto>{{ estadoVencimiento(lic).texto }}</AppTag>
                <span class="text-xs text-gray-500 tabular-nums">
                  {{ [plazoVencimiento(lic), lic.tipo === 'suscripcion' && lic.renovacion_meses ? periodoLabel(lic.renovacion_meses) : ''].filter(Boolean).join(' · ') }}
                </span>
              </div>
            </li>
          </ul>
          <AppPaginacion
            v-if="!cargando"
            variante="compacta"
            :pagina="store.pagina"
            :tam-pagina="store.tamPagina"
            :total="total"
            @update:pagina="store.irAPagina"
          />
        </div>
      </template>
    </div>

    <LicenciaForm
      v-if="mostrarForm"
      :licencia="licenciaEditar"
      @cerrar="onFormCerrado"
    />

    <!-- Modal: asignar asiento -->
    <Modal
      v-if="mostrarAsignar"
      ref="modalAsignar"
      size="sm"
      :confirmar-cierre="confirmarCierreAsignar"
      :cerrar-en-backdrop="false"
      @close="mostrarAsignar = false"
    >
      <template #titulo>Asignar asiento</template>
      <div class="space-y-4">
        <div v-if="licenciaAsignar" class="rounded-md bg-gray-50 px-3 py-2.5">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="truncate font-medium text-gray-900">{{ licenciaAsignar.software }}</span>
            <span class="shrink-0 text-xs text-gray-500 tabular-nums">{{ licenciaAsignar.usados }}/{{ licenciaAsignar.cantidad }} asientos usados</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
            <div class="h-full rounded-full" :class="capacidadInfo(licenciaAsignar).clase" :style="{ width: capacidadInfo(licenciaAsignar).pct + '%' }"></div>
          </div>
        </div>

        <p v-if="cargandoEmpleados" class="text-sm text-gray-500" role="status">Cargando empleados...</p>
        <div v-else class="campo">
          <label class="campo__etiqueta" for="as-empleado">Empleado<span aria-hidden="true"> *</span></label>
          <BuscadorCombo
            id="as-empleado"
            v-model="empleadoAsignarId"
            :items="empleadosActivos"
            :campos-busqueda="['nombres', 'apellidos', 'dni']"
            :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
            placeholder="Buscar por nombre o DNI..."
            :disabled="asignando"
          >
            <template #resultado="{ item }">
              <span>{{ item.nombres }} {{ item.apellidos }}</span>
              <span class="combo-sec">{{ item.dni }}</span>
            </template>
          </BuscadorCombo>
        </div>

        <div v-if="errorAsignar" class="notif" :class="[`notif--${infoNotificacion('error').rol}`, 'notif--inline']" :role="infoNotificacion('error').rolAria">
          <i class="ti" :class="infoNotificacion('error').icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ errorAsignar }}</p>
          </div>
        </div>
      </div>

      <template #acciones>
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="asignando" @click="modalAsignar?.cerrar()" />
        <AppButton
          :label="asignando ? 'Asignando...' : 'Asignar'"
          :loading="asignando"
          :disabled="!empleadoAsignarId"
          @click="confirmarAsignar"
        />
      </template>
    </Modal>

    <ConfirmDialog
      v-if="accionPendiente"
      ref="dialogoAccion"
      :destructivo="accionPendiente.tipo !== 'renovar'"
      :icono="iconoAccion"
      :titulo="tituloAccion"
      :mensaje="mensajeAccion"
      :confirmar-label="confirmarLabelAccion"
      :cargando="procesandoAccion"
      @cerrado="accionPendiente = null"
      @confirm="confirmarAccionPendiente"
    />
  </div>
</template>
