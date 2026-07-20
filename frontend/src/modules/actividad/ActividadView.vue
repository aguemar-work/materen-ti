<script setup>
// Auditoría de accesos a contraseñas — solo visible para el JEFE.
// Los registros los escribe la edge function; nadie puede crearlos
// ni borrarlos desde el cliente.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import Pagination from '../../components/shared/Pagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';

const registros = ref([]);
const cargando = ref(true);
const filtroAccion = ref('');

const ACCIONES = {
  ver:             { label: 'Vio la contraseña',   icon: 'ti ti-eye',              clase: 'badge--info' },
  copiar:          { label: 'Copió la contraseña', icon: 'ti ti-copy',             clase: 'badge--accent' },
  enviar:          { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_creada:  { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_abierta: { label: 'Entrega abierta',     icon: 'ti ti-mail-opened',     clase: 'badge--warning' },
  acceso_denegado: { label: 'Acceso denegado',     icon: 'ti ti-shield-x',        clase: 'badge--danger' },
};

const listaFiltrada = computed(() =>
  filtroAccion.value
    ? registros.value.filter((r) => r.accion === filtroAccion.value)
    : registros.value
);

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(listaFiltrada);

function infoAccion(accion) {
  return ACCIONES[accion] || { label: accion, icon: 'ti ti-activity', clase: '' };
}

function exportar() {
  exportarCSV(
    'actividad',
    ['Fecha', 'Quién', 'Acción', 'Cuenta', 'Plataforma', 'Detalle'],
    listaFiltrada.value.map((r) => [
      formatFechaHora(r.created_at),
      r.user_email || '(empleado, vía enlace)',
      infoAccion(r.accion).label,
      r.cuenta_usuario,
      r.plataforma,
      r.detalle,
    ]),
  );
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
  <div class="actividad-page vista-modulo">
    <PageHeader titulo="Actividad" icono="ti ti-activity" :conteo="listaFiltrada.length">
      <template #acciones>
        <button class="btn" type="button" title="Exportar a Excel (CSV)" @click="exportar">
          <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <select v-model="filtroAccion">
            <option value="">Todas las acciones</option>
            <option value="ver">Vio contraseña</option>
            <option value="copiar">Copió contraseña</option>
            <option value="enviar">Creó entrega</option>
            <option value="entrega_abierta">Entrega abierta</option>
            <option value="acceso_denegado">Acceso denegado</option>
          </select>
        </div>

        <div v-if="cargando" class="no-results">Cargando actividad...</div>

        <EmptyState
          v-else-if="listaFiltrada.length === 0"
          icono="ti ti-activity"
          titulo="Sin actividad registrada"
          mensaje="Aquí aparecerá cada vez que alguien vea, copie o envíe una contraseña."
        />

        <div v-else class="table-wrap">
          <table aria-label="Auditoría de accesos a contraseñas">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Quién</th>
                <th scope="col">Acción</th>
                <th scope="col">Cuenta</th>
                <th scope="col">Plataforma</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in listaPaginada" :key="r.id">
                <td class="fecha-cell">{{ formatFechaHora(r.created_at) }}</td>
                <td>{{ r.user_email || '(empleado, vía enlace)' }}</td>
                <td>
                  <span class="badge" :class="infoAccion(r.accion).clase">
                    <i :class="infoAccion(r.accion).icon"></i>
                    {{ infoAccion(r.accion).label }}
                  </span>
                </td>
                <td class="cuenta-cell"><TextoVacio :valor="r.cuenta_usuario" /></td>
                <td><TextoVacio :valor="r.plataforma" /></td>
                <td class="detalle-cell">
                  <span v-if="r.detalle" :title="r.detalle">{{ r.detalle }}</span>
                  <TextoVacio v-else />
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
/* Datos uniformes: solo cambia la familia (mono para identificadores) */
.fecha-cell { white-space: nowrap; }

.cuenta-cell {
  font-family: var(--font-mono, monospace);
}

.detalle-cell {
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Estructura y color: sistema de badges global (.badge + .badge--X) */
</style>
