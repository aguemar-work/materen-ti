<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { useProblemaDetalleStore } from '../../stores/problemaDetalle.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatFechaHora, fechaLocalISO } from '../../core/formatters.js';
import { OPCIONES_SEVERIDAD_PROBLEMA, OPCIONES_ESTADO_ACCION, OPCIONES_ESTADO_PROBLEMA } from '../../core/dominio-problemas.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppTag from '../../components/ui/AppTag.vue';
import SeveridadProblema from './SeveridadProblema.vue';
import ProblemaWorkaround from './ProblemaWorkaround.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useProblemaDetalleStore();

const { problema, ticketsVinculados, accionesCorrectivas, staffActivo, staffPorId, cargando } = storeToRefs(store);

const guardandoCampo = ref(false);
const campoSeveridadDetalle = useCampoAccesible();
const campoResponsableDetalle = useCampoAccesible();

async function cargar() {
  try {
    await store.cargar(route.params.id);
    if (!problema.value) {
      showToast('Problema no encontrado', 'error');
      router.replace('/problemas');
    }
  } catch (e) {
    showToast(e?.message || 'Error al cargar el problema', 'error');
  }
}

// ── Edición de título/descripción/causa raíz ─────────────────────────────
const editando = ref(false);
const guardandoEdicion = ref(false);
const formEdicion = ref({ titulo: '', descripcion: '', causa_raiz: '' });
const campoTituloEdicion = useCampoAccesible();
const campoDescripcionEdicion = useCampoAccesible();
const campoCausaRaizEdicion = useCampoAccesible();

function abrirEdicion() {
  formEdicion.value = {
    titulo: problema.value.titulo,
    descripcion: problema.value.descripcion,
    causa_raiz: problema.value.causa_raiz || '',
  };
  editando.value = true;
}

async function guardarEdicion() {
  guardandoEdicion.value = true;
  try {
    await store.actualizarCampos({
      titulo: formEdicion.value.titulo,
      descripcion: formEdicion.value.descripcion,
      causa_raiz: formEdicion.value.causa_raiz,
    });
    editando.value = false;
    showToast('Problema actualizado');
  } catch (e) {
    showToast(e?.message || 'No se pudo guardar', 'error');
  } finally {
    guardandoEdicion.value = false;
  }
}

// ── Severidad / responsable: cambio inmediato (igual que prioridad/
// asignado en TicketDetalleView) ────────────────────────────────────────
async function cambiarSeveridad(valor) {
  guardandoCampo.value = true;
  try {
    await store.actualizarCampos({ severidad: valor });
  } catch (e) {
    showToast(e?.message || 'Error al cambiar la severidad', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

async function cambiarResponsable(staffId) {
  guardandoCampo.value = true;
  try {
    await store.actualizarCampos({ responsable_id: staffId || null });
    showToast(staffId ? 'Problema asignado' : 'Asignación quitada');
  } catch (e) {
    showToast(e?.message || 'Error al asignar', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

// ── Transición de estado: un solo botón según el estado actual. El
// bloqueo de "cerrado con acciones pendientes/en_progreso" lo aplica el
// trigger check_problema_cierre (migración 033) — acá solo se muestra el
// mensaje de error que llega de la BD. ───────────────────────────────────
const SIGUIENTE_ESTADO = { abierto: 'diagnostico', diagnostico: 'acciones', acciones: 'cerrado' };
const LABEL_TRANSICION = {
  abierto: 'Pasar a diagnóstico',
  diagnostico: 'Pasar a acciones correctivas',
  acciones: 'Cerrar problema',
};
const cambiandoEstado = ref(false);

async function avanzarEstado() {
  const siguiente = SIGUIENTE_ESTADO[problema.value.estado];
  if (!siguiente) return;
  cambiandoEstado.value = true;
  try {
    await store.actualizarCampos({ estado: siguiente });
    showToast(siguiente === 'cerrado' ? 'Problema cerrado' : 'Estado actualizado');
  } catch (e) {
    showToast(e?.message || 'No se pudo cambiar el estado', 'error');
  } finally {
    cambiandoEstado.value = false;
  }
}

async function reabrirProblema() {
  cambiandoEstado.value = true;
  try {
    await store.actualizarCampos({ estado: 'abierto' });
    showToast('Problema reabierto');
  } catch (e) {
    showToast(e?.message || 'No se pudo reabrir el problema', 'error');
  } finally {
    cambiandoEstado.value = false;
  }
}

// ── Tickets vinculados ────────────────────────────────────────────────
const codigoNuevoTicket = ref('');
const vinculandoTicket = ref(false);

async function vincularTicketPorCodigo() {
  const codigo = codigoNuevoTicket.value.trim();
  if (!codigo) return;
  vinculandoTicket.value = true;
  try {
    const { items } = await insforgeApi.listTicketsPage({ q: codigo, tamPagina: 5 });
    const match = items.find((t) => t.codigo.toLowerCase() === codigo.toLowerCase());
    if (!match) {
      showToast(`No se encontró ningún ticket con código "${codigo}"`, 'error');
      return;
    }
    await store.vincularTicket(match.id);
    codigoNuevoTicket.value = '';
    showToast('Ticket vinculado');
  } catch (e) {
    showToast(e?.message || 'No se pudo vincular el ticket', 'error');
  } finally {
    vinculandoTicket.value = false;
  }
}

async function desvincular(vinculoId) {
  try {
    await store.desvincularTicket(vinculoId);
    showToast('Ticket desvinculado');
  } catch (e) {
    showToast(e?.message || 'No se pudo desvincular el ticket', 'error');
  }
}

// ── Acciones correctivas ─────────────────────────────────────────────────
const nuevaAccion = ref({ descripcion: '', responsable_id: '', fecha_limite: '' });
const creandoAccion = ref(false);

async function crearAccion() {
  if (!nuevaAccion.value.descripcion.trim() || !nuevaAccion.value.fecha_limite) {
    showToast('Escriba una descripción y una fecha límite', 'error');
    return;
  }
  creandoAccion.value = true;
  try {
    await store.crearAccion({
      descripcion: nuevaAccion.value.descripcion,
      responsable_id: nuevaAccion.value.responsable_id || null,
      fecha_limite: nuevaAccion.value.fecha_limite,
    });
    nuevaAccion.value = { descripcion: '', responsable_id: '', fecha_limite: '' };
    showToast('Acción correctiva creada');
  } catch (e) {
    showToast(e?.message || 'No se pudo crear la acción correctiva', 'error');
  } finally {
    creandoAccion.value = false;
  }
}

async function cambiarEstadoAccion(id, estado) {
  try {
    await store.actualizarAccion(id, { estado });
  } catch (e) {
    showToast(e?.message || 'No se pudo actualizar la acción correctiva', 'error');
  }
}

async function eliminarAccion(id) {
  try {
    await store.eliminarAccion(id);
    showToast('Acción correctiva eliminada');
  } catch (e) {
    showToast(e?.message || 'No se pudo eliminar la acción correctiva', 'error');
  }
}

function accionVencida(accion) {
  return accion.estado !== 'completada' && accion.fecha_limite < fechaLocalISO();
}

// ── Eliminar problema (solo JEFE, ver RLS de la migración 033) ──────────
const confirmarEliminar = ref(false);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function eliminar() {
  eliminando.value = true;
  try {
    await store.eliminarProblema();
    showToast('Problema eliminado');
    router.push('/problemas');
  } catch (e) {
    showToast(e?.message || 'No se pudo eliminar', 'error');
    eliminando.value = false;
  }
}

// ── Presentación (rediseño 2026-09-23) ──────────────────────────────────
// Ciclo de vida como pasos: dice dónde está el problema y qué falta, sin
// tener que conocer el orden de los estados de memoria.
const indiceEstado = computed(() =>
  OPCIONES_ESTADO_PROBLEMA.findIndex((e) => e.valor === problema.value?.estado),
);

const resumenAcciones = computed(() => {
  const total = accionesCorrectivas.value.length;
  const completadas = accionesCorrectivas.value.filter((a) => a.estado === 'completada').length;
  const vencidas = accionesCorrectivas.value.filter(accionVencida).length;
  if (!total) return 'Qué se hará para que no vuelva a ocurrir';
  return `${completadas} de ${total} completadas${vencidas ? ` · ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}` : ''}`;
});

const nombreResponsable = computed(() =>
  problema.value?.responsable_id ? staffPorId.value[problema.value.responsable_id] || 'Staff' : '',
);

const datosRegistro = computed(() => [
  { label: 'Creado', valor: formatFechaHora(problema.value?.created_at), mono: true },
  { label: 'Última actualización', valor: formatFechaHora(problema.value?.updated_at), mono: true },
]);

onMounted(cargar);
onUnmounted(() => store.limpiar());
</script>

<template>
  <div class="w-full px-4 pb-10 pt-6 sm:px-6">
    <p v-if="cargando" class="py-16 text-center text-sm text-gray-500" role="status">Cargando problema...</p>

    <template v-else-if="problema">
      <!-- ══ Encabezado: qué problema es, en qué punto está y qué sigue ══ -->
      <header class="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-2xl text-gray-500">
          <i class="ti ti-alert-hexagon" aria-hidden="true"></i>
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 class="text-2xl font-semibold tracking-tight text-gray-900">{{ problema.titulo }}</h1>
            <BadgeEstado tipo="problema_estado" :valor="problema.estado" />
            <AppTag v-if="problema.error_conocido" tono="categoria">Error conocido</AppTag>
          </div>
          <ul class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-500">
            <li class="inline-flex items-center gap-1.5"><span class="sr-only">Severidad:</span><SeveridadProblema :valor="problema.severidad" /></li>
            <li class="inline-flex items-center gap-1.5">
              <i class="ti ti-user" aria-hidden="true"></i>
              <span :class="nombreResponsable ? 'text-gray-700' : 'text-gray-500'">{{ nombreResponsable || 'Sin responsable' }}</span>
            </li>
            <li class="inline-flex items-center gap-1.5 tabular-nums">
              <i class="ti ti-clock" aria-hidden="true"></i>Actualizado {{ formatFechaHora(problema.updated_at) }}
            </li>
          </ul>
        </div>
        <div v-if="!editando" class="flex shrink-0 flex-wrap gap-2">
          <AppButton variant="outline" severity="secondary" icon="ti ti-pencil" label="Editar" @click="abrirEdicion" />
          <AppButton
            v-if="auth.esJefe"
            variant="outline"
            severity="danger"
            icon="ti ti-trash"
            label="Eliminar"
            @click="confirmarEliminar = true"
          />
          <AppButton
            v-if="problema.estado !== 'cerrado'"
            :icon="cambiandoEstado ? 'ti ti-loader-2' : 'ti ti-arrow-right'"
            icon-pos="right"
            :label="LABEL_TRANSICION[problema.estado]"
            :loading="cambiandoEstado"
            :disabled="cambiandoEstado"
            @click="avanzarEstado"
          />
          <AppButton
            v-else
            variant="outline"
            severity="secondary"
            :icon="cambiandoEstado ? 'ti ti-loader-2' : 'ti ti-refresh'"
            label="Reabrir"
            :loading="cambiandoEstado"
            :disabled="cambiandoEstado"
            @click="reabrirProblema"
          />
        </div>
      </header>

      <!-- ══ Ciclo de vida ═════════════════════════════════════════ -->
      <ol class="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Ciclo de vida del problema">
        <li
          v-for="(paso, i) in OPCIONES_ESTADO_PROBLEMA"
          :key="paso.valor"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          :class="i === indiceEstado ? 'bg-primary-50 font-medium text-primary-700' : i < indiceEstado ? 'text-gray-600' : 'text-gray-500'"
          :aria-current="i === indiceEstado ? 'step' : undefined"
        >
          <i
            class="text-base"
            :class="i < indiceEstado ? 'ti ti-circle-check text-green-600' : i === indiceEstado ? 'ti ti-circle-dot' : 'ti ti-circle-dashed'"
            aria-hidden="true"
          ></i>
          <span class="tabular-nums">{{ i + 1 }}.</span> {{ paso.label }}
        </li>
      </ol>

      <!-- ══ Cuerpo ════════════════════════════════════════════════ -->
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="min-w-0 space-y-6">
          <!-- Análisis: descripción + causa raíz (o su edición) -->
          <AppSeccion titulo="Análisis">
            <form v-if="editando" class="space-y-4" @submit.prevent="guardarEdicion">
              <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
                <label class="campo__etiqueta" :for="campoTituloEdicion.id">Título<span aria-hidden="true"> *</span></label>
                <div class="campo__caja">
                  <input
                    :id="campoTituloEdicion.id"
                    v-model="formEdicion.titulo"
                    class="campo__control"
                    type="text"
                    required
                    :disabled="guardandoEdicion"
                  >
                </div>
              </div>
              <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
                <label class="campo__etiqueta" :for="campoDescripcionEdicion.id">Descripción<span aria-hidden="true"> *</span></label>
                <div class="campo__caja">
                  <textarea
                    :id="campoDescripcionEdicion.id"
                    v-model="formEdicion.descripcion"
                    class="campo__control campo__control--area"
                    :rows="5"
                    required
                    :disabled="guardandoEdicion"
                  ></textarea>
                </div>
              </div>
              <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
                <label class="campo__etiqueta" :for="campoCausaRaizEdicion.id">Causa raíz</label>
                <div class="campo__caja">
                  <textarea
                    :id="campoCausaRaizEdicion.id"
                    v-model="formEdicion.causa_raiz"
                    class="campo__control campo__control--area"
                    :rows="4"
                    placeholder="Se completa durante el diagnóstico"
                    :disabled="guardandoEdicion"
                  ></textarea>
                </div>
              </div>
              <div class="flex justify-end gap-2">
                <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardandoEdicion" @click="editando = false" />
                <AppButton
                  type="submit"
                  :label="guardandoEdicion ? 'Guardando...' : 'Guardar'"
                  :loading="guardandoEdicion"
                  :disabled="guardandoEdicion"
                />
              </div>
            </form>

            <div v-else class="space-y-5">
              <div>
                <h3 class="text-xs font-medium text-gray-500">Descripción</h3>
                <p class="mt-1 max-w-prose whitespace-pre-line text-sm leading-relaxed text-gray-900">{{ problema.descripcion }}</p>
              </div>
              <div>
                <h3 class="text-xs font-medium text-gray-500">Causa raíz</h3>
                <p v-if="problema.causa_raiz" class="mt-1 max-w-prose whitespace-pre-line text-sm leading-relaxed text-gray-900">{{ problema.causa_raiz }}</p>
                <p v-else class="mt-1 text-sm text-gray-500">Todavía sin diagnosticar.</p>
              </div>
            </div>
          </AppSeccion>

          <!-- Workaround y error conocido (KEDB, migración 106) -->
          <ProblemaWorkaround />

          <!-- Acciones correctivas -->
          <AppSeccion titulo="Acciones correctivas" :conteo="accionesCorrectivas.length" :descripcion="resumenAcciones" sin-padding>
            <AppVacio
              v-if="!accionesCorrectivas.length"
              variante="seccion"
              titulo="Sin acciones correctivas todavía"
              mensaje="Agregue abajo lo que se hará para eliminar la causa raíz."
            />
            <ul v-else class="divide-y divide-gray-100">
              <li
                v-for="a in accionesCorrectivas"
                :key="a.id"
                class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
              >
                <span
                  class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg sm:flex"
                  :class="a.estado === 'completada' ? 'bg-green-50 text-green-600' : accionVencida(a) ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'"
                >
                  <i :class="a.estado === 'completada' ? 'ti ti-circle-check' : accionVencida(a) ? 'ti ti-alarm' : 'ti ti-list-check'" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm" :class="a.estado === 'completada' ? 'text-gray-500 line-through decoration-gray-300' : 'text-gray-900'">{{ a.descripcion }}</p>
                  <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                    <span :class="a.responsable_id ? '' : 'text-gray-500'">{{ a.responsable_id ? staffPorId[a.responsable_id] || 'Staff' : 'Sin responsable' }}</span>
                    <span aria-hidden="true">·</span>
                    <span class="tabular-nums">Vence {{ formatFecha(a.fecha_limite) }}</span>
                    <AppTag v-if="accionVencida(a)" tono="danger">Vencida</AppTag>
                  </p>
                </div>
                <div class="flex items-center gap-1">
                  <AppSelect
                    :model-value="a.estado"
                    :label="`Estado de la acción: ${a.descripcion}`"
                    @update:model-value="cambiarEstadoAccion(a.id, $event)"
                  >
                    <option v-for="e in OPCIONES_ESTADO_ACCION" :key="e.valor" :value="e.valor">{{ e.label }}</option>
                  </AppSelect>
                  <button class="icon-btn danger" type="button" title="Eliminar acción" aria-label="Eliminar acción" @click="eliminarAccion(a.id)">
                    <i class="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              </li>
            </ul>

            <!-- Alta de una acción: al pie de la lista, donde se lee -->
            <form
              class="grid gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_180px_160px_auto] sm:items-end"
              @submit.prevent="crearAccion"
            >
              <div class="campo" :class="{ 'campo--inerte': creandoAccion }">
                <label class="campo__etiqueta" for="accion-nueva-descripcion">Nueva acción</label>
                <div class="campo__caja">
                  <input
                    id="accion-nueva-descripcion"
                    v-model="nuevaAccion.descripcion"
                    class="campo__control"
                    placeholder="ej: Reemplazar switch del piso 3"
                    :disabled="creandoAccion"
                  >
                </div>
              </div>
              <div class="campo" :class="{ 'campo--inerte': creandoAccion }">
                <label class="campo__etiqueta" for="accion-nueva-responsable">Responsable</label>
                <div class="campo__caja">
                  <select
                    id="accion-nueva-responsable"
                    v-model="nuevaAccion.responsable_id"
                    class="campo__control campo__control--select"
                    :disabled="creandoAccion"
                  >
                    <option value="">Sin asignar</option>
                    <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
                  </select>
                  <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
                </div>
              </div>
              <div class="campo" :class="{ 'campo--inerte': creandoAccion }">
                <label class="campo__etiqueta" for="accion-nueva-fecha">Fecha límite</label>
                <div class="campo__caja">
                  <input
                    id="accion-nueva-fecha"
                    v-model="nuevaAccion.fecha_limite"
                    class="campo__control"
                    type="date"
                    :disabled="creandoAccion"
                  >
                </div>
              </div>
              <AppButton
                type="submit"
                variant="outline"
                severity="secondary"
                :icon="creandoAccion ? 'ti ti-loader-2' : 'ti ti-plus'"
                label="Agregar"
                :loading="creandoAccion"
                :disabled="creandoAccion"
                class="h-10"
              />
            </form>
          </AppSeccion>

          <!-- Tickets vinculados: los incidentes que originaron el problema -->
          <AppSeccion
            titulo="Tickets vinculados"
            :conteo="ticketsVinculados.length"
            descripcion="Incidentes que comparten esta causa"
            sin-padding
          >
            <AppVacio
              v-if="!ticketsVinculados.length"
              variante="seccion"
              titulo="Sin tickets vinculados todavía"
              mensaje="Vincule los tickets que comparten esta causa con su código."
            />
            <ul v-else class="divide-y divide-gray-100">
              <li v-for="t in ticketsVinculados" :key="t.vinculo_id" class="flex items-center gap-3 px-4 py-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                  <i class="ti ti-ticket" aria-hidden="true"></i>
                </span>
                <RouterLink
                  class="min-w-0 flex-1 rounded-md text-sm hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  :to="`/tickets/${t.ticket_id}`"
                >
                  <span class="font-medium text-gray-900 tabular-nums">{{ t.codigo }}</span>
                  <span class="ml-2 text-gray-600">{{ t.titulo }}</span>
                </RouterLink>
                <button class="icon-btn" type="button" title="Desvincular" aria-label="Desvincular" @click="desvincular(t.vinculo_id)">
                  <i class="ti ti-unlink" aria-hidden="true"></i>
                </button>
              </li>
            </ul>
            <form class="flex items-end gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3" @submit.prevent="vincularTicketPorCodigo">
              <div class="campo flex-1 sm:max-w-xs" :class="{ 'campo--inerte': vinculandoTicket }">
                <label class="campo__etiqueta" for="vincular-ticket-codigo">Código de ticket a vincular</label>
                <div class="campo__caja">
                  <input
                    id="vincular-ticket-codigo"
                    v-model="codigoNuevoTicket"
                    class="campo__control tabular-nums"
                    placeholder="ej: TCK-0001"
                    :disabled="vinculandoTicket"
                  >
                </div>
              </div>
              <AppButton
                variant="outline"
                severity="secondary"
                :icon="vinculandoTicket ? 'ti ti-loader-2' : 'ti ti-link'"
                label="Vincular"
                :loading="vinculandoTicket"
                :disabled="vinculandoTicket || !codigoNuevoTicket.trim()"
                class="h-10"
                @click="vincularTicketPorCodigo"
              />
            </form>
          </AppSeccion>
        </div>

        <!-- ── Lateral: clasificación editable + registro ── -->
        <aside class="space-y-6 lg:sticky lg:top-6">
          <AppSeccion titulo="Clasificación" descripcion="Los cambios se guardan al elegir">
            <div class="space-y-4">
              <div class="campo" :class="{ 'campo--inerte': guardandoCampo }">
                <label class="campo__etiqueta" :for="campoSeveridadDetalle.id">Severidad</label>
                <div class="campo__caja">
                  <select
                    :id="campoSeveridadDetalle.id"
                    class="campo__control campo__control--select"
                    :value="problema.severidad"
                    :disabled="guardandoCampo"
                    @change="cambiarSeveridad($event.target.value)"
                  >
                    <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
                  </select>
                  <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
                </div>
              </div>

              <div class="campo" :class="{ 'campo--inerte': guardandoCampo }">
                <label class="campo__etiqueta" :for="campoResponsableDetalle.id">Responsable</label>
                <div class="campo__caja">
                  <select
                    :id="campoResponsableDetalle.id"
                    class="campo__control campo__control--select"
                    :value="problema.responsable_id || ''"
                    :disabled="guardandoCampo"
                    @change="cambiarResponsable($event.target.value)"
                  >
                    <option value="">Sin asignar</option>
                    <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
                  </select>
                  <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
                </div>
              </div>
            </div>
          </AppSeccion>

          <AppSeccion titulo="Registro">
            <AppListaDatos :datos="datosRegistro" />
          </AppSeccion>
        </aside>
      </div>
    </template>

    <ConfirmDialog
      v-if="confirmarEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar problema"
      :mensaje="`¿Eliminar el problema “${problema?.titulo}”? No se podrá deshacer desde la interfaz.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cerrado="confirmarEliminar = false"
      @confirm="eliminar"
    />
  </div>
</template>
