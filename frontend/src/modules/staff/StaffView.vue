<script setup>
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useStaffStore } from '../../stores/staff.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import Pagination from '../../components/shared/Pagination.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';

const store = useStaffStore();
const authStore = useAuthStore();
const { lista, cargando, error } = storeToRefs(store);

const ROLES = ['ASISTENTE', 'JEFE'];

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(lista);

async function toggleActivo(miembro) {
  const accion = miembro.activo ? 'desactivar' : 'activar';
  if (miembro.activo && !confirm(`¿Desactivar a ${miembro.nombre}?`)) return;
  try {
    await store.actualizar(miembro.user_id, { rol: miembro.rol, activo: !miembro.activo });
    showToast(`${miembro.nombre} ${miembro.activo ? 'desactivado' : 'activado'}`);
  } catch (e) {
    showToast(e?.message || `Error al ${accion}`, 'error');
  }
}

async function cambiarRol(miembro, nuevoRol) {
  if (miembro.rol === nuevoRol) return;
  try {
    await store.actualizar(miembro.user_id, { rol: nuevoRol, activo: miembro.activo });
    showToast(`Rol de ${miembro.nombre} actualizado a ${nuevoRol}`);
  } catch (e) {
    showToast(e?.message || 'Error al cambiar rol', 'error');
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

        <div v-if="cargando" class="no-results">Cargando staff...</div>

        <div v-else-if="error" class="no-results staff-error">{{ error }}</div>

        <EmptyState
          v-else-if="lista.length === 0"
          icono="ti ti-users"
          titulo="Sin miembros"
          mensaje="Los miembros del staff se crean desde el panel de InsForge Auth."
        />

        <div v-else class="table-wrap">
          <table aria-label="Miembros del staff">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="miembro in listaPaginada" :key="miembro.user_id">
                <td>
                  <div class="user-name">{{ miembro.nombre }}</div>
                </td>
                <td>
                  <select
                    class="rol-select"
                    :value="miembro.rol"
                    :disabled="!authStore.esJefe"
                    @change="cambiarRol(miembro, $event.target.value)"
                  >
                    <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
                  </select>
                  <span
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
                      :title="miembro.activo ? 'Desactivar' : 'Activar'"
                      :aria-label="miembro.activo ? 'Desactivar' : 'Activar'"
                      @click="toggleActivo(miembro)"
                    >
                      <i :class="miembro.activo ? 'ti ti-user-off' : 'ti ti-user-check'"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <Pagination v-model="paginaActual" :total-items="totalItems" :page-size="tamPagina" />
        </div>
      </div>
    </main>
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

/* El select solo se muestra para JEFE, el badge siempre */
.rol-select {
  display: none;
}

/* Cuando el JEFE puede editar, mostramos select y ocultamos badge */
.rol-select:not(:disabled) {
  display: inline-block;
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-surface, #fff);
  cursor: pointer;
  margin-right: 6px;
}

.rol-select:not(:disabled) + .badge-rol {
  display: none;
}
</style>
