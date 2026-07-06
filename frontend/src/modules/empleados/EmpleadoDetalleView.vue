<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatTelefono } from '../../core/formatters.js';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import CuentasPanel from '../cuentas/CuentasPanel.vue';

const route = useRoute();
const router = useRouter();
const empleadosStore = useEmpleadosStore();
const cuentasStore = useCuentasStore();

const empleado = ref(null);
const licencias = ref([]);
const equipos = ref([]);
const cargando = ref(true);
const procesando = ref(false);
const mostrarForm = ref(false);
const mostrarBaja = ref(false);

// Alta guiada: se llega con ?nuevo=1 desde "Nuevo empleado"
const modoAlta = ref(route.query.nuevo === '1');
const tieneAccesos = computed(() =>
  cuentasStore.empleadoActual === route.params.id && cuentasStore.lista.length > 0
);

function terminarAlta() {
  modoAlta.value = false;
  router.replace({ query: {} });
}

const nombreCompleto = computed(() =>
  empleado.value ? `${empleado.value.nombres} ${empleado.value.apellidos}` : ''
);

const iniciales = computed(() =>
  empleado.value ? `${empleado.value.nombres[0] || ''}${empleado.value.apellidos[0] || ''}` : ''
);

function claseEstado(estado) {
  if (estado === 'Activo') return 'badge--success';
  if (estado === 'Suspendido') return 'badge--warning';
  return 'badge--neutral';
}

async function cargar() {
  cargando.value = true;
  try {
    const [emp, lics, eqs] = await Promise.all([
      insforgeApi.getEmpleado(route.params.id),
      insforgeApi.licenciasPorEmpleado(route.params.id),
      insforgeApi.equiposPorEmpleado(route.params.id),
    ]);
    empleado.value = emp;
    licencias.value = lics;
    equipos.value = eqs;
    if (!empleado.value) {
      showToast('Empleado no encontrado', 'error');
      router.replace('/empleados');
    }
  } catch (e) {
    showToast(e?.message || 'Error al cargar el empleado', 'error');
  } finally {
    cargando.value = false;
  }
}

async function liberarLicencia(lic) {
  if (!confirm(`¿Liberar el asiento de "${lic.software}" de este empleado?`)) return;
  try {
    await insforgeApi.cerrarAsignacionLicencia(lic.asignacion_id);
    licencias.value = licencias.value.filter((l) => l.asignacion_id !== lic.asignacion_id);
    showToast('Asiento liberado');
  } catch (e) {
    showToast(e?.message || 'Error al liberar', 'error');
  }
}

function sincronizarStore() {
  const idx = empleadosStore.lista.findIndex((e) => e.id === empleado.value?.id);
  if (idx !== -1 && empleado.value) empleadosStore.lista[idx] = empleado.value;
}

async function onFormCerrado(guardado) {
  mostrarForm.value = false;
  if (guardado) {
    await cargar();
    showToast('Empleado actualizado');
  }
}

async function onBajaCerrada(guardado) {
  mostrarBaja.value = false;
  if (guardado) {
    await cargar();
    // Las cuentas personales se dieron de baja: refrescar el panel de accesos
    await cuentasStore.cargarPorEmpleado(route.params.id);
  }
}

async function reactivar() {
  if (!confirm(`¿Reactivar a ${nombreCompleto.value}? Volverá al estado Activo.`)) return;
  procesando.value = true;
  try {
    empleado.value = await insforgeApi.reactivarEmpleado(empleado.value.id);
    sincronizarStore();
    showToast(`${nombreCompleto.value} reactivado`);
  } catch (e) {
    showToast(e?.message || 'Error al reactivar', 'error');
  } finally {
    procesando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="detalle-page">
    <header class="site-header">
      <div class="header-inner">
        <div class="header-left">
          <button class="icon-btn btn-volver" type="button" title="Volver a empleados" @click="router.push('/empleados')">
            <i class="ti ti-arrow-left"></i>
          </button>
          <template v-if="empleado">
            <div class="emp-avatar">{{ iniciales }}</div>
            <div class="header-emp">
              <h1>
                {{ nombreCompleto }}
                <span class="status" :class="claseEstado(empleado.estado)">{{ empleado.estado }}</span>
              </h1>
              <span class="header-sub">
                {{ empleado.cargo || 'Sin cargo' }}{{ empleado.empresa_nombre ? ` · ${empleado.empresa_nombre}` : '' }}
              </span>
            </div>
          </template>
          <div v-else class="header-emp">
            <h1>Empleado</h1>
          </div>
        </div>
        <div v-if="empleado" class="header-btns">
          <button class="btn" type="button" :disabled="procesando" @click="mostrarForm = true">
            <i class="ti ti-pencil" aria-hidden="true"></i> Editar
          </button>
          <button
            v-if="empleado.estado !== 'Inactivo'"
            class="btn btn-baja"
            type="button"
            :disabled="procesando"
            @click="mostrarBaja = true"
          >
            <i class="ti ti-user-off" aria-hidden="true"></i> Dar de baja
          </button>
          <button
            v-else
            class="btn btn-primary"
            type="button"
            :disabled="procesando"
            @click="reactivar"
          >
            <i class="ti ti-user-check" aria-hidden="true"></i> Reactivar
          </button>
        </div>
      </div>
    </header>

    <main class="page detalle-body">
      <div v-if="cargando" class="no-results">Cargando empleado...</div>

      <template v-else-if="empleado">
        <!-- Banner de alta guiada -->
        <div v-if="modoAlta" class="alta-banner">
          <div class="alta-pasos">
            <div class="alta-paso alta-paso--hecho">
              <i class="ti ti-circle-check-filled"></i>
              <span><strong>1.</strong> Empleado registrado</span>
            </div>
            <i class="ti ti-chevron-right alta-sep"></i>
            <div class="alta-paso" :class="{ 'alta-paso--hecho': tieneAccesos }">
              <i :class="tieneAccesos ? 'ti ti-circle-check-filled' : 'ti ti-circle-2'"></i>
              <span><strong>2.</strong> Asignar sus accesos</span>
            </div>
            <i class="ti ti-chevron-right alta-sep"></i>
            <div class="alta-paso">
              <i class="ti ti-circle-3"></i>
              <span><strong>3.</strong> Enviarlos por WhatsApp</span>
            </div>
          </div>
          <button class="icon-btn alta-cerrar" type="button" title="Ocultar guía" @click="terminarAlta">
            <i class="ti ti-x"></i>
          </button>
        </div>

        <div class="detalle-grid">
          <!-- Datos personales -->
          <div class="card datos-card">
            <div class="datos-title">
              <i class="ti ti-id-badge-2" aria-hidden="true"></i> Datos personales
            </div>
            <dl class="datos-lista">
              <div class="dato">
                <dt>DNI</dt>
                <dd>{{ empleado.dni }}</dd>
              </div>
              <div class="dato">
                <dt>Empresa</dt>
                <dd>{{ empleado.empresa_nombre || '—' }}</dd>
              </div>
              <div class="dato">
                <dt>Cargo</dt>
                <dd>{{ empleado.cargo || '—' }}</dd>
              </div>
              <div class="dato">
                <dt>Fecha de alta</dt>
                <dd>{{ formatFecha(empleado.fecha_alta) || '—' }}</dd>
              </div>
              <div class="dato">
                <dt>Teléfono</dt>
                <dd>{{ formatTelefono(empleado.telefono) || '—' }}</dd>
              </div>
              <div class="dato">
                <dt>WhatsApp</dt>
                <dd>
                  <a
                    v-if="empleado.whatsapp"
                    class="dato-link"
                    :href="`https://wa.me/${empleado.whatsapp.replace(/\D/g, '')}`"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i class="ti ti-brand-whatsapp"></i> {{ formatTelefono(empleado.whatsapp) }}
                  </a>
                  <template v-else>—</template>
                </dd>
              </div>
              <div class="dato">
                <dt>Correo personal</dt>
                <dd class="dato-truncar" :title="empleado.correo_personal">{{ empleado.correo_personal || '—' }}</dd>
              </div>
              <div v-if="empleado.notas" class="dato dato--notas">
                <dt>Notas</dt>
                <dd>{{ empleado.notas }}</dd>
              </div>
            </dl>

            <!-- Equipos que porta (la devolución se registra en el módulo Equipos) -->
            <div v-if="equipos.length" class="lic-seccion">
              <div class="datos-title lic-title">
                <i class="ti ti-devices" aria-hidden="true"></i> Equipos
              </div>
              <div v-for="eq in equipos" :key="eq.asignacion_id" class="lic-item">
                <div class="lic-info">
                  <span class="lic-software">{{ eq.codigo }} — {{ eq.tipo }} {{ eq.marca }}</span>
                  <span class="lic-fecha">{{ eq.modelo || '' }} · desde {{ formatFecha(eq.fecha_inicio) }}</span>
                </div>
                <RouterLink class="icon-btn" to="/equipos" title="Gestionar en el módulo Equipos">
                  <i class="ti ti-external-link"></i>
                </RouterLink>
              </div>
            </div>

            <!-- Licencias directas (las de login aparecen como cuentas en Accesos) -->
            <div v-if="licencias.length" class="lic-seccion">
              <div class="datos-title lic-title">
                <i class="ti ti-license" aria-hidden="true"></i> Licencias
              </div>
              <div v-for="lic in licencias" :key="lic.asignacion_id" class="lic-item">
                <div class="lic-info">
                  <span class="lic-software">{{ lic.software }}</span>
                  <span class="lic-fecha">desde {{ formatFecha(lic.fecha_inicio) }}</span>
                </div>
                <button class="icon-btn danger" type="button" title="Liberar asiento" @click="liberarLicencia(lic)">
                  <i class="ti ti-user-minus"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Accesos -->
          <CuentasPanel
            :key="empleado.id"
            class="accesos-panel"
            :empleado-id="empleado.id"
            :empleado-nombre="nombreCompleto"
            :empleado-empresa="empleado.empresa_nombre || ''"
            :empleado-whatsapp="empleado.whatsapp || ''"
          />
        </div>
      </template>
    </main>

    <EmpleadoForm
      v-if="mostrarForm"
      :empleado="empleado"
      @cerrar="onFormCerrado"
    />

    <BajaEmpleadoModal
      v-if="mostrarBaja"
      :empleado="empleado"
      @cerrar="onBajaCerrada"
    />
  </div>
</template>

<style scoped>
.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.btn-volver {
  flex-shrink: 0;
}

.emp-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  text-transform: uppercase;
}

.header-emp {
  min-width: 0;
}

.header-emp h1 {
  font-size: 17px;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.header-sub {
  font-size: 12.5px;
  color: var(--color-text-secondary);
}

.header-btns {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-baja {
  color: var(--color-danger-text);
  border-color: var(--color-danger-border);
}

.btn-baja:hover:not(:disabled) {
  background: var(--color-danger-bg);
  border-color: var(--color-danger-border);
}

.alta-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: color-mix(in srgb, var(--color-primary, var(--color-accent)) 6%, #fff);
  border: 1px solid color-mix(in srgb, var(--color-primary, var(--color-accent)) 25%, transparent);
  border-radius: var(--radius-lg, 12px);
  padding: 12px 16px;
  margin-bottom: 16px;
}

.alta-pasos {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.alta-paso {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.alta-paso i {
  font-size: 17px;
}

.alta-paso--hecho {
  color: var(--color-success-text);
}

.alta-paso--hecho i {
  color: var(--color-success);
}

.alta-sep {
  color: var(--color-text-secondary);
  opacity: 0.5;
  font-size: 14px;
}

.alta-cerrar {
  flex-shrink: 0;
}

.detalle-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  align-items: start;
}

@media (max-width: 900px) {
  .detalle-grid {
    grid-template-columns: 1fr;
  }
}

.datos-card {
  padding: 16px 20px 20px;
}

.datos-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 14px;
}

.datos-lista {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dato dt {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  margin-bottom: 2px;
}

.dato dd {
  margin: 0;
  font-size: 13.5px;
  color: var(--color-text-primary);
}

.dato-truncar {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dato--notas dd {
  white-space: pre-wrap;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.dato-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-primary);
  text-decoration: none;
}

.dato-link:hover {
  text-decoration: underline;
}

.lic-seccion {
  margin-top: 18px;
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}

.lic-title {
  margin-bottom: 10px;
}

.lic-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
}

.lic-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.lic-software {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.lic-fecha {
  font-size: 11.5px;
  color: var(--color-text-secondary);
}
</style>
