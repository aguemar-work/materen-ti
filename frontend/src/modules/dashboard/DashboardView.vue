<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { formatFecha } from '../../core/formatters.js';
import { claseEstado } from '../../core/dominio-empleados.js';

const stats = ref(null);
const recientes = ref([]);
const pendientes = ref({
  porRotar: [], sinPassword: [], licenciasPorVencer: [],
  equiposSinDevolver: [], garantiasPorVencer: [],
});
const pendientesTickets = ref({ sinAsignar: [], sinVincular: [], abiertosViejos: [] });
const cargando = ref(true);

const hayPendientes = computed(
  () =>
    pendientes.value.porRotar.length > 0 ||
    pendientes.value.sinPassword.length > 0 ||
    pendientes.value.licenciasPorVencer.length > 0 ||
    pendientes.value.equiposSinDevolver.length > 0 ||
    pendientes.value.garantiasPorVencer.length > 0 ||
    pendientesTickets.value.sinAsignar.length > 0 ||
    pendientesTickets.value.sinVincular.length > 0 ||
    pendientesTickets.value.abiertosViejos.length > 0
);

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
    const [est, emp, pend, pendTk] = await Promise.all([
      insforgeApi.getEstadisticas(),
      insforgeApi.listEmpleadosRecientes(6),
      insforgeApi.listPendientes(),
      insforgeApi.pendientesTickets(),
    ]);
    stats.value = est;
    recientes.value = emp;
    pendientes.value = pend;
    pendientesTickets.value = pendTk;
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <div class="dashboard-page vista-modulo">
    <header class="site-header">
      <div class="header-inner">
        <div class="header-title">
          <h1><i class="ti ti-layout-dashboard" aria-hidden="true"></i> Dashboard</h1>
        </div>
      </div>
    </header>

    <main class="page page--padded dashboard-body">
      <div v-if="cargando" class="no-results">Cargando...</div>

      <template v-else>
        <!-- Stats -->
        <div class="grid-12">
          <div class="stat-card col-2">
            <div class="stat-icon stat-icon--blue"><i class="ti ti-users"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.empleadosActivos }}</span>
              <span class="stat-label">Empleados activos</span>
            </div>
          </div>
          <div class="stat-card col-2">
            <div class="stat-icon stat-icon--gray"><i class="ti ti-users-minus"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.empleadosTotal - stats.empleadosActivos }}</span>
              <span class="stat-label">Dados de baja</span>
            </div>
          </div>
          <div class="stat-card col-2">
            <div class="stat-icon stat-icon--indigo"><i class="ti ti-key"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.cuentasAsignadas }}</span>
              <span class="stat-label">Cuentas asignadas</span>
            </div>
          </div>
          <div class="stat-card col-2">
            <div class="stat-icon stat-icon--teal"><i class="ti ti-mail-share"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.correosCompartidos }}</span>
              <span class="stat-label">Correos compartidos</span>
            </div>
          </div>
          <div class="stat-card col-2" :class="{ 'stat-card--alerta': stats.cuentasPorRotar > 0 }">
            <div class="stat-icon stat-icon--amber"><i class="ti ti-key-off"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.cuentasPorRotar }}</span>
              <span class="stat-label">Contraseñas por rotar</span>
            </div>
          </div>
          <div class="stat-card col-2" :class="{ 'stat-card--alerta': stats.licenciasPorVencer > 0 }">
            <div class="stat-icon stat-icon--teal"><i class="ti ti-license"></i></div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.licenciasPorVencer }}</span>
              <span class="stat-label">Licencias por vencer</span>
            </div>
          </div>
        </div>

        <!-- Pendientes accionables -->
        <div class="section">
          <h2 class="section-title">Pendientes</h2>

          <div v-if="!hayPendientes" class="todo-ok">
            <i class="ti ti-circle-check-filled"></i> Todo al día: sin contraseñas por rotar, licencias por vencer, equipos sin devolver ni tickets pendientes.
          </div>

          <div v-else class="grid-12">
            <div v-if="pendientes.equiposSinDevolver.length" class="pend-card col-4">
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

            <div v-if="pendientes.porRotar.length" class="pend-card col-4">
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

            <div v-if="pendientes.sinPassword.length" class="pend-card col-4">
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

            <div v-if="pendientes.licenciasPorVencer.length" class="pend-card col-4">
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

            <div v-if="pendientes.garantiasPorVencer.length" class="pend-card col-4">
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

            <div v-if="pendientesTickets.sinAsignar.length" class="pend-card col-4">
              <div class="pend-header pend-header--rotar">
                <i class="ti ti-headset"></i>
                Tickets sin asignar
                <span class="pend-count">{{ pendientesTickets.sinAsignar.length }}</span>
              </div>
              <RouterLink
                v-for="item in pendientesTickets.sinAsignar"
                :key="item.ticket_id"
                class="pend-item"
                :to="`/tickets/${item.ticket_id}`"
              >
                <div class="pend-item-main">
                  <span class="pend-usuario">{{ item.codigo }}</span>
                  <span class="pend-contexto">{{ item.titulo }}</span>
                </div>
                <i class="ti ti-chevron-right"></i>
              </RouterLink>
            </div>

            <div v-if="pendientesTickets.sinVincular.length" class="pend-card col-4">
              <div class="pend-header pend-header--sinpw">
                <i class="ti ti-user-question"></i>
                Tickets sin vincular
                <span class="pend-count">{{ pendientesTickets.sinVincular.length }}</span>
              </div>
              <RouterLink
                v-for="item in pendientesTickets.sinVincular"
                :key="item.ticket_id"
                class="pend-item"
                :to="`/tickets/${item.ticket_id}`"
              >
                <div class="pend-item-main">
                  <span class="pend-usuario">{{ item.codigo }}</span>
                  <span class="pend-contexto">{{ item.titulo }}</span>
                </div>
                <i class="ti ti-chevron-right"></i>
              </RouterLink>
            </div>

            <div v-if="pendientesTickets.abiertosViejos.length" class="pend-card col-4">
              <div class="pend-header pend-header--lic">
                <i class="ti ti-clock-exclamation"></i>
                Tickets abiertos hace +3 días
                <span class="pend-count">{{ pendientesTickets.abiertosViejos.length }}</span>
              </div>
              <RouterLink
                v-for="item in pendientesTickets.abiertosViejos"
                :key="item.ticket_id"
                class="pend-item"
                :to="`/tickets/${item.ticket_id}`"
              >
                <div class="pend-item-main">
                  <span class="pend-usuario">{{ item.codigo }}</span>
                  <span class="pend-contexto">{{ item.titulo }} · desde {{ formatFecha(item.desde) }}</span>
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
          <div v-else class="grid-12">
            <div v-for="emp in recientes" :key="emp.id" class="emp-card col-3">
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
    </main>
  </div>
</template>

<style scoped>
/* Header y page vienen del shell global (main.css); acá solo el
   layout interno de las secciones del dashboard. */
.dashboard-body { display: flex; flex-direction: column; gap: 28px; }

.no-results { text-align: center; padding: 40px; color: var(--color-text-secondary); }

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

.stat-icon--blue   { background: var(--color-info-border); color: var(--color-info-text); }
.stat-icon--gray   { background: var(--color-neutral-bg); color: var(--color-text-secondary); }
.stat-icon--indigo { background: var(--color-accent-subtle); color: var(--color-accent-hover); }
.stat-icon--teal   { background: var(--color-teal-bg); color: var(--color-teal-text); }
.stat-icon--amber  { background: var(--color-warning-bg-strong); color: var(--color-warning-text); }

.stat-card--alerta { border-color: var(--color-warning-border); }

.stat-info { display: flex; flex-direction: column; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text-primary); line-height: 1; }
.stat-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }

/* Pendientes */
.todo-ok {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--color-success-text);
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px;
}

.todo-ok i { font-size: 18px; }

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

.pend-header--rotar    { background: var(--color-warning-bg); color: var(--color-warning-text); }
.pend-header--sinpw    { background: var(--color-danger-bg); color: var(--color-danger-text); }
.pend-header--lic      { background: var(--color-info-bg); color: var(--color-info-text); }
.pend-header--equipos  { background: var(--color-danger-bg); color: var(--color-danger-text); }
.pend-header--garantia { background: var(--color-teal-bg-subtle); color: var(--color-teal-text); }

.pend-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
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
.pend-item:hover { background: var(--color-bg-hover, var(--color-bg-subtle)); }

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
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%);
  color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; text-transform: uppercase;
}

.emp-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.emp-nombre { font-size: 13.5px; font-weight: 600; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.emp-cargo  { font-size: 12px; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
