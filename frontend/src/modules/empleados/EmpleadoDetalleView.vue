<script setup>
// Expediente del empleado (versión "Expediente", plan de mejora Ciclo 21,
// pantalla 2): carátula → guía de alta → "En custodia" (cuentas, equipos y
// licencias en UNA tabla) + entregas y datos → tickets → libro de movimientos.
//
// Esta vista solo orquesta: la carga y los permisos por módulo viven en
// useExpedienteEmpleado.js, el libro en libroEmpleado.js y cada bloque en su
// componente. Lo que el usuario no puede ver (su rol no tiene el módulo) no se
// pide ni se pinta. El ciclo de vida del empleado (suspender, reactivar,
// reingresar, dar de baja, revisar accesos) corre por las RPC de la migración
// 102 desde los diálogos de este directorio.
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { showToast } from '../../core/toast.js';
import {
  nombreCompleto as nombreCompletoDe,
  altaIncompleta,
  pasosAlta as pasosAltaDe,
  pasosAltaVisibles,
  altaLista as altaListaDe,
} from '../../core/dominio-empleados.js';
import { fechaLocalISO } from '../../core/formatters.js';
import { useExpedienteEmpleado } from './useExpedienteEmpleado.js';
import EmpleadoCaratula from './EmpleadoCaratula.vue';
import EmpleadoGuiaAlta from './EmpleadoGuiaAlta.vue';
import EmpleadoCustodia from './EmpleadoCustodia.vue';
import EmpleadoEntregas from './EmpleadoEntregas.vue';
import EmpleadoDatos from './EmpleadoDatos.vue';
import EmpleadoTickets from './EmpleadoTickets.vue';
import EmpleadoLibro from './EmpleadoLibro.vue';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import EmpleadoMotivoDialog from './EmpleadoMotivoDialog.vue';
import ReingresarEmpleadoDialog from './ReingresarEmpleadoDialog.vue';
import AsignarEquipoModal from '../equipos/AsignarEquipoModal.vue';
import AsignarLicenciaModal from '../licencias/AsignarLicenciaModal.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const cuentasStore = useCuentasStore();

const exp = useExpedienteEmpleado(() => route.params.id);
const {
  empleado, equipos, licencias, entregas, tickets, ultimaRevision, cargando,
  libro, libroCargando, fechaBaja, actaEntregaPorAsignacion, nombresStaff,
  puedeCorreos, puedeEquipos, puedeLicencias, puedeTickets,
} = exp;

const nombreCompleto = computed(() => nombreCompletoDe(empleado.value));
const hayCustodia = computed(() => puedeCorreos.value || puedeEquipos.value || puedeLicencias.value);
const revisor = computed(() => nombresStaff.value[ultimaRevision.value?.revisado_por] || '');

// ── Alta guiada ─────────────────────────────────────────────────────────────
// Dos formas de entrar en ella, a propósito:
//  1. `?nuevo=1`: se acaba de crear a la persona desde "Nuevo empleado".
//  2. El alta está REALMENTE incompleta (misma regla que el feed de Inicio,
//     core/dominio-empleados.js): así la guía sobrevive a salir de la página.
// Ocultarla solo silencia el caso 1: un pendiente real no se descarta con una X.
// Sin el módulo `correos` no se sabe si hay cuentas, así que solo cuenta el caso 1.
const ocultarGuia = ref(false);
const llegaDeAlta = ref(route.query.nuevo === '1');

const faltaAlta = computed(() => {
  if (!empleado.value || !puedeCorreos.value || !exp.cuentasCargadas.value) return null;
  return altaIncompleta(empleado.value, { cuentas: cuentasStore.lista.length }, fechaLocalISO());
});
const modoAlta = computed(() => {
  if (ocultarGuia.value && !faltaAlta.value) return false;
  return llegaDeAlta.value || !!faltaAlta.value;
});

function terminarAlta() {
  ocultarGuia.value = true;
  llegaDeAlta.value = false;
  if (route.query.nuevo) router.replace({ query: {} });
}

const custodia = ref(null);
const mostrarAsignarEquipo = ref(false);
const mostrarAsignarLicencia = ref(false);

const tieneCuentas = computed(() => exp.cuentasCargadas.value && cuentasStore.lista.length > 0);

// "Entrega" no ofrece su botón hasta que haya una cuenta que enviar y alguien
// con permiso para enviarla.
const puedeEnviarEntrega = computed(
  () => puedeCorreos.value && auth.puedeVerCredenciales && empleado.value?.estado === 'Activo' && tieneCuentas.value,
);

const ACCIONES_PASO = {
  cuenta: () => custodia.value?.abrirNuevaCuenta(),
  entrega: () => enviarEntrega(),
  equipo: () => { mostrarAsignarEquipo.value = true; },
  licencia: () => { mostrarAsignarLicencia.value = true; },
};

const pasos = computed(() => pasosAltaVisibles(
  pasosAltaDe({
    cuentas: tieneCuentas.value ? 1 : 0,
    equipos: equipos.value.length,
    licencias: licencias.value.length,
    entregaEnviada: entregas.value.length > 0,
  }),
  (m) => auth.puedeVerModulo(m),
).map((p) => ({
  ...p,
  ejecutar: (p.id === 'entrega' && !puedeEnviarEntrega.value) ? undefined : ACCIONES_PASO[p.id],
})));
const altaLista = computed(() => altaListaDe(pasos.value));

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

// Tras cualquier transición el estado, la custodia (la baja cierra cuentas) y
// el libro cambian: se relee todo.
async function onCicloCerrado(hecho) {
  mostrarBaja.value = false;
  mostrarReingreso.value = false;
  dialogoMotivo.value = null;
  if (hecho) await exp.refrescar();
}

// Por id y no onMounted: al ir de una ficha a otra (/empleados/:id → otro :id)
// Vue Router reusa el componente y con onMounted se veían los datos del anterior.
watch(() => route.params.id, async (id) => {
  if (!id) return;
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
        v-if="modoAlta && pasos.length"
        :pasos="pasos"
        :lista="altaLista"
        :dias="faltaAlta ? faltaAlta.diasDesdeAlta : null"
        @cerrar="terminarAlta"
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
            <EmpleadoDatos :empleado="empleado" :revision="ultimaRevision" :revisor="revisor" />
          </aside>
        </div>

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
