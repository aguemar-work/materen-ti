<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto } from '../../core/dominio-empleados.js';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import EmpleadoMotivoDialog from './EmpleadoMotivoDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { useEsMovil } from '../../composables/useEsMovil.js';

const router = useRouter();
const store = useEmpleadosStore();
const auth = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);

// ── Filtros V2: vistas + chips + URL (2026-09-25) ──────────────────────
// La URL es la fuente de verdad: `?estado=Inactivo&empresa=a,b&q=juan`.
// `estado` es la VISTA (pestañas con conteo); 'Activo' por defecto — ver
// activos e inactivos mezclados era el problema reportado (ago 2026) — y
// 'todos' la vista sin filtro de estado. Los enlaces de Inicio
// (/empleados?estado=Inactivo) usan este mismo parámetro.
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  estado: { tipo: 'valor', defecto: 'Activo' },
  q: { tipo: 'texto' },
  empresa: { tipo: 'lista' },
  ubicacion: { tipo: 'lista' },
  area: { tipo: 'lista' },
});

const CLAVES_FILTRO = ['q', 'empresa', 'ubicacion', 'area'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

// Lo que viaja al servidor. `estado` se separa del resto: los conteos de las
// vistas dependen de los filtros, no de la vista elegida.
const filtrosSinEstado = computed(() => ({
  q: filtros.q,
  empresaIds: filtros.empresa,
  ubicacionIds: filtros.ubicacion,
  areaIds: filtros.area,
}));
const filtrosServidor = computed(() => ({
  ...filtrosSinEstado.value,
  estado: filtros.estado === 'todos' ? '' : filtros.estado,
}));

// Búsqueda: el campo responde al instante; a la URL (y al servidor) llega
// con el debounce de useBusqueda.
const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosEmpleadosPorEstado(filtrosSinEstado.value);
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}

const VISTAS = computed(() => [
  { valor: 'todos', label: 'Todos', conteo: conteos.value?.todos },
  { valor: 'Activo', label: 'Activos', conteo: conteos.value?.Activo },
  { valor: 'Inactivo', label: 'Inactivos', conteo: conteos.value?.Inactivo, titulo: 'Dados de baja' },
  { valor: 'Suspendido', label: 'Suspendidos', conteo: conteos.value?.Suspendido },
]);

// Dimensiones de los chips: las tres son columnas propias del empleado.
const ubicaciones = ref([]);
const empresas = ref([]);
const areas = ref([]);
const aOpciones = (lista) => lista.map((x) => ({ valor: x.id, label: x.nombre }));
const DIMENSIONES = computed(() => [
  { id: 'empresa', label: 'Empresa', icono: 'ti ti-building', opciones: aOpciones(empresas.value) },
  { id: 'area', label: 'Área/Obra', icono: 'ti ti-briefcase', opciones: aOpciones(areas.value) },
  { id: 'ubicacion', label: 'Ubicación', icono: 'ti ti-map-pin', opciones: aOpciones(ubicaciones.value) },
]);
const chips = computed({
  get: () => ({ empresa: filtros.empresa, area: filtros.area, ubicacion: filtros.ubicacion }),
  set: (v) => { filtros.empresa = v.empresa; filtros.area = v.area; filtros.ubicacion = v.ubicacion; },
});

function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

// Una vista sin filas en un inventario que sí tiene gente ("Suspendidos: 0")
// no es "Sin empleados todavía": dice que esa vista está vacía, nada más.
const vistaVacia = computed(() => {
  if (filtros.estado === 'todos' || !(conteos.value?.todos > 0)) return null;
  const nombre = VISTAS.value.find((v) => v.valor === filtros.estado)?.label.toLowerCase();
  return { titulo: `Sin empleados ${nombre}`, mensaje: 'No hay nadie en esta vista. Las demás pestañas muestran al resto del personal.' };
});

// Cualquier cambio de filtro o de vista recarga la página 1; los conteos,
// solo si cambió algo más que la vista.
watch(filtrosServidor, (f) => store.aplicarFiltros(f), { deep: true });
watch(filtrosSinEstado, refrescarConteos, { deep: true });

// Escritorio: siempre tabla (la vista "Tarjetas" se retiró el 2026-09-25 a
// pedido del dueño: no aportaba sobre la tabla). Móvil: tarjetas apiladas.
const { esMovil } = useEsMovil();

useRealtimeRefresco('empleados:list', () => Promise.all([store.cargar(), refrescarConteos()]), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const mostrarForm = ref(false);
const empleadoEditar = ref(null);


// Exporta el dataset filtrado COMPLETO (el servidor solo tiene la página)
const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'empleados',
      ['Nombres', 'Apellidos', 'DNI', 'Empresa', 'Área/Obra', 'Ubicación', 'Cargo', 'Estado', 'Fecha alta', 'WhatsApp', 'Correo personal'],
      filas.map((e) => [
        e.nombres, e.apellidos, e.dni, e.empresa_nombre, e.area_obra_nombre, e.ubicacion_nombre, e.cargo,
        e.estado, e.fecha_alta, e.whatsapp, e.correo_personal,
      ]),
    );
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudo exportar.' }).mensaje, 'error');
  } finally {
    exportando.value = false;
  }
}

// ── Enviar credenciales sin entrar al perfil ──────────────────────
// Mismo flujo que el botón de WhatsApp en la ficha (EmpleadoDetalleView):
// enlace de entrega de un solo uso con TODAS las cuentas del empleado.
const enviandoCredsId = ref(null);

async function enviarCredenciales(emp) {
  if (enviandoCredsId.value) return;
  enviandoCredsId.value = emp.id;
  try {
    const cuentas = await insforgeApi.listCuentasPorEmpleado(emp.id);
    if (!cuentas.length) {
      showToast(`${nombreCompleto(emp)} no tiene cuentas registradas`, 'error');
      return;
    }
    await enviarCredencialesWhatsApp({
      empleadoId: emp.id,
      empleadoNombre: nombreCompleto(emp),
      whatsapp: emp.whatsapp,
      cuentaIds: cuentas.map((c) => c.cuenta_id),
    });
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudo crear la entrega.' }).mensaje, 'error');
  } finally {
    enviandoCredsId.value = null;
  }
}

function abrirNuevo() {
  empleadoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(empleado) {
  empleadoEditar.value = empleado;
  mostrarForm.value = true;
}

function cerrarForm() {
  mostrarForm.value = false;
  empleadoEditar.value = null;
}

async function onFormCerrado(guardado) {
  const fueEdicion = !!empleadoEditar.value;
  cerrarForm();
  if (!guardado) return;
  if (fueEdicion) {
    showToast('Empleado actualizado');
    return;
  }
  // Alta guiada: la persona nueva abre su solicitud de alta (migración 108) y se
  // la lleva a la ficha, donde la guía lee esa solicitud para asignarle accesos.
  // Si la solicitud no se pudo abrir (p. ej. el backend aún no la tiene) la
  // persona igual quedó creada: se avisa y se sigue.
  try {
    await insforgeApi.crearSolicitud({ tipo: 'alta_empleado', empleadoId: guardado.id });
  } catch (e) {
    showToast(
      traducirErrorDb(e, { entidad: 'solicitud', porDefecto: 'No se pudo abrir la solicitud de alta.' }).mensaje,
      'warning',
    );
  }
  router.push(`/empleados/${guardado.id}`);
}

function verFicha(empleado) {
  router.push(`/empleados/${empleado.id}`);
}

const empleadoBaja = ref(null);

function darDeBaja(empleado) {
  if (empleado.estado === 'Inactivo') return;
  empleadoBaja.value = empleado;
}

function onBajaCerrada(hecho) {
  empleadoBaja.value = null;
  if (hecho) refrescarConteos();
}

// Suspender / Reactivar desde el menú ⋮ (RPC de la migración 102). Mismo
// diálogo que el del expediente; la lista se recarga sola desde el store.
const motivoEmpleado = ref(null); // { accion: 'suspender' | 'reactivar', empleado }

function onMotivoCerrado(hecho) {
  motivoEmpleado.value = null;
  if (hecho) refrescarConteos();
}

// Acciones por fila: menú ⋮ de la tabla y de las tarjetas (rediseño
// 2026-09-22 — antes la tabla tenía 4 íconos que aparecían al pasar el mouse).
function accionesDe(emp) {
  return [
    { icono: 'ti-eye', label: 'Ver ficha', onClick: () => verFicha(emp) },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(emp) },
    {
      icono: 'ti-brand-whatsapp',
      label: 'Enviar credenciales por WhatsApp',
      disabled: enviandoCredsId.value === emp.id || !auth.puedeVerCredenciales,
      onClick: () => enviarCredenciales(emp),
    },
    {
      icono: 'ti-user-pause',
      label: 'Suspender',
      visible: emp.estado === 'Activo',
      onClick: () => { motivoEmpleado.value = { accion: 'suspender', empleado: emp }; },
    },
    {
      icono: 'ti-user-check',
      label: 'Reactivar',
      visible: emp.estado !== 'Activo',
      onClick: () => { motivoEmpleado.value = { accion: 'reactivar', empleado: emp }; },
    },
    {
      icono: 'ti-user-off',
      label: 'Dar de baja',
      danger: true,
      visible: emp.estado !== 'Inactivo',
      onClick: () => darDeBaja(emp),
    },
  ];
}

onMounted(async () => {
  // Catálogos de los chips, en paralelo con la página: si uno falla, esa
  // dimensión queda sin opciones — nunca bloquea ni rompe el listado.
  Promise.allSettled([insforgeApi.listEmpresas(), insforgeApi.listAreasObras(), insforgeApi.listUbicaciones()])
    .then(([emps, ars, ubs]) => {
      if (emps.status === 'fulfilled') empresas.value = emps.value;
      if (ars.status === 'fulfilled') areas.value = ars.value;
      if (ubs.status === 'fulfilled') ubicaciones.value = ubs.value;
    });
  refrescarConteos();
  try {
    // Lo que se aplica es SIEMPRE lo que dice la URL: el reset limpia lo que
    // el store pudiera traer de una visita anterior (orden, página) y los
    // filtros se reponen desde la URL, así no queda ningún filtro invisible.
    store.resetearFiltros();
    await store.aplicarFiltros(filtrosServidor.value);
  } catch {
    showToast(error.value || 'Error al cargar empleados', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado
      titulo="Empleados"
      subtitulo="Personal inventariado, con sus accesos, equipos y licencias"
    >
      <template #acciones>
        <AppButton
          variant="text"
          severity="secondary"
          :icon="exportando ? 'ti ti-loader-2' : 'ti ti-table-export'"
          :loading="exportando"
          :disabled="exportando"
          :label="exportando ? 'Exportando...' : 'Exportar'"
          title="Exportar a Excel (CSV)"
          @click="exportar"
        />
        <AppButton icon="ti ti-plus" label="Nuevo empleado" @click="abrirNuevo" />
      </template>
    </AppEncabezado>

    <!-- ══ Vistas (estado) ═══════════════════════════════════════ -->
    <AppVistas v-model="filtros.estado" :opciones="VISTAS" label="Vista de empleados" />

    <!-- ══ Barra de filtros: búsqueda + chips bajo demanda ══════ -->
    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar empleados" placeholder="Buscar por nombre o DNI" />
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
        icono="ti ti-users"
        :titulo="hayFiltros ? 'Sin resultados' : vistaVacia ? vistaVacia.titulo : 'Sin empleados todavía'"
        :mensaje="hayFiltros ? 'No hay empleados con los filtros aplicados.' : vistaVacia ? vistaVacia.mensaje : 'Agregue el primer empleado al inventario para asignarle accesos y equipos.'"
      >
        <AppButton
          v-if="!hayFiltros && !vistaVacia"
          variant="outline"
          severity="secondary"
          icon="ti ti-plus"
          label="Agregar empleado"
          @click="abrirNuevo"
        />
        <AppButton
          v-if="hayFiltros"
          variant="outline"
          severity="secondary"
          icon="ti ti-x"
          label="Limpiar filtros"
          @click="limpiarFiltros"
        />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando empleados…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppMarcoTabla v-if="!esMovil">
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="lista"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :orden="orden"
              :row-class="() => 'cursor-pointer'"
              aria-label="Inventario de empleados"
              @ordenar="store.ordenarPor"
              @row-click="({ data }) => verFicha(data)"
            >
              <AppColumn field="apellidos" header="Empleado" sortable>
                <template #body="{ data: emp }">
                  <div class="flex min-w-0 items-center gap-3">
                    <AppAvatar :nombre="nombreCompleto(emp)" />
                    <div class="min-w-0">
                      <div class="truncate font-medium text-gray-900">{{ nombreCompleto(emp) }}</div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="cargo" header="Cargo" sortable>
                <template #body="{ data: emp }">
                  <div class="min-w-0">
                    <div class="truncate" :class="emp.cargo ? 'text-gray-900' : 'text-gray-500'">{{ emp.cargo || 'Sin cargo' }}</div>
                    <div v-if="emp.empresa_nombre" class="truncate text-xs text-gray-500">{{ emp.empresa_nombre }}</div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="vinculos" header="Asignado">
                <template #body="{ data: emp }">
                  <div v-if="emp.n_cuentas != null" class="flex items-center gap-4 text-sm tabular-nums">
                    <span
                      class="inline-flex items-center gap-1"
                      :class="emp.n_cuentas ? 'text-gray-700' : 'text-gray-400'"
                      :title="`${emp.n_cuentas} cuenta(s) activa(s)`"
                      :aria-label="`${emp.n_cuentas} cuenta(s) activa(s)`"
                    ><i class="ti ti-key" aria-hidden="true"></i>{{ emp.n_cuentas }}</span>
                    <span
                      class="inline-flex items-center gap-1"
                      :class="emp.n_equipos ? 'text-gray-700' : 'text-gray-400'"
                      :title="`${emp.n_equipos} equipo(s) asignado(s)`"
                      :aria-label="`${emp.n_equipos} equipo(s) asignado(s)`"
                    ><i class="ti ti-devices" aria-hidden="true"></i>{{ emp.n_equipos }}</span>
                    <span
                      class="inline-flex items-center gap-1"
                      :class="emp.n_licencias ? 'text-gray-700' : 'text-gray-400'"
                      :title="`${emp.n_licencias} licencia(s) directa(s)`"
                      :aria-label="`${emp.n_licencias} licencia(s) directa(s)`"
                    ><i class="ti ti-license" aria-hidden="true"></i>{{ emp.n_licencias }}</span>
                  </div>
                  <span v-else class="text-xs text-gray-500">Sin asignaciones</span>
                </template>
              </AppColumn>

              <!-- Solo en "Todos": dentro de una vista de estado, la columna
                   repetiría en cada fila lo que ya dice la pestaña. -->
              <AppColumn v-if="filtros.estado === 'todos'" field="estado" header="Estado" sortable>
                <template #body="{ data: emp }">
                  <BadgeEstado tipo="empleado" :valor="emp.estado" status />
                </template>
              </AppColumn>

              <AppColumn field="acciones" header="Acciones">
                <template #body="{ data: emp }">
                  <div class="flex justify-end" @click.stop>
                    <MenuAcciones :acciones="accionesDe(emp)" :label="`Acciones de ${nombreCompleto(emp)}`" />
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

        <!-- ── Tarjetas (solo móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando empleados...</p>
          <ul
            v-else
            class="grid grid-cols-1 gap-3"
            aria-label="Inventario de empleados"
          >
            <li
              v-for="emp in lista"
              :key="emp.id"
              class="group flex cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              tabindex="0"
              @keydown.enter.self="verFicha(emp)"
              @click="verFicha(emp)"
            >
              <div class="flex items-start gap-3">
                <AppAvatar :nombre="nombreCompleto(emp)" tamano="md" />
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-gray-900">{{ nombreCompleto(emp) }}</div>
                </div>
                <div class="-mr-1 -mt-1" @click.stop>
                  <MenuAcciones :acciones="accionesDe(emp)" :label="`Acciones de ${nombreCompleto(emp)}`" />
                </div>
              </div>
              <p class="mt-3 line-clamp-2 min-h-10 text-sm text-gray-600">
                {{ [emp.cargo, emp.empresa_nombre].filter(Boolean).join(' · ') || 'Sin cargo' }}
              </p>
              <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <BadgeEstado tipo="empleado" :valor="emp.estado" status />
                <div v-if="emp.n_cuentas != null" class="flex items-center gap-3 text-xs tabular-nums">
                  <span :class="emp.n_cuentas ? 'text-gray-600' : 'text-gray-400'" :title="`${emp.n_cuentas} cuenta(s) activa(s)`" :aria-label="`${emp.n_cuentas} cuenta(s) activa(s)`"><i class="ti ti-key" aria-hidden="true"></i> {{ emp.n_cuentas }}</span>
                  <span :class="emp.n_equipos ? 'text-gray-600' : 'text-gray-400'" :title="`${emp.n_equipos} equipo(s) asignado(s)`" :aria-label="`${emp.n_equipos} equipo(s) asignado(s)`"><i class="ti ti-devices" aria-hidden="true"></i> {{ emp.n_equipos }}</span>
                  <span :class="emp.n_licencias ? 'text-gray-600' : 'text-gray-400'" :title="`${emp.n_licencias} licencia(s) directa(s)`" :aria-label="`${emp.n_licencias} licencia(s) directa(s)`"><i class="ti ti-license" aria-hidden="true"></i> {{ emp.n_licencias }}</span>
                </div>
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

    <EmpleadoForm
      v-if="mostrarForm"
      :empleado="empleadoEditar"
      @cerrar="onFormCerrado"
    />

    <BajaEmpleadoModal
      v-if="empleadoBaja"
      :empleado="empleadoBaja"
      @cerrar="onBajaCerrada"
    />

    <EmpleadoMotivoDialog
      v-if="motivoEmpleado"
      :accion="motivoEmpleado.accion"
      :empleado="motivoEmpleado.empleado"
      @cerrar="onMotivoCerrado"
    />
  </div>
</template>
