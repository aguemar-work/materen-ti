<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import { showToast } from '../../core/toast.js';
import { estadoVencimientoLicencia, CLASE_VENCIMIENTO_LICENCIA } from '../../core/dominio-licencias.js';
import {
  nombreCompleto as nombreCompletoDe,
  altaIncompleta,
  pasosAlta as pasosAltaDe,
  altaLista as altaListaDe,
} from '../../core/dominio-empleados.js';
import { formatFecha, formatTelefono, fechaLocalISO } from '../../core/formatters.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import { rolDeTag } from '../../core/tagRol.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import CuentasPanel from '../cuentas/CuentasPanel.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AsignarEquipoModal from '../equipos/AsignarEquipoModal.vue';
import AsignarLicenciaModal from '../licencias/AsignarLicenciaModal.vue';

const route = useRoute();
const router = useRouter();
const empleadosStore = useEmpleadosStore();
const cuentasStore = useCuentasStore();
const { volver } = useVolverContextual();

const empleado = ref(null);
const licencias = ref([]);
const equipos = ref([]);
const entregaEnviada = ref(false);
const cargando = ref(true);
const procesando = ref(false);
const mostrarForm = ref(false);
const mostrarBaja = ref(false);
const mostrarAsignarEquipo = ref(false);
const mostrarAsignarLicencia = ref(false);

// Alta guiada. Dos formas de entrar en ella, a propósito:
//
// 1. `?nuevo=1` — se acaba de crear la persona desde "Nuevo empleado". La
//    guía aparece aunque todavía no falte nada, porque es el momento de
//    hacerlo.
// 2. El alta está REALMENTE incompleta — misma regla que alimenta el feed de
//    pendientes del Dashboard (core/dominio-empleados.js). Esto es lo que
//    hace que la guía sobreviva a salir de la página: antes vivía solo en el
//    query param, así que cerrar la pestaña o entrar desde el buscador la
//    perdía y nada volvía a avisar de que el alta quedó a medias.
//
// Ocultarla (la X) solo silencia el caso 1. Si el alta sigue incompleta de
// verdad, el aviso vuelve — no se puede descartar un pendiente real haciendo
// clic en una X, del mismo modo que ningún otro pendiente del sistema se
// marca como visto.
const ocultarGuia = ref(false);
const llegaDeAlta = ref(route.query.nuevo === '1');
const tieneAccesos = computed(() =>
  cuentasStore.empleadoActual === route.params.id && cuentasStore.lista.length > 0
);

const cuentasCargadas = computed(() => cuentasStore.empleadoActual === route.params.id);

const faltaAlta = computed(() => {
  // Hasta que las cuentas de ESTE empleado estén cargadas no se sabe nada:
  // asumir cero acá haría parpadear el aviso en cada carga de ficha.
  if (!empleado.value || !cuentasCargadas.value) return null;
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

// Ref al panel de cuentas para que el paso "Cuenta" abra su formulario
// directamente. Sin esto, la guía dice qué falta pero deja al usuario
// buscando el botón correcto más abajo en la página — que es justo lo que
// hacía que el alta se completara a medias.
const cuentasPanel = ref(null);

// Qué pasos hay y cuáles están hechos lo decide el dominio
// (core/dominio-empleados.js): "qué hace falta para que alguien pueda empezar
// a trabajar" es una regla de negocio, no de presentación. Acá solo se le
// engancha a cada paso qué abre su botón, que sí es cosa de esta vista.
const ACCIONES_PASO = {
  cuenta: () => cuentasPanel.value?.abrirNueva(),
  entrega: () => cuentasPanel.value?.enviarWhatsApp(),
  equipo: () => { mostrarAsignarEquipo.value = true; },
  licencia: () => { mostrarAsignarLicencia.value = true; },
};

const pasosAlta = computed(() =>
  pasosAltaDe({
    cuentas: tieneAccesos.value ? 1 : 0,
    equipos: equipos.value.length,
    licencias: licencias.value.length,
    entregaEnviada: entregaEnviada.value,
  }).map((p) => ({
    // "Entrega" no ofrece su botón hasta que haya una cuenta que enviar —
    // no tiene sentido abrir el WhatsApp de un empleado sin credenciales.
    ...p,
    ejecutar: (p.id === 'entrega' && !tieneAccesos.value) ? undefined : ACCIONES_PASO[p.id],
  })),
);

const altaLista = computed(() => altaListaDe(pasosAlta.value));

const nombreCompleto = computed(() => nombreCompletoDe(empleado.value));

// Pasos ya cumplidos de la guía de alta (barra de progreso).
const pasosHechos = computed(() => pasosAlta.value.filter((p) => p.hecho).length);

// Columna lateral de la ficha (rediseño 2026-09-22). El índice 1 de
// datosContacto (WhatsApp) se pinta como enlace vía el slot de AppListaDatos.
const datosContacto = computed(() => {
  const e = empleado.value;
  if (!e) return [];
  return [
    { label: 'Teléfono', valor: e.telefono ? formatTelefono(e.telefono) : '', mono: true },
    { label: 'WhatsApp', valor: e.whatsapp ? formatTelefono(e.whatsapp) : '', mono: true },
    { label: 'Correo personal', valor: e.correo_personal },
  ];
});

const datosOrganizacion = computed(() => {
  const e = empleado.value;
  if (!e) return [];
  return [
    { label: 'Empresa', valor: e.empresa_nombre },
    { label: 'Cargo', valor: e.cargo },
    { label: 'Área/Obra', valor: e.area_obra_nombre },
    { label: 'Ubicación', valor: e.ubicacion_nombre },
    { label: 'Fecha de alta', valor: e.fecha_alta ? formatFecha(e.fecha_alta) : '' },
  ];
});

async function cargar() {
  cargando.value = true;
  try {
    const [emp, lics, eqs, entregada] = await Promise.all([
      insforgeApi.getEmpleado(route.params.id),
      insforgeApi.licenciasPorEmpleado(route.params.id),
      insforgeApi.equiposPorEmpleado(route.params.id),
      insforgeApi.tieneEntrega(route.params.id),
    ]);
    empleado.value = emp;
    licencias.value = lics;
    equipos.value = eqs;
    entregaEnviada.value = entregada;
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

// Mismo umbral de vencimiento que LicenciasView (core/dominio-licencias.js);
// aquí solo se badgea lo problemático — una licencia sana no necesita señal.
function vencimientoLicencia(lic) {
  const estado = estadoVencimientoLicencia(lic);
  if (estado === 'vencida') return { clase: CLASE_VENCIMIENTO_LICENCIA.vencida, texto: 'Vencida' };
  if (estado === 'por_vencer') return { clase: CLASE_VENCIMIENTO_LICENCIA.por_vencer, texto: 'Por vencer' };
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
  <div class="mx-auto w-full max-w-7xl px-4 pb-10 pt-5 sm:px-6">
    <button
      type="button"
      class="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      @click="volver('/empleados')"
    >
      <i class="ti ti-arrow-left" aria-hidden="true"></i>
      Empleados
    </button>

    <p v-if="cargando" class="py-16 text-center text-sm text-gray-500" role="status">Cargando empleado...</p>

    <p v-else-if="!empleado" class="py-16 text-center text-sm text-gray-500">No se encontró el empleado.</p>

    <template v-else>
      <!-- ══ Perfil ═══════════════════════════════════════════════ -->
      <header class="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <AppAvatar :nombre="nombreCompleto" tamano="xl" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 class="text-2xl font-semibold tracking-tight text-gray-900">{{ nombreCompleto }}</h1>
            <BadgeEstado tipo="empleado" :valor="empleado.estado" status />
          </div>
          <p class="mt-1 text-sm text-gray-600">
            {{ empleado.cargo || 'Sin cargo' }}<template v-if="empleado.empresa_nombre"> · {{ empleado.empresa_nombre }}</template>
          </p>
          <ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-500">
            <li class="inline-flex items-center gap-1.5 tabular-nums"><i class="ti ti-id" aria-hidden="true"></i>DNI {{ empleado.dni }}</li>
            <li v-if="empleado.ubicacion_nombre" class="inline-flex items-center gap-1.5"><i class="ti ti-map-pin" aria-hidden="true"></i>{{ empleado.ubicacion_nombre }}</li>
            <li v-if="empleado.area_obra_nombre" class="inline-flex items-center gap-1.5"><i class="ti ti-building" aria-hidden="true"></i>{{ empleado.area_obra_nombre }}</li>
            <li v-if="empleado.fecha_alta" class="inline-flex items-center gap-1.5"><i class="ti ti-calendar" aria-hidden="true"></i>Alta {{ formatFecha(empleado.fecha_alta) }}</li>
          </ul>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <AppButton variant="outline" severity="secondary" icon="ti ti-pencil" label="Editar" :disabled="procesando" @click="mostrarForm = true" />
          <AppButton
            v-if="empleado.estado !== 'Inactivo'"
            variant="outline"
            severity="danger"
            icon="ti ti-user-off"
            label="Dar de baja"
            :disabled="procesando"
            @click="mostrarBaja = true"
          />
          <AppButton
            v-else
            icon="ti ti-user-check"
            label="Reactivar"
            :disabled="procesando"
            @click="mostrarReactivar = true"
          />
        </div>
      </header>

      <!-- ══ Guía de alta: cada paso pendiente ES su propia acción ═══ -->
      <section
        v-if="modoAlta"
        class="mt-6 rounded-lg border border-gray-200 bg-white p-4"
        aria-labelledby="alta-titulo"
      >
        <div class="flex flex-wrap items-center gap-3">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full text-base"
            :class="altaLista ? 'bg-green-50 text-green-600' : 'bg-primary-50 text-primary-600'"
          >
            <i :class="altaLista ? 'ti ti-check' : 'ti ti-user-plus'" aria-hidden="true"></i>
          </span>
          <div class="min-w-0 flex-1">
            <h2 id="alta-titulo" class="text-sm font-semibold text-gray-900">{{ altaLista ? 'Alta completa' : 'Alta en curso' }}</h2>
            <p class="text-xs text-gray-500">
              {{ pasosHechos }} de {{ pasosAlta.length }} pasos
              <template v-if="faltaAlta && faltaAlta.diasDesdeAlta > 0"> · entró hace {{ faltaAlta.diasDesdeAlta }} {{ faltaAlta.diasDesdeAlta === 1 ? 'día' : 'días' }}</template>
              <template v-else-if="!altaLista"> · entró hoy</template>
            </p>
          </div>
          <button
            class="icon-btn"
            type="button"
            :title="altaLista ? 'Ocultar' : 'Ocultar la guía'"
            aria-label="Ocultar la guía de alta"
            @click="terminarAlta"
          >
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="mt-3 h-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="altaLista ? 'bg-green-500' : 'bg-primary-500'"
            :style="{ width: `${pasosAlta.length ? (pasosHechos / pasosAlta.length) * 100 : 0}%` }"
          ></div>
        </div>
        <ol class="mt-4 grid gap-2 md:grid-cols-3">
          <li
            v-for="paso in pasosAlta"
            :key="paso.id"
            class="flex items-center gap-2.5 rounded-md px-3 py-2.5"
            :class="paso.hecho ? 'bg-gray-50 text-gray-500' : 'bg-white ring-1 ring-gray-200'"
          >
            <i
              class="text-base"
              :class="paso.hecho ? 'ti ti-circle-check text-green-600' : 'ti ti-circle-dashed text-gray-500'"
              aria-hidden="true"
            ></i>
            <span class="min-w-0 flex-1 text-sm" :class="paso.hecho ? 'line-through decoration-gray-300' : 'text-gray-900'">
              {{ paso.label }}
              <span v-if="!paso.requisito && !paso.hecho" class="ml-1 text-xs text-gray-500">opcional</span>
            </span>
            <AppButton
              v-if="!paso.hecho && paso.ejecutar"
              size="sm"
              variant="text"
              :label="paso.accion"
              @click="paso.ejecutar()"
            />
          </li>
        </ol>
      </section>

      <!-- ══ Cuerpo: vínculos (principal) + datos (lateral) ══════════ -->
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="min-w-0 space-y-6">
          <CuentasPanel
            ref="cuentasPanel"
            :key="empleado.id"
            :empleado-id="empleado.id"
            :empleado-nombre="nombreCompleto"
            :empleado-whatsapp="empleado.whatsapp || ''"
            @entrega-enviada="entregaEnviada = true"
          />

          <!-- Equipos que porta (entrega/devolución se registran en Equipos) -->
          <AppSeccion titulo="Equipos" :conteo="equipos.length" sin-padding>
            <template #acciones>
              <AppButton size="sm" variant="text" icon="ti ti-plus" label="Asignar" @click="mostrarAsignarEquipo = true" />
            </template>
            <AppVacio v-if="equipos.length === 0" variante="seccion" titulo="Sin equipos asignados" />
            <ul v-else class="divide-y divide-gray-100">
              <li v-for="eq in equipos" :key="eq.asignacion_id" class="group flex items-center gap-3 px-4 py-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                  <i class="ti ti-device-laptop" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 text-sm text-gray-900">
                    <span class="font-medium tabular-nums">{{ eq.codigo }}</span>
                    <span class="truncate text-gray-600">{{ [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ') }}</span>
                    <BadgeEstado v-if="eq.estado && eq.estado !== 'operativo'" tipo="situacion" :valor="eq.situacion" />
                  </div>
                  <div class="text-xs text-gray-500">Desde {{ formatFecha(eq.fecha_inicio) }}</div>
                </div>
                <RouterLink
                  class="icon-btn"
                  :to="{ path: '/equipos', query: { q: eq.codigo } }"
                  title="Gestionar en el módulo Equipos"
                  aria-label="Gestionar en el módulo Equipos"
                >
                  <i class="ti ti-arrow-up-right" aria-hidden="true"></i>
                </RouterLink>
              </li>
            </ul>
          </AppSeccion>

          <!-- Licencias directas (las de login aparecen como cuentas en Accesos) -->
          <AppSeccion titulo="Licencias" :conteo="licencias.length" sin-padding>
            <template #acciones>
              <AppButton size="sm" variant="text" icon="ti ti-plus" label="Asignar" @click="mostrarAsignarLicencia = true" />
            </template>
            <AppVacio
              v-if="licencias.length === 0"
              variante="seccion"
              titulo="Sin licencias directas"
              mensaje="Las licencias de login aparecen como cuentas en Accesos."
            />
            <ul v-else class="divide-y divide-gray-100">
              <li v-for="lic in licencias" :key="lic.asignacion_id" class="group flex items-center gap-3 px-4 py-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                  <i class="ti ti-license" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 text-sm">
                    <span class="font-medium text-gray-900">{{ lic.software }}</span>
                    <AppTag
                      v-if="vencimientoLicencia(lic)"
                      :tono="rolDeTag(vencimientoLicencia(lic).clase)"
                    >{{ vencimientoLicencia(lic).texto }}</AppTag>
                  </div>
                  <div class="text-xs text-gray-500">
                    Desde {{ formatFecha(lic.fecha_inicio) }}
                    <template v-if="lic.tipo === 'perpetua'"> · perpetua</template>
                    <template v-else-if="lic.fecha_vencimiento"> · vence {{ formatFecha(lic.fecha_vencimiento) }}</template>
                  </div>
                </div>
                <div class="flex items-center gap-0.5">
                  <RouterLink
                    class="icon-btn"
                    :to="{ path: '/licencias', query: { q: lic.software } }"
                    title="Ver en el módulo Licencias"
                    aria-label="Ver en el módulo Licencias"
                  >
                    <i class="ti ti-arrow-up-right" aria-hidden="true"></i>
                  </RouterLink>
                  <button
                    class="icon-btn danger"
                    type="button"
                    title="Liberar asiento"
                    aria-label="Liberar asiento"
                    @click="porLiberarLicencia = lic"
                  >
                    <i class="ti ti-user-minus" aria-hidden="true"></i>
                  </button>
                </div>
              </li>
            </ul>
          </AppSeccion>
        </div>

        <!-- ── Lateral: datos personales y de contacto ── -->
        <aside class="space-y-6 lg:sticky lg:top-6">
          <AppSeccion titulo="Contacto">
            <AppListaDatos :datos="datosContacto">
              <template v-if="empleado.whatsapp" #valor-1>
                <a
                  class="inline-flex items-center gap-1.5 text-green-700 tabular-nums hover:text-green-800 hover:underline"
                  :href="`https://wa.me/${empleado.whatsapp.replace(/\D/g, '')}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i class="ti ti-brand-whatsapp" aria-hidden="true"></i>{{ formatTelefono(empleado.whatsapp) }}
                </a>
              </template>
            </AppListaDatos>
          </AppSeccion>

          <AppSeccion titulo="Organización">
            <AppListaDatos :datos="datosOrganizacion" />
          </AppSeccion>

          <AppSeccion v-if="empleado.notas" titulo="Notas">
            <p class="whitespace-pre-line text-sm text-gray-700">{{ empleado.notas }}</p>
          </AppSeccion>
        </aside>
      </div>
    </template>

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

    <AsignarEquipoModal
      v-if="mostrarAsignarEquipo"
      :empleado-id="empleado.id"
      :empleado-nombre="nombreCompleto"
      @close="mostrarAsignarEquipo = false"
      @asignado="cargar"
    />

    <AsignarLicenciaModal
      v-if="mostrarAsignarLicencia"
      :empleado-id="empleado.id"
      :empleado-nombre="nombreCompleto"
      @close="mostrarAsignarLicencia = false"
      @asignado="cargar"
    />

    <ConfirmDialog
      v-if="porLiberarLicencia"
      ref="dialogoLiberarLicencia"
      destructivo
      icono="ti-user-minus"
      titulo="Liberar asiento"
      :mensaje="`¿Liberar el asiento de “${porLiberarLicencia.software}” de este empleado?`"
      confirmar-label="Liberar"
      :cargando="liberandoLicencia"
      @cerrado="porLiberarLicencia = null"
      @confirm="confirmarLiberarLicencia"
    />

    <ConfirmDialog
      v-if="mostrarReactivar"
      ref="dialogoReactivar"
      titulo="Reactivar empleado"
      :mensaje="`¿Reactivar a ${nombreCompleto}? Volverá al estado Activo.`"
      confirmar-label="Reactivar"
      :cargando="procesando"
      @cerrado="mostrarReactivar = false"
      @confirm="confirmarReactivar"
    />
  </div>
</template>
