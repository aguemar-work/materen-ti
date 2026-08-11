<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { usePersonalRegistrosStore } from '../../stores/personalRegistros.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import Pagination from '../../components/shared/Pagination.vue';
import EmpleadoForm from '../empleados/EmpleadoForm.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';

const store = usePersonalRegistrosStore();
const auth = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });
const soloPendientes = ref(false);

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

function toggleSoloPendientes() {
  soloPendientes.value = !soloPendientes.value;
  store.aplicarFiltros({ pendientes: soloPendientes.value });
}

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'personal-registros',
      ['DNI', 'Nombres', 'Apellidos', 'Celular', 'Correo personal'],
      filas.map((r) => [r.dni, r.nombres, r.apellidos, r.celular, r.correo_personal]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

async function toggleUsado(registro) {
  try {
    await store.marcarUsado(registro.id, !registro.usado);
  } catch (e) {
    showToast(e?.message || 'Error al actualizar', 'error');
  }
}

// ── Migrar a empleado (solo JEFE, ver migración 046) ───────────────
// Compara por DNI: si ya existe un empleado, abre su edición prellenada
// con los datos del pre-registro; si no, abre el alta. El pre-registro
// solo se elimina (hard delete) si el guardado del empleado tiene éxito.
const mostrarFormEmpleado = ref(false);
const empleadoParaForm = ref(null);
const registroEnMigracion = ref(null);
const migrandoId = ref(null);

async function migrarAEmpleado(registro) {
  migrandoId.value = registro.id;
  try {
    const existente = await insforgeApi.buscarPorDni(registro.dni);
    empleadoParaForm.value = existente
      ? {
          ...existente,
          nombres: registro.nombres,
          apellidos: registro.apellidos,
          correo_personal: registro.correo_personal || existente.correo_personal,
          whatsapp: registro.celular || existente.whatsapp,
        }
      : {
          nombres: registro.nombres,
          apellidos: registro.apellidos,
          dni: registro.dni,
          correo_personal: registro.correo_personal || '',
          whatsapp: registro.celular || '',
        };
    registroEnMigracion.value = registro;
    mostrarFormEmpleado.value = true;
  } catch (e) {
    showToast(e?.message || 'Error al buscar empleado por DNI', 'error');
  } finally {
    migrandoId.value = null;
  }
}

async function onCerrarMigracion(resultado) {
  mostrarFormEmpleado.value = false;
  if (!resultado) return;
  try {
    await store.eliminar(registroEnMigracion.value.id);
    showToast('Empleado migrado y pre-registro eliminado', 'success');
  } catch (e) {
    showToast(e?.message || 'El empleado se guardó, pero no se pudo eliminar el pre-registro', 'error');
  } finally {
    registroEnMigracion.value = null;
  }
}

onMounted(async () => {
  store.resetearFiltros();
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar los pre-registros', 'error');
  }
});
</script>

<template>
  <div class="personal-registros-page vista-modulo">
    <PageHeader titulo="Pre-registro de personal" icono="ti ti-id-badge-2" :conteo="total">
      <template #acciones>
        <button class="btn" type="button" title="Exportar a Excel (CSV)" :disabled="exportando" @click="exportar">
          <i :class="exportando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-table-export'" aria-hidden="true"></i> {{ exportando ? 'Exportando...' : 'Exportar' }}
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por nombre, apellido o DNI...">
          </div>
          <button class="btn" type="button" :class="{ 'btn--activo': soloPendientes }" @click="toggleSoloPendientes">
            <i class="ti ti-filter" aria-hidden="true"></i> {{ soloPendientes ? 'Solo pendientes' : 'Todos' }}
          </button>
        </div>

        <div v-if="error" class="no-results">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-id-badge-2"
          titulo="Sin pre-registros"
          mensaje="Comparte el link /personal-registro para que candidatos o nuevos ingresos dejen sus datos."
        />

        <div v-else-if="cargando || total > 0" class="table-wrap">
          <p v-if="cargando" class="sr-only" role="status">Cargando pre-registros de personal…</p>
          <table aria-label="Pre-registros de personal">
            <thead>
              <tr>
                <ThOrdenable clave="dni" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">DNI</ThOrdenable>
                <ThOrdenable clave="apellidos" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Nombres y apellidos</ThOrdenable>
                <th scope="col">Celular</th>
                <th scope="col">Correo personal</th>
                <ThOrdenable clave="created_at" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Fecha</ThOrdenable>
                <th scope="col">Estado</th>
                <th v-if="auth.esJefe" scope="col">Migrar</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="auth.esJefe ? 7 : 6" />
              <template v-else>
              <tr v-for="r in lista" :key="r.id">
                <td class="registro-dni">{{ r.dni }}</td>
                <td>{{ r.nombres }} {{ r.apellidos }}</td>
                <td><span v-if="r.celular">{{ r.celular }}</span><TextoVacio v-else /></td>
                <td><span v-if="r.correo_personal">{{ r.correo_personal }}</span><TextoVacio v-else /></td>
                <td>{{ formatFecha(r.created_at) }}</td>
                <td>
                  <button
                    class="btn-usado"
                    type="button"
                    :class="{ 'btn-usado--activo': r.usado }"
                    :title="r.usado ? 'Marcar como pendiente' : 'Marcar como usado'"
                    @click="toggleUsado(r)"
                  >
                    <i :class="r.usado ? 'ti ti-check' : 'ti ti-clock'" aria-hidden="true"></i>
                    {{ r.usado ? 'Usado' : 'Pendiente' }}
                  </button>
                </td>
                <td v-if="auth.esJefe">
                  <button
                    class="btn"
                    type="button"
                    title="Migrar a empleado (alta o actualización por DNI) y eliminar este pre-registro"
                    :disabled="migrandoId === r.id"
                    @click="migrarAEmpleado(r)"
                  >
                    <i :class="migrandoId === r.id ? 'ti ti-loader-2 spinner-icon' : 'ti ti-user-plus'" aria-hidden="true"></i>
                    Migrar a empleado
                  </button>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
          <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </div>
      </div>
    </main>

    <EmpleadoForm v-if="mostrarFormEmpleado" :empleado="empleadoParaForm" @cerrar="onCerrarMigracion" />
  </div>
</template>

<style scoped>
.registro-dni {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
}

.btn--activo {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-usado {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: none;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.btn-usado--activo {
  border-color: var(--color-success-text);
  color: var(--color-success-text);
  background: var(--color-success-bg);
}
</style>
