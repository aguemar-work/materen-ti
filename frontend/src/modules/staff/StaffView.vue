<script setup>
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useStaffStore } from '../../stores/staff.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import Pagination from '../../components/shared/Pagination.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';

const store = useStaffStore();
const authStore = useAuthStore();
const { lista, cargando, error } = storeToRefs(store);

const ROLES = ['ASISTENTE', 'JEFE'];

const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(lista);
const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(listaOrdenada);

// Fila en curso (icon-btn/select deshabilitados mientras dura la petición,
// mismo patrón que `migrandoId` en PersonalRegistrosView.vue)
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

        <div v-if="cargando" class="no-results solo-movil">Cargando staff...</div>
        <div v-else-if="error" class="no-results staff-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && lista.length === 0"
          icono="ti ti-users"
          titulo="Sin miembros"
          mensaje="Los miembros del staff se crean desde el panel de InsForge Auth."
        />

        <template v-if="!error && (cargando || lista.length > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando staff…</p>
        <div class="table-wrap solo-escritorio">
          <table aria-label="Miembros del staff">
            <thead>
              <tr>
                <ThOrdenable clave="nombre" :columna="columna" :direccion="direccion" @ordenar="ordenarPor">Nombre</ThOrdenable>
                <ThOrdenable clave="rol" :columna="columna" :direccion="direccion" @ordenar="ordenarPor">Rol</ThOrdenable>
                <ThOrdenable clave="activo" :columna="columna" :direccion="direccion" @ordenar="ordenarPor">Estado</ThOrdenable>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="4" />
              <template v-else>
              <tr v-for="miembro in listaPaginada" :key="miembro.user_id">
                <td>
                  <div class="user-name">{{ miembro.nombre }}</div>
                </td>
                <td>
                  <select
                    v-if="authStore.esJefe"
                    class="rol-select"
                    :value="miembro.rol"
                    :disabled="procesandoId === miembro.user_id"
                    @change="cambiarRol(miembro, $event.target.value)"
                  >
                    <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
                  </select>
                  <span
                    v-else
                    class="badge badge-rol"
                    :class="miembro.rol === 'JEFE' ? 'badge--purple' : 'badge--info'"
                  >
                    {{ miembro.rol }}
                  </span>
                </td>
                <td>
                  <BadgeEstado tipo="activo_staff" :valor="miembro.activo" status />
                </td>
                <td>
                  <div class="actions">
                    <button
                      class="icon-btn"
                      :class="miembro.activo ? 'danger' : ''"
                      type="button"
                      :disabled="procesandoId === miembro.user_id"
                      :title="miembro.activo ? 'Desactivar' : 'Activar'"
                      :aria-label="miembro.activo ? 'Desactivar' : 'Activar'"
                      @click="toggleActivo(miembro)"
                    >
                      <i :class="procesandoId === miembro.user_id ? 'ti ti-loader-2 spinner-icon' : (miembro.activo ? 'ti ti-user-off' : 'ti ti-user-check')"></i>
                    </button>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Render móvil: misma lista paginada, como tarjetas apiladas -->
        <ul v-if="!cargando" class="lista-tarjetas solo-movil" aria-label="Miembros del staff">
          <li v-for="miembro in listaPaginada" :key="miembro.user_id" class="tarjeta-fila">
            <div class="tarjeta-fila__principal user-name">{{ miembro.nombre }}</div>
            <div class="tarjeta-fila__badges">
              <span
                v-if="!authStore.esJefe"
                class="badge badge-rol"
                :class="miembro.rol === 'JEFE' ? 'badge--purple' : 'badge--info'"
              >
                {{ miembro.rol }}
              </span>
              <BadgeEstado tipo="activo_staff" :valor="miembro.activo" status />
            </div>
            <div class="tarjeta-fila__pie">
              <select
                v-if="authStore.esJefe"
                class="rol-select"
                :value="miembro.rol"
                :disabled="procesandoId === miembro.user_id"
                @change="cambiarRol(miembro, $event.target.value)"
              >
                <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
              </select>
              <button
                class="icon-btn"
                :class="miembro.activo ? 'danger' : ''"
                type="button"
                :disabled="procesandoId === miembro.user_id"
                :title="miembro.activo ? 'Desactivar' : 'Activar'"
                :aria-label="miembro.activo ? 'Desactivar' : 'Activar'"
                @click="toggleActivo(miembro)"
              >
                <i :class="procesandoId === miembro.user_id ? 'ti ti-loader-2 spinner-icon' : (miembro.activo ? 'ti ti-user-off' : 'ti ti-user-check')"></i>
              </button>
            </div>
          </li>
        </ul>

        <Pagination v-if="!cargando" v-model="paginaActual" :total-items="totalItems" :page-size="tamPagina" />
        </template>
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
  </div>
</template>

<style scoped>
.staff-error {
  color: var(--color-danger);
}

/* Estructura y color vienen del sistema de badges global (.badge + .badge--X);
   aquí solo el tratamiento único de este chip: versalitas para el rol. */
.badge-rol {
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Solo se renderiza (v-if) para JEFE; para el resto se muestra el badge. */
.rol-select {
  display: inline-block;
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-surface, #fff);
  cursor: pointer;
  margin-right: 6px;
}

.rol-select:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
</style>
