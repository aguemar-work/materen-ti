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
import { tonoAvatar, inicialesDe } from '../../core/avatar.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import { rolDeTag } from '../../core/tagRol.js';
import TextoVacio from '../../components/shared/TextoVacio.vue';
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

// inicialesDe (core/avatar.js) en vez de armarlas acá: además de no
// repetir la lógica, pone las mayúsculas en JS. La versión local no lo
// hacía y dependía del text-transform: uppercase que traía el CSS de
// .emp-avatar — al pasar a la familia .avatar, que no lo trae, las
// iniciales se habrían renderizado en minúscula.
const iniciales = computed(() => inicialesDe(nombreCompleto.value));

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
  <div class="detalle-page vista-modulo">
    <PageHeader>
      <template #izquierda>
        <button class="icon-btn btn-volver" type="button" title="Volver" aria-label="Volver" @click="volver('/empleados')">
          <i class="ti ti-arrow-left"></i>
        </button>
        <template v-if="empleado">
          <div class="avatar lg" :class="tonoAvatar(nombreCompleto)">{{ iniciales }}</div>
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
        <button type="button" class="btn btn--secondary btn--md" :disabled="procesando" @click="mostrarForm = true">
          Editar
          <i class="ti ti-pencil" aria-hidden="true"></i>
        </button>
        <button
          v-if="empleado.estado !== 'Inactivo'"
          type="button"
          class="btn btn--danger btn--md"
          :disabled="procesando"
          @click="mostrarBaja = true"
        >
          Dar de baja
          <i class="ti ti-user-off" aria-hidden="true"></i>
        </button>
        <button
          v-else
          type="button"
          class="btn btn--primary btn--md"
          :disabled="procesando"
          @click="mostrarReactivar = true"
        >
          Reactivar
          <i class="ti ti-user-check" aria-hidden="true"></i>
        </button>
      </template>
    </PageHeader>

    <main class="page page--padded">
      <div v-if="cargando" class="no-results">Cargando empleado...</div>

      <template v-else-if="empleado">
        <!-- Guía de alta: cada paso pendiente ES su propia acción.
             Hasta 2026-09-01 los 3 pasos eran texto informativo — decían qué
             faltaba y dejaban al usuario buscando el botón correcto más abajo
             en la página, que es justo por lo que las altas se completaban a
             medias. Ahora el paso ejecuta. -->
        <div v-if="modoAlta" class="alta-guia">
          <div class="alta-guia-cab">
            <span class="alta-guia-titulo">
              <i class="ti ti-user-plus" aria-hidden="true"></i>
              {{ altaLista ? 'Alta completa' : 'Alta en curso' }}
            </span>
            <span v-if="faltaAlta && faltaAlta.diasDesdeAlta > 0" class="alta-guia-dias">
              entró hace {{ faltaAlta.diasDesdeAlta }} {{ faltaAlta.diasDesdeAlta === 1 ? 'día' : 'días' }}
            </span>
            <span v-else-if="!altaLista" class="alta-guia-dias">entró hoy</span>
            <button
              class="icon-btn alta-guia-cerrar"
              type="button"
              :title="altaLista ? 'Ocultar' : 'Ocultar la guía'"
              :aria-label="altaLista ? 'Ocultar la guía de alta' : 'Ocultar la guía de alta'"
              @click="terminarAlta"
            >
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>

          <ol class="alta-guia-pasos">
            <li
              v-for="paso in pasosAlta"
              :key="paso.id"
              class="alta-paso"
              :class="{ 'alta-paso--hecho': paso.hecho }"
            >
              <i
                :class="paso.hecho ? 'ti ti-circle-check' : 'ti ti-circle-dashed'"
                aria-hidden="true"
              ></i>
              <span class="alta-paso-label">
                {{ paso.label }}
                <span v-if="!paso.requisito && !paso.hecho" class="alta-paso-opcional">opcional</span>
              </span>
              <button
                v-if="!paso.hecho && paso.ejecutar"
                type="button"
                class="btn btn--secondary btn--sm alta-paso-btn"
                @click="paso.ejecutar()"
              >
                {{ paso.accion }}
              </button>
            </li>
          </ol>
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
                <dt>Ubicación</dt>
                <dd><TextoVacio :valor="empleado.ubicacion_nombre" /></dd>
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
              ref="cuentasPanel"
              :key="empleado.id"
              :empleado-id="empleado.id"
              :empleado-nombre="nombreCompleto"
              :empleado-whatsapp="empleado.whatsapp || ''"
              @entrega-enviada="entregaEnviada = true"
            />

            <div class="paneles-duo">
              <!-- Equipos que porta (entrega/devolución se registran en el módulo Equipos) -->
              <div class="card panel-card">
                <div class="card-toolbar">
                  <div class="toolbar-title">
                    <i class="ti ti-devices" aria-hidden="true"></i>
                    Equipos
                    <span class="badge-count">{{ equipos.length }}</span>
                  </div>
                  <button type="button" class="btn btn--secondary btn--sm" @click="mostrarAsignarEquipo = true">
                    Asignar
                    <i class="ti ti-plus" aria-hidden="true"></i>
                  </button>
                </div>

                <p v-if="equipos.length === 0" class="panel-vacio">
                  Sin equipos asignados.
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
                <div class="card-toolbar">
                  <div class="toolbar-title">
                    <i class="ti ti-license" aria-hidden="true"></i>
                    Licencias
                    <span class="badge-count">{{ licencias.length }}</span>
                  </div>
                  <button type="button" class="btn btn--secondary btn--sm" @click="mostrarAsignarLicencia = true">
                    Asignar
                    <i class="ti ti-plus" aria-hidden="true"></i>
                  </button>
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
                          class="tag badge-inline"
                          :class="`tag--${rolDeTag(vencimientoLicencia(lic).clase)}`"
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

    <!-- Plan Maestro, 2026-09-01 — "Ficha de Empleado": Equipos y Licencias
         ganan la misma capacidad de asignar sin salir de la pantalla que ya
         tenía Cuentas, reutilizando el mismo endpoint de negocio que sus
         módulos de origen. Crear/editar un equipo o una licencia sigue
         siendo exclusivo de esos módulos. -->
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


