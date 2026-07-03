<script setup>
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useStaffStore } from '../../stores/staff.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';

const store = useStaffStore();
const authStore = useAuthStore();
const { lista, cargando, error } = storeToRefs(store);

const ROLES = ['ASISTENTE', 'JEFE'];

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
  <div class="staff-page">
    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <div class="brand-icon">
            <i class="ti ti-shield-lock" aria-hidden="true"></i>
          </div>
          <div class="brand-text">
            <h1>Sistema TI</h1>
            <span>Módulo: Staff</span>
          </div>
        </div>
      </div>
    </header>

    <main class="page">
      <div class="card">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Miembros del staff
            <span class="badge-count">{{ lista.length }} miembros</span>
          </div>
        </div>

        <div v-if="cargando" class="no-results">Cargando staff...</div>

        <div v-else-if="error" class="no-results staff-error">{{ error }}</div>

        <div v-else-if="lista.length === 0" class="empty">
          <div class="empty-icon"><i class="ti ti-users"></i></div>
          <h3>Sin miembros</h3>
          <p>Los miembros del staff se crean desde el panel de InsForge Auth.</p>
        </div>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="miembro in lista" :key="miembro.user_id">
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
                    class="badge-rol"
                    :class="miembro.rol === 'JEFE' ? 'rol-jefe' : 'rol-asistente'"
                  >
                    {{ miembro.rol }}
                  </span>
                </td>
                <td>
                  <span class="status" :class="miembro.activo ? 's-activo' : 's-inactivo'">
                    {{ miembro.activo ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td>
                  <div class="actions">
                    <button
                      class="icon-btn"
                      :class="miembro.activo ? 'danger' : ''"
                      type="button"
                      :title="miembro.activo ? 'Desactivar' : 'Activar'"
                      @click="toggleActivo(miembro)"
                    >
                      <i :class="miembro.activo ? 'ti ti-user-off' : 'ti ti-user-check'"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.staff-error {
  color: var(--color-danger);
}

.badge-rol {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.rol-jefe {
  background: #ede9fe;
  color: #6d28d9;
}

.rol-asistente {
  background: #dbeafe;
  color: #1d4ed8;
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
