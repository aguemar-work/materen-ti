<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter, useRoute } from 'vue-router';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { altaIncompleta } from '../../core/dominio-empleados.js';
import { fechaLocalISO } from '../../core/formatters.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto } from '../../core/dominio-empleados.js';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';

const router = useRouter();
const route = useRoute();
const store = useEmpleadosStore();
const auth = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');

// Orden en la forma que espera AppTable (1 asc | -1 desc | null), derivada
// de la `orden` del store — mismo puente que LicenciasView/EquiposView.
const sortFieldTabla = computed(() => ordenColumna.value || null);
const sortOrderTabla = computed(() => {
  if (!orden.value) return null;
  return orden.value.direccion === 'desc' ? -1 : 1;
});

// Filtro de estado como segmentado (rediseño 2026-09-22): con 3 estados y
// uno de ellos por defecto, verlos todos a la vista ahorra abrir un select.
// '' = todos, mismo valor que tenía la opción "Todos los estados".
const ESTADOS_SEGMENTO = [
  { valor: 'Activo', label: 'Activos' },
  { valor: 'Inactivo', label: 'Inactivos' },
  { valor: 'Suspendido', label: 'Suspendidos' },
  { valor: '', label: 'Todos' },
];

// ── Selector Tabla/Tarjetas (FASE 4) ────────────────────────────────────
// "Lista con avatar" queda pendiente como 3ª opción (falta el mockup de
// proporciones) — sigue siendo distinta de "Tarjetas": esa sería una lista
// angosta de una columna (como la tarjeta angosta de Triage en Tickets),
// "Tarjetas" es una grilla de tarjetas reales (ver más abajo, corregido en
// esta pasada — antes reusaba el mismo `.tarjeta-fila` de fila compacta que
// el fallback móvil, así que en escritorio se veía como una lista de filas
// angosta, no como tarjetas). Mobile siempre muestra tarjetas sin importar
// la preferencia (ya era así antes de que este selector existiera) — ver
// el v-if de las tarjetas y de la tabla más abajo, que se resuelven contra
// `esMovil` además de contra `vista`.
const OPCIONES_VISTA_EMPLEADOS = [
  { valor: 'tabla', icono: 'ti-table', label: 'Tabla' },
  { valor: 'tarjetas', icono: 'ti-id', label: 'Tarjetas' },
];
const { esMovil } = useEsMovil();
const { vista } = useVistaModulo('empleados', ['tabla', 'tarjetas']);

useRealtimeRefresco('empleados:list', () => store.cargar(), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });
// Precarga desde el link del Dashboard (ej. /empleados?estado=Inactivo);
// sin query entrante arranca en Activo — ver activos e inactivos mezclados
// por defecto era el problema reportado (ago 2026).
const filtroEstado = ref(route.query.estado || 'Activo');
const filtroUbicacion = ref('');
const ubicaciones = ref([]);
// El chip de cuentas de la fila ya distinguía "0 cuentas" con un tono
// apagado, pero cero cuentas no significa lo mismo en todos lados: en alguien
// que entró la semana pasada es un alta a medias, y en alguien de hace dos
// años es sencillamente cómo trabaja. Misma regla que alimenta el feed de
// pendientes del Dashboard (core/dominio-empleados.js) — el chip solo cambia
// de significado, no se agrega ningún elemento nuevo a la fila.
function altaPendiente(emp) {
  return !!altaIncompleta(emp, { cuentas: emp.n_cuentas ?? 0 }, fechaLocalISO());
}

function tituloCuentas(emp) {
  const base = `${emp.n_cuentas} cuenta(s) activa(s)`;
  return altaPendiente(emp) ? `${base} — alta sin completar` : base;
}

const mostrarForm = ref(false);
const empleadoEditar = ref(null);

// Búsqueda y filtros viajan al servidor (paginación server-side):
// la búsqueda con debounce, los selects al instante.
watch(filtroEstado, (estado) => store.aplicarFiltros({ estado }));
watch(filtroUbicacion, (ubicacionId) => store.aplicarFiltros({ ubicacionId }));


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
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// ── Enviar credenciales sin entrar al perfil ──────────────────────
// Mismo flujo que el botón de WhatsApp en la ficha (CuentasPanel):
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
    showToast(e?.message || 'Error al crear la entrega', 'error');
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

function onFormCerrado(guardado) {
  const fueEdicion = !!empleadoEditar.value;
  cerrarForm();
  if (!guardado) return;
  if (fueEdicion) {
    showToast('Empleado actualizado');
  } else {
    // Alta guiada: llevar a la ficha del nuevo empleado para asignarle accesos
    router.push(`/empleados/${guardado.id}?nuevo=1`);
  }
}

function verFicha(empleado) {
  router.push(`/empleados/${empleado.id}`);
}

const empleadoBaja = ref(null);

function darDeBaja(empleado) {
  if (empleado.estado === 'Inactivo') return;
  empleadoBaja.value = empleado;
}

function onBajaCerrada() {
  empleadoBaja.value = null;
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
      icono: 'ti-user-off',
      label: 'Dar de baja',
      danger: true,
      visible: emp.estado !== 'Inactivo',
      onClick: () => darDeBaja(emp),
    },
  ];
}

onMounted(async () => {
  try {
    ubicaciones.value = await insforgeApi.listUbicaciones();
  } catch {
    // El filtro de ubicación queda vacío si falla — no rompe el listado.
  }
  try {
    // route.query.estado (no filtroEstado.value: ese ref siempre trae un
    // valor por el fallback 'Activo' de la línea de arriba, así que nunca
    // detectaría "no hay query entrante") — condición real de si llegó un
    // deep link del Dashboard. Sin resetear en ese caso, `q` (búsqueda de
    // texto) quedaba pegado en el store entre montajes: la caja se veía
    // vacía (useBusqueda nace limpio) pero el filtro seguía aplicado al
    // volver a Empleados desde otro módulo (bug reportado ago 2026).
    if (route.query.estado) {
      await store.aplicarFiltros({ estado: filtroEstado.value });
    } else {
      store.resetearFiltros();
      await store.cargar();
    }
  } catch {
    showToast(error.value || 'Error al cargar empleados', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado
      titulo="Empleados"
      :subtitulo="`${total} ${total === 1 ? 'persona' : 'personas'}${filtroEstado ? ` en estado ${filtroEstado.toLowerCase()}` : ''} · accesos, equipos y licencias asignados`"
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

    <!-- ══ Barra de filtros (fuera de la tabla: filtra, no es parte del dato) -->
    <div class="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6">
      <AppBuscador v-model="busqueda" label="Buscar empleados" placeholder="Buscar por nombre o DNI" />
      <AppSegmentado v-model="filtroEstado" :opciones="ESTADOS_SEGMENTO" label="Filtrar por estado" />
      <AppSelect v-model="filtroUbicacion" label="Filtrar por ubicación">
        <option value="">Todas las ubicaciones</option>
        <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
      </AppSelect>
      <SelectorVista v-model="vista" :opciones="OPCIONES_VISTA_EMPLEADOS" class="solo-escritorio ml-auto" />
    </div>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && total === 0"
        icono="ti ti-users"
        :titulo="busqueda || filtroEstado ? 'Sin resultados' : 'Sin empleados todavía'"
        :mensaje="busqueda || filtroEstado ? 'No hay empleados con los filtros aplicados.' : 'Agregue el primer empleado al inventario para asignarle accesos y equipos.'"
      >
        <AppButton
          v-if="!busqueda && !filtroEstado"
          variant="outline"
          severity="secondary"
          icon="ti ti-plus"
          label="Agregar empleado"
          @click="abrirNuevo"
        />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando empleados…</p>

        <!-- ── Tabla (escritorio) ── -->
        <div
          v-if="vista === 'tabla' && !esMovil"
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
        >
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="lista"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :sort-field="sortFieldTabla"
              :sort-order="sortOrderTabla"
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
                      <div class="text-xs text-gray-500 tabular-nums">DNI {{ emp.dni }}</div>
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
                      :class="altaPendiente(emp) ? 'text-amber-700' : emp.n_cuentas ? 'text-gray-700' : 'text-gray-400'"
                      :title="tituloCuentas(emp)"
                      :aria-label="tituloCuentas(emp)"
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

              <AppColumn field="estado" header="Estado" sortable>
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
        </div>

        <!-- ── Tarjetas (vista elegida en escritorio, o siempre en móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando empleados...</p>
          <ul
            v-else
            class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            aria-label="Inventario de empleados"
          >
            <li
              v-for="emp in lista"
              :key="emp.id"
              class="group flex cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300"
              @click="verFicha(emp)"
            >
              <div class="flex items-start gap-3">
                <AppAvatar :nombre="nombreCompleto(emp)" tamano="md" />
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-gray-900">{{ nombreCompleto(emp) }}</div>
                  <div class="text-xs text-gray-500 tabular-nums">DNI {{ emp.dni }}</div>
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
                  <span :class="altaPendiente(emp) ? 'text-amber-700' : emp.n_cuentas ? 'text-gray-600' : 'text-gray-400'" :title="tituloCuentas(emp)" :aria-label="tituloCuentas(emp)"><i class="ti ti-key" aria-hidden="true"></i> {{ emp.n_cuentas }}</span>
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
  </div>
</template>
