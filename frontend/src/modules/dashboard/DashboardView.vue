<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';

const stats = ref(null);
const recientes = ref([]);
const pendientes = ref({
  porRotar: [], sinPassword: [], licenciasPorVencer: [],
  equiposSinDevolver: [], garantiasPorVencer: [],
});
const cargando = ref(true);

const hayPendientes = computed(
  () =>
    pendientes.value.porRotar.length > 0 ||
    pendientes.value.sinPassword.length > 0 ||
    pendientes.value.licenciasPorVencer.length > 0 ||
    pendientes.value.equiposSinDevolver.length > 0 ||
    pendientes.value.garantiasPorVencer.length > 0
);

function claseEstado(estado) {
  if (estado === 'Activo') return 's-activo';
  if (estado === 'Suspendido') return 's-suspendido';
  return 's-inactivo';
}

// A dónde lleva cada pendiente: cuentas personales → ficha del titular;
// reutilizables/compartidas → módulo de correos
function destinoPendiente(item) {
  if (item.tipo_cuenta === 'personal' && item.titulares.length) {
    return `/empleados/${item.titulares[0].id}`;
  }
  return '/correos';
}

function contextoPendiente(item) {
  if (item.titulares.length) return `Asignada a ${item.titulares.map((t) => t.nombre).join(', ')}`;
  if (item.tipo_cuenta === 'reutilizable') return 'Libre — rotar antes de reasignar';
  return 'Sin titular activo';
}

onMounted(async () => {
  try {
    const [est, emp, pend] = await Promise.all([
      insforgeApi.getEstadisticas(),
      insforgeApi.listEmpleadosRecientes(6),
      insforgeApi.listPendientes(),
    ]);
    stats.value = est;
    recientes.value = emp;
    pendientes.value = pend;
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <div class="page">
    <div class="site-header">
      <div class="header-content">
        <div class="header-title">
          <h1><i class="ti ti-layout-dashboard" aria-hidden="true"></i> Dashboard</h1>
          <p class="header-subtitle">Resumen del inventario de accesos.</p>
        </div>
      </div>
    </div>

    <div class="page-body">
      <div v-if="cargando" class="no-results">Cargando...</div>

      <template v-else>
        <!-- Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon stat-icon--blue"><i class="ti ti-users"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.empleadosActivos }}</span>
              <span class="stat-label">Empleados activos</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon stat-icon--gray"><i class="ti ti-users-minus"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.empleadosTotal - stats.empleadosActivos }}</span>
              <span class="stat-label">Dados de baja</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon stat-icon--indigo"><i class="ti ti-key"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.cuentasAsignadas }}</span>
              <span class="stat-label">Cuentas asignadas</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon stat-icon--teal"><i class="ti ti-mail-share"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.correosCompartidos }}</span>
              <span class="stat-label">Correos compartidos</span>
            </div>
          </div>
          <div class="stat-card" :class="{ 'stat-card--alerta': stats.cuentasPorRotar > 0 }">
            <div class="stat-icon stat-icon--amber"><i class="ti ti-key-off"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.cuentasPorRotar }}</span>
              <span class="stat-label">Contraseñas por rotar</span>
            </div>
          </div>
        </div>

        <!-- Pendientes accionables -->
        <div class="section">
          <h2 class="section-title">Pendientes</h2>

          <div v-if="!hayPendientes" class="todo-ok">
            <i class="ti ti-circle-check-filled"></i> Todo al día: sin contraseñas por rotar, licencias por vencer ni equipos sin devolver.
          </div>

          <div v-else class="pendientes-grid">
            <div v-if="pendientes.equiposSinDevolver.length" class="pend-card">
              <div class="pend-header pend-header--equipos">
                <i class="ti ti-devices-off"></i>
                Equipos sin devolver (bajas)
                <span class="pend-count">{{ pendientes.equiposSinDevolver.length }}</span>
              </div>
              <RouterLink
                v-for="item in pendientes.equiposSinDevolver"
                :key="item.asignacion_id"
                class="pend-item"
                to="/equipos"
              >
                <div class="pend-item-main">
                  <span class="pend-usuario">{{ item.codigo }} — {{ item.equipo }}</span>
                  <span class="pend-contexto">Lo tiene {{ item.empleado }} (dado de baja)</span>
                </div>
                <i class="ti ti-chevron-right"></i>
              </RouterLink>
            </div>

            <div v-if="pendientes.porRotar.length" class="pend-card">
              <div class="pend-header pend-header--rotar">
                <i class="ti ti-alert-triangle"></i>
                Contraseñas por rotar
                <span class="pend-count">{{ pendientes.porRotar.length }}</span>
              </div>
              <RouterLink
                v-for="item in pendientes.porRotar"
                :key="item.cuenta_id"
                class="pend-item"
                :to="destinoPendiente(item)"
              >
                <div class="pend-item-main">
                  <span class="pend-usuario">{{ item.usuario }}</span>
                  <span class="pend-contexto">{{ item.plataforma }} · {{ contextoPendiente(item) }}</span>
                </div>
                <i class="ti ti-chevron-right"></i>
              </RouterLink>
            </div>

            <div v-if="pendientes.sinPassword.length" class="pend-card">
              <div class="pend-header pend-header--sinpw">
                <i class="ti ti-key-off"></i>
                Cuentas sin contraseña
                <span class="pend-count">{{ pendientes.sinPassword.length }}</span>
              </div>
              <RouterLink
                v-for="item in pendientes.sinPassword"
                :key="item.cuenta_id"
                class="pend-item"
                :to="destinoPendiente(item)"
              >
                <div class="pend-item-main">
                  <span class="pend-usuario">{{ item.usuario }}</span>
                  <span class="pend-contexto">{{ item.plataforma }} · {{ contextoPendiente(item) }}</span>
                </div>
                <i class="ti ti-chevron-right"></i>
              </RouterLink>
            </div>

            <div v-if="pendientes.licenciasPorVencer.length" class="pend-card">
              <div class="pend-header pend-header--lic">
                <i class="ti ti-license"></i>
                Licencias por vencer
                <span class="pend-count">{{ pendientes.licenciasPorVencer.length }}</span>
              </div>
              <RouterLink
                v-for="item in pendientes.licenciasPorVencer"
                :key="item.licencia_id"
                class="pend-item"
                to="/licencias"
              >
                <div class="pend-item-main">
                  <span class="pend-usuario">{{ item.software }}</span>
                  <span class="pend-contexto">
                    {{ item.vencida ? 'VENCIDA el' : 'Vence el' }} {{ item.fecha_vencimiento }}
                    {{ item.empresa ? `· ${item.empresa}` : '' }}
                  </span>
                </div>
                <i class="ti ti-chevron-right"></i>
              </RouterLink>
            </div>

            <div v-if="pendientes.garantiasPorVencer.length" class="pend-card">
              <div class="pend-header pend-header--garantia">
                <i class="ti ti-shield-check"></i>
                Garantías por vencer
                <span class="pend-count">{{ pendientes.garantiasPorVencer.length }}</span>
              </div>
              <RouterLink
                v-for="item in pendientes.garantiasPorVencer"
                :key="item.equipo_id"
                class="pend-item"
                to="/equipos"
              >
                <div class="pend-item-main">
                  <span class="pend-usuario">{{ item.codigo }} — {{ item.equipo }}</span>
                  <span class="pend-contexto">{{ item.vencida ? 'Venció el' : 'Vence el' }} {{ item.garantia_hasta }}</span>
                </div>
                <i class="ti ti-chevron-right"></i>
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Últimos empleados -->
        <div class="section">
          <h2 class="section-title">Últimos empleados registrados</h2>
          <div v-if="recientes.length === 0" class="no-results">Sin empleados aún.</div>
          <div v-else class="recientes-grid">
            <div v-for="emp in recientes" :key="emp.id" class="emp-card">
              <div class="emp-avatar">{{ emp.nombres[0] }}{{ emp.apellidos[0] }}</div>
              <div class="emp-info">
                <span class="emp-nombre">{{ emp.nombres }} {{ emp.apellidos }}</span>
                <span class="emp-cargo">{{ emp.cargo || emp.empresa_nombre || '—' }}</span>
              </div>
              <span class="status" :class="claseEstado(emp.estado)">{{ emp.estado }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; height: 100%; }

.site-header {
  position: sticky; top: 0; z-index: 50;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.header-content {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 16px 24px;
}

.header-title h1 {
  font-size: 18px; font-weight: 700;
  color: var(--color-text-primary);
  margin: 0; display: flex; align-items: center; gap: 8px;
}

.header-subtitle { margin: 2px 0 0; font-size: 13px; color: var(--color-text-secondary); }

.page-body { flex: 1; padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 28px; }

.no-results { text-align: center; padding: 40px; color: var(--color-text-secondary); }

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.stat-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm);
}

.stat-icon {
  width: 44px; height: 44px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; flex-shrink: 0;
}

.stat-icon--blue   { background: #dbeafe; color: #1d4ed8; }
.stat-icon--gray   { background: #f1f5f9; color: #64748b; }
.stat-icon--indigo { background: #e0e7ff; color: #4338ca; }
.stat-icon--teal   { background: #ccfbf1; color: #0f766e; }
.stat-icon--amber  { background: #fef3c7; color: #b45309; }

.stat-card--alerta { border-color: #fde68a; }

.stat-info { display: flex; flex-direction: column; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text-primary); line-height: 1; }
.stat-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }

/* Pendientes */
.todo-ok {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: #15803d;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px;
}

.todo-ok i { font-size: 18px; }

.pendientes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.pend-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.pend-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border);
}

.pend-header--rotar    { background: #fffbeb; color: #b45309; }
.pend-header--sinpw    { background: #fef2f2; color: #b91c1c; }
.pend-header--lic      { background: #eff6ff; color: #1d4ed8; }
.pend-header--equipos  { background: #fef2f2; color: #b91c1c; }
.pend-header--garantia { background: #f0fdfa; color: #0f766e; }

.pend-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 20px;
  padding: 1px 8px;
}

.pend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  text-decoration: none;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.12s;
}

.pend-item:last-child { border-bottom: none; }
.pend-item:hover { background: var(--color-bg-hover, #f8fafc); }

.pend-item-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pend-usuario {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pend-contexto {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pend-item > i {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

/* Sección recientes */
.section-title {
  font-size: 15px; font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 14px;
}

.recientes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.emp-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow-sm);
}

.emp-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; text-transform: uppercase;
}

.emp-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.emp-nombre { font-size: 13.5px; font-weight: 600; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.emp-cargo  { font-size: 12px; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
