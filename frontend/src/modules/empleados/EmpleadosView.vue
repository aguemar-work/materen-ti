<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { insforgeApi } from '../../api/insforge.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto } from '../../core/dominio-empleados.js';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import Pagination from '../../components/shared/Pagination.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';

const router = useRouter();
const store = useEmpleadosStore();
const { lista, total, cargando, error } = storeToRefs(store);

useRealtimeRefresco('empleados:list', () => store.cargar());

const busqueda = ref('');
const filtroEstado = ref('');
const mostrarForm = ref(false);
const empleadoEditar = ref(null);

const estados = ['Activo', 'Inactivo', 'Suspendido'];

// Búsqueda y filtros viajan al servidor (paginación server-side):
// la búsqueda con debounce, el select de estado al instante.
let debounceBusqueda = null;
watch(busqueda, (q) => {
  clearTimeout(debounceBusqueda);
  debounceBusqueda = setTimeout(() => store.aplicarFiltros({ q: q.trim() }), 300);
});
watch(filtroEstado, (estado) => store.aplicarFiltros({ estado }));

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

// Exporta el dataset filtrado COMPLETO (el servidor solo tiene la página)
const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'empleados',
      ['Nombres', 'Apellidos', 'DNI', 'Empresa', 'Área/Obra', 'Cargo', 'Estado', 'Fecha alta', 'WhatsApp', 'Correo personal'],
      filas.map((e) => [
        e.nombres, e.apellidos, e.dni, e.empresa_nombre, e.area_obra_nombre, e.cargo,
        e.estado, e.fecha_alta, e.whatsapp, e.correo_personal,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// ── Enviar credenciales sin entrar al perfil ──────────────────────
// Mismo flujo que el botón de WhatsApp en la ficha (CuentasPanel):
// enlace de entrega de un solo uso con TODAS las cuentas del empleado.
const enviandoCredsId = ref(null);

async function enviarCredenciales(emp) {
  if (enviandoCredsId.value) return;
  enviandoCredsId.value = emp.id;
  try {
    const cuentas = await insforgeApi.listCuentasPorEmpleado(emp.id);
    if (!cuentas.length) {
      showToast(`${nombreCompleto(emp)} no tiene cuentas registradas`, 'error');
      return;
    }
    await enviarCredencialesWhatsApp({
      empleadoId: emp.id,
      empleadoNombre: nombreCompleto(emp),
      whatsapp: emp.whatsapp,
      cuentaIds: cuentas.map((c) => c.cuenta_id),
    });
  } catch (e) {
    showToast(e?.message || 'Error al crear la entrega', 'error');
  } finally {
    enviandoCredsId.value = null;
  }
}

function abrirNuevo() {
  empleadoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(empleado) {
  empleadoEditar.value = empleado;
  mostrarForm.value = true;
}

function cerrarForm() {
  mostrarForm.value = false;
  empleadoEditar.value = null;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!empleadoEditar.value;
  cerrarForm();
  if (!guardado) return;
  if (fueEdicion) {
    showToast('Empleado actualizado');
  } else {
    // Alta guiada: llevar a la ficha del nuevo empleado para asignarle accesos
    router.push(`/empleados/${guardado.id}?nuevo=1`);
  }
}

function verFicha(empleado) {
  router.push(`/empleados/${empleado.id}`);
}

const empleadoBaja = ref(null);

function darDeBaja(empleado) {
  if (empleado.estado === 'Inactivo') return;
  empleadoBaja.value = empleado;
}

function onBajaCerrada() {
  empleadoBaja.value = null;
}

// Acciones por fila para el menú ⋮ de las tarjetas móviles — mismas
// condiciones que los icon-btn de la tabla de escritorio.
function accionesDe(emp) {
  return [
    { icono: 'ti-eye', label: 'Ver ficha', onClick: () => verFicha(emp) },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(emp) },
    {
      icono: 'ti-brand-whatsapp',
      label: 'Enviar credenciales por WhatsApp',
      disabled: enviandoCredsId.value === emp.id,
      onClick: () => enviarCredenciales(emp),
    },
    {
      icono: 'ti-user-off',
      label: 'Dar de baja',
      danger: true,
      visible: emp.estado !== 'Inactivo',
      onClick: () => darDeBaja(emp),
    },
  ];
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar empleados', 'error');
  }
});
</script>

<template>
  <div class="empleados-page vista-modulo">
    <PageHeader titulo="Empleados" icono="ti ti-users" :conteo="total">
      <template #acciones>
        <button class="btn" type="button" title="Exportar a Excel (CSV)" :disabled="exportando" @click="exportar">
          <i :class="exportando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-table-export'" aria-hidden="true"></i> {{ exportando ? 'Exportando...' : 'Exportar' }}
        </button>
        <button class="btn btn-primary" type="button" @click="abrirNuevo">
          <i class="ti ti-plus" aria-hidden="true"></i> Nuevo empleado
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input
              v-model="busqueda"
              type="text"
              placeholder="Buscar por nombre o DNI..."
            >
          </div>
          <select v-model="filtroEstado">
            <option value="">Todos los estados</option>
            <option v-for="est in estados" :key="est" :value="est">{{ est }}</option>
          </select>
        </div>

        <div v-if="cargando" class="no-results solo-movil">Cargando empleados...</div>

        <div v-else-if="error" class="no-results empleados-error">{{ error }}</div>

        <EmptyState
          v-else-if="total === 0"
          icono="ti ti-users"
          titulo="Sin empleados"
          :mensaje="busqueda || filtroEstado ? 'No hay resultados con los filtros aplicados.' : 'Agrega el primer empleado al inventario.'"
        >
          <button v-if="!busqueda && !filtroEstado" class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Agregar empleado
          </button>
        </EmptyState>

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando empleados…</p>
        <div class="table-wrap solo-escritorio">
          <table aria-label="Inventario de empleados">
            <thead>
              <tr>
                <th scope="col">DNI</th>
                <th scope="col">Nombre</th>
                <th scope="col">Cargo</th>
                <th scope="col">Empresa</th>
                <th scope="col">Vínculos</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="7" />
              <template v-else>
              <tr v-for="emp in lista" :key="emp.id" class="fila-empleado" @click="verFicha(emp)">
                <td>{{ emp.dni }}</td>
                <td>
                  <div class="user-name">{{ nombreCompleto(emp) }}</div>
                </td>
                <td><TextoVacio :valor="emp.cargo" /></td>
                <td><TextoVacio :valor="emp.empresa_nombre" /></td>
                <td>
                  <div v-if="emp.n_cuentas != null" class="vinculos">
                    <span
                      class="vinculo"
                      :class="{ 'vinculo--cero': !emp.n_cuentas }"
                      :title="`${emp.n_cuentas} cuenta(s) activa(s)`"
                    >
                      <i class="ti ti-key" aria-hidden="true"></i>{{ emp.n_cuentas }}
                    </span>
                    <span
                      class="vinculo"
                      :class="{ 'vinculo--cero': !emp.n_equipos }"
                      :title="`${emp.n_equipos} equipo(s) asignado(s)`"
                    >
                      <i class="ti ti-devices" aria-hidden="true"></i>{{ emp.n_equipos }}
                    </span>
                    <span
                      class="vinculo"
                      :class="{ 'vinculo--cero': !emp.n_licencias }"
                      :title="`${emp.n_licencias} licencia(s) directa(s)`"
                    >
                      <i class="ti ti-license" aria-hidden="true"></i>{{ emp.n_licencias }}
                    </span>
                  </div>
                  <TextoVacio v-else />
                </td>
                <td>
                  <BadgeEstado tipo="empleado" :valor="emp.estado" status />
                </td>
                <td @click.stop>
                  <div class="actions">
                    <button
                      class="icon-btn"
                      type="button"
                      title="Ver ficha"
                      aria-label="Ver ficha"
                      @click="verFicha(emp)"
                    >
                      <i class="ti ti-eye"></i>
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      title="Editar"
                      aria-label="Editar"
                      @click="abrirEditar(emp)"
                    >
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      title="Enviar credenciales por WhatsApp"
                      aria-label="Enviar credenciales por WhatsApp"
                      :disabled="enviandoCredsId === emp.id"
                      @click="enviarCredenciales(emp)"
                    >
                      <i :class="enviandoCredsId === emp.id ? 'ti ti-loader-2 spinner-icon' : 'ti ti-brand-whatsapp'"></i>
                    </button>
                    <button
                      v-if="emp.estado !== 'Inactivo'"
                      class="icon-btn danger"
                      type="button"
                      title="Dar de baja"
                      aria-label="Dar de baja"
                      @click="darDeBaja(emp)"
                    >
                      <i class="ti ti-user-off"></i>
                    </button>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Render móvil: misma lista paginada, como tarjetas apiladas -->
        <ul v-if="!cargando" class="lista-tarjetas solo-movil" aria-label="Inventario de empleados">
          <li v-for="emp in lista" :key="emp.id" class="tarjeta-fila tarjeta-fila--clic" @click="verFicha(emp)">
            <div class="tarjeta-fila__principal user-name">{{ nombreCompleto(emp) }}</div>
            <div class="tarjeta-fila__sec">
              <span>{{ emp.dni }}</span>
              <template v-if="emp.cargo"><span aria-hidden="true">·</span><span>{{ emp.cargo }}</span></template>
              <template v-if="emp.empresa_nombre"><span aria-hidden="true">·</span><span>{{ emp.empresa_nombre }}</span></template>
            </div>
            <div class="tarjeta-fila__pie">
              <div class="tarjeta-fila__badges">
                <BadgeEstado tipo="empleado" :valor="emp.estado" status />
                <div v-if="emp.n_cuentas != null" class="vinculos vinculos--tarjeta">
                  <span class="vinculo" :class="{ 'vinculo--cero': !emp.n_cuentas }" :title="`${emp.n_cuentas} cuenta(s) activa(s)`">
                    <i class="ti ti-key" aria-hidden="true"></i>{{ emp.n_cuentas }}
                  </span>
                  <span class="vinculo" :class="{ 'vinculo--cero': !emp.n_equipos }" :title="`${emp.n_equipos} equipo(s) asignado(s)`">
                    <i class="ti ti-devices" aria-hidden="true"></i>{{ emp.n_equipos }}
                  </span>
                  <span class="vinculo" :class="{ 'vinculo--cero': !emp.n_licencias }" :title="`${emp.n_licencias} licencia(s) directa(s)`">
                    <i class="ti ti-license" aria-hidden="true"></i>{{ emp.n_licencias }}
                  </span>
                </div>
              </div>
              <MenuAcciones :acciones="accionesDe(emp)" :label="`Acciones de ${nombreCompleto(emp)}`" />
            </div>
          </li>
        </ul>

        <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </template>
      </div>
    </main>

    <EmpleadoForm
      v-if="mostrarForm"
      :empleado="empleadoEditar"
      @cerrar="onFormCerrado"
    />

    <BajaEmpleadoModal
      v-if="empleadoBaja"
      :empleado="empleadoBaja"
      @cerrar="onBajaCerrada"
    />
  </div>
</template>

<style scoped>
.empleados-error { color: var(--color-danger); }

.fila-empleado { cursor: pointer; }
.fila-empleado:hover td { background: var(--color-bg-hover, var(--color-bg-subtle)); }

/* Conteos de cuentas/equipos: dato secundario, no badge (no es estado) */
.vinculos {
  display: flex;
  align-items: center;
  gap: 14px;
}

.vinculo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary);
}

.vinculo i { font-size: 14px; }

.vinculo--cero { color: var(--color-text-tertiary); }
</style>
