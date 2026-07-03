<script setup>
// Auditoría de accesos a contraseñas — solo visible para el JEFE.
// Los registros los escribe la edge function; nadie puede crearlos
// ni borrarlos desde el cliente.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';

const registros = ref([]);
const cargando = ref(true);
const filtroAccion = ref('');

const ACCIONES = {
  ver:             { label: 'Vio la contraseña',   icon: 'ti ti-eye',              clase: 'badge--info' },
  copiar:          { label: 'Copió la contraseña', icon: 'ti ti-copy',             clase: 'badge--accent' },
  enviar:          { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_creada:  { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_abierta: { label: 'Entrega abierta',     icon: 'ti ti-mailbox-opened',   clase: 'badge--warning' },
};

const listaFiltrada = computed(() =>
  filtroAccion.value
    ? registros.value.filter((r) => r.accion === filtroAccion.value)
    : registros.value
);

function infoAccion(accion) {
  return ACCIONES[accion] || { label: accion, icon: 'ti ti-activity', clase: '' };
}

function formatFechaHora(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

onMounted(async () => {
  try {
    registros.value = await insforgeApi.listActividad(200);
  } catch (e) {
    showToast(e?.message || 'Error al cargar la actividad', 'error');
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <div class="actividad-page">
    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <div class="brand-icon">
            <i class="ti ti-activity" aria-hidden="true"></i>
          </div>
          <div class="brand-text">
            <h1>Sistema TI</h1>
            <span>Módulo: Actividad</span>
          </div>
        </div>
      </div>
    </header>

    <main class="page">
      <div class="card">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Auditoría de accesos a contraseñas
            <span class="badge-count">{{ listaFiltrada.length }} registros</span>
          </div>
        </div>

        <div class="filters">
          <select v-model="filtroAccion">
            <option value="">Todas las acciones</option>
            <option value="ver">Vio contraseña</option>
            <option value="copiar">Copió contraseña</option>
            <option value="enviar">Creó entrega</option>
            <option value="entrega_abierta">Entrega abierta</option>
          </select>
        </div>

        <div v-if="cargando" class="no-results">Cargando actividad...</div>

        <div v-else-if="listaFiltrada.length === 0" class="empty">
          <div class="empty-icon"><i class="ti ti-activity"></i></div>
          <h3>Sin actividad registrada</h3>
          <p>Aquí aparecerá cada vez que alguien vea, copie o envíe una contraseña.</p>
        </div>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Quién</th>
                <th>Acción</th>
                <th>Cuenta</th>
                <th>Plataforma</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in listaFiltrada" :key="r.id">
                <td class="text-muted fecha-cell">{{ formatFechaHora(r.created_at) }}</td>
                <td>{{ r.user_email || '(empleado, vía enlace)' }}</td>
                <td>
                  <span class="badge" :class="infoAccion(r.accion).clase">
                    <i :class="infoAccion(r.accion).icon"></i>
                    {{ infoAccion(r.accion).label }}
                  </span>
                </td>
                <td class="cuenta-cell">{{ r.cuenta_usuario }}</td>
                <td>{{ r.plataforma || '—' }}</td>
                <td class="text-muted detalle-cell">
                  <span v-if="r.detalle" :title="r.detalle">{{ r.detalle }}</span>
                  <span v-else>—</span>
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
.fecha-cell { white-space: nowrap; font-size: 12.5px; }

.cuenta-cell {
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
}

.detalle-cell {
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
}

/* Estructura y color: sistema de badges global (.badge + .badge--X) */
</style>
