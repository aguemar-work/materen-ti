<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useStaffStore } from '../../stores/staff.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';
import { MODULOS_CONFIGURABLES } from '../../constants/modulos.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import EncabezadoCatalogo from '../configuracion/EncabezadoCatalogo.vue';
import StaffModulosForm from './StaffModulosForm.vue';
import StaffNombreForm from './StaffNombreForm.vue';

const store = useStaffStore();
const authStore = useAuthStore();
const { lista, cargando, error } = storeToRefs(store);
const { esMovil } = useEsMovil();

const ROLES = ['ASISTENTE', 'JEFE'];

const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(lista);
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaOrdenada);

// Puente de orden hacia AppTable (1 asc | -1 desc | null), mismo patrón que
// EmpleadosView — acá el orden es client-side (useOrdenTabla).
const sortFieldTabla = computed(() => columna.value || null);
const sortOrderTabla = computed(() => (columna.value ? (direccion.value === 'desc' ? -1 : 1) : null));

const inactivos = computed(() => lista.value.filter((s) => !s.activo).length);

// ── Módulos otorgados, para mostrarlos como chips en la fila ───────────
// Solo presentación: la misma lectura que ya hace StaffModulosForm al
// abrirse (insforgeApi.modulosDeStaff), hecha por adelantado para que "quién
// puede qué" se lea sin abrir cada modal. JEFE no se consulta: ve todos los
// módulos siempre (auth.puedeVerModulo). Si una lectura falla, la fila dice
// "No disponible" — nunca bloquea el listado.
const modulosPor = ref({});
const LABEL_MODULO = Object.fromEntries(MODULOS_CONFIGURABLES.map((m) => [m.id, m.label]));
const MAX_CHIPS = 3;

// Orden estable: el de MODULOS_CONFIGURABLES (igual que el checklist).
const ordenarModulos = (ids) => MODULOS_CONFIGURABLES.filter((m) => ids.includes(m.id)).map((m) => m.id);

async function cargarModulosDe(userId) {
  try {
    const ids = await insforgeApi.modulosDeStaff(userId);
    modulosPor.value = { ...modulosPor.value, [userId]: ordenarModulos(ids) };
  } catch {
    modulosPor.value = { ...modulosPor.value, [userId]: null };
  }
}

// Una sola consulta para todo el listado (antes, una por integrante).
async function cargarModulos() {
  const asistentes = lista.value.filter((m) => m.rol !== 'JEFE');
  try {
    const porUsuario = await insforgeApi.modulosPorStaff();
    modulosPor.value = Object.fromEntries(asistentes.map((m) => [m.user_id, ordenarModulos(porUsuario[m.user_id] || [])]));
  } catch {
    modulosPor.value = Object.fromEntries(asistentes.map((m) => [m.user_id, null]));
  }
}

function nombresModulos(ids) {
  return ids.map((id) => LABEL_MODULO[id] || id).join(', ');
}

// Fila en curso (controles deshabilitados mientras dura la petición)
const procesandoId = ref(null);

// Desactivar es destructivo. Activar también se confirma: el trigger de alta
// (migración 076) siembra por defecto los 8 módulos y "ver contraseñas", así
// que activar sin mirar da acceso total. El diálogo dice qué va a poder hacer.
const pendienteDesactivar = ref(null);
const desactivando = ref(false);
const dialogoDesactivar = ref(null);
const pendienteActivar = ref(null);
const activando = ref(false);
const dialogoActivar = ref(null);

function toggleActivo(miembro) {
  if (miembro.activo) pendienteDesactivar.value = miembro;
  else pendienteActivar.value = miembro;
}

function resumenPermisos(miembro) {
  if (miembro.rol === 'JEFE') return 'Como JEFE, tendrá acceso a todo el sistema, contraseñas incluidas.';
  const ids = modulosPor.value[miembro.user_id];
  const modulos = ids == null ? 'los módulos que tenga otorgados' : ids.length ? nombresModulos(ids) : 'ningún módulo';
  const pw = miembro.credenciales_ver ? 'Podrá ver contraseñas.' : 'No podrá ver contraseñas.';
  return `Podrá entrar al panel con acceso a: ${modulos}. ${pw} Si no corresponde, ajuste sus módulos o el permiso de contraseñas antes de activarlo.`;
}

async function confirmarActivar() {
  const miembro = pendienteActivar.value;
  if (!miembro) return;
  activando.value = true;
  procesandoId.value = miembro.user_id;
  try {
    await store.actualizar(miembro.user_id, { rol: miembro.rol, activo: true });
    showToast(`${miembro.nombre} activado`);
    dialogoActivar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al activar', 'error');
  } finally {
    activando.value = false;
    procesandoId.value = null;
  }
}

async function confirmarDesactivar() {
  const miembro = pendienteDesactivar.value;
  if (!miembro) return;
  desactivando.value = true;
  procesandoId.value = miembro.user_id;
  try {
    await store.actualizar(miembro.user_id, { rol: miembro.rol, activo: false });
    showToast(`${miembro.nombre} desactivado`);
    dialogoDesactivar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al desactivar', 'error');
  } finally {
    desactivando.value = false;
    procesandoId.value = null;
  }
}

// Módulos visibles por integrante (migración 056). JEFE siempre ve todos
// los módulos (auth.puedeVerModulo), así que este modal solo tiene sentido
// para ASISTENTE — para JEFE la acción queda deshabilitada.
const miembroModulos = ref(null);

function gestionarModulos(miembro) {
  if (miembro.rol === 'JEFE') return;
  miembroModulos.value = miembro;
}

function cerrarModulos() {
  const miembro = miembroModulos.value;
  miembroModulos.value = null;
  // Refresca los chips de esa fila (el modal no avisa si guardó o canceló).
  if (miembro) cargarModulosDe(miembro.user_id);
}

// Edición del nombre para mostrar (migración 061): JEFE puede editar el de
// cualquiera desde acá; la autoedición de cada quien vive en el sidebar
// (AppLayout.vue), mismo componente StaffNombreForm.vue.
const miembroNombre = ref(null);

function editarNombre(miembro) {
  miembroNombre.value = miembro;
}

function cerrarNombre() {
  miembroNombre.value = null;
}

function onNombreGuardado(actualizado) {
  const idx = lista.value.findIndex((s) => s.user_id === actualizado.user_id);
  if (idx !== -1) lista.value[idx] = { ...lista.value[idx], nombre: actualizado.nombre };
}

// Toggle de "credenciales.ver" (migración 060): quién puede revelar/enviar
// contraseñas de Cuentas y Licencias. JEFE lo tiene siempre (el interruptor
// queda deshabilitado para esa fila, mismo criterio que "Módulos visibles").
// Sin ConfirmDialog: el otorgamiento/revocación ya queda auditado en
// accesos_log por su propio trigger — la fricción baja es aceptable.
// Cosmético del lado del cliente: la barrera real es functions/credenciales.ts.
async function toggleCredencialesVer(miembro) {
  if (miembro.rol === 'JEFE' || procesandoId.value) return;
  procesandoId.value = miembro.user_id;
  try {
    await store.setCredencialesVer(miembro.user_id, !miembro.credenciales_ver);
    showToast(miembro.credenciales_ver
      ? `Se revocó a ${miembro.nombre} el acceso a ver contraseñas`
      : `${miembro.nombre} ahora puede ver contraseñas`);
  } catch (e) {
    showToast(e?.message || 'Error al cambiar el permiso', 'error');
  } finally {
    procesandoId.value = null;
  }
}

async function cambiarRol(miembro, nuevoRol) {
  if (miembro.rol === nuevoRol) return;
  procesandoId.value = miembro.user_id;
  try {
    await store.actualizar(miembro.user_id, { rol: nuevoRol, activo: miembro.activo });
    showToast(`Rol de ${miembro.nombre} actualizado a ${nuevoRol}`);
    if (nuevoRol !== 'JEFE') cargarModulosDe(miembro.user_id);
  } catch (e) {
    showToast(e?.message || 'Error al cambiar rol', 'error');
  } finally {
    procesandoId.value = null;
  }
}

function puedeVerContrasenas(miembro) {
  return miembro.rol === 'JEFE' || miembro.credenciales_ver;
}

function tituloCredenciales(miembro) {
  if (miembro.rol === 'JEFE') return 'JEFE siempre puede ver contraseñas';
  return miembro.credenciales_ver ? 'Revocar acceso a ver contraseñas' : 'Otorgar acceso a ver contraseñas';
}

// Acciones por fila en el menú ⋮ (rediseño 2026-09-22: antes eran 4 íconos
// sueltos). El permiso de contraseñas sale del menú a un interruptor propio
// en la fila, para que se lea de un vistazo quién lo tiene.
function accionesDe(miembro) {
  const ocupado = procesandoId.value === miembro.user_id;
  return [
    { icono: 'ti-pencil', label: 'Editar nombre', onClick: () => editarNombre(miembro) },
    {
      icono: 'ti-layout-grid',
      label: miembro.rol === 'JEFE' ? 'Módulos visibles (JEFE ve todos)' : 'Módulos visibles',
      disabled: miembro.rol === 'JEFE',
      onClick: () => gestionarModulos(miembro),
    },
    { separador: true },
    miembro.activo
      ? { icono: 'ti-user-off', label: 'Desactivar', danger: true, disabled: ocupado, onClick: () => toggleActivo(miembro) }
      : { icono: 'ti-user-check', label: 'Activar', disabled: ocupado, onClick: () => toggleActivo(miembro) },
  ];
}

const CLASE_SELECT_ROL =
  'h-8 cursor-pointer appearance-none rounded-md border border-gray-200 bg-white pl-2.5 pr-8 text-sm text-gray-900 ' +
  'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400';

onMounted(async () => {
  try {
    await store.cargar();
    cargarModulos();
  } catch {
    showToast(error.value || 'Error al cargar staff', 'error');
  }
});
</script>

<template>
  <!-- Panel embebido en Configuración (la cabecera de página la pone ConfiguracionView) -->
  <div class="space-y-4">
    <EncabezadoCatalogo
      titulo="Staff"
      :conteo="lista.length"
      descripcion="Quién entra al panel y qué puede hacer. Las cuentas se crean desde InsForge Auth y llegan inactivas hasta que un JEFE las activa."
    />

    <div v-if="error" class="notif notif--danger" role="alert">
      <i class="ti ti-alert-circle" aria-hidden="true"></i>
      <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
    </div>

    <template v-else>
      <div v-if="!cargando && inactivos" class="notif notif--warning" role="status">
        <i class="ti ti-user-exclamation" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">
            {{ inactivos }} {{ inactivos === 1 ? 'miembro inactivo: no puede' : 'miembros inactivos: no pueden' }} entrar al panel.
            Active desde su fila a quien corresponda.
          </p>
        </div>
      </div>

      <AppVacio
        v-if="!cargando && !lista.length"
        icono="ti ti-users"
        titulo="Sin miembros"
        mensaje="Los miembros del staff se crean desde el panel de InsForge Auth."
      />

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando staff…</p>

        <!-- ── Tabla (escritorio) ── -->
        <div v-if="!esMovil" class="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div class="overflow-x-auto">
            <AppTable
              :value="listaPaginada"
              :loading="cargando"
              data-key="user_id"
              :total-records="totalItems"
              :rows="tamPagina"
              :sort-field="sortFieldTabla"
              :sort-order="sortOrderTabla"
              aria-label="Miembros del staff"
              @ordenar="ordenarPor"
            >
              <AppColumn field="nombre" header="Miembro" sortable>
                <template #body="{ data: fila }">
                  <div class="flex min-w-0 items-center gap-3">
                    <AppAvatar :nombre="fila.nombre" />
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="truncate font-medium" :class="fila.activo ? 'text-gray-900' : 'text-gray-500'">{{ fila.nombre }}</span>
                        <span v-if="fila.user_id === authStore.user?.id" class="shrink-0 text-xs text-gray-500">(usted)</span>
                      </div>
                      <div class="text-xs text-gray-500">{{ fila.rol === 'JEFE' ? 'Administra el sistema completo' : 'Opera los módulos otorgados' }}</div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="rol" header="Rol" sortable>
                <template #body="{ data: fila }">
                  <label v-if="authStore.esJefe" class="relative inline-block">
                    <span class="sr-only">Rol de {{ fila.nombre }}</span>
                    <select
                      data-ui
                      :class="CLASE_SELECT_ROL"
                      :value="fila.rol"
                      :disabled="procesandoId === fila.user_id"
                      @change="cambiarRol(fila, $event.target.value)"
                    >
                      <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
                    </select>
                    <i class="ti ti-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
                  </label>
                  <span v-else class="text-sm text-gray-700">{{ fila.rol }}</span>
                </template>
              </AppColumn>

              <AppColumn field="modulos" header="Módulos">
                <template #body="{ data: fila }">
                  <AppTag v-if="fila.rol === 'JEFE'" tono="info" icono="ti ti-layout-grid">Todos los módulos</AppTag>
                  <span v-else-if="modulosPor[fila.user_id] === undefined" class="text-sm text-gray-500">Cargando…</span>
                  <span v-else-if="modulosPor[fila.user_id] === null" class="text-sm text-gray-500">No disponible</span>
                  <span v-else-if="!modulosPor[fila.user_id].length" class="text-sm text-amber-700">Sin módulos</span>
                  <ul
                    v-else
                    class="flex max-w-80 flex-wrap items-center gap-1"
                    :title="nombresModulos(modulosPor[fila.user_id])"
                    :aria-label="`Módulos de ${fila.nombre}: ${nombresModulos(modulosPor[fila.user_id])}`"
                  >
                    <li v-for="id in modulosPor[fila.user_id].slice(0, MAX_CHIPS)" :key="id">
                      <AppTag>{{ LABEL_MODULO[id] || id }}</AppTag>
                    </li>
                    <li v-if="modulosPor[fila.user_id].length > MAX_CHIPS" class="px-1 text-xs font-medium text-gray-500 tabular-nums">
                      +{{ modulosPor[fila.user_id].length - MAX_CHIPS }}
                    </li>
                  </ul>
                </template>
              </AppColumn>

              <AppColumn field="credenciales_ver" header="Contraseñas">
                <template #body="{ data: fila }">
                  <!-- Interruptor cosmético: la barrera real es functions/credenciales.ts -->
                  <button
                    type="button"
                    role="switch"
                    class="group inline-flex items-center gap-2 rounded-md py-1 pr-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed"
                    :aria-checked="puedeVerContrasenas(fila)"
                    :disabled="fila.rol === 'JEFE' || procesandoId === fila.user_id"
                    :title="tituloCredenciales(fila)"
                    :aria-label="`Permiso de ver contraseñas de ${fila.nombre}`"
                    @click="toggleCredencialesVer(fila)"
                  >
                    <span
                      class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150"
                      :class="[
                        puedeVerContrasenas(fila) ? 'bg-primary-500' : 'bg-gray-200',
                        fila.rol === 'JEFE' ? 'opacity-50' : '',
                      ]"
                      aria-hidden="true"
                    >
                      <span
                        class="inline-block h-4 w-4 rounded-full bg-white ring-1 ring-black/5 transition-transform duration-150"
                        :class="puedeVerContrasenas(fila) ? 'translate-x-4.5' : 'translate-x-0.5'"
                      ></span>
                    </span>
                    <span class="whitespace-nowrap" :class="puedeVerContrasenas(fila) ? 'text-gray-900' : 'text-gray-500'">
                      <i v-if="procesandoId === fila.user_id" class="ti ti-loader-2 animate-spin" aria-hidden="true"></i>
                      {{ fila.rol === 'JEFE' ? 'Siempre' : (fila.credenciales_ver ? 'Puede ver' : 'No puede ver') }}
                    </span>
                  </button>
                </template>
              </AppColumn>

              <AppColumn field="activo" header="Estado" sortable>
                <template #body="{ data: fila }">
                  <div class="flex items-center gap-2">
                    <BadgeEstado tipo="activo_staff" :valor="fila.activo" status />
                    <AppButton
                      v-if="!fila.activo"
                      size="sm"
                      variant="outline"
                      severity="secondary"
                      icon="ti ti-user-check"
                      label="Activar"
                      :loading="procesandoId === fila.user_id"
                      :aria-label="`Activar a ${fila.nombre}`"
                      @click="toggleActivo(fila)"
                    />
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
                <template #body="{ data: fila }">
                  <div class="flex justify-end">
                    <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.nombre}`" />
                  </div>
                </template>
              </AppColumn>
            </AppTable>
          </div>

          <AppPaginacion
            v-if="!cargando && totalItems > tamPagina"
            :pagina="paginaActual"
            :tam-pagina="tamPagina"
            :total="totalItems"
            @update:pagina="paginaActual = $event"
            @update:tam-pagina="cambiarTamPagina"
          />
        </div>

        <!-- ── Tarjetas (móvil) ── -->
        <div v-else>
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando staff...</p>
          <ul v-else class="grid gap-3 sm:grid-cols-2" aria-label="Miembros del staff">
            <li v-for="fila in listaPaginada" :key="fila.user_id" class="flex flex-col rounded-lg border border-gray-200 bg-white p-4">
              <div class="flex items-start gap-3">
                <AppAvatar :nombre="fila.nombre" tamano="md" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="truncate font-medium" :class="fila.activo ? 'text-gray-900' : 'text-gray-500'">{{ fila.nombre }}</span>
                    <span v-if="fila.user_id === authStore.user?.id" class="shrink-0 text-xs text-gray-500">(usted)</span>
                  </div>
                  <div class="mt-1"><BadgeEstado tipo="activo_staff" :valor="fila.activo" status /></div>
                </div>
                <div class="-mr-1 -mt-1">
                  <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.nombre}`" />
                </div>
              </div>

              <dl class="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-sm">
                <dt class="text-xs text-gray-500">Rol</dt>
                <dd>
                  <label v-if="authStore.esJefe" class="relative inline-block">
                    <span class="sr-only">Rol de {{ fila.nombre }}</span>
                    <select
                      data-ui
                      :class="CLASE_SELECT_ROL"
                      :value="fila.rol"
                      :disabled="procesandoId === fila.user_id"
                      @change="cambiarRol(fila, $event.target.value)"
                    >
                      <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
                    </select>
                    <i class="ti ti-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
                  </label>
                  <span v-else class="text-gray-700">{{ fila.rol }}</span>
                </dd>

                <dt class="text-xs text-gray-500">Módulos</dt>
                <dd class="min-w-0">
                  <AppTag v-if="fila.rol === 'JEFE'" tono="info" icono="ti ti-layout-grid">Todos los módulos</AppTag>
                  <span v-else-if="modulosPor[fila.user_id] === undefined" class="text-gray-500">Cargando…</span>
                  <span v-else-if="modulosPor[fila.user_id] === null" class="text-gray-500">No disponible</span>
                  <span v-else-if="!modulosPor[fila.user_id].length" class="text-amber-700">Sin módulos</span>
                  <ul v-else class="flex flex-wrap gap-1" :aria-label="`Módulos de ${fila.nombre}`">
                    <li v-for="id in modulosPor[fila.user_id]" :key="id"><AppTag>{{ LABEL_MODULO[id] || id }}</AppTag></li>
                  </ul>
                </dd>

                <dt class="text-xs text-gray-500">Contraseñas</dt>
                <dd>
                  <button
                    type="button"
                    role="switch"
                    class="inline-flex items-center gap-2 rounded-md py-1 pr-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed"
                    :aria-checked="puedeVerContrasenas(fila)"
                    :disabled="fila.rol === 'JEFE' || procesandoId === fila.user_id"
                    :title="tituloCredenciales(fila)"
                    :aria-label="`Permiso de ver contraseñas de ${fila.nombre}`"
                    @click="toggleCredencialesVer(fila)"
                  >
                    <span
                      class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150"
                      :class="[puedeVerContrasenas(fila) ? 'bg-primary-500' : 'bg-gray-200', fila.rol === 'JEFE' ? 'opacity-50' : '']"
                      aria-hidden="true"
                    >
                      <span
                        class="inline-block h-4 w-4 rounded-full bg-white ring-1 ring-black/5 transition-transform duration-150"
                        :class="puedeVerContrasenas(fila) ? 'translate-x-4.5' : 'translate-x-0.5'"
                      ></span>
                    </span>
                    <span :class="puedeVerContrasenas(fila) ? 'text-gray-900' : 'text-gray-500'">
                      {{ fila.rol === 'JEFE' ? 'Siempre' : (fila.credenciales_ver ? 'Puede ver' : 'No puede ver') }}
                    </span>
                  </button>
                </dd>
              </dl>

              <div v-if="!fila.activo" class="mt-3 border-t border-gray-100 pt-3">
                <AppButton
                  size="sm"
                  variant="outline"
                  severity="secondary"
                  icon="ti ti-user-check"
                  label="Activar"
                  :loading="procesandoId === fila.user_id"
                  :aria-label="`Activar a ${fila.nombre}`"
                  @click="toggleActivo(fila)"
                />
              </div>
            </li>
          </ul>
          <AppPaginacion
            v-if="!cargando"
            variante="compacta"
            :pagina="paginaActual"
            :tam-pagina="tamPagina"
            :total="totalItems"
            @update:pagina="paginaActual = $event"
          />
        </div>
      </template>
    </template>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="pendienteDesactivar"
      ref="dialogoDesactivar"
      destructivo
      icono="ti-user-off"
      titulo="Desactivar miembro"
      :mensaje="`¿Desactivar a ${pendienteDesactivar.nombre}? No podrá entrar al panel hasta que se lo vuelva a activar.`"
      confirmar-label="Desactivar"
      :cargando="desactivando"
      @cerrado="pendienteDesactivar = null"
      @confirm="confirmarDesactivar"
    />

    <ConfirmDialog
      v-if="pendienteActivar"
      ref="dialogoActivar"
      icono="ti-user-check"
      :titulo="`Activar a ${pendienteActivar.nombre}`"
      :mensaje="resumenPermisos(pendienteActivar)"
      confirmar-label="Activar"
      :cargando="activando"
      @cerrado="pendienteActivar = null"
      @confirm="confirmarActivar"
    />

    <StaffModulosForm
      v-if="miembroModulos"
      :miembro="miembroModulos"
      @cerrar="cerrarModulos"
    />

    <StaffNombreForm
      v-if="miembroNombre"
      :miembro="miembroNombre"
      @cerrar="cerrarNombre"
      @guardado="onNombreGuardado"
    />
  </div>
</template>
