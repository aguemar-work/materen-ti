<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { insforgeApi } from '../../api/insforge.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { showToast } from '../../core/toast.js';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import Pagination from '../../components/shared/Pagination.vue';

function exportarCSV(empleados) {
  const cols = ['Nombres', 'Apellidos', 'DNI', 'Empresa', 'Área/Obra', 'Cargo', 'Estado', 'Fecha alta', 'WhatsApp', 'Correo personal'];
  const rows = empleados.map((e) => [
    e.nombres, e.apellidos, e.dni, e.empresa_nombre, e.area_obra_nombre, e.cargo,
    e.estado, e.fecha_alta, e.whatsapp, e.correo_personal,
  ].map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`));
  const csv = [cols.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'empleados.csv'; a.click();
  URL.revokeObjectURL(url);
}

const router = useRouter();
const store = useEmpleadosStore();
const { lista, cargando, error } = storeToRefs(store);

const busqueda = ref('');
const filtroEstado = ref('');
const mostrarForm = ref(false);
const empleadoEditar = ref(null);

const estados = ['Activo', 'Inactivo', 'Suspendido'];

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return lista.value.filter((emp) => {
    if (filtroEstado.value && emp.estado !== filtroEstado.value) return false;
    if (!q) return true;
    const nombre = `${emp.nombres} ${emp.apellidos}`.toLowerCase();
    return nombre.includes(q) || emp.dni.toLowerCase().includes(q);
  });
});

const TAM_PAGINA = 20;
const paginaActual = ref(1);
watch(listaFiltrada, () => { paginaActual.value = 1; });
const listaPaginada = computed(() => {
  const inicio = (paginaActual.value - 1) * TAM_PAGINA;
  return listaFiltrada.value.slice(inicio, inicio + TAM_PAGINA);
});

function nombreCompleto(emp) {
  return `${emp.nombres} ${emp.apellidos}`;
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

function claseEstado(estado) {
  if (estado === 'Activo') return 'badge--success';
  if (estado === 'Suspendido') return 'badge--warning';
  return 'badge--neutral';
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
    <header class="site-header">
      <div class="header-inner">
        <div class="header-title">
          <h1><i class="ti ti-users" aria-hidden="true"></i> Empleados</h1>
        </div>
        <div class="header-btns">
          <button class="btn" type="button" title="Exportar CSV" @click="exportarCSV(listaFiltrada)">
            <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
          </button>
          <button class="btn btn-primary" type="button" @click="abrirNuevo">
            <i class="ti ti-plus" aria-hidden="true"></i> Nuevo empleado
          </button>
        </div>
      </div>
    </header>

    <main class="page">
      <div class="card card--fill">
        <div class="card-toolbar">
          <div class="toolbar-title">
            Inventario de empleados
            <span class="badge-count">{{ listaFiltrada.length }} empleados</span>
          </div>
        </div>

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

        <div v-if="cargando" class="no-results">Cargando empleados...</div>

        <div v-else-if="error" class="no-results empleados-error">{{ error }}</div>

        <div v-else-if="listaFiltrada.length === 0" class="empty">
          <div class="empty-icon"><i class="ti ti-users"></i></div>
          <h3>Sin empleados</h3>
          <p>{{ busqueda || filtroEstado ? 'No hay resultados con los filtros aplicados.' : 'Agrega el primer empleado al inventario.' }}</p>
          <button v-if="!busqueda && !filtroEstado" class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Agregar empleado
          </button>
        </div>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DNI</th>
                <th>Nombre</th>
                <th>Cargo</th>
                <th>Empresa</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="emp in listaPaginada" :key="emp.id" class="fila-empleado" @click="verFicha(emp)">
                <td class="text-muted">{{ emp.dni }}</td>
                <td>
                  <div class="user-name">{{ nombreCompleto(emp) }}</div>
                </td>
                <td class="text-muted">{{ emp.cargo || '—' }}</td>
                <td>{{ emp.empresa_nombre || '—' }}</td>
                <td>
                  <span class="status" :class="claseEstado(emp.estado)">{{ emp.estado }}</span>
                </td>
                <td @click.stop>
                  <div class="actions">
                    <button
                      class="icon-btn"
                      type="button"
                      title="Ver ficha"
                      @click="verFicha(emp)"
                    >
                      <i class="ti ti-eye"></i>
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      title="Editar"
                      @click="abrirEditar(emp)"
                    >
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      title="Enviar credenciales por WhatsApp"
                      :disabled="enviandoCredsId === emp.id"
                      @click="enviarCredenciales(emp)"
                    >
                      <i class="ti ti-brand-whatsapp"></i>
                    </button>
                    <button
                      v-if="emp.estado !== 'Inactivo'"
                      class="icon-btn danger"
                      type="button"
                      title="Dar de baja"
                      @click="darDeBaja(emp)"
                    >
                      <i class="ti ti-user-off"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <Pagination v-model="paginaActual" :total-items="listaFiltrada.length" :page-size="TAM_PAGINA" />
        </div>
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
.header-btns { display: flex; gap: 8px; align-items: center; }

.fila-empleado { cursor: pointer; }
.fila-empleado:hover td { background: var(--color-bg-hover, var(--color-bg-subtle)); }
</style>
