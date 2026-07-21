<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatTelefono } from '../../core/formatters.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
// Carga diferida: html2canvas + los logos embebidos pesan ~500 KB y la
// mayoría de visitas a una ficha no generan una firma.
const FirmaCorreoModal = defineAsyncComponent(() => import('./FirmaCorreoModal.vue'));
import CuentasPanel from '../cuentas/CuentasPanel.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const route = useRoute();
const router = useRouter();
const empleadosStore = useEmpleadosStore();
const cuentasStore = useCuentasStore();
const { volver } = useVolverContextual();

const empleado = ref(null);
const licencias = ref([]);
const equipos = ref([]);
const cargando = ref(true);
const procesando = ref(false);
const mostrarForm = ref(false);
const mostrarBaja = ref(false);
const mostrarFirma = ref(false);

// Alta guiada: se llega con ?nuevo=1 desde "Nuevo empleado"
const modoAlta = ref(route.query.nuevo === '1');
const tieneAccesos = computed(() =>
  cuentasStore.empleadoActual === route.params.id && cuentasStore.lista.length > 0
);

function terminarAlta() {
  modoAlta.value = false;
  router.replace({ query: {} });
}

const nombreCompleto = computed(() => nombreCompletoDe(empleado.value));

const iniciales = computed(() =>
  empleado.value ? `${empleado.value.nombres[0] || ''}${empleado.value.apellidos[0] || ''}` : ''
);

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

// Mismos umbrales de vencimiento que LicenciasView (30 días); aquí solo
// se badgea lo problemático — una licencia sana no necesita señal.
const HOY = new Date().toISOString().split('T')[0];
const EN_30_DIAS = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
})();

function vencimientoLicencia(lic) {
  if (lic.tipo === 'perpetua' || !lic.fecha_vencimiento) return null;
  if (lic.fecha_vencimiento < HOY) return { clase: 'badge--danger', texto: 'Vencida' };
  if (lic.fecha_vencimiento <= EN_30_DIAS) return { clase: 'badge--warning', texto: 'Por vencer' };
  return null;
}

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porLiberarLicencia = ref(null);
const liberandoLicencia = ref(false);
const dialogoLiberarLicencia = ref(null);

async function confirmarLiberarLicencia() {
  const lic = porLiberarLicencia.value;
  if (!lic) return;
  liberandoLicencia.value = true;
  try {
    await insforgeApi.cerrarAsignacionLicencia(lic.asignacion_id);
    licencias.value = licencias.value.filter((l) => l.asignacion_id !== lic.asignacion_id);
    showToast('Asiento liberado');
    dialogoLiberarLicencia.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al liberar', 'error');
  } finally {
    liberandoLicencia.value = false;
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

// Confirmación no destructiva (ConfirmDialog compartido): "Reactivar" es lo
// opuesto de "Dar de baja" — usa el botón primario, no btn-danger.
const mostrarReactivar = ref(false);
const dialogoReactivar = ref(null);

async function confirmarReactivar() {
  procesando.value = true;
  try {
    empleado.value = await insforgeApi.reactivarEmpleado(empleado.value.id);
    sincronizarStore();
    showToast(`${nombreCompleto.value} reactivado`);
    dialogoReactivar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al reactivar', 'error');
  } finally {
    procesando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="detalle-page vista-modulo">
    <PageHeader>
      <template #izquierda>
        <button class="icon-btn btn-volver" type="button" title="Volver" @click="volver('/empleados')">
          <i class="ti ti-arrow-left"></i>
        </button>
        <template v-if="empleado">
          <div class="emp-avatar">{{ iniciales }}</div>
          <div class="header-emp">
            <h1>
              {{ nombreCompleto }}
              <BadgeEstado tipo="empleado" :valor="empleado.estado" status />
            </h1>
            <span class="header-sub">
              <TextoVacio :valor="empleado.cargo" placeholder="Sin cargo" />
              <template v-if="empleado.empresa_nombre"> · {{ empleado.empresa_nombre }}</template>
            </span>
          </div>
        </template>
        <div v-else class="header-emp">
          <h1>Empleado</h1>
        </div>
      </template>
      <template v-if="empleado" #acciones>
        <button class="btn" type="button" :disabled="procesando" @click="mostrarForm = true">
          <i class="ti ti-pencil" aria-hidden="true"></i> Editar
        </button>
        <button class="btn" type="button" :disabled="procesando" @click="mostrarFirma = true">
          <i class="ti ti-signature" aria-hidden="true"></i> Generar firma
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
          @click="mostrarReactivar = true"
        >
          <i class="ti ti-user-check" aria-hidden="true"></i> Reactivar
        </button>
      </template>
    </PageHeader>

    <main class="page page--padded detalle-body">
      <div v-if="cargando" class="no-results">Cargando empleado...</div>

      <template v-else-if="empleado">
        <!-- Banner de alta guiada -->
        <div v-if="modoAlta" class="alta-banner">
          <div class="alta-pasos">
            <div class="alta-paso alta-paso--hecho">
              <i class="ti ti-circle-check"></i>
              <span><strong>1.</strong> Empleado registrado</span>
            </div>
            <i class="ti ti-chevron-right alta-sep"></i>
            <div class="alta-paso" :class="{ 'alta-paso--hecho': tieneAccesos }">
              <i :class="tieneAccesos ? 'ti ti-circle-check' : 'ti ti-circle-2'"></i>
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
                <dd><TextoVacio :valor="empleado.empresa_nombre" /></dd>
              </div>
              <div class="dato">
                <dt>Cargo</dt>
                <dd><TextoVacio :valor="empleado.cargo" /></dd>
              </div>
              <div class="dato">
                <dt>Área/Obra</dt>
                <dd><TextoVacio :valor="empleado.area_obra_nombre" /></dd>
              </div>
              <div class="dato">
                <dt>Fecha de alta</dt>
                <dd><TextoVacio :valor="formatFecha(empleado.fecha_alta)" /></dd>
              </div>
              <div class="dato">
                <dt>Teléfono</dt>
                <dd><TextoVacio :valor="formatTelefono(empleado.telefono)" /></dd>
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
                  <TextoVacio v-else />
                </dd>
              </div>
              <div class="dato">
                <dt>Correo personal</dt>
                <dd class="dato-truncar" :title="empleado.correo_personal"><TextoVacio :valor="empleado.correo_personal" /></dd>
              </div>
              <div v-if="empleado.notas" class="dato dato--notas">
                <dt>Notas</dt>
                <dd>{{ empleado.notas }}</dd>
              </div>
            </dl>
          </div>

          <!-- Vínculos: Accesos + Equipos + Licencias -->
          <div class="col-vinculos">
            <CuentasPanel
              :key="empleado.id"
              class="accesos-panel"
              :empleado-id="empleado.id"
              :empleado-nombre="nombreCompleto"
              :empleado-whatsapp="empleado.whatsapp || ''"
            />

            <div class="paneles-duo">
              <!-- Equipos que porta (entrega/devolución se registran en el módulo Equipos) -->
              <div class="card panel-card">
                <div class="panel-toolbar">
                  <div class="panel-title">
                    <i class="ti ti-devices" aria-hidden="true"></i>
                    Equipos
                    <span class="badge-count">{{ equipos.length }}</span>
                  </div>
                  <RouterLink class="btn" to="/equipos" title="La entrega se registra en el módulo Equipos">
                    <i class="ti ti-plus" aria-hidden="true"></i> Asignar
                  </RouterLink>
                </div>

                <p v-if="equipos.length === 0" class="panel-vacio">
                  Sin equipos asignados — la entrega se registra en el módulo Equipos.
                </p>
                <ul v-else class="panel-lista">
                  <li v-for="eq in equipos" :key="eq.asignacion_id" class="panel-item">
                    <div class="panel-item-info">
                      <span class="panel-item-titulo">
                        <span class="mono">{{ eq.codigo }}</span>
                        · {{ [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ') }}
                        <BadgeEstado
                          v-if="eq.estado && eq.estado !== 'operativo'"
                          tipo="situacion"
                          :valor="eq.situacion"
                          inline
                          class="badge-inline"
                        />
                      </span>
                      <span class="panel-item-meta">Desde {{ formatFecha(eq.fecha_inicio) }}</span>
                    </div>
                    <div class="actions">
                      <RouterLink
                        class="icon-btn"
                        :to="{ path: '/equipos', query: { q: eq.codigo } }"
                        title="Gestionar en el módulo Equipos"
                        aria-label="Gestionar en el módulo Equipos"
                      >
                        <i class="ti ti-external-link"></i>
                      </RouterLink>
                    </div>
                  </li>
                </ul>
              </div>

              <!-- Licencias directas (las de login aparecen como cuentas en Accesos) -->
              <div class="card panel-card">
                <div class="panel-toolbar">
                  <div class="panel-title">
                    <i class="ti ti-license" aria-hidden="true"></i>
                    Licencias
                    <span class="badge-count">{{ licencias.length }}</span>
                  </div>
                  <RouterLink class="btn" to="/licencias" title="Los asientos se asignan en el módulo Licencias">
                    <i class="ti ti-plus" aria-hidden="true"></i> Asignar
                  </RouterLink>
                </div>

                <p v-if="licencias.length === 0" class="panel-vacio">
                  Sin licencias directas — las de login aparecen como cuentas en Accesos.
                </p>
                <ul v-else class="panel-lista">
                  <li v-for="lic in licencias" :key="lic.asignacion_id" class="panel-item">
                    <div class="panel-item-info">
                      <span class="panel-item-titulo">
                        {{ lic.software }}
                        <span
                          v-if="vencimientoLicencia(lic)"
                          class="badge badge-inline"
                          :class="vencimientoLicencia(lic).clase"
                        >{{ vencimientoLicencia(lic).texto }}</span>
                      </span>
                      <span class="panel-item-meta">
                        Desde {{ formatFecha(lic.fecha_inicio) }}
                        <template v-if="lic.tipo === 'perpetua'"> · perpetua</template>
                        <template v-else-if="lic.fecha_vencimiento"> · vence {{ formatFecha(lic.fecha_vencimiento) }}</template>
                      </span>
                    </div>
                    <div class="actions">
                      <RouterLink
                        class="icon-btn"
                        :to="{ path: '/licencias', query: { q: lic.software } }"
                        title="Ver en el módulo Licencias"
                        aria-label="Ver en el módulo Licencias"
                      >
                        <i class="ti ti-external-link"></i>
                      </RouterLink>
                      <button
                        class="icon-btn danger"
                        type="button"
                        title="Liberar asiento"
                        aria-label="Liberar asiento"
                        @click="porLiberarLicencia = lic"
                      >
                        <i class="ti ti-user-minus"></i>
                      </button>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
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

    <FirmaCorreoModal
      v-if="mostrarFirma"
      :empleado="empleado"
      @cerrar="mostrarFirma = false"
    />

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porLiberarLicencia"
      ref="dialogoLiberarLicencia"
      destructivo
      icono="ti-user-minus"
      titulo="Liberar asiento"
      :mensaje="`¿Liberar el asiento de “${porLiberarLicencia.software}” de este empleado?`"
      confirmar-label="Liberar"
      :cargando="liberandoLicencia"
      @cancel="porLiberarLicencia = null"
      @confirm="confirmarLiberarLicencia"
    />

    <!-- Confirmación no destructiva (ConfirmDialog compartido) -->
    <ConfirmDialog
      v-if="mostrarReactivar"
      ref="dialogoReactivar"
      titulo="Reactivar empleado"
      :mensaje="`¿Reactivar a ${nombreCompleto}? Volverá al estado Activo.`"
      confirmar-label="Reactivar"
      :cargando="procesando"
      @cancel="mostrarReactivar = false"
      @confirm="confirmarReactivar"
    />
  </div>
</template>

<style scoped>
/* .header-left/.header-inner se estilan en main.css (shell de PageHeader) */
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

/* Columna derecha: Accesos arriba, Equipos + Licencias en dúo debajo */
.col-vinculos {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.paneles-duo {
  display: grid;
  /* min(320px, 100%): en teléfonos angostos (<352px de viewport) la
     columna cede en lugar de desbordar horizontalmente */
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: 16px;
  align-items: start;
}

/* Misma estructura de toolbar que el panel de Accesos (CuentasPanel) */
.panel-card {
  padding: 0 0 6px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Vacío compacto: estos paneles son secundarios, no ameritan el EmptyState grande */
.panel-vacio {
  margin: 0;
  padding: 18px 20px;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.panel-lista {
  list-style: none;
  margin: 0;
  padding: 6px 8px;
}

.panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}

.panel-item:hover {
  background: var(--color-bg-subtle);
}

.panel-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-item-titulo {
  font-size: 13px;
  color: var(--color-text-primary);
}

.panel-item-meta {
  font-size: 11.5px;
  color: var(--color-text-secondary);
}

/* Identificadores en mono — solo cambia la familia, nunca peso/color */
.mono {
  font-family: var(--font-mono, monospace);
}

.badge-inline {
  margin-left: 6px;
  vertical-align: middle;
}
</style>
