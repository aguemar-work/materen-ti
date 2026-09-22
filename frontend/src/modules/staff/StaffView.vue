<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useStaffStore } from '../../stores/staff.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import { columnasVisibles, estiloColumna, agruparParaTarjeta } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import StaffModulosForm from './StaffModulosForm.vue';
import StaffNombreForm from './StaffNombreForm.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = useStaffStore();
const authStore = useAuthStore();
const { lista, cargando, error } = storeToRefs(store);

const ROLES = ['ASISTENTE', 'JEFE'];

const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(lista);
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaOrdenada);

// Definición de columnas de CarbonDataTable: densidad `lg` (ver template) por
// la cantidad de controles por fila (select de rol + 4 botones de acción).
// "Nombre" es la elástica; "Rol" cae al pie de la tarjeta junto a las
// acciones porque ahí es donde vivía el <select> del JEFE, y "Estado" sube a
// la cabecera de la tarjeta (mismo lugar que ocupaba el badge de Rol/Estado).
const columnas = [
  { clave: 'nombre', label: 'Nombre', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'rol', label: 'Rol', ordenable: true, movil: 'pie' },
  { clave: 'activo', label: 'Estado', ordenable: true, movil: 'cab' },
  { clave: 'acciones', label: 'Acciones', ancho: '176px', movil: 'pie' },
];

const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);
const enTarjeta = computed(() => agruparParaTarjeta(columnasVisiblesLista.value));

const totalPaginas = computed(() => totalPaginasDe(totalItems.value, tamPagina.value));
const paginas = computed(() => paginasDe(totalPaginas.value));
const rango = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value));

function irA(pagina) {
  const destino = clampPagina(pagina, totalPaginas.value);
  if (destino !== paginaActual.value) paginaActual.value = destino;
}

// Fila en curso (icon-btn/select deshabilitados mientras dura la petición)
const procesandoId = ref(null);

// Confirmación (ConfirmDialog compartido): solo desactivar es destructiva;
// activar no necesita confirmación.
const pendienteDesactivar = ref(null);
const desactivando = ref(false);
const dialogoDesactivar = ref(null);

function toggleActivo(miembro) {
  if (miembro.activo) {
    pendienteDesactivar.value = miembro;
    return;
  }
  activar(miembro);
}

async function activar(miembro) {
  procesandoId.value = miembro.user_id;
  try {
    await store.actualizar(miembro.user_id, { rol: miembro.rol, activo: true });
    showToast(`${miembro.nombre} activado`);
  } catch (e) {
    showToast(e?.message || 'Error al activar', 'error');
  } finally {
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
// para ASISTENTE — para JEFE el botón queda deshabilitado.
const miembroModulos = ref(null);

function gestionarModulos(miembro) {
  if (miembro.rol === 'JEFE') return;
  miembroModulos.value = miembro;
}

function cerrarModulos() {
  miembroModulos.value = null;
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
// contraseñas de Cuentas y Licencias. JEFE lo tiene siempre (el botón queda
// deshabilitado para esa fila, mismo criterio que "Módulos visibles"). Sin
// ConfirmDialog: el otorgamiento/revocación ya queda auditado en
// accesos_log por su propio trigger — la fricción baja es aceptable.
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
  } catch (e) {
    showToast(e?.message || 'Error al cambiar rol', 'error');
  } finally {
    procesandoId.value = null;
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar staff', 'error');
  }
});
</script>

<template>
  <!-- Panel embebido en Configuración (la cabecera la pone ConfiguracionView) -->
  <div class="staff-page vista-modulo">
    <main class="page">
      <div class="card card--fill">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Miembros del staff
            <span class="badge-count">{{ lista.length }} miembros</span>
          </div>
        </div>

        <div v-if="error" class="no-results staff-error">{{ error }}</div>

        <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando staff…</p>

        <div class="table-wrap">
          <table class="tabla" aria-label="Miembros del staff">
            <thead>
              <tr>
                <template v-for="col in columnasVisiblesLista" :key="col.clave">
                  <ThOrdenable
                    v-if="col.ordenable"
                    :clave="col.clave"
                    :columna="columna"
                    :direccion="direccion"
                    :class="{ 'col-num': col.num }"
                    :style="estiloColumna(col)"
                    @ordenar="ordenarPor(col.clave)"
                  >{{ col.label }}</ThOrdenable>
                  <th v-else scope="col" :class="{ 'col-num': col.num }" :style="estiloColumna(col)">{{ col.label }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
              <tr v-else-if="!listaPaginada.length">
                <td :colspan="totalColumnas" class="tabla__vacio">
                  <EmptyState
                    icono="ti ti-users"
                    titulo="Sin miembros"
                    mensaje="Los miembros del staff se crean desde el panel de InsForge Auth."
                  />
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in listaPaginada" :key="fila.user_id">
                  <td>
                    <div class="user-name">{{ fila.nombre }}</div>
                  </td>
                  <td>
                    <select
                      v-if="authStore.esJefe"
                      class="rol-select"
                      :value="fila.rol"
                      :disabled="procesandoId === fila.user_id"
                      @change="cambiarRol(fila, $event.target.value)"
                    >
                      <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
                    </select>
                    <!-- Texto, no badge (pasada de diseño de tablas ago 2026): para
                         quien no es JEFE, Rol y Estado competían como 2 píldoras de
                         color en la misma fila. Rol es clasificación fija (solo 2
                         valores), no un estado — mismo criterio que bajó
                         Categoría/Tipo a texto en Tickets/Correos/Ubicaciones. -->
                    <span v-else class="rol-texto">{{ fila.rol }}</span>
                  </td>
                  <td>
                    <BadgeEstado tipo="activo_staff" :valor="fila.activo" status />
                  </td>
                  <td>
                    <div class="actions">
                      <button
                        class="icon-btn fila-accion"
                        type="button"
                        title="Editar nombre"
                        :aria-label="`Editar nombre de ${fila.nombre}`"
                        @click="editarNombre(fila)"
                      >
                        <i class="ti ti-pencil" aria-hidden="true"></i>
                      </button>
                      <button
                        class="icon-btn fila-accion"
                        type="button"
                        :disabled="fila.rol === 'JEFE'"
                        :title="fila.rol === 'JEFE' ? 'JEFE ve todos los módulos' : 'Módulos visibles'"
                        :aria-label="`Módulos visibles de ${fila.nombre}`"
                        @click="gestionarModulos(fila)"
                      >
                        <i class="ti ti-layout-grid" aria-hidden="true"></i>
                      </button>
                      <button
                        class="icon-btn fila-accion"
                        type="button"
                        :disabled="fila.rol === 'JEFE' || procesandoId === fila.user_id"
                        :title="fila.rol === 'JEFE' ? 'JEFE siempre puede ver contraseñas' : (fila.credenciales_ver ? 'Revocar acceso a ver contraseñas' : 'Otorgar acceso a ver contraseñas')"
                        :aria-label="`Permiso de ver contraseñas de ${fila.nombre}`"
                        :aria-pressed="fila.rol === 'JEFE' || fila.credenciales_ver"
                        @click="toggleCredencialesVer(fila)"
                      >
                        <i :class="procesandoId === fila.user_id ? 'ti ti-loader-2 spinner-icon' : (fila.rol === 'JEFE' || fila.credenciales_ver ? 'ti ti-key' : 'ti ti-key-off')" aria-hidden="true"></i>
                      </button>
                      <button
                        class="icon-btn fila-accion"
                        :class="fila.activo ? 'danger' : ''"
                        type="button"
                        :disabled="procesandoId === fila.user_id"
                        :title="fila.activo ? 'Desactivar' : 'Activar'"
                        :aria-label="fila.activo ? 'Desactivar' : 'Activar'"
                        @click="toggleActivo(fila)"
                      >
                        <i :class="procesandoId === fila.user_id ? 'ti ti-loader-2 spinner-icon' : (fila.activo ? 'ti ti-user-off' : 'ti ti-user-check')"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul v-if="!cargando && listaPaginada.length" class="lista-tarjetas solo-movil" aria-label="Miembros del staff">
          <li v-for="fila in listaPaginada" :key="fila.user_id" class="tarjeta-fila">
            <div v-if="enTarjeta.cab.length" class="tarjeta-fila__cab">
              <BadgeEstado tipo="activo_staff" :valor="fila.activo" status />
            </div>
            <div class="tarjeta-fila__principal">{{ fila.nombre }}</div>
            <div class="tarjeta-fila__pie">
              <select
                v-if="authStore.esJefe"
                class="rol-select"
                :value="fila.rol"
                :disabled="procesandoId === fila.user_id"
                @change="cambiarRol(fila, $event.target.value)"
              >
                <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
              </select>
              <span v-else class="rol-texto">{{ fila.rol }}</span>
              <div class="actions">
                <button
                  class="icon-btn fila-accion"
                  type="button"
                  title="Editar nombre"
                  :aria-label="`Editar nombre de ${fila.nombre}`"
                  @click="editarNombre(fila)"
                >
                  <i class="ti ti-pencil" aria-hidden="true"></i>
                </button>
                <button
                  class="icon-btn fila-accion"
                  type="button"
                  :disabled="fila.rol === 'JEFE'"
                  :title="fila.rol === 'JEFE' ? 'JEFE ve todos los módulos' : 'Módulos visibles'"
                  :aria-label="`Módulos visibles de ${fila.nombre}`"
                  @click="gestionarModulos(fila)"
                >
                  <i class="ti ti-layout-grid" aria-hidden="true"></i>
                </button>
                <button
                  class="icon-btn fila-accion"
                  type="button"
                  :disabled="fila.rol === 'JEFE' || procesandoId === fila.user_id"
                  :title="fila.rol === 'JEFE' ? 'JEFE siempre puede ver contraseñas' : (fila.credenciales_ver ? 'Revocar acceso a ver contraseñas' : 'Otorgar acceso a ver contraseñas')"
                  :aria-label="`Permiso de ver contraseñas de ${fila.nombre}`"
                  :aria-pressed="fila.rol === 'JEFE' || fila.credenciales_ver"
                  @click="toggleCredencialesVer(fila)"
                >
                  <i :class="procesandoId === fila.user_id ? 'ti ti-loader-2 spinner-icon' : (fila.rol === 'JEFE' || fila.credenciales_ver ? 'ti ti-key' : 'ti ti-key-off')" aria-hidden="true"></i>
                </button>
                <button
                  class="icon-btn fila-accion"
                  :class="fila.activo ? 'danger' : ''"
                  type="button"
                  :disabled="procesandoId === fila.user_id"
                  :title="fila.activo ? 'Desactivar' : 'Activar'"
                  :aria-label="fila.activo ? 'Desactivar' : 'Activar'"
                  @click="toggleActivo(fila)"
                >
                  <i :class="procesandoId === fila.user_id ? 'ti ti-loader-2 spinner-icon' : (fila.activo ? 'ti ti-user-off' : 'ti ti-user-check')"></i>
                </button>
              </div>
            </div>
          </li>
        </ul>
        </template>

        <nav v-if="!cargando && totalItems > 0" class="paginacion" aria-label="Paginación">
          <div class="paginacion__lado">
            <label class="paginacion__campo">
              <span>Filas por página:</span>
              <select
                class="paginacion__select"
                :value="tamPagina"
                @change="cambiarTamPagina(Number($event.target.value))"
              >
                <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <span class="paginacion__rango">{{ rango.desde }}–{{ rango.hasta }} de {{ totalItems }} staff</span>
          </div>

          <div v-if="totalPaginas > 1" class="paginacion__lado">
            <label class="paginacion__campo">
              <span class="sr-only">Ir a la página</span>
              <select class="paginacion__select" :value="paginaActual" @change="irA(Number($event.target.value))">
                <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
              </select>
              <span>de {{ totalPaginas }}</span>
            </label>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual <= 1" aria-label="Página anterior" @click="irA(paginaActual - 1)">
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual >= totalPaginas" aria-label="Página siguiente" @click="irA(paginaActual + 1)">
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
      </div>
    </main>

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="pendienteDesactivar"
      ref="dialogoDesactivar"
      destructivo
      icono="ti-user-off"
      titulo="Desactivar miembro"
      :mensaje="`¿Desactivar a ${pendienteDesactivar.nombre}?`"
      confirmar-label="Desactivar"
      :cargando="desactivando"
      @cancel="pendienteDesactivar = null"
      @confirm="confirmarDesactivar"
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


