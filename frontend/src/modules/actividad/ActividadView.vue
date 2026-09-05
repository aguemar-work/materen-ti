<script setup>
// Auditoría de accesos a contraseñas — solo visible para el JEFE.
// Los registros los escribe la edge function; nadie puede crearlos
// ni borrarlos desde el cliente.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

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

const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(listaFiltrada);
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaOrdenada);

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

// "Cuenta" lleva un slot propio que apila Plataforma (metadato) sobre el
// nombre de cuenta (mono); "Detalle" es la elástica (mismo criterio que
// .col-elastica en la tabla vieja). Sin tarjeta móvil previa: agrupamos con
// el mismo esquema que EmpresasView (acción como cabecera-tag, cuenta como
// dato principal, quién/detalle de apoyo, fecha al pie).
const columnas = [
  { clave: 'user_email', label: 'Quién', ordenable: true, movil: 'sec' },
  { clave: 'accion', label: 'Acción', ordenable: true, movil: 'cab' },
  { clave: 'cuenta_usuario', label: 'Cuenta', ordenable: true, movil: 'principal' },
  { clave: 'detalle', label: 'Detalle', elastica: true, movil: 'sec' },
  { clave: 'created_at', label: 'Fecha', ordenable: true, num: true, movil: 'pie' },
];

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
        <CarbonButton variante="secondary" icono="ti-table-export" title="Exportar a Excel (CSV)" @click="exportar">Exportar</CarbonButton>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="filter-field">
            <label for="filtro-accion">Acción</label>
            <select id="filtro-accion" v-model="filtroAccion">
              <option value="">Todas las acciones</option>
              <option value="ver">Vio contraseña</option>
              <option value="copiar">Copió contraseña</option>
              <option value="enviar">Creó entrega</option>
              <option value="entrega_abierta">Entrega abierta</option>
              <option value="acceso_denegado">Acceso denegado</option>
            </select>
          </div>
        </div>

        <CarbonDataTable
          densidad="sm"
          :columnas="columnas"
          :filas="listaPaginada"
          :cargando="cargando"
          :orden-por="columna"
          :orden-dir="direccion"
          etiqueta="Auditoría de accesos a contraseñas"
          vacio-icono="ti ti-activity"
          vacio-titulo="Sin actividad registrada"
          vacio-mensaje="Aquí aparecerá cada vez que alguien vea, copie o envíe una contraseña."
          @ordenar="ordenarPor"
        >
          <template #celda-user_email="{ fila }">
            {{ fila.user_email || '(empleado, vía enlace)' }}
          </template>
          <template #celda-accion="{ fila }">
            <CarbonTag :variante="infoAccion(fila.accion).clase">
              <i :class="infoAccion(fila.accion).icon"></i>
              {{ infoAccion(fila.accion).label }}
            </CarbonTag>
          </template>
          <template #celda-cuenta_usuario="{ fila }">
            <!-- Cuenta + Plataforma colapsan (mismo criterio que
                 Tickets): Plataforma es el metadato que agrupa,
                 Cuenta es el dato principal de la fila. -->
            <div class="celda-apilada">
              <span class="celda-apilada__meta"><TextoVacio :valor="fila.plataforma" /></span>
              <span class="celda-apilada__principal cuenta-cell"><TextoVacio :valor="fila.cuenta_usuario" /></span>
            </div>
          </template>
          <template #celda-detalle="{ fila }">
            <span v-if="fila.detalle" class="detalle-cell" :title="fila.detalle">{{ fila.detalle }}</span>
            <TextoVacio v-else />
          </template>
          <template #celda-created_at="{ fila }">
            <span class="fecha-cell" :title="formatFechaHora(fila.created_at)">{{ formatAntiguedad(fila.created_at) }}</span>
          </template>
        </CarbonDataTable>
        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="totalItems"
          :tam-pagina="tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="movimientos"
          @update:tam-pagina="cambiarTamPagina"
        />
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
  white-space: normal;
  word-break: break-word;
}
</style>
