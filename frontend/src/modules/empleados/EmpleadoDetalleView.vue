<script setup>
// Expediente del empleado (versión "Expediente", plan de mejora Ciclo 21,
// pantalla 2): carátula → guía de alta → "En custodia" (cuentas, equipos y
// licencias en UNA tabla) + entregas y datos → solicitudes → tickets → libro de
// movimientos.
//
// Esta vista solo orquesta: la carga y los permisos por módulo viven en
// useExpedienteEmpleado.js, el libro en libroEmpleado.js y cada bloque en su
// componente. Lo que el usuario no puede ver (su rol no tiene el módulo) no se
// pide ni se pinta. El ciclo de vida del empleado (suspender, reactivar,
// reingresar, dar de baja, revisar accesos) corre por las RPC de la migración
// 102 desde los diálogos de este directorio; las solicitudes (alta, baja,
// accesos, equipos), por las de la 108.
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import { diasDesde } from '../dashboard/tiempoLima.js';
import { useExpedienteEmpleado } from './useExpedienteEmpleado.js';
import EmpleadoCaratula from './EmpleadoCaratula.vue';
import EmpleadoGuiaAlta from './EmpleadoGuiaAlta.vue';
import EmpleadoCustodia from './EmpleadoCustodia.vue';
import EmpleadoEntregas from './EmpleadoEntregas.vue';
import EmpleadoPortal from './EmpleadoPortal.vue';
import PortalEnlaceDialog from './PortalEnlaceDialog.vue';
import EmpleadoDatos from './EmpleadoDatos.vue';
import EmpleadoSolicitudes from './EmpleadoSolicitudes.vue';
import EmpleadoTickets from './EmpleadoTickets.vue';
import EmpleadoLibro from './EmpleadoLibro.vue';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import EmpleadoMotivoDialog from './EmpleadoMotivoDialog.vue';
import ReingresarEmpleadoDialog from './ReingresarEmpleadoDialog.vue';
import AsignarEquipoModal from '../equipos/AsignarEquipoModal.vue';
import AsignarLicenciaModal from '../licencias/AsignarLicenciaModal.vue';
import SolicitudForm from '../solicitudes/SolicitudForm.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const cuentasStore = useCuentasStore();

const exp = useExpedienteEmpleado(() => route.params.id);
const {
  empleado, equipos, licencias, entregas, tickets, solicitudes, ultimaRevision, enlacePortal, cargando,
  libro, libroCargando, fechaBaja, actaEntregaPorAsignacion, nombresStaff,
  puedeCorreos, puedeEquipos, puedeLicencias, puedeTickets, puedeSolicitudes, puedeEmpleados,
} = exp;

const nombreCompleto = computed(() => nombreCompletoDe(empleado.value));
const hayCustodia = computed(() => puedeCorreos.value || puedeEquipos.value || puedeLicencias.value);
const revisor = computed(() => nombresStaff.value[ultimaRevision.value?.revisado_por] || '');

const custodia = ref(null);
const mostrarAsignarEquipo = ref(false);
const mostrarAsignarLicencia = ref(false);

const tieneCuentas = computed(() => exp.cuentasCargadas.value && cuentasStore.lista.length > 0);

// "Entrega" no ofrece su botón hasta que haya una cuenta que enviar y alguien
// con permiso para enviarla.
const puedeEnviarEntrega = computed(
  () => puedeCorreos.value && auth.puedeVerCredenciales && empleado.value?.estado === 'Activo' && tieneCuentas.value,
);

// ── Guía de alta = la solicitud de alta ABIERTA (migración 108) ──────────────
// El servidor guarda el trámite y marca solos los pasos que se hacen en otros
// módulos (cuenta, entrega abierta, equipo, licencia); aquí solo se le engancha
// a cada paso qué abre. Ocultarla silencia la guía en esta visita: el trámite
// sigue abierto en «Solicitudes» y en Inicio hasta que se complete.
const ocultarGuia = ref(false);
const solicitudAlta = computed(
  () => solicitudes.value.find((s) => s.tipo_id === 'alta_empleado' && s.estado === 'abierta') || null,
);
const modoAlta = computed(() => !!solicitudAlta.value && !ocultarGuia.value);
const diasAlta = computed(() => (solicitudAlta.value ? Math.max(0, diasDesde(solicitudAlta.value.created_at) ?? 0) : null));

// clave del paso → [texto del botón, qué abre]. Un paso sin entrada aquí es
// manual y se marca con «Marcar hecho».
const ACCIONES_PASO = {
  crear_cuenta: ['Crear cuenta', () => custodia.value?.abrirNuevaCuenta()],
  entregar_credenciales: ['Enviar por WhatsApp', () => enviarEntrega()],
  asignar_equipo: ['Entregar', () => { mostrarAsignarEquipo.value = true; }],
  asignar_licencia: ['Asignar', () => { mostrarAsignarLicencia.value = true; }],
};

async function marcarPasoGuia(paso) {
  try {
    await insforgeApi.completarPasoSolicitud(paso.id);
    await exp.refrescar();
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'solicitud', porDefecto: 'No se pudo marcar el paso.' }).mensaje, 'error');
  }
}

// Un paso se ofrece solo si quien mira tiene el módulo donde se hace (la entrega,
// además, el permiso de credenciales y una cuenta que enviar).
function accionDelPaso(paso) {
  if (paso.estado !== 'pendiente') return {};
  if (paso.modulo && !auth.puedeVerModulo(paso.modulo)) return {};
  const [accion, ejecutar] = ACCIONES_PASO[paso.clave] || ['Marcar hecho', () => marcarPasoGuia(paso)];
  if (paso.clave === 'entregar_credenciales' && !puedeEnviarEntrega.value) return {};
  if (paso.clave === 'crear_cuenta' && !custodia.value) return {};
  return { accion, ejecutar };
}

const pasosGuia = computed(() => (solicitudAlta.value?.pasos || []).map((p) => ({
  id: p.id,
  label: p.label,
  hecho: p.estado !== 'pendiente',
  omitido: p.estado === 'omitido',
  requisito: p.obligatorio,
  ...accionDelPaso(p),
})));

// ── Entrega de credenciales (enlace de un solo uso + WhatsApp) ───────────────
const enviandoEntrega = ref(false);

async function enviarEntrega() {
  enviandoEntrega.value = true;
  try {
    await enviarCredencialesWhatsApp({
      empleadoId: empleado.value.id,
      empleadoNombre: nombreCompleto.value,
      whatsapp: empleado.value.whatsapp || '',
      cuentaIds: cuentasStore.lista.map((c) => c.cuenta_id),
    });
    await exp.refrescar();
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudo crear la entrega.' }).mensaje, 'error');
  } finally {
    enviandoEntrega.value = false;
  }
}

// ── Acciones de la carátula ─────────────────────────────────────────────────
const mostrarForm = ref(false);
const mostrarBaja = ref(false);
const mostrarReingreso = ref(false);
const mostrarSolicitud = ref(false);
const mostrarPortal = ref(false);
const dialogoMotivo = ref(null); // 'suspender' | 'reactivar' | 'revisar' | null

const resumenRevision = computed(() => ({
  ...(puedeCorreos.value ? { cuentas: cuentasStore.lista.length } : {}),
  ...(puedeEquipos.value ? { equipos: equipos.value.length } : {}),
  ...(puedeLicencias.value ? { licencias: licencias.value.length } : {}),
}));

// "Agregar" de la custodia: equipo y licencia abren su diálogo; la cuenta la
// abre la propia tabla.
function onAgregar(tipo) {
  if (tipo === 'equipo') mostrarAsignarEquipo.value = true;
  else mostrarAsignarLicencia.value = true;
}

function onAccion(id) {
  if (id === 'editar') mostrarForm.value = true;
  else if (id === 'baja') mostrarBaja.value = true;
  else if (id === 'reingresar') mostrarReingreso.value = true;
  else if (id === 'imprimir') window.print();
  else dialogoMotivo.value = id; // suspender | reactivar | revisar
}

async function onFormCerrado(guardado) {
  mostrarForm.value = false;
  if (guardado) {
    await exp.refrescar();
    showToast('Empleado actualizado');
  }
}

// Tras cualquier transición el estado, la custodia (la baja cierra cuentas), las
// solicitudes (la baja abre la suya y cancela las otras) y el libro cambian: se
// relee todo.
async function onCicloCerrado(hecho) {
  mostrarBaja.value = false;
  mostrarReingreso.value = false;
  dialogoMotivo.value = null;
  if (hecho) await exp.refrescar();
}

// Portal del empleado (109): el enlace se genera o se revoca; solo se relee su estado.
async function onPortalCerrado(hubo) {
  mostrarPortal.value = false;
  if (hubo) await exp.cargarEnlacePortal();
}

async function onSolicitudCerrada(creada) {
  mostrarSolicitud.value = false;
  if (!creada) return;
  showToast(`Solicitud ${creada.codigo} abierta`);
  await exp.refrescar();
}

// Por id y no onMounted: al ir de una ficha a otra (/empleados/:id → otro :id)
// Vue Router reusa el componente y con onMounted se veían los datos del anterior.
watch(() => route.params.id, async (id) => {
  if (!id) return;
  ocultarGuia.value = false;
  const ficha = await exp.cargar();
  if (!ficha && !exp.errorFicha.value) {
    showToast('Empleado no encontrado', 'error');
    router.replace('/empleados');
  }
}, { immediate: true });
</script>

<template>
  <div class="w-full pb-10">
    <p v-if="cargando" class="px-4 py-16 text-center text-sm text-gray-500 sm:px-6" role="status">Cargando empleado...</p>

    <p v-else-if="!empleado" class="px-4 py-16 text-center text-sm text-gray-500 sm:px-6">No se encontró el empleado.</p>

    <template v-else>
      <EmpleadoCaratula :empleado="empleado" :fecha-baja="fechaBaja" @accion="onAccion" />

      <EmpleadoGuiaAlta
        v-if="modoAlta && pasosGuia.length"
        :pasos="pasosGuia"
        :solicitud="solicitudAlta"
        :dias="diasAlta"
        @cerrar="ocultarGuia = true"
      />

      <div class="space-y-6 px-4 pt-6 sm:px-6">
        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <EmpleadoCustodia
            v-if="hayCustodia"
            ref="custodia"
            :key="empleado.id"
            :empleado="empleado"
            :cuentas="cuentasStore.lista"
            :equipos="equipos"
            :licencias="licencias"
            :acta-por-asignacion="actaEntregaPorAsignacion"
            :puede-correos="puedeCorreos"
            :puede-equipos="puedeEquipos"
            :puede-licencias="puedeLicencias"
            :cargando-cuentas="cuentasStore.cargando"
            :error-cuentas="cuentasStore.error || ''"
            @cambio="exp.refrescar()"
            @agregar="onAgregar"
          />

          <aside class="min-w-0 space-y-6 lg:col-start-2" aria-label="Entregas y datos del empleado">
            <EmpleadoEntregas
              v-if="puedeCorreos"
              :entregas="entregas"
              :puede-enviar="puedeEnviarEntrega"
              :enviando="enviandoEntrega"
              @enviar="enviarEntrega"
            />
            <EmpleadoPortal v-if="puedeEmpleados && empleado.estado === 'Activo'" :enlace="enlacePortal" @abrir="mostrarPortal = true" />
            <EmpleadoDatos :empleado="empleado" :revision="ultimaRevision" :revisor="revisor" />
          </aside>
        </div>

        <EmpleadoSolicitudes
          v-if="puedeSolicitudes"
          :solicitudes="solicitudes"
          :puede-crear="empleado.estado === 'Activo'"
          @nueva="mostrarSolicitud = true"
        />

        <EmpleadoTickets v-if="puedeTickets" :tickets="tickets" />

        <EmpleadoLibro :filas="libro" :cargando="libroCargando" />
      </div>
    </template>

    <EmpleadoForm v-if="mostrarForm" :empleado="empleado" @cerrar="onFormCerrado" />

    <BajaEmpleadoModal v-if="mostrarBaja" :empleado="empleado" @cerrar="onCicloCerrado" />

    <EmpleadoMotivoDialog
      v-if="dialogoMotivo"
      :accion="dialogoMotivo"
      :empleado="empleado"
      :resumen="resumenRevision"
      @cerrar="onCicloCerrado"
    />

    <ReingresarEmpleadoDialog v-if="mostrarReingreso" :empleado="empleado" @cerrar="onCicloCerrado" />

    <PortalEnlaceDialog v-if="mostrarPortal" :empleado="empleado" :enlace="enlacePortal" @cerrar="onPortalCerrado" />

    <SolicitudForm v-if="mostrarSolicitud" :empleado="empleado" @cerrar="onSolicitudCerrada" />

    <AsignarEquipoModal
      v-if="mostrarAsignarEquipo"
      :empleado-id="empleado.id"
      :empleado-nombre="nombreCompleto"
      @close="mostrarAsignarEquipo = false"
      @asignado="exp.refrescar()"
    />

    <AsignarLicenciaModal
      v-if="mostrarAsignarLicencia"
      :empleado-id="empleado.id"
      :empleado-nombre="nombreCompleto"
      @close="mostrarAsignarLicencia = false"
      @asignado="exp.refrescar()"
    />
  </div>
</template>
